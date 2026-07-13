import React from "react";
import DashboardLayout from "../DashboardLayout";
import { srStyles, SR } from "../../utils/srTheme";

/**
 * Standard page shell for the Service Request module — matches the View Queries
 * page chrome (Noto Sans, #f8fafc canvas, white header card with title/subtitle
 * + optional actions).
 *
 * When `embedded` is set the chrome (DashboardLayout, canvas, big header) is
 * dropped so the screen can be rendered inside a tabbed hub. Only the optional
 * action button(s) and the content are shown — keeping one nav item instead of
 * many. Used by ServiceRequestsHub / ServiceRequestSettingsHub.
 */
const SrPage: React.FC<{
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  embedded?: boolean;
  showHeaderWhenEmbedded?: boolean;
}> = ({ title, subtitle, actions, children, embedded, showHeaderWhenEmbedded }) => {
  if (embedded) {
    return (
      <div
        style={
          showHeaderWhenEmbedded
            ? { ...srStyles.page, fontFamily: SR.font }
            : { fontFamily: SR.font }
        }
      >
        {showHeaderWhenEmbedded ? (
          <div
            style={{
              ...srStyles.headerCard,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
            }}
          >
            <div>
              <h1 style={srStyles.title}>{title}</h1>
              {subtitle ? <p style={srStyles.subtitle}>{subtitle}</p> : null}
            </div>
            {actions ? <div>{actions}</div> : null}
          </div>
        ) : actions ? (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 12,
            }}
          >
            {actions}
          </div>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div style={srStyles.page}>
        <div
          style={{
            ...srStyles.headerCard,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <h1 style={srStyles.title}>{title}</h1>
            {subtitle ? <p style={srStyles.subtitle}>{subtitle}</p> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
        {children}
      </div>
    </DashboardLayout>
  );
};

export default SrPage;
