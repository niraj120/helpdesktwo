import axios from "axios";
import { AttendanceConfig } from "../models/attendance/AttendanceConfig";
import {
  AttendanceRecord,
  AttendanceStatus,
} from "../models/attendance/AttendanceRecord";
import {
  AttendanceSyncLog,
  ISyncErrorDetail,
} from "../models/attendance/AttendanceSyncLog";
import { User } from "../models/User";

// ─────────────────────────────────────────────────────────────────
// Field parsers  (AFT keys always have spaces — bracket notation)
// ─────────────────────────────────────────────────────────────────

export function parseGeo(geoString: string | undefined | null): {
  geoLat: number | null;
  geoLong: number | null;
} {
  if (!geoString || geoString.trim() === "") {
    return { geoLat: null, geoLong: null };
  }
  const parts = geoString.split(",");
  const lat = parseFloat(parts[0]?.trim());
  const long = parseFloat(parts[1]?.trim());
  return {
    geoLat: isNaN(lat) ? null : lat,
    geoLong: isNaN(long) ? null : long,
  };
}

/**
 * Parse AFT date string "DD-MM-YYYY" → JS Date (midnight UTC)
 */
export function parseAttendanceDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split("-");
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

/**
 * Parse AFT date + time → Date with IST offset (+05:30)
 * Returns null if timeStr is blank.
 */
export function toTimestamp(
  dateStr: string,
  timeStr: string | undefined | null,
): Date | null {
  if (!timeStr || timeStr.trim() === "") return null;
  const [day, month, year] = dateStr.split("-");
  return new Date(`${year}-${month}-${day}T${timeStr}+05:30`);
}

// ─────────────────────────────────────────────────────────────────
// Main sync worker
// ─────────────────────────────────────────────────────────────────

export async function runAttendanceSync(
  projectId: string,
  triggeredBy: "SCHEDULE" | "MANUAL" | "API" = "SCHEDULE",
  existingLogId?: string,
): Promise<{
  syncLogId: string;
  status: string;
  recordsFetched: number;
  recordsStored: number;
  recordsSkipped: number;
  errorCount: number;
}> {
  const config = await AttendanceConfig.findOne({ projectId });

  if (!config) {
    throw new Error(`No attendance config found for project ${projectId}`);
  }

  // Use existing log if caller pre-created one (e.g. manual sync returning ID early),
  // otherwise create a fresh log entry.
  const syncLog = existingLogId
    ? await AttendanceSyncLog.findById(existingLogId)
    : await AttendanceSyncLog.create({
        projectId,
        triggeredBy,
        startedAt: new Date(),
        status: "RUNNING",
      });

  if (!syncLog) {
    throw new Error(`Sync log ${existingLogId} not found`);
  }

  let aftData: Record<string, unknown>[] = [];
  const errorDetails: ISyncErrorDetail[] = [];

  // ── Step 1: Fetch attendance from AFT ──────────────────────────
  try {
    const token = config.getDecryptedApiKey();
    const aftUrl = `${config.aftBaseUrl}/${config.aftProjectPrefix}/get-attendance`;

    // Build date range: today back N days (AFT uses DD-MM-YYYY format)
    const lookbackDays = (config as any).syncLookbackDays ?? 30;
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - lookbackDays);
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
    const dateRangeBody = { from_date: fmt(fromDate), to_date: fmt(toDate) };

    const response = await axios.post(aftUrl, dateRangeBody, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30s
    });

    if (
      response.data?.status === "success" &&
      Array.isArray(response.data?.data)
    ) {
      aftData = response.data.data;
    } else {
      throw new Error(
        response.data?.message || "AFT did not return success status",
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    await AttendanceSyncLog.findByIdAndUpdate(syncLog._id, {
      status: "FAILED",
      completedAt: new Date(),
      errorDetails: [
        { employeeCode: "", reason: "FETCH_ERROR", error: message },
      ],
    });
    return {
      syncLogId: syncLog._id.toString(),
      status: "FAILED",
      recordsFetched: 0,
      recordsStored: 0,
      recordsSkipped: 0,
      errorCount: 1,
    };
  }

  // ── Step 2: Process each record ────────────────────────────────
  let stored = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of aftData) {
    const employeeCode = record["User ID"] as string;

    // Published flag check
    if (config.publishedCheckEnabled && record["published"] !== true) {
      skipped++;
      continue;
    }

    // Match to platform user by employeeCode within this project
    const user = await User.findOne({
      employeeCode,
      projects: projectId,
    }).select("_id");

    if (!user) {
      skipped++;
      errorDetails.push({
        employeeCode,
        reason: "UNMATCHED",
        error: `No user with employeeCode "${employeeCode}" in project`,
      });
      continue;
    }

    // Parse fields
    const dateStr = record["Date"] as string;
    const geo = parseGeo(record["Geo Lat/Long"] as string);

    try {
      await AttendanceRecord.findOneAndUpdate(
        {
          projectId,
          employeeCode,
          attendanceDate: parseAttendanceDate(dateStr),
        },
        {
          $set: {
            userId: user._id,
            punchIn: toTimestamp(dateStr, record["Punch In"] as string),
            punchOut: toTimestamp(dateStr, record["Punch Out"] as string),
            totalWorkingHours:
              (record["Total working hours"] as string) || null,
            status: (record["Status"] as AttendanceStatus) || "P",
            center: (record["Center"] as string) || null,
            geoLat: geo.geoLat,
            geoLong: geo.geoLong,
            published:
              record["published"] !== undefined
                ? Boolean(record["published"])
                : null,
            rawPayload: record,
            syncRunId: syncLog._id,
            updatedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );
      stored++;
    } catch (dbErr: unknown) {
      errors++;
      errorDetails.push({
        employeeCode,
        reason: "DB_ERROR",
        error: dbErr instanceof Error ? dbErr.message : "Unknown DB error",
      });
    }
  }

  // ── Step 3: Finalise sync log ──────────────────────────────────
  const finalStatus =
    errors === 0 ? "SUCCESS" : stored > 0 ? "PARTIAL" : "FAILED";

  await AttendanceSyncLog.findByIdAndUpdate(syncLog._id, {
    status: finalStatus,
    recordsFetched: aftData.length,
    recordsStored: stored,
    recordsSkipped: skipped,
    errorCount: errors,
    errorDetails,
    completedAt: new Date(),
  });

  console.log(
    `[AttendanceSync] Project ${projectId} — ${finalStatus}: ` +
      `fetched=${aftData.length} stored=${stored} skipped=${skipped} errors=${errors}`,
  );

  return {
    syncLogId: syncLog._id.toString(),
    status: finalStatus,
    recordsFetched: aftData.length,
    recordsStored: stored,
    recordsSkipped: skipped,
    errorCount: errors,
  };
}
