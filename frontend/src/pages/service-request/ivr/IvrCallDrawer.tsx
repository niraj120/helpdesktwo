/**
 * IVR call drawer — everything an agent needs about ONE call, opened from the
 * inbox list so the list itself can stay a scannable one-line-per-call view.
 *
 * Top to bottom it follows the agent's own order of work: who is this and how
 * urgent is it → act (call, convert, resolve, junk) → write down what happened
 * → what is still owed → the full story (every call, every recording, every
 * note) → raw details.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { serviceRequestApi } from "../../../services/serviceRequests";
import { srButton, srStyles } from "../../../utils/srTheme";
import {
  Call,
  CallNote,
  outboundMeta,
  Tier,
  CALL_STATUS_META,
  assignedAgentName,
  buildTimeline,
  callbackState,
  callerRequestedTime,
  fmtDateTime,
  fmtDuration,
  inboundRecording,
  isActionable,
  liveWip,
  nextTierFor,
  recordingCount,
  relTime,
  requesterLabel,
  REQUESTER_TYPES,
} from "./ivrCallModel";

interface CategoryLeaf {
  _id: string;
  name: string;
  path?: string;
}

interface Props {
  call: Call;
  now: number;
  tiers: Tier[];
  leaves: CategoryLeaf[];
  /** Bumped by the list whenever the server says something changed. */
  refreshKey: number;
  canConvert: boolean;
  canCall: boolean;
  canLog: boolean;
  onClose: () => void;
  /** Something on the call changed — the list should re-query. */
  onChanged: () => void;
  onToast: (type: "ok" | "err", text: string) => void;
  /** Guided PSR flow; `flow` preselects a channel flow (e.g. "junk"). */
  onStartPsr: (call: Call, flow?: string) => void;
  onOpenTicket: (ticketId: string) => void;
}

/** How a call to the caller went — the server moves the WIP ladder on it. */
type Outcome = "" | "answered" | "not_connected" | "callback_requested";

const OUTCOMES: { v: Exclude<Outcome, "">; l: string; icon: string }[] = [
  { v: "answered", l: "Answered", icon: "✅" },
  { v: "not_connected", l: "Not connected", icon: "📵" },
  { v: "callback_requested", l: "Asked to call back", icon: "🕑" },
];
/** Labels for the outcome stored on a closed WIP step. */
const OUTCOME_LABEL: Record<string, string> = {
  answered: "Answered",
  no_answer: "Not connected",
  busy: "Busy / call cut",
  callback_requested: "Asked to call back",
  other: "Other",
};

/** Date → value for <input type="datetime-local"> in the viewer's own zone. */
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const quickTimes = (now: number) => {
  const inH = (h: number) => {
    const d = new Date(now + h * 3600000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d;
  };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const evening = new Date(now);
  evening.setHours(18, 0, 0, 0);
  const out = [
    { l: "In 1 hour", d: inH(1) },
    { l: "In 2 hours", d: inH(2) },
  ];
  // Only offer "this evening" while it is still ahead.
  if (evening.getTime() - now > 90 * 60000) out.push({ l: "6 PM today", d: evening });
  out.push({ l: "Tomorrow 10 AM", d: tomorrow });
  return out;
};

const errText = (e: any, fallback: string) =>
  e?.response?.data?.message || fallback;

const Pill: React.FC<{ color: string; bg: string; children: React.ReactNode; title?: string }> = ({
  color,
  bg,
  children,
  title,
}) => (
  <span className="ivr-pill" style={{ color, background: bg }} title={title}>
    {children}
  </span>
);

const Recording: React.FC<{ url: string; label: string }> = ({ url, label }) => (
  <div className="ivr-rec">
    <audio controls preload="none" src={url} aria-label={label} />
    <a href={url} target="_blank" rel="noreferrer" className="ivr-link" title="Open / download">
      ↗
    </a>
  </div>
);

const IvrCallDrawer: React.FC<Props> = ({
  call,
  now,
  tiers,
  leaves,
  refreshKey,
  canConvert,
  canCall,
  canLog,
  onClose,
  onChanged,
  onToast,
  onStartPsr,
  onOpenTicket,
}) => {
  const [detail, setDetail] = useState<Call>(call);
  const [tab, setTab] = useState<"activity" | "recordings" | "details">("activity");
  const [busy, setBusy] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Composer — "how did the call go".
  const [outcome, setOutcome] = useState<Outcome>("");
  const [noteText, setNoteText] = useState("");
  const [requestedAt, setRequestedAt] = useState("");

  // Quick convert / OCR panel.
  const [panel, setPanel] = useState<"" | "convert" | "ocr">("");
  const [categoryId, setCategoryId] = useState("");
  const [requesterType, setRequesterType] = useState("prospective_parent");
  const [remark, setRemark] = useState("");

  // A different call opened: start clean from the row we were given.
  useEffect(() => {
    setDetail(call);
    setTab("activity");
    setOutcome("");
    setNoteText("");
    setRequestedAt("");
    setPanel("");
    setRequesterType(
      call.requesterType || (call.registered ? "existing_parent" : "prospective_parent"),
    );
    panelRef.current?.focus();
    // Keyed on the id on purpose: the list re-renders the row object on every
    // refresh, and that must not wipe a half-written note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call._id]);

  // The list row is trimmed; the drawer reads the full record.
  const refetch = useCallback(async () => {
    try {
      const r = await serviceRequestApi.ivr.get(call._id);
      if (r?.data) setDetail(r.data);
    } catch (e) {
      console.error(e);
    }
  }, [call._id]);

  useEffect(() => {
    refetch();
  }, [refetch, refreshKey]);

  // Esc closes, like any dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const c = detail;
  const actionable = isActionable(c);
  const cb = callbackState(c, now);
  const asked = callerRequestedTime(c);
  const next = nextTierFor(c, tiers);
  const timeline = useMemo(() => buildTimeline(c), [c]);
  const pending = useMemo(
    () =>
      (c.followUps || [])
        .filter((f) => f.status === "pending")
        .sort(
          (a, b) =>
            new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
        ),
    [c.followUps],
  );
  const status = CALL_STATUS_META[c.callStatus] || CALL_STATUS_META.new;
  const recCount = recordingCount(c);
  // The live WIP — only ever one; the latest logged if older data has more.
  const live = liveWip(c);
  const liveName = live?.wipLabel || "the live WIP";
  // Already on the last step: the server keeps that step's timer running
  // instead of re-applying it (same test as the server: at or past the top).
  const repeats = !!(
    live &&
    tiers.length &&
    Number(live.wipLevel) >= tiers[tiers.length - 1].level
  );
  const needsTime = outcome === "callback_requested";
  // What the chosen outcome will do to the ladder, said before saving.
  const effect = !outcome
    ? null
    : outcome === "answered"
      ? live
        ? `Closes ${liveName}. No new WIP.`
        : "No WIP is applied."
      : next
        ? (repeats
            ? `Already on ${liveName}, the last step — its timer keeps running (due ${fmtDateTime(live!.scheduledAt)}). The outcome is saved as a comment.`
            : `${live ? `Closes ${liveName} → applies` : "Applies"} ${next.label} (${next.tatHours}h TAT).`) +
          (needsTime ? " The caller's time is saved as a detail." : "")
        : "No call-back steps are configured — the outcome is only logged.";

  /** Run one action, then re-read the call and tell the list. */
  const run = async (key: string, fn: () => Promise<any>, ok?: string, fail?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) onToast("ok", ok);
      await refetch();
      onChanged();
      return true;
    } catch (e: any) {
      onToast("err", errText(e, fail || "Something went wrong."));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const callNow = () =>
    run(
      "call",
      async () => {
        const r = await serviceRequestApi.ivr.clickToCall(c._id);
        onToast(
          "ok",
          r?.data?.message
            ? `Calling — ${r.data.message}. Your phone rings first.`
            : "Calling. Your phone rings first, then the caller.",
        );
      },
      undefined,
      "Click-to-call failed.",
    );

  const resetComposer = () => {
    setOutcome("");
    setNoteText("");
    setRequestedAt("");
  };

  const saveLog = async () => {
    const text = noteText.trim();

    // A comment on its own — no effect on the WIP.
    if (!outcome) {
      if (!text) {
        onToast("err", "Pick how the call went, or write a comment.");
        return;
      }
      const ok = await run(
        "log",
        () => serviceRequestApi.ivr.addComment(c._id, { text }),
        "Comment added.",
        "Could not save.",
      );
      if (ok) resetComposer();
      return;
    }

    if (needsTime && !requestedAt) {
      onToast("err", "Add the time the caller asked to be called at.");
      return;
    }

    // The server closes the live WIP and applies the next step — one request,
    // so the ladder can never be left half-moved.
    const res: {
      applied?: { label: string; tatHours: number } | null;
      kept?: { label: string; dueAt: string } | null;
    } = {};
    const ok = await run(
      "log",
      async () => {
        const r = await serviceRequestApi.ivr.logAttempt(c._id, {
          outcome,
          note: text || undefined,
          callbackRequestedAt: requestedAt
            ? new Date(requestedAt).toISOString()
            : undefined,
        });
        res.applied = r?.applied;
        res.kept = r?.kept;
      },
      undefined,
      "Could not save.",
    );
    if (ok) {
      onToast(
        "ok",
        res.applied
          ? `${res.applied.label} applied — ${res.applied.tatHours}h TAT.`
          : res.kept
            ? `Logged. ${res.kept.label} timer unchanged — due ${fmtDateTime(res.kept.dueAt)}.`
            : "Call logged.",
      );
      resetComposer();
    }
  };

  const quickConvert = () => {
    if (!categoryId) {
      onToast("err", "Select a sub-category.");
      return;
    }
    run(
      "convert",
      () => serviceRequestApi.ivr.convert(c._id, { categoryId, requesterType }),
      "PSR raised.",
      "Convert failed.",
    ).then((ok) => ok && setPanel(""));
  };

  const resolveOnCall = () =>
    run(
      "ocr",
      () => serviceRequestApi.ivr.resolveOnCall(c._id, { remark }),
      "Resolved on call (OCR).",
    ).then((ok) => ok && setPanel(""));

  const initials = (c.callerName || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const renderNote = (n: CallNote) => (
    <>
      <div className="ivr-ev-title">
        📝 Note <span className="ivr-muted">by {n.createdByName || "agent"}</span>
      </div>
      <div className="ivr-note">{n.text}</div>
      {n.callbackRequestedAt && (
        <Pill color="#6d28d9" bg="#f5f3ff">
          📅 Caller asked: {fmtDateTime(n.callbackRequestedAt)}
        </Pill>
      )}
    </>
  );

  return (
    <div className="ivr-drawer-root" role="presentation">
      <div className="ivr-backdrop" onClick={onClose} />
      <aside
        className="ivr-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Call from ${c.callerName || c.callerMobile}`}
        ref={panelRef}
        tabIndex={-1}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="ivr-dh">
          <div className={`ivr-avatar ${c.callType === "missed" ? "missed" : "answered"}`}>
            {c.callerName ? initials : "📞"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ivr-dh-name">{c.callerName || "Unknown caller"}</div>
            <div className="ivr-dh-sub">
              <a href={`tel:${c.callerMobile}`} className="ivr-link">
                {c.callerMobile}
              </a>
              <button
                className="ivr-icon-btn"
                title="Copy number"
                aria-label="Copy number"
                onClick={() => {
                  navigator.clipboard?.writeText(c.callerMobile);
                  onToast("ok", "Number copied.");
                }}
              >
                ⧉
              </button>
              {c.schoolName ? <span>· {c.schoolName}</span> : null}
            </div>
            <div className="ivr-chips">
              {c.callType === "missed" ? (
                <Pill color="#b91c1c" bg="#fef2f2">Missed</Pill>
              ) : (
                <Pill color="#047857" bg="#ecfdf5">Answered</Pill>
              )}
              {c.registered ? (
                <Pill color="#047857" bg="#ecfdf5">
                  Registered{c.studentCount ? ` · ${c.studentCount} student(s)` : ""}
                </Pill>
              ) : (
                <Pill color="#b45309" bg="#fffbeb">Unregistered</Pill>
              )}
              <Pill color={status.color} bg={status.bg}>{status.label}</Pill>
              {c.resolvedOnCall && <Pill color="#047857" bg="#ecfdf5">Resolved on call</Pill>}
              {assignedAgentName(c) ? (
                <Pill color="#3730a3" bg="#eef2ff" title="Assigned agent">
                  👤 {assignedAgentName(c)}
                </Pill>
              ) : (
                <Pill color="#b45309" bg="#fffbeb">⚠ Unassigned</Pill>
              )}
              <span className="ivr-muted" title={new Date(c.receivedAt).toLocaleString()}>
                {relTime(c.receivedAt, now)}
              </span>
            </div>
          </div>
          <button className="ivr-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="ivr-dbody">
          {/* ── Urgency ─────────────────────────────────────────── */}
          {(cb || asked) && actionable && (
            <section className="ivr-urgency" style={cb ? { borderColor: cb.br } : undefined}>
              {cb && (
                <div style={{ flex: 1 }}>
                  <div className="ivr-urg-top">
                    <span style={{ fontWeight: 700 }}>
                      {cb.step ? `${cb.step} call-back` : "Call-back"}
                    </span>
                    <Pill color={cb.fg} bg={cb.bg} title={`Due ${cb.due}`}>
                      {cb.label}
                    </Pill>
                  </div>
                  <div className="ivr-bar">
                    <div
                      style={{
                        width: `${Math.round(cb.pct * 100)}%`,
                        background: cb.level === "overdue" ? "#b91c1c" : cb.fg,
                      }}
                    />
                  </div>
                  {/* No manual step picker: the WIP moves only with the call
                      outcome logged below, so the ladder stays the policy. */}
                  <div className="ivr-muted" style={{ marginTop: 6 }}>
                    Due {cb.due}
                  </div>
                  {pending.length > 1 && (
                    <div className="ivr-muted" style={{ marginTop: 4 }}>
                      {pending.length - 1} older WIP step(s) still open from before —
                      they close with the next outcome you log.
                    </div>
                  )}
                </div>
              )}
              {asked && (
                <div className="ivr-asked" title="The time the caller asked for, from the notes">
                  <div className="ivr-muted">Caller asked for</div>
                  <div style={{ fontWeight: 700 }}>{fmtDateTime(asked)}</div>
                </div>
              )}
            </section>
          )}

          {/* ── Actions ─────────────────────────────────────────── */}
          <section className="ivr-actions">
            {canCall && (
              <button
                onClick={callNow}
                disabled={busy === "call" || !c.callerMobile}
                style={{ ...srButton("primary"), padding: "9px 16px" }}
                title="Your phone rings first, then the caller"
              >
                {busy === "call" ? "Calling…" : "📞 Call now"}
              </button>
            )}
            {c.callStatus === "converted" && c.convertedTicketId ? (
              <button
                onClick={() => onOpenTicket(c.convertedTicketId!)}
                style={{ ...srButton("neutral"), padding: "9px 14px", color: "#047857" }}
              >
                🎫 {c.convertedTicketNumber || "View PSR"}
              </button>
            ) : null}
            {canConvert && actionable && (
              <button
                onClick={() => onStartPsr(c)}
                style={{ ...srButton("success"), padding: "9px 14px" }}
              >
                Convert to PSR
              </button>
            )}
            {canConvert && (
              <details className="ivr-more">
                <summary style={{ ...srButton("neutral"), padding: "9px 12px" }} aria-label="More actions">
                  More ▾
                </summary>
                <div className="ivr-menu">
                  {c.callStatus === "converted" && (
                    <button onClick={() => setPanel("convert")}>➕ Raise another PSR</button>
                  )}
                  {actionable && (
                    <button onClick={() => setPanel("convert")}>⚡ Quick PSR (pick category)</button>
                  )}
                  {actionable && (
                    <button onClick={() => setPanel("ocr")}>✔ Resolve on call (OCR)</button>
                  )}
                  {actionable && (
                    <button className="danger" onClick={() => onStartPsr(c, "junk")}>
                      🚫 Mark junk
                    </button>
                  )}
                </div>
              </details>
            )}
          </section>

          {panel === "convert" && (
            <section className="ivr-card">
              <div className="ivr-card-h">Raise a PSR from this call</div>
              <div className="ivr-row">
                {!c.registered && (
                  <select
                    style={srStyles.ctrl}
                    value={requesterType}
                    onChange={(e) => setRequesterType(e.target.value)}
                    aria-label="Requester type"
                  >
                    {REQUESTER_TYPES.map((r) => (
                      <option key={r.v} value={r.v}>
                        {r.l}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  style={{ ...srStyles.ctrl, flex: 1, minWidth: 200 }}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  aria-label="Sub-category"
                >
                  <option value="">Select sub-category…</option>
                  {leaves.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.path || l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ivr-row" style={{ justifyContent: "flex-end" }}>
                <button className="ivr-ghost" onClick={() => setPanel("")}>Cancel</button>
                <button
                  onClick={quickConvert}
                  disabled={busy === "convert"}
                  style={{ ...srButton("primary"), padding: "8px 14px" }}
                >
                  {busy === "convert" ? "Raising…" : "Raise PSR"}
                </button>
              </div>
            </section>
          )}

          {panel === "ocr" && (
            <section className="ivr-card">
              <div className="ivr-card-h">Resolved during the call — no PSR</div>
              <textarea
                className="ivr-textarea"
                placeholder="What was resolved? (optional)"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={2}
              />
              <div className="ivr-row" style={{ justifyContent: "flex-end" }}>
                <button className="ivr-ghost" onClick={() => setPanel("")}>Cancel</button>
                <button
                  onClick={resolveOnCall}
                  disabled={busy === "ocr"}
                  style={{ ...srButton("primary"), padding: "8px 14px" }}
                >
                  Mark resolved
                </button>
              </div>
            </section>
          )}

          {/* ── How did the call go ─────────────────────────────── */}
          {canLog && (
            <section className="ivr-card">
              <div className="ivr-card-h">
                {actionable ? "How did the call go?" : "Add a comment"}
              </div>
              {actionable && (
                <div className="ivr-seg ivr-seg-3" role="radiogroup" aria-label="Call outcome">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.v}
                      role="radio"
                      aria-checked={outcome === o.v}
                      className={outcome === o.v ? "on" : ""}
                      onClick={() => {
                        setOutcome(outcome === o.v ? "" : o.v);
                        if (o.v !== "callback_requested") setRequestedAt("");
                      }}
                    >
                      <span aria-hidden>{o.icon}</span> {o.l}
                    </button>
                  ))}
                </div>
              )}
              {effect && <div className="ivr-effect">{effect}</div>}

              {needsTime && (
                <div className="ivr-when">
                  <span className="ivr-muted">When did the caller ask to be called?</span>
                  <div className="ivr-row" style={{ gap: 6 }}>
                    {quickTimes(now).map((q) => {
                      const v = toLocalInput(q.d);
                      return (
                        <button
                          key={q.l}
                          className={`ivr-chip-btn ${requestedAt === v ? "on" : ""}`}
                          onClick={() => setRequestedAt(requestedAt === v ? "" : v)}
                        >
                          {q.l}
                        </button>
                      );
                    })}
                    <input
                      type="datetime-local"
                      value={requestedAt}
                      min={toLocalInput(new Date(now))}
                      onChange={(e) => setRequestedAt(e.target.value)}
                      className="ivr-dt"
                      aria-label="Time the caller asked for"
                    />
                  </div>
                </div>
              )}

              <textarea
                className="ivr-textarea"
                placeholder={
                  outcome
                    ? "Comment (optional) — e.g. father at work, call after 2 PM"
                    : "Add a comment about this call…"
                }
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                maxLength={2000}
              />
              <div className="ivr-row" style={{ justifyContent: "flex-end" }}>
                {(outcome || noteText) && (
                  <button className="ivr-ghost" onClick={resetComposer}>
                    Clear
                  </button>
                )}
                <button
                  onClick={saveLog}
                  disabled={busy === "log" || (!outcome && !noteText.trim())}
                  style={{ ...srButton("primary"), padding: "8px 16px" }}
                >
                  {busy === "log" ? "Saving…" : outcome ? "Save outcome" : "Add comment"}
                </button>
              </div>
            </section>
          )}

          {/* ── History ─────────────────────────────────────────── */}
          <nav className="ivr-tabs" role="tablist">
            {(
              [
                ["activity", `Activity (${timeline.length})`],
                ["recordings", `Recordings (${recCount})`],
                ["details", "Details"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? "on" : ""}
                onClick={() => setTab(k)}
              >
                {l}
              </button>
            ))}
          </nav>

          {tab === "activity" && (
            <ol className="ivr-timeline">
              {timeline.map((ev) => (
                <li key={ev.key} className={`ivr-ev ${ev.kind}`}>
                  <span className="ivr-dot" aria-hidden />
                  <div className="ivr-ev-body">
                    <div className="ivr-ev-time" title={new Date(ev.at).toLocaleString()}>
                      {fmtDateTime(ev.at)}
                    </div>
                    {ev.kind === "inbound" && (
                      <>
                        <div className="ivr-ev-title">
                          {c.callType === "missed" ? "📵 Missed inbound call" : "📥 Inbound call answered"}
                          {c.callType !== "missed" && (
                            <span className="ivr-muted">
                              {" "}
                              by {c.answeredAgentName || c.answeredAgentNumber || "agent"} ·{" "}
                              {fmtDuration(c.durationSeconds)}
                            </span>
                          )}
                        </div>
                        <div className="ivr-muted">
                          {c.didLabel || c.callToNumber || "DID not captured"}
                          {c.digitsDialed?.length ? ` · pressed ${c.digitsDialed.join(", ")}` : ""}
                        </div>
                        {inboundRecording(c) ? (
                          <Recording url={inboundRecording(c)!} label="Inbound call recording" />
                        ) : c.callType !== "missed" ? (
                          <div className="ivr-muted">No recording received.</div>
                        ) : null}
                      </>
                    )}
                    {ev.kind === "outbound" && (() => {
                      const m = outboundMeta(ev.attempt, now);
                      return (
                        <>
                          <div className="ivr-ev-title">
                            📤 Call-back #{ev.n}{" "}
                            <span className="ivr-muted">
                              by {ev.attempt.agentName || ev.attempt.agentNumber || "agent"}
                            </span>{" "}
                            <Pill color={m.color} bg={m.bg} title={m.title}>{m.label}</Pill>
                            {ev.attempt.durationSeconds ? (
                              <span className="ivr-muted"> · {fmtDuration(ev.attempt.durationSeconds)}</span>
                            ) : null}
                          </div>
                          {ev.attempt.recordingUrl ? (
                            <Recording
                              url={ev.attempt.recordingUrl}
                              label={`Call-back ${ev.n} recording`}
                            />
                          ) : ev.attempt.status === "answered" ? (
                            <div className="ivr-muted">Recording not received yet.</div>
                          ) : ev.attempt.status === "failed" && ev.attempt.message ? (
                            <div className="ivr-muted">{ev.attempt.message}</div>
                          ) : null}
                        </>
                      );
                    })()}
                    {ev.kind === "note" && renderNote(ev.note)}
                    {ev.kind === "followup" && (
                      <div className="ivr-ev-title">
                        ⏱ {ev.followUp.wipLabel || "Call-back"} scheduled
                        <span className="ivr-muted"> · due {fmtDateTime(ev.followUp.scheduledAt)}</span>
                        {ev.followUp.note ? <div className="ivr-muted">{ev.followUp.note}</div> : null}
                      </div>
                    )}
                    {ev.kind === "followup-closed" && (
                      <div className="ivr-ev-title">
                        {ev.followUp.status === "done" ? "✔" : "✕"}{" "}
                        {ev.followUp.wipLabel || "Call-back"}{" "}
                        {ev.followUp.status === "done" ? "done" : "cancelled"}
                        {ev.followUp.outcome ? (
                          <span className="ivr-muted"> · {OUTCOME_LABEL[ev.followUp.outcome] || ev.followUp.outcome}</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {tab === "recordings" && (
            <div className="ivr-recs">
              {recCount === 0 && <div className="ivr-muted">No recordings on this call yet.</div>}
              {inboundRecording(c) && (
                <div className="ivr-rec-card">
                  <div className="ivr-ev-title">
                    📥 Inbound · {fmtDateTime(c.receivedAt)}
                    <span className="ivr-muted"> · {fmtDuration(c.durationSeconds)}</span>
                  </div>
                  <Recording url={inboundRecording(c)!} label="Inbound call recording" />
                </div>
              )}
              {timeline
                .filter((e) => e.kind === "outbound")
                .reverse()
                .map((e) =>
                  e.kind === "outbound" && e.attempt.recordingUrl ? (
                    <div key={e.key} className="ivr-rec-card">
                      <div className="ivr-ev-title">
                        📤 Call-back #{e.n} · {fmtDateTime(e.attempt.initiatedAt)}
                        <span className="ivr-muted">
                          {" "}
                          · {e.attempt.agentName || "agent"} · {fmtDuration(e.attempt.durationSeconds)}
                        </span>
                      </div>
                      <Recording url={e.attempt.recordingUrl} label={`Call-back ${e.n} recording`} />
                    </div>
                  ) : null,
                )}
            </div>
          )}

          {tab === "details" && (
            <dl className="ivr-dl">
              {(
                [
                  ["Caller type", requesterLabel(c.requesterType)],
                  ["School", c.schoolName],
                  ["DID", c.didLabel || c.callToNumber],
                  ["IVR digits", c.digitsDialed?.join(", ")],
                  ["Assigned to", assignedAgentName(c) || "Unassigned"],
                  ["Answered by", c.answeredAgentName || c.answeredAgentNumber],
                  ["Duration", c.callType === "missed" ? "—" : fmtDuration(c.durationSeconds)],
                  ["Provider status", c.providerCallStatus],
                  ["Provider", c.provider],
                  ["Call ID", c.externalId],
                  ["Received", new Date(c.receivedAt).toLocaleString()],
                  ["OCR remark", c.remark],
                ] as [string, string | undefined][]
              ).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "—"}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
        </div>
      </aside>
    </div>
  );
};

export default IvrCallDrawer;
