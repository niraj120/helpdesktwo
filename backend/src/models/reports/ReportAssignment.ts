import mongoose, { Document, Schema } from "mongoose";

/**
 * Links a SavedReport to one-or-more users and/or roles.
 * One document per report (upserted on assign).
 */
export interface IReportAssignment extends Document {
  reportId: mongoose.Types.ObjectId;
  assignedToUsers: mongoose.Types.ObjectId[];
  assignedToRoles: mongoose.Types.ObjectId[];
  assignedBy: mongoose.Types.ObjectId;
  assignedAt: Date;
  updatedAt: Date;
  createdAt: Date;
}

const ReportAssignmentSchema = new Schema<IReportAssignment>(
  {
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "SavedReport",
      required: true,
      unique: true,
    },
    assignedToUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    assignedToRoles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ReportAssignmentSchema.index({ assignedToUsers: 1 });
ReportAssignmentSchema.index({ assignedToRoles: 1 });

export const ReportAssignment = mongoose.model<IReportAssignment>(
  "ReportAssignment",
  ReportAssignmentSchema,
);
