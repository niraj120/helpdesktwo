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
import { enforceAssetProjectScope } from '../middleware/projectScope';

const router = express.Router();

// Enforce project scope for project-portal logins on all asset category routes
router.use(authMiddleware, enforceAssetProjectScope);

// Get all asset categories (admin/debug endpoint)
router.get('/all', getAllAssetCategories);

// Get all asset categories for a project
router.get('/project/:projectId', getAssetCategoriesByProject);

// Create new asset category
router.post('/project/:projectId', requirePermission('MASTER_DATA_MANAGE_ASSET_CATEGORIES'), createAssetCategory);

// Update an asset category
router.put('/:id', requirePermission('MASTER_DATA_MANAGE_ASSET_CATEGORIES'), updateAssetCategory);

// Delete an asset category
router.delete('/:id', requirePermission('MASTER_DATA_MANAGE_ASSET_CATEGORIES'), deleteAssetCategory);

export default router;
