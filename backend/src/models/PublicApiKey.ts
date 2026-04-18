import mongoose, { Document, Schema } from "mongoose";

export interface IPublicApiKey extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string; // Human-readable label e.g. "WhatsApp Bot Key"
  keyHash: string; // bcrypt hash of the full key
  keyPrefix: string; // First 8 chars of the raw key — shown in UI for identification
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PublicApiKeySchema = new Schema<IPublicApiKey>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    keyHash: {
      type: String,
      required: true,
    },
    keyPrefix: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    revokedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Only one active key per project at a time is enforced in the controller, not schema.
PublicApiKeySchema.index({ projectId: 1, isActive: 1 });

export const PublicApiKey = mongoose.model<IPublicApiKey>(
  "PublicApiKey",
  PublicApiKeySchema,
);
