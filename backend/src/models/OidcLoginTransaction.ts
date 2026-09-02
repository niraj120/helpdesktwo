import mongoose, { Document, Schema } from "mongoose";

/**
 * A one-time, server-side OIDC login transaction (Phase 3).
 *
 * The security-critical values (state, nonce, PKCE verifier, the return path)
 * live HERE, on the server — never in the browser. At callback we look the
 * transaction up by `state`, reject if unknown/expired/used, and consume it.
 * This replaces the prototype's browser-controlled, base64-encoded `state`.
 *
 * Mongo TTL (`expiresAt`) auto-expires abandoned transactions.
 */
export interface IOidcLoginTransaction extends Document {
  state: string; // random; the only value sent to Keycloak
  nonce: string; // random; must match the id_token nonce
  codeVerifier: string; // PKCE verifier (challenge is derived, sent to Keycloak)
  /** Which login this is — decides staff vs parent resolution + which client. */
  flow: "staff" | "parent";
  /** Relative Helpdesk path to return to after login. Never a full URL. */
  returnPath: string;
  used: boolean;
  createdAt: Date;
  expiresAt: Date;
}

const schema = new Schema<IOidcLoginTransaction>({
  state: { type: String, required: true, unique: true, index: true },
  nonce: { type: String, required: true },
  codeVerifier: { type: String, required: true },
  flow: { type: String, enum: ["staff", "parent"], default: "staff" },
  returnPath: { type: String, default: "/" },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  // TTL index — Mongo removes the doc at expiresAt. 10 min is ample for a login.
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const OidcLoginTransaction = mongoose.model<IOidcLoginTransaction>(
  "OidcLoginTransaction",
  schema,
);
export default OidcLoginTransaction;
