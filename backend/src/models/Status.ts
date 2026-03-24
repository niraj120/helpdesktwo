import mongoose, { Document, Schema } from "mongoose";

export interface IStatus extends Document {
  name: string;
  code: number; // Numeric status code: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
  color: string;
  projectId: mongoose.Types.ObjectId;
  isDefault: boolean;
  isClosed: boolean; // Indicates if this status closes the ticket
  displayOrder: number;
  description?: string;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StatusSchema = new Schema<IStatus>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: Number, // Numeric status code: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
      required: true,
    },
    color: {
      type: String,
      required: true,
      default: "#3b82f6",
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    collection: "status", // Explicitly set collection name to match database
  },
);

// Compound index for unique status code per project
StatusSchema.index({ code: 1, projectId: 1 }, { unique: true });

// Index for efficient queries
StatusSchema.index({ projectId: 1, isActive: 1 });
StatusSchema.index({ projectId: 1, displayOrder: 1 });

export const Status = mongoose.model<IStatus>("Status", StatusSchema, "status");
