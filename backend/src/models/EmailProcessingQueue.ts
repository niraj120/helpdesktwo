import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailProcessingQueue extends Document {
  projectEmailConfigId: mongoose.Types.ObjectId;
  rawEmail: string; // Complete raw email data (MIME format or JSON)
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  error?: string; // Alias for errorMessage for easier access
  retryCount: number;
  processedAt?: Date;
  lastAttemptAt?: Date;
  lastRetryAt?: Date; // Last time a retry was attempted
  ticketId?: mongoose.Types.ObjectId; // Reference to created ticket (when completed)
  emailIntakeId?: mongoose.Types.ObjectId; // Reference to SR email intake record (when auto-create is disabled)
  emailCommunicationId?: mongoose.Types.ObjectId; // Reference to email communication record
  metadata?: {
    fromEmail?: string;
    toEmail?: string;
    subject?: string;
    messageId?: string;
    size?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const EmailProcessingQueueSchema: Schema = new Schema(
  {
    projectEmailConfigId: {
      type: Schema.Types.ObjectId,
      ref: 'ProjectEmailConfig',
      required: true,
      index: true,
    },
    rawEmail: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      required: true,
      index: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    error: {
      type: String,
      trim: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    processedAt: {
      type: Date,
      index: true,
    },
    lastAttemptAt: {
      type: Date,
    },
    lastRetryAt: {
      type: Date,
    },
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket',
      index: true,
    },
    emailIntakeId: {
      type: Schema.Types.ObjectId,
      ref: 'EmailIntake',
      index: true,
    },
    emailCommunicationId: {
      type: Schema.Types.ObjectId,
      ref: 'TicketEmailCommunication',
    },
    metadata: {
      fromEmail: { type: String, lowercase: true },
      toEmail: { type: String, lowercase: true },
      subject: String,
      messageId: String,
      size: Number,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Compound indexes for efficient querying
EmailProcessingQueueSchema.index({ status: 1, createdAt: 1 });
EmailProcessingQueueSchema.index({ status: 1, retryCount: 1 });
EmailProcessingQueueSchema.index({ projectEmailConfigId: 1, status: 1 });

// Index for finding stale processing records
EmailProcessingQueueSchema.index({ status: 1, lastAttemptAt: 1 });

// Static method to get pending emails
EmailProcessingQueueSchema.statics.getPendingEmails = async function(limit: number = 10) {
  return this.find({ 
    status: 'pending',
    retryCount: { $lt: 5 } // Max 5 retries
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .exec();
};

// Static method to get failed emails that can be retried
EmailProcessingQueueSchema.statics.getRetryableEmails = async function(maxRetries: number = 5) {
  return this.find({ 
    status: 'failed',
    retryCount: { $lt: maxRetries }
  })
    .sort({ lastAttemptAt: 1 })
    .exec();
};

// Static method to find stale processing records (stuck for more than 5 minutes)
EmailProcessingQueueSchema.statics.findStaleProcessing = async function(minutesThreshold: number = 5) {
  const thresholdTime = new Date(Date.now() - minutesThreshold * 60 * 1000);
  return this.find({
    status: 'processing',
    lastAttemptAt: { $lt: thresholdTime }
  }).exec();
};

// Instance method to mark as processing
EmailProcessingQueueSchema.methods.markAsProcessing = async function() {
  this.status = 'processing';
  this.lastAttemptAt = new Date();
  return this.save();
};

// Instance method to mark as completed
EmailProcessingQueueSchema.methods.markAsCompleted = async function(ticketId?: mongoose.Types.ObjectId, emailCommunicationId?: mongoose.Types.ObjectId) {
  this.status = 'completed';
  this.processedAt = new Date();
  if (ticketId) this.ticketId = ticketId;
  if (emailCommunicationId) this.emailCommunicationId = emailCommunicationId;
  return this.save();
};

// Instance method to mark as failed
EmailProcessingQueueSchema.methods.markAsFailed = async function(errorMessage: string) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.retryCount += 1;
  this.lastAttemptAt = new Date();
  return this.save();
};

// Instance method to reset for retry
EmailProcessingQueueSchema.methods.resetForRetry = async function() {
  this.status = 'pending';
  this.errorMessage = undefined;
  return this.save();
};

// Pre-save hook to validate status transitions
EmailProcessingQueueSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const validTransitions: Record<string, string[]> = {
      'pending': ['processing', 'failed'],
      'processing': ['completed', 'failed', 'pending'],
      'completed': [], // No transitions from completed
      'failed': ['pending', 'processing'], // Can retry
    };

    const currentStatus = (this as any)._doc?.status || 'pending';
    const newStatus = this.status;

    if (currentStatus !== newStatus && !validTransitions[currentStatus]?.includes(newStatus)) {
      return next(new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`));
    }
  }
  next();
});

const EmailProcessingQueue = mongoose.model<IEmailProcessingQueue>(
  'EmailProcessingQueue',
  EmailProcessingQueueSchema
);

export default EmailProcessingQueue;
