import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  getRecentActivity,
  getEmailPollingConfig,
  updateEmailPollingConfig,
  getCronPresets
} from '../controllers/emailActivityController';

const router = Router();

/**
 * @route   GET /api/email-activity/recent
 * @desc    Get recent ticket activity for real-time updates
 * @access  Authenticated users
 */
router.get('/recent', authMiddleware, getRecentActivity);

/**
 * @route   GET /api/email-activity/config
 * @desc    Get email polling configuration
 * @access  Authenticated users
 */
router.get('/config', authMiddleware, getEmailPollingConfig);

/**
 * @route   GET /api/email-activity/cron-presets
 * @desc    Get available cron expression presets
 * @access  Authenticated users
 */
router.get('/cron-presets', authMiddleware, getCronPresets);

/**
 * @route   PUT /api/email-activity/config
 * @desc    Update email polling configuration
 * @access  Admin only
 */
router.put('/config', authMiddleware, checkPermission(['SYSTEM_SETTINGS_MANAGE']), updateEmailPollingConfig);

export default router;
