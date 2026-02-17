import mongoose, { Document, Schema } from 'mongoose';

/**
 * User Dashboard Configuration Model
 * 
 * Purpose: Store user-specific dashboard preferences
 * Allows users to customize their default dashboard view and settings
 * 
 * Key Features:
 * - Default view mode (self/team/hierarchy/all)
 * - Display preferences (aggregated counts, breakdown table)
 * - Hierarchy depth control
 * - Custom filters
 */

export interface IUserDashboardConfig extends Document {
  userId: mongoose.Types.ObjectId;                             // Owner of this config
  projectId?: mongoose.Types.ObjectId;                         // Project-specific config (null = global)
  defaultViewMode: 'self' | 'team' | 'hierarchy' | 'all';      // Default dashboard view
  showAggregatedCounts: boolean;                               // Show summary stats
  showIndividualBreakdown: boolean;                            // Show per-user breakdown table
  includeIndirectReportees: boolean;                           // Include skip-level reports in team view
  maxHierarchyDepth: number;                                   // Max levels to traverse (-1 = unlimited)
  customFilters?: {                                            // User-defined filters
    statuses?: string[];
    priorities?: string[];
    categories?: string[];
    dateRange?: {
      from?: Date;
      to?: Date;
    };
    [key: string]: any;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserDashboardConfigSchema = new Schema<IUserDashboardConfig>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    defaultViewMode: {
      type: String,
      enum: {
        values: ['self', 'team', 'hierarchy', 'all'],
        message: '{VALUE} is not a valid view mode',
      },
      default: 'self',
    },
    showAggregatedCounts: {
      type: Boolean,
      default: true,
    },
    showIndividualBreakdown: {
      type: Boolean,
      default: false,
    },
    includeIndirectReportees: {
      type: Boolean,
      default: false,
    },
    maxHierarchyDepth: {
      type: Number,
      default: -1, // -1 means unlimited
      min: [-1, 'Max hierarchy depth cannot be less than -1'],
      max: [10, 'Max hierarchy depth cannot exceed 10'],
    },
    customFilters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'userdashboardconfigs',
  }
);

// Indexes
UserDashboardConfigSchema.index(
  { userId: 1, projectId: 1 },
  { name: 'idx_user_project', unique: true }
);

UserDashboardConfigSchema.index({ userId: 1, isActive: 1 }, { name: 'idx_user_active' });

// Static method: Get config for user (with fallback to defaults)
UserDashboardConfigSchema.statics.getConfigForUser = async function (
  userId: mongoose.Types.ObjectId,
  projectId?: mongoose.Types.ObjectId
): Promise<IUserDashboardConfig> {
  // Try project-specific config first
  if (projectId) {
    const projectConfig = await this.findOne({
      userId,
      projectId,
      isActive: true,
    });
    if (projectConfig) return projectConfig;
  }

  // Fall back to global config
  const globalConfig = await this.findOne({
    userId,
    projectId: { $exists: false },
    isActive: true,
  });

  if (globalConfig) return globalConfig;

  // Return default config if none exists
  return {
    userId,
    defaultViewMode: 'self',
    showAggregatedCounts: true,
    showIndividualBreakdown: false,
    includeIndirectReportees: false,
    maxHierarchyDepth: -1,
    customFilters: {},
    isActive: true,
  } as IUserDashboardConfig;
};

// Static method: Create or update config
UserDashboardConfigSchema.statics.upsertConfig = async function (
  userId: mongoose.Types.ObjectId,
  config: Partial<IUserDashboardConfig>,
  projectId?: mongoose.Types.ObjectId
): Promise<IUserDashboardConfig> {
  const query: any = { userId };
  if (projectId) {
    query.projectId = projectId;
  } else {
    query.projectId = { $exists: false };
  }

  const updated = await this.findOneAndUpdate(
    query,
    {
      $set: {
        ...config,
        userId, // Ensure userId is not changed
        ...(projectId && { projectId }),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return updated;
};

// Instance method: Validate view mode against user permissions
UserDashboardConfigSchema.methods.validateViewMode = function (permissionCodes: string[]): boolean {
  const viewModePermissionMap: Record<string, string[]> = {
    self: ['DASHBOARD_VIEW_OWN'],
    team: ['DASHBOARD_VIEW_TEAM'],
    hierarchy: ['DASHBOARD_VIEW_HIERARCHY'],
    all: ['TICKET_VIEW_ALL'],
  };

  const requiredPermissions = viewModePermissionMap[this.defaultViewMode] || [];
  return requiredPermissions.some((perm) => permissionCodes.includes(perm));
};

// Instance method: Get effective max depth (considering user's hierarchy)
UserDashboardConfigSchema.methods.getEffectiveMaxDepth = function (): number {
  // -1 means unlimited, but cap at 10 for performance
  if (this.maxHierarchyDepth === -1) return 10;
  return Math.min(this.maxHierarchyDepth, 10);
};

export const UserDashboardConfig = mongoose.model<IUserDashboardConfig>(
  'UserDashboardConfig',
  UserDashboardConfigSchema
);
