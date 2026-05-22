import mongoose, { Document, Schema } from "mongoose";

export type VisualisationType =
  | "kpi_tile"
  | "sparkline"
  | "line_chart"
  | "bar_chart"
  | "pie_chart"
  | "donut_chart"
  | "grouped_bar"
  | "area_chart"
  | "table"
  | "progress_bar"
  | "gauge";

export type ScopeLevel = "tenant" | "project" | "district" | "centre" | "user";
export type WidgetModule =
  | "ticketing"
  | "users"
  | "onboarding"
  | "attendance"
  | "capacity"
  | "feedback"
  | "satisfaction"
  | "system";

export interface IWidgetDefinition extends Document {
  widgetKey: string; // e.g. "ticket_open_count" — unique, immutable
  module: WidgetModule;
  displayName: string;
  description: string;
  supportedVisualisations: VisualisationType[];
  defaultVisualisation: VisualisationType;
  scopeLevels: ScopeLevel[]; // which scope modes this widget supports
  cacheTtlSeconds: number;
  dataQueryKey: string; // maps to QueryHandler registry key
  defaultConfig: Record<string, any>; // default filter/config for widget instances
  isActive: boolean;
  requiresPermission: string[]; // OR logic — user must have at least one
  version: number;
}

const WidgetDefinitionSchema = new Schema<IWidgetDefinition>(
  {
    widgetKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    module: {
      type: String,
      required: true,
      enum: [
        "ticketing",
        "users",
        "onboarding",
        "attendance",
        "capacity",
        "feedback",
        "satisfaction",
        "system",
      ],
      index: true,
    },
    displayName: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    supportedVisualisations: {
      type: [String],
      required: true,
      enum: [
        "kpi_tile",
        "line_chart",
        "bar_chart",
        "donut_chart",
        "grouped_bar",
        "area_chart",
        "table",
        "progress_bar",
        "gauge",
      ],
    },
    defaultVisualisation: {
      type: String,
      required: true,
      enum: [
        "kpi_tile",
        "line_chart",
        "bar_chart",
        "donut_chart",
        "grouped_bar",
        "area_chart",
        "table",
        "progress_bar",
        "gauge",
      ],
    },
    scopeLevels: {
      type: [String],
      enum: ["tenant", "project", "district", "centre", "user"],
      default: ["tenant", "project"],
    },
    cacheTtlSeconds: { type: Number, default: 300 },
    dataQueryKey: { type: String, required: true },
    defaultConfig: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true, index: true },
    requiresPermission: { type: [String], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export const WidgetDefinition = mongoose.model<IWidgetDefinition>(
  "WidgetDefinition",
  WidgetDefinitionSchema,
);
