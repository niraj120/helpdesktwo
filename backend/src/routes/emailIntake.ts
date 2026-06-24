/**
 * Email triage inbox routes. Phase 4.
 */
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import * as c from "../controllers/emailIntakeController";

const router = Router();
router.use(authMiddleware);

// Ingest (normally fed by the inbound email pipeline; manual for testing)
router.post(
  "/",
  checkPermission(["EMAIL_TRIAGE_ACCESS", "SR_CONFIG_MANAGE"]),
  c.ingest,
);
router.get("/", checkPermission("EMAIL_TRIAGE_ACCESS"), c.list);
router.get("/:id", checkPermission("EMAIL_TRIAGE_ACCESS"), c.getOne);
router.post(
  "/:id/action",
  checkPermission(["EMAIL_TRIAGE_CONVERT", "EMAIL_TRIAGE_RESPOND"]),
  c.action,
);

export default router;
