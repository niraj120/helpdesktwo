/**
 * Widget Data Routes
 *
 * Requires: authMiddleware only
 *
 *   GET /api/v1/widgets/:widgetKey/data   — execute widget query, return data
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { getWidgetData } from "../controllers/dashboard/widgetDataController";

const router = Router();

router.get("/:widgetKey/data", authMiddleware, getWidgetData);

export default router;
