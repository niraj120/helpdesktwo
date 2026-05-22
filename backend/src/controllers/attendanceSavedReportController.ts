import { Request, Response } from "express";
import mongoose from "mongoose";
import { SavedReport } from "../models/reports/SavedReport";
import { ReportAssignment } from "../models/reports/ReportAssignment";

async function getUserRoleId(userId: string): Promise<string | null> {
  const User = mongoose.model("User");
  const user = await User.findById(userId).populate("role", "_id").lean();
  return (user as any)?.role?._id?.toString() ?? null;
}

/**
 * POST /api/attendance/reports/saved
 * Save or update an attendance report configuration.
 * If body contains `_id`, updates the existing report (must be owned by caller).
 */
export const saveAttendanceReport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const {
      _id,
      name,
      description,
      dataPoints,
      filters,
      sortBy,
      sortOrder,
      projectId,
    } = req.body;

    if (!name || !Array.isArray(dataPoints) || dataPoints.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "name and dataPoints are required" });
    }

    if (_id) {
      // Update existing
      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid report id" });
      }
      const existing = await SavedReport.findOne({
        _id,
        createdBy: userId,
        reportType: "attendance",
      });
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: "Report not found" });
      }
      existing.name = name;
      existing.description = description ?? "";
      existing.dataPoints = dataPoints;
      existing.filters = filters ?? [];
      existing.sortBy = sortBy;
      existing.sortOrder = sortOrder ?? "desc";
      if (projectId) existing.projectId = projectId;
      await existing.save();
      return res.status(200).json({ success: true, data: existing });
    }

    const report = await SavedReport.create({
      name,
      description: description ?? "",
      reportType: "attendance",
      createdBy: userId,
      projectId: projectId || undefined,
      dataPoints,
      filters: filters ?? [],
      sortBy,
      sortOrder: sortOrder ?? "desc",
    });

    return res.status(201).json({ success: true, data: report });
  } catch (err: any) {
    console.error("saveAttendanceReport error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/attendance/reports/saved
 * List saved attendance reports for the current user (or all for super admin).
 */
export const listAttendanceReports = async (req: Request, res: Response) => {
  try {
    // Route is gated to ATTENDANCE_CONFIG — all callers can manage reports.
    // Return all active attendance reports (no createdBy filter).
    const filter: any = { reportType: "attendance", isActive: true };

    const reports = await SavedReport.find(filter)
      .populate("createdBy", "firstName lastName email")
      .sort({ updatedAt: -1 })
      .lean();

    // Attach assignment info
    const reportIds = reports.map((r: any) => r._id);
    const assignments = await ReportAssignment.find({
      reportId: { $in: reportIds },
    }).lean();
    const assignMap: Record<string, any> = {};
    for (const a of assignments) assignMap[(a as any).reportId.toString()] = a;

    const data = reports.map((r: any) => ({
      ...r,
      assignment: assignMap[r._id.toString()] ?? null,
      assignedUsersCount:
        assignMap[r._id.toString()]?.assignedToUsers?.length ?? 0,
      assignedRolesCount:
        assignMap[r._id.toString()]?.assignedToRoles?.length ?? 0,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error("listAttendanceReports error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * DELETE /api/attendance/reports/saved/:id
 * Soft-delete a saved attendance report.
 */
export const deleteAttendanceReport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const report = await SavedReport.findOneAndUpdate(
      { _id: id, createdBy: userId, reportType: "attendance" },
      { isActive: false },
      { new: true },
    );
    if (!report) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    await ReportAssignment.deleteOne({ reportId: id });
    return res.status(200).json({ success: true, message: "Report deleted" });
  } catch (err: any) {
    console.error("deleteAttendanceReport error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/attendance/reports/saved/:id/assignment
 * Get the assignment for a saved attendance report.
 */
export const getAttendanceReportAssignment = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const assignment = await ReportAssignment.findOne({ reportId: id })
      .populate("assignedToUsers", "firstName lastName email")
      .populate("assignedToRoles", "name code")
      .lean();
    return res.status(200).json({ success: true, data: assignment ?? null });
  } catch (err: any) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * PUT /api/attendance/reports/saved/:id/assignment
 * Create or update the assignment for a saved attendance report.
 * Body: { assignedToUsers: string[], assignedToRoles: string[] }
 */
export const updateAttendanceReportAssignment = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const report = await SavedReport.findOne({
      _id: id,
      reportType: "attendance",
      isActive: true,
    }).lean();
    if (!report) {
      return res
        .status(404)
        .json({ success: false, message: "Report not found" });
    }

    const {
      assignedToUsers = [],
      assignedToRoles = [],
      alertEnabled,
      scheduleType,
      scheduleDay,
      scheduleTime,
      ccUsers,
      ccEmails,
    } = req.body;

    const updatePayload: Record<string, any> = {
      reportId: id,
      assignedToUsers: assignedToUsers.map(
        (uid: string) => new mongoose.Types.ObjectId(uid),
      ),
      assignedToRoles: assignedToRoles.map(
        (rid: string) => new mongoose.Types.ObjectId(rid),
      ),
      assignedBy: new mongoose.Types.ObjectId(userId),
      assignedAt: new Date(),
    };
    if (alertEnabled  !== undefined) updatePayload.alertEnabled  = alertEnabled;
    if (scheduleType  !== undefined) updatePayload.scheduleType  = scheduleType;
    if (scheduleDay   !== undefined) updatePayload.scheduleDay   = scheduleDay;
    if (scheduleTime  !== undefined) updatePayload.scheduleTime  = scheduleTime;
    if (ccUsers       !== undefined) updatePayload.ccUsers       = ccUsers;
    if (ccEmails      !== undefined) updatePayload.ccEmails      = ccEmails;

    const doc = await ReportAssignment.findOneAndUpdate(
      { reportId: id },
      updatePayload,
      { upsert: true, new: true, runValidators: true },
    );

    // Register or destroy cron task
    try {
      const { registerAttendanceAlertTask, destroyAttendanceAlertTask } =
        await import("../services/reports/attendanceAlertScheduler");
      if (doc?.alertEnabled) {
        registerAttendanceAlertTask(doc);
      } else {
        destroyAttendanceAlertTask(id);
      }
    } catch (schedErr) {
      console.error("Attendance alert scheduler hook error:", schedErr);
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (err: any) {
    console.error("updateAttendanceReportAssignment error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * GET /api/attendance/reports/mine
 * Returns attendance reports assigned to the current user or their role.
 */
export const getMyAttendanceReports = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    // Prefer role ID already populated by auth middleware; fall back to DB query
    const roleId =
      (req as any).user?.role?._id?.toString() ?? (await getUserRoleId(userId));

    const assignments = await ReportAssignment.find({
      $or: [
        { assignedToUsers: new mongoose.Types.ObjectId(userId) },
        ...(roleId
          ? [{ assignedToRoles: new mongoose.Types.ObjectId(roleId) }]
          : []),
      ],
    }).lean();

    const reportIds = assignments.map((a: any) => a.reportId);

    const reports = await SavedReport.find({
      _id: { $in: reportIds },
      reportType: "attendance",
      isActive: true,
    })
      .populate("createdBy", "firstName lastName email")
      .lean();

    return res.status(200).json({ success: true, data: reports });
  } catch (err: any) {
    console.error("getMyAttendanceReports error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

/**
 * POST /api/attendance/reports/saved/:id/test-alert
 * Immediately fires the scheduled report email for testing purposes.
 */
export const testAttendanceReportAlert = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const { sendAttendanceAlertNow } = await import(
      "../services/reports/attendanceAlertScheduler"
    );
    await sendAttendanceAlertNow(id);
    return res
      .status(200)
      .json({ success: true, message: "Test alert sent successfully" });
  } catch (err: any) {
    console.error("testAttendanceReportAlert error:", err);
    return res.status(500).json({
      success: false,
      message: err.message ?? "Failed to send test alert",
    });
  }
};
