/**
 * Performance Monitoring Routes
 * 
 * Endpoints for viewing API performance statistics
 * 
 * Created: 2026-01-31
 */

import { Router } from 'express';
import { auth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { 
  performanceStatsHandler, 
  resetPerformanceStats 
} from '../middleware/performanceMonitor';

const router = Router();

// Get performance statistics (requires super admin)
router.get('/stats', auth, checkPermission('SYSTEM_SETTINGS'), performanceStatsHandler);

// Reset performance statistics (requires super admin)
router.post('/reset', auth, checkPermission('SYSTEM_SETTINGS'), resetPerformanceStats);

export default router;
