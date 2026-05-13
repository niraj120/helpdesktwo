import mongoose, { Schema, Document } from "mongoose";

export type TriggerType =
  | "ticket_created"
  | "ticket_assigned_to_me"
  | "ticket_reply_added"
  | "ticket_status_changed"
  | "ticket_mentioned"
  | "ticket_closed"
  | "ticket_escalated"
  | "kb_article_published"
  | "kb_article_updated"
  | "kb_article_archived"
  | "sla_breach_warning"
  | "sla_breached";

export interface INotification extends Document {
  recipientUserId: mongoose.Types.ObjectId;
  triggeredByUserId?: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  triggerType: TriggerType;
  entityType: "ticket" | "kb_article" | "comment";
  entityId: mongoose.Types.ObjectId;
  title: string;
  body?: string;
  deepLinkUrl: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    triggeredByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
    },
    triggerType: {
      type: String,
      enum: [
        "ticket_created",
        "ticket_assigned_to_me",
        "ticket_reply_added",
        "ticket_status_changed",
        "ticket_mentioned",
        "ticket_closed",
        "ticket_escalated",
        "kb_article_published",
        "kb_article_updated",
        "kb_article_archived",
        "sla_breach_warning",
        "sla_breached",
      ],
      required: true,
    },
    entityType: {
      type: String,
      enum: ["ticket", "kb_article", "comment"],
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
    },
    deepLinkUrl: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance
notificationSchema.index({ recipientUserId: 1, isRead: 1 });
notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({
  recipientUserId: 1,
  triggerType: 1,
  entityId: 1,
  createdAt: -1,
});
notificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  notificationSchema,
);
