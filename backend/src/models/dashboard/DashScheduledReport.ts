import mongoose, { Schema, Document } from "mongoose";

export interface IScheduledReportRecipient {
  email: string;
  name: string;
  is_portal_user: boolean;
}

export interface IDashScheduledReport extends Document {
  dashboard_template_id: mongoose.Types.ObjectId;
  name: string;
  schedule_type: "daily" | "weekly" | "monthly" | "custom_cron";
  cron_expression: string;
  timezone: string;
  recipients: IScheduledReportRecipient[];
  format: "pdf" | "csv" | "email_inline";
  date_range_days: number;
  include_widgets: mongoose.Types.ObjectId[];
  subject_template: string;
  body_template: string;
  is_active: boolean;
  last_run_at?: Date;
  last_run_status?: "success" | "failed" | "partial";
  last_error?: string;
  created_by: mongoose.Types.ObjectId;
  tenant_id: string;
  createdAt: Date;
  updatedAt: Date;
}

const DashScheduledReportSchema = new Schema<IDashScheduledReport>(
  {
    dashboard_template_id: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    schedule_type: {
      type: String,
      enum: ["daily", "weekly", "monthly", "custom_cron"],
      required: true,
    },
    cron_expression: { type: String, required: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    recipients: [
      {
        email: { type: String, required: true },
        name: { type: String, default: "" },
        is_portal_user: { type: Boolean, default: false },
      },
    ],
    format: {
      type: String,
      enum: ["pdf", "csv", "email_inline"],
      default: "pdf",
    },
    date_range_days: { type: Number, default: 7 },
    include_widgets: [{ type: Schema.Types.ObjectId, ref: "DashboardWidget" }],
    subject_template: {
      type: String,
      default: "Dashboard Report: {{dashboard_name}} — {{date}}",
    },
    body_template: {
      type: String,
      default:
        "Please find attached the dashboard report for {{dashboard_name}} covering the period {{period}}.",
    },
    is_active: { type: Boolean, default: true },
    last_run_at: { type: Date },
    last_run_status: {
      type: String,
      enum: ["success", "failed", "partial"],
    },
    last_error: { type: String },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tenant_id: { type: String, required: true },
  },
  { timestamps: true },
);

DashScheduledReportSchema.index({ is_active: 1, schedule_type: 1 });
DashScheduledReportSchema.index({ tenant_id: 1, is_active: 1 });

export const DashScheduledReport = mongoose.model<IDashScheduledReport>(
  "DashScheduledReport",
  DashScheduledReportSchema,
  "dash_scheduled_reports",
);
