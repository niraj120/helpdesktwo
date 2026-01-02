import express from 'express';
import {
  getAssetCategoriesByProject,
  getAllAssetCategories,
  createAssetCategory,
  updateAssetCategory,
  deleteAssetCategory,
} from '../controllers/assetCategoryController';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = express.Router();

// Get all asset categories (admin/debug endpoint)
router.get('/all', authMiddleware, getAllAssetCategories);

// Get all asset categories for a project
router.get('/project/:projectId', authMiddleware, getAssetCategoriesByProject);

// Create new asset category
router.post('/project/:projectId', authMiddleware, requirePermission('MASTER_DATA_MANAGE_ASSET_CATEGORIES'), createAssetCategory);

// Update an asset category
router.put('/:id', authMiddleware, requirePermission('MASTER_DATA_MANAGE_ASSET_CATEGORIES'), updateAssetCategory);

// Delete an asset category
router.delete('/:id', authMiddleware, requirePermission('MASTER_DATA_MANAGE_ASSET_CATEGORIES'), deleteAssetCategory);

export default router;
