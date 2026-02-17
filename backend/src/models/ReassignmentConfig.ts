import mongoose, { Schema, Document } from 'mongoose';

export interface IReassignmentConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  isEnabled: boolean;
  mode: 'sequential' | 'flexible';
  maxReassignments: number;
  requireReason: boolean;
  reasonCategories: string[];
  resetSlaOnReassignment: boolean;
  allowCrossProject: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReassignmentConfigSchema: Schema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true
    },
    isEnabled: {
      type: Boolean,
      default: true,
      required: true
    },
    mode: {
      type: String,
      enum: ['sequential', 'flexible'],
      default: 'sequential',
      required: true
    },
    maxReassignments: {
      type: Number,
      default: 5,
      min: 1,
      max: 20,
      required: true
    },
    requireReason: {
      type: Boolean,
      default: true,
      required: true
    },
    reasonCategories: {
      type: [String],
      default: [
        'Incorrect Assignment',
        'Lacks Required Skills',
        'Workload Overload',
        'Out of Scope',
        'Escalation Error',
        'Other'
      ]
    },
    resetSlaOnReassignment: {
      type: Boolean,
      default: false,
      required: true
    },
    allowCrossProject: {
      type: Boolean,
      default: false,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient lookup
ReassignmentConfigSchema.index({ projectId: 1 });

export default mongoose.model<IReassignmentConfig>('ReassignmentConfig', ReassignmentConfigSchema);
