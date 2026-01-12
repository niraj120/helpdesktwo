import mongoose, { Document, Schema } from 'mongoose';

export interface IAssetAuditLog extends Document {
  centerAssetMappingId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  centerId: mongoose.Types.ObjectId;
  assetId: mongoose.Types.ObjectId;
  changeType: 'working_asset' | 'not_working_asset' | 'both';
  previousValues: {
    workingAsset: number;
    notWorkingAsset: number;
  };
  newValues: {
    workingAsset: number;
    notWorkingAsset: number;
  };
  changedAt: Date;
  remarks?: string;
}

const AssetAuditLogSchema = new Schema<IAssetAuditLog>(
  {
    centerAssetMappingId: {
      type: Schema.Types.ObjectId,
      ref: 'CenterAssetMapping',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    centerId: {
      type: Schema.Types.ObjectId,
      ref: 'Center',
      required: true,
      index: true,
    },
    assetId: {
      type: Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
      index: true,
    },
    changeType: {
      type: String,
      enum: ['working_asset', 'not_working_asset', 'both'],
      required: true,
    },
    previousValues: {
      workingAsset: { type: Number, required: true, default: 0 },
      notWorkingAsset: { type: Number, required: true, default: 0 },
    },
    newValues: {
      workingAsset: { type: Number, required: true, default: 0 },
      notWorkingAsset: { type: Number, required: true, default: 0 },
    },
    changedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'assetauditlogs',
  }
);

// Index for efficient querying of audit logs by mapping
AssetAuditLogSchema.index({ centerAssetMappingId: 1, changedAt: -1 });
AssetAuditLogSchema.index({ centerId: 1, changedAt: -1 });
AssetAuditLogSchema.index({ assetId: 1, changedAt: -1 });

export const AssetAuditLog = mongoose.model<IAssetAuditLog>('AssetAuditLog', AssetAuditLogSchema);
