import express from 'express';
import {
  getFAQsByProject,
  getFAQById,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  incrementFAQView,
  submitFAQFeedback,
  getFAQCategories,
} from '../controllers/faqController';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = express.Router();

// Public routes (require authentication but no specific permission for viewing)
router.get('/project/:projectId', authMiddleware, getFAQsByProject);
router.get('/project/:projectId/categories', authMiddleware, getFAQCategories);
router.get('/:id', authMiddleware, getFAQById);
router.post('/:id/view', authMiddleware, incrementFAQView);
router.post('/:id/feedback', authMiddleware, submitFAQFeedback);

// Protected routes (require specific permissions)
router.post('/', authMiddleware, requirePermission('FAQ_CREATE'), createFAQ);
router.put('/:id', authMiddleware, requirePermission('FAQ_EDIT'), updateFAQ);
router.delete('/:id', authMiddleware, requirePermission('FAQ_DELETE'), deleteFAQ);

export default router;
