import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SrPage from "../components/sr/SrPage";
import SrTabs from "../components/sr/SrTabs";
import { srStyles, SR } from "../utils/srTheme";
import { useProjectContext } from "../contexts/ProjectContext";
import { api } from "../utils/api";
import ServiceRequestSettings from "./ServiceRequestSettings";
import ServiceRequestRouting from "./ServiceRequestRouting";
import ServiceRequestFormSchemas from "./ServiceRequestFormSchemas";
import RoleMappingRules from "./RoleMappingRules";
import ServiceRequestClusters from "./ServiceRequestClusters";

/**
 * One settings home. Pick the project once at the top, then move between the
 * General / Routing / Forms / Role Mapping tabs without re-selecting. Clusters
 * spans projects, so that tab ignores the project picker.
 */
const TABS = [
  { key: "general", label: "General", icon: "⚙️" },
  { key: "routing", label: "Routing", icon: "🧭" },
  { key: "forms", label: "Forms", icon: "📝" },
  { key: "rolemap", label: "Role Mapping", icon: "👤" },
  { key: "clusters", label: "Clusters", icon: "🏫" },
];

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}

const ServiceRequestSettingsHub: React.FC = () => {
  const { currentProjectId } = useProjectContext();
  const [sp, setSp] = useSearchParams();
  const active = sp.get("tab") || "general";
  const setActive = (k: string) =>
    setSp(k === "general" ? {} : { tab: k }, { replace: true });

  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");

  useEffect(() => {
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
  }, []);

  const usesProject = active !== "clusters";

  return (
    <SrPage
      title="Service Request Settings"
      subtitle="Set up everything for service requests in one place — pick a project once, then move between sections."
      actions={
        usesProject ? (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={{ ...srStyles.ctrl, minWidth: 240 }}
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
                {p.code ? ` (${p.code})` : ""}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      <SrTabs tabs={TABS} active={active} onChange={setActive} />

      {usesProject && !projectId && (
        <div style={{ ...srStyles.card, color: SR.sub }}>
          👆 Pick a project above to configure its settings.
        </div>
      )}

      {active === "general" && projectId && (
        <ServiceRequestSettings embedded projectId={projectId} />
      )}
      {active === "routing" && projectId && (
        <ServiceRequestRouting embedded projectId={projectId} />
      )}
      {active === "forms" && projectId && (
        <ServiceRequestFormSchemas embedded projectId={projectId} />
      )}
      {active === "rolemap" && projectId && (
        <RoleMappingRules embedded projectId={projectId} />
      )}
      {active === "clusters" && <ServiceRequestClusters embedded />}
    </SrPage>
  );
};

export default ServiceRequestSettingsHub;
