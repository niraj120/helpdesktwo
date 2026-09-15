import React from "react";
import {
  ClockIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { usePermissions } from "../../hooks/usePermissions";
import { SR } from "../../utils/srTheme";
import LinkedIsrPanel from "./LinkedIsrPanel";
import SrLifecyclePanel from "./SrLifecyclePanel";
import SrStatusProgress from "./SrStatusProgress";

type Width = "full" | "half" | "third";

interface CardConfig {
  key: string;
  label: string;
  enabled: boolean;
  order: number;
  width: Width;
  requiredPermission?: string;
}

const cardShell = (title: string, icon: React.ReactNode, children: React.ReactNode) => (
  <div
    style={{
      background: SR.bg,
      border: `1px solid ${SR.border}`,
      borderRadius: 16,
      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.055)",
      padding: 18,
      height: "100%",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span
        style={{
          width: 34,
          height: 34,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          background: "#eff6ff",
          color: SR.primary,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <h3 style={{ margin: 0, color: SR.text, fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>
        {title}
      </h3>
    </div>
    {children}
  </div>
);

const field = (label: string, value?: React.ReactNode) => (
  <div
    style={{
      border: "1px solid #eef2f7",
      background: "#f9fafc",
      borderRadius: 12,
      padding: "10px 12px",
      minWidth: 0,
    }}
  >
    <div
      style={{
        color: "#667085",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        marginBottom: 5,
      }}
    >
      {label}
    </div>
    <div
      style={{
        color: SR.text,
        fontSize: 13,
        fontWeight: 650,
        overflowWrap: "anywhere",
      }}
    >
      {value || <span style={{ color: SR.sub, fontWeight: 500 }}>-</span>}
    </div>
  </div>
);

const userName = (u: any) =>
  !u
    ? "-"
    : u.fullName ||
      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
      u.email ||
      u._id;

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString() : "-";

const timeUntil = (value?: string) => {
  if (!value) return "-";
  const diff = new Date(value).getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const text = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  return diff < 0 ? `Overdue by ${text}` : `${text} left`;
};

const getProjectId = (ticket: any) => {
  const raw = ticket?.projectId || ticket?.project || ticket?.metadata?.projectId;
  return typeof raw === "object" ? raw?._id : raw;
};

const SrSlaBanner: React.FC<{ ticket: any }> = ({ ticket }) => {
  const due = ticket?.roleLevelSLA?.dueAt || ticket?.ticketLevelSLA?.dueAt;
  const breached = ticket?.roleLevelSLA?.breachedAt || ticket?.ticketLevelSLA?.breachedAt;
  const closed = ticket?.closedAt || ticket?.resolvedAt;
  const tone = breached ? "bad" : closed ? "good" : "normal";
  const color = tone === "bad" ? "#b91c1c" : tone === "good" ? "#047857" : SR.primary;
  const bg = tone === "bad" ? "#fef2f2" : tone === "good" ? "#ecfdf5" : "#eff6ff";

  return (
    <div
      style={{
        border: `1px solid ${tone === "bad" ? "#fecaca" : tone === "good" ? "#bbf7d0" : "#bfdbfe"}`,
        background: bg,
        borderRadius: 16,
        padding: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.045)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fff",
            color,
            flexShrink: 0,
          }}
        >
          <ShieldCheckIcon style={{ width: 18, height: 18 }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color, fontSize: 12, fontWeight: 800 }}>
            {breached ? "SLA breached" : closed ? "SLA met / closed" : "SLA running"}
          </div>
          <div style={{ color: SR.text, fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>
            {due ? timeUntil(due) : "No SLA deadline"}
          </div>
        </div>
      </div>
      <div style={{ color: SR.sub, fontSize: 12, textAlign: "right", flexShrink: 0 }}>
        {due ? `Due ${formatDateTime(due)}` : "Deadline not available"}
      </div>
    </div>
  );
};

const WipCommitmentCard: React.FC<{ ticket: any; title: string }> = ({
  ticket,
  title,
}) =>
  cardShell(
    title,
    <ClockIcon style={{ width: 17, height: 17 }} />,
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
      {field("Committed date", formatDateTime(ticket?.wip?.committedDate))}
      {field("Time remaining", timeUntil(ticket?.wip?.committedDate))}
      {field("Revision count", ticket?.wip?.revisionCount ?? 0)}
    </div>,
  );

const PslAssignmentCard: React.FC<{ ticket: any; title: string }> = ({
  ticket,
  title,
}) =>
  cardShell(
    title,
    <ShieldCheckIcon style={{ width: 17, height: 17 }} />,
    <div style={{ display: "grid", gap: 12 }}>
      {field("Assigned to", userName(ticket?.assignedTo))}
      {field("Assigned via", ticket?.assignedVia || "Manual / current owner")}
      {field("Location", ticket?.metadata?.centerId?.centerName || ticket?.metadata?.centerId)}
    </div>,
  );

const ParentStudentCard: React.FC<{ ticket: any; title: string }> = ({
  ticket,
  title,
}) =>
  cardShell(
    title,
    <UserGroupIcon style={{ width: 17, height: 17 }} />,
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
      {field("Student", ticket?.metadata?.studentName || userName(ticket?.createdBy))}
      {field("Student email", ticket?.metadata?.studentEmail)}
      {field("Student phone", ticket?.metadata?.studentPhone)}
      {field("Channel", ticket?.metadata?.classification || ticket?.submissionSource)}
      {field("Parent", ticket?.metadata?.parent?.name)}
      {field("Parent phone", ticket?.metadata?.parent?.mobile)}
    </div>,
  );

const SrDetailsCard: React.FC<{ ticket: any; title: string }> = ({ ticket, title }) =>
  cardShell(
    title,
    <DocumentTextIcon style={{ width: 17, height: 17 }} />,
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
      {field("Ticket number", ticket?.ticketNumber)}
      {field("Priority", ticket?.priority)}
      {field("Category", ticket?.categoryHierarchy?.displayPath || ticket?.category)}
      {field("Mode", ticket?.modeOfContact || ticket?.submissionSource)}
      {field("Created", formatDateTime(ticket?.createdAt))}
      {field("Updated", formatDateTime(ticket?.updatedAt))}
    </div>,
  );

// Mobile: every card is full-width (grid-cols-1). lg+: span the 12-col track.
const cardSpan = (width: Width) =>
  width === "full"
    ? "col-span-1 lg:col-span-12"
    : width === "half"
      ? "col-span-1 lg:col-span-6"
      : "col-span-1 lg:col-span-4";

// Parent-facing cards: an ISR is internal and has no parent or PSL.
const psrOnly = new Set(["linkedIsr", "parentStudent", "pslAssignment"]);
// Never rendered as a page card — the lifecycle actions (status / close /
// re-open / cancel / delegate) sit in the detail page's sidebar under Status.
const pageHidden = new Set(["lifecycleActions"]);

const PsrDetailLayout: React.FC<{
  ticket: any;
  config?: any;
  onChanged: () => void;
}> = ({ ticket, config, onChanged }) => {
  const { hasPermission } = usePermissions();
  const detail = config?.psrDetail;
  const cards: CardConfig[] = [...(detail?.cards || [])].sort(
    (a, b) => (a.order || 0) - (b.order || 0),
  );
  const isPsr = ticket?.interactionType === "PSR";
  const projectId = getProjectId(ticket);

  const canShow = (item: CardConfig) =>
    item.enabled &&
    !pageHidden.has(item.key) &&
    (!item.requiredPermission || hasPermission(item.requiredPermission)) &&
    (isPsr || !psrOnly.has(item.key));

  const renderCard = (card: CardConfig) => {
    if (card.key === "sla") return <SrSlaBanner ticket={ticket} />;
    if (card.key === "wipCommitment")
      return <WipCommitmentCard ticket={ticket} title={card.label} />;
    if (card.key === "pslAssignment")
      return <PslAssignmentCard ticket={ticket} title={card.label} />;
    if (card.key === "parentStudent")
      return <ParentStudentCard ticket={ticket} title={card.label} />;
    if (card.key === "psrDetails")
      return <SrDetailsCard ticket={ticket} title={card.label} />;
    if (card.key === "lifecycleActions")
      return <SrLifecyclePanel ticket={ticket} onChanged={onChanged} />;
    if (card.key === "linkedIsr")
      return <LinkedIsrPanel psrId={ticket?._id} projectId={projectId} />;
    return null;
  };

  if (!ticket || !detail) return null;

  return (
    <div style={{ margin: "0 0 24px" }}>
      {detail.statusProgress?.enabled && (
        <SrStatusProgress
          ticket={ticket}
          projectId={projectId}
          defaultOpen={detail.statusProgress.defaultOpen}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {cards.filter(canShow).map((card) => (
          <div
            key={card.key}
            className={cardSpan(card.width)}
            style={{ minWidth: 0 }}
          >
            {renderCard(card)}
          </div>
        ))}
      </div>

    </div>
  );
};

export default PsrDetailLayout;
export { getProjectId };
