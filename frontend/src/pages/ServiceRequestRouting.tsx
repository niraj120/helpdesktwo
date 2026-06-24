import React, { useEffect, useMemo, useRef, useState } from "react";
import SrPage from "../components/sr/SrPage";
import { srButton } from "../utils/srTheme";
import { useProjectContext } from "../contexts/ProjectContext";
import { api } from "../utils/api";
import { serviceRequestApi } from "../services/serviceRequests";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}
interface CategoryNode {
  _id: string;
  name: string;
  parentId?: string | null;
  path?: string;
  department?: string | null;
  sr?: { proactiveHelpText?: string };
}
interface Dept {
  _id: string;
  name: string;
}

const UNITS = ["minutes", "hours", "days"];

const ServiceRequestRouting: React.FC<{
  embedded?: boolean;
  projectId?: string;
}> = ({ embedded, projectId: projectIdProp }) => {
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectIdState, setProjectId] = useState(currentProjectId || "");
  const projectId =
    projectIdProp !== undefined ? projectIdProp : projectIdState;
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [catId, setCatId] = useState("");

  const [department, setDepartment] = useState("");
  const [helpText, setHelpText] = useState("");
  const [respVal, setRespVal] = useState(4);
  const [respUnit, setRespUnit] = useState("hours");
  const [resVal, setResVal] = useState(48);
  const [resUnit, setResUnit] = useState("hours");
  const [mode, setMode] = useState("by-role");
  const [ccUsers, setCcUsers] = useState<any[]>([]);
  const [agentPool, setAgentPool] = useState<string[]>([]);
  const [rolePool, setRolePool] = useState<string[]>([]);

  const [ccQuery, setCcQuery] = useState("");
  const [ccResults, setCcResults] = useState<any[]>([]);
  const debounce = useRef<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (!projectId) return;
    setCatId("");
    (async () => {
      try {
        const [cr, dr] = await Promise.all([
          serviceRequestApi.categoriesForProject(projectId),
          serviceRequestApi.departments(projectId),
        ]);
        const cl = cr?.data || cr || [];
        setCategories(Array.isArray(cl) ? cl : []);
        const dl = dr?.data || dr || [];
        setDepartments(Array.isArray(dl) ? dl : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [projectId]);

  const leaves = useMemo(() => {
    const parents = new Set(
      categories.map((c) => (c.parentId ? String(c.parentId) : "")).filter(Boolean),
    );
    return categories
      .filter((c) => !parents.has(String(c._id)))
      .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));
  }, [categories]);

  // Load existing config when a sub-category is selected.
  useEffect(() => {
    if (!catId) return;
    const cat = categories.find((c) => String(c._id) === catId);
    setDepartment(cat?.department ? String(cat.department) : "");
    setHelpText(cat?.sr?.proactiveHelpText || "");
    (async () => {
      try {
        const sla = await serviceRequestApi.getCategorySla(catId);
        const s = sla?.data;
        if (s) {
          setRespVal(s.responseTime?.value ?? 4);
          setRespUnit(s.responseTime?.unit ?? "hours");
          setResVal(s.resolutionTime?.value ?? 48);
          setResUnit(s.resolutionTime?.unit ?? "hours");
        }
      } catch (e) {
        /* none */
      }
      try {
        const ac = await serviceRequestApi.getAssignmentConfig(catId);
        const c = ac?.data;
        if (c) {
          setMode(c.mode || "by-role");
          setAgentPool((c.agentPool || []).map((u: any) => (typeof u === "string" ? u : u._id)));
          setRolePool((c.rolePool || []).map((r: any) => (typeof r === "string" ? r : r._id)));
          setCcUsers(
            (c.ccUsers || []).map((u: any) =>
              typeof u === "string" ? { _id: u } : u,
            ),
          );
        } else {
          setMode("by-role");
          setAgentPool([]);
          setRolePool([]);
          setCcUsers([]);
        }
      } catch (e) {
        /* none */
      }
    })();
  }, [catId, categories]);

  const onCcQuery = (q: string) => {
    setCcQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setCcResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const r = await serviceRequestApi.studentLookup(q.trim(), projectId);
        setCcResults(r.data || []);
      } catch (e) {
        console.error(e);
      }
    }, 350);
  };

  const ccName = (u: any) =>
    u.fullName ||
    `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
    u.email ||
    u._id;

  const saveAll = async () => {
    if (!catId) return;
    setBusy(true);
    setMsg(null);
    try {
      await serviceRequestApi.updateCategory(catId, {
        department: department || null,
        sr: { proactiveHelpText: helpText },
      });
      await serviceRequestApi.setCategorySla(catId, {
        responseTime: { value: Number(respVal), unit: respUnit },
        resolutionTime: { value: Number(resVal), unit: resUnit },
      });
      await serviceRequestApi.setAssignmentConfig(catId, {
        mode,
        agentPool,
        rolePool,
        ccUsers: ccUsers.map((u) => u._id),
        ccRoles: [],
      });
      setMsg("Routing saved for this sub-category.");
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to save.");
    } finally {
      setBusy(false);
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
    minHeight: 40,
    padding: "8px 12px",
    border: "1px solid #d7deea",
    borderRadius: 10,
    boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    display: "block",
    margin: "10px 0 6px",
  };

  return (
    <SrPage
      title="SR Routing"
      subtitle="Per sub-category: department, help-text, TAT and assignment (+CC)."
      embedded={embedded}
    >

        <div style={card}>
          {!embedded && (
            <>
              <label style={lbl}>Project</label>
              <select
                style={ctrl}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.code ? `(${p.code})` : ""}
                  </option>
                ))}
              </select>
            </>
          )}
          {projectId && (
            <>
              <label style={lbl}>Sub-category</label>
              <select
                style={ctrl}
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
              >
                <option value="">Select a sub-category…</option>
                {leaves.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.path || c.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {catId && (
          <div style={card}>
            <label style={lbl}>Department</label>
            <select
              style={ctrl}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">— none —</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>

            <label style={lbl}>Proactive help text (shown before submit)</label>
            <textarea
              style={{ ...ctrl, minHeight: 70 }}
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
            />

            <label style={lbl}>TAT</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>
                Response
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    style={{ ...ctrl, width: 90 }}
                    value={respVal}
                    onChange={(e) => setRespVal(Number(e.target.value))}
                  />
                  <select
                    style={{ ...ctrl, width: 110 }}
                    value={respUnit}
                    onChange={(e) => setRespUnit(e.target.value)}
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </span>
              <span style={{ fontSize: 13 }}>
                Resolution
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    style={{ ...ctrl, width: 90 }}
                    value={resVal}
                    onChange={(e) => setResVal(Number(e.target.value))}
                  />
                  <select
                    style={{ ...ctrl, width: 110 }}
                    value={resUnit}
                    onChange={(e) => setResUnit(e.target.value)}
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </span>
            </div>

            <label style={lbl}>Assignment mode</label>
            <select
              style={ctrl}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="round-robin">Round-robin</option>
              <option value="by-role">By role</option>
              <option value="by-user">By user</option>
              <option value="manual">Manual</option>
            </select>

            <label style={lbl}>CC watchers (e.g. PSL)</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {ccUsers.map((u) => (
                <span
                  key={u._id}
                  style={{
                    background: "#eef2ff",
                    borderRadius: 9999,
                    padding: "4px 10px",
                    fontSize: 12,
                  }}
                >
                  {ccName(u)}{" "}
                  <button
                    onClick={() =>
                      setCcUsers(ccUsers.filter((x) => x._id !== u._id))
                    }
                    style={{ border: "none", background: "none", cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <input
              style={ctrl}
              placeholder="Search to add a CC watcher…"
              value={ccQuery}
              onChange={(e) => onCcQuery(e.target.value)}
            />
            {ccResults.length > 0 && (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 160,
                  overflowY: "auto",
                }}
              >
                {ccResults.map((u) => (
                  <div
                    key={u._id}
                    onClick={() => {
                      if (!ccUsers.some((x) => x._id === u._id))
                        setCcUsers([...ccUsers, u]);
                      setCcQuery("");
                      setCcResults([]);
                    }}
                    style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13 }}
                  >
                    {ccName(u)}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 18, alignItems: "center" }}>
              <button
                onClick={saveAll}
                disabled={busy}
                style={{ ...srButton("success"), cursor: busy ? "default" : "pointer" }}
              >
                {busy ? "Saving…" : "Save routing"}
              </button>
              {msg && <span style={{ fontSize: 13, color: "#047857" }}>{msg}</span>}
            </div>
          </div>
        )}
    </SrPage>
  );
};

export default ServiceRequestRouting;
