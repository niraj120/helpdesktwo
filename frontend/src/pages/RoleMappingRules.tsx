import React, { useEffect, useState } from "react";
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
interface RoleOpt {
  _id: string;
  name: string;
  code?: string;
}
interface Rule {
  _id: string;
  name?: string;
  matchType: string;
  operator: string;
  matchValue: string;
  roleId: any;
  priority: number;
  isActive: boolean;
}

const MATCH_TYPES = [
  { v: "hrms_code", l: "HRMS / Employee code" },
  { v: "department", l: "Department" },
  { v: "designation", l: "Designation" },
];
const OPERATORS = [
  { v: "equals", l: "equals" },
  { v: "startsWith", l: "starts with" },
  { v: "contains", l: "contains" },
];

const emptyDraft = (projectId: string) => ({
  projectId,
  name: "",
  matchType: "hrms_code",
  operator: "equals",
  matchValue: "",
  roleId: "",
  priority: 100,
  isActive: true,
});

const RoleMappingRules: React.FC<{
  embedded?: boolean;
  projectId?: string;
}> = ({ embedded, projectId: projectIdProp }) => {
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const { currentProjectId } = useProjectContext();
  const [projectIdState, setProjectId] = useState(currentProjectId || "");
  const projectId =
    projectIdProp !== undefined ? projectIdProp : projectIdState;
  const [rules, setRules] = useState<Rule[]>([]);
  const [draft, setDraft] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [pr, rr] = await Promise.all([
          api.get("/projects", { params: { limit: 100 } }),
          api.get("/roles"),
        ]);
        const pd: any = pr.data;
        setProjects(pd?.data?.projects || pd?.projects || pd?.data || pd || []);
        const rd: any = rr.data;
        setRoles(rd?.data || rd?.roles || rd || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const load = async (pid: string) => {
    try {
      const r = await serviceRequestApi.roleMapping.list(pid);
      setRules(r.data || []);
    } catch (e) {
      console.error(e);
      setRules([]);
    }
  };
  useEffect(() => {
    if (projectId) {
      load(projectId);
      setDraft(null);
    }
  }, [projectId]);

  const save = async () => {
    if (!draft?.matchValue?.trim() || !draft?.roleId) {
      setMsg("Match value and role are required.");
      return;
    }
    try {
      if (draft._id) await serviceRequestApi.roleMapping.update(draft._id, draft);
      else await serviceRequestApi.roleMapping.create(draft);
      setDraft(null);
      setMsg("Saved.");
      load(projectId);
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to save.");
    }
  };

  const roleName = (roleId: any) => {
    if (roleId && typeof roleId === "object") return roleId.name;
    const r = roles.find((x) => x._id === roleId);
    return r?.name || "—";
  };

  const ctrl: React.CSSProperties = {
    minHeight: 38,
    padding: "8px 12px",
    border: "1px solid #d7deea",
    borderRadius: 10,
    fontSize: 14,
    boxSizing: "border-box",
  };
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e7ebf3",
    borderRadius: 14,
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
    padding: 16,
    marginBottom: 16,
  };
  const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #e5e7eb" };
  const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid #f3f4f6" };

  return (
    <SrPage
      title="Role Mapping Rules"
      subtitle="Auto-assign roles on onboarding by HRMS code / department / designation (evaluated by priority). Used as a fallback during HRMS import."
      embedded={embedded}
    >
        {msg && <div style={{ marginBottom: 12, fontSize: 13, color: "#047857" }}>{msg}</div>}

        <div style={{ ...card, maxWidth: 520, display: "flex", gap: 10, alignItems: "center" }}>
          {!embedded && (
            <select style={{ ...ctrl, flex: 1 }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project…</option>
              {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          )}
          {projectId && (
            <button
              onClick={() => setDraft(emptyDraft(projectId))}
              style={{ ...srButton("success"), whiteSpace: "nowrap" }}
            >
              + New Rule
            </button>
          )}
        </div>

        {draft && (
          <div style={card}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select style={ctrl} value={draft.matchType} onChange={(e) => setDraft({ ...draft, matchType: e.target.value })}>
                {MATCH_TYPES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select style={ctrl} value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })}>
                {OPERATORS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              <input style={{ ...ctrl, flex: 1 }} placeholder="Match value (e.g. VH101, IT, Principal)" value={draft.matchValue} onChange={(e) => setDraft({ ...draft, matchValue: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <select style={{ ...ctrl, flex: 1 }} value={draft.roleId} onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}>
                <option value="">Assign role…</option>
                {roles.map((r) => <option key={r._id} value={r._id}>{r.name}{r.code ? ` (${r.code})` : ""}</option>)}
              </select>
              <input type="number" style={{ ...ctrl, width: 120 }} placeholder="Priority" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
                Active
              </label>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
              <button onClick={save} style={srButton("success")}>Save</button>
              <button onClick={() => setDraft(null)} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #e7ebf3", background: "#fff", fontWeight: 600, fontSize: 14, color: "#374151", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {projectId && (
          <div style={card}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Priority</th>
                  <th style={th}>Match</th>
                  <th style={th}>Role</th>
                  <th style={th}>Active</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr><td style={{ ...td, color: "#9ca3af" }} colSpan={5}>No rules yet.</td></tr>
                ) : (
                  rules.map((r) => (
                    <tr key={r._id}>
                      <td style={td}>{r.priority}</td>
                      <td style={td}>
                        {MATCH_TYPES.find((m) => m.v === r.matchType)?.l || r.matchType}{" "}
                        <em>{OPERATORS.find((o) => o.v === r.operator)?.l}</em>{" "}
                        <strong>{r.matchValue}</strong>
                      </td>
                      <td style={td}>{roleName(r.roleId)}</td>
                      <td style={td}>{r.isActive ? "Yes" : "No"}</td>
                      <td style={td}>
                        <button onClick={() => setDraft({ ...r, roleId: typeof r.roleId === "object" ? r.roleId._id : r.roleId })} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #e7ebf3", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Edit</button>{" "}
                        <button onClick={async () => { await serviceRequestApi.roleMapping.remove(r._id); load(projectId); }} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", fontSize: 13, fontWeight: 600, color: "#b91c1c", cursor: "pointer" }}>Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
    </SrPage>
  );
};

export default RoleMappingRules;
