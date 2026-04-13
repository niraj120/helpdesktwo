import mongoose, { Schema, Document } from "mongoose";

export type SyncStatus = "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
export type SyncTrigger = "SCHEDULE" | "MANUAL" | "API";

export interface ISyncErrorDetail {
  employeeCode: string;
  reason: "UNMATCHED" | "DB_ERROR" | "NOT_PUBLISHED" | string;
  error?: string;
}

export interface IAttendanceSyncLog extends Document {
  projectId: mongoose.Types.ObjectId;
  triggeredBy: SyncTrigger;
  startedAt: Date;
  completedAt?: Date;
  recordsFetched: number;
  recordsStored: number;
  recordsSkipped: number;
  errorCount: number;
  status?: SyncStatus;
  errorDetails: ISyncErrorDetail[];
  createdAt: Date;
}

const attendanceSyncLogSchema = new Schema<IAttendanceSyncLog>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    triggeredBy: {
      type: String,
      enum: ["SCHEDULE", "MANUAL", "API"],
      required: true,
    },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    recordsFetched: { type: Number, default: 0 },
    recordsStored: { type: Number, default: 0 },
    recordsSkipped: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"],
      default: "RUNNING",
    },
    errorDetails: [
      {
        employeeCode: { type: String },
        reason: { type: String },
        error: { type: String },
        _id: false,
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

attendanceSyncLogSchema.index({ projectId: 1, startedAt: -1 });
attendanceSyncLogSchema.index({ status: 1 });

export const AttendanceSyncLog = mongoose.model<IAttendanceSyncLog>(
  "AttendanceSyncLog",
  attendanceSyncLogSchema,
);
