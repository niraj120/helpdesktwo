import React from "react";
import { styles } from "../../theme/oneos";

/**
 * OneOS page header — white card, DM Serif title, optional right-aligned
 * actions. Use on pages that render inside DashboardLayout during the OneOS
 * migration (replaces the legacy gradient ModuleHeader page by page).
 */
const PageHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div
    style={{
      ...styles.headerCard,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 16,
    }}
  >
    <div>
      <h1 style={styles.title}>{title}</h1>
      {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}
    </div>
    {actions ? <div>{actions}</div> : null}
  </div>
);

export default PageHeader;
