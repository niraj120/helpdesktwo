/**
 * Application Configuration Constants
 * Centralized configuration for API URLs and endpoints
 */

/**
 * Auto-detect environment based on current hostname
 * Reads from .env: VITE_API_BASE_URL
 * If on localhost -> use local API
 * If on production domain -> use production API
 *
 * IMPORTANT: Server's .env.production.build already includes /api in VITE_API_BASE_URL
 * So we return it as-is without adding /api suffix
 */
const getApiUrl = (): string => {
  const hostname = window.location.hostname;

  // Check for explicit env var first (server .env already includes /api)
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  // Fallback to auto-detection based on hostname
  // Local development: no /api (added in API_CONFIG below)
  // Production: /api included in .env
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3003";
  } else if (hostname.includes("helpdesk.hubblehox.ai")) {
    return "https://helpdesk.hubblehox.ai";
  } else {
    return "https://helpdesk.hubblehox.ai";
  }
};

/**
 * Auto-detect WebSocket URL based on current hostname
 * Reads from .env: VITE_WS_URL
 */
const getWsUrl = (): string => {
  const hostname = window.location.hostname;

  // Check for explicit env var first
  const envWsUrl = import.meta.env.VITE_WS_URL;
  if (envWsUrl) {
    return envWsUrl;
  }

  // Fallback to auto-detection based on hostname
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "ws://localhost:3003";
  } else if (hostname.includes("helpdesk.hubblehox.ai")) {
    return "wss://helpdesk.hubblehox.ai";
  } else {
    return "wss://helpdesk.hubblehox.ai";
  }
};

const API_BASE_URL = getApiUrl();
const WS_URL = getWsUrl();

// Check if API_BASE_URL already includes /api
// The .env now includes /api for both local and production
const hasApiSuffix = API_BASE_URL.endsWith("/api");

// Log for debugging
console.log("🔧 [Config] API_BASE_URL:", API_BASE_URL);
console.log("🔧 [Config] Has /api suffix:", hasApiSuffix);

/**
 * API Configuration
 * IMPORTANT: .env files now include /api in VITE_API_BASE_URL
 * - Local: VITE_API_BASE_URL="http://localhost:3003/api"
 * - Production: VITE_API_BASE_URL="https://helpdesk.hubblehox.ai/api"
 * So API_URL should be used directly without adding /api again
 */
export const API_CONFIG = {
  // Base URLs (without /api)
  BASE_URL: hasApiSuffix ? API_BASE_URL.replace(/\/api$/, "") : API_BASE_URL,
  WS_URL: WS_URL,

  // Full API URL (already includes /api from .env)
  API_URL: API_BASE_URL,

  // Common endpoints (API_BASE_URL already has /api, so just append path)
  AUTH: `${API_BASE_URL}/auth`,
  USERS: `${API_BASE_URL}/users`,
  PROJECTS: `${API_BASE_URL}/projects`,
  TICKETS: `${API_BASE_URL}/tickets`,
  RBAC: `${API_BASE_URL}/rbac`,

  // Project-specific auth endpoints
  PROJECT_AUTH: (customUrlPath: string) =>
    `${API_BASE_URL}/project-auth/${customUrlPath}`,

  // Student portal endpoints
  STUDENT_AUTH: (customUrlPath: string) =>
    `${API_BASE_URL}/project-auth/${customUrlPath}/student`,

  // WebSocket URL with token
  WS_WITH_TOKEN: (token: string) => `${WS_URL}/?token=${token}`,
} as const;

/**
 * Application Constants
 */
export const APP_CONFIG = {
  // Token storage key
  AUTH_TOKEN_KEY: "authToken",

  // Request timeout (ms)
  REQUEST_TIMEOUT: 30000,

  // WebSocket reconnection settings
  WS_RECONNECT_INTERVAL: 5000,
  WS_MAX_RECONNECT_ATTEMPTS: 5,
} as const;

export const FEATURE_FLAGS = {
  KB_HTML_SEARCH_V1:
    String(import.meta.env.VITE_KB_HTML_SEARCH_V1 || "false").toLowerCase() ===
    "true",
} as const;

/**
 * Helper function to get authorization headers
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem(APP_CONFIG.AUTH_TOKEN_KEY);
  return {
    Authorization: token ? `Bearer ${token}` : "",
    "Content-Type": "application/json",
  };
};

/**
 * Helper function to build full API URL
 * IMPORTANT: API_CONFIG.API_URL now already includes /api from .env
 */
export const buildApiUrl = (endpoint: string): string => {
  // If endpoint already starts with http/https, return as-is
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }

  // If endpoint starts with /api, use BASE_URL (without /api) + endpoint (with /api)
  if (endpoint.startsWith("/api")) {
    return `${API_CONFIG.BASE_URL}${endpoint}`;
  }

  // Otherwise, prepend API_URL (which already has /api)
  return `${API_CONFIG.API_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
};
