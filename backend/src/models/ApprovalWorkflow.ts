import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IApprovalLevel {
  level: number;
  approvers: Types.ObjectId[]; // user ids
  roles?: Types.ObjectId[]; // role ids for role-driven approvals
  criteria?: Record<string, any>; // optional JSON criteria for auto-approval
}

export interface IApprovalWorkflow extends Document {
  name: string;
  projectId: Types.ObjectId;
  description?: string;
  categoryId?: Types.ObjectId;
  requestTypeId?: Types.ObjectId;
  requestTypeKey?: string;
  requestTypes: string[]; // e.g. ['ticket.create','category.create','user.delete']
  approvalLogic: 'sequential' | 'parallel';
  levels: IApprovalLevel[];
  autoApprove?: boolean;
  status: 'active' | 'inactive';
  isActive: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalLevelSchema = new Schema({
  level: { type: Number, required: true },
  approvers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  roles: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  criteria: { type: Schema.Types.Mixed },
});

const ApprovalWorkflowSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    description: { type: String },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Permission', index: true },
    requestTypeId: { type: Schema.Types.ObjectId, ref: 'Permission', index: true },
    requestTypeKey: { type: String, index: true },
    requestTypes: [{ type: String }],
    approvalLogic: { type: String, enum: ['sequential', 'parallel'], default: 'sequential' },
    levels: [ApprovalLevelSchema],
    autoApprove: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const ApprovalWorkflow = mongoose.model<IApprovalWorkflow>('ApprovalWorkflow', ApprovalWorkflowSchema);
