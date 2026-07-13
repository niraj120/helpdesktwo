/**
 * Lead (admission enquiry) routes. Phase 4.
 */
import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth";
import { checkPermission } from "../../../middleware/permissions";
import {
  listLeads,
  createLead,
  updateLead,
  deleteLead,
  retryLeadCrmSync,
} from "../controllers/leadController";

const router = Router();
router.use(authMiddleware);

router.get(
  "/",
  checkPermission(["EMAIL_TRIAGE_ACCESS", "EMAIL_TRIAGE_CONVERT", "SR_PSR_CREATE", "SR_CONFIG_MANAGE"]),
  listLeads,
);
router.post("/", checkPermission(["EMAIL_TRIAGE_CONVERT", "SR_PSR_CREATE", "SR_CONFIG_MANAGE"]), createLead);
router.post("/:id/retry-crm-sync", checkPermission(["EMAIL_TRIAGE_CONVERT", "SR_PSR_CREATE", "SR_CONFIG_MANAGE"]), retryLeadCrmSync);
router.put("/:id", checkPermission(["EMAIL_TRIAGE_CONVERT", "SR_PSR_CREATE", "SR_CONFIG_MANAGE"]), updateLead);
router.delete("/:id", checkPermission("SR_CONFIG_MANAGE"), deleteLead);

export default router;
