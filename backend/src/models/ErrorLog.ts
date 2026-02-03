/**
 * ErrorLog Model (Task 8.1)
 * Stores detailed error logs for debugging and monitoring
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IErrorLog extends Document {
  message: string;
  stack?: string;
  context: 'email_polling' | 'email_parsing' | 'ticket_creation' | 'ticket_update' | 
           'email_sending' | 'thread_detection' | 'database_operation' | 'api_request' |
           'authentication' | 'validation' | 'smtp_connection' | 'file_upload' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: {
    emailMessageId?: string;
    ticketId?: string;
    ticketNumber?: string;
    userId?: string;
    email?: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    requestBody?: any;
    queueId?: string;
    smtpHost?: string;
    errorType?: string;
    [key: string]: any;
  };
  projectId?: mongoose.Types.ObjectId;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  resolution?: string;
}

const errorLogSchema = new Schema<IErrorLog>({
  message: {
    type: String,
    required: true,
    index: true
  },
  stack: {
    type: String
  },
  context: {
    type: String,
    enum: [
      'email_polling',
      'email_parsing',
      'ticket_creation',
      'ticket_update',
      'email_sending',
      'thread_detection',
      'database_operation',
      'api_request',
      'authentication',
      'validation',
      'smtp_connection',
      'file_upload',
      'other'
    ],
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true,
    index: true
  },
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  resolved: {
    type: Boolean,
    default: false,
    index: true
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  resolution: {
    type: String
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
errorLogSchema.index({ severity: 1, timestamp: -1 });
errorLogSchema.index({ context: 1, timestamp: -1 });
errorLogSchema.index({ resolved: 1, severity: 1, timestamp: -1 });
errorLogSchema.index({ projectId: 1, timestamp: -1 });
errorLogSchema.index({ 'details.ticketId': 1 });
errorLogSchema.index({ 'details.emailMessageId': 1 });

// TTL index - automatically delete old resolved errors after 90 days
errorLogSchema.index(
  { resolvedAt: 1 },
  { 
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days
    partialFilterExpression: { resolved: true }
  }
);

export default mongoose.model<IErrorLog>('ErrorLog', errorLogSchema);
