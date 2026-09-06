import React, { useEffect, useMemo, useState } from "react";
import { useSocket } from "../../hooks/useSocket";
import { useProjectContext } from "../../contexts/ProjectContext";
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
    permissions: [PERMISSIONS.SR_VIEW_ALL, PERMISSIONS.SR_VIEW_OWN],
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
      PERMISSIONS.SR_LEADS_ACCESS,
      PERMISSIONS.SR_LEADS_MANAGE,
      PERMISSIONS.SR_CONFIG_MANAGE,
    ],
  },
];

/** Which tab a given kind of arrival belongs to. */
const AREA_TAB: Record<string, string> = {
  requests: "all",
  email: "email",
  ivr: "ivr",
  leads: "leads",
};

const ServiceRequestsHub: React.FC = () => {
  const { hasAnyPermission } = usePermissions();
  const location = useLocation();
  const [sp, setSp] = useSearchParams();
  const { currentProjectId } = useProjectContext();
  const isProjectPortal = location.pathname.includes("/portal/");
  const baseTabs = TABS.filter((tab) => hasAnyPermission(tab.permissions));
  const requestedTab = sp.get("tab") || "all";
  const active = baseTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : baseTabs[0]?.key || "all";
  const setActive = (key: string) =>
    setSp(key === "all" ? {} : { tab: key }, { replace: true });

  // An agent works one tab at a time and cannot see the other pipelines
  // moving. Count arrivals per tab while the hub is open, and clear a tab's
  // count once it is opened — the moment it is read, it is no longer new.
  const [newByTab, setNewByTab] = useState<Record<string, number>>({});

  useEffect(() => {
    setNewByTab((prev) => (prev[active] ? { ...prev, [active]: 0 } : prev));
  }, [active]);

  const socketRooms = useMemo(
    () =>
      currentProjectId
        ? [`project-tickets-${currentProjectId}`]
        : ["all-tickets"],
    [currentProjectId],
  );

  useSocket({
    rooms: socketRooms,
    events: {
      "sr-activity": (payload: { area?: string }) => {
        const tab = AREA_TAB[payload?.area || ""];
        // Nothing to flag for the tab already on screen.
        if (!tab || tab === active) return;
        setNewByTab((prev) => ({ ...prev, [tab]: (prev[tab] || 0) + 1 }));
      },
    },
  });

  const visibleTabs = baseTabs.map((tab) => ({
    ...tab,
    badge: newByTab[tab.key] || 0,
  }));

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
