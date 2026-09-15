/**
 * IVR inbox — shared types and pure helpers for the list and the call drawer.
 * Nothing here touches React state or the network.
 */

export interface FollowUp {
  _id: string;
  wipLevel?: number;
  wipLabel?: string;
  tatHours?: number;
  tatStartsAt?: string;
  urgentAt?: string;
  scheduledAt: string;
  note?: string;
  status: "pending" | "done" | "cancelled";
  outcome?: string;
  createdAt?: string;
  completedAt?: string;
}

/** One Click-to-Call attempt, with what the provider reported for it. */
export interface OutboundAttempt {
  customIdentifier: string;
  agentName?: string;
  agentNumber?: string;
  destinationNumber?: string;
  status: "initiated" | "answered" | "missed" | "failed";
  initiatedAt: string;
  completedAt?: string;
  message?: string;
  recordingUrl?: string;
  durationSeconds?: number;
}

export interface CallNote {
  _id: string;
  text: string;
  callbackRequestedAt?: string;
  createdByName?: string;
  createdAt: string;
}

export interface Call {
  _id: string;
  /** The call's own project — the create flow needs it when the user has not
   *  selected a project (e.g. a super admin who skipped project selection). */
  projectId?: string;
  externalId?: string;
  callToNumber?: string;
  didLabel?: string;
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
  status?: "open" | "closed";
  resolvedOnCall?: boolean;
  remark?: string;
  convertedTicketId?: string;
  convertedTicketNumber?: string;
  callbackAt?: string;
  followUps?: FollowUp[];
  outboundCalls?: OutboundAttempt[];
  comments?: CallNote[];
  lastOutboundStatus?: string;
  /** The owning agent — populated with their name by the list/detail API. */
  assignedTo?:
    | string
    | { _id: string; firstName?: string; lastName?: string; email?: string }
    | null;
  /** "unassigned_no_agent" when round-robin found nobody to give it to. */
  assignmentStatus?: string;
}

export interface Tier {
  level: number;
  label: string;
  tatHours: number;
}

export const REQUESTER_TYPES = [
  { v: "prospective_parent", l: "Prospective Parent" },
  { v: "existing_parent", l: "Existing Parent" },
  { v: "left_parent", l: "Left Parent" },
  { v: "vendor", l: "Vendor" },
  { v: "job", l: "Job-related" },
  { v: "junk", l: "Junk / Spam" },
  { v: "other", l: "Other" },
];

export const requesterLabel = (v?: string) =>
  v ? REQUESTER_TYPES.find((r) => r.v === v)?.l || v : undefined;

export const CALL_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  new: { label: "New", color: "#1d4ed8", bg: "#eef2ff" },
  assigned: { label: "Assigned", color: "#b45309", bg: "#fffbeb" },
  converted: { label: "Converted", color: "#047857", bg: "#ecfdf5" },
  junk: { label: "Junk", color: "#991b1b", bg: "#fee2e2" },
};

export const OUTBOUND_META: Record<
  OutboundAttempt["status"],
  { label: string; color: string; bg: string }
> = {
  initiated: { label: "Ringing…", color: "#1d4ed8", bg: "#eff6ff" },
  answered: { label: "Connected", color: "#047857", bg: "#ecfdf5" },
  missed: { label: "Not answered", color: "#b45309", bg: "#fffbeb" },
  failed: { label: "Failed", color: "#b91c1c", bg: "#fef2f2" },
};

/**
 * A click-to-call is "initiated" until TATA's post-call webhook says how it
 * went. A real call is over within minutes, so an attempt still waiting after
 * that never got its webhook — say so, instead of "Ringing…" forever.
 */
export const OUTBOUND_NO_UPDATE_AFTER_MS = 10 * 60 * 1000;

export const outboundMeta = (o: OutboundAttempt, now: number) => {
  if (
    o.status === "initiated" &&
    now - new Date(o.initiatedAt).getTime() > OUTBOUND_NO_UPDATE_AFTER_MS
  ) {
    return {
      label: "No update from TATA",
      color: "#64748b",
      bg: "#f1f5f9",
      title:
        "TATA never sent the post-call webhook for this call, so its outcome and recording are unknown.",
    };
  }
  return { ...(OUTBOUND_META[o.status] || OUTBOUND_META.initiated), title: undefined };
};

export const fmtDuration = (s?: number) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m}m ${sec}s` : `${sec}s`;
};

export const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** A span of time the way people say it: "45m", "3h 20m", "4d 21h". */
export const fmtSpan = (ms: number) => {
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
};

/** "just now", "12m ago", "3h ago", "2d ago". */
export const relTime = (iso: string | undefined, now: number) => {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 60000) return "just now";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/** The assigned agent's display name, or null when nobody owns the call. */
export const assignedAgentName = (c: Call): string | null => {
  const a = c.assignedTo;
  if (!a) return null;
  if (typeof a === "string") return "Assigned"; // unpopulated id — name unknown
  return [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email || "Assigned";
};

export const inboundRecording = (c: Call) => c.recordingUrl || c.voiceNoteUrl;

/** Every recording on the call: the inbound one plus one per call-back. */
export const recordingCount = (c: Call) =>
  (inboundRecording(c) ? 1 : 0) +
  (c.outboundCalls || []).filter((o) => o.recordingUrl).length;

/** Still owed work — not converted, junked or resolved on the call. */
export const isActionable = (c: Call) =>
  c.callStatus !== "converted" &&
  c.callStatus !== "junk" &&
  !c.resolvedOnCall;

/**
 * The time the caller most recently asked to be called back at, if any note
 * named one. The newest note wins — a caller who said "2 PM" and then "make it
 * 4" meant 4.
 */
export const callerRequestedTime = (c: Call): string | undefined => {
  const withTime = (c.comments || [])
    .filter((n) => n.callbackRequestedAt)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  return withTime[0]?.callbackRequestedAt;
};

const loggedAt = (f: FollowUp) =>
  new Date(f.createdAt || f.scheduledAt || 0).getTime();

/**
 * The live WIP step — the latest logged pending one (older data can still hold
 * several; the newest is the agent's current commitment).
 */
export const liveWip = (call: Call): FollowUp | undefined =>
  (call.followUps || [])
    .filter((f) => f.status === "pending")
    .sort((a, b) => loggedAt(b) - loggedAt(a))[0];

/**
 * The WIP level the call is on: the live step, else the last step that was
 * worked. Cancelled steps never count. Mirrors currentWipLevel on the server.
 */
export const currentWipLevel = (call: Call): number => {
  const done = (call.followUps || [])
    .filter((f) => f.status === "done")
    .sort((a, b) => loggedAt(b) - loggedAt(a))[0];
  const step = liveWip(call) || done;
  const n = Number(step?.wipLevel);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The step a "not connected" / "asked to call back" will apply: one up from
 * where the caller is. Past the last step, the last step repeats.
 */
export const nextTierFor = (call: Call, tiers: Tier[]) => {
  const level = currentWipLevel(call);
  return (
    tiers.find((t) => t.level === level + 1) || tiers[tiers.length - 1] || null
  );
};

export interface CallbackState {
  label: string;
  pct: number;
  step?: string;
  due: string;
  level: "waiting" | "ok" | "warn" | "urgent" | "overdue";
  fg: string;
  bg: string;
  br: string;
}

/**
 * How far through its TAT the pending call-back is, and what that should
 * look like. Green while there is room, amber past halfway, red once 80% of
 * the step's TAT has gone — the same threshold the "Running out" filter uses,
 * so the colour and the filter never disagree.
 */
export const callbackState = (call: Call, now: number): CallbackState | null => {
  // Read the same step everywhere — the live WIP — so the header, the list
  // pill and the outcome preview can never name different steps.
  const pending = liveWip(call);
  if (!pending) return null;
  const dueIso = pending.scheduledAt;
  const due = new Date(dueIso).getTime();

  // The clock may not have started: a call taken outside working hours is
  // owned immediately, but its TAT begins when the working day opens.
  const startsAt = pending?.tatStartsAt
    ? new Date(pending.tatStartsAt).getTime()
    : null;
  if (startsAt && startsAt > now) {
    return {
      label: "starts " + fmtDateTime(new Date(startsAt).toISOString()),
      pct: 0,
      step: pending?.wipLabel,
      due: fmtDateTime(dueIso),
      level: "waiting",
      fg: "#475569",
      bg: "#f1f5f9",
      br: "#e2e8f0",
    };
  }

  const remainingMs = due - now;
  const overdue = remainingMs < 0;

  // Elapsed share of the TAT, measured against the window the server actually
  // used (start → due), so working-hours TATs read correctly.
  const windowMs = startsAt
    ? due - startsAt
    : Number(pending?.tatHours || 0) * 3600000;
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

  const clock = fmtSpan(Math.abs(remainingMs));

  return {
    label: overdue ? `Overdue ${clock}` : `${clock} left`,
    pct: Math.max(0, Math.min(1, pct)),
    step: pending?.wipLabel,
    due: fmtDateTime(dueIso),
    level,
    ...colors,
  };
};

/** One entry in the call's activity timeline. */
export type TimelineEvent =
  | { kind: "inbound"; at: string; key: string }
  | { kind: "outbound"; at: string; key: string; attempt: OutboundAttempt; n: number }
  | { kind: "note"; at: string; key: string; note: CallNote }
  | { kind: "followup"; at: string; key: string; followUp: FollowUp }
  | { kind: "followup-closed"; at: string; key: string; followUp: FollowUp };

/**
 * The call's whole story, newest first: the inbound call, each call-back with
 * its own recording, every note, and every call-back commitment and how it
 * ended. This is what the agent reads before picking up the phone.
 */
export const buildTimeline = (c: Call): TimelineEvent[] => {
  const out: TimelineEvent[] = [
    { kind: "inbound", at: c.receivedAt, key: "inbound" },
  ];
  // Oldest attempt is "Call-back #1", matching how an agent counts them.
  [...(c.outboundCalls || [])]
    .sort(
      (a, b) =>
        new Date(a.initiatedAt).getTime() - new Date(b.initiatedAt).getTime(),
    )
    .forEach((attempt, i) =>
      out.push({
        kind: "outbound",
        at: attempt.initiatedAt,
        key: `out-${attempt.customIdentifier}`,
        attempt,
        n: i + 1,
      }),
    );
  for (const note of c.comments || [])
    out.push({ kind: "note", at: note.createdAt, key: `note-${note._id}`, note });
  for (const f of c.followUps || []) {
    out.push({
      kind: "followup",
      at: f.createdAt || f.scheduledAt,
      key: `fu-${f._id}`,
      followUp: f,
    });
    if (f.status !== "pending" && f.completedAt)
      out.push({
        kind: "followup-closed",
        at: f.completedAt,
        key: `fuc-${f._id}`,
        followUp: f,
      });
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
};
