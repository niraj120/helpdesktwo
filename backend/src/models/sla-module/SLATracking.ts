import mongoose, { Document, Schema } from "mongoose";

export interface ISLATracking extends Document {
  ticketId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  slaRuleId?: mongoose.Types.ObjectId;
  escalationPolicyId?: mongoose.Types.ObjectId;
  /** Which SLA source was used when this tracking record was created */
  slaSource?: "category" | "priority" | "default";

  // SLA Timelines
  responseDeadline?: Date;
  resolutionDeadline: Date;

  // SLA Status
  responseStatus: "met" | "breached" | "pending";
  resolutionStatus: "met" | "breached" | "pending";

  // Response Time Tracking
  firstResponseAt?: Date;
  responseTime?: number; // in minutes

  // Resolution Time Tracking
  resolvedAt?: Date;
  resolutionTime?: number; // in minutes

  // Escalation Tracking
  currentEscalationLevel: number; // 0 = not escalated, 1+ = escalation level
  lastEscalationAt?: Date;
  nextEscalationDue?: Date; // When next auto-escalation should trigger
  escalationHistory: Array<{
    level: number;
    escalatedAt: Date;
    escalatedTo: mongoose.Types.ObjectId;
    escalatedBy?: mongoose.Types.ObjectId; // null for auto-escalation
    mode: "manual" | "auto";
    reason: string;
  }>;

  // Pause/Resume Tracking (for on-hold tickets)
  isPaused: boolean;
  pausedAt?: Date;
  pausedDuration: number; // total paused time in minutes

  createdAt: Date;
  updatedAt: Date;
}

const SLATrackingSchema = new Schema<ISLATracking>(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
      unique: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    slaRuleId: {
      type: Schema.Types.ObjectId,
      ref: "SLARule",
    },
    escalationPolicyId: {
      type: Schema.Types.ObjectId,
      ref: "EscalationPolicy",
    },

    // SLA Timelines
    responseDeadline: {
      type: Date,
    },
    resolutionDeadline: {
      type: Date,
      required: true,
    },

    // SLA Status
    responseStatus: {
      type: String,
      enum: ["met", "breached", "pending"],
      default: "pending",
    },
    resolutionStatus: {
      type: String,
      enum: ["met", "breached", "pending"],
      default: "pending",
    },

    // Response Time Tracking
    firstResponseAt: {
      type: Date,
    },
    responseTime: {
      type: Number, // in minutes
    },

    // Resolution Time Tracking
    resolvedAt: {
      type: Date,
    },
    resolutionTime: {
      type: Number, // in minutes
    },

    // Escalation Tracking
    currentEscalationLevel: {
      type: Number,
      default: 0,
    },
    lastEscalationAt: {
      type: Date,
    },
    nextEscalationDue: {
      type: Date,
    },
    escalationHistory: [
      {
        level: { type: Number, required: true },
        escalatedAt: { type: Date, required: true },
        escalatedTo: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        escalatedBy: { type: Schema.Types.ObjectId, ref: "User" },
        mode: { type: String, enum: ["manual", "auto"], required: true },
        reason: { type: String, required: true },
      },
    ],

    // Source of SLA timings (US-017)
    slaSource: {
      type: String,
      enum: ["category", "priority", "default"],
    },

    // Pause/Resume Tracking
    isPaused: {
      type: Boolean,
      default: false,
    },
    pausedAt: {
      type: Date,
    },
    pausedDuration: {
      type: Number,
      default: 0, // in minutes
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
SLATrackingSchema.index({ ticketId: 1 });
SLATrackingSchema.index({ projectId: 1 });
SLATrackingSchema.index({ resolutionStatus: 1, resolutionDeadline: 1 });
SLATrackingSchema.index({ nextEscalationDue: 1, currentEscalationLevel: 1 });
SLATrackingSchema.index({ isPaused: 1 });

const SLATracking = mongoose.model<ISLATracking>(
  "SLATracking",
  SLATrackingSchema,
);

export default SLATracking;
