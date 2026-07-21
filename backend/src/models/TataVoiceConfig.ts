import mongoose, { Document, Schema } from "mongoose";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption";

/**
 * Per-project TATA SmartFlo voice credentials for outbound Click-to-Call.
 *
 * Mirrors the SMSConfig pattern: one document per project, the API token stored
 * AES-256-GCM encrypted at rest (pre-save hook), read back via
 * getDecryptedToken(). The inbound webhook does NOT use this — it authenticates
 * with a project PublicApiKey (X-API-Key). This model is purely for the
 * outbound REST API (we call TATA).
 *
 * The SmartFlo API token is a long-lived JWT generated in the SmartFlo portal
 * and sent verbatim in the `Authorization` header (no "Bearer" prefix).
 */
export interface ITataVoiceConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  /** Base URL of the SmartFlo API, e.g. https://api-smartflo.tatateleservices.com/v1 */
  baseUrl: string;
  /** SmartFlo API JWT (encrypted at rest). */
  apiToken: string;
  /**
   * Caller ID shown to the customer. A DID/virtual number assigned to the
   * account. If blank, SmartFlo falls back to the account pilot number.
   */
  defaultCallerId?: string;
  /** Optional auto-disconnect for outbound legs (seconds). */
  callTimeoutSeconds?: number;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  getDecryptedToken(): string;
}

const DEFAULT_BASE_URL =
  process.env.TATA_SMARTFLO_BASE_URL ||
  "https://api-smartflo.tatateleservices.com/v1";

const tataVoiceConfigSchema = new Schema<ITataVoiceConfig>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
      index: true,
    },
    baseUrl: { type: String, required: true, default: DEFAULT_BASE_URL },
    apiToken: { type: String, required: true },
    defaultCallerId: { type: String },
    callTimeoutSeconds: { type: Number },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Encrypt the API token on write, unless it is already ciphertext.
tataVoiceConfigSchema.pre("save", function (next) {
  if (this.isModified("apiToken") && this.apiToken) {
    if (!isEncrypted(this.apiToken)) {
      try {
        this.apiToken = encrypt(this.apiToken);
      } catch (error) {
        return next(error as Error);
      }
    }
  }
  next();
});

tataVoiceConfigSchema.methods.getDecryptedToken = function (): string {
  if (!this.apiToken) return "";
  try {
    return decrypt(this.apiToken);
  } catch (error) {
    console.error("Failed to decrypt TATA voice token:", error);
    return "";
  }
};

export const TataVoiceConfig = mongoose.model<ITataVoiceConfig>(
  "TataVoiceConfig",
  tataVoiceConfigSchema,
);
export default TataVoiceConfig;
