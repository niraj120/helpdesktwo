/**
 * Application Configuration
 * Centralizes all environment variable access with proper validation
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

/**
 * Get JWT Secret with proper validation
 * In production: Throws error if JWT_SECRET is not set
 * In development: Uses fallback with warning
 */
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    if (isProduction) {
      throw new Error('FATAL: JWT_SECRET environment variable must be set in production!');
    }
    console.warn('⚠️  WARNING: JWT_SECRET not set. Using development fallback. DO NOT use in production!');
    return 'dev-only-fallback-secret-change-in-production';
  }
  
  // Validate secret strength in production
  if (isProduction && secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production!');
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
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
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
