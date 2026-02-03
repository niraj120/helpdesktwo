import mongoose, { Schema, Document } from 'mongoose';

export interface IAttachment {
  fieldName?: string; // Field name from the online form (if applicable)
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
}

export interface IThreadAttachment {
  filename: string;
  originalName: string;
  path: string;
  mimetype: string;
  size: number;
}

export interface IThread {
  message: string;
  createdBy: mongoose.Types.ObjectId;
  attachments?: IThreadAttachment[];
  isSystemMessage?: boolean;
  createdAt: Date;
}

export interface IComment {
  _id?: mongoose.Types.ObjectId;
  text: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt?: Date;
  isSystemComment?: boolean;
  mergedFrom?: string; // Ticket number if comment was merged from another ticket
}

export interface IInternalNote {
  _id?: mongoose.Types.ObjectId;
  note: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IEscalationRecord {
  _id?: mongoose.Types.ObjectId;
  escalatedTo: mongoose.Types.ObjectId;
  escalatedBy: mongoose.Types.ObjectId;
  reason: string;
  escalatedAt: Date;
}

export interface IChangeHistory {
  _id?: mongoose.Types.ObjectId;
  field: string; // Field that was changed (e.g., 'status', 'priority', 'category', 'tags', 'assignedTo')
  oldValue: string; // Previous value
  newValue: string; // New value
  changedBy: mongoose.Types.ObjectId; // User who made the change
  changedAt: Date;
  changeType: 'update' | 'add' | 'remove'; // Type of change
}

export interface ITicket extends Document {
  ticketNumber: string;
  subject: string;
  description: string;
  status: number; // Changed to number: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
  priority: string; // Priority code from Priority master data (e.g., LOW, MEDIUM, HIGH, CRITICAL)
  category?: string;
  createdBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId; // Added for project reference
  attachments: IAttachment[];
  threads?: IThread[];
  comments?: IComment[]; // Added for RBAC comment feature
  internalNotes?: IInternalNote[];
  escalationHistory?: IEscalationRecord[];
  changeHistory?: IChangeHistory[]; // Track all changes to the ticket
  tags: string[];
  submissionSource?: 'online' | 'offline' | 'email'; // Track where ticket was created
  sourceEmail?: string; // Email address from which ticket was created (for email-to-ticket)
  sourceEmailMessageId?: string; // Message ID of the original email (for threading)
  sourceEmailName?: string; // Display name from the email sender
  metadata?: any;
  resolvedAt?: Date; // Timestamp when status changed to Resolved (4)
  closedAt?: Date; // Timestamp when status changed to Closed (5)
  resolutionTime?: string; // Calculated field for reporting (e.g., "2d 5h")
  slaStatus?: string; // Calculated field for reporting (e.g., "Within SLA", "Outside SLA")
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema({
  fieldName: { type: String }, // Optional field name from online form
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const ThreadAttachmentSchema = new Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
});

const ThreadSchema = new Schema({
  message: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  attachments: [ThreadAttachmentSchema],
  isSystemMessage: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const CommentSchema = new Schema({
  text: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  isSystemComment: { type: Boolean, default: false },
  mergedFrom: { type: String }, // Ticket number if merged from another ticket
});

const InternalNoteSchema = new Schema({
  note: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

const EscalationRecordSchema = new Schema({
  escalatedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  escalatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  escalatedAt: { type: Date, default: Date.now },
});

const ChangeHistorySchema = new Schema({
  field: { type: String, required: true },
  oldValue: { type: String, required: true },
  newValue: { type: String, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, default: Date.now },
  changeType: { type: String, enum: ['update', 'add', 'remove'], default: 'update' },
});

const TicketSchema: Schema = new Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: Number,
      required: true,
      default: 1, // 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
      index: true,
    },
    priority: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
      // No enum - priority codes are dynamic from Priority master data
      // Common codes: LOW, MEDIUM, HIGH, CRITICAL
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      trim: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    attachments: [AttachmentSchema],
    threads: [ThreadSchema],
    comments: [CommentSchema], // Added for RBAC comment feature
    internalNotes: [InternalNoteSchema],
    escalationHistory: [EscalationRecordSchema],
    changeHistory: [ChangeHistorySchema], // Track all field changes
    tags: [{
      type: String,
      trim: true,
    }],
    submissionSource: {
      type: String,
      enum: ['online', 'offline', 'email'],
      default: 'online',
      index: true,
    },
    sourceEmail: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      // Nullable - only populated for email-originated tickets
    },
    sourceEmailMessageId: {
      type: String,
      trim: true,
      index: true,
      // Message ID of the original email for threading
    },
    sourceEmailName: {
      type: String,
      trim: true,
      // Display name of the email sender
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    resolvedAt: {
      type: Date,
      index: true,
    },
    closedAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
TicketSchema.index({ createdBy: 1, createdAt: -1 });
TicketSchema.index({ assignedTo: 1, status: 1 });
TicketSchema.index({ ticketNumber: 'text', title: 'text', description: 'text' });

export const Ticket = mongoose.model<ITicket>('Ticket', TicketSchema);
