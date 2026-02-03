/**
 * Job Queue Model
 * ================
 * MongoDB-based job queue for background task processing.
 * No Redis required - uses MongoDB for persistence.
 */

import mongoose, { Schema, Document } from 'mongoose';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

export interface IJob extends Document {
  /** Unique job identifier */
  jobId: string;
  /** Job type/queue name */
  type: string;
  /** Job payload data */
  data: Record<string, any>;
  /** Current status */
  status: JobStatus;
  /** Priority level */
  priority: JobPriority;
  /** Number of attempts made */
  attempts: number;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Delay before first execution (ms) */
  delay: number;
  /** Result data on completion */
  result?: Record<string, any>;
  /** Error message on failure */
  error?: string;
  /** Error stack trace */
  errorStack?: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Worker ID processing this job */
  workerId?: string;
  /** When the job should run */
  scheduledFor: Date;
  /** When processing started */
  startedAt?: Date;
  /** When processing completed */
  completedAt?: Date;
  /** Related entity ID (for querying) */
  entityId?: string;
  /** Related entity type */
  entityType?: string;
  /** User who created the job */
  createdBy?: mongoose.Types.ObjectId;
  /** Project context */
  projectId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'retry'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'normal', 'low'],
      default: 'normal',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    delay: {
      type: Number,
      default: 0,
    },
    result: {
      type: Schema.Types.Mixed,
    },
    error: {
      type: String,
    },
    errorStack: {
      type: String,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    workerId: {
      type: String,
    },
    scheduledFor: {
      type: Date,
      default: Date.now,
      index: true,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    entityId: {
      type: String,
      index: true,
    },
    entityType: {
      type: String,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
JobSchema.index({ status: 1, scheduledFor: 1, priority: 1 });
JobSchema.index({ type: 1, status: 1 });
JobSchema.index({ entityId: 1, entityType: 1 });
JobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 }); // Auto-delete after 7 days

// Priority weight for sorting
JobSchema.virtual('priorityWeight').get(function() {
  const weights: Record<JobPriority, number> = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  };
  return weights[this.priority] || 2;
});

export const Job = mongoose.model<IJob>('Job', JobSchema);
export default Job;
