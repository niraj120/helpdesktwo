import express from 'express';
import {
  addEmailConfig,
  getEmailConfigs,
  updateEmailConfig,
  toggleEmailConfig,
  deleteEmailConfig,
  testEmailCredentials,
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
