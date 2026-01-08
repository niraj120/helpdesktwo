import express from 'express';
import {
  getAllEscalationPolicies,
  getEscalationPolicyById,
  createEscalationPolicy,
  updateEscalationPolicy,
  deleteEscalationPolicy,
  toggleEscalationPolicyStatus,
} from '../../controllers/sla-module/escalationPolicyController';
import { authMiddleware } from '../../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// PATCH toggle escalation policy status (must be before /:id route)
router.patch('/:id/toggle-status', toggleEscalationPolicyStatus);

// GET all escalation policies
router.get('/', getAllEscalationPolicies);

// GET single escalation policy
router.get('/:id', getEscalationPolicyById);

// POST create new escalation policy
router.post('/', createEscalationPolicy);

// PUT update escalation policy
router.put('/:id', updateEscalationPolicy);

// DELETE escalation policy
router.delete('/:id', deleteEscalationPolicy);

export default router;
