import mongoose, { Schema, Document } from "mongoose";

export interface INotificationSetting extends Document {
  projectId?: mongoose.Types.ObjectId; // null = global default
  triggerType: string;
  roleId: mongoose.Types.ObjectId;
  isEnabled: boolean;
  channels: {
    inApp: boolean;
    email: boolean;
  };
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  createdAt: Date;
}

const notificationSettingSchema = new Schema<INotificationSetting>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
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
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Unique sparse compound index: project + trigger + role
// Sparse allows multiple null projectId values (global defaults per trigger+role)
notificationSettingSchema.index(
  { projectId: 1, triggerType: 1, roleId: 1 },
  { unique: true, sparse: true },
);
notificationSettingSchema.index({ triggerType: 1 });
notificationSettingSchema.index({ roleId: 1 });

export const NotificationSetting = mongoose.model<INotificationSetting>(
  "NotificationSetting",
  notificationSettingSchema,
);
