/**
 * AdminDashboardListPage
 *
 * Route: /admin/dashboards  (permission: dashboard.manage)
 *
 * Lists all dashboard templates with actions: Edit, Assign, Duplicate, Export, Delete.
 * Includes an inline assignment management modal per template.
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { API_CONFIG } from "../config/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardTemplate {
  _id: string;
  name: string;
  description?: string;
  targetScope: "tenant" | "centre" | "user";
  status: "draft" | "published" | "archived";
  widgets: any[];
  widgetCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface Assignment {
  _id: string;
  assigneeType: "role" | "user" | "centre";
  assigneeId: string;
  tabOrder: number;
  isDefault: boolean;
  _assigneeName?: string;
}

interface RoleItem {
  _id: string;
  name: string;
  code: string;
}

interface UserItem {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const BASE = `${API_CONFIG.API_URL}/v1`;

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? `HTTP ${res.status}`);
  return (json.data ?? json) as T;
}

// ─── AdminDashboardListPage ───────────────────────────────────────────────────

export default function AdminDashboardListPage() {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "draft" | "published">(
    "",
  );
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardTemplate | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Assignment modal state
  const [assignModalTemplate, setAssignModalTemplate] =
    useState<DashboardTemplate | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [newAssigneeType, setNewAssigneeType] = useState<
    "role" | "user" | "centre"
  >("role");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [newTabOrder, setNewTabOrder] = useState(0);
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [addingAssignment, setAddingAssignment] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<{
    top: number;
    right: number;
  } | null>(null);

  // ── Load templates ──────────────────────────────────────────────────────────

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<DashboardTemplate[]>(
        `${BASE}/admin/dashboards`,
      );
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Close action menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
        setMenuAnchor(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Auto-clear action message
  useEffect(() => {
    if (!actionMessage) return;
    const t = setTimeout(() => setActionMessage(null), 3000);
    return () => clearTimeout(t);
  }, [actionMessage]);

  // ── Stats ───────────────────────────────────────────────────────────────────

  const total = templates.length;
  const published = templates.filter((t) => t.status === "published").length;
  const draft = templates.filter((t) => t.status === "draft").length;

  // ── Filtered list ────────────────────────────────────────────────────────────

  const filtered = templates.filter((t) => {
    const matchSearch =
      !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleDuplicate = async (id: string) => {
    setOpenMenuId(null);
    setMenuAnchor(null);
    try {
      const result = await apiFetch<{ _id: string }>(
        `${BASE}/admin/dashboards/${id}/duplicate`,
        { method: "POST" },
      );
      setActionMessage("Template duplicated. Opening editor…");
      await loadTemplates();
      navigate(`/admin/dashboard-builder/${result._id}`);
    } catch (e: any) {
      setActionMessage(`Error: ${e.message}`);
    }
  };

  const handleExport = async (id: string, name: string) => {
    setOpenMenuId(null);
    setMenuAnchor(null);
    try {
      const res = await fetch(`${BASE}/admin/dashboards/${id}/export`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setActionMessage(`Export failed: ${e.message}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`${BASE}/admin/dashboards/${deleteTarget._id}`, {
        method: "DELETE",
      });
      setActionMessage(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      await loadTemplates();
    } catch (e: any) {
      setActionMessage(`Delete failed: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // ── Assignment modal ─────────────────────────────────────────────────────────

  const openAssignModal = async (template: DashboardTemplate) => {
    setOpenMenuId(null);
    setMenuAnchor(null);
    setAssignModalTemplate(template);
    setAssignLoading(true);
    try {
      const [asgData, rolesData, usersData] = await Promise.all([
        apiFetch<Assignment[]>(
          `${BASE}/admin/dashboards/${template._id}/assignments`,
        ),
        apiFetch<RoleItem[]>(`${API_CONFIG.API_URL}/roles`),
        apiFetch<{ users?: UserItem[] } | UserItem[]>(
          `${API_CONFIG.API_URL}/users?limit=200&isActive=true`,
        ),
      ]);
      setAssignments(Array.isArray(asgData) ? asgData : []);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      const rawUsers = Array.isArray(usersData)
        ? usersData
        : ((usersData as any)?.users ?? []);
      setUsers(rawUsers);
    } catch {
      setAssignments([]);
    } finally {
      setAssignLoading(false);
    }
    setNewAssigneeType("role");
    setNewAssigneeId("");
    setNewTabOrder(0);
    setNewIsDefault(false);
  };

  const closeAssignModal = () => {
    setAssignModalTemplate(null);
    setAssignments([]);
  };

  const handleAddAssignment = async () => {
    if (!assignModalTemplate || !newAssigneeId) return;
    setAddingAssignment(true);
    try {
      await apiFetch<Assignment>(
        `${BASE}/admin/dashboards/${assignModalTemplate._id}/assignments`,
        {
          method: "POST",
          body: JSON.stringify({
            assigneeType: newAssigneeType,
            assigneeId: newAssigneeId,
            tabOrder: newTabOrder,
            isDefault: newIsDefault,
          }),
        },
      );
      const updated = await apiFetch<Assignment[]>(
        `${BASE}/admin/dashboards/${assignModalTemplate._id}/assignments`,
      );
      setAssignments(Array.isArray(updated) ? updated : []);
      setNewAssigneeId("");
      setNewTabOrder(0);
      setNewIsDefault(false);
    } catch (e: any) {
      setActionMessage(`Assignment failed: ${e.message}`);
    } finally {
      setAddingAssignment(false);
    }
  };

  const handleRemoveAssignment = async (asgId: string) => {
    if (!assignModalTemplate) return;
    try {
      await apiFetch(
        `${BASE}/admin/dashboards/${assignModalTemplate._id}/assignments/${asgId}`,
        { method: "DELETE" },
      );
      setAssignments((prev) => prev.filter((a) => a._id !== asgId));
    } catch (e: any) {
      setActionMessage(`Remove failed: ${e.message}`);
    }
  };

  const getAssigneeName = (asg: Assignment): string => {
    if (asg.assigneeType === "role") {
      const r = roles.find((r) => r._id === asg.assigneeId);
      return r ? `${r.name} (${r.code})` : asg.assigneeId;
    }
    if (asg.assigneeType === "user") {
      const u = users.find((u) => u._id === asg.assigneeId);
      return u ? `${u.firstName} ${u.lastName} — ${u.email}` : asg.assigneeId;
    }
    return asg.assigneeId;
  };

  const assigneeOptions =
    newAssigneeType === "role"
      ? roles.map((r) => ({ value: r._id, label: `${r.name} (${r.code})` }))
      : users.map((u) => ({
          value: u._id,
          label: `${u.firstName} ${u.lastName} — ${u.email}`,
        }));

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div
        style={{
          padding: "28px 28px 40px",
          background: "#F8F9FC",
          minHeight: "100vh",
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
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
                fontFamily: '"DM Serif Display", Georgia, serif',
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0f172a",
                margin: 0,
              }}
            >
              Dashboard Templates
            </h1>
            <p style={{ fontSize: 13, color: "#667085", margin: "4px 0 0" }}>
              Build and manage dashboard templates. Assign them to roles or
              users to control who sees what.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => navigate("/admin/dashboard-builder")}
              style={{
                background: "linear-gradient(160deg, #4f46e5, #4338ca)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                boxShadow: "0 4px 14px rgba(67,56,202,.35)",
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              + New Dashboard
            </button>
          </div>
        </div>

        {/* Action message toast */}
        {actionMessage && (
          <div
            style={{
              background: "#ECFDF3",
              border: "1px solid #A9EFC5",
              borderRadius: 8,
              padding: "10px 16px",
              fontSize: 13,
              color: "#027A48",
              marginBottom: 16,
            }}
          >
            {actionMessage}
          </div>
        )}

        {/* Stats cards */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {[
            {
              label: "Total",
              value: total,
              color: "#7F56D9",
              bg: "#F4F3FF",
              icon: "📊",
            },
            {
              label: "Published",
              value: published,
              color: "#027A48",
              bg: "#ECFDF3",
              icon: "✅",
            },
            {
              label: "Draft",
              value: draft,
              color: "#B54708",
              bg: "#FFFAEB",
              icon: "📝",
            },
            {
              label: "Filtered",
              value: filtered.length,
              color: "#175CD3",
              bg: "#EFF8FF",
              icon: "🔍",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                flex: "1 1 160px",
                background: "#fff",
                borderRadius: 16,
                padding: "18px 20px",
                border: "1px solid #e2e8f0",
                boxShadow:
                  "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: stat.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {stat.icon}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: "#101828",
                    lineHeight: 1.2,
                  }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: "#667085", marginTop: 2 }}>
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "12px 16px",
            boxShadow:
              "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            border: "1px solid #e2e8f0",
            marginBottom: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px" }}>
            <span
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 14,
                color: "#9CA3AF",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                paddingLeft: 32,
                padding: "9px 10px 9px 32px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 8,
                background: "#F9FAFB",
                fontSize: 14,
                color: "#101828",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "" | "draft" | "published")
            }
            style={{
              padding: "9px 28px 9px 10px",
              border: statusFilter
                ? "1.5px solid #4f46e5"
                : "1.5px solid #e2e8f0",
              borderRadius: 8,
              background: statusFilter ? "#EFF6FF" : "#F9FAFB",
              fontSize: 14,
              color: statusFilter ? "#4f46e5" : "#101828",
              fontWeight: statusFilter ? 500 : 400,
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          {(search || statusFilter) && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("");
              }}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                background: "#fff",
                color: "#6B7280",
                padding: "9px 14px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            boxShadow:
              "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 48,
                textAlign: "center",
                color: "#667085",
                fontSize: 14,
              }}
            >
              Loading templates…
            </div>
          ) : error ? (
            <div
              style={{
                padding: 48,
                textAlign: "center",
                color: "#DC2626",
                fontSize: 14,
              }}
            >
              {error}{" "}
              <button
                onClick={loadTemplates}
                style={{
                  marginLeft: 8,
                  color: "#4f46e5",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 64,
                textAlign: "center",
                color: "#667085",
                fontSize: 14,
              }}
            >
              {templates.length === 0
                ? "No dashboard templates yet. Click '+ New Dashboard' to create one."
                : "No templates match your search."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {[
                    "Name",
                    "Scope",
                    "Status",
                    "Widgets",
                    "Last Updated",
                    "Actions",
                  ].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "12px 16px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        textAlign: col === "Actions" ? "right" : "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t._id}
                    style={{
                      background: "#fff",
                      borderBottom: "1px solid #F2F4F7",
                      borderLeft: "3px solid transparent",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#F9FAFB")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "#fff")
                    }
                  >
                    {/* Name */}
                    <td style={{ padding: "14px 16px" }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#101828",
                        }}
                      >
                        {t.name}
                      </div>
                      {t.description && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#667085",
                            marginTop: 2,
                            maxWidth: 300,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.description}
                        </div>
                      )}
                    </td>
                    {/* Scope */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          background:
                            t.targetScope === "tenant"
                              ? "#EFF8FF"
                              : t.targetScope === "centre"
                                ? "#FFF4ED"
                                : "#F4F3FF",
                          color:
                            t.targetScope === "tenant"
                              ? "#175CD3"
                              : t.targetScope === "centre"
                                ? "#B93815"
                                : "#5925DC",
                          textTransform: "capitalize",
                        }}
                      >
                        {t.targetScope}
                      </span>
                    </td>
                    {/* Status */}
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          background:
                            t.status === "published" ? "#ECFDF3" : "#FFFAEB",
                          color:
                            t.status === "published" ? "#027A48" : "#B54708",
                          textTransform: "capitalize",
                        }}
                      >
                        {t.status === "published"
                          ? "✓ Published"
                          : t.status === "archived"
                            ? "Archived"
                            : "Draft"}
                      </span>
                    </td>
                    {/* Widgets */}
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 14,
                        color: "#344054",
                        fontWeight: 600,
                      }}
                    >
                      {t.widgetCount ?? t.widgets?.length ?? 0}
                    </td>
                    {/* Last Updated */}
                    <td
                      style={{
                        padding: "14px 16px",
                        fontSize: 13,
                        color: "#667085",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(t.updatedAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    {/* Actions */}
                    <td
                      style={{
                        padding: "14px 16px",
                        textAlign: "right",
                        position: "relative",
                      }}
                    >
                      <div
                        ref={openMenuId === t._id ? menuRef : null}
                        style={{
                          position: "relative",
                          display: "inline-block",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (
                              e.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            setOpenMenuId((prev) => {
                              const nextId = prev === t._id ? null : t._id;
                              setMenuAnchor(
                                nextId
                                  ? {
                                      top: rect.bottom + 4,
                                      right: window.innerWidth - rect.right,
                                    }
                                  : null,
                              );
                              return nextId;
                            });
                          }}
                          style={{
                            background: "none",
                            border: "1px solid #e2e8f0",
                            borderRadius: 6,
                            padding: "5px 10px",
                            fontSize: 14,
                            cursor: "pointer",
                            color: "#344054",
                          }}
                        >
                          •••
                        </button>
                        {openMenuId === t._id && (
                          <div
                            style={{
                              position: "fixed",
                              top: menuAnchor?.top ?? 0,
                              right: menuAnchor?.right ?? 0,
                              background: "#fff",
                              border: "1px solid #e2e8f0",
                              borderRadius: 8,
                              boxShadow: "0 4px 16px rgba(0,0,0,.12)",
                              zIndex: 9999,
                              minWidth: 160,
                            }}
                          >
                            <button
                              onClick={() =>
                                navigate(`/admin/dashboard-builder/${t._id}`)
                              }
                              style={menuItemStyle}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => openAssignModal(t)}
                              style={menuItemStyle}
                            >
                              👥 Assign
                            </button>
                            <button
                              onClick={() => handleDuplicate(t._id)}
                              style={menuItemStyle}
                            >
                              📋 Duplicate
                            </button>
                            <button
                              onClick={() => handleExport(t._id, t.name)}
                              style={menuItemStyle}
                            >
                              ⬇ Export
                            </button>
                            <div
                              style={{
                                height: 1,
                                background: "#F2F4F7",
                                margin: "4px 0",
                              }}
                            />
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                setMenuAnchor(null);
                                setDeleteTarget(t);
                              }}
                              style={{
                                ...menuItemStyle,
                                color: "#DC2626",
                              }}
                              onMouseEnter={(e) => {
                                (
                                  e.currentTarget as HTMLElement
                                ).style.background = "#FEF2F2";
                              }}
                              onMouseLeave={(e) => {
                                (
                                  e.currentTarget as HTMLElement
                                ).style.background = "transparent";
                              }}
                            >
                              🗑 Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 28,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,.3)",
              margin: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "#FEF2F2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                🗑
              </div>
              <div>
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: "#101828" }}
                >
                  Delete Template
                </div>
                <div style={{ fontSize: 13, color: "#667085", marginTop: 2 }}>
                  This cannot be undone
                </div>
              </div>
            </div>
            <p style={{ fontSize: 14, color: "#344054", margin: "0 0 20px" }}>
              Are you sure you want to delete{" "}
              <strong>"{deleteTarget.name}"</strong>? All assignments for this
              template will also be removed.
            </p>
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "1px solid #D1D5DB",
                  background: "#fff",
                  color: "#344054",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: deleting ? "#fca5a5" : "#DC2626",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {assignModalTemplate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 28,
              maxWidth: 600,
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,.3)",
              maxHeight: "85vh",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: "#101828" }}
                >
                  Manage Assignments
                </div>
                <div style={{ fontSize: 13, color: "#667085", marginTop: 2 }}>
                  {assignModalTemplate.name}
                </div>
              </div>
              <button
                onClick={closeAssignModal}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#667085",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Existing assignments */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#667085",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                Current Assignments
              </div>
              {assignLoading ? (
                <div style={{ fontSize: 13, color: "#667085", padding: 12 }}>
                  Loading…
                </div>
              ) : assignments.length === 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "#9ca3af",
                    padding: "12px 0",
                    textAlign: "center",
                  }}
                >
                  No assignments yet. Add one below.
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  {assignments.map((asg, idx) => (
                    <div
                      key={asg._id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderBottom:
                          idx < assignments.length - 1
                            ? "1px solid #F2F4F7"
                            : "none",
                        background: "#FAFAFA",
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              background:
                                asg.assigneeType === "role"
                                  ? "#F4F3FF"
                                  : "#EFF8FF",
                              color:
                                asg.assigneeType === "role"
                                  ? "#5925DC"
                                  : "#175CD3",
                              textTransform: "capitalize",
                            }}
                          >
                            {asg.assigneeType}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              color: "#344054",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {getAssigneeName(asg)}
                          </span>
                          {asg.isDefault && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#027A48",
                                background: "#ECFDF3",
                                padding: "1px 6px",
                                borderRadius: 10,
                                fontWeight: 600,
                              }}
                            >
                              Default
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#9ca3af",
                            marginTop: 2,
                          }}
                        >
                          Tab order: {asg.tabOrder}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveAssignment(asg._id)}
                        style={{
                          background: "none",
                          border: "1px solid #FCA5A5",
                          borderRadius: 6,
                          padding: "4px 10px",
                          fontSize: 12,
                          color: "#DC2626",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new assignment */}
            <div
              style={{
                background: "#F9FAFB",
                borderRadius: 10,
                padding: "16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#667085",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 12,
                }}
              >
                Add New Assignment
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                {/* Assignee Type */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#344054",
                      marginBottom: 4,
                    }}
                  >
                    Assign To
                  </label>
                  <select
                    value={newAssigneeType}
                    onChange={(e) => {
                      setNewAssigneeType(
                        e.target.value as "role" | "user" | "centre",
                      );
                      setNewAssigneeId("");
                    }}
                    style={inputStyle}
                  >
                    <option value="role">Role</option>
                    <option value="user">User</option>
                  </select>
                </div>
                {/* Assignee */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#344054",
                      marginBottom: 4,
                    }}
                  >
                    {newAssigneeType === "role" ? "Role" : "User"}
                  </label>
                  <select
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">
                      — Select {newAssigneeType === "role" ? "role" : "user"} —
                    </option>
                    {assigneeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Tab order */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#344054",
                      marginBottom: 4,
                    }}
                  >
                    Tab Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newTabOrder}
                    onChange={(e) => setNewTabOrder(Number(e.target.value))}
                    style={inputStyle}
                  />
                </div>
                {/* Is default */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingTop: 18,
                  }}
                >
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={newIsDefault}
                    onChange={(e) => setNewIsDefault(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <label
                    htmlFor="isDefault"
                    style={{
                      fontSize: 13,
                      color: "#344054",
                      cursor: "pointer",
                    }}
                  >
                    Set as default tab
                  </label>
                </div>
              </div>
              <button
                onClick={handleAddAssignment}
                disabled={!newAssigneeId || addingAssignment}
                style={{
                  background:
                    !newAssigneeId || addingAssignment
                      ? "#D0C8F0"
                      : "linear-gradient(160deg, #4f46e5, #4338ca)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  boxShadow:
                    !newAssigneeId || addingAssignment
                      ? "none"
                      : "0 4px 14px rgba(67,56,202,.35)",
                  padding: "9px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor:
                    !newAssigneeId || addingAssignment
                      ? "not-allowed"
                      : "pointer",
                  width: "100%",
                }}
              >
                {addingAssignment ? "Adding…" : "Add Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "9px 16px",
  background: "transparent",
  border: "none",
  fontSize: 13,
  color: "#344054",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  fontSize: 13,
  color: "#101828",
  outline: "none",
  boxSizing: "border-box",
};
