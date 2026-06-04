import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  AttendanceRecord,
  AttendanceStatus,
} from "../models/attendance/AttendanceRecord";
import {
  AttendanceSyncLog,
  ISyncErrorDetail,
} from "../models/attendance/AttendanceSyncLog";
import { User } from "../models/User";

// ─────────────────────────────────────────────────────────────────────────────
// Bulk manual attendance upload (Super Admin / ATTENDANCE_CONFIG)
//
// Accepts the biometric partner's native report layout (pivoted: one employee
// spans CheckIn / Checkout / Duration / Status rows, with each date as a
// column). The frontend flattens that layout to one row per (employee, date)
// before posting here. We deliberately IGNORE the partner's name / designation /
// center — Name, Designation and Center are mapped from our own User/Center
// records by Employee Code. Rows are upserted into the same AttendanceRecord
// collection the AFT sync writes to, so View Records and the Attendance Report
// pick them up immediately. A sync log (triggeredBy "UPLOAD") records the run.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_STATUSES = [
  "P",
  "PL",
  "A",
  "H",
  "CL",
  "SL",
  "EL",
  "AL",
  "ML",
  "CO",
  "OD",
  "WFH",
  "HD",
  "LWP",
  "MP",
];

interface BulkRow {
  employeeCode?: string;
  date?: string;
  punchIn?: string;
  punchOut?: string;
  status?: string;
  totalWorkingHours?: string;
}

const csvCell = (v: string | number | null | undefined): string =>
  `"${String(v ?? "").replace(/"/g, '""')}"`;

// Resolve a display center name from a populated User document.
function centerNameOf(u: {
  centreId?: { centerName?: string } | null;
  centers?: { centerName?: string }[] | null;
}): string | null {
  const primary = (u.centreId as { centerName?: string } | null)?.centerName;
  if (primary) return primary;
  const first = Array.isArray(u.centers)
    ? (u.centers[0] as { centerName?: string } | undefined)?.centerName
    : undefined;
  return first || null;
}

/**
 * Parse a date string in YYYY-MM-DD, M/D/YYYY or D/M/YYYY into a midnight UTC
 * Date (matching how AttendanceRecord.attendanceDate is stored). The biometric
 * report uses M/D/YYYY; we only fall back to D/M when the first part is > 12.
 */
function parseFlexibleDate(input: string): Date | null {
  const s = input.trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return buildUtcDate(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    let mo = +m[1];
    let d = +m[2];
    if (mo > 12) {
      d = +m[1];
      mo = +m[2];
    }
    return buildUtcDate(+m[3], mo, d);
  }
  return null;
}

function buildUtcDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Combine a calendar date with a HH:MM[:SS] clock time into an IST timestamp.
 * Returns null when the time is blank/invalid.
 */
function toIstTimestamp(date: Date, timeStr: string | undefined): Date | null {
  if (!timeStr || !timeStr.trim() || timeStr.trim() === "-") return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, hh, mm, ss] = m;
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const iso = `${y}-${mo}-${d}T${hh.padStart(2, "0")}:${mm}:${ss ?? "00"}+05:30`;
  const ts = new Date(iso);
  return isNaN(ts.getTime()) ? null : ts;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance/bulk/template?projectId=
// Returns a CSV in the biometric partner's pivoted layout, pre-filled with this
// project's employees (Name + Center come from our DB) and the last 7 days as
// date columns, ready to paste partner values into.
// ─────────────────────────────────────────────────────────────────────────────
export const downloadBulkTemplate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }

    const users = await User.find({
      projects: new mongoose.Types.ObjectId(projectId as string),
      isActive: true,
      employeeCode: { $exists: true, $nin: [null, ""] },
    })
      .select("employeeCode fullName firstName lastName designation centreId centers")
      .populate({ path: "centreId", select: "centerName" })
      .populate({ path: "centers", select: "centerName" })
      .sort({ fullName: 1 })
      .lean();

    // Last 7 calendar days as date columns (YYYY-MM-DD, unambiguous on re-import)
    const dateCols: string[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      dateCols.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate(),
        ).padStart(2, "0")}`,
      );
    }

    const legend = `"Paste the biometric partner's report here, OR fill the cells below. Name, Designation & Center are taken from our system by Employee Code (partner values are ignored). Task rows per employee: CheckIn, Checkout, Duration, Status. Times: HH:MM:SS (24h). Status codes: ${VALID_STATUSES.join(
      ", ",
    )}."`;

    const header = [
      "S.No",
      "Student Name",
      "Employee",
      "Biometric Id",
      "Designation",
      "Task",
      ...dateCols,
    ]
      .map(csvCell)
      .join(",");

    const blanks = dateCols.map(() => "").map(csvCell).join(",");
    const lines: string[] = [legend, header];

    users.forEach((u, idx) => {
      const name =
        (u as any).fullName ||
        [(u as any).firstName, (u as any).lastName].filter(Boolean).join(" ") ||
        "";
      const center = centerNameOf(u as any) ?? "";
      const designation = (u as any).designation || center;
      const code = u.employeeCode || "";
      // First (CheckIn) row carries the identity columns; the next 3 are blank.
      lines.push(
        [idx + 1, name, code, "", designation, "CheckIn"].map(csvCell).join(",") +
          "," +
          blanks,
      );
      for (const task of ["Checkout", "Duration", "Status"]) {
        lines.push(
          ["", "", "", "", "", task].map(csvCell).join(",") + "," + blanks,
        );
      }
    });

    const today = new Date().toISOString().split("T")[0];
    const filename = `attendance_bulk_template_${projectId}_${today}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(lines.join("\n"));
  } catch (err) {
    console.error("[AttendanceBulk] downloadBulkTemplate error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/bulk/upload
// Body: { projectId: string, rows: BulkRow[] }  (one row per employee+date)
// Upserts attendance rows and writes an UPLOAD sync log.
// ─────────────────────────────────────────────────────────────────────────────
export const bulkUploadAttendance = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const startedAt = new Date();
  try {
    const { projectId, rows } = req.body as {
      projectId?: string;
      rows?: BulkRow[];
    };

    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ message: "rows must be a non-empty array" });
      return;
    }
    if (rows.length > 50000) {
      res
        .status(400)
        .json({ message: "Too many rows in one upload (max 50,000)" });
      return;
    }

    const projOid = new mongoose.Types.ObjectId(projectId);

    // Pre-load the project's users (with center) so rows don't each hit the DB.
    const users = await User.find({
      projects: projOid,
      employeeCode: { $exists: true, $nin: [null, ""] },
    })
      .select("_id employeeCode centreId centers")
      .populate({ path: "centreId", select: "centerName" })
      .populate({ path: "centers", select: "centerName" })
      .lean();

    const userByCode = new Map<
      string,
      { userId: mongoose.Types.ObjectId; center: string | null }
    >();
    for (const u of users) {
      if (u.employeeCode)
        userByCode.set(String(u.employeeCode).trim().toLowerCase(), {
          userId: u._id as mongoose.Types.ObjectId,
          center: centerNameOf(u as any),
        });
    }

    let stored = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: ISyncErrorDetail[] = [];
    const bulkOps: any[] = [];

    rows.forEach((row, idx) => {
      const rowNo = idx + 1;
      const employeeCode = (row.employeeCode ?? "").toString().trim();
      const dateRaw = (row.date ?? "").toString().trim();

      if (!employeeCode && !dateRaw) return; // blank trailing row

      if (!employeeCode) {
        skipped++;
        errorDetails.push({
          employeeCode: "",
          reason: "INVALID_ROW",
          error: `Row ${rowNo}: missing Employee Code`,
        });
        return;
      }

      const attendanceDate = parseFlexibleDate(dateRaw);
      if (!attendanceDate) {
        skipped++;
        errorDetails.push({
          employeeCode,
          reason: "INVALID_ROW",
          error: `Row ${rowNo}: invalid or missing Date "${dateRaw}"`,
        });
        return;
      }

      const match = userByCode.get(employeeCode.toLowerCase());
      if (!match) {
        skipped++;
        errorDetails.push({
          employeeCode,
          reason: "UNMATCHED",
          error: `Row ${rowNo}: no employee with code "${employeeCode}" in this project`,
        });
        return;
      }

      const statusRaw = (row.status ?? "").toString().trim().toUpperCase();
      const status = (statusRaw || "P") as AttendanceStatus;
      const duration = (row.totalWorkingHours ?? "").toString().trim();

      bulkOps.push({
        updateOne: {
          filter: { projectId: projOid, employeeCode, attendanceDate },
          update: {
            $set: {
              userId: match.userId,
              punchIn: toIstTimestamp(attendanceDate, row.punchIn),
              punchOut: toIstTimestamp(attendanceDate, row.punchOut),
              totalWorkingHours: duration || null,
              status,
              center: match.center, // mapped from our DB, never the partner's
              published: true,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              projectId: projOid,
              employeeCode,
              attendanceDate,
            },
          },
          upsert: true,
        },
      });
    });

    if (bulkOps.length > 0) {
      try {
        const result = await AttendanceRecord.bulkWrite(bulkOps, {
          ordered: false,
        });
        stored =
          (result.upsertedCount ?? 0) + (result.matchedCount ?? 0);
      } catch (bulkErr: any) {
        const writeErrors = bulkErr?.writeErrors ?? [];
        errors += writeErrors.length;
        stored +=
          (bulkErr?.result?.nUpserted ?? 0) + (bulkErr?.result?.nMatched ?? 0);
        for (const we of writeErrors.slice(0, 50)) {
          errorDetails.push({
            employeeCode: "",
            reason: "DB_ERROR",
            error: we?.errmsg || "Write error",
          });
        }
      }
    }

    const status =
      errors === 0 ? "SUCCESS" : stored > 0 ? "PARTIAL" : "FAILED";

    await AttendanceSyncLog.create({
      projectId: projOid,
      triggeredBy: "UPLOAD",
      startedAt,
      completedAt: new Date(),
      recordsFetched: rows.length,
      recordsStored: stored,
      recordsSkipped: skipped,
      errorCount: errors,
      status,
      errorDetails: errorDetails.slice(0, 200),
    });

    res.json({
      success: true,
      status,
      recordsReceived: rows.length,
      recordsStored: stored,
      recordsSkipped: skipped,
      errorCount: errors,
      errors: errorDetails.slice(0, 50),
    });
  } catch (err) {
    console.error("[AttendanceBulk] bulkUploadAttendance error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
