import mongoose, { Document, Schema } from "mongoose";

export interface IJobLog extends Document {
  jobType: string;
  ranAt: Date;
  durationMs: number;
  processed: number;
  escalated: number;
  skipped: number;
  errorMessages: string[];
  status: "success" | "partial" | "error";
}

const JobLogSchema = new Schema<IJobLog>(
  {
    jobType: { type: String, default: "auto-escalation", index: true },
    ranAt: { type: Date, default: Date.now, index: true },
    durationMs: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    escalated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    errorMessages: [{ type: String }],
    status: {
      type: String,
      enum: ["success", "partial", "error"],
      default: "success",
    },
  },
  { timestamps: false },
);

export const JobLog = mongoose.model<IJobLog>("JobLog", JobLogSchema);
export default JobLog;
