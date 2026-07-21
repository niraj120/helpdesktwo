import mongoose, { Document, Schema } from "mongoose";

/**
 * Per-project DID (TATA SmartFlo virtual number) registry.
 *
 * The call centre runs multiple DIDs; a Vodafone line forwards incoming calls
 * across them. Each DID has one or more dedicated agents. On an ANSWERED call
 * the webhook's `call_to_number` tells us which DID was picked up, and this
 * registry maps that DID → the helpdesk agent(s) — giving identity parity even
 * though SmartFlo exposes no stable agent id (only a phone number).
 *
 * `agentUserIds` is an array so a DID can map 1:1 or 1:many, editable anytime.
 */
export interface IIvrDidConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  /** The DID / virtual number as configured in SmartFlo. */
  didNumber: string;
  /** Friendly label, e.g. "IVR 1" / "Admissions line". */
  label?: string;
  /** Dedicated helpdesk agent(s) for this DID (1:1 or 1:many). */
  agentUserIds: mongoose.Types.ObjectId[];
  active: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const IvrDidConfigSchema = new Schema<IIvrDidConfig>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    didNumber: { type: String, required: true, trim: true },
    label: { type: String, trim: true },
    agentUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    active: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// One entry per DID per project.
IvrDidConfigSchema.index({ projectId: 1, didNumber: 1 }, { unique: true });

export const IvrDidConfig = mongoose.model<IIvrDidConfig>(
  "IvrDidConfig",
  IvrDidConfigSchema,
);
export default IvrDidConfig;
