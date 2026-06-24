import mongoose, { Document, Schema } from "mongoose";

/**
 * EmailIntake = an email received on a school support ID, surfaced in the RE-Cell
 * triage inbox (Phase 4). RE-Cell classifies it (category → sub-category) and
 * takes one or more actions (PSR/ISR/lead/duplicate/forward/repository/respond).
 * Distinct from the auto-ticket `EmailProcessingQueue` — this is human triage.
 */
export type EmailIntakeActionType =
  | "duplicate"
  | "psr"
  | "isr"
  | "lead"
  | "forward"
  | "repository"
  | "responded";

export interface IEmailIntakeAction {
  type: EmailIntakeActionType;
  refType?: "ticket" | "lead" | "email";
  refId?: mongoose.Types.ObjectId;
  refNumber?: string; // ticketNumber / enquiryNo
  remark?: string;
  performedBy?: mongoose.Types.ObjectId;
  performedAt: Date;
}

export interface IEmailIntake extends Document {
  projectId: mongoose.Types.ObjectId;
  projectEmailConfigId?: mongoose.Types.ObjectId;
  uniqueId: string; // M000... style human reference
  fromName?: string;
  fromEmail: string;
  toEmail?: string;
  subject: string;
  body?: string;
  htmlBody?: string;
  receivedAt: Date;
  /** Top-level classification (Vector: Existing/Left Student, New Admission, Others). */
  senderType?:
    | "existing_student"
    | "left_student"
    | "new_admission"
    | "others";
  subCategory?: string;
  status: "open" | "wip" | "closed";
  actions: IEmailIntakeAction[];
  assignedTo?: mongoose.Types.ObjectId;
  studentUserId?: mongoose.Types.ObjectId;
  // TAT / escalation
  dueAt?: Date;
  escalationLevel?: number;
  escalatedAt?: Date;
  closedAt?: Date;
  closedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ActionSchema = new Schema<IEmailIntakeAction>(
  {
    type: {
      type: String,
      enum: [
        "duplicate",
        "psr",
        "isr",
        "lead",
        "forward",
        "repository",
        "responded",
      ],
      required: true,
    },
    refType: { type: String, enum: ["ticket", "lead", "email"] },
    refId: { type: Schema.Types.ObjectId },
    refNumber: { type: String },
    remark: { type: String },
    performedBy: { type: Schema.Types.ObjectId, ref: "User" },
    performedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const EmailIntakeSchema = new Schema<IEmailIntake>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    projectEmailConfigId: {
      type: Schema.Types.ObjectId,
      ref: "ProjectEmailConfig",
    },
    uniqueId: { type: String, required: true, unique: true, index: true },
    fromName: { type: String },
    fromEmail: { type: String, required: true, lowercase: true, index: true },
    toEmail: { type: String, lowercase: true },
    subject: { type: String, required: true },
    body: { type: String },
    htmlBody: { type: String },
    receivedAt: { type: Date, required: true, index: true },
    senderType: {
      type: String,
      enum: ["existing_student", "left_student", "new_admission", "others"],
    },
    subCategory: { type: String },
    status: {
      type: String,
      enum: ["open", "wip", "closed"],
      default: "open",
      index: true,
    },
    actions: [ActionSchema],
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    studentUserId: { type: Schema.Types.ObjectId, ref: "User" },
    dueAt: { type: Date, index: true },
    escalationLevel: { type: Number, default: 0 },
    escalatedAt: { type: Date },
    closedAt: { type: Date },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

EmailIntakeSchema.index({ projectId: 1, status: 1, receivedAt: -1 });

export const EmailIntake = mongoose.model<IEmailIntake>(
  "EmailIntake",
  EmailIntakeSchema,
);
export default EmailIntake;
