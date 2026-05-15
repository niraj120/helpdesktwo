import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useDeferredValue,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import axios from "axios";
import { TicketExportModal } from "../components/tickets/TicketExportModal";
import { TicketMergeModal } from "../components/tickets/TicketMergeModal";
import {
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
  XMarkIcon,
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
    customFields?: Record<string, unknown>;
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
  /** Project-specific status name, enriched by the API */
  statusName?: string;
  /** Project-specific status color, enriched by the API */
  statusColor?: string;
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

interface DepartmentOption {
  _id: string;
  name: string;
}

interface PriorityOption {
  value: string;
  label: string;
}

type TicketTableColumnKey =
  | "ticketNumber"
  | "subject"
  | "requestedBy"
  | "assignee"
  | "priority"
  | "status"
  | "sla"
  | "createdAt"
  | "center"
  | "project"
  | "category"
  | "source"
  | "mergedCount"
  | `field_${string}`;

const TICKET_TABLE_COLUMN_DEFS: Array<{
  key: TicketTableColumnKey;
  label: string;
}> = [
  { key: "ticketNumber", label: "Ticket #" },
  { key: "subject", label: "Subject" },
  { key: "requestedBy", label: "Requested By" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "sla", label: "SLA" },
  { key: "createdAt", label: "Created" },
  { key: "center", label: "Center" },
  { key: "project", label: "Project" },
  { key: "category", label: "Category" },
  { key: "source", label: "Source" },
  { key: "mergedCount", label: "Merged" },
];

const DEFAULT_TICKET_TABLE_COLUMNS: TicketTableColumnKey[] = [
  "ticketNumber",
  "subject",
  "requestedBy",
  "assignee",
  "priority",
  "status",
  "sla",
  "createdAt",
];

const normalizeTicketColumns = (columns?: string[]): TicketTableColumnKey[] => {
  if (!Array.isArray(columns) || columns.length === 0) {
    return DEFAULT_TICKET_TABLE_COLUMNS;
  }

  const validKeys = columns.filter(
    (key): key is TicketTableColumnKey =>
      TICKET_TABLE_COLUMN_DEFS.some((col) => col.key === key) ||
      key.startsWith("field_"),
  );

  return validKeys.length > 0 ? validKeys : DEFAULT_TICKET_TABLE_COLUMNS;
};

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

const Wrapper = ({
  children,
  wrap,
}: {
  children: React.ReactNode;
  wrap: boolean;
}) => (wrap ? <DashboardLayout>{children}</DashboardLayout> : <>{children}</>);

const ViewTickets: React.FC<ViewTicketsProps> = ({
  initialProjectId,
  wrapWithLayout = true,
}) => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams<{ customUrlPath?: string }>();

  // Helper function to check permissions from localStorage
  const checkPermission = (permission: string): boolean => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (
          user?.role?.code === "SUPER_ADMIN" ||
          user?.roleCode === "SUPER_ADMIN"
        ) {
          return true;
        }
      } catch {
        // Ignore parse errors and continue with permission list check
      }
    }

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
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [statuses, setStatuses] = useState<
    Array<{ code: number; name: string }>
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

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
  const [priorityOptions, setPriorityOptions] = useState<PriorityOption[]>([
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "NORMAL", label: "Normal" },
    { value: "HIGH", label: "High" },
    { value: "CRITICAL", label: "Critical" },
  ]);
  const [visibleColumns, setVisibleColumns] = useState<TicketTableColumnKey[]>(
    DEFAULT_TICKET_TABLE_COLUMNS,
  );

  // Dynamic filterable columns from ticket settings
  const [filterableColumnKeys, setFilterableColumnKeys] = useState<string[]>(
    [],
  );
  const [customFormFieldDefs, setCustomFormFieldDefs] = useState<
    Array<{
      fieldName: string;
      fieldLabel: string;
      fieldType: string;
      options?: string[];
    }>
  >([]);
  const [customFieldFilters, setCustomFieldFilters] = useState<
    Record<string, string>
  >({});

  // Multi-select state
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkMergeStep, setBulkMergeStep] = useState<"idle" | "pick-primary">(
    "idle",
  );
  const [bulkMergePrimaryId, setBulkMergePrimaryId] = useState("");
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignDepartments, setBulkAssignDepartments] = useState<
    DepartmentOption[]
  >([]);
  const [bulkAssignDepartmentId, setBulkAssignDepartmentId] = useState("");
  const [bulkAssignAgents, setBulkAssignAgents] = useState<Agent[]>([]);
  const [bulkAssignAgentId, setBulkAssignAgentId] = useState("");
  const [bulkAssignLoadingAgents, setBulkAssignLoadingAgents] = useState(false);
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
  const canAssign = checkPermission("TICKET_REASSIGN");
  const canConfigureColumns = checkPermission(
    "TICKET_CONFIG_MANAGE_TABLE_COLUMNS",
  );
  const hasViewAll = checkPermission("TICKET_VIEW_ALL");
  const userRole = localStorage.getItem("userRole") || "";

  // Real-time: track pending new-ticket badge so the user sees a refresh hint
  const [pendingNewTickets, setPendingNewTickets] = useState(0);

  const activeProjectForColumns =
    initialProjectId ?? (filterProject !== "all" ? filterProject : null);

  // Stats cards — keyed by "total" and each status code (as string)
  const [ticketStats, setTicketStats] = useState<Record<string, number>>({
    total: 0,
  });

  // Per-row action menu (only one open at a time)
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Close action menu on outside click
  useEffect(() => {
    if (!openActionMenuId) return;
    const handler = () => setOpenActionMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openActionMenuId]);

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
    fetchAgents(initialProjectId ?? undefined);
    fetchPriorities(initialProjectId ?? null);
    fetchStats([], {});
    fetchStatuses(initialProjectId ?? null);
  }, []);

  // Re-fetch statuses when project filter changes, and reset dependent filters
  useEffect(() => {
    if (filterProject !== "all") {
      fetchStatuses(filterProject);
      fetchAgents(filterProject);
      fetchPriorities(filterProject);
    } else {
      fetchStatuses(initialProjectId ?? null);
      fetchAgents(initialProjectId ?? undefined);
      fetchPriorities(initialProjectId ?? null);
    }
    // Reset dependent dropdowns when project changes
    setFilterStatus("all");
    setFilterPriority("all");
    setFilterAssignedTo("all");
  }, [filterProject]);

  useEffect(() => {
    const fetchTicketTableColumns = async () => {
      if (!activeProjectForColumns) {
        setVisibleColumns(DEFAULT_TICKET_TABLE_COLUMNS);
        return;
      }

      try {
        const token = localStorage.getItem("authToken");
        const response = await axios.get(
          `${API_CONFIG.API_URL}/projects/${activeProjectForColumns}/ticket-settings`,
          token
            ? {
                headers: { Authorization: `Bearer ${token}` },
              }
            : undefined,
        );

        const columnsFromConfig =
          response.data?.ticketConfig?.tableColumns ||
          response.data?.data?.ticketTableColumns ||
          [];

        setVisibleColumns(normalizeTicketColumns(columnsFromConfig));

        // Load filterable columns
        const filterableCols: string[] =
          response.data?.ticketConfig?.filterableColumns || [];
        setFilterableColumnKeys(filterableCols);

        // Load custom form field definitions (for rendering + labels)
        const customFields = response.data?.data?.customFormFields || [];
        setCustomFormFieldDefs(customFields);
      } catch (error) {
        console.error("[fetchTicketTableColumns] failed:", error);
        setVisibleColumns(DEFAULT_TICKET_TABLE_COLUMNS);
      }
    };

    fetchTicketTableColumns();
  }, [activeProjectForColumns]);

  // Re-run stats whenever the statuses list is (re)loaded
  useEffect(() => {
    if (statuses.length === 0) return;
    fetchStats(statuses, {
      project: filterProject,
      assignedTo: filterAssignedTo,
      priority: filterPriority,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
    });
  }, [statuses]);

  // Re-fetch tickets (from page 1) whenever a server-side filter changes
  const filterChangeRef = useRef(false);
  useEffect(() => {
    if (!filterChangeRef.current) {
      filterChangeRef.current = true;
      return; // skip initial mount
    }
    setCurrentPage(1);
    fetchTickets(1, filterProject, filterAssignedTo);
    fetchStats(statuses, {
      project: filterProject,
      assignedTo: filterAssignedTo,
      priority: filterPriority,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
    });
  }, [
    filterStatus,
    filterPriority,
    filterDateFrom,
    filterDateTo,
    deferredSearchQuery,
    filterProject,
    filterAssignedTo,
    customFieldFilters,
  ]);

  const fetchStatuses = async (projectId: string | null) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      // Resolve project ID — check argument first, then localStorage context
      let pid = projectId;
      if (!pid) {
        const ctx = localStorage.getItem("projectContext");
        if (ctx) {
          try {
            pid = JSON.parse(ctx).projectId || null;
          } catch {
            /* skip */
          }
        }
      }

      if (pid) {
        // Project-specific statuses
        const res = await axios.get(
          `${API_CONFIG.API_URL}/statuses/project/${pid}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (
          res.data.success &&
          Array.isArray(res.data.data) &&
          res.data.data.length > 0
        ) {
          setStatuses(
            res.data.data.map((s: any) => ({ code: s.code, name: s.name })),
          );
        }
      } else {
        // No project context (super admin or global view) — fetch all statuses and deduplicate by code
        const res = await axios.get(`${API_CONFIG.API_URL}/statuses/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success && Array.isArray(res.data.data)) {
          const seen = new Set<number>();
          const unique = res.data.data
            .filter((s: any) => {
              if (seen.has(s.code)) return false;
              seen.add(s.code);
              return true;
            })
            .map((s: any) => ({ code: s.code, name: s.name }));
          if (unique.length > 0) setStatuses(unique);
        }
      }
    } catch (err) {
      console.error("[fetchStatuses] failed:", err);
    }
  };

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
      // Server-side filter params — read from current state via closure
      if (filterStatus !== "all") params.status = filterStatus;
      if (filterPriority !== "all") params.priority = filterPriority;
      if (filterDateFrom) params.createdAfter = filterDateFrom;
      if (filterDateTo) params.createdBefore = filterDateTo;
      if (deferredSearchQuery.trim())
        params.search = deferredSearchQuery.trim();

      // Add custom field filters
      Object.entries(customFieldFilters).forEach(([key, val]) => {
        if (val && val.trim()) {
          // key is like "field_ApplicationID", backend expects "customField_ApplicationID"
          const fieldName = key.replace(/^field_/, "");
          params[`customField_${fieldName}`] = val.trim();
        }
      });

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
        const data =
          response.data.data?.projects ||
          response.data.data ||
          response.data.projects ||
          [];
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    }
  };

  const fetchAgents = async (projectId?: string) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      const pid =
        projectId && projectId !== "all"
          ? projectId
          : (initialProjectId ?? undefined);
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/assignable-agents`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: pid ? { projectId: pid } : {},
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

  const fetchPriorities = async (projectId: string | null) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      const pid =
        projectId && projectId !== "all"
          ? projectId
          : (initialProjectId ?? undefined);

      const response = await axios.get(
        `${API_CONFIG.API_URL}/priorities/active`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: pid ? { projectId: pid } : {},
        },
      );

      if (response.data.success && Array.isArray(response.data.data)) {
        const seen = new Set<string>();
        const options: PriorityOption[] = [];

        for (const p of response.data.data as any[]) {
          const raw = String(p.code || p.name || "").trim();
          if (!raw) continue;

          const value = raw.toUpperCase();
          if (seen.has(value)) continue;
          seen.add(value);

          const label = p.name
            ? String(p.name)
            : raw
                .toLowerCase()
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c: string) => c.toUpperCase());

          options.push({ value, label });
        }

        if (options.length > 0) {
          setPriorityOptions(options);
          return;
        }
      }

      // API returned no priorities for this project; fallback keeps filter usable.
      setPriorityOptions([
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "NORMAL", label: "Normal" },
        { value: "HIGH", label: "High" },
        { value: "CRITICAL", label: "Critical" },
      ]);
    } catch {
      // non-fatal fallback
      setPriorityOptions([
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "NORMAL", label: "Normal" },
        { value: "HIGH", label: "High" },
        { value: "CRITICAL", label: "Critical" },
      ]);
    }
  };

  const fetchStats = async (
    statusList: Array<{ code: number; name: string }>,
    opts: {
      project?: string;
      assignedTo?: string;
      priority?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      const base = `${API_CONFIG.API_URL}/tickets`;
      const headers = { Authorization: `Bearer ${token}` };
      const pid =
        initialProjectId ?? (opts.project !== "all" ? opts.project : undefined);
      const sharedParams: Record<string, string> = {};
      if (pid) sharedParams.projectId = pid;
      if (opts.assignedTo && opts.assignedTo !== "all")
        sharedParams.assignedTo = opts.assignedTo;
      if (opts.priority && opts.priority !== "all")
        sharedParams.priority = opts.priority;
      if (opts.dateFrom) sharedParams.dateFrom = opts.dateFrom;
      if (opts.dateTo) sharedParams.dateTo = opts.dateTo;
      const [allRes, ...statusRes] = await Promise.all([
        axios.get(base, {
          headers,
          params: { limit: 1, page: 1, ...sharedParams },
        }),
        ...statusList.map((s) =>
          axios.get(base, {
            headers,
            params: {
              limit: 1,
              page: 1,
              status: String(s.code),
              ...sharedParams,
            },
          }),
        ),
      ]);
      const newStats: Record<string, number> = {
        total: allRes.data.data?.pagination?.total ?? 0,
      };
      statusList.forEach((s, i) => {
        newStats[String(s.code)] =
          statusRes[i].data.data?.pagination?.total ?? 0;
      });
      setTicketStats(newStats);
    } catch {
      // non-fatal — stats are display-only
    }
  };

  // All filtering is done server-side; filteredTickets is the current page returned by the API.
  const filteredTickets = useMemo(() => tickets, [tickets]);

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

  const getTicketProjectId = (ticket: Ticket): string | null => {
    const raw = ticket.metadata?.projectId;
    if (!raw) return null;
    return typeof raw === "object" ? raw._id || null : null;
  };

  const fetchBulkAssignableAgents = async (departmentId: string) => {
    if (!departmentId) {
      setBulkAssignAgents([]);
      return;
    }

    setBulkAssignLoadingAgents(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/assignable-agents`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { departmentId },
        },
      );
      setBulkAssignAgents(
        Array.isArray(response.data?.data) ? response.data.data : [],
      );
    } catch {
      setBulkAssignAgents([]);
    } finally {
      setBulkAssignLoadingAgents(false);
    }
  };

  const handleOpenBulkAssignModal = async () => {
    setBulkError("");
    const selected = filteredTickets.filter((t) =>
      selectedTicketIds.has(t._id),
    );
    if (selected.length === 0) return;

    const projectIds = new Set(
      selected.map((ticket) => getTicketProjectId(ticket)).filter(Boolean),
    );

    if (projectIds.size !== 1) {
      setBulkError(
        "Bulk assign requires tickets from the same project. Please filter/select tickets from one project.",
      );
      return;
    }

    const projectId = Array.from(projectIds)[0] as string;

    setBulkAssignDepartmentId("");
    setBulkAssignAgentId("");
    setBulkAssignAgents([]);
    setBulkAssignDepartments([]);

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/departments/project/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const departments = Array.isArray(response.data?.data)
        ? response.data.data
        : [];
      setBulkAssignDepartments(departments);
      setShowBulkAssignModal(true);
    } catch (err: any) {
      setBulkError(
        err?.response?.data?.message ||
          "Failed to load departments for selected tickets",
      );
    }
  };

  const handleConfirmBulkAssign = async () => {
    if (!bulkAssignAgentId || selectedTicketIds.size === 0) return;
    setBulkLoading(true);
    setBulkError("");

    try {
      const token = localStorage.getItem("authToken");
      const ticketIds = Array.from(selectedTicketIds);
      const results = await Promise.allSettled(
        ticketIds.map((ticketId) =>
          axios.patch(
            `${API_CONFIG.API_URL}/tickets/${ticketId}/reassign`,
            { newAgentId: bulkAssignAgentId, reason: "Bulk assignment" },
            { headers: { Authorization: `Bearer ${token}` } },
          ),
        ),
      );

      const failedCount = results.filter((r) => r.status === "rejected").length;

      if (failedCount > 0) {
        setBulkError(
          `${failedCount} of ${ticketIds.length} tickets failed to assign. Please retry the failed ones.`,
        );
      }

      if (failedCount < ticketIds.length) {
        setShowBulkAssignModal(false);
        setSelectedTicketIds(new Set());
        fetchTickets(1, filterProject, filterAssignedTo);
      }
    } catch (err: any) {
      setBulkError(err?.response?.data?.message || "Failed to assign tickets");
    } finally {
      setBulkLoading(false);
    }
  };

  const selectedTickets = filteredTickets.filter((t) =>
    selectedTicketIds.has(t._id),
  );

  const loadingContent = (
    <div style={{ padding: "24px", textAlign: "center" }}>
      <p>Loading tickets...</p>
    </div>
  );

  const STATUS_COLOR_PALETTE = [
    { color: "#047857", bg: "#ecfdf5", borderActive: "#6ee7b7" },
    { color: "#b45309", bg: "#fffbeb", borderActive: "#fcd34d" },
    { color: "#7c3aed", bg: "#f5f3ff", borderActive: "#c4b5fd" },
    { color: "#0369a1", bg: "#f0f9ff", borderActive: "#7dd3fc" },
    { color: "#be123c", bg: "#fff1f2", borderActive: "#fda4af" },
    { color: "#15803d", bg: "#f0fdf4", borderActive: "#86efac" },
    { color: "#9a3412", bg: "#fff7ed", borderActive: "#fdba74" },
    { color: "#1e40af", bg: "#eff6ff", borderActive: "#93c5fd" },
  ];
  const statsCards = [
    {
      label: "Total Queries",
      sub: "All statuses",
      value: ticketStats.total ?? 0,
      color: "#1d4ed8",
      bg: "#eff6ff",
      borderActive: "#93c5fd",
      statusFilter: "all",
    },
    ...statuses.map((s, i) => ({
      label: s.name,
      sub: "Click to filter",
      value: ticketStats[String(s.code)] ?? 0,
      statusFilter: String(s.code),
      ...STATUS_COLOR_PALETTE[i % STATUS_COLOR_PALETTE.length],
    })),
  ];

  const visibleColumnDefs = useMemo(
    () =>
      visibleColumns
        .map((key) => {
          const existing = TICKET_TABLE_COLUMN_DEFS.find(
            (def) => def.key === key,
          );
          if (existing) return existing;
          // Handle custom field columns
          if (key.startsWith("field_")) {
            const fieldName = key.replace(/^field_/, "");
            const fieldDef = customFormFieldDefs.find(
              (f) => f.fieldName === fieldName,
            );
            const label = fieldDef?.fieldLabel || fieldName;
            return { key: key as TicketTableColumnKey, label };
          }
          return null;
        })
        .filter(Boolean) as Array<{ key: TicketTableColumnKey; label: string }>,
    [visibleColumns, customFormFieldDefs],
  );
  const tableColumnCount =
    visibleColumnDefs.length + 1 + (canMerge || canDelete || canAssign ? 1 : 0);

  const renderTicketDataCell = (
    columnKey: TicketTableColumnKey,
    ticket: Ticket,
  ) => {
    const _centerId = ticket.metadata?.centerId as any;
    const centerName =
      !_centerId || _centerId === "online"
        ? "Online"
        : _centerId?.centerName
          ? _centerId.centerName
          : typeof _centerId === "string"
            ? _centerId
            : "Center";
    const projectName =
      typeof ticket.metadata?.projectId === "object"
        ? ticket.metadata.projectId.name || ticket.metadata.projectId.code
        : "-";
    const sourceRaw =
      (ticket.metadata?.submissionType || "online").toString() || "online";
    const sourceLabel =
      sourceRaw.charAt(0).toUpperCase() + sourceRaw.slice(1).toLowerCase();
    const pill = getSlaPill(ticket);
    const priorityMap: Record<string, { bg: string; color: string }> = {
      low: { bg: "#ECFDF3", color: "#027A48" },
      medium: { bg: "#FFFAEB", color: "#B54708" },
      high: { bg: "#FFF1F3", color: "#C01048" },
      critical: { bg: "#F4F3FF", color: "#5925DC" },
      urgent: { bg: "#F4F3FF", color: "#5925DC" },
    };
    const pStyle = priorityMap[ticket.priority?.toLowerCase()] || {
      bg: "#F2F4F7",
      color: "#344054",
    };

    switch (columnKey) {
      case "ticketNumber":
        return (
          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
            <span
              style={{
                fontWeight: 600,
                color: "#2563EB",
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              #{ticket.ticketNumber}
              {ticket.hasNewReply && (
                <span
                  style={{
                    display: "inline-block",
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "#F59E0B",
                    flexShrink: 0,
                  }}
                  title="Unread reply"
                />
              )}
            </span>
          </td>
        );

      case "subject":
        return (
          <td style={{ padding: "12px 16px", maxWidth: "260px" }}>
            <div
              style={{
                fontWeight: ticket.hasNewReply ? 700 : 500,
                color: "#101828",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ticket.subject || "No subject"}
            </div>
            {ticket.category && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#667085",
                  marginTop: "2px",
                }}
              >
                {ticket.category.name}
              </div>
            )}
          </td>
        );

      case "requestedBy":
        return (
          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: "13px", color: "#344054" }}>
              {ticket.metadata?.studentName ||
                ticket.metadata?.studentEmail ||
                "—"}
            </div>
            {ticket.metadata?.studentName && ticket.metadata?.studentEmail && (
              <div
                style={{
                  fontSize: "11px",
                  color: "#667085",
                  marginTop: "1px",
                }}
              >
                {ticket.metadata.studentEmail}
              </div>
            )}
          </td>
        );

      case "assignee":
        return (
          <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
            {ticket.assignedTo ? (
              <div style={{ fontSize: "13px", color: "#344054" }}>
                {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
              </div>
            ) : (
              <span
                style={{
                  fontSize: "12px",
                  color: "#9CA3AF",
                  fontStyle: "italic",
                }}
              >
                Unassigned
              </span>
            )}
          </td>
        );

      case "priority":
        return (
          <td style={{ padding: "12px 16px" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                background: pStyle.bg,
                color: pStyle.color,
                textTransform: "capitalize",
                whiteSpace: "nowrap",
              }}
            >
              {ticket.priority || "—"}
            </span>
          </td>
        );

      case "status":
        return (
          <td style={{ padding: "12px 16px" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                background:
                  (ticket.statusColor || getStatusColor(ticket.status)) + "20",
                color: ticket.statusColor || getStatusColor(ticket.status),
                whiteSpace: "nowrap",
              }}
            >
              {ticket.statusName || getStatusDisplayName(ticket.status)}
            </span>
          </td>
        );

      case "sla":
        return (
          <td style={{ padding: "12px 16px" }}>
            {pill ? (
              <span
                title={pill.tooltip}
                style={{
                  padding: "3px 8px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: pill.color,
                  background: pill.bg,
                  border: `1px solid ${pill.color}30`,
                  whiteSpace: "nowrap",
                }}
              >
                ⏱ {pill.label}
              </span>
            ) : (
              <span style={{ color: "#9CA3AF", fontSize: "13px" }}>—</span>
            )}
          </td>
        );

      case "createdAt":
        return (
          <td
            style={{
              padding: "12px 16px",
              whiteSpace: "nowrap",
              color: "#667085",
              fontSize: "13px",
            }}
          >
            {new Date(ticket.createdAt).toLocaleDateString()}
          </td>
        );

      case "center":
        return (
          <td style={{ padding: "12px 16px" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                background: centerName === "Online" ? "#DBEAFE" : "#FEF3C7",
                color: centerName === "Online" ? "#1E40AF" : "#92400E",
                whiteSpace: "nowrap",
              }}
            >
              {centerName}
            </span>
          </td>
        );

      case "project":
        return (
          <td
            style={{ padding: "12px 16px", fontSize: "13px", color: "#344054" }}
          >
            {projectName}
          </td>
        );

      case "category":
        return (
          <td
            style={{ padding: "12px 16px", fontSize: "13px", color: "#344054" }}
          >
            {ticket.category?.name || "—"}
          </td>
        );

      case "source":
        return (
          <td
            style={{ padding: "12px 16px", fontSize: "13px", color: "#344054" }}
          >
            {sourceLabel}
          </td>
        );

      case "mergedCount":
        return (
          <td
            style={{ padding: "12px 16px", fontSize: "13px", color: "#344054" }}
          >
            {ticket.mergedTickets?.length || 0}
          </td>
        );

      default:
        // Handle custom form field columns (key format: field_FieldName)
        if (columnKey.startsWith("field_")) {
          const fieldName = columnKey.replace(/^field_/, "");
          const value = ticket.metadata?.customFields?.[fieldName];
          return (
            <td
              style={{
                padding: "12px 16px",
                fontSize: "13px",
                color: "#344054",
              }}
            >
              {value !== undefined && value !== null && value !== ""
                ? String(value)
                : "—"}
            </td>
          );
        }
        return <td style={{ padding: "12px 16px", color: "#9CA3AF" }}>—</td>;
    }
  };

  return (
    <Wrapper wrap={wrapWithLayout}>
      {loading ? (
        loadingContent
      ) : (
        <>
          <div
            style={{
              padding: "24px 20px 32px",
              maxWidth: "1380px",
              margin: "0 auto",
              background: "#f6f8fc",
              minHeight: "100vh",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}
          >
            <div
              style={{
                background: "#ffffff",
                padding: "22px 24px",
                borderRadius: "14px",
                marginBottom: "16px",
                border: "1px solid #e7ebf3",
                boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
              }}
            >
              <h1
                style={{
                  margin: "0 0 6px 0",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#111827",
                  letterSpacing: "-0.01em",
                  fontFamily:
                    '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}
              >
                {hasViewAll ? "All Queries" : "My Queries"}
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#6b7280",
                  fontWeight: 400,
                  fontFamily:
                    '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}
              >
                {hasViewAll
                  ? "View and manage all support queries across all projects"
                  : "View and manage queries assigned to you"}
              </p>
            </div>
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
                  {pendingNewTickets} new ticket
                  {pendingNewTickets > 1 ? "s" : ""} arrived — click to refresh
                </span>
              </div>
            )}

            {/* Stats Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              {statsCards.map((stat) => {
                const isActive = filterStatus === stat.statusFilter;
                return (
                  <div
                    key={stat.label}
                    onClick={() => setFilterStatus(stat.statusFilter)}
                    style={{
                      background: isActive ? stat.bg : "#ffffff",
                      border: isActive
                        ? `2px solid ${stat.borderActive}`
                        : "1px solid #e7ebf3",
                      borderRadius: "12px",
                      padding: isActive ? "13px 15px" : "14px 16px",
                      boxShadow: isActive
                        ? `0 0 0 3px ${stat.bg}`
                        : "0 2px 10px rgba(15, 23, 42, 0.04)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      userSelect: "none" as const,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = stat.borderActive;
                        e.currentTarget.style.boxShadow = `0 4px 16px rgba(15, 23, 42, 0.08)`;
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = "#e7ebf3";
                        e.currentTarget.style.boxShadow =
                          "0 2px 10px rgba(15, 23, 42, 0.04)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "11px",
                          color: isActive ? stat.color : "#6b7280",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {stat.label}
                      </div>
                      {isActive && (
                        <span
                          style={{
                            fontSize: "10px",
                            background: stat.color,
                            color: "white",
                            borderRadius: "999px",
                            padding: "1px 7px",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                          }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#9ca3af",
                        marginBottom: "8px",
                      }}
                    >
                      {stat.sub}
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        background: stat.bg,
                        color: stat.color,
                        fontWeight: 700,
                        fontSize: "20px",
                        lineHeight: 1,
                      }}
                    >
                      {stat.value.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Filters */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid #e7ebf3",
                padding: "14px",
                boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)",
                marginBottom: "16px",
              }}
            >
              {/* Row 1: Search + action buttons */}
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                {/* Search */}
                <div style={{ position: "relative", flex: 1 }}>
                  <MagnifyingGlassIcon
                    style={{
                      position: "absolute",
                      left: "14px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "16px",
                      height: "16px",
                      color: "#9CA3AF",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search by ticket #, subject, student..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      height: "42px",
                      padding: `10px ${searchQuery ? "36px" : "14px"} 10px 40px`,
                      border: "1px solid #d7deea",
                      borderRadius: "10px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      background: "white",
                      outline: "none",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                      transition: "all 0.2s ease",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#84caff";
                      e.target.style.boxShadow =
                        "0 0 0 3px rgba(132, 202, 255, 0.25)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#d7deea";
                      e.target.style.boxShadow =
                        "0 1px 3px rgba(0, 0, 0, 0.04)";
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#9CA3AF",
                        padding: "2px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <XMarkIcon style={{ width: "14px", height: "14px" }} />
                    </button>
                  )}
                </div>

                {/* Export */}
                {canExport && (
                  <button
                    onClick={() => setShowExportModal(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      height: "42px",
                      padding: "0 16px",
                      background: "#059669",
                      color: "white",
                      border: "none",
                      borderRadius: "10px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#047857")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "#059669")
                    }
                  >
                    <ArrowDownTrayIcon
                      style={{ width: "15px", height: "15px" }}
                    />
                    Export
                  </button>
                )}

                {canConfigureColumns && (
                  <button
                    onClick={() => {
                      if (!activeProjectForColumns) {
                        toast.error(
                          "Select a project first to configure columns",
                        );
                        return;
                      }
                      navigate(
                        `/ticket-config/settings/${activeProjectForColumns}?tab=tableColumns`,
                      );
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      height: "42px",
                      padding: "0 14px",
                      background: "#2563EB",
                      color: "white",
                      border: "none",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Configure Columns
                  </button>
                )}

                {/* Clear filters */}
                {((initialProjectId ? false : filterProject !== "all") ||
                  filterAssignedTo !== "all" ||
                  filterStatus !== "all" ||
                  filterPriority !== "all" ||
                  filterDateFrom ||
                  filterDateTo ||
                  searchQuery) && (
                  <button
                    onClick={() => {
                      if (!initialProjectId) setFilterProject("all");
                      setFilterAssignedTo("all");
                      setFilterStatus("all");
                      setFilterPriority("all");
                      setFilterDateFrom("");
                      setFilterDateTo("");
                      setSearchQuery("");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      height: "42px",
                      padding: "0 14px",
                      border: "1px solid #d7deea",
                      borderRadius: "10px",
                      background: "white",
                      color: "#6B7280",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#FEF2F2";
                      e.currentTarget.style.color = "#DC2626";
                      e.currentTarget.style.borderColor = "#FCA5A5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "white";
                      e.currentTarget.style.color = "#6B7280";
                      e.currentTarget.style.borderColor = "#d7deea";
                    }}
                  >
                    <XMarkIcon style={{ width: "13px", height: "13px" }} />
                    Clear filters
                  </button>
                )}
              </div>

              {/* Row 2: Hierarchical filter grid — Project (parent) → Status → Priority → Assignee → Date From → Date To */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                {/* 1. Project — parent filter, shown only when not locked to a portal project */}
                {!initialProjectId && projects.length > 0 && (
                  <div style={{ position: "relative" }}>
                    <select
                      value={filterProject}
                      onChange={(e) => {
                        setFilterProject(e.target.value);
                        setCustomFieldFilters({});
                      }}
                      style={{
                        width: "100%",
                        height: "42px",
                        padding: "8px 36px 8px 10px",
                        border:
                          filterProject !== "all"
                            ? "1px solid #84caff"
                            : "1px solid #d7deea",
                        borderRadius: "10px",
                        fontSize: "14px",
                        background:
                          filterProject !== "all" ? "#eff6ff" : "white",
                        color: filterProject !== "all" ? "#1d4ed8" : "#374151",
                        cursor: "pointer",
                        appearance: "none" as const,
                        WebkitAppearance: "none" as const,
                        fontWeight: filterProject !== "all" ? 500 : 400,
                        outline: "none",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                      }}
                    >
                      <option value="all">All Projects</option>
                      {projects.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} {p.code ? `(${p.code})` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "13px",
                        height: "13px",
                        pointerEvents: "none",
                        color: filterProject !== "all" ? "#1d4ed8" : "#6B7280",
                      }}
                    />
                  </div>
                )}

                {/* 2. Status */}
                <div style={{ position: "relative" }}>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{
                      width: "100%",
                      height: "42px",
                      padding: "8px 36px 8px 10px",
                      border:
                        filterStatus !== "all"
                          ? "1px solid #84caff"
                          : "1px solid #d7deea",
                      borderRadius: "10px",
                      fontSize: "14px",
                      background: filterStatus !== "all" ? "#eff6ff" : "white",
                      color: filterStatus !== "all" ? "#1d4ed8" : "#374151",
                      cursor: "pointer",
                      appearance: "none" as const,
                      WebkitAppearance: "none" as const,
                      fontWeight: filterStatus !== "all" ? 500 : 400,
                      outline: "none",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                    }}
                  >
                    <option value="all">All Status</option>
                    {statuses.map((s) => (
                      <option key={s.code} value={String(s.code)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "13px",
                      height: "13px",
                      pointerEvents: "none",
                      color: filterStatus !== "all" ? "#1d4ed8" : "#6B7280",
                    }}
                  />
                </div>

                {/* 3. Priority */}
                <div style={{ position: "relative" }}>
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    style={{
                      width: "100%",
                      height: "42px",
                      padding: "8px 36px 8px 10px",
                      border:
                        filterPriority !== "all"
                          ? "1px solid #84caff"
                          : "1px solid #d7deea",
                      borderRadius: "10px",
                      fontSize: "14px",
                      background:
                        filterPriority !== "all" ? "#eff6ff" : "white",
                      color: filterPriority !== "all" ? "#1d4ed8" : "#374151",
                      cursor: "pointer",
                      appearance: "none" as const,
                      WebkitAppearance: "none" as const,
                      fontWeight: filterPriority !== "all" ? 500 : 400,
                      outline: "none",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                    }}
                  >
                    <option value="all">All Priority</option>
                    {priorityOptions.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "13px",
                      height: "13px",
                      pointerEvents: "none",
                      color: filterPriority !== "all" ? "#1d4ed8" : "#6B7280",
                    }}
                  />
                </div>

                {/* 4. Assigned Agent */}
                {agents.length > 0 && (
                  <div style={{ position: "relative" }}>
                    <select
                      value={filterAssignedTo}
                      onChange={(e) => setFilterAssignedTo(e.target.value)}
                      style={{
                        width: "100%",
                        height: "42px",
                        padding: "8px 36px 8px 10px",
                        border:
                          filterAssignedTo !== "all"
                            ? "1px solid #84caff"
                            : "1px solid #d7deea",
                        borderRadius: "10px",
                        fontSize: "14px",
                        background:
                          filterAssignedTo !== "all" ? "#eff6ff" : "white",
                        color:
                          filterAssignedTo !== "all" ? "#1d4ed8" : "#374151",
                        cursor: "pointer",
                        appearance: "none" as const,
                        WebkitAppearance: "none" as const,
                        fontWeight: filterAssignedTo !== "all" ? 500 : 400,
                        outline: "none",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
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
                    <ChevronDownIcon
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "13px",
                        height: "13px",
                        pointerEvents: "none",
                        color:
                          filterAssignedTo !== "all" ? "#1d4ed8" : "#6B7280",
                      }}
                    />
                  </div>
                )}

                {/* 5. Date From — separate labeled field */}
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      top: "-9px",
                      left: "10px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#9ca3af",
                      background: "white",
                      padding: "0 4px",
                      zIndex: 1,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    From
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: "42px",
                      border: filterDateFrom
                        ? "1px solid #84caff"
                        : "1px solid #d7deea",
                      borderRadius: "10px",
                      padding: "0 10px",
                      background: filterDateFrom ? "#eff6ff" : "white",
                      boxShadow: "0 1px 3px rgba(0,0,0,.04)",
                      gap: "6px",
                    }}
                  >
                    <CalendarDaysIcon
                      style={{
                        width: "14px",
                        height: "14px",
                        color: filterDateFrom ? "#1d4ed8" : "#9CA3AF",
                        flexShrink: 0,
                      }}
                    />
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontSize: "13px",
                        outline: "none",
                        color: filterDateFrom ? "#1d4ed8" : "#6B7280",
                        width: "100%",
                        cursor: "pointer",
                        fontWeight: filterDateFrom ? 500 : 400,
                      }}
                    />
                    {filterDateFrom && (
                      <button
                        onClick={() => setFilterDateFrom("")}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#9CA3AF",
                          padding: 0,
                          display: "flex",
                          flexShrink: 0,
                        }}
                      >
                        <XMarkIcon style={{ width: "12px", height: "12px" }} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 6. Date To — separate labeled field */}
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      top: "-9px",
                      left: "10px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "#9ca3af",
                      background: "white",
                      padding: "0 4px",
                      zIndex: 1,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    To
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: "42px",
                      border: filterDateTo
                        ? "1px solid #84caff"
                        : "1px solid #d7deea",
                      borderRadius: "10px",
                      padding: "0 10px",
                      background: filterDateTo ? "#eff6ff" : "white",
                      boxShadow: "0 1px 3px rgba(0,0,0,.04)",
                      gap: "6px",
                    }}
                  >
                    <CalendarDaysIcon
                      style={{
                        width: "14px",
                        height: "14px",
                        color: filterDateTo ? "#1d4ed8" : "#9CA3AF",
                        flexShrink: 0,
                      }}
                    />
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontSize: "13px",
                        outline: "none",
                        color: filterDateTo ? "#1d4ed8" : "#6B7280",
                        width: "100%",
                        cursor: "pointer",
                        fontWeight: filterDateTo ? 500 : 400,
                      }}
                    />
                    {filterDateTo && (
                      <button
                        onClick={() => setFilterDateTo("")}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#9CA3AF",
                          padding: 0,
                          display: "flex",
                          flexShrink: 0,
                        }}
                      >
                        <XMarkIcon style={{ width: "12px", height: "12px" }} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 3: Hint */}
              <div
                style={{
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "#6b7280",
                }}
              >
                Filter order:{" "}
                <strong style={{ fontWeight: 600, color: "#374151" }}>
                  Project
                </strong>{" "}
                → Status → Priority → Assignee → Date range
              </div>

              {/* Row 4: Dynamic custom field filters (from filterable columns config) */}
              {filterableColumnKeys.filter((k) => k.startsWith("field_"))
                .length > 0 && (
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  {filterableColumnKeys
                    .filter((k) => k.startsWith("field_"))
                    .map((colKey) => {
                      const fieldName = colKey.replace(/^field_/, "");
                      const fieldDef = customFormFieldDefs.find(
                        (f) => f.fieldName === fieldName,
                      );
                      const label = fieldDef?.fieldLabel || fieldName;
                      const currentVal = customFieldFilters[colKey] || "";
                      const hasOptions =
                        fieldDef &&
                        (fieldDef.fieldType === "dropdown" ||
                          fieldDef.fieldType === "radio" ||
                          fieldDef.fieldType === "multiselect") &&
                        Array.isArray(fieldDef.options) &&
                        fieldDef.options.length > 0;

                      return (
                        <div key={colKey} style={{ position: "relative" }}>
                          <span
                            style={{
                              position: "absolute",
                              top: "-9px",
                              left: "10px",
                              fontSize: "10px",
                              fontWeight: 700,
                              color: "#9ca3af",
                              background: "white",
                              padding: "0 4px",
                              zIndex: 1,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase" as const,
                            }}
                          >
                            {label}
                          </span>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              height: "42px",
                              border: currentVal
                                ? "1px solid #84caff"
                                : "1px solid #d7deea",
                              borderRadius: "10px",
                              padding: "0 10px",
                              background: currentVal ? "#eff6ff" : "white",
                              boxShadow: "0 1px 3px rgba(0,0,0,.04)",
                              gap: "6px",
                              minWidth: "160px",
                            }}
                          >
                            {hasOptions ? (
                              <select
                                value={currentVal}
                                onChange={(e) =>
                                  setCustomFieldFilters((prev) => ({
                                    ...prev,
                                    [colKey]: e.target.value,
                                  }))
                                }
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  fontSize: "13px",
                                  outline: "none",
                                  color: currentVal ? "#1d4ed8" : "#6B7280",
                                  width: "100%",
                                  cursor: "pointer",
                                  fontWeight: currentVal ? 500 : 400,
                                }}
                              >
                                <option value="">All</option>
                                {fieldDef!.options!.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                placeholder={`Filter by ${label}`}
                                value={currentVal}
                                onChange={(e) =>
                                  setCustomFieldFilters((prev) => ({
                                    ...prev,
                                    [colKey]: e.target.value,
                                  }))
                                }
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  fontSize: "13px",
                                  outline: "none",
                                  color: currentVal ? "#1d4ed8" : "#6B7280",
                                  width: "100%",
                                  fontWeight: currentVal ? 500 : 400,
                                }}
                              />
                            )}
                            {currentVal && (
                              <button
                                onClick={() =>
                                  setCustomFieldFilters((prev) => ({
                                    ...prev,
                                    [colKey]: "",
                                  }))
                                }
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "#9CA3AF",
                                  padding: 0,
                                  display: "flex",
                                  flexShrink: 0,
                                }}
                              >
                                <XMarkIcon
                                  style={{ width: "12px", height: "12px" }}
                                />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Tickets Table */}
            <div
              style={{
                background: "white",
                borderRadius: "10px",
                border: "1px solid #E4E7EC",
                boxShadow: "0 1px 3px rgba(0,0,0,.06)",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "14px",
                  minWidth: `${Math.max(visibleColumnDefs.length * 150, 920)}px`,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#F9FAFB",
                      borderBottom: "1px solid #E4E7EC",
                    }}
                  >
                    {(canMerge || canDelete || canAssign) && (
                      <th
                        style={{
                          padding: "12px 16px",
                          width: "40px",
                          textAlign: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            filteredTickets.length > 0 &&
                            selectedTicketIds.size === filteredTickets.length
                          }
                          onChange={toggleSelectAll}
                          style={{
                            width: "16px",
                            height: "16px",
                            cursor: "pointer",
                          }}
                        />
                      </th>
                    )}
                    {visibleColumnDefs.map((col) => (
                      <th
                        key={col.key}
                        style={{
                          padding: "12px 16px",
                          textAlign: "left",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#667085",
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.5px",
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "right",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#667085",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tableColumnCount}
                        style={{
                          padding: "48px",
                          textAlign: "center",
                          color: "#667085",
                        }}
                      >
                        No tickets found
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((ticket) => {
                      const isSelected = selectedTicketIds.has(ticket._id);
                      const isHighlighted = !!(
                        ticket.hasNewReply && !isSelected
                      );
                      return (
                        <tr
                          key={ticket._id}
                          onClick={() => {
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
                          onMouseEnter={(e) => {
                            if (!isSelected)
                              e.currentTarget.style.background = isHighlighted
                                ? "#FFF7E0"
                                : "#F9FAFB";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isSelected
                              ? "#EFF6FF"
                              : isHighlighted
                                ? "#FFFBEB"
                                : "white";
                          }}
                          style={{
                            background: isSelected
                              ? "#EFF6FF"
                              : isHighlighted
                                ? "#FFFBEB"
                                : "white",
                            borderBottom: "1px solid #F2F4F7",
                            borderLeft: isHighlighted
                              ? "3px solid #F59E0B"
                              : "3px solid transparent",
                            cursor: "pointer",
                            transition: "background 0.12s",
                          }}
                        >
                          {(canMerge || canDelete || canAssign) && (
                            <td
                              style={{
                                padding: "12px 16px",
                                textAlign: "center",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTicketSelect(ticket._id)}
                                style={{
                                  width: "16px",
                                  height: "16px",
                                  cursor: "pointer",
                                }}
                              />
                            </td>
                          )}
                          {visibleColumnDefs.map((col) => (
                            <React.Fragment key={col.key}>
                              {renderTicketDataCell(col.key, ticket)}
                            </React.Fragment>
                          ))}
                          <td
                            style={{
                              padding: "12px 16px",
                              textAlign: "right" as const,
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div
                              style={{
                                position: "relative",
                                display: "inline-block",
                              }}
                            >
                              <button
                                onClick={() =>
                                  setOpenActionMenuId(
                                    openActionMenuId === ticket._id
                                      ? null
                                      : ticket._id,
                                  )
                                }
                                style={{
                                  background: "none",
                                  border: "1px solid #E4E7EC",
                                  borderRadius: "6px",
                                  padding: "5px 10px",
                                  cursor: "pointer",
                                  color: "#667085",
                                  fontSize: "15px",
                                  lineHeight: 1,
                                  letterSpacing: "2px",
                                }}
                                title="Actions"
                              >
                                •••
                              </button>
                              {openActionMenuId === ticket._id && (
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: "calc(100% + 4px)",
                                    background: "white",
                                    border: "1px solid #E4E7EC",
                                    borderRadius: "8px",
                                    boxShadow: "0 4px 16px rgba(0,0,0,.12)",
                                    zIndex: 100,
                                    minWidth: "140px",
                                    padding: "4px 0",
                                    overflow: "hidden",
                                  }}
                                >
                                  <button
                                    onClick={() => {
                                      setOpenActionMenuId(null);
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
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      padding: "9px 16px",
                                      background: "none",
                                      border: "none",
                                      textAlign: "left" as const,
                                      fontSize: "13px",
                                      cursor: "pointer",
                                      color: "#344054",
                                    }}
                                    onMouseEnter={(e) =>
                                      (e.currentTarget.style.background =
                                        "#F9FAFB")
                                    }
                                    onMouseLeave={(e) =>
                                      (e.currentTarget.style.background =
                                        "none")
                                    }
                                  >
                                    View
                                  </button>
                                  {canMerge && !ticket.isMerged && (
                                    <button
                                      onClick={() => {
                                        setOpenActionMenuId(null);
                                        setSelectedTicket(ticket);
                                        setShowMergeModal(true);
                                      }}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        padding: "9px 16px",
                                        background: "none",
                                        border: "none",
                                        textAlign: "left" as const,
                                        fontSize: "13px",
                                        cursor: "pointer",
                                        color: "#344054",
                                      }}
                                      onMouseEnter={(e) =>
                                        (e.currentTarget.style.background =
                                          "#F9FAFB")
                                      }
                                      onMouseLeave={(e) =>
                                        (e.currentTarget.style.background =
                                          "none")
                                      }
                                    >
                                      Merge
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      onClick={() => {
                                        setOpenActionMenuId(null);
                                        setSelectedTicketIds(
                                          new Set([ticket._id]),
                                        );
                                        setShowBulkDeleteConfirm(true);
                                      }}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        padding: "9px 16px",
                                        background: "none",
                                        border: "none",
                                        textAlign: "left" as const,
                                        fontSize: "13px",
                                        cursor: "pointer",
                                        color: "#DC2626",
                                      }}
                                      onMouseEnter={(e) =>
                                        (e.currentTarget.style.background =
                                          "#FEF2F2")
                                      }
                                      onMouseLeave={(e) =>
                                        (e.currentTarget.style.background =
                                          "none")
                                      }
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <button
                  onClick={() =>
                    fetchTickets(
                      currentPage - 1,
                      filterProject,
                      filterAssignedTo,
                    )
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
                    fetchTickets(
                      currentPage + 1,
                      filterProject,
                      filterAssignedTo,
                    )
                  }
                  disabled={currentPage >= totalPages || loading}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #D1D5DB",
                    background: currentPage >= totalPages ? "#F3F4F6" : "white",
                    color: currentPage >= totalPages ? "#9CA3AF" : "#374151",
                    cursor:
                      currentPage >= totalPages ? "not-allowed" : "pointer",
                    fontSize: "13px",
                  }}
                >
                  Next →
                </button>
              </div>
              <div>
                Showing{" "}
                {totalTickets > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
                {Math.min(currentPage * pageSize, totalTickets)} of{" "}
                {totalTickets} tickets
              </div>
            </div>
          </div>

          {/* Floating Bulk Action Bar */}
          {selectedTicketIds.size > 0 && (
            <div
              style={{
                position: "fixed",
                bottom: "28px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "#1E293B",
                color: "white",
                borderRadius: "12px",
                padding: "12px 20px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 8px 32px rgba(0,0,0,.3)",
                zIndex: 200,
                whiteSpace: "nowrap" as const,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "14px" }}>
                {selectedTicketIds.size} ticket
                {selectedTicketIds.size !== 1 ? "s" : ""} selected
              </span>
              <div
                style={{
                  width: "1px",
                  height: "20px",
                  background: "rgba(255,255,255,.2)",
                }}
              />
              {canMerge && selectedTicketIds.size >= 2 && (
                <button
                  onClick={() => {
                    const sel = filteredTickets.filter((t) =>
                      selectedTicketIds.has(t._id),
                    );
                    const keys = new Set(
                      sel.map(
                        (t) =>
                          t.metadata?.studentEmail ||
                          t.metadata?.studentName ||
                          "",
                      ),
                    );
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
                    background: "rgba(255,255,255,.15)",
                    border: "1px solid rgba(255,255,255,.3)",
                    color: "white",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <ArrowsPointingInIcon
                    style={{ width: "14px", height: "14px" }}
                  />
                  Merge
                </button>
              )}
              {canAssign && (
                <button
                  onClick={handleOpenBulkAssignModal}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 14px",
                    background: "rgba(14,116,144,.85)",
                    border: "1px solid rgba(14,116,144,.45)",
                    color: "white",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Assign
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
                    background: "rgba(239,68,68,.8)",
                    border: "1px solid rgba(239,68,68,.4)",
                    color: "white",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <TrashIcon style={{ width: "14px", height: "14px" }} />
                  Delete
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedTicketIds(new Set());
                  setBulkError("");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,.7)",
                  cursor: "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <XMarkIcon style={{ width: "14px", height: "14px" }} />
                Clear
              </button>
              {bulkError && (
                <div
                  style={{
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    color: "#B91C1C",
                    fontSize: "12px",
                    maxWidth: "280px",
                  }}
                >
                  {bulkError}
                </div>
              )}
            </div>
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
                  style={{
                    margin: "0 0 8px",
                    fontSize: "18px",
                    fontWeight: 700,
                  }}
                >
                  Select Primary Ticket
                </h2>
                <p
                  style={{
                    margin: "0 0 20px",
                    color: "#6B7280",
                    fontSize: "14px",
                  }}
                >
                  The primary ticket will be kept. All other selected tickets
                  will be merged into it.
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
                          {getStatusDisplayName(t.status)} · Priority:{" "}
                          {t.priority}
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

          {/* Bulk Assign Modal */}
          {showBulkAssignModal && (
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
                if (e.target === e.currentTarget && !bulkLoading) {
                  setShowBulkAssignModal(false);
                }
              }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: "16px",
                  padding: "24px",
                  width: "100%",
                  maxWidth: "480px",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                }}
              >
                <h2
                  style={{
                    margin: "0 0 6px",
                    fontSize: "18px",
                    fontWeight: 700,
                  }}
                >
                  Assign Selected Tickets
                </h2>
                <p
                  style={{
                    margin: "0 0 16px",
                    color: "#6B7280",
                    fontSize: "14px",
                  }}
                >
                  Choose department first, then assign an agent for{" "}
                  {selectedTicketIds.size} selected ticket
                  {selectedTicketIds.size !== 1 ? "s" : ""}.
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
                      marginBottom: "14px",
                    }}
                  >
                    {bulkError}
                  </div>
                )}

                <div style={{ display: "grid", gap: "12px" }}>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 600,
                        marginBottom: "6px",
                        color: "#344054",
                      }}
                    >
                      Department
                    </label>
                    <select
                      value={bulkAssignDepartmentId}
                      onChange={(e) => {
                        const value = e.target.value;
                        setBulkAssignDepartmentId(value);
                        setBulkAssignAgentId("");
                        fetchBulkAssignableAgents(value);
                      }}
                      disabled={bulkLoading}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #D0D5DD",
                        fontSize: "14px",
                      }}
                    >
                      <option value="">Select department</option>
                      {bulkAssignDepartments.map((department) => (
                        <option key={department._id} value={department._id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 600,
                        marginBottom: "6px",
                        color: "#344054",
                      }}
                    >
                      Assign To
                    </label>
                    <select
                      value={bulkAssignAgentId}
                      onChange={(e) => setBulkAssignAgentId(e.target.value)}
                      disabled={
                        !bulkAssignDepartmentId ||
                        bulkAssignLoadingAgents ||
                        bulkLoading
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #D0D5DD",
                        fontSize: "14px",
                      }}
                    >
                      <option value="">
                        {bulkAssignLoadingAgents
                          ? "Loading agents..."
                          : !bulkAssignDepartmentId
                            ? "Select department first"
                            : "Select agent"}
                      </option>
                      {bulkAssignAgents.map((agent) => (
                        <option key={agent._id} value={agent._id}>
                          {agent.firstName} {agent.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "18px",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                  }}
                >
                  <button
                    onClick={() => setShowBulkAssignModal(false)}
                    disabled={bulkLoading}
                    style={{
                      padding: "9px 16px",
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
                    onClick={handleConfirmBulkAssign}
                    disabled={!bulkAssignAgentId || bulkLoading}
                    style={{
                      padding: "9px 16px",
                      background: !bulkAssignAgentId ? "#93C5FD" : "#2563EB",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: !bulkAssignAgentId ? "not-allowed" : "pointer",
                    }}
                  >
                    {bulkLoading
                      ? "Assigning..."
                      : `Assign ${selectedTicketIds.size} Ticket${selectedTicketIds.size !== 1 ? "s" : ""}`}
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
                if (e.target === e.currentTarget)
                  setShowBulkDeleteConfirm(false);
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
                      style={{
                        width: "22px",
                        height: "22px",
                        color: "#DC2626",
                      }}
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
        </>
      )}
      {/* Export Modal */}
      <TicketExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        filters={{
          status: filterStatus !== "all" ? filterStatus : undefined,
          priority: filterPriority !== "all" ? filterPriority : undefined,
          assignedTo: filterAssignedTo !== "all" ? filterAssignedTo : undefined,
          projectId:
            filterProject !== "all"
              ? filterProject
              : (initialProjectId ?? undefined),
          dateFrom: filterDateFrom || undefined,
          dateTo: filterDateTo || undefined,
          search: searchQuery || undefined,
        }}
        filterLabels={{
          status:
            filterStatus !== "all"
              ? statuses.find(
                  (s: { code: number; name: string }) =>
                    String(s.code) === filterStatus,
                )?.name
              : undefined,
          priority: filterPriority !== "all" ? filterPriority : undefined,
          assignedTo:
            filterAssignedTo !== "all"
              ? (agents as any[]).find((a) => a._id === filterAssignedTo)
                  ?.firstName
              : undefined,
          project:
            filterProject !== "all"
              ? (projects as any[]).find((p) => p._id === filterProject)?.name
              : undefined,
          dateFrom: filterDateFrom || undefined,
          dateTo: filterDateTo || undefined,
          search: searchQuery || undefined,
        }}
        ticketCount={ticketStats.total}
      />
    </Wrapper>
  );
};

export default ViewTickets;
