import mongoose, { Document, Schema } from "mongoose";

/**
 * Per-project SR notification template, keyed by lifecycle event.
 * Replaces the hardcoded title/body in notifySrWatchers with editable,
 * placeholder-driven text. Missing / disabled templates fall back to the
 * built-in default so notifications never break.
 */
export type SrNotificationEvent =
  | "created"
  | "status_change"
  | "resolved"
  | "closed"
  | "reopened"
  | "reassigned"
  | "delegated"
  | "parent_closed"
  | "cancelled";

export const SR_NOTIFICATION_EVENTS: SrNotificationEvent[] = [
  "created",
  "status_change",
  "resolved",
  "closed",
  "reopened",
  "reassigned",
  "delegated",
  "parent_closed",
  "cancelled",
];

export interface ISrNotificationTemplate extends Document {
  projectId: mongoose.Types.ObjectId;
  event: SrNotificationEvent;
  enabled: boolean;
  /** Notification title. Supports {{ticketNumber}}, {{subject}}, {{field.X}}. */
  subject: string;
  /** Notification body. Same placeholders as subject. */
  body: string;
  /** When true, the parent/requester is also notified (in addition to CC). */
  toParent: boolean;
  ccUsers: mongoose.Types.ObjectId[];
  ccRoles: mongoose.Types.ObjectId[];
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SrNotificationTemplateSchema = new Schema<ISrNotificationTemplate>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      enum: SR_NOTIFICATION_EVENTS,
    },
    enabled: { type: Boolean, default: true },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    toParent: { type: Boolean, default: false },
    ccUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    ccRoles: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// One template per (project, event)
SrNotificationTemplateSchema.index({ projectId: 1, event: 1 }, { unique: true });

export const SrNotificationTemplate = mongoose.model<ISrNotificationTemplate>(
  "SrNotificationTemplate",
  SrNotificationTemplateSchema,
);
export default SrNotificationTemplate;
