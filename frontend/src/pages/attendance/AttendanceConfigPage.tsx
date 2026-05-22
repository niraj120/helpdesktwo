import { useState, useEffect, useCallback } from "react";
import axios from "axios";
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
} from "react-icons/md";

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

interface SyncLog {
  _id: string;
  triggeredBy: "SCHEDULE" | "MANUAL" | "API";
  startedAt: string;
  completedAt?: string;
  recordsFetched: number;
  recordsStored: number;
  recordsSkipped: number;
  errorCount: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
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
  center: "Center",
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
                    {syncLogs.map((log) => (
                      <tr key={log._id} className="border-b last:border-0">
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
                    ))}
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
