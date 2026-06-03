import mongoose, { Document, Schema } from "mongoose";

/**
 * Links a SavedReport to one-or-more users and/or roles.
 * One document per report (upserted on assign).
 * Also stores optional scheduled alert settings.
 */
export interface IReportAssignment extends Document {
  reportId: mongoose.Types.ObjectId;
  assignedToUsers: mongoose.Types.ObjectId[];
  assignedToRoles: mongoose.Types.ObjectId[];
  assignedBy: mongoose.Types.ObjectId;
  assignedAt: Date;
  // Schedule alert fields
  alertEnabled: boolean;
  scheduleType: "daily" | "weekly" | "monthly";
  scheduleDay: number; // 0-6 for weekly (0=Sun), 1-31 for monthly
  scheduleTime: string; // "HH:MM" in 24h, e.g. "08:00"
  lastAlertSentAt?: Date;
  // CC recipients
  ccUsers: mongoose.Types.ObjectId[]; // existing system users to CC
  ccEmails: string[]; // arbitrary email addresses to CC
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
    alertEnabled: { type: Boolean, default: false },
    scheduleType: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "daily",
    },
    scheduleDay: { type: Number, default: 1 }, // Mon for weekly; 1st for monthly
    scheduleTime: { type: String, default: "08:00" },
    lastAlertSentAt: { type: Date },
    ccUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    ccEmails: [{ type: String }],
  },
  { timestamps: true },
);

ReportAssignmentSchema.index({ assignedToUsers: 1 });
ReportAssignmentSchema.index({ assignedToRoles: 1 });
ReportAssignmentSchema.index({ alertEnabled: 1 });

export const ReportAssignment = mongoose.model<IReportAssignment>(
  "ReportAssignment",
  ReportAssignmentSchema,
);
