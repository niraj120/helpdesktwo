import express from "express";
import { authMiddleware } from "../../middleware/auth";
import { checkPermission } from "../../middleware/permissions";
import {
  getAllEscalationMatrices,
  getEscalationMatrixById,
  createEscalationMatrix,
  updateEscalationMatrix,
  deleteEscalationMatrix,
  toggleEscalationMatrixStatus,
  getUsersForLevel,
  processAutoEscalation,
  getAutoEscalationCandidates,
  getAutoEscalationJobLog,
  validateEscalationMatrix,
  getEscalationCoverage,
} from "../../controllers/escalation-matrix/escalationMatrixController";

const router = express.Router();

/**
 * Escalation Matrix Routes
 * Base path: /api/escalation-matrix
 *
 * Permission: ESCALATION_MATRIX_MANAGE for CRUD operations
 */

// Validation route - must come before :id routes
router.post(
  "/validate",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_MANAGE"),
  validateEscalationMatrix,
);

// Auto-escalation routes - must come before :id routes
router.post(
  "/auto-escalate/process",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_MANAGE"),
  processAutoEscalation,
);

router.get(
  "/auto-escalate/candidates",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_VIEW"),
  getAutoEscalationCandidates,
);

// US-ESC-012: Job log route - must come before :id routes
router.get(
  "/auto-escalate/job-log",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_VIEW"),
  getAutoEscalationJobLog,
);

// Toggle status - must come before :id route
router.patch(
  "/:id/toggle-status",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_MANAGE"),
  toggleEscalationMatrixStatus,
);

// Get users for a specific level
router.get(
  "/:matrixId/levels/:levelId/users",
  authMiddleware,
  checkPermission(["ESCALATION_MATRIX_VIEW", "TICKET_ESCALATE", "OFFLINE_TICKET_ESCALATE"]),
  getUsersForLevel,
);

// US-ESC-011: Coverage report - must come before :id routes
router.get(
  "/coverage",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_VIEW"),
  getEscalationCoverage,
);

// Get all escalation matrices
router.get(
  "/",
  authMiddleware,
  checkPermission(["ESCALATION_MATRIX_VIEW", "TICKET_ESCALATE", "OFFLINE_TICKET_ESCALATE"]),
  getAllEscalationMatrices,
);

// Get single escalation matrix
router.get(
  "/:id",
  authMiddleware,
  checkPermission(["ESCALATION_MATRIX_VIEW", "TICKET_ESCALATE", "OFFLINE_TICKET_ESCALATE"]),
  getEscalationMatrixById,
);

// Create escalation matrix
router.post(
  "/",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_MANAGE"),
  createEscalationMatrix,
);

// Update escalation matrix
router.put(
  "/:id",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_MANAGE"),
  updateEscalationMatrix,
);

// Delete escalation matrix
router.delete(
  "/:id",
  authMiddleware,
  checkPermission("ESCALATION_MATRIX_MANAGE"),
  deleteEscalationMatrix,
);

export default router;
