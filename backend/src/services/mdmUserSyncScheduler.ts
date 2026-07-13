/**
 * Schedules per-MDM-source User syncs from each source's userSync.cron.
 * Mirrors the MDM cache scheduler pattern (node-cron, Asia/Kolkata).
 */
import * as cron from "node-cron";
import MDMSource from "../models/MDMSource";
import { syncUsersFromSource } from "./mdmUserSync";

const tasks = new Map<string, cron.ScheduledTask>();

async function scheduleSource(sourceId: string, cronExpr: string) {
  const key = sourceId;
  tasks.get(key)?.stop();
  tasks.delete(key);
  if (!cronExpr || !cron.validate(cronExpr)) return;
  const task = cron.schedule(
    cronExpr,
    async () => {
      try {
        const res = await syncUsersFromSource(sourceId);
        console.log(`🔄 [mdm-user-sync] ${res.source}:`, res);
      } catch (e) {
        console.error("[mdm-user-sync] scheduled run failed:", (e as any)?.message);
      }
    },
    { timezone: "Asia/Kolkata" },
  );
  tasks.set(key, task);
}

/** (Re)load all enabled per-source user-sync schedules. Call on boot + after edits. */
export async function refreshMDMUserSyncScheduler() {
  try {
    const sources = await MDMSource.find({ "userSync.enabled": true })
      .select("_id userSync")
      .lean();
    // stop schedules no longer enabled
    const enabledIds = new Set(sources.map((s) => String(s._id)));
    for (const id of [...tasks.keys()]) {
      if (!enabledIds.has(id)) {
        tasks.get(id)?.stop();
        tasks.delete(id);
      }
    }
    for (const s of sources as any[]) {
      const cronExpr = s.userSync?.cron || "0 3 * * *";
      await scheduleSource(String(s._id), cronExpr);
    }
    console.log(`🕒 [mdm-user-sync] scheduled ${tasks.size} source(s)`);
  } catch (e) {
    console.error("[mdm-user-sync] scheduler init failed:", (e as any)?.message);
  }
}

export const mdmUserSyncScheduler = { start: refreshMDMUserSyncScheduler };
