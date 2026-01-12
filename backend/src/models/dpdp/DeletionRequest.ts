/**
 * DPDP Act 2023 Compliance: Data Deletion Request
 * 
 * Legal Requirement: Section 12 - Right to Erasure
 * Purpose: Track and manage user data deletion requests with SLA compliance
 */

import mongoose, { Document, Schema } from 'mongoose';

export enum DeletionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  RETAINED = 'RETAINED', // Legally required to retain (e.g., financial records)
}

export enum DeletionScope {
  FULL_ACCOUNT = 'FULL_ACCOUNT', // Complete erasure
  PARTIAL = 'PARTIAL', // Specific data categories only
  ANONYMIZE = 'ANONYMIZE', // Anonymize but retain statistical data
}

export interface IDeletionRequest extends Document {
  userId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId; // User who requested (can be self or admin)
  
  // Request details
  scope: DeletionScope;
  dataCategories: string[]; // For partial deletion
  reason?: string;
  
  // Status tracking
  status: DeletionStatus;
  requestedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  
  // SLA tracking
  slaDeadline: Date; // Must complete by this date
  isOverdue: boolean;
  
  // Processing details
  deletedCollections: string[]; // Which collections were processed
  retainedData: string[]; // What was retained and why
  deletionErrors: Array<{
    collection: string;
    error: string;
    timestamp: Date;
  }>;
  
  // Verification
  verificationToken?: string; // For user to verify deletion request
  verifiedAt?: Date;
  
  // Legal holds
  legalHoldReason?: string; // If deletion is blocked due to legal requirement
  legalHoldUntil?: Date;
  
  // Metadata
  projectId?: mongoose.Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const deletionRequestSchema = new Schema<IDeletionRequest>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  scope: {
    type: String,
    enum: Object.values(DeletionScope),
    required: true,
    default: DeletionScope.FULL_ACCOUNT,
  },
  dataCategories: [{
    type: String,
  }],
  reason: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: Object.values(DeletionStatus),
    required: true,
    default: DeletionStatus.PENDING,
    index: true,
  },
  requestedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  processedAt: {
    type: Date,
    index: true,
  },
  completedAt: {
    type: Date,
    index: true,
  },
  slaDeadline: {
    type: Date,
    required: true,
    index: true,
  },
  isOverdue: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedCollections: [{
    type: String,
  }],
  retainedData: [{
    type: String,
  }],
  deletionErrors: [{
    collection: String,
    error: String,
    timestamp: { type: Date, default: Date.now },
  }],
  verificationToken: {
    type: String,
    index: true,
  },
  verifiedAt: {
    type: Date,
  },
  legalHoldReason: {
    type: String,
  },
  legalHoldUntil: {
    type: Date,
    index: true,
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true,
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
}, {
  timestamps: true,
  collection: 'deletion_requests',
});

// Compound indexes
deletionRequestSchema.index({ userId: 1, status: 1 });
deletionRequestSchema.index({ status: 1, slaDeadline: 1 });
deletionRequestSchema.index({ isOverdue: 1, status: 1 });

// Pre-save hook to calculate SLA deadline
deletionRequestSchema.pre('save', function(next) {
  if (this.isNew && !this.slaDeadline) {
    // DPDP Act: Must respond within reasonable time (30 days default)
    const sla = parseInt(process.env.DELETION_SLA_DAYS || '30', 10);
    this.slaDeadline = new Date(Date.now() + sla * 24 * 60 * 60 * 1000);
  }
  
  // Check if overdue
  if (this.status !== DeletionStatus.COMPLETED && this.status !== DeletionStatus.CANCELLED) {
    this.isOverdue = new Date() > this.slaDeadline;
  }
  
  next();
});

// Static method to get pending requests
deletionRequestSchema.statics.getPendingRequests = async function() {
  return await this.find({
    status: { $in: [DeletionStatus.PENDING, DeletionStatus.IN_PROGRESS] },
  }).sort({ requestedAt: 1 });
};

// Static method to get overdue requests
deletionRequestSchema.statics.getOverdueRequests = async function() {
  return await this.find({
    isOverdue: true,
    status: { $in: [DeletionStatus.PENDING, DeletionStatus.IN_PROGRESS] },
  }).sort({ slaDeadline: 1 });
};

export default mongoose.model<IDeletionRequest>('DeletionRequest', deletionRequestSchema);
