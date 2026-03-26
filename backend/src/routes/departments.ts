import express from "express";
import {
  getDepartmentsByProject,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

const router = express.Router();

// Get all departments for a project (public-ish — used by dropdowns)
router.get("/project/:projectId", authMiddleware, getDepartmentsByProject);

// Create department under a project
router.post(
  "/project/:projectId",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  createDepartment,
);

// Update department
router.put(
  "/:id",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  updateDepartment,
);

// Delete department
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  deleteDepartment,
);

export default router;
