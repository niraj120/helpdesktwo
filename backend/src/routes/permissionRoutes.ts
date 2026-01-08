import { Router } from 'express';
import { auth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  getPermissions,
  getPermissionsGrouped,
  getPermissionById,
} from '../controllers/permissionController';

const router = Router();

// All permission routes require authentication
router.use(auth);

// @desc    Get permissions grouped by category and module
// @route   GET /api/permissions/grouped
// @access  Private
router.get('/grouped', checkPermission('RBAC_VIEW_PERMISSIONS'), getPermissionsGrouped);

// @desc    Get all permissions
// @route   GET /api/permissions
// @access  Private
router.get('/', checkPermission('RBAC_VIEW_PERMISSIONS'), getPermissions);

// @desc    Get permission by ID
// @route   GET /api/permissions/:id
// @access  Private
router.get('/:id', checkPermission('RBAC_VIEW_PERMISSIONS'), getPermissionById);

export default router;
