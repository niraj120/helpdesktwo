import mongoose, { Document, Schema } from "mongoose";

/**
 * CallIntake = an inbound IVR/phone call (e.g. pushed by Tata) surfaced in the
 * IVR triage inbox (Phase 5). RE/PSL looks up the caller, classifies them, and
 * converts the call into a PSR — or resolves it on-call (OCR, no ticket).
 * Mirrors the EmailIntake triage pattern but for voice.
 */
export type RequesterType =
  | "existing_parent"
  | "prospective_parent"
  | "left_parent"
  | "vendor"
  | "job"
  | "junk"
  | "other";

export interface ICallIntake extends Document {
  projectId: mongoose.Types.ObjectId;
  /** Idempotency key from the telephony provider (Tata). */
  externalId: string;
  provider?: "smartflo" | "manual" | "other";
  uuid?: string;
  callToNumber?: string;
  callerName?: string;
  callerMobile: string;
  schoolName?: string;
  callType: "answered" | "missed";
  direction?: string;
  startStamp?: Date;
  answerStamp?: Date;
  endStamp?: Date;
  durationSeconds?: number;
  voiceNoteUrl?: string;
  recordingUrl?: string;
  digitsDialed?: string[];
  answeredAgentId?: string;
  answeredAgentName?: string;
  answeredAgentNumber?: string;
  providerCallStatus?: string;
  originalProviderCallStatus?: string;
  rawPayload?: Record<string, any>;
  lastPayload?: Record<string, any>;
  lastIngestLogId?: mongoose.Types.ObjectId;
  receivedAt: Date;
  /** Caller matched to an existing user/parent. */
  registered: boolean;
  studentUserId?: mongoose.Types.ObjectId;
  studentCount?: number;
  requesterType?: RequesterType;
  /** Lifecycle for the IVR inbox (matches the prototype chips). */
  callStatus: "new" | "assigned" | "converted" | "junk";
  convertedTicketId?: mongoose.Types.ObjectId;
  convertedTicketNumber?: string;
  convertedAt?: Date;
  /** All PSRs raised from this call (a call can spawn several). */
  convertedTickets?: {
    ticketId: mongoose.Types.ObjectId;
    ticketNumber: string;
    at: Date;
  }[];
  /** open while it needs action; closed when converted or resolved on-call. */
  status: "open" | "closed";
  /** OCR = resolved during the call (no SR). */
  resolvedOnCall?: boolean;
  assignedTo?: mongoose.Types.ObjectId;
  /** IVR digit bucket resolved for round-robin ("1"/"2"/.../"other"). */
  assignedBucket?: string;
  /** Missed-call round-robin outcome. */
  assignmentStatus?: "assigned" | "unassigned_no_agent";
  /** Friendly label of the DID the call came in on (from the DID registry). */
  didLabel?: string;
  /** How the assignee was resolved: agent-number | did-dedicated | round-robin | manual. */
  matchedBy?: string;
  remark?: string;
  /**
   * Outbound Click-to-Call attempts made to call this caller back. Each entry
   * correlates a SmartFlo originate (refId + customIdentifier) to the agent who
   * placed it; the matching webhook is stitched back via customIdentifier.
   */
  outboundCalls?: {
    refId?: string;
    customIdentifier: string;
    agentUserId?: mongoose.Types.ObjectId;
    agentNumber?: string;
    callerId?: string;
    destinationNumber?: string;
    status: "initiated" | "answered" | "missed" | "failed";
    initiatedBy?: mongoose.Types.ObjectId;
    initiatedAt: Date;
    /** Terminal webhook status stamp. */
    completedAt?: Date;
    message?: string;
  }[];
  /** Convenience mirror of the most recent outboundCalls entry status. */
  lastOutboundStatus?: "initiated" | "answered" | "missed" | "failed";
  lastOutboundAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CallIntakeSchema = new Schema<ICallIntake>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    externalId: { type: String, required: true, unique: true, index: true },
    provider: {
      type: String,
      enum: ["smartflo", "manual", "other"],
      default: "manual",
      index: true,
    },
    uuid: { type: String, index: true },
    callToNumber: { type: String, index: true },
    callerName: { type: String },
    callerMobile: { type: String, required: true, index: true },
    schoolName: { type: String },
    callType: { type: String, enum: ["answered", "missed"], default: "answered" },
    direction: { type: String },
    startStamp: { type: Date },
    answerStamp: { type: Date },
    endStamp: { type: Date },
    durationSeconds: { type: Number },
    voiceNoteUrl: { type: String },
    recordingUrl: { type: String },
    digitsDialed: [{ type: String }],
    answeredAgentId: { type: String },
    answeredAgentName: { type: String },
    answeredAgentNumber: { type: String },
    providerCallStatus: { type: String },
    originalProviderCallStatus: { type: String },
    rawPayload: { type: Schema.Types.Mixed },
    lastPayload: { type: Schema.Types.Mixed },
    lastIngestLogId: { type: Schema.Types.ObjectId, ref: "IvrIngestLog" },
    receivedAt: { type: Date, required: true, index: true },
    registered: { type: Boolean, default: false, index: true },
    studentUserId: { type: Schema.Types.ObjectId, ref: "User" },
    studentCount: { type: Number },
    requesterType: {
      type: String,
      enum: [
        "existing_parent",
        "prospective_parent",
        "left_parent",
        "vendor",
        "job",
        "junk",
        "other",
      ],
    },
    callStatus: {
      type: String,
      enum: ["new", "assigned", "converted", "junk"],
      default: "new",
      index: true,
    },
    convertedTicketId: { type: Schema.Types.ObjectId, ref: "Ticket" },
    convertedTicketNumber: { type: String },
    convertedAt: { type: Date },
    convertedTickets: [
      {
        _id: false,
        ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" },
        ticketNumber: { type: String },
        at: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
    resolvedOnCall: { type: Boolean },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    assignedBucket: { type: String },
    assignmentStatus: {
      type: String,
      enum: ["assigned", "unassigned_no_agent"],
    },
    didLabel: { type: String },
    matchedBy: { type: String },
    remark: { type: String },
    outboundCalls: [
      {
        _id: false,
        refId: { type: String },
        customIdentifier: { type: String, required: true },
        agentUserId: { type: Schema.Types.ObjectId, ref: "User" },
        agentNumber: { type: String },
        callerId: { type: String },
        destinationNumber: { type: String },
        status: {
          type: String,
          enum: ["initiated", "answered", "missed", "failed"],
          default: "initiated",
        },
        initiatedBy: { type: Schema.Types.ObjectId, ref: "User" },
        initiatedAt: { type: Date, default: Date.now },
        completedAt: { type: Date },
        message: { type: String },
      },
    ],
    lastOutboundStatus: {
      type: String,
      enum: ["initiated", "answered", "missed", "failed"],
    },
    lastOutboundAt: { type: Date },
  },
  { timestamps: true },
);

// Correlate an inbound webhook back to the originating Click-to-Call.
CallIntakeSchema.index({ "outboundCalls.customIdentifier": 1 });
CallIntakeSchema.index({ "outboundCalls.refId": 1 });

CallIntakeSchema.index({ projectId: 1, callStatus: 1, receivedAt: -1 });

export const CallIntake = mongoose.model<ICallIntake>(
  "CallIntake",
  CallIntakeSchema,
);
export default CallIntake;
