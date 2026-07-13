import mongoose, { Document, Schema } from "mongoose";

/**
 * Per-project IVR digit configuration.
 * Defines the IVR options a caller can press (1 / 2 / 3 / ...) plus the implicit
 * "other" bucket (blank / unmatched). IVR agents are mapped to these codes and
 * missed calls are round-robined within the matching bucket.
 */
export interface IIvrDigit {
  code: string; // e.g. "1", "2", "3"
  label: string; // e.g. "Admissions"
}

export interface IIvrDigitConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  digits: IIvrDigit[];
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** Default buckets when a project has not configured any yet. */
export const DEFAULT_IVR_DIGITS: IIvrDigit[] = [
  { code: "1", label: "Option 1" },
  { code: "2", label: "Option 2" },
  { code: "3", label: "Option 3" },
];

/** The implicit bucket for blank/missed/unmatched digit presses. */
export const OTHER_BUCKET = "other";

const IvrDigitConfigSchema = new Schema<IIvrDigitConfig>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    digits: {
      type: [{ code: { type: String, required: true }, label: String }],
      default: DEFAULT_IVR_DIGITS,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const IvrDigitConfig = mongoose.model<IIvrDigitConfig>(
  "IvrDigitConfig",
  IvrDigitConfigSchema,
);
