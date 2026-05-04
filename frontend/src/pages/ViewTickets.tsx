import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import ModuleHeader from "../components/ModuleHeader";
import axios from "axios";
import { TicketExportModal } from "../components/tickets/TicketExportModal";
import { TicketMergeModal } from "../components/tickets/TicketMergeModal";
import {
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { API_CONFIG } from "../config/constants";
import { useSocket } from "../hooks/useSocket";
import toast from "react-hot-toast";

interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  title: string;
  status: string | number;
  priority: string;
  category?: {
    name: string;
  };
  assignedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  metadata?: {
    projectId?: {
      _id?: string;
      name: string;
      code: string;
    };
    studentName?: string;
    studentEmail?: string;
    centerId?:
      | string
      | {
          _id: string;
          centerName: string;
          city?: string;
          state?: string;
        };
    submissionType?: string;
  };
  createdAt: string;
  isMerged?: boolean;
  mergedInto?: string | { _id: string; ticketNumber: string };
  mergedTickets?: string[];
  /** True when a new ticket or student reply has not yet been viewed by an agent */
  hasNewReply?: boolean;
  roleLevelSLA?: {
    startedAt?: string;
    dueAt?: string;
    breachedAt?: string;
    pausedAt?: string;
    pausedDuration?: number;
  };
  ticketLevelSLA?: {
    dueAt?: string;
    breachedAt?: string;
    pausedAt?: string;
    pausedDuration?: number;
  };
}

interface Project {
  _id: string;
  name: string;
  code: string;
}

interface Agent {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

// US-ESC-009: SLA countdown helpers
const formatSlaRemaining = (ms: number): string => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const getSlaPill = (
  ticket: Ticket,
): { label: string; color: string; bg: string; tooltip: string } | null => {
  // For closed tickets, only the resolution SLA matters — not role-level escalation SLA.
  // roleLevelSLA.breachedAt means the escalation level timed out (ticket escalated), NOT
  // that the ticket resolution SLA was breached.
  // closedAt is the most reliable closed indicator — it works with any custom status code.
  const closedAt = (ticket as any).closedAt as string | undefined;
  const statusNum = Number(ticket.status);
  const isTicketClosed = !!(closedAt || statusNum === 4 || statusNum === 5);
  if (isTicketClosed) {
    const resolutionDue = ticket.ticketLevelSLA?.dueAt;
    if (!resolutionDue) return null;
    const closedMs = closedAt ? new Date(closedAt).getTime() : Date.now();
    const wasBreached = !!(
      ticket.ticketLevelSLA?.breachedAt ||
      closedMs > new Date(resolutionDue).getTime()
    );
    if (wasBreached)
      return {
        label: "BREACHED",
        color: "#dc2626",
        bg: "#fef2f2",
        tooltip: `SLA breached. Closed: ${new Date(closedAt ?? Date.now()).toLocaleString()}`,
      };
    return {
      label: "MET",
      color: "#15803d",
      bg: "#f0fdf4",
      tooltip: `Closed within SLA at ${new Date(closedAt ?? Date.now()).toLocaleString()}`,
    };
  }

  const dueAt = ticket.roleLevelSLA?.dueAt ?? ticket.ticketLevelSLA?.dueAt;
  if (!dueAt) return null;
  const isPaused = !!(
    ticket.roleLevelSLA?.pausedAt ?? ticket.ticketLevelSLA?.pausedAt
  );
  if (isPaused)
    return {
      label: "PAUSED",
      color: "#374151",
      bg: "#f3f4f6",
      tooltip: "SLA is paused",
    };
  const isBreached = !!(
    ticket.roleLevelSLA?.breachedAt ?? ticket.ticketLevelSLA?.breachedAt
  );
  const now = Date.now();
  const due = new Date(dueAt).getTime();
  const remaining = due - now;
  if (isBreached || remaining <= 0)
    return {
      label: "BREACHED",
      color: "#dc2626",
      bg: "#fef2f2",
      tooltip: `Due: ${new Date(dueAt).toLocaleString()}`,
    };
  const startedAt = ticket.roleLevelSLA?.startedAt;
  const start = startedAt ? new Date(startedAt).getTime() : due - 86400000;
  const total = due - start;
  const pct = total > 0 ? (remaining / total) * 100 : 100;
  const label = formatSlaRemaining(remaining);
  const tooltip = `Due: ${new Date(dueAt).toLocaleString()}`;
  if (pct > 50) return { label, color: "#15803d", bg: "#f0fdf4", tooltip };
  if (pct > 25) return { label, color: "#b45309", bg: "#fffbeb", tooltip };
  return { label, color: "#dc2626", bg: "#fef2f2", tooltip };
};

interface ViewTicketsProps {
  /** When rendered inside a project portal, lock the project filter to this ID */
  initialProjectId?: string;
  wrapWithLayout?: boolean;
}

const ViewTickets: React.FC<ViewTicketsProps> = ({
  initialProjectId,
  wrapWithLayout = true,
}) => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams<{ customUrlPath?: string }>();

  // Helper function to check permissions from localStorage
  const checkPermission = (permission: string): boolean => {
    const userPermissionsStr = localStorage.getItem("userPermissions");
    if (!userPermissionsStr) return false;
    try {
      const userPermissions = JSON.parse(userPermissionsStr);
      return (
        Array.isArray(userPermissions) && userPermissions.includes(permission)
      );
    } catch {
      return false;
    }
  };

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  // US-ESC-009: force re-render every 60s so SLA countdowns stay current
  const [, forceUpdate] = React.useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(() => forceUpdate(), 60000);
    return () => clearInterval(id);
  }, []);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTickets, setTotalTickets] = useState(0);
  const pageSize = 20;

  // Project + assignedTo filters (server-side)
  // When initialProjectId is provided (portal context), lock to that project
  const [filterProject, setFilterProject] = useState(initialProjectId ?? "all");
  const [filterAssignedTo, setFilterAssignedTo] = useState("all");
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  // Multi-select state
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkMergeStep, setBulkMergeStep] = useState<"idle" | "pick-primary">(
    "idle",
  );
  const [bulkMergePrimaryId, setBulkMergePrimaryId] = useState("");
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState("");

  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedTickets = useRef(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const canExport = checkPermission("TICKET_EXPORT");
  const canMerge = checkPermission("TICKET_MERGE");
  const canDelete = checkPermission("TICKET_DELETE");
  const hasViewAll = checkPermission("TICKET_VIEW_ALL");
  const userRole = localStorage.getItem("userRole") || "";

  // Real-time: track pending new-ticket badge so the user sees a refresh hint
  const [pendingNewTickets, setPendingNewTickets] = useState(0);

  // Build socket rooms: join the project-specific room when a project is locked, else join all-tickets
  const socketRooms = useMemo(() => {
    if (initialProjectId) return [`project-tickets-${initialProjectId}`];
    return ["all-tickets"];
  }, [initialProjectId]);

  useSocket({
    rooms: socketRooms,
    events: {
      "ticket-list-update": (payload: { type: string; ticket: any }) => {
        if (payload.type === "new-ticket") {
          // Prepend new ticket if on page 1 and no active filters
          setTickets((prev) => {
            const alreadyExists = prev.some(
              (t) => t._id === payload.ticket._id,
            );
            if (alreadyExists) return prev;
            if (currentPage === 1) {
              toast.success(`New ticket: ${payload.ticket.ticketNumber}`, {
                duration: 4000,
              });
              setTotalTickets((n) => n + 1);
              // Mark as unread so the amber highlight shows until the agent opens it
              return [
                { ...(payload.ticket as Ticket), hasNewReply: true },
                ...prev.slice(0, pageSize - 1),
              ];
            }
            // On other pages just show a badge
            setPendingNewTickets((n) => n + 1);
            return prev;
          });
        } else if (payload.type === "new-reply") {
          // Update hasNewReply on the matching ticket row
          setTickets((prev) =>
            prev.map((t) =>
              t._id === payload.ticket._id
                ? { ...t, hasNewReply: payload.ticket.hasNewReply }
                : t,
            ),
          );
        }
      },
    },
  });

  useEffect(() => {
    // Prevent duplicate calls from React.StrictMode
    if (hasFetchedTickets.current) {
      console.log("⏭️ Skipping duplicate tickets fetch (already loaded)");
      return;
    }
    hasFetchedTickets.current = true;
    fetchTickets(1, initialProjectId ?? "all", "all");
    if (!initialProjectId) fetchProjects(); // skip project list when locked to portal project
    fetchAgents();
  }, []);

  const fetchTickets = async (
    page: number = currentPage,
    projectFilter: string = filterProject,
    assignedToFilter: string = filterAssignedTo,
  ) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");

      if (!token) {
        navigate("/login");
        return;
      }

      const params: Record<string, string | number> = {
        page,
        limit: pageSize,
      };
      if (projectFilter !== "all") params.projectId = projectFilter;
      if (assignedToFilter === "unassigned") params.assignedTo = "unassigned";
      else if (assignedToFilter !== "all") params.assignedTo = assignedToFilter;

      const response = await axios.get(`${API_CONFIG.API_URL}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      if (response.data.success) {
        const ticketsData = response.data.data.tickets || response.data.data;
        const pagination = response.data.data.pagination;

        setTickets(Array.isArray(ticketsData) ? ticketsData : []);
        setSelectedTicketIds(new Set()); // clear selection on page change

        // Update pagination state
        if (pagination) {
          setCurrentPage(pagination.page || page);
          setTotalPages(pagination.totalPages || 1);
          setTotalTickets(pagination.total || ticketsData.length);
        } else {
          setTotalTickets(ticketsData.length);
          setTotalPages(1);
        }
      }
    } catch (error: any) {
      console.error("Error fetching tickets:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("authToken");
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/my-projects`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.data.success) {
        const data = response.data.data || response.data.projects || [];
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    }
  };

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/assignable-agents`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.data.success) {
        const data = response.data.data || [];
        setAgents(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    }
  };

  // Memoized filtered tickets to prevent recalculation on every render
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesStatus =
        filterStatus === "all" || ticket.status === filterStatus;
      const matchesSearch =
        ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.metadata?.studentEmail
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        ticket.metadata?.projectId?.name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [tickets, filterStatus, searchQuery]);

  // Convert numeric status code to label string
  const getStatusLabel = useCallback((status: string | number): string => {
    const numericMap: Record<number, string> = {
      1: "open",
      2: "in-progress",
      3: "pending",
      4: "resolved",
      5: "closed",
    };
    if (typeof status === "number") return numericMap[status] || "open";
    const n = Number(status);
    if (!isNaN(n) && numericMap[n]) return numericMap[n];
    return status.toLowerCase();
  }, []);

  const getStatusDisplayName = useCallback(
    (status: string | number): string => {
      const labelMap: Record<string, string> = {
        open: "Open",
        "in-progress": "In Progress",
        pending: "Pending",
        resolved: "Resolved",
        closed: "Closed",
      };
      return labelMap[getStatusLabel(status)] || String(status);
    },
    [getStatusLabel],
  );

  // Memoized status color getter to prevent creating new function on each render
  const getStatusColor = useCallback(
    (status: string | number) => {
      const colors: Record<string, string> = {
        open: "#3B82F6",
        "in-progress": "#F59E0B",
        resolved: "#10B981",
        closed: "#6B7280",
        pending: "#EF4444",
      };
      return colors[getStatusLabel(status)] || "#6B7280";
    },
    [getStatusLabel],
  );

  // ── Multi-select helpers ─────────────────────────────────────────────────
  const toggleTicketSelect = (id: string) => {
    setBulkError("");
    setSelectedTicketIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setBulkError("");
    if (selectedTicketIds.size === filteredTickets.length) {
      setSelectedTicketIds(new Set());
    } else {
      setSelectedTicketIds(new Set(filteredTickets.map((t) => t._id)));
    }
  };

  // ── Bulk delete ──────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    setBulkLoading(true);
    setBulkError("");
    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(`${API_CONFIG.API_URL}/tickets/bulk`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ticketIds: Array.from(selectedTicketIds) },
      });
      setSelectedTicketIds(new Set());
      setShowBulkDeleteConfirm(false);
      fetchTickets(1, filterProject, filterAssignedTo);
    } catch (err: any) {
      setBulkError(err.response?.data?.message || "Failed to delete tickets");
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Bulk merge ───────────────────────────────────────────────────────────
  const handleConfirmBulkMerge = async () => {
    if (!bulkMergePrimaryId) return;
    const secondaryIds = Array.from(selectedTicketIds).filter(
      (id) => id !== bulkMergePrimaryId,
    );
    setBulkLoading(true);
    setBulkError("");
    try {
      const token = localStorage.getItem("authToken");
      await axios.post(
        `${API_CONFIG.API_URL}/tickets/${bulkMergePrimaryId}/merge`,
        { ticketIds: secondaryIds },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSelectedTicketIds(new Set());
      setBulkMergeStep("idle");
      setBulkMergePrimaryId("");
      fetchTickets(1, filterProject, filterAssignedTo);
    } catch (err: any) {
      setBulkError(err.response?.data?.message || "Failed to merge tickets");
    } finally {
      setBulkLoading(false);
    }
  };

  const selectedTickets = filteredTickets.filter((t) =>
    selectedTicketIds.has(t._id),
  );

  if (loading) {
    const loadingContent = (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p>Loading tickets...</p>
      </div>
    );
    return wrapWithLayout ? (
      <DashboardLayout>{loadingContent}</DashboardLayout>
    ) : (
      loadingContent
    );
  }

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    wrapWithLayout ? (
      <DashboardLayout>{children}</DashboardLayout>
    ) : (
      <>{children}</>
    );

  return (
    <Wrapper>
      <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
        <ModuleHeader
          title={hasViewAll ? "All Queries" : "My Queries"}
          subtitle={
            hasViewAll
              ? "View and manage all support queries across all projects"
              : "View and manage queries assigned to you"
          }
        />

        {/* Real-time: pending new tickets banner */}
        {pendingNewTickets > 0 && (
          <div
            onClick={() => {
              setPendingNewTickets(0);
              fetchTickets(1, filterProject, filterAssignedTo);
            }}
            style={{
              background: "#3b82f6",
              color: "white",
              borderRadius: "8px",
              padding: "10px 16px",
              marginBottom: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: 500,
              fontSize: "14px",
            }}
          >
            <span>🔔</span>
            <span>
              {pendingNewTickets} new ticket{pendingNewTickets > 1 ? "s" : ""}{" "}
              arrived — click to refresh
            </span>
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            marginBottom: "16px",
          }}
        >
          {/* Row 1: Search + Status + Export */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <div style={{ flex: 1, minWidth: "200px" }}>
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                minWidth: "130px",
              }}
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            {canExport && (
              <button
                onClick={() => setShowExportModal(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  background: "#059669",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#047857")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#059669")
                }
              >
                <ArrowDownTrayIcon style={{ width: "16px", height: "16px" }} />
                Export
              </button>
            )}
          </div>

          {/* Row 2: Project filter + Assigned To filter */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {/* Hide project dropdown when locked to a portal project */}
            {!initialProjectId && projects.length > 0 && (
              <select
                value={filterProject}
                onChange={(e) => {
                  setFilterProject(e.target.value);
                  fetchTickets(1, e.target.value, filterAssignedTo);
                }}
                style={{
                  padding: "9px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  minWidth: "180px",
                  maxWidth: "280px",
                }}
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.code ? `(${p.code})` : ""}
                  </option>
                ))}
              </select>
            )}
            {agents.length > 0 && (
              <select
                value={filterAssignedTo}
                onChange={(e) => {
                  setFilterAssignedTo(e.target.value);
                  fetchTickets(1, filterProject, e.target.value);
                }}
                style={{
                  padding: "9px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  minWidth: "180px",
                  maxWidth: "260px",
                }}
              >
                <option value="all">All Agents</option>
                <option value="unassigned">Unassigned</option>
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.firstName} {a.lastName}
                  </option>
                ))}
              </select>
            )}
            {((initialProjectId ? false : filterProject !== "all") ||
              filterAssignedTo !== "all") && (
              <button
                onClick={() => {
                  if (!initialProjectId) setFilterProject("all");
                  setFilterAssignedTo("all");
                  fetchTickets(1, initialProjectId ?? "all", "all");
                }}
                style={{
                  padding: "9px 14px",
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px",
                  background: "#F9FAFB",
                  color: "#6B7280",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedTicketIds.size > 0 && (
          <>
            <div
              style={{
                background: "#1E40AF",
                color: "white",
                borderRadius: "10px",
                padding: "12px 20px",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "14px" }}>
                {selectedTicketIds.size} ticket
                {selectedTicketIds.size !== 1 ? "s" : ""} selected
              </span>
              {canMerge && selectedTicketIds.size >= 2 && (
                <button
                  onClick={() => {
                    const sel = filteredTickets.filter((t) =>
                      selectedTicketIds.has(t._id),
                    );
                    const getKey = (t: Ticket) =>
                      t.metadata?.studentEmail || t.metadata?.studentName || "";
                    const keys = new Set(sel.map(getKey));
                    if (keys.size > 1) {
                      setBulkError(
                        "Cannot merge tickets from different requestors. Please select tickets raised by the same person.",
                      );
                      return;
                    }
                    setBulkMergeStep("pick-primary");
                    setBulkMergePrimaryId("");
                    setBulkError("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    background: "rgba(255,255,255,0.2)",
                    border: "1px solid rgba(255,255,255,0.4)",
                    color: "white",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <ArrowsPointingInIcon
                    style={{ width: "15px", height: "15px" }}
                  />
                  Merge Selected
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => {
                    setShowBulkDeleteConfirm(true);
                    setBulkError("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    background: "rgba(239,68,68,0.8)",
                    border: "1px solid rgba(239,68,68,0.4)",
                    color: "white",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <TrashIcon style={{ width: "15px", height: "15px" }} />
                  Delete Selected
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedTicketIds(new Set());
                  setBulkError("");
                }}
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Clear selection
              </button>
            </div>
            {bulkMergeStep === "idle" && bulkError && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: "#B91C1C",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                {bulkError}
              </div>
            )}
          </>
        )}

        {/* Tickets Grid */}
        <div style={{ display: "grid", gap: "16px" }}>
          {/* Select-all row */}
          {filteredTickets.length > 0 && (canMerge || canDelete) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                background: "#F8FAFC",
                borderRadius: "8px",
                border: "1px solid #E5E7EB",
              }}
            >
              <input
                type="checkbox"
                checked={
                  filteredTickets.length > 0 &&
                  selectedTicketIds.size === filteredTickets.length
                }
                onChange={toggleSelectAll}
                style={{ width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span style={{ fontSize: "13px", color: "#6B7280" }}>
                Select all on this page ({filteredTickets.length})
              </span>
            </div>
          )}
          {filteredTickets.length === 0 ? (
            <div
              style={{
                background: "white",
                borderRadius: "12px",
                padding: "48px",
                textAlign: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              <p style={{ color: "#6B7280" }}>No tickets found</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => (
              <div
                key={ticket._id}
                style={{
                  background: selectedTicketIds.has(ticket._id)
                    ? "#EFF6FF"
                    : ticket.hasNewReply
                      ? "#FFFBEB"
                      : "white",
                  borderRadius: "12px",
                  padding: "20px",
                  boxShadow: ticket.hasNewReply
                    ? "0 1px 6px rgba(245,158,11,0.25)"
                    : "0 1px 3px rgba(0,0,0,0.1)",
                  transition: "all 0.2s",
                  border: selectedTicketIds.has(ticket._id)
                    ? "1.5px solid #3B82F6"
                    : ticket.hasNewReply
                      ? "1.5px solid #F59E0B"
                      : "1.5px solid transparent",
                  borderLeft:
                    ticket.hasNewReply && !selectedTicketIds.has(ticket._id)
                      ? "4px solid #F59E0B"
                      : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!selectedTicketIds.has(ticket._id)) {
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(0,0,0,0.15)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "12px",
                  }}
                >
                  {/* Checkbox + ticket info */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      flex: 1,
                    }}
                  >
                    {(canMerge || canDelete) && (
                      <input
                        type="checkbox"
                        checked={selectedTicketIds.has(ticket._id)}
                        onChange={() => toggleTicketSelect(ticket._id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: "16px",
                          height: "16px",
                          cursor: "pointer",
                          marginTop: "4px",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div
                      style={{ flex: 1, cursor: "pointer" }}
                      onClick={() => {
                        // Clear unread highlight when agent opens the ticket
                        setTickets((prev) =>
                          prev.map((t) =>
                            t._id === ticket._id
                              ? { ...t, hasNewReply: false }
                              : t,
                          ),
                        );
                        navigate(
                          initialProjectId && customUrlPath
                            ? `/${customUrlPath}/portal/tickets/${ticket._id}`
                            : `/tickets/${ticket._id}`,
                        );
                      }}
                    >
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#2563EB",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        #{ticket.ticketNumber}
                        {ticket.hasNewReply && (
                          <span
                            title="New / unread reply"
                            style={{
                              display: "inline-block",
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: "#F59E0B",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {ticket.mergedTickets &&
                          ticket.mergedTickets.length > 0 && (
                            <span
                              style={{
                                fontSize: "12px",
                                fontWeight: 500,
                                color: "#7C3AED",
                                marginLeft: "6px",
                              }}
                            >
                              ({ticket.mergedTickets.length} ticket
                              {ticket.mergedTickets.length > 1 ? "s" : ""}{" "}
                              merged)
                            </span>
                          )}
                      </span>
                      <h3
                        style={{
                          fontSize: "16px",
                          fontWeight: ticket.hasNewReply ? 700 : 600,
                          color: ticket.hasNewReply ? "#1F2937" : "#111827",
                          margin: "4px 0",
                        }}
                      >
                        {ticket.subject || "No subject"}
                      </h3>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        padding: "4px 12px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: getStatusColor(ticket.status) + "20",
                        color: getStatusColor(ticket.status),
                      }}
                    >
                      {getStatusDisplayName(ticket.status)}
                    </span>
                    {canMerge && !ticket.isMerged && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicket(ticket);
                          setShowMergeModal(true);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 12px",
                          background: "#3B82F6",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#2563EB")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "#3B82F6")
                        }
                        title="Merge this ticket with others"
                      >
                        <ArrowsPointingInIcon
                          style={{ width: "14px", height: "14px" }}
                        />
                        Merge
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "24px",
                    fontSize: "14px",
                    color: "#6B7280",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>Priority:</span>{" "}
                    <span style={{ textTransform: "capitalize" }}>
                      {ticket.priority}
                    </span>
                  </div>
                  {/* US-ESC-009: SLA countdown pill */}
                  {(() => {
                    const pill = getSlaPill(ticket);
                    if (!pill) return null;
                    return (
                      <div title={pill.tooltip}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "12px",
                            fontWeight: 600,
                            color: pill.color,
                            backgroundColor: pill.bg,
                            border: `1px solid ${pill.color}30`,
                          }}
                        >
                          ⏱ {pill.label}
                        </span>
                      </div>
                    );
                  })()}
                  <div>
                    <span style={{ fontWeight: 600 }}>Center:</span>{" "}
                    <span
                      style={{
                        padding: "2px 8px",
                        background:
                          ticket.metadata?.centerId === "online" ||
                          ticket.metadata?.submissionType === "online"
                            ? "#DBEAFE"
                            : "#FEF3C7",
                        color:
                          ticket.metadata?.centerId === "online" ||
                          ticket.metadata?.submissionType === "online"
                            ? "#1E40AF"
                            : "#92400E",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {ticket.metadata?.centerId === "online" ||
                      ticket.metadata?.submissionType === "online"
                        ? "Online"
                        : typeof ticket.metadata?.centerId === "object"
                          ? `${ticket.metadata.centerId.centerName}${ticket.metadata.centerId.city ? ` (${ticket.metadata.centerId.city})` : ""}`
                          : "Online"}
                    </span>
                  </div>
                  {ticket.metadata?.studentEmail && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Created By:</span>{" "}
                      {ticket.metadata?.studentName ||
                        ticket.metadata.studentEmail}
                    </div>
                  )}
                  {ticket.assignedTo && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Assigned To:</span>{" "}
                      {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                    </div>
                  )}
                  {ticket.category && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Category:</span>{" "}
                      {ticket.category.name}
                    </div>
                  )}
                  {ticket.createdAt && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Created At:</span>{" "}
                      {new Date(ticket.createdAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination and Summary */}
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "14px",
            color: "#6B7280",
          }}
        >
          {/* Pagination Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() =>
                fetchTickets(currentPage - 1, filterProject, filterAssignedTo)
              }
              disabled={currentPage <= 1 || loading}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #D1D5DB",
                background: currentPage <= 1 ? "#F3F4F6" : "white",
                color: currentPage <= 1 ? "#9CA3AF" : "#374151",
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                fontSize: "13px",
              }}
            >
              ← Previous
            </button>

            <span style={{ padding: "0 12px" }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() =>
                fetchTickets(currentPage + 1, filterProject, filterAssignedTo)
              }
              disabled={currentPage >= totalPages || loading}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #D1D5DB",
                background: currentPage >= totalPages ? "#F3F4F6" : "white",
                color: currentPage >= totalPages ? "#9CA3AF" : "#374151",
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                fontSize: "13px",
              }}
            >
              Next →
            </button>
          </div>

          {/* Summary */}
          <div>
            Showing {totalTickets > 0 ? (currentPage - 1) * pageSize + 1 : 0}-
            {Math.min(currentPage * pageSize, totalTickets)} of {totalTickets}{" "}
            tickets
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <TicketExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          filters={{
            status: filterStatus,
            projectId: filterProject !== "all" ? filterProject : undefined,
            assignedTo:
              filterAssignedTo !== "all" ? filterAssignedTo : undefined,
          }}
        />
      )}

      {/* Single-ticket Merge Modal */}
      {showMergeModal && selectedTicket && (
        <TicketMergeModal
          isOpen={showMergeModal}
          onClose={() => {
            setShowMergeModal(false);
            setSelectedTicket(null);
          }}
          primaryTicket={selectedTicket}
          onMergeComplete={() => {
            fetchTickets(1, filterProject, filterAssignedTo);
            setShowMergeModal(false);
            setSelectedTicket(null);
          }}
        />
      )}

      {/* Bulk Merge — Pick Primary Dialog */}
      {bulkMergeStep === "pick-primary" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setBulkMergeStep("idle");
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "28px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <h2
              style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700 }}
            >
              Select Primary Ticket
            </h2>
            <p
              style={{ margin: "0 0 20px", color: "#6B7280", fontSize: "14px" }}
            >
              The primary ticket will be kept. All other selected tickets will
              be merged into it.
            </p>
            {bulkError && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "8px",
                  color: "#B91C1C",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                {bulkError}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gap: "8px",
                maxHeight: "320px",
                overflowY: "auto",
                marginBottom: "20px",
              }}
            >
              {selectedTickets.map((t) => (
                <label
                  key={t._id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "12px 14px",
                    border: `2px solid ${bulkMergePrimaryId === t._id ? "#3B82F6" : "#E5E7EB"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    background:
                      bulkMergePrimaryId === t._id ? "#EFF6FF" : "white",
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="radio"
                    name="primaryTicket"
                    value={t._id}
                    checked={bulkMergePrimaryId === t._id}
                    onChange={() => setBulkMergePrimaryId(t._id)}
                    style={{ marginTop: "2px", flexShrink: 0 }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "#2563EB",
                        fontSize: "13px",
                      }}
                    >
                      #{t.ticketNumber}
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#111827",
                        marginTop: "2px",
                      }}
                    >
                      {t.subject || "No subject"}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#9CA3AF",
                        marginTop: "2px",
                      }}
                    >
                      {getStatusDisplayName(t.status)} · Priority: {t.priority}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => {
                  setBulkMergeStep("idle");
                  setBulkError("");
                }}
                style={{
                  padding: "9px 18px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  background: "white",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkMerge}
                disabled={!bulkMergePrimaryId || bulkLoading}
                style={{
                  padding: "9px 18px",
                  background: bulkMergePrimaryId ? "#2563EB" : "#93C5FD",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: bulkMergePrimaryId ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <ArrowsPointingInIcon
                  style={{ width: "15px", height: "15px" }}
                />
                {bulkLoading
                  ? "Merging…"
                  : `Merge ${selectedTicketIds.size} Tickets`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {showBulkDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBulkDeleteConfirm(false);
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "28px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  background: "#FEF2F2",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <TrashIcon
                  style={{ width: "22px", height: "22px", color: "#DC2626" }}
                />
              </div>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
                Delete {selectedTicketIds.size} Ticket
                {selectedTicketIds.size !== 1 ? "s" : ""}?
              </h2>
            </div>
            <p
              style={{
                color: "#6B7280",
                fontSize: "14px",
                margin: "0 0 16px",
                lineHeight: "1.5",
              }}
            >
              This action is permanent and cannot be undone. All selected
              tickets, their comments, and attachments will be deleted.
            </p>
            {bulkError && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "8px",
                  color: "#B91C1C",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                {bulkError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkLoading}
                style={{
                  padding: "9px 18px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  background: "white",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkLoading}
                style={{
                  padding: "9px 18px",
                  background: "#DC2626",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <TrashIcon style={{ width: "15px", height: "15px" }} />
                {bulkLoading ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Wrapper>
  );
};

export default ViewTickets;
