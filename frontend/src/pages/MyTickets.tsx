import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import ModuleHeader from "../components/ModuleHeader";
import API_BASE_URL from "../config/api";
import { TicketExportModal } from "../components/tickets/TicketExportModal";
import { TicketMergeModal } from "../components/tickets/TicketMergeModal";
import {
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
} from "@heroicons/react/24/outline";
import { useProjectContext } from "../contexts/ProjectContext";

interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  title: string;
  description: string;
  status: string;
  priority?: string;
  category?: {
    name: string;
  };
  assignedTo?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  submissionSource?: "online" | "offline" | "email"; // Source filter (Task 6.1)
  sourceEmail?: string; // Task 6.3: Sender email for email tickets
  metadata?: {
    projectId?:
      | string
      | {
          _id: string;
          name: string;
          code: string;
        };
    studentEmail?: string;
    studentName?: string;
    centerId?:
      | string
      | {
          _id: string;
          centerName: string;
          city?: string;
          state?: string;
        };
    centerName?: string;
    createdByName?: string;
    submissionType?: string;
  };
  createdAt: string;
  updatedAt: string;
  isMerged?: boolean;
  mergedInto?: string | { _id: string; ticketNumber: string };
  mergedTickets?: string[];
  hasNewReply?: boolean;
}

interface MyTicketsProps {
  wrapWithLayout?: boolean;
}

const MyTickets: React.FC<MyTicketsProps> = ({ wrapWithLayout = true }) => {
  console.log(
    "🎯 MyTickets component rendering, wrapWithLayout:",
    wrapWithLayout,
  );

  const navigate = useNavigate();
  const location = useLocation();

  // Get viewMode and currentProjectId from context
  const { viewMode, currentProjectId, userProjects } = useProjectContext();

  console.log("🎯 Hooks initialized, location:", location.pathname);
  console.log(
    "🎯 ProjectContext - viewMode:",
    viewMode,
    "currentProjectId:",
    currentProjectId,
  );

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
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all"); // Task 6.1: Source filter
  const [projectFilter, setProjectFilter] = useState("all"); // Project filter for All Projects mode

  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedTickets = useRef(false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  // Multi-select (same pattern as ViewTickets)
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkMergeStep, setBulkMergeStep] = useState<"idle" | "pick-primary">(
    "idle",
  );
  const [bulkMergePrimaryId, setBulkMergePrimaryId] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [statuses, setStatuses] = useState<
    Array<{ code: number; name: string }>
  >([]);
  const [priorities, setPriorities] = useState<
    Array<{ code: string; name: string }>
  >([]);

  console.log("🎯 State initialized");

  const canExport = checkPermission("TICKET_EXPORT");
  const canMerge = checkPermission("TICKET_MERGE");

  console.log(
    "🎯 Permissions checked, canExport:",
    canExport,
    "canMerge:",
    canMerge,
  );

  const fetchMasterData = useCallback(async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      // Resolve projectId: agent portal sets 'projectContext'; student login sets 'projectId'
      let projectId = "";
      const projectContext = localStorage.getItem("projectContext");
      if (projectContext) {
        try {
          projectId = JSON.parse(projectContext).projectId || "";
        } catch {
          projectId = "";
        }
      }
      if (!projectId) projectId = localStorage.getItem("projectId") || "";
      if (!projectId && currentProjectId) projectId = currentProjectId;
      if (!projectId) return;

      // Fetch statuses using existing API: /api/statuses/project/:projectId
      const statusResponse = await axios.get(
        `${API_BASE_URL}/statuses/project/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (
        statusResponse.data.success &&
        Array.isArray(statusResponse.data.data)
      ) {
        // Use code (numeric) to match ticket.status field
        const statusData = statusResponse.data.data.map((s: any) => ({
          code: s.code, // s.code is the numeric value (1=Open,2=In Progress...5=Close)
          name: s.name,
        }));

        // If no statuses found, use default standard statuses
        if (statusData.length === 0) {
          console.warn("âš ï¸ No statuses found for project, using defaults");
          setStatuses([
            { code: 1, name: "Open" },
            { code: 2, name: "In Progress" },
            { code: 3, name: "On Hold" },
            { code: 4, name: "Resolved" },
            { code: 5, name: "Closed" },
          ]);
        } else {
          setStatuses(statusData);
        }
      } else {
        // API failed, use defaults
        console.warn("âš ï¸ Status API failed, using defaults");
        setStatuses([
          { code: 1, name: "Open" },
          { code: 2, name: "In Progress" },
          { code: 3, name: "On Hold" },
          { code: 4, name: "Resolved" },
          { code: 5, name: "Closed" },
        ]);
      }

      // Fetch priorities from SLA rules (independent â€” failure falls back to defaults)
      try {
        const slaResponse = await axios.get(
          `${API_BASE_URL}/sla-rules?projectId=${projectId}&isActive=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (
          slaResponse.data.success &&
          Array.isArray(slaResponse.data.data) &&
          slaResponse.data.data.length > 0
        ) {
          const priorityList = slaResponse.data.data.map((sla: any) => ({
            code: sla.priority,
            name: sla.name,
          }));
          setPriorities(priorityList);
        } else {
          setPriorities([
            { code: "Low", name: "Low" },
            { code: "Normal", name: "Normal" },
            { code: "High", name: "High" },
            { code: "Urgent", name: "Urgent" },
            { code: "Critical", name: "Critical" },
          ]);
        }
      } catch {
        setPriorities([
          { code: "Low", name: "Low" },
          { code: "Normal", name: "Normal" },
          { code: "High", name: "High" },
          { code: "Urgent", name: "Urgent" },
          { code: "Critical", name: "Critical" },
        ]);
      }
    } catch (err) {
      console.error("Error fetching master data:", err);
      // On error, set defaults so filtering still works
      setStatuses([
        { code: 1, name: "Open" },
        { code: 2, name: "In Progress" },
        { code: 3, name: "On Hold" },
        { code: 4, name: "Resolved" },
        { code: 5, name: "Closed" },
      ]);
      setPriorities([
        { code: "Low", name: "Low" },
        { code: "Normal", name: "Normal" },
        { code: "High", name: "High" },
        { code: "Urgent", name: "Urgent" },
        { code: "Critical", name: "Critical" },
      ]);
    }
  }, [currentProjectId]);

  const fetchMyTickets = useCallback(async () => {
    console.log("🎯 fetchMyTickets called");
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");

      if (!token) {
        navigate("/login");
        return;
      }

      // Determine projectId based on viewMode
      // If viewMode is 'unified', don't send projectId to get ALL user's tickets
      // If viewMode is 'single', send the currentProjectId
      let projectId = "";

      if (viewMode === "single" && currentProjectId) {
        projectId = currentProjectId;
      } else if (viewMode === "single") {
        // Fallback to projectContext from localStorage
        const projectContext = localStorage.getItem("projectContext");
        if (projectContext) {
          try {
            const parsed = JSON.parse(projectContext);
            projectId = parsed.projectId;
          } catch (err) {
            console.error("Error parsing projectContext:", err);
          }
        }
      }
      // If viewMode is 'unified', projectId stays empty - backend will return all user's tickets

      // Build URL - only add projectId if in single project mode
      const url = projectId
        ? `${API_BASE_URL}/tickets/my-tickets?projectId=${projectId}`
        : `${API_BASE_URL}/tickets/my-tickets`;

      console.log(
        "🎯 Fetching my tickets - viewMode:",
        viewMode,
        "projectId:",
        projectId || "ALL PROJECTS",
      );

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        // Ensure tickets is an array and filter out any invalid entries
        const ticketsData = Array.isArray(response.data.data)
          ? response.data.data
          : [];
        console.log("🎯 Sample ticket data:", ticketsData[0]);
        console.log(
          "🎢 Center data check:",
          ticketsData[0]?.metadata?.centerId,
        );
        setTickets(ticketsData.filter((ticket: any) => ticket && ticket._id));
      } else {
        // Hide 404 and "Not Found" errors from UI
        if (response.data.error && !response.data.error.includes("Not Found")) {
          setError(response.data.error || "Failed to load tickets");
        }
      }
    } catch (err: any) {
      console.error("Error fetching my tickets:", err);
      if (err.response?.status === 401) {
        localStorage.removeItem("authToken");
        navigate("/login");
      } else if (err.response?.status === 403) {
        setError(
          "You do not have permission to view tickets. Please contact your administrator.",
        );
      } else if (err.response?.status === 404) {
        // Hide 404 errors from UI, just log them
        console.log("Tickets endpoint not found (404)");
      } else {
        setError(err.response?.data?.error || "Failed to load tickets");
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, viewMode, currentProjectId]);

  console.log("🎯 useCallback defined");

  useEffect(() => {
    console.log(
      "🎯 useEffect running, viewMode:",
      viewMode,
      "currentProjectId:",
      currentProjectId,
    );
    // Fetch tickets whenever viewMode or currentProjectId changes
    fetchMasterData();
    fetchMyTickets();
  }, [fetchMyTickets, fetchMasterData, viewMode, currentProjectId]);

  // Reset project filter when switching to single project mode
  useEffect(() => {
    if (viewMode === "single") {
      setProjectFilter("all");
    }
  }, [viewMode]);

  console.log("🎯 About to define helper functions");

  const getStatusName = (status: string | number) => {
    const statusCode = typeof status === "number" ? status : Number(status);
    // First, look up from project-configured statuses (fetched from API)
    const projectStatus = statuses.find((s) => s.code === statusCode);
    if (projectStatus) return projectStatus.name;
    // Fallback for when statuses haven't loaded yet
    const statusNames: Record<number, string> = {
      1: "Open",
      2: "In Progress",
      3: "On Hold",
      4: "Resolved",
      5: "Closed",
    };
    return statusNames[statusCode] || `Status ${statusCode}`;
  };

  const getStatusColor = (status: string | number) => {
    // Handle numeric status codes: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
    const statusCode = typeof status === "number" ? status : Number(status);
    const colors: Record<number, string> = {
      1: "#3B82F6", // open
      2: "#F59E0B", // in-progress
      3: "#EF4444", // on-hold
      4: "#10B981", // resolved
      5: "#6B7280", // closed
    };
    return colors[statusCode] || "#6B7280";
  };

  const getPriorityColor = (priority?: string) => {
    const colors: Record<string, string> = {
      low: "#10B981",
      normal: "#F59E0B",
      medium: "#F59E0B",
      high: "#EF4444",
      critical: "#DC2626",
    };
    return priority ? colors[priority.toLowerCase()] || "#6B7280" : "#6B7280";
  };

  // Task 6.2: Source indicator styling
  const getSourceBadge = (source?: "online" | "offline" | "email") => {
    const badges = {
      online: {
        icon: "🌐",
        label: "Online",
        color: "#3B82F6",
        bgColor: "#DBEAFE",
        tooltip: "Submitted via online portal",
      },
      offline: {
        icon: "📍",
        label: "Offline",
        color: "#8B5CF6",
        bgColor: "#EDE9FE",
        tooltip: "Walk-in or phone submission",
      },
      email: {
        icon: "📧",
        label: "Email",
        color: "#10B981",
        bgColor: "#D1FAE5",
        tooltip: "Created from email",
      },
    };
    return badges[source || "online"] || badges.online;
  };

  console.log("🎯 About to filter tickets, tickets.length:", tickets.length);

  const filteredTickets = tickets.filter((ticket) => {
    try {
      // Status is now numeric: compare as numbers or convert filter to number
      const ticketStatus =
        typeof ticket.status === "number"
          ? ticket.status
          : Number(ticket.status);
      const filterStatus =
        statusFilter === "all" ? "all" : Number(statusFilter);
      const matchesStatus =
        statusFilter === "all" || ticketStatus === filterStatus;
      const matchesPriority =
        priorityFilter === "all" ||
        (ticket.priority &&
          ticket.priority.toLowerCase() === priorityFilter.toLowerCase());

      // Task 6.1: Source filter
      const matchesSource =
        sourceFilter === "all" || ticket.submissionSource === sourceFilter;

      // Project filter (only in All Projects mode)
      const ticketProjectId =
        typeof ticket.metadata?.projectId === "object"
          ? ticket.metadata?.projectId?._id
          : ticket.metadata?.projectId;
      const matchesProject =
        projectFilter === "all" || ticketProjectId === projectFilter;

      const matchesSearch =
        (ticket.ticketNumber &&
          ticket.ticketNumber
            .toLowerCase()
            .includes(searchTerm.toLowerCase())) ||
        (ticket.subject &&
          ticket.subject.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ticket.description &&
          ticket.description.toLowerCase().includes(searchTerm.toLowerCase()));

      return (
        matchesStatus &&
        matchesPriority &&
        matchesSource &&
        matchesProject &&
        matchesSearch
      );
    } catch (err) {
      console.error("🎯 Error filtering ticket:", ticket, err);
      return false;
    }
  });

  console.log(
    "🎯 Filtered tickets, filteredTickets.length:",
    filteredTickets.length,
  );

  // Show Sender Email column only when at least one visible ticket is from email source
  const hasEmailSource = filteredTickets.some(
    (t) => t.submissionSource === "email",
  );

  const handleTicketClick = (ticketId: string) => {
    // Check if we're in a student context (URL contains /student/)
    if (location.pathname.includes("/student/")) {
      const pathParts = location.pathname.split("/");
      const customUrlPath = pathParts[1]; // e.g., "studentassistcenters"
      navigate(`/${customUrlPath}/student/ticket/${ticketId}`);
      return;
    }

    // Check if we're in a project portal context (agent/staff)
    const projectContext = localStorage.getItem("projectContext");
    if (projectContext) {
      try {
        const { customUrlPath } = JSON.parse(projectContext);
        if (customUrlPath) {
          navigate(`/${customUrlPath}/portal/tickets/${ticketId}`);
          return;
        }
      } catch (e) {
        console.error("Error parsing project context:", e);
      }
    }

    // Fallback to regular route
    navigate(`/tickets/${ticketId}`);
  };

  console.log("🎯 About to check loading state, loading:", loading);

  if (loading) {
    console.log("🎯 Rendering loading state");
    const loadingContent = (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p>Loading your tickets...</p>
      </div>
    );
    return wrapWithLayout ? (
      <DashboardLayout>{loadingContent}</DashboardLayout>
    ) : (
      loadingContent
    );
  }

  console.log(
    "🎯 Not loading, rendering main content, tickets.length:",
    tickets.length,
  );

  console.log("🎯 About to create content JSX");

  // Get display title based on viewMode
  const getPageTitle = () => {
    if (viewMode === "unified") {
      return "My Queries - All Projects";
    }
    const project = userProjects.find((p) => p._id === currentProjectId);
    return project ? `My Queries - ${project.name}` : "My Queries";
  };

  const getPageSubtitle = () => {
    if (viewMode === "unified") {
      return `Queries from all ${userProjects.length} assigned projects`;
    }
    return "View and manage queries assigned to you or created by you";
  };

  // â”€â”€ Multi-select helpers (same as ViewTickets) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        `${API_BASE_URL}/tickets/${bulkMergePrimaryId}/merge`,
        { ticketIds: secondaryIds },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSelectedTicketIds(new Set());
      setBulkMergeStep("idle");
      setBulkMergePrimaryId("");
      fetchMyTickets();
    } catch (err: any) {
      setBulkError(err.response?.data?.message || "Failed to merge tickets");
    } finally {
      setBulkLoading(false);
    }
  };

  const selectedTickets = filteredTickets.filter((t) =>
    selectedTicketIds.has(t._id),
  );

  const content = (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      <ModuleHeader title={getPageTitle()} subtitle={getPageSubtitle()} />

      {error && !error.includes("Not Found") && (
        <div
          style={{
            background: "#FEE2E2",
            border: "1px solid #EF4444",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            color: "#991B1B",
          }}
        >
          {error}
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
        {/* Row 1: Search + Status + Priority + Source + Export */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom:
              viewMode === "unified" && userProjects.length > 1 ? "12px" : "0",
          }}
        >
          <div style={{ flex: 1, minWidth: "200px" }}>
            <input
              type="text"
              placeholder="Search queries..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
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
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: "10px 12px",
              border: "1px solid #D1D5DB",
              borderRadius: "8px",
              fontSize: "14px",
              minWidth: "130px",
            }}
          >
            <option value="all">All Status</option>
            {statuses.map((s, i) => (
              <option key={`s-${s.code}-${i}`} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: "10px 12px",
              border: "1px solid #D1D5DB",
              borderRadius: "8px",
              fontSize: "14px",
              minWidth: "130px",
            }}
          >
            <option value="all">All Priority</option>
            {priorities.map((p, i) => (
              <option key={`p-${p.code}-${i}`} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              padding: "10px 12px",
              border: "1px solid #D1D5DB",
              borderRadius: "8px",
              fontSize: "14px",
              minWidth: "130px",
            }}
          >
            <option value="all">All Sources</option>
            <option value="online">🌐 Online</option>
            <option value="offline">📍 Offline</option>
            <option value="email">📧 Email</option>
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
        {/* Row 2: Project filter (unified mode) */}
        {viewMode === "unified" && userProjects.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setCurrentPage(1);
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
              {userProjects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            {projectFilter !== "all" && (
              <button
                onClick={() => {
                  setProjectFilter("all");
                  setCurrentPage(1);
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
        )}
      </div>

      {/* Bulk action bar */}
      {canMerge && selectedTicketIds.size > 0 && (
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
            {selectedTicketIds.size >= 2 && (
              <button
                onClick={() => {
                  const sel = filteredTickets.filter((t) =>
                    selectedTicketIds.has(t._id),
                  );
                  const getKey = (t: Ticket) =>
                    t.metadata?.studentEmail ||
                    t.metadata?.createdByName ||
                    t.metadata?.studentName ||
                    "";
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

      {/* Ticket Cards */}
      {(() => {
        const totalPages = Math.ceil(filteredTickets.length / pageSize);
        const paginatedTickets = filteredTickets.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize,
        );
        return (
          <div style={{ display: "grid", gap: "16px" }}>
            {/* Select-all row */}
            {filteredTickets.length > 0 && canMerge && (
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
                <p style={{ color: "#6B7280" }}>No queries found</p>
              </div>
            ) : (
              <>
                {paginatedTickets.map((ticket) => {
                  const sourceBadge = getSourceBadge(ticket.submissionSource);
                  const projectName =
                    typeof ticket.metadata?.projectId === "object"
                      ? ticket.metadata.projectId.name ||
                        ticket.metadata.projectId.code
                      : null;
                  const centerName =
                    !ticket.metadata?.centerId ||
                    ticket.metadata.centerId === "online"
                      ? "Online"
                      : typeof ticket.metadata.centerId === "object"
                        ? ticket.metadata.centerId.centerName
                        : ticket.metadata?.centerName || "Online";
                  const requestedBy =
                    ticket.metadata?.createdByName ||
                    ticket.metadata?.studentName ||
                    (ticket.submissionSource === "email"
                      ? ticket.sourceEmail
                      : null) ||
                    null;

                  return (
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
                          ? "0 2px 8px rgba(245,158,11,0.25)"
                          : "0 1px 3px rgba(0,0,0,0.1)",
                        transition: "all 0.2s",
                        border: selectedTicketIds.has(ticket._id)
                          ? "1.5px solid #3B82F6"
                          : ticket.hasNewReply
                            ? "1.5px solid #F59E0B"
                            : "1.5px solid transparent",
                        borderLeft:
                          ticket.hasNewReply &&
                          !selectedTicketIds.has(ticket._id)
                            ? "4px solid #F59E0B"
                            : undefined,
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedTicketIds.has(ticket._id)) {
                          e.currentTarget.style.boxShadow = ticket.hasNewReply
                            ? "0 4px 12px rgba(245,158,11,0.35)"
                            : "0 4px 12px rgba(0,0,0,0.15)";
                          e.currentTarget.style.transform = "translateY(-2px)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = ticket.hasNewReply
                          ? "0 2px 8px rgba(245,158,11,0.25)"
                          : "0 1px 3px rgba(0,0,0,0.1)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      {/* Top row: checkbox + ticket info | status + actions */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: "12px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "12px",
                            flex: 1,
                          }}
                        >
                          {canMerge && (
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
                            onClick={() => handleTicketClick(ticket._id)}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                flexWrap: "wrap",
                                marginBottom: "4px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: 600,
                                  color: "#2563EB",
                                }}
                              >
                                #{ticket.ticketNumber}
                              </span>
                              {ticket.hasNewReply && (
                                <span
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: "#F59E0B",
                                    display: "inline-block",
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              {ticket.mergedTickets &&
                                ticket.mergedTickets.length > 0 && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      color: "#7C3AED",
                                      background: "#F3E8FF",
                                      padding: "1px 6px",
                                      borderRadius: "8px",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {ticket.mergedTickets.length} ticket
                                    {ticket.mergedTickets.length > 1
                                      ? "s"
                                      : ""}{" "}
                                    merged
                                  </span>
                                )}
                              {ticket.isMerged && (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    color: "#9CA3AF",
                                    background: "#F3F4F6",
                                    padding: "1px 6px",
                                    borderRadius: "8px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  merged
                                </span>
                              )}
                            </div>
                            <h3
                              style={{
                                fontSize: "16px",
                                fontWeight: ticket.hasNewReply ? 700 : 600,
                                color: ticket.hasNewReply
                                  ? "#1F2937"
                                  : "#111827",
                                margin: 0,
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
                            flexShrink: 0,
                            marginLeft: "12px",
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
                            {getStatusName(ticket.status)}
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
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "#2563EB")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background = "#3B82F6")
                              }
                            >
                              <ArrowsPointingInIcon
                                style={{ width: "14px", height: "14px" }}
                              />
                              Merge
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Bottom metadata row */}
                      <div
                        style={{
                          display: "flex",
                          gap: "20px",
                          fontSize: "13px",
                          color: "#6B7280",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "10px",
                            fontSize: "12px",
                            fontWeight: 500,
                            color: sourceBadge.color,
                            backgroundColor: sourceBadge.bgColor,
                          }}
                        >
                          {sourceBadge.icon} {sourceBadge.label}
                        </span>
                        <div>
                          <span style={{ fontWeight: 600 }}>Priority:</span>{" "}
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "12px",
                              fontWeight: 500,
                              color: "white",
                              backgroundColor: getPriorityColor(
                                ticket.priority,
                              ),
                            }}
                          >
                            {ticket.priority
                              ? ticket.priority.charAt(0).toUpperCase() +
                                ticket.priority.slice(1).toLowerCase()
                              : "N/A"}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Center:</span>{" "}
                          <span
                            style={{
                              padding: "2px 8px",
                              background:
                                centerName === "Online" ? "#DBEAFE" : "#FEF3C7",
                              color:
                                centerName === "Online" ? "#1E40AF" : "#92400E",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            {centerName}
                          </span>
                        </div>
                        {requestedBy && (
                          <div>
                            <span style={{ fontWeight: 600 }}>
                              Requested By:
                            </span>{" "}
                            {requestedBy}
                          </div>
                        )}
                        {ticket.submissionSource === "email" &&
                          ticket.sourceEmail && (
                            <div>
                              <span style={{ fontWeight: 600 }}>Email:</span>{" "}
                              <a
                                href={`mailto:${ticket.sourceEmail}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  color: "#3B82F6",
                                  textDecoration: "none",
                                }}
                              >
                                {ticket.sourceEmail}
                              </a>
                            </div>
                          )}
                        <div>
                          <span style={{ fontWeight: 600 }}>Assigned To:</span>{" "}
                          {ticket.assignedTo
                            ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
                            : "Unassigned"}
                        </div>
                        {ticket.category && (
                          <div>
                            <span style={{ fontWeight: 600 }}>Category:</span>{" "}
                            {ticket.category.name}
                          </div>
                        )}
                        {viewMode === "unified" && projectName && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "12px",
                              fontWeight: 500,
                              color: "#6366F1",
                              backgroundColor: "#EEF2FF",
                            }}
                          >
                            {projectName}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Pagination */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "14px",
                    color: "#6B7280",
                    marginTop: "4px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
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
                      {"<"} Previous
                    </button>
                    <span style={{ padding: "0 12px" }}>
                      Page {currentPage} of {Math.max(1, totalPages)}
                    </span>
                    <button
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage >= totalPages}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #D1D5DB",
                        background:
                          currentPage >= totalPages ? "#F3F4F6" : "white",
                        color:
                          currentPage >= totalPages ? "#9CA3AF" : "#374151",
                        cursor:
                          currentPage >= totalPages ? "not-allowed" : "pointer",
                        fontSize: "13px",
                      }}
                    >
                      Next {">"}
                    </button>
                  </div>
                  <div>
                    Showing{" "}
                    {filteredTickets.length > 0
                      ? (currentPage - 1) * pageSize + 1
                      : 0}
                    -{Math.min(currentPage * pageSize, filteredTickets.length)}{" "}
                    of {filteredTickets.length}{" "}
                    {filteredTickets.length === 1 ? "query" : "queries"}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Export Modal */}
      {canExport && showExportModal && (
        <TicketExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          filters={{
            status: statusFilter !== "all" ? statusFilter : undefined,
          }}
        />
      )}

      {/* Single-ticket Merge Modal */}
      {canMerge && showMergeModal && selectedTicket && (
        <TicketMergeModal
          isOpen={showMergeModal}
          onClose={() => {
            setShowMergeModal(false);
            setSelectedTicket(null);
          }}
          primaryTicket={{
            _id: selectedTicket._id,
            ticketNumber: selectedTicket.ticketNumber,
            subject: selectedTicket.subject,
            status: selectedTicket.status,
            priority: selectedTicket.priority,
          }}
          onMergeComplete={() => {
            setShowMergeModal(false);
            setSelectedTicket(null);
            fetchMyTickets();
          }}
        />
      )}

      {/* Bulk Merge â€” Pick Primary Dialog */}
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
                      {getStatusName(t.status)} · Priority: {t.priority}
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
                  ? "Merging..."
                  : `Merge ${selectedTicketIds.size} Tickets`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  console.log("🎯 Content JSX created successfully");

  // Conditionally wrap with DashboardLayout
  try {
    console.log("🎯 About to return, wrapWithLayout:", wrapWithLayout);
    return wrapWithLayout ? (
      <DashboardLayout>{content}</DashboardLayout>
    ) : (
      content
    );
  } catch (err) {
    console.error("🎯 Error in return:", err);
    return <div>Error rendering: {String(err)}</div>;
  }
};

export default MyTickets;
