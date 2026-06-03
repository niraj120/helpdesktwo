import mongoose, { Document, Schema } from "mongoose";

/**
 * Interface for a single hierarchy level configuration
 */
export interface IHierarchyLevel {
  levelNumber: number; // 1-4
  displayName: string; // Custom name like "Course", "Category", "Subcategory", "Topic"
  isMandatory: boolean; // Whether this level is required when creating tickets
  isActive: boolean; // Whether this level is enabled
}

/**
 * Interface for visibility settings
 */
export interface IVisibilitySettings {
  showInOnlineForm: number[]; // Which levels to show in online forms (e.g., [1, 2, 3])
  showInOfflineForm: number[]; // Which levels to show in offline/counselor forms
  showInTicketDisplay: number[]; // Which levels to show in ticket details
  showInFilters: number[]; // Which levels to show in filter dropdowns
}

/**
 * Main HierarchyConfig document interface
 * Stores the hierarchy configuration for each project
 */
export interface IHierarchyConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  levelCount: number; // Number of levels configured (1-4)
  levels: IHierarchyLevel[];
  visibilitySettings: IVisibilitySettings;
  priorityFromLevel: number; // Which level determines the ticket priority (1-4, 0 means manual selection)
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema for hierarchy level
 */
const HierarchyLevelSchema = new Schema<IHierarchyLevel>(
  {
    levelNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      default: function (this: IHierarchyLevel) {
        return `Level ${this.levelNumber}`;
      },
    },
    isMandatory: {
      type: Boolean,
      default: function (this: IHierarchyLevel) {
        // Level 1 is always mandatory by default
        return this.levelNumber === 1;
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

/**
 * Schema for visibility settings
 */
const VisibilitySettingsSchema = new Schema<IVisibilitySettings>(
  {
    showInOnlineForm: {
      type: [Number],
      default: [1, 2, 3, 4, 5],
    },
    showInOfflineForm: {
      type: [Number],
      default: [1, 2, 3, 4, 5],
    },
    showInTicketDisplay: {
      type: [Number],
      default: [1, 2, 3, 4, 5],
    },
    showInFilters: {
      type: [Number],
      default: [1, 2],
    },
  },
  { _id: false },
);

/**
 * Main HierarchyConfig schema
 */
const HierarchyConfigSchema = new Schema<IHierarchyConfig>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true, // One config per project
      index: true,
    },
    levelCount: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      default: 1, // Default to single-level (current system)
    },
    levels: {
      type: [HierarchyLevelSchema],
      required: true,
      validate: {
        validator: function (levels: IHierarchyLevel[]) {
          // Must have at least 1 level and at most 5 levels
          if (levels.length < 1 || levels.length > 5) return false;
          // Level numbers must be sequential starting from 1
          return levels.every(
            (level, index) => level.levelNumber === index + 1,
          );
        },
        message: "Levels must be sequential from 1 to 5",
      },
    },
    visibilitySettings: {
      type: VisibilitySettingsSchema,
      default: () => ({
        showInOnlineForm: [1, 2, 3, 4, 5],
        showInOfflineForm: [1, 2, 3, 4, 5],
        showInTicketDisplay: [1, 2, 3, 4, 5],
        showInFilters: [1, 2],
      }),
    },
    priorityFromLevel: {
      type: Number,
      default: 0, // 0 means manual priority selection, 1-5 means use priority from that level's category
      min: 0,
      max: 5,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

// Index for efficient queries
HierarchyConfigSchema.index({ projectId: 1, isActive: 1 });

/**
 * Static method to get or create default config for a project
 */
HierarchyConfigSchema.statics.getOrCreateForProject = async function (
  projectId: mongoose.Types.ObjectId | string,
  createdBy: mongoose.Types.ObjectId | string,
): Promise<IHierarchyConfig> {
  const config = await this.findOne({ projectId });
  if (config) return config;

  // Create default single-level config (backward compatible with current system)
  return this.create({
    projectId,
    levelCount: 1,
    levels: [
      {
        levelNumber: 1,
        displayName: "Category",
        isMandatory: true,
        isActive: true,
      },
    ],
    visibilitySettings: {
      showInOnlineForm: [1],
      showInOfflineForm: [1],
      showInTicketDisplay: [1],
      showInFilters: [1],
    },
    createdBy,
  });
};

/**
 * Instance method to get active levels only
 */
HierarchyConfigSchema.methods.getActiveLevels = function (): IHierarchyLevel[] {
  return this.levels.filter((level: IHierarchyLevel) => level.isActive);
};

/**
 * Instance method to validate level count matches levels array
 */
HierarchyConfigSchema.pre("save", function (next) {
  // Ensure levelCount matches the number of active levels
  const activeLevels = this.levels.filter((l) => l.isActive);
  this.levelCount = activeLevels.length;

  // Ensure Level 1 is always mandatory
  const level1 = this.levels.find((l) => l.levelNumber === 1);
  if (level1) {
    level1.isMandatory = true;
  }

  next();
});

export const HierarchyConfig = mongoose.model<IHierarchyConfig>(
  "HierarchyConfig",
  HierarchyConfigSchema,
);
