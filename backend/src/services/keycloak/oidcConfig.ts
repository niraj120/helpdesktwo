/**
 * Effective OIDC config per flow (Phase 3).
 *
 * Resolves the (client_id, client_secret, redirect_uri) for the staff vs parent
 * flow from env, and fails LOUDLY at use time if a required value is missing —
 * never a silent fallback. The realm/issuer/audience are shared across flows.
 */
import { config } from "../../config";

export type OidcFlow = "staff" | "parent";

export interface EffectiveOidcConfig {
  flow: OidcFlow;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiAudience: string;
  clockToleranceSeconds: number;
}

function req(value: string, name: string): string {
  if (!value) {
    throw new Error(
      `OIDC misconfigured: ${name} is not set. Refusing to run the SSO flow.`,
    );
  }
  return value;
}

export function isOidcEnabled(): boolean {
  return config.oidc.enabled;
}

export function resolveOidcConfig(flow: OidcFlow): EffectiveOidcConfig {
  const o = config.oidc;
  const issuer = req(o.issuer, "KEYCLOAK_ISSUER");
  if (flow === "parent") {
    return {
      flow,
      issuer,
      clientId: req(o.parentClientId, "OIDC_PARENT_CLIENT_ID"),
      clientSecret: req(o.parentClientSecret, "OIDC_PARENT_CLIENT_SECRET"),
      redirectUri: req(o.parentRedirectUri, "OIDC_PARENT_REDIRECT_URI"),
      apiAudience: o.apiAudience,
      clockToleranceSeconds: o.clockToleranceSeconds,
    };
  }
  return {
    flow,
    issuer,
    clientId: req(o.clientId, "OIDC_CLIENT_ID"),
    clientSecret: req(o.clientSecret, "OIDC_CLIENT_SECRET"),
    redirectUri: req(o.redirectUri, "OIDC_REDIRECT_URI"),
    apiAudience: o.apiAudience,
    clockToleranceSeconds: o.clockToleranceSeconds,
  };
}
