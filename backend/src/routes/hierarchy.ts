import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  createHierarchyMapping,
  getUserReportees,
  getAllReporteesRecursive,
  getUserSupervisors,
  getTeamStructure,
  getAllHierarchyMappings,
  deactivateHierarchyMapping,
  updateHierarchyMapping,
} from '../controllers/hierarchyController';

const router = express.Router();

/**
 * @route   POST /api/hierarchy/mapping
 * @desc    Create a new hierarchy mapping (supervisor → reportee)
 * @access  Protected (HIERARCHY_MANAGE_TEAM permission required)
 */
router.post(
  '/mapping',
  authMiddleware,
  checkPermission('HIERARCHY_MANAGE_TEAM'),
  createHierarchyMapping
);

/**
 * @route   GET /api/hierarchy/reportees/:userId
 * @desc    Get direct reportees for a supervisor
 * @access  Protected (HIERARCHY_VIEW_TEAM permission required)
 */
router.get(
  '/reportees/:userId',
  authMiddleware,
  checkPermission('HIERARCHY_VIEW_TEAM'),
  getUserReportees
);

/**
 * @route   GET /api/hierarchy/reportees/:userId/all
 * @desc    Get all reportees recursively (multi-level)
 * @access  Protected (HIERARCHY_VIEW_TEAM permission required)
 */
router.get(
  '/reportees/:userId/all',
  authMiddleware,
  checkPermission('HIERARCHY_VIEW_TEAM'),
  getAllReporteesRecursive
);

/**
 * @route   GET /api/hierarchy/supervisors/:userId
 * @desc    Get supervisor chain for a reportee
 * @access  Protected (HIERARCHY_VIEW_TEAM permission required)
 */
router.get(
  '/supervisors/:userId',
  authMiddleware,
  checkPermission('HIERARCHY_VIEW_TEAM'),
  getUserSupervisors
);

/**
 * @route   GET /api/hierarchy/team-structure
 * @desc    Get full team structure (tree view)
 * @access  Protected (HIERARCHY_VIEW_TEAM permission required)
 */
router.get(
  '/team-structure',
  authMiddleware,
  checkPermission('HIERARCHY_VIEW_TEAM'),
  getTeamStructure
);

/**
 * @route   GET /api/hierarchy/mappings
 * @desc    Get all hierarchy mappings (admin view)
 * @access  Protected (HIERARCHY_MANAGE_TEAM permission required)
 */
router.get(
  '/mappings',
  authMiddleware,
  checkPermission('HIERARCHY_MANAGE_TEAM'),
  getAllHierarchyMappings
);

/**
 * @route   PUT /api/hierarchy/mapping/:id
 * @desc    Update a hierarchy mapping
 * @access  Protected (HIERARCHY_MANAGE_TEAM permission required)
 */
router.put(
  '/mapping/:id',
  authMiddleware,
  checkPermission('HIERARCHY_MANAGE_TEAM'),
  updateHierarchyMapping
);

/**
 * @route   DELETE /api/hierarchy/mapping/:id
 * @desc    Deactivate a hierarchy mapping
 * @access  Protected (HIERARCHY_MANAGE_TEAM permission required)
 */
router.delete(
  '/mapping/:id',
  authMiddleware,
  checkPermission('HIERARCHY_MANAGE_TEAM'),
  deactivateHierarchyMapping
);

export default router;
