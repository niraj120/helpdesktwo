/**
 * IVR Agent Management routes — gated by IVR_AGENT_MANAGE.
 * Manage which agents handle which IVR digit buckets + their leaves, per project.
 */
import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth";
import { checkPermission } from "../../../middleware/permissions";
import {
  requireProjectAccess,
  requireResourceProject,
} from "../../../middleware/requireProjectAccess";
import { IvrAgentLeave } from "../../../models/IvrAgentLeave";
import { IvrDidConfig } from "../../../models/IvrDidConfig";
import * as c from "../controllers/ivrAgentController";

const router = Router();
router.use(authMiddleware);
router.use(checkPermission("IVR_AGENT_MANAGE"));

// The permission says the role may manage IVR agents at all; this says "…for
// THIS project". Project-scoped managers (portal logins) reach only the
// projects they are assigned to, whatever projectId they put on the wire.
// Super Admins bypass and keep global reach.
const scoped = requireProjectAccess("projectId");

// Project digit-bucket config
router.get("/digits", scoped, c.getDigitConfig);
router.put("/digits", scoped, c.setDigitConfig);

// DID registry (multiple DIDs → dedicated agent(s)).
// MUST be registered before the "/:userId" routes so "/dids" isn't captured
// by the ":userId" param.
router.get("/dids", scoped, c.listDids);
router.put("/dids", scoped, c.upsertDid);
// Keyed on the DID's own id, so authorize the project the stored record owns.
router.delete(
  "/dids/:didId",
  requireResourceProject(IvrDidConfig, "didId", "projectId"),
  c.deleteDid,
);

// Agents + mapping
router.get("/", scoped, c.listAgents);
router.put("/:userId", scoped, c.setAgentMapping);
router.put("/:userId/availability", scoped, c.setAvailability);

// Leaves
router.post("/:userId/leaves", scoped, c.addLeave);
router.delete(
  "/leaves/:leaveId",
  requireResourceProject(IvrAgentLeave, "leaveId", "projectId"),
  c.removeLeave,
);

export default router;
