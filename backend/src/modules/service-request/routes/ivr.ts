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
  "SR_VIEW_OWN",
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
// Who a call may be handed to — needed by anyone who can reassign.
router.get(
  "/assignable-agents",
  checkPermission(["IVR_CALL_REASSIGN", "IVR_AGENT_MANAGE"]),
  c.assignableAgents,
);
// Handing a call to another agent is its own right: being able to convert a
// call does not mean being able to move other people's work around.
router.post(
  "/calls/bulk-reassign",
  checkPermission(["IVR_CALL_REASSIGN", "IVR_AGENT_MANAGE"]),
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
// Call-back ladder (WIP steps + their TAT). The manager owns the policy;
// everyone who logs call-backs needs to read it to render the choices.
router.get(
  "/callback-tat",
  checkPermission(["IVR_TAT_CONFIG", "IVR_CALLBACK_SET", ...VIEW]),
  c.getCallbackTat,
);
router.put(
  "/callback-tat",
  checkPermission("IVR_TAT_CONFIG"),
  c.updateCallbackTat,
);

// WIP / call-back log — a caller may be chased several times, so each
// commitment is appended rather than replacing the last. The agent selects a
// step from the ladder; its TAT sets the due time.
router.post(
  "/calls/:id/followups",
  checkPermission(["IVR_CALLBACK_SET", "IVR_TRIAGE_CONVERT"]),
  c.addFollowUp,
);
router.patch(
  "/calls/:id/followups/:followUpId",
  checkPermission(["IVR_CALLBACK_SET", "IVR_TRIAGE_CONVERT"]),
  c.updateFollowUp,
);
// How a call to the caller went — answered / not connected / asked to call
// back. The only way the ladder moves past its auto-applied first step.
router.post(
  "/calls/:id/attempts",
  checkPermission(["IVR_CALLBACK_SET", "IVR_TRIAGE_CONVERT"]),
  c.logAttempt,
);
// Agent notes on a call — anyone who works the call can leave one.
router.post(
  "/calls/:id/comments",
  checkPermission(["IVR_CALLBACK_SET", "IVR_TRIAGE_CONVERT"]),
  c.addComment,
);
// Outbound Click-to-Call (call the caller back via TATA SmartFlo).
router.post(
  "/calls/:id/click-to-call",
  checkPermission(["IVR_TRIAGE_CONVERT", "SR_PSR_CREATE"]),
  c.clickToCall,
);

export default router;
