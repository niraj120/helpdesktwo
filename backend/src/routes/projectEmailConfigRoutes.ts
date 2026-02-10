import express from 'express';
import {
  addEmailConfig,
  getEmailConfigs,
  updateEmailConfig,
  toggleEmailConfig,
  deleteEmailConfig,
  testEmailCredentials,
  getOAuth2AuthUrl,
  handleOAuth2Callback,
} from '../controllers/projectEmailConfigController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /api/projects/:projectId/email-configs
 * Add email configuration for a project
 */
router.post('/:projectId/email-configs', addEmailConfig);

/**
 * POST /api/projects/:projectId/email-configs/test-credentials
 * Test email credentials without saving (for add/edit modals)
 */
router.post('/:projectId/email-configs/test-credentials', testEmailCredentials);

/**
 * POST /api/projects/:projectId/email-configs/oauth2/auth-url
 * Generate OAuth2 authorization URL for Google or Microsoft
 */
router.post('/:projectId/email-configs/oauth2/auth-url', getOAuth2AuthUrl);

/**
 * POST /api/projects/:projectId/email-configs/oauth2/callback
 * Handle OAuth2 callback and exchange code for tokens
 */
router.post('/:projectId/email-configs/oauth2/callback', handleOAuth2Callback);

/**
 * GET /api/projects/:projectId/email-configs
 * Get all email configurations for a project
 */
router.get('/:projectId/email-configs', getEmailConfigs);

/**
 * PUT /api/projects/:projectId/email-configs/:configId
 * Update email configuration (enable/disable)
 */
router.put('/:projectId/email-configs/:configId', updateEmailConfig);

/**
 * DELETE /api/projects/:projectId/email-configs/:configId
 * Delete email configuration
 */
router.delete('/:projectId/email-configs/:configId', deleteEmailConfig);

export default router;
