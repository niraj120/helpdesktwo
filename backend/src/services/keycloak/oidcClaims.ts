/**
 * Pure OIDC token-claim validation (Phase 3). No network / no crypto imports —
 * kept separate from oidcClient so it is unit-testable without pulling in the
 * JWKS/jose stack. Signature verification lives in oidcClient.
 */
export interface ClaimExpectations {
  issuer: string;
  /** token aud must include at least one of these (client id / api audience). */
  audience: string | string[];
  /** azp must equal this when present (typically the client id). */
  authorizedParty?: string;
  /** required nonce for the login id-token; omit for tokens without a nonce. */
  nonce?: string;
  nowSeconds: number;
  clockToleranceSeconds: number;
}

export function validateClaims(
  payload: Record<string, any>,
  exp: ClaimExpectations,
): { ok: true } | { ok: false; reason: string } {
  if (payload.iss !== exp.issuer) return { ok: false, reason: "issuer mismatch" };

  const wanted = Array.isArray(exp.audience) ? exp.audience : [exp.audience];
  const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const audOk = wanted.some((w) => tokenAud.includes(w));
  if (!audOk) return { ok: false, reason: "audience mismatch" };

  if (exp.authorizedParty && payload.azp && payload.azp !== exp.authorizedParty) {
    return { ok: false, reason: "azp mismatch" };
  }
  if (exp.nonce !== undefined && payload.nonce !== exp.nonce) {
    return { ok: false, reason: "nonce mismatch" };
  }

  const skew = exp.clockToleranceSeconds;
  if (typeof payload.exp === "number" && payload.exp + skew < exp.nowSeconds) {
    return { ok: false, reason: "token expired" };
  }
  if (typeof payload.nbf === "number" && payload.nbf - skew > exp.nowSeconds) {
    return { ok: false, reason: "token not yet valid" };
  }
  return { ok: true };
}
