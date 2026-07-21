/**
 * IVR Agent Management routes — gated by IVR_AGENT_MANAGE.
 * Manage which agents handle which IVR digit buckets + their leaves, per project.
 */
import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth";
import { checkPermission } from "../../../middleware/permissions";
import * as c from "../controllers/ivrAgentController";

const router = Router();
router.use(authMiddleware);
router.use(checkPermission("IVR_AGENT_MANAGE"));

// Project digit-bucket config
router.get("/digits", c.getDigitConfig);
router.put("/digits", c.setDigitConfig);

// DID registry (multiple DIDs → dedicated agent(s)).
// MUST be registered before the "/:userId" routes so "/dids" isn't captured
// by the ":userId" param.
router.get("/dids", c.listDids);
router.put("/dids", c.upsertDid);
router.delete("/dids/:didId", c.deleteDid);

// Agents + mapping
router.get("/", c.listAgents);
router.put("/:userId", c.setAgentMapping);
router.put("/:userId/availability", c.setAvailability);

// Leaves
router.post("/:userId/leaves", c.addLeave);
router.delete("/leaves/:leaveId", c.removeLeave);

export default router;
