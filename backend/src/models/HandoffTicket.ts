import mongoose, { Document, Schema } from "mongoose";

/**
 * A one-time login handoff ticket, minted by POST /v1/auth/login-url and
 * consumed by POST /api/auth/handoff/redeem.
 *
 * The ticket that travels in the URL is 32 random bytes — NOT a JWT. Only its
 * SHA-256 hash is stored, so a database leak yields nothing usable, and a
 * leaked URL cannot be replayed: redemption flips `usedAt` inside a single
 * atomic findOneAndUpdate, so exactly one redeem of a given ticket can win.
 *
 * Mongo's TTL index on `expiresAt` clears consumed and abandoned tickets.
 */
export interface IHandoffTicket extends Document {
  /** sha256(ticket) as hex. The plaintext ticket is never stored. */
  tokenHash: string;
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  /** Which API key minted this — for audit and for revocation forensics. */
  apiKeyId?: mongoose.Types.ObjectId;
  /** Relative Helpdesk path to land on. Never a full URL. */
  returnPath: string;
  /** Set once, atomically, at redeem. Null until then. */
  usedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}

const schema = new Schema<IHandoffTicket>({
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  apiKeyId: { type: Schema.Types.ObjectId, ref: "PublicApiKey" },
  returnPath: { type: String, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  // TTL index — Mongo removes the doc at expiresAt.
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

// Audit queries: "every handoff minted for this user, newest first".
schema.index({ userId: 1, createdAt: -1 });

export const HandoffTicket = mongoose.model<IHandoffTicket>(
  "HandoffTicket",
  schema,
);
export default HandoffTicket;
