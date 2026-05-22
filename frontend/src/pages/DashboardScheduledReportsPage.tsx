/**
 * DashboardScheduledReportsPage — Sprint 10
 *
 * Admin page for managing scheduled dashboard report deliveries.
 * Route: /admin/dashboard-scheduled-reports (requires dashboard.manage)
 *
 * Features:
 *  - List all scheduled reports with name, schedule, recipients, last run status
 *  - Create / Edit / Delete reports via a side drawer form
 *  - "Send Now" button to trigger immediate delivery
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_CONFIG } from "../config/constants";
import DashboardLayout from "../components/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipient {
  email: string;
  name: string;
  is_portal_user: boolean;
}

interface ScheduledReport {
  _id: string;
  name: string;
  dashboard_template_id: { _id: string; name: string } | string;
  schedule_type: string;
  cron_expression: string;
  timezone: string;
  recipients: Recipient[];
  format: "pdf" | "csv" | "email_inline";
  date_range_days: number;
  is_active: boolean;
  last_run_at?: string;
  last_run_status?: "success" | "failed" | "partial";
  last_error?: string;
  subject_template?: string;
  body_template?: string;
}

interface DashTemplate {
  _id: string;
  name: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const BASE = `${API_CONFIG.API_URL}/v1/admin/dashboards`;
const BASE_REPORTS = `${BASE}/scheduled-reports`;
const BASE_TEMPLATES = `${API_CONFIG.API_URL}/v1/admin/dashboards`;

async function fetchReports(): Promise<ScheduledReport[]> {
  const res = await fetch(BASE_REPORTS, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Failed to load reports");
  return json.data ?? [];
}

async function fetchTemplates(): Promise<DashTemplate[]> {
  const res = await fetch(BASE_TEMPLATES, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) return [];
  return json.data ?? [];
}

async function createReport(
  body: Partial<ScheduledReport> & Record<string, any>,
): Promise<ScheduledReport> {
  const res = await fetch(BASE_REPORTS, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Failed to create report");
  return json.data;
}

async function updateReport(
  id: string,
  body: Partial<ScheduledReport> & Record<string, any>,
): Promise<ScheduledReport> {
  const res = await fetch(`${BASE_REPORTS}/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Failed to update report");
  return json.data;
}

async function deleteReport(id: string): Promise<void> {
  const res = await fetch(`${BASE_REPORTS}/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const json = await res.json();
    throw new Error(json.message ?? "Failed to delete report");
  }
}

async function sendNow(id: string): Promise<void> {
  const res = await fetch(`${BASE_REPORTS}/${id}/send-now`, {
    method: "POST",
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Failed to send report");
}

// ─── Empty form state ─────────────────────────────────────────────────────────

const emptyForm = {
  dashboard_template_id: "",
  name: "",
  schedule_type: "weekly",
  cron_expression: "0 8 * * 1",
  timezone: "Asia/Kolkata",
  format: "pdf" as const,
  date_range_days: 7,
  subject_template: "Dashboard Report: {{dashboard_name}} — {{date}}",
  body_template:
    "Please find attached the dashboard report for {{dashboard_name}} covering the period {{period}}.",
  is_active: true,
  recipientEmail: "",
  recipientName: "",
  recipients: [] as Recipient[],
};

const SCHEDULE_CRONS: Record<string, string> = {
  daily: "0 8 * * *",
  weekly: "0 8 * * 1",
  monthly: "0 8 1 * *",
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>;
  const colors: Record<string, { bg: string; text: string }> = {
    success: { bg: "#d1fae5", text: "#065f46" },
    failed: { bg: "#fee2e2", text: "#991b1b" },
    partial: { bg: "#fef3c7", text: "#92400e" },
  };
  const c = colors[status] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

function FormatBadge({ format }: { format: string }) {
  const labels: Record<string, string> = {
    pdf: "HTML",
    csv: "CSV",
    email_inline: "Inline",
  };
  return (
    <span
      style={{
        background: "#eff6ff",
        color: "#1d4ed8",
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {labels[format] ?? format}
    </span>
  );
}

function humanCron(scheduleType: string, cronExpr: string): string {
  const labels: Record<string, string> = {
    daily: "Daily at 8:00 AM",
    weekly: "Weekly (Mon 8:00 AM)",
    monthly: "Monthly (1st, 8:00 AM)",
  };
  return labels[scheduleType] ?? cronExpr;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardScheduledReportsPage() {
  const qc = useQueryClient();

  const {
    data: reports = [],
    isLoading,
    isError,
    error,
  } = useQuery<ScheduledReport[]>({
    queryKey: ["scheduledReports"],
    queryFn: fetchReports,
    staleTime: 30_000,
  });

  const { data: templates = [] } = useQuery<DashTemplate[]>({
    queryKey: ["dashboardTemplatesList"],
    queryFn: fetchTemplates,
    staleTime: 60_000,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<Record<string, string>>({});

  const createMut = useMutation({
    mutationFn: createReport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduledReports"] });
      closeDrawer();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      updateReport(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduledReports"] });
      closeDrawer();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduledReports"] }),
  });

  function openCreate() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setFormError("");
    setDrawerOpen(true);
  }

  function openEdit(r: ScheduledReport) {
    const templateId =
      typeof r.dashboard_template_id === "object"
        ? r.dashboard_template_id._id
        : r.dashboard_template_id;
    setForm({
      dashboard_template_id: templateId,
      name: r.name,
      schedule_type: r.schedule_type,
      cron_expression: r.cron_expression,
      timezone: r.timezone,
      format: r.format,
      date_range_days: r.date_range_days,
      subject_template: r.subject_template ?? emptyForm.subject_template,
      body_template: r.body_template ?? emptyForm.body_template,
      is_active: r.is_active,
      recipientEmail: "",
      recipientName: "",
      recipients: [...(r.recipients ?? [])],
    } as typeof emptyForm);
    setEditingId(r._id);
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
    if (key === "schedule_type" && value !== "custom_cron") {
      setForm((prev) => ({
        ...prev,
        schedule_type: value,
        cron_expression: SCHEDULE_CRONS[value] ?? "",
      }));
    }
  }

  function addRecipient() {
    const email = form.recipientEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setForm((prev) => ({
      ...prev,
      recipients: [
        ...prev.recipients,
        { email, name: prev.recipientName.trim(), is_portal_user: false },
      ],
      recipientEmail: "",
      recipientName: "",
    }));
  }

  function removeRecipient(email: string) {
    setForm((prev) => ({
      ...prev,
      recipients: prev.recipients.filter((r) => r.email !== email),
    }));
  }

  function submitForm() {
    setFormError("");
    if (!form.dashboard_template_id) {
      setFormError("Please select a dashboard template.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Report name is required.");
      return;
    }
    if (!form.cron_expression.trim()) {
      setFormError("Cron expression is required.");
      return;
    }
    if (form.recipients.length === 0) {
      setFormError("Add at least one recipient.");
      return;
    }

    const body = {
      dashboard_template_id: form.dashboard_template_id,
      name: form.name,
      schedule_type: form.schedule_type,
      cron_expression: form.cron_expression,
      timezone: form.timezone,
      format: form.format,
      date_range_days: form.date_range_days,
      subject_template: form.subject_template,
      body_template: form.body_template,
      is_active: form.is_active,
      recipients: form.recipients,
    };

    if (editingId) {
      updateMut.mutate({ id: editingId, body });
    } else {
      createMut.mutate(body);
    }
  }

  async function handleSendNow(id: string) {
    setSendingId(id);
    setSendStatus((prev) => ({ ...prev, [id]: "" }));
    try {
      await sendNow(id);
      setSendStatus((prev) => ({ ...prev, [id]: "sent" }));
      qc.invalidateQueries({ queryKey: ["scheduledReports"] });
    } catch (e: any) {
      setSendStatus((prev) => ({ ...prev, [id]: "error: " + e.message }));
    } finally {
      setSendingId(null);
    }
  }

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
              Scheduled Reports
            </h1>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
              Configure automated dashboard report delivery via email
            </p>
          </div>
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
            + Schedule Report
          </button>
        </div>

        {/* Table */}
        {isLoading && <p style={{ color: "#6b7280" }}>Loading...</p>}
        {isError && (
          <p style={{ color: "#dc2626" }}>
            Failed to load reports: {String((error as any)?.message)}
          </p>
        )}
        {!isLoading && !isError && (
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
                    "Report Name",
                    "Dashboard",
                    "Schedule",
                    "Format",
                    "Recipients",
                    "Last Run",
                    "Status",
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
                {reports.length === 0 && (
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
                      No scheduled reports yet. Click "+ Schedule Report" to
                      create one.
                    </td>
                  </tr>
                )}
                {reports.map((r) => {
                  const tName =
                    typeof r.dashboard_template_id === "object"
                      ? r.dashboard_template_id.name
                      : r.dashboard_template_id;
                  const status = sendStatus[r._id];
                  return (
                    <tr
                      key={r._id}
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
                        {r.name}
                        {!r.is_active && (
                          <span
                            style={{
                              marginLeft: 6,
                              color: "#9ca3af",
                              fontSize: 11,
                              fontWeight: 400,
                            }}
                          >
                            (inactive)
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#374151",
                        }}
                      >
                        {tName}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#374151",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {humanCron(r.schedule_type, r.cron_expression)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <FormatBadge format={r.format} />
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#374151",
                        }}
                      >
                        {r.recipients?.length ?? 0}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: "#6b7280",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.last_run_at
                          ? new Date(r.last_run_at).toLocaleString("en-IN")
                          : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <StatusBadge status={r.last_run_status} />
                        {status && (
                          <div
                            style={{
                              fontSize: 11,
                              color: status === "sent" ? "#059669" : "#dc2626",
                              marginTop: 2,
                            }}
                          >
                            {status === "sent" ? "Sent!" : status}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <button
                            onClick={() => handleSendNow(r._id)}
                            disabled={sendingId === r._id}
                            style={{
                              background: "#f0fdf4",
                              color: "#059669",
                              border: "1px solid #bbf7d0",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              opacity: sendingId === r._id ? 0.6 : 1,
                            }}
                          >
                            {sendingId === r._id ? "Sending..." : "Send Now"}
                          </button>
                          <button
                            onClick={() => openEdit(r)}
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
                              if (window.confirm(`Delete "${r.name}"?`))
                                deleteMut.mutate(r._id);
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
              width: 480,
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
                {editingId ? "Edit Scheduled Report" : "New Scheduled Report"}
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
              {/* Dashboard Template */}
              <label style={labelStyle}>
                Dashboard Template *
                <select
                  value={form.dashboard_template_id}
                  onChange={(e) =>
                    setField("dashboard_template_id", e.target.value)
                  }
                  style={inputStyle}
                >
                  <option value="">Select template…</option>
                  {templates.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Report Name */}
              <label style={labelStyle}>
                Report Name *
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="e.g. Weekly KPI Summary"
                  style={inputStyle}
                />
              </label>

              {/* Schedule Type */}
              <label style={labelStyle}>
                Schedule
                <select
                  value={form.schedule_type}
                  onChange={(e) => setField("schedule_type", e.target.value)}
                  style={inputStyle}
                >
                  <option value="daily">Daily (8:00 AM)</option>
                  <option value="weekly">Weekly (Mon 8:00 AM)</option>
                  <option value="monthly">Monthly (1st, 8:00 AM)</option>
                  <option value="custom_cron">Custom cron…</option>
                </select>
              </label>

              {form.schedule_type === "custom_cron" && (
                <label style={labelStyle}>
                  Cron Expression *
                  <input
                    type="text"
                    value={form.cron_expression}
                    onChange={(e) =>
                      setField("cron_expression", e.target.value)
                    }
                    placeholder="e.g. 0 9 * * 5"
                    style={inputStyle}
                  />
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    Format: minute hour day-of-month month day-of-week
                  </span>
                </label>
              )}

              {/* Format */}
              <label style={labelStyle}>
                Report Format
                <select
                  value={form.format}
                  onChange={(e) => setField("format", e.target.value)}
                  style={inputStyle}
                >
                  <option value="pdf">HTML Attachment</option>
                  <option value="csv">CSV Attachment</option>
                  <option value="email_inline">Inline Email</option>
                </select>
              </label>

              {/* Date Range */}
              <label style={labelStyle}>
                Date Range (days)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.date_range_days}
                  onChange={(e) =>
                    setField("date_range_days", Number(e.target.value))
                  }
                  style={inputStyle}
                />
              </label>

              {/* Active toggle */}
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
                <span>Active (will run on schedule)</span>
              </label>

              {/* Recipients */}
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: 8,
                  }}
                >
                  Recipients *
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Name (optional)"
                    value={form.recipientName}
                    onChange={(e) => setField("recipientName", e.target.value)}
                    style={{ ...inputStyle, flex: "0 0 140px" }}
                  />
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={form.recipientEmail}
                    onChange={(e) => setField("recipientEmail", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={addRecipient}
                    style={{
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "0 14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    Add
                  </button>
                </div>
                {form.recipients.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {form.recipients.map((r) => (
                      <span
                        key={r.email}
                        style={{
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: 20,
                          padding: "3px 10px",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {r.name ? `${r.name} <${r.email}>` : r.email}
                        <button
                          onClick={() => removeRecipient(r.email)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#dc2626",
                            fontWeight: 700,
                            padding: 0,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Email Subject */}
              <label style={labelStyle}>
                Email Subject
                <input
                  type="text"
                  value={form.subject_template}
                  onChange={(e) => setField("subject_template", e.target.value)}
                  style={inputStyle}
                />
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
                    : "Create Report"}
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
