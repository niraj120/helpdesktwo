/**
 * RoleMappingRule routes. Phase 6 — onboarding role mapping.
 */
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
} from "../controllers/roleMappingController";

const router = Router();
router.use(authMiddleware);

router.get(
  "/",
  checkPermission(["USER_ASSIGN_ROLE", "USER_VIEW_ALL", "USER_IMPORT"]),
  listRules,
);
router.post("/", checkPermission(["USER_ASSIGN_ROLE", "USER_IMPORT"]), createRule);
router.put("/:id", checkPermission(["USER_ASSIGN_ROLE", "USER_IMPORT"]), updateRule);
router.delete("/:id", checkPermission(["USER_ASSIGN_ROLE", "USER_IMPORT"]), deleteRule);

export default router;
