import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import mongoose from "mongoose";
import {
  getPaginationParams,
  sendPaginatedResponse,
} from "../utils/pagination";

// Notification model (create this model)
interface INotification {
  _id: string;
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  ticketId?: mongoose.Types.ObjectId;
  link?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get notifications for current user
 * Groups by project for easy viewing
 */
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { page, limit, skip } = getPaginationParams(req.query);

    // Import Notification model (you'll need to create this)
    const Notification = require("../models/Notification").Notification;

    const query = { userId: new mongoose.Types.ObjectId(userId) };

    // Get notifications for user with pagination
    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .populate("projectId", "name code branding")
        .populate("ticketId", "ticketNumber title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
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
 * Mark notification as read
 */
export const markNotificationAsRead = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.userId;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const Notification = require("../models/Notification").Notification;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(notificationId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      { read: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: notification,
    });
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
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const Notification = require("../models/Notification").Notification;

    await Notification.updateMany(
      {
        userId: new mongoose.Types.ObjectId(userId),
        read: false,
      },
      { read: true },
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
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
 * Create notification (helper function for other controllers)
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
    const Notification = require("../models/Notification").Notification;

    const notification = await Notification.create(data);

    // Emit real-time in-app notification via Socket.IO
    try {
      const { getIo } = require("../socket/ioInstance");
      const io = getIo();
      if (io) {
        io.to(`user-${data.userId.toString()}`).emit("notification", {
          ...notification.toObject(),
        });
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
    } catch {
      // non-fatal — push may not be configured
    }

    return notification;
  } catch (error) {
    console.error("Create notification error:", error);
    throw error;
  }
};
