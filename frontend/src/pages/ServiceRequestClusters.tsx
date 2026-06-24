import React, { useEffect, useState } from "react";
import SrPage from "../components/sr/SrPage";
import { srButton } from "../utils/srTheme";
import { api } from "../utils/api";
import { serviceRequestApi } from "../services/serviceRequests";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}
interface ClusterRow {
  _id: string;
  name: string;
  code?: string;
  projects?: any[];
  isActive?: boolean;
}

const ServiceRequestClusters: React.FC<{ embedded?: boolean }> = ({
  embedded,
}) => {
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [draft, setDraft] = useState<{
    id?: string;
    name: string;
    code: string;
    projects: string[];
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await serviceRequestApi.clusters.list();
      setClusters(r.data || []);
    } catch (e) {
      console.error(e);
    }
  };

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
    load();
  }, []);

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    try {
      if (draft.id) {
        await serviceRequestApi.clusters.update(draft.id, {
          name: draft.name,
          code: draft.code,
          projects: draft.projects,
        });
      } else {
        await serviceRequestApi.clusters.create({
          name: draft.name,
          code: draft.code,
          projects: draft.projects,
        });
      }
      setDraft(null);
      setMsg("Saved.");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to save.");
    }
  };

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e7ebf3",
    borderRadius: 14,
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
    padding: 20,
    marginBottom: 16,
    maxWidth: 720,
  };
  const ctrl: React.CSSProperties = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    border: "1px solid #d7deea",
    borderRadius: 10,
    boxSizing: "border-box",
  };

  return (
    <SrPage
      title="Clusters"
      subtitle="Group schools/projects for Service Request roll-ups & reports."
      embedded={embedded}
      actions={
        <button
          onClick={() => setDraft({ name: "", code: "", projects: [] })}
          style={srButton("success")}
        >
          + New Cluster
        </button>
      }
    >
        {msg && (
          <div style={{ marginBottom: 12, fontSize: 13, color: "#047857" }}>
            {msg}
          </div>
        )}

        {draft && (
          <div style={card}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Name</label>
            <input
              style={{ ...ctrl, margin: "6px 0 12px" }}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <label style={{ fontSize: 13, fontWeight: 600 }}>Code</label>
            <input
              style={{ ...ctrl, margin: "6px 0 12px" }}
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Projects (Ctrl/Cmd-click to multi-select)
            </label>
            <select
              multiple
              style={{ ...ctrl, height: 160, padding: 8, margin: "6px 0 12px" }}
              value={draft.projects}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  projects: Array.from(e.target.selectedOptions).map(
                    (o) => o.value,
                  ),
                })
              }
            >
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} {p.code ? `(${p.code})` : ""}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={save} style={srButton("success")}>
                Save
              </button>
              <button
                onClick={() => setDraft(null)}
                style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #e7ebf3", background: "#fff", fontWeight: 600, fontSize: 14, color: "#374151", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={card}>
          {clusters.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>No clusters yet.</p>
          ) : (
            clusters.map((c) => (
              <div
                key={c._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <div>
                  <strong>{c.name}</strong>{" "}
                  <span style={{ color: "#6b7280", fontSize: 13 }}>
                    {c.code ? `(${c.code}) · ` : ""}
                    {(c.projects || []).length} project(s)
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() =>
                      setDraft({
                        id: c._id,
                        name: c.name,
                        code: c.code || "",
                        projects: (c.projects || []).map((p: any) =>
                          typeof p === "string" ? p : p._id,
                        ),
                      })
                    }
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e7ebf3", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      await serviceRequestApi.clusters.remove(c._id);
                      load();
                    }}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", fontSize: 13, fontWeight: 600, color: "#b91c1c", cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
    </SrPage>
  );
};

export default ServiceRequestClusters;
