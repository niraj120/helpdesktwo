import express from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getAllPriorities,
  getActivePriorities,
  getPriorityById,
  createPriority,
  updatePriority,
  deletePriority,
} from '../controllers/priorityController';

const router = express.Router();

// Get all priorities (admin)
router.get('/', authMiddleware, getAllPriorities);

// Get active priorities (for dropdowns)
router.get('/active', authMiddleware, getActivePriorities);

// Get priority by ID
router.get('/:id', authMiddleware, getPriorityById);

// Create new priority
router.post('/', authMiddleware, createPriority);

// Update priority
router.put('/:id', authMiddleware, updatePriority);

// Delete priority
router.delete('/:id', authMiddleware, deletePriority);

export default router;
