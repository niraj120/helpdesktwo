import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import API_BASE_URL from "../../config/api";

// ── Devanagari → Latin transliteration for PDF export ───────────────────────
// jsPDF's built-in Helvetica only supports Latin-1, so Devanagari/Marathi text
// (e.g. "CET उपकेंद्र") would render as garbage (or, when we tried embedding a
// Unicode font, broke the whole document). Instead we romanize any Devanagari
// to readable Latin ("CET upakendra") — fully offline, never blank.
const DEV_VOWELS: Record<string, string> = {
  अ: "a", आ: "aa", इ: "i", ई: "ee", उ: "u", ऊ: "oo", ऋ: "ri",
  ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o", ऍ: "e",
};
const DEV_MATRAS: Record<string, string> = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e",
};
const DEV_CONS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "ng",
  च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "ny",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
  य: "y", र: "r", ल: "l", व: "v",
  श: "sh", ष: "sh", स: "s", ह: "h", ळ: "l",
};
const DEV_VIRAMA = "्";
const DEV_ANUSVARA = "ं";
const DEV_VISARGA = "ः";
const DEV_CHANDRABINDU = "ँ";
const DEV_NUKTA = "़";
const DEV_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

function transliterateDevanagari(input: string): string {
  const chars = Array.from(input);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (DEV_CONS[c]) {
      out += DEV_CONS[c];
      const next = chars[i + 1];
      if (next === DEV_VIRAMA) {
        i++; // halant: suppress the inherent vowel
      } else if (next && DEV_MATRAS[next]) {
        out += DEV_MATRAS[next];
        i++;
      } else {
        out += "a"; // inherent vowel
      }
    } else if (DEV_VOWELS[c]) {
      out += DEV_VOWELS[c];
    } else if (DEV_MATRAS[c]) {
      out += DEV_MATRAS[c]; // stray matra
    } else if (c === DEV_ANUSVARA || c === DEV_CHANDRABINDU) {
      out += "n";
    } else if (c === DEV_VISARGA) {
      out += "h";
    } else if (c === DEV_NUKTA) {
      // skip
    } else if (DEV_DIGITS[c]) {
      out += DEV_DIGITS[c];
    } else {
      out += c;
    }
  }
  return out;
}

const DEVANAGARI_RE = /[ऀ-ॿ]/;
// Make any string safe for jsPDF's Latin-only fonts.
function pdfText(value: unknown): string {
  const str = String(value ?? "");
  return DEVANAGARI_RE.test(str) ? transliterateDevanagari(str) : str;
}
import ModuleHeader from "../../components/ModuleHeader";
import { usePermissions } from "../../hooks/usePermissions";
import {
  MdAdd,
  MdClose,
  MdBarChart,
  MdLock,
  MdSave,
  MdPlayArrow,
  MdDownload,
  MdBookmark,
  MdPeople,
  MdDelete,
  MdCheck,
} from "react-icons/md";

//
// Types
//

type ActiveSection =
  | "my-reports"
  | "report-builder"
  | "field-permissions"
  | "saved-reports"
  | "assign-report";

interface Project {
  _id: string;
  name: string;
}

interface AttendanceRecord {
  _id: string;
  attendanceDate: string;
  employee_id?: string;
  employeeName?: string | null;
  designation?: string | null;
  punch_in?: string | null;
  punch_out?: string | null;
  total_working_hours?: string | null;
  status?: string;
  center?: string | null;
  geo?: { lat: number; long: number } | null;
  published?: boolean | null;
}

type PermRole = "admin" | "manager" | "hr" | "employee";

interface SavedAttendanceReport {
  _id: string;
  name: string;
  description: string;
  projectId?: string;
  dataPoints: string[];
  filters: { field: string; operator: string; value: string }[];
  sortBy?: string;
  sortOrder: "asc" | "desc";
  createdAt: string;
  lastRunAt?: string;
  rowCount?: number;
  assignedUsersCount?: number;
  assignedRolesCount?: number;
}

// Matrix report types
type ViewType = "daily" | "weekly" | "monthly" | "custom";

interface MatrixRow {
  userId: string;
  employeeCode: string;
  name: string;
  designation?: string;
  center?: string | null;
  attendance: Record<string, string>; // ISO date → status or "Absent"
}

interface MatrixResult {
  dates: string[];
  rows: MatrixRow[];
  centers: string[];
  holidays: string[]; // YYYY-MM-DD strings from the project's working calendar
  nonWorkingWeekdays: number[]; // 0=Sun … 6=Sat that are off days
}

interface MatrixRange {
  dateFrom: string;
  dateTo: string;
}

interface AssignableUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface AssignableRole {
  _id: string;
  name: string;
  code: string;
}

interface FieldPermRow {
  key: string;
  label: string;
  admin: boolean;
  manager: boolean;
  hr: boolean;
  employee: boolean;
}

//
// Data point definitions (grouped by category)
//

interface DataPoint {
  key: string;
  label: string;
  category: string;
  always?: boolean;
  permKey?: string;
}

const DATA_POINTS: DataPoint[] = [
  {
    key: "employee_id",
    label: "Employee ID",
    category: "employee",
    always: true,
  },
  { key: "employeeName", label: "Name", category: "employee" },
  { key: "attendanceDate", label: "Date", category: "time", always: true },
  { key: "punch_in", label: "Punch In", category: "time", permKey: "punch_in" },
  {
    key: "punch_out",
    label: "Punch Out",
    category: "time",
    permKey: "punch_out",
  },
  {
    key: "total_working_hours",
    label: "Total Hours",
    category: "time",
    permKey: "total_working_hours",
  },
  { key: "status", label: "Status", category: "attendance", permKey: "status" },
  {
    key: "center",
    label: "Offline Center",
    category: "location",
    permKey: "center",
  },
  { key: "geo", label: "Geo Location", category: "location", permKey: "geo" },
  {
    key: "published",
    label: "Published",
    category: "other",
    permKey: "published",
  },
];

const CATEGORIES = [
  "all",
  "employee",
  "time",
  "attendance",
  "location",
  "other",
];

//
// Status labels & colours (declared here so FILTER_FIELDS can reference them)
//

const STATUS_COLORS: Record<string, string> = {
  P: "bg-green-100 text-green-800",
  PL: "bg-yellow-100 text-yellow-800",
  H: "bg-blue-100 text-blue-800",
  LWP: "bg-red-100 text-red-800",
  A: "bg-rose-100 text-rose-800",
  CL: "bg-purple-100 text-purple-800",
  SL: "bg-orange-100 text-orange-800",
  EL: "bg-amber-100 text-amber-800",
  AL: "bg-amber-100 text-amber-800",
  ML: "bg-pink-100 text-pink-800",
  CO: "bg-teal-100 text-teal-800",
  OD: "bg-cyan-100 text-cyan-800",
  WFH: "bg-sky-100 text-sky-800",
  HD: "bg-lime-100 text-lime-800",
};

const STATUS_LABELS: Record<string, string> = {
  P: "Present",
  PL: "Present Late",
  H: "Holiday Leave",
  LWP: "Leave Without Pay",
  A: "Absent",
  CL: "Casual Leave",
  SL: "Sick Leave",
  EL: "Earned Leave",
  AL: "Annual Leave",
  ML: "Maternity Leave",
  CO: "Comp Off",
  OD: "On Duty",
  WFH: "Work From Home",
  HD: "Half Day",
  Absent: "Absent",
  WO: "Week Off",
  PH: "Public Holiday",
};

//
// Filter definitions
//

interface FilterField {
  key: string;
  label: string;
  type: "date" | "text" | "select" | "boolean";
  options?: { value: string; label: string }[];
}

const FILTER_FIELDS: FilterField[] = [
  { key: "attendanceDate", label: "Date", type: "date" },
  { key: "employee_id", label: "Employee ID", type: "text" },
  {
    key: "status",
    label: "Status",
    type: "select",
    // Dynamically built from STATUS_LABELS (excludes virtual matrix codes Absent/WO/PH)
    options: Object.entries(STATUS_LABELS)
      .filter(([code]) => !["Absent", "WO", "PH"].includes(code))
      .map(([value, label]) => ({ value, label: `${value} — ${label}` })),
  },
  { key: "center", label: "Offline Center", type: "text" },
  { key: "punch_in", label: "Punch In", type: "date" },
  { key: "punch_out", label: "Punch Out", type: "date" },
  {
    key: "published",
    label: "Published",
    type: "boolean",
    options: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
  },
];

type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "before"
  | "after"
  | "is_empty"
  | "is_not_empty";

interface FilterRow {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

function getOperatorsForField(
  fieldKey: string,
): { value: FilterOperator; label: string }[] {
  const fd = FILTER_FIELDS.find((f) => f.key === fieldKey);
  if (!fd) return [{ value: "equals", label: "equals" }];
  if (fd.type === "date") {
    return [
      { value: "equals", label: "on" },
      { value: "before", label: "before" },
      { value: "after", label: "after" },
      { value: "is_empty", label: "is empty" },
      { value: "is_not_empty", label: "is not empty" },
    ];
  }
  if (fd.type === "select" || fd.type === "boolean") {
    return [
      { value: "equals", label: "equals" },
      { value: "not_equals", label: "not equals" },
    ];
  }
  return [
    { value: "equals", label: "equals" },
    { value: "not_equals", label: "not equals" },
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ];
}

//
// Helpers
//

function getRolePermKey(hasPermission: (p: string) => boolean): PermRole {
  if (hasPermission("ATTENDANCE_CONFIG")) return "admin";
  if (hasPermission("ATTENDANCE_SYNC")) return "manager";
  return "employee";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function renderCellValue(key: string, record: AttendanceRecord): string {
  switch (key) {
    case "attendanceDate":
      return formatDate(record.attendanceDate);
    case "employee_id":
      return record.employee_id ?? "—";
    case "employeeName":
      return record.employeeName ?? "—";
    case "punch_in":
      return formatTime(record.punch_in);
    case "punch_out":
      return formatTime(record.punch_out);
    case "total_working_hours":
      return record.total_working_hours ?? "—";
    case "status":
      return record.status ?? "—";
    case "center":
      return record.center ?? "—";
    case "geo":
      return record.geo ? `${record.geo.lat}, ${record.geo.long}` : "—";
    case "published":
      return record.published === null || record.published === undefined
        ? "—"
        : record.published
          ? "Yes"
          : "No";
    default:
      return "—";
  }
}

function makeId() {
  return Math.random().toString(36).slice(2);
}

//
// NavItem
//

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 12px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        background: active ? "#EEF2FF" : "transparent",
        color: active ? "#4F46E5" : "#374151",
        transition: "all 0.15s",
        marginBottom: 2,
      }}
    >
      <span style={{ fontSize: 16, opacity: 0.75 }}>{icon}</span>
      {label}
    </button>
  );
}

//
// Shared mini styles
//

const selectStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 7,
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
  background: "#fff",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 7,
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
};

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  color: "#6B7280",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "1px solid #E5E7EB",
};

const tdStyle: React.CSSProperties = {
  padding: "9px 14px",
  color: "#374151",
  borderBottom: "1px solid #F3F4F6",
};

// ─────────────────────────────────────────────────────────────────────────────
// My Attendance Reports (assigned to this user)
// ─────────────────────────────────────────────────────────────────────────────

// Matrix status colour map — covers all known biometric status codes
const MATRIX_STATUS: Record<string, { bg: string; fg: string; label: string }> =
  {
    P: { bg: "#d1fae5", fg: "#065f46", label: "P" },
    PL: { bg: "#fef3c7", fg: "#92400e", label: "PL" },
    H: { bg: "#dbeafe", fg: "#1e3a8a", label: "H" },
    LWP: { bg: "#fee2e2", fg: "#991b1b", label: "LWP" },
    A: { bg: "#fff1f2", fg: "#be123c", label: "A" },
    CL: { bg: "#f3e8ff", fg: "#7e22ce", label: "CL" }, // Casual Leave
    SL: { bg: "#ffedd5", fg: "#c2410c", label: "SL" }, // Sick Leave
    EL: { bg: "#fef9c3", fg: "#854d0e", label: "EL" }, // Earned Leave
    AL: { bg: "#fef9c3", fg: "#854d0e", label: "AL" }, // Annual Leave
    ML: { bg: "#fce7f3", fg: "#be185d", label: "ML" }, // Maternity Leave
    CO: { bg: "#ccfbf1", fg: "#0f766e", label: "CO" }, // Comp Off
    OD: { bg: "#cffafe", fg: "#0e7490", label: "OD" }, // On Duty
    WFH: { bg: "#e0f2fe", fg: "#0284c7", label: "WFH" }, // Work From Home
    HD: { bg: "#f7fee7", fg: "#3f6212", label: "HD" }, // Half Day
    Absent: { bg: "#fff1f2", fg: "#be123c", label: "A" },
    WO: { bg: "#f3f4f6", fg: "#6b7280", label: "WO" }, // Week Off
    PH: { bg: "#eff6ff", fg: "#1d4ed8", label: "PH" }, // Public Holiday
  };

// Fallback for any status code not listed in MATRIX_STATUS
function getMatrixStyle(code: string): {
  bg: string;
  fg: string;
  label: string;
} {
  return (
    MATRIX_STATUS[code] ?? {
      bg: "#f3f4f6",
      fg: "#374151",
      label: code.substring(0, 4),
    }
  );
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Format a Date using LOCAL time (avoids UTC-shift bugs in IST/any UTC+ zone)
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

// Parse a YYYY-MM-DD string into a LOCAL midnight Date
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayISO(): string {
  return localDateStr(new Date());
}

// ── Working-calendar helpers (target days / target hours) ────────────────────
interface WorkCalendarLite {
  workingHours: Array<{
    dayOfWeek: number;
    isWorkingDay: boolean;
    startTime: string;
    endTime: string;
    breakStartTime?: string;
    breakEndTime?: string;
  }>;
  holidays: Array<{ date: string; isRecurring?: boolean }>;
}

// Statuses counted as "Leave" toward Actual Attendance (in addition to
// punch-based Present days).
const LEAVE_STATUSES = new Set([
  "CL",
  "SL",
  "EL",
  "AL",
  "ML",
  "CO",
  "OD",
  "WFH",
  "HD",
]);

const _toMin = (t: string): number => {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Target working hours for a weekday from the calendar (end − start − break).
function dailyTargetHours(
  cal: WorkCalendarLite | null,
  weekday: number,
): number {
  const wh = cal?.workingHours?.find((w) => w.dayOfWeek === weekday);
  if (!wh || !wh.isWorkingDay) return 0;
  let mins = _toMin(wh.endTime) - _toMin(wh.startTime);
  if (wh.breakStartTime && wh.breakEndTime)
    mins -= _toMin(wh.breakEndTime) - _toMin(wh.breakStartTime);
  return Math.max(0, mins) / 60;
}

function isHolidayDate(cal: WorkCalendarLite | null, iso: string): boolean {
  if (!cal?.holidays?.length) return false;
  const [y, mo, da] = iso.split("-");
  return cal.holidays.some((h) => {
    const hd = new Date(h.date);
    if (isNaN(hd.getTime())) return false;
    const hm = String(hd.getUTCMonth() + 1).padStart(2, "0");
    const hday = String(hd.getUTCDate()).padStart(2, "0");
    if (h.isRecurring) return hm === mo && hday === da;
    return String(hd.getUTCFullYear()) === y && hm === mo && hday === da;
  });
}

// A date is a working day when its weekday is a working day in the calendar and
// it isn't a holiday. Without a calendar, default to Mon–Sat (Sunday off).
function isWorkingDate(cal: WorkCalendarLite | null, iso: string): boolean {
  const wd = parseLocalDate(iso).getDay();
  if (cal) {
    const wh = cal.workingHours?.find((w) => w.dayOfWeek === wd);
    if (!wh || !wh.isWorkingDay) return false;
  } else if (wd === 0) {
    return false;
  }
  return !isHolidayDate(cal, iso);
}

// Inclusive list of YYYY-MM-DD strings between two dates.
function enumerateDates(from: string, to: string): string[] {
  if (!from || !to) return [];
  const out: string[] = [];
  let cur = parseLocalDate(from);
  const end = parseLocalDate(to);
  let guard = 0;
  while (cur <= end && guard < 400) {
    out.push(localDateStr(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    guard++;
  }
  return out;
}

// Target working days + total target hours over a list of dates (past/today only).
function computeTargets(
  cal: WorkCalendarLite | null,
  dates: string[],
): { targetDays: number; targetHours: number } {
  const today = todayISO();
  let targetDays = 0;
  let targetHours = 0;
  for (const d of dates) {
    if (d > today) continue;
    if (!isWorkingDate(cal, d)) continue;
    targetDays++;
    targetHours += dailyTargetHours(cal, parseLocalDate(d).getDay());
  }
  return { targetDays, targetHours };
}

function getDefaultRange(vt: ViewType): MatrixRange {
  const now = new Date();
  if (vt === "monthly") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      dateFrom: localDateStr(first),
      dateTo: localDateStr(last),
    };
  }
  if (vt === "weekly") {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      dateFrom: localDateStr(monday),
      dateTo: localDateStr(sunday),
    };
  }
  // custom: default to last 7 days
  const from = new Date(now);
  from.setDate(now.getDate() - 6);
  return {
    dateFrom: localDateStr(from),
    dateTo: localDateStr(now),
  };
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// HR Template summary
// Builds one row per employee in the format HR expects (matches the shared
// template): Employee code, User Name, Designation, Punch in, Punch out, Status,
// Target Attendance, Actual Attendance, Attendance %. Works for daily and
// range (weekly/monthly/custom) views off the same flat record list that the
// "Run" action loads into runResults.
//
// Target  = number of distinct calendar dates present in the loaded data
//           (the report's period). Actual = distinct dates where the employee
//           had a present-or-leave status. This keeps the numbers identical to
//           the detailed "Center Wise" table shown on the same screen.
// ─────────────────────────────────────────────────────────────────────────────
const HR_PRESENT_STATUSES = new Set([
  "P",
  "PL",
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
]);

interface HRTemplateRow {
  employeeCode: string;
  userName: string;
  designation: string;
  punchIn: string | null; // ISO timestamp of the latest record in the period
  punchOut: string | null;
  status: string;
  target: number;
  actual: number;
  percent: string;
}

function buildHRTemplateRows(records: AttendanceRecord[]): {
  rows: HRTemplateRow[];
  dateLabel: string;
  totalDays: number;
} {
  const dayOf = (r: AttendanceRecord) => r.attendanceDate?.split("T")[0] ?? "";

  const dateSet = new Set<string>();
  for (const r of records) {
    const d = dayOf(r);
    if (d) dateSet.add(d);
  }
  const dates = [...dateSet].sort();
  const totalDays = dates.length;
  const dateLabel =
    dates.length === 0
      ? "—"
      : dates.length === 1
        ? dates[0]
        : `${dates[0]} to ${dates[dates.length - 1]}`;

  const byEmp = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const code = r.employee_id ?? "_";
    if (!byEmp.has(code)) byEmp.set(code, []);
    byEmp.get(code)!.push(r);
  }

  const rows: HRTemplateRow[] = [];
  for (const [code, recs] of byEmp) {
    const sorted = [...recs].sort((a, b) =>
      (a.attendanceDate ?? "").localeCompare(b.attendanceDate ?? ""),
    );
    const latest = sorted[sorted.length - 1];

    const presentDates = new Set<string>();
    for (const r of recs) {
      // Prefer the backend's effective Present/Absent (applies the last-sync
      // rule: miss-punch / single-punch is Present until the day's last sync
      // time, Absent after). Fall back to status for older payloads.
      const present =
        (r as any).effectivePresent !== undefined
          ? (r as any).effectivePresent
          : !!(r.status && HR_PRESENT_STATUSES.has(r.status));
      if (present) {
        const d = dayOf(r);
        if (d) presentDates.add(d);
      }
    }
    const actual = presentDates.size;
    const percent =
      totalDays > 0 ? ((actual / totalDays) * 100).toFixed(1) + "%" : "0%";

    rows.push({
      employeeCode: code !== "_" ? code : "—",
      userName: latest.employeeName ?? "",
      designation: latest.designation ?? "",
      punchIn: latest.punch_in ?? null,
      punchOut: latest.punch_out ?? null,
      status: latest.status ?? "",
      target: totalDays,
      actual,
      percent,
    });
  }

  rows.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  return { rows, dateLabel, totalDays };
}

// ─────────────────────────────────────────────────────────────────────────────
// Searchable multi-select dropdown (no external dependency)
// ─────────────────────────────────────────────────────────────────────────────
function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  maxWidth = 220,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
  maxWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Panel is rendered in a portal (to escape ancestor overflow:hidden), so it
  // needs the button's on-screen position.
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 240,
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        wrapRef.current &&
        !wrapRef.current.contains(t) &&
        panelRef.current &&
        !panelRef.current.contains(t)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (val: string) =>
    onChange(
      selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val],
    );

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? "1 selected")
        : `${selected.length} selected`;

  return (
    <div ref={wrapRef} style={{ position: "relative", maxWidth }}>
      <button
        ref={btnRef}
        onClick={() => {
          setSearch("");
          if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 240) });
          }
          setOpen((p) => !p);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          width: "100%",
          padding: "4px 10px",
          fontSize: 12,
          background: selected.length > 0 ? "#eff6ff" : "#fff",
          border: `1px solid ${selected.length > 0 ? "#93c5fd" : "#d1d5db"}`,
          borderRadius: 6,
          cursor: "pointer",
          color: selected.length > 0 ? "#1d4ed8" : "#374151",
          fontWeight: selected.length > 0 ? 600 : 400,
          whiteSpace: "nowrap",
          minWidth: 130,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </span>
        <span style={{ fontSize: 10, flexShrink: 0 }}>{open ? "▴" : "▾"}</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              zIndex: 9999,
              width: pos.width,
              maxHeight: 320,
              display: "flex",
              flexDirection: "column",
            }}
          >
          {/* Search */}
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "5px 8px",
                fontSize: 12,
                border: "1px solid #d1d5db",
                borderRadius: 6,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Select all / Clear */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "2px 8px 4px",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <button
              onClick={() => onChange(filtered.map((o) => o.value))}
              style={{
                fontSize: 11,
                color: "#6366f1",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
                fontWeight: 600,
              }}
            >
              Select all
            </button>
            <span style={{ color: "#d1d5db", lineHeight: "1.6" }}>|</span>
            <button
              onClick={() => onChange([])}
              style={{
                fontSize: 11,
                color: "#6b7280",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
              }}
            >
              Clear
            </button>
          </div>

          {/* Options list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "12px 10px",
                  fontSize: 12,
                  color: "#9ca3af",
                  textAlign: "center",
                }}
              >
                No matches
              </div>
            ) : (
              filtered.map((o) => {
                const checked = selected.includes(o.value);
                return (
                  <label
                    key={o.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                      color: "#111827",
                      background: checked ? "#eff6ff" : "transparent",
                    }}
                    onMouseEnter={(e) =>
                      !checked &&
                      ((e.currentTarget as HTMLLabelElement).style.background =
                        "#f9fafb")
                    }
                    onMouseLeave={(e) =>
                      !checked &&
                      ((e.currentTarget as HTMLLabelElement).style.background =
                        "transparent")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      style={{ accentColor: "#6366f1", flexShrink: 0 }}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: checked ? 600 : 400,
                        color: checked ? "#1d4ed8" : "#111827",
                      }}
                    >
                      {o.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function MyAttendanceReports({ token }: { token: string }) {
  const headers = { Authorization: `Bearer ${token}` };
  const [reports, setReports] = useState<SavedAttendanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<
    Record<string, AttendanceRecord[]>
  >({});
  // Matrix view state
  const [viewTypes, setViewTypes] = useState<Record<string, ViewType>>({});
  const [matrixRange, setMatrixRange] = useState<Record<string, MatrixRange>>(
    {},
  );
  const [matrixData, setMatrixData] = useState<Record<string, MatrixResult>>(
    {},
  );
  const [matrixRunning, setMatrixRunning] = useState<string | null>(null);
  // Per-report multi-select filters
  const [filterUsers, setFilterUsers] = useState<Record<string, string[]>>({});
  const [filterCenters, setFilterCenters] = useState<Record<string, string[]>>(
    {},
  );
  // Per-report export format dropdown open state
  const [exportMenuOpen, setExportMenuOpen] = useState<string | null>(null);
  // Per-report on-screen layout: false = detailed (date columns), true = HR template summary
  const [summaryView, setSummaryView] = useState<Record<string, boolean>>({});
  // Default working calendar per project (for Target Attendance / Target Hours)
  const [calendarByProject, setCalendarByProject] = useState<
    Record<string, WorkCalendarLite | null>
  >({});
  // Offline centers per project (name + District Nodal Officer) — drives the
  // Center filter dropdown and the export venue header.
  const [centersByProject, setCentersByProject] = useState<
    Record<string, { centerName: string; dno: string }[]>
  >({});
  // Active employees per project — drives the Employee filter dropdown.
  const [employeesByProject, setEmployeesByProject] = useState<
    Record<string, { userId: string; name: string; employeeCode: string }[]>
  >({});

  useEffect(() => {
    setLoading(true);
    setFetchError(false);
    axios
      .get(`${API_BASE_URL}/attendance/reports/mine`, { headers })
      .then((r) => setReports(r.data?.data ?? []))
      .catch(() => {
        setFetchError(true);
        setReports([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Load each report's project default working calendar (working days + hours).
  useEffect(() => {
    const projectIds = [
      ...new Set(
        reports.map((r) => (r as any).projectId).filter(Boolean) as string[],
      ),
    ];
    projectIds.forEach((pid) => {
      setCalendarByProject((prev) => {
        if (pid in prev) return prev; // already fetched/attempted
        axios
          .get(`${API_BASE_URL}/working-calendars/project/${pid}/default`, {
            headers,
          })
          .then((r) => {
            const data = r.data?.data;
            setCalendarByProject((p) => ({
              ...p,
              [pid]: data
                ? {
                    workingHours: data.workingHours ?? [],
                    holidays: data.holidays ?? [],
                  }
                : null,
            }));
          })
          .catch(() =>
            setCalendarByProject((p) => ({ ...p, [pid]: null })),
          );
        return { ...prev, [pid]: prev[pid] ?? null };
      });

      // Offline centers for the Center filter dropdown
      setCentersByProject((prev) => {
        if (pid in prev) return prev;
        axios
          .get(`${API_BASE_URL}/offline-module/${pid}/centers`, { headers })
          .then((r) => {
            const list = (r.data?.centers ?? [])
              .filter((c: any) => c.centerName)
              .map((c: any) => {
                const dnoContact = (c.contacts ?? []).find((ct: any) =>
                  /nodal|dno/i.test(ct?.role ?? ""),
                );
                return {
                  centerName: c.centerName as string,
                  dno: (dnoContact?.name as string) ?? "",
                };
              });
            setCentersByProject((p) => ({ ...p, [pid]: list }));
          })
          .catch(() => setCentersByProject((p) => ({ ...p, [pid]: [] })));
        return { ...prev, [pid]: prev[pid] ?? [] };
      });

      // Project employees for the Employee filter dropdown
      setEmployeesByProject((prev) => {
        if (pid in prev) return prev;
        axios
          .get(`${API_BASE_URL}/attendance/employees-list?projectId=${pid}`, {
            headers,
          })
          .then((r) => {
            setEmployeesByProject((p) => ({ ...p, [pid]: r.data?.data ?? [] }));
          })
          .catch(() => setEmployeesByProject((p) => ({ ...p, [pid]: [] })));
        return { ...prev, [pid]: prev[pid] ?? [] };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-export-id="${exportMenuOpen}"]`)) {
        setExportMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

  // ── Matrix view helpers ─────────────────────────────────────────────────────

  const getViewType = (id: string): ViewType => viewTypes[id] ?? "daily";
  const getMatrixRange = (id: string): MatrixRange =>
    matrixRange[id] ?? getDefaultRange("monthly");

  const handleViewTypeChange = (reportId: string, vt: ViewType) => {
    setViewTypes((p) => ({ ...p, [reportId]: vt }));
    if (vt !== "daily") {
      // Derive range from existing run results if available, so the
      // default range lands on a period that actually has data.
      const existingRows = runResults[reportId];
      let derivedRange: MatrixRange | null = null;
      if (existingRows && existingRows.length > 0) {
        const dates = existingRows
          .map((r) => (r.attendanceDate ?? "").split("T")[0])
          .filter(Boolean);
        if (dates.length > 0) {
          const maxDate = dates.reduce((a, b) => (a > b ? a : b));
          const minDate = dates.reduce((a, b) => (a < b ? a : b));
          const maxD = parseLocalDate(maxDate);
          if (vt === "monthly") {
            const first = new Date(maxD.getFullYear(), maxD.getMonth(), 1);
            const last = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0);
            derivedRange = {
              dateFrom: localDateStr(first),
              dateTo: localDateStr(last),
            };
          } else if (vt === "weekly") {
            const dow = maxD.getDay();
            const monday = new Date(maxD);
            monday.setDate(maxD.getDate() - ((dow + 6) % 7));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            derivedRange = {
              dateFrom: localDateStr(monday),
              dateTo: localDateStr(sunday),
            };
          } else {
            // custom: use the full span of the daily data
            derivedRange = { dateFrom: minDate, dateTo: maxDate };
          }
        }
      }
      setMatrixRange((p) => ({
        ...p,
        [reportId]: derivedRange ?? getDefaultRange(vt),
      }));
    }
    setRunResults((p) => {
      const n = { ...p };
      delete n[reportId];
      return n;
    });
    setMatrixData((p) => {
      const n = { ...p };
      delete n[reportId];
      return n;
    });
  };

  const handleMonthNav = (reportId: string, dir: -1 | 1) => {
    const r = getMatrixRange(reportId);
    const d = parseLocalDate(r.dateFrom);
    d.setMonth(d.getMonth() + dir);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    setMatrixRange((p) => ({
      ...p,
      [reportId]: {
        dateFrom: localDateStr(first),
        dateTo: localDateStr(last),
      },
    }));
    setMatrixData((p) => {
      const n = { ...p };
      delete n[reportId];
      return n;
    });
  };

  const handleMonthSelect = (reportId: string, year: number, month: number) => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    setMatrixRange((p) => ({
      ...p,
      [reportId]: {
        dateFrom: localDateStr(first),
        dateTo: localDateStr(last),
      },
    }));
    setMatrixData((p) => {
      const n = { ...p };
      delete n[reportId];
      return n;
    });
  };

  const handleWeekNav = (reportId: string, dir: -1 | 1) => {
    const r = getMatrixRange(reportId);
    const d = parseLocalDate(r.dateFrom);
    d.setDate(d.getDate() + dir * 7);
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    setMatrixRange((p) => ({
      ...p,
      [reportId]: {
        dateFrom: localDateStr(d),
        dateTo: localDateStr(end),
      },
    }));
    setMatrixData((p) => {
      const n = { ...p };
      delete n[reportId];
      return n;
    });
  };

  const setCustomRange = (
    reportId: string,
    field: "dateFrom" | "dateTo",
    value: string,
  ) => {
    setMatrixRange((p) => ({
      ...p,
      [reportId]: {
        ...(p[reportId] ?? getDefaultRange("custom")),
        [field]: value,
      },
    }));
    setMatrixData((p) => {
      const n = { ...p };
      delete n[reportId];
      return n;
    });
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const buildParamsFromReport = (report: SavedAttendanceReport) => {
    const params = new URLSearchParams({
      projectId: report.projectId ?? "",
      page: "1",
      limit: "10000",
      sort: report.sortBy ?? "attendanceDate",
      order: report.sortOrder ?? "desc",
    });
    for (const f of report.filters) {
      if (!f.field || !f.value) continue;
      switch (f.field) {
        case "attendanceDate":
          if (f.operator === "equals") {
            params.set("dateFrom", f.value);
            params.set("dateTo", f.value);
          } else if (f.operator === "after") params.set("dateFrom", f.value);
          else if (f.operator === "before") params.set("dateTo", f.value);
          break;
        case "status":
          params.set("status", f.value);
          break;
        case "center":
          params.set("center", f.value);
          break;
        case "employee_id":
          params.set("employeeCode", f.value);
          break;
        default:
          params.set(f.field, f.value);
      }
    }
    return params;
  };

  const handleRun = async (report: SavedAttendanceReport) => {
    if (!report.projectId) return;
    setRunning(report._id);
    try {
      const r = await axios.get(
        `${API_BASE_URL}/attendance/records?${buildParamsFromReport(report)}`,
        { headers },
      );
      setRunResults((prev) => ({ ...prev, [report._id]: r.data?.data ?? [] }));
    } catch {
      setRunResults((prev) => ({ ...prev, [report._id]: [] }));
    } finally {
      setRunning(null);
    }
  };

  const handleRunMatrix = async (report: SavedAttendanceReport) => {
    if (!report.projectId) return;
    const range = getMatrixRange(report._id);
    if (!range.dateFrom || !range.dateTo) return;
    setMatrixRunning(report._id);
    try {
      const params = buildParamsFromReport(report);
      params.set("dateFrom", range.dateFrom);
      params.set("dateTo", range.dateTo);
      const r = await axios.get(
        `${API_BASE_URL}/attendance/records?${params}`,
        { headers },
      );
      setRunResults((p) => ({ ...p, [report._id]: r.data?.data ?? [] }));
    } catch (err) {
      console.error("[handleRunMatrix] API error:", err);
      setRunResults((p) => ({ ...p, [report._id]: [] }));
    } finally {
      setMatrixRunning(null);
    }
  };

  // ── Matrix export helpers ────────────────────────────────────────────────
  const _matrixRows = (report: SavedAttendanceReport) => {
    const result = matrixData[report._id];
    if (!result || !result.rows.length) return null;
    const today = todayISO();
    const holidaySet = new Set(result.holidays ?? []);
    const woSet = new Set(result.nonWorkingWeekdays ?? []);
    const visibleDates = result.dates.filter((d) => d <= today);
    const headers = [
      "Employee Name",
      "Employee Code",
      "Offline Center",
      ...visibleDates.map((d) => {
        const dt = parseLocalDate(d);
        const dn = DAY_ABBR[dt.getDay()];
        return `${dn} ${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
      }),
      "Present Days",
      "Working Days",
    ];
    const workingDays = visibleDates.filter(
      (d) => !holidaySet.has(d) && !woSet.has(parseLocalDate(d).getDay()),
    ).length;
    const dataRows = result.rows.map((row) => {
      const presentDays = visibleDates.filter((d) => {
        const s = row.attendance[d];
        return s === "P" || s === "PL";
      }).length;
      return [
        row.name,
        row.employeeCode,
        row.center ?? "",
        ...visibleDates.map((d) => {
          const raw = row.attendance[d] ?? "Absent";
          if (raw === "Absent") {
            if (holidaySet.has(d)) return "PH";
            if (woSet.has(parseLocalDate(d).getDay())) return "WO";
          }
          return raw;
        }),
        presentDays,
        workingDays,
      ];
    });
    return { headers, dataRows, visibleDates, workingDays };
  };

  const handleExportMatrix = (
    report: SavedAttendanceReport,
    fmt: "csv" | "excel" | "pdf" = "csv",
  ) => {
    const data = _matrixRows(report);
    if (!data) {
      alert("Please run the report first before exporting.");
      return;
    }
    const range = getMatrixRange(report._id);
    const baseName = `${report.name.replace(/[^a-z0-9]/gi, "_")}_matrix_${range.dateFrom}_to_${range.dateTo}`;
    if (fmt === "csv") {
      const csvContent = [
        data.headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(","),
        ...data.dataRows.map((row) =>
          row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
        ),
      ].join("\n");
      downloadCsv(csvContent, `${baseName}.csv`);
    } else if (fmt === "excel") {
      const ws = XLSX.utils.aoa_to_sheet([data.headers, ...data.dataRows]);
      // Bold header row
      const range2 = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      for (let c = range2.s.c; c <= range2.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
        if (cell) cell.s = { font: { bold: true } };
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(12);
      doc.text(`${report.name} — Attendance Matrix`, 14, 14);
      doc.setFontSize(9);
      doc.text(`Period: ${range.dateFrom} to ${range.dateTo}`, 14, 21);
      autoTable(doc, {
        head: [data.headers.map((h) => pdfText(h))],
        body: data.dataRows.map((r) => r.map((c) => pdfText(c))),
        startY: 26,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: {
          fillColor: [99, 102, 241],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      doc.save(`${baseName}.pdf`);
    }
    setExportMenuOpen(null);
  };

  // ── Daily export helpers ──────────────────────────────────────────────────
  const handleExportDaily = (
    report: SavedAttendanceReport,
    fmt: "csv" | "excel" | "pdf" = "csv",
  ) => {
    const rows = runResults[report._id];
    if (!rows) {
      alert("Please run the report first before exporting.");
      return;
    }
    const visibleFields = DATA_POINTS.filter((d) =>
      report.dataPoints.includes(d.key),
    );
    const headers = visibleFields.map((d) => d.label);
    const dataRows = rows.map((rec) =>
      visibleFields.map((d) => renderCellValue(d.key, rec)),
    );
    const baseName = `${report.name.replace(/[^a-z0-9]/gi, "_")}_daily_${Date.now()}`;
    if (fmt === "csv") {
      const csvContent = [
        headers.join(","),
        ...dataRows.map((row) =>
          row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
        ),
      ].join("\n");
      downloadCsv(csvContent, `${baseName}.csv`);
    } else if (fmt === "excel") {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Records");
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(12);
      doc.text(`${report.name} — Daily Records`, 14, 14);
      autoTable(doc, {
        head: [headers.map((h) => pdfText(h))],
        body: dataRows.map((r) => r.map((c) => pdfText(c))),
        startY: 22,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: {
          fillColor: [99, 102, 241],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      doc.save(`${baseName}.pdf`);
    }
    setExportMenuOpen(null);
  };

  // ── HR Template summary export (CSV / Excel / PDF) ─────────────────────────
  // Two header rows + one summary row per employee, matching the on-screen
  // template view. Computed from runResults (loaded by Run) for every view type
  // via the shared buildHRTemplateRows helper.
  const handleExportHRFormat = (
    report: SavedAttendanceReport,
    fmt: "csv" | "excel" | "pdf" = "csv",
  ) => {
    const rows = runResults[report._id];
    if (!rows || rows.length === 0) {
      alert("Please run the report first before exporting.");
      return;
    }
    const { rows: employeeRows, dateLabel } = buildHRTemplateRows(rows);

    const metaRow = [
      `Date: ${dateLabel}`,
      `(Working days)`,
      `(Leave + Present)`,
    ];
    const columnHeaders = [
      "Employee code",
      "User Name",
      "Designation",
      "Punch in",
      "Punch out",
      "Status",
      "Target Attendance",
      "Actual Attendance",
      "Attendance percentage",
    ];
    const dataRows = employeeRows.map((r) => [
      r.employeeCode,
      r.userName,
      r.designation,
      formatTime(r.punchIn),
      formatTime(r.punchOut),
      r.status,
      r.target,
      r.actual,
      r.percent,
    ]);

    const baseName = `${report.name.replace(/[^a-z0-9]/gi, "_")}_hr_format`;
    if (fmt === "csv") {
      const csvContent = [
        metaRow.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(","),
        columnHeaders.map((h) => `"${h}"`).join(","),
        ...dataRows.map((row) =>
          row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
        ),
      ].join("\n");
      downloadCsv(csvContent, `${baseName}.csv`);
    } else if (fmt === "excel") {
      const allData = [metaRow, columnHeaders, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(allData);
      // Bold column header row (row index 1)
      const wsRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      for (let c = wsRange.s.c; c <= wsRange.e.c; c++) {
        const hCell = ws[XLSX.utils.encode_cell({ r: 1, c })];
        if (hCell) hCell.s = { font: { bold: true } };
      }
      // Merge meta row cells A1:C1
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance HR");
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(12);
      doc.text(`${report.name} — HR Format`, 14, 14);
      doc.setFontSize(9);
      doc.text(`${metaRow[0]}   ${metaRow[1]}   ${metaRow[2]}`, 14, 21);
      autoTable(doc, {
        head: [columnHeaders],
        body: dataRows.map((r) => r.map((c) => pdfText(c))),
        startY: 26,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: {
          fillColor: [99, 102, 241],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      doc.save(`${baseName}.pdf`);
    }
    setExportMenuOpen(null);
  };

  // ── Center Wise Attendance Report ─────────────────────────────────────────
  // Same format for all tabs (daily / weekly / monthly / custom).
  // For the daily tab: uses already-fetched runResults.
  // For weekly/monthly/custom tabs: fetches records filtered by the selected date range.
  const handleExportCenterWise = async (
    report: SavedAttendanceReport,
    fmt: "csv" | "excel" | "pdf" = "csv",
  ) => {
    let rows: AttendanceRecord[] | undefined;
    const vt = getViewType(report._id);

    if (vt === "daily") {
      rows = runResults[report._id];
      if (!rows || rows.length === 0) {
        alert("Please run the report first before exporting.");
        return;
      }
    } else {
      // For weekly / monthly / custom — fetch records scoped to the selected date range
      const range = getMatrixRange(report._id);
      if (!range.dateFrom || !range.dateTo) {
        alert("Please select a date range first.");
        return;
      }
      try {
        const params = buildParamsFromReport(report);
        params.set("dateFrom", range.dateFrom);
        params.set("dateTo", range.dateTo);
        const res = await axios.get(
          `${API_BASE_URL}/attendance/records?${params}`,
          { headers },
        );
        rows = res.data?.data ?? [];
      } catch {
        alert("Failed to fetch attendance data for export.");
        return;
      }
      if (!rows || rows.length === 0) {
        alert("No records found for the selected period.");
        return;
      }
    }

    // Scope the export to the selected center(s) so a per-venue download only
    // contains that venue's rows (matches the on-screen Center filter).
    const exportSelCenters = filterCenters[report._id] ?? [];
    if (exportSelCenters.length > 0) {
      rows = rows.filter((r) => exportSelCenters.includes(r.center ?? ""));
      if (rows.length === 0) {
        alert("No records found for the selected center(s).");
        return;
      }
    }

    // Venue header info. A single selected center → full venue header; otherwise
    // fall back to the distinct centers present in the data.
    const distinctCenters = [
      ...new Set(rows.map((r) => r.center).filter(Boolean) as string[]),
    ];
    const venueName =
      exportSelCenters.length === 1
        ? exportSelCenters[0]
        : distinctCenters.length === 1
          ? distinctCenters[0]
          : exportSelCenters.length > 1
            ? exportSelCenters.join(", ")
            : "All Centers";
    // Venue code = the part of the center name before the first "-".
    const venueCode =
      venueName && venueName !== "All Centers" && venueName.includes("-")
        ? venueName.split("-")[0].trim()
        : "";
    const projCenters =
      centersByProject[(report as any).projectId ?? ""] ?? [];
    const venueDno =
      projCenters.find((c) => c.centerName === venueName)?.dno || "";

    // ── Gather unique sorted dates ───────────────────────────────────────────
    const dateSet = new Set<string>();
    for (const r of rows) {
      const d = r.attendanceDate?.split("T")[0];
      if (d) dateSet.add(d);
    }
    const sortedDates = [...dateSet].sort();

    // ── Group records: employeeCode → date → record ──────────────────────────
    type EmpEntry = {
      name: string;
      code: string;
      designation: string;
      center: string;
      byDate: Record<string, AttendanceRecord>;
    };
    const empMap = new Map<string, EmpEntry>();
    for (const r of rows) {
      const code = r.employee_id ?? "_";
      const dateKey = r.attendanceDate?.split("T")[0] ?? "";
      if (!empMap.has(code)) {
        empMap.set(code, {
          name: r.employeeName ?? "",
          code,
          designation: r.designation ?? "",
          center: r.center ?? "",
          byDate: {},
        });
      }
      const e = empMap.get(code)!;
      if (!e.designation && r.designation) e.designation = r.designation;
      if (!e.center && r.center) e.center = r.center;
      e.byDate[dateKey] = r;
    }

    const empList = [...empMap.values()];

    // Target days/hours from the project's working calendar.
    const cal = calendarByProject[(report as any).projectId ?? ""] ?? null;
    const expVt = getViewType(report._id);
    const expRange = getMatrixRange(report._id);
    const targetDates =
      expVt !== "daily" && expRange.dateFrom && expRange.dateTo
        ? enumerateDates(expRange.dateFrom, expRange.dateTo)
        : sortedDates;
    const { targetDays, targetHours } = computeTargets(cal, targetDates);
    const denom = targetDays > 0 ? targetDays : sortedDates.length;
    const targetHoursStr: string | number =
      targetHours > 0 ? Number(targetHours.toFixed(1)) : "";

    // ── Date label helper: "10 Sept" ─────────────────────────────────────────
    const shortDate = (iso: string) => {
      const d = parseLocalDate(iso);
      return `${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}`;
    };

    const dateFrom = sortedDates[0] ?? "";
    const dateTo = sortedDates[sortedDates.length - 1] ?? "";
    // Attendance cycle label — "1 Jun 2026 – 4 Jun 2026" (or a single date).
    const fmtCycle = (iso: string) => {
      const d = parseLocalDate(iso);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    };
    const attendanceCycle =
      dateFrom && dateTo
        ? dateFrom === dateTo
          ? fmtCycle(dateFrom)
          : `${fmtCycle(dateFrom)} – ${fmtCycle(dateTo)}`
        : "";
    const baseName = `${report.name.replace(/[^a-z0-9]/gi, "_")}_attendance`;

    // ── Shared row builder (matches the on-screen detailed table) ─────────────
    const buildRows = () =>
      empList.map((emp, i) => {
        let presentDays = 0;
        let leaveDays = 0;
        const dateCols: string[] = [];
        for (const d of sortedDates) {
          const rec = emp.byDate[d];
          const hasIn = !!rec?.punch_in;
          const hasOut = !!rec?.punch_out;
          const both = hasIn && hasOut;
          const isLeave = !!(rec?.status && LEAVE_STATUSES.has(rec.status));
          // Present = both punches OR an incomplete record still within the
          // last-sync window (backend effectivePresent), excluding leave so
          // Actual = Present + Leave stays correct. Falls back to "both" for
          // older payloads without effectivePresent.
          const eff = (rec as any)?.effectivePresent;
          const present = (eff !== undefined ? eff === true : both) && !isLeave;
          dateCols.push(hasIn ? formatTime(rec!.punch_in) : "—");
          dateCols.push(hasOut ? formatTime(rec!.punch_out) : "—");
          dateCols.push(present ? "P" : "A");
          if (present) presentDays++;
          else if (isLeave) leaveDays++;
        }
        const actual = presentDays + leaveDays;
        const attPct =
          denom > 0 ? ((actual / denom) * 100).toFixed(2) + "%" : "0%";
        return [
          i + 1,
          emp.name,
          emp.code,
          emp.designation || "—",
          emp.center || "—",
          ...dateCols,
          denom,
          actual,
          attPct,
          targetHoursStr,
        ];
      });

    const fixedHeaders = [
      "S.No",
      "Name",
      "Employee Code",
      "Designation",
      "Offline Center",
    ];
    const dateHeaders: string[] = [];
    for (const d of sortedDates) {
      const label = shortDate(d);
      dateHeaders.push(`${label} In`, `${label} Out`, `${label} Status`);
    }
    const headerRow = [
      ...fixedHeaders,
      ...dateHeaders,
      "Target Attendance",
      "Actual Attendance",
      "Attendance %",
      "Total Targeted Hours",
    ];
    const dataRows = buildRows();
    const totalRow: (string | number)[] = [
      "Total Count",
      "",
      "",
      "",
      "",
      ...sortedDates.flatMap((d) => {
        const inCnt = empList.filter((e) => !!e.byDate[d]?.punch_in).length;
        const outCnt = empList.filter((e) => !!e.byDate[d]?.punch_out).length;
        const presentCnt = empList.filter(
          (e) => !!e.byDate[d]?.punch_in && !!e.byDate[d]?.punch_out,
        ).length;
        return [inCnt, outCnt, presentCnt];
      }),
      "",
      "",
      "",
      "",
    ];

    if (fmt === "csv") {
      // ── CSV version ──────────────────────────────────────────────────────────
      const csvLines = [
        [`Center Wise Attendance Report`],
        [`Venue Name: ${venueName || "—"}`],
        [`Venue Code: ${venueCode || "—"}`],
        [`DNO: ${venueDno || "—"}`],
        [`Attendance Cycle: ${attendanceCycle || "—"}`],
        [`Report: ${report.name}`],
        [],
        headerRow,
        ...dataRows,
        totalRow,
      ]
        .map((row) =>
          row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
        )
        .join("\n");
      downloadCsv(csvLines, `${baseName}.csv`);
    } else if (fmt === "excel") {
      // ── Excel version ────────────────────────────────────────────────────
      const coverData: (string | number)[][] = [
        ["Center Wise Attendance Report"],
        [],
        ["Venue Name:", venueName || "—"],
        ["Venue Code:", venueCode || "—"],
        ["DNO:", venueDno || "—"],
        ["Attendance Cycle:", attendanceCycle || "—"],
        ["Report Name:", report.name],
        ["Date From:", dateFrom, "", "Date To:", dateTo],
        ["Total Days:", sortedDates.length],
        ["Target Working Days:", denom],
        ["Total Targeted Hours:", targetHoursStr || "—"],
        [],
      ];
      const coverWs = XLSX.utils.aoa_to_sheet(coverData);
      const dataWs = XLSX.utils.aoa_to_sheet([
        headerRow,
        ...dataRows,
        totalRow,
      ]);
      const wsRange = XLSX.utils.decode_range(dataWs["!ref"] ?? "A1");
      for (let c = wsRange.s.c; c <= wsRange.e.c; c++) {
        const cell = dataWs[XLSX.utils.encode_cell({ r: 0, c })];
        if (cell) cell.s = { font: { bold: true } };
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, coverWs, "Cover");
      XLSX.utils.book_append_sheet(wb, dataWs, "Attendance Data");
      XLSX.writeFile(wb, `${baseName}.xlsx`);
    } else {
      // ── PDF version ──────────────────────────────────────────────────────
      const doc = new jsPDF({ orientation: "landscape", format: "a3" });
      // Helvetica is Latin-only, so romanize any Devanagari (venue/center names)
      // via pdfText() — always renders, never blank.

      // ── Page 1: Cover ───────────────────────────────────────────────────────
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(
        "Center Wise Attendance Report",
        doc.internal.pageSize.getWidth() / 2,
        22,
        { align: "center" },
      );

      doc.setLineWidth(0.4);
      doc.line(14, 26, doc.internal.pageSize.getWidth() - 14, 26);

      const coverItems: [string, string][] = [
        ["Venue Name:", venueName || "—"],
        ["Venue Code:", venueCode || "—"],
        ["DNO:", venueDno || "—"],
        ["Attendance Cycle:", attendanceCycle || "—"],
        ["Date From:", dateFrom],
        ["Date To:", dateTo],
        ["Total Days:", String(sortedDates.length)],
        ["Target Working Days:", String(denom)],
        ["Total Targeted Hours:", String(targetHoursStr || "—")],
      ];

      doc.setFontSize(10);
      let cy = 38;
      const labelX = 14;
      const valueX = 70;
      const valueMaxWidth = doc.internal.pageSize.getWidth() - valueX - 14;
      // Single column with wrapping so long venue names don't overlap.
      for (const [label, value] of coverItems) {
        doc.setFont("helvetica", "bold");
        doc.text(label, labelX, cy);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(pdfText(value), valueMaxWidth);
        doc.text(lines, valueX, cy);
        cy += 7 * Math.max(1, lines.length);
      }

      // ── Page 2+: Data table ─────────────────────────────────────────────────
      doc.addPage("a3", "landscape");
      doc.setFont("helvetica", "normal");

      // Use the shared headerRow so the PDF columns match the data rows
      // (Designation, Offline Center, per-date In/Out/Status, Target, Actual, %,
      // Total Targeted Hours).
      const tableBody = [...dataRows, totalRow];

      autoTable(doc, {
        head: [headerRow.map((h) => pdfText(h))],
        body: tableBody.map((r) => r.map((c) => pdfText(c))),
        startY: 16,
        styles: { fontSize: 6, cellPadding: 1.2, halign: "center" },
        headStyles: {
          fillColor: [99, 102, 241],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 6,
          halign: "center",
          valign: "middle",
          minCellHeight: 10,
        },
        columnStyles: {
          0: { cellWidth: 8 }, // S.No
          1: { cellWidth: 28, halign: "left" }, // Name
          2: { cellWidth: 22 }, // Employee Code
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (data) => {
          if (data.row.index === tableBody.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [229, 231, 235];
          }
        },
        margin: { left: 5, right: 5 },
      });

      doc.save(`${baseName}.pdf`);
    }

    setExportMenuOpen(null);
  };

  if (loading)
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
        Loading your reports…
      </div>
    );

  if (fetchError)
    return (
      <div
        style={{
          padding: "60px",
          textAlign: "center",
          color: "#DC2626",
          fontSize: 14,
          border: "1px solid #fecaca",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        Unable to load attendance reports. Please refresh the page or contact
        your administrator.
      </div>
    );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}
        >
          My Attendance Reports
        </h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          Attendance reports that have been shared with you by your
          administrator.
        </p>
      </div>

      {reports.length === 0 ? (
        <div
          style={{
            padding: "60px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          No attendance reports have been assigned to you yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map((report) => {
            const vt = getViewType(report._id);
            const isRunning =
              vt === "daily"
                ? running === report._id
                : matrixRunning === report._id;
            const rows = runResults[report._id];
            const matrix = matrixData[report._id];
            const range = getMatrixRange(report._id);
            // Project's working calendar → Target Attendance / Target Hours
            const cal = calendarByProject[(report as any).projectId ?? ""] ?? null;
            // On-screen layout: HR template summary vs detailed date-column table
            const isSummary = summaryView[report._id] ?? false;
            // Export honours the active on-screen layout
            const doExport = (fmt: "csv" | "excel" | "pdf") =>
              (isSummary ? handleExportHRFormat : handleExportCenterWise)(
                report,
                fmt,
              );
            const visibleFields = DATA_POINTS.filter((d) =>
              report.dataPoints.includes(d.key),
            );
            const rangeFrom = range.dateFrom
              ? parseLocalDate(range.dateFrom)
              : new Date();
            const dispMonth = rangeFrom.getMonth();
            const dispYear = rangeFrom.getFullYear();
            const today = todayISO();
            const isFuture = (d: string) => d > today;
            // Derived filter values for this report
            const selUsers = filterUsers[report._id] ?? [];
            const selCenters = filterCenters[report._id] ?? [];
            // Offline centers for this report's project — drives the Center
            // filter dropdown (falls back to centers seen in the data).
            const offlineCenters =
              centersByProject[(report as any).projectId ?? ""] ?? [];
            const offlineCenterNames = offlineCenters.map((c) => c.centerName);
            const centerOptions = (
              offlineCenterNames.length > 0
                ? offlineCenterNames
                : [
                    ...new Set(
                      [
                        ...(matrix?.centers ?? []),
                        ...((runResults[report._id] ?? [])
                          .map((r) => r.center)
                          .filter(Boolean) as string[]),
                      ],
                    ),
                  ].sort()
            ).map((c) => ({ value: c, label: c }));
            // Employee filter options — all active employees for the project
            // (loaded up-front), plus any extra employees seen in the data.
            const employeeOptions = (() => {
              const seen = new Map<string, string>();
              for (const e of employeesByProject[
                (report as any).projectId ?? ""
              ] ?? []) {
                if (e.userId && !seen.has(e.userId))
                  seen.set(
                    e.userId,
                    e.name
                      ? `${e.name}${e.employeeCode ? ` (${e.employeeCode})` : ""}`
                      : e.employeeCode || e.userId,
                  );
              }
              for (const r of matrix?.rows ?? []) {
                if (r.userId && !seen.has(String(r.userId)))
                  seen.set(
                    String(r.userId),
                    r.name
                      ? `${r.name}${r.employeeCode ? ` (${r.employeeCode})` : ""}`
                      : r.employeeCode,
                  );
              }
              for (const r of runResults[report._id] ?? []) {
                const uid = (r as any).userId;
                if (uid && !seen.has(String(uid)))
                  seen.set(
                    String(uid),
                    r.employeeName
                      ? `${r.employeeName}${r.employee_id ? ` (${r.employee_id})` : ""}`
                      : (r.employee_id ?? String(uid)),
                  );
              }
              return [...seen.entries()]
                .map(([value, label]) => ({ value, label }))
                .sort((a, b) => a.label.localeCompare(b.label));
            })();
            // Rows after applying the Center / Employee filters — used by the
            // detailed table and the summary view.
            const visibleRows = (rows ?? []).filter((r) => {
              if (
                selCenters.length > 0 &&
                !selCenters.includes(r.center ?? "")
              )
                return false;
              if (
                selUsers.length > 0 &&
                !selUsers.includes(String((r as any).userId ?? ""))
              )
                return false;
              return true;
            });
            // Calendar helpers for this report's matrix
            const holidaySet = new Set(matrix?.holidays ?? []);
            const woSet = new Set(matrix?.nonWorkingWeekdays ?? []);
            const isHoliday = (d: string) => holidaySet.has(d);
            const isWeekOff = (d: string) =>
              woSet.has(parseLocalDate(d).getDay());
            const isWorkingDay = (d: string) =>
              !isFuture(d) && !isHoliday(d) && !isWeekOff(d);
            const workingDaysInRange = (matrix?.dates ?? []).filter(
              isWorkingDay,
            ).length;
            // Filtered rows for matrix display
            const filteredRows = matrix
              ? matrix.rows.filter((r) => {
                  if (selUsers.length > 0 && !selUsers.includes(r.userId))
                    return false;
                  if (
                    selCenters.length > 0 &&
                    !selCenters.includes(r.center ?? "")
                  )
                    return false;
                  return true;
                })
              : [];

            return (
              <div
                key={report._id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                {/* ── Report header ── */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    padding: "14px 18px",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "#111827",
                        fontSize: 14,
                      }}
                    >
                      {report.name}
                    </div>
                    {report.description && (
                      <div
                        style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}
                      >
                        {report.description}
                      </div>
                    )}
                    {vt === "daily" && (
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          marginTop: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {visibleFields.slice(0, 6).map((d) => (
                          <span
                            key={d.key}
                            style={{
                              background: "#f3f4f6",
                              color: "#374151",
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: 11,
                            }}
                          >
                            {d.label}
                          </span>
                        ))}
                        {visibleFields.length > 6 && (
                          <span
                            style={{
                              background: "#f3f4f6",
                              color: "#6b7280",
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: 11,
                            }}
                          >
                            +{visibleFields.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() =>
                        vt === "daily"
                          ? handleRun(report)
                          : handleRunMatrix(report)
                      }
                      disabled={isRunning}
                      style={{
                        padding: "7px 16px",
                        background: "#6366f1",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: isRunning ? "not-allowed" : "pointer",
                        opacity: isRunning ? 0.7 : 1,
                      }}
                    >
                      {isRunning ? "Running…" : "▶ Run"}
                    </button>
                    {/* Export split-button */}
                    <div
                      data-export-id={report._id}
                      style={{ position: "relative" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                        }}
                      >
                        <button
                          onClick={() => doExport("csv")}
                          style={{
                            padding: "7px 12px",
                            background: "#fff",
                            color: "#374151",
                            border: "none",
                            borderRight: "1px solid #e5e7eb",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            borderRadius: "8px 0 0 8px",
                          }}
                          title={
                            isSummary
                              ? "Export HR template as CSV"
                              : "Export as CSV"
                          }
                        >
                          ⬇ Export
                        </button>
                        <button
                          onClick={() =>
                            setExportMenuOpen((p) =>
                              p === report._id ? null : report._id,
                            )
                          }
                          style={{
                            padding: "7px 8px",
                            background: "#fff",
                            color: "#374151",
                            border: "none",
                            fontSize: 12,
                            cursor: "pointer",
                            borderRadius: "0 8px 8px 0",
                          }}
                          title="More formats"
                        >
                          ▾
                        </button>
                      </div>
                      {exportMenuOpen === report._id && (
                        <div
                          style={{
                            position: "absolute",
                            right: 0,
                            top: "calc(100% + 4px)",
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                            zIndex: 50,
                            minWidth: 155,
                            overflow: "hidden",
                          }}
                        >
                          {(
                            [
                              {
                                fmt: "csv" as const,
                                icon: "📄",
                                label: "CSV (.csv)",
                              },
                              {
                                fmt: "excel" as const,
                                icon: "📊",
                                label: "Excel (.xlsx)",
                              },
                              {
                                fmt: "pdf" as const,
                                icon: "📑",
                                label: "PDF (.pdf)",
                              },
                            ] as const
                          ).map(({ fmt, icon, label }) => (
                            <button
                              key={fmt}
                              onClick={() => doExport(fmt)}
                              style={{
                                display: "block",
                                width: "100%",
                                padding: "9px 14px",
                                background: "none",
                                border: "none",
                                textAlign: "left",
                                fontSize: 13,
                                cursor: "pointer",
                                color: "#374151",
                                fontWeight: 500,
                              }}
                              onMouseEnter={(e) =>
                                ((
                                  e.currentTarget as HTMLButtonElement
                                ).style.background = "#f3f4f6")
                              }
                              onMouseLeave={(e) =>
                                ((
                                  e.currentTarget as HTMLButtonElement
                                ).style.background = "none")
                              }
                            >
                              {icon} {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── View type tabs + date controls ── */}
                <div
                  style={{
                    borderTop: "1px solid #f3f4f6",
                    padding: "8px 18px",
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    background: "#fafafa",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{ fontSize: 12, color: "#6b7280", marginRight: 4 }}
                  >
                    Format:
                  </span>
                  {(
                    [
                      { key: "daily", label: "Daily" },
                      { key: "weekly", label: "Weekly" },
                      { key: "monthly", label: "Monthly" },
                      { key: "custom", label: "Custom" },
                    ] as { key: ViewType; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleViewTypeChange(report._id, opt.key)}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 6,
                        border:
                          vt === opt.key
                            ? "1px solid #6366f1"
                            : "1px solid #e5e7eb",
                        background: vt === opt.key ? "#eef2ff" : "#fff",
                        color: vt === opt.key ? "#4f46e5" : "#374151",
                        fontSize: 12,
                        fontWeight: vt === opt.key ? 600 : 400,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}

                  {/* Layout toggle: detailed date-columns vs HR template summary */}
                  <div
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    {(
                      [
                        { key: false, label: "Detailed" },
                        { key: true, label: "Summary" },
                      ] as { key: boolean; label: string }[]
                    ).map((opt) => (
                      <button
                        key={String(opt.key)}
                        onClick={() =>
                          setSummaryView((p) => ({
                            ...p,
                            [report._id]: opt.key,
                          }))
                        }
                        title={
                          opt.key
                            ? "HR template summary (Target / Actual / %)"
                            : "Detailed table with per-day punches"
                        }
                        style={{
                          padding: "4px 12px",
                          border: "none",
                          background: isSummary === opt.key ? "#eef2ff" : "#fff",
                          color: isSummary === opt.key ? "#4f46e5" : "#6b7280",
                          fontSize: 12,
                          fontWeight: isSummary === opt.key ? 600 : 400,
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Monthly navigation */}
                  {vt === "monthly" && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginLeft: 8,
                      }}
                    >
                      <button
                        onClick={() => handleMonthNav(report._id, -1)}
                        style={{
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          borderRadius: 6,
                          padding: "3px 8px",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        ‹
                      </button>
                      <select
                        value={dispMonth}
                        onChange={(e) =>
                          handleMonthSelect(
                            report._id,
                            dispYear,
                            Number(e.target.value),
                          )
                        }
                        style={{
                          ...selectStyle,
                          padding: "3px 6px",
                          fontSize: 12,
                        }}
                      >
                        {MONTH_NAMES.map((m, i) => (
                          <option key={i} value={i}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <select
                        value={dispYear}
                        onChange={(e) =>
                          handleMonthSelect(
                            report._id,
                            Number(e.target.value),
                            dispMonth,
                          )
                        }
                        style={{
                          ...selectStyle,
                          padding: "3px 6px",
                          fontSize: 12,
                        }}
                      >
                        {Array.from(
                          { length: 5 },
                          (_, i) => new Date().getFullYear() - 2 + i,
                        ).map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleMonthNav(report._id, 1)}
                        style={{
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          borderRadius: 6,
                          padding: "3px 8px",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        ›
                      </button>
                    </div>
                  )}

                  {/* Weekly navigation */}
                  {vt === "weekly" && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginLeft: 8,
                      }}
                    >
                      <button
                        onClick={() => handleWeekNav(report._id, -1)}
                        style={{
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          borderRadius: 6,
                          padding: "3px 8px",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        ‹
                      </button>
                      <span style={{ fontSize: 12, color: "#374151" }}>
                        {formatDate(range.dateFrom)} –{" "}
                        {formatDate(range.dateTo)}
                      </span>
                      <button
                        onClick={() => handleWeekNav(report._id, 1)}
                        style={{
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          borderRadius: 6,
                          padding: "3px 8px",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        ›
                      </button>
                    </div>
                  )}

                  {/* Custom date range */}
                  {vt === "custom" && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginLeft: 8,
                      }}
                    >
                      <input
                        type="date"
                        value={range.dateFrom}
                        onChange={(e) =>
                          setCustomRange(report._id, "dateFrom", e.target.value)
                        }
                        style={{
                          ...inputStyle,
                          padding: "3px 6px",
                          fontSize: 12,
                        }}
                      />
                      <span style={{ color: "#9ca3af", fontSize: 12 }}>to</span>
                      <input
                        type="date"
                        value={range.dateTo}
                        onChange={(e) =>
                          setCustomRange(report._id, "dateTo", e.target.value)
                        }
                        style={{
                          ...inputStyle,
                          padding: "3px 6px",
                          fontSize: 12,
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* ── Filter bar (matrix modes only) ── */}
                {vt !== "daily" && (
                  <div
                    style={{
                      borderTop: "1px solid #f3f4f6",
                      padding: "7px 18px",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      background: "#fff",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{ fontSize: 12, color: "#6b7280", flexShrink: 0 }}
                    >
                      Filter:
                    </span>
                    {/* Employee multi-select */}
                    <SearchableMultiSelect
                      options={employeeOptions}
                      selected={selUsers}
                      onChange={(vals) =>
                        setFilterUsers((p) => ({ ...p, [report._id]: vals }))
                      }
                      placeholder="All Employees"
                      maxWidth={220}
                    />
                    {/* Center multi-select */}
                    <SearchableMultiSelect
                      options={centerOptions}
                      selected={selCenters}
                      onChange={(vals) =>
                        setFilterCenters((p) => ({ ...p, [report._id]: vals }))
                      }
                      placeholder="All Centers"
                      maxWidth={180}
                    />
                    {(selUsers.length > 0 || selCenters.length > 0) && (
                      <button
                        onClick={() => {
                          setFilterUsers((p) => {
                            const n = { ...p };
                            delete n[report._id];
                            return n;
                          });
                          setFilterCenters((p) => {
                            const n = { ...p };
                            delete n[report._id];
                            return n;
                          });
                        }}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          cursor: "pointer",
                          border: "1px solid #e5e7eb",
                          borderRadius: 6,
                          background: "#fff",
                          color: "#6b7280",
                          flexShrink: 0,
                        }}
                      >
                        ✕ Clear all
                      </button>
                    )}
                    {matrix &&
                      (selUsers.length > 0 || selCenters.length > 0) && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#6b7280",
                            flexShrink: 0,
                          }}
                        >
                          {filteredRows.length} / {matrix.rows.length} employees
                        </span>
                      )}
                  </div>
                )}

                {/* ── HR template summary table (Summary layout) ── */}
                {rows &&
                  rows.length > 0 &&
                  isSummary &&
                  (() => {
                    const { rows: hrRows, dateLabel } =
                      buildHRTemplateRows(visibleRows);
                    return (
                      <div style={{ borderTop: "1px solid #e5e7eb" }}>
                        <div
                          style={{
                            background: "#f8fafc",
                            padding: "8px 16px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#374151",
                            display: "flex",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          <span>
                            HR Template — {hrRows.length} employee
                            {hrRows.length !== 1 ? "s" : ""}
                          </span>
                          <span style={{ fontWeight: 500, color: "#6b7280" }}>
                            Date: {dateLabel} · Target = working days · Actual =
                            Leave + Present
                          </span>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table
                            style={{
                              borderCollapse: "collapse",
                              fontSize: 11,
                              minWidth: "100%",
                            }}
                          >
                            <thead>
                              <tr style={{ background: "#6366f1" }}>
                                {[
                                  "Employee code",
                                  "User Name",
                                  "Designation",
                                  "Punch in",
                                  "Punch out",
                                  "Status",
                                  "Target Attendance",
                                  "Actual Attendance",
                                  "Attendance %",
                                ].map((h, ci) => (
                                  <th
                                    key={ci}
                                    style={{
                                      padding: "7px 10px",
                                      textAlign: ci <= 2 ? "left" : "center",
                                      fontWeight: 700,
                                      color: "#fff",
                                      fontSize: 11,
                                      whiteSpace: "nowrap",
                                      borderRight: "1px solid #4f46e5",
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {hrRows.map((r, i) => (
                                <tr
                                  key={r.employeeCode + i}
                                  style={{
                                    background: i % 2 === 0 ? "#fff" : "#fafafa",
                                    borderBottom: "1px solid #f3f4f6",
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      color: "#374151",
                                      whiteSpace: "nowrap",
                                      borderRight: "1px solid #f3f4f6",
                                    }}
                                  >
                                    {r.employeeCode}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      fontWeight: 600,
                                      color: "#111827",
                                      whiteSpace: "nowrap",
                                      borderRight: "1px solid #f3f4f6",
                                      minWidth: 130,
                                    }}
                                  >
                                    {r.userName || "—"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      color: "#6b7280",
                                      whiteSpace: "nowrap",
                                      borderRight: "1px solid #f3f4f6",
                                    }}
                                  >
                                    {r.designation || "—"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      textAlign: "center",
                                      color: r.punchIn ? "#374151" : "#d1d5db",
                                      whiteSpace: "nowrap",
                                      borderRight: "1px solid #f3f4f6",
                                    }}
                                  >
                                    {formatTime(r.punchIn)}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      textAlign: "center",
                                      color: r.punchOut ? "#374151" : "#d1d5db",
                                      whiteSpace: "nowrap",
                                      borderRight: "1px solid #f3f4f6",
                                    }}
                                  >
                                    {formatTime(r.punchOut)}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      textAlign: "center",
                                      color: "#374151",
                                      whiteSpace: "nowrap",
                                      borderRight: "1px solid #f3f4f6",
                                    }}
                                  >
                                    {r.status || "—"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      textAlign: "center",
                                      color: "#374151",
                                      borderRight: "1px solid #f3f4f6",
                                    }}
                                  >
                                    {r.target}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      textAlign: "center",
                                      color: "#374151",
                                      borderRight: "1px solid #f3f4f6",
                                    }}
                                  >
                                    {r.actual}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 10px",
                                      textAlign: "center",
                                      fontWeight: 700,
                                      color:
                                        r.actual === 0 ? "#ef4444" : "#065f46",
                                    }}
                                  >
                                    {r.percent}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                {/* ── Unified Center Wise results table (all tabs) ── */}
                {rows &&
                  rows.length > 0 &&
                  !isSummary &&
                  (() => {
                    // Build grouped structure: employee → date → record
                    const cwDateSet = new Set<string>();
                    for (const r of visibleRows) {
                      const d = r.attendanceDate?.split("T")[0];
                      if (d) cwDateSet.add(d);
                    }
                    const cwDates = [...cwDateSet].sort();
                    type CWEmp = {
                      name: string;
                      code: string;
                      designation: string;
                      center: string;
                      byDate: Record<string, AttendanceRecord>;
                    };
                    const cwMap = new Map<string, CWEmp>();
                    for (const r of visibleRows) {
                      const code = r.employee_id ?? "_";
                      const dk = r.attendanceDate?.split("T")[0] ?? "";
                      if (!cwMap.has(code)) {
                        cwMap.set(code, {
                          name: r.employeeName ?? "",
                          code,
                          designation: r.designation ?? "",
                          center: r.center ?? "",
                          byDate: {},
                        });
                      }
                      const e = cwMap.get(code)!;
                      if (!e.designation && r.designation) e.designation = r.designation;
                      if (!e.center && r.center) e.center = r.center;
                      e.byDate[dk] = r;
                    }
                    const cwEmps = [...cwMap.values()];
                    // Target days/hours come from the project's working calendar.
                    // Use the selected range for matrix views; the day(s) with
                    // data for the daily view.
                    const cwVt = getViewType(report._id);
                    const targetDates =
                      cwVt !== "daily" && range.dateFrom && range.dateTo
                        ? enumerateDates(range.dateFrom, range.dateTo)
                        : cwDates;
                    const { targetDays, targetHours } = computeTargets(
                      cal,
                      targetDates,
                    );
                    const denom = targetDays > 0 ? targetDays : cwDates.length;
                    const shortD = (iso: string) => {
                      const d = parseLocalDate(iso);
                      return `${d.getDate()} ${d.toLocaleString("en-IN", { month: "short" })}`;
                    };
                    return (
                      <div style={{ borderTop: "1px solid #e5e7eb" }}>
                        {/* header bar */}
                        <div
                          style={{
                            background: "#f8fafc",
                            padding: "8px 16px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#374151",
                          }}
                        >
                          Results — {cwEmps.length} employees · {cwDates.length}{" "}
                          day{cwDates.length !== 1 ? "s" : ""} · Target:{" "}
                          {denom} working day{denom !== 1 ? "s" : ""}
                          {targetHours > 0
                            ? ` · ${targetHours.toFixed(1)} target hrs`
                            : ""}
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table
                            style={{
                              borderCollapse: "collapse",
                              fontSize: 11,
                              minWidth: "100%",
                            }}
                          >
                            <thead>
                              <tr style={{ background: "#6366f1" }}>
                                {[
                                  "S.No",
                                  "Name",
                                  "Employee Code",
                                  "Designation",
                                  "Offline Center",
                                  ...cwDates.flatMap((d) => [
                                    `${shortD(d)} In`,
                                    `${shortD(d)} Out`,
                                    `${shortD(d)} Status`,
                                  ]),
                                  "Target Attendance",
                                  "Actual Attendance",
                                  "Attendance %",
                                  "Total Targeted Hours",
                                ].map((h, ci) => (
                                  <th
                                    key={ci}
                                    style={{
                                      padding: "7px 8px",
                                      textAlign: ci <= 4 ? "left" : "center",
                                      fontWeight: 700,
                                      color: "#fff",
                                      fontSize: 11,
                                      whiteSpace: "nowrap",
                                      borderRight: "1px solid #4f46e5",
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {cwEmps.map((emp, i) => {
                                const baseTd = {
                                  padding: "6px 8px",
                                  textAlign: "center",
                                  fontSize: 11,
                                  whiteSpace: "nowrap",
                                  borderRight: "1px solid #f3f4f6",
                                } as const;
                                const leftTd = {
                                  padding: "6px 8px",
                                  fontSize: 11,
                                  whiteSpace: "nowrap",
                                  borderRight: "1px solid #f3f4f6",
                                  color: "#374151",
                                } as const;
                                let presentDays = 0;
                                let leaveDays = 0;
                                const dateCells = cwDates.flatMap((d) => {
                                  const rec = emp.byDate[d];
                                  const hasIn = !!rec?.punch_in;
                                  const hasOut = !!rec?.punch_out;
                                  const both = hasIn && hasOut;
                                  const isLeave = !!(
                                    rec?.status &&
                                    LEAVE_STATUSES.has(rec.status)
                                  );
                                  // Present = both punches OR incomplete-but-
                                  // within-last-sync (effectivePresent), minus
                                  // leave so Actual = Present + Leave.
                                  const eff = (rec as any)?.effectivePresent;
                                  const present =
                                    (eff !== undefined ? eff === true : both) &&
                                    !isLeave;
                                  if (present) presentDays++;
                                  else if (isLeave) leaveDays++;
                                  return [
                                    <td
                                      key={d + "in"}
                                      style={{
                                        ...baseTd,
                                        color: hasIn ? "#374151" : "#d1d5db",
                                      }}
                                    >
                                      {hasIn ? formatTime(rec!.punch_in) : "—"}
                                    </td>,
                                    <td
                                      key={d + "out"}
                                      style={{
                                        ...baseTd,
                                        color: hasOut ? "#374151" : "#d1d5db",
                                      }}
                                    >
                                      {hasOut ? formatTime(rec!.punch_out) : "—"}
                                    </td>,
                                    <td
                                      key={d + "st"}
                                      style={{
                                        ...baseTd,
                                        fontWeight: 700,
                                        color: present ? "#065f46" : "#ef4444",
                                      }}
                                    >
                                      {present ? "P" : "A"}
                                    </td>,
                                  ];
                                });
                                const actual = presentDays + leaveDays;
                                const pct =
                                  denom > 0
                                    ? ((actual / denom) * 100).toFixed(1) + "%"
                                    : "0%";
                                const bg = i % 2 === 0 ? "#fff" : "#fafafa";
                                return (
                                  <tr
                                    key={emp.code + i}
                                    style={{
                                      background: bg,
                                      borderBottom: "1px solid #f3f4f6",
                                    }}
                                  >
                                    <td style={{ ...baseTd, color: "#6b7280" }}>
                                      {i + 1}
                                    </td>
                                    <td
                                      style={{
                                        ...leftTd,
                                        fontWeight: 600,
                                        color: "#111827",
                                        minWidth: 130,
                                      }}
                                    >
                                      {emp.name || "—"}
                                    </td>
                                    <td style={leftTd}>
                                      {emp.code !== "_" ? emp.code : "—"}
                                    </td>
                                    <td style={leftTd}>
                                      {emp.designation || "—"}
                                    </td>
                                    <td style={leftTd}>{emp.center || "—"}</td>
                                    {dateCells}
                                    <td style={{ ...baseTd, fontWeight: 600 }}>
                                      {denom}
                                    </td>
                                    <td style={{ ...baseTd, fontWeight: 600 }}>
                                      {actual}
                                    </td>
                                    <td
                                      style={{
                                        ...baseTd,
                                        fontWeight: 700,
                                        color:
                                          actual === 0 ? "#ef4444" : "#065f46",
                                      }}
                                    >
                                      {pct}
                                    </td>
                                    <td
                                      style={{
                                        ...baseTd,
                                        fontWeight: 600,
                                        borderRight: "none",
                                      }}
                                    >
                                      {targetHours > 0
                                        ? targetHours.toFixed(1)
                                        : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            {/* Total count footer */}
                            <tfoot>
                              <tr
                                style={{
                                  background: "#f3f4f6",
                                  borderTop: "2px solid #e5e7eb",
                                }}
                              >
                                <td
                                  colSpan={5}
                                  style={{
                                    padding: "6px 8px",
                                    fontWeight: 700,
                                    color: "#374151",
                                    fontSize: 11,
                                    borderRight: "1px solid #e5e7eb",
                                  }}
                                >
                                  Total Count
                                </td>
                                {cwDates.flatMap((d) => {
                                  const inCnt = cwEmps.filter(
                                    (e) => !!e.byDate[d]?.punch_in,
                                  ).length;
                                  const outCnt = cwEmps.filter(
                                    (e) => !!e.byDate[d]?.punch_out,
                                  ).length;
                                  const presentCnt = cwEmps.filter(
                                    (e) =>
                                      !!e.byDate[d]?.punch_in &&
                                      !!e.byDate[d]?.punch_out,
                                  ).length;
                                  const ftd = {
                                    padding: "6px 8px",
                                    textAlign: "center",
                                    fontWeight: 700,
                                    color: "#374151",
                                    fontSize: 11,
                                    borderRight: "1px solid #f3f4f6",
                                  } as const;
                                  return [
                                    <td key={`${d}-in`} style={ftd}>
                                      {inCnt}
                                    </td>,
                                    <td key={`${d}-out`} style={ftd}>
                                      {outCnt}
                                    </td>,
                                    <td key={`${d}-st`} style={ftd}>
                                      {presentCnt}
                                    </td>,
                                  ];
                                })}
                                <td
                                  colSpan={4}
                                  style={{ padding: "6px 8px" }}
                                />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                {rows && rows.length === 0 && (
                  <div
                    style={{
                      borderTop: "1px solid #e5e7eb",
                      padding: "20px",
                      textAlign: "center",
                      color: "#9ca3af",
                      fontSize: 13,
                    }}
                  >
                    No records found for this report's filters.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Main Component
//

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function AttendanceReportPage() {
  const { hasPermission } = usePermissions();
  const canConfig = hasPermission("ATTENDANCE_CONFIG");
  const canExport =
    hasPermission("ATTENDANCE_EXPORT") || hasPermission("ATTENDANCE_CONFIG");
  const userPermKey = getRolePermKey(hasPermission);

  const [activeSection, setActiveSection] = useState<ActiveSection>(
    canConfig ? "report-builder" : "my-reports",
  );

  // shared
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");

  // report name / desc
  const [reportName, setReportName] = useState("");
  const [reportDesc, setReportDesc] = useState("");

  // data points
  const [selectedCols, setSelectedCols] = useState<string[]>(() =>
    DATA_POINTS.map((d) => d.key),
  );
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [allowedFields, setAllowedFields] = useState<string[]>(() =>
    DATA_POINTS.map((d) => d.key),
  );

  // dynamic filters
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [sortField, setSortField] = useState("attendanceDate");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // results
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [previewLimit, setPreviewLimit] = useState(10);

  // field perms
  const [fieldPerms, setFieldPerms] = useState<FieldPermRow[]>([]);
  const [permsSaving, setPermsSaving] = useState(false);
  const [permsMsg, setPermsMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // saved reports
  const [savedReports, setSavedReports] = useState<SavedAttendanceReport[]>([]);
  const [savedReportsLoading, setSavedReportsLoading] = useState(false);
  const [savedSearch, setSavedSearch] = useState("");
  const [savedRunning, setSavedRunning] = useState<string | null>(null);
  const [savedRunResult, setSavedRunResult] = useState<{
    reportId: string;
    rows: AttendanceRecord[];
  } | null>(null);
  const [savedDupId, setSavedDupId] = useState<string | null>(null);
  const [savedDupName, setSavedDupName] = useState("");
  const [savedDupError, setSavedDupError] = useState("");
  const [savedDupSaving, setSavedDupSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  // assign report (accordion, per-report)
  const [assignExpanded, setAssignExpanded] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [allUsers, setAllUsers] = useState<AssignableUser[]>([]);
  const [allRoles, setAllRoles] = useState<AssignableRole[]>([]);
  const [assignSaving, setAssignSaving] = useState<string | null>(null);
  const [assignSaveMsg, setAssignSaveMsg] = useState<
    Record<string, { type: "success" | "error"; text: string }>
  >({});
  const [assignDataLoaded, setAssignDataLoaded] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState<string | null>(null);
  const [ccEmailDraft, setCcEmailDraft] = useState<Record<string, string>>({});
  const [testingAlert, setTestingAlert] = useState<string | null>(null);
  const [testAlertMsg, setTestAlertMsg] = useState<Record<string, string>>({});

  const token = localStorage.getItem("authToken");
  const headers = { Authorization: `Bearer ${token}` };

  // Load projects
  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/projects?limit=100`, { headers })
      .then((r) => {
        const d = r.data?.data;
        setProjects(Array.isArray(d) ? d : (d?.projects ?? []));
      })
      .catch(() => {});
  }, []);

  // Load config when project changes
  const loadConfig = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await axios.get(
        `${API_BASE_URL}/attendance/config?projectId=${projectId}`,
        { headers },
      );
      const fp: Record<
        string,
        { admin: boolean; manager: boolean; hr: boolean; employee: boolean }
      > = r.data?.fieldPermissions ?? {};

      const rows: FieldPermRow[] = DATA_POINTS.filter((d) => d.permKey).map(
        (d) => ({
          key: d.permKey!,
          label: d.label,
          admin: fp[d.permKey!]?.admin ?? true,
          manager: fp[d.permKey!]?.manager ?? false,
          hr: fp[d.permKey!]?.hr ?? true,
          employee: fp[d.permKey!]?.employee ?? false,
        }),
      );
      setFieldPerms(rows);

      const allowed = DATA_POINTS.filter((d) => {
        if (d.always) return true;
        if (!d.permKey) return true;
        const perm = fp[d.permKey];
        if (!perm) return userPermKey === "admin";
        return perm[userPermKey];
      }).map((d) => d.key);
      setAllowedFields(allowed);
      setSelectedCols((prev) => prev.filter((c) => allowed.includes(c)));
    } catch {
      setFieldPerms([]);
    }
  }, [projectId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Build API query params from filter rows
  function buildParams(limit: number) {
    const params = new URLSearchParams({
      projectId,
      page: "1",
      limit: String(limit),
      sort: sortField,
      order: sortOrder,
    });
    for (const row of filterRows) {
      if (!row.field) continue;
      if (row.operator === "is_empty" || row.operator === "is_not_empty")
        continue;
      if (!row.value) continue;
      switch (row.field) {
        case "attendanceDate":
          if (row.operator === "equals") {
            params.set("dateFrom", row.value);
            params.set("dateTo", row.value);
          } else if (row.operator === "after")
            params.set("dateFrom", row.value);
          else if (row.operator === "before") params.set("dateTo", row.value);
          break;
        case "status":
          params.set("status", row.value);
          break;
        case "center":
          params.set("center", row.value);
          break;
        case "employee_id":
          params.set("employeeCode", row.value);
          break;
        default:
          params.set(row.field, row.value);
      }
    }
    return params;
  }

  const runReport = useCallback(
    async (limit = previewLimit) => {
      if (!projectId) return;
      setLoading(true);
      setHasRun(true);
      try {
        const r = await axios.get(
          `${API_BASE_URL}/attendance/records?${buildParams(limit)}`,
          { headers },
        );
        setRecords(r.data?.data ?? []);
        setTotalCount(r.data?.meta?.total ?? 0);
      } catch {
        setRecords([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    [projectId, filterRows, sortField, sortOrder, previewLimit],
  );

  const exportCsv = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await axios.get(
        `${API_BASE_URL}/attendance/records?${buildParams(10000)}`,
        { headers },
      );
      const allRecs: AttendanceRecord[] = r.data?.data ?? [];
      const visibleFields = DATA_POINTS.filter((d) =>
        selectedCols.includes(d.key),
      );
      const headerRow = visibleFields.map((d) => d.label).join(",");
      const rows = allRecs.map((rec) =>
        visibleFields
          .map((d) => `"${renderCellValue(d.key, rec).replace(/"/g, '""')}"`)
          .join(","),
      );
      const csv = [headerRow, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_report_${projectId}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  const saveFieldPerms = async () => {
    if (!projectId || !canConfig) return;
    setPermsSaving(true);
    setPermsMsg(null);
    try {
      const fieldPermissions: Record<string, Record<string, boolean>> = {};
      for (const row of fieldPerms) {
        fieldPermissions[row.key] = {
          admin: row.admin,
          manager: row.manager,
          hr: row.hr,
          employee: row.employee,
        };
      }
      await axios.put(
        `${API_BASE_URL}/attendance/config`,
        { projectId, fieldPermissions },
        { headers },
      );
      setPermsMsg({ type: "success", text: "Field permissions saved." });
      loadConfig();
    } catch {
      setPermsMsg({ type: "error", text: "Failed to save field permissions." });
    } finally {
      setPermsSaving(false);
    }
  };

  // ── Saved reports helpers ────────────────────────────────────────────────

  const loadSavedReports = useCallback(async () => {
    setSavedReportsLoading(true);
    try {
      const r = await axios.get(`${API_BASE_URL}/attendance/reports/saved`, {
        headers,
      });
      setSavedReports(r.data?.data ?? []);
    } catch {
      setSavedReports([]);
    } finally {
      setSavedReportsLoading(false);
    }
  }, []);

  const handleSaveReport = async () => {
    if (!reportName.trim()) {
      setSaveMsg({ type: "error", text: "Please enter a report name first." });
      return;
    }
    if (!projectId) {
      setSaveMsg({ type: "error", text: "Please select a project first." });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload: Record<string, unknown> = {
        name: reportName.trim(),
        description: reportDesc,
        projectId,
        dataPoints: selectedCols,
        filters: filterRows.map((r) => ({
          field: r.field,
          operator: r.operator,
          value: r.value,
        })),
        sortBy: sortField,
        sortOrder,
      };
      if (editingReportId) payload["_id"] = editingReportId;
      const r = await axios.post(
        `${API_BASE_URL}/attendance/reports/saved`,
        payload,
        { headers },
      );
      setEditingReportId(r.data.data._id);
      setSaveMsg({ type: "success", text: "Report saved!" });
      loadSavedReports();
    } catch {
      setSaveMsg({ type: "error", text: "Failed to save report." });
    } finally {
      setSaving(false);
    }
  };

  // dp key→label map for saved reports table
  const dpMap = Object.fromEntries(DATA_POINTS.map((d) => [d.key, d.label]));

  const buildParamsForSaved = (
    report: SavedAttendanceReport,
  ): URLSearchParams => {
    const params = new URLSearchParams({
      projectId: report.projectId ?? "",
      page: "1",
      limit: "10000",
      sort: report.sortBy ?? "attendanceDate",
      order: report.sortOrder ?? "desc",
    });
    for (const f of report.filters) {
      if (!f.field || !f.value) continue;
      switch (f.field) {
        case "attendanceDate":
          if (f.operator === "equals") {
            params.set("dateFrom", f.value);
            params.set("dateTo", f.value);
          } else if (f.operator === "after") params.set("dateFrom", f.value);
          else if (f.operator === "before") params.set("dateTo", f.value);
          break;
        case "status":
          params.set("status", f.value);
          break;
        case "center":
          params.set("center", f.value);
          break;
        case "employee_id":
          params.set("employeeCode", f.value);
          break;
        default:
          params.set(f.field, f.value);
      }
    }
    return params;
  };

  const handleRunSavedReport = async (report: SavedAttendanceReport) => {
    if (!report.projectId) return;
    setSavedRunning(report._id);
    try {
      const r = await axios.get(
        `${API_BASE_URL}/attendance/records?${buildParamsForSaved(report)}`,
        { headers },
      );
      const rows: AttendanceRecord[] = r.data?.data ?? [];
      setSavedRunResult({ reportId: report._id, rows });
      // update rowCount and lastRunAt in savedReports list
      setSavedReports((prev) =>
        prev.map((rp) =>
          rp._id === report._id
            ? {
                ...rp,
                rowCount: rows.length,
                lastRunAt: new Date().toISOString(),
              }
            : rp,
        ),
      );
    } catch {
      /* silent */
    } finally {
      setSavedRunning(null);
    }
  };

  const handleExportSavedReport = (report: SavedAttendanceReport) => {
    const rows =
      savedRunResult?.reportId === report._id ? savedRunResult.rows : null;
    if (!rows) {
      alert("Please run the report first before exporting.");
      return;
    }
    const visibleFields = DATA_POINTS.filter((d) =>
      report.dataPoints.includes(d.key),
    );
    const headerRow = visibleFields.map((d) => d.label).join(",");
    const csvRows = rows.map((rec) =>
      visibleFields
        .map((d) => `"${renderCellValue(d.key, rec).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[headerRow, ...csvRows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.name.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDuplicateSavedReport = async () => {
    const trimmed = savedDupName.trim();
    if (!trimmed) {
      setSavedDupError("Name is required.");
      return;
    }
    if (
      savedReports.some((r) => r.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      setSavedDupError("A report with this name already exists.");
      return;
    }
    const source = savedReports.find((r) => r._id === savedDupId);
    if (!source) return;
    setSavedDupSaving(true);
    setSavedDupError("");
    try {
      await axios.post(
        `${API_BASE_URL}/attendance/reports/saved`,
        {
          name: trimmed,
          description: source.description,
          projectId: source.projectId,
          dataPoints: source.dataPoints,
          filters: source.filters,
          sortBy: source.sortBy,
          sortOrder: source.sortOrder,
        },
        { headers },
      );
      setSavedDupId(null);
      loadSavedReports();
    } catch {
      setSavedDupError("Duplicate failed. Please try again.");
    } finally {
      setSavedDupSaving(false);
    }
  };

  const loadReportIntoBuilder = (r: SavedAttendanceReport) => {
    setReportName(r.name);
    setReportDesc(r.description);
    if (r.projectId && r.projectId !== projectId) setProjectId(r.projectId);
    setSelectedCols(r.dataPoints);
    if (r.sortBy) setSortField(r.sortBy);
    setSortOrder(r.sortOrder);
    setFilterRows(
      r.filters.map((f) => ({
        id: makeId(),
        field: f.field,
        operator: f.operator as FilterOperator,
        value: f.value ?? "",
      })),
    );
    setEditingReportId(r._id);
    setActiveSection("report-builder");
  };

  const handleDeleteSavedReport = async (id: string) => {
    if (!window.confirm("Delete this saved report?")) return;
    try {
      await axios.delete(`${API_BASE_URL}/attendance/reports/saved/${id}`, {
        headers,
      });
      if (editingReportId === id) setEditingReportId(null);
      if (assignExpanded === id) setAssignExpanded(null);
      loadSavedReports();
    } catch {
      /* silent */
    }
  };

  // ── Assign report helpers ────────────────────────────────────────────────

  const loadAssignSectionData = useCallback(async () => {
    if (assignDataLoaded) return;
    try {
      const [reportsRes, usersRes, rolesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/attendance/reports/saved`, { headers }),
        axios.get(`${API_BASE_URL}/users?limit=500`, { headers }),
        axios.get(`${API_BASE_URL}/roles`, { headers }),
      ]);
      // Merge saved reports
      const reps: SavedAttendanceReport[] = reportsRes.data?.data ?? [];
      setSavedReports(reps);
      setAllUsers(usersRes.data?.data?.users ?? usersRes.data?.data ?? []);
      setAllRoles(rolesRes.data?.data ?? []);
      // Load assignments for each report
      const assignEntries = await Promise.all(
        reps.map((r) =>
          axios
            .get(
              `${API_BASE_URL}/attendance/reports/saved/${r._id}/assignment`,
              { headers },
            )
            .then((res) => [r._id, res.data?.data] as [string, any])
            .catch(() => [r._id, null] as [string, null]),
        ),
      );
      const map: Record<string, any> = {};
      for (const [id, a] of assignEntries) {
        map[id] = {
          assignedToUsers: (a?.assignedToUsers ?? []).map(
            (u: any) => u._id ?? u,
          ),
          assignedToRoles: (a?.assignedToRoles ?? []).map(
            (r: any) => r._id ?? r,
          ),
          alertEnabled: a?.alertEnabled ?? false,
          scheduleType: a?.scheduleType ?? "daily",
          scheduleDay: a?.scheduleDay ?? 1,
          scheduleTime: a?.scheduleTime ?? "08:00",
          ccUsers: (a?.ccUsers ?? []).map((u: any) => u._id ?? u),
          ccEmails: a?.ccEmails ?? [],
        };
      }
      setAssignments(map);
      setAssignDataLoaded(true);
    } catch {
      /* silent */
    }
  }, [assignDataLoaded]);

  const toggleAssignUser = (reportId: string, userId: string) => {
    setAssignments((prev) => {
      const cur = prev[reportId] ?? {
        assignedToUsers: [],
        assignedToRoles: [],
      };
      const next = cur.assignedToUsers.includes(userId)
        ? (cur.assignedToUsers as string[]).filter((id) => id !== userId)
        : [...cur.assignedToUsers, userId];
      return { ...prev, [reportId]: { ...cur, assignedToUsers: next } };
    });
  };

  const toggleAssignRole = (reportId: string, roleId: string) => {
    setAssignments((prev) => {
      const cur = prev[reportId] ?? {
        assignedToUsers: [],
        assignedToRoles: [],
      };
      const next = cur.assignedToRoles.includes(roleId)
        ? (cur.assignedToRoles as string[]).filter((id) => id !== roleId)
        : [...cur.assignedToRoles, roleId];
      return { ...prev, [reportId]: { ...cur, assignedToRoles: next } };
    });
  };

  const updateScheduleField = (reportId: string, field: string, value: any) => {
    setAssignments((prev) => ({
      ...prev,
      [reportId]: { ...(prev[reportId] ?? {}), [field]: value },
    }));
  };

  const handleTestAlert = async (reportId: string) => {
    setTestingAlert(reportId);
    setTestAlertMsg((prev) => {
      const n = { ...prev };
      delete n[reportId];
      return n;
    });
    try {
      const res = await axios.post(
        `${API_BASE_URL}/attendance/reports/saved/${reportId}/test-alert`,
        {},
        { headers },
      );
      setTestAlertMsg((prev) => ({
        ...prev,
        [reportId]: res.data?.success
          ? "✅ Test email sent!"
          : `❌ ${res.data?.message}`,
      }));
    } catch (err: any) {
      setTestAlertMsg((prev) => ({
        ...prev,
        [reportId]: `❌ ${err?.response?.data?.message ?? "Request failed"}`,
      }));
    } finally {
      setTestingAlert(null);
    }
  };

  const handleSaveAssignment = async (reportId: string) => {
    const asg = assignments[reportId] ?? {};
    setAssignSaving(reportId);
    setAssignSaveMsg((prev) => {
      const next = { ...prev };
      delete next[reportId];
      return next;
    });
    try {
      await axios.put(
        `${API_BASE_URL}/attendance/reports/saved/${reportId}/assignment`,
        {
          assignedToUsers: asg.assignedToUsers ?? [],
          assignedToRoles: asg.assignedToRoles ?? [],
          alertEnabled: asg.alertEnabled ?? false,
          scheduleType: asg.scheduleType ?? "daily",
          scheduleDay: asg.scheduleDay ?? 1,
          scheduleTime: asg.scheduleTime ?? "08:00",
          ccUsers: asg.ccUsers ?? [],
          ccEmails: asg.ccEmails ?? [],
        },
        { headers },
      );
      // Reload this report's assignment from server to confirm saved state
      const freshAsg = await axios
        .get(
          `${API_BASE_URL}/attendance/reports/saved/${reportId}/assignment`,
          { headers },
        )
        .then((r) => r.data?.data)
        .catch(() => null);
      setAssignments((prev) => ({
        ...prev,
        [reportId]: {
          assignedToUsers: (freshAsg?.assignedToUsers ?? []).map(
            (u: any) => u._id ?? u,
          ),
          assignedToRoles: (freshAsg?.assignedToRoles ?? []).map(
            (r: any) => r._id ?? r,
          ),
          alertEnabled: freshAsg?.alertEnabled ?? false,
          scheduleType: freshAsg?.scheduleType ?? "daily",
          scheduleDay: freshAsg?.scheduleDay ?? 1,
          scheduleTime: freshAsg?.scheduleTime ?? "08:00",
          ccUsers: (freshAsg?.ccUsers ?? []).map((u: any) => u._id ?? u),
          ccEmails: freshAsg?.ccEmails ?? [],
        },
      }));
      setAssignSaveMsg((prev) => ({
        ...prev,
        [reportId]: { type: "success", text: "Assignment saved successfully!" },
      }));
      loadSavedReports();
    } catch {
      setAssignSaveMsg((prev) => ({
        ...prev,
        [reportId]: {
          type: "error",
          text: "Failed to save assignment. Please try again.",
        },
      }));
    } finally {
      setAssignSaving(null);
    }
  };

  const addFilter = () =>
    setFilterRows((p) => [
      ...p,
      {
        id: makeId(),
        field: FILTER_FIELDS[0].key,
        operator: "equals",
        value: "",
      },
    ]);
  const removeFilter = (id: string) =>
    setFilterRows((p) => p.filter((r) => r.id !== id));
  const updateFilter = (id: string, patch: Partial<FilterRow>) =>
    setFilterRows((p) =>
      p.map((r) => {
        if (r.id !== id) return r;
        const u = { ...r, ...patch };
        if (patch.field) {
          u.operator = getOperatorsForField(patch.field)[0].value;
          u.value = "";
        }
        return u;
      }),
    );

  const toggleCol = (key: string) =>
    setSelectedCols((p) =>
      p.includes(key) ? p.filter((k) => k !== key) : [...p, key],
    );
  const togglePerm = (rowKey: string, role: PermRole) =>
    setFieldPerms((p) =>
      p.map((r) => (r.key === rowKey ? { ...r, [role]: !r[role] } : r)),
    );

  // Displayed data points (filtered by category + permission)
  const visibleDataPoints = DATA_POINTS.filter(
    (d) =>
      allowedFields.includes(d.key) &&
      (categoryFilter === "all" || d.category === categoryFilter),
  );
  const groupedDataPoints = visibleDataPoints.reduce<
    Record<string, DataPoint[]>
  >((acc, dp) => {
    (acc[dp.category] ??= []).push(dp);
    return acc;
  }, {});

  const selectedCount = selectedCols.filter((c) =>
    allowedFields.includes(c),
  ).length;

  //
  return (
    <div style={{ padding: 24 }}>
      <ModuleHeader
        title="Attendance Report"
        subtitle="Build customisable attendance reports with data-point selection, filters and export"
      />

      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 20,
          alignItems: "flex-start",
        }}
      >
        {/*  Left Sidebar Nav  */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 8,
            position: "sticky",
            top: 20,
          }}
        >
          <div
            style={{
              padding: "6px 12px 4px",
              fontSize: 10,
              fontWeight: 700,
              color: "#9ca3af",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Report Module
          </div>
          <NavItem
            icon={<MdBookmark />}
            label="My Reports"
            active={activeSection === "my-reports"}
            onClick={() => setActiveSection("my-reports")}
          />
          {canConfig && (
            <NavItem
              icon={<MdBarChart />}
              label="Report Builder"
              active={activeSection === "report-builder"}
              onClick={() => setActiveSection("report-builder")}
            />
          )}
          {canConfig && (
            <NavItem
              icon={<MdSave />}
              label="Saved Reports"
              active={activeSection === "saved-reports"}
              onClick={() => {
                loadSavedReports();
                setActiveSection("saved-reports");
              }}
            />
          )}
          {canConfig && (
            <NavItem
              icon={<MdPeople />}
              label="Assign Report"
              active={activeSection === "assign-report"}
              onClick={() => {
                loadSavedReports();
                setActiveSection("assign-report");
              }}
            />
          )}
          {canConfig && (
            <NavItem
              icon={<MdLock />}
              label="Field Permissions"
              active={activeSection === "field-permissions"}
              onClick={() => setActiveSection("field-permissions")}
            />
          )}
        </div>

        {/*  Main Content  */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/*  MY REPORTS  */}
          {activeSection === "my-reports" && (
            <MyAttendanceReports token={token ?? ""} />
          )}

          {/*  REPORT BUILDER  */}
          {activeSection === "report-builder" && (
            <div>
              {/* Header card — name, description, project */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 24,
                  marginBottom: 16,
                }}
              >
                <h2
                  style={{
                    margin: "0 0 4px",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  Report Builder
                </h2>
                <p
                  style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280" }}
                >
                  Select data points, add filters, name your report and save.
                </p>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {/* Report Name */}
                  <div style={{ flex: "1 1 220px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: 5,
                      }}
                    >
                      Report Name <span style={{ color: "#EF4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Monthly Attendance Summary"
                      value={reportName}
                      onChange={(e) => setReportName(e.target.value)}
                      style={{
                        width: "100%",
                        border: "1px solid #D1D5DB",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  {/* Description */}
                  <div style={{ flex: "1 1 220px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: 5,
                      }}
                    >
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="Optional description..."
                      value={reportDesc}
                      onChange={(e) => setReportDesc(e.target.value)}
                      style={{
                        width: "100%",
                        border: "1px solid #D1D5DB",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  {/* Project */}
                  <div style={{ flex: "0 0 200px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: 5,
                      }}
                    >
                      Project <span style={{ color: "#EF4444" }}>*</span>
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => {
                        setProjectId(e.target.value);
                        setHasRun(false);
                        setRecords([]);
                      }}
                      style={{
                        width: "100%",
                        border: "1px solid #D1D5DB",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 13,
                        outline: "none",
                        background: "#fff",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="">— Select project —</option>
                      {projects.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Two-panel builder: Data Points (left) + Filters (right) */}
              <div
                style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
              >
                {/*  LEFT: Data Points  */}
                <div
                  style={{
                    width: 260,
                    flexShrink: 0,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {/* Panel header */}
                  <div
                    style={{
                      padding: "14px 16px 10px",
                      borderBottom: "1px solid #F3F4F6",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#111827",
                        }}
                      >
                        Data Points
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#4F46E5",
                          background: "#EEF2FF",
                          borderRadius: 12,
                          padding: "2px 8px",
                        }}
                      >
                        {selectedCount} selected
                      </span>
                    </div>
                    {/* Category chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilter(cat)}
                          style={{
                            padding: "3px 10px",
                            borderRadius: 20,
                            border: "none",
                            fontSize: 11,
                            fontWeight: categoryFilter === cat ? 600 : 400,
                            cursor: "pointer",
                            background:
                              categoryFilter === cat ? "#4F46E5" : "#F3F4F6",
                            color: categoryFilter === cat ? "#fff" : "#6B7280",
                            transition: "all 0.15s",
                          }}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grouped checkboxes */}
                  <div
                    style={{
                      padding: "8px 0",
                      maxHeight: 420,
                      overflowY: "auto",
                    }}
                  >
                    {Object.entries(groupedDataPoints).map(
                      ([category, points]) => (
                        <div key={category}>
                          <div
                            style={{
                              padding: "6px 16px 3px",
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#7C3AED",
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            {category}
                          </div>
                          {points.map((dp) => {
                            const checked = selectedCols.includes(dp.key);
                            return (
                              <label
                                key={dp.key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "6px 16px",
                                  cursor: dp.always ? "default" : "pointer",
                                  fontSize: 13,
                                  color: "#374151",
                                  userSelect: "none",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!!dp.always}
                                  onChange={() =>
                                    !dp.always && toggleCol(dp.key)
                                  }
                                  style={{
                                    accentColor: "#4F46E5",
                                    width: 14,
                                    height: 14,
                                    flexShrink: 0,
                                  }}
                                />
                                {dp.label}
                                {dp.always && (
                                  <span
                                    style={{
                                      fontSize: 9,
                                      background: "#9CA3AF",
                                      color: "#fff",
                                      borderRadius: 4,
                                      padding: "1px 5px",
                                      marginLeft: "auto",
                                    }}
                                  >
                                    always
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      ),
                    )}
                    {Object.keys(groupedDataPoints).length === 0 && (
                      <p
                        style={{
                          padding: "16px",
                          fontSize: 12,
                          color: "#9CA3AF",
                          textAlign: "center",
                        }}
                      >
                        No data points in this category
                      </p>
                    )}
                  </div>
                </div>

                {/*  RIGHT: Filters  */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 20,
                      marginBottom: 14,
                    }}
                  >
                    {/* Filters header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 14,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#111827",
                        }}
                      >
                        Filters
                      </span>
                      <button
                        onClick={addFilter}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: "none",
                          background: "#4F46E5",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <MdAdd style={{ fontSize: 15 }} /> Add Filter
                      </button>
                    </div>

                    {filterRows.length === 0 ? (
                      <p
                        style={{
                          fontSize: 13,
                          color: "#9CA3AF",
                          padding: "8px 0",
                        }}
                      >
                        No filters added. Click "+ Add Filter" to narrow
                        results.
                      </p>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {filterRows.map((row) => {
                          const fd = FILTER_FIELDS.find(
                            (f) => f.key === row.field,
                          )!;
                          const operators = getOperatorsForField(row.field);
                          const needsValue =
                            row.operator !== "is_empty" &&
                            row.operator !== "is_not_empty";
                          return (
                            <div
                              key={row.id}
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              {/* Field */}
                              <select
                                value={row.field}
                                onChange={(e) =>
                                  updateFilter(row.id, {
                                    field: e.target.value,
                                  })
                                }
                                style={selectStyle}
                              >
                                {FILTER_FIELDS.map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                              {/* Operator */}
                              <select
                                value={row.operator}
                                onChange={(e) =>
                                  updateFilter(row.id, {
                                    operator: e.target.value as FilterOperator,
                                  })
                                }
                                style={selectStyle}
                              >
                                {operators.map((op) => (
                                  <option key={op.value} value={op.value}>
                                    {op.label}
                                  </option>
                                ))}
                              </select>
                              {/* Value */}
                              {needsValue &&
                                (fd?.type === "select" ||
                                fd?.type === "boolean" ? (
                                  <select
                                    value={row.value}
                                    onChange={(e) =>
                                      updateFilter(row.id, {
                                        value: e.target.value,
                                      })
                                    }
                                    style={selectStyle}
                                  >
                                    <option value="">Select</option>
                                    {fd.options?.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {o.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : fd?.type === "date" ? (
                                  <input
                                    type="date"
                                    value={row.value}
                                    onChange={(e) =>
                                      updateFilter(row.id, {
                                        value: e.target.value,
                                      })
                                    }
                                    style={inputStyle}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    placeholder="Value"
                                    value={row.value}
                                    onChange={(e) =>
                                      updateFilter(row.id, {
                                        value: e.target.value,
                                      })
                                    }
                                    style={{ ...inputStyle, minWidth: 140 }}
                                  />
                                ))}
                              {/* Delete */}
                              <button
                                onClick={() => removeFilter(row.id)}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  border: "none",
                                  background: "#FEE2E2",
                                  color: "#EF4444",
                                  fontSize: 16,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <MdClose />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Sort row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginTop: 16,
                        paddingTop: 14,
                        borderTop: "1px solid #F3F4F6",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#374151",
                          flexShrink: 0,
                        }}
                      >
                        Sort by:
                      </span>
                      <select
                        value={sortField}
                        onChange={(e) => setSortField(e.target.value)}
                        style={selectStyle}
                      >
                        {FILTER_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={sortOrder}
                        onChange={(e) =>
                          setSortOrder(e.target.value as "asc" | "desc")
                        }
                        style={selectStyle}
                      >
                        <option value="desc">Newest first</option>
                        <option value="asc">Oldest first</option>
                      </select>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    {saveMsg && (
                      <span
                        style={{
                          fontSize: 12,
                          color:
                            saveMsg.type === "success" ? "#059669" : "#DC2626",
                        }}
                      >
                        {saveMsg.text}
                      </span>
                    )}
                    <button
                      onClick={handleSaveReport}
                      disabled={!projectId || !reportName.trim() || saving}
                      title="Save report config for reuse"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "9px 18px",
                        borderRadius: 8,
                        border: "none",
                        background:
                          !projectId || !reportName.trim() || saving
                            ? "#D1D5DB"
                            : "#7C3AED",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor:
                          !projectId || !reportName.trim() || saving
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      <MdBookmark style={{ fontSize: 16 }} />
                      {saving
                        ? "Saving…"
                        : editingReportId
                          ? "Update Report"
                          : "Save Report"}
                    </button>
                    <button
                      onClick={() => {
                        setPreviewLimit(10);
                        runReport(10);
                      }}
                      disabled={!projectId || loading}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "9px 18px",
                        borderRadius: 8,
                        border: "none",
                        background:
                          !projectId || loading ? "#C7D2FE" : "#4F46E5",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor:
                          !projectId || loading ? "not-allowed" : "pointer",
                      }}
                    >
                      <MdPlayArrow style={{ fontSize: 16 }} />
                      Preview (10 rows)
                    </button>
                    {canExport && (
                      <button
                        onClick={exportCsv}
                        disabled={!projectId || loading}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "9px 18px",
                          borderRadius: 8,
                          border: "none",
                          background:
                            !projectId || loading ? "#A7F3D0" : "#059669",
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor:
                            !projectId || loading ? "not-allowed" : "pointer",
                        }}
                      >
                        <MdSave style={{ fontSize: 16 }} />
                        Export CSV
                      </button>
                    )}
                  </div>

                  {/*  Results Table  */}
                  {hasRun && (
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        marginTop: 16,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "14px 20px",
                          borderBottom: "1px solid #F3F4F6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#111827",
                          }}
                        >
                          Results
                        </span>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>
                          {loading
                            ? "Loading"
                            : `Showing ${records.length} of ${totalCount} records`}
                        </span>
                      </div>

                      {loading ? (
                        <div
                          style={{
                            padding: 40,
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: 13,
                          }}
                        >
                          Loading
                        </div>
                      ) : records.length === 0 ? (
                        <div
                          style={{
                            padding: 40,
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: 13,
                          }}
                        >
                          No records found for the selected filters.
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: 13,
                            }}
                          >
                            <thead>
                              <tr style={{ background: "#F9FAFB" }}>
                                {DATA_POINTS.filter((d) =>
                                  selectedCols.includes(d.key),
                                ).map((d) => (
                                  <th key={d.key} style={thStyle}>
                                    {d.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {records.map((rec, idx) => (
                                <tr
                                  key={rec._id}
                                  style={{
                                    background:
                                      idx % 2 === 0 ? "#fff" : "#FAFAFA",
                                  }}
                                >
                                  {DATA_POINTS.filter((d) =>
                                    selectedCols.includes(d.key),
                                  ).map((d) => (
                                    <td key={d.key} style={tdStyle}>
                                      {d.key === "status" && rec.status ? (
                                        <span
                                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[rec.status] ?? "bg-gray-100 text-gray-700"}`}
                                        >
                                          {rec.status} —{" "}
                                          {STATUS_LABELS[rec.status] ??
                                            rec.status}
                                        </span>
                                      ) : (
                                        renderCellValue(d.key, rec)
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Load more */}
                      {!loading &&
                        records.length > 0 &&
                        records.length < totalCount && (
                          <div
                            style={{
                              padding: "12px 20px",
                              borderTop: "1px solid #F3F4F6",
                              textAlign: "center",
                            }}
                          >
                            <button
                              onClick={() => {
                                const n = previewLimit + 50;
                                setPreviewLimit(n);
                                runReport(n);
                              }}
                              style={{
                                padding: "7px 20px",
                                borderRadius: 8,
                                border: "1px solid #D1D5DB",
                                background: "#fff",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#374151",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <MdDownload style={{ fontSize: 14 }} />
                              Load more ({totalCount - records.length}{" "}
                              remaining)
                            </button>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/*  SAVED REPORTS  */}
          {activeSection === "saved-reports" && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 24,
              }}
            >
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    Saved Reports
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "#6B7280",
                    }}
                  >
                    {savedReports.length} report
                    {savedReports.length !== 1 ? "s" : ""} saved
                  </p>
                </div>
                <input
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                  placeholder="Search reports…"
                  style={{
                    padding: "7px 12px",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    fontSize: 13,
                    width: 210,
                    outline: "none",
                  }}
                />
              </div>

              {savedReportsLoading ? (
                <p style={{ color: "#9CA3AF", fontSize: 13 }}>Loading…</p>
              ) : savedReports.filter((r) =>
                  r.name.toLowerCase().includes(savedSearch.toLowerCase()),
                ).length === 0 ? (
                <p style={{ color: "#9CA3AF", fontSize: 13 }}>
                  {savedSearch
                    ? "No reports match your search."
                    : 'No saved reports yet. Build a report, enter a name, and click "Save Report".'}
                </p>
              ) : (
                <>
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      overflow: "hidden",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: "#f8fafc",
                            borderBottom: "2px solid #e5e7eb",
                          }}
                        >
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 16px",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Report Name
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Data Points
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Filters
                          </th>
                          <th
                            style={{
                              textAlign: "center",
                              padding: "10px 12px",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Assigned
                          </th>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Last Run
                          </th>
                          <th
                            style={{
                              textAlign: "center",
                              padding: "10px 12px",
                              fontWeight: 600,
                              color: "#374151",
                            }}
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedReports
                          .filter((r) =>
                            r.name
                              .toLowerCase()
                              .includes(savedSearch.toLowerCase()),
                          )
                          .map((r, i) => (
                            <tr
                              key={r._id}
                              style={{
                                background:
                                  editingReportId === r._id
                                    ? "#eff6ff"
                                    : i % 2 === 0
                                      ? "#fff"
                                      : "#f9fafb",
                                borderBottom: "1px solid #f3f4f6",
                              }}
                            >
                              {/* Report Name */}
                              <td style={{ padding: "10px 16px" }}>
                                <div
                                  style={{ fontWeight: 600, color: "#111827" }}
                                >
                                  {r.name}
                                </div>
                                {r.description && (
                                  <div
                                    style={{ fontSize: 11, color: "#9ca3af" }}
                                  >
                                    {r.description}
                                  </div>
                                )}
                                {r.rowCount !== undefined && (
                                  <div
                                    style={{ fontSize: 11, color: "#6b7280" }}
                                  >
                                    {r.rowCount.toLocaleString()} rows
                                  </div>
                                )}
                              </td>
                              {/* Data Points */}
                              <td style={{ padding: "10px 12px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 4,
                                  }}
                                >
                                  {r.dataPoints.slice(0, 4).map((k) => (
                                    <span
                                      key={k}
                                      style={{
                                        fontSize: 10,
                                        background: "#eff6ff",
                                        color: "#1d4ed8",
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                      }}
                                    >
                                      {dpMap[k] ?? k}
                                    </span>
                                  ))}
                                  {r.dataPoints.length > 4 && (
                                    <span
                                      style={{
                                        fontSize: 10,
                                        color: "#6b7280",
                                      }}
                                    >
                                      +{r.dataPoints.length - 4}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Filters */}
                              <td
                                style={{
                                  padding: "10px 12px",
                                  color: "#6b7280",
                                  fontSize: 12,
                                }}
                              >
                                {r.filters.length > 0
                                  ? `${r.filters.length} filter${
                                      r.filters.length > 1 ? "s" : ""
                                    }`
                                  : "None"}
                              </td>
                              {/* Assigned */}
                              <td
                                style={{
                                  padding: "10px 12px",
                                  textAlign: "center",
                                }}
                              >
                                <span
                                  style={{ fontSize: 12, color: "#6b7280" }}
                                >
                                  {(r.assignedUsersCount ?? 0) +
                                    (r.assignedRolesCount ?? 0) >
                                  0
                                    ? `${r.assignedUsersCount}U · ${r.assignedRolesCount}R`
                                    : "—"}
                                </span>
                              </td>
                              {/* Last Run */}
                              <td
                                style={{
                                  padding: "10px 12px",
                                  fontSize: 11,
                                  color: "#6b7280",
                                }}
                              >
                                {r.lastRunAt
                                  ? new Date(r.lastRunAt).toLocaleDateString()
                                  : "—"}
                              </td>
                              {/* Actions */}
                              <td
                                style={{
                                  padding: "8px 12px",
                                  textAlign: "center",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    justifyContent: "center",
                                  }}
                                >
                                  <button
                                    onClick={() => handleRunSavedReport(r)}
                                    disabled={
                                      savedRunning === r._id || !r.projectId
                                    }
                                    title={
                                      !r.projectId
                                        ? "No project set"
                                        : "Run report"
                                    }
                                    style={{
                                      padding: "4px 10px",
                                      background: "#3b82f6",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 6,
                                      fontSize: 11,
                                      cursor: r.projectId
                                        ? "pointer"
                                        : "not-allowed",
                                      fontWeight: 600,
                                      opacity: r.projectId ? 1 : 0.5,
                                    }}
                                  >
                                    {savedRunning === r._id ? "…" : "▶ Run"}
                                  </button>
                                  <button
                                    onClick={() => loadReportIntoBuilder(r)}
                                    style={{
                                      padding: "4px 10px",
                                      background: "#fef3c7",
                                      color: "#d97706",
                                      border: "none",
                                      borderRadius: 6,
                                      fontSize: 11,
                                      cursor: "pointer",
                                      fontWeight: 600,
                                    }}
                                  >
                                    ✎ Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSavedDupId(r._id);
                                      setSavedDupName(`${r.name} (Copy)`);
                                      setSavedDupError("");
                                    }}
                                    style={{
                                      padding: "4px 10px",
                                      background: "#ede9fe",
                                      color: "#7c3aed",
                                      border: "none",
                                      borderRadius: 6,
                                      fontSize: 11,
                                      cursor: "pointer",
                                      fontWeight: 600,
                                    }}
                                    title="Duplicate this report"
                                  >
                                    ⎘ Copy
                                  </button>
                                  <button
                                    onClick={() => handleExportSavedReport(r)}
                                    style={{
                                      padding: "4px 10px",
                                      background: "#10b981",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 6,
                                      fontSize: 11,
                                      cursor: "pointer",
                                      fontWeight: 600,
                                    }}
                                    title="Export to CSV (run first)"
                                  >
                                    ↓ CSV
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteSavedReport(r._id)
                                    }
                                    style={{
                                      padding: "4px 10px",
                                      background: "#fee2e2",
                                      color: "#dc2626",
                                      border: "none",
                                      borderRadius: 6,
                                      fontSize: 11,
                                      cursor: "pointer",
                                      fontWeight: 600,
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Inline run result panel */}
                  {savedRunResult &&
                    (() => {
                      const report = savedReports.find(
                        (r) => r._id === savedRunResult.reportId,
                      );
                      const visibleFields = DATA_POINTS.filter((d) =>
                        (report?.dataPoints ?? []).includes(d.key),
                      );
                      return (
                        <div
                          style={{
                            marginTop: 20,
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "10px 16px",
                              background: "#f8fafc",
                              borderBottom: "1px solid #e5e7eb",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#374151",
                              }}
                            >
                              Results —{" "}
                              {savedRunResult.rows.length.toLocaleString()} rows
                              {report && ` · ${report.name}`}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              {report && (
                                <button
                                  onClick={() =>
                                    handleExportSavedReport(report)
                                  }
                                  style={{
                                    padding: "4px 10px",
                                    background: "#10b981",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                  }}
                                >
                                  ↓ CSV
                                </button>
                              )}
                              <button
                                onClick={() => setSavedRunResult(null)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: 18,
                                  color: "#6b7280",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                          <div
                            style={{
                              overflowX: "auto",
                              maxHeight: 360,
                              overflowY: "auto",
                            }}
                          >
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: 12,
                              }}
                            >
                              <thead style={{ position: "sticky", top: 0 }}>
                                <tr
                                  style={{
                                    background: "#f8fafc",
                                    borderBottom: "1px solid #e5e7eb",
                                  }}
                                >
                                  {visibleFields.map((d) => (
                                    <th
                                      key={d.key}
                                      style={{
                                        padding: "7px 12px",
                                        textAlign: "left",
                                        fontWeight: 600,
                                        color: "#374151",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {d.label}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {savedRunResult.rows.map((row, i) => (
                                  <tr
                                    key={i}
                                    style={{
                                      borderBottom: "1px solid #f3f4f6",
                                      background:
                                        i % 2 === 0 ? "#fff" : "#f9fafb",
                                    }}
                                  >
                                    {visibleFields.map((d) => (
                                      <td
                                        key={d.key}
                                        style={{
                                          padding: "6px 12px",
                                          color: "#374151",
                                          maxWidth: 180,
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {renderCellValue(d.key, row)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}

                  {/* Duplicate modal */}
                  {savedDupId && (
                    <div
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                      }}
                    >
                      <div
                        style={{
                          background: "#fff",
                          borderRadius: 12,
                          padding: 28,
                          width: 420,
                          boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
                        }}
                      >
                        <h3
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            marginBottom: 4,
                            color: "#111827",
                          }}
                        >
                          Duplicate Report
                        </h3>
                        <p
                          style={{
                            fontSize: 13,
                            color: "#6b7280",
                            marginBottom: 16,
                          }}
                        >
                          Enter a unique name for the duplicated report.
                        </p>
                        <input
                          value={savedDupName}
                          onChange={(e) => {
                            setSavedDupName(e.target.value);
                            setSavedDupError("");
                          }}
                          placeholder="New report name"
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            border: savedDupError
                              ? "1px solid #ef4444"
                              : "1px solid #d1d5db",
                            borderRadius: 8,
                            fontSize: 13,
                            marginBottom: savedDupError ? 6 : 16,
                            boxSizing: "border-box" as const,
                          }}
                        />
                        {savedDupError && (
                          <p
                            style={{
                              fontSize: 12,
                              color: "#ef4444",
                              marginBottom: 12,
                            }}
                          >
                            {savedDupError}
                          </p>
                        )}
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            onClick={() => setSavedDupId(null)}
                            style={{
                              padding: "7px 18px",
                              border: "1px solid #d1d5db",
                              borderRadius: 8,
                              fontSize: 13,
                              background: "#fff",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleDuplicateSavedReport}
                            disabled={savedDupSaving}
                            style={{
                              padding: "7px 18px",
                              background: "#7c3aed",
                              color: "#fff",
                              border: "none",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: savedDupSaving
                                ? "not-allowed"
                                : "pointer",
                              opacity: savedDupSaving ? 0.7 : 1,
                            }}
                          >
                            {savedDupSaving ? "Saving…" : "⎘ Duplicate"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/*  ASSIGN REPORT  */}
          {activeSection === "assign-report" &&
            canConfig &&
            (() => {
              // Load data on first render of this section
              if (!assignDataLoaded) loadAssignSectionData();
              return (
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 24,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 4px",
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    Assign Reports
                  </h2>
                  <p
                    style={{
                      margin: "0 0 20px",
                      fontSize: 13,
                      color: "#6b7280",
                    }}
                  >
                    Push saved reports to specific users or roles. They'll see
                    them in "My Reports".
                  </p>

                  {savedReports.length === 0 ? (
                    <div
                      style={{
                        padding: "60px",
                        textAlign: "center",
                        color: "#9ca3af",
                        fontSize: 14,
                      }}
                    >
                      No saved reports. Save a report in the{" "}
                      <strong>Report Builder</strong> first.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {savedReports.map((report) => {
                        const asg = assignments[report._id] ?? {
                          assignedToUsers: [],
                          assignedToRoles: [],
                        };
                        const isExpanded = assignExpanded === report._id;
                        const scheduleOpen = scheduleExpanded === report._id;
                        const alertEnabled: boolean = asg.alertEnabled ?? false;
                        const scheduleType: string =
                          asg.scheduleType ?? "daily";
                        const scheduleDay: number = asg.scheduleDay ?? 1;
                        const scheduleTime: string =
                          asg.scheduleTime ?? "08:00";
                        const ccUserIds: string[] = (asg.ccUsers ?? []).map(
                          (u: any) => u._id ?? u,
                        );
                        const ccEmails: string[] = asg.ccEmails ?? [];
                        const totalAssigned =
                          (asg.assignedToUsers ?? []).length +
                          (asg.assignedToRoles ?? []).length;
                        return (
                          <div
                            key={report._id}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: 10,
                              overflow: "hidden",
                            }}
                          >
                            {/* Header row */}
                            <div
                              onClick={() =>
                                setAssignExpanded(
                                  isExpanded ? null : report._id,
                                )
                              }
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "12px 16px",
                                cursor: "pointer",
                                background: isExpanded ? "#eff6ff" : "#fff",
                                borderBottom: isExpanded
                                  ? "1px solid #e5e7eb"
                                  : "none",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: "#111827",
                                    fontSize: 14,
                                  }}
                                >
                                  {report.name}
                                </div>
                                <div style={{ fontSize: 12, color: "#6b7280" }}>
                                  {(asg.assignedToUsers ?? []).length} users ·{" "}
                                  {(asg.assignedToRoles ?? []).length} roles
                                  assigned
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                {alertEnabled && (
                                  <span
                                    style={{
                                      background: "#fef3c7",
                                      color: "#d97706",
                                      padding: "3px 10px",
                                      borderRadius: 12,
                                      fontSize: 11,
                                      fontWeight: 600,
                                    }}
                                  >
                                    🔔 Alert ON
                                  </span>
                                )}
                                {totalAssigned > 0 && (
                                  <span
                                    style={{
                                      background: "#dbeafe",
                                      color: "#1d4ed8",
                                      padding: "3px 10px",
                                      borderRadius: 12,
                                      fontSize: 11,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {totalAssigned} assigned
                                  </span>
                                )}
                                <span
                                  style={{ fontSize: 18, color: "#9ca3af" }}
                                >
                                  {isExpanded ? "▲" : "▼"}
                                </span>
                              </div>
                            </div>

                            {/* Expanded body */}
                            {isExpanded && (
                              <div style={{ padding: 16, background: "#fff" }}>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: 16,
                                  }}
                                >
                                  {/* Users */}
                                  <div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: "#374151",
                                        marginBottom: 8,
                                      }}
                                    >
                                      Users
                                    </div>
                                    <div
                                      style={{
                                        maxHeight: 200,
                                        overflowY: "auto",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: 8,
                                      }}
                                    >
                                      {allUsers.map((u) => {
                                        const checked = (
                                          asg.assignedToUsers ?? []
                                        ).includes(u._id);
                                        return (
                                          <label
                                            key={u._id}
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 8,
                                              padding: "7px 12px",
                                              cursor: "pointer",
                                              background: checked
                                                ? "#eff6ff"
                                                : "#fff",
                                              borderBottom: "1px solid #f3f4f6",
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() =>
                                                toggleAssignUser(
                                                  report._id,
                                                  u._id,
                                                )
                                              }
                                              style={{ accentColor: "#3b82f6" }}
                                            />
                                            <span style={{ fontSize: 13 }}>
                                              {u.firstName} {u.lastName}
                                            </span>
                                            <span
                                              style={{
                                                fontSize: 11,
                                                color: "#9ca3af",
                                                marginLeft: "auto",
                                              }}
                                            >
                                              {u.email}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  {/* Roles */}
                                  <div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: "#374151",
                                        marginBottom: 8,
                                      }}
                                    >
                                      Roles
                                    </div>
                                    <div
                                      style={{
                                        maxHeight: 200,
                                        overflowY: "auto",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: 8,
                                      }}
                                    >
                                      {allRoles.map((role) => {
                                        const checked = (
                                          asg.assignedToRoles ?? []
                                        ).includes(role._id);
                                        return (
                                          <label
                                            key={role._id}
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 8,
                                              padding: "7px 12px",
                                              cursor: "pointer",
                                              background: checked
                                                ? "#eff6ff"
                                                : "#fff",
                                              borderBottom: "1px solid #f3f4f6",
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() =>
                                                toggleAssignRole(
                                                  report._id,
                                                  role._id,
                                                )
                                              }
                                              style={{ accentColor: "#3b82f6" }}
                                            />
                                            <span style={{ fontSize: 13 }}>
                                              {role.name}
                                            </span>
                                            <span
                                              style={{
                                                fontSize: 11,
                                                color: "#9ca3af",
                                                marginLeft: "auto",
                                              }}
                                            >
                                              {role.code}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {/* ── Schedule Alert Section ── */}
                                <div
                                  style={{
                                    marginTop: 16,
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 8,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    onClick={() =>
                                      setScheduleExpanded(
                                        scheduleOpen ? null : report._id,
                                      )
                                    }
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      padding: "10px 14px",
                                      cursor: "pointer",
                                      background: scheduleOpen
                                        ? "#fffbeb"
                                        : "#f8fafc",
                                      borderBottom: scheduleOpen
                                        ? "1px solid #e5e7eb"
                                        : "none",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: 14,
                                          fontWeight: 700,
                                          color: "#374151",
                                        }}
                                      >
                                        🔔 Schedule Alert
                                      </span>
                                      {alertEnabled && (
                                        <span
                                          style={{
                                            background: "#fef3c7",
                                            color: "#d97706",
                                            padding: "2px 8px",
                                            borderRadius: 10,
                                            fontSize: 11,
                                            fontWeight: 600,
                                          }}
                                        >
                                          {scheduleType === "daily"
                                            ? `Daily at ${scheduleTime}`
                                            : scheduleType === "weekly"
                                              ? `Every ${WEEKDAYS[scheduleDay]} at ${scheduleTime}`
                                              : `Monthly on day ${scheduleDay} at ${scheduleTime}`}
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      style={{ fontSize: 14, color: "#9ca3af" }}
                                    >
                                      {scheduleOpen ? "▲" : "▼"}
                                    </span>
                                  </div>

                                  {scheduleOpen && (
                                    <div
                                      style={{
                                        padding: 14,
                                        background: "#fff",
                                      }}
                                    >
                                      {/* Alert toggle */}
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 10,
                                          marginBottom: 14,
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={alertEnabled}
                                          onChange={(e) =>
                                            updateScheduleField(
                                              report._id,
                                              "alertEnabled",
                                              e.target.checked,
                                            )
                                          }
                                          style={{
                                            accentColor: "#f59e0b",
                                            width: 16,
                                            height: 16,
                                          }}
                                        />
                                        <span
                                          style={{
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: "#374151",
                                          }}
                                        >
                                          Enable scheduled email alert
                                        </span>
                                        {alertEnabled && (
                                          <span
                                            style={{
                                              fontSize: 12,
                                              color: "#6b7280",
                                            }}
                                          >
                                            — report CSV will be emailed to
                                            assigned users
                                          </span>
                                        )}
                                      </div>

                                      {alertEnabled && (
                                        <>
                                          <div
                                            style={{
                                              display: "flex",
                                              flexWrap: "wrap",
                                              gap: 16,
                                              alignItems: "flex-end",
                                            }}
                                          >
                                            {/* Frequency */}
                                            <div>
                                              <label
                                                style={{
                                                  fontSize: 11,
                                                  fontWeight: 600,
                                                  color: "#374151",
                                                  display: "block",
                                                  marginBottom: 4,
                                                }}
                                              >
                                                Frequency
                                              </label>
                                              <select
                                                value={scheduleType}
                                                onChange={(e) =>
                                                  updateScheduleField(
                                                    report._id,
                                                    "scheduleType",
                                                    e.target.value,
                                                  )
                                                }
                                                style={{
                                                  padding: "6px 10px",
                                                  border: "1px solid #d1d5db",
                                                  borderRadius: 6,
                                                  fontSize: 13,
                                                  background: "#fff",
                                                }}
                                              >
                                                <option value="daily">
                                                  Daily
                                                </option>
                                                <option value="weekly">
                                                  Weekly
                                                </option>
                                                <option value="monthly">
                                                  Monthly
                                                </option>
                                              </select>
                                            </div>
                                            {/* Day picker */}
                                            {scheduleType !== "daily" && (
                                              <div>
                                                <label
                                                  style={{
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    color: "#374151",
                                                    display: "block",
                                                    marginBottom: 4,
                                                  }}
                                                >
                                                  {scheduleType === "weekly"
                                                    ? "Day of week"
                                                    : "Day of month"}
                                                </label>
                                                <select
                                                  value={scheduleDay}
                                                  onChange={(e) =>
                                                    updateScheduleField(
                                                      report._id,
                                                      "scheduleDay",
                                                      Number(e.target.value),
                                                    )
                                                  }
                                                  style={{
                                                    padding: "6px 10px",
                                                    border: "1px solid #d1d5db",
                                                    borderRadius: 6,
                                                    fontSize: 13,
                                                    background: "#fff",
                                                  }}
                                                >
                                                  {scheduleType === "weekly"
                                                    ? WEEKDAYS.map((d, i) => (
                                                        <option
                                                          key={d}
                                                          value={i}
                                                        >
                                                          {d}
                                                        </option>
                                                      ))
                                                    : MONTH_DAYS.map((d) => (
                                                        <option
                                                          key={d}
                                                          value={d}
                                                        >
                                                          {d}
                                                        </option>
                                                      ))}
                                                </select>
                                              </div>
                                            )}
                                            {/* Time */}
                                            <div>
                                              <label
                                                style={{
                                                  fontSize: 11,
                                                  fontWeight: 600,
                                                  color: "#374151",
                                                  display: "block",
                                                  marginBottom: 4,
                                                }}
                                              >
                                                Time (24h)
                                              </label>
                                              <input
                                                type="time"
                                                value={scheduleTime}
                                                onChange={(e) =>
                                                  updateScheduleField(
                                                    report._id,
                                                    "scheduleTime",
                                                    e.target.value,
                                                  )
                                                }
                                                style={{
                                                  padding: "6px 10px",
                                                  border: "1px solid #d1d5db",
                                                  borderRadius: 6,
                                                  fontSize: 13,
                                                  background: "#fff",
                                                }}
                                              />
                                            </div>
                                          </div>

                                          {/* CC Recipients */}
                                          <div style={{ marginTop: 16 }}>
                                            <div
                                              style={{
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: "#374151",
                                                marginBottom: 8,
                                              }}
                                            >
                                              CC Recipients
                                            </div>
                                            <div
                                              style={{
                                                display: "grid",
                                                gridTemplateColumns: "1fr 1fr",
                                                gap: 12,
                                              }}
                                            >
                                              {/* CC System Users */}
                                              <div>
                                                <div
                                                  style={{
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    color: "#6b7280",
                                                    marginBottom: 6,
                                                  }}
                                                >
                                                  System users
                                                </div>
                                                <div
                                                  style={{
                                                    maxHeight: 160,
                                                    overflowY: "auto",
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 8,
                                                  }}
                                                >
                                                  {allUsers.map((u) => {
                                                    const checked =
                                                      ccUserIds.includes(u._id);
                                                    return (
                                                      <label
                                                        key={u._id}
                                                        style={{
                                                          display: "flex",
                                                          alignItems: "center",
                                                          gap: 8,
                                                          padding: "6px 10px",
                                                          cursor: "pointer",
                                                          background: checked
                                                            ? "#fefce8"
                                                            : "#fff",
                                                          borderBottom:
                                                            "1px solid #f3f4f6",
                                                        }}
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          checked={checked}
                                                          onChange={() =>
                                                            updateScheduleField(
                                                              report._id,
                                                              "ccUsers",
                                                              checked
                                                                ? ccUserIds.filter(
                                                                    (id) =>
                                                                      id !==
                                                                      u._id,
                                                                  )
                                                                : [
                                                                    ...ccUserIds,
                                                                    u._id,
                                                                  ],
                                                            )
                                                          }
                                                          style={{
                                                            accentColor:
                                                              "#f59e0b",
                                                          }}
                                                        />
                                                        <span
                                                          style={{
                                                            fontSize: 12,
                                                          }}
                                                        >
                                                          {u.firstName}{" "}
                                                          {u.lastName}
                                                        </span>
                                                        <span
                                                          style={{
                                                            fontSize: 10,
                                                            color: "#9ca3af",
                                                            marginLeft: "auto",
                                                            overflow: "hidden",
                                                            textOverflow:
                                                              "ellipsis",
                                                            whiteSpace:
                                                              "nowrap",
                                                            maxWidth: 120,
                                                          }}
                                                        >
                                                          {u.email}
                                                        </span>
                                                      </label>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                              {/* CC free-form emails */}
                                              <div>
                                                <div
                                                  style={{
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    color: "#6b7280",
                                                    marginBottom: 6,
                                                  }}
                                                >
                                                  Additional email addresses
                                                </div>
                                                <div
                                                  style={{
                                                    display: "flex",
                                                    flexWrap: "wrap",
                                                    alignItems: "center",
                                                    gap: 4,
                                                    padding: "6px 10px",
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 8,
                                                    background: "#fff",
                                                    minHeight: 38,
                                                    cursor: "text",
                                                  }}
                                                  onClick={(e) => {
                                                    (
                                                      e.currentTarget.querySelector(
                                                        "input",
                                                      ) as HTMLInputElement | null
                                                    )?.focus();
                                                  }}
                                                >
                                                  {ccEmails.map((em) => (
                                                    <span
                                                      key={em}
                                                      style={{
                                                        background: "#fef3c7",
                                                        color: "#92400e",
                                                        fontSize: 11,
                                                        padding:
                                                          "2px 4px 2px 8px",
                                                        borderRadius: 10,
                                                        fontWeight: 600,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 3,
                                                      }}
                                                    >
                                                      {em}
                                                      <span
                                                        onClick={() =>
                                                          updateScheduleField(
                                                            report._id,
                                                            "ccEmails",
                                                            ccEmails.filter(
                                                              (e) => e !== em,
                                                            ),
                                                          )
                                                        }
                                                        style={{
                                                          cursor: "pointer",
                                                          fontWeight: 700,
                                                          opacity: 0.6,
                                                        }}
                                                      >
                                                        ×
                                                      </span>
                                                    </span>
                                                  ))}
                                                  <input
                                                    type="email"
                                                    value={
                                                      ccEmailDraft[
                                                        report._id
                                                      ] ?? ""
                                                    }
                                                    onChange={(e) =>
                                                      setCcEmailDraft(
                                                        (prev) => ({
                                                          ...prev,
                                                          [report._id]:
                                                            e.target.value,
                                                        }),
                                                      )
                                                    }
                                                    onKeyDown={(e) => {
                                                      const draft = (
                                                        ccEmailDraft[
                                                          report._id
                                                        ] ?? ""
                                                      ).trim();
                                                      if (
                                                        (e.key === "Enter" ||
                                                          e.key === ",") &&
                                                        draft
                                                      ) {
                                                        e.preventDefault();
                                                        if (
                                                          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                                                            draft,
                                                          ) &&
                                                          !ccEmails.includes(
                                                            draft,
                                                          )
                                                        ) {
                                                          updateScheduleField(
                                                            report._id,
                                                            "ccEmails",
                                                            [
                                                              ...ccEmails,
                                                              draft,
                                                            ],
                                                          );
                                                        }
                                                        setCcEmailDraft(
                                                          (prev) => ({
                                                            ...prev,
                                                            [report._id]: "",
                                                          }),
                                                        );
                                                      } else if (
                                                        e.key === "Backspace" &&
                                                        !draft &&
                                                        ccEmails.length > 0
                                                      ) {
                                                        updateScheduleField(
                                                          report._id,
                                                          "ccEmails",
                                                          ccEmails.slice(0, -1),
                                                        );
                                                      }
                                                    }}
                                                    placeholder={
                                                      ccEmails.length === 0
                                                        ? "Type email, press Enter"
                                                        : "+add email"
                                                    }
                                                    style={{
                                                      border: "none",
                                                      outline: "none",
                                                      fontSize: 12,
                                                      flex: 1,
                                                      minWidth: 140,
                                                      background: "transparent",
                                                    }}
                                                  />
                                                </div>
                                                {(ccUserIds.length > 0 ||
                                                  ccEmails.length > 0) && (
                                                  <div
                                                    style={{
                                                      marginTop: 6,
                                                      fontSize: 11,
                                                      color: "#6b7280",
                                                    }}
                                                  >
                                                    {ccUserIds.length +
                                                      ccEmails.length}{" "}
                                                    CC address
                                                    {ccUserIds.length +
                                                      ccEmails.length !==
                                                    1
                                                      ? "es"
                                                      : ""}{" "}
                                                    added
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div
                                  style={{
                                    marginTop: 12,
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    alignItems: "center",
                                    gap: 12,
                                  }}
                                >
                                  {testAlertMsg[report._id] && (
                                    <span
                                      style={{
                                        fontSize: 12,
                                        color: testAlertMsg[
                                          report._id
                                        ].startsWith("✅")
                                          ? "#16a34a"
                                          : "#dc2626",
                                      }}
                                    >
                                      {testAlertMsg[report._id]}
                                    </span>
                                  )}
                                  {assignSaveMsg[report._id] && (
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 500,
                                        color:
                                          assignSaveMsg[report._id].type ===
                                          "success"
                                            ? "#059669"
                                            : "#DC2626",
                                      }}
                                    >
                                      {assignSaveMsg[report._id].text}
                                    </span>
                                  )}
                                  {alertEnabled && (
                                    <button
                                      onClick={() =>
                                        handleTestAlert(report._id)
                                      }
                                      disabled={
                                        testingAlert === report._id ||
                                        assignSaving === report._id
                                      }
                                      style={{
                                        padding: "7px 14px",
                                        background: "#f59e0b",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        opacity:
                                          testingAlert === report._id ? 0.7 : 1,
                                      }}
                                    >
                                      {testingAlert === report._id
                                        ? "Sending…"
                                        : "📧 Send Test"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() =>
                                      handleSaveAssignment(report._id)
                                    }
                                    disabled={assignSaving === report._id}
                                    style={{
                                      padding: "7px 18px",
                                      background: "#3b82f6",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: 8,
                                      fontSize: 13,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {assignSaving === report._id
                                      ? "Saving…"
                                      : "💾 Save Assignment"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

          {/*  FIELD PERMISSIONS  */}
          {activeSection === "field-permissions" && canConfig && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 24,
              }}
            >
              <h2
                style={{
                  margin: "0 0 4px",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                Field Permissions
              </h2>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280" }}>
                Control which roles can view each attendance field in reports.
              </p>

              {!projectId ? (
                <p style={{ color: "#F59E0B", fontSize: 13 }}>
                  Please select a project first (in Report Builder tab).
                </p>
              ) : fieldPerms.length === 0 ? (
                <p style={{ color: "#9CA3AF", fontSize: 13 }}>
                  No field permissions configured.
                </p>
              ) : (
                <>
                  {permsMsg && (
                    <div
                      style={{
                        marginBottom: 14,
                        padding: "8px 14px",
                        borderRadius: 8,
                        fontSize: 13,
                        background:
                          permsMsg.type === "success" ? "#D1FAE5" : "#FEE2E2",
                        color:
                          permsMsg.type === "success" ? "#065F46" : "#991B1B",
                      }}
                    >
                      {permsMsg.text}
                    </div>
                  )}
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#F9FAFB" }}>
                          <th style={thStyle}>Field</th>
                          {(
                            ["admin", "manager", "hr", "employee"] as PermRole[]
                          ).map((r) => (
                            <th
                              key={r}
                              style={{
                                ...thStyle,
                                textAlign: "center" as const,
                              }}
                            >
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fieldPerms.map((row, idx) => (
                          <tr
                            key={row.key}
                            style={{
                              background: idx % 2 === 0 ? "#fff" : "#FAFAFA",
                            }}
                          >
                            <td style={tdStyle}>{row.label}</td>
                            {(
                              [
                                "admin",
                                "manager",
                                "hr",
                                "employee",
                              ] as PermRole[]
                            ).map((role) => (
                              <td
                                key={role}
                                style={{
                                  ...tdStyle,
                                  textAlign: "center" as const,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={row[role]}
                                  onChange={() => togglePerm(row.key, role)}
                                  style={{
                                    accentColor: "#4F46E5",
                                    width: 15,
                                    height: 15,
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <button
                      onClick={saveFieldPerms}
                      disabled={permsSaving}
                      style={{
                        padding: "9px 20px",
                        borderRadius: 8,
                        border: "none",
                        background: permsSaving ? "#C7D2FE" : "#4F46E5",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: permsSaving ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <MdSave style={{ fontSize: 16 }} />
                      {permsSaving ? "Saving" : "Save Permissions"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
