import mongoose, { Schema, Document } from 'mongoose';

export interface IAssetPhoto {
  filename: string;
  path: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
}

export interface ICenterAssetMapping extends Document {
  projectId: mongoose.Types.ObjectId;
  centerId: mongoose.Types.ObjectId;
  assetId: mongoose.Types.ObjectId;
  totalAssigned: number;
  assetUsed: number;
  assetNotUsed: number;
  workingAsset: number;
  notWorkingAsset: number; // Auto-calculated: assetUsed - workingAsset
  remark?: string; // User remark/notes for the asset
  photos: IAssetPhoto[];
  lastUpdatedBy: mongoose.Types.ObjectId;
  // Audit tracking fields
  lastAuditDate?: Date; // Admin-configured START date of the current audit cycle
  auditEndDate?: Date; // Admin-configured LAST submission date (deadline) for the current cycle
  nextAuditDate?: Date; // When the next cycle starts (= start + frequency)
  auditFrequencyMonths?: number; // Frequency in months
  auditSubmitted?: boolean; // Whether current audit cycle is submitted
  lastAuditSubmittedAt?: Date; // When user last clicked Submit Audit
  lastAuditSubmittedBy?: mongoose.Types.ObjectId; // Who submitted the audit
  auditAutoArchivedAt?: Date; // Set when an unsubmitted audit was auto-frozen to history at its deadline
  createdAt: Date;
  updatedAt: Date;
}

const AssetPhotoSchema = new Schema<IAssetPhoto>(
  {
    filename: {
      type: String,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const CenterAssetMappingSchema = new Schema<ICenterAssetMapping>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true
    },
    centerId: {
      type: Schema.Types.ObjectId,
      ref: 'Center',
      required: false // Optional for backward compatibility
    },
    assetId: {
      type: Schema.Types.ObjectId,
      ref: 'Asset',
      required: true
    },
    totalAssigned: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    assetUsed: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    assetNotUsed: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    workingAsset: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    notWorkingAsset: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    remark: {
      type: String,
      required: false,
      default: '',
      maxlength: 5000 // Allow up to 5000 characters
    },
    photos: [AssetPhotoSchema],
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Audit tracking fields
    lastAuditDate: {
      type: Date,
      required: false
    },
    auditEndDate: {
      type: Date,
      required: false
    },
    nextAuditDate: {
      type: Date,
      required: false
    },
    auditFrequencyMonths: {
      type: Number,
      required: false,
      min: 1
    },
    auditSubmitted: {
      type: Boolean,
      default: false
    },
    lastAuditSubmittedAt: {
      type: Date,
      required: false
    },
    lastAuditSubmittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    auditAutoArchivedAt: {
      type: Date,
      required: false
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index - one asset per project
CenterAssetMappingSchema.index({ projectId: 1, assetId: 1 }, { unique: true });
CenterAssetMappingSchema.index({ projectId: 1 });
CenterAssetMappingSchema.index({ assetId: 1 });
CenterAssetMappingSchema.index({ updatedAt: -1 });

// Pre-save hook to calculate notWorkingAsset
CenterAssetMappingSchema.pre('save', function (next) {
  // Calculate notWorkingAsset = totalAssigned - workingAsset
  if (this.isModified('totalAssigned') || this.isModified('workingAsset')) {
    this.notWorkingAsset = Math.max(0, this.totalAssigned - this.workingAsset);
  }
  next();
});

export const CenterAssetMapping = mongoose.model<ICenterAssetMapping>(
  'CenterAssetMapping',
  CenterAssetMappingSchema
);
