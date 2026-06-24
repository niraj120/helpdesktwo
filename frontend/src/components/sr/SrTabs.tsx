import React from "react";
import { SR } from "../../utils/srTheme";

export interface SrTab {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

/**
 * Friendly tab bar for the Service Request hubs. Big, clearly-labelled pills so
 * a non-technical user can see at a glance where they are and switch sections.
 */
const SrTabs: React.FC<{
  tabs: SrTab[];
  active: string;
  onChange: (key: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div
    style={{
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 16,
      background: "#fff",
      padding: 6,
      borderRadius: 12,
      border: `1px solid ${SR.border}`,
      boxShadow: SR.cardShadow,
    }}
  >
    {tabs.map((t) => {
      const on = t.key === active;
      return (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 9,
            border: "none",
            background: on ? SR.primary : "transparent",
            color: on ? "#fff" : "#374151",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: SR.font,
            transition: "all 0.12s ease",
          }}
          onMouseEnter={(e) => {
            if (!on) e.currentTarget.style.background = "#f3f4f6";
          }}
          onMouseLeave={(e) => {
            if (!on) e.currentTarget.style.background = "transparent";
          }}
        >
          {t.icon}
          {t.label}
        </button>
      );
    })}
  </div>
);

export default SrTabs;
