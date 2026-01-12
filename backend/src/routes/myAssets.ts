import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  getMyAssets,
  updateMyAssetCounts,
  getAssetAuditLogs,
  submitAudit,
  getAssetReport,
} from '../controllers/myAssetsController';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/my-assets/report
 * @desc    Get asset report for all centers
 * @access  Private (MY_ASSETS_VIEW permission)
 * @note    MUST be before /:id routes to avoid conflicts
 */
router.get('/report', checkPermission('MY_ASSETS_VIEW'), getAssetReport);

/**
 * @route   GET /api/my-assets
 * @desc    Get assets for user's center(s)
 * @access  Private (MY_ASSETS_VIEW permission)
 */
router.get('/', checkPermission('MY_ASSETS_VIEW'), getMyAssets);

/**
 * @route   PUT /api/my-assets/:id
 * @desc    Update asset working/not working counts
 * @access  Private (MY_ASSETS_VIEW permission)
 */
router.put('/:id', checkPermission('MY_ASSETS_VIEW'), updateMyAssetCounts);

/**
 * @route   GET /api/my-assets/:id/audit-logs
 * @desc    Get audit logs for a specific asset
 * @access  Private (MY_ASSETS_VIEW permission)
 */
router.get('/:id/audit-logs', checkPermission('MY_ASSETS_VIEW'), getAssetAuditLogs);

/**
 * @route   POST /api/my-assets/:id/submit-audit
 * @desc    Submit audit (locks editing until next audit date)
 * @access  Private (MY_ASSETS_VIEW permission)
 */
router.post('/:id/submit-audit', checkPermission('MY_ASSETS_VIEW'), submitAudit);

export default router;
