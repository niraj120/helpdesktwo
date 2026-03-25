import mongoose, { Schema, Document } from 'mongoose';

export interface ITicketEmailCommunication extends Document {
  ticketId: mongoose.Types.ObjectId;
  direction: 'incoming' | 'outgoing' | 'inbound' | 'outbound';
  from?: string; // Sender email (legacy field)
  fromEmail: string; // Sender email (new field)
  to?: string[]; // Recipient emails (legacy field)
  toEmail: string; // Primary recipient email (new field)
  cc?: string[]; // CC recipients (legacy field)
  ccEmails?: string[]; // CC recipients (new field)
  bccEmails?: string[]; // BCC recipients
  subject: string;
  body: string;
  htmlBody?: string; // HTML version of body
  bodyHtml?: string; // Alternative name for HTML body
  messageId: string; // Unique email Message-ID for threading
  inReplyTo?: string; // Message-ID of email being replied to
  references?: string | string[]; // Chain of Message-IDs for thread
  conversationId?: string; // Exchange/Graph conversation thread ID (same for all replies)
  rawEmailHeaders?: string; // Store all email headers as JSON string
  attachments?: {
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    path?: string;
  }[];
  isProcessed: boolean; // Whether email has been processed into ticket
  processingError?: string; // Any error that occurred during processing
  sentAt?: Date; // When email was sent
  receivedAt?: Date; // When email was received
  status?: string; // Email status (sent, received, failed, etc.)
  createdAt: Date;
  updatedAt: Date;
}

const TicketEmailCommunicationSchema: Schema = new Schema(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ['incoming', 'outgoing', 'inbound', 'outbound'],
      required: true,
      index: true,
    },
    from: {
      type: String,
      trim: true,
      lowercase: true,
    },
    fromEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    to: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    toEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    cc: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    ccEmails: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    bccEmails: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
    },
    htmlBody: {
      type: String,
    },
    bodyHtml: {
      type: String,
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    inReplyTo: {
      type: String,
      trim: true,
      index: true,
    },
    references: {
      type: Schema.Types.Mixed, // Can be string or array
    },
    conversationId: {
      type: String,
      trim: true,
      index: true,
    },
    rawEmailHeaders: {
      type: String, // Store as JSON string
    },
    attachments: [{
      filename: { type: String, required: true },
      originalName: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
      path: { type: String },
    }],
    isProcessed: {
      type: Boolean,
      default: false,
      index: true,
    },
    processingError: {
      type: String,
    },
    sentAt: {
      type: Date,
    },
    receivedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['sent', 'received', 'failed', 'pending', 'delivered'],
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Compound index for efficient threading queries
TicketEmailCommunicationSchema.index({ ticketId: 1, createdAt: -1 });
TicketEmailCommunicationSchema.index({ messageId: 1, ticketId: 1 });

// Index for finding all emails in a thread
TicketEmailCommunicationSchema.index({ inReplyTo: 1 });
TicketEmailCommunicationSchema.index({ conversationId: 1 });

// Index for finding unprocessed incoming emails
TicketEmailCommunicationSchema.index({ direction: 1, isProcessed: 1 });

// Static method to get email thread
TicketEmailCommunicationSchema.statics.getEmailThread = async function(ticketId: string) {
  return this.find({ ticketId })
    .sort({ createdAt: 1 })
    .exec();
};

// Static method to find email by message ID
TicketEmailCommunicationSchema.statics.findByMessageId = async function(messageId: string) {
  return this.findOne({ messageId }).exec();
};

// Static method to find replies to a message
TicketEmailCommunicationSchema.statics.findReplies = async function(messageId: string) {
  return this.find({ inReplyTo: messageId })
    .sort({ createdAt: 1 })
    .exec();
};

// Instance method to get full thread
TicketEmailCommunicationSchema.methods.getFullThread = async function() {
  const TicketEmailCommunication = this.constructor as any;
  return TicketEmailCommunication.getEmailThread(this.ticketId.toString());
};

const TicketEmailCommunication = mongoose.model<ITicketEmailCommunication>(
  'TicketEmailCommunication',
  TicketEmailCommunicationSchema
);

export default TicketEmailCommunication;
