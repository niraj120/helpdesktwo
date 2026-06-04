import {
  useState,
  useEffect,
  useCallback,
  Fragment,
  type ChangeEvent,
} from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import API_BASE_URL from "../../config/api";
import ModuleHeader from "../../components/ModuleHeader";
import {
  MdSave,
  MdRefresh,
  MdPlayArrow,
  MdCheckCircle,
  MdError,
  MdVisibility,
  MdVisibilityOff,
  MdHistory,
  MdSettings,
  MdSchedule,
  MdLock,
  MdSync,
  MdDownload,
  MdUploadFile,
} from "react-icons/md";

const padNum = (n: number) => String(n).padStart(2, "0");

// A header cell (Date object, "YYYY-MM-DD", "M/D/YYYY" or "D/M/YYYY") → YYYY-MM-DD.
// The biometric report uses M/D/YYYY; we only treat it as D/M when first part > 12.
function headerDateToStr(v: unknown): string {
  if (v instanceof Date)
    return `${v.getFullYear()}-${padNum(v.getMonth() + 1)}-${padNum(v.getDate())}`;
  const s = String(v ?? "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${padNum(+m[2])}-${padNum(+m[3])}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    let mo = +m[1];
    let d = +m[2];
    if (mo > 12) {
      d = +m[1];
      mo = +m[2];
    }
    return `${m[3]}-${padNum(mo)}-${padNum(d)}`;
  }
  return "";
}

// Spreadsheet time cell → "HH:MM:SS" (handles Date objects + Excel day fractions).
function cellToTimeStr(v: unknown): string {
  if (v == null || v === "" || v === "-") return "";
  if (v instanceof Date)
    return `${padNum(v.getHours())}:${padNum(v.getMinutes())}:${padNum(
      v.getSeconds(),
    )}`;
  if (typeof v === "number") {
    const tot = Math.round(v * 24 * 3600);
    return `${padNum(Math.floor(tot / 3600) % 24)}:${padNum(
      Math.floor(tot / 60) % 60,
    )}:${padNum(tot % 60)}`;
  }
  const s = String(v).trim();
  return s === "-" ? "" : s;
}

// Duration cell → "HH:MM:SS" string (may exceed 24h; kept as a display string).
function cellToDurationStr(v: unknown): string {
  if (v == null || v === "" || v === "-") return "";
  if (v instanceof Date)
    return `${padNum(v.getHours())}:${padNum(v.getMinutes())}:${padNum(
      v.getSeconds(),
    )}`;
  if (typeof v === "number") {
    const tot = Math.round(v * 24 * 3600);
    return `${padNum(Math.floor(tot / 3600))}:${padNum(
      Math.floor(tot / 60) % 60,
    )}:${padNum(tot % 60)}`;
  }
  const s = String(v).trim();
  return s === "-" ? "" : s;
}

interface ParsedBulkRow {
  employeeCode: string;
  date: string;
  punchIn: string;
  punchOut: string;
  status: string;
  totalWorkingHours: string;
}

// Parse the biometric partner's PIVOTED layout: each employee spans CheckIn /
// Checkout / Duration / Status rows, with each date as a column. Identity columns
// (name/center) are ignored — only the "Employee" code is read. Returns one
// flat row per (employee, date) that actually has data.
function parsePivotedPartnerSheet(aoa: unknown[][]): ParsedBulkRow[] | null {
  const norm = (s: unknown) =>
    String(s ?? "")
      .replace(/[\s_-]/g, "")
      .toLowerCase();

  const headerIdx = aoa.findIndex((r) => r.some((c) => norm(c) === "task"));
  if (headerIdx === -1) return null; // not the pivoted format

  const header = aoa[headerIdx];
  const taskCol = header.findIndex((c) => norm(c) === "task");
  let empCol = header.findIndex((c) => {
    const n = norm(c);
    return n === "employee" || n === "employeeid" || n === "employeecode";
  });
  if (empCol === -1)
    empCol = header.findIndex(
      (c) => norm(c).includes("employee") && !norm(c).includes("name"),
    );
  if (empCol === -1 || taskCol === -1) return null;

  const dateCols: { idx: number; date: string }[] = [];
  for (let i = taskCol + 1; i < header.length; i++) {
    const d = headerDateToStr(header[i]);
    if (d) dateCols.push({ idx: i, date: d });
  }
  if (dateCols.length === 0) return null;

  type Metrics = { in?: string; out?: string; status?: string; dur?: string };
  const byEmp = new Map<string, Map<string, Metrics>>();
  let current = "";

  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    const codeCell = String(row[empCol] ?? "").trim();
    if (codeCell) current = codeCell;
    if (!current) continue;

    const task = norm(row[taskCol]);
    const key: keyof Metrics | null =
      task === "checkin"
        ? "in"
        : task === "checkout"
          ? "out"
          : task === "status"
            ? "status"
            : task === "duration"
              ? "dur"
              : null;
    if (!key) continue;

    let dates = byEmp.get(current);
    if (!dates) {
      dates = new Map();
      byEmp.set(current, dates);
    }
    for (const { idx, date } of dateCols) {
      const cell = row[idx];
      const val =
        key === "status"
          ? String(cell ?? "").trim()
          : key === "dur"
            ? cellToDurationStr(cell)
            : cellToTimeStr(cell);
      if (!val || val === "-") continue;
      const m = dates.get(date) ?? {};
      m[key] = val;
      dates.set(date, m);
    }
  }

  const out: ParsedBulkRow[] = [];
  for (const [code, dates] of byEmp) {
    for (const [date, m] of dates) {
      if (!m.in && !m.out && !m.status && !m.dur) continue;
      out.push({
        employeeCode: code,
        date,
        punchIn: m.in ?? "",
        punchOut: m.out ?? "",
        status: m.status ?? "",
        totalWorkingHours: m.dur ?? "",
      });
    }
  }
  return out;
}

// Fallback: flat one-row-per-(employee,date) layout (the older template).
function parseFlatSheet(aoa: unknown[][]): ParsedBulkRow[] | null {
  const headerIdx = aoa.findIndex((r) =>
    r.some((c) => String(c).trim().toLowerCase().startsWith("employee code")),
  );
  if (headerIdx === -1) return null;
  const headerRow = aoa[headerIdx].map((c) => String(c).trim().toLowerCase());
  const col = (needle: string) =>
    headerRow.findIndex((h) => h.startsWith(needle));
  const cEmp = col("employee code");
  const cDate = col("date");
  const cIn = col("punch in");
  const cOut = col("punch out");
  const cStatus = col("status");
  const cDur = col("duration");
  return aoa
    .slice(headerIdx + 1)
    .map((r) => ({
      employeeCode: cEmp >= 0 ? String(r[cEmp] ?? "").trim() : "",
      date: cDate >= 0 ? headerDateToStr(r[cDate]) || String(r[cDate] ?? "").trim() : "",
      punchIn: cIn >= 0 ? cellToTimeStr(r[cIn]) : "",
      punchOut: cOut >= 0 ? cellToTimeStr(r[cOut]) : "",
      status: cStatus >= 0 ? String(r[cStatus] ?? "").trim() : "",
      totalWorkingHours: cDur >= 0 ? cellToDurationStr(r[cDur]) : "",
    }))
    .filter((row) => row.employeeCode || row.date);
}

interface BulkUploadResult {
  status: string;
  recordsReceived: number;
  recordsStored: number;
  recordsSkipped: number;
  errorCount: number;
  errors?: { employeeCode?: string; reason?: string; error?: string }[];
}

interface Project {
  _id: string;
  name: string;
}

interface AttendanceConfig {
  _id?: string;
  aftBaseUrl: string;
  aftProjectPrefix: string;
  apiKeyEncrypted: string; // masked on GET, send new value or "••••••" unchanged
  syncActive: boolean;
  syncSchedule: string[];
  publishedCheckEnabled: boolean;
  syncLookbackDays: number;
  displayFields: string[];
  fieldPermissions: Record<
    string,
    { admin: boolean; manager: boolean; hr: boolean; employee: boolean }
  >;
}

interface SyncErrorDetail {
  employeeCode?: string;
  reason?: string;
  error?: string;
}

interface SyncLog {
  _id: string;
  triggeredBy: "SCHEDULE" | "MANUAL" | "API" | "UPLOAD";
  startedAt: string;
  completedAt?: string;
  recordsFetched: number;
  recordsStored: number;
  recordsSkipped: number;
  errorCount: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  errorDetails?: SyncErrorDetail[];
}

// Turn a sync log's raw errorDetails into a single human-readable explanation.
// Returns null for clean SUCCESS runs.
function describeSyncError(log: SyncLog): string | null {
  if (log.status === "SUCCESS") return null;
  const details = log.errorDetails ?? [];

  // A fetch-level failure means we never got data from AFT at all.
  const fetchErr = details.find((d) => d.reason === "FETCH_ERROR");
  if (fetchErr) {
    const msg = fetchErr.error ?? "";
    if (/401|unauthor/i.test(msg)) {
      return "Authentication failed (401) — the AFT API key is invalid or expired. Update it in AFT API Settings above, then run the sync again.";
    }
    if (/403/.test(msg)) return "AFT rejected the request (403 Forbidden).";
    if (/timeout|ETIMEDOUT|ECONNABORTED/i.test(msg))
      return "AFT API request timed out — the biometric server did not respond.";
    if (/ENOTFOUND|ECONNREFUSED|Network/i.test(msg))
      return "Could not reach the AFT API — check the base URL and network.";
    return `Could not fetch from AFT: ${msg || "unknown error"}`;
  }

  // Per-record issues during processing.
  const unmatched = details.filter((d) => d.reason === "UNMATCHED").length;
  const dbErr = details.filter((d) => d.reason === "DB_ERROR").length;
  const parts: string[] = [];
  if (unmatched)
    parts.push(
      `${unmatched} record(s) skipped — no employee with a matching code in this project`,
    );
  if (dbErr) parts.push(`${dbErr} record(s) failed to save`);
  if (parts.length) return parts.join("; ");

  return log.status === "FAILED"
    ? "Sync failed."
    : "Sync completed with issues.";
}

const MASKED = "••••••";
const FIELD_LABELS: Record<string, string> = {
  employee_id: "Employee ID",
  name: "Name",
  date: "Date",
  punch_in: "Punch In",
  punch_out: "Punch Out",
  total_working_hours: "Total Hours",
  status: "Status",
  center: "Offline Center",
  geo: "Geo Location",
  published: "Published",
};

export default function AttendanceConfigPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [config, setConfig] = useState<AttendanceConfig>({
    aftBaseUrl: "https://www.afterp.in/api/apiv1",
    aftProjectPrefix: "",
    apiKeyEncrypted: "",
    syncActive: false,
    syncSchedule: [],
    publishedCheckEnabled: false,
    syncLookbackDays: 30,
    displayFields: [],
    fieldPermissions: {},
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [newScheduleTime, setNewScheduleTime] = useState("");

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

  // Load config when projectId changes
  const loadConfig = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await axios.get(
        `${API_BASE_URL}/attendance/config?projectId=${projectId}`,
        { headers },
      );
      setConfig(r.data);
    } catch {
      setMessage({ type: "error", text: "Failed to load configuration." });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Load sync logs
  const loadLogs = useCallback(async () => {
    if (!projectId) return;
    setLogsLoading(true);
    try {
      const r = await axios.get(
        `${API_BASE_URL}/attendance/sync/logs?projectId=${projectId}&limit=10`,
        { headers },
      );
      setSyncLogs(r.data?.data ?? r.data ?? []);
    } catch {
      setSyncLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // ── Bulk manual upload ─────────────────────────────────────────────────────
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);

  const handleDownloadTemplate = () => {
    if (!projectId) return;
    fetch(`${API_BASE_URL}/attendance/bulk/template?projectId=${projectId}`, {
      headers,
    })
      .then((res) => {
        if (!res.ok) throw new Error("download failed");
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `attendance_bulk_template_${projectId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() =>
        setMessage({ type: "error", text: "Failed to download template." }),
      );
  };

  const handleBulkFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !projectId) return;
    setBulkUploading(true);
    setBulkResult(null);
    setMessage(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        blankrows: false,
        defval: "",
      });

      // Prefer the biometric partner's pivoted layout; fall back to flat.
      const rows = parsePivotedPartnerSheet(aoa) ?? parseFlatSheet(aoa);

      if (!rows) {
        setMessage({
          type: "error",
          text: "Unrecognised file. Use the biometric partner report (with a 'Task' column) or the downloaded template.",
        });
        return;
      }
      if (rows.length === 0) {
        setMessage({ type: "error", text: "No data rows found in the file." });
        return;
      }

      const r = await axios.post(
        `${API_BASE_URL}/attendance/bulk/upload`,
        { projectId, rows },
        { headers },
      );
      const result: BulkUploadResult = r.data;
      setBulkResult(result);
      setMessage({
        type:
          result.errorCount > 0 || result.recordsSkipped > 0
            ? "error"
            : "success",
        text: `Upload ${result.status}: ${result.recordsStored} stored, ${result.recordsSkipped} skipped, ${result.errorCount} error(s).`,
      });
      loadLogs();
    } catch (err: unknown) {
      const msg =
        (axios.isAxiosError(err) && err.response?.data?.message) ||
        "Bulk upload failed. Please check the file and try again.";
      setMessage({ type: "error", text: msg });
    } finally {
      setBulkUploading(false);
    }
  };

  const handleSave = async () => {
    if (!projectId) return;
    setSaving(true);
    setMessage(null);
    try {
      // Backend expects "apiKey" (plain text / masked) — not "apiKeyEncrypted"
      const { apiKeyEncrypted, ...restConfig } = config;
      await axios.put(
        `${API_BASE_URL}/attendance/config?projectId=${projectId}`,
        { ...restConfig, apiKey: apiKeyEncrypted },
        { headers },
      );
      setMessage({
        type: "success",
        text: "Configuration saved successfully.",
      });
      loadConfig();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save configuration.";
      setMessage({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!projectId) return;
    setTestLoading(true);
    setMessage(null);
    try {
      const r = await axios.post(
        `${API_BASE_URL}/attendance/config/test-connection`,
        {
          projectId,
          aftBaseUrl: config.aftBaseUrl,
          aftProjectPrefix: config.aftProjectPrefix,
          // Only send apiKey if it's a real value (not the masked placeholder)
          apiKey:
            config.apiKeyEncrypted &&
            !config.apiKeyEncrypted.startsWith("\u2022")
              ? config.apiKeyEncrypted
              : undefined,
        },
        { headers },
      );
      const { recordCount } = r.data;
      setMessage({
        type: "success",
        text: `Connection successful — ${recordCount} attendance records found.`,
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Connection test failed.";
      setMessage({ type: "error", text: msg });
    } finally {
      setTestLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (!projectId) return;
    setSyncLoading(true);
    setMessage(null);
    try {
      const r = await axios.post(
        `${API_BASE_URL}/attendance/sync/run`,
        { projectId },
        { headers },
      );
      setMessage({
        type: "success",
        text: `Sync started (ID: ${r.data.syncLogId}). Refresh logs in a moment.`,
      });
      setTimeout(loadLogs, 3000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to trigger sync.";
      setMessage({ type: "error", text: msg });
    } finally {
      setSyncLoading(false);
    }
  };

  const addScheduleTime = () => {
    const t = newScheduleTime.trim();
    if (!t || config.syncSchedule.includes(t)) return;
    setConfig((c) => ({ ...c, syncSchedule: [...c.syncSchedule, t].sort() }));
    setNewScheduleTime("");
  };

  const removeScheduleTime = (t: string) => {
    setConfig((c) => ({
      ...c,
      syncSchedule: c.syncSchedule.filter((x) => x !== t),
    }));
  };

  const toggleFieldPerm = (
    field: string,
    role: keyof AttendanceConfig["fieldPermissions"][string],
  ) => {
    setConfig((c) => {
      const existing = c.fieldPermissions[field] ?? {
        admin: true,
        manager: false,
        hr: true,
        employee: false,
      };
      return {
        ...c,
        fieldPermissions: {
          ...c.fieldPermissions,
          [field]: { ...existing, [role]: !existing[role] },
        },
      };
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ModuleHeader
        title="Attendance Configuration"
        subtitle="AFT biometric integration settings, sync schedule, and field permissions"
      />

      {/* Project Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Project
        </label>
        <select
          className="border border-gray-300 rounded-md px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">— Select project —</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div
          className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-md text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <MdCheckCircle className="text-lg flex-shrink-0" />
          ) : (
            <MdError className="text-lg flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {!projectId ? (
        <p className="text-gray-500 text-sm">Select a project to configure.</p>
      ) : loading ? (
        <p className="text-gray-500 text-sm">Loading configuration…</p>
      ) : (
        <div className="space-y-6">
          {/* AFT API Settings */}
          <Section title="AFT API Settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Base URL
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={config.aftBaseUrl}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, aftBaseUrl: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Prefix (e.g. vmk)
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={config.aftProjectPrefix}
                  placeholder="vmk"
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      aftProjectPrefix: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key / Bearer Token
                </label>
                <div className="relative flex">
                  <input
                    type={showToken ? "text" : "password"}
                    className="flex-1 pr-10 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={config.apiKeyEncrypted}
                    placeholder="Leave as •••••• to keep existing"
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        apiKeyEncrypted: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-2 text-gray-500 hover:text-gray-700"
                    onClick={() => setShowToken((v) => !v)}
                  >
                    {showToken ? <MdVisibilityOff /> : <MdVisibility />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Stored encrypted. Shows {MASKED} when a key is already saved.
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testLoading}
                className="btn btn-outline flex items-center gap-1 text-sm"
              >
                {testLoading ? "Testing…" : "Test Connection"}
              </button>
            </div>
          </Section>

          {/* Sync Settings */}
          <Section title="Sync Settings">
            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.syncActive}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, syncActive: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  Enable automatic sync
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.publishedCheckEnabled}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      publishedCheckEnabled: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">
                  Only store published records
                </span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sync Lookback (days)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                How many days back to fetch attendance from AFT. Increase if
                records are missing.
              </p>
              <input
                type="number"
                min={1}
                max={365}
                value={config.syncLookbackDays}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    syncLookbackDays: Math.max(
                      1,
                      Math.min(365, parseInt(e.target.value) || 30),
                    ),
                  }))
                }
                className="border border-gray-300 rounded-md px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Daily Sync Times (HH:MM, IST)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="time"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newScheduleTime}
                  onChange={(e) => setNewScheduleTime(e.target.value)}
                />
                <button
                  onClick={addScheduleTime}
                  className="btn btn-outline text-sm px-3"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {config.syncSchedule.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                  >
                    {t}
                    <button
                      onClick={() => removeScheduleTime(t)}
                      className="ml-1 text-blue-600 hover:text-red-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </Section>

          {/* Field Permissions */}
          <Section title="Field Visibility Permissions">
            <p className="text-xs text-gray-500 mb-3">
              Control which roles can see each attendance field.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-gray-700">
                      Field
                    </th>
                    {(["admin", "manager", "hr", "employee"] as const).map(
                      (r) => (
                        <th
                          key={r}
                          className="py-2 px-3 text-center font-medium text-gray-700 capitalize"
                        >
                          {r}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(FIELD_LABELS).map((field) => {
                    const perms = config.fieldPermissions[field] ?? {
                      admin: true,
                      manager: false,
                      hr: true,
                      employee: false,
                    };
                    return (
                      <tr key={field} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-gray-800">
                          {FIELD_LABELS[field]}
                        </td>
                        {(["admin", "manager", "hr", "employee"] as const).map(
                          (role) => (
                            <td key={role} className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={
                                  perms[role] ??
                                  (role === "admin" || role === "hr")
                                }
                                disabled={
                                  field === "employee_id" ||
                                  field === "name" ||
                                  field === "date"
                                }
                                onChange={() => toggleFieldPerm(field, role)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600"
                              />
                            </td>
                          ),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Save + Manual Sync buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-filled flex items-center gap-2"
            >
              <MdSave />
              {saving ? "Saving…" : "Save Configuration"}
            </button>
            <button
              onClick={handleManualSync}
              disabled={syncLoading}
              className="btn btn-outline flex items-center gap-2"
            >
              <MdPlayArrow />
              {syncLoading ? "Starting…" : "Run Sync Now"}
            </button>
          </div>

          {/* Bulk Manual Upload */}
          <Section title="Bulk Upload Attendance">
            <p className="text-xs text-gray-500 mb-3">
              Upload the biometric partner's report directly (the pivoted layout
              with CheckIn / Checkout / Duration / Status rows and a column per
              date) — or download the template, which mirrors that layout. Only
              the <strong>Employee</strong> code and the daily values are read;
              <strong> Name, Designation and Center are taken from our system</strong>{" "}
              by Employee Code (partner values are ignored). Rows are merged into
              the same records used by View Records and the Attendance Report
              (matched by Employee Code + Date). CSV or Excel.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleDownloadTemplate}
                disabled={!projectId}
                className="btn btn-outline flex items-center gap-2 disabled:opacity-50"
              >
                <MdDownload />
                Download Template
              </button>

              <label
                className={`btn btn-primary flex items-center gap-2 cursor-pointer ${
                  !projectId || bulkUploading
                    ? "opacity-50 pointer-events-none"
                    : ""
                }`}
              >
                <MdUploadFile />
                {bulkUploading ? "Uploading…" : "Upload Filled File"}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  disabled={!projectId || bulkUploading}
                  onChange={handleBulkFile}
                />
              </label>

              {!projectId && (
                <span className="text-xs text-amber-600">
                  Select a project first.
                </span>
              )}
            </div>

            {bulkResult && (
              <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
                <div className="flex flex-wrap gap-4 font-medium text-gray-700">
                  <span>Received: {bulkResult.recordsReceived}</span>
                  <span className="text-green-700">
                    Stored: {bulkResult.recordsStored}
                  </span>
                  <span className="text-amber-600">
                    Skipped: {bulkResult.recordsSkipped}
                  </span>
                  <span className="text-red-600">
                    Errors: {bulkResult.errorCount}
                  </span>
                </div>
                {bulkResult.errors && bulkResult.errors.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto list-disc pl-5 text-red-600">
                    {bulkResult.errors.map((er, i) => (
                      <li key={i}>{er.error || er.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Section>

          {/* Sync History */}
          <Section title="Recent Sync History">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-gray-500">Last 10 sync runs</p>
              <button
                onClick={loadLogs}
                disabled={logsLoading}
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
              >
                <MdRefresh className={logsLoading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
            {/* Prominent banner when the most recent run failed */}
            {(() => {
              const latest = syncLogs[0];
              if (!latest || latest.status !== "FAILED") return null;
              const msg = describeSyncError(latest);
              if (!msg) return null;
              return (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span className="mt-0.5">⚠</span>
                  <span>
                    <span className="font-semibold">Latest sync failed:</span>{" "}
                    {msg}
                  </span>
                </div>
              );
            })()}
            {logsLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : syncLogs.length === 0 ? (
              <p className="text-sm text-gray-500">No sync history yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 font-medium text-gray-700">
                        Started
                      </th>
                      <th className="text-left py-2 pr-3 font-medium text-gray-700">
                        Triggered By
                      </th>
                      <th className="text-center py-2 pr-3 font-medium text-gray-700">
                        Fetched
                      </th>
                      <th className="text-center py-2 pr-3 font-medium text-gray-700">
                        Stored
                      </th>
                      <th className="text-center py-2 pr-3 font-medium text-gray-700">
                        Errors
                      </th>
                      <th className="text-center py-2 font-medium text-gray-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map((log) => {
                      const errMsg = describeSyncError(log);
                      return (
                        <Fragment key={log._id}>
                          <tr
                            className={
                              errMsg
                                ? "border-b-0"
                                : "border-b last:border-0"
                            }
                          >
                            <td className="py-2 pr-3 text-gray-600">
                              {new Date(log.startedAt).toLocaleString("en-IN")}
                            </td>
                            <td className="py-2 pr-3">{log.triggeredBy}</td>
                            <td className="py-2 pr-3 text-center">
                              {log.recordsFetched}
                            </td>
                            <td className="py-2 pr-3 text-center">
                              {log.recordsStored}
                            </td>
                            <td className="py-2 pr-3 text-center text-red-600">
                              {log.errorCount > 0 ? log.errorCount : "—"}
                            </td>
                            <td className="py-2 text-center">
                              <StatusBadge status={log.status} />
                            </td>
                          </tr>
                          {errMsg && (
                            <tr className="border-b last:border-0">
                              <td
                                colSpan={6}
                                className={`pb-2 pr-3 ${
                                  log.status === "FAILED"
                                    ? "text-red-600"
                                    : "text-amber-600"
                                }`}
                              >
                                ↳ {errMsg}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  "AFT API Settings": <MdSettings className="text-blue-500" />,
  "Sync Settings": <MdSchedule className="text-blue-500" />,
  "Field Visibility Permissions": <MdLock className="text-blue-500" />,
  "Bulk Upload Attendance": <MdUploadFile className="text-blue-500" />,
  "Recent Sync History": <MdHistory className="text-blue-500" />,
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        {SECTION_ICONS[title] ?? <MdSync className="text-blue-500" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SUCCESS: "bg-green-100 text-green-800",
    PARTIAL: "bg-yellow-100 text-yellow-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
}
