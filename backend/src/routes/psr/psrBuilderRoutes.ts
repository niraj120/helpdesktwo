import { Router } from "express";
import { auth } from "../../middleware/auth";
import { checkPermission } from "../../middleware/permissions";
import { psrAuditLog } from "../../middleware/psrAuditLog";
import {
  listMasters, getMaster, createMaster, updateMaster, deleteMaster,
  testMaster, loadKeys,
  listTables, getTable, saveTable, deleteTable, previewTable, refreshTable, updateSchedule, runPreviewTable,
  searchTable,
} from "../../controllers/psr/psrBuilderController";

const router = Router();
router.use(auth);

// ── Masters ─────────────────────────────────────────────────────────────────
router.get("/masters", checkPermission("MDM_VIEW"), listMasters);
router.get("/masters/:id", checkPermission("MDM_VIEW"), getMaster);
router.post("/masters", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Master"), createMaster);
router.put("/masters/:id", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Master"), updateMaster);
router.delete("/masters/:id", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Master"), deleteMaster);
router.post("/masters/test", checkPermission("MDM_MANAGE"), testMaster);
router.post("/masters/load-keys", checkPermission("MDM_MANAGE"), loadKeys);

// ── Tables ──────────────────────────────────────────────────────────────────
router.get("/tables", checkPermission("MDM_VIEW"), listTables);
router.post("/tables", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Table"), saveTable);
router.get("/tables/:id", checkPermission("MDM_VIEW"), getTable);
router.put("/tables/:id", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Table"), saveTable);
router.delete("/tables/:id", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Table"), deleteTable);
router.post("/tables/preview", checkPermission("MDM_MANAGE"), previewTable);
router.post("/tables/:id/refresh", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Table Refresh"), refreshTable);
router.get("/tables/:id/run-preview", checkPermission("MDM_MANAGE"), runPreviewTable);
router.put("/tables/:id/schedule", checkPermission("MDM_MANAGE"), psrAuditLog("PSR Table Schedule"), updateSchedule);

// ── Agent search ─────────────────────────────────────────────────────────────
// Read-only lookup of synced parent data used in SR creation.
// Auth is enforced by router.use(auth) above — no additional permission needed
// since any logged-in user who can access the portal can search parents.
router.get("/search", searchTable);

export default router;
