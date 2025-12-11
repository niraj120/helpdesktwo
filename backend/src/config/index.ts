/**
 * Application Configuration
 * Centralizes all environment variable access with proper validation
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

/**
 * Get JWT Secret with proper validation
 * In production: Warns if JWT_SECRET contains "CHANGE-THIS" but doesn't block startup
 * In development: Uses fallback with warning
 */
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    if (isProduction) {
      console.error('❌ CRITICAL: JWT_SECRET environment variable is not set in production!');
      console.error('⚠️  Using fallback secret - THIS IS INSECURE!');
    } else {
      console.warn('⚠️  WARNING: JWT_SECRET not set. Using development fallback. DO NOT use in production!');
    }
    return 'dev-only-fallback-secret-change-in-production';
  }
  
  // Warn about weak secrets but don't block startup
  if (secret.includes('CHANGE-THIS') || secret.includes('CHANGE-THIS-IN-PRODUCTION')) {
    console.error('❌ CRITICAL SECURITY WARNING: JWT_SECRET contains placeholder text!');
    console.error('⚠️  Please update JWT_SECRET in .env file immediately!');
    console.error('⚠️  Generate a strong secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  }
  
  if (isProduction && secret.length < 32) {
    console.error('❌ WARNING: JWT_SECRET is too short (< 32 characters) for production use!');
  }
  
  return secret;
};

/**
 * Get JWT Refresh Secret with proper validation
 */
const getJwtRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  
  if (!secret) {
    if (isProduction) {
      console.error('❌ CRITICAL: JWT_REFRESH_SECRET not set in production!');
    }
    return process.env.JWT_SECRET || 'dev-only-fallback-refresh-secret';
  }
  
  // Warn about weak secrets
  if (secret.includes('CHANGE-THIS') || secret.includes('CHANGE-THIS-TOO')) {
    console.error('❌ CRITICAL SECURITY WARNING: JWT_REFRESH_SECRET contains placeholder text!');
    console.error('⚠️  Please update JWT_REFRESH_SECRET in .env file immediately!');
  }
  
  return secret;
};

export const config = {
  // Environment
  isProduction,
  isDevelopment,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Server
  port: parseInt(process.env.PORT || '3003', 10),
  
  // JWT Configuration
  jwt: {
    secret: getJwtSecret(),
    refreshSecret: getJwtRefreshSecret(),
    expiresIn: process.env.JWT_EXPIRE || process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE || process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  
  // Database - Conditional based on NODE_ENV only
  database: {
    localUri: process.env.MONGODB_LOCAL_URI || 'mongodb://localhost:27017/sac_helpdesk',
    productionUri: process.env.MONGODB_PRODUCTION_URI || 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin',
  },
  
  // CORS & URLs - Auto-selected based on NODE_ENV from .env
  cors: {
    allowedOrigins: (isProduction
      ? process.env.ALLOWED_ORIGINS_PRODUCTION || 'https://helpdesk.hubblehox.ai'
      : process.env.ALLOWED_ORIGINS_LOCAL || 'http://localhost:3001,http://localhost:3000'
    ).split(',').map(o => o.trim()),
  },
  
  urls: {
    frontend: isProduction
      ? process.env.FRONTEND_URL_PRODUCTION || 'https://helpdesk.hubblehox.ai'
      : process.env.FRONTEND_URL_LOCAL || 'http://localhost:3001',
    backend: isProduction
      ? process.env.BACKEND_URL_PRODUCTION || 'https://api.helpdesk.hubblehox.ai'
      : process.env.BACKEND_URL_LOCAL || 'http://localhost:3003',
    api: isProduction
      ? process.env.API_URL_PRODUCTION || 'https://api.helpdesk.hubblehox.ai/api'
      : process.env.API_URL_LOCAL || 'http://localhost:3003/api',
    socketCors: isProduction
      ? process.env.SOCKET_CORS_ORIGIN_PRODUCTION || 'https://helpdesk.hubblehox.ai'
      : process.env.SOCKET_CORS_ORIGIN_LOCAL || 'http://localhost:3001',
  },
  
  // File Upload
  upload: {
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,application/pdf').split(','),
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
};

export default config;
