import express from 'express';
import {
  createAsset,
  getAllAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
  getAssetCategories
} from '../controllers/assetController';
import { auth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// Get asset categories
router.get('/categories/list', auth, getAssetCategories);

// CRUD operations
router.post('/', auth, checkPermission('ASSET_CREATE'), createAsset);
router.get('/', auth, checkPermission('ASSET_VIEW'), getAllAssets);
router.get('/:id', auth, checkPermission('ASSET_VIEW'), getAssetById);
router.put('/:id', auth, checkPermission('ASSET_EDIT'), updateAsset);
router.delete('/:id', auth, checkPermission('ASSET_DELETE'), deleteAsset);

export default router;
