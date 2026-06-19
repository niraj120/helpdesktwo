import type { Request } from "express";

/**
 * Resolve the public base URL (scheme + host, no trailing slash) to use in
 * user-facing links such as the login URL inside welcome emails.
 *
 * The system is multi-tenant: each project is served from its own domain
 * (e.g. https://sac.maharashtracet.org). Links must therefore reflect the
 * project the user is actually on — never a hardcoded localhost or the shared
 * default domain.
 *
 * Order of preference:
 *   1. The project's configured whitelabel domain (`branding.domainUrl`).
 *   2. The Origin/Referer the request actually came from (so a student on
 *      https://sac.maharashtracet.org gets that exact host).
 *   3. Environment fallbacks (PRODUCTION_FRONTEND_URL / FRONTEND_URL).
 *   4. http://localhost:3001 as a last resort (local dev only).
 */
export const resolveProjectBaseUrl = (
  project?: { branding?: { domainUrl?: string } } | null,
  req?: Request,
): string => {
  const normalize = (raw?: string | null): string | undefined => {
    const v = (raw || "").trim();
    if (!v) return undefined;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    return withScheme.replace(/\/+$/, ""); // strip trailing slashes
  };

  // 1. Project's own configured domain (whitelabel)
  const fromProject = normalize(project?.branding?.domainUrl);
  if (fromProject) return fromProject;

  // 2. The origin the request actually came from
  if (req) {
    const originHeader =
      (req.get?.("origin") as string | undefined) ||
      (req.get?.("referer") as string | undefined);
    if (originHeader) {
      try {
        const u = new URL(originHeader);
        return `${u.protocol}//${u.host}`;
      } catch {
        const n = normalize(originHeader);
        if (n) return n;
      }
    }
  }

  // 3. Environment fallback
  const fromEnv =
    process.env.NODE_ENV === "production"
      ? process.env.PRODUCTION_FRONTEND_URL || process.env.FRONTEND_URL
      : process.env.FRONTEND_URL;
  const env = normalize(fromEnv);
  if (env) return env;

  // 4. Last resort (local dev)
  return "http://localhost:3001";
};

/**
 * Build the project portal login URL used in welcome emails.
 * Produces `<base>/<customUrlPath>/portal/login`, or `<base>/login` when the
 * project has no custom URL path.
 */
export const buildProjectLoginUrl = (
  project?:
    | { branding?: { domainUrl?: string; customUrlPath?: string } }
    | null,
  req?: Request,
): string => {
  const base = resolveProjectBaseUrl(project, req);
  const customUrlPath = project?.branding?.customUrlPath?.trim();
  return customUrlPath
    ? `${base}/${customUrlPath}/portal/login`
    : `${base}/login`;
};
