/**
 * Cache Routes
 * 
 * Admin-only routes for cache management
 */

import { Router } from 'express';
import { auth } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import {
  getCacheStats,
  clearAllCache,
  clearCacheByType,
  warmupCache,
} from '../controllers/cacheController';

const router = Router();

// All cache routes require authentication and admin permission
router.use(auth);

// Get cache statistics (any authenticated user can view stats)
router.get('/stats', getCacheStats);

// Clear all cache (admin only)
router.post('/clear', requirePermission('SYSTEM_SETTINGS_MANAGE'), clearAllCache);

// Clear specific cache type (admin only)
router.post('/clear/:type', requirePermission('SYSTEM_SETTINGS_MANAGE'), clearCacheByType);

// Warmup cache (admin only)
router.post('/warmup', requirePermission('SYSTEM_SETTINGS_MANAGE'), warmupCache);

export default router;
