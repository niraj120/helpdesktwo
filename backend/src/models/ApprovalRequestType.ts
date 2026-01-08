import { Schema, Document, model, Types } from 'mongoose';

export interface IApprovalRequestType extends Document {
  key: string;
  name: string;
  categoryId?: Types.ObjectId;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalRequestTypeSchema = new Schema<IApprovalRequestType>(
  {
    key: { type: String, required: true, uppercase: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ApprovalCategory' },
    description: { type: String },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

ApprovalRequestTypeSchema.index({ categoryId: 1, sortOrder: 1, name: 1 });

export const ApprovalRequestType = model<IApprovalRequestType>('ApprovalRequestType', ApprovalRequestTypeSchema);
