import { Router } from "express";
import { auth } from "../../middleware/auth";
import { checkPermission } from "../../middleware/permissions";
import { psrAuditLog } from "../../middleware/psrAuditLog";
import {
  listPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  clonePipeline,
  testSourceHandler,
  dryRunPipeline,
  triggerRun,
  listRuns,
  getRun,
  searchPipeline,
} from "../../controllers/psr/psrPipelineController";

// ---------------------------------------------------------------------------
// PSR Pipeline Routes
// Mounted at: /api/psr
//
// All routes require auth. Admin mutations require MDM_MANAGE permission.
// Search endpoint requires MDM_VIEW (agents can search, can't edit pipelines).
// Audit log middleware applied to all write routes (US-5.4).
// ---------------------------------------------------------------------------

const router = Router();

router.use(auth);

// ── Generic search (US-4.1) — read-only, agents access this ────────────────
router.get("/search", checkPermission("MDM_VIEW"), searchPipeline);

// ── Source test & discover (US-1.3) — stateless ────────────────────────────
router.post("/sources/test", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Source Test"), testSourceHandler);

// ── Run record detail (US-5.1) ──────────────────────────────────────────────
router.get("/runs/:runId", checkPermission("MDM_VIEW"), getRun);

// ── Pipeline CRUD (US-2.1) ──────────────────────────────────────────────────
router.get("/pipelines", checkPermission("MDM_VIEW"), listPipelines);
router.post("/pipelines", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Pipeline"), createPipeline);
router.get("/pipelines/:id", checkPermission("MDM_VIEW"), getPipeline);
router.put("/pipelines/:id", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Pipeline"), updatePipeline);
router.delete("/pipelines/:id", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Pipeline"), deletePipeline);

// ── Clone (US-2.1) ──────────────────────────────────────────────────────────
router.post(
  "/pipelines/:id/clone",
  checkPermission("MDM_MANAGE"),
  psrAuditLog("PSR Pipeline"),
  clonePipeline,
);

// ── Dry run (US-2.8) ────────────────────────────────────────────────────────
router.post(
  "/pipelines/:id/dry-run",
  checkPermission("MDM_MANAGE"),
  psrAuditLog("PSR Pipeline Dry Run"),
  dryRunPipeline,
);

// ── Manual run trigger (US-3.7) ─────────────────────────────────────────────
router.post("/pipelines/:id/run", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Pipeline Run"), triggerRun);

// ── Run history (US-5.1) ────────────────────────────────────────────────────
router.get("/pipelines/:id/runs", checkPermission("MDM_VIEW"), listRuns);

export default router;
