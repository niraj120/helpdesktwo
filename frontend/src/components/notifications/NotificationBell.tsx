import React from "react";
import { UseNotificationsReturn } from "../../hooks/useNotifications";
import { NotificationDropdown } from "./NotificationDropdown";

// Bell icon SVG (Heroicons outline)
const BellIcon = ({ hasUnread }: { hasUnread: boolean }) => (
  <svg
    style={{ width: 22, height: 22 }}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    {hasUnread ? (
      // Bell alert variant when there are unread notifications
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.5A8.969 8.969 0 0 1 5.292 3m13.416 0a8.969 8.969 0 0 1 2.168 4.5"
      />
    ) : (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    )}
  </svg>
);

interface NotificationBellProps extends UseNotificationsReturn {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  unreadCount,
  notifications,
  loading,
  isOpen,
  setIsOpen,
  markOneRead,
  markAllRead,
  refetch,
}) => {
  const badgeLabel =
    unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={isOpen}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 38,
          borderRadius: "8px",
          border: "none",
          background: isOpen ? "#F4F3FF" : "transparent",
          cursor: "pointer",
          color: isOpen ? "#7F56D9" : "var(--text-secondary, #667085)",
          transition: "background 0.15s, color 0.15s",
          outline: "none",
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            (e.currentTarget as HTMLButtonElement).style.background = "#F4F3FF";
            (e.currentTarget as HTMLButtonElement).style.color = "#7F56D9";
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--text-secondary, #667085)";
          }
        }}
      >
        <BellIcon hasUnread={unreadCount > 0} />

        {/* Unread badge */}
        {badgeLabel && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 4px",
              borderRadius: "999px",
              background: "#DC2626",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "18px",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
              boxSizing: "border-box",
            }}
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown
          notifications={notifications}
          loading={loading}
          onClose={() => setIsOpen(false)}
          onMarkOneRead={markOneRead}
          onMarkAllRead={markAllRead}
          onRefetch={refetch}
        />
      )}
    </div>
  );
};
