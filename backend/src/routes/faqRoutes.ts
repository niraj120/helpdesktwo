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
import { publicAuthMiddleware } from '../middleware/publicAuthMiddleware';
import { checkPermission } from '../middleware/rbacMiddleware';

const router = express.Router();

// Public routes (require authentication but no specific permission for viewing)
router.get('/project/:projectId', publicAuthMiddleware, getFAQsByProject);
router.get('/project/:projectId/categories', publicAuthMiddleware, getFAQCategories);
router.get('/:id', publicAuthMiddleware, getFAQById);
router.post('/:id/view', publicAuthMiddleware, incrementFAQView);
router.post('/:id/feedback', publicAuthMiddleware, submitFAQFeedback);

// Protected routes (require specific permissions)
router.post('/', publicAuthMiddleware, checkPermission('FAQ_CREATE'), createFAQ);
router.put('/:id', publicAuthMiddleware, checkPermission('FAQ_EDIT'), updateFAQ);
router.delete('/:id', publicAuthMiddleware, checkPermission('FAQ_DELETE'), deleteFAQ);

export default router;
