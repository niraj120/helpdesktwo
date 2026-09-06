import mongoose, { Document, Schema } from "mongoose";

export interface IStatus extends Document {
  name: string;
  code: number; // Numeric status code: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
  color: string;
  projectId: mongoose.Types.ObjectId;
  isDefault: boolean;
  isClosed: boolean; // Indicates if this status closes the ticket
  requireClosingRemark: boolean; // If true, agent must provide a remark when applying this status
  /**
   * Whether applying this status also commits the agent to a date.
   *
   * A remark and a date answer different questions: the remark says why, the
   * date says by when. "Work In Progress" wants both; "Closed" wants only the
   * remark. Keeping them separate is what stops a WIP commitment being filed
   * as a closing remark.
   */
  requireCommittedDate: boolean;
  /** What to call that date in the dialog, e.g. "Committed date". */
  committedDateLabel?: string;
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
    requireClosingRemark: {
      type: Boolean,
      default: false, // When true, agent must enter a remark before applying this status
    },
    requireCommittedDate: {
      type: Boolean,
      default: false,
    },
    committedDateLabel: {
      type: String,
      trim: true,
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
