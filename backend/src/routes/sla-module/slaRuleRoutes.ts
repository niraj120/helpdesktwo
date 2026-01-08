import express from 'express';
import {
  getAllSLARules,
  getSLARuleById,
  createSLARule,
  updateSLARule,
  deleteSLARule,
  toggleSLARuleStatus,
} from '../../controllers/sla-module/slaRuleController';
import { authMiddleware } from '../../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// PATCH toggle SLA rule status (must be before /:id route)
router.patch('/:id/toggle-status', toggleSLARuleStatus);

// GET all SLA rules
router.get('/', getAllSLARules);

// GET single SLA rule
router.get('/:id', getSLARuleById);

// POST create new SLA rule
router.post('/', createSLARule);

// PUT update SLA rule
router.put('/:id', updateSLARule);

// DELETE SLA rule
router.delete('/:id', deleteSLARule);

export default router;
