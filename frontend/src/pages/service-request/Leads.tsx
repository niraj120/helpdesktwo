import React, { useEffect, useState } from "react";
import SrPage from "../../components/sr/SrPage";
import { srStyles, srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { api } from "../../utils/api";
import { serviceRequestApi } from "../../services/serviceRequests";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}
interface LeadRow {
  _id: string;
  name: string;
  email?: string;
  contactNumber?: string;
  studentName?: string;
  grade?: string;
  enquiryNo?: string;
  status: string;
  source?: string;
  createdAt: string;
}

const STATUSES = ["new", "in_followup", "converted", "closed", "lost"];

const emptyDraft = (projectId: string) => ({
  projectId,
  name: "",
  email: "",
  contactNumber: "",
  studentName: "",
  grade: "",
  enquiryNo: "",
  status: "new",
});

const Leads: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [draft, setDraft] = useState<any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  const load = async () => {
    try {
      const r = await serviceRequestApi.leads.list({
        projectId: projectId || undefined,
        status: status === "all" ? undefined : status,
      });
      setRows(r.items || []);
    } catch (e) {
      console.error(e);
      setRows([]);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, status]);

  const save = async () => {
    if (!draft?.projectId || !draft?.name?.trim()) {
      setMsg("Project and name are required.");
      return;
    }
    try {
      if (draft._id) await serviceRequestApi.leads.update(draft._id, draft);
      else await serviceRequestApi.leads.create(draft);
      setDraft(null);
      setMsg("Saved.");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to save.");
    }
  };

  const ctrl = srStyles.ctrl;
  const card = srStyles.card;
  const th = srStyles.th;
  const td = srStyles.td;
  const cancelBtn: React.CSSProperties = {
    padding: "9px 18px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    fontWeight: 600,
    fontSize: 14,
    color: "#374151",
    cursor: "pointer",
  };
  const smallBtn: React.CSSProperties = {
    padding: "5px 12px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "#fff",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    cursor: "pointer",
  };

  return (
    <SrPage
      title="Leads"
      subtitle="Admission enquiries (created from email triage or manually)."
      embedded={embedded}
      actions={
        <button
          onClick={() => setDraft(emptyDraft(projectId || (projects[0]?._id ?? "")))}
          style={srButton("success")}
        >
          + New Lead
        </button>
      }
    >
        {msg && <div style={{ marginBottom: 12, fontSize: 13, color: "#047857" }}>{msg}</div>}

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <select style={ctrl} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <select style={ctrl} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {draft && (
          <div style={card}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select style={ctrl} value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}>
                <option value="">Project…</option>
                {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
              <input style={{ ...ctrl, flex: 1 }} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <input style={{ ...ctrl, flex: 1 }} placeholder="Contact" value={draft.contactNumber} onChange={(e) => setDraft({ ...draft, contactNumber: e.target.value })} />
              <input style={{ ...ctrl, flex: 1 }} placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <input style={{ ...ctrl, flex: 1 }} placeholder="Student name" value={draft.studentName} onChange={(e) => setDraft({ ...draft, studentName: e.target.value })} />
              <input style={{ ...ctrl, width: 120 }} placeholder="Grade" value={draft.grade} onChange={(e) => setDraft({ ...draft, grade: e.target.value })} />
              <input style={{ ...ctrl, width: 160 }} placeholder="Enquiry No" value={draft.enquiryNo} onChange={(e) => setDraft({ ...draft, enquiryNo: e.target.value })} />
              <select style={ctrl} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
              <button onClick={save} style={srButton("success")}>Save</button>
              <button onClick={() => setDraft(null)} style={cancelBtn}>Cancel</button>
            </div>
          </div>
        )}

        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Contact</th>
                <th style={th}>Student</th>
                <th style={th}>Enquiry</th>
                <th style={th}>Status</th>
                <th style={th}>Created</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td style={{ ...td, color: "#9ca3af" }} colSpan={7}>No leads.</td></tr>
              ) : (
                rows.map((l) => (
                  <tr
                    key={l._id}
                    style={{ transition: "background 0.12s ease" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f8fafc")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td style={td}>{l.name}</td>
                    <td style={td}>{l.contactNumber || l.email || "—"}</td>
                    <td style={td}>{l.studentName || "—"}</td>
                    <td style={td}>{l.enquiryNo || "—"}</td>
                    <td style={td}>{l.status}</td>
                    <td style={td}>{new Date(l.createdAt).toLocaleDateString()}</td>
                    <td style={td}>
                      <button onClick={() => setDraft({ ...l })} style={smallBtn}>Edit</button>{" "}
                      <button onClick={async () => { await serviceRequestApi.leads.remove(l._id); load(); }} style={{ ...smallBtn, color: "#b91c1c", borderColor: "#fecaca" }}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
    </SrPage>
  );
};

export default Leads;
