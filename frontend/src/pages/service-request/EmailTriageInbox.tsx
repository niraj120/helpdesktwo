import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SrPage from "../../components/sr/SrPage";
import { srStyles, srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { api } from "../../utils/api";
import { serviceRequestApi } from "../../services/serviceRequests";
import { PERMISSIONS } from "../../constants/permissions";
import { usePermissions } from "../../hooks/usePermissions";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}

interface Intake {
  _id: string;
  uniqueId: string;
  fromName?: string;
  fromEmail: string;
  subject: string;
  body?: string;
  htmlBody?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  projectEmailConfigId?: string;
  receivedAt: string;
  dueAt?: string;
  status: string;
  actions?: Array<{
    type: string;
    refType?: string;
    refId?: string;
    refNumber?: string;
  }>;
}

const stripHtml = (value?: string) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const LIVE_REFRESH_INTERVAL_MS = 15000;

const EmailTriageInbox: React.FC<{
  embedded?: boolean;
  hideProjectSelector?: boolean;
}> = ({ embedded, hideProjectSelector }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isProjectPortal = location.pathname.includes("/portal/");
  const serviceBasePath = isProjectPortal
    ? `${location.pathname.replace(/\/service-requests(?:\/.*)?$/, "")}/service-requests`
    : "/service-requests";
  const detailPath = (id: string) => `${serviceBasePath}/${id}`;

  const { hasPermission } = usePermissions();
  const canConvert = hasPermission(PERMISSIONS.EMAIL_TRIAGE_CONVERT);
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState<Intake[]>([]);
  const knownRowIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRowsRef = useRef(false);
  const [unreadRowIds, setUnreadRowIds] = useState<Set<string>>(new Set());
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showIngest, setShowIngest] = useState(false);
  const [ingestForm, setIngestForm] = useState({
    fromEmail: "",
    subject: "",
    body: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (hideProjectSelector && currentProjectId && projectId !== currentProjectId) {
      setProjectId(currentProjectId);
    }
  }, [hideProjectSelector, currentProjectId, projectId]);

  useEffect(() => {
    if (hideProjectSelector) return;
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
  }, [hideProjectSelector]);

  const markRowRead = (id: string) => {
    setUnreadRowIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const highlightUnreadRow = (id: string) =>
    unreadRowIds.has(id)
      ? { background: "#fffbeb", boxShadow: "inset 3px 0 0 #f59e0b" }
      : {};

  const rememberRows = useCallback((items: Intake[], silent?: boolean) => {
    const ids = new Set(items.map((item) => item._id).filter(Boolean));
    if (silent && hasLoadedRowsRef.current) {
      const newIds = items
        .map((item) => item._id)
        .filter((id) => id && !knownRowIdsRef.current.has(id));
      if (newIds.length) {
        setUnreadRowIds((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.add(id));
          return next;
        });
      }
    } else if (!silent) {
      setUnreadRowIds(new Set());
    }
    knownRowIdsRef.current = ids;
    hasLoadedRowsRef.current = true;
  }, []);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const r = await serviceRequestApi.emailIntake.list({
        projectId: projectId || undefined,
        status,
      });
      const items = r.items || [];
      rememberRows(items, options?.silent);
      setRows(items);
    } catch (e) {
      console.error(e);
      setRows([]);
    }
  }, [projectId, rememberRows, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refreshSilently = () => load({ silent: true });
    const intervalId = window.setInterval(refreshSilently, LIVE_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSilently();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  const startEmailPsr = (email: Intake, override?: Partial<Record<string, any>>) => {
    navigate(`${serviceBasePath}?tab=new&sourceType=email&sourceId=${email._id}`, {
      state: {
        sourceContext: {
          type: "email",
          id: email._id,
          returnTo: `${serviceBasePath}?tab=email`,
          uniqueId: email.uniqueId,
          fromName: email.fromName,
          fromEmail: email.fromEmail,
          subject: email.subject,
          body: email.body || stripHtml(email.htmlBody),
          messageId: email.messageId,
          inReplyTo: email.inReplyTo,
          references: email.references,
          sourceEmailConfigId: email.projectEmailConfigId,
          ...override,
        },
      },
    });
  };

  const markEmailJunk = async (email: Intake) => {
    try {
      await serviceRequestApi.emailIntake.action(email._id, {
        type: "junk",
        remark: "Marked as junk from email triage",
      });
      setMsg("Email marked as junk.");
      setSelectedId(null);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to mark email as junk.");
    }
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allRowsSelected =
    rows.length > 0 && rows.every((row) => selectedRowIds.has(row._id));

  const bulkEmailAction = async (type: "junk") => {
    const ids = Array.from(selectedRowIds);
    if (!ids.length) return;
    try {
      await serviceRequestApi.emailIntake.bulkAction({
        ids,
        type,
        remark: "Bulk marked as junk from email triage",
      });
      setMsg(`${ids.length} email(s) updated.`);
      setSelectedRowIds(new Set());
      setSelectedId(null);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Bulk action failed.");
    }
  };

  const bulkDeleteEmails = async () => {
    const ids = Array.from(selectedRowIds);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected email(s)?`)) return;
    try {
      await serviceRequestApi.emailIntake.bulkDelete(ids);
      setMsg(`${ids.length} email(s) deleted.`);
      setSelectedRowIds(new Set());
      setSelectedId(null);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Delete failed.");
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
  const statusChip = (value: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 9999,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 700,
    color: value === "junk" ? "#991b1b" : value === "closed" ? "#047857" : "#1d4ed8",
    background: value === "junk" ? "#fee2e2" : value === "closed" ? "#ecfdf5" : "#eef2ff",
    textTransform: "capitalize",
  });

  return (
    <SrPage
      title="Email Triage Inbox"
      subtitle="Review inbound emails and convert them into PSR through the configured New Request flow."
      embedded={embedded}
      actions={
        <button onClick={() => setShowIngest(!showIngest)} style={srButton("neutral")}>
          + Test email
        </button>
      }
    >
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: "#047857" }}>{msg}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {!hideProjectSelector && (
          <select style={ctrl} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        )}
        <select style={ctrl} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="wip">WIP</option>
          <option value="closed">Closed</option>
          <option value="junk">Junk</option>
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

      {canConvert && selectedRowIds.size > 0 && (
        <div
          style={{
            ...card,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
            borderColor: "#bfdbfe",
            background: "#f8fbff",
          }}
        >
          <strong>{selectedRowIds.size} email(s) selected</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => bulkEmailAction("junk")} style={srButton("danger")}>
              Mark Junk
            </button>
            <button type="button" onClick={bulkDeleteEmails} style={srButton("danger")}>
              Delete
            </button>
            <button type="button" onClick={() => setSelectedRowIds(new Set())} style={cancelBtn}>
              Clear
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {canConvert && (
                <th style={{ ...th, width: 42 }}>
                  <input
                    type="checkbox"
                    checked={allRowsSelected}
                    onChange={() =>
                      setSelectedRowIds(
                        allRowsSelected ? new Set() : new Set(rows.map((row) => row._id)),
                      )
                    }
                  />
                </th>
              )}
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
                  <tr><td style={{ ...td, color: "#9ca3af" }} colSpan={canConvert ? 7 : 6}>No emails.</td></tr>
            ) : (
              rows.map((r) => {
                const expanded = selectedId === r._id;
                const ticketAction = [...(r.actions || [])]
                  .reverse()
                  .find((a) => a.refType === "ticket" && a.refId);
                const bodyPreview = r.body || stripHtml(r.htmlBody);
                return (
                  <React.Fragment key={r._id}>
                    <tr
                      className={expanded ? "sr-triage-row sr-triage-row--selected" : "sr-triage-row"}
                      onClick={() => {
                        markRowRead(r._id);
                        setSelectedId(expanded ? null : r._id);
                      }}
                      style={{
                        cursor: "pointer",
                        background: expanded ? "#eef2ff" : "transparent",
                        transition: "background 0.12s ease",
                        ...(!expanded ? highlightUnreadRow(r._id) : {}),
                      }}
                        >
                          {canConvert && (
                            <td style={td}>
                              <input
                                type="checkbox"
                                checked={selectedRowIds.has(r._id)}
                                onClick={(event) => event.stopPropagation()}
                                onChange={() => toggleRowSelection(r._id)}
                              />
                            </td>
                          )}
                          <td style={td}>{r.uniqueId}</td>
                      <td style={td}>{r.fromName || r.fromEmail}</td>
                      <td style={td}>{r.subject}</td>
                      <td style={td}>{new Date(r.receivedAt).toLocaleString()}</td>
                      <td style={td}>{r.dueAt ? new Date(r.dueAt).toLocaleString() : "-"}</td>
                      <td style={td}>
                        <span style={statusChip(r.status)}>{r.status}</span>
                        {ticketAction?.refId && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(detailPath(String(ticketAction.refId)));
                            }}
                            style={{
                              marginLeft: 8,
                              border: "1px solid #a7f3d0",
                              background: "#ecfdf5",
                              color: "#047857",
                              borderRadius: 8,
                              padding: "4px 8px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {ticketAction.refNumber || "View SR"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                            <td colSpan={canConvert ? 7 : 6} style={{ ...td, background: "#f8fafc" }}>
                          <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", padding: 14 }}>
                            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                              From {r.fromName || r.fromEmail} - {new Date(r.receivedAt).toLocaleString()}
                            </div>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>{r.subject}</div>
                            <div
                              style={{
                                whiteSpace: "pre-wrap",
                                color: "#334155",
                                fontSize: 13,
                                lineHeight: 1.55,
                                border: "1px solid #eef2f7",
                                borderRadius: 10,
                                padding: 12,
                                maxHeight: 260,
                                overflow: "auto",
                                background: "#fbfdff",
                              }}
                            >
                              {bodyPreview || "No email body captured."}
                            </div>
                            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                              {canConvert && (
                                <>
                                  <button type="button" onClick={() => startEmailPsr(r)} style={srButton("primary")}>
                                    Create PSR
                                  </button>
                                  <button type="button" onClick={() => markEmailJunk(r)} style={srButton("danger")}>
                                    Mark as Junk
                                  </button>
                                </>
                              )}
                              <button type="button" onClick={() => setSelectedId(null)} style={cancelBtn}>
                                Collapse
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SrPage>
  );
};

export default EmailTriageInbox;
