import mongoose, { Document, Schema } from "mongoose";

export interface IPermission extends Document {
  module: string;
  name: string;
  code: string;
  description?: string;
  category:
    | "dashboard"
    | "project-management"
    | "master-data"
    | "rbac-setup"
    | "user-management"
    | "fields-forms"
    | "ticket-automation"
    | "ticket-configuration"
    | "approval-process"
    | "workflow-role-mapping"
    | "sla-escalation"
    | "knowledge-base"
    | "notifications"
    | "integrations"
    | "reports"
    | "audit-logs"
    | "tickets"
    | "offline-module"
    | "attendance";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchema = new Schema<IPermission>(
  {
    module: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "dashboard",
        "project-management",
        "master-data",
        "rbac-setup",
        "user-management",
        "fields-forms",
        "ticket-automation",
        "ticket-configuration",
        "approval-process",
        "workflow-role-mapping",
        "sla-escalation",
        "knowledge-base",
        "notifications",
        "feedback",
        "integrations",
        "reports",
        "audit-logs",
        "tickets",
        "offline-module",
        "service-request",
        "attendance",
      ],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
permissionSchema.index({ code: 1 });
permissionSchema.index({ category: 1 });
permissionSchema.index({ module: 1 });

export const Permission = mongoose.model<IPermission>(
  "Permission",
  permissionSchema,
);
