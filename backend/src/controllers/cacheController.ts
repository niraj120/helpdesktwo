/**
 * Cache Controller
 * 
 * Provides endpoints for cache management and debugging.
 * These endpoints are for admin use only.
 */

import { Request, Response } from 'express';
import { cache, getCacheDebugInfo, invalidateCache } from '../utils/cache';
import { AuthRequest } from '../middleware/auth';

/**
 * Get cache statistics
 * GET /api/cache/stats
 */
export const getCacheStats = async (req: Request, res: Response) => {
  try {
    const stats = getCacheDebugInfo();
    
    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Get cache stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get cache stats',
      error: error.message,
    });
  }
};

/**
 * Clear all cache
 * POST /api/cache/clear
 */
export const clearAllCache = async (req: AuthRequest, res: Response) => {
  try {
    invalidateCache.all();
    
    return res.json({
      success: true,
      message: 'All cache cleared successfully',
    });
  } catch (error: any) {
    console.error('Clear cache error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
      error: error.message,
    });
  }
};

/**
 * Clear specific cache type
 * POST /api/cache/clear/:type
 */
export const clearCacheByType = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    const { id } = req.body;
    
    switch (type) {
      case 'project':
        if (id) {
          invalidateCache.project(id);
        } else {
          cache.deleteByPrefix('project:');
        }
        break;
      case 'user':
        if (id) {
          invalidateCache.user(id);
        } else {
          cache.deleteByPrefix('user:');
        }
        break;
      case 'role':
        invalidateCache.role(id);
        break;
      case 'categories':
        invalidateCache.categories(id);
        break;
      case 'statuses':
        invalidateCache.statuses(id);
        break;
      case 'priorities':
        invalidateCache.priorities(id);
        break;
      case 'centers':
        invalidateCache.centers(id);
        break;
      case 'agents':
        invalidateCache.agents(id);
        break;
      case 'masterData':
        invalidateCache.masterData();
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Unknown cache type: ${type}. Valid types: project, user, role, categories, statuses, priorities, centers, agents, masterData`,
        });
    }
    
    return res.json({
      success: true,
      message: `Cache cleared for type: ${type}${id ? ` (id: ${id})` : ''}`,
    });
  } catch (error: any) {
    console.error('Clear cache by type error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
      error: error.message,
    });
  }
};

/**
 * Warm up cache with frequently accessed data
 * POST /api/cache/warmup
 */
export const warmupCache = async (req: AuthRequest, res: Response) => {
  try {
    // This would pre-load frequently accessed data
    // For now, just return success - data will be cached on first access
    
    return res.json({
      success: true,
      message: 'Cache warmup triggered. Data will be cached on first access.',
    });
  } catch (error: any) {
    console.error('Cache warmup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to warmup cache',
      error: error.message,
    });
  }
};
