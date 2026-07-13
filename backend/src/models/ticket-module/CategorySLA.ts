import mongoose, { Document, Schema } from "mongoose";

type SlaTime = { value: number; unit: "minutes" | "hours" | "days" };

export interface ICategorySLA extends Document {
  categoryId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  responseTime: SlaTime;
  resolutionTime: SlaTime;
  /**
   * Optional per-source SLA overrides keyed by submissionSource
   * (e.g. "online"/"portal", "email", "ivr", "walk_in"). A source with a
   * value overrides the base SLA for tickets from that channel; missing
   * sources fall back to the base responseTime/resolutionTime.
   */
  slaBySource?: Record<
    string,
    { responseTime?: SlaTime; resolutionTime?: SlaTime }
  >;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const timeSchema = {
  value: { type: Number, required: true, min: 1 },
  unit: {
    type: String,
    required: true,
    enum: ["minutes", "hours", "days"],
    default: "hours" as "hours" | "days" | "minutes",
  },
};

const CategorySLASchema = new Schema<ICategorySLA>(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      unique: true, // one SLA override per category
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    responseTime: {
      type: timeSchema,
      required: true,
    },
    resolutionTime: {
      type: timeSchema,
      required: true,
    },
    // Per-source SLA overrides (portal/email/ivr/walk_in → {responseTime, resolutionTime})
    slaBySource: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const CategorySLA = mongoose.model<ICategorySLA>(
  "CategorySLA",
  CategorySLASchema,
);
export default CategorySLA;
