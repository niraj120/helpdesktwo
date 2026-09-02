import express from "express";
import {
  getStatusesByProject,
  getAllStatuses,
  createStatus,
  updateStatus,
  deleteStatus,
  getStatusById,
  reorderStatuses,
} from "../controllers/statusController";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import {
  requireProjectAccess,
  requireResourceProject,
} from "../middleware/requireProjectAccess";
import { Status } from "../models/Status";

const router = express.Router();
const ownsStatus = requireResourceProject(Status, "statusId");

// Get all statuses (admin/debug endpoint)
router.get("/all", authMiddleware, getAllStatuses);

// Get all statuses for a project - any authenticated user (agents, students) can read statuses
router.get("/project/:projectId", authMiddleware, getStatusesByProject);

// Create new status
router.post(
  "/project/:projectId",
  authMiddleware,
  checkPermission([
    "MASTER_DATA_MANAGE_STATUSES",
    "TICKET_CONFIG_MANAGE_STATUSES",
  ]),
  requireProjectAccess("projectId"),
  createStatus,
);

// Reorder statuses
router.put(
  "/project/:projectId/reorder",
  authMiddleware,
  checkPermission([
    "MASTER_DATA_MANAGE_STATUSES",
    "TICKET_CONFIG_MANAGE_STATUSES",
  ]),
  requireProjectAccess("projectId"),
  reorderStatuses,
);

// Get single status
router.get(
  "/:statusId",
  authMiddleware,
  checkPermission("MASTER_DATA_VIEW"),
  getStatusById,
);

// Update a status — authorize the status's OWN project (resource-owns-project)
router.put(
  "/:statusId",
  authMiddleware,
  checkPermission([
    "MASTER_DATA_MANAGE_STATUSES",
    "TICKET_CONFIG_MANAGE_STATUSES",
  ]),
  ownsStatus,
  updateStatus,
);

// Delete a status
router.delete(
  "/:statusId",
  authMiddleware,
  checkPermission([
    "MASTER_DATA_MANAGE_STATUSES",
    "TICKET_CONFIG_MANAGE_STATUSES",
  ]),
  ownsStatus,
  deleteStatus,
);

export default router;
