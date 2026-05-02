import React, { useState } from "react";
import { usePushNotifications } from "../hooks/usePushNotifications";

/**
 * Shows a slim banner asking the user to enable push notifications.
 * Dismissible — stored in sessionStorage so it only shows once per session.
 */
const NotificationPermissionBanner: React.FC = () => {
  const {
    permission,
    isSubscribed,
    isLoading,
    isSupported,
    requestPermission,
  } = usePushNotifications();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("push-banner-dismissed") === "true",
  );
  const [enabling, setEnabling] = useState(false);
  const [success, setSuccess] = useState(false);

  // Don't show if: not supported, already granted+subscribed, or dismissed
  if (!isSupported) return null;
  if (dismissed) return null;
  if (permission === "granted" && isSubscribed) return null;

  // Permission explicitly blocked in browser — show a hint to unblock
  if (permission === "denied") {
    return (
      <div
        style={{
          background: "#fef2f2",
          borderBottom: "1px solid #fecaca",
          padding: "8px 20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "13px",
          color: "#991b1b",
          flexWrap: "wrap",
        }}
      >
        <span>🔕</span>
        <span style={{ flex: 1 }}>
          Push notifications are <strong>blocked</strong> for this site. To
          enable, click the 🔒 icon in your browser's address bar → Site
          settings → Notifications → Allow.
        </span>
        <button
          onClick={() => {
            sessionStorage.setItem("push-banner-dismissed", "true");
            setDismissed(true);
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#9ca3af",
            fontSize: "18px",
            lineHeight: 1,
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    );
  }

  const dismiss = () => {
    sessionStorage.setItem("push-banner-dismissed", "true");
    setDismissed(true);
  };

  const handleEnable = async () => {
    setEnabling(true);
    const ok = await requestPermission();
    setEnabling(false);
    if (ok) {
      setSuccess(true);
      setTimeout(dismiss, 2000);
    }
  };

  if (success) {
    return (
      <div
        style={{
          background: "#d1fae5",
          borderBottom: "1px solid #6ee7b7",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "14px",
          color: "#065f46",
        }}
      >
        <span>
          ✅ Push notifications enabled! You'll be notified of new tickets and
          replies.
        </span>
        <button
          onClick={dismiss}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#eff6ff",
        borderBottom: "1px solid #bfdbfe",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        fontSize: "14px",
        color: "#1e40af",
        flexWrap: "wrap",
      }}
    >
      <span>🔔</span>
      <span style={{ flex: 1 }}>
        Enable browser push notifications to get alerts for new tickets and
        replies — even when this tab is in the background.
      </span>
      <button
        onClick={handleEnable}
        disabled={enabling || isLoading}
        style={{
          background: "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "6px",
          padding: "6px 14px",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 500,
          opacity: enabling ? 0.7 : 1,
        }}
      >
        {enabling ? "Enabling…" : "Enable notifications"}
      </button>
      <button
        onClick={dismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#6b7280",
          fontSize: "18px",
          lineHeight: 1,
        }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
};

export default NotificationPermissionBanner;
