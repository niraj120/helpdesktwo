import mongoose, { Schema, Document } from 'mongoose';

export interface ISMSLog extends Document {
    projectId: mongoose.Types.ObjectId;
    recipient: string;
    message: string;
    triggerType: string; // 'otp', 'ticket', 'auth', etc.
    status: 'sent' | 'failed' | 'blocked';
    responseId?: string; // Gupshup response ID
    error?: string;
    metadata?: any;
    createdAt: Date;
}

const smsLogSchema = new Schema(
    {
        projectId: {
            type: Schema.Types.ObjectId,
            ref: 'Project',
            required: true
        },
        recipient: { type: String, required: true },
        message: { type: String, required: true },
        triggerType: { type: String, required: true },
        status: {
            type: String,
            enum: ['sent', 'failed', 'blocked'],
            required: true
        },
        responseId: { type: String },
        error: { type: String },
        metadata: { type: Schema.Types.Mixed }
    },
    { timestamps: true } // Adds createdAt and updatedAt
);

// Index for filtering
smsLogSchema.index({ projectId: 1, createdAt: -1 });
smsLogSchema.index({ recipient: 1 });
smsLogSchema.index({ status: 1 });

export default mongoose.model<ISMSLog>('SMSLog', smsLogSchema);
