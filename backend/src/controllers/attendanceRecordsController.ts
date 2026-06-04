import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  AttendanceRecord,
  IAttendanceRecord,
} from "../models/attendance/AttendanceRecord";
import { AttendanceConfig } from "../models/attendance/AttendanceConfig";
import { User } from "../models/User";
import { WorkingCalendar } from "../models/WorkingCalendar";

// A Super Admin bypasses every permission gate at the route level
// (see middleware/permissions.ts `isSuperAdmin`). Their JWT does NOT necessarily
// carry the ATTENDANCE_* codes — e.g. when the SUPER_ADMIN role predates those
// permissions or the token was issued before a re-seed. We must mirror that
// bypass here, otherwise permKeyFromPermissions() falls through to "employee"
// and the records query gets scoped to the admin's own userId → no rows.
function isSuperAdminUser(reqUser: {
  role?: { code?: string; name?: string } | unknown;
}): boolean {
  const role = reqUser?.role as { code?: string; name?: string } | undefined;
  if (!role) return false;
  return role.code === "SUPER_ADMIN" || role.name === "Super Admin";
}

// Derive field-permission access level purely from the user's permission codes.
// No hardcoded role codes — works for any custom role.
function permKeyFromPermissions(
  perms: string[],
): "admin" | "manager" | "hr" | "employee" {
  if (perms.includes("ATTENDANCE_CONFIG")) return "admin";
  if (
    perms.includes("ATTENDANCE_SYNC") ||
    perms.includes("ATTENDANCE_VIEW") ||
    perms.includes("ATTENDANCE_REPORT_VIEW") ||
    perms.includes("ATTENDANCE_EXPORT")
  )
    return "manager";
  return "employee";
}

// Strip fields the requesting role cannot see, per AttendanceConfig.fieldPermissions
function serializeRecord(
  record: IAttendanceRecord & Record<string, unknown>,
  permKey: "admin" | "manager" | "hr" | "employee",
  fieldPermissions: Record<
    string,
    { admin: boolean; manager: boolean; hr: boolean; employee: boolean }
  >,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    _id: record._id,
    projectId: record.projectId,
    userId: record.userId,
    attendanceDate: record.attendanceDate,
    syncRunId: record.syncRunId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  const fieldMap: Record<string, unknown> = {
    employee_id: record.employeeCode,
    punch_in: record.punchIn ?? null,
    punch_out: record.punchOut ?? null,
    total_working_hours: record.totalWorkingHours ?? null,
    status: record.status,
    center: record.center ?? null,
    geo:
      record.geoLat != null
        ? { lat: record.geoLat, long: record.geoLong }
        : null,
    published: record.published ?? null,
  };

  for (const [fieldId, value] of Object.entries(fieldMap)) {
    const perm = fieldPermissions[fieldId];
    // If no permission entry, default to showing for admin only
    if (!perm || perm[permKey]) {
      out[fieldId] = value;
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/records
// Query: projectId, userId?, dateFrom?, dateTo?, status?, center?, page?, limit?
// ─────────────────────────────────────────────────────────────────────────────
export const getAttendanceRecords = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const reqUser = (
      req as Request & {
        user?: {
          userId: string;
          role?: { code?: string; name?: string; [key: string]: unknown };
        };
      }
    ).user;
    const { projectId, userId, status, center, dateFrom, dateTo } = req.query;

    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      200,
      Math.max(1, parseInt(req.query.limit as string) || 50),
    );

    const query: Record<string, unknown> = {
      projectId: new mongoose.Types.ObjectId(projectId as string),
    };

    // Derive access level from JWT permissions — no hardcoded role codes
    const rolePerms: string[] = Array.isArray(
      (reqUser?.role as any)?.permissions,
    )
      ? (reqUser?.role as any).permissions.map((p: any) =>
          typeof p === "string" ? p : p.code || "",
        )
      : [];
    const permKey = isSuperAdminUser(reqUser ?? {})
      ? "admin"
      : permKeyFromPermissions(rolePerms);

    if (permKey === "employee") {
      // Force scope to current user's records
      if (reqUser?.userId) {
        query.userId = new mongoose.Types.ObjectId(reqUser.userId);
      }
    } else if (userId) {
      query.userId = new mongoose.Types.ObjectId(userId as string);
    }

    if (status) query.status = status;
    if (center) query.center = center;

    if (dateFrom || dateTo) {
      const dateRange: Record<string, Date> = {};
      if (dateFrom) dateRange.$gte = new Date(dateFrom as string);
      if (dateTo) {
        const to = new Date(dateTo as string);
        to.setHours(23, 59, 59, 999);
        dateRange.$lte = to;
      }
      query.attendanceDate = dateRange;
    }

    // Load field permissions config
    const config = await AttendanceConfig.findOne({
      projectId: new mongoose.Types.ObjectId(projectId as string),
    }).lean();

    const fieldPermissions =
      (config?.fieldPermissions as Record<
        string,
        { admin: boolean; manager: boolean; hr: boolean; employee: boolean }
      >) ?? {};

    const [raw, total] = await Promise.all([
      AttendanceRecord.find(query)
        .sort({ attendanceDate: -1, employeeCode: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AttendanceRecord.countDocuments(query),
    ]);

    // Batch-fetch user names for all records in one query
    const userIds = [
      ...new Set(raw.map((r) => r.userId?.toString()).filter(Boolean)),
    ];
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id fullName firstName lastName designation")
      .lean();
    const nameMap = new Map<string, string>();
    const designationMap = new Map<string, string>();
    for (const u of users) {
      const name =
        (u as any).fullName ||
        [(u as any).firstName, (u as any).lastName].filter(Boolean).join(" ") ||
        "";
      nameMap.set(u._id.toString(), name);
      if ((u as any).designation)
        designationMap.set(u._id.toString(), (u as any).designation);
    }

    const data = raw.map((r) => ({
      ...serializeRecord(
        r as IAttendanceRecord & Record<string, unknown>,
        permKey,
        fieldPermissions,
      ),
      employeeName: nameMap.get(r.userId?.toString() ?? "") || null,
      designation: designationMap.get(r.userId?.toString() ?? "") || null,
    }));

    res.json({ data, meta: { total, page, limit } });
  } catch (err) {
    console.error("[AttendanceRecords] getAttendanceRecords error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/records/summary
// Query: projectId, dateFrom?, dateTo?, center?, groupBy? (day | status | center)
// ─────────────────────────────────────────────────────────────────────────────
export const getAttendanceSummary = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const reqUser = (
      req as Request & {
        user?: {
          userId: string;
          role?: { code?: string; name?: string; [key: string]: unknown };
        };
      }
    ).user;
    const { projectId, dateFrom, dateTo, center } = req.query;

    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    const rolePerms: string[] = Array.isArray(
      (reqUser?.role as any)?.permissions,
    )
      ? (reqUser?.role as any).permissions.map((p: any) =>
          typeof p === "string" ? p : p.code || "",
        )
      : [];
    const permKey = isSuperAdminUser(reqUser ?? {})
      ? "admin"
      : permKeyFromPermissions(rolePerms);

    const matchStage: Record<string, unknown> = {
      projectId: new mongoose.Types.ObjectId(projectId as string),
    };

    // Scope employee to self
    if (permKey === "employee" && reqUser?.userId) {
      matchStage.userId = new mongoose.Types.ObjectId(reqUser.userId);
    }

    if (dateFrom || dateTo) {
      const dateRange: Record<string, Date> = {};
      if (dateFrom) dateRange.$gte = new Date(dateFrom as string);
      if (dateTo) {
        const to = new Date(dateTo as string);
        to.setHours(23, 59, 59, 999);
        dateRange.$lte = to;
      }
      matchStage.attendanceDate = dateRange;
    }

    if (center) matchStage.center = center;

    // Aggregate: count by status
    const statusCounts = await AttendanceRecord.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Aggregate: total records and date range covered
    const overview = await AttendanceRecord.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          minDate: { $min: "$attendanceDate" },
          maxDate: { $max: "$attendanceDate" },
          uniqueEmployees: { $addToSet: "$employeeCode" },
        },
      },
      {
        $project: {
          _id: 0,
          totalRecords: 1,
          minDate: 1,
          maxDate: 1,
          uniqueEmployeeCount: { $size: "$uniqueEmployees" },
        },
      },
    ]);

    // Fully dynamic — collect all status codes that actually appear in the data
    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      if (row._id) byStatus[row._id as string] = row.count as number;
    }

    const meta = overview[0] ?? {
      totalRecords: 0,
      minDate: null,
      maxDate: null,
      uniqueEmployeeCount: 0,
    };

    res.json({ byStatus, ...meta });
  } catch (err) {
    console.error("[AttendanceRecords] getAttendanceSummary error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/matrix
// Returns an employee × date presence matrix for a project and date range.
// All employees mapped to the project appear as rows; dates without a record
// are treated as "Absent".
// Query: projectId (required), dateFrom (required), dateTo (required)
// ─────────────────────────────────────────────────────────────────────────────
export const getAttendanceMatrix = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId, dateFrom, dateTo } = req.query;

    if (!projectId || !dateFrom || !dateTo) {
      res
        .status(400)
        .json({ message: "projectId, dateFrom, and dateTo are required" });
      return;
    }

    const projOid = new mongoose.Types.ObjectId(projectId as string);

    // Parse inputs as calendar date components — avoids local/UTC timezone shift
    const [fy, fm, fd] = (dateFrom as string).split("-").map(Number);
    const [ty, tm, td] = (dateTo as string).split("-").map(Number);

    // Build UTC midnight boundaries that match how attendanceDate is stored in DB
    const fromUtc = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0));
    const toUtc = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999));

    // Guard against oversized requests using calendar date arithmetic
    const daysDiff = Math.ceil(
      (toUtc.getTime() - fromUtc.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysDiff > 93) {
      res.status(400).json({ message: "Date range cannot exceed 93 days" });
      return;
    }

    // Generate every YYYY-MM-DD in the range using component-based iteration
    // so the strings are never affected by the server's local timezone
    const dates: string[] = [];
    const pad = (n: number) => String(n).padStart(2, "0");
    let cy = fy,
      cm = fm,
      cday = fd;
    while (true) {
      const dateStr = `${cy}-${pad(cm)}-${pad(cday)}`;
      dates.push(dateStr);
      if (cy === ty && cm === tm && cday === td) break;
      const next = new Date(cy, cm - 1, cday + 1); // local — only used for day roll-over
      cy = next.getFullYear();
      cm = next.getMonth() + 1;
      cday = next.getDate();
      if (dates.length > 100) break; // safety
    }

    // All active employees belonging to this project
    const employees = await User.find({
      projects: projOid,
      isActive: true,
    })
      .select("_id employeeCode firstName lastName fullName designation")
      .sort({ fullName: 1 })
      .lean();

    // All attendance records for this project within the date range
    const records = await AttendanceRecord.find({
      projectId: projOid,
      attendanceDate: { $gte: fromUtc, $lte: toUtc },
    })
      .select("userId attendanceDate status center")
      .sort({ attendanceDate: -1 }) // most-recent first so first seen = latest center
      .lean();

    // Map `${userId}|${YYYY-MM-DD}` → status code
    const recordMap = new Map<string, string>();
    // Map userId → most-recent center (first encountered since sorted desc)
    const userCenterMap = new Map<string, string>();
    const centerSet = new Set<string>();

    for (const r of records) {
      const dateKey = new Date(r.attendanceDate).toISOString().split("T")[0];
      recordMap.set(`${r.userId.toString()}|${dateKey}`, r.status);
      if (r.center) {
        centerSet.add(r.center);
        if (!userCenterMap.has(r.userId.toString())) {
          userCenterMap.set(r.userId.toString(), r.center);
        }
      }
    }

    const centers = Array.from(centerSet).sort();

    // ── Working calendar: holidays & non-working weekdays ─────────────────────
    const calendar = await WorkingCalendar.findOne({
      projectId: projOid,
      isActive: true,
      isDefault: true,
    }).lean();

    // Fall back to any active calendar if no default is set
    const cal =
      calendar ??
      (await WorkingCalendar.findOne({
        projectId: projOid,
        isActive: true,
      }).lean());

    // Build set of holiday date-strings within the queried range
    const holidaySet = new Set<string>();
    if (cal) {
      for (const h of cal.holidays) {
        const hd = new Date(h.date);
        const hm = hd.getUTCMonth() + 1;
        const hday = hd.getUTCDate();
        if (h.isRecurring) {
          // Match any year that appears in the dates array
          for (const d of dates) {
            const [dy, dm, dd] = d.split("-").map(Number);
            if (dm === hm && dd === hday) holidaySet.add(d);
          }
        } else {
          const hy = hd.getUTCFullYear();
          const ds = `${hy}-${pad(hm)}-${pad(hday)}`;
          if (dates.includes(ds)) holidaySet.add(ds);
        }
      }
    }

    // Weekday indices (0=Sun … 6=Sat) that are marked as non-working
    const nonWorkingWeekdays: number[] = cal
      ? cal.workingHours
          .filter((wh) => !wh.isWorkingDay)
          .map((wh) => wh.dayOfWeek)
      : [];

    const holidays = Array.from(holidaySet);

    // Build one row per employee
    const rows = employees.map((emp) => {
      const uid = (emp._id as any).toString();
      const name =
        (emp as any).fullName ||
        [(emp as any).firstName, (emp as any).lastName]
          .filter(Boolean)
          .join(" ") ||
        emp.employeeCode ||
        "";
      const attendance: Record<string, string> = {};
      for (const date of dates) {
        const key = `${uid}|${date}`;
        attendance[date] = recordMap.get(key) ?? "Absent";
      }
      return {
        userId: uid,
        employeeCode: emp.employeeCode || "",
        name,
        designation: (emp as any).designation || "",
        center: userCenterMap.get(uid) ?? null,
        attendance,
      };
    });

    res.json({ dates, rows, centers, holidays, nonWorkingWeekdays });
  } catch (err) {
    console.error("[AttendanceMatrix] getAttendanceMatrix error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
