import React, { useMemo, useState } from "react";
import {
  CheckCircleIcon,
  PhoneIcon,
  PhoneArrowUpRightIcon,
  UserCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { serviceRequestApi } from "../../services/serviceRequests";
import { SR, srButton } from "../../utils/srTheme";
import MessageBanner, { SrMessage } from "./MessageBanner";

/**
 * Dedicated PSL (Parent Satisfaction Liaison) call tab.
 * A PSL call records whether the parent was reached and satisfied — the
 * outcome auto-closes (satisfied) or re-opens (not satisfied) the request.
 * Shows who to call, the latest call outcome, a log-a-call form and the full
 * call history (sourced from changeHistory entries written by the backend).
 */
interface Props {
  ticket: any;
  onChanged: () => void;
}

const userName = (u: any) =>
  !u
    ? "-"
    : typeof u === "string"
      ? u
      : u.fullName ||
        `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
        u.email ||
        "-";

const Pill: React.FC<{ ok: boolean; yes: string; no: string }> = ({
  ok,
  yes,
  no,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "3px 10px",
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 800,
      color: ok ? "#047857" : "#b91c1c",
      background: ok ? "#ecfdf5" : "#fef2f2",
    }}
  >
    {ok ? (
      <CheckCircleIcon style={{ width: 14, height: 14 }} />
    ) : (
      <XCircleIcon style={{ width: 14, height: 14 }} />
    )}
    {ok ? yes : no}
  </span>
);

const PslCallTab: React.FC<Props> = ({ ticket, onChanged }) => {
  const id: string = ticket?._id;
  const [spoken, setSpoken] = useState<"yes" | "no">("yes");
  const [satisfied, setSatisfied] = useState<"yes" | "no">("yes");
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<SrMessage | null>(null);

  const md = ticket?.metadata || {};
  const contactName = md.studentName || userName(ticket?.createdBy) || "Requester";
  const contactPhone = md.studentPhone || md.parentPhone || "";
  const contactEmail = md.studentEmail || "";

  const last = ticket?.pslCall;

  const history = useMemo(() => {
    const list = (ticket?.changeHistory || []).filter(
      (c: any) => c.field === "PSL Call",
    );
    return list.sort(
      (a: any, b: any) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    );
  }, [ticket?.changeHistory]);

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
    width: "100%",
  };
  const label: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    color: "#475467",
    display: "block",
    margin: "0 0 6px",
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#98a2b3",
    margin: "0 0 10px",
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await serviceRequestApi.pslCall(id, {
        spoken: spoken === "yes",
        parentSatisfied: spoken === "yes" ? satisfied === "yes" : undefined,
        comments: comments || undefined,
      });
      setMsg({ type: "ok", text: "PSL call recorded." });
      setComments("");
      onChanged();
    } catch (e: any) {
      setMsg({
        type: "err",
        text: e?.response?.data?.message || "Could not record call.",
      });
    } finally {
      setBusy(false);
    }
  };

  const outcomeHint =
    spoken === "no"
      ? "Parent not reached — the request status is unchanged."
      : satisfied === "yes"
        ? "Parent satisfied — the request will be closed."
        : "Parent not satisfied — the request will be re-opened (if eligible).";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Who to call */}
      <div
        style={{
          border: `1px solid ${SR.border}`,
          borderRadius: 16,
          background: "linear-gradient(135deg,#eff6ff 0%,#f5f3ff 100%)",
          padding: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "#fff",
              color: SR.primary,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <UserCircleIcon style={{ width: 26, height: 26 }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Contact to call
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: SR.text }}>
              {contactName}
            </div>
            <div style={{ fontSize: 13, color: SR.sub }}>
              {contactEmail || "No email on file"}
            </div>
          </div>
        </div>
        {contactPhone ? (
          <a
            href={`tel:${contactPhone}`}
            style={{
              ...srButton("primary"),
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <PhoneIcon style={{ width: 16, height: 16 }} />
            {contactPhone}
          </a>
        ) : (
          <span style={{ fontSize: 13, color: SR.sub, fontWeight: 600 }}>
            No phone number on file
          </span>
        )}
      </div>

      {/* Latest outcome */}
      <div
        style={{
          border: `1px solid ${SR.border}`,
          borderRadius: 16,
          background: SR.bg,
          boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
          padding: 18,
        }}
      >
        <p style={sectionTitle}>Latest PSL call</p>
        {last?.calledAt ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill ok={!!last.spoken} yes="Parent reached" no="Not reached" />
              {last.spoken && (
                <Pill
                  ok={!!last.parentSatisfied}
                  yes="Satisfied"
                  no="Not satisfied"
                />
              )}
            </div>
            {last.comments && (
              <p style={{ fontSize: 14, color: SR.text, margin: 0 }}>
                "{last.comments}"
              </p>
            )}
            <p style={{ fontSize: 12, color: SR.sub, margin: 0 }}>
              {userName(last.calledBy)} ·{" "}
              {new Date(last.calledAt).toLocaleString()}
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: SR.sub, margin: 0 }}>
            No PSL call logged yet.
          </p>
        )}
      </div>

      {/* Log a call */}
      <div
        style={{
          border: `1px solid ${SR.border}`,
          borderRadius: 16,
          background: SR.bg,
          boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
          padding: 18,
        }}
      >
        <p style={sectionTitle}>Log a call</p>
        <MessageBanner message={msg} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <label style={label}>Did you speak to the parent?</label>
            <select
              style={ctrl}
              value={spoken}
              onChange={(e) => setSpoken(e.target.value as "yes" | "no")}
            >
              <option value="yes">Yes, reached the parent</option>
              <option value="no">No, could not reach</option>
            </select>
          </div>
          {spoken === "yes" && (
            <div>
              <label style={label}>Was the parent satisfied?</label>
              <select
                style={ctrl}
                value={satisfied}
                onChange={(e) => setSatisfied(e.target.value as "yes" | "no")}
              >
                <option value="yes">Yes, satisfied</option>
                <option value="no">No, not satisfied</option>
              </select>
            </div>
          )}
        </div>
        <label style={{ ...label, marginTop: 12 }}>Call notes</label>
        <textarea
          style={{ ...ctrl, minHeight: 84, resize: "vertical" }}
          placeholder="What was discussed on the call…"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <button onClick={submit} disabled={busy} style={srButton("primary")}>
            <PhoneArrowUpRightIcon
              style={{ width: 16, height: 16, marginRight: 6, marginBottom: -3 }}
            />
            Record PSL call
          </button>
          <span style={{ fontSize: 12, color: SR.sub }}>{outcomeHint}</span>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div
          style={{
            border: `1px solid ${SR.border}`,
            borderRadius: 16,
            background: SR.bg,
            boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
            padding: 18,
          }}
        >
          <p style={sectionTitle}>Call history ({history.length})</p>
          <div style={{ display: "grid", gap: 10 }}>
            {history.map((c: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  paddingBottom: 10,
                  borderBottom:
                    i < history.length - 1
                      ? `1px solid ${SR.rowBorder}`
                      : "none",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 9999,
                    background: "#eff6ff",
                    color: SR.primary,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <PhoneIcon style={{ width: 14, height: 14 }} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: SR.text, fontWeight: 600 }}>
                    {c.newValue}
                  </div>
                  <div style={{ fontSize: 12, color: SR.sub }}>
                    {userName(c.changedBy)} ·{" "}
                    {new Date(c.changedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PslCallTab;
