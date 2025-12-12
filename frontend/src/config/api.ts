// API Configuration
// This file is deprecated - use API_CONFIG from constants.ts instead
// API_CONFIG automatically reads from .env and detects environment

import { API_CONFIG } from './constants';

// Export API_URL which includes /api prefix from .env
export default API_CONFIG.API_URL;
