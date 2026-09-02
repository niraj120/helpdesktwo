import express from 'express';
import {
    getWhatsAppConfig,
    updateWhatsAppSettings,
    updateWhatsAppTrigger,
    testWhatsAppTrigger,
    getTemplateVariables,
} from '../controllers/whatsappConfigController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { requireProjectAccess } from '../middleware/requireProjectAccess';

const router = express.Router();

/**
 * WhatsApp Configuration Routes
 * All routes require authentication and PROJECT_MANAGE_SETTINGS permission
 */

// Get template variables reference (helper endpoint)
router.get(
    '/template-variables',
    authMiddleware,
    getTemplateVariables
);

// Get configuration for a project
router.get(
    '/:projectId',
    authMiddleware,
    checkPermission('PROJECT_MANAGE_SETTINGS'),
    requireProjectAccess('projectId'),
    getWhatsAppConfig
);

// Update API settings (Phone Number ID, Access Token)
router.put(
    '/:projectId/settings',
    authMiddleware,
    checkPermission('PROJECT_MANAGE_SETTINGS'),
    requireProjectAccess('projectId'),
    updateWhatsAppSettings
);

// Update a specific trigger
router.put(
    '/:projectId/triggers/:triggerName',
    authMiddleware,
    checkPermission('PROJECT_MANAGE_SETTINGS'),
    requireProjectAccess('projectId'),
    updateWhatsAppTrigger
);

// Test a specific trigger
router.post(
    '/:projectId/triggers/:triggerName/test',
    authMiddleware,
    checkPermission('PROJECT_MANAGE_SETTINGS'),
    requireProjectAccess('projectId'),
    testWhatsAppTrigger
);

export default router;
