/** MDM → User sync routes — refresh existing users' active/inactive + profile. */
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import * as c from "../controllers/mdmUserSyncController";

const router = Router();
router.use(authMiddleware);
router.use(checkPermission(["USER_IMPORT", "USER_UPDATE"]));

router.post("/all", c.syncAll);
router.post("/source/:sourceId", c.syncSource);
router.post("/user/:userId", c.syncUser);

export default router;
