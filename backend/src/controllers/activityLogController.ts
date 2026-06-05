import { Request, Response } from "express";
import ActivityLog from "../models/ActivityLog";
import { User } from "../models/User";
import { AuthRequest } from "../middleware/auth";

// Get all activity logs with filtering and pagination
export const getAllActivityLogs = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      entity,
      projectId,
      centerId,
      startDate,
      endDate,
      search,
    } = req.query;

    const filter: any = {};

    // Apply filters
    if (userId) {
      filter.userId = userId;
    }
    if (action) {
      filter.action = { $regex: `^${action}$`, $options: "i" };
    }
    if (entity) {
      filter.entity = { $regex: entity, $options: "i" };
    }
    if (projectId) {
      filter.project = projectId;
    }
    if (centerId) {
      // Filter logs by users mapped to the given center
      const usersInCenter = await User.find({ centers: centerId })
        .select("_id")
        .lean();
      const userIds = usersInCenter.map((u: any) => u._id);
      filter.userId = { $in: userIds };
    }
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        // Start of the selected day (00:00:00.000 UTC)
        filter.timestamp.$gte = new Date(
          (startDate as string) + "T00:00:00.000Z",
        );
      }
      if (endDate) {
        // End of the selected day (23:59:59.999 UTC)
        filter.timestamp.$lte = new Date(
          (endDate as string) + "T23:59:59.999Z",
        );
      }
    }
    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { entityName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate({
          path: "userId",
          select: "firstName lastName email role",
          populate: { path: "role", select: "name" },
        })
        .populate("project", "name code")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    // Backfill missing role from the user's current role for display.
    const data = (logs as any[]).map((log) => ({
      ...log,
      role: log.role || log.userId?.role?.name || "",
    }));

    res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error("Error fetching activity logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity logs",
      error: error.message,
    });
  }
};

// Get single activity log by ID
export const getActivityLogById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    const log = await ActivityLog.findById(id)
      .populate("userId", "firstName lastName email")
      .populate("project", "name code");

    if (!log) {
      res.status(404).json({
        success: false,
        message: "Activity log not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: log,
    });
  } catch (error: any) {
    console.error("Error fetching activity log:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity log",
      error: error.message,
    });
  }
};

// Create activity log (typically called by utility function)
export const createActivityLog = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const logData = {
      ...req.body,
      timestamp: new Date(),
    };

    const log = new ActivityLog(logData);
    await log.save();

    res.status(201).json({
      success: true,
      message: "Activity log created successfully",
      data: log,
    });
  } catch (error: any) {
    console.error("Error creating activity log:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create activity log",
      error: error.message,
    });
  }
};

// Get activity log statistics
export const getActivityStats = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.timestamp = {};
      if (startDate) {
        dateFilter.timestamp.$gte = new Date(
          (startDate as string) + "T00:00:00.000Z",
        );
      }
      if (endDate) {
        dateFilter.timestamp.$lte = new Date(
          (endDate as string) + "T23:59:59.999Z",
        );
      }
    }

    const [actionStats, entityStats, totalLogs] = await Promise.all([
      ActivityLog.aggregate([
        { $match: dateFilter },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.aggregate([
        { $match: dateFilter },
        { $group: { _id: "$entity", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.countDocuments(dateFilter),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalLogs,
        byAction: actionStats,
        byEntity: entityStats,
      },
    });
  } catch (error: any) {
    console.error("Error fetching activity stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity statistics",
      error: error.message,
    });
  }
};

// Export activity logs (returns data for download)
export const exportActivityLogs = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const {
      userId,
      action,
      entity,
      projectId,
      centerId,
      search,
      startDate,
      endDate,
    } = req.query;

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = { $regex: `^${action}$`, $options: "i" };
    if (entity) filter.entity = { $regex: entity as string, $options: "i" };
    if (projectId) filter.project = projectId;
    if (centerId) {
      const usersInCenter = await User.find({ centers: centerId })
        .select("_id")
        .lean();
      const userIds = usersInCenter.map((u: any) => u._id);
      filter.userId = { $in: userIds };
    }
    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { entityName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate)
        filter.timestamp.$gte = new Date(
          (startDate as string) + "T00:00:00.000Z",
        );
      if (endDate)
        filter.timestamp.$lte = new Date(
          (endDate as string) + "T23:59:59.999Z",
        );
    }

    const logs = await ActivityLog.find(filter)
      .populate({
        path: "userId",
        select: "firstName lastName email role",
        populate: { path: "role", select: "name" },
      })
      .populate("project", "name code")
      .sort({ timestamp: -1 })
      .limit(10000) // Limit export to 10k records
      .lean();

    // Backfill the role column: many older logs were stored without a `role`,
    // so fall back to the user's current role name when it's missing.
    const data = logs.map((log: any) => ({
      ...log,
      role: log.role || log.userId?.role?.name || "",
    }));

    res.status(200).json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error: any) {
    console.error("Error exporting activity logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export activity logs",
      error: error.message,
    });
  }
};
