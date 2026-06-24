/**
 * IVR call triage routes. Phase 5.
 */
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import * as c from "../controllers/ivrController";

const VIEW = ["SR_PSR_RECEIVE", "SR_PSR_CREATE", "EMAIL_TRIAGE_ACCESS"];

const router = Router();
router.use(authMiddleware);

// Ingest (normally a Tata webhook; manual for testing)
router.post(
  "/calls",
  checkPermission(["SR_PSR_CREATE", "SR_CONFIG_MANAGE"]),
  c.ingest,
);
router.get("/calls", checkPermission(VIEW), c.list);
router.get("/calls/:id", checkPermission(VIEW), c.getOne);
router.post("/calls/:id/classify", checkPermission("SR_PSR_CREATE"), c.classify);
router.post("/calls/:id/convert", checkPermission("SR_PSR_CREATE"), c.convert);
router.post(
  "/calls/:id/resolve-on-call",
  checkPermission("SR_PSR_CREATE"),
  c.resolveOnCall,
);

export default router;
