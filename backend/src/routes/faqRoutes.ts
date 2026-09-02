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
import {
  requireProjectAccess,
  requireResourceProject,
} from '../middleware/requireProjectAccess';
import FAQ from '../models/FAQ';

const router = express.Router();
const ownsFaq = requireResourceProject(FAQ, 'id');

// Public routes (require authentication but no specific permission for viewing)
router.get('/project/:projectId', authMiddleware, getFAQsByProject);
router.get('/project/:projectId/categories', authMiddleware, getFAQCategories);
router.get('/:id', authMiddleware, getFAQById);
router.post('/:id/view', authMiddleware, incrementFAQView);
router.post('/:id/feedback', authMiddleware, submitFAQFeedback);

// Protected routes (require specific permissions).
// Create carries projectId in the body → guard reads it there. Update/delete
// target a resource :id (its project is enforced in the controller — Tier C).
router.post('/', authMiddleware, requirePermission('FAQ_CREATE'), requireProjectAccess('projectId'), createFAQ);
router.put('/:id', authMiddleware, requirePermission('FAQ_EDIT'), ownsFaq, updateFAQ);
router.delete('/:id', authMiddleware, requirePermission('FAQ_DELETE'), ownsFaq, deleteFAQ);

export default router;
