import mongoose, { Document, Schema } from "mongoose";

export interface IIvrIngestLog extends Document {
  projectId?: mongoose.Types.ObjectId;
  provider: "smartflo" | "manual" | "other";
  externalId?: string;
  rawBody?: string;
  payload?: Record<string, any>;
  headers?: Record<string, any>;
  status: "received" | "processed" | "ignored" | "failed";
  message?: string;
  callIntakeId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IvrIngestLogSchema = new Schema<IIvrIngestLog>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    provider: {
      type: String,
      enum: ["smartflo", "manual", "other"],
      default: "smartflo",
      index: true,
    },
    externalId: { type: String, index: true },
    rawBody: { type: String },
    payload: { type: Schema.Types.Mixed },
    headers: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ["received", "processed", "ignored", "failed"],
      default: "received",
      index: true,
    },
    message: { type: String },
    callIntakeId: { type: Schema.Types.ObjectId, ref: "CallIntake" },
  },
  { timestamps: true },
);

IvrIngestLogSchema.index({ projectId: 1, createdAt: -1 });

export const IvrIngestLog = mongoose.model<IIvrIngestLog>(
  "IvrIngestLog",
  IvrIngestLogSchema,
);
export default IvrIngestLog;
