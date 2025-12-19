import { Router } from 'express';
import { auth, publicAuth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
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

// Public routes - accessible without authentication (for student portal)
router.get('/project/:projectId', publicAuth, getArticlesByProject);
router.get('/project/:projectId/categories', publicAuth, getCategories);
router.get('/:id', publicAuth, getArticleById);
router.post('/:id/feedback', articleFeedback); // Public feedback

// Protected routes - permission-based access control
router.post('/', auth, checkPermission('KB_CREATE'), createArticle);
router.put('/:id', auth, checkPermission('KB_EDIT'), updateArticle);
router.delete('/:id', auth, checkPermission('KB_DELETE'), deleteArticle);

// KB Category routes (1st Level) - Super Admin
router.post('/categories', auth, checkPermission('KB_CREATE'), createKBCategory);
router.get('/categories/project/:projectId', auth, getKBCategories);
router.put('/categories/:id', auth, checkPermission('KB_EDIT'), updateKBCategory);
router.delete('/categories/:id', auth, checkPermission('KB_DELETE'), deleteKBCategory);

// KB Subcategory routes (2nd Level) - Super Admin
router.post('/subcategories', auth, checkPermission('KB_CREATE'), createKBSubcategory);
router.get('/subcategories/category/:categoryId', auth, getKBSubcategories);
router.get('/subcategories/project/:projectId', auth, getKBSubcategoriesByProject);
router.put('/subcategories/:id', auth, checkPermission('KB_EDIT'), updateKBSubcategory);
router.delete('/subcategories/:id', auth, checkPermission('KB_DELETE'), deleteKBSubcategory);

export default router;
