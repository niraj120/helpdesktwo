/**
 * DPDP Act 2023 Compliance: Data Access Audit Log
 * 
 * Legal Requirement: Section 8(6) - Maintain records of data processing activities
 * Purpose: Immutable audit trail for all personal data access
 */

import mongoose, { Document, Schema } from 'mongoose';

export enum DataAccessAction {
  READ = 'READ',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  EXPORT = 'EXPORT',
  SHARE = 'SHARE',
}

export enum DataAccessResult {
  SUCCESS = 'SUCCESS',
  DENIED = 'DENIED',
  NO_CONSENT = 'NO_CONSENT',
  INVALID_PURPOSE = 'INVALID_PURPOSE',
  ERROR = 'ERROR',
}

export interface IDataAccessLog extends Document {
  // Who
  accessorUserId: mongoose.Types.ObjectId; // Who accessed the data
  accessorRole: string; // Role at time of access
  accessorIP: string;
  
  // What
  targetUserId: mongoose.Types.ObjectId; // Whose data was accessed
  dataCategory: string; // Type of data accessed
  fields: string[]; // Specific fields accessed
  
  // When & Where
  accessedAt: Date;
  endpoint: string; // API endpoint called
  method: string; // HTTP method
  
  // Why
  purpose: string; // Business purpose for access
  consentId?: mongoose.Types.ObjectId; // Reference to consent record
  
  // How it went
  action: DataAccessAction;
  result: DataAccessResult;
  reason?: string; // Denial reason if applicable
  
  // Context
  projectId?: mongoose.Types.ObjectId;
  ticketId?: mongoose.Types.ObjectId; // If access was for ticket processing
  
  // Metadata
  userAgent?: string;
  sessionId?: string;
  
  createdAt: Date;
}

const dataAccessLogSchema = new Schema<IDataAccessLog>({
  accessorUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    immutable: true,
  },
  accessorRole: {
    type: String,
    required: true,
    immutable: true,
  },
  accessorIP: {
    type: String,
    required: true,
    immutable: true,
  },
  targetUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
    immutable: true,
  },
  dataCategory: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  fields: [{
    type: String,
    immutable: true,
  }],
  accessedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
    immutable: true,
  },
  endpoint: {
    type: String,
    required: true,
    immutable: true,
  },
  method: {
    type: String,
    required: true,
    immutable: true,
  },
  purpose: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  consentId: {
    type: Schema.Types.ObjectId,
    ref: 'ConsentRecord',
    index: true,
    immutable: true,
  },
  action: {
    type: String,
    enum: Object.values(DataAccessAction),
    required: true,
    immutable: true,
    index: true,
  },
  result: {
    type: String,
    enum: Object.values(DataAccessResult),
    required: true,
    immutable: true,
    index: true,
  },
  reason: {
    type: String,
    immutable: true,
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true,
    immutable: true,
  },
  ticketId: {
    type: Schema.Types.ObjectId,
    ref: 'Ticket',
    index: true,
    immutable: true,
  },
  userAgent: {
    type: String,
    immutable: true,
  },
  sessionId: {
    type: String,
    index: true,
    immutable: true,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Only track creation
  collection: 'data_access_logs',
});

// Compound indexes for efficient queries
dataAccessLogSchema.index({ targetUserId: 1, accessedAt: -1 });
dataAccessLogSchema.index({ accessorUserId: 1, accessedAt: -1 });
dataAccessLogSchema.index({ result: 1, accessedAt: -1 }); // For breach detection
dataAccessLogSchema.index({ projectId: 1, accessedAt: -1 });

// TTL index - retain logs for 7 years (DPDP Act requirement)
dataAccessLogSchema.index({ accessedAt: 1 }, { expireAfterSeconds: 220752000 }); // 7 years

// Prevent any updates or deletions
dataAccessLogSchema.pre('save', function(next) {
  if (!this.isNew) {
    throw new Error('Audit logs are immutable and cannot be modified');
  }
  next();
});

dataAccessLogSchema.pre('findOneAndUpdate', function() {
  throw new Error('Audit logs are immutable and cannot be modified');
});

dataAccessLogSchema.pre('updateOne', function() {
  throw new Error('Audit logs are immutable and cannot be modified');
});

dataAccessLogSchema.pre('deleteOne', function() {
  throw new Error('Audit logs cannot be deleted before retention period');
});

export default mongoose.model<IDataAccessLog>('DataAccessLog', dataAccessLogSchema);
