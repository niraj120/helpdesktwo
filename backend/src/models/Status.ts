import mongoose, { Document, Schema } from "mongoose";

/**
 * How a status behaves for one kind of record. Queries and service requests
 * share a project's status list but not its rules — the SR desk may allow one
 * re-open where the query desk allows any — so each status carries a rule set
 * per record type ("query" = normal query, "sr" = PSR/ISR).
 *
 * An absent rule set means "not configured": the status behaves as it always
 * has (queries: any move; SRs: the built-in SR lifecycle).
 */
export interface IStatusRule {
  /** When true, only the statuses in allowedNext may follow this one. */
  restrictNext?: boolean;
  /** Codes that may follow this status. Including this status's own code allows re-applying it (e.g. revising a WIP date). */
  allowedNext?: number[];
  /** When true, this status may only be reached from the statuses in allowedPrev. */
  restrictPrev?: boolean;
  /** Codes this status may be reached from (e.g. Re-open only after Closed). */
  allowedPrev?: number[];
  /** How many times this status may be applied to one ticket (0/empty = no limit). */
  maxPerTicket?: number;
  /** Permission code the user must hold to apply this status (empty = anyone who may change status). */
  permission?: string;
  /**
   * Who may apply it, by their part in the request: the assignee, the person
   * who raised it, or anyone holding the permission. Empty = no restriction,
   * which is how it has always behaved.
   */
  allowedActors?: ("assignee" | "raiser")[];
  /**
   * Hold the SLA clock while the ticket sits in this status. What the ticket
   * has left when it enters is what it has left when it resumes — the time
   * spent waiting is added back to every deadline.
   */
  pauseSla?: boolean;
  /**
   * When the clock starts again:
   *   "committedDate"  — on the date the agent committed to (WIP);
   *   "statusChange"   — only when the ticket leaves this status.
   * With "committedDate" and no date set, it falls back to "statusChange".
   */
  pauseUntil?: "committedDate" | "statusChange";
  /** Who the ticket goes to when this status is applied. */
  assignOnApply?: {
    mode: "keep" | "role" | "user" | "reopenRouting";
    roleId?: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;
  };
}

export interface IStatus extends Document {
  name: string;
  code: number; // Numeric status code: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
  color: string;
  projectId: mongoose.Types.ObjectId;
  isDefault: boolean;
  isClosed: boolean; // Indicates if this status closes the ticket
  requireClosingRemark: boolean; // If true, agent must provide a remark when applying this status
  /**
   * Whether applying this status also commits the agent to a date.
   *
   * A remark and a date answer different questions: the remark says why, the
   * date says by when. "Work In Progress" wants both; "Closed" wants only the
   * remark. Keeping them separate is what stops a WIP commitment being filed
   * as a closing remark.
   */
  requireCommittedDate: boolean;
  /** What to call that date in the dialog, e.g. "Committed date". */
  committedDateLabel?: string;
  /**
   * Earliest date the agent may commit to:
   *   "none"    — any date (default, how it always behaved);
   *   "created" — not before the ticket was raised;
   *   "now"     — must be in the future.
   */
  committedDateMin?: "none" | "created" | "now";
  /** Furthest ahead the date may be set, in days (blank = no limit). */
  committedDateMaxDays?: number;
  /** Ask the agent to confirm before this status is applied. */
  requireConfirmation?: boolean;
  /**
   * Part of the re-open cycle. Moving from a closing status into one of these
   * counts as a re-open, and the progress bar draws them as the second leg.
   */
  isReopen?: boolean;
  /** Draw this status as a step of the progress bar (e.g. off for Cancelled). */
  showInProgress?: boolean;
  /** Behaviour per record type — see IStatusRule. */
  rules?: { query?: IStatusRule; sr?: IStatusRule };
  displayOrder: number;
  description?: string;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StatusRuleSchema = new Schema(
  {
    restrictNext: { type: Boolean, default: false },
    allowedNext: [{ type: Number }],
    restrictPrev: { type: Boolean, default: false },
    allowedPrev: [{ type: Number }],
    maxPerTicket: { type: Number, min: 0 },
    permission: { type: String, trim: true },
    allowedActors: [{ type: String, enum: ["assignee", "raiser"] }],
    pauseSla: { type: Boolean, default: false },
    pauseUntil: {
      type: String,
      enum: ["committedDate", "statusChange"],
      default: "committedDate",
    },
    assignOnApply: {
      type: new Schema(
        {
          mode: {
            type: String,
            enum: ["keep", "role", "user", "reopenRouting"],
            default: "keep",
          },
          roleId: { type: Schema.Types.ObjectId, ref: "Role" },
          userId: { type: Schema.Types.ObjectId, ref: "User" },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false },
);

const StatusSchema = new Schema<IStatus>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: Number, // Numeric status code: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
      required: true,
    },
    color: {
      type: String,
      required: true,
      default: "#3b82f6",
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    requireClosingRemark: {
      type: Boolean,
      default: false, // When true, agent must enter a remark before applying this status
    },
    requireCommittedDate: {
      type: Boolean,
      default: false,
    },
    committedDateLabel: {
      type: String,
      trim: true,
    },
    committedDateMin: {
      type: String,
      enum: ["none", "created", "now"],
      default: "none",
    },
    committedDateMaxDays: { type: Number, min: 0 },
    requireConfirmation: { type: Boolean, default: false },
    isReopen: { type: Boolean, default: false },
    showInProgress: { type: Boolean, default: true },
    // Left undefined until someone configures it, so "never configured" stays
    // distinguishable from "configured as unrestricted".
    rules: {
      type: new Schema(
        {
          query: { type: StatusRuleSchema, default: undefined },
          sr: { type: StatusRuleSchema, default: undefined },
        },
        { _id: false },
      ),
      default: undefined,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    collection: "status", // Explicitly set collection name to match database
  },
);

// Compound index for unique status code per project
StatusSchema.index({ code: 1, projectId: 1 }, { unique: true });

// Index for efficient queries
StatusSchema.index({ projectId: 1, isActive: 1 });
StatusSchema.index({ projectId: 1, displayOrder: 1 });

export const Status = mongoose.model<IStatus>("Status", StatusSchema, "status");
