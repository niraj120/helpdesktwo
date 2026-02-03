import express from 'express';
import { authMiddleware, publicAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import {
  createTable,
  getTables,
  getTableById,
  updateTable,
  addRow,
  updateRow,
  deleteRow,
  deleteTable,
  getPublicTable,
  populateTableFromArticles,
} from '../controllers/kbTableController';

const router = express.Router();

// Public route for viewing tables (no auth required for public access)
router.get('/public/:id', publicAuth, getPublicTable);

// Admin routes - require KB_MANAGE permission
router.post('/', authMiddleware, requirePermission('KB_MANAGE'), createTable);
router.get('/', authMiddleware, requirePermission('KB_MANAGE'), getTables);
router.get('/:id', authMiddleware, requirePermission('KB_MANAGE'), getTableById);
router.put('/:id', authMiddleware, requirePermission('KB_MANAGE'), updateTable);
router.delete('/:id', authMiddleware, requirePermission('KB_MANAGE'), deleteTable);

// Row management
router.post('/:id/rows', authMiddleware, requirePermission('KB_MANAGE'), addRow);
router.put('/:id/rows/:rowId', authMiddleware, requirePermission('KB_MANAGE'), updateRow);
router.delete('/:id/rows/:rowId', authMiddleware, requirePermission('KB_MANAGE'), deleteRow);

// Populate from articles
router.post('/:id/populate-from-articles', authMiddleware, requirePermission('KB_MANAGE'), populateTableFromArticles);

export default router;
