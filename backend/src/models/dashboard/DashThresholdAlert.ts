import mongoose, { Schema, Document } from "mongoose";

export interface IAlertCondition {
  operator: "gt" | "lt" | "gte" | "lte" | "eq";
  value: number;
}

export interface IDashThresholdAlert extends Document {
  dashboard_template_id: mongoose.Types.ObjectId;
  dashboard_widget_id: mongoose.Types.ObjectId;
  widget_key: string;
  alert_name: string;
  condition: IAlertCondition;
  severity: "info" | "warning" | "critical";
  notify_roles: mongoose.Types.ObjectId[];
  notify_users: mongoose.Types.ObjectId[];
  cooldown_minutes: number;
  last_triggered_at?: Date;
  last_triggered_value?: number;
  is_active: boolean;
  created_by: mongoose.Types.ObjectId;
  tenant_id: string;
  createdAt: Date;
  updatedAt: Date;
}

const DashThresholdAlertSchema = new Schema<IDashThresholdAlert>(
  {
    dashboard_template_id: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
      required: true,
    },
    dashboard_widget_id: {
      type: Schema.Types.ObjectId,
      ref: "DashboardWidget",
      required: true,
    },
    widget_key: { type: String, required: true, trim: true },
    alert_name: { type: String, required: true, trim: true },
    condition: {
      operator: {
        type: String,
        enum: ["gt", "lt", "gte", "lte", "eq"],
        required: true,
      },
      value: { type: Number, required: true },
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "warning",
    },
    notify_roles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    notify_users: [{ type: Schema.Types.ObjectId, ref: "User" }],
    cooldown_minutes: { type: Number, default: 60 },
    last_triggered_at: { type: Date },
    last_triggered_value: { type: Number },
    is_active: { type: Boolean, default: true },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenant_id: { type: String, required: true },
  },
  { timestamps: true },
);

DashThresholdAlertSchema.index({ dashboard_widget_id: 1, is_active: 1 });
DashThresholdAlertSchema.index({ widget_key: 1, is_active: 1 });
DashThresholdAlertSchema.index({ dashboard_template_id: 1, is_active: 1 });

export const DashThresholdAlert = mongoose.model<IDashThresholdAlert>(
  "DashThresholdAlert",
  DashThresholdAlertSchema,
  "dash_threshold_alerts",
);
