/**
 * Me (User-facing) Dashboard Routes
 *
 * Requires: authMiddleware only (any authenticated user)
 *
 *   GET  /api/v1/me/dashboards                        — resolve my tabs
 *   PUT  /api/v1/me/dashboards/:templateId/preference — save user preference
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import {
  resolveMyDashboards,
  updateMyPreference,
} from "../controllers/dashboard/dashboardResolutionController";

const router = Router();

router.get("/", authMiddleware, resolveMyDashboards);
router.put("/:templateId/preference", authMiddleware, updateMyPreference);

export default router;
