import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import SrPage from "../components/sr/SrPage";
import { srStyles, srButton } from "../utils/srTheme";
import { useProjectContext } from "../contexts/ProjectContext";
import {
  serviceRequestApi,
  SR_STATUS_META,
  priorityMeta,
  sourceMeta,
  compactAge,
} from "../services/serviceRequests";

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
  createdAt: string;
  updatedAt?: string;
}

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

const SourceTag: React.FC<{ value?: string }> = ({ value }) => {
  const m = sourceMeta(value);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 13,
        color: "#374151",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
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
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await serviceRequestApi.list({
        interactionType: "PSR",
        status,
        search: search.trim() || undefined,
        projectId:
          viewMode === "single" && currentProjectId
            ? currentProjectId
            : undefined,
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
  }, [status, search, page, currentProjectId, viewMode]);

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

        <div style={{ ...srStyles.card, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 1180,
            }}
          >
            <thead>
              <tr>
                <th style={th}>Service ID</th>
                <th style={th}>Subject</th>
                <th style={th}>Category</th>
                <th style={th}>Priority</th>
                <th style={th}>Status</th>
                <th style={th}>Source</th>
                <th style={th}>Mode</th>
                <th style={th}>Linked ISRs</th>
                <th style={th}>Assigned To</th>
                <th style={th}>Student</th>
                <th style={th}>Channel</th>
                <th style={th}>Age</th>
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
                    <td style={td}>
                      <SourceTag value={r.submissionSource} />
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
