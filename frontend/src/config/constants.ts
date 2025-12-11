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
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3003';
  } else if (hostname.includes('helpdesk.hubblehox.ai')) {
    return 'https://helpdesk.hubblehox.ai';
  } else {
    return 'https://helpdesk.hubblehox.ai';
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
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:3003';
  } else if (hostname.includes('helpdesk.hubblehox.ai')) {
    return 'wss://helpdesk.hubblehox.ai';
  } else {
    return 'wss://helpdesk.hubblehox.ai';
  }
};

const API_BASE_URL = getApiUrl();
const WS_URL = getWsUrl();

// Check if API_BASE_URL already includes /api (from server .env)
const hasApiSuffix = API_BASE_URL.endsWith('/api');
const apiPrefix = hasApiSuffix ? '' : '/api';

/**
 * API Configuration
 * Handles both cases:
 * - Local dev: VITE_API_BASE_URL="http://localhost:3003" (adds /api)
 * - Production: VITE_API_BASE_URL="https://helpdesk.hubblehox.ai/api" (no /api added)
 */
export const API_CONFIG = {
  // Base URLs
  BASE_URL: API_BASE_URL,
  WS_URL: WS_URL,
  
  // Full API URL with /api prefix (only if not already present)
  API_URL: `${API_BASE_URL}${apiPrefix}`,
  
  // Common endpoints
  AUTH: `${API_BASE_URL}${apiPrefix}/auth`,
  USERS: `${API_BASE_URL}${apiPrefix}/users`,
  PROJECTS: `${API_BASE_URL}${apiPrefix}/projects`,
  TICKETS: `${API_BASE_URL}${apiPrefix}/tickets`,
  RBAC: `${API_BASE_URL}${apiPrefix}/rbac`,
  
  // Project-specific auth endpoints
  PROJECT_AUTH: (customUrlPath: string) => 
    `${API_BASE_URL}${apiPrefix}/project-auth/${customUrlPath}`,
  
  // Student portal endpoints
  STUDENT_AUTH: (customUrlPath: string) => 
    `${API_BASE_URL}${apiPrefix}/project-auth/${customUrlPath}/student`,
    
  // WebSocket URL with token
  WS_WITH_TOKEN: (token: string) => `${WS_URL}/?token=${token}`,
} as const;

/**
 * Application Constants
 */
export const APP_CONFIG = {
  // Token storage key
  AUTH_TOKEN_KEY: 'authToken',
  
  // Request timeout (ms)
  REQUEST_TIMEOUT: 30000,
  
  // WebSocket reconnection settings
  WS_RECONNECT_INTERVAL: 5000,
  WS_MAX_RECONNECT_ATTEMPTS: 5,
} as const;

/**
 * Helper function to get authorization headers
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem(APP_CONFIG.AUTH_TOKEN_KEY);
  return {
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
  };
};

/**
 * Helper function to build full API URL
 */
export const buildApiUrl = (endpoint: string): string => {
  // If endpoint already starts with http/https, return as-is
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  
  // If endpoint starts with /api, use base URL
  if (endpoint.startsWith('/api')) {
    return `${API_CONFIG.BASE_URL}${endpoint}`;
  }
  
  // Otherwise, prepend API_URL
  return `${API_CONFIG.API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
};
