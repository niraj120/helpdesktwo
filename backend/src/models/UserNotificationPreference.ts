import mongoose, { Schema, Document } from "mongoose";

export interface IUserNotificationPreference extends Document {
  userId: mongoose.Types.ObjectId;
  triggerType: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  updatedAt: Date;
  createdAt: Date;
}

const userNotificationPreferenceSchema =
  new Schema<IUserNotificationPreference>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
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
      inAppEnabled: {
        type: Boolean,
        default: true,
      },
      emailEnabled: {
        type: Boolean,
        default: true,
      },
    },
    {
      timestamps: true,
    },
  );

// Unique index: one preference row per user per trigger type
userNotificationPreferenceSchema.index(
  { userId: 1, triggerType: 1 },
  { unique: true },
);
userNotificationPreferenceSchema.index({ userId: 1 });

export const UserNotificationPreference =
  mongoose.model<IUserNotificationPreference>(
    "UserNotificationPreference",
    userNotificationPreferenceSchema,
  );
