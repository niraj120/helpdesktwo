import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailLog extends Document {
  projectId?: mongoose.Types.ObjectId;
  projectName?: string;
  recipient: string;
  subject: string;
  body?: string;
  type: 'otp' | 'ticket_created' | 'student_welcome' | 'password_reset' | 'ticket_update' | 'other';
  status: 'sent' | 'failed' | 'blocked' | 'simulated';
  error?: string;
  metadata?: {
    ticketId?: string;
    ticketNumber?: string;
    userId?: string;
    userName?: string;
    triggerName?: string;
    [key: string]: any;
  };
  smtpHost?: string;
  fromEmail?: string;
  sentAt: Date;
}

const emailLogSchema = new Schema<IEmailLog>({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  projectName: {
    type: String
  },
  recipient: {
    type: String,
    required: true,
    index: true
  },
  subject: {
    type: String,
    required: true
  },
  body: {
    type: String
  },
  type: {
    type: String,
    enum: ['otp', 'ticket_created', 'student_welcome', 'password_reset', 'ticket_update', 'other'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'blocked', 'simulated'],
    required: true,
    index: true
  },
  error: {
    type: String
  },
  metadata: {
    type: Schema.Types.Mixed
  },
  smtpHost: {
    type: String
  },
  fromEmail: {
    type: String
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
emailLogSchema.index({ sentAt: -1 });
emailLogSchema.index({ status: 1, sentAt: -1 });
emailLogSchema.index({ type: 1, sentAt: -1 });
emailLogSchema.index({ projectId: 1, sentAt: -1 });

export default mongoose.model<IEmailLog>('EmailLog', emailLogSchema);
