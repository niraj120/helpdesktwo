import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { NotificationSetting } from "../models/NotificationSetting";
import { TRIGGER_TYPE_VALUES } from "../constants/notificationTriggers";

/**
 * GET /api/admin/notification-settings
 * Returns all notification settings (global + optional project-specific)
 */
export const getNotificationSettings = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { projectId } = req.query;

    const filter: any = {};
    if (projectId) {
      if (!mongoose.Types.ObjectId.isValid(projectId as string)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid projectId" });
      }
      filter.$or = [
        { projectId: new mongoose.Types.ObjectId(projectId as string) },
        { projectId: null },
      ];
    }

    const settings = await NotificationSetting.find(filter)
      .populate("roleId", "name")
      .lean();

    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("Get notification settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notification settings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * PUT /api/admin/notification-settings
 * Upsert a notification setting for a (projectId|null, triggerType, roleId) combo
 */
export const upsertNotificationSetting = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.userId;
    const { projectId, triggerType, roleId, isEnabled, channels } = req.body;

    if (!triggerType || !roleId) {
      return res.status(400).json({
        success: false,
        message: "triggerType and roleId are required",
      });
    }

    if (!(TRIGGER_TYPE_VALUES as string[]).includes(triggerType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid triggerType" });
    }

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid roleId" });
    }

    if (projectId && !mongoose.Types.ObjectId.isValid(projectId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid projectId" });
    }

    const filter: any = {
      triggerType,
      roleId: new mongoose.Types.ObjectId(roleId),
      projectId: projectId ? new mongoose.Types.ObjectId(projectId) : null,
    };

    const update: any = {
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      channels: {
        inApp: channels?.inApp !== undefined ? channels.inApp : true,
        email: channels?.email !== undefined ? channels.email : true,
      },
      updatedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
      updatedAt: new Date(),
    };

    const setting = await NotificationSetting.findOneAndUpdate(
      filter,
      { $set: update },
      { upsert: true, new: true },
    );

    return res.status(200).json({ success: true, data: setting });
  } catch (error) {
    console.error("Upsert notification setting error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save notification setting",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * DELETE /api/admin/notification-settings?roleId=xxx&projectId=xxx
 * Delete all settings for a specific role (and optional project scope).
 * If only projectId is supplied, resets all settings for that project.
 */
export const deleteProjectNotificationSettings = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { projectId, roleId } = req.query;

    if (!roleId && !projectId) {
      return res.status(400).json({
        success: false,
        message: "At least one of roleId or projectId is required",
      });
    }

    const filter: any = {};

    if (roleId) {
      if (!mongoose.Types.ObjectId.isValid(roleId as string)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid roleId" });
      }
      filter.roleId = new mongoose.Types.ObjectId(roleId as string);
    }

    if (projectId) {
      if (!mongoose.Types.ObjectId.isValid(projectId as string)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid projectId" });
      }
      filter.projectId = new mongoose.Types.ObjectId(projectId as string);
    } else if (roleId) {
      // deleting global (non-project) settings for a role
      filter.projectId = null;
    }

    await NotificationSetting.deleteMany(filter);

    return res.status(200).json({
      success: true,
      message: "Notification settings deleted successfully",
    });
  } catch (error) {
    console.error("Delete notification settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete notification settings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
