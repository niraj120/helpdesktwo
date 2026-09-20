/**
 * Lead (admission enquiry) routes.
 *
 * Leads are an intake channel in their own right, gated like the other
 * channels (email triage, IVR) rather than by "can raise a PSR". Converting a
 * lead ends in a PSR, but working the enquiry queue is a separate job from
 * raising service requests, so SR_PSR_CREATE no longer opens this.
 */
import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth";
import { checkPermission } from "../../../middleware/permissions";
import {
  listLeads,
  lookupLeads,
  createLead,
  updateLead,
  deleteLead,
  retryLeadCrmSync,
} from "../controllers/leadController";

const router = Router();
router.use(authMiddleware);

// Reading the queue: anyone who works leads, plus SR admins.
const READ_LEADS = [
  "SR_LEADS_ACCESS",
  "SR_LEADS_MANAGE",
  "SR_CONFIG_MANAGE",
];
// Changing a lead.
const WRITE_LEADS = ["SR_LEADS_MANAGE", "SR_CONFIG_MANAGE"];

// Existing-enquiry search for the prospect flow (static path, before /:id).
router.get("/lookup", checkPermission(READ_LEADS), lookupLeads);
router.get("/", checkPermission(READ_LEADS), listLeads);
router.post("/", checkPermission(WRITE_LEADS), createLead);
router.post(
  "/:id/retry-crm-sync",
  checkPermission(WRITE_LEADS),
  retryLeadCrmSync,
);
router.put("/:id", checkPermission(WRITE_LEADS), updateLead);
router.delete(
  "/:id",
  checkPermission(["SR_LEADS_DELETE", "SR_CONFIG_MANAGE"]),
  deleteLead,
);

export default router;
