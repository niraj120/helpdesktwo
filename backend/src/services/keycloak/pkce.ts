/**
 * PKCE + state/nonce generation (Phase 3) — server-side only.
 *
 * The prototype generated these in the browser; that let a client forge login
 * state. Here the backend mints them, stores them in the login transaction, and
 * only sends `state` + the derived S256 challenge to Keycloak.
 */
import crypto from "crypto";

const b64url = (buf: Buffer): string =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Random opaque token (default 32 bytes → 43-char base64url). */
export const randomToken = (bytes = 32): string => b64url(crypto.randomBytes(bytes));

export const generateState = (): string => randomToken();
export const generateNonce = (): string => randomToken();
/** PKCE verifier: 43–128 chars, URL-safe. 64 bytes → 86 chars. */
export const generateCodeVerifier = (): string => randomToken(64);

/** S256 challenge = base64url(SHA-256(verifier)). */
export const codeChallengeS256 = (verifier: string): string =>
  b64url(crypto.createHash("sha256").update(verifier).digest());
