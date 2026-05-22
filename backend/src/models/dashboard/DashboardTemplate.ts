import mongoose, { Document, Schema } from "mongoose";

export type DashboardStatus = "draft" | "published" | "archived";

export interface IDashboardSection {
  _id?: mongoose.Types.ObjectId;
  name: string;
  order: number;
}

export interface IDashboardTemplate extends Document {
  tenantId: mongoose.Types.ObjectId; // project _id (tenant boundary)
  name: string;
  description?: string;
  icon?: string;
  colourLabel?: string;
  status: DashboardStatus;
  globalDateRangeDays: number;
  allowUserDateOverride: boolean;
  isSystemTemplate: boolean; // seeded system templates cannot be deleted
  theme?: "light" | "dark" | "system"; // display theme override
  allowWidgetExport?: boolean; // allow users to export individual widget data
  autoRefreshSeconds?: number; // live refresh interval (min 30s); 0 = disabled
  sections?: IDashboardSection[]; // canvas section groupings
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  publishedAt?: Date;
}

const DashboardTemplateSchema = new Schema<IDashboardTemplate>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 255 },
    description: { type: String, default: "" },
    icon: { type: String, default: "chart-bar" },
    colourLabel: { type: String, default: "#2563eb" },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    globalDateRangeDays: { type: Number, default: 30 },
    allowUserDateOverride: { type: Boolean, default: true },
    isSystemTemplate: { type: Boolean, default: false },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    allowWidgetExport: { type: Boolean, default: true },
    autoRefreshSeconds: { type: Number, min: 0, default: 0 },
    sections: {
      type: [
        new Schema(
          {
            name: { type: String, required: true, trim: true, maxlength: 120 },
            order: { type: Number, default: 0 },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

DashboardTemplateSchema.index({ tenantId: 1, status: 1 });

export const DashboardTemplate = mongoose.model<IDashboardTemplate>(
  "DashboardTemplate",
  DashboardTemplateSchema,
);
