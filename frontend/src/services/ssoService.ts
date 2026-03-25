import axios from "axios";
import { API_CONFIG } from "../config/constants";

export interface SsoKeycloakConfig {
  authUrl: string;
  clientId: string;
  redirectUri: string;
}

export interface SsoState {
  project?: string; // customUrlPath
  type: "project" | "student";
  returnUrl?: string;
  nonce: string;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically random code_verifier (43–128 chars, URL-safe).
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  window.crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Computes the S256 code_challenge from a code_verifier.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await window.crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generateNonce(): string {
  const arr = new Uint8Array(16);
  window.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// State encoding / decoding
// ---------------------------------------------------------------------------

function encodeState(state: SsoState): string {
  return btoa(JSON.stringify(state))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function decodeState(raw: string): SsoState | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core SSO actions
// ---------------------------------------------------------------------------

/**
 * Initiate the PKCE + Keycloak redirect for SSO login.
 *
 * @param keycloakConfig  The SSO config received from the branding API
 * @param project         customUrlPath of the project (for project / student logins)
 * @param type            'project' or 'student'
 * @param returnUrl       URL to navigate to after successful login
 */
export async function loginWithSSO(
  keycloakConfig: SsoKeycloakConfig,
  project: string,
  type: "project" | "student",
  returnUrl?: string,
): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const nonce = generateNonce();

  const state: SsoState = { project, type, returnUrl, nonce };
  const encodedState = encodeState(state);

  // Persist verifier and nonce for the callback handler
  sessionStorage.setItem("sso_code_verifier", codeVerifier);
  sessionStorage.setItem("sso_nonce", nonce);
  sessionStorage.setItem("sso_state", encodedState);

  const authUrl = new URL(keycloakConfig.authUrl);
  authUrl.searchParams.set("client_id", keycloakConfig.clientId);
  authUrl.searchParams.set("redirect_uri", keycloakConfig.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", encodedState);
  authUrl.searchParams.set("nonce", nonce);

  window.location.href = authUrl.toString();
}

/**
 * Exchange the authorization code for a helpdesk JWT via the backend.
 * Called by SsoCallback.tsx after Keycloak redirects back.
 */
export async function handleCallback(
  code: string,
  state: string,
): Promise<any> {
  const codeVerifier = sessionStorage.getItem("sso_code_verifier") || "";
  const storedState = sessionStorage.getItem("sso_state") || "";

  // CSRF check — state must match what we stored
  if (state !== storedState) {
    throw new Error("State mismatch — possible CSRF attack. Please try again.");
  }

  const params = new URLSearchParams({ code, state });
  if (codeVerifier) params.set("code_verifier", codeVerifier);

  const response = await axios.get(
    `${API_CONFIG.API_URL}/keycloak-auth/callback?${params.toString()}`,
  );
  return response.data;
}

/**
 * Store the helpdesk login data in localStorage, identical to the existing
 * email/password login flow so that ProtectedRoute and PermissionContext work
 * without any changes.
 */
export function storeLoginData(data: any): void {
  localStorage.setItem("authToken", data.token);
  localStorage.setItem("userId", data.user.id);
  localStorage.setItem("userEmail", data.user.email);
  localStorage.setItem("user", JSON.stringify(data.user));
  localStorage.setItem("userRole", data.user.role?.code || "");
  if (data.projectId) localStorage.setItem("projectId", data.projectId);
  if (data.permissions) {
    localStorage.setItem("userPermissions", JSON.stringify(data.permissions));
  }
  // Store Keycloak id_token for logout
  if (data.keycloakIdToken) {
    sessionStorage.setItem("kc_id_token", data.keycloakIdToken);
  }
}

/**
 * Clear local session and redirect the browser to Keycloak's end-session URL.
 *
 * @param project         customUrlPath (to resolve per-project Keycloak config)
 * @param postLogoutUrl   Where Keycloak should redirect after logout
 */
export async function ssoLogout(
  project?: string,
  postLogoutUrl?: string,
): Promise<void> {
  const idTokenHint = sessionStorage.getItem("kc_id_token") || "";

  // Clear local storage first
  [
    "authToken",
    "userId",
    "userEmail",
    "user",
    "userRole",
    "projectId",
    "userPermissions",
  ].forEach((key) => localStorage.removeItem(key));
  ["sso_code_verifier", "sso_nonce", "sso_state", "kc_id_token"].forEach(
    (key) => sessionStorage.removeItem(key),
  );

  try {
    const params = new URLSearchParams();
    if (idTokenHint) params.set("id_token_hint", idTokenHint);
    if (postLogoutUrl) params.set("post_logout_redirect_uri", postLogoutUrl);
    if (project) params.set("project", project);

    const { data } = await axios.get(
      `${API_CONFIG.API_URL}/keycloak-auth/logout-url?${params.toString()}`,
    );
    if (data.success && data.data.logoutUrl) {
      window.location.href = data.data.logoutUrl;
      return;
    }
  } catch {
    // Fall through — redirect to local login page on failure
  }

  window.location.href = "/login";
}

/**
 * Clean up PKCE session storage entries after a successful or failed callback.
 */
export function clearPkceSession(): void {
  ["sso_code_verifier", "sso_nonce", "sso_state"].forEach((key) =>
    sessionStorage.removeItem(key),
  );
}
