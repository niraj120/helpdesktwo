import express from 'express';
import {
  getCenters,
  getCenterById,
  createCenter,
  updateCenter,
  deleteCenter,
} from '../controllers/centerController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// Get all centers (optionally filtered by projectId)
router.get('/', authMiddleware, getCenters);

// Get single center by ID
router.get('/:id', authMiddleware, getCenterById);

// Create new center
router.post('/', authMiddleware, checkPermission('OFFLINE_MODULE_ACCESS'), createCenter);

// Update center
router.put('/:id', authMiddleware, checkPermission('OFFLINE_MODULE_ACCESS'), updateCenter);

// Delete center (soft delete)
router.delete('/:id', authMiddleware, checkPermission('OFFLINE_MODULE_ACCESS'), deleteCenter);

export default router;
