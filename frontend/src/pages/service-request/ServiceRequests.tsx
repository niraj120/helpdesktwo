import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import SrPage from "../../components/sr/SrPage";
import { SR, srStyles, srButton } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import {
  serviceRequestApi,
  SR_STATUS_META,
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
  };
  linkedIsr?: { total: number; done: number };
  linkedIsrs?: LinkedIsrRef[];
  wip?: { committedDate?: string };
  createdAt: string;
  updatedAt?: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SrFilters {
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
  sortBy: string;
  sortOrder: string;
}

const DEFAULT_FILTERS: SrFilters = {
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
  sortBy: "createdAt",
  sortOrder: "desc",
};

const SOURCE_OPTIONS: SelectOption[] = [
  { value: "", label: "Any source" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "email", label: "Email" },
  { value: "ivr", label: "IVR" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "chatbot", label: "Chatbot" },
];

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

const StatusChip: React.FC<{ status: number }> = ({ status }) => {
  const m = SR_STATUS_META[status] || {
    label: String(status),
    color: "#374151",
    bg: "#f3f4f6",
  };
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
}> = ({ row, onOpen }) => {
  const [open, setOpen] = useState(false);
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
                const m = SR_STATUS_META[isr.status] || {
                  label: String(isr.status),
                  color: "#374151",
                  bg: "#f3f4f6",
                };
                return (
                  <div
                    key={isr._id}
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
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f6f8fc")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
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
  // Follow the global project switcher: in single-project view scope to the
  // current project; in unified view the backend scopes to accessible projects.
  const { currentProjectId, viewMode } = useProjectContext();
  const [rows, setRows] = useState<SrRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<SrFilters>(DEFAULT_FILTERS);
  const [priorityOptions, setPriorityOptions] = useState<SelectOption[]>([
    { value: "", label: "Any priority" },
  ]);
  const [statusOptions, setStatusOptions] = useState<SelectOption[]>([]);
  const limit = 20;

  const projectId =
    viewMode === "single" && currentProjectId ? currentProjectId : undefined;

  const filterValue = (key: keyof SrFilters, value: string) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setPage(1);
    setStatus("all");
    setSearch("");
    setFilters(DEFAULT_FILTERS);
  };

  const activeFilters = [
    search.trim()
      ? { key: "search", label: `Search: ${search.trim()}` }
      : undefined,
    status !== "all"
      ? { key: "status", label: `Status: ${optionLabel(statusOptions, status)}` }
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
    else setFilters((prev) => ({ ...prev, [key as keyof SrFilters]: "" }));
  };

  useEffect(() => {
    let mounted = true;
    const fallbackStatuses = [
      { value: "all", label: "All statuses" },
      ...Object.entries(SR_STATUS_META).map(([code, meta]) => ({
        value: code,
        label: meta.label,
      })),
    ];

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

    if (!projectId) {
      setStatusOptions(fallbackStatuses);
      return () => {
        mounted = false;
      };
    }

    serviceRequestApi
      .projectStatuses(projectId)
      .then((res) => {
        if (!mounted) return;
        const data = Array.isArray(res?.data) ? res.data : [];
        const options = data
          .map((s: any) => ({
            value: String(s.code || "").trim(),
            label: String(s.name || s.label || "").trim(),
          }))
          .filter((s: SelectOption) => s.value && s.label);
        setStatusOptions(
          options.length
            ? [{ value: "all", label: "All statuses" }, ...options]
            : fallbackStatuses,
        );
      })
      .catch(() => {
        if (mounted) setStatusOptions(fallbackStatuses);
      });

    return () => {
      mounted = false;
    };
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cleanedFilters = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value),
      );
      const res = await serviceRequestApi.list({
        interactionType: "PSR",
        status,
        search: search.trim() || undefined,
        projectId,
        ...cleanedFilters,
        page,
        limit,
      });
      setRows((res.items as SrRow[]) || []);
      setTotal(res.total || 0);
      setStatusCounts(res.statusCounts || {});
    } catch (e) {
      console.error("Failed to load service requests:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, search, projectId, filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const th = srStyles.th;
  const td = srStyles.td;

  const statCards = [
    { key: "all", label: "All Requests", color: "#2563EB", bg: "#eff6ff" },
    ...Object.entries(SR_STATUS_META).map(([code, m]) => ({
      key: code,
      label: m.label,
      color: m.color,
      bg: m.bg,
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

  return (
    <SrPage
      title="Parent Service Requests"
      subtitle="View and manage Parent Service Requests (PSR)."
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
        {/* Status counters (click to filter) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {statCards.map((s) => {
            const active = status === s.key;
            return (
              <div
                key={s.key}
                onClick={() => {
                  setPage(1);
                  setStatus(s.key);
                }}
                style={{
                  background: active ? s.bg : "#fff",
                  border: active ? `2px solid ${s.color}` : "1px solid #e7ebf3",
                  borderRadius: 12,
                  padding: active ? "11px 13px" : "12px 14px",
                  boxShadow: active
                    ? `0 0 0 3px ${s.bg}`
                    : "0 2px 10px rgba(15, 23, 42, 0.04)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.borderColor = s.color;
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.borderColor = "#e7ebf3";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: active ? s.color : "#6b7280",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 8,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: s.bg,
                    color: s.color,
                    fontWeight: 700,
                    fontSize: 20,
                    lineHeight: 1,
                  }}
                >
                  {(statusCounts[s.key] || 0).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ ...srStyles.card, padding: 14 }}>
          <div style={{ position: "relative", maxWidth: 380 }}>
            <MagnifyingGlassIcon
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                width: 16,
                height: 16,
                color: "#9CA3AF",
              }}
            />
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search by SR # or subject…"
              style={{ ...srStyles.ctrl, width: "100%", paddingLeft: 38 }}
            />
          </div>
        </div>

        <div
          style={{
            ...srStyles.card,
            padding: "16px 14px 14px",
            borderRadius: 12,
            boxShadow: "0 3px 14px rgba(15, 23, 42, 0.045)",
            borderColor: activeFilterCount ? "#bfdbfe" : undefined,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              style={{
                ...srButton("neutral"),
                background: activeFilterCount ? SR.primary : "#6b7280",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                height: 36,
                padding: "0 13px",
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 800,
                boxShadow: activeFilterCount
                  ? "0 6px 14px rgba(37, 99, 235, 0.18)"
                  : "0 4px 10px rgba(15, 23, 42, 0.1)",
              }}
            >
              <FunnelIcon style={{ width: 14, height: 14 }} />
              Filters
              {activeFilterCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 17,
                    height: 17,
                    padding: "0 5px",
                    borderRadius: 999,
                    background: "#fff",
                    color: "#2563eb",
                    fontSize: 10,
                    fontWeight: 800,
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

            <button
              type="button"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
              style={{
                ...srButton("neutral"),
                height: 36,
                padding: "0 14px",
                borderRadius: 9,
                background: "#9ca3af",
                fontSize: 12,
                fontWeight: 800,
                opacity: activeFilterCount === 0 ? 0.7 : 1,
                cursor: activeFilterCount === 0 ? "default" : "pointer",
              }}
            >
              Reset
            </button>
          </div>

          {filtersOpen && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 14,
                borderTop: "1px solid #e8edf5",
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
                      : [
                          { value: "all", label: "All statuses" },
                          ...Object.entries(SR_STATUS_META).map(
                            ([code, meta]) => ({
                              value: code,
                              label: meta.label,
                            }),
                          ),
                        ]
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
                {selectControl("Linked ISR", "linkedIsrState", LINKED_ISR_OPTIONS)}
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

        <div style={{ ...srStyles.card, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 1280,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Service ID</th>
                <th style={th}>Subject</th>
                <th style={th}>Category</th>
                <th style={th}>Priority</th>
                <th style={th}>Status</th>
                <th style={th}>Mode</th>
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
                  <td style={td} colSpan={14}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td style={{ ...td, color: "#9ca3af" }} colSpan={14}>
                    No service requests found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const open = [1, 2, 3, 6, 7].includes(r.status);
                  return (
                  <tr
                    key={r._id}
                    onClick={() => navigate(`/tickets/${r._id}`)}
                    style={{ cursor: "pointer", transition: "background 0.12s ease" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f6f8fc")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td style={td}>
                      <span style={{ color: "#2563EB", fontWeight: 600 }}>
                        {r.ticketNumber}
                      </span>
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
                      <StatusChip status={r.status} />
                    </td>
                    <td style={td}>{r.modeOfContact || "—"}</td>
                    <td style={td}>
                      <LinkedIsrCell
                        row={r}
                        onOpen={(id) => navigate(`/tickets/${id}`)}
                      />
                    </td>
                    <td style={td}>{name(r.assignedTo)}</td>
                    <td style={td}>
                      {r.metadata?.studentName || name(r.createdBy)}
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
