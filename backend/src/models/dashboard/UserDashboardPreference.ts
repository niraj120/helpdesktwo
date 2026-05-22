import mongoose, { Document, Schema } from "mongoose";

export interface IUserDashboardPreference extends Document {
  userId: mongoose.Types.ObjectId;
  dashboardTemplateId: mongoose.Types.ObjectId;
  // User-level overrides for this dashboard
  dateRangeDays?: number; // overrides template globalDateRangeDays
  // Widget-level layout overrides (user can reorder but not resize in viewer mode)
  widgetOverrides?: Array<{
    widgetId: mongoose.Types.ObjectId;
    gridX?: number;
    gridY?: number;
    isHidden?: boolean;
    isCollapsed?: boolean;
  }>;
  // Active scope override (for roles with dashboard.scope_override)
  scopeOverride?: {
    mode: "all" | "project" | "centre" | "user";
    projectId?: mongoose.Types.ObjectId;
    centreId?: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;
  };
  updatedAt: Date;
}

const UserDashboardPreferenceSchema = new Schema<IUserDashboardPreference>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dashboardTemplateId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
      required: true,
    },
    dateRangeDays: { type: Number },
    widgetOverrides: [
      {
        widgetId: { type: Schema.Types.ObjectId },
        gridX: { type: Number },
        gridY: { type: Number },
        isHidden: { type: Boolean },
        isCollapsed: { type: Boolean },
      },
    ],
    scopeOverride: {
      mode: {
        type: String,
        enum: ["all", "project", "centre", "user"],
        default: "all",
      },
      projectId: { type: Schema.Types.ObjectId, ref: "Project" },
      centreId: { type: Schema.Types.ObjectId, ref: "Center" },
      userId: { type: Schema.Types.ObjectId, ref: "User" },
    },
  },
  { timestamps: true },
);

UserDashboardPreferenceSchema.index(
  { userId: 1, dashboardTemplateId: 1 },
  { unique: true },
);

export const UserDashboardPreference = mongoose.model<IUserDashboardPreference>(
  "UserDashboardPreference",
  UserDashboardPreferenceSchema,
);
