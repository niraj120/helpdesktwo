/**
 * PersonalDashboard Model
 *
 * User-created personal dashboards — stored per user, not derived from templates.
 * Personal dashboards are scoped to the owning user + project (tenant boundary).
 */

import mongoose, { Document, Schema } from "mongoose";

export interface IPersonalDashboardWidget {
  widgetDefinitionId: mongoose.Types.ObjectId;
  widgetKey: string;
  displayName: string;
  visualisationType: string;
  gridColumn: number;
  gridRow: number;
  gridWidth: number;
  gridHeight: number;
  displayOrder: number;
  config?: Record<string, any>;
}

export interface IPersonalDashboard extends Document {
  userId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // project _id — tenant boundary
  name: string;
  description?: string;
  colourLabel?: string;
  globalDateRangeDays: number;
  allowUserDateOverride: boolean;
  widgets: IPersonalDashboardWidget[];
  isDefault: boolean; // user's "home" personal dashboard
  createdAt: Date;
  updatedAt: Date;
}

const PersonalDashboardWidgetSchema = new Schema<IPersonalDashboardWidget>(
  {
    widgetDefinitionId: {
      type: Schema.Types.ObjectId,
      ref: "WidgetDefinition",
      required: true,
    },
    widgetKey: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    visualisationType: { type: String, required: true },
    gridColumn: { type: Number, default: 0 },
    gridRow: { type: Number, default: 0 },
    gridWidth: { type: Number, default: 4, min: 1, max: 12 },
    gridHeight: { type: Number, default: 2, min: 1, max: 8 },
    displayOrder: { type: Number, default: 0 },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const PersonalDashboardSchema = new Schema<IPersonalDashboard>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 255 },
    description: { type: String, default: "" },
    colourLabel: { type: String, default: "#2563eb" },
    globalDateRangeDays: { type: Number, default: 30 },
    allowUserDateOverride: { type: Boolean, default: true },
    widgets: { type: [PersonalDashboardWidgetSchema], default: [] },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One default per user per tenant
PersonalDashboardSchema.index({ userId: 1, tenantId: 1, isDefault: 1 });
// At most 20 personal dashboards per user per tenant (enforced in controller)
PersonalDashboardSchema.index({ userId: 1, tenantId: 1 });

export const PersonalDashboard = mongoose.model<IPersonalDashboard>(
  "PersonalDashboard",
  PersonalDashboardSchema,
);
