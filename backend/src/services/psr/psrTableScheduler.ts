/**
 * PSR Table Scheduler
 * Runs every minute, finds tables with syncSchedule.enabled=true
 * whose last refresh is older than intervalMinutes, and triggers a refresh.
 */

import PsrTable from "../../models/psr/PsrTable";

// Lazy-import to avoid circular dep
async function triggerRefresh(tableId: string): Promise<void> {
  const { triggerTableRefreshInternalExport } = await import("../../controllers/psr/psrBuilderController");
  await triggerTableRefreshInternalExport(tableId);
}

async function runSchedulerTick(): Promise<void> {
  try {
    const now = Date.now();
    const tables = await PsrTable.find({
      "syncSchedule.enabled": true,
      "syncSchedule.intervalMinutes": { $gt: 0 },
      status: { $nin: ["refreshing"] },
    }).select("_id name syncSchedule lastRefreshedAt").lean();

    for (const t of tables) {
      const intervalMs = (t as any).syncSchedule.intervalMinutes * 60 * 1000;
      const lastRefresh = (t as any).lastRefreshedAt
        ? new Date((t as any).lastRefreshedAt).getTime()
        : 0;
      if (now - lastRefresh >= intervalMs) {
        console.log(`[PSR Scheduler] Auto-refreshing "${(t as any).name}"…`);
        triggerRefresh(String((t as any)._id)).catch((err) =>
          console.error(`[PSR Scheduler] Refresh failed for ${(t as any)._id}:`, err?.message),
        );
      }
    }
  } catch (err) {
    console.error("[PSR Scheduler] Tick error:", (err as Error).message);
  }
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startPsrTableScheduler(): void {
  if (schedulerTimer) return;
  // Check every 60 seconds
  schedulerTimer = setInterval(runSchedulerTick, 60_000);
  console.log("✅ PSR Table Scheduler started (checks every 60s)");
}

export function stopPsrTableScheduler(): void {
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
}
