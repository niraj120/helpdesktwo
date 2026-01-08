import express from 'express';
import {
    getWhatsAppLogs,
    getWhatsAppStatistics,
    getWhatsAppLogById,
    getBlockedRecipients,
} from '../controllers/whatsappLogController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

/**
 * WhatsApp Log Routes
 * All routes require authentication and EMAIL_CONFIG_VIEW permission
 * (reusing same permission as email logs)
 */

// Get all WhatsApp logs with filtering and pagination
router.get(
    '/',
    authMiddleware,
    checkPermission('EMAIL_CONFIG_VIEW'),
    getWhatsAppLogs
);

// Get statistics
router.get(
    '/statistics',
    authMiddleware,
    checkPermission('EMAIL_CONFIG_VIEW'),
    getWhatsAppStatistics
);

// Get blocked/failed recipients
router.get(
    '/blocked-recipients',
    authMiddleware,
    checkPermission('EMAIL_CONFIG_VIEW'),
    getBlockedRecipients
);

// Get single log by ID
router.get(
    '/:id',
    authMiddleware,
    checkPermission('EMAIL_CONFIG_VIEW'),
    getWhatsAppLogById
);

export default router;
