import React, { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { usePermissions } from "../hooks/usePermissions";
import apiClient from "../utils/api";
import { API_CONFIG } from "../config/constants";
import { getNotificationIcon } from "../utils/notificationIcons";
import axios from "axios";

// ── Trigger definitions ───────────────────────────────────────────────────────

interface TriggerDef {
  key: string;
  label: string;
  description: string;
  section:
    | "Ticket Events"
    | "KB Events"
    | "System Events"
    | "Service Request Events";
}

const TRIGGERS: TriggerDef[] = [
  {
    key: "ticket_created",
    label: "Ticket Created",
    description: "When a new ticket is submitted",
    section: "Ticket Events",
  },
  {
    key: "ticket_assigned_to_me",
    label: "Ticket Assigned",
    description: "When a ticket is assigned to an agent",
    section: "Ticket Events",
  },
  {
    key: "ticket_reply_added",
    label: "New Reply on Ticket",
    description: "When someone posts a reply on a ticket",
    section: "Ticket Events",
  },
  {
    key: "ticket_status_changed",
    label: "Status Changed",
    description: "When a ticket's status is updated",
    section: "Ticket Events",
  },
  {
    key: "ticket_mentioned",
    label: "Mentioned in Ticket",
    description: "When a user is @mentioned in a ticket",
    section: "Ticket Events",
  },
  {
    key: "ticket_closed",
    label: "Ticket Closed",
    description: "When a ticket is marked as closed",
    section: "Ticket Events",
  },
  {
    key: "ticket_escalated",
    label: "Ticket Escalated",
    description: "When a ticket is escalated to the next level",
    section: "Ticket Events",
  },
  {
    key: "kb_article_published",
    label: "Article Published",
    description: "When a new KB article goes live",
    section: "KB Events",
  },
  {
    key: "kb_article_updated",
    label: "Article Updated",
    description: "When an existing KB article is edited",
    section: "KB Events",
  },
  {
    key: "kb_article_archived",
    label: "Article Archived",
    description: "When a KB article is archived",
    section: "KB Events",
  },
  {
    key: "sla_breach_warning",
    label: "SLA Breach Warning",
    description: "When a ticket is approaching its SLA deadline",
    section: "System Events",
  },
  {
    key: "sla_breached",
    label: "SLA Breached",
    description: "When a ticket has exceeded its SLA deadline",
    section: "System Events",
  },
  // Service Request (PSR/ISR) lifecycle — N1–N15
  {
    key: "sr_created",
    label: "Service Request Created",
    description: "When a PSR/ISR is raised (parent acknowledgement)",
    section: "Service Request Events",
  },
  {
    key: "sr_task_assigned",
    label: "SR Task Assigned",
    description: "When a research/resolution task is assigned to a department",
    section: "Service Request Events",
  },
  {
    key: "sr_resolved",
    label: "Service Request Resolved",
    description: "When a service request is resolved (parent notified)",
    section: "Service Request Events",
  },
  {
    key: "sr_reassigned",
    label: "Service Request Re-assigned",
    description: "When a resolution is re-assigned to another department",
    section: "Service Request Events",
  },
  {
    key: "sr_child_case",
    label: "Child Case Created",
    description:
      "When an SR is cancelled and a child case is created (e.g. RE Cell)",
    section: "Service Request Events",
  },
  {
    key: "sr_reopened",
    label: "Service Request Re-opened",
    description: "When a parent re-opens an SR and closure is needed",
    section: "Service Request Events",
  },
  {
    key: "sr_closed",
    label: "Service Request Closed",
    description: "When a service request is finally closed",
    section: "Service Request Events",
  },
];

const SECTIONS = [
  "Ticket Events",
  "KB Events",
  "System Events",
  "Service Request Events",
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Role {
  _id: string;
  name: string;
}
interface Project {
  _id: string;
  name: string;
  code: string;
}
interface TriggerSetting {
  isEnabled: boolean;
  inApp: boolean;
}
type Settings = Record<string, TriggerSetting>;

interface SettingRow {
  projectId?: string | null;
  triggerType: string;
  roleId: string | { _id: string };
  isEnabled: boolean;
  channels: { inApp: boolean; email: boolean };
}

// ── Toggle ────────────────────────────────────────────────────────────────────

const Toggle: React.FC<{
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  size?: "sm" | "md";
}> = ({ checked, disabled = false, onChange, size = "md" }) => {
  const w = size === "sm" ? 32 : 40,
    h = size === "sm" ? 18 : 22;
  const d = size === "sm" ? 14 : 16,
    of = 2;
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: w,
        height: h,
        borderRadius: h,
        border: "none",
        background: disabled ? "#E4E7EC" : checked ? "#7F56D9" : "#D0D5DD",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
        padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: of,
          left: checked ? w - d - of : of,
          width: d,
          height: d,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          transition: "left 0.2s",
          display: "block",
        }}
      />
    </button>
  );
};

// ── Checkmark svg ─────────────────────────────────────────────────────────────

const Checkmark = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 12 12"
    fill="none"
    stroke="#fff"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="2 6 5 9 10 3" />
  </svg>
);

// ── Main page ─────────────────────────────────────────────────────────────────

const NotificationSettingsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  const canView = hasPermission("NOTIFICATION_VIEW_SETTINGS");
  const canManage = hasPermission("NOTIFICATION_MANAGE");

  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // null = Global Defaults
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  // [] = All Roles; otherwise specific role IDs
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "err">("idle");
  const [saveCount, setSaveCount] = useState(0);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  // summary of all saved configs
  const [summaryByRole, setSummaryByRole] = useState<
    Record<string, { roleName: string; enabled: string[]; total: number }>
  >({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [confirmDeleteRoleId, setConfirmDeleteRoleId] = useState<string | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const triggerListRef = useRef<HTMLDivElement>(null);

  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // ── Close role dropdown on outside click ──────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        roleDropdownRef.current &&
        !roleDropdownRef.current.contains(e.target as Node)
      ) {
        setRoleDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Load projects (once) ────────────────────────────────────────────────

  useEffect(() => {
    if (!canView) return;
    const token = localStorage.getItem("authToken");
    const headers = { Authorization: `Bearer ${token}` };
    axios
      .get(`${API_CONFIG.API_URL}/projects?limit=100`, { headers })
      .then((projRes) => {
        // API returns { data: { projects: [...], pagination: {} } }
        const projectsArray = Array.isArray(projRes.data.data?.projects)
          ? projRes.data.data.projects
          : Array.isArray(projRes.data.data)
            ? projRes.data.data
            : [];
        setProjects(projectsArray);
      })
      .catch(() => {});
  }, [canView]);

  // ── Load roles — re-fetch whenever project changes ───────────────────────

  useEffect(() => {
    if (!canView) return;
    const token = localStorage.getItem("authToken");
    const headers = { Authorization: `Bearer ${token}` };
    const params = selectedProjectId ? { projectId: selectedProjectId } : {};
    setSelectedRoleIds([]); // reset role selection when project changes
    axios
      .get(`${API_CONFIG.API_URL}/roles`, { headers, params })
      .then((rolesRes) => {
        setRoles(Array.isArray(rolesRes.data.data) ? rolesRes.data.data : []);
      })
      .catch(() => {});
  }, [canView, selectedProjectId]);

  // ── Load settings ─────────────────────────────────────────────────────────

  const loadSettings = useCallback(
    async (projectId: string | null, refRoleId?: string) => {
      try {
        setLoading(true);
        const url = projectId
          ? `/admin/notification-settings?projectId=${projectId}`
          : "/admin/notification-settings";
        const res = await apiClient.get(url);
        const rows: SettingRow[] = res.data?.data ?? [];

        const built: Settings = {};
        rows.forEach((row) => {
          const rowRoleId =
            typeof row.roleId === "object" ? row.roleId._id : row.roleId;
          if (!refRoleId || rowRoleId === refRoleId) {
            built[row.triggerType] = {
              isEnabled: row.isEnabled,
              inApp: row.channels?.inApp ?? true,
            };
          }
        });

        // Fill defaults for any missing triggers
        TRIGGERS.forEach((t) => {
          if (!built[t.key]) built[t.key] = { isEnabled: true, inApp: true };
        });

        setSettings(built);
      } catch {
        /* non-fatal */
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!canView) return;
    const refRoleId =
      selectedRoleIds.length > 0 ? selectedRoleIds[0] : undefined;
    loadSettings(selectedProjectId, refRoleId);
  }, [selectedProjectId, selectedRoleIds, canView, loadSettings]);

  // ── Load summary of all saved configs ─────────────────────────────────────

  useEffect(() => {
    if (!canView) return;
    setSummaryLoading(true);
    const url = selectedProjectId
      ? `/admin/notification-settings?projectId=${selectedProjectId}`
      : "/admin/notification-settings";
    apiClient
      .get(url)
      .then((res) => {
        const rows: SettingRow[] = res.data?.data ?? [];
        const byRole: Record<
          string,
          { roleName: string; enabled: string[]; total: number }
        > = {};
        rows.forEach((row) => {
          const roleObj = row.roleId as any;
          const roleId =
            typeof roleObj === "object"
              ? (roleObj._id as string)
              : String(roleObj);
          const roleName =
            typeof roleObj === "object" ? (roleObj.name as string) : roleId;
          if (!byRole[roleId])
            byRole[roleId] = { roleName, enabled: [], total: 0 };
          byRole[roleId].total++;
          if (row.isEnabled) byRole[roleId].enabled.push(row.triggerType);
        });
        setSummaryByRole(byRole);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, [canView, selectedProjectId, saveCount]);

  // ── Toggle ────────────────────────────────────────────────────────────────

  const handleToggle = (
    triggerKey: string,
    field: "isEnabled" | "inApp",
    value: boolean,
  ) => {
    if (!canManage) return;
    setSettings((prev) => ({
      ...prev,
      [triggerKey]: { ...prev[triggerKey], [field]: value },
    }));
    setSaveStatus("idle");
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!canManage) return;
    try {
      setSaving(true);
      const rolesToSave =
        selectedRoleIds.length === 0
          ? roles.map((r) => r._id)
          : selectedRoleIds;
      await Promise.all(
        rolesToSave.flatMap((roleId) =>
          TRIGGERS.map((trigger) =>
            apiClient.put("/admin/notification-settings", {
              projectId: selectedProjectId ?? undefined,
              triggerType: trigger.key,
              roleId,
              isEnabled: settings[trigger.key]?.isEnabled ?? true,
              channels: {
                inApp: settings[trigger.key]?.inApp ?? true,
                email: false,
              },
            }),
          ),
        ),
      );
      setSaveStatus("ok");
      setSaveCount((c) => c + 1);
    } catch {
      setSaveStatus("err");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // ── Role multiselect helpers ──────────────────────────────────────────────

  const isAllRoles = selectedRoleIds.length === 0;

  const handleAllRolesClick = () => setSelectedRoleIds([]);

  const handleRoleClick = (id: string) => {
    if (isAllRoles) {
      // Switching from "all" to specific selection — start with just this role
      setSelectedRoleIds([id]);
    } else {
      setSelectedRoleIds((prev) => {
        const next = prev.includes(id)
          ? prev.filter((r) => r !== id)
          : [...prev, id];
        return next.length === 0 ? [] : next; // if last deselected, back to "all"
      });
    }
  };

  const roleButtonLabel = () => {
    if (isAllRoles) return "All Roles";
    if (selectedRoleIds.length === 1)
      return roles.find((r) => r._id === selectedRoleIds[0])?.name ?? "1 role";
    return `${selectedRoleIds.length} roles selected`;
  };

  // ── Edit / Delete summary row handlers ────────────────────────────────────

  const handleEdit = (roleId: string) => {
    setSelectedRoleIds([roleId]);
    setRoleDropdownOpen(false);
    setTimeout(() => {
      triggerListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  };

  const handleDelete = async (roleId: string) => {
    try {
      setDeleting(true);
      const params = new URLSearchParams({ roleId });
      if (selectedProjectId) params.set("projectId", selectedProjectId);
      await apiClient.delete(
        `/admin/notification-settings?${params.toString()}`,
      );
      setConfirmDeleteRoleId(null);
      setSaveCount((c) => c + 1);
    } catch {
      /* non-fatal */
    } finally {
      setDeleting(false);
    }
  };

  // ── Access denied ─────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <DashboardLayout>
        <div
          style={{
            background: "#F8F9FC",
            minHeight: "100vh",
            padding: "24px 28px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #E4E7EC",
              padding: "48px 32px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
            <p
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#344054",
                margin: "0 0 4px",
              }}
            >
              Access Denied
            </p>
            <p style={{ fontSize: 13, color: "#667085", margin: 0 }}>
              You do not have permission to view notification settings.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div
        style={{
          background: "#F8F9FC",
          minHeight: "100vh",
          padding: "24px 28px",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #E4E7EC",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            padding: "18px 24px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: "#101828",
              }}
            >
              Notification Settings
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#667085" }}>
              Configure notification triggers per project and role
            </p>
          </div>
          {!canManage && (
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                background: "#FEF3C7",
                color: "#92400E",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              View only
            </span>
          )}
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #E4E7EC",
            padding: "14px 20px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          {/* Project dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#344054",
                flexShrink: 0,
              }}
            >
              Project:
            </span>
            <div style={{ position: "relative" }}>
              <select
                value={selectedProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
                style={{
                  padding: "8px 34px 8px 12px",
                  border: "1.5px solid #D0D5DD",
                  borderRadius: 8,
                  background: "#fff",
                  fontSize: 13,
                  color: "#344054",
                  fontWeight: 500,
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                  outline: "none",
                  minWidth: 200,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#7F56D9")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#D0D5DD")}
              >
                <option value="">🌐 Global Defaults</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <svg
                style={{
                  position: "absolute",
                  right: 9,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#667085"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 26,
              background: "#E4E7EC",
              flexShrink: 0,
            }}
          />

          {/* Role multiselect */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#344054",
                flexShrink: 0,
              }}
            >
              Role(s):
            </span>
            <div ref={roleDropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setRoleDropdownOpen((o) => !o)}
                style={{
                  padding: "8px 34px 8px 12px",
                  border: `1.5px solid ${roleDropdownOpen ? "#7F56D9" : "#D0D5DD"}`,
                  borderRadius: 8,
                  background: "#fff",
                  fontSize: 13,
                  color: "#344054",
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                  minWidth: 200,
                  textAlign: "left",
                  position: "relative",
                  fontFamily: "inherit",
                }}
              >
                {roleButtonLabel()}
                <svg
                  style={{
                    position: "absolute",
                    right: 9,
                    top: "50%",
                    transform: `translateY(-50%) rotate(${roleDropdownOpen ? 180 : 0}deg)`,
                    transition: "transform 0.15s",
                    pointerEvents: "none",
                  }}
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#667085"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {roleDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    minWidth: 220,
                    background: "#fff",
                    border: "1px solid #E4E7EC",
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                    zIndex: 200,
                    overflow: "hidden",
                  }}
                >
                  {/* All Roles row */}
                  <div
                    onClick={handleAllRolesClick}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      cursor: "pointer",
                      borderBottom: "1px solid #F2F4F7",
                      background: isAllRoles ? "#F4F3FF" : "transparent",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: `1.5px solid ${isAllRoles ? "#7F56D9" : "#D0D5DD"}`,
                        background: isAllRoles ? "#7F56D9" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isAllRoles && <Checkmark />}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#344054",
                      }}
                    >
                      All Roles
                    </span>
                  </div>

                  {/* Individual roles */}
                  {roles.map((role) => {
                    const selected =
                      !isAllRoles && selectedRoleIds.includes(role._id);
                    return (
                      <div
                        key={role._id}
                        onClick={() => handleRoleClick(role._id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "9px 14px",
                          cursor: "pointer",
                          background: selected ? "#F4F3FF" : "transparent",
                        }}
                      >
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: `1.5px solid ${selected ? "#7F56D9" : "#D0D5DD"}`,
                            background: selected ? "#7F56D9" : "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {selected && <Checkmark />}
                        </div>
                        <span style={{ fontSize: 13, color: "#344054" }}>
                          {role.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Multi-role hint */}
          {!isAllRoles && selectedRoleIds.length > 1 && (
            <span
              style={{ fontSize: 12, color: "#98A2B3", marginLeft: "auto" }}
            >
              Saving will apply the same settings to all selected roles
            </span>
          )}
          {isAllRoles && roles.length > 0 && (
            <span
              style={{ fontSize: 12, color: "#98A2B3", marginLeft: "auto" }}
            >
              Saving will apply to all roles
            </span>
          )}
        </div>

        {/* ── Trigger list ─────────────────────────────────────────────────── */}
        <div
          ref={triggerListRef}
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #E4E7EC",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "#98A2B3",
                fontSize: 14,
              }}
            >
              Loading triggers…
            </div>
          ) : (
            SECTIONS.map((section) => {
              const sectionTriggers = TRIGGERS.filter(
                (t) => t.section === section,
              );
              return (
                <React.Fragment key={section}>
                  {/* Section header */}
                  <div
                    style={{
                      padding: "8px 20px",
                      background: "#F9FAFB",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#667085",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      borderTop: "1px solid #F2F4F7",
                      borderBottom: "1px solid #F2F4F7",
                    }}
                  >
                    {section}
                  </div>

                  {sectionTriggers.map((trigger, idx) => {
                    const cell = settings[trigger.key] ?? {
                      isEnabled: true,
                      inApp: true,
                    };
                    const iconCfg = getNotificationIcon(trigger.key);
                    const isLast = idx === sectionTriggers.length - 1;

                    return (
                      <div
                        key={trigger.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "14px 20px",
                          gap: 16,
                          borderBottom: isLast ? "none" : "1px solid #F9FAFB",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#FAFAFA")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        {/* Icon bubble */}
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            flexShrink: 0,
                            background: cell.isEnabled ? iconCfg.bg : "#F2F4F7",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "background 0.2s",
                          }}
                        >
                          {iconCfg.icon}
                        </div>

                        {/* Label + description */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: cell.isEnabled ? "#101828" : "#98A2B3",
                              transition: "color 0.2s",
                            }}
                          >
                            {trigger.label}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#98A2B3",
                              marginTop: 2,
                            }}
                          >
                            {trigger.description}
                          </div>
                        </div>

                        {/* Controls */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          {/* Enable toggle */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 16px",
                              borderRight: "1px solid #F2F4F7",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                minWidth: 52,
                                textAlign: "right",
                                color: cell.isEnabled ? "#344054" : "#98A2B3",
                                transition: "color 0.2s",
                              }}
                            >
                              {cell.isEnabled ? "Enabled" : "Disabled"}
                            </span>
                            <Toggle
                              checked={cell.isEnabled}
                              disabled={!canManage}
                              onChange={(v) =>
                                handleToggle(trigger.key, "isEnabled", v)
                              }
                            />
                          </div>

                          {/* In-App toggle */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 16px",
                              opacity: cell.isEnabled ? 1 : 0.35,
                              transition: "opacity 0.2s",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                color: "#667085",
                                minWidth: 42,
                                textAlign: "right",
                              }}
                            >
                              In-App
                            </span>
                            <Toggle
                              checked={cell.inApp}
                              disabled={!canManage || !cell.isEnabled}
                              onChange={(v) =>
                                handleToggle(trigger.key, "inApp", v)
                              }
                              size="sm"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* ── Save bar ─────────────────────────────────────────────────────── */}
        {canManage && (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 14,
            }}
          >
            {saveStatus === "ok" && (
              <span style={{ fontSize: 13, color: "#027A48", fontWeight: 600 }}>
                ✓ Settings saved successfully
              </span>
            )}
            {saveStatus === "err" && (
              <span style={{ fontSize: 13, color: "#B42318", fontWeight: 600 }}>
                ✗ Failed to save — please retry
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || loading}
              style={{
                padding: "10px 28px",
                borderRadius: 8,
                border: "none",
                background: saving || loading ? "#D0D5DD" : "#7F56D9",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: saving || loading ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        )}
        {/* ── Existing configurations summary ────────────────────────────── */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #E4E7EC",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            marginTop: 16,
            overflow: "hidden",
          }}
        >
          {/* card header */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #F2F4F7",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#101828",
                }}
              >
                Existing Configurations
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#667085" }}>
                Roles with saved settings for{" "}
                {selectedProjectId
                  ? (projects.find((p) => p._id === selectedProjectId)?.name ??
                    "this project")
                  : "Global Defaults"}
              </p>
            </div>
            <span
              style={{
                padding: "3px 12px",
                borderRadius: 999,
                background: "#F4F3FF",
                color: "#5925DC",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {Object.keys(summaryByRole).length} role
              {Object.keys(summaryByRole).length !== 1 ? "s" : ""} configured
            </span>
          </div>

          {summaryLoading ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                color: "#98A2B3",
                fontSize: 13,
              }}
            >
              Loading…
            </div>
          ) : Object.keys(summaryByRole).length === 0 ? (
            <div
              style={{
                padding: "32px 24px",
                textAlign: "center",
                color: "#98A2B3",
                fontSize: 13,
              }}
            >
              No settings saved yet for this scope. Configure triggers above and
              click <strong style={{ color: "#344054" }}>Save Settings</strong>.
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 90px 1fr",
                  padding: "8px 20px",
                  background: "#F9FAFB",
                  borderBottom: "1px solid #F2F4F7",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#667085",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                <span>Role</span>
                <span style={{ textAlign: "center" }}>Enabled</span>
                <span>Active Triggers</span>
              </div>

              {Object.entries(summaryByRole).map(([roleId, info], idx, arr) => {
                const enabledLabels = info.enabled.map(
                  (key) => TRIGGERS.find((t) => t.key === key)?.label ?? key,
                );
                const isCurrentRole =
                  !isAllRoles && selectedRoleIds.includes(roleId);
                return (
                  <div
                    key={roleId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "200px 90px 1fr",
                      padding: "12px 20px",
                      borderBottom:
                        idx < arr.length - 1 ? "1px solid #F9FAFB" : "none",
                      alignItems: "start",
                      background: isCurrentRole ? "#FAFAFE" : "transparent",
                    }}
                  >
                    {/* Role name */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: isCurrentRole ? "#7F56D9" : "#F4F3FF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 12,
                          fontWeight: 700,
                          color: isCurrentRole ? "#fff" : "#7F56D9",
                        }}
                      >
                        {info.roleName.charAt(0).toUpperCase()}
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#344054",
                        }}
                      >
                        {info.roleName}
                      </span>
                    </div>

                    {/* Count badge */}
                    <div style={{ textAlign: "center", paddingTop: 4 }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          background:
                            info.enabled.length > 0 ? "#ECFDF3" : "#FEF3C7",
                          color:
                            info.enabled.length > 0 ? "#027A48" : "#92400E",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {info.enabled.length} / {info.total}
                      </span>
                    </div>

                    {/* Trigger badges + actions */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      {enabledLabels.length === 0 ? (
                        <span style={{ fontSize: 12, color: "#98A2B3" }}>
                          None enabled
                        </span>
                      ) : (
                        enabledLabels.map((label) => (
                          <span
                            key={label}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "#F4F3FF",
                              color: "#5925DC",
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                          >
                            {label}
                          </span>
                        ))
                      )}

                      {/* Edit / Delete actions */}
                      {canManage && (
                        <div
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          {confirmDeleteRoleId === roleId ? (
                            // inline confirmation
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#B42318",
                                  fontWeight: 500,
                                }}
                              >
                                Delete all settings for this role?
                              </span>
                              <button
                                onClick={() => handleDelete(roleId)}
                                disabled={deleting}
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: "#B42318",
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: deleting ? "not-allowed" : "pointer",
                                }}
                              >
                                {deleting ? "Deleting…" : "Yes, Delete"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteRoleId(null)}
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 6,
                                  border: "1px solid #D0D5DD",
                                  background: "#fff",
                                  color: "#344054",
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEdit(roleId)}
                                title="Edit this role's settings"
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: 6,
                                  border: "1px solid #D0D5DD",
                                  background: isCurrentRole
                                    ? "#7F56D9"
                                    : "#fff",
                                  color: isCurrentRole ? "#fff" : "#344054",
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 5,
                                }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() => setConfirmDeleteRoleId(roleId)}
                                title="Delete all settings for this role"
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: 6,
                                  border: "1px solid #FECDCA",
                                  background: "#FFF9F9",
                                  color: "#B42318",
                                  fontSize: 12,
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 5,
                                }}
                              >
                                🗑 Delete
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NotificationSettingsPage;
