import mongoose, { Document, Schema } from "mongoose";

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "between"
  | "in"
  | "is_empty"
  | "is_not_empty"
  | "before"
  | "after";

export interface IReportFilter {
  field: string; // data point key
  operator: FilterOperator;
  value?: any;
  value2?: any; // used for 'between'
}

export interface ISavedReport extends Document {
  name: string;
  description: string;
  reportType: "ticket" | "attendance" | "footfall";
  createdBy: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId; // optional project scope
  dataPoints: string[]; // ordered array of selected data point keys
  filters: IReportFilter[];
  sortBy?: string; // data point key to sort by
  sortOrder: "asc" | "desc";
  /** Footfall reports: rolling window size (days) used when run/emailed */
  footfallDays?: number;
  isActive: boolean;
  /** Cached metadata from last run */
  rowCount?: number;
  lastRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FilterSchema = new Schema(
  {
    field: { type: String, required: true },
    operator: {
      type: String,
      enum: [
        "equals",
        "not_equals",
        "contains",
        "not_contains",
        "greater_than",
        "less_than",
        "between",
        "in",
        "is_empty",
        "is_not_empty",
        "before",
        "after",
      ],
      required: true,
    },
    value: { type: Schema.Types.Mixed },
    value2: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const SavedReportSchema = new Schema<ISavedReport>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    reportType: {
      type: String,
      enum: ["ticket", "attendance", "footfall"],
      default: "ticket",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    dataPoints: { type: [String], required: true, default: [] },
    filters: { type: [FilterSchema], default: [] },
    sortBy: { type: String },
    sortOrder: { type: String, enum: ["asc", "desc"], default: "desc" },
    footfallDays: { type: Number },
    isActive: { type: Boolean, default: true },
    rowCount: { type: Number },
    lastRunAt: { type: Date },
  },
  { timestamps: true },
);

SavedReportSchema.index({ createdBy: 1 });
SavedReportSchema.index({ projectId: 1 });

export const SavedReport = mongoose.model<ISavedReport>(
  "SavedReport",
  SavedReportSchema,
);
