import mongoose, { Document, Schema } from "mongoose";

/**
 * Maps an IVR agent (a User flagged isIvrAgent) to the IVR digit buckets they
 * handle, per project. Missed calls for a given bucket are round-robined among
 * active configs, ordered by lastAssignedAt (least-recently-assigned first).
 */
export interface IIvrAgentConfig extends Document {
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  digits: string[]; // digit codes + "other" this agent handles
  active: boolean; // long-term: enrolled in the rotation (manager toggle)
  available: boolean; // real-time: available right now (quick break toggle)
  unavailableUntil?: Date; // optional auto-resume time when on break
  lastAssignedAt?: Date; // round-robin cursor
  createdAt: Date;
  updatedAt: Date;
}

const IvrAgentConfigSchema = new Schema<IIvrAgentConfig>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    digits: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    available: { type: Boolean, default: true },
    unavailableUntil: { type: Date },
    lastAssignedAt: { type: Date },
  },
  { timestamps: true },
);

IvrAgentConfigSchema.index({ userId: 1, projectId: 1 }, { unique: true });

export const IvrAgentConfig = mongoose.model<IIvrAgentConfig>(
  "IvrAgentConfig",
  IvrAgentConfigSchema,
);
