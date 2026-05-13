import { Router } from "express";
import {
  getMyNotificationPreferences,
  upsertMyNotificationPreference,
} from "../controllers/userNotificationPrefController";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";

const router = Router();

router.get("/", auth, getMyNotificationPreferences);
router.put(
  "/:triggerType",
  auth,
  checkPermission("NOTIFICATION_PERSONAL_PREFERENCES"),
  upsertMyNotificationPreference,
);

export default router;
