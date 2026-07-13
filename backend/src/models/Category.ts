import mongoose, { Document, Schema } from "mongoose";

export interface ICategory extends Document {
  name: string;
  code: number; // Unique numeric code for the category
  description?: string;
  projectId: mongoose.Types.ObjectId;
  isActive: boolean;
  color?: string; // Optional color code for UI display
  icon?: string; // Optional icon for UI display
  order?: number; // Display order
  defaultPriority?: string; // Default priority code for this category
  // Hierarchy fields
  level: number; // Hierarchy level (1-4), default 1 for backward compatibility
  parentId?: mongoose.Types.ObjectId | null; // Parent category ID (null for Level 1 items)
  path?: string; // Display path (e.g., "Engineering > Computer Science > Programming")
  hierarchyPath?: mongoose.Types.ObjectId[]; // Array of ancestor IDs for efficient querying
  // ── Service Request (PSR/ISR) — Phase 1 master data ──────────────────────
  /** Owning department for routing (Academics, IT, Transport, …). Optional. */
  department?: mongoose.Types.ObjectId | null;
  /** SR-specific metadata for this category/sub-category. */
  sr?: {
    /** Policy/help text shown to the parent before raising an SR (deflection). */
    proactiveHelpText?: string;
    /** Which ticket types this category applies to; empty/undefined = all. */
    appliesTo?: ("normal" | "PSR" | "ISR")[];
  };
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: Number,
      required: true,
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
    color: {
      type: String,
      trim: true,
    },
    icon: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    defaultPriority: {
      type: String,
      trim: true,
    },
    // Hierarchy fields
    level: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
      index: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    path: {
      type: String,
      trim: true,
      default: "", // Will be computed on save
    },
    hierarchyPath: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    // ── Service Request (PSR/ISR) — Phase 1 master data ──────────────────────
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    sr: {
      proactiveHelpText: { type: String, trim: true },
      appliesTo: [{ type: String, enum: ["normal", "PSR", "ISR"] }],
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
  },
);

// Compound index for unique category name per project AND level AND parent
// This allows same name at different levels or under different parents
CategorySchema.index(
  { name: 1, projectId: 1, level: 1, parentId: 1 },
  { unique: true },
);

// Compound index for unique category code per project
CategorySchema.index({ code: 1, projectId: 1 }, { unique: true });

// Index for efficient queries
CategorySchema.index({ projectId: 1, isActive: 1 });
CategorySchema.index({ projectId: 1, order: 1 });

// Index for hierarchy queries
CategorySchema.index({ projectId: 1, level: 1, isActive: 1 });
CategorySchema.index({ projectId: 1, parentId: 1, isActive: 1 });
CategorySchema.index({ hierarchyPath: 1 });

/**
 * Pre-save middleware to compute path and validate hierarchy
 */
CategorySchema.pre("save", async function (next) {
  try {
    // Level 1 categories should not have a parent
    if (this.level === 1) {
      this.parentId = undefined;
      this.hierarchyPath = [];
      this.path = this.name;
    } else if (this.parentId) {
      // Fetch parent to build hierarchy path
      const parent = await mongoose
        .model<ICategory>("Category")
        .findById(this.parentId);
      if (!parent) {
        throw new Error("Parent category not found");
      }

      // Validate parent level is exactly one level above
      if (parent.level !== this.level - 1) {
        throw new Error(
          `Parent must be level ${this.level - 1}, but found level ${parent.level}`,
        );
      }

      // Build hierarchy path (ancestors + parent)
      this.hierarchyPath = [...(parent.hierarchyPath || []), parent._id];

      // Build display path
      this.path = parent.path ? `${parent.path} > ${this.name}` : this.name;
    }

    next();
  } catch (error: any) {
    next(error);
  }
});

/**
 * Static method to get children of a category
 */
CategorySchema.statics.getChildren = async function (
  parentId: mongoose.Types.ObjectId | string,
  options?: { includeInactive?: boolean },
): Promise<ICategory[]> {
  const query: any = { parentId };
  if (!options?.includeInactive) {
    query.isActive = true;
  }
  return this.find(query).sort({ order: 1, name: 1 });
};

/**
 * Static method to get all descendants of a category
 */
CategorySchema.statics.getDescendants = async function (
  ancestorId: mongoose.Types.ObjectId | string,
  options?: { includeInactive?: boolean },
): Promise<ICategory[]> {
  const query: any = { hierarchyPath: ancestorId };
  if (!options?.includeInactive) {
    query.isActive = true;
  }
  return this.find(query).sort({ level: 1, order: 1, name: 1 });
};

/**
 * Static method to get root categories (Level 1) for a project
 */
CategorySchema.statics.getRootCategories = async function (
  projectId: mongoose.Types.ObjectId | string,
  options?: { includeInactive?: boolean },
): Promise<ICategory[]> {
  const query: any = { projectId, level: 1 };
  if (!options?.includeInactive) {
    query.isActive = true;
  }
  return this.find(query).sort({ order: 1, name: 1 });
};

/**
 * Static method to get categories as tree structure
 */
CategorySchema.statics.getTreeForProject = async function (
  projectId: mongoose.Types.ObjectId | string,
  options?: { includeInactive?: boolean; maxLevel?: number },
): Promise<any[]> {
  const query: any = { projectId };
  if (!options?.includeInactive) {
    query.isActive = true;
  }
  if (options?.maxLevel) {
    query.level = { $lte: options.maxLevel };
  }

  const categories = await this.find(query)
    .sort({ level: 1, order: 1, name: 1 })
    .lean();

  // Build tree structure
  const buildTree = (items: any[], parentId: string | null = null): any[] => {
    return items
      .filter((item) => {
        const itemParentId = item.parentId?.toString() || null;
        return itemParentId === parentId;
      })
      .map((item) => ({
        ...item,
        children: buildTree(items, item._id.toString()),
      }));
  };

  return buildTree(categories);
};

export const Category = mongoose.model<ICategory>("Category", CategorySchema);
