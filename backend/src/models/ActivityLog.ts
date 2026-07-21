import mongoose, { Document, Schema } from "mongoose";

export interface IActivityLog extends Document {
  // Nullable: system/cron/seed writes have no acting user (source="system").
  userId?: mongoose.Types.ObjectId | null;
  userName: string;
  userEmail: string;
  action:
    | "create"
    | "update"
    | "delete"
    | "edit"
    | "access_denied"
    | "impersonate"
    | "impersonate_end";
  entity: string; // canonical mongoose model name (e.g. "Ticket", "Project")
  entityId?: string;
  entityName?: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  project?: mongoose.Types.ObjectId | null;
  projectName?: string;
  role?: string;
  /** Origin of the mutation: web | public-api | student | system | job. */
  source?: string;
  /** Resolved request route, e.g. "PUT /api/projects/:id". */
  route?: string;
  method?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false, // null for system/cron/seed writes
      default: null,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "create",
        "update",
        "delete",
        "edit",
        "access_denied",
        "impersonate",
        "impersonate_end",
      ],
      index: true,
    },
    entity: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
    },
    entityName: {
      type: String,
    },
    changes: [
      {
        field: String,
        oldValue: Schema.Types.Mixed,
        newValue: Schema.Types.Mixed,
      },
    ],
    description: {
      type: String,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
    },
    projectName: {
      type: String,
    },
    role: {
      type: String,
    },
    source: {
      type: String,
      index: true,
    },
    route: {
      type: String,
    },
    method: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient querying
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ entity: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });

export default mongoose.model<IActivityLog>("ActivityLog", activityLogSchema);
