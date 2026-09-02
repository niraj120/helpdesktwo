/**
 * OIDC client for Keycloak (Phase 3): discovery, code exchange, and STRICT
 * token validation. The prototype checked only issuer + signature; this enforces
 * issuer, audience, authorized party, algorithm, expiry/not-before, nonce, and a
 * JWKS signature selected by `kid`.
 *
 * The pure claim checks (`validateClaims`) are exported and unit-tested without a
 * network; signature verification uses the realm JWKS.
 */
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { validateClaims, ClaimExpectations } from "./oidcClaims";

// Re-export the pure claim validator so callers can import it from here too.
export { validateClaims, ClaimExpectations } from "./oidcClaims";

export interface DiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  issuer: string;
}

const discoveryCache = new Map<string, { doc: DiscoveryDoc; exp: number }>();
const jwksCache = new Map<string, ReturnType<typeof jwksRsa>>();
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

export async function discover(issuer: string): Promise<DiscoveryDoc> {
  const hit = discoveryCache.get(issuer);
  if (hit && hit.exp > Date.now()) return hit.doc;
  const url = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) for ${url}`);
  }
  const doc = (await res.json()) as DiscoveryDoc;
  discoveryCache.set(issuer, { doc, exp: Date.now() + DISCOVERY_TTL_MS });
  return doc;
}

function jwksClientFor(jwksUri: string) {
  if (!jwksCache.has(jwksUri)) {
    jwksCache.set(
      jwksUri,
      jwksRsa({ jwksUri, cache: true, cacheMaxAge: 10 * 60 * 1000, rateLimit: true }),
    );
  }
  return jwksCache.get(jwksUri)!;
}

/** Verify RS256 signature against the realm JWKS (selected by kid). */
async function verifySignature(token: string, jwksUri: string): Promise<Record<string, any>> {
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) throw new Error("token has no kid");
  const key = await jwksClientFor(jwksUri).getSigningKey(kid);
  const pub = key.getPublicKey();
  return jwt.verify(token, pub, { algorithms: ["RS256"] }) as Record<string, any>;
}

/** Full id-token validation: signature (RS256/JWKS) + strict claims. */
export async function validateIdToken(
  token: string,
  issuer: string,
  exp: Omit<ClaimExpectations, "issuer" | "nowSeconds"> & { nowSeconds?: number; audience: string | string[] },
): Promise<Record<string, any>> {
  const doc = await discover(issuer);
  const payload = await verifySignature(token, doc.jwks_uri);
  const result = validateClaims(payload, {
    issuer,
    audience: exp.audience,
    authorizedParty: exp.authorizedParty,
    nonce: exp.nonce,
    nowSeconds: exp.nowSeconds ?? Math.floor(Date.now() / 1000),
    clockToleranceSeconds: exp.clockToleranceSeconds,
  });
  if (!result.ok) throw new Error(`id_token invalid: ${result.reason}`);
  return payload;
}

/** Exchange an authorization code for tokens (confidential client + PKCE). */
export async function exchangeCode(params: {
  issuer: string;
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ id_token: string; access_token: string; refresh_token?: string }> {
  const doc = await discover(params.issuer);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as any;
}

/**
 * Validate a Keycloak Backchannel-Logout token. Same signature/claim rules, and
 * it must carry the backchannel-logout event plus a sid or sub.
 */
export async function validateLogoutToken(
  token: string,
  issuer: string,
  exp: { audience: string | string[]; clockToleranceSeconds: number; nowSeconds?: number },
): Promise<{ sid?: string; sub?: string }> {
  const doc = await discover(issuer);
  const payload = await verifySignature(token, doc.jwks_uri);
  const result = validateClaims(payload, {
    issuer,
    audience: exp.audience,
    nowSeconds: exp.nowSeconds ?? Math.floor(Date.now() / 1000),
    clockToleranceSeconds: exp.clockToleranceSeconds,
  });
  if (!result.ok) throw new Error(`logout_token invalid: ${result.reason}`);
  const events = payload.events || {};
  const isLogout =
    typeof events === "object" &&
    Object.keys(events).some((k) => k.includes("backchannel-logout"));
  if (!isLogout) throw new Error("logout_token missing backchannel-logout event");
  if (!payload.sid && !payload.sub) {
    throw new Error("logout_token has neither sid nor sub");
  }
  return { sid: payload.sid, sub: payload.sub };
}

export function buildAuthorizationUrl(params: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const u = new URL(params.authorizationEndpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("scope", params.scope);
  u.searchParams.set("state", params.state);
  u.searchParams.set("nonce", params.nonce);
  u.searchParams.set("code_challenge", params.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}
