import mongoose, { Document, Schema } from "mongoose";

export interface IDepartment extends Document {
  name: string;
  description?: string;
  projectId: mongoose.Types.ObjectId;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<IDepartment>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

// Unique department name per project
DepartmentSchema.index({ projectId: 1, name: 1 }, { unique: true });

export default mongoose.model<IDepartment>("Department", DepartmentSchema);
