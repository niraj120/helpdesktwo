/**
 * IVR call triage routes. Phase 5.
 */
import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth";
import { checkPermission } from "../../../middleware/permissions";
import * as c from "../controllers/ivrController";

const VIEW = [
  "IVR_TRIAGE_ACCESS",
  "IVR_TRIAGE_CONVERT",
  "SR_VIEW_ALL",
  "SR_VIEW_ASSIGNED",
  "SR_PSR_RECEIVE",
  "SR_PSR_CREATE",
  "EMAIL_TRIAGE_ACCESS",
];

const router = Router();
router.use(authMiddleware);

// Ingest (normally a Tata webhook; manual for testing)
router.post(
  "/calls",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE", "SR_CONFIG_MANAGE"]),
  c.ingest,
);
router.get("/calls", checkPermission(VIEW), c.list);
// Bulk reassign — must be registered before the /:id routes.
router.post(
  "/calls/bulk-reassign",
  checkPermission(["IVR_AGENT_MANAGE", "IVR_TRIAGE_CONVERT"]),
  c.bulkReassign,
);
router.get("/calls/:id", checkPermission(VIEW), c.getOne);
router.post(
  "/calls/:id/classify",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE"]),
  c.classify,
);
router.post(
  "/calls/:id/convert",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE"]),
  c.convert,
);
router.post(
  "/calls/:id/junk",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE"]),
  c.markJunk,
);
router.post(
  "/calls/:id/converted",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE"]),
  c.markConverted,
);
router.post(
  "/calls/:id/resolve-on-call",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE"]),
  c.resolveOnCall,
);
// WIP / call-back date — when we have committed to ringing the caller back.
router.post(
  "/calls/:id/callback",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE"]),
  c.setCallback,
);
// Outbound Click-to-Call (call the caller back via TATA SmartFlo).
router.post(
  "/calls/:id/click-to-call",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE"]),
  c.clickToCall,
);

export default router;
