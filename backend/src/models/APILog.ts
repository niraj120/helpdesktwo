import mongoose, { Schema, Document } from 'mongoose';

export interface IAPILog extends Document {
  projectId?: mongoose.Types.ObjectId;
  projectName?: string;
  apiType: 'webhook' | 'sms' | 'email' | 'payment' | 'hrms' | 'erp' | 'chat' | 'other';
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  requestHeaders?: Record<string, any>;
  requestBody?: Record<string, any>;
  responseStatus?: number;
  responseBody?: Record<string, any>;
  error?: string;
  status: 'success' | 'failed' | 'timeout' | 'retrying';
  metadata?: Record<string, any>;
  attempt: number;
  executionTime?: number; // in milliseconds
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const APILogSchema: Schema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    projectName: {
      type: String,
    },
    apiType: {
      type: String,
      enum: ['webhook', 'sms', 'email', 'payment', 'hrms', 'erp', 'chat', 'other'],
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
      index: true,
    },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      required: true,
    },
    requestHeaders: {
      type: Schema.Types.Mixed,
    },
    requestBody: {
      type: Schema.Types.Mixed,
    },
    responseStatus: {
      type: Number,
      index: true,
    },
    responseBody: {
      type: Schema.Types.Mixed,
    },
    error: {
      type: String,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'timeout', 'retrying'],
      default: 'success',
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    attempt: {
      type: Number,
      default: 1,
    },
    executionTime: {
      type: Number, // milliseconds
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
APILogSchema.index({ sentAt: -1 });
APILogSchema.index({ status: 1, sentAt: -1 });
APILogSchema.index({ apiType: 1, status: 1 });

export default mongoose.model<IAPILog>('APILog', APILogSchema);
