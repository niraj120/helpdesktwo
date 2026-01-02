import mongoose, { Schema, Document } from 'mongoose';

export interface IAsset extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  category?: mongoose.Types.ObjectId | string; // Reference to AssetCategory or legacy string
  predefinedCount: number;
  unit?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema = new Schema<IAsset>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'AssetCategory',
      required: false
    },
    predefinedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    unit: {
      type: String,
      default: 'units',
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
AssetSchema.index({ projectId: 1, name: 1 }, { unique: true }); // Unique asset name per project
AssetSchema.index({ projectId: 1, isActive: 1 });
AssetSchema.index({ createdAt: -1 });

export const Asset = mongoose.model<IAsset>('Asset', AssetSchema);
