import { Worker, Job } from "bullmq";
import { PSR_QUEUE_NAME, PsrJobData } from "./pipelineQueue";
import { runPipeline } from "./pipelineEngine";

// ---------------------------------------------------------------------------
// PSR Pipeline Worker (US-3.5)
//
// Stateless worker that pulls jobs from the BullMQ queue and calls the engine.
// Scale horizontally by running multiple worker processes — BullMQ handles
// job locking so only one worker processes a given job.
//
// Per-pipeline mutex is handled by BullMQ's jobId deduplication in the queue:
// a second enqueue of the same jobId is silently dropped while the first is
// active, preventing overlapping runs of the same pipeline.
// ---------------------------------------------------------------------------

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

let worker: Worker | null = null;

export function startPsrWorker(): void {
  if (worker) return;

  try {
    worker = new Worker<PsrJobData>(
      PSR_QUEUE_NAME,
      async (job: Job<PsrJobData>) => {
        const { pipelineId, mode, triggeredBy } = job.data;
        console.log(`[PSR Worker] Starting pipeline ${pipelineId} (${mode})`);

        await job.updateProgress(5);

        const runId = await runPipeline(pipelineId, {
          mode,
          triggeredBy,
          onPageComplete: async (page: number) => {
            // Checkpoint progress — BullMQ stores this so failed jobs
            // can report how far they got (full resume requires Slice B watermark)
            await job
              .updateProgress(Math.min(5 + page * 2, 95))
              .catch(() => {});
          },
        });

        await job.updateProgress(100);
        return { runId };
      },
      {
        connection: REDIS_CONNECTION,
        concurrency: 3, // max 3 pipelines running in parallel across all workers
        lockDuration: 300_000, // 5 min per job lock renewal
      },
    );

    worker.on("completed", (job, result) => {
      console.log(
        `[PSR Worker] Pipeline ${job.data.pipelineId} completed. runId=${result?.runId}`,
      );
    });

    worker.on("failed", (job, err) => {
      console.error(
        `[PSR Worker] Pipeline ${job?.data?.pipelineId} failed:`,
        err?.message,
      );
    });

    console.log("✅ PSR Pipeline Worker started");
  } catch (err) {
    console.warn(
      "⚠️  PSR Pipeline Worker init failed:",
      (err as Error).message,
    );
    worker = null;
  }
}

export async function stopPsrWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log("PSR Pipeline Worker stopped");
  }
}
