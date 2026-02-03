/**
 * Email Connection Health Routes (Task 8.2)
 * API endpoints for monitoring and managing SMTP connection health
 */

import express from 'express';
import {
  getConnectionStatuses,
  testConnection,
  resetRetry,
  retryAll,
  getStats,
  getConnectionDetails
} from '../controllers/emailConnectionController';
import { authMiddleware } from '../middleware/auth'; // Fixed: Changed from authMiddleware to auth

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/email-connection/statuses
 * Get connection status for all email configs
 * Query params: ?projectId=xxx (optional)
 */
router.get('/statuses', getConnectionStatuses);

/**
 * GET /api/email-connection/stats
 * Get connection health statistics
 * Query params: ?projectId=xxx (optional)
 */
router.get('/stats', getStats);

/**
 * GET /api/email-connection/:id/details
 * Get detailed connection info for a specific config
 */
router.get('/:id/details', getConnectionDetails);

/**
 * POST /api/email-connection/:id/test
 * Manually test SMTP connection for a config
 */
router.post('/:id/test', testConnection);

/**
 * PATCH /api/email-connection/:id/reset
 * Reset retry counter and status (admin action)
 */
router.patch('/:id/reset', resetRetry);

/**
 * POST /api/email-connection/retry-all
 * Manually trigger retry for all failed connections
 */
router.post('/retry-all', retryAll);

export default router;
