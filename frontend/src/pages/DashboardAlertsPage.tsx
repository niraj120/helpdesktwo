/**
 * DashboardAlertsPage — Sprint 11
 *
 * Admin page for managing threshold alerts on dashboard widgets.
 * Route: /admin/dashboard-alerts/:templateId (requires dashboard.manage)
 * Can also be accessed from /admin/dashboard-alerts with template selector.
 *
 * Features:
 *  - List all alerts for a template with widget, condition, severity, recipients
 *  - Create / Edit / Delete / Test alerts via a side drawer form
 *  - Active/inactive toggle per alert
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { API_CONFIG } from "../config/constants";
import DashboardLayout from "../components/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertCondition {
  operator: "gt" | "lt" | "gte" | "lte" | "eq";
  value: number;
}

interface ThresholdAlert {
  _id: string;
  dashboard_template_id: string;
  dashboard_widget_id: string;
  widget_key: string;
  alert_name: string;
  condition: AlertCondition;
  severity: "info" | "warning" | "critical";
  notify_roles: string[];
  notify_users: string[];
  cooldown_minutes: number;
  last_triggered_at?: string;
  last_triggered_value?: number;
  is_active: boolean;
  createdAt: string;
}

interface DashTemplate {
  _id: string;
  name: string;
}

interface DashWidget {
  _id: string;
  widgetKey: string;
  title?: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const ADMIN_BASE = `${API_CONFIG.API_URL}/v1/admin/dashboards`;

async function fetchTemplates(): Promise<DashTemplate[]> {
  const res = await fetch(ADMIN_BASE, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) return [];
  return json.data ?? [];
}

async function fetchWidgets(templateId: string): Promise<DashWidget[]> {
  const res = await fetch(`${ADMIN_BASE}/${templateId}`, {
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) return [];
  const widgets = (json.data?.widgets ?? json.widgets ?? []) as DashWidget[];
  return widgets;
}

async function fetchAlerts(templateId: string): Promise<ThresholdAlert[]> {
  const res = await fetch(`${ADMIN_BASE}/${templateId}/alerts`, {
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Failed to load alerts");
  return json.data ?? [];
}

async function createAlert(
  templateId: string,
  body: Record<string, any>,
): Promise<ThresholdAlert> {
  const res = await fetch(`${ADMIN_BASE}/${templateId}/alerts`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Failed to create alert");
  return json.data;
}

async function updateAlert(
  templateId: string,
  alertId: string,
  body: Record<string, any>,
): Promise<ThresholdAlert> {
  const res = await fetch(`${ADMIN_BASE}/${templateId}/alerts/${alertId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Failed to update alert");
  return json.data;
}

async function deleteAlert(templateId: string, alertId: string): Promise<void> {
  const res = await fetch(`${ADMIN_BASE}/${templateId}/alerts/${alertId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const json = await res.json();
    throw new Error(json.message ?? "Failed to delete alert");
  }
}

async function testAlert(templateId: string, alertId: string): Promise<string> {
  const res = await fetch(
    `${ADMIN_BASE}/${templateId}/alerts/${alertId}/test`,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Test failed");
  return json.message ?? "Alert triggered";
}

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = {
  dashboard_widget_id: "",
  alert_name: "",
  condition_operator: "gt" as AlertCondition["operator"],
  condition_value: 0,
  severity: "warning" as ThresholdAlert["severity"],
  cooldown_minutes: 60,
  is_active: true,
  notify_roles: [] as string[],
  notify_users: [] as string[],
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  info: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  warning: { bg: "#fef3c7", text: "#92400e", border: "#fde68a" },
  critical: { bg: "#fff1f2", text: "#dc2626", border: "#fecdd3" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info;
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {severity}
    </span>
  );
}

function conditionLabel(condition: AlertCondition): string {
  const opLabels: Record<string, string> = {
    gt: ">",
    lt: "<",
    gte: "≥",
    lte: "≤",
    eq: "=",
  };
  return `${opLabels[condition.operator] ?? condition.operator} ${condition.value}`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardAlertsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    searchParams.get("template") ?? "",
  );

  const { data: templates = [] } = useQuery<DashTemplate[]>({
    queryKey: ["dashboardTemplatesList"],
    queryFn: fetchTemplates,
    staleTime: 60_000,
  });

  const { data: widgets = [] } = useQuery<DashWidget[]>({
    queryKey: ["dashboardWidgets", selectedTemplate],
    queryFn: () => fetchWidgets(selectedTemplate),
    enabled: !!selectedTemplate,
    staleTime: 30_000,
  });

  const {
    data: alerts = [],
    isLoading,
    isError,
    error,
  } = useQuery<ThresholdAlert[]>({
    queryKey: ["thresholdAlerts", selectedTemplate],
    queryFn: () => fetchAlerts(selectedTemplate),
    enabled: !!selectedTemplate,
    staleTime: 15_000,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState("");
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});

  const createMut = useMutation({
    mutationFn: (body: Record<string, any>) =>
      createAlert(selectedTemplate, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thresholdAlerts", selectedTemplate] });
      closeDrawer();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ aid, body }: { aid: string; body: Record<string, any> }) =>
      updateAlert(selectedTemplate, aid, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thresholdAlerts", selectedTemplate] });
      closeDrawer();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (aid: string) => deleteAlert(selectedTemplate, aid),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["thresholdAlerts", selectedTemplate] }),
  });

  function openCreate() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setFormError("");
    setDrawerOpen(true);
  }

  function openEdit(a: ThresholdAlert) {
    setForm({
      dashboard_widget_id: a.dashboard_widget_id,
      alert_name: a.alert_name,
      condition_operator: a.condition.operator,
      condition_value: a.condition.value,
      severity: a.severity,
      cooldown_minutes: a.cooldown_minutes,
      is_active: a.is_active,
      notify_roles: [...(a.notify_roles ?? [])],
      notify_users: [...(a.notify_users ?? [])],
    });
    setEditingId(a._id);
    setFormError("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError("");
  }

  function setField(key: string, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submitForm() {
    setFormError("");
    if (!selectedTemplate) {
      setFormError("Select a dashboard template first.");
      return;
    }
    if (!form.dashboard_widget_id) {
      setFormError("Please select a widget.");
      return;
    }
    if (!form.alert_name.trim()) {
      setFormError("Alert name is required.");
      return;
    }

    const body = {
      dashboard_widget_id: form.dashboard_widget_id,
      alert_name: form.alert_name,
      condition: {
        operator: form.condition_operator,
        value: Number(form.condition_value),
      },
      severity: form.severity,
      cooldown_minutes: Number(form.cooldown_minutes),
      is_active: form.is_active,
      notify_roles: form.notify_roles,
      notify_users: form.notify_users,
    };

    if (editingId) {
      updateMut.mutate({ aid: editingId, body });
    } else {
      createMut.mutate(body);
    }
  }

  async function handleTest(templateId: string, aid: string) {
    setTestStatus((prev) => ({ ...prev, [aid]: "testing" }));
    try {
      const msg = await testAlert(templateId, aid);
      setTestStatus((prev) => ({ ...prev, [aid]: "ok: " + msg }));
    } catch (e: any) {
      setTestStatus((prev) => ({ ...prev, [aid]: "error: " + e.message }));
    }
  }

  function handleTemplateChange(id: string) {
    setSelectedTemplate(id);
    setSearchParams(id ? { template: id } : {});
  }

  const widgetLabel = (widgetId: string) => {
    const w = widgets.find((x) => x._id === widgetId);
    return w ? (w.title ?? w.widgetKey) : widgetId;
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <DashboardLayout>
      <div style={{ padding: "28px 32px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#101828",
                margin: 0,
              }}
            >
              Threshold Alerts
            </h1>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
              Notify team members when widget KPIs cross defined thresholds
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                color: "#111827",
                background: "#fff",
                minWidth: 240,
              }}
            >
              <option value="">Select dashboard template…</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <button
                onClick={openCreate}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Create Alert
              </button>
            )}
          </div>
        </div>

        {/* Empty state — no template selected */}
        {!selectedTemplate && (
          <div
            style={{
              background: "#f9fafb",
              border: "2px dashed #d1d5db",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 15,
            }}
          >
            Select a dashboard template above to view or create threshold
            alerts.
          </div>
        )}

        {/* Table */}
        {selectedTemplate && isLoading && (
          <p style={{ color: "#6b7280" }}>Loading alerts...</p>
        )}
        {selectedTemplate && isError && (
          <p style={{ color: "#dc2626" }}>
            Error: {String((error as any)?.message)}
          </p>
        )}
        {selectedTemplate && !isLoading && !isError && (
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {[
                    "Alert Name",
                    "Widget",
                    "Condition",
                    "Severity",
                    "Cooldown",
                    "Last Triggered",
                    "Active",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#374151",
                        borderBottom: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: "32px 16px",
                        textAlign: "center",
                        color: "#9ca3af",
                        fontSize: 14,
                      }}
                    >
                      No alerts configured for this dashboard. Click "+ Create
                      Alert".
                    </td>
                  </tr>
                )}
                {alerts.map((a) => {
                  const ts = testStatus[a._id];
                  return (
                    <tr
                      key={a._id}
                      style={{ borderBottom: "1px solid #f3f4f6" }}
                    >
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#111827",
                        }}
                      >
                        {a.alert_name}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#374151",
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>
                          {widgetLabel(a.dashboard_widget_id)}
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {a.widget_key}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#374151",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <code
                          style={{
                            background: "#f3f4f6",
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 12,
                          }}
                        >
                          value {conditionLabel(a.condition)}
                        </code>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <SeverityBadge severity={a.severity} />
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#374151",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.cooldown_minutes} min
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#6b7280",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.last_triggered_at
                          ? `${new Date(a.last_triggered_at).toLocaleString("en-IN")}${a.last_triggered_value !== undefined ? ` (${a.last_triggered_value})` : ""}`
                          : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: a.is_active ? "#10b981" : "#d1d5db",
                          }}
                        />
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <button
                            onClick={() =>
                              handleTest(a.dashboard_template_id, a._id)
                            }
                            disabled={ts === "testing"}
                            style={{
                              background: "#fef3c7",
                              color: "#92400e",
                              border: "1px solid #fde68a",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              opacity: ts === "testing" ? 0.6 : 1,
                            }}
                          >
                            {ts === "testing" ? "..." : "Test"}
                          </button>
                          <button
                            onClick={() => openEdit(a)}
                            style={{
                              background: "#eff6ff",
                              color: "#2563eb",
                              border: "1px solid #bfdbfe",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete alert "${a.alert_name}"?`,
                                )
                              )
                                deleteMut.mutate(a._id);
                            }}
                            style={{
                              background: "#fff1f2",
                              color: "#dc2626",
                              border: "1px solid #fecdd3",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        {ts && ts !== "testing" && (
                          <div
                            style={{
                              fontSize: 11,
                              color: ts.startsWith("ok:")
                                ? "#059669"
                                : "#dc2626",
                              marginTop: 4,
                              maxWidth: 200,
                            }}
                          >
                            {ts}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div
            onClick={closeDrawer}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              zIndex: 40,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 440,
              background: "#fff",
              boxShadow: "-4px 0 32px rgba(0,0,0,0.12)",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "24px 24px 16px",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#111827",
                }}
              >
                {editingId ? "Edit Alert" : "New Threshold Alert"}
              </h2>
            </div>

            <div
              style={{
                padding: 24,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* Widget */}
              <label style={labelStyle}>
                Widget *
                <select
                  value={form.dashboard_widget_id}
                  onChange={(e) =>
                    setField("dashboard_widget_id", e.target.value)
                  }
                  style={inputStyle}
                >
                  <option value="">Select widget…</option>
                  {widgets.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.title ?? w.widgetKey}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  Only KPI tile widgets produce numeric values suitable for
                  thresholds
                </span>
              </label>

              {/* Alert Name */}
              <label style={labelStyle}>
                Alert Name *
                <input
                  type="text"
                  value={form.alert_name}
                  onChange={(e) => setField("alert_name", e.target.value)}
                  placeholder="e.g. High Ticket Backlog"
                  style={inputStyle}
                />
              </label>

              {/* Condition */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span
                  style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}
                >
                  Condition (trigger when value…)
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={form.condition_operator}
                    onChange={(e) =>
                      setField("condition_operator", e.target.value)
                    }
                    style={{ ...inputStyle, flex: "0 0 100px" }}
                  >
                    <option value="gt">&gt; (greater than)</option>
                    <option value="gte">≥ (at least)</option>
                    <option value="lt">&lt; (less than)</option>
                    <option value="lte">≤ (at most)</option>
                    <option value="eq">= (equals)</option>
                  </select>
                  <input
                    type="number"
                    value={form.condition_value}
                    onChange={(e) =>
                      setField("condition_value", e.target.value)
                    }
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="threshold value"
                  />
                </div>
              </div>

              {/* Severity */}
              <label style={labelStyle}>
                Severity
                <select
                  value={form.severity}
                  onChange={(e) => setField("severity", e.target.value)}
                  style={inputStyle}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </label>

              {/* Cooldown */}
              <label style={labelStyle}>
                Cooldown (minutes)
                <input
                  type="number"
                  min={1}
                  value={form.cooldown_minutes}
                  onChange={(e) => setField("cooldown_minutes", e.target.value)}
                  style={inputStyle}
                />
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  Minimum time between repeated firings of this alert
                </span>
              </label>

              {/* Active */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setField("is_active", e.target.checked)}
                />
                <span>Active</span>
              </label>

              {formError && (
                <div
                  style={{
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    borderRadius: 6,
                    padding: "10px 14px",
                    color: "#dc2626",
                    fontSize: 13,
                  }}
                >
                  {formError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #f3f4f6",
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={closeDrawer}
                style={{
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitForm}
                disabled={isSaving}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14,
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Create Alert"}
              </button>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 14,
  color: "#111827",
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
