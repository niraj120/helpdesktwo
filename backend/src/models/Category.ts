import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  code: string; // Unique code for the category (e.g., INQUIRY, COMPLAINT)
  description?: string;
  projectId: mongoose.Types.ObjectId;
  isActive: boolean;
  color?: string; // Optional color code for UI display
  icon?: string; // Optional icon for UI display
  order?: number; // Display order
  defaultPriority?: string; // Default priority code for this category
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
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
    defaultPriority: {
      type: String,
      trim: true,
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

// Compound index for unique category name per project
CategorySchema.index({ name: 1, projectId: 1 }, { unique: true });

// Compound index for unique category code per project
CategorySchema.index({ code: 1, projectId: 1 }, { unique: true });

// Index for efficient queries
CategorySchema.index({ projectId: 1, isActive: 1 });
CategorySchema.index({ projectId: 1, order: 1 });

export const Category = mongoose.model<ICategory>('Category', CategorySchema);
