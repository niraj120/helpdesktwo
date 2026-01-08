import mongoose, { Document, Schema } from 'mongoose';

export interface IFormAuditLog extends Document {
  formId: mongoose.Types.ObjectId;
  action: string;
  performedBy: mongoose.Types.ObjectId;
  timestamp: Date;
  details?: Record<string, any>;
}

const formAuditLogSchema = new Schema<IFormAuditLog>({
  formId: { type: Schema.Types.ObjectId, ref: 'Form', required: true },
  action: { type: String, required: true },
  performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, default: Date.now },
  details: { type: Schema.Types.Mixed }
});

export default mongoose.model<IFormAuditLog>('FormAuditLog', formAuditLogSchema);
