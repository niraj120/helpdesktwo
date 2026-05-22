/**
 * Personal Dashboard Routes (Phase 3)
 *
 * Requires: authMiddleware only (any authenticated user)
 *
 *   GET    /api/v1/me/personal-dashboards          — list user's personal dashboards
 *   POST   /api/v1/me/personal-dashboards          — create
 *   PUT    /api/v1/me/personal-dashboards/:id      — update
 *   DELETE /api/v1/me/personal-dashboards/:id      — delete
 *   POST   /api/v1/me/personal-dashboards/:id/set-default — set as default
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import {
  listPersonalDashboards,
  createPersonalDashboard,
  updatePersonalDashboard,
  deletePersonalDashboard,
  setDefaultPersonalDashboard,
} from "../controllers/dashboard/personalDashboardController";

const router = Router();

router.get("/", authMiddleware, listPersonalDashboards);
router.post("/", authMiddleware, createPersonalDashboard);
router.put("/:id", authMiddleware, updatePersonalDashboard);
router.delete("/:id", authMiddleware, deletePersonalDashboard);
router.post("/:id/set-default", authMiddleware, setDefaultPersonalDashboard);

export default router;
