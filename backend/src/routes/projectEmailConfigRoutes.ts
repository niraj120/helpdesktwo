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
import { checkPermission } from '../middleware/permissions';
import { requireProjectAccess } from '../middleware/requireProjectAccess';

const router = express.Router();

// All routes here read/write a project's email credentials + OAuth tokens.
// Require auth + the settings permission + access to THIS project (previously
// only authenticated — any logged-in user could touch any project's mailboxes).
router.use(authMiddleware);
router.use(checkPermission('PROJECT_MANAGE_SETTINGS'));
const ownsProject = requireProjectAccess('projectId');

/**
 * POST /api/projects/:projectId/email-configs
 * Add email configuration for a project
 */
router.post('/:projectId/email-configs', ownsProject, addEmailConfig);

/**
 * POST /api/projects/:projectId/email-configs/test-credentials
 * Test email credentials without saving (for add/edit modals)
 */
router.post('/:projectId/email-configs/test-credentials', ownsProject, testEmailCredentials);

/**
 * POST /api/projects/:projectId/email-configs/oauth2/auth-url
 * Generate OAuth2 authorization URL for Google or Microsoft
 */
router.post('/:projectId/email-configs/oauth2/auth-url', ownsProject, getOAuth2AuthUrl);

/**
 * POST /api/projects/:projectId/email-configs/oauth2/callback
 * Handle OAuth2 callback and exchange code for tokens
 */
router.post('/:projectId/email-configs/oauth2/callback', ownsProject, handleOAuth2Callback);

/**
 * GET /api/projects/:projectId/email-configs
 * Get all email configurations for a project
 */
router.get('/:projectId/email-configs', ownsProject, getEmailConfigs);

/**
 * PUT /api/projects/:projectId/email-configs/:configId
 * Update email configuration (enable/disable)
 */
router.put('/:projectId/email-configs/:configId', ownsProject, updateEmailConfig);

/**
 * DELETE /api/projects/:projectId/email-configs/:configId
 * Delete email configuration
 */
router.delete('/:projectId/email-configs/:configId', ownsProject, deleteEmailConfig);

export default router;
