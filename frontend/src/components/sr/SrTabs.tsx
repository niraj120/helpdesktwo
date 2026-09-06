import React from "react";
import { SR } from "../../utils/srTheme";

export interface SrTab {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Unseen arrivals in this section since the agent last looked at it. */
  badge?: number;
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
          className={`sr-tab-button${on ? " sr-tab-button--active" : ""}`}
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
        >
          {t.icon}
          {t.label}
          {/* Only on inactive tabs: the one you are reading is by definition
              seen, and a count there would never clear. */}
          {!on && !!t.badge && (
            <span
              aria-label={`${t.badge} new`}
              style={{
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 999,
                background: "#ef4444",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {t.badge > 99 ? "99+" : t.badge}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

export default SrTabs;
