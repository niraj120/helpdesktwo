import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { UserNotificationPreference } from "../models/UserNotificationPreference";
import { TRIGGER_TYPE_VALUES } from "../constants/notificationTriggers";

/**
 * GET /api/me/notification-preferences
 * Returns all notification preferences for the authenticated user
 */
export const getMyNotificationPreferences = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const prefs = await UserNotificationPreference.find({
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    return res.status(200).json({ success: true, data: prefs });
  } catch (error) {
    console.error("Get notification preferences error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notification preferences",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * PUT /api/me/notification-preferences/:triggerType
 * Upsert a single notification preference for the authenticated user
 */
export const upsertMyNotificationPreference = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { triggerType } = req.params;
    const { inAppEnabled, emailEnabled } = req.body;

    if (!(TRIGGER_TYPE_VALUES as string[]).includes(triggerType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid triggerType" });
    }

    const filter = {
      userId: new mongoose.Types.ObjectId(userId),
      triggerType,
    };

    const update: any = { updatedAt: new Date() };
    if (inAppEnabled !== undefined) update.inAppEnabled = inAppEnabled;
    if (emailEnabled !== undefined) update.emailEnabled = emailEnabled;

    const pref = await UserNotificationPreference.findOneAndUpdate(
      filter,
      { $set: update },
      { upsert: true, new: true },
    );

    return res.status(200).json({ success: true, data: pref });
  } catch (error) {
    console.error("Upsert notification preference error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save notification preference",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
