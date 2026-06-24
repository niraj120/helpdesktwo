import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import SrPage from "../components/sr/SrPage";
import { srStyles, srButton } from "../utils/srTheme";
import { useProjectContext } from "../contexts/ProjectContext";
import {
  serviceRequestApi,
  SR_STATUS_META,
} from "../services/serviceRequests";

interface SrRow {
  _id: string;
  ticketNumber: string;
  subject: string;
  status: number;
  modeOfContact?: string;
  interactionType?: string;
  categoryHierarchy?: { displayPath?: string };
  assignedTo?: { firstName?: string; lastName?: string; fullName?: string };
  createdBy?: { firstName?: string; lastName?: string; fullName?: string };
  metadata?: { studentName?: string; studentEnrollment?: string };
  createdAt: string;
}

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
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Service ID</th>
                <th style={th}>Subject</th>
                <th style={th}>Category</th>
                <th style={th}>Mode</th>
                <th style={th}>Status</th>
                <th style={th}>Assigned To</th>
                <th style={th}>Student</th>
                <th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={td} colSpan={8}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td style={{ ...td, color: "#9ca3af" }} colSpan={8}>
                    No service requests found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
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
                    <td style={td}>{r.subject}</td>
                    <td style={td}>{r.categoryHierarchy?.displayPath || "—"}</td>
                    <td style={td}>{r.modeOfContact || "—"}</td>
                    <td style={td}>
                      <StatusChip status={r.status} />
                    </td>
                    <td style={td}>{name(r.assignedTo)}</td>
                    <td style={td}>
                      {r.metadata?.studentName || name(r.createdBy)}
                    </td>
                    <td style={td}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
