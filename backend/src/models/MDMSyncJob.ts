import mongoose, { Document, Schema } from "mongoose";

export type MDMSyncJobType = "dataset_sync" | "join_rebuild";
export type MDMSyncJobStatus = "queued" | "running" | "success" | "failed";

export interface IMDMSyncJob extends Document {
  sourceId: mongoose.Types.ObjectId;
  datasetKey?: string;
  joinKey?: string;
  type: MDMSyncJobType;
  status: MDMSyncJobStatus;
  startedAt: Date;
  finishedAt?: Date;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
  sampleErrors: string[];
}

const mdmSyncJobSchema = new Schema<IMDMSyncJob>(
  {
    sourceId: {
      type: Schema.Types.ObjectId,
      ref: "MDMSource",
      required: true,
      index: true,
    },
    datasetKey: { type: String, default: "", index: true },
    joinKey: { type: String, default: "", index: true },
    type: {
      type: String,
      enum: ["dataset_sync", "join_rebuild"],
      required: true,
    },
    status: {
      type: String,
      enum: ["queued", "running", "success", "failed"],
      default: "queued",
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    error: { type: String, default: "" },
    sampleErrors: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model<IMDMSyncJob>("MDMSyncJob", mdmSyncJobSchema);
