import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useDeferredValue,
} from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import API_BASE_URL from "../config/api";
import { TicketExportModal } from "../components/tickets/TicketExportModal";
import { TicketMergeModal } from "../components/tickets/TicketMergeModal";
import {
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useProjectContext } from "../contexts/ProjectContext";
import { useSocket } from "../hooks/useSocket";
import toast from "react-hot-toast";

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
    _id?: string;
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
    customFields?: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
  isMerged?: boolean;
  mergedInto?: string | { _id: string; ticketNumber: string };
  mergedTickets?: string[];
  hasNewReply?: boolean;
  hasAgentReply?: boolean;
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
  /** Category names for hierarchy levels, enriched by the API */
  categoryHierarchyNames?: {
    level1?: string;
    level2?: string;
    level3?: string;
    level4?: string;
  };
}

interface MyTicketsProps {
  wrapWithLayout?: boolean;
  isStudentView?: boolean;
}

interface DepartmentOption {
  _id: string;
  name: string;
}

interface AssignableAgent {
  _id: string;
  firstName: string;
  lastName: string;
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
  | `field_${string}`
  | `hierarchy_level_${number}`;

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

  const valid = columns.filter(
    (key): key is TicketTableColumnKey =>
      TICKET_TABLE_COLUMN_DEFS.some((col) => col.key === key) ||
      key.startsWith("field_") ||
      key.startsWith("hierarchy_level_"),
  );

  return valid.length > 0 ? valid : DEFAULT_TICKET_TABLE_COLUMNS;
};

// US-ESC-009: SLA countdown helpers
const formatSlaMsRemaining = (ms: number): string => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const computeSlaPill = (
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
  const label = formatSlaMsRemaining(remaining);
  const tooltip = `Due: ${new Date(dueAt).toLocaleString()}`;
  if (pct > 50) return { label, color: "#15803d", bg: "#f0fdf4", tooltip };
  if (pct > 25) return { label, color: "#b45309", bg: "#fffbeb", tooltip };
  return { label, color: "#dc2626", bg: "#fef2f2", tooltip };
};

// ─── Module-level cache ───────────────────────────────────────────────────────
// Survives unmount/remount (tab switches) so switching back to this page is instant.
const MYTICKETS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
interface MyTicketsCacheEntry {
  tickets: Ticket[];
  timestamp: number;
}
interface MasterDataCacheEntry {
  statuses: Array<{ code: number; name: string }>;
  priorities: Array<{ code: string; name: string }>;
  timestamp: number;
}
const myTicketsCache = new Map<string, MyTicketsCacheEntry>();
const myMasterDataCache = new Map<string, MasterDataCacheEntry>();
// ──────────────────────────────────────────────────────────────────────────────

const MyTickets: React.FC<MyTicketsProps> = ({
  wrapWithLayout = true,
  isStudentView = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Get viewMode and currentProjectId from context
  const { viewMode, currentProjectId, userProjects } = useProjectContext();

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

  // Resolve cache key based on project context (available at this point via closure)
  const _initProjectId = (() => {
    if (viewMode === "single" && currentProjectId) return currentProjectId;
    try {
      const pc = localStorage.getItem("projectContext");
      if (pc) return JSON.parse(pc).projectId || "all";
    } catch {
      /* ignore */
    }
    return "all";
  })();
  const _initCacheKey = `mytickets:${_initProjectId}`;
  const _initCached = myTicketsCache.get(_initCacheKey);
  const _hasCachedTickets = !!(
    _initCached && Date.now() - _initCached.timestamp < MYTICKETS_CACHE_TTL
  );

  const [tickets, setTickets] = useState<Ticket[]>(
    _hasCachedTickets ? _initCached!.tickets : [],
  );
  const [loading, setLoading] = useState(!_hasCachedTickets); // skip spinner when cache is warm
  const [error, setError] = useState("");
  // Real-time: pending new-ticket count for page > 1
  const [pendingNewTickets, setPendingNewTickets] = useState(0);
  // US-ESC-009: force re-render every 60s so SLA countdowns stay current
  const [, forceUpdate] = React.useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(() => forceUpdate(), 60000);
    return () => clearInterval(id);
  }, []);
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedToFilter, setAssignedToFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all"); // Project filter for All Projects mode

  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedTickets = useRef(false);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
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
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignDepartments, setBulkAssignDepartments] = useState<
    DepartmentOption[]
  >([]);
  const [bulkAssignDepartmentId, setBulkAssignDepartmentId] = useState("");
  const [bulkAssignAgents, setBulkAssignAgents] = useState<AssignableAgent[]>(
    [],
  );
  const [bulkAssignAgentId, setBulkAssignAgentId] = useState("");
  const [bulkAssignLoadingAgents, setBulkAssignLoadingAgents] = useState(false);
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
  const [hierarchyLevelDefs, setHierarchyLevelDefs] = useState<
    Array<{ levelNumber: number; displayName: string }>
  >([]);
  const [customFieldFilters, setCustomFieldFilters] = useState<
    Record<string, string>
  >({});
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = viewportWidth <= 768;
  const isTablet = viewportWidth > 768 && viewportWidth <= 1024;

  const canExport = checkPermission("TICKET_EXPORT");
  const canMerge = checkPermission("TICKET_MERGE");
  const canAssign = checkPermission("TICKET_REASSIGN");
  const canConfigureColumns = checkPermission(
    "TICKET_CONFIG_MANAGE_TABLE_COLUMNS",
  );

  function resolveMasterDataProjectId() {
    if (viewMode === "unified" && projectFilter !== "all") {
      return projectFilter;
    }

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

    return projectId;
  }

  const configProjectId = resolveMasterDataProjectId();

  useEffect(() => {
    const fetchTicketTableColumns = async () => {
      const projectId = resolveMasterDataProjectId();
      if (!projectId) {
        setVisibleColumns(DEFAULT_TICKET_TABLE_COLUMNS);
        return;
      }

      // Use a longer TTL for settings (they change rarely)
      const settingsCacheKey = `ticketsettings:${projectId}`;
      const settingsCached = myMasterDataCache.get(settingsCacheKey as any);
      if (
        settingsCached &&
        Date.now() - (settingsCached as any).timestamp < 10 * 60 * 1000
      ) {
        setVisibleColumns(
          (settingsCached as any).columns ?? DEFAULT_TICKET_TABLE_COLUMNS,
        );
        setFilterableColumnKeys((settingsCached as any).filterableCols ?? []);
        setCustomFormFieldDefs((settingsCached as any).customFields ?? []);
        setHierarchyLevelDefs((settingsCached as any).hierarchyLevels ?? []);
        return;
      }

      try {
        const token = localStorage.getItem("authToken");
        const response = await axios.get(
          `${API_BASE_URL}/projects/${projectId}/ticket-settings`,
          token
            ? {
                headers: { Authorization: `Bearer ${token}` },
              }
            : undefined,
        );

        const columns = response.data?.ticketConfig?.tableColumns || [];
        const normalizedCols = normalizeTicketColumns(columns);
        setVisibleColumns(normalizedCols);
        const filterableCols: string[] =
          response.data?.ticketConfig?.filterableColumns || [];
        setFilterableColumnKeys(filterableCols);
        const customFields = response.data?.data?.customFormFields || [];
        setCustomFormFieldDefs(customFields);
        const hierarchyLevels: Array<{
          levelNumber: number;
          displayName: string;
        }> = response.data?.ticketConfig?.hierarchyLevels || [];
        setHierarchyLevelDefs(hierarchyLevels);
        // Cache settings so returning to this tab is instant
        (myMasterDataCache as any).set(`ticketsettings:${projectId}`, {
          columns: normalizedCols,
          filterableCols,
          customFields,
          hierarchyLevels,
          timestamp: Date.now(),
        });
      } catch {
        setVisibleColumns(DEFAULT_TICKET_TABLE_COLUMNS);
      }
    };

    fetchTicketTableColumns();
  }, [viewMode, currentProjectId, projectFilter]);

  const fetchMasterData = useCallback(async () => {
    const projectId = resolveMasterDataProjectId();
    const mdCacheKey = `masterdata:${projectId || "all"}`;
    const mdCached = myMasterDataCache.get(mdCacheKey);
    if (mdCached && Date.now() - mdCached.timestamp < MYTICKETS_CACHE_TTL) {
      // Restore from cache immediately
      setStatuses(mdCached.statuses);
      setPriorities(mdCached.priorities);
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;

      const defaultStatuses = [
        { code: 1, name: "Open" },
        { code: 2, name: "In Progress" },
        { code: 3, name: "On Hold" },
        { code: 4, name: "Resolved" },
        { code: 5, name: "Closed" },
      ];
      const defaultPriorities = [
        { code: "Low", name: "Low" },
        { code: "Normal", name: "Normal" },
        { code: "Medium", name: "Medium" },
        { code: "High", name: "High" },
        { code: "Urgent", name: "Urgent" },
        { code: "Critical", name: "Critical" },
      ];

      // Fetch statuses
      let statusData: Array<{ code: number; name: string }> = [];
      try {
        const endpoint = projectId
          ? `${API_BASE_URL}/statuses/project/${projectId}`
          : `${API_BASE_URL}/statuses/all`;
        const statusResponse = await axios.get(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (
          statusResponse.data.success &&
          Array.isArray(statusResponse.data.data)
        ) {
          const seen = new Set<number>();
          statusData = statusResponse.data.data
            .filter((s: any) => {
              if (seen.has(s.code)) return false;
              seen.add(s.code);
              return true;
            })
            .map((s: any) => ({ code: s.code, name: s.name }));
        }
      } catch {
        /* use defaults */
      }
      const resolvedStatuses =
        statusData.length > 0 ? statusData : defaultStatuses;
      setStatuses(resolvedStatuses);

      // Fetch priorities from sla-rules (source of truth for priority names per project)
      let priorityList: Array<{ code: string; name: string }> = [];
      try {
        const slaParams: Record<string, string> = { isActive: "true" };
        if (projectId) slaParams.projectId = projectId;
        const slaResponse = await axios.get(`${API_BASE_URL}/sla-rules`, {
          headers: { Authorization: `Bearer ${token}` },
          params: slaParams,
        });
        if (
          slaResponse.data.success &&
          Array.isArray(slaResponse.data.data) &&
          slaResponse.data.data.length > 0
        ) {
          const seen = new Set<string>();
          priorityList = (slaResponse.data.data as any[])
            .map((p: any) => {
              const name = String(p.name || "").trim();
              if (!name) return null;
              return { code: name, name };
            })
            .filter((item): item is { code: string; name: string } => !!item)
            .filter((item) => {
              const k = item.code.toLowerCase();
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
        }
      } catch {
        /* use defaults */
      }
      const resolvedPriorities =
        priorityList.length > 0 ? priorityList : defaultPriorities;
      setPriorities(resolvedPriorities);

      // Cache for next tab-switch
      myMasterDataCache.set(mdCacheKey, {
        statuses: resolvedStatuses,
        priorities: resolvedPriorities,
        timestamp: Date.now(),
      });
    } catch {
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
        { code: "Medium", name: "Medium" },
        { code: "High", name: "High" },
        { code: "Urgent", name: "Urgent" },
        { code: "Critical", name: "Critical" },
      ]);
    }
  }, [currentProjectId, projectFilter, viewMode]);

  const fetchMyTickets = useCallback(async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        const portalMatch =
          window.location.pathname.match(/^\/([^/]+)\/portal/);
        navigate(portalMatch ? `/${portalMatch[1]}/portal/login` : "/login");
        return;
      }

      // Determine projectId based on viewMode
      let projectId = "";
      if (viewMode === "single" && currentProjectId) {
        projectId = currentProjectId;
      } else if (viewMode === "single") {
        try {
          const pc = localStorage.getItem("projectContext");
          if (pc) projectId = JSON.parse(pc).projectId || "";
        } catch {
          /* ignore */
        }
      }

      const cacheKey = `mytickets:${projectId || "all"}`;
      const cached = myTicketsCache.get(cacheKey);
      const isCacheWarm = !!(
        cached && Date.now() - cached.timestamp < MYTICKETS_CACHE_TTL
      );

      if (isCacheWarm) {
        // Show cached data instantly — no spinner — then silently refresh
        setTickets(cached!.tickets);
        setLoading(false);
        try {
          const url = projectId
            ? `${API_BASE_URL}/tickets/my-tickets?projectId=${projectId}`
            : `${API_BASE_URL}/tickets/my-tickets`;
          const bgRes = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (bgRes.data.success) {
            const fresh = (
              Array.isArray(bgRes.data.data) ? bgRes.data.data : []
            ).filter((t: any) => t && t._id);
            myTicketsCache.set(cacheKey, {
              tickets: fresh,
              timestamp: Date.now(),
            });
            setTickets(fresh);
          }
        } catch {
          /* silent refresh failure — cached data remains */
        }
        return;
      }

      // Cache miss — normal fetch with loading spinner
      setLoading(true);
      const url = projectId
        ? `${API_BASE_URL}/tickets/my-tickets?projectId=${projectId}`
        : `${API_BASE_URL}/tickets/my-tickets`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        const ticketsData = Array.isArray(response.data.data)
          ? response.data.data
          : [];
        const validTickets = ticketsData.filter(
          (ticket: any) => ticket && ticket._id,
        );
        myTicketsCache.set(cacheKey, {
          tickets: validTickets,
          timestamp: Date.now(),
        });
        setTickets(validTickets);
      } else if (
        response.data.error &&
        !response.data.error.includes("Not Found")
      ) {
        setError(response.data.error || "Failed to load tickets");
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        localStorage.removeItem("authToken");
        const portalMatch =
          window.location.pathname.match(/^\/([^/]+)\/portal/);
        navigate(portalMatch ? `/${portalMatch[1]}/portal/login` : "/login");
      } else if (err.response?.status === 403) {
        setError(
          "You do not have permission to view tickets. Please contact your administrator.",
        );
      } else if (err.response?.status !== 404) {
        setError(err.response?.data?.error || "Failed to load tickets");
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, viewMode, currentProjectId]);

  useEffect(() => {
    // Fetch tickets whenever viewMode or currentProjectId changes
    fetchMasterData();
    fetchMyTickets();
  }, [
    fetchMyTickets,
    fetchMasterData,
    viewMode,
    currentProjectId,
    projectFilter,
  ]);

  // When project changes in unified mode, reset dependent filters to avoid stale values.
  useEffect(() => {
    if (viewMode !== "unified") return;
    setStatusFilter("all");
    setPriorityFilter("all");
    setCurrentPage(1);
  }, [projectFilter, viewMode]);

  // Reset project filter when switching to single project mode
  useEffect(() => {
    if (viewMode === "single") {
      setProjectFilter("all");
    }
  }, [viewMode]);

  // Real-time: socket rooms — join the project room so new/assigned tickets arrive live
  const socketRooms = useMemo(() => {
    const userId = localStorage.getItem("userId");
    const rooms: string[] = [];
    // user-{userId} room is auto-joined by the socket server on connect, but
    // we also join the project room to catch new-ticket events
    if (currentProjectId) rooms.push(`project-tickets-${currentProjectId}`);
    else rooms.push("all-tickets");
    return rooms;
  }, [currentProjectId]);

  useSocket({
    rooms: socketRooms,
    events: {
      "ticket-list-update": (payload: { type: string; ticket: any }) => {
        if (payload.type === "new-ticket") {
          // Only show live-prepend if the new ticket is assigned to the current user
          const myUserId = localStorage.getItem("userId");
          const assignedTo =
            payload.ticket.assignedTo?._id || payload.ticket.assignedTo;
          if (assignedTo && assignedTo !== myUserId) return;

          setTickets((prev) => {
            const alreadyExists = prev.some(
              (t) => t._id === payload.ticket._id,
            );
            if (alreadyExists) return prev;
            if (currentPage === 1) {
              toast.success(
                `New ticket assigned: ${payload.ticket.ticketNumber}`,
                { duration: 4000 },
              );
              // Mark unread so the amber highlight shows
              return [
                { ...(payload.ticket as Ticket), hasNewReply: true },
                ...prev.slice(0, pageSize - 1),
              ];
            }
            setPendingNewTickets((n) => n + 1);
            return prev;
          });
        } else if (payload.type === "new-reply") {
          setTickets((prev) =>
            prev.map((t) =>
              t._id === payload.ticket._id
                ? {
                    ...t,
                    hasNewReply: payload.ticket.hasNewReply,
                    hasAgentReply: payload.ticket.hasAgentReply,
                  }
                : t,
            ),
          );
        } else if (payload.type === "ticket-updated") {
          setTickets((prev) =>
            prev.map((t) =>
              t._id === payload.ticket._id
                ? {
                    ...t,
                    ...payload.ticket,
                    status: payload.ticket.status ?? t.status,
                    updatedAt: payload.ticket.updatedAt ?? t.updatedAt,
                  }
                : t,
            ),
          );
        }
      },
      notification: (payload: any) => {
        if (!payload) return;
        const text = payload.title || payload.message;
        if (text) toast.success(text, { duration: 5000 });
      },
    },
  });

  const getStatusName = (status: string | number, ticket?: any) => {
    // Prefer the enriched statusName from the API response (project-specific)
    if (ticket?.statusName) return ticket.statusName;
    const statusCode = typeof status === "number" ? status : Number(status);
    // Second: look up from project-configured statuses (fetched from API for single-project mode)
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

  const getStatusColor = (status: string | number, ticket?: any) => {
    // Prefer the enriched statusColor from the API response (project-specific)
    if (ticket?.statusColor) return ticket.statusColor;
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

      // Assignee filter (matches ViewTickets behavior)
      const matchesAssignedTo =
        assignedToFilter === "all" ||
        (assignedToFilter === "unassigned" && !ticket.assignedTo) ||
        (assignedToFilter !== "unassigned" &&
          ticket.assignedTo?._id === assignedToFilter);

      // Project filter (only in All Projects mode)
      const ticketProjectId =
        typeof ticket.metadata?.projectId === "object"
          ? ticket.metadata?.projectId?._id
          : ticket.metadata?.projectId;
      const matchesProject =
        projectFilter === "all" || ticketProjectId === projectFilter;

      const sq = deferredSearchTerm.toLowerCase();
      const matchesSearch =
        !sq ||
        (ticket.ticketNumber &&
          ticket.ticketNumber.toLowerCase().includes(sq)) ||
        (ticket.subject && ticket.subject.toLowerCase().includes(sq)) ||
        (ticket.description && ticket.description.toLowerCase().includes(sq)) ||
        ticket.metadata?.studentEmail?.toLowerCase().includes(sq) ||
        ticket.metadata?.studentName?.toLowerCase().includes(sq) ||
        ticket.metadata?.createdByName?.toLowerCase().includes(sq) ||
        ticket.sourceEmail?.toLowerCase().includes(sq) ||
        ticket.priority?.toLowerCase().includes(sq) ||
        (ticket.assignedTo
          ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
              .toLowerCase()
              .includes(sq)
          : false) ||
        ticket.category?.name?.toLowerCase().includes(sq) ||
        (typeof ticket.metadata?.projectId === "object"
          ? ticket.metadata.projectId.name?.toLowerCase().includes(sq)
          : false) ||
        (typeof ticket.metadata?.centerId === "object"
          ? ticket.metadata.centerId.centerName?.toLowerCase().includes(sq)
          : ticket.metadata?.centerName?.toLowerCase().includes(sq));

      const matchesDateFrom =
        !dateFromFilter ||
        new Date(ticket.createdAt) >= new Date(dateFromFilter);
      const matchesDateTo =
        !dateToFilter ||
        new Date(ticket.createdAt) <=
          new Date(new Date(dateToFilter).setHours(23, 59, 59, 999));

      return (
        matchesStatus &&
        matchesPriority &&
        matchesAssignedTo &&
        matchesProject &&
        matchesDateFrom &&
        matchesDateTo &&
        matchesSearch &&
        // Custom field filters (client-side)
        Object.entries(customFieldFilters).every(([colKey, filterVal]) => {
          if (!filterVal || !filterVal.trim()) return true;
          // hierarchy_level_N — compare against enriched categoryHierarchyNames
          if (colKey.startsWith("hierarchy_level_")) {
            const levelNum = parseInt(
              colKey.replace("hierarchy_level_", ""),
              10,
            );
            const name =
              (ticket as any).categoryHierarchyNames?.[`level${levelNum}`] ||
              "";
            return name.toLowerCase().includes(filterVal.trim().toLowerCase());
          }
          // field_FieldName — compare against metadata.customFields
          const fieldName = colKey.replace(/^field_/, "");
          const fieldVal = ticket.metadata?.customFields?.[fieldName];
          if (fieldVal === undefined || fieldVal === null) return false;
          return String(fieldVal)
            .toLowerCase()
            .includes(filterVal.trim().toLowerCase());
        })
      );
    } catch (err) {
      console.error("🎯 Error filtering ticket:", ticket, err);
      return false;
    }
  });

  // Show Sender Email column only when at least one visible ticket is from email source
  const hasEmailSource = filteredTickets.some(
    (t) => t.submissionSource === "email",
  );
  const assigneeOptions = Array.from(
    new Map(
      tickets
        .filter((t) => t.assignedTo?._id)
        .map((t) => [
          t.assignedTo!._id,
          {
            _id: t.assignedTo!._id,
            name: `${t.assignedTo!.firstName} ${t.assignedTo!.lastName}`,
          },
        ]),
    ).values(),
  );
  const projectOptions = (
    userProjects?.length
      ? userProjects.map((p: any) => ({ _id: p._id, name: p.name }))
      : Array.from(
          new Map(
            tickets
              .map((t) => {
                const p = t.metadata?.projectId;
                if (!p || typeof p !== "object") return null;
                return [p._id, { _id: p._id, name: p.name }];
              })
              .filter(Boolean) as Array<
              [string, { _id: string; name: string }]
            >,
          ).values(),
        )
  ) as Array<{ _id: string; name: string }>;
  const showSenderEmail = hasEmailSource && !isTablet;
  const visibleColumnDefs = useMemo(() => {
    const isVisibleOnViewport = (key: TicketTableColumnKey) => {
      if (isMobile && ["requestedBy", "assignee", "source"].includes(key)) {
        return false;
      }
      if (
        isTablet &&
        [
          "source",
          "sla",
          "center",
          "project",
          "category",
          "mergedCount",
        ].includes(key)
      ) {
        return false;
      }
      return true;
    };

    return visibleColumns
      .map((key) => {
        const existing = TICKET_TABLE_COLUMN_DEFS.find(
          (def) => def.key === key,
        );
        if (existing) return existing;
        if (key.startsWith("field_")) {
          const fieldName = key.replace(/^field_/, "");
          const fieldDef = customFormFieldDefs.find(
            (f) => f.fieldName === fieldName,
          );
          return {
            key: key as TicketTableColumnKey,
            label: fieldDef?.fieldLabel || fieldName,
          };
        }
        if (key.startsWith("hierarchy_level_")) {
          const levelNum = parseInt(key.replace("hierarchy_level_", ""), 10);
          const levelDef = hierarchyLevelDefs.find(
            (l) => l.levelNumber === levelNum,
          );
          return {
            key: key as TicketTableColumnKey,
            label: levelDef?.displayName || `Level ${levelNum}`,
          };
        }
        return null;
      })
      .filter(
        (def): def is { key: TicketTableColumnKey; label: string } =>
          !!def && isVisibleOnViewport(def.key),
      );
  }, [
    visibleColumns,
    isMobile,
    isTablet,
    customFormFieldDefs,
    hierarchyLevelDefs,
  ]);

  // Full configured column set (key + label) WITHOUT the viewport filter — used
  // for export so the file always includes every configured column (incl. custom
  // fields and hierarchy levels), regardless of screen size.
  const exportColumnDefs = useMemo(() => {
    return visibleColumns
      .map((key) => {
        const existing = TICKET_TABLE_COLUMN_DEFS.find((def) => def.key === key);
        if (existing) return { key: existing.key as string, label: existing.label };
        if (key.startsWith("field_")) {
          const fieldName = key.replace(/^field_/, "");
          const fieldDef = customFormFieldDefs.find(
            (f) => f.fieldName === fieldName,
          );
          return { key, label: fieldDef?.fieldLabel || fieldName };
        }
        if (key.startsWith("hierarchy_level_")) {
          const levelNum = parseInt(key.replace("hierarchy_level_", ""), 10);
          const levelDef = hierarchyLevelDefs.find(
            (l) => l.levelNumber === levelNum,
          );
          return { key, label: levelDef?.displayName || `Level ${levelNum}` };
        }
        return null;
      })
      .filter((def): def is { key: string; label: string } => !!def);
  }, [visibleColumns, customFormFieldDefs, hierarchyLevelDefs]);

  const showSenderEmailColumn =
    showSenderEmail &&
    visibleColumnDefs.some((col) => col.key === "requestedBy");
  const tableDataColumnCount =
    visibleColumnDefs.length + (showSenderEmailColumn ? 1 : 0);

  const renderTicketDataCell = (
    columnKey: TicketTableColumnKey,
    ticket: Ticket,
    isHighlighted: boolean,
  ) => {
    const sourceBadge = getSourceBadge(ticket.submissionSource);
    const projectName =
      typeof ticket.metadata?.projectId === "object"
        ? ticket.metadata.projectId.name || ticket.metadata.projectId.code
        : null;
    const _centerId1 = ticket.metadata?.centerId as any;
    const centerName =
      !_centerId1 || _centerId1 === "online"
        ? "Online"
        : _centerId1?.centerName
          ? _centerId1.centerName
          : typeof _centerId1 === "string"
            ? _centerId1
            : "Center";
    const requestedBy =
      ticket.metadata?.createdByName ||
      ticket.metadata?.studentName ||
      (ticket.submissionSource === "email" ? ticket.sourceEmail : null) ||
      "-";
    const slaPill = computeSlaPill(ticket);

    switch (columnKey) {
      case "ticketNumber":
        return (
          <td
            style={{
              padding: isMobile ? "10px 12px" : "12px 16px",
              fontSize: 13,
              color: "#2563EB",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            #{ticket.ticketNumber}
          </td>
        );
      case "subject":
        return (
          <td
            style={{
              padding: isMobile ? "10px 12px" : "12px 16px",
              minWidth: isMobile ? 180 : 220,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "#101828",
                  fontWeight: isHighlighted ? 700 : 600,
                }}
              >
                {ticket.subject || "No subject"}
              </span>
              {ticket.hasNewReply && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#F59E0B",
                    display: "inline-block",
                  }}
                />
              )}
            </div>
            {ticket.category?.name && (
              <div style={{ fontSize: 12, color: "#667085" }}>
                {ticket.category.name}
              </div>
            )}
          </td>
        );
      case "requestedBy":
        return (
          <td
            style={{
              padding: isMobile ? "10px 12px" : "12px 16px",
              fontSize: 13,
              color: "#344054",
            }}
          >
            {requestedBy}
          </td>
        );
      case "assignee":
        return (
          <td
            style={{
              padding: isMobile ? "10px 12px" : "12px 16px",
              fontSize: 13,
              color: "#344054",
            }}
          >
            {ticket.assignedTo
              ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
              : "Unassigned"}
          </td>
        );
      case "source":
        return (
          <td style={{ padding: isMobile ? "10px 12px" : "12px 16px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: 12,
                fontWeight: 600,
                color: sourceBadge.color,
                backgroundColor: sourceBadge.bgColor,
                whiteSpace: "nowrap",
              }}
            >
              {sourceBadge.icon} {sourceBadge.label}
            </span>
          </td>
        );
      case "priority":
        return (
          <td style={{ padding: isMobile ? "10px 12px" : "12px 16px" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                color: "white",
                background: getPriorityColor(ticket.priority),
                textTransform: "capitalize",
                whiteSpace: "nowrap",
              }}
            >
              {ticket.priority || "N/A"}
            </span>
          </td>
        );
      case "status":
        return (
          <td style={{ padding: isMobile ? "10px 12px" : "12px 16px" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 600,
                background:
                  (getStatusColor(ticket.status, ticket) || "#6B7280") + "20",
                color: getStatusColor(ticket.status, ticket),
                whiteSpace: "nowrap",
              }}
            >
              {getStatusName(ticket.status, ticket)}
            </span>
          </td>
        );
      case "sla":
        return (
          <td style={{ padding: isMobile ? "10px 12px" : "12px 16px" }}>
            {slaPill ? (
              <span
                title={slaPill.tooltip}
                style={{
                  padding: "3px 8px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: slaPill.color,
                  background: slaPill.bg,
                  border: `1px solid ${slaPill.color}30`,
                  whiteSpace: "nowrap",
                }}
              >
                ⏱ {slaPill.label}
              </span>
            ) : (
              <span style={{ color: "#98A2B3", fontSize: 12 }}>-</span>
            )}
          </td>
        );
      case "createdAt":
        return (
          <td
            style={{
              padding: isMobile ? "10px 12px" : "12px 16px",
              fontSize: 13,
              color: "#344054",
              whiteSpace: "nowrap",
            }}
          >
            {new Date(ticket.createdAt).toLocaleString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })}
          </td>
        );
      case "center":
        return (
          <td style={{ padding: isMobile ? "10px 12px" : "12px 16px" }}>
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
            style={{
              padding: isMobile ? "10px 12px" : "12px 16px",
              fontSize: 13,
              color: "#344054",
            }}
          >
            {projectName ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "3px 10px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#5925DC",
                  background: "#F4F3FF",
                  whiteSpace: "nowrap",
                }}
              >
                {projectName}
              </span>
            ) : (
              <span style={{ color: "#98A2B3" }}>-</span>
            )}
          </td>
        );
      case "category":
        return (
          <td
            style={{
              padding: isMobile ? "10px 12px" : "12px 16px",
              fontSize: 13,
              color: "#344054",
            }}
          >
            {ticket.category?.name || "-"}
          </td>
        );
      case "mergedCount":
        return (
          <td
            style={{
              padding: isMobile ? "10px 12px" : "12px 16px",
              fontSize: 13,
              color: "#344054",
            }}
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
                padding: isMobile ? "10px 12px" : "12px 16px",
                fontSize: 13,
                color: "#344054",
              }}
            >
              {value !== undefined && value !== null && value !== ""
                ? String(value)
                : "—"}
            </td>
          );
        }
        // Handle hierarchy level columns (key format: hierarchy_level_N)
        if (columnKey.startsWith("hierarchy_level_")) {
          const levelNum = parseInt(
            columnKey.replace("hierarchy_level_", ""),
            10,
          );
          const name =
            (ticket as any).categoryHierarchyNames?.[`level${levelNum}`] || "—";
          return (
            <td
              style={{
                padding: isMobile ? "10px 12px" : "12px 16px",
                fontSize: 13,
                color: "#344054",
              }}
            >
              {name}
            </td>
          );
        }
        return null;
    }
  };

  const handleTicketClick = (ticketId: string) => {
    // Clear unread highlight when opening the ticket
    setTickets((prev) =>
      prev.map((t) =>
        t._id === ticketId
          ? { ...t, hasNewReply: false, hasAgentReply: false }
          : t,
      ),
    );

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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ticket of tickets) {
      const code = String(Number(ticket.status));
      counts[code] = (counts[code] || 0) + 1;
    }
    return counts;
  }, [tickets]);

  if (loading) {
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

  const getTicketProjectId = (ticket: Ticket): string | null => {
    const project = ticket.metadata?.projectId;
    if (!project) return null;
    return typeof project === "object" ? project._id : project;
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
        `${API_BASE_URL}/tickets/assignable-agents`,
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
        "Bulk assign requires tickets from the same project. Please filter/select one project at a time.",
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
        `${API_BASE_URL}/departments/project/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setBulkAssignDepartments(
        Array.isArray(response.data?.data) ? response.data.data : [],
      );
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
            `${API_BASE_URL}/tickets/${ticketId}/reassign`,
            { newAgentId: bulkAssignAgentId, reason: "Bulk assignment" },
            { headers: { Authorization: `Bearer ${token}` } },
          ),
        ),
      );

      const failedCount = results.filter(
        (result) => result.status === "rejected",
      ).length;

      if (failedCount > 0) {
        setBulkError(
          `${failedCount} of ${ticketIds.length} tickets failed to assign. Please retry the failed ones.`,
        );
      }

      if (failedCount < ticketIds.length) {
        setShowBulkAssignModal(false);
        setSelectedTicketIds(new Set());
        fetchMyTickets();
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

  const STATUS_CARD_STYLES = [
    { bg: "#EFF8FF", color: "#175CD3", icon: "📬" },
    { bg: "#FFFAEB", color: "#B54708", icon: "⏳" },
    { bg: "#ECFDF3", color: "#027A48", icon: "✅" },
    { bg: "#FEF3F2", color: "#B42318", icon: "⚠️" },
    { bg: "#F4F3FF", color: "#5925DC", icon: "🟣" },
    { bg: "#F0F9FF", color: "#0369A1", icon: "🔹" },
  ];

  const statsCards = [
    {
      label: "Total",
      value: tickets.length,
      bg: "#F4F3FF",
      color: "#5925DC",
      icon: "🎫",
      filterValue: "all",
      sub: "All statuses",
    },
    ...statuses.map((status, index) => {
      const style = STATUS_CARD_STYLES[index % STATUS_CARD_STYLES.length];
      return {
        label: status.name,
        value: statusCounts[String(status.code)] || 0,
        bg: style.bg,
        color: style.color,
        icon: style.icon,
        filterValue: String(status.code),
        sub: "Click to filter",
      };
    }),
  ];

  const content = (
    <div
      style={{
        padding: isMobile ? "16px" : "24px",
        maxWidth: "1400px",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          padding: isMobile ? "16px" : "22px 24px",
          borderRadius: "14px",
          marginBottom: "16px",
          border: "1px solid #e7ebf3",
          boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
        }}
      >
        <h1
          style={{
            margin: "0 0 6px 0",
            fontSize: isMobile ? "20px" : "24px",
            fontWeight: 700,
            color: "#111827",
            letterSpacing: "-0.01em",
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
        >
          {getPageTitle()}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "#6b7280",
            fontWeight: 400,
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
        >
          {getPageSubtitle()}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        {statsCards.map((stat) => {
          const isActive = statusFilter === stat.filterValue;
          return (
            <div
              key={stat.label}
              onClick={() => {
                setStatusFilter(stat.filterValue);
                setCurrentPage(1);
              }}
              style={{
                flex: isMobile ? "1 1 140px" : "1 1 180px",
                background: isActive ? stat.bg : "white",
                borderRadius: "10px",
                padding: isMobile ? "14px 14px" : "20px 24px",
                border: isActive
                  ? `2px solid ${stat.color}55`
                  : "1px solid #E4E7EC",
                boxShadow: isActive
                  ? `0 6px 18px ${stat.color}26`
                  : "0 1px 3px rgba(0,0,0,.06)",
                display: "flex",
                alignItems: "center",
                gap: isMobile ? "10px" : "16px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: isMobile ? "38px" : "48px",
                  height: isMobile ? "38px" : "48px",
                  borderRadius: "50%",
                  background: stat.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: isMobile ? "16px" : "20px",
                  flexShrink: 0,
                }}
              >
                {stat.icon}
              </div>
              <div>
                <div
                  style={{
                    fontSize: isMobile ? "20px" : "28px",
                    fontWeight: 700,
                    color: isActive ? stat.color : "#101828",
                    lineHeight: 1.2,
                  }}
                >
                  {stat.value.toLocaleString()}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: isActive ? stat.color : "#667085",
                    marginTop: "2px",
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#98A2B3",
                    marginTop: "2px",
                  }}
                >
                  {stat.sub}
                </div>
              </div>
              {isActive && (
                <span
                  style={{
                    marginLeft: "auto",
                    alignSelf: "flex-start",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "white",
                    background: stat.color,
                    borderRadius: "9999px",
                    padding: "3px 8px",
                  }}
                >
                  Active
                </span>
              )}
            </div>
          );
        })}
      </div>

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
          background: "#ffffff",
          borderRadius: "14px",
          border: "1px solid #e7ebf3",
          padding: "14px",
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)",
          marginBottom: "16px",
        }}
      >
        {/* Row 1: Search + actions */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            marginBottom: "12px",
            flexWrap: isMobile ? "wrap" : "nowrap",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: isMobile ? "100%" : "220px",
            }}
          >
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                height: "42px",
                padding: `10px ${searchTerm ? "36px" : "14px"} 10px 40px`,
                border: "1px solid #d7deea",
                borderRadius: "10px",
                fontSize: "14px",
                boxSizing: "border-box",
                background: "white",
                outline: "none",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
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
                width: isMobile ? "100%" : "auto",
                justifyContent: "center",
              }}
            >
              <ArrowDownTrayIcon style={{ width: "15px", height: "15px" }} />
              Export
            </button>
          )}

          {canConfigureColumns && (
            <button
              onClick={() => {
                if (!configProjectId) {
                  toast.error("Select a project first to configure columns");
                  return;
                }
                navigate(
                  `/ticket-config/settings/${configProjectId}?tab=tableColumns`,
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
                width: isMobile ? "100%" : "auto",
                justifyContent: "center",
              }}
            >
              <Cog6ToothIcon style={{ width: "15px", height: "15px" }} />
              Configure Columns
            </button>
          )}

          {(searchTerm ||
            statusFilter !== "all" ||
            priorityFilter !== "all" ||
            assignedToFilter !== "all" ||
            projectFilter !== "all" ||
            dateFromFilter ||
            dateToFilter) && (
            <button
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setPriorityFilter("all");
                setAssignedToFilter("all");
                setProjectFilter("all");
                setDateFromFilter("");
                setDateToFilter("");
                setCurrentPage(1);
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
                width: isMobile ? "100%" : "auto",
                justifyContent: "center",
              }}
            >
              <XMarkIcon style={{ width: "13px", height: "13px" }} />
              Clear filters
            </button>
          )}
        </div>

        {/* Row 2: Filter grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "12px",
            alignItems: "center",
          }}
        >
          {projectOptions.length > 0 && (
            <div style={{ position: "relative" }}>
              <select
                value={projectFilter}
                onChange={(e) => {
                  setProjectFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: "100%",
                  height: "42px",
                  padding: "8px 36px 8px 10px",
                  border:
                    projectFilter !== "all"
                      ? "1px solid #84caff"
                      : "1px solid #d7deea",
                  borderRadius: "10px",
                  fontSize: "14px",
                  background: projectFilter !== "all" ? "#eff6ff" : "white",
                  color: projectFilter !== "all" ? "#1d4ed8" : "#374151",
                  cursor: "pointer",
                  appearance: "none" as const,
                  WebkitAppearance: "none" as const,
                  fontWeight: projectFilter !== "all" ? 500 : 400,
                  outline: "none",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                }}
              >
                <option value="all">All Projects</option>
                {projectOptions.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
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
                  color: projectFilter !== "all" ? "#1d4ed8" : "#6B7280",
                }}
              />
            </div>
          )}

          <div style={{ position: "relative" }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: "100%",
                height: "42px",
                padding: "8px 36px 8px 10px",
                border:
                  statusFilter !== "all"
                    ? "1px solid #84caff"
                    : "1px solid #d7deea",
                borderRadius: "10px",
                fontSize: "14px",
                background: statusFilter !== "all" ? "#eff6ff" : "white",
                color: statusFilter !== "all" ? "#1d4ed8" : "#374151",
                cursor: "pointer",
                appearance: "none" as const,
                WebkitAppearance: "none" as const,
                fontWeight: statusFilter !== "all" ? 500 : 400,
                outline: "none",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              }}
            >
              <option value="all">All Status</option>
              {statuses.map((s, i) => (
                <option key={`s-${s.code}-${i}`} value={s.code}>
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
                color: statusFilter !== "all" ? "#1d4ed8" : "#6B7280",
              }}
            />
          </div>

          <div style={{ position: "relative" }}>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: "100%",
                height: "42px",
                padding: "8px 36px 8px 10px",
                border:
                  priorityFilter !== "all"
                    ? "1px solid #84caff"
                    : "1px solid #d7deea",
                borderRadius: "10px",
                fontSize: "14px",
                background: priorityFilter !== "all" ? "#eff6ff" : "white",
                color: priorityFilter !== "all" ? "#1d4ed8" : "#374151",
                cursor: "pointer",
                appearance: "none" as const,
                WebkitAppearance: "none" as const,
                fontWeight: priorityFilter !== "all" ? 500 : 400,
                outline: "none",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              }}
            >
              <option value="all">All Priority</option>
              {priorities.map((p, i) => (
                <option key={`p-${p.code}-${i}`} value={p.code}>
                  {p.name}
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
                color: priorityFilter !== "all" ? "#1d4ed8" : "#6B7280",
              }}
            />
          </div>

          <div style={{ position: "relative" }}>
            <select
              value={assignedToFilter}
              onChange={(e) => {
                setAssignedToFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: "100%",
                height: "42px",
                padding: "8px 36px 8px 10px",
                border:
                  assignedToFilter !== "all"
                    ? "1px solid #84caff"
                    : "1px solid #d7deea",
                borderRadius: "10px",
                fontSize: "14px",
                background: assignedToFilter !== "all" ? "#eff6ff" : "white",
                color: assignedToFilter !== "all" ? "#1d4ed8" : "#374151",
                cursor: "pointer",
                appearance: "none" as const,
                WebkitAppearance: "none" as const,
                fontWeight: assignedToFilter !== "all" ? 500 : 400,
                outline: "none",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              }}
            >
              <option value="all">All Agents</option>
              <option value="unassigned">Unassigned</option>
              {assigneeOptions.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
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
                color: assignedToFilter !== "all" ? "#1d4ed8" : "#6B7280",
              }}
            />
          </div>

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
                border: dateFromFilter
                  ? "1px solid #84caff"
                  : "1px solid #d7deea",
                borderRadius: "10px",
                padding: "0 10px",
                background: dateFromFilter ? "#eff6ff" : "white",
                boxShadow: "0 1px 3px rgba(0,0,0,.04)",
                gap: "6px",
              }}
            >
              <CalendarDaysIcon
                style={{
                  width: "14px",
                  height: "14px",
                  color: dateFromFilter ? "#1d4ed8" : "#9CA3AF",
                  flexShrink: 0,
                }}
              />
              <input
                type="date"
                value={dateFromFilter}
                onChange={(e) => {
                  setDateFromFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "13px",
                  outline: "none",
                  color: dateFromFilter ? "#1d4ed8" : "#6B7280",
                  width: "100%",
                  cursor: "pointer",
                  fontWeight: dateFromFilter ? 500 : 400,
                }}
              />
              {dateFromFilter && (
                <button
                  onClick={() => setDateFromFilter("")}
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
                border: dateToFilter
                  ? "1px solid #84caff"
                  : "1px solid #d7deea",
                borderRadius: "10px",
                padding: "0 10px",
                background: dateToFilter ? "#eff6ff" : "white",
                boxShadow: "0 1px 3px rgba(0,0,0,.04)",
                gap: "6px",
              }}
            >
              <CalendarDaysIcon
                style={{
                  width: "14px",
                  height: "14px",
                  color: dateToFilter ? "#1d4ed8" : "#9CA3AF",
                  flexShrink: 0,
                }}
              />
              <input
                type="date"
                value={dateToFilter}
                onChange={(e) => {
                  setDateToFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "13px",
                  outline: "none",
                  color: dateToFilter ? "#1d4ed8" : "#6B7280",
                  width: "100%",
                  cursor: "pointer",
                  fontWeight: dateToFilter ? 500 : 400,
                }}
              />
              {dateToFilter && (
                <button
                  onClick={() => setDateToFilter("")}
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
        <div style={{ marginTop: "8px", fontSize: "11px", color: "#6B7280" }}>
          Filter order:{" "}
          <strong style={{ fontWeight: 600, color: "#374151" }}>Project</strong>{" "}
          → Status → Priority → Assignee → Date range
        </div>

        {/* Dynamic custom field + hierarchy level filters (from filterable columns config) */}
        {filterableColumnKeys.filter(
          (k) => k.startsWith("field_") || k.startsWith("hierarchy_level_"),
        ).length > 0 && (
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
              .filter(
                (k) =>
                  k.startsWith("field_") || k.startsWith("hierarchy_level_"),
              )
              .map((colKey) => {
                let label: string;
                let hasOptions = false;
                let fieldDef: (typeof customFormFieldDefs)[number] | undefined;

                if (colKey.startsWith("hierarchy_level_")) {
                  const levelNum = parseInt(
                    colKey.replace("hierarchy_level_", ""),
                    10,
                  );
                  const levelDef = hierarchyLevelDefs.find(
                    (l) => l.levelNumber === levelNum,
                  );
                  label = levelDef?.displayName || `Level ${levelNum}`;
                } else {
                  const fieldName = colKey.replace(/^field_/, "");
                  fieldDef = customFormFieldDefs.find(
                    (f) => f.fieldName === fieldName,
                  );
                  label = fieldDef?.fieldLabel || fieldName;
                  hasOptions =
                    !!fieldDef &&
                    (fieldDef.fieldType === "dropdown" ||
                      fieldDef.fieldType === "radio" ||
                      fieldDef.fieldType === "multiselect") &&
                    Array.isArray(fieldDef.options) &&
                    (fieldDef.options?.length ?? 0) > 0;
                }

                const currentVal = customFieldFilters[colKey] || "";

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
                        height: "38px",
                        border: currentVal
                          ? "1px solid #84caff"
                          : "1px solid #d7deea",
                        borderRadius: "10px",
                        padding: "0 10px",
                        background: currentVal ? "#eff6ff" : "white",
                        gap: "6px",
                        minWidth: "150px",
                      }}
                    >
                      {hasOptions ? (
                        <select
                          value={currentVal}
                          onChange={(e) => {
                            setCustomFieldFilters((p) => ({
                              ...p,
                              [colKey]: e.target.value,
                            }));
                            setCurrentPage(1);
                          }}
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
                          onChange={(e) => {
                            setCustomFieldFilters((p) => ({
                              ...p,
                              [colKey]: e.target.value,
                            }));
                            setCurrentPage(1);
                          }}
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
                          onClick={() => {
                            setCustomFieldFilters((p) => ({
                              ...p,
                              [colKey]: "",
                            }));
                            setCurrentPage(1);
                          }}
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

      {(() => {
        const totalPages = Math.ceil(filteredTickets.length / pageSize);
        const paginatedTickets = filteredTickets.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize,
        );

        return (
          <>
            {filteredTickets.length === 0 ? (
              <div
                style={{
                  background: "white",
                  borderRadius: "10px",
                  padding: "48px",
                  textAlign: "center",
                  border: "1px solid #E4E7EC",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <p style={{ color: "#667085", margin: 0 }}>No queries found</p>
              </div>
            ) : (
              <>
                {pendingNewTickets > 0 && (
                  <div
                    onClick={() => {
                      setPendingNewTickets(0);
                      fetchMyTickets();
                    }}
                    style={{
                      background: "#EFF6FF",
                      border: "1.5px solid #BFDBFE",
                      borderRadius: "8px",
                      padding: "10px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: "#1D4ED8",
                      fontWeight: 500,
                      marginBottom: "10px",
                    }}
                  >
                    <span>🔔</span>
                    <span>
                      {pendingNewTickets} new ticket
                      {pendingNewTickets > 1 ? "s" : ""} assigned, click to
                      refresh
                    </span>
                  </div>
                )}

                <div
                  style={{
                    background: "#FFFFFF",
                    borderRadius: "10px",
                    border: "1px solid #E4E7EC",
                    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
                    overflowX: "auto",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "separate",
                        borderSpacing: 0,
                        minWidth: `${Math.max(
                          (tableDataColumnCount +
                            (canMerge || canAssign ? 1 : 0) +
                            1) *
                            130,
                          980,
                        )}px`,
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: "#F9FAFB",
                            borderBottom: "1px solid #E4E7EC",
                          }}
                        >
                          {(canMerge || canAssign) && (
                            <th style={{ padding: "12px 12px", width: 36 }}>
                              <input
                                type="checkbox"
                                checked={
                                  filteredTickets.length > 0 &&
                                  selectedTicketIds.size ===
                                    filteredTickets.length
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
                            <React.Fragment key={`header-${col.key}`}>
                              <th
                                style={{
                                  padding: "12px 16px",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "#667085",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  textAlign: "left",
                                }}
                              >
                                {col.label}
                              </th>
                              {col.key === "requestedBy" &&
                                showSenderEmailColumn && (
                                  <th
                                    style={{
                                      padding: "12px 16px",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: "#667085",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.5px",
                                      textAlign: "left",
                                    }}
                                  >
                                    Sender Email
                                  </th>
                                )}
                            </React.Fragment>
                          ))}
                          <th
                            style={{
                              padding: "12px 16px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#667085",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              textAlign: "right",
                            }}
                          >
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTickets.map((ticket) => {
                          const isSelected = selectedTicketIds.has(ticket._id);
                          const isHighlighted = isStudentView
                            ? !!ticket.hasAgentReply && !isSelected
                            : !!ticket.hasNewReply && !isSelected;
                          const sourceBadge = getSourceBadge(
                            ticket.submissionSource,
                          );
                          const projectName =
                            typeof ticket.metadata?.projectId === "object"
                              ? ticket.metadata.projectId.name ||
                                ticket.metadata.projectId.code
                              : null;
                          const _centerId2 = ticket.metadata?.centerId as any;
                          const centerName =
                            !_centerId2 || _centerId2 === "online"
                              ? "Online"
                              : _centerId2?.centerName
                                ? _centerId2.centerName
                                : typeof _centerId2 === "string"
                                  ? _centerId2
                                  : "Center";
                          const requestedBy =
                            ticket.metadata?.createdByName ||
                            ticket.metadata?.studentName ||
                            (ticket.submissionSource === "email"
                              ? ticket.sourceEmail
                              : null) ||
                            "-";
                          const slaPill = computeSlaPill(ticket);

                          return (
                            <tr
                              key={ticket._id}
                              onClick={() => handleTicketClick(ticket._id)}
                              style={{
                                background: isSelected
                                  ? "#EFF6FF"
                                  : isHighlighted
                                    ? "#FFFBEB"
                                    : "#FFFFFF",
                                borderBottom: "1px solid #F2F4F7",
                                cursor: "pointer",
                                borderLeft: isHighlighted
                                  ? "3px solid #F59E0B"
                                  : "3px solid transparent",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected && !isHighlighted) {
                                  e.currentTarget.style.background = "#F9FAFB";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected && !isHighlighted) {
                                  e.currentTarget.style.background = "#FFFFFF";
                                }
                              }}
                            >
                              {(canMerge || canAssign) && (
                                <td
                                  style={{
                                    padding: isMobile
                                      ? "10px 10px"
                                      : "12px 12px",
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() =>
                                      toggleTicketSelect(ticket._id)
                                    }
                                    style={{
                                      width: "16px",
                                      height: "16px",
                                      cursor: "pointer",
                                    }}
                                  />
                                </td>
                              )}
                              {visibleColumnDefs.map((col) => (
                                <React.Fragment
                                  key={`row-${ticket._id}-${col.key}`}
                                >
                                  {renderTicketDataCell(
                                    col.key,
                                    ticket,
                                    isHighlighted,
                                  )}
                                  {col.key === "requestedBy" &&
                                    showSenderEmailColumn && (
                                      <td
                                        style={{
                                          padding: isMobile
                                            ? "10px 12px"
                                            : "12px 16px",
                                          fontSize: 13,
                                          color: "#344054",
                                        }}
                                      >
                                        {ticket.submissionSource === "email" &&
                                        ticket.sourceEmail ? (
                                          <a
                                            href={`mailto:${ticket.sourceEmail}`}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                              color: "#175CD3",
                                              textDecoration: "none",
                                            }}
                                          >
                                            {ticket.sourceEmail}
                                          </a>
                                        ) : (
                                          <span style={{ color: "#98A2B3" }}>
                                            -
                                          </span>
                                        )}
                                      </td>
                                    )}
                                </React.Fragment>
                              ))}
                              <td
                                style={{
                                  padding: isMobile ? "10px 12px" : "12px 16px",
                                  textAlign: "right",
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {canMerge && !ticket.isMerged ? (
                                  <button
                                    onClick={() => {
                                      setSelectedTicket(ticket);
                                      setShowMergeModal(true);
                                    }}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      padding: isMobile
                                        ? "6px 8px"
                                        : "6px 10px",
                                      background: "#3B82F6",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "8px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <ArrowsPointingInIcon
                                      style={{ width: "14px", height: "14px" }}
                                    />
                                    {isMobile ? "" : "Merge"}
                                  </button>
                                ) : (
                                  <span
                                    style={{ color: "#98A2B3", fontSize: 12 }}
                                  >
                                    -
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: isMobile ? "flex-start" : "center",
                    flexDirection: isMobile ? "column" : "row",
                    gap: isMobile ? "10px" : "0",
                    fontSize: "14px",
                    color: "#6B7280",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: isMobile ? "100%" : "auto",
                      justifyContent: isMobile ? "space-between" : "flex-start",
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
                      }}
                    >
                      {isMobile ? "←" : "← Previous"}
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
                      }}
                    >
                      {isMobile ? "→" : "Next →"}
                    </button>
                  </div>
                  <div style={{ width: isMobile ? "100%" : "auto" }}>
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
          </>
        );
      })()}

      {(canMerge || canAssign) && selectedTicketIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: isMobile ? "16px" : "28px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1E293B",
            color: "white",
            borderRadius: "12px",
            padding: isMobile ? "10px 12px" : "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: isMobile ? "8px" : "12px",
            flexWrap: "wrap",
            justifyContent: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,.3)",
            zIndex: 200,
            whiteSpace: isMobile ? "normal" : "nowrap",
            width: isMobile ? "calc(100% - 20px)" : "auto",
            maxWidth: isMobile ? "580px" : "none",
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
              display: isMobile ? "none" : "block",
            }}
          />
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
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                background: "rgba(255,255,255,.18)",
                color: "white",
                border: "1px solid rgba(255,255,255,.35)",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              <ArrowsPointingInIcon style={{ width: "14px", height: "14px" }} />
              Merge Selected
            </button>
          )}
          {canAssign && (
            <button
              onClick={handleOpenBulkAssignModal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                background: "rgba(14,116,144,.85)",
                color: "white",
                border: "1px solid rgba(14,116,144,.45)",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Assign Selected
            </button>
          )}
          <button
            onClick={() => {
              setSelectedTicketIds(new Set());
              setBulkError("");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 10px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,.28)",
              borderRadius: "8px",
              color: "#E5E7EB",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            <XMarkIcon style={{ width: "12px", height: "12px" }} />
            Clear
          </button>
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
              style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 700 }}
            >
              Assign Selected Tickets
            </h2>
            <p
              style={{ margin: "0 0 16px", color: "#6B7280", fontSize: "14px" }}
            >
              Choose department and then user for {selectedTicketIds.size}{" "}
              selected ticket{selectedTicketIds.size !== 1 ? "s" : ""}.
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

      {/* Export Modal */}
      {canExport && showExportModal && (
        <TicketExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          filters={{
            status: statusFilter !== "all" ? statusFilter : undefined,
            priority: priorityFilter !== "all" ? priorityFilter : undefined,
            // Scope export to the same project the table is showing:
            // single mode → current project; unified mode → selected project
            // (or all projects when no project filter is set).
            projectId:
              viewMode === "unified"
                ? projectFilter !== "all"
                  ? projectFilter
                  : undefined
                : currentProjectId || resolveMasterDataProjectId() || undefined,
            dateFrom: dateFromFilter || undefined,
            dateTo: dateToFilter || undefined,
            search: searchTerm || undefined,
          }}
          filterLabels={{
            status: (() => {
              const map: Record<string, string> = {
                "1": "Open",
                "2": "In Progress",
                "3": "On Hold",
                "4": "Resolved",
                "5": "Closed",
              };
              return statusFilter !== "all"
                ? map[statusFilter] || statusFilter
                : undefined;
            })(),
            priority:
              priorityFilter !== "all"
                ? priorityFilter.charAt(0).toUpperCase() +
                  priorityFilter.slice(1)
                : undefined,
            project: (() => {
              const pid =
                viewMode === "unified"
                  ? projectFilter !== "all"
                    ? projectFilter
                    : ""
                  : currentProjectId || resolveMasterDataProjectId();
              if (!pid) return undefined;
              return userProjects.find((p) => p._id === pid)?.name || undefined;
            })(),
            dateFrom: dateFromFilter || undefined,
            dateTo: dateToFilter || undefined,
            search: searchTerm || undefined,
          }}
          ticketCount={filteredTickets.length}
          columns={exportColumnDefs}
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

  // Conditionally wrap with DashboardLayout
  try {
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
