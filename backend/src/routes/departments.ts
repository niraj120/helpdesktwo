import express from "express";
import {
  getDepartmentsByProject,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import {
  requireProjectAccess,
  requireResourceProject,
} from "../middleware/requireProjectAccess";
import Department from "../models/Department";

const router = express.Router();
const ownsDepartment = requireResourceProject(Department, "id");

// Get all departments for a project (public-ish — used by dropdowns)
router.get("/project/:projectId", authMiddleware, getDepartmentsByProject);

// Create department under a project
router.post(
  "/project/:projectId",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  requireProjectAccess("projectId"),
  createDepartment,
);

// Update department — authorize the department's OWN project.
router.put(
  "/:id",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  ownsDepartment,
  updateDepartment,
);

// Delete department — authorize the department's OWN project.
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("MASTER_DATA_MANAGE_CATEGORIES"),
  ownsDepartment,
  deleteDepartment,
);

export default router;
