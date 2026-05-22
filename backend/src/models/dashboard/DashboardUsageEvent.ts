/**
 * DashboardUsageEvent Model (Phase 3)
 *
 * Lightweight analytics — tracks which dashboards/widgets are viewed.
 * Intentionally simple: no heavy aggregations at write time.
 * TTL index auto-expires records after 90 days.
 */

import mongoose, { Document, Schema } from "mongoose";

export type UsageEventType =
  | "dashboard_view"
  | "widget_view"
  | "widget_drill_through";

export interface IDashboardUsageEvent extends Document {
  userId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  eventType: UsageEventType;
  dashboardTemplateId?: mongoose.Types.ObjectId;
  personalDashboardId?: mongoose.Types.ObjectId;
  widgetKey?: string;
  sessionId?: string; // client-supplied opaque session token
  createdAt: Date;
}

const DashboardUsageEventSchema = new Schema<IDashboardUsageEvent>(
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
    eventType: {
      type: String,
      enum: ["dashboard_view", "widget_view", "widget_drill_through"],
      required: true,
    },
    dashboardTemplateId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
    },
    personalDashboardId: {
      type: Schema.Types.ObjectId,
      ref: "PersonalDashboard",
    },
    widgetKey: { type: String, trim: true },
    sessionId: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// Auto-expire after 90 days
DashboardUsageEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 3600 },
);

// Analytics query index
DashboardUsageEventSchema.index({ tenantId: 1, eventType: 1, createdAt: -1 });
DashboardUsageEventSchema.index({ dashboardTemplateId: 1, createdAt: -1 });
DashboardUsageEventSchema.index({ widgetKey: 1, tenantId: 1, createdAt: -1 });

export const DashboardUsageEvent = mongoose.model<IDashboardUsageEvent>(
  "DashboardUsageEvent",
  DashboardUsageEventSchema,
);
