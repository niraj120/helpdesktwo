import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
interface CategoryNode {
  _id: string;
  name: string;
  parentId?: string | null;
  path?: string;
}
interface Call {
  _id: string;
  externalId?: string;
  callToNumber?: string;
  callerName?: string;
  callerMobile: string;
  schoolName?: string;
  callType: string;
  provider?: string;
  direction?: string;
  startStamp?: string;
  answerStamp?: string;
  endStamp?: string;
  durationSeconds?: number;
  voiceNoteUrl?: string;
  recordingUrl?: string;
  digitsDialed?: string[];
  answeredAgentName?: string;
  answeredAgentNumber?: string;
  answeredAgentId?: string;
  providerCallStatus?: string;
  receivedAt: string;
  registered: boolean;
  studentCount?: number;
  requesterType?: string;
  callStatus: string;
  convertedTicketId?: string;
  convertedTicketNumber?: string;
}

const REQUESTER_TYPES = [
  { v: "prospective_parent", l: "Prospective Parent" },
  { v: "existing_parent", l: "Existing Parent" },
  { v: "left_parent", l: "Left Parent" },
  { v: "vendor", l: "Vendor" },
  { v: "job", l: "Job-related" },
  { v: "junk", l: "Junk / Spam" },
  { v: "other", l: "Other" },
];

const fmtDuration = (s?: number) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

const Chip: React.FC<{ text: string; color: string; bg: string }> = ({ text, color, bg }) => (
  <span style={{ padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600, color, background: bg }}>
    {text}
  </span>
);

const CALL_STATUS_META: Record<string, { color: string; bg: string }> = {
  new: { color: "#1d4ed8", bg: "#eef2ff" },
  assigned: { color: "#b45309", bg: "#fffbeb" },
  converted: { color: "#047857", bg: "#ecfdf5" },
  junk: { color: "#991b1b", bg: "#fee2e2" },
};

const LIVE_REFRESH_INTERVAL_MS = 15000;

const IVRCalls: React.FC<{
  embedded?: boolean;
  hideProjectSelector?: boolean;
}> = ({ embedded, hideProjectSelector }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isProjectPortal = location.pathname.includes("/portal/");
  const detailPath = (id: string) =>
    isProjectPortal
      ? `${location.pathname.replace(/\/service-requests(?:\/.*)?$/, "")}/service-requests/${id}`
      : `/service-requests/${id}`;
  const serviceBasePath = isProjectPortal
    ? `${location.pathname.replace(/\/service-requests(?:\/.*)?$/, "")}/service-requests`
    : "/service-requests";
  const { hasAnyPermission } = usePermissions();
  const canConvert = hasAnyPermission([
    PERMISSIONS.IVR_TRIAGE_CONVERT,
    PERMISSIONS.SR_PSR_CREATE,
  ]);
  const canReassign = hasAnyPermission([
    PERMISSIONS.IVR_AGENT_MANAGE,
    PERMISSIONS.IVR_TRIAGE_CONVERT,
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<any[]>([]);
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  const [callType, setCallType] = useState("all");
  const [registered, setRegistered] = useState("all");
  const [rows, setRows] = useState<Call[]>([]);
  const knownRowIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRowsRef = useRef(false);
  const [unreadRowIds, setUnreadRowIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [selected, setSelected] = useState<Call | null>(null);
  const [requesterType, setRequesterType] = useState("prospective_parent");
  const [categoryId, setCategoryId] = useState("");
  const [remark, setRemark] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [showIngest, setShowIngest] = useState(false);
  const [ingestForm, setIngestForm] = useState({ callerName: "", callerMobile: "", callType: "answered" });

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

  const rememberRows = useCallback((items: Call[], silent?: boolean) => {
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
      const r = await serviceRequestApi.ivr.list({
        projectId: projectId || undefined,
        callType,
        registered,
      });
      const items = r.items || [];
      rememberRows(items, options?.silent);
      setRows(items);
    } catch (e) {
      console.error(e);
      setRows([]);
    }
  }, [callType, projectId, registered, rememberRows]);
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

  useEffect(() => {
    if (!projectId) {
      setAgents([]);
      return;
    }
    api
      .get("/users", { params: { project: projectId, isActive: true, limit: 1000 } })
      .then((r) => setAgents((r as any).data?.data || []))
      .catch(() => setAgents([]));
  }, [projectId]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const doBulkReassign = async () => {
    if (!reassignUserId || selectedIds.size === 0) return;
    setReassigning(true);
    setMsg(null);
    try {
      const r = await serviceRequestApi.ivr.bulkReassign(
        Array.from(selectedIds),
        reassignUserId,
      );
      setMsg(`Reassigned ${r.data?.reassigned ?? 0} call(s).`);
      setSelectedIds(new Set());
      setReassignUserId("");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Bulk reassign failed.");
    } finally {
      setReassigning(false);
    }
  };

  const openConvert = (call: Call) => {
    setSelected(call);
    setRequesterType(call.requesterType || (call.registered ? "existing_parent" : "prospective_parent"));
    setCategoryId("");
    setRemark("");
    setMsg(null);
  };

  const convert = async () => {
    if (!selected || !categoryId) {
      setMsg("Select a sub-category.");
      return;
    }
    try {
      await serviceRequestApi.ivr.convert(selected._id, {
        categoryId,
        requesterType,
      });
      setMsg("Converted to PSR.");
      setSelected(null);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Convert failed.");
    }
  };

  const resolveOnCall = async () => {
    if (!selected) return;
    try {
      await serviceRequestApi.ivr.resolveOnCall(selected._id, { remark });
      setMsg("Resolved on call (OCR).");
      setSelected(null);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed.");
    }
  };

  const startIvrPsr = (call: Call) => {
    navigate(`${serviceBasePath}?tab=new&sourceType=ivr&sourceId=${call._id}`, {
      state: {
        sourceContext: {
          type: "ivr",
          id: call._id,
          returnTo: `${serviceBasePath}?tab=ivr`,
          callerName: call.callerName,
          callerMobile: call.callerMobile,
          subject: `IVR call from ${call.callerName || call.callerMobile}`,
          body: `Converted from IVR call ${call.externalId || call._id}. Caller: ${call.callerName || "Unknown"} (${call.callerMobile}).`,
        },
      },
    });
  };

  const markJunk = async (call: Call) => {
    try {
      await serviceRequestApi.ivr.markJunk(call._id, { remark });
      setMsg("Marked as junk.");
      setSelected(null);
      setRemark("");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Failed to mark junk.");
    }
  };

  const ingest = async () => {
    if (!projectId || !ingestForm.callerMobile) {
      setMsg("Select a project and enter a caller mobile.");
      return;
    }
    try {
      await serviceRequestApi.ivr.ingest({
        projectId,
        externalId: `TEST-${Date.now()}`,
        callerName: ingestForm.callerName,
        callerMobile: ingestForm.callerMobile,
        callType: ingestForm.callType,
        durationSeconds: 120,
      });
      setShowIngest(false);
      setIngestForm({ callerName: "", callerMobile: "", callType: "answered" });
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Ingest failed.");
    }
  };

  const ctrl = srStyles.ctrl;
  const card = srStyles.card;
  const th = srStyles.th;
  const td: React.CSSProperties = { ...srStyles.td, verticalAlign: "top" };
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
  const tab = (active: boolean): React.CSSProperties => ({
    padding: "7px 14px",
    borderRadius: 9999,
    border: "1px solid " + (active ? "#4f46e5" : "#e2e8f0"),
    background: active ? "#eef2ff" : "#fff",
    color: active ? "#4f46e5" : "#374151",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <SrPage
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          IVR Calls Integration
          <Chip text="PSL Telephony" color="#6d28d9" bg="#f5f3ff" />
        </span>
      }
      subtitle="Convert parent incoming calls and voice notes directly into PSR tickets."
      embedded={embedded}
      actions={
        <button onClick={() => setShowIngest(!showIngest)} style={srButton("neutral")}>
          + Test call
        </button>
      }
    >

        {msg && <div style={{ marginBottom: 12, fontSize: 13, color: "#047857" }}>{msg}</div>}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {["all", "answered", "missed"].map((t) => (
            <button key={t} style={tab(callType === t)} onClick={() => setCallType(t)}>
              {t === "all" ? "All Calls" : t === "answered" ? "Answered" : "Missed"}
            </button>
          ))}
          <span style={{ width: 1, background: "#e5e7eb", margin: "0 4px" }} />
          {[{ v: "all", l: "All Callers" }, { v: "true", l: "Registered" }, { v: "false", l: "Unregistered" }].map((t) => (
            <button key={t.v} style={tab(registered === t.v)} onClick={() => setRegistered(t.v)}>
              {t.l}
            </button>
          ))}
          {!hideProjectSelector && (
            <select style={{ ...ctrl, marginLeft: "auto" }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          )}
        </div>

        {showIngest && (
          <div style={card}>
            <strong>Ingest test call</strong> (select a project first)
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <input style={{ ...ctrl, flex: 1 }} placeholder="Caller name" value={ingestForm.callerName} onChange={(e) => setIngestForm({ ...ingestForm, callerName: e.target.value })} />
              <input style={{ ...ctrl, flex: 1 }} placeholder="Caller mobile (10 digits)" value={ingestForm.callerMobile} onChange={(e) => setIngestForm({ ...ingestForm, callerMobile: e.target.value })} />
              <select style={ctrl} value={ingestForm.callType} onChange={(e) => setIngestForm({ ...ingestForm, callType: e.target.value })}>
                <option value="answered">Answered</option>
                <option value="missed">Missed</option>
              </select>
              <button onClick={ingest} style={srButton("success")}>Ingest</button>
            </div>
          </div>
        )}

        {canReassign && selectedIds.size > 0 && (
          <div
            style={{
              ...card,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              background: "#eef2ff",
              border: "1px solid #c7d2fe",
            }}
          >
            <strong style={{ fontSize: 13, color: "#3730a3" }}>
              {selectedIds.size} selected
            </strong>
            <select
              style={{ ...ctrl, minWidth: 220 }}
              value={reassignUserId}
              onChange={(e) => setReassignUserId(e.target.value)}
            >
              <option value="">Reassign to…</option>
              {agents.map((u) => (
                <option key={u._id} value={u._id}>
                  {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
                </option>
              ))}
            </select>
            <button
              onClick={doBulkReassign}
              disabled={reassigning || !reassignUserId}
              style={srButton("primary")}
            >
              {reassigning ? "Reassigning…" : "Reassign"}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={cancelBtn}
            >
              Clear
            </button>
          </div>
        )}

        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Caller Info</th>
                <th style={th}>IVR Details</th>
                <th style={th}>Received</th>
                <th style={th}>Duration</th>
                <th style={th}>Call Type</th>
                <th style={th}>Recording</th>
                <th style={th}>Status</th>
                <th style={th}>Call Status</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td style={{ ...td, color: "#9ca3af" }} colSpan={9}>No calls.</td></tr>
              ) : (
                rows.map((c) => {
                  const cs = CALL_STATUS_META[c.callStatus] || CALL_STATUS_META.new;
                  return (
                    <tr
                      key={c._id}
                      className="sr-triage-row"
                      onClick={() => markRowRead(c._id)}
                      style={{ transition: "background 0.12s ease", ...highlightUnreadRow(c._id) }}
                    >
                      <td style={td}>
                        {canReassign && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(c._id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelect(c._id)}
                            style={{ marginRight: 8, verticalAlign: "middle" }}
                          />
                        )}
                        <div style={{ fontWeight: 600, display: "inline-block", verticalAlign: "middle" }}>
                          {c.callerName || "Unknown Caller"}{" "}
                          {c.registered ? (
                            <Chip text="Registered" color="#047857" bg="#ecfdf5" />
                          ) : (
                            <Chip text="Unregistered" color="#b91c1c" bg="#fef2f2" />
                          )}
                        </div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>Phone: {c.callerMobile}</div>
                        {c.externalId ? (
                          <div style={{ color: "#94a3b8", fontSize: 11 }}>ID: {c.externalId}</div>
                        ) : null}
                        {c.studentCount ? (
                          <div style={{ color: "#1d4ed8", fontSize: 12 }}>{c.studentCount} students</div>
                        ) : null}
                      </td>
                      <td style={td}>
                        <div>{c.callToNumber || "DID not captured"}</div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>
                          Digit: {c.digitsDialed?.length ? c.digitsDialed.join(", ") : "-"}
                        </div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>
                          Agent: {c.answeredAgentName || c.answeredAgentNumber || c.answeredAgentId || "-"}
                        </div>
                      </td>
                      <td style={td}>{new Date(c.receivedAt).toLocaleString()}</td>
                      <td style={td}>{c.callType === "missed" ? "No duration" : fmtDuration(c.durationSeconds)}</td>
                      <td style={td}>
                        {c.callType === "missed" ? (
                          <Chip text="Missed Call" color="#b91c1c" bg="#fef2f2" />
                        ) : (
                          <Chip text="Answered" color="#047857" bg="#ecfdf5" />
                        )}
                      </td>
                      <td style={td}>
                        {c.recordingUrl || c.voiceNoteUrl ? (
                          <audio controls src={c.recordingUrl || c.voiceNoteUrl} style={{ height: 28 }} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={td}>
                        {c.requesterType
                          ? REQUESTER_TYPES.find((r) => r.v === c.requesterType)?.l || c.requesterType
                          : "—"}
                      </td>
                      <td style={td}>
                        <Chip text={c.callStatus.toUpperCase()} color={cs.color} bg={cs.bg} />
                        {c.providerCallStatus ? (
                          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                            {c.providerCallStatus}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {c.callStatus === "converted" && c.convertedTicketId ? (
                          <div style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                markRowRead(c._id);
                                c.convertedTicketId &&
                                  navigate(detailPath(c.convertedTicketId));
                              }}
                              style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", borderRadius: 10, padding: "6px 12px", fontWeight: 600, cursor: "pointer" }}
                            >
                              {c.convertedTicketNumber || "View PSR"}
                            </button>
                            {canConvert && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  markRowRead(c._id);
                                  openConvert(c);
                                }}
                                style={{ ...srButton("neutral"), padding: "6px 12px" }}
                              >
                                Raise another PSR
                              </button>
                            )}
                          </div>
                        ) : c.callStatus === "junk" ? (
                          <Chip text="Junk" color="#991b1b" bg="#fee2e2" />
                        ) : canConvert ? (
                          <div style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              markRowRead(c._id);
                              startIvrPsr(c);
                            }}
                            style={{ ...srButton("primary"), padding: "6px 12px" }}
                          >
                            Convert to PSR
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              markRowRead(c._id);
                              markJunk(c);
                            }}
                            style={{ ...srButton("danger"), padding: "6px 12px" }}
                          >
                            Mark Junk
                          </button>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>
                            View only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div style={card}>
            <strong>
              {selected.registered ? "Raise SR" : "Convert SR"} — {selected.callerName || selected.callerMobile}
            </strong>
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              {!selected.registered && (
                <select style={ctrl} value={requesterType} onChange={(e) => setRequesterType(e.target.value)}>
                  {REQUESTER_TYPES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              )}
              <select style={{ ...ctrl, minWidth: 260 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Select sub-category…</option>
                {leaves.map((c) => <option key={c._id} value={c._id}>{c.path || c.name}</option>)}
              </select>
            </div>
            <input style={{ ...ctrl, width: "100%", marginTop: 10 }} placeholder="Remark / on-call notes (optional)" value={remark} onChange={(e) => setRemark(e.target.value)} />
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              {canConvert && (
                <>
                  <button onClick={convert} style={srButton("primary")}>
                    Convert to PSR
                  </button>
                  <button onClick={resolveOnCall} style={srButton("neutral")}>
                    Resolve on call (OCR)
                  </button>
                  <button onClick={() => markJunk(selected)} style={srButton("danger")}>
                    Mark Junk
                  </button>
                </>
              )}
              <button onClick={() => setSelected(null)} style={cancelBtn}>Cancel</button>
            </div>
          </div>
        )}
    </SrPage>
  );
};

export default IVRCalls;
