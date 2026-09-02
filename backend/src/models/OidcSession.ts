import mongoose, { Document, Schema } from "mongoose";

/**
 * Server-side BFF session (Phase 3). The browser holds only an opaque,
 * HttpOnly cookie carrying `sessionId`; every token stays on the backend.
 *
 * Supports:
 *  - idle + absolute expiry (checked on read; TTL index is the absolute backstop)
 *  - explicit revocation (local logout)
 *  - backchannel logout: find by Keycloak session id (`kcSid`) or subject.
 *
 * Two principal types share one store:
 *  - staff  → linked to a Helpdesk User (userId)
 *  - parent → resolved from the Guardian Master (no User row); keyed by parentId.
 */
export interface IOidcSession extends Document {
  sessionId: string; // opaque; the value in the cookie
  principalType: "staff" | "parent";
  userId?: mongoose.Types.ObjectId; // staff only
  parentId?: string; // parent only (MDM guardian id)
  keycloakSub: string;
  keycloakIssuer: string;
  kcSid?: string; // Keycloak session id (sid claim) — for backchannel logout
  idToken?: string; // kept for RP-initiated logout id_token_hint
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date; // bumped on each authorized request
  absoluteExpiresAt: Date; // hard cap; also the TTL index
  revoked: boolean;
}

const schema = new Schema<IOidcSession>({
  sessionId: { type: String, required: true, unique: true, index: true },
  principalType: { type: String, enum: ["staff", "parent"], required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  parentId: { type: String, index: true },
  keycloakSub: { type: String, required: true, index: true },
  keycloakIssuer: { type: String, required: true },
  kcSid: { type: String, index: true },
  idToken: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  idleExpiresAt: { type: Date, required: true },
  // TTL index — the absolute cap also garbage-collects expired sessions.
  absoluteExpiresAt: { type: Date, required: true, index: { expires: 0 } },
  revoked: { type: Boolean, default: false, index: true },
});

// Backchannel logout matches by (issuer, sub) or (issuer, kcSid).
schema.index({ keycloakIssuer: 1, keycloakSub: 1 });
schema.index({ keycloakIssuer: 1, kcSid: 1 });

export const OidcSession = mongoose.model<IOidcSession>(
  "OidcSession",
  schema,
);
export default OidcSession;
