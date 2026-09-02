/**
 * Redirect safety (Phase 3) — prevents open-redirect via login/logout.
 *
 * - Deep links: we only ever store and redirect to a RELATIVE Helpdesk path.
 *   Anything with a scheme or host (`//evil.com`, `https://…`, backslashes) is
 *   rejected and replaced with a safe default.
 * - Post-logout: Keycloak may only bounce back to an EXACT allow-listed URL.
 */

const DEFAULT_RETURN = "/";

/**
 * Normalise a caller-supplied return target to a safe relative path.
 * Returns DEFAULT_RETURN if the input tries to leave the site.
 */
export function safeReturnPath(input: unknown, fallback = DEFAULT_RETURN): string {
  if (typeof input !== "string" || input.length === 0) return fallback;
  let s = input.trim();

  // Must be a site-relative path.
  if (!s.startsWith("/")) return fallback;
  // Protocol-relative (`//host`) or backslash tricks (`/\host`) escape the site.
  if (s.startsWith("//") || s.startsWith("/\\")) return fallback;
  // No scheme, no embedded host, no CR/LF header injection.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return fallback; // e.g. "javascript:", "https:"
  if (/[\r\n]/.test(s)) return fallback;
  if (s.includes("\\")) return fallback;

  return s;
}

/** Exact-match check for the post-logout redirect against the allow-list. */
export function isAllowedPostLogout(
  url: unknown,
  allowlist: string[],
): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  return allowlist.includes(url);
}

/** Pick the post-logout URL: caller value if allow-listed, else the default. */
export function resolvePostLogout(
  requested: unknown,
  allowlist: string[],
  fallback: string,
): string {
  return isAllowedPostLogout(requested, allowlist) ? (requested as string) : fallback;
}
