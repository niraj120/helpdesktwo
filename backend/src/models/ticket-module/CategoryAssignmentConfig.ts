import mongoose, { Document, Schema } from "mongoose";

/**
 * Assignment mode for a category.
 *
 * - round-robin  : Rotate among the agents in agentPool (or all project agents if pool is empty)
 * - by-role      : Rotate among all active agents that hold any role in rolePool
 * - by-user      : Assign directly to the agent(s) in agentPool (round-robin if multiple)
 * - manual       : Never auto-assign; ticket stays unassigned until a human acts
 */
export type CategoryAssignmentMode =
  | "round-robin"
  | "by-role"
  | "by-user"
  | "manual";

export interface ICategoryAssignmentConfig extends Document {
  categoryId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  mode: CategoryAssignmentMode;
  /** Agent ObjectIds used for round-robin and by-user modes */
  agentPool: mongoose.Types.ObjectId[];
  /** Role ObjectIds used for by-role mode */
  rolePool: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CategoryAssignmentConfigSchema = new Schema<ICategoryAssignmentConfig>(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    mode: {
      type: String,
      required: true,
      enum: ["round-robin", "by-role", "by-user", "manual"],
      default: "round-robin",
    },
    agentPool: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    rolePool: [
      {
        type: Schema.Types.ObjectId,
        ref: "Role",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// One config per (categoryId, projectId)
CategoryAssignmentConfigSchema.index(
  { categoryId: 1, projectId: 1 },
  { unique: true }
);

export const CategoryAssignmentConfig =
  mongoose.model<ICategoryAssignmentConfig>(
    "CategoryAssignmentConfig",
    CategoryAssignmentConfigSchema
  );
