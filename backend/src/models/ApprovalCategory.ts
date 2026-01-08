import { Schema, Document, model } from 'mongoose';

export interface IApprovalCategory extends Document {
  key: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalCategorySchema = new Schema<IApprovalCategory>(
  {
    key: { type: String, required: true, uppercase: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

ApprovalCategorySchema.index({ sortOrder: 1, name: 1 });

export const ApprovalCategory = model<IApprovalCategory>('ApprovalCategory', ApprovalCategorySchema);
