import React, { useState, useEffect, useRef } from "react";
import DashboardLayout from "../components/DashboardLayout";
import apiClient from "../utils/api";
import { getNotificationIcon } from "../utils/notificationIcons";

// ── Trigger definitions ───────────────────────────────────────────────────────

interface TriggerDef {
  key: string;
  label: string;
  description: string;
  section: "Ticket Events" | "KB Events" | "System Events";
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
    label: "Ticket Assigned to Me",
    description: "When a ticket is assigned to you",
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
    label: "Ticket Status Changed",
    description: "When a ticket's status is updated",
    section: "Ticket Events",
  },
  {
    key: "ticket_mentioned",
    label: "Mentioned in Ticket",
    description: "When you are @mentioned in a ticket",
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
    label: "KB Article Published",
    description: "When a new KB article goes live",
    section: "KB Events",
  },
  {
    key: "kb_article_updated",
    label: "KB Article Updated",
    description: "When an existing KB article is edited",
    section: "KB Events",
  },
  {
    key: "kb_article_archived",
    label: "KB Article Archived",
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
];

const SECTIONS = ["Ticket Events", "KB Events", "System Events"] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserPref {
  triggerType: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

// admin row shape (from /admin/notification-settings)
interface AdminSetting {
  triggerType: string;
  isEnabled: boolean;
}

// Per-trigger UI state
interface TriggerState {
  inApp: boolean;
  adminDisabled: boolean; // admin has disabled this trigger for user's role
}

type FlashMap = Record<string, "ok" | "err" | null>;

// ── Toggle switch ─────────────────────────────────────────────────────────────

const Toggle: React.FC<{
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}> = ({ checked, disabled = false, onChange }) => (
  <button
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    style={{
      width: 40,
      height: 22,
      borderRadius: 22,
      border: "none",
      background: disabled ? "#E4E7EC" : checked ? "#7F56D9" : "#D0D5DD",
      cursor: disabled ? "not-allowed" : "pointer",
      position: "relative",
      transition: "background 0.2s",
      flexShrink: 0,
      padding: 0,
      opacity: disabled ? 0.65 : 1,
    }}
  >
    <span
      style={{
        position: "absolute",
        top: 3,
        left: checked ? 21 : 3,
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        transition: "left 0.2s",
        display: "block",
      }}
    />
  </button>
);

// ── Page ──────────────────────────────────────────────────────────────────────

const ProfileNotificationsPage: React.FC = () => {
  const [prefs, setPrefs] = useState<Record<string, TriggerState>>({});
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<FlashMap>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Load on mount ─────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        // Fetch user prefs + admin settings in parallel; admin may 403 for regular users
        const [userRes, adminRes] = await Promise.allSettled([
          apiClient.get("/me/notification-preferences"),
          apiClient.get("/admin/notification-settings"),
        ]);

        const userRows: UserPref[] =
          userRes.status === "fulfilled"
            ? (userRes.value.data?.data ?? [])
            : [];

        const adminRows: AdminSetting[] =
          adminRes.status === "fulfilled"
            ? (adminRes.value.data?.data ?? [])
            : [];

        // Build a set of admin-disabled trigger types
        const adminDisabledSet = new Set<string>(
          adminRows.filter((r) => !r.isEnabled).map((r) => r.triggerType),
        );

        // Build prefs map — defaults: inApp=true
        const userPrefMap: Record<string, boolean> = {};
        userRows.forEach((row) => {
          userPrefMap[row.triggerType] = row.inAppEnabled !== false; // default true if undefined
        });

        const built: Record<string, TriggerState> = {};
        TRIGGERS.forEach((t) => {
          built[t.key] = {
            inApp: userPrefMap[t.key] ?? true,
            adminDisabled: adminDisabledSet.has(t.key),
          };
        });

        setPrefs(built);
      } catch {
        // If everything fails, show defaults
        const defaults: Record<string, TriggerState> = {};
        TRIGGERS.forEach((t) => {
          defaults[t.key] = { inApp: true, adminDisabled: false };
        });
        setPrefs(defaults);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Toggle handler with optimistic update + debounce ─────────────────────

  const handleToggle = (triggerType: string, value: boolean) => {
    // Optimistic update
    setPrefs((prev) => ({
      ...prev,
      [triggerType]: { ...prev[triggerType], inApp: value },
    }));

    // Debounce save
    if (saveTimers.current[triggerType])
      clearTimeout(saveTimers.current[triggerType]);
    saveTimers.current[triggerType] = setTimeout(async () => {
      try {
        await apiClient.put(`/me/notification-preferences/${triggerType}`, {
          inAppEnabled: value,
        });
        setFlash((f) => ({ ...f, [triggerType]: "ok" }));
      } catch {
        // Revert on failure
        setPrefs((prev) => ({
          ...prev,
          [triggerType]: { ...prev[triggerType], inApp: !value },
        }));
        setFlash((f) => ({ ...f, [triggerType]: "err" }));
      } finally {
        setTimeout(
          () => setFlash((f) => ({ ...f, [triggerType]: null })),
          1500,
        );
      }
    }, 400);
  };

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
        {/* Header */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #E4E7EC",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: "#101828",
            }}
          >
            Notification Preferences
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#667085" }}>
            Control which types of notifications you receive in the app
          </p>
        </div>

        {/* Preferences card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #E4E7EC",
            boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            overflow: "hidden",
          }}
        >
          {/* Column header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px",
              padding: "10px 24px",
              borderBottom: "2px solid #F2F4F7",
              background: "#FAFAFA",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#667085",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Event
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#667085",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                textAlign: "center",
              }}
            >
              In-App
            </span>
          </div>

          {loading ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "#98A2B3",
                fontSize: 14,
              }}
            >
              Loading preferences…
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
                      padding: "8px 24px",
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
                    const state = prefs[trigger.key] ?? {
                      inApp: true,
                      adminDisabled: false,
                    };
                    const flashState = flash[trigger.key];
                    const iconCfg = getNotificationIcon(trigger.key);
                    const isLast = idx === sectionTriggers.length - 1;

                    return (
                      <div
                        key={trigger.key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 80px",
                          alignItems: "center",
                          padding: "14px 24px",
                          borderBottom: isLast ? "none" : "1px solid #F9FAFB",
                          opacity: state.adminDisabled ? 0.5 : 1,
                          transition: "background 0.15s",
                          background: "transparent",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background =
                            "#FAFAFA";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLDivElement).style.background =
                            "transparent";
                        }}
                      >
                        {/* Left: icon + text */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            minWidth: 0,
                          }}
                        >
                          {/* Icon bubble */}
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              background: iconCfg.bg,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {iconCfg.icon}
                          </div>

                          {/* Text */}
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: "#344054",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              {trigger.label}
                              {state.adminDisabled && (
                                <span
                                  title="Managed by your administrator"
                                  style={{
                                    padding: "1px 7px",
                                    borderRadius: 999,
                                    background: "#F2F4F7",
                                    color: "#667085",
                                    fontSize: 10,
                                    fontWeight: 500,
                                    cursor: "default",
                                  }}
                                >
                                  Admin managed
                                </span>
                              )}
                              {flashState === "ok" && (
                                <span
                                  style={{
                                    color: "#027A48",
                                    fontSize: 11,
                                    fontWeight: 600,
                                  }}
                                >
                                  ✓ Saved
                                </span>
                              )}
                              {flashState === "err" && (
                                <span
                                  style={{
                                    color: "#B42318",
                                    fontSize: 11,
                                    fontWeight: 600,
                                  }}
                                >
                                  ✗ Error
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "#98A2B3",
                                marginTop: 1,
                              }}
                            >
                              {trigger.description}
                            </div>
                          </div>
                        </div>

                        {/* In-App toggle */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Toggle
                            checked={state.inApp}
                            disabled={state.adminDisabled}
                            onChange={(v) => handleToggle(trigger.key, v)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer note */}
        <p
          style={{
            marginTop: 14,
            fontSize: 12,
            color: "#98A2B3",
            textAlign: "center",
          }}
        >
          Changes to in-app notifications save automatically.
        </p>
      </div>
    </DashboardLayout>
  );
};

export default ProfileNotificationsPage;
