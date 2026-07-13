import { Queue, QueueEvents } from "bullmq";

// ---------------------------------------------------------------------------
// PSR Pipeline Queue (US-3.5)
//
// One named queue per environment. Workers pull jobs and call the engine.
// Per-pipeline mutex is enforced by BullMQ's job ID deduplication:
//   jobId = "pipeline:<id>:<mode>" — a pending/active job blocks a new one.
// ---------------------------------------------------------------------------

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // required by BullMQ
};

export const PSR_QUEUE_NAME = "psr-pipeline";

/** The shared queue instance — used by the controller to enqueue jobs. */
export let psrQueue: Queue | null = null;

/** Queue events — used to listen for completion in tests / UI polling. */
export let psrQueueEvents: QueueEvents | null = null;

export function initPsrQueue(): void {
  if (psrQueue) return;
  try {
    psrQueue = new Queue(PSR_QUEUE_NAME, {
      connection: REDIS_CONNECTION,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });

    psrQueueEvents = new QueueEvents(PSR_QUEUE_NAME, {
      connection: { ...REDIS_CONNECTION },
    });

    console.log("✅ PSR Pipeline Queue initialized");
  } catch (err) {
    // Redis not available — queue runs in degraded mode (manual trigger still
    // works via direct engine call from controller fallback).
    console.warn(
      "⚠️  PSR Pipeline Queue init failed (Redis unavailable?):",
      (err as Error).message,
    );
    psrQueue = null;
  }
}

export interface PsrJobData {
  pipelineId: string;
  mode: "full" | "incremental";
  triggeredBy: "scheduler" | "manual" | "api";
  runId?: string; // pre-created SyncRun id so controller can return it immediately
}

/**
 * Enqueue a pipeline run. Returns false if the queue is unavailable.
 * Deduplication: jobId = `pipeline:<id>:<mode>` — if a job with this ID is
 * already waiting or active, BullMQ silently drops the duplicate (coalescing).
 */
export async function enqueuePipelineRun(
  data: PsrJobData,
): Promise<string | null> {
  if (!psrQueue) return null;
  const jobId = `pipeline:${data.pipelineId}:${data.mode}`;
  const job = await psrQueue.add("run", data, { jobId });
  return job.id ?? null;
}
