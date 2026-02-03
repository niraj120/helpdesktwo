import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { getAllIncomingEmails } from '../controllers/emailCommunicationController';

const router = Router();

/**
 * @desc    Get all incoming email communications (global view)
 * @route   GET /api/email-communications/incoming
 * @access  Private (EMAIL_LOGS_VIEW or TICKET_VIEW_ALL)
 */
router.get('/incoming', authMiddleware, checkPermission(['EMAIL_LOGS_VIEW', 'TICKET_VIEW_ALL']), getAllIncomingEmails);

export default router;
