import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { serviceRequestApi, SR_STATUS_META } from "../../services/serviceRequests";
import { usePermissions } from "../../hooks/usePermissions";
import { PERMISSIONS } from "../../constants/permissions";
import { SR, srButton } from "../../utils/srTheme";
import MessageBanner, { SrMessage } from "./MessageBanner";

/**
 * SR lifecycle actions, embeddable in the standard ticket detail page so a PSR/
 * ISR opened from the normal queue is fully actionable (Phase audit — Step E).
 * Renders only the SR-specific actions; the host page already shows the ticket
 * info, description and comments.
 */
const NEXT_STATUSES: Record<number, number[]> = {
  1: [2, 4], // Open → WIP, Resolved
  2: [2, 4], // WIP → WIP (revise), Resolved
  6: [7], // Re-open → Re-Opened WIP
  7: [],
  4: [],
  5: [],
};

const userName = (u: any) =>
  !u
    ? "—"
    : u.fullName ||
      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
      u.email ||
      u._id;

interface Props {
  ticket: any;
  onChanged: () => void;
}

const StatusPill: React.FC<{ status: number }> = ({ status }) => {
  const m = SR_STATUS_META[status] || {
    label: String(status),
    color: SR.text,
    bg: "#f3f4f6",
  };
  return (
    <span
      style={{
        padding: "1px 9px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        color: m.color,
        background: m.bg,
      }}
    >
      {m.label}
    </span>
  );
};

/** Linked-ISR manager shown on a PSR: progress, list, create + link existing. */
const LinkedIsrManager: React.FC<{ psrId: string; projectId?: string }> = ({
  psrId,
  projectId,
}) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(PERMISSIONS.SR_ISR_CREATE);
  const canLink =
    canCreate || hasPermission(PERMISSIONS.SR_REASSIGN);

  const [data, setData] = useState<{
    items: any[];
    total: number;
    done: number;
  }>({ items: [], total: 0, done: 0 });
  const [loading, setLoading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<SrMessage | null>(null);
  const deb = useRef<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await serviceRequestApi.linkedIsrs(psrId);
      setData({ items: r.items || [], total: r.total || 0, done: r.done || 0 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (psrId) load();
  }, [psrId]); // eslint-disable-line

  const searchIsr = (val: string) => {
    setQ(val);
    if (deb.current) clearTimeout(deb.current);
    if (val.trim().length < 2) {
      setResults([]);
      return;
    }
    deb.current = setTimeout(async () => {
      try {
        const r = await serviceRequestApi.list({
          interactionType: "ISR",
          search: val.trim(),
          projectId,
          limit: 8,
        });
        setResults(
          (r.items || []).filter(
            (i: any) => String(i.linkedPsrId || "") !== psrId,
          ),
        );
      } catch (e) {
        console.error(e);
      }
    }, 350);
  };

  const link = async (isrId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await serviceRequestApi.linkPsr(isrId, psrId);
      setMsg({ type: "ok", text: "ISR linked." });
      setShowLink(false);
      setQ("");
      setResults([]);
      load();
    } catch (e: any) {
      setMsg({
        type: "err",
        text: e?.response?.data?.message || "Link failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  const createLinked = () =>
    navigate("/service-requests/create", {
      state: { linkedPsrId: psrId, interactionType: "ISR" },
    });

  const pending = Math.max(0, data.total - data.done);
  const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
  const barColor =
    data.total === 0 ? "#e5e7eb" : pending === 0 ? "#10b981" : "#f59e0b";

  return (
    <div
      style={{
        background: SR.bg,
        border: `1px solid ${SR.border}`,
        borderRadius: 14,
        boxShadow: SR.cardShadow,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <strong style={{ color: SR.text }}>
          Linked ISRs{" "}
          <span style={{ color: SR.sub, fontWeight: 500 }}>
            ({data.done}/{data.total})
          </span>
        </strong>
        <div style={{ display: "flex", gap: 8 }}>
          {canCreate && (
            <button style={srButton("primary")} onClick={createLinked}>
              + Create linked ISR
            </button>
          )}
          {canLink && (
            <button
              style={srButton("neutral")}
              onClick={() => setShowLink((s) => !s)}
            >
              Link existing
            </button>
          )}
        </div>
      </div>

      <MessageBanner message={msg} />

      {data.total > 0 && (
        <div
          style={{
            height: 6,
            borderRadius: 9999,
            background: "#eef1f6",
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 9999,
              background: barColor,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}

      {showLink && (
        <div style={{ marginBottom: 12 }}>
          <input
            placeholder="Search ISR by number or subject…"
            value={q}
            onChange={(e) => searchIsr(e.target.value)}
            style={{
              width: "100%",
              minHeight: 38,
              padding: "8px 12px",
              border: `1px solid ${SR.inputBorder}`,
              borderRadius: 10,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
          {results.length > 0 && (
            <div
              style={{
                border: `1px solid ${SR.border}`,
                borderRadius: 10,
                marginTop: 6,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {results.map((isr) => (
                <div
                  key={isr._id}
                  onClick={() => !busy && link(isr._id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <span>
                    <strong style={{ color: "#2563EB" }}>
                      {isr.ticketNumber}
                    </strong>{" "}
                    <span style={{ color: SR.sub }}>{isr.subject}</span>
                  </span>
                  <StatusPill status={isr.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: SR.sub, fontSize: 13 }}>Loading…</p>
      ) : data.items.length === 0 ? (
        <p style={{ color: SR.sub, fontSize: 13 }}>
          No ISRs linked yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.items.map((isr) => (
            <div
              key={isr._id}
              onClick={() => navigate(`/tickets/${isr._id}`)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 12px",
                border: `1px solid ${SR.border}`,
                borderRadius: 10,
                cursor: "pointer",
                background: "#fff",
              }}
            >
              <span style={{ fontSize: 13, minWidth: 0 }}>
                <strong style={{ color: "#2563EB" }}>{isr.ticketNumber}</strong>{" "}
                <span
                  style={{
                    color: SR.sub,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {isr.subject}
                </span>
              </span>
              <span
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ fontSize: 12, color: SR.sub }}>
                  {userName(isr.assignedTo)}
                </span>
                <StatusPill status={isr.status} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SrLifecyclePanel: React.FC<Props> = ({ ticket, onChanged }) => {
  const id: string = ticket?._id;
  const status: number = ticket?.status;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<SrMessage | null>(null);
  const [toStatus, setToStatus] = useState<number | "">("");
  const [committedDate, setCommittedDate] = useState("");
  const [comment, setComment] = useState("");
  const [displayToParent, setDisplayToParent] = useState(false);

  const [action, setAction] = useState<
    "" | "reassign" | "delegate" | "reopen" | "pslCall"
  >("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [remark, setRemark] = useState("");
  const [pslSatisfied, setPslSatisfied] = useState("yes");
  const debounce = useRef<any>(null);

  const reset = () => {
    setToStatus("");
    setCommittedDate("");
    setComment("");
    setDisplayToParent(false);
    setAction("");
    setTargetUser(null);
    setUserQuery("");
    setRemark("");
  };

  const wrap = async (fn: () => Promise<any>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ type: "ok", text: okText });
      reset();
      onChanged();
    } catch (e: any) {
      setMsg({ type: "err", text: e?.response?.data?.message || "Action failed." });
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = () => {
    if (toStatus === "") return;
    if ((toStatus === 2 || toStatus === 7) && !committedDate) {
      setMsg({ type: "err", text: "A committed closure date is required for WIP." });
      return;
    }
    wrap(
      () =>
        serviceRequestApi.changeStatus(id, {
          toStatus,
          committedDate: committedDate || undefined,
          comments: comment || undefined,
          displayToParent,
        }),
      "Status updated.",
    );
  };

  const onUserQuery = (q: string) => {
    setUserQuery(q);
    setTargetUser(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setUserResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const r = await serviceRequestApi.studentLookup(q.trim());
        setUserResults(r.data || []);
      } catch (e) {
        console.error(e);
      }
    }, 350);
  };

  const ctrl: React.CSSProperties = {
    minHeight: 38,
    padding: "8px 12px",
    border: `1px solid ${SR.inputBorder}`,
    borderRadius: 10,
    fontSize: 14,
    boxSizing: "border-box",
  };
  const label: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    display: "block",
    margin: "10px 0 6px",
  };

  const meta = SR_STATUS_META[status] || { label: status, color: SR.text, bg: "#f3f4f6" };
  const nexts = NEXT_STATUSES[status] || [];

  return (
    <>
    <div
      style={{
        background: SR.bg,
        border: `1px solid ${SR.border}`,
        borderRadius: 14,
        boxShadow: SR.cardShadow,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <strong style={{ color: SR.text }}>
          Service Request ({ticket?.interactionType})
        </strong>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: 9999,
            fontSize: 12,
            fontWeight: 600,
            color: meta.color,
            background: meta.bg,
          }}
        >
          {meta.label}
        </span>
        {ticket?.wip?.committedDate && (
          <span style={{ fontSize: 12, color: SR.sub }}>
            · committed {new Date(ticket.wip.committedDate).toLocaleString()}
          </span>
        )}
      </div>

      <MessageBanner message={msg} />

      {nexts.length > 0 ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 200 }}>
              <label style={label}>New status</label>
              <select
                style={ctrl}
                value={toStatus}
                onChange={(e) =>
                  setToStatus(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">Select…</option>
                {nexts.map((s) => (
                  <option key={s} value={s}>
                    {SR_STATUS_META[s]?.label || s}
                  </option>
                ))}
              </select>
            </div>
            {(toStatus === 2 || toStatus === 7) && (
              <div style={{ minWidth: 220 }}>
                <label style={label}>Committed closure date</label>
                <input
                  type="datetime-local"
                  style={ctrl}
                  value={committedDate}
                  onChange={(e) => setCommittedDate(e.target.value)}
                />
              </div>
            )}
          </div>
          <label style={label}>Comment</label>
          <textarea
            style={{ ...ctrl, width: "100%", minHeight: 60 }}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={displayToParent}
              onChange={(e) => setDisplayToParent(e.target.checked)}
            />
            Display this remark to the parent
          </label>
          <div style={{ marginTop: 10 }}>
            <button onClick={updateStatus} disabled={busy} style={srButton("primary")}>
              Update
            </button>
          </div>
        </>
      ) : (
        <p style={{ color: SR.sub, fontSize: 13 }}>
          No status transitions from “{meta.label}”. Use the actions below.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {status === 4 && (
          <button
            disabled={busy}
            style={srButton("success")}
            onClick={() =>
              wrap(() => serviceRequestApi.close(id, { comments: comment }), "Closed.")
            }
          >
            Close
          </button>
        )}
        {status === 5 && (
          <button disabled={busy} style={srButton("danger")} onClick={() => setAction(action === "reopen" ? "" : "reopen")}>
            Re-open
          </button>
        )}
        <button disabled={busy} style={srButton("neutral")} onClick={() => setAction(action === "reassign" ? "" : "reassign")}>
          Reassign
        </button>
        <button disabled={busy} style={srButton("neutral")} onClick={() => setAction(action === "delegate" ? "" : "delegate")}>
          Delegate
        </button>
        <button disabled={busy} style={srButton("neutral")} onClick={() => setAction(action === "pslCall" ? "" : "pslCall")}>
          PSL Call
        </button>
      </div>

      {action === "reopen" && (
        <div style={{ marginTop: 12 }}>
          <label style={label}>Re-open reason</label>
          <textarea style={{ ...ctrl, width: "100%", minHeight: 60 }} value={remark} onChange={(e) => setRemark(e.target.value)} />
          <button style={{ ...srButton("danger"), marginTop: 8 }} disabled={busy} onClick={() => wrap(() => serviceRequestApi.reopen(id, { reason: remark }), "Re-opened.")}>
            Confirm re-open
          </button>
        </div>
      )}

      {action === "pslCall" && (
        <div style={{ marginTop: 12 }}>
          <label style={label}>Did you speak to the parent? — satisfied?</label>
          <select style={ctrl} value={pslSatisfied} onChange={(e) => setPslSatisfied(e.target.value)}>
            <option value="yes">Yes — satisfied</option>
            <option value="no">No — not satisfied</option>
          </select>
          <label style={label}>Call comments</label>
          <textarea style={{ ...ctrl, width: "100%", minHeight: 60 }} value={remark} onChange={(e) => setRemark(e.target.value)} />
          <button style={{ ...srButton("primary"), marginTop: 8 }} disabled={busy} onClick={() => wrap(() => serviceRequestApi.pslCall(id, { spoken: true, parentSatisfied: pslSatisfied === "yes", comments: remark }), "PSL call recorded.")}>
            Submit call
          </button>
        </div>
      )}

      {(action === "reassign" || action === "delegate") && (
        <div style={{ marginTop: 12 }}>
          <label style={label}>{action === "reassign" ? "Reassign to" : "Delegate to"} (employee)</label>
          <input style={{ ...ctrl, width: "100%" }} placeholder="Search employee…" value={targetUser ? userName(targetUser) : userQuery} onChange={(e) => onUserQuery(e.target.value)} />
          {!targetUser && userResults.length > 0 && (
            <div style={{ border: `1px solid ${SR.border}`, borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: "auto" }}>
              {userResults.map((u) => (
                <div key={u._id} onClick={() => { setTargetUser(u); setUserResults([]); }} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>
                  {userName(u)} <span style={{ color: SR.sub }}>{u.email || ""}</span>
                </div>
              ))}
            </div>
          )}
          <label style={label}>Remark</label>
          <textarea style={{ ...ctrl, width: "100%", minHeight: 60 }} value={remark} onChange={(e) => setRemark(e.target.value)} />
          <button
            style={{ ...srButton("primary"), marginTop: 8 }}
            disabled={busy || !targetUser}
            onClick={() =>
              action === "reassign"
                ? wrap(() => serviceRequestApi.reassign(id, { userId: targetUser._id, remark }), "Reassigned.")
                : wrap(() => serviceRequestApi.delegate(id, { toUserId: targetUser._id, reason: remark }), "Delegated.")
            }
          >
            Confirm {action}
          </button>
        </div>
      )}
    </div>
    {ticket?.interactionType === "PSR" && (
      <LinkedIsrManager
        psrId={id}
        projectId={ticket?.project?._id || ticket?.project}
      />
    )}
    </>
  );
};

export default SrLifecyclePanel;
