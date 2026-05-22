/**
 * Dashboard Usage Analytics Routes (Phase 3)
 *
 *   POST /api/v1/usage/track                 — record event (any authenticated user)
 *   GET  /api/v1/admin/usage/dashboard-summary — admin analytics
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import {
  trackUsageEvent,
  getUsageSummary,
} from "../controllers/dashboard/usageAnalyticsController";

const router = Router();

router.post("/track", authMiddleware, trackUsageEvent);
router.get(
  "/dashboard-summary",
  authMiddleware,
  requirePermission("dashboard.manage"),
  getUsageSummary,
);

export default router;
