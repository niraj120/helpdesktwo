import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import SrPage from "../../components/sr/SrPage";
import { SR, srStyles, srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { PERMISSIONS } from "../../constants/permissions";
import { usePermissions } from "../../hooks/usePermissions";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import {
  serviceRequestApi,
  priorityMeta,
  compactAge,
} from "../../services/serviceRequests";

interface LinkedIsrRef {
  _id: string;
  ticketNumber: string;
  status: number;
}
interface SrRow {
  _id: string;
  ticketNumber: string;
  subject: string;
  status: number;
  priority?: string;
  modeOfContact?: string;
  submissionSource?: string;
  interactionType?: string;
  categoryHierarchy?: { displayPath?: string };
  assignedTo?: { firstName?: string; lastName?: string; fullName?: string };
  createdBy?: { firstName?: string; lastName?: string; fullName?: string };
  metadata?: {
    studentName?: string;
    studentEnrollment?: string;
    classification?: string;
    children?: Array<{ name?: string }>;
  };
  linkedIsr?: { total: number; done: number };
  linkedIsrs?: LinkedIsrRef[];
  /** Set when this row itself sits under a parent ticket (linked ISR). */
  linkedParent?: {
    _id: string;
    ticketNumber: string;
    interactionType?: string;
    subject?: string;
  };
  /** Set on a secondary: the request it was merged into. */
  mergedIntoTicket?: { _id: string; ticketNumber: string; subject?: string } | null;
  /** Set on a primary: the requests merged into it. */
  mergedTicketsInfo?: { _id: string; ticketNumber: string; subject?: string }[];
  wip?: { committedDate?: string };
  createdAt: string;
  updatedAt?: string;
}

interface SelectOption {
  value: string;
  label: string;
}

type RequestScopeKey = "project" | "assigned" | "raised" | "my";

interface RequestScopeOption {
  key: RequestScopeKey;
  label: string;
  description: string;
  permissions: string[];
}

interface SrFilters {
  interactionType: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
  priority: string;
  wipFrom: string;
  wipTo: string;
  wipState: string;
  source: string;
  classification: string;
  linkedIsrState: string;
  /** Filter to requests carrying this tag — the batch-working workflow. */
  tags: string;
  sortBy: string;
  sortOrder: string;
}

const DEFAULT_FILTERS: SrFilters = {
  interactionType: "all",
  createdFrom: "",
  createdTo: "",
  updatedFrom: "",
  updatedTo: "",
  priority: "",
  wipFrom: "",
  wipTo: "",
  wipState: "",
  source: "",
  classification: "",
  linkedIsrState: "",
  tags: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

const LIVE_REFRESH_INTERVAL_MS = 15000;

const SOURCE_OPTIONS: SelectOption[] = [
  { value: "", label: "Any source" },
  { value: "online", label: "Via Parent / Online" },
  { value: "walk_in", label: "Walk-in / New Request" },
  { value: "offline", label: "Offline / Legacy Walk-in" },
  { value: "email", label: "Via Mail" },
  { value: "ivr", label: "Via IVR" },
  { value: "phone", label: "Phone" },
  { value: "self_service", label: "Self-service" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "chatbot", label: "Chatbot" },
];

// How the request reached us (Ticket.submissionSource), for the list column.
const SOURCE_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  email: { label: "Email", icon: "✉", color: "#1d4ed8", bg: "#eef2ff" },
  ivr: { label: "IVR call", icon: "📞", color: "#7c3aed", bg: "#f5f3ff" },
  phone: { label: "Phone", icon: "📞", color: "#7c3aed", bg: "#f5f3ff" },
  self_service: { label: "Self-service", icon: "🌐", color: "#047857", bg: "#ecfdf5" },
  online: { label: "Parent portal", icon: "🌐", color: "#047857", bg: "#ecfdf5" },
  walk_in: { label: "Walk-in", icon: "🏫", color: "#b45309", bg: "#fffbeb" },
  offline: { label: "Walk-in (legacy)", icon: "🏫", color: "#b45309", bg: "#fffbeb" },
  whatsapp: { label: "WhatsApp", icon: "💬", color: "#047857", bg: "#ecfdf5" },
  sms: { label: "SMS", icon: "✉", color: "#0891b2", bg: "#ecfeff" },
  chatbot: { label: "Chatbot", icon: "🤖", color: "#0891b2", bg: "#ecfeff" },
};

const CHANNEL_OPTIONS: SelectOption[] = [
  { value: "", label: "Any channel" },
  { value: "existing_parent", label: "Existing Parent" },
  { value: "prospect_parent", label: "Prospect Parent" },
  { value: "vendor", label: "Vendor / Business" },
  { value: "job", label: "Job Application" },
  { value: "others", label: "Others / General" },
  { value: "junk", label: "Junk / Telemarketing" },
];

const WIP_STATE_OPTIONS: SelectOption[] = [
  { value: "", label: "Any WIP date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due this week" },
  { value: "none", label: "No WIP date" },
];

const LINKED_ISR_OPTIONS: SelectOption[] = [
  { value: "", label: "Any ISR state" },
  { value: "none", label: "No linked ISRs" },
  { value: "pending", label: "Has pending ISRs" },
  { value: "completed", label: "All ISRs done" },
];
const REQUEST_TYPE_OPTIONS: SelectOption[] = [
  { value: "all", label: "PSR and ISR" },
  { value: "PSR", label: "PSR only" },
  { value: "ISR", label: "ISR only" },
];
// SLA buckets under each open status (Vector's Overdue / Due Today / Pending).
type SlaBucket = "overdue" | "today" | "pending";
const SLA_BUCKETS: Array<{
  key: SlaBucket;
  label: string;
  color: string;
  hint: string;
}> = [
  { key: "overdue", label: "Overdue", color: "#dc2626", hint: "SLA already crossed" },
  { key: "today", label: "Due today", color: "#d97706", hint: "SLA runs out later today" },
  { key: "pending", label: "Pending", color: "#2563eb", hint: "Every request not yet resolved, closed or cancelled" },
];

// Who re-opened a request: the parent (requester) or an agent (creator / PSL).
type ReopenBy = "parent" | "agent";
const REOPEN_BY: Array<{ key: ReopenBy; label: string; color: string; hint: string }> = [
  { key: "parent", label: "Parent", color: "#7c3aed", hint: "Re-opened by the requester (parent)" },
  { key: "agent", label: "Agent", color: "#0891b2", hint: "Re-opened by the creator or PSL" },
];

const REQUEST_TYPE_TOGGLE_OPTIONS: SelectOption[] = [
  { value: "all", label: "All" },
  { value: "PSR", label: "PSR" },
  { value: "ISR", label: "ISR" },
];
const REQUEST_SCOPE_OPTIONS: RequestScopeOption[] = [
  {
    key: "project",
    label: "Total Requests",
    description: "All PSR/ISR tickets in this project",
    permissions: [PERMISSIONS.SR_VIEW_ALL],
  },
  {
    key: "assigned",
    label: "Assigned to Me",
    description: "Tickets currently assigned to you",
    permissions: [PERMISSIONS.SR_VIEW_OWN],
  },
  {
    key: "raised",
    label: "Raised by Me",
    description: "PSR/ISR tickets you created",
    permissions: [
      PERMISSIONS.SR_VIEW_OWN,
      PERMISSIONS.SR_PSR_CREATE,
      PERMISSIONS.SR_ISR_CREATE,
    ],
  },
  {
    key: "my",
    label: "My Requests",
    description: "Tickets you raised or received",
    permissions: [
      PERMISSIONS.SR_VIEW_OWN,
      PERMISSIONS.SR_PSR_CREATE,
      PERMISSIONS.SR_ISR_CREATE,
    ],
  },
];

/** existing_parent → "Existing Parent" */
const humanize = (k?: string) =>
  !k
    ? "—"
    : k
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

const name = (u?: {
  firstName?: string;
  lastName?: string;
  fullName?: string;
}) =>
  !u
    ? "—"
    : u.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || "—";

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString() : "-";

const optionLabel = (options: SelectOption[], value: string) =>
  options.find((o) => o.value === value)?.label || value;

// Label/colour come from the project's status master (SLA & Escalation).
const StatusChip: React.FC<{ status: number; projectId?: string }> = ({
  status,
  projectId,
}) => {
  const { metaFor } = useProjectStatuses(projectId);
  const m = metaFor(status);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "9999px",
        fontSize: "12px",
        fontWeight: 600,
        color: m.color,
        background: m.bg,
      }}
    >
      {m.label}
    </span>
  );
};

const Pill: React.FC<{
  color: string;
  bg: string;
  children: React.ReactNode;
}> = ({ color, bg, children }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 9px",
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 600,
      color,
      background: bg,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

const PriorityChip: React.FC<{ value?: string }> = ({ value }) => {
  const m = priorityMeta(value);
  return (
    <Pill color={m.color} bg={m.bg}>
      {m.label}
    </Pill>
  );
};

/** Compact linked-ISR progress card with a hover popover listing each ISR. */
const LinkedIsrCell: React.FC<{
  row: SrRow;
  onOpen: (id: string) => void;
  projectId?: string;
}> = ({ row, onOpen, projectId }) => {
  const [open, setOpen] = useState(false);
  const { metaFor } = useProjectStatuses(projectId);
  const total = row.linkedIsr?.total || 0;
  const done = row.linkedIsr?.done || 0;
  const pending = Math.max(0, total - done);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const state =
    total === 0 ? "none" : pending === 0 ? "done" : "pending";
  const barColor =
    state === "done" ? "#10b981" : state === "pending" ? "#f59e0b" : "#e5e7eb";
  const dot =
    state === "done" ? "#10b981" : state === "pending" ? "#ef4444" : "#9ca3af";

  return (
    <div
      style={{ position: "relative", minWidth: 96 }}
      onMouseEnter={() => total > 0 && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (total > 0) setOpen((o) => !o);
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "#9ca3af",
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        Linked ISRs
      </div>
      {total === 0 ? (
        <span style={{ fontSize: 12, color: "#9ca3af" }}>No ISRs</span>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              fontSize: 14,
              fontWeight: 700,
              color: "#111827",
            }}
          >
            {done}
            <span style={{ color: "#9ca3af", fontWeight: 500 }}>/{total}</span>
            {state === "done" && (
              <span style={{ color: "#10b981", fontSize: 12 }}>✓</span>
            )}
          </div>
          <div
            style={{
              height: 5,
              borderRadius: 9999,
              background: "#eef1f6",
              overflow: "hidden",
              margin: "4px 0 3px",
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

          {pending > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "#6b7280",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 9999,
                  background: dot,
                  display: "inline-block",
                }}
              />
              {pending} pending
            </div>
          )}

          {open && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 20,
                marginTop: 6,
                minWidth: 230,
                background: "#fff",
                border: "1px solid #e7ebf3",
                borderRadius: 12,
                boxShadow: "0 12px 32px rgba(15,23,42,0.16)",
                padding: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  padding: "4px 8px 6px",
                }}
              >
                {done}/{total} resolved
              </div>
              {(row.linkedIsrs || []).map((isr) => {
                const m = metaFor(isr.status);
                return (
                  <div
                    key={isr._id}
                    className="sr-linked-isr-row"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(isr._id);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "7px 8px",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#2563EB",
                      }}
                    >
                      {isr.ticketNumber}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "1px 8px",
                        borderRadius: 9999,
                        color: m.color,
                        background: m.bg,
                      }}
                    >
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ServiceRequests: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasAnyPermission } = usePermissions();
  // Follow the global project switcher: in single-project view scope to the
  // current project; in unified view the backend scopes to accessible projects.
  const { currentProjectId, viewMode } = useProjectContext();
  const [rows, setRows] = useState<SrRow[]>([]);
  const knownRowIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRowsRef = useRef(false);
  const [unreadRowIds, setUnreadRowIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  // SLA bucket (Overdue / Due today / Pending), layered on the selected status.
  const [due, setDue] = useState<SlaBucket | "">("");
  const [dueCounts, setDueCounts] = useState<
    Record<string, Record<SlaBucket, number>>
  >({});
  // Re-opened by the parent (requester) or an agent (creator / PSL).
  const [reopenedBy, setReopenedBy] = useState<ReopenBy | "">("");
  const [settledStatuses, setSettledStatuses] = useState<number[]>([]);
  const [reopenCounts, setReopenCounts] = useState<
    Record<string, Record<ReopenBy, number>>
  >({});
  const [page, setPage] = useState(1);
  const [viewScope, setViewScope] = useState<RequestScopeKey>("project");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SrFilters>(DEFAULT_FILTERS);
  const [priorityOptions, setPriorityOptions] = useState<SelectOption[]>([
    { value: "", label: "Any priority" },
  ]);
  const limit = 20;
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkMergeStep, setBulkMergeStep] = useState<"idle" | "pick-primary">("idle");
  const [bulkMergePrimaryId, setBulkMergePrimaryId] = useState("");

  const isProjectPortal = location.pathname.includes("/portal/");
  const storedProjectId = (() => {
    if (!isProjectPortal) return undefined;
    try {
      const raw = localStorage.getItem("projectContext");
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      return parsed?.projectId ? String(parsed.projectId) : undefined;
    } catch {
      return undefined;
    }
  })();
  const projectId = isProjectPortal
    ? currentProjectId || storedProjectId
    : viewMode === "single" && currentProjectId
      ? currentProjectId
      : undefined;
  // Status chips, stat cards and the status filter all read the project's
  // status master (SLA & Escalation).
  // In the all-projects view there is no single project to read the status
  // master from, so borrow the project of the first request seen.
  const [seenProjectId, setSeenProjectId] = useState<string>();
  const { statuses: projectStatuses } = useProjectStatuses(
    projectId || seenProjectId,
  );
  // No built-in status list: if the master has none, the filter offers "All"
  // only rather than inventing statuses this project may not use.
  const statusOptions: SelectOption[] = [
    { value: "all", label: "All statuses" },
    ...projectStatuses.map((st) => ({ value: String(st.code), label: st.label })),
  ];
  const detailPath = (id: string) =>
    isProjectPortal
      ? `${location.pathname.replace(/\/service-requests(?:\/[^/]+)?$/, "")}/service-requests/${id}`
      : `/service-requests/${id}`;
  const visibleScopes = useMemo(
    () =>
      REQUEST_SCOPE_OPTIONS.filter((option) =>
        hasAnyPermission(option.permissions),
      ),
    [hasAnyPermission],
  );
  const canDeleteSr = hasAnyPermission([
    PERMISSIONS.SR_DELETE,
    PERMISSIONS.SR_CONFIG_MANAGE,
  ]);
  const canMergeSr = hasAnyPermission([
    PERMISSIONS.SR_MERGE,
    PERMISSIONS.SR_CONFIG_MANAGE,
  ]);
  const canBulkActions = canDeleteSr || canMergeSr;
  const selectedRequestRows = useMemo(
    () => rows.filter((row) => selectedRequestIds.has(row._id)),
    [rows, selectedRequestIds],
  );
  const allRequestsSelected =
    rows.length > 0 && rows.every((row) => selectedRequestIds.has(row._id));

  useEffect(() => {
    if (!visibleScopes.length) return;
    if (!visibleScopes.some((option) => option.key === viewScope)) {
      setViewScope(visibleScopes[0].key);
      setPage(1);
    }
  }, [visibleScopes, viewScope]);

  // Which request types this project has switched on (SR Settings → step 1).
  // null = unknown / all-projects view, so every type stays selectable.
  const [enabledTypes, setEnabledTypes] = useState<Array<"PSR" | "ISR"> | null>(
    null,
  );
  useEffect(() => {
    if (!projectId) {
      setEnabledTypes(null);
      return;
    }
    let cancelled = false;
    serviceRequestApi
      .getConfig(projectId)
      .then((res: any) => {
        if (cancelled) return;
        const cfg = res?.data || {};
        const list: Array<"PSR" | "ISR"> = [];
        if (cfg?.psr?.enabled) list.push("PSR");
        if (cfg?.isr?.enabled) list.push("ISR");
        // Nothing configured yet — leave the filter unrestricted.
        setEnabledTypes(list.length ? list : null);
      })
      .catch(() => {
        if (!cancelled) setEnabledTypes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // With a single type enabled there is nothing to filter between: pin the
  // filter to it so the list never mixes in the disabled type.
  const soleType =
    enabledTypes && enabledTypes.length === 1 ? enabledTypes[0] : null;
  const requestTypeOptions = useMemo(
    () =>
      enabledTypes && enabledTypes.length < 2
        ? REQUEST_TYPE_OPTIONS.filter((option) =>
            enabledTypes.includes(option.value as "PSR" | "ISR"),
          )
        : REQUEST_TYPE_OPTIONS,
    [enabledTypes],
  );

  useEffect(() => {
    if (!soleType) return;
    setFilters((prev) =>
      prev.interactionType === soleType
        ? prev
        : { ...prev, interactionType: soleType },
    );
  }, [soleType]);

  const filterValue = (key: keyof SrFilters, value: string) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setPage(1);
    setStatus("all");
    setDue("");
    setReopenedBy("");
    setSearch("");
    setFilters(DEFAULT_FILTERS);
  };

  const toggleRequestSelect = (id: string) => {
    setBulkError("");
    setSelectedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllRequests = () => {
    setBulkError("");
    setSelectedRequestIds(
      allRequestsSelected ? new Set() : new Set(rows.map((row) => row._id)),
    );
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedRequestIds);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected service request(s)?`)) return;
    setBulkLoading(true);
    setBulkError("");
    try {
      await serviceRequestApi.bulkDelete(ids);
      setSelectedRequestIds(new Set());
      setBulkMergeStep("idle");
      setBulkMergePrimaryId("");
      await load();
    } catch (err: any) {
      setBulkError(err?.response?.data?.message || "Failed to delete service requests");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleConfirmBulkMerge = async () => {
    if (!bulkMergePrimaryId) return;
    const secondaryIds = Array.from(selectedRequestIds).filter(
      (id) => id !== bulkMergePrimaryId,
    );
    if (!secondaryIds.length) {
      setBulkError("Select at least one secondary service request to merge.");
      return;
    }
    setBulkLoading(true);
    setBulkError("");
    try {
      await serviceRequestApi.merge(bulkMergePrimaryId, secondaryIds);
      setSelectedRequestIds(new Set());
      setBulkMergeStep("idle");
      setBulkMergePrimaryId("");
      await load();
    } catch (err: any) {
      setBulkError(err?.response?.data?.message || "Failed to merge service requests");
    } finally {
      setBulkLoading(false);
    }
  };

  const activeFilters = [
    search.trim()
      ? { key: "search", label: `Search: ${search.trim()}` }
      : undefined,
    status !== "all"
      ? { key: "status", label: `Status: ${optionLabel(statusOptions, status)}` }
      : undefined,
    reopenedBy
      ? {
          key: "reopenedBy",
          label: `Re-opened by ${REOPEN_BY.find((r) => r.key === reopenedBy)?.label}`,
        }
      : undefined,
    due
      ? {
          key: "due",
          label: `SLA: ${SLA_BUCKETS.find((b) => b.key === due)?.label || due}`,
        }
      : undefined,
    filters.createdFrom
      ? { key: "createdFrom", label: `Created from ${filters.createdFrom}` }
      : undefined,
    filters.createdTo
      ? { key: "createdTo", label: `Created to ${filters.createdTo}` }
      : undefined,
    filters.updatedFrom
      ? { key: "updatedFrom", label: `Updated from ${filters.updatedFrom}` }
      : undefined,
    filters.updatedTo
      ? { key: "updatedTo", label: `Updated to ${filters.updatedTo}` }
      : undefined,
    filters.priority
      ? {
          key: "priority",
          label: `Priority: ${optionLabel(priorityOptions, filters.priority)}`,
        }
      : undefined,
    filters.interactionType && filters.interactionType !== "all"
      ? {
          key: "interactionType",
          label: `Type: ${optionLabel(requestTypeOptions, filters.interactionType)}`,
        }
      : undefined,
    filters.wipFrom
      ? { key: "wipFrom", label: `WIP from ${filters.wipFrom}` }
      : undefined,
    filters.wipTo ? { key: "wipTo", label: `WIP to ${filters.wipTo}` } : undefined,
    filters.wipState
      ? {
          key: "wipState",
          label: optionLabel(WIP_STATE_OPTIONS, filters.wipState),
        }
      : undefined,
    filters.source
      ? { key: "source", label: `Source: ${optionLabel(SOURCE_OPTIONS, filters.source)}` }
      : undefined,
    filters.classification
      ? {
          key: "classification",
          label: `Channel: ${optionLabel(CHANNEL_OPTIONS, filters.classification)}`,
        }
      : undefined,
    filters.tags
      ? {
          key: "tags",
          label: `Tag: ${filters.tags}`,
        }
      : null,
    filters.linkedIsrState
      ? {
          key: "linkedIsrState",
          label: optionLabel(LINKED_ISR_OPTIONS, filters.linkedIsrState),
        }
      : undefined,
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const activeFilterCount = activeFilters.length;

  const clearChip = (key: string) => {
    setPage(1);
    if (key === "search") setSearch("");
    else if (key === "status") setStatus("all");
    else if (key === "due") setDue("");
    else if (key === "reopenedBy") setReopenedBy("");
    else setFilters((prev) => ({ ...prev, [key as keyof SrFilters]: "" }));
  };

  useEffect(() => {
    let mounted = true;
    serviceRequestApi
      .activePriorities(projectId)
      .then((res) => {
        if (!mounted) return;
        const data = Array.isArray(res?.data) ? res.data : [];
        const options = data
          .map((p: any) => ({
            value: String(p.code || p.name || "").trim(),
            label: String(p.name || p.code || "").trim(),
          }))
          .filter((p: SelectOption) => p.value && p.label);
        setPriorityOptions([{ value: "", label: "Any priority" }, ...options]);
      })
      .catch(() => {
        if (mounted) setPriorityOptions([{ value: "", label: "Any priority" }]);
      });

    return () => {
      mounted = false;
    };
  }, [projectId]);

  const markRowRead = (id: string) => {
    setUnreadRowIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const highlightUnreadRow = (id: string) =>
    unreadRowIds.has(id)
      ? { background: "#fffbeb", boxShadow: "inset 3px 0 0 #f59e0b" }
      : {};

  const rememberRows = useCallback((items: SrRow[], silent?: boolean) => {
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

  // Tags actually in use, so the filter offers real choices instead of a
  // free-text box that silently matches nothing.
  const [tagOptions, setTagOptions] = useState<SelectOption[]>([]);
  useEffect(() => {
    serviceRequestApi
      .tags(projectId || undefined)
      .then((r: any) => {
        const list: string[] = Array.isArray(r?.data) ? r.data : [];
        setTagOptions([
          { value: "", label: "Any tag" },
          ...list.map((t) => ({ value: t, label: t })),
        ]);
      })
      .catch(() => setTagOptions([{ value: "", label: "Any tag" }]));
  }, [projectId]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const cleanedFilters = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value),
      );
      const res = await serviceRequestApi.list({
        interactionType: filters.interactionType || "all",
        viewScope,
        status,
        due: due || undefined,
        reopenedBy: reopenedBy || undefined,
        search: search.trim() || undefined,
        projectId,
        ...cleanedFilters,
        page,
        limit,
      });
      const items = (res.items as SrRow[]) || [];
      const firstProject = (items[0] as any)?.project;
      if (firstProject) {
        setSeenProjectId(
          (prev) => prev || String(firstProject._id || firstProject),
        );
      }
      rememberRows(items, options?.silent);
      setRows(items);
      setTotal(res.total || 0);
      setStatusCounts(res.statusCounts || {});
      setDueCounts(res.dueCounts || {});
      setReopenCounts(res.reopenCounts || {});
      setSettledStatuses(res.settledStatuses || []);
    } catch (e) {
      console.error("Failed to load service requests:", e);
      setRows([]);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [status, due, reopenedBy, search, projectId, filters, page, viewScope, rememberRows]);

  useEffect(() => {
    load();
  }, [load]);

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

  const th = srStyles.th;
  const td = srStyles.td;

  const statCards = [
    { key: "all", label: "All Requests", color: "#2563EB", bg: "#eff6ff" },
    ...projectStatuses.map((s) => ({
      key: String(s.code),
      label: s.label,
      color: s.color,
      bg: s.bg,
    })),
  ];

  const pagerBtn = (disabled: boolean): React.CSSProperties => ({
    padding: "7px 14px",
    borderRadius: 8,
    border: "1px solid #e7ebf3",
    background: "#fff",
    fontSize: 13,
    fontWeight: 600,
    color: disabled ? "#9ca3af" : "#374151",
    cursor: disabled ? "default" : "pointer",
  });

  const filterLabel: React.CSSProperties = {
    display: "block",
    marginBottom: 7,
    color: "#667085",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    lineHeight: 1,
  };

  const filterInput: React.CSSProperties = {
    ...srStyles.ctrl,
    width: "100%",
    height: 36,
    minHeight: 36,
    minWidth: 0,
    padding: "7px 12px",
    borderRadius: 9,
    borderColor: "#dbe3ef",
    background: "#fff",
    color: "#1f2937",
    fontSize: 12,
    fontWeight: 500,
    boxShadow: "0 1px 0 rgba(15, 23, 42, 0.02)",
  };

  const selectControl = (
    label: string,
    key: keyof SrFilters,
    options: SelectOption[],
  ) => (
    <label style={{ minWidth: 0 }}>
      <span style={filterLabel}>{label}</span>
      <select
        value={filters[key]}
        onChange={(e) => filterValue(key, e.target.value)}
        style={filterInput}
      >
        {options.map((option) => (
          <option key={option.value || "any"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const dateControl = (label: string, key: keyof SrFilters) => (
    <label style={{ minWidth: 0 }}>
      <span style={filterLabel}>{label}</span>
      <input
        type="date"
        value={filters[key]}
        onChange={(e) => filterValue(key, e.target.value)}
        style={filterInput}
      />
    </label>
  );

  const segmented = (
    ariaLabel: string,
    options: Array<{ value: string; label: string; title?: string }>,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 2,
        background: "#f1f5f9",
        borderRadius: 9,
        padding: 3,
      }}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            style={{
              border: "none",
              borderRadius: 7,
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: active ? "#fff" : "transparent",
              color: active ? SR.primary : "#475569",
              boxShadow: active ? "0 1px 3px rgba(15, 23, 42, 0.12)" : "none",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  // SLA buckets for the selected status. Settled statuses (resolved, closed,
  // cancelled) come back with none, so the row hides for them.
  // Always shown for open statuses (zeros included) so the options stay put.
  const buckets = dueCounts[status] || { overdue: 0, today: 0, pending: 0 };
  const hasSla =
    status === "all" || !settledStatuses.includes(Number(status));
  const subChip = (
    key: string,
    active: boolean,
    onPick: () => void,
    label: string,
    count: number,
    color: string,
    title: string,
  ) => {
    return (
      <button
        key={key || "all"}
        type="button"
        title={title}
        aria-pressed={active}
        onClick={() => {
          setPage(1);
          onPick();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 11px",
          borderRadius: 999,
          border: `1px solid ${active ? color : "#e2e8f0"}`,
          background: active ? `${color}14` : "#fff",
          color: active ? color : "#334155",
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap",
          cursor: "pointer",
          opacity: count || active ? 1 : 0.6,
        }}
      >
        {key && (
          <span
            style={{ width: 7, height: 7, borderRadius: 999, background: color }}
          />
        )}
        {label}
        <strong style={{ color: count ? color : "#94a3b8" }}>
          {count.toLocaleString()}
        </strong>
      </button>
    );
  };
  const subRowLabel = (text: string) => (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        color: "#64748b",
        textTransform: "uppercase",
        marginRight: 4,
        minWidth: 84,
      }}
    >
      {text}
    </span>
  );
  const subRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    padding: "8px 12px",
    background: "#f8fafc",
  };

  // "Re-opened by" shows under statuses the master marks as re-open ones.
  const selectedMeta = projectStatuses.find((st) => String(st.code) === status);
  const reopenBuckets = reopenCounts[status] || { parent: 0, agent: 0 };
  const reopenRow = selectedMeta?.isReopen ? (
      <div style={{ ...subRowStyle, borderBottom: "1px solid #eef2f7" }}>
        {subRowLabel("Re-opened by")}
        {subChip(
          "",
          reopenedBy === "",
          () => setReopenedBy(""),
          "All",
          statusCounts[status] || 0,
          SR.primary,
          "Every re-opened request in this status",
        )}
        {REOPEN_BY.map((r) =>
          subChip(
            r.key,
            reopenedBy === r.key,
            () => setReopenedBy(r.key),
            r.label,
            reopenBuckets[r.key],
            r.color,
            r.hint,
          ),
        )}
      </div>
    ) : null;

  const slaRow = hasSla ? (
    <div style={subRowStyle}>
      {subRowLabel("SLA")}
      {subChip(
        "",
        due === "",
        () => setDue(""),
        "All",
        statusCounts[status] || 0,
        SR.primary,
        "Every request in this view",
      )}
      {/* Pending (= not closed) only means something across all statuses. */}
      {SLA_BUCKETS.filter((b) => b.key !== "pending" || status === "all").map((b) =>
        subChip(
          b.key,
          due === b.key,
          () => setDue(b.key),
          b.label,
          buckets[b.key],
          b.color,
          b.hint,
        ),
      )}
    </div>
  ) : null;

  return (
    <SrPage
      title="Service Requests"
      subtitle="View and manage PSR/ISR tickets created by or assigned to permitted users."
      embedded={embedded}
      actions={
        embedded ? undefined : (
          <button
            onClick={() => navigate("/service-requests/create")}
            style={{ ...srButton("success"), whiteSpace: "nowrap" }}
          >
            + New Service Request
          </button>
        )
      }
    >
        {/* Toolbar — scope, type, search and filters on one row */}
        <div
          style={{
            ...srStyles.card,
            padding: 8,
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {visibleScopes.length > 1 &&
            segmented(
              "View",
              visibleScopes.map((o) => ({
                value: o.key,
                label: o.label,
                title: o.description,
              })),
              viewScope,
              (value) => {
                setViewScope(value as RequestScopeKey);
                setStatus("all");
                setDue("");
                setReopenedBy("");
                setPage(1);
              },
            )}

          {/* Only worth showing when the project actually runs both types. */}
          {!soleType &&
            segmented(
              "Request type",
              REQUEST_TYPE_TOGGLE_OPTIONS,
              filters.interactionType || "all",
              (value) => filterValue("interactionType", value),
            )}

          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
            <MagnifyingGlassIcon
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 15,
                height: 15,
                color: "#9CA3AF",
              }}
            />
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search SR #, subject, student, parent…"
              aria-label="Search service requests"
              style={{
                ...srStyles.ctrl,
                width: "100%",
                height: 36,
                paddingLeft: 34,
                fontSize: 13,
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 12px",
              borderRadius: 9,
              border: `1px solid ${activeFilterCount ? SR.primary : "#dbe3ef"}`,
              background: activeFilterCount ? "#eef2ff" : "#fff",
              color: activeFilterCount ? SR.primary : "#374151",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <FunnelIcon style={{ width: 14, height: 14 }} />
            Filters
            {activeFilterCount > 0 && (
              <span
                style={{
                  minWidth: 17,
                  height: 17,
                  padding: "0 5px",
                  borderRadius: 999,
                  background: SR.primary,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {activeFilterCount}
              </span>
            )}
            <ChevronDownIcon
              style={{
                width: 13,
                height: 13,
                transform: filtersOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
              }}
            />
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              style={{
                height: 36,
                padding: "0 10px",
                border: "none",
                background: "transparent",
                color: "#64748b",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Status first, then its SLA bucket underneath */}
        <div
          style={{
            ...srStyles.card,
            padding: 0,
            marginBottom: 10,
            overflow: "hidden",
          }}
        >
          <div
            role="tablist"
            aria-label="Filter by status"
            style={{
              display: "flex",
              overflowX: "auto",
              borderBottom: "1px solid #eef2f7",
              padding: "0 6px",
            }}
          >
            {statCards.map((s) => {
              const active = status === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setPage(1);
                    setStatus(s.key);
                    setDue("");
                    setReopenedBy("");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "11px 12px 9px",
                    border: "none",
                    borderBottom: `2px solid ${active ? s.color : "transparent"}`,
                    background: "transparent",
                    color: active ? s.color : "#475569",
                    fontSize: 13,
                    fontWeight: active ? 700 : 600,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  {s.label}
                  <span
                    style={{
                      minWidth: 22,
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: active ? s.color : s.bg,
                      color: active ? "#fff" : s.color,
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    {(statusCounts[s.key] || 0).toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>

          {reopenRow}
          {slaRow}
        </div>

        {(filtersOpen || activeFilters.length > 0) && (
        <div
          style={{
            ...srStyles.card,
            padding: "4px 14px 14px",
            marginBottom: 10,
            borderColor: activeFilterCount ? "#bfdbfe" : undefined,
          }}
        >
          {filtersOpen && (
            <div
              style={{
                marginTop: 10,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))",
                  gap: "13px 10px",
                  alignItems: "end",
                }}
              >
                {dateControl("Created from", "createdFrom")}
                {dateControl("Created to", "createdTo")}
                <label style={{ minWidth: 0 }}>
                  <span style={filterLabel}>Status</span>
                  <select
                    value={status}
                    onChange={(e) => {
                      setPage(1);
                      setStatus(e.target.value);
                    }}
                    style={filterInput}
                  >
                    {(statusOptions.length
                      ? statusOptions
                      : [{ value: "all", label: "All statuses" }]
                    ).map((option) => (
                      <option key={`status-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectControl("Priority", "priority", priorityOptions)}
                {selectControl("WIP state", "wipState", WIP_STATE_OPTIONS)}
                {dateControl("WIP from", "wipFrom")}
                {dateControl("WIP to", "wipTo")}
                {selectControl("Source", "source", SOURCE_OPTIONS)}
                {selectControl("Channel", "classification", CHANNEL_OPTIONS)}
                {!soleType &&
                  selectControl("Request type", "interactionType", requestTypeOptions)}
                {selectControl("Linked ISR", "linkedIsrState", LINKED_ISR_OPTIONS)}
                {tagOptions.length > 1 &&
                  selectControl("Tag", "tags", tagOptions)}
                {dateControl("Updated from", "updatedFrom")}
                {dateControl("Updated to", "updatedTo")}
                {selectControl("Sort by", "sortBy", [
                  { value: "createdAt", label: "Created date" },
                  { value: "updatedAt", label: "Updated date" },
                  { value: "wip.committedDate", label: "WIP date" },
                  { value: "priority", label: "Priority" },
                  { value: "status", label: "Status" },
                ])}
                {selectControl("Order", "sortOrder", [
                  { value: "desc", label: "Newest first" },
                  { value: "asc", label: "Oldest first" },
                ])}
              </div>
            </div>
          )}

          {activeFilters.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 12,
              }}
            >
              {activeFilters.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => clearChip(chip.key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    maxWidth: "100%",
                    minHeight: 24,
                    border: "1px solid #dbeafe",
                    borderRadius: 999,
                    background: "#f8fbff",
                    color: "#1e40af",
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Clear filter"
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {chip.label}
                  </span>
                  <XMarkIcon style={{ width: 12, height: 12, flex: "0 0 auto" }} />
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {canBulkActions && selectedRequestIds.size > 0 && (
          <div
            style={{
              ...srStyles.card,
              marginBottom: 14,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              borderColor: "#bfdbfe",
              background: "#f8fbff",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
                {selectedRequestIds.size} service request(s) selected
              </div>
              {bulkError && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#b91c1c" }}>
                  {bulkError}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canMergeSr && selectedRequestIds.size > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setBulkMergePrimaryId(Array.from(selectedRequestIds)[0] || "");
                    setBulkMergeStep("pick-primary");
                  }}
                  disabled={bulkLoading}
                  style={srButton("primary")}
                >
                  Merge
                </button>
              )}
              {canDeleteSr && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkLoading}
                  style={srButton("danger")}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedRequestIds(new Set());
                  setBulkMergeStep("idle");
                  setBulkMergePrimaryId("");
                  setBulkError("");
                }}
                style={srButton("neutral")}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {bulkMergeStep === "pick-primary" && (
          <div
            style={{
              ...srStyles.card,
              marginBottom: 14,
              padding: 16,
              borderColor: "#c7d2fe",
              background: "#fbfdff",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>
              Merge selected service requests
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
              Choose the primary PSR/ISR. Other selected requests will merge into it.
            </div>
            <select
              value={bulkMergePrimaryId}
              onChange={(event) => setBulkMergePrimaryId(event.target.value)}
              style={{ ...srStyles.ctrl, marginTop: 12, maxWidth: 520, width: "100%" }}
            >
              {selectedRequestRows.map((row) => (
                <option key={row._id} value={row._id}>
                  {row.ticketNumber} - {row.subject}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleConfirmBulkMerge}
                disabled={bulkLoading || !bulkMergePrimaryId}
                style={srButton("primary")}
              >
                {bulkLoading ? "Merging..." : "Confirm Merge"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkMergeStep("idle");
                  setBulkMergePrimaryId("");
                }}
                style={srButton("neutral")}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ ...srStyles.card, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: canBulkActions ? 1320 : 1280,
            }}
          >
            <thead>
              <tr>
                {canBulkActions && (
                  <th style={{ ...th, width: 42 }}>
                    <input
                      type="checkbox"
                      checked={allRequestsSelected}
                      onChange={toggleSelectAllRequests}
                    />
                  </th>
                )}
                {/* Wide enough for the number on one line plus a merge badge. */}
                <th style={{ ...th, minWidth: 148 }}>Service ID</th>
                <th style={th}>Subject</th>
                <th style={th}>Category</th>
                <th style={th}>Priority</th>
                <th style={th}>Status</th>
                <th style={th}>Raised via</th>
                <th style={th}>Linked ISRs</th>
                <th style={th}>Assigned To</th>
                <th style={th}>Student</th>
                <th style={th}>Channel</th>
                <th style={th}>Age</th>
                <th style={th}>WIP Date</th>
                <th style={th}>Updated</th>
                <th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={td} colSpan={canBulkActions ? 15 : 14}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td style={{ ...td, color: "#9ca3af" }} colSpan={canBulkActions ? 15 : 14}>
                    No service requests found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const open = [1, 2, 3, 6, 7].includes(r.status);
                  return (
                  <tr
                    key={r._id}
                    className="sr-table-row"
                    onClick={() => {
                      markRowRead(r._id);
                      navigate(detailPath(r._id));
                    }}
                    style={{ cursor: "pointer", transition: "background 0.12s ease", ...highlightUnreadRow(r._id) }}
                  >
                    {canBulkActions && (
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={selectedRequestIds.has(r._id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleRequestSelect(r._id)}
                        />
                      </td>
                    )}
                    <td style={td}>
                      <span
                        style={{
                          color: "#2563EB",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.ticketNumber}
                      </span>
                      {/* A linked ISR reads as standalone without this — show
                          the parent it belongs to, clickable through to it. */}
                      {r.linkedParent && (
                        <div
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(detailPath(r.linkedParent!._id));
                          }}
                          title={`Linked under ${r.linkedParent.ticketNumber}${
                            r.linkedParent.subject
                              ? ` — ${r.linkedParent.subject}`
                              : ""
                          }`}
                          style={{
                            marginTop: 2,
                            fontSize: 11,
                            color: "#6366f1",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                            cursor: "pointer",
                          }}
                        >
                          <span aria-hidden>🔗</span>
                          <span style={{ textDecoration: "underline" }}>
                            {r.linkedParent.ticketNumber}
                          </span>
                        </div>
                      )}
                      {/* Merge relations. One compact badge each, never
                          wrapping — the column is narrow, and a wrapped pill
                          reads as a blob rather than a label. */}
                      {r.mergedIntoTicket && (
                        <div
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(detailPath(r.mergedIntoTicket!._id));
                          }}
                          title={`Merged into ${r.mergedIntoTicket.ticketNumber}${
                            r.mergedIntoTicket.subject
                              ? ` — ${r.mergedIntoTicket.subject}`
                              : ""
                          }`}
                          style={{
                            marginTop: 3,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            maxWidth: "100%",
                            padding: "1px 7px",
                            borderRadius: 6,
                            background: "#faf5ff",
                            border: "1px solid #e9d5ff",
                            color: "#7c3aed",
                            fontSize: 11,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                          }}
                        >
                          <span aria-hidden>→</span>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {r.mergedIntoTicket.ticketNumber}
                          </span>
                        </div>
                      )}
                      {!!r.mergedTicketsInfo?.length && (
                        <div
                          title={`Merged in: ${r.mergedTicketsInfo
                            .map(
                              (m) =>
                                `${m.ticketNumber}${m.subject ? ` — ${m.subject}` : ""}`,
                            )
                            .join("\n")}`}
                          style={{
                            marginTop: 3,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "1px 7px",
                            borderRadius: 6,
                            background: "#f5f3ff",
                            border: "1px solid #ddd6fe",
                            color: "#6d28d9",
                            fontSize: 11,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            cursor: "help",
                          }}
                        >
                          <span aria-hidden>⧉</span>
                          {r.mergedTicketsInfo.length} merged
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, maxWidth: 240 }}>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 240,
                        }}
                        title={r.subject}
                      >
                        {r.subject}
                      </span>
                    </td>
                    <td style={td}>{r.categoryHierarchy?.displayPath || "—"}</td>
                    <td style={td}>
                      <PriorityChip value={r.priority} />
                    </td>
                    <td style={td}>
                      <StatusChip
                        status={r.status}
                        projectId={projectId || seenProjectId}
                      />
                    </td>
                    <td style={td}>
                      {/* How it reached us: the source the intake recorded,
                          falling back to the mode of contact typed in. */}
                      {(() => {
                        const meta = r.submissionSource
                          ? SOURCE_META[r.submissionSource]
                          : undefined;
                        if (!meta) {
                          return humanize(r.submissionSource || r.modeOfContact);
                        }
                        return (
                          <Pill color={meta.color} bg={meta.bg}>
                            <span aria-hidden>{meta.icon}</span>
                            {meta.label}
                          </Pill>
                        );
                      })()}
                    </td>
                    <td style={td}>
                      <LinkedIsrCell
                        row={r}
                        onOpen={(id) => navigate(detailPath(id))}
                        projectId={projectId}
                      />
                    </td>
                    <td style={td}>{name(r.assignedTo)}</td>
                    <td style={td}>
                      {/* The child the request is about. An ISR usually has
                          none: showing the raiser here read as the student. */}
                      {r.metadata?.studentName ||
                        r.metadata?.children?.find((c) => c?.name)?.name ||
                        "—"}
                    </td>
                    <td style={td}>{humanize(r.metadata?.classification)}</td>
                    <td style={td}>
                      <span
                        style={{
                          fontWeight: 600,
                          color: open ? "#b45309" : "#6b7280",
                        }}
                        title={new Date(r.createdAt).toLocaleString()}
                      >
                        {compactAge(r.createdAt)}
                      </span>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          color:
                            r.wip?.committedDate &&
                            new Date(r.wip.committedDate) < new Date() &&
                            [2, 7].includes(r.status)
                              ? "#b91c1c"
                              : "#6b7280",
                          fontWeight: r.wip?.committedDate ? 600 : 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(r.wip?.committedDate)}
                      </span>
                    </td>
                    <td style={{ ...td, color: "#6b7280" }}>
                      {compactAge(r.updatedAt)}
                    </td>
                    <td style={td}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Pagination */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 12,
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          <span>
            {total} total · page {page} of {Math.max(1, Math.ceil(total / limit))}
          </span>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={pagerBtn(page <= 1)}
          >
            Prev
          </button>
          <button
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
            style={pagerBtn(page >= Math.ceil(total / limit))}
          >
            Next
          </button>
        </div>
    </SrPage>
  );
};

export default ServiceRequests;
