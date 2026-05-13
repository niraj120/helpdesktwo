import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import mongoose from "mongoose";
import {
  getPaginationParams,
  sendPaginatedResponse,
} from "../utils/pagination";
import { Notification } from "../models/Notification";

/**
 * Get notifications for current user (new schema)
 */
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const recipientId = new mongoose.Types.ObjectId(userId);

    const filter: any = { recipientUserId: recipientId };
    if (req.query.unread === "true") filter.isRead = false;
    if (req.query.entityType) filter.entityType = req.query.entityType;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
    ]);

    return sendPaginatedResponse(res, notifications, total, page, limit);
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get unread notification count for current user
 */
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const count = await Notification.countDocuments({
      recipientUserId: new mongoose.Types.ObjectId(userId),
      isRead: false,
    });

    return res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    console.error("Get unread count error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Mark single notification as read
 */
export const markNotificationAsRead = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.userId;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ success: false, message: "Invalid notification ID" });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(notificationId),
        recipientUserId: new mongoose.Types.ObjectId(userId),
      },
      { isRead: true, readAt: new Date() },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error("Mark notification as read error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Mark all notifications as read for current user
 */
export const markAllNotificationsAsRead = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await Notification.updateMany(
      { recipientUserId: new mongoose.Types.ObjectId(userId), isRead: false },
      { isRead: true, readAt: new Date() },
    );

    return res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Create notification (legacy helper — kept for backward compatibility with push notifications)
 */
export const createNotification = async (data: {
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  ticketId?: mongoose.Types.ObjectId;
  link?: string;
}) => {
  try {
    // Emit real-time via Socket.IO
    try {
      const { getIo } = require("../socket/ioInstance");
      const io = getIo();
      if (io) {
        io.to(`user-${data.userId.toString()}`).emit("notification", data);
      }
    } catch {
      // non-fatal
    }

    // Send web push notification
    try {
      const { sendPushToUser } = require("../services/webPushService");
      await sendPushToUser(data.userId.toString(), {
        title: data.title,
        body: data.message,
        url: data.link || "/",
        tag: data.ticketId
          ? `ticket-${data.ticketId.toString()}`
          : "notification",
      });
    } catch (pushErr: any) {
      console.warn(
        `⚠️ Push notification failed for user ${data.userId}:`,
        pushErr?.message || pushErr,
      );
    }
  } catch (error) {
    console.error("Create notification error:", error);
    throw error;
  }
};
