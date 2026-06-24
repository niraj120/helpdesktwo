import mongoose, { Document, Schema } from "mongoose";

/**
 * Lead = an admission enquiry (new/prospective parent). Phase 4 — created/
 * updated from the email triage inbox (New Admission emails) and manageable
 * on its own. Kept intentionally lightweight; extend as the CRM grows.
 */
export interface ILead extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  contactNumber?: string;
  studentName?: string;
  grade?: string;
  enquiryNo?: string;
  source: "email" | "online" | "walk-in" | "ivr" | "other";
  status: "new" | "in_followup" | "converted" | "closed" | "lost";
  notes?: string;
  emailIntakeId?: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    contactNumber: { type: String, trim: true, index: true },
    studentName: { type: String, trim: true },
    grade: { type: String, trim: true },
    enquiryNo: { type: String, trim: true, index: true },
    source: {
      type: String,
      enum: ["email", "online", "walk-in", "ivr", "other"],
      default: "email",
    },
    status: {
      type: String,
      enum: ["new", "in_followup", "converted", "closed", "lost"],
      default: "new",
      index: true,
    },
    notes: { type: String },
    emailIntakeId: { type: Schema.Types.ObjectId, ref: "EmailIntake" },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

LeadSchema.index({ projectId: 1, status: 1, createdAt: -1 });

export const Lead = mongoose.model<ILead>("Lead", LeadSchema);
export default Lead;
