import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SrPage from "../../components/sr/SrPage";
import { srStyles, srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { api } from "../../utils/api";
import { serviceRequestApi } from "../../services/serviceRequests";
import { useSocket } from "../../hooks/useSocket";
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
  /** The call's own project — the create flow needs it when the user has not
   *  selected a project (e.g. a super admin who skipped project selection). */
  projectId?: string;
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
  callbackAt?: string;
  followUps?: {
    wipLevel?: number;
    wipLabel?: string;
    tatHours?: number;
    tatStartsAt?: string;
    urgentAt?: string;
    _id: string;
    scheduledAt: string;
    note?: string;
    status: "pending" | "done" | "cancelled";
    outcome?: string;
  }[];
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

/** Tiny inline action used in the follow-up log rows. */
const logAction = (color: string): React.CSSProperties => ({
  background: "none",
  border: "none",
  padding: "0 4px",
  color,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
});

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
  // Handing a call to someone else is separate from being able to work one:
  // converting a call does not imply moving other people's queue around.
  const canReassign = hasAnyPermission([
    PERMISSIONS.IVR_CALL_REASSIGN,
    PERMISSIONS.IVR_AGENT_MANAGE,
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<any[]>([]);
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  // Call-back state filter: every call still owing one, and the two slices an
  // agent works from first.
  const [wipFilter, setWipFilter] = useState("");
  const [callType, setCallType] = useState("all");
  const [registered, setRegistered] = useState("all");
  const [mine, setMine] = useState(false);
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
        wip: wipFilter || undefined,
        callType,
        registered,
        assignedTo: mine ? "me" : undefined,
      });
      const items = r.items || [];
      setCanSeeAll((r as any)?.canSeeAllCalls !== false);
      rememberRows(items, options?.silent);
      setRows(items);
    } catch (e) {
      console.error(e);
      setRows([]);
    }
  }, [callType, projectId, registered, mine, wipFilter, rememberRows]);
  useEffect(() => {
    load();
  }, [load]);

  // Live list. A missed call has to reach the agent without anyone thinking to
  // refresh — the call is already ticking against its TAT by the time it
  // appears. Reload quietly and let the existing unread highlight mark what is
  // new, the same way the ticket list behaves.
  const socketRooms = useMemo(
    () => (projectId ? [`project-tickets-${projectId}`] : ["all-tickets"]),
    [projectId],
  );
  useSocket({
    rooms: socketRooms,
    events: {
      "ivr-call-update": () => {
        // Re-query rather than splicing the payload in: the row has to respect
        // the tab, caller and WIP filters currently applied, which only the
        // server knows how to evaluate.
        load({ silent: true });
      },
    },
  });

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
    // IVR agents only — the general user list would offer people who never
    // take calls, and a call parked on one of them is effectively lost.
    if (!canReassign) {
      setAgents([]);
      return;
    }
    serviceRequestApi.ivr
      .assignableAgents(projectId)
      .then((r: any) => setAgents(r?.data || []))
      .catch(() => setAgents([]));
  }, [projectId, canReassign]);

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

  /**
   * Open the guided PSR flow for a call. `preselectChannelFlow` skips the
   * "How would you classify this?" step when the agent has already told us the
   * classification — "Mark Junk" lands straight on Junk / Telemarketing.
   */
  const startIvrPsr = (call: Call, preselectChannelFlow?: string) => {
    navigate(`${serviceBasePath}?tab=new&sourceType=ivr&sourceId=${call._id}`, {
      state: {
        sourceContext: {
          type: "ivr",
          id: call._id,
          returnTo: `${serviceBasePath}?tab=ivr`,
          // Carry the call's project so the create flow can load that
          // project's SR config without relying on a project selection.
          projectId: call.projectId,
          callerName: call.callerName,
          callerMobile: call.callerMobile,
          subject: `IVR call from ${call.callerName || call.callerMobile}`,
          body: `Converted from IVR call ${call.externalId || call._id}. Caller: ${call.callerName || "Unknown"} (${call.callerMobile}).`,
          ...(preselectChannelFlow ? { preselectChannelFlow } : {}),
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

  // WIP / call-back log. Drafts are keyed by call id so one open editor never
  // writes into another row. The agent picks how soon to chase the caller
  // again (the call-frequency step); its TAT decides the due time, so there is
  // deliberately no date entry here.
  const [cbDraft, setCbDraft] = useState<Record<string, string>>({});
  // Re-render once a minute so the countdown stays honest without a reload.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  // The API decides whether this caller sees the whole project's calls; it
  // pins the list to their own either way, so this only controls what the
  // filter row offers.
  const [canSeeAll, setCanSeeAll] = useState(true);
  const [tiers, setTiers] = useState<
    { level: number; label: string; tatHours: number }[]
  >([]);
  const [savingCb, setSavingCb] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const r = await serviceRequestApi.ivr.callbackTat(projectId);
        setTiers(r?.data?.tiers || []);
      } catch (e) {
        console.error(e);
        setTiers([]);
      }
    })();
  }, [projectId]);

  /**
   * The step to offer next. The first is applied automatically when a missed
   * call lands, so the agent is normally choosing the SECOND attempt onward —
   * default to the step after the highest already logged rather than making
   * them re-pick from the top of the ladder.
   */
  const nextTierFor = (call: Call) => {
    const used = (call.followUps || [])
      .map((f) => Number(f.wipLevel))
      .filter((n) => Number.isFinite(n));
    const highest = used.length ? Math.max(...used) : 0;
    return (
      tiers.find((t) => t.level === highest + 1) ||
      tiers[tiers.length - 1] ||
      null
    );
  };

  /**
   * How far through its TAT the pending call-back is, and what that should
   * look like. Green while there is room, amber past halfway, red once 80% of
   * the step's TAT has gone — the same threshold the "Running out" filter uses,
   * so the colour and the filter never disagree.
   */
  const callbackState = (call: Call) => {
    if (!call.callbackAt) return null;
    const due = new Date(call.callbackAt).getTime();
    const pending = (call.followUps || [])
      .filter((f) => f.status === "pending")
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      )[0];
    // The clock may not have started: a call taken outside working hours is
    // owned immediately, but its TAT begins when the working day opens.
    const startsAt = pending?.tatStartsAt
      ? new Date(pending.tatStartsAt).getTime()
      : null;
    if (startsAt && startsAt > now) {
      return {
        label:
          "starts " +
          new Date(startsAt).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
        pct: 0,
        step: pending?.wipLabel,
        due: new Date(call.callbackAt).toLocaleString(),
        fg: "#475569",
        bg: "#f1f5f9",
        br: "#e2e8f0",
      };
    }

    const remainingMs = due - now;
    const overdue = remainingMs < 0;

    // Elapsed share of the TAT. Measured against the window the server
    // actually used (start -> due), so working-hours TATs read correctly
    // instead of being compared to plain elapsed hours.
    const windowMs = startsAt ? due - startsAt : Number(pending?.tatHours || 0) * 3600000;
    const pct = windowMs > 0 ? 1 - remainingMs / windowMs : overdue ? 1 : 0;

    // The server stamped when this turns red; trust it over recomputing.
    const urgentAt = pending?.urgentAt ? new Date(pending.urgentAt).getTime() : null;
    const isUrgent = urgentAt ? now >= urgentAt : pct >= 0.8;

    const level = overdue
      ? "overdue"
      : isUrgent
        ? "urgent"
        : pct >= 0.5
          ? "warn"
          : "ok";

    const colors = {
      ok: { fg: "#047857", bg: "#ecfdf5", br: "#a7f3d0" },
      warn: { fg: "#b45309", bg: "#fffbeb", br: "#fde68a" },
      urgent: { fg: "#b91c1c", bg: "#fef2f2", br: "#fecaca" },
      overdue: { fg: "#ffffff", bg: "#b91c1c", br: "#b91c1c" },
    }[level];

    const abs = Math.abs(remainingMs);
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    const clock = h > 0 ? h + "h " + m + "m" : m + "m";

    return {
      label: overdue ? "overdue by " + clock : clock + " left",
      pct: Math.max(0, Math.min(1, pct)),
      step: pending?.wipLabel,
      due: new Date(call.callbackAt).toLocaleString(),
      ...colors,
    };
  };

  const changeFollowUpStep = async (
    call: Call,
    followUpId: string,
    level: number,
  ) => {
    setSavingCb(call._id);
    try {
      await serviceRequestApi.ivr.updateFollowUp(call._id, followUpId, {
        wipLevel: level,
      });
      setMsg("Call-back step changed.");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Could not change the step.");
    } finally {
      setSavingCb(null);
    }
  };

  const addFollowUp = async (call: Call) => {
    // Nothing picked means "the step the ladder says comes next".
    const level = cbDraft[call._id] || String(nextTierFor(call)?.level || "");
    if (!level) {
      setMsg("No call-back steps are configured for this project.");
      return;
    }
    setSavingCb(call._id);
    try {
      await serviceRequestApi.ivr.addFollowUp(call._id, {
        wipLevel: Number(level),
      });
      setMsg("Follow-up added.");
      setCbDraft((prev) => {
        const next = { ...prev };
        delete next[call._id];
        return next;
      });
      setOpenLog(call._id);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Could not add the follow-up.");
    } finally {
      setSavingCb(null);
    }
  };

  const closeFollowUp = async (
    call: Call,
    followUpId: string,
    status: "done" | "cancelled",
    outcome?: "answered" | "no_answer",
  ) => {
    setSavingCb(call._id);
    try {
      await serviceRequestApi.ivr.updateFollowUp(call._id, followUpId, {
        status,
        outcome,
      });
      setMsg(status === "done" ? "Follow-up closed." : "Follow-up cancelled.");
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Could not update the follow-up.");
    } finally {
      setSavingCb(null);
    }
  };

  const [calling, setCalling] = useState<string | null>(null);
  const clickToCall = async (call: Call) => {
    if (!call.callerMobile) {
      setMsg("No caller number to dial.");
      return;
    }
    setCalling(call._id);
    try {
      const r = await serviceRequestApi.ivr.clickToCall(call._id);
      setMsg(
        r?.data?.message
          ? `Calling — ${r.data.message}. Your phone will ring first.`
          : "Call initiated. Your phone will ring first, then the caller.",
      );
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "Click-to-call failed.");
    } finally {
      setCalling(null);
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
          <span style={{ width: 1, background: "#e5e7eb", margin: "0 4px" }} />
          {[
            { v: "wip", l: "In WIP" },
            { v: "due_soon", l: "Running out" },
            { v: "overdue", l: "Overdue" },
          ].map((t) => (
            <button
              key={t.v}
              style={tab(wipFilter === t.v)}
              onClick={() => setWipFilter(wipFilter === t.v ? "" : t.v)}
              title={
                t.v === "wip"
                  ? "Calls with an outstanding call-back"
                  : t.v === "due_soon"
                    ? "Past 80% of the step's TAT — act now"
                    : "The call-back time has passed"
              }
            >
              {t.l}
            </button>
          ))}
          {canSeeAll && (
            <>
              <span style={{ width: 1, background: "#e5e7eb", margin: "0 4px" }} />
              <button style={tab(mine)} onClick={() => setMine((v) => !v)}>
                My calls
              </button>
            </>
          )}
          {!canSeeAll && (
            <span
              style={{
                fontSize: 12,
                color: "#64748b",
                alignSelf: "center",
                marginLeft: 4,
              }}
              title="You see the calls assigned to you. An IVR manager can widen this."
            >
              Showing your assigned calls
            </span>
          )}
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

        {/* The row is wide — recording player, call-back selector and the
            action buttons together exceed any laptop viewport. Scroll the
            table inside its own card rather than letting it push the page
            sideways: without this the rows run past the card's border and the
            whole layout shears once you scroll horizontally. */}
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", width: "100%" }}>
            <table
              style={{
                width: "100%",
                minWidth: 1500,
                borderCollapse: "collapse",
              }}
            >
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
                <th style={th}>Call Back (WIP)</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td style={{ ...td, color: "#9ca3af" }} colSpan={12}>
                    {/* Say why it is empty. A filter returning nothing looks
                        identical to a broken filter otherwise. */}
                    {wipFilter === "due_soon"
                      ? "No call-backs are past 80% of their TAT right now."
                      : wipFilter === "overdue"
                        ? "No call-backs are overdue."
                        : wipFilter === "wip"
                          ? "No calls have an outstanding call-back."
                          : "No calls."}
                  </td>
                </tr>
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
                      {/* Call-back (WIP) log + one-click dial. A caller is
                          often chased several times, so every commitment is
                          kept and the whole log travels onto the ticket when
                          the call is converted. */}
                      <td style={td} onClick={(event) => event.stopPropagation()}>
                        {c.callType === "missed" ? (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <select
                                value={cbDraft[c._id] ?? ""}
                                disabled={savingCb === c._id || !tiers.length}
                                onChange={(event) =>
                                  setCbDraft((prev) => ({ ...prev, [c._id]: event.target.value }))
                                }
                                title={
                                  tiers.length
                                    ? "How soon to call back — the TAT is set by this step"
                                    : "No call-back steps configured — ask an IVR manager"
                                }
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 8,
                                  padding: "5px 8px",
                                  fontSize: 12,
                                  color: "#111827",
                                  minWidth: 150,
                                }}
                              >
                                <option value="">
                                  {tiers.length
                                    ? nextTierFor(c)
                                      ? "Next: " +
                                        nextTierFor(c)!.label +
                                        " — " +
                                        nextTierFor(c)!.tatHours +
                                        "h"
                                      : "Call back in..."
                                    : "No steps configured"}
                                </option>
                                {tiers.map((t) => (
                                  <option key={t.level} value={t.level}>
                                    {t.label} — {t.tatHours}h
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => addFollowUp(c)}
                                disabled={savingCb === c._id || !tiers.length}
                                title="Add this follow-up to the log"
                                style={{
                                  ...srButton("neutral"),
                                  padding: "6px 10px",
                                  opacity: tiers.length ? 1 : 0.5,
                                  cursor: tiers.length ? "pointer" : "not-allowed",
                                }}
                              >
                                + Add
                              </button>
                              <button
                                onClick={() => clickToCall(c)}
                                disabled={calling === c._id || !c.callerMobile}
                                title={
                                  c.callerMobile
                                    ? "Call this number now — your phone rings first"
                                    : "No caller number captured"
                                }
                                style={{
                                  ...srButton("primary"),
                                  padding: "6px 10px",
                                  opacity: !c.callerMobile ? 0.5 : 1,
                                  cursor: !c.callerMobile ? "not-allowed" : "pointer",
                                }}
                              >
                                {calling === c._id ? "…" : "📞 Call"}
                              </button>
                            </div>

                            {(() => {
                              const cb = callbackState(c);
                              if (!cb) return null;
                              return (
                                <div
                                  style={{ marginTop: 6 }}
                                  title={
                                    (cb.step ? cb.step + " · " : "") +
                                    "due " +
                                    cb.due
                                  }
                                >
                                  <div
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 5,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: cb.fg,
                                      background: cb.bg,
                                      border: "1px solid " + cb.br,
                                    }}
                                  >
                                    {cb.step ? <span>{cb.step}</span> : null}
                                    <span>{cb.label}</span>
                                  </div>
                                  {/* How much of the TAT has been consumed. */}
                                  <div
                                    style={{
                                      height: 3,
                                      borderRadius: 999,
                                      background: "#e5e7eb",
                                      marginTop: 4,
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: Math.round(cb.pct * 100) + "%",
                                        background:
                                          cb.fg === "#ffffff" ? "#b91c1c" : cb.fg,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}

                            {c.followUps?.length ? (
                              <button
                                onClick={() =>
                                  setOpenLog(openLog === c._id ? null : c._id)
                                }
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: "2px 0",
                                  marginTop: 2,
                                  color: "#4338ca",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                {openLog === c._id ? "Hide" : "Show"} log (
                                {c.followUps.length})
                              </button>
                            ) : null}

                            {openLog === c._id && c.followUps?.length ? (
                              <div
                                style={{
                                  marginTop: 4,
                                  borderTop: "1px solid #eef2f7",
                                  paddingTop: 4,
                                  display: "grid",
                                  gap: 4,
                                }}
                              >
                                {[...c.followUps]
                                  .sort(
                                    (a, b) =>
                                      new Date(a.scheduledAt).getTime() -
                                      new Date(b.scheduledAt).getTime(),
                                  )
                                  .map((f) => (
                                    <div key={f._id} style={{ fontSize: 11, color: "#475569" }}>
                                      {f.wipLabel ? (
                                        <span
                                          style={{
                                            fontWeight: 700,
                                            color: "#4338ca",
                                            marginRight: 4,
                                          }}
                                          title={
                                            f.tatHours
                                              ? "TAT " + f.tatHours + "h when logged"
                                              : undefined
                                          }
                                        >
                                          {f.wipLabel}
                                        </span>
                                      ) : null}
                                      <span style={{ fontWeight: 600 }}>
                                        {new Date(f.scheduledAt).toLocaleString()}
                                      </span>{" "}
                                      <span
                                        style={{
                                          color:
                                            f.status === "done"
                                              ? "#047857"
                                              : f.status === "cancelled"
                                                ? "#6b7280"
                                                : "#b45309",
                                        }}
                                      >
                                        {f.status}
                                        {f.outcome ? ` · ${f.outcome.replace(/_/g, " ")}` : ""}
                                      </span>
                                      {f.status === "pending" ? (
                                        <>
                                          {" "}
                                          <button
                                            onClick={() =>
                                              closeFollowUp(c, f._id, "done", "answered")
                                            }
                                            disabled={savingCb === c._id}
                                            style={logAction("#047857")}
                                          >
                                            answered
                                          </button>
                                          <button
                                            onClick={() =>
                                              closeFollowUp(c, f._id, "done", "no_answer")
                                            }
                                            disabled={savingCb === c._id}
                                            style={logAction("#b45309")}
                                          >
                                            no answer
                                          </button>
                                          <button
                                            onClick={() => closeFollowUp(c, f._id, "cancelled")}
                                            disabled={savingCb === c._id}
                                            style={logAction("#6b7280")}
                                          >
                                            cancel
                                          </button>
                                          {/* The first step is applied
                                              automatically, so it has to be
                                              changeable if it was wrong. */}
                                          <select
                                            value={f.wipLevel ?? ""}
                                            disabled={savingCb === c._id}
                                            onChange={(event) =>
                                              changeFollowUpStep(
                                                c,
                                                f._id,
                                                Number(event.target.value),
                                              )
                                            }
                                            title="Change the call-back step"
                                            style={{
                                              marginLeft: 4,
                                              fontSize: 10,
                                              border: "1px solid #e5e7eb",
                                              borderRadius: 6,
                                              padding: "1px 4px",
                                            }}
                                          >
                                            <option value="">step...</option>
                                            {tiers.map((t) => (
                                              <option key={t.level} value={t.level}>
                                                {t.label} ({t.tatHours}h)
                                              </option>
                                            ))}
                                          </select>
                                        </>
                                      ) : null}
                                    </div>
                                  ))}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
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
                              // Route through the guided PSR flow on the
                              // Junk / Telemarketing channel, so the junk record
                              // is raised with a reason like any other channel.
                              startIvrPsr(c, "junk");
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
              <button
                onClick={() => clickToCall(selected)}
                disabled={calling === selected._id || !selected.callerMobile}
                style={srButton("primary")}
                title="Ring your phone, then dial the caller via TATA"
              >
                {calling === selected._id ? "Calling…" : "📞 Call back"}
              </button>
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
