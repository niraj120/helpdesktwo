import mongoose, { Schema, Document } from 'mongoose';

export interface IKBSubcategory extends Document {
  projectId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const KBSubcategorySchema = new Schema<IKBSubcategory>({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'KBCategory',
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
  displayOrder: {
    type: Number,
    default: 0
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
}, {
  timestamps: true
});

// Indexes
KBSubcategorySchema.index({ projectId: 1, categoryId: 1, isActive: 1 });
KBSubcategorySchema.index({ categoryId: 1, name: 1 }, { unique: true });

export const KBSubcategory = mongoose.model<IKBSubcategory>('KBSubcategory', KBSubcategorySchema);
