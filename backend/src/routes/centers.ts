import express from 'express';
import {
  getCenters,
  getCenterById,
  createCenter,
  updateCenter,
  deleteCenter,
} from '../controllers/centerController';
import { authMiddleware, publicAuth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// Get all centers - Public access when filtering by projectId (for student portal)
// Requires auth for internal admin access without projectId
router.get('/', publicAuth, getCenters);

// Get single center by ID - Public access for viewing center details
router.get('/:id', publicAuth, getCenterById);

// Create new center - Requires authentication and permission
router.post('/', authMiddleware, checkPermission('OFFLINE_MODULE_ACCESS'), createCenter);

// Update center - Requires authentication and permission
router.put('/:id', authMiddleware, checkPermission('OFFLINE_MODULE_ACCESS'), updateCenter);

// Delete center (soft delete) - Requires authentication and permission
router.delete('/:id', authMiddleware, checkPermission('OFFLINE_MODULE_ACCESS'), deleteCenter);

export default router;
