import mongoose, { Schema, Document } from "mongoose";

export interface IAttachment {
  fieldName?: string; // Field name from the online form (if applicable)
  filename: string;
  originalName: string;
  path?: string; // GCS URL or local /uploads/... path
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
  // Level tracking for proper de-escalation
  fromLevelNumber?: number;
  toLevelNumber?: number;
  fromLevelName?: string;
  toLevelName?: string;
  // Store the assignee at each level for proper re-assignment during de-escalation
  previousAssignee?: mongoose.Types.ObjectId; // Who was handling before this escalation
}

export interface IChangeHistory {
  _id?: mongoose.Types.ObjectId;
  field: string; // Field that was changed (e.g., 'status', 'priority', 'category', 'tags', 'assignedTo')
  oldValue: string; // Previous value
  newValue: string; // New value
  changedBy: mongoose.Types.ObjectId; // User who made the change
  changedAt: Date;
  changeType: "update" | "add" | "remove" | "reassigned"; // Type of change
  // Reassignment-specific fields (only populated when changeType === 'reassigned')
  reassignmentReason?: string; // Reason for reassignment
  reassignmentCategory?: string; // Category from predefined list
  reassignmentMode?: "sequential" | "flexible"; // Which mode was used
}

/**
 * Interface for hierarchical category storage
 */
export interface ICategoryHierarchy {
  level1?: mongoose.Types.ObjectId; // Required (Level 1 category)
  level2?: mongoose.Types.ObjectId; // Optional (Level 2 category)
  level3?: mongoose.Types.ObjectId; // Optional (Level 3 category)
  level4?: mongoose.Types.ObjectId; // Optional (Level 4 category)
  displayPath?: string; // Cached display path for quick rendering
}

export interface ITicket extends Document {
  ticketNumber: string;
  subject: string;
  description: string;
  status: number; // Changed to number: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
  priority: string; // Priority code from Priority master data (e.g., LOW, MEDIUM, HIGH, CRITICAL)
  slaRuleId?: mongoose.Types.ObjectId; // Reference to matching SLA rule (ObjectId - rename-resilient priority matching)
  category?: string; // Legacy field - kept for backward compatibility
  categoryHierarchy?: ICategoryHierarchy; // New hierarchical category storage
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
  submissionSource?: "online" | "offline" | "email"; // Track where ticket was created
  sourceEmail?: string; // Email address from which ticket was created (for email-to-ticket)
  sourceEmailMessageId?: string; // Message ID of the original email (for threading)
  sourceEmailName?: string; // Display name from the email sender
  sourceEmailConfigId?: mongoose.Types.ObjectId; // Email config that received this email (for proper reply routing)
  metadata?: any;
  resolvedAt?: Date; // Timestamp when status changed to Resolved (4)
  closedAt?: Date; // Timestamp when status changed to Closed (5)
  // Merge tracking fields
  isMerged?: boolean; // true for secondary tickets that have been absorbed into a primary
  mergedInto?: mongoose.Types.ObjectId; // Primary ticket's _id (set on secondary)
  mergedTickets?: mongoose.Types.ObjectId[]; // List of secondary ticket _ids (set on primary)
  mergedAt?: Date; // Timestamp when this ticket was merged
  resolutionTime?: string; // Calculated field for reporting (e.g., "2d 5h")
  slaStatus?: string; // Calculated field for reporting (e.g., "Within SLA", "Outside SLA")
  // Escalation Matrix fields
  escalationMatrixId?: mongoose.Types.ObjectId; // Applied escalation matrix
  currentEscalationLevelId?: mongoose.Types.ObjectId; // Current escalation level in the matrix
  currentEscalationLevelNumber?: number; // Current level number for quick reference
  // SLA Tracking fields
  workingCalendarId?: mongoose.Types.ObjectId; // Working calendar for SLA calculations
  ticketLevelSLA?: {
    dueAt: Date; // When ticket-level SLA expires (calculated from created time + priority resolution time)
    breachedAt?: Date; // When ticket-level SLA was breached (if applicable)
    pausedAt?: Date; // When SLA was paused (e.g., status changed to on-hold)
    pausedDuration?: number; // Total time paused in minutes
  };
  roleLevelSLA?: {
    startedAt: Date; // When current role-level SLA started (ticket creation or escalation)
    dueAt: Date; // When current role-level SLA expires
    breachedAt?: Date; // When current role-level SLA was breached (if applicable)
    pausedAt?: Date; // When SLA was paused
    pausedDuration?: number; // Total time paused in minutes
  };
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema({
  fieldName: { type: String }, // Optional field name from online form
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String }, // GCS URL or local /uploads/... path
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
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  attachments: [ThreadAttachmentSchema],
  isSystemMessage: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  mergedFrom: { type: String }, // Ticket number if thread was merged from another ticket
});

const CommentSchema = new Schema({
  text: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  isSystemComment: { type: Boolean, default: false },
  mergedFrom: { type: String }, // Ticket number if merged from another ticket
});

const InternalNoteSchema = new Schema({
  note: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

const EscalationRecordSchema = new Schema({
  escalatedTo: { type: Schema.Types.ObjectId, ref: "User", required: true },
  escalatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reason: { type: String, required: true },
  escalatedAt: { type: Date, default: Date.now },
  // Level tracking for proper de-escalation
  fromLevelNumber: { type: Number },
  toLevelNumber: { type: Number },
  fromLevelName: { type: String },
  toLevelName: { type: String },
  // Store the previous assignee for re-assignment during de-escalation
  previousAssignee: { type: Schema.Types.ObjectId, ref: "User" },
});

const ChangeHistorySchema = new Schema({
  field: { type: String, required: true },
  oldValue: { type: String, required: true },
  newValue: { type: String, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  changedAt: { type: Date, default: Date.now },
  changeType: {
    type: String,
    enum: ["update", "add", "remove", "reassigned"],
    default: "update",
  },
  // Reassignment-specific fields
  reassignmentReason: { type: String }, // Only populated when changeType === 'reassigned'
  reassignmentCategory: { type: String }, // Category from predefined list
  reassignmentMode: { type: String, enum: ["sequential", "flexible"] }, // Which mode was used
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
    slaRuleId: {
      type: Schema.Types.ObjectId,
      ref: "SLARule",
      required: false,
      index: true,
      // Populated at ticket creation to enable name-change-resilient dashboard matching
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      trim: true,
      index: true,
    },
    // Hierarchical category storage
    categoryHierarchy: {
      level1: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        index: true,
      },
      level2: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        index: true,
      },
      level3: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        index: true,
      },
      level4: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        index: true,
      },
      displayPath: {
        type: String,
        trim: true,
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },
    attachments: [AttachmentSchema],
    threads: [ThreadSchema],
    comments: [CommentSchema], // Added for RBAC comment feature
    internalNotes: [InternalNoteSchema],
    escalationHistory: [EscalationRecordSchema],
    changeHistory: [ChangeHistorySchema], // Track all field changes
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    submissionSource: {
      type: String,
      enum: ["online", "offline", "email"],
      default: "online",
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
    sourceEmailConfigId: {
      type: Schema.Types.ObjectId,
      ref: "ProjectEmailConfig",
      // Reference to the email config that received this email (for proper reply routing)
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
    // Escalation Matrix fields
    escalationMatrixId: {
      type: Schema.Types.ObjectId,
      ref: "EscalationMatrix",
      index: true,
    },
    currentEscalationLevelId: {
      type: Schema.Types.ObjectId,
      // This is the _id of the level subdocument within the EscalationMatrix
    },
    currentEscalationLevelNumber: {
      type: Number,
      default: 0,
      index: true,
    },
    // SLA Tracking fields
    workingCalendarId: {
      type: Schema.Types.ObjectId,
      ref: "WorkingCalendar",
      index: true,
    },
    ticketLevelSLA: {
      dueAt: { type: Date },
      breachedAt: { type: Date },
      pausedAt: { type: Date },
      pausedDuration: { type: Number, default: 0 },
    },
    roleLevelSLA: {
      startedAt: { type: Date },
      dueAt: { type: Date },
      breachedAt: { type: Date },
      pausedAt: { type: Date },
      pausedDuration: { type: Number, default: 0 },
    },
    // Merge tracking fields
    isMerged: {
      type: Boolean,
      default: false,
      index: true,
    },
    mergedInto: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
    },
    mergedTickets: [
      {
        type: Schema.Types.ObjectId,
        ref: "Ticket",
      },
    ],
    mergedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
TicketSchema.index({ createdBy: 1, createdAt: -1 });
TicketSchema.index({ assignedTo: 1, status: 1 });
TicketSchema.index({
  ticketNumber: "text",
  title: "text",
  description: "text",
});

export const Ticket = mongoose.model<ITicket>("Ticket", TicketSchema);
