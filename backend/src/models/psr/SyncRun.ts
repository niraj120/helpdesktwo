import mongoose, { Schema, Document } from "mongoose";

// ---------------------------------------------------------------------------
// PSR Sync Run — records each pipeline execution (full, incremental, dry-run)
// Used for the run log / dashboard (US-5.1) and dry-run result storage (US-2.8)
// ---------------------------------------------------------------------------

export type SyncRunMode = "incremental" | "full" | "dry-run";
export type SyncRunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "partial";

export interface IStepLog {
  stepIndex: number;
  op: string;
  rowsIn: number;
  rowsOut: number;
  durationMs: number;
  errors: number;
  errorSample?: string; // first error message, truncated
}

export interface ISyncRunCounts {
  read: number;
  upserted: number;
  skipped: number;
  errors: number;
}

export interface ISyncRun extends Document {
  pipelineId: mongoose.Types.ObjectId;
  pipelineName: string; // denormalized snapshot
  targetCollection: string; // denormalized snapshot
  mode: SyncRunMode;
  status: SyncRunStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  watermarkIn?: string; // watermark value at start of run
  watermarkOut?: string; // watermark value at end of run (persisted for next run)
  counts: ISyncRunCounts;
  stepLogs: IStepLog[];
  errorSummary?: string;
  dryRunSample?: any[]; // up to 25 sample docs — only for dry-run mode
  triggeredBy: "scheduler" | "manual" | "api";
  createdAt: Date;
  updatedAt: Date;
}

const StepLogSchema = new Schema<IStepLog>(
  {
    stepIndex: { type: Number, required: true },
    op: { type: String, required: true },
    rowsIn: { type: Number, default: 0 },
    rowsOut: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    errorSample: { type: String },
  },
  { _id: false },
);

const SyncRunCountsSchema = new Schema<ISyncRunCounts>(
  {
    read: { type: Number, default: 0 },
    upserted: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
  },
  { _id: false },
);

const SyncRunSchema = new Schema<ISyncRun>(
  {
    pipelineId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "PsrPipelineConfig",
      index: true,
    },
    pipelineName: { type: String, required: true },
    targetCollection: { type: String, required: true },
    mode: {
      type: String,
      enum: ["incremental", "full", "dry-run"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "running", "success", "failed", "partial"],
      default: "pending",
    },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
    durationMs: { type: Number },
    watermarkIn: { type: String },
    watermarkOut: { type: String },
    counts: {
      type: SyncRunCountsSchema,
      default: () => ({ read: 0, upserted: 0, skipped: 0, errors: 0 }),
    },
    stepLogs: [StepLogSchema],
    errorSummary: { type: String },
    dryRunSample: [{ type: Schema.Types.Mixed }],
    triggeredBy: {
      type: String,
      enum: ["scheduler", "manual", "api"],
      default: "manual",
    },
  },
  { timestamps: true },
);

// TTL index: auto-delete dry-run records after 7 days, other runs after 90 days
// We handle this with a compound approach — partial index not directly supported
// in Mongoose pre-v8; use a cron or background job to purge old dry-run records.
SyncRunSchema.index({ pipelineId: 1, startedAt: -1 });

export default mongoose.model<ISyncRun>(
  "PsrSyncRun",
  SyncRunSchema,
  "psrsyncruns",
);
