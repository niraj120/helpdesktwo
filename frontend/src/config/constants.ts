/**
 * Application Configuration Constants
 * Centralized configuration for API URLs and endpoints
 */

/**
 * Auto-detect environment based on current hostname
 * Reads from .env: VITE_API_BASE_URL
 * If on localhost -> use local API
 * If on production domain -> use production API
 */
const getApiUrl = (): string => {
  const hostname = window.location.hostname;
  
  // Check for explicit env var first
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    console.log('📍 Using API URL from environment:', envUrl);
    return envUrl;
  }
  
  // Fallback to auto-detection based on hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    console.log('📍 Detected LOCAL environment from hostname: localhost');
    return 'http://localhost:3003';
  } else if (hostname.includes('helpdesk.hubblehox.ai')) {
    console.log('📍 Detected PRODUCTION environment from hostname: helpdesk.hubblehox.ai');
    return 'https://helpdesk.hubblehox.ai';
  } else {
    console.log('📍 Unknown hostname, defaulting to PRODUCTION');
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
    console.log('📍 Using WebSocket URL from environment:', envWsUrl);
    return envWsUrl;
  }
  
  // Fallback to auto-detection based on hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    console.log('📍 Detected LOCAL WebSocket from hostname: localhost');
    return 'ws://localhost:3003';
  } else if (hostname.includes('helpdesk.hubblehox.ai')) {
    console.log('📍 Detected PRODUCTION WebSocket from hostname: helpdesk.hubblehox.ai');
    return 'wss://helpdesk.hubblehox.ai';
  } else {
    console.log('📍 Unknown hostname, defaulting to PRODUCTION WebSocket');
    return 'wss://helpdesk.hubblehox.ai';
  }
};

const API_BASE_URL = getApiUrl();
const WS_URL = getWsUrl();

// Log which URL is being used - DETAILED
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         ENVIRONMENT AUTO-DETECTION RESULTS                 ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log(`║ 🌐 Hostname: ${window.location.hostname.padEnd(43)}║`);
console.log(`║ 🔗 API URL:  ${API_BASE_URL.padEnd(43)}║`);
console.log(`║ 📡 WS URL:   ${WS_URL.padEnd(43)}║`);
console.log('╚════════════════════════════════════════════════════════════╝');

/**
 * API Configuration
 */
export const API_CONFIG = {
  // Base URLs
  BASE_URL: API_BASE_URL,
  WS_URL: WS_URL,
  
  // Full API URL with /api prefix
  API_URL: `${API_BASE_URL}/api`,
  
  // Common endpoints
  AUTH: `${API_BASE_URL}/api/auth`,
  USERS: `${API_BASE_URL}/api/users`,
  PROJECTS: `${API_BASE_URL}/api/projects`,
  TICKETS: `${API_BASE_URL}/api/tickets`,
  RBAC: `${API_BASE_URL}/api/rbac`,
  
  // Project-specific auth endpoints
  PROJECT_AUTH: (customUrlPath: string) => 
    `${API_BASE_URL}/api/project-auth/${customUrlPath}`,
  
  // Student portal endpoints
  STUDENT_AUTH: (customUrlPath: string) => 
    `${API_BASE_URL}/api/project-auth/${customUrlPath}/student`,
    
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
