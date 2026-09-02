import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { requireProjectAccess } from "../middleware/requireProjectAccess";
import {
  getHierarchyConfig,
  saveHierarchyConfig,
  getCategoryTree,
  getCategoryChildren,
  getCategoriesByLevel,
  createHierarchyCategory,
  updateHierarchyCategory,
  deleteHierarchyCategory,
  replicateCategoryScope,
  bulkUploadCategories,
  downloadBulkTemplate,
} from "../controllers/hierarchyConfigController";

const router = Router();

// ==================== HIERARCHY CONFIG ROUTES ====================

/**
 * @route   GET /api/hierarchy-config/:projectId
 * @desc    Get hierarchy configuration for a project
 * @access  Public (needed for forms)
 */
router.get("/:projectId", getHierarchyConfig);

/**
 * @route   POST /api/hierarchy-config/:projectId
 * @desc    Create or update hierarchy configuration
 * @access  Private - requires MASTER_DATA_MANAGE_CATEGORIES permission
 */
router.post(
  "/:projectId",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  requireProjectAccess("projectId"),
  saveHierarchyConfig,
);

// ==================== CATEGORY TREE ROUTES ====================

/**
 * @route   GET /api/hierarchy-config/:projectId/tree
 * @desc    Get all categories as tree structure
 * @access  Public (needed for forms)
 */
router.get("/:projectId/tree", getCategoryTree);

/**
 * @route   GET /api/hierarchy-config/:projectId/children/:parentId
 * @desc    Get children of a specific category
 * @access  Public (needed for cascading dropdowns)
 */
router.get("/:projectId/children/:parentId", getCategoryChildren);

/**
 * @route   GET /api/hierarchy-config/:projectId/level/:levelNumber
 * @desc    Get categories by level (with optional parent filter)
 * @access  Public (needed for forms)
 */
router.get("/:projectId/level/:levelNumber", getCategoriesByLevel);

// ==================== CATEGORY CRUD ROUTES ====================

/**
 * @route   POST /api/hierarchy-config/:projectId/categories
 * @desc    Create a new category with hierarchy support
 * @access  Private - requires MASTER_DATA_MANAGE_CATEGORIES permission
 */
router.post(
  "/:projectId/categories",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  requireProjectAccess("projectId"),
  createHierarchyCategory,
);

/**
 * @route   POST /api/hierarchy-config/:projectId/categories/replicate-scope
 * @desc    Replicate PSR category hierarchy into ISR as independent records
 * @access  Private - requires MASTER_DATA_MANAGE_CATEGORIES permission
 */
router.post(
  "/:projectId/categories/replicate-scope",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  requireProjectAccess("projectId"),
  replicateCategoryScope,
);

/**
 * @route   POST /api/hierarchy-config/:projectId/categories/bulk
 * @desc    Bulk upload categories from CSV data
 * @access  Private - requires MASTER_DATA_MANAGE_CATEGORIES permission
 */
router.post(
  "/:projectId/categories/bulk",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  requireProjectAccess("projectId"),
  bulkUploadCategories,
);

/**
 * @route   GET /api/hierarchy-config/:projectId/categories/template
 * @desc    Download CSV template for bulk upload
 * @access  Private - requires MASTER_DATA_MANAGE_CATEGORIES permission
 */
router.get(
  "/:projectId/categories/template",
  authMiddleware,
  downloadBulkTemplate,
);

/**
 * @route   PUT /api/hierarchy-config/:projectId/categories/:categoryId
 * @desc    Update a category
 * @access  Private - requires MASTER_DATA_MANAGE_CATEGORIES permission
 */
router.put(
  "/:projectId/categories/:categoryId",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  requireProjectAccess("projectId"),
  updateHierarchyCategory,
);

/**
 * @route   DELETE /api/hierarchy-config/:projectId/categories/:categoryId
 * @desc    Delete a category (soft delete by default)
 * @access  Private - requires MASTER_DATA_MANAGE_CATEGORIES permission
 */
router.delete(
  "/:projectId/categories/:categoryId",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  requireProjectAccess("projectId"),
  deleteHierarchyCategory,
);

export default router;
