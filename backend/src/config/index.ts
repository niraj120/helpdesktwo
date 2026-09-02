/**
 * Application Configuration
 * Centralizes all environment variable access with proper validation
 */

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment =
  process.env.NODE_ENV === "development" || !process.env.NODE_ENV;

/**
 * Get JWT Secret with proper validation
 * In production: Warns if JWT_SECRET contains "CHANGE-THIS" but doesn't block startup
 * In development: Uses fallback with warning
 */
const WEAK_SECRET_MARKERS = ["CHANGE-THIS", "change-this", "your-super-secret"];

const isWeakSecret = (secret: string): boolean =>
  WEAK_SECRET_MARKERS.some((m) => secret.includes(m)) || secret.length < 32;

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  // Production: a missing or weak secret is a hard failure. Never fall back to a
  // known/placeholder value — a shared fallback lets anyone forge Helpdesk JWTs.
  if (isProduction) {
    if (!secret) {
      throw new Error(
        "FATAL: JWT_SECRET is not set in production. Refusing to start. " +
          "Generate one: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
      );
    }
    if (isWeakSecret(secret)) {
      throw new Error(
        "FATAL: JWT_SECRET is a placeholder or shorter than 32 chars in production. " +
          "Refusing to start. Set a strong, unique secret.",
      );
    }
    return secret;
  }

  // Development only: allow a fallback, but say so loudly.
  if (!secret) {
    console.warn(
      "⚠️  JWT_SECRET not set. Using development fallback. NEVER use in production.",
    );
    return "dev-only-fallback-secret-change-in-production";
  }
  return secret;
};

/**
 * Get JWT Refresh Secret with proper validation
 */
const getJwtRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (isProduction) {
    if (!secret) {
      throw new Error(
        "FATAL: JWT_REFRESH_SECRET is not set in production. Refusing to start.",
      );
    }
    if (isWeakSecret(secret)) {
      throw new Error(
        "FATAL: JWT_REFRESH_SECRET is a placeholder or too short in production. Refusing to start.",
      );
    }
    return secret;
  }

  // Development only.
  if (!secret) {
    console.warn(
      "⚠️  JWT_REFRESH_SECRET not set. Using development fallback. NEVER use in production.",
    );
    return process.env.JWT_SECRET || "dev-only-fallback-refresh-secret";
  }
  return secret;
};

export const config = {
  // Environment
  isProduction,
  isDevelopment,
  nodeEnv: process.env.NODE_ENV || "development",

  // Server
  port: parseInt(process.env.PORT || "3003", 10),

  // JWT Configuration
  jwt: {
    secret: getJwtSecret(),
    refreshSecret: getJwtRefreshSecret(),
    expiresIn: process.env.JWT_EXPIRE || process.env.JWT_EXPIRES_IN || "7d",
    refreshExpiresIn:
      process.env.JWT_REFRESH_EXPIRE ||
      process.env.JWT_REFRESH_EXPIRES_IN ||
      "30d",
  },

  // Database - Conditional based on NODE_ENV only.
  // Never hardcode a credentialed URI here; the live connection reads
  // MONGODB_URI / MONGODB_PRODUCTION_URI from the environment (see database.ts).
  database: {
    localUri:
      process.env.MONGODB_LOCAL_URI || "mongodb://localhost:27017/sac_helpdesk",
    productionUri: process.env.MONGODB_PRODUCTION_URI || "",
  },

  // CORS & URLs - Auto-selected based on NODE_ENV from .env
  cors: {
    allowedOrigins: (isProduction
      ? process.env.ALLOWED_ORIGINS_PRODUCTION ||
        "https://helpdesk.hubblehox.ai"
      : process.env.ALLOWED_ORIGINS_LOCAL ||
        "http://localhost:3001,http://localhost:3000"
    )
      .split(",")
      .map((o) => o.trim()),
  },

  urls: {
    frontend: isProduction
      ? process.env.FRONTEND_URL_PRODUCTION || "https://helpdesk.hubblehox.ai"
      : process.env.FRONTEND_URL_LOCAL || "http://localhost:3001",
    backend: isProduction
      ? process.env.BACKEND_URL_PRODUCTION || "https://helpdesk.hubblehox.ai"
      : process.env.BACKEND_URL_LOCAL || "http://localhost:3003",
    api: isProduction
      ? process.env.API_URL_PRODUCTION || "https://helpdesk.hubblehox.ai/api"
      : process.env.API_URL_LOCAL || "http://localhost:3003/api",
    socketCors: isProduction
      ? process.env.SOCKET_CORS_ORIGIN_PRODUCTION ||
        "https://helpdesk.hubblehox.ai"
      : process.env.SOCKET_CORS_ORIGIN_LOCAL || "http://localhost:3001",
  },

  // File Upload
  upload: {
    maxSize: parseInt(process.env.MAX_FILE_SIZE || "10485760", 10), // 10MB default
    allowedTypes: (
      process.env.ALLOWED_FILE_TYPES ||
      "image/jpeg,image/png,image/gif,application/pdf"
    ).split(","),
  },

  // Keycloak SSO — legacy prototype config (still used by the old
  // /api/keycloak-auth bridge; retired in Phase 5).
  keycloak: {
    enabled: process.env.KEYCLOAK_ENABLED === "true",
    url: process.env.KEYCLOAK_URL || "http://localhost:8080",
    realm: process.env.KEYCLOAK_REALM || "hubblehox-dev",
    clientId: process.env.KEYCLOAK_CLIENT_ID || "helpdesk-frontend",
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "",
    redirectUri:
      process.env.KEYCLOAK_REDIRECT_URI || "http://localhost:3001/sso/callback",
  },

  // OIDC SSO (Phase 3) — the production Authorization-Code + PKCE + BFF flow.
  // All values come from env / the secret manager; nothing is hardcoded. The
  // flow is only mounted when `enabled` is true, so an unconfigured deploy is
  // unaffected. Secrets are validated lazily at first use (see oidcConfig).
  oidc: {
    enabled: process.env.OIDC_ENABLED === "true",
    // The realm issuer, e.g. https://keycloak.example.com/realms/hubblehox-prod
    issuer: process.env.KEYCLOAK_ISSUER || "",
    clientId: process.env.OIDC_CLIENT_ID || "helpdesk-web",
    clientSecret: process.env.OIDC_CLIENT_SECRET || "",
    apiAudience: process.env.KEYCLOAK_API_AUDIENCE || "helpdesk-api",
    redirectUri: process.env.OIDC_REDIRECT_URI || "",
    postLogoutRedirectUri: process.env.OIDC_POST_LOGOUT_REDIRECT_URI || "",
    // Exact post-logout URLs Keycloak is allowed to bounce back to (comma-sep).
    postLogoutAllowlist: (process.env.OIDC_POST_LOGOUT_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    clockToleranceSeconds: parseInt(
      process.env.KEYCLOAK_CLOCK_TOLERANCE_SECONDS || "60",
      10,
    ),
    // Parent self-service flow — dedicated client + the MDM claim that maps a
    // logged-in parent to their Guardian-Master row.
    parentClientId: process.env.OIDC_PARENT_CLIENT_ID || "",
    parentClientSecret: process.env.OIDC_PARENT_CLIENT_SECRET || "",
    parentRedirectUri: process.env.OIDC_PARENT_REDIRECT_URI || "",
    parentMdmClaim: process.env.OIDC_PARENT_MDM_CLAIM || "mdm_parent_id",
    // BFF session lifetimes.
    sessionIdleMinutes: parseInt(process.env.SESSION_TTL_MINUTES || "60", 10),
    sessionAbsoluteHours: parseInt(
      process.env.SESSION_ABSOLUTE_TTL_HOURS || "8",
      10,
    ),
    cookieName: process.env.OIDC_SESSION_COOKIE || "hd_session",
  },
};

export default config;
