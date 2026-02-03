import express from 'express';
import {
  createLevel,
  getLevels,
  getLevelById,
  updateLevel,
  deleteLevel,
  reorderLevels,
} from '../controllers/kbLevelController';
import { authMiddleware, publicAuth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// Public routes - accessible for viewing KB levels (students/portal)
router.get('/', publicAuth, getLevels);
router.get('/:id', publicAuth, getLevelById);

// Protected routes - require authentication and KB management permission
router.post('/', authMiddleware, checkPermission('KB_MANAGE'), createLevel);
router.put('/reorder/batch', authMiddleware, checkPermission('KB_MANAGE'), reorderLevels);
router.put('/:id', authMiddleware, checkPermission('KB_MANAGE'), updateLevel);
router.delete('/:id', authMiddleware, checkPermission('KB_MANAGE'), deleteLevel);

export default router;
