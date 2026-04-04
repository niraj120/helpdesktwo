import mongoose, { Document, Schema } from "mongoose";

export interface ICategorySLA extends Document {
  categoryId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  responseTime: { value: number; unit: "minutes" | "hours" | "days" };
  resolutionTime: { value: number; unit: "minutes" | "hours" | "days" };
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
