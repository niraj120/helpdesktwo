import React, { useState } from "react";
import { getImpersonation, stopImpersonation } from "../utils/impersonation";

/**
 * Persistent banner shown whenever an impersonation ("login as") session is
 * active. Provides transparency (DPDP) about whose account is being viewed and
 * a one-click Exit that restores the admin's own session.
 */
const ImpersonationBanner: React.FC = () => {
  const [exiting, setExiting] = useState(false);
  const meta = getImpersonation();

  if (!meta) return null;

  const handleExit = async () => {
    setExiting(true);
    try {
      await stopImpersonation();
    } catch {
      setExiting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        gap: "14px",
        background: "#7c2d12",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: "999px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
        fontSize: "13px",
        maxWidth: "92vw",
      }}
    >
      <span style={{ fontSize: "16px", lineHeight: 1 }}>🕵️</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        Viewing as <strong>{meta.targetName}</strong>
        <span style={{ opacity: 0.8 }}> ({meta.targetEmail})</span>
      </span>
      <button
        onClick={handleExit}
        disabled={exiting}
        style={{
          background: "#fff",
          color: "#7c2d12",
          border: "none",
          borderRadius: "999px",
          padding: "6px 14px",
          fontWeight: 700,
          fontSize: "12px",
          cursor: exiting ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
          opacity: exiting ? 0.7 : 1,
        }}
      >
        {exiting ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
};

export default ImpersonationBanner;
