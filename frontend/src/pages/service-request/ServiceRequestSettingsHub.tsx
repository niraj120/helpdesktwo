import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SrPage from "../../components/sr/SrPage";
import SrTabs from "../../components/sr/SrTabs";
import { srStyles, SR } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { useProjectScope } from "../../hooks/useProjectScope";
import { api } from "../../utils/api";
import SRSettingsNew from "./SRSettingsNew";
import ServiceRequestRouting from "./ServiceRequestRouting";
import ServiceRequestFormSchemas from "./ServiceRequestFormSchemas";
import ServiceRequestClassifyChannels from "./ServiceRequestClassifyChannels";
import PsrDetailLayoutSettings from "./PsrDetailLayoutSettings";
import ServiceRequestNotifications from "./ServiceRequestNotifications";
import SrReassignSettings from "./SrReassignSettings";

const TABS = [
  { key: "general", label: "Configure" },
  { key: "channels", label: "Channels" },
  { key: "routing", label: "Routing" },
  { key: "reassign", label: "Access & Reassign" },
  { key: "forms", label: "Forms" },
  { key: "notifications", label: "Notifications" },
  { key: "layout", label: "Detail Layout" },
];

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}

const ServiceRequestSettingsHub: React.FC = () => {
  const { currentProjectId } = useProjectContext();
  const { isProjectPortal, lockedProjectId } = useProjectScope();
  const [sp, setSp] = useSearchParams();
  const active = sp.get("tab") || "general";
  const setActive = (k: string) =>
    setSp(k === "general" ? {} : { tab: k }, { replace: true });

  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [pickedProjectId, setPickedProjectId] = useState(currentProjectId || "");

  // Inside the portal the URL fixes the project; elsewhere the picker decides.
  const projectId = isProjectPortal ? lockedProjectId || "" : pickedProjectId;

  useEffect(() => {
    if (!pickedProjectId && currentProjectId)
      setPickedProjectId(currentProjectId);
  }, [currentProjectId, pickedProjectId]);

  useEffect(() => {
    // The portal has nothing to pick from, so it never asks for the list.
    if (isProjectPortal) return;
    (async () => {
      try {
        const res = await api.get("/projects", { params: { limit: 100 } });
        const d: any = res.data;
        const list = d?.data?.projects || d?.projects || d?.data || d || [];
        setProjects(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [isProjectPortal]);

  return (
    <SrPage
      title="Ticket Type Settings"
      subtitle="Enable PSR/ISR as configurable ticket types and reuse the normal ticket platform wherever possible."
      embedded={isProjectPortal}
      showHeaderWhenEmbedded={isProjectPortal}
      actions={
        isProjectPortal ? null : (
          <select
            value={pickedProjectId}
            onChange={(e) => setPickedProjectId(e.target.value)}
            style={{ ...srStyles.ctrl, minWidth: 240 }}
          >
            <option value="">Select a project...</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
                {p.code ? ` (${p.code})` : ""}
              </option>
            ))}
          </select>
        )
      }
    >
      <SrTabs tabs={TABS} active={active} onChange={setActive} />

      {!projectId && (
        <div style={{ ...srStyles.card, color: SR.sub }}>
          {isProjectPortal
            ? "Loading this project's settings..."
            : "Pick a project above to configure its settings."}
        </div>
      )}

      {active === "general" && (
        <SRSettingsNew projectId={projectId} />
      )}
      {active === "channels" && projectId && (
        <ServiceRequestClassifyChannels embedded projectId={projectId} />
      )}
      {active === "routing" && projectId && (
        <ServiceRequestRouting embedded projectId={projectId} />
      )}
      {active === "reassign" && projectId && (
        <SrReassignSettings embedded projectId={projectId} />
      )}
      {active === "forms" && projectId && (
        <ServiceRequestFormSchemas embedded projectId={projectId} />
      )}
      {active === "notifications" && projectId && (
        <ServiceRequestNotifications projectId={projectId} />
      )}
      {active === "layout" && projectId && (
        <PsrDetailLayoutSettings embedded projectId={projectId} />
      )}
    </SrPage>
  );
};

export default ServiceRequestSettingsHub;
