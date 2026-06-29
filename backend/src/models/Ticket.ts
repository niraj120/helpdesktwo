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
  /** SR (PSR/ISR): whether this follow-up/remark is visible to the parent. Phase 2. */
  displayToParent?: boolean;
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
  level5?: mongoose.Types.ObjectId; // Optional (Level 5 category)
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
  submissionSource?:
    | "online"
    | "offline"
    | "email"
    | "whatsapp"
    | "chatbot"
    | "web"
    | "sms"
    | "ivr"; // Track where ticket was created
  // Public API fields
  mobile?: string; // Normalised mobile number (91XXXXXXXXXX) for chatbot/public submissions
  isRegistered?: boolean; // true = linked to existing user, false = mobile-only (unverified)
  sourceEmail?: string; // Email address from which ticket was created (for email-to-ticket)
  sourceEmailMessageId?: string; // Message ID of the original email (for threading)
  sourceEmailName?: string; // Display name from the email sender
  sourceEmailConfigId?: mongoose.Types.ObjectId; // Email config that received this email (for proper reply routing)
  metadata?: any;
  resolvedAt?: Date; // Timestamp when status changed to Resolved (4)
  closedAt?: Date; // Timestamp when status changed to Closed (5)
  sla_due_at?: Date; // Denormalised SLA due date for dashboard queries (Sprint 3)
  firstRespondedAt?: Date; // Timestamp of first agent response (Sprint 3)
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
    warningsSent?: number[]; // US-ESC-008: Threshold percentages for which warnings have already been sent
  };
  createdAt: Date;
  updatedAt: Date;
  /** Snapshot of the form schema at the time the ticket was submitted (US-7) */
  formSchemaSnapshot?: any;
  /**
   * True when a new ticket is created or a student/email reply arrives that the
   * assigned agent has not yet viewed. Cleared when any agent/admin opens the
   * ticket detail. Used to show the unread highlight & badge in ticket lists.
   */
  hasNewReply?: boolean;
  /** True when an agent/admin has replied and the student has not yet viewed the ticket. */
  hasAgentReply?: boolean;
  /** How the ticket was assigned (set by the auto-assignment engine, 'manual' when done by a human) */
  assignedVia?:
    | "manual"
    | "round-robin"
    | "by-role"
    | "by-user"
    | "condition-based"
    | "fallback";
  /** Number of times the assignment engine attempted to find an agent (incremented per fallback step) */
  assignmentAttempts?: number;
  /** US-ASSIGN-002: which category rule caused this assignment (set when assignedVia='by-user' or 'by-role') */
  assignedViaCategoryId?: mongoose.Types.ObjectId;
  /** Which source determined the SLA deadlines for this ticket */
  slaSource?: "category" | "priority" | "default";
  // ── Service Request (PSR/ISR) — Phase 0 foundation ───────────────────────
  /**
   * Service Request discriminator. "normal" = standard ticket (default) and
   * leaves all existing behavior untouched. "PSR"/"ISR" opt a ticket into the
   * Service Request module. Indexed for list filtering.
   */
  interactionType?: "normal" | "PSR" | "ISR";
  /** PSR request type: OCR = on-call resolution (quick close), SR = full workflow. */
  requestType?: "OCR" | "SR";
  /** ISR only: the parent PSR this ISR was spawned from / linked to. */
  linkedPsrId?: mongoose.Types.ObjectId;
  /** How the requester contacted the school (PSR mode of contact). */
  modeOfContact?:
    | "telephone"
    | "walk_in"
    | "email"
    | "portal"
    | "ivr"
    | "digital";
  /** SR watchers (CC) — notified on assignment/updates (e.g. PSL). */
  cc?: mongoose.Types.ObjectId[];
  /** WIP committed-closure-date tracking (Vector "future committed date"). */
  wip?: {
    committedDate?: Date;
    revisionCount?: number; // how many committed dates have been set
    reminderSentAt?: Date; // last 48h-before reminder
    escalatedAt?: Date; // set when committed date expired and escalation fired
    history?: Array<{
      committedDate: Date;
      setBy?: mongoose.Types.ObjectId;
      setAt: Date;
      reason?: string;
    }>;
  };
  /** Temporary delegation (assignee on leave/left); does not change the matrix. */
  delegation?: {
    delegatedTo?: mongoose.Types.ObjectId;
    delegatedBy?: mongoose.Types.ObjectId;
    delegatedAt?: Date;
    reason?: string;
    originalAssignee?: mongoose.Types.ObjectId;
  };
  /** Re-open tracking — parent/PSL may re-open once. */
  reopen?: {
    count?: number;
    reopenedBy?: mongoose.Types.ObjectId;
    reopenedAt?: Date;
  };
  /** Parent final closure + feedback. */
  parentClosure?: {
    satisfied?: boolean;
    closedAt?: Date;
    comments?: string;
  };
  /** PSL satisfaction-call (dissatisfied parent not re-opening). */
  pslCall?: {
    spoken?: boolean; // "Did you speak to the parent?"
    parentSatisfied?: boolean;
    comments?: string;
    calledBy?: mongoose.Types.ObjectId;
    calledAt?: Date;
  };
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
  // SR (PSR/ISR): whether this follow-up/remark is shown to the parent. Phase 2.
  displayToParent: { type: Boolean, default: false },
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
      level5: {
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
      required: false,
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
      enum: [
        "online",
        "offline",
        "email",
        "whatsapp",
        "chatbot",
        "web",
        "sms",
        "ivr",
      ],
      default: "online",
      index: true,
    },
    // Public API fields
    mobile: {
      type: String,
      trim: true,
      index: true,
    },
    isRegistered: {
      type: Boolean,
      default: false,
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
    sla_due_at: {
      type: Date,
      index: true,
    },
    firstRespondedAt: {
      type: Date,
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
      warningsSent: { type: [Number], default: [] }, // US-ESC-008
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
    formSchemaSnapshot: {
      type: Schema.Types.Mixed,
    },
    // Unread / new-reply tracking
    hasNewReply: {
      type: Boolean,
      default: true, // every new ticket starts as unread for the agent
      index: true,
    },
    // Unread tracking for the student — set true when agent replies
    hasAgentReply: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Assignment tracking (set by auto-assignment engine)
    assignedVia: {
      type: String,
      enum: [
        "manual",
        "round-robin",
        "by-role",
        "by-user",
        "condition-based",
        "fallback",
        null,
      ],
      default: undefined,
      index: true,
    },
    assignmentAttempts: {
      type: Number,
      default: 0,
    },
    // US-ASSIGN-002: which category rule caused this assignment
    assignedViaCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: undefined,
    },
    // SLA source tracking
    slaSource: {
      type: String,
      enum: ["category", "priority", "default", null],
      default: undefined,
    },
    // ── Service Request (PSR/ISR) — Phase 0 foundation ───────────────────────
    interactionType: {
      type: String,
      enum: ["normal", "PSR", "ISR"],
      default: "normal",
      index: true,
    },
    requestType: {
      type: String,
      enum: ["OCR", "SR", null],
      default: undefined,
    },
    // ISR → parent PSR link (sparse: only set on linked ISRs).
    linkedPsrId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      index: true,
      sparse: true,
      default: undefined,
    },
    modeOfContact: {
      type: String,
      enum: [
        "telephone",
        "walk_in",
        "email",
        "portal",
        "ivr",
        "digital",
        null,
      ],
      default: undefined,
    },
    cc: [{ type: Schema.Types.ObjectId, ref: "User" }],
    wip: {
      committedDate: { type: Date },
      revisionCount: { type: Number, default: 0 },
      reminderSentAt: { type: Date },
      escalatedAt: { type: Date },
      history: [
        {
          committedDate: { type: Date, required: true },
          setBy: { type: Schema.Types.ObjectId, ref: "User" },
          setAt: { type: Date, default: Date.now },
          reason: { type: String },
        },
      ],
    },
    delegation: {
      delegatedTo: { type: Schema.Types.ObjectId, ref: "User" },
      delegatedBy: { type: Schema.Types.ObjectId, ref: "User" },
      delegatedAt: { type: Date },
      reason: { type: String },
      originalAssignee: { type: Schema.Types.ObjectId, ref: "User" },
    },
    reopen: {
      count: { type: Number, default: 0 },
      reopenedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reopenedAt: { type: Date },
    },
    parentClosure: {
      satisfied: { type: Boolean },
      closedAt: { type: Date },
      comments: { type: String },
    },
    pslCall: {
      spoken: { type: Boolean },
      parentSatisfied: { type: Boolean },
      comments: { type: String },
      calledBy: { type: Schema.Types.ObjectId, ref: "User" },
      calledAt: { type: Date },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
TicketSchema.index({ createdBy: 1, createdAt: -1 });
// Index for duplicate ticket guard (public API)
TicketSchema.index({ mobile: 1, project: 1, createdAt: -1 });
TicketSchema.index({ assignedTo: 1, status: 1 });
TicketSchema.index({
  ticketNumber: "text",
  title: "text",
  description: "text",
});

// Critical indexes for my-tickets and view-tickets queries
TicketSchema.index({ "metadata.projectId": 1, createdAt: -1 });
TicketSchema.index({ "metadata.projectId": 1, assignedTo: 1, createdAt: -1 });
TicketSchema.index({
  "metadata.studentEmail": 1,
  "metadata.projectId": 1,
  createdAt: -1,
});
TicketSchema.index({ assignedTo: 1, "metadata.projectId": 1, createdAt: -1 });

// Dashboard compound indexes (Sprint 1 + Sprint 3)
TicketSchema.index({ project: 1, status: 1, createdAt: -1 });
TicketSchema.index({ project: 1, priority: 1, createdAt: -1 });
TicketSchema.index({ project: 1, category: 1, createdAt: -1 });
TicketSchema.index({ project: 1, assignedTo: 1, status: 1 });
TicketSchema.index({ project: 1, closedAt: -1 });
TicketSchema.index({ project: 1, sla_due_at: 1 });
// Service Request list filtering (PSR/ISR vs normal)
TicketSchema.index({ project: 1, interactionType: 1, status: 1, createdAt: -1 });
// WIP committed-date reminder/escalation cron lookups
TicketSchema.index({ interactionType: 1, "wip.committedDate": 1 });
// Linked-ISR rollup for PSR list (count + done-by-status per parent PSR)
TicketSchema.index({ linkedPsrId: 1, status: 1 });

export const Ticket = mongoose.model<ITicket>("Ticket", TicketSchema);
