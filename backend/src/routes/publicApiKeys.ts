import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import {
  createPublicApiKey,
  rotatePublicApiKey,
  listPublicApiKeys,
  revokePublicApiKey,
} from "../controllers/publicApiKeyController";

const router = Router();

// All routes require authentication + admin permission
router.use(authMiddleware);
router.use(checkPermission("SYSTEM_ADMIN"));

router.get("/", listPublicApiKeys);
router.post("/", createPublicApiKey);
router.post("/:id/rotate", rotatePublicApiKey);
router.patch("/:id/revoke", revokePublicApiKey);
router.delete("/:id", revokePublicApiKey);

export default router;
