import React from "react";
import { tokens, styles } from "../../theme/oneos";

/**
 * OneOS metric card — top accent bar, uppercase label, value in DM Serif.
 * Reusable across dashboards/reports.
 */
const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  color?: string;
  accent?: string;
  icon?: React.ReactNode;
}> = ({ label, value, color, accent, icon }) => (
  <div
    style={{
      ...styles.card,
      marginBottom: 0,
      position: "relative",
      overflow: "hidden",
      paddingTop: 22,
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: accent || tokens.primary,
      }}
    />
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <p
        style={{
          fontSize: 12,
          color: tokens.sub,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: 0,
        }}
      >
        {label}
      </p>
      {icon}
    </div>
    <p
      style={{
        fontFamily: tokens.displayFont,
        fontSize: 32,
        fontWeight: 700,
        color: color || tokens.text,
        lineHeight: 1,
        margin: "10px 0 0",
      }}
    >
      {value}
    </p>
  </div>
);

export default MetricCard;
