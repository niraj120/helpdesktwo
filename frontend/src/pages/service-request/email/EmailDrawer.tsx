/**
 * Email drawer — one inbound email, opened from the email triage list the same
 * way the IVR inbox opens a call: who sent it (and, if registered, their
 * family), what to do with it, then the email itself.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  serviceRequestApi,
  type SrFamilyParent,
} from "../../../services/serviceRequests";
import { srButton } from "../../../utils/srTheme";
import FamilyCard from "../FamilyCard";
import "../ivr/ivrInbox.css";

export interface EmailIntakeRow {
  _id: string;
  uniqueId: string;
  fromName?: string;
  fromEmail: string;
  subject: string;
  body?: string;
  htmlBody?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  projectEmailConfigId?: string;
  receivedAt: string;
  dueAt?: string;
  status: string;
  /** Unset = unread. */
  readAt?: string;
  actions?: Array<{
    type: string;
    refType?: string;
    refId?: string;
    refNumber?: string;
  }>;
}

const STATUS_META: Record<string, { color: string; bg: string }> = {
  open: { color: "#1d4ed8", bg: "#eef2ff" },
  wip: { color: "#b45309", bg: "#fffbeb" },
  closed: { color: "#047857", bg: "#ecfdf5" },
  junk: { color: "#991b1b", bg: "#fee2e2" },
};

export const stripHtml = (value?: string) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const Pill: React.FC<{ color: string; bg: string; children: React.ReactNode }> = ({
  color,
  bg,
  children,
}) => (
  <span className="ivr-pill" style={{ color, background: bg }}>
    {children}
  </span>
);

const EmailDrawer: React.FC<{
  email: EmailIntakeRow;
  canConvert: boolean;
  onClose: () => void;
  /** Guided PSR flow; a registered sender's family preselects existing parent. */
  onStartPsr: (email: EmailIntakeRow, family?: SrFamilyParent[]) => void;
  onJunk: (email: EmailIntakeRow) => void;
  onOpenTicket: (ticketId: string) => void;
  /** Put the email back to unread (and close the drawer). */
  onMarkUnread: (email: EmailIntakeRow) => void;
}> = ({ email, canConvert, onClose, onStartPsr, onJunk, onOpenTicket, onMarkUnread }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [family, setFamily] = useState<SrFamilyParent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFamily(null);
    panelRef.current?.focus();
    serviceRequestApi.emailIntake
      .family(email._id)
      .then((r) => {
        if (!cancelled) setFamily(r?.data?.parents || []);
      })
      .catch(() => {
        if (!cancelled) setFamily([]);
      });
    return () => {
      cancelled = true;
    };
  }, [email._id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const registered = !!family?.length;
  const displayName = family?.[0]?.name || email.fromName || email.fromEmail;
  const initials = (displayName || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const status = STATUS_META[email.status] || STATUS_META.open;
  const ticket = [...(email.actions || [])]
    .reverse()
    .find((a) => a.refType === "ticket" && a.refId);
  const actionable = email.status === "open" || email.status === "wip";
  const body = email.body || stripHtml(email.htmlBody);

  return (
    <div className="ivr-drawer-root" role="presentation">
      <div className="ivr-backdrop" onClick={onClose} />
      <aside
        className="ivr-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Email from ${email.fromName || email.fromEmail}`}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="ivr-dh">
          <div className={`ivr-avatar ${registered ? "answered" : ""}`}>
            {initials || "✉"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ivr-dh-name">{displayName}</div>
            <div className="ivr-dh-sub">
              <a href={`mailto:${email.fromEmail}`} className="ivr-link">
                {email.fromEmail}
              </a>
            </div>
            <div className="ivr-chips">
              {family === null ? null : registered ? (
                <Pill color="#047857" bg="#ecfdf5">
                  Registered
                  {family.reduce((n, p) => n + p.children.length, 0)
                    ? ` · ${family.reduce((n, p) => n + p.children.length, 0)} student(s)`
                    : ""}
                </Pill>
              ) : (
                <Pill color="#b45309" bg="#fffbeb">Unregistered</Pill>
              )}
              <Pill color={status.color} bg={status.bg}>
                <span style={{ textTransform: "capitalize" }}>{email.status}</span>
              </Pill>
              <span className="ivr-muted">{email.uniqueId}</span>
            </div>
          </div>
          <button className="ivr-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="ivr-dbody">
          <FamilyCard family={family} keyLabel="email address" />

          <section className="ivr-actions">
            {ticket?.refId && (
              <button
                onClick={() => onOpenTicket(String(ticket.refId))}
                style={{ ...srButton("neutral"), padding: "9px 14px", color: "#047857" }}
              >
                🎫 {ticket.refNumber || "View SR"}
              </button>
            )}
            {canConvert && actionable && (
              <button
                // A registered sender goes straight to the existing-parent form
                // with the family filled in; anyone else is classified first.
                onClick={() => onStartPsr(email, family?.length ? family : undefined)}
                disabled={family === null}
                style={{ ...srButton("success"), padding: "9px 14px" }}
                title={family === null ? "Looking up the sender…" : undefined}
              >
                Convert to PSR
              </button>
            )}
            {canConvert && actionable && (
              <button
                onClick={() => onJunk(email)}
                style={{ ...srButton("danger"), padding: "9px 14px" }}
              >
                Mark junk
              </button>
            )}
            <button
              className="ivr-ghost"
              onClick={() => onMarkUnread(email)}
              title="Show it as new again in the list"
            >
              Mark as unread
            </button>
          </section>

          <section className="ivr-card">
            <div className="ivr-card-h">{email.subject || "(no subject)"}</div>
            <div className="ivr-muted">
              Received {new Date(email.receivedAt).toLocaleString()}
              {email.dueAt ? ` · Due ${new Date(email.dueAt).toLocaleString()}` : ""}
            </div>
            <div
              style={{
                whiteSpace: "pre-wrap",
                color: "#334155",
                fontSize: 13,
                lineHeight: 1.55,
                border: "1px solid #eef2f7",
                borderRadius: 10,
                padding: 12,
                background: "#fbfdff",
                overflowWrap: "anywhere",
              }}
            >
              {body || "No email body captured."}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};

export default EmailDrawer;
