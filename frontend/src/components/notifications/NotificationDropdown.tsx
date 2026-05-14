import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { INotification } from "../../hooks/useNotifications";
import { getNotificationIcon } from "../../utils/notificationIcons";
import { relativeTime } from "../../utils/relativeTime";

interface NotificationDropdownProps {
  notifications: INotification[];
  loading: boolean;
  onClose: () => void;
  onMarkOneRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onRefetch: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  notifications,
  loading,
  onClose,
  onMarkOneRead,
  onMarkAllRead,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  /** Rewrite raw deepLinkUrl to the correct frontend route for the current context.
   *
   * Portal context  → /:customUrlPath/portal/...  (ProjectPortalDashboard)
   * Student context → /:customUrlPath/student/... (StudentLayout)
   * Admin context   → /tickets/:id, /kb/:id      (DashboardLayout)
   */
  const resolveDeepLink = (raw: string): string => {
    // Strip absolute origin if present
    const relative = raw.startsWith("http")
      ? raw.replace(window.location.origin, "")
      : raw;

    const path = window.location.pathname;

    // Pre-extract IDs from deeplink formats stored by the backend
    const ticketIdMatch = relative.match(
      /\/projects\/[^/]+\/tickets\/([a-f0-9]+)/i,
    );
    const kbIdMatch = relative.match(/^\/kb\/([a-f0-9]+)/i);
    const ticketId = ticketIdMatch?.[1];
    const kbId = kbIdMatch?.[1];

    // ── Portal context: /:customUrlPath/portal/... ───────────────────────────
    const portalMatch = path.match(/^\/([a-z0-9_-]+)\/portal(?:\/|$)/i);
    if (portalMatch) {
      const p = portalMatch[1];
      if (kbId) return `/${p}/portal/kb-new/viewer?articleId=${kbId}`;
      if (ticketId) return `/${p}/portal/ticket/${ticketId}`;
      return relative;
    }

    // ── Student context: /:customUrlPath/student/... ─────────────────────────
    const studentMatch = path.match(/^\/([a-z0-9_-]+)\/student(?:\/|$)/i);
    if (studentMatch) {
      const p = studentMatch[1];
      if (kbId) return `/${p}/kb-new/viewer?articleId=${kbId}`;
      if (ticketId) return `/${p}/student/ticket/${ticketId}`;
      return relative;
    }

    // ── Legacy student context: /:customUrlPath/(kb|kb-new|submit-ticket|...) ─
    const legacyStudentMatch = path.match(
      /^\/([a-z0-9_-]+)\/(kb|kb-new|submit-ticket|faq|find-center)/i,
    );
    if (legacyStudentMatch) {
      const p = legacyStudentMatch[1];
      if (kbId) return `/${p}/kb-new/viewer?articleId=${kbId}`;
      if (ticketId) return `/${p}/student/ticket/${ticketId}`;
      return relative;
    }

    // ── Admin/Superadmin context ─────────────────────────────────────────────
    if (ticketId) return `/tickets/${ticketId}`;
    // KB article: /kb/:articleId is the admin KB viewer route — use as-is
    return relative;
  };

  const handleRowClick = async (notif: INotification) => {
    if (!notif.isRead) {
      await onMarkOneRead(notif._id);
    }
    onClose();
    if (notif.deepLinkUrl) {
      navigate(resolveDeepLink(notif.deepLinkUrl));
    }
  };

  const unreadNotifs = notifications.filter((n) => !n.isRead);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 380,
        maxHeight: 520,
        background: "#fff",
        border: "1px solid #E4E7EC",
        boxShadow: "0 4px 16px rgba(0,0,0,.10)",
        borderRadius: 10,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 12px",
          borderBottom: "1px solid #F2F4F7",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#101828" }}>
            Notifications
          </span>
          {unreadNotifs.length > 0 && (
            <span
              style={{
                background: "#EFF8FF",
                color: "#175CD3",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 999,
                padding: "1px 8px",
              }}
            >
              {unreadNotifs.length} new
            </span>
          )}
        </div>
        {unreadNotifs.length > 0 && (
          <button
            onClick={onMarkAllRead}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: "#6941C6",
              fontWeight: 500,
              padding: "4px 0",
            }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loading && notifications.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "#98A2B3",
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
            <p style={{ color: "#667085", fontSize: 13, margin: 0 }}>
              You're all caught up!
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const iconCfg = getNotificationIcon(notif.triggerType);
            return (
              <button
                key={notif._id}
                onClick={() => handleRowClick(notif)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  borderBottom: "1px solid #F9FAFB",
                  background: notif.isRead ? "#fff" : "#FAFAFE",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "#F4F3FF";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    notif.isRead ? "#fff" : "#FAFAFE";
                }}
              >
                {/* Icon bubble */}
                <span
                  aria-hidden="true"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: iconCfg.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {iconCfg.icon}
                </span>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: "0 0 2px",
                      fontSize: 13,
                      fontWeight: notif.isRead ? 400 : 600,
                      color: "#101828",
                      lineHeight: "1.4",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p
                      style={{
                        margin: "0 0 4px",
                        fontSize: 12,
                        color: "#667085",
                        lineHeight: "1.4",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {notif.body}
                    </p>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: "#98A2B3",
                    }}
                  >
                    {relativeTime(notif.createdAt)}
                  </span>
                </div>

                {/* Unread dot */}
                {!notif.isRead && (
                  <span
                    aria-label="Unread"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#6941C6",
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid #F2F4F7",
          padding: "10px 16px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <button
          onClick={() => {
            onClose();
            navigate("/notifications");
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "#6941C6",
            fontWeight: 500,
            padding: "4px 8px",
          }}
        >
          View all notifications →
        </button>
      </div>
    </div>
  );
};
