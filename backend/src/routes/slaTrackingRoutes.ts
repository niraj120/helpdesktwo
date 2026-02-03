import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getTicketSLAStatus,
  getTicketsApproachingSLA,
  getTicketsWithBreachedSLA,
  getEscalationStats,
} from '../controllers/slaTrackingController';

const router = Router();

/**
 * @route   GET /api/sla-tracking/:ticketId
 * @desc    Get SLA tracking details for a specific ticket
 * @access  Authenticated users
 */
router.get('/:ticketId', authMiddleware, getTicketSLAStatus);

/**
 * @route   GET /api/sla-tracking/approaching
 * @desc    Get tickets approaching SLA breach
 * @access  Authenticated users
 */
router.get('/dashboard/approaching', authMiddleware, getTicketsApproachingSLA);

/**
 * @route   GET /api/sla-tracking/breached
 * @desc    Get tickets with breached SLA
 * @access  Authenticated users
 */
router.get('/dashboard/breached', authMiddleware, getTicketsWithBreachedSLA);

/**
 * @route   GET /api/sla-tracking/stats
 * @desc    Get escalation dashboard statistics
 * @access  Authenticated users
 */
router.get('/dashboard/stats', authMiddleware, getEscalationStats);

export default router;
