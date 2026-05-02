import { Request, Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { PushSubscription } from "../models/PushSubscription";
import { getVapidPublicKeyAsync } from "../services/webPushService";

/**
 * GET /api/push/vapid-public-key
 * Returns the server's VAPID public key so the frontend can subscribe.
 */
export const getVapidKey = async (_req: Request, res: Response) => {
  const key = await getVapidPublicKeyAsync();
  if (!key) {
    return res
      .status(503)
      .json({
        success: false,
        message: "Push notifications not configured on server",
      });
  }
  return res.json({ success: true, publicKey: key });
};

/**
 * POST /api/push/subscribe
 * Save a browser push subscription for the authenticated user.
 * Body: { endpoint, keys: { p256dh, auth } }
 */
export const subscribe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid subscription object" });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        userId: new mongoose.Types.ObjectId(userId),
        endpoint,
        keys,
        userAgent: req.headers["user-agent"] || "",
      },
      { upsert: true, new: true },
    );

    return res
      .status(201)
      .json({ success: true, message: "Subscribed to push notifications" });
  } catch (error) {
    console.error("Subscribe push error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to subscribe" });
  }
};

/**
 * DELETE /api/push/unsubscribe
 * Remove a push subscription (e.g. when user disables notifications).
 * Body: { endpoint }
 */
export const unsubscribe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { endpoint } = req.body;
    if (!endpoint)
      return res
        .status(400)
        .json({ success: false, message: "endpoint required" });

    await PushSubscription.deleteOne({
      userId: new mongoose.Types.ObjectId(userId),
      endpoint,
    });

    return res.json({
      success: true,
      message: "Unsubscribed from push notifications",
    });
  } catch (error) {
    console.error("Unsubscribe push error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to unsubscribe" });
  }
};
