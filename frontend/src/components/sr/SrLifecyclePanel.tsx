import React, { useEffect, useRef, useState } from "react";
import { serviceRequestApi } from "../../services/serviceRequests";
import { api } from "../../utils/api";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import { SR, srButton } from "../../utils/srTheme";
import { usePermissions } from "../../hooks/usePermissions";
import { PERMISSIONS } from "../../constants/permissions";
import MessageBanner, { SrMessage } from "./MessageBanner";
import {
  SR_STATUS,
  SR_NEXT_STATUSES as NEXT_STATUSES,
  SR_CANCELABLE_FROM as CANCELABLE_FROM,
  SR_CLOSABLE_FROM,
  SR_NEEDS_COMMITTED_DATE,
} from "../../constants/srWorkflow";

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
  const { hasPermission } = usePermissions();
  // Status labels/colours come from the project's status master, never a
  // built-in list (SLA & Escalation owns that data).
  const { metaFor, statuses } = useProjectStatuses(
    ticket?.project?._id || ticket?.project,
  );

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<SrMessage | null>(null);
  const [toStatus, setToStatus] = useState<number | "">("");
  // How many re-opens this request has left, per the project's configured
  // limit. Falls back to one, which is what the server assumes when the
  // config has not loaded (or the project never set one).
  const projectId = ticket?.project?._id || ticket?.project;
  const [reopenLimit, setReopenLimit] = useState(1);
  // What the person who raised a request may do on it (SR settings).
  const [requesterRights, setRequesterRights] = useState<any>({});
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    serviceRequestApi
      .getConfig(String(projectId))
      .then((r: any) => {
        if (cancelled) return;
        const limit = r?.data?.psr?.workflow?.lifecycle?.reopenLimit;
        if (Number.isFinite(limit)) setReopenLimit(Number(limit));
        setRequesterRights(r?.data?.requester || {});
      })
      .catch(() => {
        /* keep the safe default */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  // Whether a status asks for a remark is the project's call (status master:
  // "Require closing remark"); the server enforces the same flag.
  const needsRemark = (code: number | "") =>
    code !== "" && !!statuses.find((s) => s.code === code)?.requireRemark;
  const reopensUsed = (ticket as any)?.reopen?.count ?? 0;

  // Configured SR rules on the current status (Query Config → Ticket
  // Statuses) decide what may follow it and who may apply each option.
  // Without them the built-in lifecycle below applies, unchanged.
  const statusDoc = (code: number | "") =>
    code === "" ? undefined : statuses.find((s) => s.code === code);
  const srRule = statusDoc(status)?.rules?.sr;
  const configured = !!srRule;
  // Who I am on THIS request decides which statuses I am offered, alongside
  // the permission — the same pair the server checks.
  const me = (() => {
    // Same order the detail page uses: a plain userId is written on login and
    // the user object is not always present.
    try {
      const plain = localStorage.getItem("userId");
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      const role =
        u?.role?.code || u?.roleCode || localStorage.getItem("userRole") || "";
      return {
        id: String(plain || u?._id || u?.id || ""),
        isSuperAdmin: role === "SUPER_ADMIN",
      };
    } catch {
      return {
        id: String(localStorage.getItem("userId") || ""),
        isSuperAdmin: localStorage.getItem("userRole") === "SUPER_ADMIN",
      };
    }
  })();
  const partyId = (v: any) => String(v?._id || v || "");
  const isAssignee = !!me.id && partyId(ticket?.assignedTo) === me.id;
  const isRaiser = !!me.id && partyId(ticket?.createdBy) === me.id;

  /**
   * Handing the request to someone else belongs to whoever is working it. A
   * raiser who is not the assignee only gets these when the project allows it
   * — they keep both on requests assigned to them.
   */
  const mayHandOver = (action: "reassign" | "delegate") => {
    if (me.isSuperAdmin || hasPermission(PERMISSIONS.SR_MODIFY_ANY)) return true;
    if (isAssignee) return true;
    if (!isRaiser) return true; // not a party to it — the permission decides
    return action === "reassign"
      ? requesterRights.canReassign === true
      : requesterRights.canDelegate === true;
  };

  const canApply = (code: number) => {
    const rule = statusDoc(code)?.rules?.sr;
    const perm = rule?.permission;
    if (perm && !hasPermission(perm)) return false;
    const actors = rule?.allowedActors || [];
    if (!actors.length || me.isSuperAdmin) return true;
    return (
      (actors.includes("assignee") && isAssignee) ||
      (actors.includes("raiser") && isRaiser)
    );
  };
  // A move must satisfy both ends: what may follow the current status, and
  // what the target says it may follow.
  const allowedByConfig = (code: number) => {
    const out = srRule?.restrictNext
      ? (srRule.allowedNext || []).includes(code)
      : code !== status;
    const prev = statusDoc(code)?.rules?.sr;
    const inbound = prev?.restrictPrev ? (prev.allowedPrev || []).includes(status) : true;
    return out && inbound;
  };
  const needsDate = (code: number | "") =>
    code !== "" &&
    (configured ? !!statusDoc(code)?.requireDate : SR_NEEDS_COMMITTED_DATE.includes(code));
  const [confirming, setConfirming] = useState(false);

  /**
   * The window the status allows for its committed date (Query Config →
   * Ticket Statuses). Bounding the field is kinder than refusing the save:
   * the server applies the same rule either way.
   */
  /** Why this date is outside the status's window, or "" when it is fine. */
  const dateRangeError = (code: number | "", value: string) => {
    const doc = statusDoc(code);
    if (!doc || !value) return "";
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return "That is not a valid date.";
    const label = doc.label || "The committed date";
    if (doc.committedDateMin === "now" && when.getTime() <= Date.now())
      return `${label} must be in the future.`;
    if (
      doc.committedDateMin === "created" &&
      ticket?.createdAt &&
      when.getTime() < new Date(ticket.createdAt).getTime()
    )
      return `${label} cannot be before the request was raised.`;
    const days = Number(doc.committedDateMaxDays);
    if (days > 0 && when.getTime() > Date.now() + days * 24 * 60 * 60 * 1000)
      return `${label} may be at most ${days} day${days === 1 ? "" : "s"} ahead.`;
    return "";
  };

  const dateBounds = (code: number | "") => {
    const doc = statusDoc(code);
    if (!doc) return {};
    const pad = (n: number) => String(n).padStart(2, "0");
    const asLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours(),
      )}:${pad(d.getMinutes())}`;
    const now = new Date();
    let min: Date | undefined;
    if (doc.committedDateMin === "now") min = new Date(now.getTime() + 60000);
    else if (doc.committedDateMin === "created" && ticket?.createdAt)
      min = new Date(ticket.createdAt);
    const days = Number(doc.committedDateMaxDays);
    const max =
      days > 0 ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : undefined;
    const say = (d: Date) =>
      d.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    const hint =
      min && max
        ? `Between ${say(min)} and ${say(max)}`
        : max
          ? `No later than ${say(max)}`
          : min
            ? `Not before ${say(min)}`
            : "";
    return {
      min: min ? asLocal(min) : undefined,
      max: max ? asLocal(max) : undefined,
      hint,
    };
  };

  const [committedDate, setCommittedDate] = useState("");
  const [comment, setComment] = useState("");
  const [displayToParent, setDisplayToParent] = useState(false);

  const [action, setAction] = useState<
    "" | "reassign" | "delegate" | "pslCall"
  >("");
  // Who a request may be handed to comes from SR settings: a department may
  // have to be chosen first, and roles such as Student/Parent are excluded.
  const [departments, setDepartments] = useState<{ _id: string; name: string }[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [needsDepartment, setNeedsDepartment] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [remark, setRemark] = useState("");
  const [pslSatisfied, setPslSatisfied] = useState("yes");
  const [replacementQuery, setReplacementQuery] = useState("");
  const [replacementResults, setReplacementResults] = useState<any[]>([]);
  const [replacementSr, setReplacementSr] = useState<any>(null);
  const debounce = useRef<any>(null);
  const repDebounce = useRef<any>(null);

  const reset = () => {
    setConfirming(false);
    setToStatus("");
    setCommittedDate("");
    setComment("");
    setDisplayToParent(false);
    setAction("");
    setTargetUser(null);
    setUserQuery("");
    setUserResults([]);
    setDepartmentId("");
    setRemark("");
    setReplacementQuery("");
    setReplacementResults([]);
    setReplacementSr(null);
  };

  // The department master for this project — the same list User Management
  // maps people to.
  useEffect(() => {
    if (!projectId || (action !== "reassign" && action !== "delegate")) return;
    let cancelled = false;
    api
      .get(`/departments/project/${projectId}`)
      .then((r: any) => {
        if (!cancelled) setDepartments(r?.data?.data || []);
      })
      .catch(() => setDepartments([]));
    return () => {
      cancelled = true;
    };
  }, [projectId, action]);

  const onReplacementQuery = (q: string) => {
    setReplacementQuery(q);
    setReplacementSr(null);
    if (repDebounce.current) clearTimeout(repDebounce.current);
    if (q.trim().length < 2) {
      setReplacementResults([]);
      return;
    }
    repDebounce.current = setTimeout(async () => {
      try {
        const r = await serviceRequestApi.list({
          projectId: ticket?.project?._id || ticket?.project,
          search: q.trim(),
          limit: 8,
        } as any);
        const items = (r as any)?.data?.items || (r as any)?.items || [];
        setReplacementResults(
          items.filter((t: any) => String(t._id) !== String(id)),
        );
      } catch (e) {
        console.error(e);
      }
    }, 350);
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
    if (needsDate(toStatus) && !committedDate) {
      setMsg({
        type: "err",
        text: `${metaFor(toStatus).label} needs a committed date.`,
      });
      return;
    }
    // Same window the server enforces — say so now rather than after a save.
    const outOfRange = committedDate ? dateRangeError(toStatus, committedDate) : "";
    if (outOfRange) {
      setMsg({ type: "err", text: outOfRange });
      return;
    }
    if ((needsRemark(toStatus) || cancelling || reopening) && !comment.trim()) {
      setMsg({
        type: "err",
        text: cancelling
          ? "A cancellation reason is required."
          : reopening
            ? "Give a reason for re-opening."
            : `A remark is required for "${metaFor(toStatus).label}".`,
      });
      return;
    }
    // The status asks to be confirmed: first click arms, second applies.
    if (statusDoc(toStatus)?.requireConfirmation && !confirming) {
      setConfirming(true);
      return;
    }
    if (cancelling) {
      wrap(
        () =>
          serviceRequestApi.cancel(id, {
            reason: comment,
            replacementSrId: replacementSr?._id,
          }),
        "Cancelled.",
      );
      return;
    }
    // Without configured rules, close and re-open keep their own endpoints.
    if (!configured && toStatus === SR_STATUS.CLOSED) {
      wrap(() => serviceRequestApi.close(id, { comments: comment }), "Closed.");
      return;
    }
    if (!configured && reopening) {
      wrap(() => serviceRequestApi.reopen(id, { reason: comment }), "Re-opened.");
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

  const searchAssignees = (q: string, dept = departmentId) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r: any = await serviceRequestApi.assignees({
          projectId: String(projectId || ""),
          departmentId: dept || undefined,
          search: q.trim() || undefined,
        });
        setNeedsDepartment(!!r?.needsDepartment);
        setUserResults(r?.users || []);
      } catch (e) {
        console.error(e);
        setUserResults([]);
      }
    }, 300);
  };

  const onUserQuery = (q: string) => {
    setUserQuery(q);
    setTargetUser(null);
    searchAssignees(q);
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

  const meta = metaFor(status);
  // Every status move is offered in one place — the list below. Buttons are
  // kept for things that are not a status change (reassign, delegate, PSL
  // call), so a status never appears as both a button and an option.
  const nexts: number[] = configured
    ? statuses
        .map((s) => s.code)
        .filter((c) => allowedByConfig(c) && canApply(c))
    : [
        ...(NEXT_STATUSES[status] || []),
        ...(SR_CLOSABLE_FROM.includes(status) && hasPermission(PERMISSIONS.SR_CLOSE)
          ? [SR_STATUS.CLOSED]
          : []),
        ...(status === SR_STATUS.CLOSED && hasPermission(PERMISSIONS.SR_REOPEN)
          ? [SR_STATUS.REOPEN]
          : []),
        ...(CANCELABLE_FROM.includes(status) && hasPermission(PERMISSIONS.SR_CANCEL)
          ? [SR_STATUS.CANCEL]
          : []),
      ].filter((c, i, all) => all.indexOf(c) === i && statuses.some((s) => s.code === c));

  // Cancelling asks for a reason and may point at the request that replaces
  // this one; re-opening always asks why.
  const cancelling = toStatus === SR_STATUS.CANCEL;
  const reopening = toStatus === SR_STATUS.REOPEN;

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
                onChange={(e) => {
                  setConfirming(false);
                  setToStatus(e.target.value ? Number(e.target.value) : "");
                }}
              >
                <option value="">Select...</option>
                {nexts.map((s) => (
                  <option key={s} value={s}>
                    {/* Same status again = revise the WIP commitment. */}
                    {s === status
                      ? `Revise ${metaFor(s).label} (new committed date)`
                      : metaFor(s).label}
                  </option>
                ))}
              </select>
            </div>
            {needsDate(toStatus) && (
              <div style={{ minWidth: 0 }}>
                <label style={label}>Committed closure date</label>
                <input
                  type="datetime-local"
                  style={{
                    ...ctrl,
                    width: "100%",
                    borderColor: dateRangeError(toStatus, committedDate)
                      ? "#fecaca"
                      : (ctrl.borderColor as string),
                  }}
                  value={committedDate}
                  min={dateBounds(toStatus).min}
                  max={dateBounds(toStatus).max}
                  aria-invalid={!!dateRangeError(toStatus, committedDate)}
                  onChange={(e) => setCommittedDate(e.target.value)}
                />
                {dateRangeError(toStatus, committedDate) ? (
                  <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>
                    {dateRangeError(toStatus, committedDate)}
                  </span>
                ) : (
                  dateBounds(toStatus).hint && (
                    <span style={{ fontSize: 12, color: SR.muted }}>
                      {dateBounds(toStatus).hint}
                    </span>
                  )
                )}
              </div>
            )}
          </div>
          {reopening && (
            <div style={{ fontSize: 12, color: SR.muted, marginTop: 10 }}>
              {reopensUsed > 0
                ? `Re-opened ${reopensUsed} of ${reopenLimit} time${reopenLimit === 1 ? "" : "s"} allowed for this project.`
                : `This project allows ${reopenLimit} re-open${reopenLimit === 1 ? "" : "s"} per request.`}
            </div>
          )}
          <label style={label}>
            {cancelling
              ? "Cancellation reason *"
              : reopening
                ? "Re-open reason *"
                : needsRemark(toStatus)
                  ? "Remark *"
                  : "Comment"}
          </label>
          <textarea
            style={{ ...ctrl, width: "100%", minHeight: 74, resize: "vertical" }}
            value={comment}
            placeholder={
              cancelling
                ? "Why is this request being cancelled?"
                : needsRemark(toStatus) || reopening
                  ? "Required"
                  : "Optional"
            }
            onChange={(e) => setComment(e.target.value)}
          />
          {cancelling && (
            <>
              <label style={label}>Replacement SR (optional)</label>
              <input
                style={{ ...ctrl, width: "100%" }}
                placeholder="Search by SR number or subject..."
                value={replacementSr ? replacementSr.ticketNumber : replacementQuery}
                onChange={(e) => onReplacementQuery(e.target.value)}
              />
              {!replacementSr && replacementResults.length > 0 && (
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
                  {replacementResults.map((t) => (
                    <div
                      key={t._id}
                      onClick={() => {
                        setReplacementSr(t);
                        setReplacementResults([]);
                      }}
                      style={{
                        padding: "9px 12px",
                        cursor: "pointer",
                        fontSize: 13,
                        borderBottom: `1px solid ${SR.rowBorder}`,
                      }}
                    >
                      <strong>{t.ticketNumber}</strong>{" "}
                      <span style={{ color: SR.sub }}>{t.subject || ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
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
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {confirming && toStatus !== "" && (
              <span style={{ fontSize: 13, color: SR.text, fontWeight: 600 }}>
                Change status to "{metaFor(toStatus).label}"?
              </span>
            )}
            <button onClick={updateStatus} disabled={busy} style={srButton("primary")}>
              {confirming ? "Confirm" : "Update"}
            </button>
            {confirming && (
              <button style={secondaryButton} disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <p style={{ color: SR.sub, fontSize: 13, margin: "6px 0 0" }}>
          No status transitions from "{meta.label}". Use the actions below.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {/* Each of these is its own permission on the server; showing a
            button the role cannot use only produces a failed request. */}
        {hasPermission(PERMISSIONS.SR_REASSIGN) && mayHandOver("reassign") && (
          <button
            disabled={busy}
            style={secondaryButton}
            onClick={() => setAction(action === "reassign" ? "" : "reassign")}
          >
            Reassign
          </button>
        )}
        {hasPermission(PERMISSIONS.SR_DELEGATE) && mayHandOver("delegate") && (
          <button
            disabled={busy}
            style={secondaryButton}
            onClick={() => setAction(action === "delegate" ? "" : "delegate")}
          >
            Delegate
          </button>
        )}
        {/* Parent satisfaction call — PSR only; an ISR has no parent. */}
        {ticket?.interactionType === "PSR" && hasPermission(PERMISSIONS.SR_CLOSE) && (
          <button
            disabled={busy}
            style={secondaryButton}
            onClick={() => setAction(action === "pslCall" ? "" : "pslCall")}
          >
            PSL Call
          </button>
        )}
      </div>

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
          {departments.length > 0 && (
            <>
              <label style={label}>Department</label>
              <select
                style={{ ...ctrl, width: "100%" }}
                value={departmentId}
                onChange={(e) => {
                  const dept = e.target.value;
                  setDepartmentId(dept);
                  setTargetUser(null);
                  setUserQuery("");
                  setUserResults([]);
                  if (dept) searchAssignees("", dept);
                }}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <label style={label}>
            {action === "reassign" ? "Reassign to" : "Delegate to"} (employee)
          </label>
          <input
            style={{ ...ctrl, width: "100%" }}
            placeholder={
              needsDepartment ? "Pick a department first" : "Search by name, email or employee code..."
            }
            disabled={needsDepartment && !departmentId}
            value={targetUser ? userName(targetUser) : userQuery}
            onFocus={() => {
              if (!targetUser && !userResults.length) searchAssignees(userQuery);
            }}
            onChange={(e) => onUserQuery(e.target.value)}
          />
          {needsDepartment && !departmentId && (
            <span style={{ fontSize: 12, color: SR.muted }}>
              This project asks for the department before the people are listed.
            </span>
          )}
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
                  {userName(u)}{" "}
                  <span style={{ color: SR.sub }}>
                    {[u.email, u.employeeCode, u.department, u.role?.name]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
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
