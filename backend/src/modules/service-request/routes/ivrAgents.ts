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

// Agents + mapping
router.get("/", c.listAgents);
router.put("/:userId", c.setAgentMapping);
router.put("/:userId/availability", c.setAvailability);

// Leaves
router.post("/:userId/leaves", c.addLeave);
router.delete("/leaves/:leaveId", c.removeLeave);

export default router;
