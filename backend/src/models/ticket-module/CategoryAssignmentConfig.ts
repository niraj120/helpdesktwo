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
  /** SR (PSR/ISR): users CC'd as watchers on assignment (e.g. PSL). Phase 1. */
  ccUsers?: mongoose.Types.ObjectId[];
  /** SR (PSR/ISR): roles CC'd as watchers on assignment. Phase 1. */
  ccRoles?: mongoose.Types.ObjectId[];
  /**
   * Re-open routing for this category. When set, an SR re-opened under this
   * category assigns per this block; otherwise falls back to project sr.reopen.
   */
  reopen?: {
    assignToUserId?: mongoose.Types.ObjectId;
    assignToRoleId?: mongoose.Types.ObjectId;
    ccUsers?: mongoose.Types.ObjectId[];
    ccRoles?: mongoose.Types.ObjectId[];
  };
  /**
   * Email auto-forward. When an email is converted to an SR under this
   * category, the original email is forwarded to these addresses.
   */
  autoForwardTo?: string[];
  /**
   * Auto-close rule. When enabled and the SR's field values satisfy the
   * conditions at creation, the SR is created Closed with a templated remark.
   */
  autoClose?: {
    enabled?: boolean;
    match?: "all" | "any";
    conditions?: {
      field: string;
      operator: string;
      value?: string;
    }[];
    remarkTemplate?: string;
  };
  /**
   * Per-center overrides. When a ticket carries a center matching one of these,
   * the override's non-empty fields replace the base config for that center
   * (assignment mode/pools, CC, reopen). Keeps one row per category — no unique
   * index change / migration.
   */
  centerOverrides?: {
    centerId: mongoose.Types.ObjectId;
    mode?: CategoryAssignmentMode;
    agentPool?: mongoose.Types.ObjectId[];
    rolePool?: mongoose.Types.ObjectId[];
    ccUsers?: mongoose.Types.ObjectId[];
    ccRoles?: mongoose.Types.ObjectId[];
    reopen?: {
      assignToUserId?: mongoose.Types.ObjectId;
      assignToRoleId?: mongoose.Types.ObjectId;
      ccUsers?: mongoose.Types.ObjectId[];
      ccRoles?: mongoose.Types.ObjectId[];
    };
  }[];
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
    // SR (PSR/ISR) CC watchers — Phase 1
    ccUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    ccRoles: [
      {
        type: Schema.Types.ObjectId,
        ref: "Role",
      },
    ],
    // Category-level re-open routing (falls back to project sr.reopen)
    reopen: {
      assignToUserId: { type: Schema.Types.ObjectId, ref: "User" },
      assignToRoleId: { type: Schema.Types.ObjectId, ref: "Role" },
      ccUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
      ccRoles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    },
    // Email auto-forward targets (on email→SR convert)
    autoForwardTo: [{ type: String }],
    // Auto-close rule (condition-driven; evaluated at SR creation)
    autoClose: {
      enabled: { type: Boolean, default: false },
      match: { type: String, enum: ["all", "any"], default: "all" },
      conditions: [
        {
          _id: false,
          field: { type: String },
          operator: { type: String },
          value: { type: String },
        },
      ],
      remarkTemplate: { type: String },
    },
    // Per-center overrides — merged over the base config when a ticket's center matches
    centerOverrides: [
      {
        _id: false,
        centerId: { type: Schema.Types.ObjectId, ref: "Center", required: true },
        mode: {
          type: String,
          enum: ["round-robin", "by-role", "by-user", "manual"],
        },
        agentPool: [{ type: Schema.Types.ObjectId, ref: "User" }],
        rolePool: [{ type: Schema.Types.ObjectId, ref: "Role" }],
        ccUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
        ccRoles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
        reopen: {
          assignToUserId: { type: Schema.Types.ObjectId, ref: "User" },
          assignToRoleId: { type: Schema.Types.ObjectId, ref: "Role" },
          ccUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
          ccRoles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
        },
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
