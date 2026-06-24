import mongoose, { Document, Schema } from "mongoose";

/**
 * Cluster = a group of schools/projects (e.g. "Mumbai Cluster"). Used by the
 * Service Request module for assignment/escalation roll-ups and report
 * summaries (summarize-by-Cluster). Phase 1 — master data backbone.
 */
export interface ICluster extends Document {
  name: string;
  code?: string;
  description?: string;
  /** Projects (schools) that belong to this cluster. */
  projects: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ClusterSchema = new Schema<ICluster>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, trim: true },
    description: { type: String, trim: true },
    projects: [{ type: Schema.Types.ObjectId, ref: "Project", index: true }],
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const Cluster = mongoose.model<ICluster>("Cluster", ClusterSchema);
export default Cluster;
