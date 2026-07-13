/**
 * PSR Staleness Watchdog (US-5.2 — Alerting on failure & staleness)
 *
 * Runs hourly and checks all enabled pipelines for:
 *   1. Consecutive failures  — alert when a pipeline fails N times in a row
 *   2. Stale data            — alert when lastSyncedAt > stalenessHours threshold
 *
 * Alert delivery:
 *   - In-app Notification to all SUPER_ADMIN users (via Notification model)
 *   - Console warn (Prometheus/webhook integration is Slice D+)
 *
 * Alert config per pipeline (stored on PipelineConfig.alertConfig):
 *   { enabled: boolean, failureThreshold: number, stalenessHours: number }
 *
 * Default thresholds (used when alertConfig is absent):
 *   failureThreshold: 3  consecutive failed runs
 *   stalenessHours:   24 hours since last successful sync
 */

import PipelineConfig from "../../models/psr/PipelineConfig";
import SyncRun from "../../models/psr/SyncRun";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_STALENESS_HOURS = 24;

// In-memory cooldown so we don't repeat the same alert every hour
const alertCooldowns = new Map<string, number>();
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours between repeat alerts

async function sendAlertNotification(
  pipelineId: string,
  pipelineName: string,
  alertType: "failure" | "staleness",
  detail: string,
): Promise<void> {
  try {
    // Cooldown check — don't spam the same alert
    const cooldownKey = `${pipelineId}:${alertType}`;
    const lastSent = alertCooldowns.get(cooldownKey) || 0;
    if (Date.now() - lastSent < ALERT_COOLDOWN_MS) return;
    alertCooldowns.set(cooldownKey, Date.now());

    // Log to console (visible in PM2 / CloudWatch logs)
    const icon = alertType === "failure" ? "🔴" : "🟡";
    console.warn(
      `${icon} [PSR Alert] Pipeline "${pipelineName}" (${pipelineId}): ` +
        `${alertType.toUpperCase()} — ${detail}`,
    );

    // Try to send in-app notification to SUPER_ADMIN users
    // Dynamically require to avoid circular deps
    const { Notification } = await import("../../models/Notification");
    const { User } = await import("../../models/User");

    const admins = await User.find({ "role.code": "SUPER_ADMIN", isActive: true })
      .select("_id")
      .lean();

    if (admins.length > 0) {
      const notifications = admins.map((admin) => ({
        userId: (admin as any)._id,
        type: "system",
        title: `PSR Pipeline Alert: ${pipelineName}`,
        message: detail,
        metadata: { pipelineId, alertType },
        isRead: false,
        createdAt: new Date(),
      }));
      await Notification.insertMany(notifications, { ordered: false }).catch(() => {});
    }
  } catch (err) {
    // Watchdog must never crash the server
    console.error("[PSR Watchdog] Alert delivery failed:", (err as Error).message);
  }
}

async function runWatchdogCheck(): Promise<void> {
  try {
    const pipelines = await PipelineConfig.find({ enabled: true })
      .select("_id name lastSyncedAt alertConfig")
      .lean();

    for (const pipeline of pipelines) {
      const id = String((pipeline as any)._id);
      const alertCfg = (pipeline as any).alertConfig || {};
      if (alertCfg.enabled === false) continue;

      const failureThreshold = alertCfg.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
      const stalenessHours = alertCfg.stalenessHours ?? DEFAULT_STALENESS_HOURS;

      // ── Check consecutive failures ──────────────────────────────────────────
      const recentRuns = await SyncRun.find({
        pipelineId: id,
        mode: { $in: ["full", "incremental"] },
      })
        .sort({ startedAt: -1 })
        .limit(failureThreshold)
        .select("status")
        .lean();

      if (recentRuns.length === failureThreshold) {
        const allFailed = recentRuns.every((r) => (r as any).status === "failed");
        if (allFailed) {
          await sendAlertNotification(
            id,
            (pipeline as any).name,
            "failure",
            `Last ${failureThreshold} sync runs all failed. Manual intervention may be needed.`,
          );
        }
      }

      // ── Check staleness ─────────────────────────────────────────────────────
      const lastSyncedAt: Date | undefined = (pipeline as any).lastSyncedAt;
      if (stalenessHours > 0) {
        const thresholdMs = stalenessHours * 60 * 60 * 1000;
        const isStale = !lastSyncedAt
          ? true // never synced
          : Date.now() - lastSyncedAt.getTime() > thresholdMs;

        if (isStale) {
          const age = lastSyncedAt
            ? `${Math.round((Date.now() - lastSyncedAt.getTime()) / 3600000)}h ago`
            : "never";
          await sendAlertNotification(
            id,
            (pipeline as any).name,
            "staleness",
            `Data is stale — last successful sync: ${age}. Threshold: ${stalenessHours}h.`,
          );
        }
      }
    }
  } catch (err) {
    console.error("[PSR Watchdog] Check failed:", (err as Error).message);
  }
}

let watchdogTimer: ReturnType<typeof setInterval> | null = null;

export function startStalenessWatchdog(): void {
  if (watchdogTimer) return;
  // Run first check after 5 minutes, then every hour
  setTimeout(() => {
    runWatchdogCheck();
    watchdogTimer = setInterval(runWatchdogCheck, CHECK_INTERVAL_MS);
  }, 5 * 60 * 1000);
  console.log("✅ PSR Staleness Watchdog started (first check in 5 min, then hourly)");
}

export function stopStalenessWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

/** Expose for testing / manual trigger */
export { runWatchdogCheck };
