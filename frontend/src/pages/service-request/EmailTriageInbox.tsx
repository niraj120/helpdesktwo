import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SrPage from "../../components/sr/SrPage";
import { srStyles, srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { api } from "../../utils/api";
import {
  serviceRequestApi,
  type SrFamilyParent,
} from "../../services/serviceRequests";
import EmailDrawer, { type EmailIntakeRow, stripHtml } from "./email/EmailDrawer";
import { PERMISSIONS } from "../../constants/permissions";
import { usePermissions } from "../../hooks/usePermissions";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}

type Intake = EmailIntakeRow;

// Status tabs, in the order an agent works through them.
const EMAIL_STATUS_TABS: Array<{
  key: string;
  label: string;
  color: string;
  bg: string;
}> = [
  { key: "all", label: "All", color: "#2563EB", bg: "#eff6ff" },
  { key: "open", label: "Open", color: "#1d4ed8", bg: "#eef2ff" },
  { key: "wip", label: "WIP", color: "#b45309", bg: "#fffbeb" },
  { key: "closed", label: "Closed", color: "#047857", bg: "#ecfdf5" },
  { key: "junk", label: "Junk", color: "#991b1b", bg: "#fee2e2" },
];

const LIVE_REFRESH_INTERVAL_MS = 15000;
const PAGE_SIZE = 25;

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
  const [readFilter, setReadFilter] = useState<"" | "unread" | "read">("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Intake[]>([]);
  const rowsRef = useRef<Intake[]>([]);
  rowsRef.current = rows;
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

  // Read state is the email's own (shared by the team, like View Queries):
  // opening marks it read; new mail stays highlighted until someone opens it.
  const setRowRead = (id: string, read: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r._id === id ? { ...r, readAt: read ? r.readAt || new Date().toISOString() : undefined } : r,
      ),
    );
    setUnreadCount((n) => Math.max(0, n + (read ? -1 : 1)));
    serviceRequestApi.emailIntake.markRead(id, read).catch(() => load({ silent: true }));
  };

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      // Paged: the server returns one page at a time, so without page/limit
      // only the newest 20 were ever shown and the rest silently hidden.
      const r = await serviceRequestApi.emailIntake.list({
        projectId: projectId || undefined,
        status,
        read: readFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      });
      const items = r.items || [];
      if (options?.silent) {
        const known = new Set(rowsRef.current.map((x) => x._id));
        const fresh = items.filter((x: Intake) => !known.has(x._id) && !x.readAt);
        if (fresh.length) setMsg(`${fresh.length} new email${fresh.length === 1 ? "" : "s"} received.`);
      }
      setRows(items);
      setTotal(Number(r.total) || 0);
      setUnreadCount(Number(r.unread) || 0);
      setStatusCounts(r.statusCounts || {});
    } catch (e) {
      console.error(e);
      setRows([]);
    }
  }, [projectId, status, readFilter, search, page]);

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

  const startEmailPsr = (
    email: Intake,
    family?: SrFamilyParent[],
    override?: Partial<Record<string, any>>,
  ) => {
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
          // A registered sender opens straight on the existing-parent form with
          // the family filled in, as for a registered IVR caller.
          ...(family?.length
            ? { preselectChannelFlow: "existing_parent", family }
            : {}),
          ...override,
        },
      },
    });
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
          <select
            style={ctrl}
            value={projectId}
            onChange={(e) => {
              setPage(1);
              setProjectId(e.target.value);
            }}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        )}
        <select
          style={ctrl}
          value={readFilter}
          aria-label="Read or unread"
          onChange={(e) => {
            setPage(1);
            setReadFilter(e.target.value as "" | "unread" | "read");
          }}
        >
          <option value="">Read & unread</option>
          <option value="unread">Unread ({unreadCount})</option>
          <option value="read">Read</option>
        </select>
        <input
          style={{ ...ctrl, flex: "1 1 220px", minWidth: 180 }}
          placeholder="Search ID, subject or sender…"
          aria-label="Search emails"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <span style={{ alignSelf: "center", fontSize: 12, color: "#64748b" }}>
          {total.toLocaleString()} email{total === 1 ? "" : "s"}
        </span>
      </div>

      {/* Status tabs — same shape as the Service Requests list */}
      <div
        role="tablist"
        aria-label="Filter by status"
        style={{
          ...card,
          padding: "0 6px",
          marginBottom: 12,
          display: "flex",
          overflowX: "auto",
        }}
      >
        {EMAIL_STATUS_TABS.map((t) => {
          const active = status === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setPage(1);
                setStatus(t.key);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "11px 12px 9px",
                border: "none",
                borderBottom: `2px solid ${active ? t.color : "transparent"}`,
                background: "transparent",
                color: active ? t.color : "#475569",
                fontSize: 13,
                fontWeight: active ? 700 : 600,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {t.label}
              <span
                style={{
                  minWidth: 22,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: active ? t.color : t.bg,
                  color: active ? "#fff" : t.color,
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {(statusCounts[t.key] || 0).toLocaleString()}
              </span>
            </button>
          );
        })}
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
                return (
                  <React.Fragment key={r._id}>
                    <tr
                      className={expanded ? "sr-triage-row sr-triage-row--selected" : "sr-triage-row"}
                      onClick={() => {
                        if (!r.readAt) setRowRead(r._id, true);
                        setSelectedId(r._id);
                      }}
                      style={{
                        cursor: "pointer",
                        background: expanded ? "#eef2ff" : "transparent",
                        transition: "background 0.12s ease",
                        ...(!expanded && !r.readAt
                          ? { background: "#fffbeb", boxShadow: "inset 3px 0 0 #f59e0b" }
                          : {}),
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
                      <td style={{ ...td, fontWeight: r.readAt ? 400 : 700 }}>
                        {!r.readAt && (
                          <span
                            title="Unread"
                            style={{
                              display: "inline-block",
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: "#F59E0B",
                              marginRight: 6,
                              verticalAlign: "middle",
                            }}
                          />
                        )}
                        {r.fromName || r.fromEmail}
                      </td>
                      <td style={{ ...td, fontWeight: r.readAt ? 400 : 700 }}>{r.subject}</td>
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
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            marginTop: 10,
            fontSize: 12,
            color: "#64748b",
          }}
        >
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
            {total.toLocaleString()}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              style={{ ...ctrl, cursor: page > 1 ? "pointer" : "default" }}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ Prev
            </button>
            <button
              type="button"
              style={{ ...ctrl, cursor: page * PAGE_SIZE < total ? "pointer" : "default" }}
              disabled={page * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
      {selectedId && rows.find((r) => r._id === selectedId) && (
        <EmailDrawer
          email={rows.find((r) => r._id === selectedId)!}
          canConvert={canConvert}
          onClose={() => setSelectedId(null)}
          onStartPsr={(email, family) => startEmailPsr(email, family)}
          // Same as IVR: open the PSR flow on its Junk / Telemarketing step.
          onJunk={(email) =>
            startEmailPsr(email, undefined, { preselectChannelFlow: "junk" })
          }
          onOpenTicket={(id) => navigate(detailPath(id))}
          onMarkUnread={(email) => {
            setRowRead(email._id, false);
            setSelectedId(null);
          }}
        />
      )}
    </SrPage>
  );
};

export default EmailTriageInbox;
