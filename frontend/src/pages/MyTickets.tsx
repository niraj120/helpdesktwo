import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
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
          console.warn("⚠️ No statuses found for project, using defaults");
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
        console.warn("⚠️ Status API failed, using defaults");
        setStatuses([
          { code: 1, name: "Open" },
          { code: 2, name: "In Progress" },
          { code: 3, name: "On Hold" },
          { code: 4, name: "Resolved" },
          { code: 5, name: "Closed" },
        ]);
      }

      // Fetch priorities from SLA rules (independent — failure falls back to defaults)
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
          "🏢 Center data check:",
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

  const content = (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#111827",
            marginBottom: "8px",
          }}
        >
          {getPageTitle()}
        </h1>
        <p style={{ color: "#6B7280", fontSize: "14px" }}>
          {getPageSubtitle()}
        </p>
      </div>

      {error && !error.includes("Not Found") && (
        <div
          style={{
            background: "#FEE2E2",
            border: "1px solid #EF4444",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "24px",
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
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#374151",
              }}
            >
              Search Queries
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by query number or subject"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
              }}
            />
          </div>
          {/* Project Filter - Only show in All Projects mode */}
          {viewMode === "unified" && userProjects.length > 1 && (
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#374151",
                }}
              >
                Project
              </label>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  background: "white",
                }}
              >
                <option value="all">All Projects</option>
                {userProjects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#374151",
              }}
            >
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                background: "white",
              }}
            >
              <option value="all">All</option>
              {statuses.map((status, index) => (
                <option
                  key={`status-${status.code}-${index}`}
                  value={status.code}
                >
                  {status.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#374151",
              }}
            >
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                background: "white",
              }}
            >
              <option value="all">All</option>
              {priorities.map((priority, index) => (
                <option
                  key={`priority-${priority.code}-${index}`}
                  value={priority.code}
                >
                  {priority.name}
                </option>
              ))}
            </select>
          </div>
          {/* Task 6.1: Source Filter */}
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#374151",
              }}
            >
              Source
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                background: "white",
              }}
            >
              <option value="all">All Sources</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      {filteredTickets.length === 0 ? (
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            padding: "40px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#6B7280", fontSize: "16px" }}>No queries found</p>
        </div>
      ) : (
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "#F9FAFB",
                    borderBottom: "1px solid #E5E7EB",
                  }}
                >
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Query #
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Subject
                  </th>
                  {/* Show Project column only in All Projects mode */}
                  {viewMode === "unified" && (
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Project
                    </th>
                  )}
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Source
                  </th>
                  {hasEmailSource && (
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#6B7280",
                        textTransform: "uppercase",
                      }}
                    >
                      Sender Email
                    </th>
                  )}
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Priority
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Center
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Requested By
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Assigned To
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket._id}
                    onClick={() => handleTicketClick(ticket._id)}
                    style={{
                      borderBottom: "1px solid #E5E7EB",
                      cursor: "pointer",
                      transition: "background-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#F9FAFB";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "14px",
                        color: "#111827",
                        fontWeight: 500,
                      }}
                    >
                      {ticket.ticketNumber}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "14px",
                        color: "#111827",
                        maxWidth: "300px",
                      }}
                    >
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ticket.subject}
                      </div>
                    </td>
                    {/* Show Project column only in All Projects mode */}
                    {viewMode === "unified" && (
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "14px",
                          color: "#111827",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: 500,
                            color: "#6366F1",
                            backgroundColor: "#EEF2FF",
                            border: "1px solid #6366F120",
                          }}
                        >
                          {typeof ticket.metadata?.projectId === "object"
                            ? ticket.metadata.projectId.name ||
                              ticket.metadata.projectId.code
                            : "Unknown"}
                        </span>
                      </td>
                    )}
                    {/* Task 6.2: Source indicator badge */}
                    <td style={{ padding: "12px 16px" }}>
                      {(() => {
                        const sourceBadge = getSourceBadge(
                          ticket.submissionSource,
                        );
                        return (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              fontWeight: 500,
                              color: sourceBadge.color,
                              backgroundColor: sourceBadge.bgColor,
                              border: `1px solid ${sourceBadge.color}20`,
                            }}
                            title={sourceBadge.tooltip}
                          >
                            <span style={{ fontSize: "14px" }}>
                              {sourceBadge.icon}
                            </span>
                            <span>{sourceBadge.label}</span>
                          </span>
                        );
                      })()}
                    </td>
                    {/* Task 6.3: Source email cell - only shown when email tickets exist */}
                    {hasEmailSource && (
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "14px",
                          color: "#6B7280",
                          maxWidth: "200px",
                        }}
                        onClick={(e) => {
                          if (
                            ticket.submissionSource === "email" &&
                            ticket.sourceEmail
                          ) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {ticket.submissionSource === "email" &&
                        ticket.sourceEmail ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <a
                              href={`mailto:${ticket.sourceEmail}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                color: "#3B82F6",
                                textDecoration: "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                              }}
                              title={ticket.sourceEmail}
                              onMouseEnter={(e) => {
                                (
                                  e.target as HTMLAnchorElement
                                ).style.textDecoration = "underline";
                              }}
                              onMouseLeave={(e) => {
                                (
                                  e.target as HTMLAnchorElement
                                ).style.textDecoration = "none";
                              }}
                            >
                              {ticket.sourceEmail}
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(
                                  ticket.sourceEmail || "",
                                );
                                // Optional: Show toast notification
                              }}
                              style={{
                                padding: "4px 6px",
                                borderRadius: "4px",
                                border: "1px solid #D1D5DB",
                                background: "white",
                                cursor: "pointer",
                                fontSize: "11px",
                                color: "#6B7280",
                              }}
                              title="Copy email"
                              onMouseEnter={(e) => {
                                (
                                  e.target as HTMLButtonElement
                                ).style.background = "#F3F4F6";
                              }}
                              onMouseLeave={(e) => {
                                (
                                  e.target as HTMLButtonElement
                                ).style.background = "white";
                              }}
                            >
                              📋
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#D1D5DB" }}>-</span>
                        )}
                      </td>
                    )}
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "white",
                          backgroundColor: getPriorityColor(ticket.priority),
                        }}
                      >
                        {ticket.priority
                          ? ticket.priority.charAt(0).toUpperCase() +
                            ticket.priority.slice(1).toLowerCase()
                          : "N/A"}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "14px",
                        color: "#6B7280",
                      }}
                    >
                      {!ticket.metadata?.centerId ||
                      ticket.metadata?.centerId === "online"
                        ? "Online"
                        : typeof ticket.metadata?.centerId === "object"
                          ? ticket.metadata.centerId.centerName
                          : ticket.metadata?.centerName || "Online"}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "14px",
                        color: "#6B7280",
                      }}
                    >
                      {ticket.metadata?.createdByName ||
                        ticket.metadata?.studentName ||
                        (ticket.submissionSource === "email" &&
                          ticket.sourceEmail) ||
                        "N/A"}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "14px",
                        color: "#6B7280",
                      }}
                    >
                      {ticket.assignedTo
                        ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
                        : "Unassigned"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "white",
                          backgroundColor: getStatusColor(ticket.status),
                        }}
                      >
                        {getStatusName(ticket.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: "16px" }}>
        <p style={{ color: "#6B7280", fontSize: "14px" }}>
          Showing {filteredTickets.length} of {tickets.length} quer
          {tickets.length === 1 ? "y" : "ies"}
        </p>
      </div>
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
