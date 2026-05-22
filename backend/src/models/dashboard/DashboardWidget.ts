import mongoose, { Document, Schema } from "mongoose";
import { VisualisationType } from "./WidgetDefinition";

export interface IDashboardWidget extends Document {
  dashboardTemplateId: mongoose.Types.ObjectId;
  widgetDefinitionId: mongoose.Types.ObjectId;
  widgetKey: string; // denormalised for fast lookup
  title?: string; // override displayName; null = use definition name
  subtitle?: string; // optional subtitle shown below title
  visualisationType: VisualisationType;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  displayOrder: number;
  mobileOrder?: number; // order on mobile viewports
  displayConfig?: {
    showHeader?: boolean;
    showFooterTimestamp?: boolean;
    colourOverride?: string;
  };
  thresholdConfig?: {
    greenMin?: number;
    greenMax?: number;
    amberMin?: number;
    amberMax?: number;
    redMin?: number;
    redMax?: number;
    goodDirection?: "up" | "down" | "neutral";
  };
  tableConfig?: {
    columns?: string[];
    sortBy?: string;
    sortDir?: "asc" | "desc";
    drillThroughUrl?: string;
    pageSize?: number;
  };
  config: {
    refreshInterval?: number; // seconds; 0 = manual only
    filters?: Record<string, any>; // may contain @ctx.* variables
    targetMode?: "project_total" | "monthly"; // for onboarding widgets
    thresholds?: {
      green?: number;
      amber?: number;
      red?: number;
    };
    [key: string]: any;
  };
  sectionId?: mongoose.Types.ObjectId; // reference to IDashboardSection._id
  isVisible: boolean;
  isCollapsedDefault?: boolean; // widget starts collapsed on load
  widgetDefinitionVersion: number; // snapshot of version at placement time
}

const DashboardWidgetSchema = new Schema<IDashboardWidget>(
  {
    dashboardTemplateId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
      required: true,
      index: true,
    },
    widgetDefinitionId: {
      type: Schema.Types.ObjectId,
      ref: "WidgetDefinition",
      required: false,
      default: null,
    },
    widgetKey: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: null },
    subtitle: { type: String, trim: true, default: null },
    visualisationType: {
      type: String,
      required: true,
      enum: [
        "kpi_tile",
        "sparkline",
        "line_chart",
        "bar_chart",
        "pie_chart",
        "donut_chart",
        "grouped_bar",
        "area_chart",
        "table",
        "progress_bar",
        "gauge",
      ],
    },
    gridX: { type: Number, default: 0 },
    gridY: { type: Number, default: 0 },
    gridWidth: { type: Number, default: 3 },
    gridHeight: { type: Number, default: 2 },
    displayOrder: { type: Number, default: 0 },
    mobileOrder: { type: Number, default: null },
    displayConfig: { type: Schema.Types.Mixed, default: null },
    thresholdConfig: { type: Schema.Types.Mixed, default: null },
    tableConfig: { type: Schema.Types.Mixed, default: null },
    config: { type: Schema.Types.Mixed, default: {} },
    sectionId: { type: Schema.Types.ObjectId, default: null },
    isVisible: { type: Boolean, default: true },
    isCollapsedDefault: { type: Boolean, default: false },
    widgetDefinitionVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);

DashboardWidgetSchema.index({ dashboardTemplateId: 1, displayOrder: 1 });

export const DashboardWidget = mongoose.model<IDashboardWidget>(
  "DashboardWidget",
  DashboardWidgetSchema,
);
