/**
 * Service Request (PSR/ISR) lifecycle routes. Phase 2.
 * Permission-gated; does not touch existing /api/tickets endpoints.
 */
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import * as c from "../controllers/serviceRequestController";

const router = Router();
router.use(authMiddleware);

const VIEW_PERMS = [
  "SR_PSR_RECEIVE",
  "SR_ISR_RECEIVE",
  "SR_PSR_CREATE",
  "SR_ISR_CREATE",
  "TICKET_VIEW_ALL",
];

// Per-project SR config (enable + WIP limits)
router.get(
  "/config",
  checkPermission(["SR_CONFIG_MANAGE", "SR_PSR_RECEIVE", "SR_PSR_CREATE"]),
  c.getConfig,
);
router.put("/config", checkPermission("SR_CONFIG_MANAGE"), c.updateConfig);

// List service requests
router.get("/", checkPermission(VIEW_PERMS), c.list);

// ── Phase 3: create + lookup + form schemas (static paths first) ─────────────
router.post(
  "/",
  checkPermission(["SR_PSR_CREATE", "SR_ISR_CREATE"]),
  c.create,
);
router.get(
  "/student-lookup",
  checkPermission(["SR_PSR_CREATE", "SR_ISR_CREATE"]),
  c.studentLookup,
);
router.get(
  "/parent-lookup",
  checkPermission(["SR_PSR_CREATE", "SR_ISR_CREATE"]),
  c.parentLookup,
);
router.get(
  "/form-schemas",
  checkPermission(["SR_CONFIG_MANAGE", "SR_PSR_CREATE", "SR_ISR_CREATE"]),
  c.listForms,
);
router.post(
  "/form-schemas",
  checkPermission("SR_CONFIG_MANAGE"),
  c.saveForm,
);
router.delete(
  "/form-schemas/:schemaId",
  checkPermission("SR_CONFIG_MANAGE"),
  c.removeForm,
);

// Duplicate-check before creating an SR
router.get(
  "/duplicates",
  checkPermission(["SR_PSR_CREATE", "SR_ISR_CREATE"]),
  c.checkDuplicates,
);

// Open ↔ WIP ↔ Resolved (committed date enforced for WIP)
router.post(
  "/:id/status",
  checkPermission(["SR_PSR_RECEIVE", "SR_ISR_RECEIVE", "TICKET_CHANGE_STATUS"]),
  c.changeStatus,
);

// Resolved → Closed (closure access)
router.post("/:id/close", checkPermission("SR_CLOSE"), c.close);

// Reassign (TAT frozen) / Delegate (leave/left)
router.post("/:id/reassign", checkPermission("SR_REASSIGN"), c.reassign);
router.post("/:id/delegate", checkPermission("SR_DELEGATE"), c.delegate);

// Re-open (parent/PSL, once) → Principal
router.post("/:id/reopen", checkPermission("SR_REOPEN"), c.reopen);

// PSL satisfaction call for a dissatisfied parent not re-opening
router.post("/:id/psl-call", checkPermission("SR_CLOSE"), c.pslCall);

// Parent final closure + feedback (auth-gated; ownership enforced later)
router.post("/:id/parent-close", c.parentClose);

// Linked ISRs for a PSR (list children) + link an existing ISR to a PSR
router.get("/:id/linked-isrs", checkPermission(VIEW_PERMS), c.linkedIsrs);
router.post(
  "/:id/link-psr",
  checkPermission(["SR_ISR_CREATE", "SR_REASSIGN"]),
  c.linkPsr,
);

// Detail (must be LAST — param route after all static GETs)
router.get("/:id", checkPermission(VIEW_PERMS), c.getOne);

export default router;
