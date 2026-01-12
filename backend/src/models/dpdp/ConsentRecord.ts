/**
 * DPDP Act 2023 Compliance: Consent Management
 * 
 * Legal Requirement: Section 6 - Consent must be free, specific, informed, unconditional, and unambiguous
 * Purpose: Track explicit user consent for personal data processing with versioning
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

export enum ConsentPurpose {
  ACCOUNT_CREATION = 'ACCOUNT_CREATION',
  TICKET_MANAGEMENT = 'TICKET_MANAGEMENT',
  COMMUNICATION = 'COMMUNICATION',
  ANALYTICS = 'ANALYTICS',
  PROFILE_MANAGEMENT = 'PROFILE_MANAGEMENT',
  OFFLINE_REGISTRATION = 'OFFLINE_REGISTRATION',
  HRMS_INTEGRATION = 'HRMS_INTEGRATION',
  PARENT_COMMUNICATION = 'PARENT_COMMUNICATION',
  FEEDBACK_COLLECTION = 'FEEDBACK_COLLECTION',
  KNOWLEDGE_BASE_ACCESS = 'KNOWLEDGE_BASE_ACCESS',
  ASSET_MANAGEMENT = 'ASSET_MANAGEMENT',
  PROJECT_COLLABORATION = 'PROJECT_COLLABORATION',
}

export enum ConsentStatus {
  ACTIVE = 'ACTIVE',
  WITHDRAWN = 'WITHDRAWN',
  EXPIRED = 'EXPIRED',
}

export interface IConsentRecord extends Document {
  userId: mongoose.Types.ObjectId;
  purpose: ConsentPurpose;
  policyVersion: string; // Version of privacy policy at time of consent
  consentedAt: Date;
  withdrawnAt?: Date;
  status: ConsentStatus;
  expiresAt?: Date; // Optional expiry for time-bound consent
  ipAddress?: string; // IP when consent was given (for audit)
  userAgent?: string; // Browser/device info (for audit)
  consentText: string; // Actual text user agreed to (immutable proof)
  
  // Granular consent options
  dataCategories: string[]; // Which data categories user consented to
  sharingAllowed: boolean; // Allow third-party data sharing
  marketingAllowed: boolean; // Allow marketing communications
  
  // Metadata
  projectId?: mongoose.Types.ObjectId; // Project context
  createdAt: Date;
  updatedAt: Date;
  
  // Instance method
  withdraw(): Promise<void>;
}

// Model interface with static methods
export interface IConsentRecordModel extends Model<IConsentRecord> {
  hasActiveConsent(userId: mongoose.Types.ObjectId, purpose: ConsentPurpose): Promise<boolean>;
  getActiveConsent(userId: mongoose.Types.ObjectId, purpose: ConsentPurpose): Promise<IConsentRecord | null>;
}

const consentRecordSchema = new Schema<IConsentRecord>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  purpose: {
    type: String,
    enum: Object.values(ConsentPurpose),
    required: true,
    index: true,
  },
  policyVersion: {
    type: String,
    required: true,
    index: true,
  },
  consentedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  withdrawnAt: {
    type: Date,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(ConsentStatus),
    required: true,
    default: ConsentStatus.ACTIVE,
    index: true,
  },
  expiresAt: {
    type: Date,
    index: true,
  },
  ipAddress: {
    type: String,
    trim: true,
  },
  userAgent: {
    type: String,
    trim: true,
  },
  consentText: {
    type: String,
    required: true,
    immutable: true, // Cannot be changed once recorded
  },
  dataCategories: [{
    type: String,
    enum: [
      'basic_profile', // name, email
      'contact_info', // phone, mobile, address
      'identification', // uniqueId, employee code
      'educational', // student-specific data
      'employment', // HRMS data
      'communication_history', // tickets, emails
      'usage_data', // activity logs
      'parent_guardian', // parent contact info
      'location', // center assignments, IP address
    ],
  }],
  sharingAllowed: {
    type: Boolean,
    required: true,
    default: false,
  },
  marketingAllowed: {
    type: Boolean,
    required: true,
    default: false,
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true,
  },
}, {
  timestamps: true,
  collection: 'consent_records',
});

// Compound indexes for efficient queries
consentRecordSchema.index({ userId: 1, purpose: 1, status: 1 });
consentRecordSchema.index({ userId: 1, status: 1, expiresAt: 1 });
consentRecordSchema.index({ status: 1, expiresAt: 1 }); // For batch expiry checks

// Static method to check active consent
consentRecordSchema.statics.hasActiveConsent = async function(
  userId: mongoose.Types.ObjectId,
  purpose: ConsentPurpose
): Promise<boolean> {
  const now = new Date();
  const consent = await this.findOne({
    userId,
    purpose,
    status: ConsentStatus.ACTIVE,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: now } },
    ],
  });
  
  return !!consent;
};

// Static method to get active consent record
consentRecordSchema.statics.getActiveConsent = async function(
  userId: mongoose.Types.ObjectId,
  purpose: ConsentPurpose
): Promise<IConsentRecord | null> {
  const now = new Date();
  return await this.findOne({
    userId,
    purpose,
    status: ConsentStatus.ACTIVE,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: now } },
    ],
  }).sort({ consentedAt: -1 });
};

// Instance method to withdraw consent
consentRecordSchema.methods.withdraw = async function(): Promise<void> {
  this.status = ConsentStatus.WITHDRAWN;
  this.withdrawnAt = new Date();
  await this.save();
};

// Middleware to auto-expire consents
consentRecordSchema.pre('find', function() {
  const now = new Date();
  this.updateMany(
    {
      status: ConsentStatus.ACTIVE,
      expiresAt: { $exists: true, $lt: now },
    },
    {
      $set: { status: ConsentStatus.EXPIRED },
    }
  );
});

export default mongoose.model<IConsentRecord, IConsentRecordModel>('ConsentRecord', consentRecordSchema);
