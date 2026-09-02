/**
 * OIDC SSO endpoints (Phase 3) — the production Authorization-Code + PKCE + BFF
 * flow. Mounted only when OIDC is enabled. Replaces the prototype
 * /api/keycloak-auth bridge (retired in Phase 5).
 *
 *   GET  /api/auth/oidc/login              start login (server-side transaction)
 *   GET  /api/auth/oidc/callback           validate + create BFF session
 *   GET  /api/auth/session                 current principal (presentation only)
 *   POST /api/auth/logout                  revoke local session + RP-initiated logout
 *   POST /api/auth/oidc/backchannel-logout Keycloak → revoke by sid/sub
 */
import { Request, Response } from "express";
import { config } from "../config";
import { OidcLoginTransaction } from "../models/OidcLoginTransaction";
import {
  generateState,
  generateNonce,
  generateCodeVerifier,
  codeChallengeS256,
} from "../services/keycloak/pkce";
import { safeReturnPath, resolvePostLogout } from "../services/keycloak/redirectPolicy";
import { resolveOidcConfig, OidcFlow } from "../services/keycloak/oidcConfig";
import {
  discover,
  exchangeCode,
  validateIdToken,
  validateLogoutToken,
  buildAuthorizationUrl,
} from "../services/keycloak/oidcClient";
import { resolveStaff, resolveParent } from "../services/keycloak/principalResolver";
import {
  createSession,
  getValidSession,
  revokeSession,
  revokeByKeycloak,
  sessionCookieOptions,
  cookieName,
} from "../services/keycloak/sessionService";

const TX_TTL_MS = 10 * 60 * 1000;

/** Read a single cookie without adding cookie-parser. */
function readCookie(req: Request, name: string): string {
  const raw = req.headers.cookie;
  if (!raw) return "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

const frontend = () => config.urls.frontend.replace(/\/+$/, "");

// ── GET /api/auth/oidc/login ────────────────────────────────────────────────
export const oidcLogin = async (req: Request, res: Response) => {
  try {
    const flow: OidcFlow = req.query.flow === "parent" ? "parent" : "staff";
    const returnPath = safeReturnPath(req.query.return);
    const cfg = resolveOidcConfig(flow);

    const state = generateState();
    const nonce = generateNonce();
    const codeVerifier = generateCodeVerifier();

    await OidcLoginTransaction.create({
      state,
      nonce,
      codeVerifier,
      flow,
      returnPath,
      used: false,
      expiresAt: new Date(Date.now() + TX_TTL_MS),
    });

    const doc = await discover(cfg.issuer);
    const url = buildAuthorizationUrl({
      authorizationEndpoint: doc.authorization_endpoint,
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      scope: "openid email profile",
      state,
      nonce,
      codeChallenge: codeChallengeS256(codeVerifier),
    });
    return res.redirect(url);
  } catch (e: any) {
    console.error("[oidc] login failed:", e?.message);
    return res.redirect(`${frontend()}/login?error=sso_init`);
  }
};

// ── GET /api/auth/oidc/callback ─────────────────────────────────────────────
export const oidcCallback = async (req: Request, res: Response) => {
  const { code, state } = req.query as Record<string, string>;
  const deny = (reason: string) => {
    console.warn("[oidc] callback denied:", reason);
    return res.redirect(`${frontend()}/access-denied`);
  };
  try {
    if (!code || !state) return deny("missing code/state");

    // One-time transaction: atomically claim it (unknown/used/expired → null).
    const tx = await OidcLoginTransaction.findOneAndUpdate(
      { state, used: false, expiresAt: { $gt: new Date() } },
      { $set: { used: true } },
    );
    if (!tx) return deny("invalid/expired/replayed state");

    const cfg = resolveOidcConfig(tx.flow as OidcFlow);
    const tokens = await exchangeCode({
      issuer: cfg.issuer,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      code,
      codeVerifier: tx.codeVerifier,
      redirectUri: cfg.redirectUri,
    });

    const claims = await validateIdToken(tokens.id_token, cfg.issuer, {
      audience: cfg.clientId,
      authorizedParty: cfg.clientId,
      nonce: tx.nonce,
      clockToleranceSeconds: cfg.clockToleranceSeconds,
    });

    const resolved =
      tx.flow === "parent"
        ? resolveParent(claims, cfg.issuer)
        : await resolveStaff(claims, cfg.issuer);
    if (!resolved.ok) return deny(resolved.reason);

    const p = resolved.principal;
    const { sessionId, cookieMaxAgeMs } = await createSession({
      principalType: p.type,
      userId: p.type === "staff" ? p.userId : undefined,
      parentId: p.type === "parent" ? p.parentId : undefined,
      keycloakSub: p.keycloakSub,
      keycloakIssuer: p.keycloakIssuer,
      kcSid: claims.sid,
      idToken: tokens.id_token,
    });

    res.cookie(cookieName(), sessionId, sessionCookieOptions(cookieMaxAgeMs));
    return res.redirect(`${frontend()}${safeReturnPath(tx.returnPath)}`);
  } catch (e: any) {
    return deny(e?.message || "callback error");
  }
};

// ── GET /api/auth/session ───────────────────────────────────────────────────
export const oidcSession = async (req: Request, res: Response) => {
  const sid = readCookie(req, cookieName());
  const s = await getValidSession(sid);
  if (!s) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    principalType: s.principalType,
    userId: s.userId ? String(s.userId) : undefined,
    parentId: s.parentId,
    // Full permissions/projects are loaded by the existing per-request
    // authorization; this endpoint is presentation-only.
  });
};

// ── POST /api/auth/logout ───────────────────────────────────────────────────
export const oidcLogout = async (req: Request, res: Response) => {
  const sid = readCookie(req, cookieName());
  const s = await getValidSession(sid);
  const idTokenHint = s?.idToken;
  const issuer = s?.keycloakIssuer;

  // Revoke the local session FIRST, then clear the cookie.
  await revokeSession(sid);
  res.clearCookie(cookieName(), sessionCookieOptions(0));

  // Build the Keycloak RP-initiated logout URL (post-logout is allow-listed).
  try {
    if (issuer) {
      const doc = await discover(issuer);
      const endSession = doc.end_session_endpoint;
      if (endSession) {
        const url = new URL(endSession);
        if (idTokenHint) url.searchParams.set("id_token_hint", idTokenHint);
        const postLogout = resolvePostLogout(
          req.body?.post_logout_redirect_uri,
          config.oidc.postLogoutAllowlist,
          config.oidc.postLogoutRedirectUri,
        );
        if (postLogout) url.searchParams.set("post_logout_redirect_uri", postLogout);
        return res.json({ success: true, logoutUrl: url.toString() });
      }
    }
  } catch (e: any) {
    console.error("[oidc] logout url build failed:", e?.message);
  }
  return res.json({ success: true, logoutUrl: `${frontend()}/login` });
};

// ── POST /api/auth/oidc/backchannel-logout ──────────────────────────────────
// Called by Keycloak (server-to-server, no cookie). Validates the signed logout
// token and revokes matching local sessions by sid/sub.
export const oidcBackchannelLogout = async (req: Request, res: Response) => {
  try {
    const token = req.body?.logout_token;
    if (!token) return res.status(400).json({ error: "missing logout_token" });

    const issuer = config.oidc.issuer;
    const audiences = [config.oidc.clientId, config.oidc.parentClientId].filter(Boolean);
    const { sid, sub } = await validateLogoutToken(token, issuer, {
      audience: audiences,
      clockToleranceSeconds: config.oidc.clockToleranceSeconds,
    });
    const revoked = await revokeByKeycloak({ issuer, sid, sub });
    console.log(`[oidc] backchannel logout revoked ${revoked} session(s)`);
    return res.status(200).json({ revoked });
  } catch (e: any) {
    console.warn("[oidc] backchannel logout rejected:", e?.message);
    return res.status(400).json({ error: "invalid logout_token" });
  }
};
