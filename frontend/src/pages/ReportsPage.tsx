import React, { useState, useEffect, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import DashboardLayout from "../components/DashboardLayout";
import ModuleHeader from "../components/ModuleHeader";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";
import { API_CONFIG } from "../config/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Section =
  | "role-permissions"
  | "data-points"
  | "report-builder"
  | "assign-reports"
  | "saved-reports"
  | "my-reports"
  | "footfall";

interface RoleOption {
  _id: string;
  code: string;
  name: string;
}
interface DataPoint {
  key: string;
  label: string;
  description: string;
  category: string;
  fieldType: string;
  source?: string; // ticket | user | asset | asset_audit (undefined = ticket)
}
interface ModulePerm {
  roleId: string;
  roleCode: string;
  roleName: string;
  canView: boolean;
  canCreate: boolean;
  canExport: boolean;
  canSchedule: boolean;
  canAssign: boolean;
  canDelete: boolean;
}
interface DataPointAccess {
  roleId: string;
  roleCode: string;
  roleName: string;
  allowedDataPoints: string[];
}
interface ReportFilter {
  field: string;
  operator: string;
  value: string;
  value2?: string;
}
interface SavedReport {
  _id: string;
  name: string;
  description?: string;
  dataPoints: string[];
  filters: ReportFilter[];
  sortBy?: string;
  sortOrder?: string;
  createdBy?: any;
  lastRunAt?: string;
  rowCount?: number;
  assignedUsersCount?: number;
  assignedRolesCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const getRoleCode = (): string => {
  try {
    const token = localStorage.getItem("authToken");
    if (!token) return "";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role?.code ?? "";
  } catch {
    return "";
  }
};

// Project-scoped (project portal) logins carry a projectId in the JWT. When set,
// reports are pinned to that project and the project picker is hidden.
const getTokenProjectId = (): string => {
  try {
    const token = localStorage.getItem("authToken");
    if (!token) return "";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.projectId ? String(payload.projectId) : "";
  } catch {
    return "";
  }
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("authToken") ?? ""}`,
  "Content-Type": "application/json",
});

// Column labels for footfall reports (keys returned by the footfall run/aggregation).
const FOOTFALL_COLUMN_LABELS: Record<string, string> = {
  center: "Offline Center",
  newQueries: "New Queries",
  existingActive: "Existing Queries (Activity)",
  footfall: "Footfall",
};

/**
 * Returns the human-readable label for a data point key.
 * Handles custom form field keys (custom_field_department → "Department").
 */
const getDataPointLabel = (
  key: string,
  dpMap: Record<string, string>,
): string => {
  if (dpMap[key]) return dpMap[key];
  if (FOOTFALL_COLUMN_LABELS[key]) return FOOTFALL_COLUMN_LABELS[key];
  if (key.startsWith("custom_field_")) {
    const raw = key.replace(/^custom_field_/, "");
    return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
  }
  return key;
};

const PERM_LABELS: {
  key: keyof Omit<ModulePerm, "roleId" | "roleCode" | "roleName">;
  label: string;
}[] = [
  { key: "canView", label: "View Reports" },
  { key: "canCreate", label: "Create Reports" },
  { key: "canExport", label: "Export Reports" },
  { key: "canSchedule", label: "Schedule Reports" },
  { key: "canAssign", label: "Assign Reports" },
  { key: "canDelete", label: "Delete Reports" },
];

const FILTER_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "in", label: "any of" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "greater_than", label: ">" },
  { value: "less_than", label: "<" },
  { value: "between", label: "between" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

// Format a cell value for display: ISO date strings → IST, everything else → String
function formatCellValue(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    }
  }
  return s;
}

const CATEGORY_COLORS: Record<string, string> = {
  ticket: "#3b82f6",
  customer: "#8b5cf6",
  sla: "#f59e0b",
  channel: "#10b981",
  feedback: "#ef4444",
  agent: "#6366f1",
  service_request: "#4f46e5",
  call: "#0ea5e9",
  email_intake: "#0d9488",
};

// Friendlier labels for category badges whose raw key is snake_case.
const CATEGORY_LABELS: Record<string, string> = {
  service_request: "Service Request",
  call: "Call",
  email_intake: "Email Intake",
};

function categoryBadge(cat: string) {
  const color = CATEGORY_COLORS[cat] ?? "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "12px",
        fontSize: "11px",
        fontWeight: 600,
        background: color + "20",
        color,
        textTransform: "capitalize",
      }}
    >
      {CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ")}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        position: "relative",
        display: "inline-block",
        width: 36,
        height: 20,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: checked ? "#3b82f6" : "#d1d5db",
          borderRadius: 10,
          transition: "background 0.2s",
        }}
      />
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          background: "#fff",
          borderRadius: "50%",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </label>
  );
}

function Spinner() {
  return (
    <div
      style={{
        padding: "60px",
        textAlign: "center",
        color: "#6b7280",
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        borderRadius: 8,
        color: "#dc2626",
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Role Permissions
// ─────────────────────────────────────────────────────────────────────────────

function RolePermissionsSection() {
  const [perms, setPerms] = useState<ModulePerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${API_CONFIG.API_URL}/reports/module-permissions`, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setPerms(d.data);
        else setError(d.message);
      })
      .catch(() => setError("Failed to load permissions"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = useCallback(
    (roleId: string, field: keyof ModulePerm, val: boolean) => {
      setPerms((prev) =>
        prev.map((p) => (p.roleId === roleId ? { ...p, [field]: val } : p)),
      );
      setDirty((prev) => ({ ...prev, [roleId]: true }));
    },
    [],
  );

  const handleSave = useCallback(async (perm: ModulePerm) => {
    setSaving(perm.roleId);
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/module-permissions/${perm.roleId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify(perm),
        },
      );
      const d = await res.json();
      if (d.success) setDirty((prev) => ({ ...prev, [perm.roleId]: false }));
      else setError(d.message);
    } catch {
      setError("Save failed");
    } finally {
      setSaving(null);
    }
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
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
              fontSize: 18,
              fontWeight: 700,
              color: "#111827",
              margin: 0,
            }}
          >
            Role Permissions
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Configure which roles can perform each action in the Reports module.
          </p>
        </div>
        <span
          style={{
            background: "#dbeafe",
            color: "#1d4ed8",
            padding: "4px 12px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {
            perms.filter(
              (p) => Object.keys(dirty).includes(p.roleId) && dirty[p.roleId],
            ).length
          }{" "}
          unsaved changes
        </span>
      </div>
      {error && <ErrorBanner msg={error} />}
      <div
        style={{
          overflowX: "auto",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
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
                  padding: "12px 16px",
                  fontWeight: 600,
                  color: "#374151",
                  minWidth: 180,
                }}
              >
                Permission
              </th>
              {perms.map((p) => (
                <th
                  key={p.roleId}
                  style={{
                    textAlign: "center",
                    padding: "12px 16px",
                    fontWeight: 600,
                    color: "#374151",
                    minWidth: 130,
                  }}
                >
                  <div>{p.roleName}</div>
                  <div
                    style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}
                  >
                    {p.roleCode}
                  </div>
                </th>
              ))}
              <th
                style={{ width: 80, textAlign: "center", padding: "12px 8px" }}
              >
                Save
              </th>
            </tr>
          </thead>
          <tbody>
            {PERM_LABELS.map(({ key, label }, i) => (
              <tr
                key={key}
                style={{
                  background: i % 2 === 0 ? "#fff" : "#f9fafb",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <td
                  style={{
                    padding: "12px 16px",
                    fontWeight: 500,
                    color: "#374151",
                  }}
                >
                  {label}
                </td>
                {perms.map((p) => (
                  <td
                    key={p.roleId}
                    style={{ textAlign: "center", padding: "12px 16px" }}
                  >
                    <Toggle
                      checked={!!p[key as keyof ModulePerm]}
                      onChange={(val) =>
                        handleToggle(p.roleId, key as keyof ModulePerm, val)
                      }
                    />
                  </td>
                ))}
                <td style={{ textAlign: "center" }} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #e5e7eb" }}>
              <td
                style={{
                  padding: "12px 16px",
                  fontWeight: 600,
                  color: "#374151",
                  fontSize: 12,
                }}
              >
                Save changes per role →
              </td>
              {perms.map((p) => (
                <td key={p.roleId} style={{ textAlign: "center", padding: 8 }}>
                  <button
                    onClick={() => handleSave(p)}
                    disabled={!dirty[p.roleId] || saving === p.roleId}
                    style={{
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: "none",
                      cursor: dirty[p.roleId] ? "pointer" : "default",
                      background: dirty[p.roleId] ? "#3b82f6" : "#f3f4f6",
                      color: dirty[p.roleId] ? "#fff" : "#9ca3af",
                      transition: "all 0.2s",
                    }}
                  >
                    {saving === p.roleId ? "..." : "Save"}
                  </button>
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Data Points
// ─────────────────────────────────────────────────────────────────────────────

function DataPointsSection() {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [accessList, setAccessList] = useState<DataPointAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dpRes, accRes] = await Promise.all([
        fetch(`${API_CONFIG.API_URL}/reports/data-points`, {
          headers: authHeaders(),
        }),
        fetch(`${API_CONFIG.API_URL}/reports/data-point-access`, {
          headers: authHeaders(),
        }),
      ]);
      const [dpData, accData] = await Promise.all([
        dpRes.json(),
        accRes.json(),
      ]);
      if (dpData.success) setDataPoints(dpData.data);
      if (accData.success) setAccessList(accData.data);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/data-points/seed`,
        { method: "POST", headers: authHeaders() },
      );
      const d = await res.json();
      if (d.success) {
        await load();
      } else setError(d.message);
    } catch {
      setError("Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const isAllowed = useCallback(
    (roleId: string, dpKey: string): boolean => {
      const acc = accessList.find((a) => a.roleId === roleId);
      return acc ? acc.allowedDataPoints.includes(dpKey) : false;
    },
    [accessList],
  );

  const handleToggle = useCallback(
    (roleId: string, dpKey: string, val: boolean) => {
      setAccessList((prev) =>
        prev.map((a) => {
          if (a.roleId !== roleId) return a;
          const allowed = val
            ? [...a.allowedDataPoints, dpKey]
            : a.allowedDataPoints.filter((k) => k !== dpKey);
          return { ...a, allowedDataPoints: allowed };
        }),
      );
      setDirty((prev) => ({ ...prev, [roleId]: true }));
    },
    [],
  );

  const handleSaveRole = useCallback(async (acc: DataPointAccess) => {
    setSaving(acc.roleId);
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/data-point-access/${acc.roleId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ allowedDataPoints: acc.allowedDataPoints }),
        },
      );
      const d = await res.json();
      if (d.success) setDirty((prev) => ({ ...prev, [acc.roleId]: false }));
      else setError(d.message);
    } catch {
      setError("Save failed");
    } finally {
      setSaving(null);
    }
  }, []);

  if (loading) return <Spinner />;

  const categories = [
    "all",
    ...Array.from(new Set(dataPoints.map((d) => d.category))),
  ];
  const filtered =
    filterCat === "all"
      ? dataPoints
      : dataPoints.filter((d) => d.category === filterCat);
  const grouped: Record<string, DataPoint[]> = {};
  for (const dp of filtered) {
    if (!grouped[dp.category]) grouped[dp.category] = [];
    grouped[dp.category].push(dp);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#111827",
              margin: 0,
            }}
          >
            Data Point Access
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Control which data point columns each role can see in reports.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {dataPoints.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={seeding}
              style={{
                padding: "8px 16px",
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {seeding ? "Seeding…" : "⚡ Seed Default Data Points"}
            </button>
          )}
        </div>
      </div>
      {error && <ErrorBanner msg={error} />}

      {/* Category filter tabs */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: filterCat === cat ? "#3b82f6" : "#f3f4f6",
              color: filterCat === cat ? "#fff" : "#374151",
            }}
          >
            {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Matrix table */}
      <div
        style={{
          overflowX: "auto",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
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
                  minWidth: 220,
                  position: "sticky",
                  left: 0,
                  background: "#f8fafc",
                  zIndex: 1,
                }}
              >
                Data Point
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  fontWeight: 600,
                  color: "#374151",
                  width: 80,
                }}
              >
                Type
              </th>
              {accessList.map((a) => (
                <th
                  key={a.roleId}
                  style={{
                    textAlign: "center",
                    padding: "10px 12px",
                    fontWeight: 600,
                    color: "#374151",
                    minWidth: 110,
                  }}
                >
                  <div>{a.roleName}</div>
                  <div
                    style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}
                  >
                    {a.allowedDataPoints.length} / {dataPoints.length}
                  </div>
                </th>
              ))}
              <th
                style={{ width: 70, textAlign: "center", padding: "10px 8px" }}
              >
                Save
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([cat, dps]) => (
              <React.Fragment key={cat}>
                <tr
                  style={{
                    background: "#f0f9ff",
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  <td
                    colSpan={3 + accessList.length}
                    style={{
                      padding: "6px 16px",
                      fontWeight: 700,
                      color: CATEGORY_COLORS[cat] ?? "#374151",
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    {cat}
                  </td>
                </tr>
                {dps.map((dp, i) => (
                  <tr
                    key={dp.key}
                    style={{
                      background: i % 2 === 0 ? "#fff" : "#f9fafb",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 16px",
                        fontWeight: 500,
                        color: "#374151",
                        position: "sticky",
                        left: 0,
                        background: "inherit",
                        zIndex: 1,
                      }}
                    >
                      <div>{dp.label}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        {dp.key}
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          background: "#f3f4f6",
                          padding: "2px 6px",
                          borderRadius: 4,
                          color: "#6b7280",
                        }}
                      >
                        {dp.fieldType}
                      </span>
                    </td>
                    {accessList.map((a) => (
                      <td
                        key={a.roleId}
                        style={{ textAlign: "center", padding: "8px 12px" }}
                      >
                        <Toggle
                          checked={isAllowed(a.roleId, dp.key)}
                          onChange={(val) =>
                            handleToggle(a.roleId, dp.key, val)
                          }
                        />
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }} />
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr
              style={{ borderTop: "2px solid #e5e7eb", background: "#f8fafc" }}
            >
              <td
                colSpan={2}
                style={{
                  padding: "10px 16px",
                  fontWeight: 600,
                  color: "#374151",
                  fontSize: 12,
                }}
              >
                Save per role →
              </td>
              {accessList.map((a) => (
                <td key={a.roleId} style={{ textAlign: "center", padding: 8 }}>
                  <button
                    onClick={() => handleSaveRole(a)}
                    disabled={!dirty[a.roleId] || saving === a.roleId}
                    style={{
                      padding: "5px 12px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: "none",
                      cursor: dirty[a.roleId] ? "pointer" : "default",
                      background: dirty[a.roleId] ? "#3b82f6" : "#f3f4f6",
                      color: dirty[a.roleId] ? "#fff" : "#9ca3af",
                      transition: "all 0.2s",
                    }}
                  >
                    {saving === a.roleId ? "…" : "Save"}
                  </button>
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Report Builder
// ─────────────────────────────────────────────────────────────────────────────

function ReportBuilderSection({
  onSaved,
  editingReport,
  onCancelEdit,
  isAdmin,
}: {
  onSaved?: () => void;
  editingReport?: SavedReport | null;
  onCancelEdit?: () => void;
  isAdmin?: boolean;
}) {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [dpLoading, setDpLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [reportName, setReportName] = useState("");
  const [reportDesc, setReportDesc] = useState("");
  const [sortBy, setSortBy] = useState("ticket_created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  // Summary (pivot) mode
  const [reportMode, setReportMode] = useState<"detail" | "summary">("detail");
  const [pivotRow, setPivotRow] = useState("");
  const [pivotCol, setPivotCol] = useState("");
  // Dynamic column headers returned for a pivot preview (null = detail mode)
  const [previewColumns, setPreviewColumns] = useState<string[] | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  // Data source: which base collection the report runs against.
  const [sourceFilter, setSourceFilter] = useState("ticket");
  const [projectOptions, setProjectOptions] = useState<
    { _id: string; name: string }[]
  >([]);
  // Project scope — required for non-admins so data stays within their project
  const [selectedProjectScope, setSelectedProjectScope] = useState<string>("");
  const [openProjectPicker, setOpenProjectPicker] = useState<number | null>(
    null,
  );
  const [tagDraftValues, setTagDraftValues] = useState<Record<number, string>>(
    {},
  );

  // Load user's projects for the project scope + filter dropdowns
  useEffect(() => {
    fetch(`${API_CONFIG.API_URL}/projects/my-projects`, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.projects)
          ? d.projects
          : Array.isArray(d?.data)
            ? d.data
            : Array.isArray(d?.data?.projects)
              ? d.data.projects
              : [];
        setProjectOptions(list);
        // Auto-select the first project for non-admins
        if (!isAdmin && list.length === 1 && !selectedProjectScope) {
          setSelectedProjectScope(list[0]._id);
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  // Pre-populate form when editing an existing report
  useEffect(() => {
    if (editingReport) {
      setReportName(editingReport.name);
      setReportDesc(editingReport.description ?? "");
      setSelectedKeys([...editingReport.dataPoints]);
      // Infer the data source from the report's data-point keys.
      const fk = editingReport.dataPoints[0] || "";
      setSourceFilter(
        fk.startsWith("user_")
          ? "user"
          : fk.startsWith("inv_")
            ? "asset_inventory"
            : fk.startsWith("asset_")
              ? "asset"
              : fk.startsWith("audit_")
                ? "asset_audit"
                : fk.startsWith("fbr_")
                  ? "feedback"
                  : "ticket",
      );
      setFilters(editingReport.filters ? [...editingReport.filters] : []);
      setSortBy(editingReport.sortBy ?? "ticket_created_at");
      setSortOrder((editingReport.sortOrder as "asc" | "desc") ?? "desc");
      setSelectedProjectScope((editingReport as any).projectId ?? "");
      setReportMode(
        (editingReport as any).reportMode === "summary" ? "summary" : "detail",
      );
      setPivotRow((editingReport as any).pivotRow ?? "");
      setPivotCol((editingReport as any).pivotCol ?? "");
      setPreviewRows([]);
      setPreviewColumns(null);
      setError("");
      setSuccess("");
    } else {
      // Cleared (new report mode)
      setReportName("");
      setReportDesc("");
      setSelectedKeys([]);
      setFilters([]);
      setSortBy("ticket_created_at");
      setSortOrder("desc");
      setSourceFilter("ticket");
      setPreviewRows([]);
      setError("");
      setSuccess("");
    }
  }, [editingReport]);

  const loadDataPoints = (projectId?: string) => {
    setDpLoading(true);
    const url = projectId
      ? `${API_CONFIG.API_URL}/reports/data-points?projectId=${encodeURIComponent(projectId)}`
      : `${API_CONFIG.API_URL}/reports/data-points`;
    fetch(url, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDataPoints(d.data ?? []);
      })
      .catch(() => {})
      .finally(() => setDpLoading(false));
  };

  // Reload data points (including custom form fields) whenever project scope changes
  useEffect(() => {
    loadDataPoints(selectedProjectScope || undefined);
  }, [selectedProjectScope]);

  // Scope to the selected data source first (undefined source = ticket).
  const sourceScopedDps = dataPoints.filter(
    (d) => (d.source || "ticket") === sourceFilter,
  );
  const categories = [
    "all",
    ...Array.from(new Set(sourceScopedDps.map((d: DataPoint) => d.category))),
  ];
  const filteredDps =
    catFilter === "all"
      ? sourceScopedDps
      : sourceScopedDps.filter((d) => d.category === catFilter);

  // Switching data source clears the (now-incompatible) selection + filters.
  const changeSource = (s: string) => {
    setSourceFilter(s);
    setCatFilter("all");
    setSelectedKeys([]);
    setFilters([]);
    // Pivot dimensions belong to the previous source — clear them too.
    setPivotRow("");
    setPivotCol("");
    setPreviewRows([]);
    setPreviewColumns(null);
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      { field: dataPoints[0]?.key ?? "", operator: "equals", value: "" },
    ]);
  };

  const removeFilter = (i: number) => {
    setFilters((prev) => prev.filter((_, idx) => idx !== i));
    setTagDraftValues((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = Number(k);
        if (ki < i) next[ki] = v;
        else if (ki > i) next[ki - 1] = v;
      }
      return next;
    });
    if (openProjectPicker === i) setOpenProjectPicker(null);
    else if (openProjectPicker !== null && openProjectPicker > i)
      setOpenProjectPicker(openProjectPicker - 1);
  };

  const updateFilter = (i: number, patch: Partial<ReportFilter>) => {
    setFilters((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    );
  };

  const isSummary = reportMode === "summary";

  const handlePreview = async () => {
    if (isSummary) {
      if (!pivotRow || !pivotCol)
        return setError("Pick both a Row and a Column dimension for the summary.");
      if (pivotRow === pivotCol)
        return setError("Row and Column dimensions must be different.");
    } else if (selectedKeys.length === 0) {
      return setError("Select at least one data point.");
    }
    if (!isAdmin && !selectedProjectScope)
      return setError("Please select a project scope before previewing.");
    setPreviewLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_CONFIG.API_URL}/reports/preview`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          dataPoints: isSummary ? [pivotRow, pivotCol] : selectedKeys,
          filters,
          sortBy,
          sortOrder,
          projectId: selectedProjectScope || undefined,
          reportMode,
          pivotRow: isSummary ? pivotRow : undefined,
          pivotCol: isSummary ? pivotCol : undefined,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setPreviewRows(d.data ?? []);
        setPreviewColumns(d.meta?.isPivot ? (d.meta.columns ?? null) : null);
      } else setError(d.message);
    } catch {
      setError("Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    if (!reportName.trim()) return setError("Report name is required.");
    if (isSummary) {
      if (!pivotRow || !pivotCol)
        return setError("Pick both a Row and a Column dimension for the summary.");
      if (pivotRow === pivotCol)
        return setError("Row and Column dimensions must be different.");
    } else if (selectedKeys.length === 0) {
      return setError("Select at least one data point.");
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const isEditing = Boolean(editingReport?._id);
    const url = isEditing
      ? `${API_CONFIG.API_URL}/reports/saved/${editingReport!._id}`
      : `${API_CONFIG.API_URL}/reports/saved`;
    try {
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: reportName,
          description: reportDesc,
          dataPoints: isSummary ? [pivotRow, pivotCol] : selectedKeys,
          filters,
          sortBy,
          sortOrder,
          projectId: selectedProjectScope || undefined,
          reportMode,
          pivotRow: isSummary ? pivotRow : undefined,
          pivotCol: isSummary ? pivotCol : undefined,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setSuccess(
          isEditing
            ? "Report updated successfully!"
            : "Report saved successfully!",
        );
        if (!isEditing) {
          setReportName("");
          setReportDesc("");
          setSelectedKeys([]);
          setFilters([]);
          setPreviewRows([]);
          setPreviewColumns(null);
          setReportMode("detail");
          setPivotRow("");
          setPivotCol("");
        }
        onSaved?.();
      } else setError(d.message);
    } catch {
      setError(isEditing ? "Update failed" : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const grouped: Record<string, DataPoint[]> = {};
  for (const dp of filteredDps) {
    if (!grouped[dp.category]) grouped[dp.category] = [];
    grouped[dp.category].push(dp);
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 4,
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#111827",
              margin: 0,
            }}
          >
            {editingReport
              ? `Edit Report: ${editingReport.name}`
              : "Report Builder"}
          </h2>
          {editingReport && (
            <button
              onClick={onCancelEdit}
              style={{
                padding: "3px 10px",
                fontSize: 12,
                border: "1px solid #d1d5db",
                borderRadius: 6,
                background: "#fff",
                color: "#6b7280",
                cursor: "pointer",
              }}
            >
              ✕ Cancel
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          {editingReport
            ? "Modify data points, filters, or settings, then save your changes."
            : "Select data points, add filters, name your report and save."}
        </p>
      </div>
      {error && <ErrorBanner msg={error} />}
      {success && (
        <div
          style={{
            padding: "12px 16px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: 8,
            color: "#16a34a",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {success}
        </div>
      )}

      {/* Name + Description */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#374151",
              display: "block",
              marginBottom: 4,
            }}
          >
            Report Name *
          </label>
          <input
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="e.g. Monthly Open Tickets"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#374151",
              display: "block",
              marginBottom: 4,
            }}
          >
            Description
          </label>
          <input
            value={reportDesc}
            onChange={(e) => setReportDesc(e.target.value)}
            placeholder="Optional description…"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Project Scope — required for non-admins, optional for admins */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#374151",
            display: "block",
            marginBottom: 4,
          }}
        >
          Project Scope{" "}
          {!isAdmin && <span style={{ color: "#dc2626" }}>*</span>}
          {isAdmin && (
            <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>
              (leave blank to include all projects)
            </span>
          )}
        </label>
        <select
          value={selectedProjectScope}
          onChange={(e) => setSelectedProjectScope(e.target.value)}
          style={{
            padding: "8px 12px",
            border: `1px solid ${!isAdmin && !selectedProjectScope ? "#fca5a5" : "#d1d5db"}`,
            borderRadius: 8,
            fontSize: 13,
            background: "#fff",
            color: selectedProjectScope ? "#111827" : "#9ca3af",
            minWidth: 280,
          }}
        >
          {isAdmin && <option value="">All Projects</option>}
          {!isAdmin && <option value="">— Select a project —</option>}
          {projectOptions.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        {!isAdmin && !selectedProjectScope && (
          <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
            You must select a project. Report data will be scoped to this
            project only.
          </div>
        )}
        {!isAdmin && selectedProjectScope && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
            Report data will be limited to tickets from this project.
          </div>
        )}
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}
      >
        {/* Left: Data Point Picker */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: "#f8fafc",
              padding: "12px 16px",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              Data Points
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
              {selectedKeys.length} selected
            </div>
          </div>
          {/* Data source selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              padding: "10px 12px",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
              Data Source:
            </span>
            {[
              { key: "ticket", label: "Tickets" },
              { key: "user", label: "Users" },
              // Assets is a single tab grouping 3 collections (sub-switch below).
              { key: "asset", label: "Assets", group: ["asset", "asset_inventory", "asset_audit"] },
              { key: "feedback", label: "Feedback" },
              { key: "service_request", label: "Service Requests" },
              { key: "call", label: "Calls" },
              { key: "email_intake", label: "Email Intake" },
              { key: "inquiry", label: "Inquiries" },
            ].map((s: any) => {
              const active = s.group
                ? s.group.includes(sourceFilter)
                : sourceFilter === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => changeSource(s.key)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    border: active ? "1px solid #2563eb" : "1px solid #e5e7eb",
                    cursor: "pointer",
                    background: active ? "#2563eb" : "#fff",
                    color: active ? "#fff" : "#374151",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {/* Asset sub-switch (only for the Assets group) */}
          {["asset", "asset_inventory", "asset_audit"].includes(sourceFilter) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 6,
                padding: "8px 12px",
                background: "#f9fafb",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
                Asset View:
              </span>
              {[
                { key: "asset", label: "Asset Details" },
                { key: "asset_inventory", label: "Inventory (center · counts · audit status)" },
                { key: "asset_audit", label: "Audit History" },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => changeSource(s.key)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    border:
                      sourceFilter === s.key
                        ? "1px solid #2563eb"
                        : "1px solid #e5e7eb",
                    cursor: "pointer",
                    background: sourceFilter === s.key ? "#dbeafe" : "#fff",
                    color: sourceFilter === s.key ? "#1d4ed8" : "#6b7280",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {/* Category tabs */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              padding: "8px 12px",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  background: catFilter === cat ? "#3b82f6" : "#f3f4f6",
                  color: catFilter === cat ? "#fff" : "#374151",
                }}
              >
                {cat === "all" ? "All" : cat}
              </button>
            ))}
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto", padding: 8 }}>
            {dpLoading ? (
              <div
                style={{
                  padding: "24px 8px",
                  textAlign: "center",
                  color: "#9ca3af",
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    border: "2px solid #e5e7eb",
                    borderTopColor: "#3b82f6",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    margin: "0 auto 8px",
                  }}
                />
                Loading data points…
              </div>
            ) : dataPoints.length === 0 ? (
              <div style={{ padding: "24px 8px", textAlign: "center" }}>
                <div
                  style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}
                >
                  No data points found in database.
                </div>
                <button
                  onClick={() => loadDataPoints()}
                  style={{
                    padding: "6px 14px",
                    background: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Reload
                </button>
              </div>
            ) : (
              Object.entries(grouped).map(([cat, dps]) => (
                <div key={cat}>
                  <div
                    style={{
                      padding: "4px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: CATEGORY_COLORS[cat] ?? "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {cat}
                  </div>
                  {dps.map((dp) => (
                    <label
                      key={dp.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 8px",
                        borderRadius: 6,
                        cursor: "pointer",
                        background: selectedKeys.includes(dp.key)
                          ? "#eff6ff"
                          : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedKeys.includes(dp.key)}
                        onChange={() => toggleKey(dp.key)}
                        style={{
                          accentColor: "#3b82f6",
                          width: 14,
                          height: 14,
                        }}
                      />
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: selectedKeys.includes(dp.key)
                              ? 600
                              : 400,
                            color: "#374151",
                          }}
                        >
                          {dp.label}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Filters + Preview */}
        <div>
          {/* Filters */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: "#f8fafc",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
                Filters
              </div>
              <button
                onClick={addFilter}
                style={{
                  padding: "4px 12px",
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                + Add Filter
              </button>
            </div>
            {filters.length === 0 ? (
              <div
                style={{
                  padding: "20px 16px",
                  textAlign: "center",
                  color: "#9ca3af",
                  fontSize: 13,
                }}
              >
                No filters — showing all records
              </div>
            ) : (
              <div style={{ padding: 12 }}>
                {filters.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 8,
                      background: "#f9fafb",
                      padding: 8,
                      borderRadius: 8,
                    }}
                  >
                    <select
                      value={f.field}
                      onChange={(e) => {
                        const newField = e.target.value;
                        const patch: Partial<ReportFilter> = {
                          field: newField,
                          value: "",
                        };
                        if (newField === "ticket_project")
                          patch.operator = "in";
                        updateFilter(i, patch);
                        setOpenProjectPicker(null);
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        border: "1px solid #d1d5db",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      {dataPoints.map((dp) => (
                        <option key={dp.key} value={dp.key}>
                          {dp.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.operator}
                      onChange={(e) =>
                        updateFilter(i, { operator: e.target.value })
                      }
                      style={{
                        width: 120,
                        padding: "6px 8px",
                        border: "1px solid #d1d5db",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      {FILTER_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    {f.operator !== "is_empty" &&
                      f.operator !== "is_not_empty" &&
                      (f.operator === "in" ? (
                        // ── "any of" multi-value input ──────────────────────
                        f.field === "ticket_project" &&
                        projectOptions.length > 0 ? (
                          // Project: checkbox dropdown
                          (() => {
                            const selectedNames = f.value
                              ? f.value.split(",").filter(Boolean)
                              : [];
                            return (
                              <div style={{ flex: 1, position: "relative" }}>
                                <div
                                  onClick={() =>
                                    setOpenProjectPicker(
                                      openProjectPicker === i ? null : i,
                                    )
                                  }
                                  style={{
                                    padding: "6px 10px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    cursor: "pointer",
                                    background: "#fff",
                                    minHeight: 32,
                                    display: "flex",
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                    gap: 4,
                                    userSelect: "none",
                                  }}
                                >
                                  {selectedNames.length === 0 ? (
                                    <span style={{ color: "#9ca3af" }}>
                                      — select projects —
                                    </span>
                                  ) : (
                                    selectedNames.map((name) => (
                                      <span
                                        key={name}
                                        style={{
                                          background: "#ede9fe",
                                          color: "#7c3aed",
                                          fontSize: 11,
                                          padding: "1px 7px",
                                          borderRadius: 10,
                                          fontWeight: 600,
                                        }}
                                      >
                                        {name}
                                      </span>
                                    ))
                                  )}
                                  <span
                                    style={{
                                      marginLeft: "auto",
                                      color: "#9ca3af",
                                      fontSize: 10,
                                    }}
                                  >
                                    ▾
                                  </span>
                                </div>
                                {openProjectPicker === i && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "calc(100% + 4px)",
                                      left: 0,
                                      right: 0,
                                      background: "#fff",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 8,
                                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                                      zIndex: 200,
                                      maxHeight: 200,
                                      overflowY: "auto",
                                    }}
                                  >
                                    {projectOptions.map((p) => {
                                      const checked = selectedNames.includes(
                                        p.name,
                                      );
                                      return (
                                        <label
                                          key={p._id}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "7px 12px",
                                            cursor: "pointer",
                                            background: checked
                                              ? "#f5f3ff"
                                              : "transparent",
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => {
                                              const next = checked
                                                ? selectedNames.filter(
                                                    (n) => n !== p.name,
                                                  )
                                                : [...selectedNames, p.name];
                                              updateFilter(i, {
                                                value: next.join(","),
                                              });
                                            }}
                                          />
                                          <span style={{ fontSize: 12 }}>
                                            {p.name}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          // Any other field: tag/chip input (type + Enter)
                          (() => {
                            const chips = f.value
                              ? f.value.split(",").filter(Boolean)
                              : [];
                            const draft = tagDraftValues[i] ?? "";
                            return (
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "4px 8px",
                                  border: "1px solid #d1d5db",
                                  borderRadius: 6,
                                  background: "#fff",
                                  minHeight: 32,
                                  cursor: "text",
                                }}
                                onClick={(e) => {
                                  const inp = (
                                    e.currentTarget as HTMLElement
                                  ).querySelector(
                                    "input",
                                  ) as HTMLInputElement | null;
                                  inp?.focus();
                                }}
                              >
                                {chips.map((chip) => (
                                  <span
                                    key={chip}
                                    style={{
                                      background: "#dbeafe",
                                      color: "#1d4ed8",
                                      fontSize: 11,
                                      padding: "1px 4px 1px 7px",
                                      borderRadius: 10,
                                      fontWeight: 600,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 3,
                                    }}
                                  >
                                    {chip}
                                    <span
                                      onClick={() =>
                                        updateFilter(i, {
                                          value: chips
                                            .filter((c) => c !== chip)
                                            .join(","),
                                        })
                                      }
                                      style={{
                                        cursor: "pointer",
                                        fontWeight: 700,
                                        lineHeight: 1,
                                        opacity: 0.6,
                                      }}
                                    >
                                      ×
                                    </span>
                                  </span>
                                ))}
                                <input
                                  value={draft}
                                  onChange={(e) =>
                                    setTagDraftValues((prev) => ({
                                      ...prev,
                                      [i]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (
                                      (e.key === "Enter" || e.key === ",") &&
                                      draft.trim()
                                    ) {
                                      e.preventDefault();
                                      const newChip = draft.trim();
                                      if (!chips.includes(newChip))
                                        updateFilter(i, {
                                          value: [...chips, newChip].join(","),
                                        });
                                      setTagDraftValues((prev) => ({
                                        ...prev,
                                        [i]: "",
                                      }));
                                    } else if (
                                      e.key === "Backspace" &&
                                      !draft &&
                                      chips.length > 0
                                    ) {
                                      updateFilter(i, {
                                        value: chips.slice(0, -1).join(","),
                                      });
                                    }
                                  }}
                                  placeholder={
                                    chips.length === 0
                                      ? "Type value, press Enter"
                                      : "+add"
                                  }
                                  style={{
                                    border: "none",
                                    outline: "none",
                                    fontSize: 12,
                                    flex: 1,
                                    minWidth: 80,
                                    background: "transparent",
                                  }}
                                />
                              </div>
                            );
                          })()
                        )
                      ) : (
                        // ── Normal single-value input ────────────────────────
                        <input
                          value={f.value}
                          onChange={(e) =>
                            updateFilter(i, { value: e.target.value })
                          }
                          placeholder="Value"
                          style={{
                            flex: 1,
                            padding: "6px 8px",
                            border: "1px solid #d1d5db",
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        />
                      ))}
                    {f.operator === "between" && (
                      <input
                        value={f.value2 ?? ""}
                        onChange={(e) =>
                          updateFilter(i, { value2: e.target.value })
                        }
                        placeholder="To"
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                    )}
                    <button
                      onClick={() => removeFilter(i)}
                      style={{
                        padding: "4px 8px",
                        background: "#fee2e2",
                        color: "#dc2626",
                        border: "none",
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Report mode: Detail vs Summary (pivot table of counts) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              Report type:
            </span>
            <div
              style={{
                display: "flex",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {(["detail", "summary"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setReportMode(m);
                    setPreviewRows([]);
                    setPreviewColumns(null);
                  }}
                  style={{
                    padding: "5px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: reportMode === m ? "#6366f1" : "#fff",
                    color: reportMode === m ? "#fff" : "#374151",
                  }}
                >
                  {m === "detail" ? "Detail" : "Summary (counts)"}
                </button>
              ))}
            </div>
            {isSummary && (
              <>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    marginLeft: 8,
                  }}
                >
                  Rows:
                </span>
                <select
                  value={pivotRow}
                  onChange={(e) => setPivotRow(e.target.value)}
                  style={{
                    padding: "5px 8px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <option value="">Select dimension…</option>
                  {sourceScopedDps.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <span
                  style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}
                >
                  Columns:
                </span>
                <select
                  value={pivotCol}
                  onChange={(e) => setPivotCol(e.target.value)}
                  style={{
                    padding: "5px 8px",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <option value="">Select dimension…</option>
                  {sourceScopedDps.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  cells = count (with a Total column)
                </span>
              </>
            )}
          </div>

          {/* Sort + actions */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                Sort by:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: "5px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {selectedKeys.map((k) => {
                  const dp = dataPoints.find((d) => d.key === k);
                  return (
                    <option key={k} value={k}>
                      {dp?.label ?? k}
                    </option>
                  );
                })}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                style={{
                  padding: "5px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                onClick={handlePreview}
                disabled={
                  previewLoading ||
                  (isSummary
                    ? !pivotRow || !pivotCol
                    : selectedKeys.length === 0)
                }
                style={{
                  padding: "7px 16px",
                  background: "#6366f1",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {previewLoading
                  ? "Loading…"
                  : isSummary
                    ? "👁 Preview summary"
                    : "👁 Preview (10 rows)"}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "7px 16px",
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saving
                  ? "Saving…"
                  : editingReport
                    ? "💾 Update Report"
                    : "💾 Save Report"}
              </button>
            </div>
          </div>

          {/* Preview table */}
          {previewRows.length > 0 && (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  padding: "8px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Preview — {previewRows.length} rows
              </div>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "#f8fafc",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {(previewColumns ?? selectedKeys).map((k) => {
                        // Pivot: only the row-dimension key maps to a data-point
                        // label; the other columns are literal values + "Total".
                        const label = previewColumns
                          ? k === pivotRow
                            ? (dataPoints.find((d) => d.key === k)?.label ?? k)
                            : k
                          : (dataPoints.find((d) => d.key === k)?.label ?? k);
                        return (
                          <th
                            key={k}
                            style={{
                              padding: "8px 12px",
                              textAlign: "left",
                              fontWeight: 600,
                              color: "#374151",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {label}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          background: i % 2 === 0 ? "#fff" : "#f9fafb",
                        }}
                      >
                        {(previewColumns ?? selectedKeys).map((k) => (
                          <td
                            key={k}
                            style={{
                              padding: "6px 12px",
                              color: "#374151",
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {row[k] !== null && row[k] !== undefined ? (
                              Array.isArray(row[k]) ? (
                                row[k].join(", ")
                              ) : (
                                formatCellValue(row[k])
                              )
                            ) : (
                              <span style={{ color: "#d1d5db" }}>—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Saved Reports
// ─────────────────────────────────────────────────────────────────────────────

function SavedReportsSection({
  onEdit,
}: {
  onEdit?: (r: SavedReport) => void;
}) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    reportId: string;
    rows: any[];
    dataPoints: string[];
    total: number;
    columns?: string[];
    isPivot?: boolean;
    pivotRow?: string;
  } | null>(null);
  const [runPage, setRunPage] = useState(1);
  const [runPageSize] = useState(100);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dpMap, setDpMap] = useState<Record<string, string>>({});
  // Duplicate state
  const [dupId, setDupId] = useState<string | null>(null);
  const [dupName, setDupName] = useState("");
  const [dupError, setDupError] = useState("");
  const [dupSaving, setDupSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_CONFIG.API_URL}/reports/saved?pageSize=50`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
      fetch(`${API_CONFIG.API_URL}/reports/data-points`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
    ])
      .then(([rd, dpd]) => {
        if (rd.success) setReports(rd.data);
        if (dpd.success) {
          const map: Record<string, string> = {};
          dpd.data.forEach((d: DataPoint) => {
            map[d.key] = d.label;
          });
          setDpMap(map);
        }
      })
      .catch(() => setError("Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRun = async (report: SavedReport, page = 1) => {
    setRunning(report._id);
    setError("");
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/saved/${report._id}/run?pageSize=${runPageSize}&page=${page}`,
        {
          method: "POST",
          headers: authHeaders(),
        },
      );
      const d = await res.json();
      if (d.success) {
        setRunPage(page);
        setRunResult({
          reportId: report._id,
          rows: d.data,
          dataPoints: d.meta.dataPoints,
          total: d.meta.total,
          columns: d.meta.isPivot ? d.meta.columns : undefined,
          isPivot: !!d.meta.isPivot,
          pivotRow: d.meta.pivotRow,
        });
      } else setError(d.message);
    } catch {
      setError("Run failed");
    } finally {
      setRunning(null);
    }
  };

  const handleExport = async (reportId: string, reportName?: string) => {
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/saved/${reportId}/export`,
        { headers: authHeaders() },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(reportName ?? "report").replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm("Delete this report?")) return;
    try {
      await fetch(`${API_CONFIG.API_URL}/reports/saved/${reportId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setReports((prev) => prev.filter((r) => r._id !== reportId));
    } catch {
      setError("Delete failed");
    }
  };

  const openDuplicate = (r: SavedReport) => {
    setDupId(r._id);
    setDupName(`${r.name} (Copy)`);
    setDupError("");
  };

  const handleDuplicate = async () => {
    const trimmed = dupName.trim();
    if (!trimmed) {
      setDupError("Name is required.");
      return;
    }
    if (reports.some((r) => r.name.toLowerCase() === trimmed.toLowerCase())) {
      setDupError(
        "A report with this name already exists. Choose a different name.",
      );
      return;
    }
    const source = reports.find((r) => r._id === dupId);
    if (!source) return;
    setDupSaving(true);
    setDupError("");
    try {
      const res = await fetch(`${API_CONFIG.API_URL}/reports/saved`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: trimmed,
          description: source.description,
          dataPoints: source.dataPoints,
          filters: source.filters,
          sortBy: source.sortBy,
          sortOrder: source.sortOrder,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setDupId(null);
        load();
      } else {
        setDupError(d.message ?? "Duplicate failed");
      }
    } catch {
      setDupError("Duplicate failed");
    } finally {
      setDupSaving(false);
    }
  };

  const filtered = reports.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <Spinner />;

  return (
    <div>
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
              fontSize: 18,
              fontWeight: 700,
              color: "#111827",
              margin: 0,
            }}
          >
            Saved Reports
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            {reports.length} reports saved
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports…"
          style={{
            padding: "7px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 13,
            width: 210,
          }}
        />
      </div>
      {error && <ErrorBanner msg={error} />}

      {filtered.length === 0 ? (
        <div
          style={{
            padding: "60px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
          }}
        >
          No saved reports yet. Use the <strong>Report Builder</strong> to
          create one.
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
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
              {filtered.map((r, i) => (
                <tr
                  key={r._id}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#f9fafb",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>
                      {r.name}
                    </div>
                    {r.description && (
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        {r.description}
                      </div>
                    )}
                    {r.rowCount !== undefined && (
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        {r.rowCount.toLocaleString()} rows
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
                          {getDataPointLabel(k, dpMap)}
                        </span>
                      ))}
                      {r.dataPoints.length > 4 && (
                        <span style={{ fontSize: 10, color: "#6b7280" }}>
                          +{r.dataPoints.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      color: "#6b7280",
                      fontSize: 12,
                    }}
                  >
                    {r.filters.length > 0
                      ? `${r.filters.length} filter${r.filters.length > 1 ? "s" : ""}`
                      : "None"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      {(r.assignedUsersCount ?? 0) +
                        (r.assignedRolesCount ?? 0) >
                      0
                        ? `${r.assignedUsersCount}U · ${r.assignedRolesCount}R`
                        : "—"}
                    </span>
                  </td>
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
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "center",
                      }}
                    >
                      <button
                        onClick={() => handleRun(r)}
                        disabled={running === r._id}
                        style={{
                          padding: "4px 10px",
                          background: "#3b82f6",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {running === r._id ? "…" : "▶ Run"}
                      </button>
                      <button
                        onClick={() => onEdit?.(r)}
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
                        onClick={() => openDuplicate(r)}
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
                        onClick={() => handleExport(r._id, r.name)}
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
                      <button
                        onClick={() => handleDelete(r._id)}
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
      )}

      {/* Duplicate Report Modal */}
      {dupId && (
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
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
              Enter a unique name for the duplicated report.
            </p>
            <input
              value={dupName}
              onChange={(e) => {
                setDupName(e.target.value);
                setDupError("");
              }}
              placeholder="New report name"
              autoFocus
              style={{
                width: "100%",
                padding: "8px 12px",
                border: dupError ? "1px solid #ef4444" : "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 13,
                marginBottom: dupError ? 6 : 16,
                boxSizing: "border-box",
              }}
            />
            {dupError && (
              <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 12 }}>
                {dupError}
              </p>
            )}
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setDupId(null)}
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
                onClick={handleDuplicate}
                disabled={dupSaving}
                style={{
                  padding: "7px 18px",
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: dupSaving ? "not-allowed" : "pointer",
                  opacity: dupSaving ? 0.7 : 1,
                }}
              >
                {dupSaving ? "Saving…" : "⎘ Duplicate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run result panel */}
      {runResult && (
        <div
          style={{
            marginTop: 24,
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
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
              Results — {runResult.total.toLocaleString()} total rows (showing{" "}
              {runResult.rows.length})
            </div>
            <button
              onClick={() => {
                setRunResult(null);
                setRunPage(1);
              }}
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
          <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
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
                  {(runResult.isPivot && runResult.columns
                    ? runResult.columns
                    : runResult.dataPoints
                  ).map((k) => (
                    <th
                      key={k}
                      style={{
                        padding: "7px 12px",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#374151",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {runResult.isPivot
                        ? k === runResult.pivotRow
                          ? getDataPointLabel(k, dpMap)
                          : k
                        : getDataPointLabel(k, dpMap)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runResult.rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      background: i % 2 === 0 ? "#fff" : "#f9fafb",
                    }}
                  >
                    {(runResult.isPivot && runResult.columns
                      ? runResult.columns
                      : runResult.dataPoints
                    ).map((k) => (
                      <td
                        key={k}
                        style={{
                          padding: "6px 12px",
                          color: "#374151",
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row[k] !== null && row[k] !== undefined ? (
                          Array.isArray(row[k]) ? (
                            row[k].join(", ")
                          ) : (
                            formatCellValue(row[k])
                          )
                        ) : (
                          <span style={{ color: "#d1d5db" }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {runResult.total > runPageSize &&
            (() => {
              const totalPages = Math.ceil(runResult.total / runPageSize);
              const currentReport = reports.find(
                (r) => r._id === runResult.reportId,
              );
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 16px",
                    borderTop: "1px solid #e5e7eb",
                    background: "#f8fafc",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    disabled={runPage <= 1 || running !== null}
                    onClick={() =>
                      currentReport && handleRun(currentReport, runPage - 1)
                    }
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: runPage <= 1 ? "#f3f4f6" : "#fff",
                      color: runPage <= 1 ? "#9ca3af" : "#374151",
                      cursor: runPage <= 1 ? "default" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    ← Prev
                  </button>
                  {Array.from(
                    { length: Math.min(totalPages, 10) },
                    (_, idx) => {
                      // Show first, last, current ±2, and ellipsis
                      const p = idx + 1;
                      return (
                        <button
                          key={p}
                          disabled={p === runPage || running !== null}
                          onClick={() =>
                            currentReport && handleRun(currentReport, p)
                          }
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            background: p === runPage ? "#3b82f6" : "#fff",
                            color: p === runPage ? "#fff" : "#374151",
                            cursor: p === runPage ? "default" : "pointer",
                            fontSize: 12,
                            fontWeight: p === runPage ? 700 : 400,
                            minWidth: 32,
                          }}
                        >
                          {running !== null && p === runPage ? "…" : p}
                        </button>
                      );
                    },
                  )}
                  {totalPages > 10 && (
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      … of {totalPages}
                    </span>
                  )}
                  <button
                    disabled={runPage >= totalPages || running !== null}
                    onClick={() =>
                      currentReport && handleRun(currentReport, runPage + 1)
                    }
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: runPage >= totalPages ? "#f3f4f6" : "#fff",
                      color: runPage >= totalPages ? "#9ca3af" : "#374151",
                      cursor: runPage >= totalPages ? "default" : "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Next →
                  </button>
                  <span
                    style={{ fontSize: 12, color: "#6b7280", marginLeft: 4 }}
                  >
                    Page {runPage} of {totalPages} &nbsp;·&nbsp;{" "}
                    {runResult.total.toLocaleString()} rows total
                  </span>
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: My Reports (reports assigned to the logged-in user)
// ─────────────────────────────────────────────────────────────────────────────

function MyReportsSection() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    reportId: string;
    rows: any[];
    dataPoints: string[];
  } | null>(null);
  const [dpMap, setDpMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  // columnFilters: { [reportId]: { [colKey]: string | string[] | { from: string; to: string } } }
  const [columnFilters, setColumnFilters] = useState<
    Record<
      string,
      Record<string, string | string[] | { from: string; to: string }>
    >
  >({});
  // openDropdown: "reportId:colKey" or null
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Close any open dropdown when clicking outside
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-dropdown-key="${openDropdown}"]`)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  // Returns distinct sorted values for a column (used to decide dropdown vs text)
  const getDistinctValues = (rows: any[], colKey: string): string[] => {
    const vals = new Set<string>();
    rows.forEach((row) => {
      if (row[colKey] !== null && row[colKey] !== undefined) {
        if (Array.isArray(row[colKey])) {
          row[colKey].forEach((v: any) => vals.add(String(v)));
        } else {
          vals.add(String(row[colKey]));
        }
      }
    });
    return Array.from(vals).sort();
  };

  // Columns with ≤15 distinct values get a multi-select dropdown
  const shouldUseDropdown = (rows: any[], colKey: string): boolean =>
    getDistinctValues(rows, colKey).length <= 15;

  // Returns true if a column contains date/datetime values
  const isDateColumn = (rows: any[], colKey: string): boolean => {
    if (/(_at|_date|date_|_time)$/i.test(colKey)) return true;
    const sample = rows
      .slice(0, 5)
      .map((r) => r[colKey])
      .filter(Boolean);
    return sample.some((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_CONFIG.API_URL}/reports/mine`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
      fetch(`${API_CONFIG.API_URL}/reports/data-points`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
    ])
      .then(([rd, dpd]) => {
        if (rd.success) setReports(rd.data ?? []);
        if (dpd.success) {
          const map: Record<string, string> = {};
          dpd.data.forEach((d: DataPoint) => {
            map[d.key] = d.label;
          });
          setDpMap(map);
        }
      })
      .catch(() => setError("Failed to load assigned reports"))
      .finally(() => setLoading(false));
  }, []);

  const handleRun = async (report: any) => {
    setRunning(report._id);
    setError("");
    // Reset filters for this report when re-running
    setColumnFilters((prev) => ({ ...prev, [report._id]: {} }));
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/saved/${report._id}/run`,
        { method: "POST", headers: authHeaders() },
      );
      const d = await res.json();
      if (d.success) {
        // Aggregated reports return their columns in meta.columns:
        //  - Summary (pivot): meta.columns is a plain string[] (row dim, values…, Total)
        //  - Footfall: meta.columns is [{ key }] objects
        // Detail reports use the saved report's selected dataPoints.
        const cols: string[] = d.meta?.isPivot
          ? (d.meta.columns ?? [])
          : d.meta?.reportType === "footfall" && Array.isArray(d.meta?.columns)
            ? d.meta.columns.map((c: { key: string }) => c.key)
            : report.dataPoints;
        setRunResult({
          reportId: report._id,
          rows: d.data,
          dataPoints: cols,
        });
      } else setError(d.message);
    } catch {
      setError("Run failed");
    } finally {
      setRunning(null);
    }
  };

  const getFilteredRows = (
    reportId: string,
    rows: any[],
    dataPoints: string[],
  ) => {
    const filters = columnFilters[reportId] ?? {};
    const hasActive = Object.values(filters).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "object" && v !== null) return Boolean(v.from || v.to);
      return Boolean(v);
    });
    if (!hasActive) return rows;
    return rows.filter((row) =>
      dataPoints.every((k) => {
        const filter = filters[k];
        if (!filter) return true;
        if (Array.isArray(filter)) {
          if (filter.length === 0) return true;
          const cell =
            row[k] !== null && row[k] !== undefined
              ? Array.isArray(row[k])
                ? row[k].join(", ")
                : String(row[k])
              : "";
          return filter.some((f) => cell.toLowerCase() === f.toLowerCase());
        }
        if (
          typeof filter === "object" &&
          ("from" in filter || "to" in filter)
        ) {
          const { from, to } = filter as { from: string; to: string };
          if (!from && !to) return true;
          const raw = row[k];
          if (raw === null || raw === undefined) return false;
          const cellDate = new Date(String(raw));
          if (isNaN(cellDate.getTime())) return false;
          if (from) {
            const fromDate = new Date(from);
            fromDate.setHours(0, 0, 0, 0);
            if (cellDate < fromDate) return false;
          }
          if (to) {
            const toDate = new Date(to);
            toDate.setHours(23, 59, 59, 999);
            if (cellDate > toDate) return false;
          }
          return true;
        }
        // Text filter
        if (!filter) return true;
        const cell =
          row[k] !== null && row[k] !== undefined
            ? Array.isArray(row[k])
              ? row[k].join(", ")
              : String(row[k])
            : "";
        return cell
          .toLowerCase()
          .includes((filter as string).toLowerCase().trim());
      }),
    );
  };

  const handleExport = (reportId: string, reportName?: string) => {
    const result = runResult?.reportId === reportId ? runResult : null;
    if (!result) {
      alert("Please run the report first before exporting.");
      return;
    }
    const rows = getFilteredRows(reportId, result.rows, result.dataPoints);
    const headers = result.dataPoints.map((k) => getDataPointLabel(k, dpMap));
    const csvRows = [
      headers.join(","),
      ...rows.map((row) =>
        result.dataPoints
          .map((k) => {
            const val =
              row[k] !== null && row[k] !== undefined
                ? Array.isArray(row[k])
                  ? row[k].join("; ")
                  : String(row[k])
                : "";
            // Escape quotes and wrap in quotes if needed
            const escaped = val.replace(/"/g, '""');
            return /[,"\n]/.test(escaped) ? `"${escaped}"` : escaped;
          })
          .join(","),
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(reportName ?? "report").replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}
        >
          My Reports
        </h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          Reports that have been shared with you by your administrator.
        </p>
      </div>
      {error && <ErrorBanner msg={error} />}
      {reports.length === 0 ? (
        <div
          style={{
            padding: "60px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
          }}
        >
          No reports have been assigned to you yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map((report) => {
            const isRunning = running === report._id;
            const result =
              runResult?.reportId === report._id ? runResult : null;
            return (
              <div
                key={report._id}
                style={{
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
                    padding: "14px 18px",
                    background: "#fff",
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
                    {report.description && (
                      <div
                        style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}
                      >
                        {report.description}
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginTop: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {report.dataPoints?.slice(0, 6).map((k: string) => (
                        <span
                          key={k}
                          style={{
                            background: "#f3f4f6",
                            color: "#374151",
                            borderRadius: 6,
                            padding: "2px 8px",
                            fontSize: 11,
                          }}
                        >
                          {getDataPointLabel(k, dpMap)}
                        </span>
                      ))}
                      {report.dataPoints?.length > 6 && (
                        <span
                          style={{
                            background: "#f3f4f6",
                            color: "#6b7280",
                            borderRadius: 6,
                            padding: "2px 8px",
                            fontSize: 11,
                          }}
                        >
                          +{report.dataPoints.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    {report.lastRunAt && (
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>
                        Last run:{" "}
                        {new Date(report.lastRunAt).toLocaleDateString()}
                      </span>
                    )}
                    {/* Footfall reports render their own controls below; hide the
                        generic Run/CSV buttons for them. */}
                    {(report as any).reportType !== "footfall" && (
                      <>
                        <button
                          onClick={() => handleRun(report)}
                          disabled={isRunning}
                          style={{
                            padding: "7px 16px",
                            background: "#6366f1",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {isRunning ? "Running…" : "▶ Run Report"}
                        </button>
                        <button
                          onClick={() => handleExport(report._id, report.name)}
                          style={{
                            padding: "7px 14px",
                            background: "#fff",
                            color: "#374151",
                            border: "1px solid #d1d5db",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          ⬇ CSV
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {(report as any).reportType === "footfall" && (
                  <div
                    style={{
                      borderTop: "1px solid #e5e7eb",
                      padding: "14px 18px",
                    }}
                  >
                    <FootfallReportView
                      projectId={(report as any).projectId}
                      dateRangeDays={(report as any).footfallDays}
                      reportName={report.name}
                    />
                  </div>
                )}
                {(report as any).reportType !== "footfall" &&
                  result &&
                  result.rows.length > 0 && (
                  <div style={{ borderTop: "1px solid #e5e7eb" }}>
                    {(() => {
                      const filters = columnFilters[report._id] ?? {};
                      const filteredRows = getFilteredRows(
                        report._id,
                        result.rows,
                        result.dataPoints,
                      );
                      const activeFilterCount = Object.values(filters).filter(
                        (v) => {
                          if (Array.isArray(v)) return v.length > 0;
                          if (typeof v === "object" && v !== null)
                            return Boolean((v as any).from || (v as any).to);
                          return Boolean(v);
                        },
                      ).length;
                      return (
                        <>
                          <div
                            style={{
                              background: "#f8fafc",
                              padding: "8px 16px",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#374151",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span>
                              Results —{" "}
                              {activeFilterCount > 0
                                ? `${filteredRows.length} of ${result.rows.length} rows`
                                : `${result.rows.length} rows shown`}
                            </span>
                            {activeFilterCount > 0 && (
                              <button
                                onClick={() =>
                                  setColumnFilters((prev) => ({
                                    ...prev,
                                    [report._id]: {},
                                  }))
                                }
                                style={{
                                  fontSize: 11,
                                  color: "#6366f1",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 0,
                                  fontWeight: 600,
                                }}
                              >
                                ✕ Clear filters
                              </button>
                            )}
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: 12,
                              }}
                            >
                              <thead>
                                <tr
                                  style={{
                                    background: "#f8fafc",
                                    borderBottom: "1px solid #e5e7eb",
                                  }}
                                >
                                  {result.dataPoints.map((k) => (
                                    <th
                                      key={k}
                                      style={{
                                        padding: "8px 12px",
                                        textAlign: "left",
                                        fontWeight: 600,
                                        color: "#374151",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {getDataPointLabel(k, dpMap)}
                                    </th>
                                  ))}
                                </tr>
                                <tr
                                  style={{
                                    background: "#f1f5f9",
                                    borderBottom: "1px solid #e5e7eb",
                                  }}
                                >
                                  {result.dataPoints.map((k) => {
                                    const ddKey = `${report._id}:${k}`;
                                    const isOpen = openDropdown === ddKey;
                                    const filterVal = filters[k];

                                    // ── Date range filter ──────────────────
                                    if (isDateColumn(result.rows, k)) {
                                      const rangeVal =
                                        typeof filterVal === "object" &&
                                        !Array.isArray(filterVal) &&
                                        filterVal !== null
                                          ? (filterVal as {
                                              from: string;
                                              to: string;
                                            })
                                          : { from: "", to: "" };
                                      const isActive = Boolean(
                                        rangeVal.from || rangeVal.to,
                                      );
                                      return (
                                        <th
                                          key={k}
                                          style={{
                                            padding: "4px 8px",
                                            minWidth: 200,
                                          }}
                                        >
                                          <div
                                            style={{
                                              display: "flex",
                                              gap: 4,
                                              alignItems: "center",
                                            }}
                                          >
                                            <input
                                              type="date"
                                              value={rangeVal.from}
                                              onChange={(e) =>
                                                setColumnFilters((prev) => ({
                                                  ...prev,
                                                  [report._id]: {
                                                    ...(prev[report._id] ?? {}),
                                                    [k]: {
                                                      ...rangeVal,
                                                      from: e.target.value,
                                                    },
                                                  },
                                                }))
                                              }
                                              title="From date"
                                              style={{
                                                flex: 1,
                                                fontSize: 10,
                                                padding: "3px 4px",
                                                border: isActive
                                                  ? "1px solid #6366f1"
                                                  : "1px solid #d1d5db",
                                                borderRadius: 4,
                                                background: isActive
                                                  ? "#eef2ff"
                                                  : "#fff",
                                                minWidth: 0,
                                              }}
                                            />
                                            <span
                                              style={{
                                                fontSize: 10,
                                                color: "#9ca3af",
                                                flexShrink: 0,
                                              }}
                                            >
                                              →
                                            </span>
                                            <input
                                              type="date"
                                              value={rangeVal.to}
                                              onChange={(e) =>
                                                setColumnFilters((prev) => ({
                                                  ...prev,
                                                  [report._id]: {
                                                    ...(prev[report._id] ?? {}),
                                                    [k]: {
                                                      ...rangeVal,
                                                      to: e.target.value,
                                                    },
                                                  },
                                                }))
                                              }
                                              title="To date"
                                              style={{
                                                flex: 1,
                                                fontSize: 10,
                                                padding: "3px 4px",
                                                border: isActive
                                                  ? "1px solid #6366f1"
                                                  : "1px solid #d1d5db",
                                                borderRadius: 4,
                                                background: isActive
                                                  ? "#eef2ff"
                                                  : "#fff",
                                                minWidth: 0,
                                              }}
                                            />
                                          </div>
                                        </th>
                                      );
                                    }

                                    const selectedArr = Array.isArray(filterVal)
                                      ? (filterVal as string[])
                                      : [];
                                    const isActive = Array.isArray(filterVal)
                                      ? selectedArr.length > 0
                                      : Boolean(filterVal);
                                    if (shouldUseDropdown(result.rows, k)) {
                                      const options = getDistinctValues(
                                        result.rows,
                                        k,
                                      );
                                      return (
                                        <th
                                          key={k}
                                          style={{
                                            padding: "4px 8px",
                                            position: "relative",
                                          }}
                                          data-dropdown-key={ddKey}
                                        >
                                          {/* Trigger button */}
                                          <button
                                            onClick={() =>
                                              setOpenDropdown(
                                                isOpen ? null : ddKey,
                                              )
                                            }
                                            style={{
                                              width: "100%",
                                              fontSize: 11,
                                              padding: "3px 6px",
                                              border: isActive
                                                ? "1px solid #6366f1"
                                                : "1px solid #d1d5db",
                                              borderRadius: 4,
                                              background: isActive
                                                ? "#eef2ff"
                                                : "#fff",
                                              cursor: "pointer",
                                              textAlign: "left",
                                              display: "flex",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                              minWidth: 80,
                                              color: isActive
                                                ? "#4338ca"
                                                : "#9ca3af",
                                              fontWeight: isActive ? 600 : 400,
                                            }}
                                          >
                                            <span
                                              style={{
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                              }}
                                            >
                                              {selectedArr.length === 0
                                                ? "All"
                                                : selectedArr.length === 1
                                                  ? selectedArr[0]
                                                  : `${selectedArr.length} selected`}
                                            </span>
                                            <span style={{ marginLeft: 4 }}>
                                              ▾
                                            </span>
                                          </button>
                                          {/* Dropdown panel */}
                                          {isOpen && (
                                            <div
                                              style={{
                                                position: "absolute",
                                                top: "100%",
                                                left: 0,
                                                zIndex: 1000,
                                                background: "#fff",
                                                border: "1px solid #d1d5db",
                                                borderRadius: 6,
                                                boxShadow:
                                                  "0 4px 12px rgba(0,0,0,0.12)",
                                                minWidth: 160,
                                                maxHeight: 220,
                                                overflowY: "auto",
                                                padding: "4px 0",
                                              }}
                                            >
                                              {/* Select all / Clear header */}
                                              <div
                                                style={{
                                                  display: "flex",
                                                  justifyContent:
                                                    "space-between",
                                                  padding: "4px 10px",
                                                  borderBottom:
                                                    "1px solid #f3f4f6",
                                                  marginBottom: 2,
                                                }}
                                              >
                                                <button
                                                  onClick={() =>
                                                    setColumnFilters(
                                                      (prev) => ({
                                                        ...prev,
                                                        [report._id]: {
                                                          ...(prev[
                                                            report._id
                                                          ] ?? {}),
                                                          [k]: options,
                                                        },
                                                      }),
                                                    )
                                                  }
                                                  style={{
                                                    fontSize: 10,
                                                    color: "#6366f1",
                                                    background: "none",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    padding: 0,
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  All
                                                </button>
                                                <button
                                                  onClick={() =>
                                                    setColumnFilters(
                                                      (prev) => ({
                                                        ...prev,
                                                        [report._id]: {
                                                          ...(prev[
                                                            report._id
                                                          ] ?? {}),
                                                          [k]: [],
                                                        },
                                                      }),
                                                    )
                                                  }
                                                  style={{
                                                    fontSize: 10,
                                                    color: "#ef4444",
                                                    background: "none",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    padding: 0,
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  Clear
                                                </button>
                                              </div>
                                              {options.map((opt) => {
                                                const checked =
                                                  selectedArr.includes(opt);
                                                return (
                                                  <label
                                                    key={opt}
                                                    style={{
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: 6,
                                                      padding: "5px 10px",
                                                      cursor: "pointer",
                                                      fontSize: 12,
                                                      color: "#374151",
                                                      background: checked
                                                        ? "#eef2ff"
                                                        : "transparent",
                                                    }}
                                                    onMouseDown={(e) => {
                                                      // Prevent dropdown close on option click
                                                      e.stopPropagation();
                                                    }}
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={checked}
                                                      onChange={() => {
                                                        const next = checked
                                                          ? selectedArr.filter(
                                                              (v) => v !== opt,
                                                            )
                                                          : [
                                                              ...selectedArr,
                                                              opt,
                                                            ];
                                                        setColumnFilters(
                                                          (prev) => ({
                                                            ...prev,
                                                            [report._id]: {
                                                              ...(prev[
                                                                report._id
                                                              ] ?? {}),
                                                              [k]: next,
                                                            },
                                                          }),
                                                        );
                                                      }}
                                                      style={{
                                                        accentColor: "#6366f1",
                                                      }}
                                                    />
                                                    {opt}
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </th>
                                      );
                                    }
                                    // Text input for high-cardinality columns
                                    return (
                                      <th
                                        key={k}
                                        style={{ padding: "4px 8px" }}
                                      >
                                        <input
                                          type="text"
                                          placeholder="Filter…"
                                          value={
                                            typeof filterVal === "string"
                                              ? filterVal
                                              : ""
                                          }
                                          onChange={(e) =>
                                            setColumnFilters((prev) => ({
                                              ...prev,
                                              [report._id]: {
                                                ...(prev[report._id] ?? {}),
                                                [k]: e.target.value,
                                              },
                                            }))
                                          }
                                          style={{
                                            width: "100%",
                                            fontSize: 11,
                                            padding: "3px 6px",
                                            border: isActive
                                              ? "1px solid #6366f1"
                                              : "1px solid #d1d5db",
                                            borderRadius: 4,
                                            outline: "none",
                                            background: isActive
                                              ? "#eef2ff"
                                              : "#fff",
                                            minWidth: 80,
                                          }}
                                        />
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                {filteredRows.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={result.dataPoints.length}
                                      style={{
                                        padding: "20px",
                                        textAlign: "center",
                                        color: "#9ca3af",
                                        fontSize: 12,
                                      }}
                                    >
                                      No rows match the current filters.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredRows.map((row, i) => (
                                    <tr
                                      key={i}
                                      style={{
                                        borderBottom: "1px solid #f3f4f6",
                                        background:
                                          i % 2 === 0 ? "#fff" : "#f9fafb",
                                      }}
                                    >
                                      {result.dataPoints.map((k) => (
                                        <td
                                          key={k}
                                          style={{
                                            padding: "6px 12px",
                                            color: "#374151",
                                            maxWidth: 200,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {row[k] !== null &&
                                          row[k] !== undefined ? (
                                            Array.isArray(row[k]) ? (
                                              row[k].join(", ")
                                            ) : (
                                              formatCellValue(row[k])
                                            )
                                          ) : (
                                            <span style={{ color: "#d1d5db" }}>
                                              —
                                            </span>
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
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

// ─────────────────────────────────────────────────────────────────────────────
// Section: Assign Reports
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function AssignReportsSection() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testingAlert, setTestingAlert] = useState<string | null>(null);
  const [testAlertMsg, setTestAlertMsg] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scheduleExpanded, setScheduleExpanded] = useState<string | null>(null);
  const [ccEmailDraft, setCcEmailDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_CONFIG.API_URL}/reports/saved?pageSize=100`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
      fetch(`${API_CONFIG.API_URL}/reports/assignments`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
      fetch(`${API_CONFIG.API_URL}/reports/project-users`, {
        headers: authHeaders(),
      }).then((r) => r.json()),
      fetch(`${API_CONFIG.API_URL}/roles`, { headers: authHeaders() }).then(
        (r) => r.json(),
      ),
    ])
      .then(([rd, asgd, ud, roled]) => {
        if (rd.success) setReports(rd.data);
        if (asgd.success) {
          const map: Record<string, any> = {};
          asgd.data.forEach((a: any) => {
            map[a.reportId?._id ?? a.reportId] = {
              ...a,
              alertEnabled: a.alertEnabled ?? false,
              scheduleType: a.scheduleType ?? "daily",
              scheduleDay: a.scheduleDay ?? 1,
              scheduleTime: a.scheduleTime ?? "08:00",
              ccUsers: (a.ccUsers ?? []).map((u: any) => u._id ?? u),
              ccEmails: a.ccEmails ?? [],
            };
          });
          setAssignments(map);
        }
        if (ud.success) setUsers(ud.data ?? []);
        if (roled.success) setRoles(roled.data ?? []);
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (reportId: string) => {
    const asg = assignments[reportId] ?? {
      assignedToUsers: [],
      assignedToRoles: [],
    };
    setSaving(reportId);
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/assignments/${reportId}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            assignedToUsers:
              asg.assignedToUsers?.map((u: any) => u._id ?? u) ?? [],
            assignedToRoles:
              asg.assignedToRoles?.map((r: any) => r._id ?? r) ?? [],
            alertEnabled: asg.alertEnabled ?? false,
            scheduleType: asg.scheduleType ?? "daily",
            scheduleDay: asg.scheduleDay ?? 1,
            scheduleTime: asg.scheduleTime ?? "08:00",
            ccUsers: (asg.ccUsers ?? []).map((u: any) => u._id ?? u),
            ccEmails: asg.ccEmails ?? [],
          }),
        },
      );
      const d = await res.json();
      if (!d.success) setError(d.message);
    } catch {
      setError("Save failed");
    } finally {
      setSaving(null);
    }
  };

  const handleTestAlert = async (reportId: string) => {
    setTestingAlert(reportId);
    setTestAlertMsg((prev) => ({ ...prev, [reportId]: "" }));
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/assignments/${reportId}/test-alert`,
        { method: "POST", headers: authHeaders() },
      );
      const d = await res.json();
      setTestAlertMsg((prev) => ({
        ...prev,
        [reportId]: d.success ? "✅ Test email sent!" : `❌ ${d.message}`,
      }));
    } catch {
      setTestAlertMsg((prev) => ({
        ...prev,
        [reportId]: "❌ Request failed",
      }));
    } finally {
      setTestingAlert(null);
    }
  };

  const toggleUser = (reportId: string, userId: string) => {
    setAssignments((prev) => {
      const cur = prev[reportId] ?? {
        assignedToUsers: [],
        assignedToRoles: [],
      };
      const currentUsers: string[] = (cur.assignedToUsers ?? []).map(
        (u: any) => u._id ?? u,
      );
      const next = currentUsers.includes(userId)
        ? currentUsers.filter((id) => id !== userId)
        : [...currentUsers, userId];
      return { ...prev, [reportId]: { ...cur, assignedToUsers: next } };
    });
  };

  const toggleRole = (reportId: string, roleId: string) => {
    setAssignments((prev) => {
      const cur = prev[reportId] ?? {
        assignedToUsers: [],
        assignedToRoles: [],
      };
      const currentRoles: string[] = (cur.assignedToRoles ?? []).map(
        (r: any) => r._id ?? r,
      );
      const next = currentRoles.includes(roleId)
        ? currentRoles.filter((id) => id !== roleId)
        : [...currentRoles, roleId];
      return { ...prev, [reportId]: { ...cur, assignedToRoles: next } };
    });
  };

  const updateScheduleField = (reportId: string, field: string, value: any) => {
    setAssignments((prev) => {
      const cur = prev[reportId] ?? {};
      return { ...prev, [reportId]: { ...cur, [field]: value } };
    });
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}
        >
          Assign Reports
        </h2>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          Push saved reports to specific users or roles. They'll see them in "My
          Reports".
        </p>
      </div>
      {error && <ErrorBanner msg={error} />}
      {reports.length === 0 ? (
        <div
          style={{
            padding: "60px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
          }}
        >
          No saved reports. Create one in the <strong>Report Builder</strong>{" "}
          first.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map((report) => {
            const asg = assignments[report._id] ?? {};
            const assignedUsers: string[] = (asg.assignedToUsers ?? []).map(
              (u: any) => u._id ?? u,
            );
            const assignedRoles: string[] = (asg.assignedToRoles ?? []).map(
              (r: any) => r._id ?? r,
            );
            const isExpanded = expanded === report._id;
            const scheduleOpen = scheduleExpanded === report._id;
            const alertEnabled: boolean = asg.alertEnabled ?? false;
            const scheduleType: string = asg.scheduleType ?? "daily";
            const scheduleDay: number = asg.scheduleDay ?? 1;
            const scheduleTime: string = asg.scheduleTime ?? "08:00";
            const ccUserIds: string[] = (asg.ccUsers ?? []).map(
              (u: any) => u._id ?? u,
            );
            const ccEmails: string[] = asg.ccEmails ?? [];

            return (
              <div
                key={report._id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  onClick={() => setExpanded(isExpanded ? null : report._id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    cursor: "pointer",
                    background: isExpanded ? "#eff6ff" : "#fff",
                    borderBottom: isExpanded ? "1px solid #e5e7eb" : "none",
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
                      {assignedUsers.length} users · {assignedRoles.length}{" "}
                      roles assigned
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
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
                    {assignedUsers.length + assignedRoles.length > 0 && (
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
                        {assignedUsers.length + assignedRoles.length} assigned
                      </span>
                    )}
                    <span style={{ fontSize: 18, color: "#9ca3af" }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

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
                          {users.map((u) => {
                            const uid = u._id ?? u.id;
                            const checked = assignedUsers.includes(uid);
                            return (
                              <label
                                key={uid}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "7px 12px",
                                  cursor: "pointer",
                                  background: checked ? "#eff6ff" : "#fff",
                                  borderBottom: "1px solid #f3f4f6",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleUser(report._id, uid)}
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
                          {roles.map((r) => {
                            const checked = assignedRoles.includes(r._id);
                            return (
                              <label
                                key={r._id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "7px 12px",
                                  cursor: "pointer",
                                  background: checked ? "#eff6ff" : "#fff",
                                  borderBottom: "1px solid #f3f4f6",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleRole(report._id, r._id)}
                                  style={{ accentColor: "#3b82f6" }}
                                />
                                <span style={{ fontSize: 13 }}>{r.name}</span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#9ca3af",
                                    marginLeft: "auto",
                                  }}
                                >
                                  {r.code}
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
                      {/* Header — click to expand/collapse */}
                      <div
                        onClick={() =>
                          setScheduleExpanded(scheduleOpen ? null : report._id)
                        }
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          cursor: "pointer",
                          background: scheduleOpen ? "#fffbeb" : "#f8fafc",
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
                        <span style={{ fontSize: 14, color: "#9ca3af" }}>
                          {scheduleOpen ? "▲" : "▼"}
                        </span>
                      </div>

                      {scheduleOpen && (
                        <div style={{ padding: 14, background: "#fff" }}>
                          {/* Alert toggle */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              marginBottom: 14,
                            }}
                          >
                            <Toggle
                              checked={alertEnabled}
                              onChange={(v) =>
                                updateScheduleField(
                                  report._id,
                                  "alertEnabled",
                                  v,
                                )
                              }
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
                              <span style={{ fontSize: 12, color: "#6b7280" }}>
                                — report CSV will be emailed to assigned users
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
                                {/* Schedule type */}
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
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                  </select>
                                </div>

                                {/* Day picker (weekly: Sun-Sat | monthly: 1-31) */}
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
                                            <option key={d} value={i}>
                                              {d}
                                            </option>
                                          ))
                                        : MONTH_DAYS.map((d) => (
                                            <option key={d} value={d}>
                                              {d}
                                            </option>
                                          ))}
                                    </select>
                                  </div>
                                )}

                                {/* Time picker */}
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

                              {/* ── CC Recipients ── */}
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
                                  {/* CC Users — pick from system users */}
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
                                      {users.map((u) => {
                                        const uid = u._id ?? u.id;
                                        const checked = ccUserIds.includes(uid);
                                        return (
                                          <label
                                            key={uid}
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: 8,
                                              padding: "6px 10px",
                                              cursor: "pointer",
                                              background: checked
                                                ? "#fefce8"
                                                : "#fff",
                                              borderBottom: "1px solid #f3f4f6",
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
                                                        (id) => id !== uid,
                                                      )
                                                    : [...ccUserIds, uid],
                                                )
                                              }
                                              style={{
                                                accentColor: "#f59e0b",
                                              }}
                                            />
                                            <span style={{ fontSize: 12 }}>
                                              {u.firstName} {u.lastName}
                                            </span>
                                            <span
                                              style={{
                                                fontSize: 10,
                                                color: "#9ca3af",
                                                marginLeft: "auto",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
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
                                    {/* Chip input */}
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
                                        const inp = (
                                          e.currentTarget as HTMLElement
                                        ).querySelector(
                                          "input",
                                        ) as HTMLInputElement | null;
                                        inp?.focus();
                                      }}
                                    >
                                      {ccEmails.map((em) => (
                                        <span
                                          key={em}
                                          style={{
                                            background: "#fef3c7",
                                            color: "#92400e",
                                            fontSize: 11,
                                            padding: "2px 4px 2px 8px",
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
                                              lineHeight: 1,
                                            }}
                                          >
                                            ×
                                          </span>
                                        </span>
                                      ))}
                                      <input
                                        type="email"
                                        value={ccEmailDraft[report._id] ?? ""}
                                        onChange={(e) =>
                                          setCcEmailDraft((prev) => ({
                                            ...prev,
                                            [report._id]: e.target.value,
                                          }))
                                        }
                                        onKeyDown={(e) => {
                                          const draft = (
                                            ccEmailDraft[report._id] ?? ""
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
                                              !ccEmails.includes(draft)
                                            ) {
                                              updateScheduleField(
                                                report._id,
                                                "ccEmails",
                                                [...ccEmails, draft],
                                              );
                                            }
                                            setCcEmailDraft((prev) => ({
                                              ...prev,
                                              [report._id]: "",
                                            }));
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
                                    {/* CC summary */}
                                    {(ccUserIds.length > 0 ||
                                      ccEmails.length > 0) && (
                                      <div
                                        style={{
                                          marginTop: 6,
                                          fontSize: 11,
                                          color: "#6b7280",
                                        }}
                                      >
                                        {ccUserIds.length + ccEmails.length} CC
                                        address
                                        {ccUserIds.length + ccEmails.length !==
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
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 10,
                      }}
                    >
                      {/* Test alert feedback */}
                      {testAlertMsg[report._id] && (
                        <span
                          style={{
                            fontSize: 12,
                            color: testAlertMsg[report._id].startsWith("✅")
                              ? "#16a34a"
                              : "#dc2626",
                          }}
                        >
                          {testAlertMsg[report._id]}
                        </span>
                      )}
                      {/* Send Test button — only when alert is enabled */}
                      {assignments[report._id]?.alertEnabled && (
                        <button
                          onClick={() => handleTestAlert(report._id)}
                          disabled={
                            testingAlert === report._id || saving === report._id
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
                            opacity: testingAlert === report._id ? 0.7 : 1,
                          }}
                        >
                          {testingAlert === report._id
                            ? "Sending…"
                            : "📧 Send Test"}
                        </button>
                      )}
                      <button
                        onClick={() => handleSave(report._id)}
                        disabled={saving === report._id}
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
                        {saving === report._id
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav item
// ─────────────────────────────────────────────────────────────────────────────

function NavItem({
  label,
  icon,
  active,
  onClick,
  badge,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
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
        background: active ? "#eff6ff" : "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? "#1d4ed8" : "#374151",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span
          style={{
            background: "#3b82f6",
            color: "#fff",
            borderRadius: 10,
            fontSize: 10,
            padding: "1px 6px",
            fontWeight: 700,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Footfall by Offline Center (aggregated)
// ─────────────────────────────────────────────────────────────────────────────

interface FootfallRow {
  center: string;
  newQueries: number;
  existingActive: number;
  footfall: number;
}

// ── Shared footfall helpers (used by the builder tab AND My Reports) ──────────
const FF_TH: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  color: "#fff",
  fontWeight: 700,
  fontSize: 12,
  whiteSpace: "nowrap",
};
const FF_TD: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  borderBottom: "1px solid #f3f4f6",
};

function footfallToCsvString(
  rows: FootfallRow[],
  totals: FootfallRow | null,
): string {
  const header = [
    "Offline Center",
    "New Queries",
    "Existing Queries (Activity)",
    "Footfall",
  ];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(",")];
  for (const r of rows)
    lines.push(
      [r.center, r.newQueries, r.existingActive, r.footfall]
        .map(esc)
        .join(","),
    );
  if (totals)
    lines.push(
      [
        "TOTAL",
        totals.newQueries,
        totals.existingActive,
        totals.footfall,
      ]
        .map(esc)
        .join(","),
    );
  return lines.join("\n");
}

function downloadFootfallCsv(
  rows: FootfallRow[],
  totals: FootfallRow | null,
  filename = "footfall_by_offline_center.csv",
) {
  if (!rows.length) return;
  const blob = new Blob([footfallToCsvString(rows, totals)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadFootfallPdf(
  rows: FootfallRow[],
  totals: FootfallRow | null,
  opts: { title?: string; subtitle?: string; filename?: string } = {},
) {
  if (!rows.length) return;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(opts.title ?? "Footfall by Offline Center", 14, 16);
  if (opts.subtitle) {
    doc.setFontSize(9);
    doc.text(opts.subtitle, 14, 22);
  }
  const body: (string | number)[][] = rows.map((r) => [
    r.center,
    r.newQueries,
    r.existingActive,
    r.footfall,
  ]);
  if (totals)
    body.push([
      "TOTAL",
      totals.newQueries,
      totals.existingActive,
      totals.footfall,
    ]);
  autoTable(doc, {
    head: [
      [
        "Offline Center",
        "New Queries",
        "Existing Queries (Activity)",
        "Footfall",
      ],
    ],
    body: body.map((r) => r.map(String)),
    startY: opts.subtitle ? 27 : 22,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (
        totals &&
        data.section === "body" &&
        data.row.index === body.length - 1
      ) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [243, 244, 246];
      }
    },
  });
  doc.save(opts.filename ?? "footfall_by_offline_center.pdf");
}

function FootfallResultTable({
  rows,
  totals,
}: {
  rows: FootfallRow[];
  totals: FootfallRow | null;
}) {
  return (
    <div
      style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}
        >
          <thead>
            <tr style={{ background: "#6366f1" }}>
              <th style={FF_TH}>Offline Center</th>
              <th style={{ ...FF_TH, textAlign: "center" }}>New Queries</th>
              <th style={{ ...FF_TH, textAlign: "center" }}>
                Existing Queries (Activity)
              </th>
              <th style={{ ...FF_TH, textAlign: "center" }}>Footfall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.center + i}
                style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}
              >
                <td style={{ ...FF_TD, fontWeight: 600, color: "#111827" }}>
                  {r.center}
                </td>
                <td style={{ ...FF_TD, textAlign: "center" }}>
                  {r.newQueries}
                </td>
                <td style={{ ...FF_TD, textAlign: "center" }}>
                  {r.existingActive}
                </td>
                <td
                  style={{
                    ...FF_TD,
                    textAlign: "center",
                    fontWeight: 700,
                    color: "#065f46",
                  }}
                >
                  {r.footfall}
                </td>
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr style={{ background: "#f3f4f6" }}>
                <td style={{ ...FF_TD, fontWeight: 700 }}>Total</td>
                <td style={{ ...FF_TD, textAlign: "center", fontWeight: 700 }}>
                  {totals.newQueries}
                </td>
                <td style={{ ...FF_TD, textAlign: "center", fontWeight: 700 }}>
                  {totals.existingActive}
                </td>
                <td
                  style={{
                    ...FF_TD,
                    textAlign: "center",
                    fontWeight: 700,
                    color: "#065f46",
                  }}
                >
                  {totals.footfall}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// Self-contained footfall view for a FIXED project (used in My Reports for an
// assigned footfall report). Date range + Run + CSV/PDF + table with totals.
function FootfallReportView({
  projectId,
  dateRangeDays,
  reportName,
}: {
  projectId?: string;
  dateRangeDays?: number;
  reportName?: string;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<FootfallRow[]>([]);
  const [totals, setTotals] = useState<FootfallRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);

  // Prefer the saved report's project; fall back to the project pinned in a
  // project-portal login so project users never have to pick a scope.
  const effectiveProjectId = projectId || getTokenProjectId();

  const run = async (from = dateFrom, to = dateTo) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/footfall-by-center`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            projectId: effectiveProjectId || undefined,
            dateFrom: from || undefined,
            dateTo: to || undefined,
            dateRangeDays,
          }),
        },
      );
      const d = await res.json();
      if (!res.ok || !d.success) {
        setError(d.message || "Failed to run report.");
        setRows([]);
        setTotals(null);
      } else {
        setRows(d.data || []);
        setTotals(d.totals || null);
      }
      setRan(true);
    } catch {
      setError("Failed to run report.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on mount so the assigned report shows data immediately.
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputStyle: React.CSSProperties = {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
  };
  const sub =
    dateFrom || dateTo
      ? `Date: ${dateFrom || "…"} to ${dateTo || "…"}`
      : `Date: last ${dateRangeDays ?? 30} days`;

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 12,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#374151",
              marginBottom: 4,
            }}
          >
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#374151",
              marginBottom: 4,
            }}
          >
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button
          onClick={() => run()}
          disabled={loading}
          style={{
            padding: "8px 18px",
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Running…" : "▶ Run"}
        </button>
        <button
          onClick={() =>
            downloadFootfallCsv(
              rows,
              totals,
              `${(reportName || "footfall").replace(/[^a-z0-9]/gi, "_")}.csv`,
            )
          }
          disabled={!rows.length}
          style={{
            padding: "8px 14px",
            background: "#fff",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: rows.length ? "pointer" : "not-allowed",
            opacity: rows.length ? 1 : 0.5,
          }}
        >
          ⬇ Export CSV
        </button>
        <button
          onClick={() =>
            downloadFootfallPdf(rows, totals, {
              title: reportName || "Footfall by Offline Center",
              subtitle: sub,
              filename: `${(reportName || "footfall").replace(/[^a-z0-9]/gi, "_")}.pdf`,
            })
          }
          disabled={!rows.length}
          style={{
            padding: "8px 14px",
            background: "#fff",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: rows.length ? "pointer" : "not-allowed",
            opacity: rows.length ? 1 : 0.5,
          }}
        >
          ⬇ Export PDF
        </button>
      </div>

      {!dateFrom && !dateTo && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
          No date range selected — defaults to the last {dateRangeDays ?? 30}{" "}
          days.
        </div>
      )}
      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}
      {ran && !error && rows.length === 0 && (
        <div style={{ color: "#6b7280", fontSize: 14, padding: "20px 0" }}>
          No footfall found for the selected date range.
        </div>
      )}
      {rows.length > 0 && <FootfallResultTable rows={rows} totals={totals} />}
    </div>
  );
}

function FootfallReportSection({
  isAdmin,
  canSave,
}: {
  isAdmin: boolean;
  canSave: boolean;
}) {
  // Project portal logins are pinned to one project (from the JWT) — the picker
  // is hidden and the report always scopes to that project.
  const forcedProjectId = getTokenProjectId();
  const [projectOptions, setProjectOptions] = useState<
    { _id: string; name: string }[]
  >([]);
  const [projectId, setProjectId] = useState(forcedProjectId);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<FootfallRow[]>([]);
  const [totals, setTotals] = useState<FootfallRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ran, setRan] = useState(false);
  // Save-as-schedulable-report state
  const [saveName, setSaveName] = useState("");
  const [saveDays, setSaveDays] = useState("30");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const handleSaveReport = async () => {
    if (!saveName.trim()) {
      setSaveMsg("Enter a report name.");
      return;
    }
    if (!isAdmin && !projectId) {
      setSaveMsg("Select a project first.");
      return;
    }
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`${API_CONFIG.API_URL}/reports/saved`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: saveName.trim(),
          reportType: "footfall",
          projectId: projectId || undefined,
          footfallDays: Number(saveDays) > 0 ? Number(saveDays) : 30,
        }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setSaveMsg(
          "✓ Saved. Assign it to users and set a schedule from the Assign Reports tab.",
        );
        setSaveName("");
      } else {
        setSaveMsg(d.message || "Failed to save report.");
      }
    } catch {
      setSaveMsg("Failed to save report.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetch(`${API_CONFIG.API_URL}/projects/my-projects`, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.projects)
          ? d.projects
          : Array.isArray(d?.data)
            ? d.data
            : Array.isArray(d?.data?.projects)
              ? d.data.projects
              : [];
        setProjectOptions(list);
        // Pinned project (portal login) wins; otherwise auto-select a lone project.
        if (forcedProjectId) setProjectId(forcedProjectId);
        else if (list.length === 1) setProjectId(list[0]._id);
      })
      .catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_CONFIG.API_URL}/reports/footfall-by-center`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            projectId: projectId || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          }),
        },
      );
      const d = await res.json();
      if (!res.ok || !d.success) {
        setError(d.message || "Failed to run report.");
        setRows([]);
        setTotals(null);
      } else {
        setRows(d.data || []);
        setTotals(d.totals || null);
      }
      setRan(true);
    } catch {
      setError("Failed to run report.");
      setRows([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => downloadFootfallCsv(rows, totals);

  const exportPdf = () => {
    const rangeLabel =
      dateFrom || dateTo
        ? `Date: ${dateFrom || "…"} to ${dateTo || "…"}`
        : "Date: last 30 days";
    const projLabel = projectOptions.find((p) => p._id === projectId)?.name;
    downloadFootfallPdf(rows, totals, {
      subtitle: [rangeLabel, projLabel ? `Project: ${projLabel}` : ""]
        .filter(Boolean)
        .join("    "),
    });
  };

  const inputStyle: React.CSSProperties = {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
  };

  return (
    <div>
      <div style={{ marginBottom: 4, fontSize: 18, fontWeight: 700 }}>
        Footfall by Offline Center
      </div>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Footfall = unique students who raised tickets + total follow-up
        responses, grouped by the offline center. Tickets without a center appear
        as “Unassigned”.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: 16,
        }}
      >
        {/* Project portal logins are pinned to one project (from the JWT) — hide
            the project field entirely. A single-project (non-portal) user gets a
            read-only label. Admins / multi-project users get the dropdown. */}
        {forcedProjectId ? null : projectOptions.length === 1 ? (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "#374151",
                marginBottom: 4,
              }}
            >
              Project
            </label>
            <div
              style={{
                ...inputStyle,
                minWidth: 220,
                background: "#f9fafb",
                color: "#374151",
              }}
            >
              {projectOptions[0].name}
            </div>
          </div>
        ) : (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "#374151",
                marginBottom: 4,
              }}
            >
              Project {!isAdmin && <span style={{ color: "#ef4444" }}>*</span>}
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{ ...inputStyle, minWidth: 220 }}
            >
              <option value="">
                {isAdmin ? "All projects" : "— Select project —"}
              </option>
              {projectOptions.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#374151",
              marginBottom: 4,
            }}
          >
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "#374151",
              marginBottom: 4,
            }}
          >
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button
          onClick={run}
          disabled={loading || (!isAdmin && !projectId)}
          style={{
            padding: "8px 18px",
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading || (!isAdmin && !projectId) ? 0.6 : 1,
          }}
        >
          {loading ? "Running…" : "▶ Run"}
        </button>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          style={{
            padding: "8px 14px",
            background: "#fff",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: rows.length ? "pointer" : "not-allowed",
            opacity: rows.length ? 1 : 0.5,
          }}
        >
          ⬇ Export CSV
        </button>
        <button
          onClick={exportPdf}
          disabled={!rows.length}
          style={{
            padding: "8px 14px",
            background: "#fff",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: rows.length ? "pointer" : "not-allowed",
            opacity: rows.length ? 1 : 0.5,
          }}
        >
          ⬇ Export PDF
        </button>
      </div>

      {!dateFrom && !dateTo && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
          No date range selected — defaults to the last 30 days.
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {ran && !error && rows.length === 0 && (
        <div style={{ color: "#6b7280", fontSize: 14, padding: "20px 0" }}>
          No footfall found for the selected project and date range.
        </div>
      )}

      {rows.length > 0 && <FootfallResultTable rows={rows} totals={totals} />}

      {/* Save as a schedulable / assignable report */}
      {canSave && (
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px dashed #e5e7eb",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            Save &amp; Schedule
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
            Save this footfall report (for the selected project) so you can
            assign it to users and email it on a schedule from the{" "}
            <strong>Assign Reports</strong> tab. Scheduled emails use a rolling
            window of the last N days.
          </p>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#374151",
                  marginBottom: 4,
                }}
              >
                Report name
              </label>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Daily Footfall by Center"
                style={{ ...inputStyle, minWidth: 260 }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#374151",
                  marginBottom: 4,
                }}
              >
                Rolling window (days)
              </label>
              <input
                type="number"
                min={1}
                value={saveDays}
                onChange={(e) => setSaveDays(e.target.value)}
                style={{ ...inputStyle, width: 120 }}
              />
            </div>
            <button
              onClick={handleSaveReport}
              disabled={saving}
              style={{
                padding: "8px 16px",
                background: "#10b981",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "💾 Save Report"}
            </button>
          </div>
          {saveMsg && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: saveMsg.startsWith("✓") ? "#065f46" : "#b91c1c",
              }}
            >
              {saveMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

const ReportsPage: React.FC<{ wrapWithLayout?: boolean }> = ({
  wrapWithLayout = true,
}) => {
  const { hasPermission } = usePermissions();
  const [activeSection, setActiveSection] = useState<Section>("my-reports");
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [editingReport, setEditingReport] = useState<SavedReport | null>(null);
  const [myModulePerms, setMyModulePerms] = useState({
    canView: true,
    canCreate: false,
    canExport: false,
    canSchedule: false,
    canAssign: false,
    canDelete: false,
  });

  // Load module permissions for current user's role
  useEffect(() => {
    fetch(`${API_CONFIG.API_URL}/reports/my-module-permissions`, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) setMyModulePerms(d.data);
      })
      .catch(() => {});
  }, []);

  // Load saved report count for badge
  useEffect(() => {
    fetch(`${API_CONFIG.API_URL}/reports/saved?pageSize=1`, {
      headers: authHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.total !== undefined) setSavedCount(d.total);
      })
      .catch(() => {});
  }, []);

  const roleCode = getRoleCode();
  const isAdmin =
    roleCode === "SUPER_ADMIN" ||
    roleCode === "ACCOUNT_OWNER" ||
    roleCode === "SUPPORT_ADMIN";
  const canManagePerms = isAdmin;
  const canManageDPs = isAdmin;
  // Also honour the granular RBAC permissions (REPORT_CREATE_CUSTOM / REPORT_ASSIGN)
  // so sub-admins granted these in RBAC Setup automatically get access.
  const canCreate =
    myModulePerms.canCreate ||
    isAdmin ||
    hasPermission(PERMISSIONS.REPORT_CREATE_CUSTOM);
  const canAssign =
    myModulePerms.canAssign ||
    isAdmin ||
    hasPermission(PERMISSIONS.REPORT_ASSIGN);
  const canExport = myModulePerms.canExport || isAdmin;

  const moduleNavItems: {
    section: Section;
    label: string;
    icon: string;
    show: boolean;
    badge?: string;
  }[] = [
    { section: "my-reports", label: "My Reports", icon: "⭐", show: true },
    {
      section: "footfall",
      label: "Footfall Report",
      icon: "🚶",
      // Builder tab is for report creators/admins. Other users receive assigned
      // footfall reports (scoped, no dropdown) via My Reports + scheduled email.
      show: canCreate,
    },
    {
      section: "saved-reports",
      label: "Saved Reports",
      icon: "📋",
      show: canCreate,
      badge: savedCount != null ? String(savedCount) : undefined,
    },
    {
      section: "report-builder",
      label: "Report Builder",
      icon: "🔨",
      show: canCreate,
    },
    {
      section: "assign-reports",
      label: "Assign Reports",
      icon: "📤",
      show: canAssign,
    },
    {
      section: "data-points",
      label: "Data Points",
      icon: "🗂",
      show: canManageDPs,
    },
    {
      section: "role-permissions",
      label: "Role Permissions",
      icon: "🔐",
      show: canManagePerms,
    },
  ];

  const visibleModule = moduleNavItems.filter((n) => n.show);

  // Default to first available section if current one is invisible
  useEffect(() => {
    if (
      visibleModule.length > 0 &&
      !visibleModule.some((n) => n.section === activeSection)
    ) {
      setActiveSection(visibleModule[0].section);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const content = (
    <div style={{ padding: "24px" }}>
      <ModuleHeader
        title="Reports"
        subtitle="Build, manage and assign custom reports"
      />

      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 20,
          alignItems: "flex-start",
        }}
      >
        {/* ── Left mini-sidebar ───────────────────────────────────────── */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 8,
            position: "sticky",
            top: 20,
          }}
        >
          {visibleModule.length > 0 && (
            <>
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
              {visibleModule.map((item) => (
                <NavItem
                  key={item.section}
                  label={item.label}
                  icon={item.icon}
                  active={activeSection === item.section}
                  onClick={() => setActiveSection(item.section)}
                  badge={item.badge}
                />
              ))}
            </>
          )}

          {visibleModule.length === 0 && (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: 13,
              }}
            >
              No reports available.
            </div>
          )}
        </div>

        {/* ── Main content ────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 24,
            }}
          >
            {activeSection === "my-reports" && <MyReportsSection />}
            {activeSection === "footfall" && (
              <FootfallReportSection
                isAdmin={isAdmin}
                canSave={canCreate || isAdmin}
              />
            )}
            {activeSection === "role-permissions" && <RolePermissionsSection />}
            {activeSection === "data-points" && <DataPointsSection />}
            {activeSection === "report-builder" && (
              <ReportBuilderSection
                editingReport={editingReport}
                isAdmin={isAdmin}
                onCancelEdit={() => {
                  setEditingReport(null);
                  setActiveSection("saved-reports");
                }}
                onSaved={() => {
                  setSavedCount((c) => (c ?? 0) + 1);
                  setEditingReport(null);
                  setActiveSection("saved-reports");
                }}
              />
            )}
            {activeSection === "assign-reports" && <AssignReportsSection />}
            {activeSection === "saved-reports" && (
              <SavedReportsSection
                onEdit={(r) => {
                  setEditingReport(r);
                  setActiveSection("report-builder");
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return wrapWithLayout ? (
    <DashboardLayout>{content}</DashboardLayout>
  ) : (
    content
  );
};

export default ReportsPage;
