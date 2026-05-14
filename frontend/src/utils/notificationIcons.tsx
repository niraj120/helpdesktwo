import React from "react";

// Heroicons used as inline SVG to avoid import issues
// All icons from @heroicons/react/24/outline shape

const iconStyle = (color: string): React.CSSProperties => ({
  width: 18,
  height: 18,
  color,
  flexShrink: 0,
});

const BellAlertIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.5A8.969 8.969 0 0 1 5.292 3m13.416 0a8.969 8.969 0 0 1 2.168 4.5"
    />
  </svg>
);

const UserCircleIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
    />
  </svg>
);

const ChatBubbleIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
    />
  </svg>
);

const ArrowPathIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
);

const CheckCircleIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  </svg>
);

const ArrowUpCircleIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m15 11.25-3-3m0 0-3 3m3-3v7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  </svg>
);

const TicketIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z"
    />
  </svg>
);

const BookOpenIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
    />
  </svg>
);

const PencilSquareIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
    />
  </svg>
);

const ArchiveBoxIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
    />
  </svg>
);

const ClockIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  </svg>
);

const ExclamationTriangleIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
    />
  </svg>
);

const MentionIcon = ({ color }: { color: string }) => (
  <svg
    style={iconStyle(color)}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 1 0-2.636 6.364M16.5 12V8.25"
    />
  </svg>
);

export interface NotificationIconConfig {
  icon: React.ReactElement;
  color: string;
  bg: string;
}

const ICON_MAP: Record<string, NotificationIconConfig> = {
  ticket_assigned_to_me: {
    icon: React.createElement(UserCircleIcon, { color: "#175CD3" }),
    color: "#175CD3",
    bg: "#EFF8FF",
  },
  ticket_reply_added: {
    icon: React.createElement(ChatBubbleIcon, { color: "#0E9384" }),
    color: "#0E9384",
    bg: "#F0FDF9",
  },
  ticket_status_changed: {
    icon: React.createElement(ArrowPathIcon, { color: "#667085" }),
    color: "#667085",
    bg: "#F9FAFB",
  },
  ticket_mentioned: {
    icon: React.createElement(MentionIcon, { color: "#7F56D9" }),
    color: "#7F56D9",
    bg: "#F4F3FF",
  },
  ticket_closed: {
    icon: React.createElement(CheckCircleIcon, { color: "#027A48" }),
    color: "#027A48",
    bg: "#ECFDF3",
  },
  ticket_escalated: {
    icon: React.createElement(ArrowUpCircleIcon, { color: "#B54708" }),
    color: "#B54708",
    bg: "#FFF6ED",
  },
  ticket_created: {
    icon: React.createElement(TicketIcon, { color: "#175CD3" }),
    color: "#175CD3",
    bg: "#EFF8FF",
  },
  kb_article_published: {
    icon: React.createElement(BookOpenIcon, { color: "#B54708" }),
    color: "#B54708",
    bg: "#FFF6ED",
  },
  kb_article_updated: {
    icon: React.createElement(PencilSquareIcon, { color: "#B54708" }),
    color: "#B54708",
    bg: "#FFF6ED",
  },
  kb_article_archived: {
    icon: React.createElement(ArchiveBoxIcon, { color: "#667085" }),
    color: "#667085",
    bg: "#F9FAFB",
  },
  sla_breach_warning: {
    icon: React.createElement(ClockIcon, { color: "#B54708" }),
    color: "#B54708",
    bg: "#FFF6ED",
  },
  sla_breached: {
    icon: React.createElement(ExclamationTriangleIcon, { color: "#DC2626" }),
    color: "#DC2626",
    bg: "#FEF2F2",
  },
};

const DEFAULT_ICON: NotificationIconConfig = {
  icon: React.createElement(BellAlertIcon, { color: "#667085" }),
  color: "#667085",
  bg: "#F9FAFB",
};

export function getNotificationIcon(
  triggerType: string,
): NotificationIconConfig {
  return ICON_MAP[triggerType] ?? DEFAULT_ICON;
}
