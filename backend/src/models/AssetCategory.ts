import mongoose, { Document, Schema } from 'mongoose';

export interface IAssetCategory extends Document {
  name: string;
  code: string; // Unique code for the asset category (e.g., FURNITURE, ELECTRONICS)
  description?: string;
  projectId: mongoose.Types.ObjectId;
  isActive: boolean;
  color?: string; // Optional color code for UI display
  icon?: string; // Optional icon for UI display
  order?: number; // Display order
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AssetCategorySchema = new Schema<IAssetCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    color: {
      type: String,
      trim: true,
    },
    icon: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique asset category name per project
AssetCategorySchema.index({ name: 1, projectId: 1 }, { unique: true });

// Compound index for unique asset category code per project
AssetCategorySchema.index({ code: 1, projectId: 1 }, { unique: true });

// Index for efficient queries
AssetCategorySchema.index({ projectId: 1, isActive: 1 });
AssetCategorySchema.index({ projectId: 1, order: 1 });

export const AssetCategory = mongoose.model<IAssetCategory>('AssetCategory', AssetCategorySchema);
