import mongoose, { Document, Schema } from "mongoose";

/**
 * Escalation Level Interface
 * Each level defines a step in the escalation hierarchy
 * The level_number is the ONLY field that controls escalation order
 */
export type SlaUnit = "mins" | "hrs" | "days";

export interface IEscalationLevel {
  _id?: mongoose.Types.ObjectId;
  levelNumber: number; // Defines escalation order (1, 2, 3, ...)
  levelName: string; // Display label only (e.g., "Level 1 Support", "Manager Review")
  roleId: mongoose.Types.ObjectId; // Role responsible at this level
  slaHours: number; // SLA duration for this level (always stored as hours internally)
  slaUnit?: SlaUnit; // Display unit for UI (mins, hrs, days) - default 'hrs'
  levelType?: "reassign" | "notify"; // US-ESC-005: 'reassign' reassigns ticket; 'notify' only notifies  /** US-ESC-006: specific users to notify in addition to role (used when levelType='notify') */
  notifyUserIds?: mongoose.Types.ObjectId[];
  /** US-ESC-007: whether to trigger on a fixed duration or a % of overall ticket SLA consumed */
  slaThresholdType?: "fixed" | "percent";
  /** US-ESC-007: percentage threshold (1-100), used when slaThresholdType='percent' */
  slaThresholdPercent?: number;
  responseTime?: {
    value: number;
    unit: "minutes" | "hours" | "days";
  }; // Optional response time for this level
  isActive: boolean;
}

/**
 * Priority-specific Configuration Interface
 * Used when priorityMode is 'PER_PRIORITY'
 */
export interface IPriorityConfig {
  priorityCode: string; // Priority code (e.g., 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
  levels: IEscalationLevel[]; // Escalation levels specific to this priority
}

/**
 * Escalation Matrix Interface
 * A configurable matrix that controls how tickets escalate between levels
 */
export interface IEscalationMatrix extends Document {
  name: string;
  description?: string;
  escalationMode: "SEQUENTIAL" | "RANDOM";
  priorityMode: "SAME_FOR_ALL" | "PER_PRIORITY"; // NEW: Controls if matrix is same for all priorities or different
  allowSkipLevel: boolean; // Only applicable for RANDOM mode
  allowBackward: boolean; // Allows backward escalation
  autoEscalate: boolean; // Auto-escalate on SLA breach
  /** US-ESC-013: skip grace period check and always auto-escalate regardless of recent ticket activity */
  bypassGracePeriod?: boolean;
  levels: IEscalationLevel[]; // Used when priorityMode is 'SAME_FOR_ALL'
  priorityConfigs: IPriorityConfig[]; // Used when priorityMode is 'PER_PRIORITY'
  projectIds: mongoose.Types.ObjectId[]; // Projects this matrix applies to
  applicablePriorities: string[]; // Priority codes this matrix applies to
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  getLevelsForPriority(priorityCode: string): IEscalationLevel[];
  getLevelByNumber(
    levelNumber: number,
    priorityCode?: string,
  ): IEscalationLevel | undefined;
  getNextLevel(
    currentLevelNumber: number,
    priorityCode?: string,
  ): IEscalationLevel | undefined;
  isTransitionAllowed(
    currentLevelNumber: number,
    targetLevelNumber: number,
    priorityCode?: string,
  ): { allowed: boolean; reason?: string };
}

/**
 * Escalation Level Schema
 * Embedded within EscalationMatrix
 */
const EscalationLevelSchema = new Schema<IEscalationLevel>(
  {
    levelNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    levelName: {
      type: String,
      required: true,
      trim: true,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    slaHours: {
      type: Number,
      required: true,
      min: 0,
      default: 24,
    },
    slaUnit: {
      type: String,
      enum: ["mins", "hrs", "days"],
      default: "hrs",
    },
    // US-ESC-005: 'reassign' reassigns + notifies; 'notify' only notifies without changing assignee
    levelType: {
      type: String,
      enum: ["reassign", "notify"],
      default: "reassign",
    }, // US-ESC-006: specific named users to also notify (used when levelType='notify')
    notifyUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    // US-ESC-007: threshold type — 'fixed' (slaHours) or 'percent' of ticket SLA consumed
    slaThresholdType: {
      type: String,
      enum: ["fixed", "percent"],
      default: "fixed",
    },
    slaThresholdPercent: {
      type: Number,
      min: 1,
      max: 100,
    },
    responseTime: {
      value: {
        type: Number,
        min: 0,
      },
      unit: {
        type: String,
        enum: ["minutes", "hours", "days"],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true },
);

/**
 * Priority Config Schema
 * Embedded within EscalationMatrix when priorityMode is 'PER_PRIORITY'
 */
const PriorityConfigSchema = new Schema<IPriorityConfig>(
  {
    priorityCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    levels: {
      type: [EscalationLevelSchema],
      default: [],
    },
  },
  { _id: false },
);

/**
 * Escalation Matrix Schema
 *
 * Core Rules (from requirements):
 * 1. Escal ation must be based on levelNumber, NOT role names
 * 2. Role names must never be hardcoded
 * 3. Backend validation is mandatory
 * 4. UI restrictions alone are not sufficient
 * 5. System must function even if roles differ across portals
 * 6. NEW: Support per-priority escalation configurations
 */
const EscalationMatrixSchema = new Schema<IEscalationMatrix>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    escalationMode: {
      type: String,
      required: true,
      enum: ["SEQUENTIAL", "RANDOM"],
      default: "SEQUENTIAL",
      index: true,
    },
    priorityMode: {
      type: String,
      required: true,
      enum: ["SAME_FOR_ALL", "PER_PRIORITY"],
      default: "SAME_FOR_ALL",
      index: true,
    },
    allowSkipLevel: {
      type: Boolean,
      default: false,
      // Only applicable when escalationMode is 'RANDOM'
    },
    allowBackward: {
      type: Boolean,
      default: false,
    },
    autoEscalate: {
      type: Boolean,
      default: false,
      // When true, tickets auto-escalate to next level on SLA breach
    },
    // US-ESC-013: skip recent-activity grace period for this matrix (useful for critical priority matrices)
    bypassGracePeriod: {
      type: Boolean,
      default: false,
    },
    levels: {
      type: [EscalationLevelSchema],
      default: [],
      validate: {
        validator: function (levels: IEscalationLevel[]) {
          // Validate unique level numbers within a matrix
          const levelNumbers = levels.map((l) => l.levelNumber);
          return new Set(levelNumbers).size === levelNumbers.length;
        },
        message: "Level numbers must be unique within a matrix",
      },
    },
    priorityConfigs: {
      type: [PriorityConfigSchema],
      default: [],
      validate: {
        validator: function (configs: IPriorityConfig[]) {
          // Validate unique priority codes
          const priorityCodes = configs.map((c) => c.priorityCode);
          return new Set(priorityCodes).size === priorityCodes.length;
        },
        message: "Priority codes must be unique within a matrix",
      },
    },
    projectIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Project",
      },
    ],
    // Applicable priorities - which priority codes this matrix applies to
    // When priorityMode is 'SAME_FOR_ALL', these are the priorities that share the same levels
    // When priorityMode is 'PER_PRIORITY', this is derived from priorityConfigs
    applicablePriorities: [
      {
        type: String,
        trim: true,
        uppercase: true,
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

// Compound indexes for efficient queries
EscalationMatrixSchema.index({ projectIds: 1, isActive: 1 });
EscalationMatrixSchema.index({ name: 1, projectIds: 1 });

// Pre-save hook to sort levels by levelNumber
EscalationMatrixSchema.pre("save", function (next) {
  // Sort levels in SAME_FOR_ALL mode
  if (
    this.priorityMode === "SAME_FOR_ALL" &&
    this.levels &&
    this.levels.length > 0
  ) {
    this.levels.sort((a, b) => a.levelNumber - b.levelNumber);
  }

  // Sort levels in each priority config in PER_PRIORITY mode
  if (
    this.priorityMode === "PER_PRIORITY" &&
    this.priorityConfigs &&
    this.priorityConfigs.length > 0
  ) {
    this.priorityConfigs.forEach((config) => {
      if (config.levels && config.levels.length > 0) {
        config.levels.sort((a, b) => a.levelNumber - b.levelNumber);
      }
    });
  }

  // Reset RANDOM mode-only settings if mode is SEQUENTIAL
  // Note: allowBackward applies to BOTH modes, so don't reset it here
  if (this.escalationMode === "SEQUENTIAL") {
    this.allowSkipLevel = false; // Only skip level is RANDOM-mode specific
  }

  next();
});

// Instance method to get levels for a specific priority
EscalationMatrixSchema.methods.getLevelsForPriority = function (
  priorityCode: string,
): IEscalationLevel[] {
  if (this.priorityMode === "SAME_FOR_ALL") {
    return this.levels || [];
  } else {
    const config = this.priorityConfigs.find(
      (c: IPriorityConfig) => c.priorityCode === priorityCode.toUpperCase(),
    );
    return config ? config.levels : [];
  }
};

// Virtual for getting ordered levels
EscalationMatrixSchema.virtual("orderedLevels").get(function () {
  if (this.priorityMode === "SAME_FOR_ALL") {
    return [...(this.levels || [])].sort(
      (a, b) => a.levelNumber - b.levelNumber,
    );
  } else {
    // For PER_PRIORITY mode, return levels from first priority config (UI should handle per-priority display)
    return this.priorityConfigs && this.priorityConfigs.length > 0
      ? [...(this.priorityConfigs[0].levels || [])].sort(
          (a, b) => a.levelNumber - b.levelNumber,
        )
      : [];
  }
});

// Instance method to get level by number for a specific priority
EscalationMatrixSchema.methods.getLevelByNumber = function (
  levelNumber: number,
  priorityCode?: string,
): IEscalationLevel | undefined {
  const levels = priorityCode
    ? this.getLevelsForPriority(priorityCode)
    : this.levels || [];
  return levels.find(
    (level: IEscalationLevel) => level.levelNumber === levelNumber,
  );
};

// Instance method to get next level for a specific priority
EscalationMatrixSchema.methods.getNextLevel = function (
  currentLevelNumber: number,
  priorityCode?: string,
): IEscalationLevel | undefined {
  const levels = priorityCode
    ? this.getLevelsForPriority(priorityCode)
    : this.levels || [];
  const sortedLevels = [...levels].sort(
    (a, b) => a.levelNumber - b.levelNumber,
  );
  return sortedLevels.find(
    (level: IEscalationLevel) =>
      level.levelNumber > currentLevelNumber && level.isActive,
  );
};

// Instance method to check if level transition is allowed
EscalationMatrixSchema.methods.isTransitionAllowed = function (
  currentLevelNumber: number,
  targetLevelNumber: number,
  priorityCode?: string,
): { allowed: boolean; reason?: string } {
  const levels = priorityCode
    ? this.getLevelsForPriority(priorityCode)
    : this.levels || [];

  // Find the target level
  const targetLevel = levels.find(
    (l: IEscalationLevel) => l.levelNumber === targetLevelNumber,
  );
  if (!targetLevel) {
    return { allowed: false, reason: "Target level does not exist" };
  }

  if (!targetLevel.isActive) {
    return { allowed: false, reason: "Target level is not active" };
  }

  if (this.escalationMode === "SEQUENTIAL") {
    // SEQUENTIAL mode: Only allow immediate next level
    const sortedLevels = [...levels]
      .filter((l: IEscalationLevel) => l.isActive)
      .sort((a, b) => a.levelNumber - b.levelNumber);

    const currentIndex = sortedLevels.findIndex(
      (l: IEscalationLevel) => l.levelNumber === currentLevelNumber,
    );
    const targetIndex = sortedLevels.findIndex(
      (l: IEscalationLevel) => l.levelNumber === targetLevelNumber,
    );

    if (currentIndex === -1) {
      // Current level not found - allow escalation to first level
      return targetIndex === 0
        ? { allowed: true }
        : {
            allowed: false,
            reason: "Must start at the first escalation level",
          };
    }

    if (targetIndex !== currentIndex + 1) {
      return {
        allowed: false,
        reason:
          "Sequential mode only allows escalation to the immediate next level",
      };
    }

    return { allowed: true };
  }

  // RANDOM mode
  if (targetLevelNumber > currentLevelNumber) {
    // Forward escalation
    if (!this.allowSkipLevel && targetLevelNumber > currentLevelNumber + 1) {
      return {
        allowed: false,
        reason: "Skip level is not allowed in this matrix",
      };
    }
    return { allowed: true };
  }

  if (targetLevelNumber < currentLevelNumber) {
    // Backward escalation
    if (!this.allowBackward) {
      return {
        allowed: false,
        reason: "Backward escalation is not allowed in this matrix",
      };
    }
    return { allowed: true };
  }

  // Same level
  return { allowed: false, reason: "Cannot escalate to the same level" };
};

export const EscalationMatrix = mongoose.model<IEscalationMatrix>(
  "EscalationMatrix",
  EscalationMatrixSchema,
  "escalationmatrixes",
);
export default EscalationMatrix;
