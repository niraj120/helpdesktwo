import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  getEmailLogs,
  getBlockedRecipients,
  getEmailStatistics,
  retryFailedEmail
} from '../controllers/emailLogController';

const router = Router();

// All routes require authentication and EMAIL_CONFIG_VIEW permission

/**
 * @route   GET /api/email-logs
 * @desc    Get all email logs with filtering
 * @access  Private (EMAIL_CONFIG_VIEW)
 */
router.get(
  '/',
  authMiddleware,
  checkPermission('EMAIL_CONFIG_VIEW'),
  getEmailLogs
);

/**
 * @route   GET /api/email-logs/blocked-recipients
 * @desc    Get all blocked email recipients
 * @access  Private (EMAIL_CONFIG_VIEW)
 */
router.get(
  '/blocked-recipients',
  authMiddleware,
  checkPermission('EMAIL_CONFIG_VIEW'),
  getBlockedRecipients
);

/**
 * @route   GET /api/email-logs/statistics
 * @desc    Get email statistics
 * @access  Private (EMAIL_CONFIG_VIEW)
 */
router.get(
  '/statistics',
  authMiddleware,
  checkPermission('EMAIL_CONFIG_VIEW'),
  getEmailStatistics
);

/**
 * @route   POST /api/email-logs/:id/retry
 * @desc    Retry failed email
 * @access  Private (EMAIL_CONFIG_MANAGE)
 */
router.post(
  '/:id/retry',
  authMiddleware,
  checkPermission('EMAIL_CONFIG_MANAGE'),
  retryFailedEmail
);

export default router;
