import mongoose, { Document, Schema } from "mongoose";

/**
 * Full-day leave range for an IVR agent (per project). While "today" falls
 * within [fromDate, toDate], the agent is skipped by the missed-call
 * round-robin.
 */
export interface IIvrAgentLeave extends Document {
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  fromDate: Date; // inclusive, start of day
  toDate: Date; // inclusive, end of day
  reason?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IvrAgentLeaveSchema = new Schema<IIvrAgentLeave>(
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
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

IvrAgentLeaveSchema.index({ userId: 1, projectId: 1, fromDate: 1, toDate: 1 });

export const IvrAgentLeave = mongoose.model<IIvrAgentLeave>(
  "IvrAgentLeave",
  IvrAgentLeaveSchema,
);
