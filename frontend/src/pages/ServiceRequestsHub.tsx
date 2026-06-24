import React from "react";
import { useSearchParams } from "react-router-dom";
import SrPage from "../components/sr/SrPage";
import SrTabs from "../components/sr/SrTabs";
import ServiceRequests from "./ServiceRequests";
import ServiceRequestCreate from "./ServiceRequestCreate";
import EmailTriageInbox from "./EmailTriageInbox";
import IVRCalls from "./IVRCalls";
import Leads from "./Leads";

/**
 * One friendly home for everything to do with service requests. Tabs across the
 * top switch between viewing all requests and the channel-specific intake
 * screens, so a non-technical user only has one menu item to find.
 */
const TABS = [
  { key: "all", label: "All Requests", icon: "📋" },
  { key: "new", label: "New Request", icon: "✏️" },
  { key: "email", label: "Email", icon: "✉️" },
  { key: "ivr", label: "IVR Calls", icon: "📞" },
  { key: "leads", label: "Leads", icon: "🎓" },
];

const ServiceRequestsHub: React.FC = () => {
  const [sp, setSp] = useSearchParams();
  const active = sp.get("tab") || "all";
  const setActive = (k: string) =>
    setSp(k === "all" ? {} : { tab: k }, { replace: true });

  return (
    <SrPage
      title="PSR — Parent Service Requests"
      subtitle="View, create and handle parent service requests (PSR) from every channel — all in one place."
    >
      <SrTabs tabs={TABS} active={active} onChange={setActive} />
      {active === "all" && <ServiceRequests embedded />}
      {active === "new" && <ServiceRequestCreate embedded />}
      {active === "email" && <EmailTriageInbox embedded />}
      {active === "ivr" && <IVRCalls embedded />}
      {active === "leads" && <Leads embedded />}
    </SrPage>
  );
};

export default ServiceRequestsHub;
