import { Router } from 'express';
import { auth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  cloneRole,
  getMasterRoles,
} from '../controllers/roleController';

const router = Router();

// All role routes require authentication
router.use(auth);

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private (requires RBAC_VIEW_ROLES OR USER_VIEW_ALL/USER_CREATE for user management)
router.get('/', checkPermission(['RBAC_VIEW_ROLES', 'USER_VIEW_ALL', 'USER_CREATE']), getRoles);

// @desc    Get master roles
// @route   GET /api/roles/master
// @access  Private
router.get('/master/list', getMasterRoles);

// @desc    Get role by ID
// @route   GET /api/roles/:id
// @access  Private
router.get('/:id', getRoleById);

// @desc    Create new role
// @route   POST /api/roles
// @access  Private (requires permission)
router.post('/', checkPermission('RBAC_CREATE_ROLE'), createRole);

// @desc    Clone role from master
// @route   POST /api/roles/:id/clone
// @access  Private (requires permission)
router.post('/:id/clone', checkPermission('RBAC_CREATE_ROLE'), cloneRole);

// @desc    Update role
// @route   PUT /api/roles/:id
// @access  Private (requires permission)
router.put('/:id', checkPermission('RBAC_EDIT_ROLE'), updateRole);

// @desc    Delete role
// @route   DELETE /api/roles/:id
// @access  Private (requires permission)
router.delete('/:id', checkPermission('RBAC_DELETE_ROLE'), deleteRole);

export default router;
