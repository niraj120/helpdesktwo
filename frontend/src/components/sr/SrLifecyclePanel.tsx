import React, { useRef, useState } from "react";
import { serviceRequestApi, SR_STATUS_META } from "../../services/serviceRequests";
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
  );
};

export default SrLifecyclePanel;
