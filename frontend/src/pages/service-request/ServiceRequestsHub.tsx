import React from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import SrPage from "../../components/sr/SrPage";
import SrTabs from "../../components/sr/SrTabs";
import { PERMISSIONS } from "../../constants/permissions";
import { usePermissions } from "../../hooks/usePermissions";
import ServiceRequests from "./ServiceRequests";
import ServiceRequestCreate from "./ServiceRequestCreate";
import EmailTriageInbox from "./EmailTriageInbox";
import IVRCalls from "./IVRCalls";
import Leads from "./Leads";

const TABS = [
  {
    key: "all",
    label: "All Requests",
    permissions: [
      PERMISSIONS.SR_VIEW_ALL,
      PERMISSIONS.SR_VIEW_OWN,
      PERMISSIONS.SR_VIEW_ASSIGNED,
      PERMISSIONS.SR_PSR_RECEIVE,
      PERMISSIONS.SR_ISR_RECEIVE,
    ],
  },
  {
    key: "new",
    label: "New Request",
    permissions: [PERMISSIONS.SR_PSR_CREATE, PERMISSIONS.SR_ISR_CREATE],
  },
  {
    key: "email",
    label: "Email",
    permissions: [
      PERMISSIONS.EMAIL_TRIAGE_ACCESS,
      PERMISSIONS.EMAIL_TRIAGE_CONVERT,
      PERMISSIONS.EMAIL_TRIAGE_RESPOND,
    ],
  },
  {
    key: "ivr",
    label: "IVR Calls",
    permissions: [PERMISSIONS.IVR_TRIAGE_ACCESS, PERMISSIONS.IVR_TRIAGE_CONVERT],
  },
  {
    key: "leads",
    label: "Leads",
    permissions: [
      PERMISSIONS.EMAIL_TRIAGE_CONVERT,
      PERMISSIONS.SR_PSR_CREATE,
      PERMISSIONS.SR_CONFIG_MANAGE,
    ],
  },
];

const ServiceRequestsHub: React.FC = () => {
  const { hasAnyPermission } = usePermissions();
  const location = useLocation();
  const [sp, setSp] = useSearchParams();
  const isProjectPortal = location.pathname.includes("/portal/");
  const visibleTabs = TABS.filter((tab) => hasAnyPermission(tab.permissions));
  const requestedTab = sp.get("tab") || "all";
  const active = visibleTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.key || "all";
  const setActive = (key: string) =>
    setSp(key === "all" ? {} : { tab: key }, { replace: true });

  return (
    <SrPage
      title="Service Requests"
      subtitle="View, create, work on, and convert PSR/ISR tickets from permitted channels."
      embedded={isProjectPortal}
      showHeaderWhenEmbedded={isProjectPortal}
    >
      <SrTabs tabs={visibleTabs} active={active} onChange={setActive} />
      {!visibleTabs.length && (
        <div style={{ padding: 16, color: "#64748b" }}>
          No service request actions are assigned to this role.
        </div>
      )}
      {active === "all" && <ServiceRequests embedded />}
      {active === "new" && (
        <ServiceRequestCreate embedded hideProjectSelector={isProjectPortal} />
      )}
      {active === "email" && (
        <EmailTriageInbox embedded hideProjectSelector={isProjectPortal} />
      )}
      {active === "ivr" && (
        <IVRCalls embedded hideProjectSelector={isProjectPortal} />
      )}
      {active === "leads" && (
        <Leads embedded hideProjectSelector={isProjectPortal} />
      )}
    </SrPage>
  );
};

export default ServiceRequestsHub;
