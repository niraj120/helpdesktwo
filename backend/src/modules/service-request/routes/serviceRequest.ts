/**
 * Service Request (PSR/ISR) lifecycle routes.
 *
 * Service requests carry their own permission set, separate from the queries
 * desk: SR_* here, TICKET_* over in /api/tickets. A PSR/ISR is stored as a
 * Ticket, but granting someone the run of the query desk gives them no reach
 * over service requests. The shared /api/tickets/:id endpoints resolve which
 * set applies per record — see middleware/ticketActionPermission.ts and the
 * ACTION_PERMISSIONS map it reads.
 */
import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth";
import { checkPermission } from "../../../middleware/permissions";
import * as c from "../controllers/serviceRequestController";

const router = Router();
router.use(authMiddleware);

// Module access. SR_ACCESS says the caller works in the Service Requests area at
// all; the per-route SR_* gates below say what they may do once inside.
router.use(checkPermission("SR_ACCESS"));

// Who may see service requests at all; the controller then narrows the result
// set to the ones this caller owns, was assigned, or may see project-wide.
const VIEW_PERMS = [
  "SR_VIEW_ALL",
  "SR_VIEW_OWN",
  "SR_PSR_CREATE",
  "SR_ISR_CREATE",
];

// Per-project SR config (enable + WIP limits)
router.get(
  "/config",
  checkPermission(["SR_CONFIG_MANAGE", ...VIEW_PERMS]),
  c.getConfig,
);
router.put("/config", checkPermission("SR_CONFIG_MANAGE"), c.updateConfig);
router.post(
  "/config/test-crm",
  checkPermission("SR_CONFIG_MANAGE"),
  c.testLeadCrmConfig,
);

// Test PSR entity-scope routing: resolve owners for a { school, grade, subject } tuple
router.post(
  "/config/test-psr-routing",
  checkPermission("SR_CONFIG_MANAGE"),
  c.testPsrRouting,
);

// Recompute open SR TATs against the working calendar (#13)
router.post(
  "/recompute-tat",
  checkPermission("SR_CONFIG_MANAGE"),
  c.recomputeTat,
);

// SR notification templates (#9)
router.get(
  "/notification-templates",
  checkPermission("SR_CONFIG_MANAGE"),
  c.listNotificationTemplates,
);
router.put(
  "/notification-templates",
  checkPermission("SR_CONFIG_MANAGE"),
  c.upsertNotificationTemplate,
);

// List service requests
router.get("/", checkPermission(VIEW_PERMS), c.list);

// ── Phase 3: create + lookup + form schemas (static paths first) ─────────────
// Create. The controller enforces the per-type split: raising a PSR needs
// SR_PSR_CREATE, raising an ISR needs SR_ISR_CREATE.
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
  "/form-mdm-options",
  checkPermission(["SR_CONFIG_MANAGE", "SR_PSR_CREATE", "SR_ISR_CREATE"]),
  c.formMdmOptions,
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

// Tags in use, for the list filter. Static path, so before /:id.
router.get("/tags", checkPermission(VIEW_PERMS), c.tags);

// Duplicate-check before creating an SR
router.get(
  "/duplicates",
  checkPermission(["SR_PSR_CREATE", "SR_ISR_CREATE"]),
  c.checkDuplicates,
);

router.delete("/bulk", checkPermission("SR_DELETE"), c.bulkDelete);
router.post("/:id/merge", checkPermission("SR_MERGE"), c.merge);

// Open ↔ WIP ↔ Resolved (committed date enforced for WIP)
router.post(
  "/:id/status",
  checkPermission("SR_CHANGE_STATUS"),
  c.changeStatus,
);

// Resolved → Closed (closure access)
router.post("/:id/close", checkPermission("SR_CLOSE"), c.close);

// Reassign (TAT frozen) / Delegate (leave/left)
router.post("/:id/reassign", checkPermission("SR_REASSIGN"), c.reassign);
router.post("/:id/delegate", checkPermission("SR_DELEGATE"), c.delegate);

// Re-open (parent/PSL, once) → Principal
router.post("/:id/reopen", checkPermission("SR_REOPEN"), c.reopen);

// Cancel with reason (optional replacement SR link)
router.post("/:id/cancel", checkPermission("SR_CANCEL"), c.cancel);

// PSL satisfaction call for a dissatisfied parent not re-opening
router.post("/:id/psl-call", checkPermission("SR_CLOSE"), c.pslCall);

// Parent final closure + feedback (auth-gated; ownership enforced later)
router.post("/:id/parent-close", c.parentClose);

// Linked ISRs for a PSR (list children) + link an existing ISR to a PSR
router.get("/:id/linked-isrs", checkPermission(VIEW_PERMS), c.linkedIsrs);
router.post(
  "/:id/link-psr",
  checkPermission(["SR_ISR_LINK", "SR_ISR_CREATE"]),
  c.linkPsr,
);

// Detail (must be LAST — param route after all static GETs)
router.get("/:id", checkPermission(VIEW_PERMS), c.getOne);

export default router;
