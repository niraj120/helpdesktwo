import express from 'express';
import {
  getAPILogs,
  getFailedAPIs,
  getAPIStatistics,
  retryFailedAPI,
} from '../controllers/apiLogController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/api-logs
 * @desc    Get all API logs with filtering
 * @access  Requires AUDIT_VIEW_WEBHOOK_FAILURES or AUDIT_VIEW_INTEGRATION_FAILURES permission
 */
router.get(
  '/',
  checkPermission(['AUDIT_VIEW_WEBHOOK_FAILURES', 'AUDIT_VIEW_INTEGRATION_FAILURES']),
  getAPILogs
);

/**
 * @route   GET /api/api-logs/failed
 * @desc    Get only failed API calls
 * @access  Requires AUDIT_VIEW_WEBHOOK_FAILURES or AUDIT_VIEW_INTEGRATION_FAILURES permission
 */
router.get(
  '/failed',
  checkPermission(['AUDIT_VIEW_WEBHOOK_FAILURES', 'AUDIT_VIEW_INTEGRATION_FAILURES']),
  getFailedAPIs
);

/**
 * @route   GET /api/api-logs/statistics
 * @desc    Get API call statistics
 * @access  Requires AUDIT_VIEW_WEBHOOK_FAILURES or AUDIT_VIEW_INTEGRATION_FAILURES permission
 */
router.get(
  '/statistics',
  checkPermission(['AUDIT_VIEW_WEBHOOK_FAILURES', 'AUDIT_VIEW_INTEGRATION_FAILURES']),
  getAPIStatistics
);

/**
 * @route   POST /api/api-logs/:id/retry
 * @desc    Retry a failed API call
 * @access  Requires INTEGRATION_MANAGE_WEBHOOKS permission
 */
router.post(
  '/:id/retry',
  checkPermission('INTEGRATION_MANAGE_WEBHOOKS'),
  retryFailedAPI
);

export default router;
