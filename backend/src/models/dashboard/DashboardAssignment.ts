import mongoose, { Document, Schema } from "mongoose";

export type AssigneeType = "role" | "user";

export interface IDashboardAssignment extends Document {
  tenantId: mongoose.Types.ObjectId;
  dashboardTemplateId: mongoose.Types.ObjectId;
  assigneeType: AssigneeType;
  assigneeId: mongoose.Types.ObjectId; // Role _id or User _id
  tabOrder: number; // position in the tab bar for this assignee
  isDefault: boolean; // the tab that opens first
  scopeType?: "global" | "project" | "centre" | "email_domain" | "multi_centre";
  scopeProjectId?: mongoose.Types.ObjectId;
  scopeCentreIds?: mongoose.Types.ObjectId[];
  scopeEmailDomain?: string;
  assignedBy: mongoose.Types.ObjectId;
  assignedAt: Date;
}

const DashboardAssignmentSchema = new Schema<IDashboardAssignment>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    dashboardTemplateId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
      required: true,
    },
    assigneeType: {
      type: String,
      required: true,
      enum: ["role", "user"],
    },
    assigneeId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    tabOrder: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    scopeType: {
      type: String,
      enum: ["global", "project", "centre", "email_domain", "multi_centre"],
      default: undefined,
    },
    scopeProjectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: undefined,
    },
    scopeCentreIds: [{ type: Schema.Types.ObjectId, ref: "Center" }],
    scopeEmailDomain: { type: String, default: undefined },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// One template assigned once per assignee (unique constraint)
DashboardAssignmentSchema.index(
  { dashboardTemplateId: 1, assigneeType: 1, assigneeId: 1, tenantId: 1 },
  { unique: true },
);

// Dashboard resolution query index
DashboardAssignmentSchema.index({
  assigneeType: 1,
  assigneeId: 1,
  tenantId: 1,
});

export const DashboardAssignment = mongoose.model<IDashboardAssignment>(
  "DashboardAssignment",
  DashboardAssignmentSchema,
);
