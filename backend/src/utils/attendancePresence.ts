/**
 * Shared Present/Absent resolver for attendance.
 *
 * Rule (per the product requirement):
 *  - A clear present / leave status (P, CL, SL, EL, H, …) is Present.
 *  - Both punches present (punchIn + punchOut) is Present.
 *  - An INCOMPLETE record — a miss-punch (MP / "M/p") OR only one punch — is
 *    "provisionally Present" UNTIL the day's last configured sync time, and
 *    Absent after it (i.e. the day finished syncing and the punch-out never
 *    arrived). The boundary is the LATEST time in AttendanceConfig.syncSchedule.
 *  - Anything else (A / AB / no punches) is Absent.
 *
 * For PAST days the boundary is already behind us, so incomplete = Absent —
 * which matches the previous behaviour. Only TODAY (before the last sync time)
 * is affected.
 */
import { AttendanceConfig } from "../models/attendance/AttendanceConfig";

const IST_OFFSET_MIN = 330; // Asia/Kolkata = UTC+5:30

// Statuses that always count as Present / accounted-for (present + leave + holiday).
const PRESENT_STATUSES = new Set([
  "P",
  "PRESENT",
  "L",
  "LATE",
  "LT",
  "CL",
  "SL",
  "EL",
  "AL",
  "ML",
  "PL",
  "CO",
  "OD",
  "WFH",
  "HD",
  "H",
  "HOLIDAY",
]);

export interface PresenceRecord {
  status?: string | null;
  punchIn?: Date | string | null;
  punchOut?: Date | string | null;
  attendanceDate: Date | string;
}

/** Parse "HH:MM" → minutes from midnight, or null if invalid. */
function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Latest configured sync time (minutes from midnight, IST) for a project, or null. */
export async function getLastSyncMinutes(
  projectId: string,
): Promise<number | null> {
  try {
    const cfg = await AttendanceConfig.findOne({ projectId })
      .select("syncSchedule")
      .lean();
    const schedule: string[] = (cfg as any)?.syncSchedule || [];
    let max: number | null = null;
    for (const t of schedule) {
      const mins = hhmmToMinutes(t);
      if (mins != null && (max == null || mins > max)) max = mins;
    }
    return max;
  } catch {
    return null;
  }
}

function isMissPunchStatus(status: string): boolean {
  const u = status.toUpperCase().replace(/\s+/g, "");
  return (
    u === "MP" ||
    u === "M/P" ||
    u.includes("MISSPUNCH") ||
    u.includes("MISPUNCH")
  );
}

/** Epoch ms of `attendanceDate`'s IST calendar day at `minutesIST` (IST). */
function boundaryEpochMs(
  attendanceDate: Date | string,
  minutesIST: number,
): number {
  const d = new Date(attendanceDate);
  // Shift into IST to read the calendar day the record belongs to.
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const day = ist.getUTCDate();
  // IST midnight of that day, expressed in UTC epoch ms, plus the sync time.
  const istMidnightUtc = Date.UTC(y, m, day) - IST_OFFSET_MIN * 60000;
  return istMidnightUtc + minutesIST * 60000;
}

/**
 * True if the record counts as Present under the rule above.
 * @param lastSyncMinutes latest configured sync time (IST minutes), or null.
 * @param nowMs current epoch ms (defaults to Date.now()).
 */
export function isAttendancePresent(
  rec: PresenceRecord,
  lastSyncMinutes: number | null,
  nowMs: number = Date.now(),
): boolean {
  const status = (rec.status || "").trim();
  const su = status.toUpperCase();
  if (PRESENT_STATUSES.has(su)) return true;

  const hasIn = !!rec.punchIn;
  const hasOut = !!rec.punchOut;
  if (hasIn && hasOut) return true; // both punches → present

  const incomplete =
    isMissPunchStatus(status) || (hasIn && !hasOut) || (!hasIn && hasOut);
  if (incomplete) {
    // Can't determine the boundary (no sync schedule) → treat as absent.
    if (lastSyncMinutes == null) return false;
    // Present until the day's last sync time; absent after it.
    return nowMs < boundaryEpochMs(rec.attendanceDate, lastSyncMinutes);
  }

  return false; // A / AB / no punches → absent
}
