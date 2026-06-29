import React, { useEffect, useMemo, useState } from "react";
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
interface CategoryNode {
  _id: string;
  name: string;
  parentId?: string | null;
  path?: string;
}
interface Intake {
  _id: string;
  uniqueId: string;
  fromName?: string;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  dueAt?: string;
  status: string;
  senderType?: string;
}

const SENDER_TYPES = [
  { v: "existing_student", l: "Existing Student" },
  { v: "left_student", l: "Left Student" },
  { v: "new_admission", l: "New Admission" },
  { v: "others", l: "Others" },
];
const ACTIONS = [
  { v: "psr", l: "Generate PSR" },
  { v: "isr", l: "Generate ISR" },
  { v: "lead", l: "Create Lead" },
  { v: "responded", l: "Responded (reply)" },
  { v: "duplicate", l: "Duplicate" },
  { v: "forward", l: "Forward" },
  { v: "repository", l: "Repository" },
];

const EmailTriageInbox: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<Intake[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [selected, setSelected] = useState<Intake | null>(null);
  const [showIngest, setShowIngest] = useState(false);
  const [ingestForm, setIngestForm] = useState({ fromEmail: "", subject: "", body: "" });

  // action panel state
  const [actType, setActType] = useState("psr");
  const [senderType, setSenderType] = useState("existing_student");
  const [categoryId, setCategoryId] = useState("");
  const [remark, setRemark] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [leadForm, setLeadForm] = useState({ name: "", email: "", contactNumber: "", grade: "", enquiryNo: "" });
  const [wip, setWip] = useState(false);
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
      const r = await serviceRequestApi.emailIntake.list({
        projectId: projectId || undefined,
        status,
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

  useEffect(() => {
    if (!projectId) {
      setCategories([]);
      return;
    }
    serviceRequestApi
      .categoriesForProject(projectId)
      .then((r) => setCategories(r?.data || r || []))
      .catch(() => setCategories([]));
  }, [projectId]);

  const leaves = useMemo(() => {
    const parents = new Set(
      categories.map((c) => (c.parentId ? String(c.parentId) : "")).filter(Boolean),
    );
    return categories.filter((c) => !parents.has(String(c._id)));
  }, [categories]);

  const submitAction = async () => {
    if (!selected) return;
    setMsg(null);
    try {
      await serviceRequestApi.emailIntake.action(selected._id, {
        type: actType,
        senderType,
        categoryId: actType === "psr" || actType === "isr" ? categoryId : undefined,
        remark,
        replyContent: actType === "responded" ? replyContent : undefined,
        refNumber: actType === "duplicate" ? refNumber : undefined,
        lead: actType === "lead" ? leadForm : undefined,
        wip,
      });
      setMsg("Action recorded.");
      setSelected(null);
      setRemark("");
      setReplyContent("");
      setRefNumber("");
      setWip(false);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Action failed.");
    }
  };

  const ingest = async () => {
    if (!projectId || !ingestForm.fromEmail || !ingestForm.subject) {
      setMsg("Select a project and fill from/subject.");
      return;
    }
    try {
      await serviceRequestApi.emailIntake.ingest({ projectId, ...ingestForm });
      setShowIngest(false);
      setIngestForm({ fromEmail: "", subject: "", body: "" });
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Ingest failed.");
    }
  };

  const card = srStyles.card;
  const ctrl = srStyles.ctrl;
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

  return (
    <SrPage
      title="Email Triage Inbox"
      subtitle="Read, classify and convert emails into PSR/ISR/leads."
      embedded={embedded}
      actions={
        <button onClick={() => setShowIngest(!showIngest)} style={srButton("neutral")}>
          + Test email
        </button>
      }
    >

        {msg && <div style={{ marginBottom: 12, fontSize: 13, color: "#047857" }}>{msg}</div>}

        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <select style={ctrl} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
          <select style={ctrl} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="wip">WIP</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
        </div>

        {showIngest && (
          <div style={card}>
            <strong>Ingest test email</strong> (requires a selected project)
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <input style={{ ...ctrl, flex: 1 }} placeholder="From email" value={ingestForm.fromEmail} onChange={(e) => setIngestForm({ ...ingestForm, fromEmail: e.target.value })} />
              <input style={{ ...ctrl, flex: 2 }} placeholder="Subject" value={ingestForm.subject} onChange={(e) => setIngestForm({ ...ingestForm, subject: e.target.value })} />
            </div>
            <textarea style={{ ...ctrl, width: "100%", minHeight: 60, marginTop: 8 }} placeholder="Body" value={ingestForm.body} onChange={(e) => setIngestForm({ ...ingestForm, body: e.target.value })} />
            <button onClick={ingest} style={{ ...srButton("success"), marginTop: 8 }}>Ingest</button>
          </div>
        )}

        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Unique ID</th>
                <th style={th}>From</th>
                <th style={th}>Subject</th>
                <th style={th}>Received</th>
                <th style={th}>Due</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td style={{ ...td, color: "#9ca3af" }} colSpan={6}>No emails.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r._id}
                    onClick={() => setSelected(r)}
                    style={{
                      cursor: "pointer",
                      background: selected?._id === r._id ? "#eef2ff" : "transparent",
                      transition: "background 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (selected?._id !== r._id)
                        e.currentTarget.style.background = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      if (selected?._id !== r._id)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td style={td}>{r.uniqueId}</td>
                    <td style={td}>{r.fromName || r.fromEmail}</td>
                    <td style={td}>{r.subject}</td>
                    <td style={td}>{new Date(r.receivedAt).toLocaleString()}</td>
                    <td style={td}>{r.dueAt ? new Date(r.dueAt).toLocaleString() : "—"}</td>
                    <td style={td}>{r.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div style={card}>
            <strong>Action on {selected.uniqueId}</strong> — {selected.subject}
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <select style={ctrl} value={senderType} onChange={(e) => setSenderType(e.target.value)}>
                {SENDER_TYPES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
              <select style={ctrl} value={actType} onChange={(e) => setActType(e.target.value)}>
                {ACTIONS.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
              </select>
            </div>

            {(actType === "psr" || actType === "isr") && (
              <select style={{ ...ctrl, marginTop: 10, width: "100%" }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Select sub-category…</option>
                {leaves.map((c) => <option key={c._id} value={c._id}>{c.path || c.name}</option>)}
              </select>
            )}
            {actType === "responded" && (
              <textarea style={{ ...ctrl, width: "100%", minHeight: 70, marginTop: 10 }} placeholder="Reply to send to the sender" value={replyContent} onChange={(e) => setReplyContent(e.target.value)} />
            )}
            {actType === "duplicate" && (
              <input style={{ ...ctrl, marginTop: 10, width: "100%" }} placeholder="Existing SR number" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
            )}
            {actType === "lead" && (
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <input style={{ ...ctrl, flex: 1 }} placeholder="Name" value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} />
                <input style={{ ...ctrl, flex: 1 }} placeholder="Contact" value={leadForm.contactNumber} onChange={(e) => setLeadForm({ ...leadForm, contactNumber: e.target.value })} />
                <input style={{ ...ctrl, flex: 1 }} placeholder="Grade" value={leadForm.grade} onChange={(e) => setLeadForm({ ...leadForm, grade: e.target.value })} />
              </div>
            )}

            <input style={{ ...ctrl, marginTop: 10, width: "100%" }} placeholder="Remark (optional)" value={remark} onChange={(e) => setRemark(e.target.value)} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13 }}>
              <input type="checkbox" checked={wip} onChange={(e) => setWip(e.target.checked)} />
              Keep open (WIP) — more actions needed on this email
            </label>
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button onClick={submitAction} style={srButton("primary")}>Submit action</button>
              <button onClick={() => setSelected(null)} style={cancelBtn}>Cancel</button>
            </div>
          </div>
        )}
    </SrPage>
  );
};

export default EmailTriageInbox;
