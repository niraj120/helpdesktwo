import { Router } from 'express';
import { auth, publicAuth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  requireProjectAccess,
  requireResourceProject,
} from '../middleware/requireProjectAccess';
import { KnowledgeBaseArticle } from '../models/KnowledgeBaseArticle';
import { KBCategory } from '../models/KBCategory';
import { KBSubcategory } from '../models/KBSubcategory';
import {
  getArticlesByProject,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  articleFeedback,
  getCategories
} from '../controllers/knowledgeBaseController';
import {
  createKBCategory,
  getKBCategories,
  updateKBCategory,
  deleteKBCategory
} from '../controllers/kbCategoryController';
import {
  createKBSubcategory,
  getKBSubcategories,
  getKBSubcategoriesByProject,
  updateKBSubcategory,
  deleteKBSubcategory
} from '../controllers/kbSubcategoryController';

const router = Router();
const ownsArticle = requireResourceProject(KnowledgeBaseArticle, 'id');
const ownsKBCategory = requireResourceProject(KBCategory, 'id');
const ownsKBSubcategory = requireResourceProject(KBSubcategory, 'id');

// Public routes - accessible without authentication (for student portal)
router.get('/project/:projectId', publicAuth, getArticlesByProject);
router.get('/project/:projectId/categories', publicAuth, getCategories);
router.get('/:id', publicAuth, getArticleById);
router.post('/:id/feedback', articleFeedback); // Public feedback

// Protected routes - permission-based access control.
// Creates carry projectId in the body → guard reads it there. Update/delete
// target a resource :id (project enforced in controller — Tier C).
router.post('/', auth, checkPermission('KB_CREATE'), requireProjectAccess('projectId'), createArticle);
router.put('/:id', auth, checkPermission('KB_EDIT'), ownsArticle, updateArticle);
router.delete('/:id', auth, checkPermission('KB_DELETE'), ownsArticle, deleteArticle);

// KB Category routes (1st Level) - Super Admin
router.post('/categories', auth, checkPermission('KB_CREATE'), requireProjectAccess('projectId'), createKBCategory);
router.get('/categories/project/:projectId', auth, getKBCategories);
router.put('/categories/:id', auth, checkPermission('KB_EDIT'), ownsKBCategory, updateKBCategory);
router.delete('/categories/:id', auth, checkPermission('KB_DELETE'), ownsKBCategory, deleteKBCategory);

// KB Subcategory routes (2nd Level) - Super Admin
router.post('/subcategories', auth, checkPermission('KB_CREATE'), requireProjectAccess('projectId'), createKBSubcategory);
router.get('/subcategories/category/:categoryId', auth, getKBSubcategories);
router.get('/subcategories/project/:projectId', auth, getKBSubcategoriesByProject);
router.put('/subcategories/:id', auth, checkPermission('KB_EDIT'), ownsKBSubcategory, updateKBSubcategory);
router.delete('/subcategories/:id', auth, checkPermission('KB_DELETE'), ownsKBSubcategory, deleteKBSubcategory);

export default router;
