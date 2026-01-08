import mongoose, { Schema, Document } from 'mongoose';

export interface IKBCategory extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const KBCategorySchema = new Schema<IKBCategory>({
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
  icon: {
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
KBCategorySchema.index({ projectId: 1, isActive: 1 });
KBCategorySchema.index({ projectId: 1, name: 1 }, { unique: true });

export const KBCategory = mongoose.model<IKBCategory>('KBCategory', KBCategorySchema);
