import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { getSMSLogs, getSMSStatistics, getSMSLogById } from '../controllers/smsLogController';

const router = express.Router();

// Align with email/whatsapp log permissions (view-only)
router.get('/', authMiddleware, checkPermission('EMAIL_CONFIG_VIEW'), getSMSLogs);
router.get('/statistics', authMiddleware, checkPermission('EMAIL_CONFIG_VIEW'), getSMSStatistics);
router.get('/:id', authMiddleware, checkPermission('EMAIL_CONFIG_VIEW'), getSMSLogById);

export default router;
