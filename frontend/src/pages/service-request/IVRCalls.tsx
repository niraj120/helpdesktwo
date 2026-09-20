import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SrPage from "../../components/sr/SrPage";
import { srStyles, srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { api } from "../../utils/api";
import { serviceRequestApi, type SrFamilyParent } from "../../services/serviceRequests";
import { useSocket } from "../../hooks/useSocket";
import { PERMISSIONS } from "../../constants/permissions";
import { usePermissions } from "../../hooks/usePermissions";
import IvrCallDrawer from "./ivr/IvrCallDrawer";
import {
  Call,
  CALL_STATUS_META,
  Tier,
  callbackState,
  assignedAgentName,
  callerRequestedTime,
  fmtDateTime,
  isActionable,
  recordingCount,
  relTime,
} from "./ivr/ivrCallModel";
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconMic,
  IconNote,
  IconPhone,
  IconPhoneIncoming,
  IconPhoneMissed,
  IconPhoneOutgoing,
  IconTicket,
} from "./ivr/ivrIcons";
import "./ivr/ivrInbox.css";

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

const LIVE_REFRESH_INTERVAL_MS = 15000;
const PAGE_SIZE = 25;

/**
 * IVR inbox. One compact line per call — who, how long ago, how urgent, how
 * much has already happened — with a one-tap call button. Everything else
 * (recordings, notes, call-back plan, convert/resolve/junk) lives in the call
 * drawer, so the list stays scannable on a laptop without sideways scrolling.
 */
const IVRCalls: React.FC<{
  embedded?: boolean;
  hideProjectSelector?: boolean;
}> = ({ embedded, hideProjectSelector }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isProjectPortal = location.pathname.includes("/portal/");
  const portalBase = location.pathname.replace(/\/service-requests(?:\/.*)?$/, "");
  const detailPath = (id: string) =>
    isProjectPortal ? `${portalBase}/service-requests/${id}` : `/service-requests/${id}`;
  const serviceBasePath = isProjectPortal
    ? `${portalBase}/service-requests`
    : "/service-requests";

  const { hasAnyPermission } = usePermissions();
  const canConvert = hasAnyPermission([
    PERMISSIONS.IVR_TRIAGE_CONVERT,
    PERMISSIONS.SR_PSR_CREATE,
  ]);
  // Placing a call is gated on the server by the same pair as converting.
  const canCall = canConvert;
  // Notes and call-back steps — the server's gate for both.
  const canLog = hasAnyPermission([
    PERMISSIONS.IVR_CALLBACK_SET,
    PERMISSIONS.IVR_TRIAGE_CONVERT,
  ]);
  // Handing a call to someone else is separate from being able to work one:
  // converting a call does not imply moving other people's queue around.
  const canReassign = hasAnyPermission([
    PERMISSIONS.IVR_CALL_REASSIGN,
    PERMISSIONS.IVR_AGENT_MANAGE,
  ]);

  const { currentProjectId } = useProjectContext();
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(currentProjectId || "");

  // Filters
  const [callType, setCallType] = useState("all");
  const [registered, setRegistered] = useState("all");
  const [wipFilter, setWipFilter] = useState("");
  const [mine, setMine] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // The API decides whether this caller sees the whole project's calls; it
  // pins the list to their own either way, so this only controls what the
  // filter row offers.
  const [canSeeAll, setCanSeeAll] = useState(true);

  const knownRowIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRowsRef = useRef(false);
  const [unreadRowIds, setUnreadRowIds] = useState<Set<string>>(new Set());

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [agentsState, setAgentsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [calling, setCalling] = useState<string | null>(null);

  // The drawer keeps its own copy of the call it opened, so an action that
  // moves the call out of the current filter (converted, junked) does not
  // yank the drawer shut under the agent's hands.
  const [openCall, setOpenCall] = useState<Call | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const showToast = useCallback((type: "ok" | "err", text: string) => {
    setToast({ type, text });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.type === "err" ? 6000 : 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [showIngest, setShowIngest] = useState(false);
  const [ingestForm, setIngestForm] = useState({
    callerName: "",
    callerMobile: "",
    callType: "answered",
  });

  // Re-render once a minute so countdowns stay honest without a reload.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

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

  // Typing a number should not fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchDraft]);

  // Any filter change starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [projectId, callType, registered, wipFilter, mine, search]);

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

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const r = await serviceRequestApi.ivr.list({
          projectId: projectId || undefined,
          wip: wipFilter || undefined,
          callType,
          registered,
          assignedTo: mine ? "me" : undefined,
          search: search || undefined,
          page,
          limit: PAGE_SIZE,
        });
        const items: Call[] = r.items || [];
        setCanSeeAll((r as any)?.canSeeAllCalls !== false);
        setTotal(Number(r.total) || items.length);
        rememberRows(items, options?.silent);
        setRows(items);
      } catch (e) {
        console.error(e);
        if (!options?.silent) setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [callType, projectId, registered, mine, wipFilter, search, page, rememberRows],
  );
  useEffect(() => {
    load();
  }, [load]);

  /** Re-query the list and tell an open drawer to re-read its call. */
  const refreshAll = useCallback(() => {
    load({ silent: true });
    setRefreshKey((k) => k + 1);
  }, [load]);

  // Live list. A missed call has to reach the agent without anyone thinking to
  // refresh — it is already ticking against its TAT when it appears. A
  // call-back's recording also arrives this way, after the call ends.
  const socketRooms = useMemo(
    () => (projectId ? [`project-tickets-${projectId}`] : ["all-tickets"]),
    [projectId],
  );
  useSocket({
    rooms: socketRooms,
    events: {
      // Re-query rather than splicing the payload in: the row has to respect
      // the filters currently applied, which only the server evaluates.
      "ivr-call-update": () => refreshAll(),
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

  // Keep the drawer's copy in step with the freshest list row.
  useEffect(() => {
    if (!openCall) return;
    const fresh = rows.find((r) => r._id === openCall._id);
    if (fresh && fresh !== openCall) setOpenCall(fresh);
  }, [rows, openCall]);

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
      setTiers([]);
      return;
    }
    serviceRequestApi.ivr
      .callbackTat(projectId)
      .then((r: any) => setTiers(r?.data?.tiers || []))
      .catch(() => setTiers([]));
  }, [projectId]);

  // IVR agents only — the general user list would offer people who never
  // take calls, and a call parked on one of them is effectively lost.
  const loadAgents = useCallback(async () => {
    if (!projectId || !canReassign) {
      setAgents([]);
      setAgentsState("idle");
      return;
    }
    setAgentsState("loading");
    try {
      const r: any = await serviceRequestApi.ivr.assignableAgents(projectId);
      setAgents(r?.data || []);
      setAgentsState("ready");
    } catch (e) {
      console.error(e);
      setAgents([]);
      setAgentsState("error");
    }
  }, [projectId, canReassign]);

  // Re-read the roster every time the reassign bar opens, not just once on
  // page load: agents join, leave and go on leave during a shift, and a load
  // that failed once (a server restart, a network blip) must not leave the
  // dropdown silently empty for the rest of the session.
  const reassignBarOpen = canReassign && selectedIds.size > 0;
  useEffect(() => {
    if (reassignBarOpen) loadAgents();
  }, [reassignBarOpen, loadAgents]);

  const markRowRead = (id: string) =>
    setUnreadRowIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const openDrawer = (c: Call) => {
    markRowRead(c._id);
    setOpenCall(c);
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const doBulkReassign = async () => {
    if (!reassignUserId || selectedIds.size === 0) return;
    setReassigning(true);
    try {
      const r = await serviceRequestApi.ivr.bulkReassign(
        Array.from(selectedIds),
        reassignUserId,
      );
      showToast("ok", `Reassigned ${r.data?.reassigned ?? 0} call(s).`);
      setSelectedIds(new Set());
      setReassignUserId("");
      load();
    } catch (e: any) {
      showToast("err", e?.response?.data?.message || "Bulk reassign failed.");
    } finally {
      setReassigning(false);
    }
  };

  /**
   * Open the guided PSR flow for a call. `preselectChannelFlow` skips the
   * "How would you classify this?" step when the agent has already told us the
   * classification — "Mark junk" lands straight on Junk / Telemarketing.
   */
  const startIvrPsr = (
    call: Call,
    preselectChannelFlow?: string,
    family?: SrFamilyParent[],
    opts?: { resolveOnCall?: boolean },
  ) => {
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
          // A registered caller's family, already looked up by the drawer, so
          // the PSR form opens with the parent and children filled in.
          ...(family?.length ? { family } : {}),
          ...(opts?.resolveOnCall ? { resolveOnCall: true } : {}),
        },
      },
    });
  };

  /** One-tap call from the list; the drawer opens so the agent can log it. */
  const quickCall = async (call: Call) => {
    if (!call.callerMobile) return;
    setCalling(call._id);
    openDrawer(call);
    try {
      const r = await serviceRequestApi.ivr.clickToCall(call._id);
      showToast(
        "ok",
        r?.data?.message
          ? `Calling — ${r.data.message}. Your phone rings first.`
          : "Calling. Your phone rings first, then the caller.",
      );
      refreshAll();
    } catch (e: any) {
      showToast("err", e?.response?.data?.message || "Click-to-call failed.");
    } finally {
      setCalling(null);
    }
  };

  const ingest = async () => {
    if (!projectId || !ingestForm.callerMobile) {
      showToast("err", "Select a project and enter a caller mobile.");
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
      showToast("err", e?.response?.data?.message || "Ingest failed.");
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const emptyText =
    wipFilter === "due_soon"
      ? "No call-backs are past 80% of their TAT right now."
      : wipFilter === "overdue"
        ? "No call-backs are overdue. 🎉"
        : wipFilter === "wip"
          ? "No calls have an outstanding call-back."
          : search
            ? `No calls match “${search}”.`
            : "No calls yet.";

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const renderRow = (c: Call) => {
    const actionable = isActionable(c);
    const cb = actionable ? callbackState(c, now) : null;
    const asked = actionable ? callerRequestedTime(c) : undefined;
    const st = CALL_STATUS_META[c.callStatus] || CALL_STATUS_META.new;
    const attempts = (c.outboundCalls || []).length;
    const recs = recordingCount(c);
    const notes = (c.comments || []).length;
    const agent = assignedAgentName(c);
    const missed = c.callType === "missed";

    const agentCell = agent ? (
      <span className="ivr-agent" title={`Assigned to ${agent}`}>
        <span className="ivr-agent-av" aria-hidden>
          {initials(agent)}
        </span>
        <span className="ivr-ellipsis">{agent}</span>
      </span>
    ) : (
      <span
        className="ivr-agent none"
        title={
          c.assignmentStatus === "unassigned_no_agent"
            ? "No IVR agent was available when this call landed"
            : "Nobody owns this call yet"
        }
      >
        <IconAlert size={13} /> Unassigned
      </span>
    );

    const classes = [
      "ivr-lrow",
      unreadRowIds.has(c._id) ? "unread" : "",
      cb?.level === "overdue" ? "overdue" : "",
      selectedIds.has(c._id) ? "selected" : "",
      openCall?._id === c._id ? "active" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        key={c._id}
        className={classes}
        role="button"
        tabIndex={0}
        aria-label={`Open call from ${c.callerName || c.callerMobile}`}
        onClick={() => openDrawer(c)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDrawer(c);
          }
        }}
      >
        <span className="ivr-cell-check" onClick={(e) => e.stopPropagation()}>
          {canReassign ? (
            <input
              type="checkbox"
              checked={selectedIds.has(c._id)}
              onChange={() => toggleSelect(c._id)}
              aria-label="Select call"
            />
          ) : null}
        </span>

        <span
          className={`ivr-type ${missed ? "missed" : "answered"}`}
          title={missed ? "Missed call" : "Answered call"}
        >
          {missed ? <IconPhoneMissed size={16} /> : <IconPhoneIncoming size={16} />}
        </span>

        {/* Caller. For an unknown caller the number IS the identity, so it
            leads and "Unknown caller" steps back. */}
        <div className="ivr-cell">
          <div className="ivr-title">
            <span className={`ivr-ellipsis ${c.callerName ? "" : "mono"}`}>
              {c.callerName || c.callerMobile}
            </span>
            {c.registered ? (
              <span className="ivr-tag ok">Registered</span>
            ) : (
              <span className="ivr-tag">Unregistered</span>
            )}
          </div>
          <div className="ivr-sub ivr-ellipsis">
            {c.callerName ? c.callerMobile : "Unknown caller"}
            {c.schoolName ? ` · ${c.schoolName}` : ""}
          </div>
          <div className="ivr-narrow-only ivr-sub">{agentCell}</div>
        </div>

        <div className="ivr-cell ivr-col-hide">
          <div className="ivr-strong" title={new Date(c.receivedAt).toLocaleString()}>
            {relTime(c.receivedAt, now)}
          </div>
          <div className="ivr-sub">
            {missed ? "Missed" : "Answered"} · {fmtDateTime(c.receivedAt)}
          </div>
        </div>

        <div className="ivr-cell ivr-col-hide">{agentCell}</div>

        <div className="ivr-cell ivr-col-hide">
          {c.callStatus === "converted" ? (
            <span className="ivr-status ok">
              <IconTicket size={13} /> {c.convertedTicketNumber || "PSR raised"}
            </span>
          ) : c.callStatus === "junk" || c.resolvedOnCall ? (
            <span className="ivr-status" style={{ color: st.color, background: st.bg }}>
              {c.resolvedOnCall ? <IconCheck size={13} /> : null}
              {c.resolvedOnCall ? "Resolved on call" : "Junk"}
            </span>
          ) : cb ? (
            <div title={`${cb.step ? cb.step + " · " : ""}due ${cb.due}`}>
              <span className={`ivr-status lvl-${cb.level}`}>
                <IconClock size={13} />
                {cb.step ? <strong>{cb.step}</strong> : null}
                <span>{cb.label}</span>
              </span>
              {/* Progress through the TAT; pointless once it is overdue. */}
              {cb.level !== "overdue" && cb.level !== "waiting" && (
                <div className="ivr-meter">
                  <div
                    className={`lvl-${cb.level}`}
                    style={{ width: `${Math.round(cb.pct * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <span className="ivr-faint">No call-back due</span>
          )}
          {asked && (
            <div className="ivr-asked-line" title="Time the caller asked for">
              <IconCalendar size={12} /> Asked for {fmtDateTime(asked)}
            </div>
          )}
        </div>

        <div className="ivr-cell ivr-col-hide">
          <div className="ivr-counters">
            <span className={attempts ? "" : "zero"} title={`${attempts} call-back(s) placed`}>
              <IconPhoneOutgoing size={13} /> {attempts}
            </span>
            <span className={recs ? "" : "zero"} title={`${recs} recording(s)`}>
              <IconMic size={13} /> {recs}
            </span>
            <span className={notes ? "" : "zero"} title={`${notes} note(s)`}>
              <IconNote size={13} /> {notes}
            </span>
          </div>
        </div>

        <div className="ivr-cell-action" onClick={(e) => e.stopPropagation()}>
          {canCall && actionable ? (
            <button
              className="ivr-call-btn"
              onClick={() => quickCall(c)}
              disabled={calling === c._id || !c.callerMobile}
              title={
                c.callerMobile
                  ? `Call ${c.callerMobile} (your phone rings first)`
                  : "No number captured"
              }
              aria-label={`Call ${c.callerName || c.callerMobile}`}
            >
              {calling === c._id ? <span className="ivr-spin" /> : <IconPhone size={15} />}
            </button>
          ) : (
            <span className="ivr-open-hint" aria-hidden onClick={() => openDrawer(c)}>
              <IconChevronRight size={16} />
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <SrPage
      title="IVR Calls"
      subtitle="Every inbound call, call-back and recording in one place. Open a call to act on it."
      embedded={embedded}
      actions={
        <button onClick={() => setShowIngest(!showIngest)} style={srButton("neutral")}>
          + Test call
        </button>
      }
    >
      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="ivr-toolbar">
        <input
          className="ivr-search"
          type="search"
          placeholder="Search name, number, school…"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          aria-label="Search calls"
        />
        <div className="ivr-seg" role="radiogroup" aria-label="Call type">
          {[
            { v: "all", l: "All" },
            { v: "missed", l: "Missed" },
            { v: "answered", l: "Answered" },
          ].map((t) => (
            <button
              key={t.v}
              role="radio"
              aria-checked={callType === t.v}
              className={callType === t.v ? "on" : ""}
              onClick={() => setCallType(t.v)}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="ivr-seg" role="radiogroup" aria-label="Caller">
          {[
            { v: "all", l: "All callers" },
            { v: "true", l: "Registered" },
            { v: "false", l: "New" },
          ].map((t) => (
            <button
              key={t.v}
              role="radio"
              aria-checked={registered === t.v}
              className={registered === t.v ? "on" : ""}
              onClick={() => setRegistered(t.v)}
            >
              {t.l}
            </button>
          ))}
        </div>
        {[
          { v: "wip", l: "In WIP", cls: "", tip: "Calls with an outstanding call-back" },
          { v: "due_soon", l: "Running out", cls: "warn", tip: "Past 80% of the step's TAT — act now" },
          { v: "overdue", l: "Overdue", cls: "bad", tip: "The call-back time has passed" },
        ].map((t) => (
          <button
            key={t.v}
            className={`ivr-chip-btn ${t.cls} ${wipFilter === t.v ? "on" : ""}`}
            onClick={() => setWipFilter(wipFilter === t.v ? "" : t.v)}
            title={t.tip}
            aria-pressed={wipFilter === t.v}
          >
            {t.l}
          </button>
        ))}
        {canSeeAll ? (
          <button
            className={`ivr-chip-btn ${mine ? "on" : ""}`}
            onClick={() => setMine((v) => !v)}
            aria-pressed={mine}
          >
            My calls
          </button>
        ) : (
          <span
            className="ivr-muted"
            title="You see the calls assigned to you. An IVR manager can widen this."
          >
            Showing your assigned calls
          </span>
        )}
        {!hideProjectSelector && (
          <select
            style={{ ...srStyles.ctrl, marginLeft: "auto", minHeight: 36, padding: "6px 10px" }}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Project"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {showIngest && (
        <div style={srStyles.card}>
          <strong>Ingest test call</strong> (select a project first)
          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <input style={{ ...srStyles.ctrl, flex: 1 }} placeholder="Caller name" value={ingestForm.callerName} onChange={(e) => setIngestForm({ ...ingestForm, callerName: e.target.value })} />
            <input style={{ ...srStyles.ctrl, flex: 1 }} placeholder="Caller mobile (10 digits)" value={ingestForm.callerMobile} onChange={(e) => setIngestForm({ ...ingestForm, callerMobile: e.target.value })} />
            <select style={srStyles.ctrl} value={ingestForm.callType} onChange={(e) => setIngestForm({ ...ingestForm, callType: e.target.value })}>
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
            ...srStyles.card,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            padding: 12,
          }}
        >
          <strong style={{ fontSize: 13, color: "#3730a3" }}>{selectedIds.size} selected</strong>
          <select
            style={{ ...srStyles.ctrl, minWidth: 220 }}
            value={reassignUserId}
            onChange={(e) => setReassignUserId(e.target.value)}
            disabled={!projectId || agentsState !== "ready" || agents.length === 0}
            aria-label="Reassign to"
          >
            <option value="">
              {!projectId
                ? "Pick a project first"
                : agentsState === "loading"
                  ? "Loading IVR agents…"
                  : agentsState === "error"
                    ? "Couldn't load agents"
                    : agents.length === 0
                      ? "No IVR agents in this project"
                      : `Reassign to… (${agents.length} agents)`}
            </option>
            {agents.map((u) => (
              <option key={u._id} value={u._id}>
                {`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}
              </option>
            ))}
          </select>
          {agentsState === "error" && (
            <button className="ivr-chip-btn" onClick={loadAgents}>
              Retry
            </button>
          )}
          {agentsState === "ready" && agents.length === 0 && (
            <span className="ivr-muted">
              Mark users as IVR agents for this project in IVR Agents.
            </span>
          )}
          <button onClick={doBulkReassign} disabled={reassigning || !reassignUserId} style={srButton("primary")}>
            {reassigning ? "Reassigning…" : "Reassign"}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="ivr-ghost">
            Clear
          </button>
        </div>
      )}

      {/* ── List ────────────────────────────────────────────── */}
      {loading && rows.length === 0 ? (
        <div className="ivr-empty">Loading calls…</div>
      ) : rows.length === 0 ? (
        <div className="ivr-empty">{emptyText}</div>
      ) : (
        <div className="ivr-table">
          {/* Column headings: same grid as the rows, so each label sits
              over its column and folds away with it on narrow screens. */}
          <div className="ivr-head">
            <span className="ivr-cell-check">
              {canReassign ? (
                <input
                  type="checkbox"
                  aria-label="Select all calls on this page"
                  checked={rows.length > 0 && rows.every((r) => selectedIds.has(r._id))}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selectedIds.size > 0 && !rows.every((r) => selectedIds.has(r._id));
                  }}
                  onChange={(e) =>
                    setSelectedIds(
                      e.target.checked ? new Set(rows.map((r) => r._id)) : new Set(),
                    )
                  }
                />
              ) : null}
            </span>
            <span />
            <span>Caller</span>
            <span className="ivr-col-hide">Received</span>
            <span className="ivr-col-hide">Agent</span>
            <span className="ivr-col-hide">Call-back (WIP)</span>
            <span className="ivr-col-hide" title="Call-backs placed · recordings · notes">
              Activity
            </span>
            <span style={{ textAlign: "center" }}>Call</span>
          </div>
          {rows.map(renderRow)}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="ivr-pager">
          <span className="ivr-muted">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} calls
          </span>
          <div className="ivr-row">
            <button className="ivr-chip-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ‹ Prev
            </button>
            <span className="ivr-muted">
              Page {page} / {pages}
            </span>
            <button className="ivr-chip-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next ›
            </button>
          </div>
        </div>
      )}

      {openCall && (
        <IvrCallDrawer
          call={openCall}
          now={now}
          tiers={tiers}
          leaves={leaves}
          refreshKey={refreshKey}
          canConvert={canConvert}
          canCall={canCall}
          canLog={canLog}
          onClose={() => setOpenCall(null)}
          onChanged={() => load({ silent: true })}
          onToast={showToast}
          onStartPsr={startIvrPsr}
          onOpenTicket={(id) => navigate(detailPath(id))}
        />
      )}

      {toast && (
        <div className={`ivr-toast ${toast.type}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </SrPage>
  );
};

export default IVRCalls;
