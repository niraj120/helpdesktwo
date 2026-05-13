import { Router } from "express";
import {
  getNotificationSettings,
  upsertNotificationSetting,
  deleteProjectNotificationSettings,
} from "../controllers/notificationSettingsController";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";

const router = Router();

router.get("/", auth, checkPermission("NOTIFICATION_VIEW_SETTINGS"), getNotificationSettings);
router.put("/", auth, checkPermission("NOTIFICATION_MANAGE"), upsertNotificationSetting);
router.delete("/", auth, checkPermission("NOTIFICATION_MANAGE"), deleteProjectNotificationSettings);

export default router;
