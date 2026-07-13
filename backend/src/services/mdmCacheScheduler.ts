import * as cron from "node-cron";
import MDMSource from "../models/MDMSource";
import { rebuildJoin, syncDataset } from "./mdmCacheService";

const tasks = new Map<string, cron.ScheduledTask>();

const taskKey = (sourceId: string, datasetKey: string) =>
  `${sourceId}:${datasetKey}`;

const rebuildEnabledJoins = async (sourceId: string) => {
  const source = await MDMSource.findById(sourceId).lean();
  const joins = (source?.cache?.joins || []).filter(
    (join: any) => join.enabled !== false,
  );

  for (const join of joins) {
    try {
      await rebuildJoin(sourceId, join.key);
    } catch (error) {
      console.error(
        `[MDMCacheScheduler] Failed to rebuild join ${join.key}:`,
        error,
      );
    }
  }
};

const runDatasetSync = async (sourceId: string, datasetKey: string) => {
  const result = await syncDataset(sourceId, datasetKey);
  if (result?.status === "success") {
    await rebuildEnabledJoins(sourceId);
  }
};

export const stopMDMCacheScheduler = () => {
  for (const task of tasks.values()) {
    task.stop();
  }
  tasks.clear();
};

export const startMDMCacheScheduler = async () => {
  stopMDMCacheScheduler();

  const sources = await MDMSource.find({
    enabled: true,
    "cache.enabled": true,
  }).lean();

  let registered = 0;
  for (const source of sources as any[]) {
    const sourceId = String(source._id);
    const datasets = (source.cache?.datasets || []).filter(
      (dataset: any) =>
        dataset.enabled !== false &&
        dataset.schedule?.enabled === true &&
        dataset.schedule?.cron,
    );

    for (const dataset of datasets) {
      const expression = String(dataset.schedule.cron || "").trim();
      if (!cron.validate(expression)) {
        console.warn(
          `[MDMCacheScheduler] Invalid cron "${expression}" for ${source.name}/${dataset.key}; skipped`,
        );
        continue;
      }

      const key = taskKey(sourceId, dataset.key);
      const task = cron.schedule(
        expression,
        () => {
          runDatasetSync(sourceId, dataset.key).catch((error) =>
            console.error(
              `[MDMCacheScheduler] Sync failed for ${source.name}/${dataset.key}:`,
              error,
            ),
          );
        },
        { timezone: "Asia/Kolkata" },
      );
      tasks.set(key, task);
      registered += 1;
    }
  }

  console.log(`[MDMCacheScheduler] Started - ${registered} dataset job(s).`);
};
