/**
 * Phase 3 — OIDC security primitives (unit, no network/DB).
 * Covers the pure pieces: PKCE/state generation, redirect-safety, and the
 * strict token-claim validation.
 */
import {
  generateState,
  generateNonce,
  generateCodeVerifier,
  codeChallengeS256,
} from "../src/services/keycloak/pkce";
import {
  safeReturnPath,
  isAllowedPostLogout,
  resolvePostLogout,
} from "../src/services/keycloak/redirectPolicy";
import { validateClaims } from "../src/services/keycloak/oidcClaims";

describe("pkce / state", () => {
  it("generates distinct, URL-safe tokens", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateNonce()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("verifier length is within the PKCE spec (43-128)", () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it("S256 challenge is deterministic + URL-safe", () => {
    const v = "test-verifier-value";
    expect(codeChallengeS256(v)).toEqual(codeChallengeS256(v));
    expect(codeChallengeS256(v)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("safeReturnPath (open-redirect guard)", () => {
  it("keeps a plain relative path", () => {
    expect(safeReturnPath("/vmk/portal/dashboard")).toBe("/vmk/portal/dashboard");
  });
  it("rejects absolute URLs", () => {
    expect(safeReturnPath("https://evil.com")).toBe("/");
  });
  it("rejects protocol-relative //host", () => {
    expect(safeReturnPath("//evil.com/x")).toBe("/");
  });
  it("rejects scheme like javascript:", () => {
    expect(safeReturnPath("javascript:alert(1)")).toBe("/");
  });
  it("rejects backslash and CRLF tricks", () => {
    expect(safeReturnPath("/\\evil.com")).toBe("/");
    expect(safeReturnPath("/a\r\nSet-Cookie: x")).toBe("/");
  });
  it("falls back for non-string / empty", () => {
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath("")).toBe("/");
  });
});

describe("post-logout allow-list", () => {
  const allow = ["https://helpdesk.example.com/signed-out"];
  it("allows exact match", () => {
    expect(isAllowedPostLogout("https://helpdesk.example.com/signed-out", allow)).toBe(true);
  });
  it("denies anything else", () => {
    expect(isAllowedPostLogout("https://helpdesk.example.com/other", allow)).toBe(false);
    expect(isAllowedPostLogout("https://evil.com/signed-out", allow)).toBe(false);
  });
  it("resolvePostLogout falls back when not allow-listed", () => {
    expect(resolvePostLogout("https://evil.com", allow, "https://fallback")).toBe("https://fallback");
    expect(resolvePostLogout(allow[0], allow, "https://fallback")).toBe(allow[0]);
  });
});

describe("validateClaims (strict token validation)", () => {
  const base = {
    iss: "https://kc/realms/hubblehox-prod",
    aud: "helpdesk-web",
    azp: "helpdesk-web",
    nonce: "n1",
    exp: 2000,
    nbf: 900,
  };
  const exp = {
    issuer: "https://kc/realms/hubblehox-prod",
    audience: "helpdesk-web",
    authorizedParty: "helpdesk-web",
    nonce: "n1",
    nowSeconds: 1000,
    clockToleranceSeconds: 60,
  };

  it("accepts a valid token", () => {
    expect(validateClaims(base, exp).ok).toBe(true);
  });
  it("rejects wrong issuer", () => {
    const r = validateClaims({ ...base, iss: "https://kc/realms/other" }, exp);
    expect(r).toEqual({ ok: false, reason: "issuer mismatch" });
  });
  it("rejects wrong audience", () => {
    const r = validateClaims({ ...base, aud: "someone-else" }, exp);
    expect(r).toEqual({ ok: false, reason: "audience mismatch" });
  });
  it("accepts audience array containing the expected value", () => {
    expect(validateClaims({ ...base, aud: ["x", "helpdesk-web"] }, exp).ok).toBe(true);
  });
  it("accepts when any of several expected audiences match", () => {
    const r = validateClaims({ ...base, aud: "helpdesk-parent" }, { ...exp, audience: ["helpdesk-web", "helpdesk-parent"], authorizedParty: undefined });
    expect(r.ok).toBe(true);
  });
  it("rejects azp mismatch", () => {
    const r = validateClaims({ ...base, azp: "attacker" }, exp);
    expect(r).toEqual({ ok: false, reason: "azp mismatch" });
  });
  it("rejects nonce mismatch", () => {
    const r = validateClaims({ ...base, nonce: "n2" }, exp);
    expect(r).toEqual({ ok: false, reason: "nonce mismatch" });
  });
  it("rejects an expired token (beyond tolerance)", () => {
    const r = validateClaims({ ...base, exp: 900 }, { ...exp, nowSeconds: 1000 });
    expect(r).toEqual({ ok: false, reason: "token expired" });
  });
  it("honours clock tolerance on expiry", () => {
    // exp=970, now=1000, tolerance=60 → 970+60=1030 >= 1000 → still valid
    expect(validateClaims({ ...base, exp: 970 }, exp).ok).toBe(true);
  });
  it("rejects a not-yet-valid token", () => {
    const r = validateClaims({ ...base, nbf: 1100 }, { ...exp, nowSeconds: 1000 });
    expect(r).toEqual({ ok: false, reason: "token not yet valid" });
  });
});
