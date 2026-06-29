import React, { useRef, useState } from "react";
import { serviceRequestApi, SR_STATUS_META } from "../../services/serviceRequests";
import { SR, srButton } from "../../utils/srTheme";
import MessageBanner, { SrMessage } from "./MessageBanner";

const NEXT_STATUSES: Record<number, number[]> = {
  1: [2, 4],
  2: [2, 4],
  6: [7],
  7: [],
  4: [],
  5: [],
};

const userName = (u: any) =>
  !u
    ? "-"
    : u.fullName ||
      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
      u.email ||
      u._id;

interface Props {
  ticket: any;
  onChanged: () => void;
  hideHeader?: boolean;
}

const SrLifecyclePanel: React.FC<Props> = ({
  ticket,
  onChanged,
  hideHeader = false,
}) => {
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
    minHeight: 42,
    padding: "8px 12px",
    border: `1px solid ${SR.inputBorder}`,
    borderRadius: 10,
    fontSize: 14,
    boxSizing: "border-box",
    background: SR.bg,
    color: SR.text,
    fontFamily: SR.font,
  };
  const label: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    color: "#475467",
    display: "block",
    margin: "12px 0 6px",
  };
  const secondaryButton: React.CSSProperties = {
    background: "#fff",
    color: "#344054",
    border: `1px solid ${SR.inputBorder}`,
    borderRadius: 10,
    padding: "9px 14px",
    fontWeight: 700,
    fontSize: 13,
    fontFamily: SR.font,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  };
  const actionPanel: React.CSSProperties = {
    marginTop: 14,
    border: `1px solid ${SR.border}`,
    borderRadius: 14,
    background: "#f9fafc",
    padding: 14,
  };

  const meta = SR_STATUS_META[status] || { label: status, color: SR.text, bg: "#f3f4f6" };
  const nexts = NEXT_STATUSES[status] || [];

  return (
    <div
      style={
        hideHeader
          ? { background: "transparent", padding: 0 }
          : {
              background: SR.bg,
              border: `1px solid ${SR.border}`,
              borderRadius: 16,
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.055)",
              padding: 18,
              marginBottom: 0,
            }
      }
    >
      {!hideHeader && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                background: "#eff6ff",
                color: SR.primary,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              SR
            </span>
            <div style={{ minWidth: 0 }}>
              <strong style={{ color: SR.text, fontSize: 16 }}>
                Service Request ({ticket?.interactionType})
              </strong>
              {ticket?.wip?.committedDate && (
                <div style={{ fontSize: 12, color: SR.sub, marginTop: 2 }}>
                  Committed {new Date(ticket.wip.committedDate).toLocaleString()}
                </div>
              )}
            </div>
          </div>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 800,
              color: meta.color,
              background: meta.bg,
              flexShrink: 0,
            }}
          >
            {meta.label}
          </span>
        </div>
      )}

      <MessageBanner message={msg} />

      {nexts.length > 0 ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label style={label}>New status</label>
              <select
                style={{ ...ctrl, width: "100%" }}
                value={toStatus}
                onChange={(e) =>
                  setToStatus(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">Select...</option>
                {nexts.map((s) => (
                  <option key={s} value={s}>
                    {SR_STATUS_META[s]?.label || s}
                  </option>
                ))}
              </select>
            </div>
            {(toStatus === 2 || toStatus === 7) && (
              <div style={{ minWidth: 0 }}>
                <label style={label}>Committed closure date</label>
                <input
                  type="datetime-local"
                  style={{ ...ctrl, width: "100%" }}
                  value={committedDate}
                  onChange={(e) => setCommittedDate(e.target.value)}
                />
              </div>
            )}
          </div>
          <label style={label}>Comment</label>
          <textarea
            style={{ ...ctrl, width: "100%", minHeight: 74, resize: "vertical" }}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              fontSize: 13,
              color: "#344054",
            }}
          >
            <input
              type="checkbox"
              checked={displayToParent}
              onChange={(e) => setDisplayToParent(e.target.checked)}
            />
            Display this remark to the parent
          </label>
          <div style={{ marginTop: 12 }}>
            <button onClick={updateStatus} disabled={busy} style={srButton("primary")}>
              Update
            </button>
          </div>
        </>
      ) : (
        <p style={{ color: SR.sub, fontSize: 13, margin: "6px 0 0" }}>
          No status transitions from "{meta.label}". Use the actions below.
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
          <button
            disabled={busy}
            style={srButton("danger")}
            onClick={() => setAction(action === "reopen" ? "" : "reopen")}
          >
            Re-open
          </button>
        )}
        <button
          disabled={busy}
          style={secondaryButton}
          onClick={() => setAction(action === "reassign" ? "" : "reassign")}
        >
          Reassign
        </button>
        <button
          disabled={busy}
          style={secondaryButton}
          onClick={() => setAction(action === "delegate" ? "" : "delegate")}
        >
          Delegate
        </button>
        <button
          disabled={busy}
          style={secondaryButton}
          onClick={() => setAction(action === "pslCall" ? "" : "pslCall")}
        >
          PSL Call
        </button>
      </div>

      {action === "reopen" && (
        <div style={actionPanel}>
          <label style={label}>Re-open reason</label>
          <textarea
            style={{ ...ctrl, width: "100%", minHeight: 74, resize: "vertical" }}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
          <button
            style={{ ...srButton("danger"), marginTop: 8 }}
            disabled={busy}
            onClick={() =>
              wrap(() => serviceRequestApi.reopen(id, { reason: remark }), "Re-opened.")
            }
          >
            Confirm re-open
          </button>
        </div>
      )}

      {action === "pslCall" && (
        <div style={actionPanel}>
          <label style={label}>Did you speak to the parent?</label>
          <select
            style={{ ...ctrl, width: "100%" }}
            value={pslSatisfied}
            onChange={(e) => setPslSatisfied(e.target.value)}
          >
            <option value="yes">Yes, satisfied</option>
            <option value="no">No, not satisfied</option>
          </select>
          <label style={label}>Call comments</label>
          <textarea
            style={{ ...ctrl, width: "100%", minHeight: 74, resize: "vertical" }}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
          <button
            style={{ ...srButton("primary"), marginTop: 8 }}
            disabled={busy}
            onClick={() =>
              wrap(
                () =>
                  serviceRequestApi.pslCall(id, {
                    spoken: true,
                    parentSatisfied: pslSatisfied === "yes",
                    comments: remark,
                  }),
                "PSL call recorded.",
              )
            }
          >
            Submit call
          </button>
        </div>
      )}

      {(action === "reassign" || action === "delegate") && (
        <div style={actionPanel}>
          <label style={label}>
            {action === "reassign" ? "Reassign to" : "Delegate to"} (employee)
          </label>
          <input
            style={{ ...ctrl, width: "100%" }}
            placeholder="Search employee..."
            value={targetUser ? userName(targetUser) : userQuery}
            onChange={(e) => onUserQuery(e.target.value)}
          />
          {!targetUser && userResults.length > 0 && (
            <div
              style={{
                border: `1px solid ${SR.border}`,
                borderRadius: 10,
                marginTop: 6,
                maxHeight: 180,
                overflowY: "auto",
                background: "#fff",
              }}
            >
              {userResults.map((u) => (
                <div
                  key={u._id}
                  onClick={() => {
                    setTargetUser(u);
                    setUserResults([]);
                  }}
                  style={{
                    padding: "9px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                    borderBottom: `1px solid ${SR.rowBorder}`,
                  }}
                >
                  {userName(u)} <span style={{ color: SR.sub }}>{u.email || ""}</span>
                </div>
              ))}
            </div>
          )}
          <label style={label}>Remark</label>
          <textarea
            style={{ ...ctrl, width: "100%", minHeight: 74, resize: "vertical" }}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
          <button
            style={{ ...srButton("primary"), marginTop: 8 }}
            disabled={busy || !targetUser}
            onClick={() =>
              action === "reassign"
                ? wrap(
                    () =>
                      serviceRequestApi.reassign(id, {
                        userId: targetUser._id,
                        remark,
                      }),
                    "Reassigned.",
                  )
                : wrap(
                    () =>
                      serviceRequestApi.delegate(id, {
                        toUserId: targetUser._id,
                        reason: remark,
                      }),
                    "Delegated.",
                  )
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
