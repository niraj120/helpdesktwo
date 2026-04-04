import express from "express";
import {
  getCategoriesByProject,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryById,
} from "../controllers/categoryController";
import {
  getAssignmentConfig,
  upsertAssignmentConfig,
  deleteAssignmentConfig,
  assignmentPreview,
} from "../controllers/ticket-module/categoryAssignmentController";
import {
  getCategorySLA,
  upsertCategorySLA,
} from "../controllers/ticket-module/categorySLAController";
import {
  getCategoryEscalationConfig,
  upsertCategoryEscalationConfig,
  resolvedCategoryEscalationConfig,
} from "../controllers/ticket-module/categoryEscalationController";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const router = express.Router();

// Get all categories (admin/debug endpoint)
router.get("/all", authMiddleware, getAllCategories);

// Get all categories for a project (must come before /:categoryId)
router.get("/project/:projectId", getCategoriesByProject);

// Create new category
router.post(
  "/project/:projectId",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  createCategory,
);

// Update a category
router.put(
  "/:categoryId",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  updateCategory,
);

// Delete a category
router.delete(
  "/:categoryId",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  deleteCategory,
);

// Get single category (must come after /project/:projectId to avoid conflicts)
router.get(
  "/:categoryId",
  authMiddleware,
  requirePermission("MASTER_DATA_VIEW"),
  getCategoryById,
);

// ── Category Assignment Config ─────────────────────────────────────────────
// Public preview (student portal — no agent names exposed)
router.get(
  "/:categoryId/assignment-preview",
  authMiddleware,
  assignmentPreview,
);

// View assignment config
router.get(
  "/:categoryId/assignment-config",
  authMiddleware,
  requirePermission("MASTER_DATA_VIEW"),
  getAssignmentConfig,
);

// Create/update assignment config (upsert)
router.put(
  "/:categoryId/assignment-config",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  upsertAssignmentConfig,
);

// Remove assignment config (reverts to project-level fallback)
router.delete(
  "/:categoryId/assignment-config",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  deleteAssignmentConfig,
);

// ── Category SLA Override ──────────────────────────────────────────────────
// Get category SLA override (null if not set)
router.get(
  "/:categoryId/sla",
  authMiddleware,
  requirePermission("MASTER_DATA_VIEW"),
  getCategorySLA,
);

// Create/update category SLA override
router.put(
  "/:categoryId/sla",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  upsertCategorySLA,
);

// ── Category Escalation Config ─────────────────────────────────────────────
// Get resolved (inherited) escalation matrix for a category (US-ESC-003)
router.get(
  "/:categoryId/escalation-config/resolved",
  authMiddleware,
  requirePermission("MASTER_DATA_VIEW"),
  resolvedCategoryEscalationConfig,
);

// Get category escalation matrix override (null if not set)
router.get(
  "/:categoryId/escalation-config",
  authMiddleware,
  requirePermission("MASTER_DATA_VIEW"),
  getCategoryEscalationConfig,
);

// Create/update category escalation matrix override
router.put(
  "/:categoryId/escalation-config",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  upsertCategoryEscalationConfig,
);

export default router;
