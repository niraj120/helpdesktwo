/**
 * BFF session lifecycle (Phase 3). Opaque server-side sessions; the browser
 * holds only an HttpOnly cookie. Idle + absolute expiry, explicit revocation,
 * and backchannel revocation by Keycloak sid/sub.
 */
import { CookieOptions } from "express";
import { OidcSession } from "../../models/OidcSession";
import { randomToken } from "./pkce";
import { config } from "../../config";

export interface CreateSessionInput {
  principalType: "staff" | "parent";
  userId?: string;
  parentId?: string;
  keycloakSub: string;
  keycloakIssuer: string;
  kcSid?: string;
  idToken?: string;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export function cookieName(): string {
  return config.oidc.cookieName;
}

export function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction, // HTTPS-only in prod
    sameSite: "lax", // allows the OIDC redirect round-trip
    path: "/",
    maxAge: maxAgeMs,
  };
}

export async function createSession(input: CreateSessionInput) {
  const now = Date.now();
  const idleMs = config.oidc.sessionIdleMinutes * MINUTE;
  const absoluteMs = config.oidc.sessionAbsoluteHours * HOUR;
  const sessionId = randomToken(32);

  await OidcSession.create({
    sessionId,
    principalType: input.principalType,
    userId: input.userId,
    parentId: input.parentId,
    keycloakSub: input.keycloakSub,
    keycloakIssuer: input.keycloakIssuer,
    kcSid: input.kcSid,
    idToken: input.idToken,
    createdAt: new Date(now),
    lastSeenAt: new Date(now),
    idleExpiresAt: new Date(now + idleMs),
    absoluteExpiresAt: new Date(now + absoluteMs),
    revoked: false,
  });

  // Cookie lifetime = the absolute cap; idle is enforced server-side on read.
  return { sessionId, cookieMaxAgeMs: absoluteMs };
}

/**
 * Load a session and, if valid, slide the idle window forward. Returns null for
 * missing / revoked / expired sessions (caller then restarts login).
 */
export async function getValidSession(sessionId: string) {
  if (!sessionId) return null;
  const s = await OidcSession.findOne({ sessionId });
  if (!s || s.revoked) return null;
  const now = Date.now();
  if (s.absoluteExpiresAt.getTime() < now) return null;
  if (s.idleExpiresAt.getTime() < now) return null;

  s.lastSeenAt = new Date(now);
  s.idleExpiresAt = new Date(now + config.oidc.sessionIdleMinutes * MINUTE);
  await s.save();
  return s;
}

export async function revokeSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await OidcSession.updateOne({ sessionId }, { $set: { revoked: true } });
}

/** Backchannel logout: revoke every live session for a Keycloak sid or sub. */
export async function revokeByKeycloak(params: {
  issuer: string;
  sid?: string;
  sub?: string;
}): Promise<number> {
  const or: any[] = [];
  if (params.sid) or.push({ kcSid: params.sid });
  if (params.sub) or.push({ keycloakSub: params.sub });
  if (or.length === 0) return 0;
  const res = await OidcSession.updateMany(
    { keycloakIssuer: params.issuer, revoked: false, $or: or },
    { $set: { revoked: true } },
  );
  return res.modifiedCount ?? 0;
}
