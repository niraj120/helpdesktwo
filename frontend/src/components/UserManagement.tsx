import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";
import { getText } from "../utils/language";
import { usePermissions } from "../hooks/usePermissions";
import { useProjectContext } from "../contexts/ProjectContext";
import { API_CONFIG } from "../config/constants";
import { startImpersonation } from "../utils/impersonation";

interface Role {
  _id: string;
  name: string;
  code: string;
  type?: string; // 'system' | 'custom'
  projectId?: string; // Legacy: single project assignment
  projects?: string[]; // Current: multiple project assignment
}

interface Project {
  _id: string;
  name: string;
  code: string;
  status?: string;
}

interface Center {
  _id: string;
  centerName: string;
  city: string;
  state: string;
  projectId: string;
}

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  employeeCode?: string;
  hrmsId?: number;
  role: Role | null;
  department?: string;
  departmentRef?: { _id: string; name: string } | null;
  projectDepartments?: Array<{
    projectId: string | Project;
    departmentRef: { _id: string; name: string } | string | null;
  }>;
  designation?: string;
  joiningDate?: string;
  reportingManager?: User;
  projects?: Project[];
  centers?: Center[];
  isActive: boolean;
  createdAt: string;
  payrollType?: "internal" | "external";
  company?: { _id: string; name: string } | null;
}

interface HRMSEmployee {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  mdmSourceId?: string;
  mdmSourceName?: string;
  department: string;
  designation: string;
  /** Flattened raw record from the MDM API (any columns). */
  _raw?: Record<string, any>;
  [key: string]: any;
}

interface HRMSLoadMeta {
  totalAvailable: number;
  matchedCount: number;
  loadedCount: number;
  loadMode: "all" | "range";
  rangeStart?: number;
  rangeEnd?: number;
}

interface UserManagementProps {
  wrapWithLayout?: boolean; // If false, renders content only without DashboardLayout
}

/** Import-mapping targets: which user-account field each API column feeds. */
const HRMS_MAP_TARGETS: { key: string; label: string }[] = [
  { key: "employeeCode", label: "Employee Code" },
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "fullName", label: "Full Name (split)" },
  { key: "email", label: "Email" },
  { key: "mobile", label: "Mobile" },
  { key: "department", label: "Department" },
  { key: "designation", label: "Designation" },
];

/** Sensible default display columns from a discovered field list. */
const pickDefaultCols = (fields: string[]): string[] => {
  if (!fields.length) return [];
  const want = [
    /group.*emp.*code|^employee.?code$|^emp.?code$|^code$/i,
    /full.?name|^name$/i,
    /first.?name/i,
    /last.?name/i,
    /email/i,
    /mobile|phone/i,
    /designation|title/i,
    /department|dept/i,
  ];
  const chosen: string[] = [];
  for (const re of want) {
    const f = fields.find((x) => re.test(x) && !chosen.includes(x));
    if (f) chosen.push(f);
  }
  if (chosen.length < 3) {
    for (const f of fields) {
      if (chosen.length >= 5) break;
      if (!chosen.includes(f) && f !== "id") chosen.push(f);
    }
  }
  return chosen;
};

/** Read a column value off an employee row (raw record first). */
const hrmsCell = (emp: any, col: string): string => {
  const v = emp?._raw?.[col] ?? emp?.[col];
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};

/** Match a row against a search term across every raw value. */
const hrmsMatch = (emp: any, search: string): boolean => {
  if (!search) return true;
  const t = search.toLowerCase();
  const raw = emp?._raw || emp || {};
  for (const v of Object.values(raw)) {
    if (v === null || v === undefined || typeof v === "object") continue;
    if (String(v).toLowerCase().includes(t)) return true;
  }
  return [
    emp.firstName,
    emp.lastName,
    emp.email,
    emp.employeeCode,
    emp.designation,
  ].some((v) => v && String(v).toLowerCase().includes(t));
};

const isHrmsPlaceholderEmail = (email?: string) =>
  Boolean(email && email.toLowerCase().endsWith("@hrms.local"));

const UserEmailDisplay: React.FC<{ email?: string }> = ({ email }) => {
  if (isHrmsPlaceholderEmail(email)) {
    return (
      <span
        title={email}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 10px",
          borderRadius: "999px",
          background: "#f1f5f9",
          color: "#64748b",
          fontSize: "12px",
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        No email in HRMS
      </span>
    );
  }

  return <>{email || "-"}</>;
};

const UserManagement: React.FC<UserManagementProps> = ({
  wrapWithLayout = true,
}) => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { viewMode, currentProjectId, userProjects } = useProjectContext();

  // State management
  const [users, setUsers] = useState<User[]>([]); // Filtered users for table display
  const [reportingManagersList, setReportingManagersList] = useState<User[]>(
    [],
  ); // Users for reporting manager dropdown (filtered by project)
  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [departmentsByProject, setDepartmentsByProject] = useState<
    Record<string, { _id: string; name: string }[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filterRoles, setFilterRoles] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterCenters, setFilterCenters] = useState<string[]>([]);
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [recentlyImportedCodes, setRecentlyImportedCodes] = useState<string[]>(
    [],
  );
  const [companies, setCompanies] = useState<{ _id: string; name: string }[]>(
    [],
  );

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  // Full-dataset stats from the API (not just the current page) for the cards.
  const [serverStats, setServerStats] = useState<{
    total: number;
    active: number;
    inactive: number;
  } | null>(null);
  const [usersPerPage] = useState(50); // Show 50 users per page

  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [showHRMSModal, setShowHRMSModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  // Impersonation ("Login as user") — reason is required (DPDP).
  const [impersonateTarget, setImpersonateTarget] = useState<User | null>(null);
  const [impersonateReason, setImpersonateReason] = useState("");
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState("");
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [selectedUserForCredentials, setSelectedUserForCredentials] =
    useState<User | null>(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [resetPasswordPolicy, setResetPasswordPolicy] = useState<any>(null);
  const [loadingResetPolicy, setLoadingResetPolicy] = useState(false);

  // Inline errors for name fields
  const [nameFieldErrors, setNameFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
  }>({});

  // Helper: only allow letters, spaces and dots in name fields
  const handleNameChange = (field: "firstName" | "lastName", raw: string) => {
    const cleaned = raw.replace(/[^a-zA-Z\s.]/g, "");
    const hasInvalid = cleaned !== raw;
    setNameFieldErrors((prev) => ({
      ...prev,
      [field]: hasInvalid ? 'Only letters, spaces and "." are allowed' : "",
    }));
    setFormData((prev) => ({ ...prev, [field]: cleaned }));
  };

  // Form data
  const [formData, setFormData] = useState({
    primaryProject: "", // Main project selection for filtering roles and centers
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    password: "",
    employeeCode: "",
    hrmsId: "",
    role: "",
    projectDepartments: {} as Record<string, string>, // projectId → departmentId
    designation: "",
    joiningDate: "",
    reportingManager: "",
    projects: [] as string[],
    centers: [] as string[],
    payrollType: "" as "" | "internal" | "external",
    company: "",
  });

  // Filtered data based on primary project selection - memoized to prevent recalculation
  const filteredRoles = useMemo(() => {
    if (!formData.primaryProject) return roles;
    return roles.filter((role) => {
      // System roles (Super Admin, Student, etc.) are always available
      if (role.type === "system") return true;
      // New: role.projects[] array — show only if selected project is included
      if (role.projects && role.projects.length > 0) {
        return role.projects.some(
          (p: any) =>
            (p._id?.toString?.() ?? p.toString()) === formData.primaryProject,
        );
      }
      // Legacy: single projectId field
      if (role.projectId) return role.projectId === formData.primaryProject;
      // No project assignment — hide when a specific project is selected
      // (prevents orphan/test roles from appearing in the list)
      return false;
    });
  }, [formData.primaryProject, roles]);

  const filteredCenters = useMemo(() => {
    if (formData.primaryProject) {
      return centers.filter(
        (center) => center.projectId === formData.primaryProject,
      );
    }
    return [];
  }, [formData.primaryProject, centers]);

  // Hierarchical filter scope: project is the parent filter.
  // In single-project mode, currentProjectId acts as the selected scope.
  const projectScopeForFilters = useMemo(() => {
    if (filterProjects.length > 0) return filterProjects;
    if (viewMode === "single" && currentProjectId) return [currentProjectId];
    return [] as string[];
  }, [filterProjects, viewMode, currentProjectId]);

  const availableFilterRoles = useMemo(() => {
    if (projectScopeForFilters.length === 0) return [];

    return roles.filter((role) => {
      if (role.type === "system") return true;

      if (role.projects && role.projects.length > 0) {
        return role.projects.some((p: any) => {
          const projectId = p?._id?.toString?.() ?? p?.toString?.();
          return projectScopeForFilters.includes(projectId);
        });
      }

      if (role.projectId)
        return projectScopeForFilters.includes(role.projectId);

      return false;
    });
  }, [roles, projectScopeForFilters]);

  // Filtered reporting managers - simple exclusion of self and students
  const filteredReportingManagers = useMemo(() => {
    return reportingManagersList.filter((u) => {
      // Cannot be self (when editing)
      if (editingUser && u._id === editingUser._id) return false;

      // Exclude students - they cannot be reporting managers
      const roleName = u.role?.name?.toLowerCase() || "";
      const roleCode = u.role?.code?.toLowerCase() || "";
      if (roleName.includes("student") || roleCode.includes("student")) {
        return false;
      }

      return true;
    });
  }, [reportingManagersList, editingUser]);

  // HRMS data for bulk selection
  const [hrmsEmployees, setHrmsEmployees] = useState<HRMSEmployee[]>([]);
  const [hrmsEmployeeCodes, setHrmsEmployeeCodes] = useState(""); // For initial employee code input
  const [hrmsSearchQuery, setHrmsSearchQuery] = useState(""); // For filtering loaded employees
  const [hrmsLoading, setHrmsLoading] = useState(false);
  const [hrmsLoadMode, setHrmsLoadMode] = useState<"all" | "range">("all");
  const [hrmsRangeStart, setHrmsRangeStart] = useState("1");
  const [hrmsRangeEnd, setHrmsRangeEnd] = useState("50");
  const [hrmsLoadMeta, setHrmsLoadMeta] = useState<HRMSLoadMeta | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]); // Array of employee IDs
  // MDM source the HRMS data is fetched from (provenance)
  const [mdmSources, setMdmSources] = useState<
    { _id: string; name: string; enabled: boolean }[]
  >([]);
  const [selectedMdmSource, setSelectedMdmSource] = useState<string>("");
  // Dynamic field discovery + column selection + import mapping
  const [hrmsFields, setHrmsFields] = useState<string[]>([]);
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [showColPicker, setShowColPicker] = useState(false);
  const [hrmsColumnSearch, setHrmsColumnSearch] = useState("");
  const [showMapping, setShowMapping] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgMsg, setCfgMsg] = useState("");
  // Presets (named column/mapping configs)
  const [presets, setPresets] = useState<any[]>([]);
  const [presetName, setPresetName] = useState("Default");
  // Already-imported employee codes (existing User accounts)
  const [existingCodes, setExistingCodes] = useState<string[]>([]);
  // Pagination over the loaded rows
  const [hrmsPage, setHrmsPage] = useState(1);
  const HRMS_PAGE_SIZE = 50;
  const [hrmsImportStep, setHrmsImportStep] = useState<
    "employees" | "projects"
  >("employees");
  // Mapping preview toggle
  const [showPreview, setShowPreview] = useState(false);

  // Load configured MDM sources whenever the HRMS modal opens
  useEffect(() => {
    if (!showHRMSModal) return;
    const loadMdmSources = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch(`${API_CONFIG.API_URL}/mdm`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setMdmSources(data.data);
          // Auto-select the first enabled source
          const firstEnabled = data.data.find((s: any) => s.enabled);
          if (firstEnabled) setSelectedMdmSource(firstEnabled._id);
        }
      } catch (err) {
        console.error("Failed to load MDM sources:", err);
      }
    };
    loadMdmSources();
  }, [showHRMSModal]);

  // When a source is picked, discover its fields + load any saved column/mapping
  // config so the picker + import mapping populate before searching.
  useEffect(() => {
    if (!showHRMSModal) return;
    const token = localStorage.getItem("authToken");
    const headers = { Authorization: `Bearer ${token}` };
    const src = selectedMdmSource
      ? `?mdmSourceId=${encodeURIComponent(selectedMdmSource)}`
      : "";
    (async () => {
      try {
        const fRes = await fetch(`${API_CONFIG.API_URL}/users/hrms/fields${src}`, {
          headers,
          credentials: "include",
        });
        const f = await fRes.json();
        const fields: string[] = (f.success && f.fields) || [];
        setHrmsFields(fields);
        if (f.success && typeof f.count === "number") {
          setHrmsLoadMeta({
            totalAvailable: f.count,
            matchedCount: f.count,
            loadedCount: 0,
            loadMode: "all",
          });
        }

        const cRes = await fetch(
          `${API_CONFIG.API_URL}/users/hrms/field-config${src ? src + "&" : "?"}dataType=employees`,
          { headers, credentials: "include" },
        );
        const c = await cRes.json();
        const list: any[] = Array.isArray(c.data) ? c.data : [];
        setPresets(list);
        const def =
          list.find((p) => p.name === "Default") || list[0] || null;
        const defCols = pickDefaultCols(fields);
        setPresetName(def?.name || "Default");
        setSelectedCols(
          def?.selectedFields?.length ? def.selectedFields : defCols,
        );
        setFieldMapping(def?.fieldMapping || {});
      } catch (err) {
        console.error("Failed to load HRMS fields/config:", err);
      }
    })();
  }, [showHRMSModal, selectedMdmSource]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [hrmsProjectSearch, setHrmsProjectSearch] = useState("");

  const [saving, setSaving] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);
  // Bulk upload modal state
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadResults, setBulkUploadResults] = useState<{
    total: number;
    created: number;
    failed: number;
    results: Array<{
      row: number;
      email: string;
      status: string;
      error?: string;
    }>;
  } | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Multi-select state for bulk delete
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(),
  );
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedInitialData = useRef(false);

  const isMobileViewport = viewportWidth <= 768;
  const isTabletViewport = viewportWidth > 768 && viewportWidth <= 1024;

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Watch for primary project changes and fetch reporting managers
  useEffect(() => {
    if (showUserModal && formData.primaryProject) {
      fetchReportingManagers(formData.primaryProject);
    }
  }, [formData.primaryProject, showUserModal]);

  // Watch for project list changes and fetch departments for all selected projects
  useEffect(() => {
    if (showUserModal) {
      formData.projects.forEach((projectId) => {
        if (projectId) fetchDepartments(projectId);
      });
    }
  }, [formData.projects, showUserModal]);

  // Generate a secure random password
  const generateSecurePassword = (): string => {
    const length = 12;
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "@#$%&*!";
    const allChars = uppercase + lowercase + numbers + special;

    // Ensure at least one of each type
    let password = "";
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
  };

  // Helper function to get default password based on user (for display only)
  const getDefaultPassword = (user: User | null): string => {
    // In production, passwords are generated randomly and sent via email
    // This is just for display purposes during user creation
    return generateSecurePassword();
  };

  const fetchResetPasswordPolicy = async (user: User) => {
    const projectId = user.projects?.[0]?._id || currentProjectId;
    if (!projectId) {
      setResetPasswordPolicy(null);
      return;
    }
    try {
      setLoadingResetPolicy(true);
      const token = localStorage.getItem("authToken");
      const res = await fetch(`${API_CONFIG.API_URL}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setResetPasswordPolicy(
        data?.data?.project?.configuration?.securitySettings?.passwordPolicy ||
          null,
      );
    } catch {
      setResetPasswordPolicy(null);
    } finally {
      setLoadingResetPolicy(false);
    }
  };

  // Fetch users
  const fetchUsers = async (overrides?: {
    page?: number;
    search?: string;
    roles?: string[];
    statuses?: string[];
    projects?: string[];
    centers?: string[];
    company?: string;
  }) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      const page = overrides?.page ?? currentPage;
      const search = overrides?.search ?? searchQuery;
      const rolesFilter = overrides?.roles ?? filterRoles;
      const statusesFilter = overrides?.statuses ?? filterStatuses;
      const projectsFilter = overrides?.projects ?? filterProjects;
      const centersFilter = overrides?.centers ?? filterCenters;
      const companyFilter = overrides?.company ?? filterCompany;

      params.append("page", page.toString());
      params.append("limit", usersPerPage.toString());
      if (search) params.append("search", search);
      if (rolesFilter.length > 0) params.append("role", rolesFilter.join(","));
      if (statusesFilter.length > 0)
        params.append("isActive", statusesFilter.join(","));

      // Add project filter from dropdown
      if (projectsFilter.length > 0) {
        params.append("project", projectsFilter.join(","));
        console.log(
          "👤 [USER MGMT] Filtering by dropdown projects:",
          projectsFilter,
        );
      }
      // Filter by project based on viewMode from context (if no dropdown filter)
      else if (viewMode === "single" && currentProjectId) {
        params.append("project", currentProjectId); // Backend uses 'project' not 'projectId'
        console.log("👤 [USER MGMT] Filtering by project:", currentProjectId);
      } else {
        console.log(
          "👤 [USER MGMT] Unified mode - fetching users from all projects",
        );
      }

      // Add center filter from dropdown
      if (centersFilter.length > 0) {
        params.append("centers", centersFilter.join(","));
        console.log("👤 [USER MGMT] Filtering by centers:", centersFilter);
      }

      if (companyFilter) {
        params.append("company", companyFilter);
      }

      const token = localStorage.getItem("authToken");
      const url = `${API_CONFIG.API_URL}/users?${params}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setUsers(data.data);
        // Set pagination data
        if (data.pagination) {
          setTotalPages(data.pagination.pages);
          setTotalUsers(data.pagination.total);
        }
        // Full-dataset stats for the cards (independent of the 50-per-page view)
        if (data.stats) setServerStats(data.stats);
      } else {
        throw new Error(data.error || "Failed to fetch users");
      }
    } catch (error: any) {
      console.error("Error fetching users:", error);
      alert(`Failed to fetch users: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch reporting managers based on project selection
  const fetchReportingManagers = async (projectId: string) => {
    if (!projectId) {
      setReportingManagersList([]);
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const params = new URLSearchParams();
      params.append("project", projectId); // Filter by project
      params.append("isActive", "true"); // Only active users
      params.append("page", "1");
      params.append("limit", "1000"); // Reasonable limit for project users

      const url = `${API_CONFIG.API_URL}/users?${params}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setReportingManagersList(data.data);
        console.log(
          "📋 [USER MGMT] Fetched reporting managers for project:",
          projectId,
          "- Count:",
          data.data.length,
        );
      } else {
        throw new Error(data.error || "Failed to fetch reporting managers");
      }
    } catch (error: any) {
      console.error("Error fetching reporting managers:", error);
      setReportingManagersList([]);
    }
  };

  // Fetch departments for a project and cache by projectId
  const fetchDepartments = async (projectId: string) => {
    if (!projectId) return;
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/departments/project/${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      setDepartmentsByProject((prev) => ({
        ...prev,
        [projectId]: data.success ? data.data || [] : [],
      }));
    } catch {
      setDepartmentsByProject((prev) => ({ ...prev, [projectId]: [] }));
    }
  };

  // Fetch roles and projects
  const fetchRolesAndProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");

      // Check if we're in unified view mode (All Projects)
      const isUnifiedMode = viewMode === "unified";

      // Check if we're in project portal context
      const projectContextStr = localStorage.getItem("projectContext");
      const projectContext = projectContextStr
        ? JSON.parse(projectContextStr)
        : null;

      // In unified mode, always fetch ALL projects and roles
      // In single project mode, filter by current project
      const isProjectPortal = !isUnifiedMode && !!projectContextStr;

      // Fetch roles with project filter if in single project mode
      const rolesUrl =
        isProjectPortal && projectContext?.projectId
          ? `${API_CONFIG.API_URL}/roles?projectId=${projectContext.projectId}`
          : `${API_CONFIG.API_URL}/roles`;

      console.log("🔄 Fetching roles and projects:", {
        isUnifiedMode,
        isProjectPortal,
        rolesUrl,
      });

      const rolesRes = await fetch(rolesUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const rolesData = await rolesRes.json();

      if (rolesData.success && Array.isArray(rolesData.data)) {
        setRoles(rolesData.data);
        console.log("📋 Loaded roles:", rolesData.data.length);
      }

      // Fetch projects based on view mode
      if (isUnifiedMode || !isProjectPortal) {
        // In unified mode or super admin portal, fetch ALL projects from API
        const projectsRes = await fetch(
          `${API_CONFIG.API_URL}/projects?limit=100`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        const projectsData = await projectsRes.json();
        console.log("🌐 Projects API response:", projectsData);

        if (projectsData.success) {
          // Handle multiple response formats
          let projectsList: Project[] = [];

          if (Array.isArray(projectsData.data)) {
            projectsList = projectsData.data;
          } else if (
            projectsData.data &&
            Array.isArray(projectsData.data.projects)
          ) {
            projectsList = projectsData.data.projects;
          } else if (
            projectsData.projects &&
            Array.isArray(projectsData.projects)
          ) {
            projectsList = projectsData.projects;
          }

          console.log(
            "📋 Loaded projects for dropdown:",
            projectsList.length,
            projectsList.map((p) => p.name),
          );
          setProjects(projectsList);
        } else {
          console.warn("⚠️ No projects data in API response");
          setProjects([]);
        }
      } else {
        // In single project mode, set only the current project
        console.log(
          "📍 Single project mode, using:",
          projectContext.projectName,
        );
        setProjects([
          {
            _id: projectContext.projectId,
            name: projectContext.projectName,
            code: projectContext.projectCode,
          },
        ]);
      }
    } catch (error) {
      console.error("Error fetching roles/projects:", error);
    }
  };

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500); // 500ms debounce delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (recentlyImportedCodes.length === 0) return;
    const timer = window.setTimeout(() => {
      setRecentlyImportedCodes([]);
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [recentlyImportedCodes]);

  useEffect(() => {
    if (selectedEmployees.length === 0 && hrmsImportStep === "projects") {
      setHrmsImportStep("employees");
    }
  }, [selectedEmployees.length, hrmsImportStep]);

  useEffect(() => {
    // Initial load
    if (!hasFetchedInitialData.current) {
      hasFetchedInitialData.current = true;
      fetchUsers();
      fetchRolesAndProjects();
      return;
    }

    // Refresh for any filter/search/view mode change, including clear-all state
    setCurrentPage(1);
    fetchUsers();
    fetchRolesAndProjects();
  }, [
    debouncedSearchQuery,
    filterRoles,
    filterStatuses,
    filterProjects,
    filterCenters,
    filterCompany,
    viewMode,
    currentProjectId,
  ]); // Added viewMode and currentProjectId

  // Fetch companies for dropdown (once on mount)
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch(`${API_CONFIG.API_URL}/master/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) setCompanies(data.data || []);
      } catch {
        // silent
      }
    };
    fetchCompanies();
  }, []);

  // Separate effect for page changes
  useEffect(() => {
    if (hasFetchedInitialData.current && currentPage > 1) {
      fetchUsers();
    }
  }, [currentPage]);

  // Listen for viewMode changes from ViewModeToggle
  useEffect(() => {
    const handleViewModeChange = () => {
      console.log(
        "🔄 UserManagement: View mode changed, refetching users and projects...",
      );
      setCurrentPage(1); // Reset to first page
      hasFetchedInitialData.current = false; // Allow re-fetch
      fetchUsers();
      fetchRolesAndProjects(); // Also refetch projects list
    };

    window.addEventListener("viewModeChanged", handleViewModeChange);
    window.addEventListener("projectChanged", handleViewModeChange); // Also listen for project changes
    return () => {
      window.removeEventListener("viewModeChanged", handleViewModeChange);
      window.removeEventListener("projectChanged", handleViewModeChange);
    };
  }, [viewMode, currentProjectId]);

  // Refetch projects when modal opens to ensure fresh data
  useEffect(() => {
    if (showUserModal) {
      console.log("🔄 UserManagement: Modal opened, loading projects");

      // Check if user is Super Admin
      const userRole = localStorage.getItem("userRole");
      const isSuperAdmin =
        userRole === "SUPER_ADMIN" || userRole === "Super Admin";

      if (isSuperAdmin) {
        // Super Admin: Fetch ALL projects from the system
        console.log("👑 Super Admin detected: Fetching ALL projects");
        fetchAllProjectsForSuperAdmin();
      } else {
        // Regular users: Use projects from ProjectContext (already filtered by user's role)
        if (viewMode === "unified") {
          // In unified mode, use ALL accessible projects
          console.log(
            "📋 Unified mode: Using all",
            userProjects.length,
            "projects",
          );
          setProjects(userProjects);
        } else {
          // In single project mode, filter by current project
          const projectContextStr = localStorage.getItem("projectContext");
          if (projectContextStr) {
            const projectContext = JSON.parse(projectContextStr);
            const currentProject = userProjects.find(
              (p) => p._id === projectContext.projectId,
            );

            if (currentProject) {
              console.log("📍 Single project mode: Using", currentProject.name);
              setProjects([currentProject]);
            } else {
              console.log(
                "⚠️ Current project not found in userProjects, showing all",
              );
              setProjects(userProjects);
            }
          } else {
            console.log(
              "📋 No project context, showing all accessible projects",
            );
            setProjects(userProjects);
          }
        }
      }
    }
  }, [showUserModal, userProjects, viewMode]);

  // Fetch ALL projects for Super Admin
  const fetchAllProjectsForSuperAdmin = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/projects?limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          const activeProjects = data.data.filter(
            (p: any) => p.status === "active",
          );
          console.log(
            "✅ Fetched",
            activeProjects.length,
            "projects for Super Admin",
          );
          setProjects(activeProjects);
        }
      } else {
        console.error("❌ Failed to fetch projects for Super Admin");
      }
    } catch (error) {
      console.error("❌ Error fetching projects for Super Admin:", error);
    }
  };

  // Fetch centers when project scope changes
  useEffect(() => {
    const fetchCentersForFilter = async () => {
      if (projectScopeForFilters.length === 0) {
        setCenters([]);
        return;
      }

      try {
        const token = localStorage.getItem("authToken");
        const centerResponses = await Promise.all(
          projectScopeForFilters.map(async (projectId) => {
            const centersRes = await fetch(
              `${API_CONFIG.API_URL}/offline-module/${projectId}/centers`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
            );
            const centersData = await centersRes.json();
            if (centersData.success && Array.isArray(centersData.centers)) {
              return centersData.centers as Center[];
            }
            return [] as Center[];
          }),
        );

        const allCenters = centerResponses.flat();
        const dedupedCenters = Array.from(
          new Map(allCenters.map((center) => [center._id, center])).values(),
        );
        setCenters(dedupedCenters);
      } catch (error) {
        console.error("Error fetching centers for filter:", error);
      }
    };

    fetchCentersForFilter();
  }, [projectScopeForFilters]);

  useEffect(() => {
    // Remove selected centers that are no longer visible for chosen projects
    if (filterCenters.length === 0) return;
    const centerIds = new Set(centers.map((c) => c._id));
    const validSelectedCenters = filterCenters.filter((id) =>
      centerIds.has(id),
    );
    if (validSelectedCenters.length !== filterCenters.length) {
      setFilterCenters(validSelectedCenters);
    }
  }, [centers, filterCenters]);

  useEffect(() => {
    // Remove selected roles that are no longer valid for current project scope
    if (filterRoles.length === 0) return;
    const allowedRoleIds = new Set(availableFilterRoles.map((r) => r._id));
    const validSelectedRoles = filterRoles.filter((id) =>
      allowedRoleIds.has(id),
    );
    if (validSelectedRoles.length !== filterRoles.length) {
      setFilterRoles(validSelectedRoles);
    }
  }, [availableFilterRoles, filterRoles]);

  // Handle create user
  const handleOpenCreateModal = () => {
    setEditingUser(null);

    // Check if in project portal context
    const projectContextStr = localStorage.getItem("projectContext");
    const projectContext = projectContextStr
      ? JSON.parse(projectContextStr)
      : null;

    setFormData({
      primaryProject: projectContext?.projectId || "", // Auto-select if in project portal
      firstName: "",
      lastName: "",
      email: "",
      mobile: "",
      password: "",
      employeeCode: "",
      hrmsId: "",
      role: "",
      projectDepartments: {},
      designation: "",
      joiningDate: "",
      reportingManager: "",
      projects: projectContext?.projectId ? [projectContext.projectId] : [],
      centers: [],
      payrollType: "" as "" | "internal" | "external",
      company: "",
    });

    // Fetch reporting managers for the default project (if any)
    if (projectContext?.projectId) {
      fetchReportingManagers(projectContext.projectId);
    }

    setNameFieldErrors({});
    setShowUserModal(true);
  };

  // Open the "Login as" confirmation modal for a user.
  const handleImpersonate = (user: User) => {
    setImpersonateTarget(user);
    setImpersonateReason("");
    setImpersonateError("");
  };

  // Confirm + start impersonation (reason required). On success the page
  // redirects into the impersonated user's session.
  const confirmImpersonate = async () => {
    if (!impersonateTarget) return;
    const reason = impersonateReason.trim();
    if (reason.length < 3) {
      setImpersonateError("Please enter a reason (at least 3 characters).");
      return;
    }
    setImpersonating(true);
    setImpersonateError("");
    try {
      await startImpersonation(impersonateTarget._id, reason);
      // startImpersonation redirects on success; nothing else to do here.
    } catch (err: any) {
      setImpersonateError(err?.message || "Failed to start impersonation.");
      setImpersonating(false);
    }
  };

  // Handle edit user
  const handleEditUser = async (user: User) => {
    setEditingUser(user);
    const userProjects = user.projects?.map((p) => p._id) || [];
    const primaryProjectId = userProjects[0] || "";

    // Build per-project department map from new projectDepartments field,
    // falling back to legacy single departmentRef mapped to the primary project
    const projectDeptMap: Record<string, string> = {};
    if (user.projectDepartments && user.projectDepartments.length > 0) {
      for (const pd of user.projectDepartments) {
        const pId =
          typeof pd.projectId === "object"
            ? (pd.projectId as Project)._id
            : pd.projectId;
        const dId =
          pd.departmentRef && typeof pd.departmentRef === "object"
            ? (pd.departmentRef as { _id: string; name: string })._id
            : (pd.departmentRef as string | null | undefined);
        if (pId && dId) projectDeptMap[pId] = dId;
      }
    } else if (primaryProjectId) {
      const legacyDeptId =
        (user.departmentRef as any)?._id || (user as any).departmentRef;
      if (
        legacyDeptId &&
        typeof legacyDeptId === "string" &&
        legacyDeptId.length === 24
      ) {
        projectDeptMap[primaryProjectId] = legacyDeptId;
      }
    }

    // Reset departmentsByProject cache so fresh data is loaded
    setDepartmentsByProject({});

    setFormData({
      primaryProject: primaryProjectId, // Use first project as primary
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile || "",
      password: "",
      employeeCode: user.employeeCode || "",
      hrmsId: user.hrmsId?.toString() || "",
      role: user.role?._id || "",
      projectDepartments: projectDeptMap,
      designation: user.designation || "",
      joiningDate: user.joiningDate ? user.joiningDate.split("T")[0] : "",
      reportingManager: user.reportingManager?._id || "",
      projects: userProjects,
      centers: user.centers?.map((c) => c._id) || [],
      payrollType: (user.payrollType as "" | "internal" | "external") || "",
      company:
        typeof user.company === "object" && user.company
          ? user.company._id
          : (user.company as unknown as string) || "",
    });

    // Fetch centers for the primary project
    if (primaryProjectId) {
      try {
        const token = localStorage.getItem("authToken");
        const centersRes = await fetch(
          `${API_CONFIG.API_URL}/offline-module/${primaryProjectId}/centers`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        const centersData = await centersRes.json();

        if (centersData.success && Array.isArray(centersData.centers)) {
          setCenters(centersData.centers);
        }
      } catch (error) {
        console.error("Error fetching centers for edit:", error);
      }
    }

    // Fetch reporting managers for the primary project
    // (departments are fetched by the projects useEffect once formData.projects is set)
    if (primaryProjectId) {
      fetchReportingManagers(primaryProjectId);
    }

    setNameFieldErrors({});
    setShowUserModal(true);
  };

  // Handle view credentials
  const handleViewCredentials = (user: User) => {
    setSelectedUserForCredentials(user);
    setShowCredentialsModal(true);
  };

  // Handle save user
  const handleSaveUser = async () => {
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.role
    ) {
      alert(
        getText(
          "Please fill all required fields",
          "कृपया सर्व आवश्यक फील्ड भरा",
          "कृपया सर्व आवश्यक फील्ड भरा",
        ),
      );
      return;
    }

    const namePattern = /^[a-zA-Z\s.]+$/;
    if (!namePattern.test(formData.firstName)) {
      setNameFieldErrors((prev) => ({
        ...prev,
        firstName: 'Only letters, spaces and "." are allowed',
      }));
      return;
    }
    if (!namePattern.test(formData.lastName)) {
      setNameFieldErrors((prev) => ({
        ...prev,
        lastName: 'Only letters, spaces and "." are allowed',
      }));
      return;
    }

    if (!editingUser && !formData.password) {
      alert(
        getText(
          "Password is required for new users",
          "नवीन वापरकर्त्यांसाठी पासवर्ड आवश्यक आहे",
          "नवीन वापरकर्त्यांसाठी पासवर्ड आवश्यक आहे",
        ),
      );
      return;
    }

    try {
      setSaving(true);
      const url = editingUser
        ? `${API_CONFIG.API_URL}/users/${editingUser._id}`
        : `${API_CONFIG.API_URL}/users`;

      const method = editingUser ? "PUT" : "POST";

      const primaryDeptId =
        formData.projectDepartments[formData.primaryProject] || null;
      const primaryDeptName = primaryDeptId
        ? (departmentsByProject[formData.primaryProject] || []).find(
            (d) => d._id === primaryDeptId,
          )?.name || ""
        : "";

      const payload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        mobile: formData.mobile,
        role: formData.role,
        employeeCode: formData.employeeCode,
        hrmsId: formData.hrmsId ? parseInt(formData.hrmsId) : undefined,
        department: primaryDeptName,
        departmentRef: primaryDeptId,
        projectDepartments: Object.entries(formData.projectDepartments)
          .filter(([, deptId]) => deptId)
          .map(([projectId, departmentRef]) => ({ projectId, departmentRef })),
        designation: formData.designation,
        joiningDate: formData.joiningDate || undefined,
        reportingManager: formData.reportingManager || undefined,
        projects: formData.projects,
        centers: formData.centers,
        payrollType: formData.payrollType || undefined,
        company: formData.company || undefined,
      };

      if (!editingUser && formData.password) {
        payload.password = formData.password;
      }

      const token = localStorage.getItem("authToken");
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        alert(
          editingUser
            ? getText(
                "User updated successfully",
                "वापरकर्ता यशस्वीरित्या अद्यतनित केला",
                "वापरकर्ता यशस्वीरित्या अद्यतनित केला",
              )
            : getText(
                "User created successfully",
                "वापरकर्ता यशस्वीरित्या तयार केला",
                "वापरकर्ता यशस्वीरित्या तयार केला",
              ),
        );
        setShowUserModal(false);
        fetchUsers();
      } else {
        // Show detailed error message from backend
        const errorMessage = data.error || "Failed to save user";
        alert(
          getText(
            `Error: ${errorMessage}`,
            `त्रुटी: ${errorMessage}`,
            `त्रुटी: ${errorMessage}`,
          ),
        );
      }
    } catch (error) {
      console.error("Error saving user:", error);
      alert(
        getText(
          "Failed to save user. Please check your input and try again.",
          "वापरकर्ता जतन करण्यात अयशस्वी. कृपया तुमचा इनपुट तपासा आणि पुन्हा प्रयत्न करा.",
          "वापरकर्ता जतन करण्यात अयशस्वी. कृपया तुमचा इनपुट तपासा आणि पुन्हा प्रयत्न करा.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  // Handle HRMS fetch - Load all employees
  const handleFetchFromHRMS = async () => {
    try {
      setHrmsLoading(true);

      // Build query from the input. Blank = load ALL (backend allows empty);
      // a value matches across every field (name, group code, designation…).
      const queryParam = hrmsEmployeeCodes
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)[0]
        ? hrmsEmployeeCodes.split(",")[0].trim()
        : "";

      const token = localStorage.getItem("authToken");
      const params = new URLSearchParams();
      params.set("query", queryParam);
      params.set("loadMode", hrmsLoadMode);
      if (selectedMdmSource) params.set("mdmSourceId", selectedMdmSource);
      if (hrmsLoadMode === "range") {
        const start = Math.max(1, Number(hrmsRangeStart) || 1);
        const end = Math.max(start, Number(hrmsRangeEnd) || start);
        params.set("start", String(start));
        params.set("end", String(end));
      }
      const response = await fetch(
        `${API_CONFIG.API_URL}/users/hrms/search?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );

      const data = await response.json();

      if (data.success && data.data) {
        // API already searches across all fields, just use the results
        setHrmsEmployees(data.data);
        if (data.meta) setHrmsLoadMeta(data.meta);
        setExistingCodes(
          Array.isArray(data.existingCodes) ? data.existingCodes : [],
        );
        setSelectedEmployees([]);
        setSelectedProjects([]);
        setHrmsPage(1);
        setHrmsImportStep("employees");
        setHrmsColumnSearch("");
        // Capture discovered fields → seed default columns if not set yet
        if (Array.isArray(data.fields) && data.fields.length) {
          setHrmsFields(data.fields);
          setSelectedCols((prev) =>
            prev.length ? prev : pickDefaultCols(data.fields),
          );
        }

        // Show message if no results found
        if (data.data.length === 0) {
          const searchTerm = hrmsEmployeeCodes.trim() || "employees";
          alert(
            getText(
              `No employees found for: ${searchTerm}`,
              `${searchTerm} साठी कर्मचारी आढळले नाहीत`,
              `${searchTerm} साठी कर्मचारी आढळले नाहीत`,
            ),
          );
        }

        // Clear the employee codes input after loading
        setHrmsEmployeeCodes("");
      } else {
        // Surface the real backend reason (e.g. "MDM source … returned HTTP 403")
        alert(
          data.message ||
            data.error ||
            "Failed to fetch employees from HRMS",
        );
        setHrmsEmployees([]);
      }
    } catch (error) {
      console.error("Error fetching from HRMS:", error);
      alert("Failed to fetch from HRMS");
      setHrmsEmployees([]);
    } finally {
      setHrmsLoading(false);
    }
  };

  // Save the current columns + mapping into a named preset (separate collection)
  const saveFieldConfig = async (nameArg?: string) => {
    const name = (nameArg || presetName || "Default").trim();
    try {
      setCfgSaving(true);
      setCfgMsg("");
      const token = localStorage.getItem("authToken");
      const res = await fetch(`${API_CONFIG.API_URL}/users/hrms/field-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          mdmSourceId: selectedMdmSource || undefined,
          dataType: "employees",
          name,
          selectedFields: selectedCols,
          fieldMapping,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCfgMsg(`Saved "${name}" ✓`);
        setPresetName(name);
        // refresh preset list
        setPresets((prev) => {
          const others = prev.filter((p) => p.name !== name);
          return [...others, data.data].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
        });
      } else {
        setCfgMsg(data.error || "Failed to save");
      }
    } catch (e) {
      setCfgMsg("Failed to save");
    } finally {
      setCfgSaving(false);
      setTimeout(() => setCfgMsg(""), 2500);
    }
  };

  const applyPreset = (name: string) => {
    setPresetName(name);
    const p = presets.find((x) => x.name === name);
    if (p) {
      setSelectedCols(p.selectedFields?.length ? p.selectedFields : selectedCols);
      setFieldMapping(p.fieldMapping || {});
    }
  };

  const saveAsPreset = () => {
    const name = window.prompt("Save preset as (name):", presetName || "Default");
    if (name && name.trim()) saveFieldConfig(name.trim());
  };

  const deletePreset = async () => {
    if (!presetName) return;
    if (!window.confirm(`Delete preset "${presetName}"?`)) return;
    const token = localStorage.getItem("authToken");
    const src = selectedMdmSource
      ? `mdmSourceId=${encodeURIComponent(selectedMdmSource)}&`
      : "";
    await fetch(
      `${API_CONFIG.API_URL}/users/hrms/field-config?${src}dataType=employees&name=${encodeURIComponent(presetName)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      },
    );
    setPresets((prev) => prev.filter((p) => p.name !== presetName));
    setPresetName("Default");
    setCfgMsg("Preset deleted");
    setTimeout(() => setCfgMsg(""), 2000);
  };

  // Rows after the in-modal search box (matches across every raw field).
  const hrmsFiltered = hrmsEmployees.filter((e) =>
    hrmsMatch(e, hrmsSearchQuery),
  );
  const isImported = (code?: string) => !!code && existingCodes.includes(code);
  const hrmsTotalPages = Math.max(
    1,
    Math.ceil(hrmsFiltered.length / HRMS_PAGE_SIZE),
  );
  // Resolve a row to user-account fields using the CURRENT mapping (preview).
  const previewResolved = (emp: any) => {
    const get = (target: string) => {
      const mapped = fieldMapping[target];
      if (mapped) return hrmsCell(emp, mapped);
      const v = emp?.[target];
      return v === undefined || v === null || v === "" ? "—" : String(v);
    };
    let firstName = get("firstName");
    let lastName = get("lastName");
    if (fieldMapping.fullName) {
      const full = hrmsCell(emp, fieldMapping.fullName);
      const parts = full.split(/\s+/);
      firstName = parts.shift() || firstName;
      lastName = parts.join(" ") || lastName;
    }
    return {
      employeeCode: get("employeeCode"),
      name: `${firstName} ${lastName}`.trim(),
      email: get("email"),
      mobile: get("mobile"),
      department: get("department"),
      designation: get("designation"),
    };
  };
  const previewEmp =
    hrmsEmployees.find((e) => selectedEmployees.includes(e.employeeCode)) ||
    hrmsFiltered[0];
  const hrmsColumnSearchTerm = hrmsColumnSearch.trim().toLowerCase();
  const hrmsVisibleFields = useMemo(() => {
    if (!hrmsColumnSearchTerm) return hrmsFields;
    return hrmsFields.filter((field) =>
      field.toLowerCase().includes(hrmsColumnSearchTerm),
    );
  }, [hrmsColumnSearchTerm, hrmsFields]);
  const hrmsSelectableCodes = hrmsFiltered
    .map((e) => e.employeeCode)
    .filter((code) => code && !isImported(code));
  const hrmsImportedCount = hrmsFiltered.length - hrmsSelectableCodes.length;
  const hrmsAllSelectableSelected =
    hrmsSelectableCodes.length > 0 &&
    hrmsSelectableCodes.every((code) => selectedEmployees.includes(code));
  const hrmsRequiresProjectSelection =
    viewMode === "unified" &&
    selectedEmployees.length > 0 &&
    selectedProjects.length === 0;
  const hrmsCanSubmit =
    selectedEmployees.length > 0 && !hrmsRequiresProjectSelection;
  const hrmsPrimaryDisabled =
    hrmsImportStep === "employees"
      ? selectedEmployees.length === 0
      : saving || !hrmsCanSubmit;
  const hrmsFilteredProjects = useMemo(() => {
    const query = hrmsProjectSearch.trim().toLowerCase();
    if (!query) return projects;

    return projects.filter((project) => {
      const name = project.name?.toLowerCase() || "";
      const code = project.code?.toLowerCase() || "";
      const status = project.status?.toLowerCase() || "";
      return (
        name.includes(query) ||
        code.includes(query) ||
        status.includes(query)
      );
    });
  }, [hrmsProjectSearch, projects]);
  const selectedHrmsProjects = projects.filter((project) =>
    selectedProjects.includes(project._id),
  );
  const visibleHrmsProjectIds = hrmsFilteredProjects.map((project) => project._id);
  const allVisibleHrmsProjectsSelected =
    visibleHrmsProjectIds.length > 0 &&
    visibleHrmsProjectIds.every((id) => selectedProjects.includes(id));
  const selectedVisibleHrmsProjectCount = visibleHrmsProjectIds.filter((id) =>
    selectedProjects.includes(id),
  ).length;

  const toggleVisibleHrmsProjects = () => {
    if (allVisibleHrmsProjectsSelected) {
      setSelectedProjects((prev) =>
        prev.filter((id) => !visibleHrmsProjectIds.includes(id)),
      );
      return;
    }

    setSelectedProjects((prev) =>
      Array.from(new Set([...prev, ...visibleHrmsProjectIds])),
    );
  };

  const closeHrmsModal = () => {
    setShowHRMSModal(false);
    setHrmsEmployees([]);
    setSelectedEmployees([]);
    setSelectedProjects([]);
    setHrmsProjectSearch("");
    setHrmsColumnSearch("");
    setHrmsLoadMeta(null);
    setHrmsLoadMode("all");
    setHrmsRangeStart("1");
    setHrmsRangeEnd("50");
    setHrmsEmployeeCodes("");
    setHrmsSearchQuery("");
    setHrmsPage(1);
    setHrmsImportStep("employees");
    setShowColPicker(false);
    setShowMapping(false);
    setShowPreview(false);
    setCfgMsg("");
  };

  const hrmsToolbarButtonStyle = (active = false): React.CSSProperties => ({
    padding: "9px 14px",
    background: active ? "#fff7ed" : "white",
    border: `1px solid ${active ? "#fdba74" : "#e2e8f0"}`,
    borderRadius: 10,
    fontSize: 13,
    cursor: "pointer",
    color: active ? "#c2410c" : "#334155",
    fontWeight: active ? 600 : 500,
    boxShadow: active ? "0 4px 10px rgba(249, 115, 22, 0.10)" : "none",
  });

  // Handle HRMS confirm - Add selected employees
  const handleConfirmHRMS = async () => {
    if (selectedEmployees.length === 0) {
      alert(
        getText(
          "Please select at least one employee",
          "कृपया किमान एक कर्मचारी निवडा",
          "कृपया किमान एक कर्मचारी निवडा",
        ),
      );
      return;
    }
    if (hrmsRequiresProjectSelection) {
      alert("Select at least one project before importing HRMS users.");
      return;
    }

    try {
      setSaving(true);
      let successCount = 0;
      let failCount = 0;
      const importedCodes: string[] = [];
      const failedImports: string[] = [];
      const importProjectIds =
        selectedProjects.length > 0
          ? selectedProjects
          : currentProjectId
            ? [currentProjectId]
            : [];

      // Add each selected employee
      for (const employeeId of selectedEmployees) {
        const employee = hrmsEmployees.find(
          (emp) => emp.employeeCode === employeeId,
        );
        if (!employee) continue;

        try {
          const token = localStorage.getItem("authToken");
          const response = await fetch(`${API_CONFIG.API_URL}/users`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify({
              employeeCode: employee.employeeCode,
              projects: importProjectIds,
              syncFromHRMS: true,
              mdmSourceId: selectedMdmSource || undefined,
              fieldMapping,
            }),
          });

          const data = await response.json();

          if (data.success) {
            successCount++;
            importedCodes.push(employee.employeeCode);
          } else {
            failCount++;
            const reason = [data.error, data.message]
              .filter(Boolean)
              .join(": ");
            failedImports.push(
              `${employee.employeeCode}: ${reason || "Unknown error"}`,
            );
            console.error(
              `Failed to add ${employee.employeeCode}:`,
              reason,
            );
          }
        } catch (error) {
          failCount++;
          failedImports.push(`${employee.employeeCode}: Network or server error`);
          console.error(`Error adding ${employee.employeeCode}:`, error);
        }
      }

      const failureDetails =
        failedImports.length > 0
          ? `\n\nFailed:\n${failedImports.slice(0, 5).join("\n")}${
              failedImports.length > 5
                ? `\n...and ${failedImports.length - 5} more`
                : ""
            }`
          : "";
      const message = getText(
        `Added ${successCount} user(s) successfully${failCount > 0 ? `, ${failCount} failed` : ""}${failureDetails}`,
        `${successCount} वापरकर्ते यशस्वीरित्या जोडले${failCount > 0 ? `, ${failCount} अयशस्वी` : ""}`,
        `${successCount} वापरकर्ते यशस्वीरित्या जोडले${failCount > 0 ? `, ${failCount} अयशस्वी` : ""}`,
      );

      alert(message);

      if (successCount > 0) {
        setRecentlyImportedCodes(importedCodes);
        setSearchQuery("");
        setDebouncedSearchQuery("");
        setFilterRoles([]);
        setFilterStatuses([]);
        setFilterCenters([]);
        setFilterCompany("");
        setFilterProjects(importProjectIds);
        setCurrentPage(1);
        navigate("/users");
        await fetchUsers({
          page: 1,
          search: "",
          roles: [],
          statuses: [],
          projects: importProjectIds,
          centers: [],
          company: "",
        });
      }

      closeHrmsModal();
    } catch (error) {
      console.error("Error adding users from HRMS:", error);
      alert("Failed to add users");
    } finally {
      setSaving(false);
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId: string) => {
    if (
      !confirm(
        getText(
          "Are you sure you want to delete this user?",
          "तुम्हाला खात्री आहे की तुम्ही हा वापरकर्ता हटवू इच्छिता?",
          "तुम्हाला खात्री आहे की तुम्ही हा वापरकर्ता हटवू इच्छिता?",
        ),
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        alert(
          getText(
            "User deleted successfully",
            "वापरकर्ता यशस्वीरित्या हटवला",
            "वापरकर्ता यशस्वीरित्या हटवला",
          ),
        );
        fetchUsers();
      } else {
        alert(data.error || "Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user");
    }
  };

  const handleBulkDeleteUsers = async () => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const token = localStorage.getItem("authToken");
      for (const id of ids) {
        await fetch(`${API_CONFIG.API_URL}/users/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
      }
      setSelectedUserIds(new Set());
      setShowBulkDeleteConfirm(false);
      fetchUsers();
    } catch (error) {
      console.error("Error during bulk delete:", error);
      alert("Failed to delete some users. Please try again.");
    } finally {
      setBulkDeleting(false);
    }
  };

  // Export the CURRENTLY-FILTERED users (CSV or Excel). Mirrors the list filters.
  const handleExportUsers = async (format: "excel" | "csv" = "excel") => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (filterRoles.length > 0) params.append("role", filterRoles.join(","));
      if (filterStatuses.length > 0)
        params.append("isActive", filterStatuses.join(","));
      if (filterProjects.length > 0)
        params.append("project", filterProjects.join(","));
      else if (viewMode === "single" && currentProjectId)
        params.append("project", currentProjectId);
      if (filterCenters.length > 0)
        params.append("centers", filterCenters.join(","));
      if (filterCompany) params.append("company", filterCompany);
      params.append("format", format);

      const token = localStorage.getItem("authToken");
      const res = await fetch(`${API_CONFIG.API_URL}/users/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users_export_${new Date().toISOString().split("T")[0]}.${
        format === "csv" ? "csv" : "xlsx"
      }`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export users failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // Bulk upload handlers
  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/users/bulk-template`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("Failed to download template");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bulk-user-template.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading template:", error);
      alert("Failed to download template");
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkUploadFile) return;
    setBulkUploading(true);
    setBulkUploadResults(null);
    try {
      const token = localStorage.getItem("authToken");
      const formPayload = new FormData();
      formPayload.append("file", bulkUploadFile);
      const response = await fetch(`${API_CONFIG.API_URL}/users/bulk-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
        body: formPayload,
      });
      const data = await response.json();
      if (data.success) {
        setBulkUploadResults(data.data);
        if (data.data.created > 0) fetchUsers();
      } else {
        alert(data.error || "Bulk upload failed");
      }
    } catch (error) {
      console.error("Error during bulk upload:", error);
      alert("Failed to upload file");
    } finally {
      setBulkUploading(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAllUsers = () => {
    if (filteredUsers.every((u) => selectedUserIds.has(u._id))) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u._id)));
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (userId: string) => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/users/${userId}/toggle-status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );

      const data = await response.json();

      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || "Failed to toggle status");
      }
    } catch (error) {
      console.error("Error toggling status:", error);
      alert("Failed to toggle status");
    }
  };

  // Handle reset password
  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;

    // Client-side policy validation
    const policy = resetPasswordPolicy;
    const minLen = policy?.minLength ?? 6;
    const policyErrors: string[] = [];
    if (!newPassword || newPassword.length < minLen)
      policyErrors.push(`Password must be at least ${minLen} characters long`);
    if (policy?.requireUppercase && !/[A-Z]/.test(newPassword))
      policyErrors.push("Must contain at least one uppercase letter (A-Z)");
    if (policy?.requireLowercase && !/[a-z]/.test(newPassword))
      policyErrors.push("Must contain at least one lowercase letter (a-z)");
    if (policy?.requireNumbers && !/[0-9]/.test(newPassword))
      policyErrors.push("Must contain at least one number (0-9)");
    if (
      policy?.requireSpecialChars &&
      !/[@!%*?"#$\[\]^~_\-+=]/.test(newPassword)
    )
      policyErrors.push(
        'Must contain at least one special character (@!%*?"#$[]^~_-+=)',
      );
    if (policyErrors.length > 0) {
      setResetPasswordError(policyErrors[0]);
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetPasswordError("Passwords do not match");
      return;
    }

    setResetPasswordError("");

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/users/${resetPasswordUser._id}/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            newPassword,
            projectId: resetPasswordUser.projects?.[0]?._id || currentProjectId,
          }),
        },
      );

      const data = await response.json();

      if (data.success) {
        alert(
          getText(
            "Password reset successfully!",
            "पासवर्ड यशस्वीरित्या रीसेट केला!",
            "पासवर्ड यशस्वीरित्या रीसेट केला!",
          ),
        );
        setShowResetPasswordModal(false);
        setResetPasswordUser(null);
        setNewPassword("");
        setConfirmPassword("");
        setResetPasswordError("");
        setResetPasswordPolicy(null);
      } else {
        setResetPasswordError(data.error || "Failed to reset password");
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      setResetPasswordError("Failed to reset password");
    }
  };

  const handleAssignRole = async (userId: string, roleId: string) => {
    if (!roleId) return;

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ role: roleId }),
      });

      const data = await response.json();

      if (data.success) {
        fetchUsers();
        alert(
          getText(
            "Role assigned successfully!",
            "भूमिका यशस्वीरित्या नियुक्त केली!",
            "भूमिका यशस्वीरित्या नियुक्त केली!",
          ),
        );
      } else {
        alert(data.error || "Failed to assign role");
      }
    } catch (error) {
      console.error("Error assigning role:", error);
      alert("Failed to assign role");
    }
  };

  // Apply filters to users
  // Note: Most filtering is now done server-side via API params
  // Only apply client-side search for immediate feedback while typing
  const filteredUsers = users.filter((user) => {
    // Search filter - only for immediate feedback before debounced API call
    if (searchQuery && searchQuery !== debouncedSearchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        user.firstName?.toLowerCase().includes(searchLower) ||
        user.lastName?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.employeeCode?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // All other filters are handled server-side
    return true;
  });

  const userStats = useMemo(() => {
    // Prefer full-dataset counts from the API; fall back to the current page.
    const total = serverStats?.total ?? totalUsers ?? users.length;
    const active =
      serverStats?.active ?? users.filter((u) => u.isActive).length;
    const inactive = serverStats?.inactive ?? Math.max(0, total - active);
    // Number of projects in the system (the loaded projects list), not just the
    // projects represented on the current page.
    const projectCount =
      projects.length ||
      new Set(users.flatMap((u) => (u.projects || []).map((p) => p._id))).size;

    return {
      total,
      active,
      inactive,
      projects: projectCount,
    };
  }, [serverStats, totalUsers, users, projects.length]);

  const SELECT_ALL_VALUE = "__select_all__";
  const allProjectIds = useMemo(() => projects.map((p) => p._id), [projects]);
  const allRoleIds = useMemo(
    () => availableFilterRoles.map((r) => r._id),
    [availableFilterRoles],
  );
  const allCenterIds = useMemo(() => centers.map((c) => c._id), [centers]);
  const allStatusValues = ["true", "false"];

  const allProjectsSelected =
    allProjectIds.length > 0 &&
    allProjectIds.every((id) => filterProjects.includes(id));
  const allRolesSelected =
    allRoleIds.length > 0 && allRoleIds.every((id) => filterRoles.includes(id));
  const allStatusesSelected = allStatusValues.every((value) =>
    filterStatuses.includes(value),
  );
  const allCentersSelected =
    allCenterIds.length > 0 &&
    allCenterIds.every((id) => filterCenters.includes(id));

  const getMultiSelectValues = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ): string[] =>
    Array.from(event.target.selectedOptions, (option) => option.value);

  const clearAllUserFilters = () => {
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setFilterRoles([]);
    setFilterStatuses([]);
    setFilterProjects([]);
    setFilterCenters([]);
    setFilterCompany("");
    setCurrentPage(1);
  };

  if (loading) {
    const loadingContent = (
      <div
        style={{
          padding: "80px 40px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "400px",
          background: "#f8fafc",
        }}
      >
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "3px solid #e2e8f0",
              borderTop: "3px solid #4f46e5",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          ></div>
          <p
            style={{
              color: "#475569",
              fontSize: "14px",
              margin: 0,
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}
          >
            {getText(
              "Loading users...",
              "वापरकर्ते लोड करत आहे...",
              "वापरकर्ते लोड करत आहे...",
            )}
          </p>
        </div>
      </div>
    );

    return wrapWithLayout ? (
      <DashboardLayout>
        {loadingContent}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </DashboardLayout>
    ) : (
      <>
        {loadingContent}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </>
    );
  }

  const mainContent = (
    <div
      style={{
        padding: isMobileViewport ? "14px 10px 20px" : "24px 20px 32px",
        maxWidth: "1380px",
        margin: "0 auto",
        background: "#f8fafc",
        minHeight: "100vh",
        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#ffffff",
          padding: "22px 24px",
          borderRadius: "16px",
          marginBottom: "16px",
          border: "1px solid #e2e8f0",
          boxShadow:
            "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
        }}
      >
        <h1
          style={{
            margin: "0 0 6px 0",
            fontSize: "28px",
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "-0.02em",
            fontFamily: '"DM Serif Display", Georgia, serif',
          }}
        >
          {getText(
            "User Management",
            "वापरकर्ता व्यवस्थापन",
            "वापरकर्ता व्यवस्थापन",
          )}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "#475569",
            fontWeight: 400,
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
        >
          {getText(
            "Manage system users and their access",
            "सिस्टम वापरकर्ते आणि त्यांचा प्रवेश व्यवस्थापित करा",
            "सिस्टम वापरकर्ते आणि त्यांचा प्रवेश व्यवस्थापित करा",
          )}
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        {[
          {
            label: getText("Total Users", "एकूण वापरकर्ते", "एकूण वापरकर्ते"),
            value: userStats.total,
            color: "#4f46e5",
            bg: "#eef2ff",
          },
          {
            label: getText("Active", "सक्रिय", "सक्रिय"),
            value: userStats.active,
            color: "#047857",
            bg: "#ecfdf5",
          },
          {
            label: getText("Inactive", "निष्क्रिय", "निष्क्रिय"),
            value: userStats.inactive,
            color: "#9f1239",
            bg: "#fff1f2",
          },
          {
            label: getText("Projects", "प्रकल्प", "प्रकल्प"),
            value: userStats.projects,
            color: "#4338ca",
            bg: "#eef2ff",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "14px 16px",
              boxShadow:
                "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "#475569",
                marginBottom: "8px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {stat.label}
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
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Actions Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isTabletViewport || isMobileViewport ? "1fr" : "1fr auto",
          gap: "16px",
          alignItems: "start",
          marginBottom: "16px",
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          padding: "14px",
          boxShadow:
            "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
        }}
      >
        {/* Filters Section */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobileViewport
              ? "1fr"
              : "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "12px",
            alignItems: "center",
          }}
        >
          {/* Search */}
          <div
            style={{
              position: "relative",
              gridColumn: isMobileViewport ? "span 1" : "span 2",
              minWidth: isMobileViewport ? "0" : "280px",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9CA3AF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: "absolute",
                left: "16px",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder={getText(
                "Search users...",
                "वापरकर्ते शोधा...",
                "वापरकर्ते शोधा...",
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: "42px",
                padding: "10px 14px 10px 44px",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                fontSize: "14px",
                outline: "none",
                transition: "all 0.2s ease",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                background: "white",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#4f46e5";
                e.target.style.boxShadow =
                  "0 0 0 3px rgba(132, 202, 255, 0.25)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e2e8f0";
                e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.04)";
              }}
            />
          </div>

          {/* Project Filter - parent filter */}
          <select
            value={
              allProjectsSelected
                ? [SELECT_ALL_VALUE, ...filterProjects]
                : filterProjects
            }
            onChange={(e) => {
              const selectedValues = getMultiSelectValues(e);
              const nextProjects = selectedValues.includes(SELECT_ALL_VALUE)
                ? allProjectsSelected
                  ? []
                  : [...allProjectIds]
                : selectedValues.filter((value) => value !== SELECT_ALL_VALUE);

              setFilterProjects(nextProjects);
              setFilterRoles([]);
              setFilterStatuses([]);
              setFilterCenters([]);
            }}
            multiple
            size={1}
            style={{
              height: "42px",
              padding: "8px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "14px",
              outline: "none",
              backgroundColor: "white",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#4f46e5";
              e.target.style.boxShadow = "0 0 0 3px rgba(132, 202, 255, 0.25)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.04)";
            }}
          >
            <option value={SELECT_ALL_VALUE}>
              {getText(
                "Select All Projects",
                "सर्व प्रकल्प निवडा",
                "सर्व प्रकल्प निवडा",
              )}
            </option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>

          {/* Role Filter (depends on selected project) */}
          <select
            value={
              allRolesSelected
                ? [SELECT_ALL_VALUE, ...filterRoles]
                : filterRoles
            }
            onChange={(e) => {
              const selectedValues = getMultiSelectValues(e);
              const nextRoles = selectedValues.includes(SELECT_ALL_VALUE)
                ? allRolesSelected
                  ? []
                  : [...allRoleIds]
                : selectedValues.filter((value) => value !== SELECT_ALL_VALUE);

              setFilterRoles(nextRoles);
            }}
            multiple
            size={1}
            disabled={projectScopeForFilters.length === 0}
            style={{
              height: "42px",
              padding: "8px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "14px",
              outline: "none",
              backgroundColor:
                projectScopeForFilters.length === 0 ? "#f1f5f9" : "white",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              cursor:
                projectScopeForFilters.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              opacity: projectScopeForFilters.length === 0 ? 0.6 : 1,
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
            onFocus={(e) => {
              if (projectScopeForFilters.length > 0) {
                e.target.style.borderColor = "#4f46e5";
                e.target.style.boxShadow =
                  "0 0 0 3px rgba(132, 202, 255, 0.25)";
              }
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.04)";
            }}
          >
            <option value={SELECT_ALL_VALUE}>
              {getText("Select All Roles", "सर्व रोल निवडा", "सर्व रोल निवडा")}
            </option>
            {availableFilterRoles.map((role) => (
              <option key={role._id} value={role._id}>
                {role.name}
              </option>
            ))}
          </select>

          {/* Status Filter (depends on selected project) */}
          <select
            value={
              allStatusesSelected
                ? [SELECT_ALL_VALUE, ...filterStatuses]
                : filterStatuses
            }
            onChange={(e) => {
              const selectedValues = getMultiSelectValues(e);
              const nextStatuses = selectedValues.includes(SELECT_ALL_VALUE)
                ? allStatusesSelected
                  ? []
                  : [...allStatusValues]
                : selectedValues.filter((value) => value !== SELECT_ALL_VALUE);

              setFilterStatuses(nextStatuses);
            }}
            multiple
            size={1}
            disabled={projectScopeForFilters.length === 0}
            style={{
              height: "42px",
              padding: "8px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "14px",
              outline: "none",
              backgroundColor:
                projectScopeForFilters.length === 0 ? "#f1f5f9" : "white",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              cursor:
                projectScopeForFilters.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              opacity: projectScopeForFilters.length === 0 ? 0.6 : 1,
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
            onFocus={(e) => {
              if (projectScopeForFilters.length > 0) {
                e.target.style.borderColor = "#4f46e5";
                e.target.style.boxShadow =
                  "0 0 0 3px rgba(132, 202, 255, 0.25)";
              }
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.04)";
            }}
          >
            <option value={SELECT_ALL_VALUE}>
              {getText(
                "Select All Status",
                "सर्व स्थिती निवडा",
                "सर्व स्थिती निवडा",
              )}
            </option>
            <option value="true">
              {getText("Active", "सक्रिय", "सक्रिय")}
            </option>
            <option value="false">
              {getText("Inactive", "निष्क्रिय", "निष्क्रिय")}
            </option>
          </select>

          {/* Center Filter (depends on selected project) */}
          <select
            value={
              allCentersSelected
                ? [SELECT_ALL_VALUE, ...filterCenters]
                : filterCenters
            }
            onChange={(e) => {
              const selectedValues = getMultiSelectValues(e);
              const nextCenters = selectedValues.includes(SELECT_ALL_VALUE)
                ? allCentersSelected
                  ? []
                  : [...allCenterIds]
                : selectedValues.filter((value) => value !== SELECT_ALL_VALUE);

              setFilterCenters(nextCenters);
            }}
            disabled={projectScopeForFilters.length === 0}
            multiple
            size={1}
            style={{
              height: "42px",
              padding: "8px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "14px",
              outline: "none",
              backgroundColor:
                projectScopeForFilters.length === 0 ? "#f1f5f9" : "white",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              cursor:
                projectScopeForFilters.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              opacity: projectScopeForFilters.length === 0 ? 0.6 : 1,
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
            onFocus={(e) => {
              if (projectScopeForFilters.length > 0) {
                e.target.style.borderColor = "#4f46e5";
                e.target.style.boxShadow =
                  "0 0 0 3px rgba(132, 202, 255, 0.25)";
              }
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.04)";
            }}
          >
            <option value={SELECT_ALL_VALUE}>
              {getText(
                "Select All Centers",
                "सर्व केंद्रे निवडा",
                "सर्व केंद्रे निवडा",
              )}
            </option>
            {centers.map((center) => (
              <option key={center._id} value={center._id}>
                {center.centerName} - {center.city}
              </option>
            ))}
          </select>

          {/* Company Filter */}
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            style={{
              height: "42px",
              padding: "8px 10px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "14px",
              outline: "none",
              backgroundColor: "white",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#4f46e5";
              e.target.style.boxShadow = "0 0 0 3px rgba(132, 202, 255, 0.25)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f0";
              e.target.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.04)";
            }}
          >
            <option value="">
              {getText("All Companies", "सर्व कंपन्या", "सर्व कंपन्या")}
            </option>
            <option value="internal">
              {getText("Internal (Own Payroll)", "अंतर्गत", "अंतर्गत")}
            </option>
            <option value="external">
              {getText("External", "बाह्य", "बाह्य")}
            </option>
            {companies.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              flexWrap: "wrap",
              gap: "12px",
              fontSize: "12px",
              color: "#475569",
            }}
          >
            <span>
              {getText(
                "Filter order: Project -> Role -> Status/Center. Use Ctrl/Cmd for multi-select.",
                "फिल्टर क्रम: प्रोजेक्ट -> रोल -> स्थिती/केंद्र. मल्टी-सेलेक्टसाठी Ctrl/Cmd वापरा.",
                "फिल्टर क्रम: प्रोजेक्ट -> रोल -> स्थिती/केंद्र. मल्टी-सेलेक्टसाठी Ctrl/Cmd वापरा.",
              )}
            </span>
            <button
              type="button"
              onClick={clearAllUserFilters}
              style={{
                border: "none",
                background: "transparent",
                color: "#4f46e5",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                padding: 0,
                marginLeft: "4px",
              }}
            >
              {getText(
                "Clear all filters",
                "सर्व फिल्टर साफ करा",
                "सर्व फिल्टर साफ करा",
              )}
            </button>
          </div>
        </div>

        {/* Buttons Section */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexShrink: 0,
            flexWrap: "wrap",
            justifyContent: isMobileViewport ? "stretch" : "flex-start",
          }}
        >
          {hasPermission("USER_CREATE") && (
            <button
              onClick={() => setShowHRMSModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(16, 185, 129, 0.24)",
                transition: "all 0.2s ease",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                outline: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#059669";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(16, 185, 129, 0.32)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#10b981";
                e.currentTarget.style.boxShadow =
                  "0 2px 6px rgba(16, 185, 129, 0.24)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {getText("Add from HRMS", "HRMS मधून जोडा", "HRMS मधून जोडा")}
            </button>
          )}
          {hasPermission("USER_CREATE") && (
            <button
              onClick={() => {
                setBulkUploadFile(null);
                setBulkUploadResults(null);
                setShowBulkUploadModal(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "#f59e0b",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(245, 158, 11, 0.24)",
                transition: "all 0.2s ease",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                outline: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#d97706";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(245, 158, 11, 0.32)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f59e0b";
                e.currentTarget.style.boxShadow =
                  "0 2px 6px rgba(245, 158, 11, 0.24)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              {getText("Bulk Upload", "बल्क अपलोड", "बल्क अपलोड")}
            </button>
          )}
          {hasPermission("USER_VIEW_ALL") && (
            <button
              onClick={() => handleExportUsers("excel")}
              disabled={exporting}
              title={getText(
                "Export the currently filtered users to Excel",
                "फ़िल्टर किए गए उपयोगकर्ताओं को एक्सेल में निर्यात करें",
                "फिल्टर केलेले वापरकर्ते एक्सेलमध्ये निर्यात करा",
              )}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: exporting ? "#86efac" : "#16a34a",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: exporting ? "not-allowed" : "pointer",
                boxShadow: "0 2px 6px rgba(22, 163, 74, 0.24)",
                transition: "all 0.2s ease",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                outline: "none",
              }}
              onMouseEnter={(e) => {
                if (exporting) return;
                e.currentTarget.style.background = "#15803d";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                if (exporting) return;
                e.currentTarget.style.background = "#16a34a";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exporting
                ? getText("Exporting…", "निर्यात हो रहा है…", "निर्यात होत आहे…")
                : getText("Export", "निर्यात", "निर्यात")}
            </button>
          )}
          {hasPermission("USER_CREATE") && (
            <button
              onClick={handleOpenCreateModal}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "linear-gradient(160deg, #4f46e5, #4338ca)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(67,56,202,.35)",
                transition: "all 0.2s ease",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                outline: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 6px 18px rgba(67,56,202,.45)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 4px 14px rgba(67,56,202,.35)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {getText(
                "Create User",
                "वापरकर्ता तयार करा",
                "वापरकर्ता तयार करा",
              )}
            </button>
          )}
          {hasPermission("USER_DELETE") && selectedUserIds.size > 0 && (
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "#DC2626",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(220, 38, 38, 0.3)",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              {getText("Delete Selected", "निवडलेले हटवा", "निवडलेले हटवा")} (
              {selectedUserIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          boxShadow:
            "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
        }}
      >
        {filteredUsers.length === 0 ? (
          <div
            style={{
              padding: "80px 40px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "96px",
                height: "96px",
                margin: "0 auto 24px",
                background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4f46e5"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3
              style={{
                margin: "0 0 12px 0",
                fontSize: "20px",
                fontWeight: 700,
                color: "#0f172a",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}
            >
              {getText(
                "No Users Found",
                "वापरकर्ते आढळले नाहीत",
                "वापरकर्ते आढळले नाहीत",
              )}
            </h3>
            <p
              style={{
                margin: "0",
                color: "#475569",
                fontSize: "14px",
                maxWidth: "420px",
                marginLeft: "auto",
                marginRight: "auto",
                lineHeight: "1.6",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}
            >
              {getText(
                "Get started by adding users to your system",
                "तुमच्या सिस्टममध्ये वापरकर्ते जोडून प्रारंभ करा",
                "तुमच्या सिस्टममध्ये वापरकर्ते जोडून प्रारंभ करा",
              )}
            </p>
          </div>
        ) : isMobileViewport ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "10px",
            }}
          >
            {filteredUsers.map((user) => (
              <div
                key={user._id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "12px",
                  background: selectedUserIds.has(user._id)
                    ? "#fff1f2"
                    : "#ffffff",
                  boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    alignItems: "start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 700,
                        color: "#0f172a",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {user.firstName} {user.lastName}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        marginTop: "2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      <UserEmailDisplay email={user.email} />
                    </div>
                  </div>
                  {hasPermission("USER_DELETE") && (
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(user._id)}
                      onChange={() => toggleUserSelection(user._id)}
                      style={{
                        width: "16px",
                        height: "16px",
                        cursor: "pointer",
                      }}
                    />
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                    marginTop: "10px",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    {getText("Role", "रोल", "रोल")}:{" "}
                    {user.role?.name ||
                      getText("No Role", "भूमिका नाही", "भूमिका नाही")}
                  </div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    {getText("Employee", "कर्मचारी", "कर्मचारी")}:{" "}
                    {user.employeeCode || "-"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    {getText("Projects", "प्रकल्प", "प्रकल्प")}:{" "}
                    {user.projects?.length || 0}
                  </div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>
                    {getText("Centers", "केंद्रे", "केंद्रे")}:{" "}
                    {user.centers?.length || 0}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "10px",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <label
                      style={{
                        position: "relative",
                        display: "inline-block",
                        width: "40px",
                        height: "22px",
                        cursor: hasPermission("USER_EDIT")
                          ? "pointer"
                          : "not-allowed",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={user.isActive}
                        onChange={() => handleToggleStatus(user._id)}
                        disabled={!hasPermission("USER_EDIT")}
                        style={{
                          opacity: 0,
                          width: 0,
                          height: 0,
                          position: "absolute",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: user.isActive
                            ? "#10B981"
                            : "#e2e8f0",
                          borderRadius: "24px",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            height: "16px",
                            width: "16px",
                            left: user.isActive ? "21px" : "3px",
                            bottom: "3px",
                            backgroundColor: "white",
                            borderRadius: "50%",
                          }}
                        ></span>
                      </span>
                    </label>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: user.isActive ? "#047857" : "#475569",
                      }}
                    >
                      {user.isActive
                        ? getText("Active", "सक्रिय", "सक्रिय")
                        : getText("Inactive", "निष्क्रिय", "निष्क्रिय")}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    {hasPermission("USER_EDIT") && (
                      <button
                        onClick={() => handleEditUser(user)}
                        style={{
                          padding: "6px 8px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          background: "#ffffff",
                          cursor: "pointer",
                          fontSize: "12px",
                          color: "#4f46e5",
                        }}
                      >
                        {getText("Edit", "संपादित", "संपादित")}
                      </button>
                    )}
                    {hasPermission("IMPERSONATE_USER") &&
                      user._id !== localStorage.getItem("userId") && (
                        <button
                          onClick={() => handleImpersonate(user)}
                          style={{
                            padding: "6px 8px",
                            border: "1px solid #fde68a",
                            borderRadius: "8px",
                            background: "#fffbeb",
                            cursor: "pointer",
                            fontSize: "12px",
                            color: "#b45309",
                          }}
                        >
                          {getText("Login as", "म्हणून लॉगिन", "म्हणून लॉगिन")}
                        </button>
                      )}
                    {hasPermission("USER_DELETE") && (
                      <button
                        onClick={() => handleDeleteUser(user._id)}
                        style={{
                          padding: "6px 8px",
                          border: "1px solid #fecaca",
                          borderRadius: "8px",
                          background: "#fff1f2",
                          cursor: "pointer",
                          fontSize: "12px",
                          color: "#dc2626",
                        }}
                      >
                        {getText("Delete", "हटवा", "हटवा")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto", width: "100%" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                minWidth: "900px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {hasPermission("USER_DELETE") && (
                    <th
                      style={{
                        padding: "12px 16px",
                        width: "48px",
                        textAlign: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        title="Select all users"
                        checked={
                          filteredUsers.length > 0 &&
                          filteredUsers.every((u) => selectedUserIds.has(u._id))
                        }
                        onChange={toggleSelectAllUsers}
                        style={{
                          cursor: "pointer",
                          width: "16px",
                          height: "16px",
                        }}
                      />
                    </th>
                  )}
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Name", "नाव", "नाव")}
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Email", "ईमेल", "ईमेल")}
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Employee Code", "कर्मचारी कोड", "कर्मचारी कोड")}
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Role", "रोल", "रोल")}
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Projects", "प्रकल्प", "प्रकल्प")}
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Centers", "केंद्रे", "केंद्रे")}
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Company", "कंपनी", "कंपनी")}
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Status", "स्थिती", "स्थिती")}
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily:
                        '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {getText("Actions", "कृती", "कृती")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <tr
                    key={user._id}
                    style={{
                      borderBottom:
                        index < filteredUsers.length - 1
                          ? "1px solid #e2e8f0"
                          : "none",
                      background: selectedUserIds.has(user._id)
                        ? "#FEF2F2"
                        : recentlyImportedCodes.includes(user.employeeCode || "")
                          ? "#ECFDF5"
                          : "white",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (
                        !selectedUserIds.has(user._id) &&
                        !recentlyImportedCodes.includes(user.employeeCode || "")
                      )
                        e.currentTarget.style.background = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = selectedUserIds.has(
                        user._id,
                      )
                        ? "#FEF2F2"
                        : recentlyImportedCodes.includes(user.employeeCode || "")
                          ? "#ECFDF5"
                          : "white";
                    }}
                  >
                    {hasPermission("USER_DELETE") && (
                      <td
                        style={{
                          padding: "16px",
                          textAlign: "center",
                          width: "48px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(user._id)}
                          onChange={() => toggleUserSelection(user._id)}
                          style={{
                            cursor: "pointer",
                            width: "16px",
                            height: "16px",
                          }}
                        />
                      </td>
                    )}
                    <td style={{ padding: "16px 24px" }}>
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#0f172a",
                            fontSize: "14px",
                            fontFamily:
                              '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}
                        >
                          {user.firstName} {user.lastName}
                        </div>
                        {recentlyImportedCodes.includes(
                          user.employeeCode || "",
                        ) && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              marginTop: "6px",
                              padding: "3px 8px",
                              borderRadius: 999,
                              background: "#dcfce7",
                              color: "#166534",
                              fontSize: 11,
                              fontWeight: 700,
                              border: "1px solid #bbf7d0",
                            }}
                          >
                            Imported now
                          </span>
                        )}
                        {user.mobile && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#475569",
                              marginTop: "4px",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              fontFamily:
                                '"Noto Sans", system-ui, -apple-system, sans-serif',
                            }}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#475569"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                x="5"
                                y="2"
                                width="14"
                                height="20"
                                rx="2"
                                ry="2"
                              />
                              <line x1="12" y1="18" x2="12.01" y2="18" />
                            </svg>
                            {user.mobile}
                          </div>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        fontSize: "14px",
                        color: "#475569",
                        fontFamily:
                          '"Noto Sans", system-ui, -apple-system, sans-serif',
                      }}
                    >
                      <UserEmailDisplay email={user.email} />
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      {user.employeeCode ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            backgroundColor: "#eef2ff",
                            color: "#4f46e5",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            fontFamily:
                              '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}
                        >
                          {user.employeeCode}
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "14px" }}>
                          -
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      {user.role ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            backgroundColor: "#F3E8FF",
                            color: "#7e22ce",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            fontFamily:
                              '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}
                        >
                          {user.role.name}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            backgroundColor: "#FEF2F2",
                            color: "#dc2626",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            fontFamily:
                              '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}
                        >
                          {getText("No Role", "भूमिका नाही", "भूमिका नाही")}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      {user.projects && user.projects.length > 0 ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            background: "#F0FDF4",
                            borderRadius: "6px",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#16a34a"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#16a34a",
                              fontFamily:
                                '"Noto Sans", system-ui, -apple-system, sans-serif',
                            }}
                          >
                            {user.projects.length}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "14px" }}>
                          -
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      {user.centers && user.centers.length > 0 ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            background: "#FEF3C7",
                            borderRadius: "6px",
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#d97706"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "#d97706",
                              fontFamily:
                                '"Noto Sans", system-ui, -apple-system, sans-serif',
                            }}
                          >
                            {user.centers.length}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "14px" }}>
                          -
                        </span>
                      )}
                    </td>
                    {/* Company column */}
                    <td style={{ padding: "16px 24px" }}>
                      {user.payrollType === "internal" ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            backgroundColor: "#ECFDF5",
                            color: "#065F46",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            fontFamily:
                              '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}
                        >
                          {getText("Internal", "अंतर्गत", "अंतर्गत")}
                        </span>
                      ) : user.payrollType === "external" && user.company ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            backgroundColor: "#FFF7ED",
                            color: "#92400E",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            fontFamily:
                              '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}
                        >
                          {typeof user.company === "object"
                            ? user.company.name
                            : user.company}
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "14px" }}>
                          -
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <label
                          style={{
                            position: "relative",
                            display: "inline-block",
                            width: "44px",
                            height: "24px",
                            cursor: hasPermission("USER_EDIT")
                              ? "pointer"
                              : "not-allowed",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={user.isActive}
                            onChange={() => handleToggleStatus(user._id)}
                            disabled={!hasPermission("USER_EDIT")}
                            style={{
                              opacity: 0,
                              width: 0,
                              height: 0,
                              position: "absolute",
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: user.isActive
                                ? "#10B981"
                                : "#e2e8f0",
                              borderRadius: "24px",
                              transition:
                                "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                              opacity: hasPermission("USER_EDIT") ? 1 : 0.5,
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                height: "18px",
                                width: "18px",
                                left: user.isActive ? "23px" : "3px",
                                bottom: "3px",
                                backgroundColor: "white",
                                borderRadius: "50%",
                                transition:
                                  "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                              }}
                            ></span>
                          </span>
                        </label>
                        <span
                          style={{
                            backgroundColor: user.isActive
                              ? "#DCFCE7"
                              : "#f1f5f9",
                            color: user.isActive ? "#047857" : "#475569",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            fontFamily:
                              '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}
                        >
                          {user.isActive
                            ? getText("Active", "सक्रिय", "सक्रिय")
                            : getText("Inactive", "निष्क्रिय", "निष्क्रिय")}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {hasPermission("USER_EDIT") && (
                          <button
                            onClick={() => handleEditUser(user)}
                            style={{
                              padding: "8px",
                              width: "36px",
                              height: "36px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "white",
                              border: "1.5px solid #e2e8f0",
                              borderRadius: "8px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#eef2ff";
                              e.currentTarget.style.borderColor = "#4f46e5";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "white";
                              e.currentTarget.style.borderColor = "#e2e8f0";
                            }}
                            title={getText(
                              "Edit",
                              "संपादित करा",
                              "संपादित करा",
                            )}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#475569"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                        {hasPermission("IMPERSONATE_USER") &&
                          user._id !== localStorage.getItem("userId") && (
                            <button
                              onClick={() => handleImpersonate(user)}
                              style={{
                                padding: "8px",
                                width: "36px",
                                height: "36px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "white",
                                border: "1.5px solid #e2e8f0",
                                borderRadius: "8px",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                outline: "none",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#FEF3C7";
                                e.currentTarget.style.borderColor = "#D97706";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "white";
                                e.currentTarget.style.borderColor = "#e2e8f0";
                              }}
                              title={getText(
                                "Login as this user",
                                "या वापरकर्त्याप्रमाणे लॉगिन करा",
                                "या वापरकर्त्याप्रमाणे लॉगिन करा",
                              )}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#B45309"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <polyline points="16 11 18 13 22 9" />
                              </svg>
                            </button>
                          )}
                        {hasPermission("USER_VIEW_ALL") && (
                          <button
                            onClick={() => handleViewCredentials(user)}
                            style={{
                              padding: "8px",
                              width: "36px",
                              height: "36px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "white",
                              border: "1.5px solid #e2e8f0",
                              borderRadius: "8px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#F0FDF4";
                              e.currentTarget.style.borderColor = "#10B981";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "white";
                              e.currentTarget.style.borderColor = "#e2e8f0";
                            }}
                            title={getText(
                              "View Credentials",
                              "क्रेडेन्शियल पहा",
                              "क्रेडेन्शियल पहा",
                            )}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#475569"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                        )}
                        {hasPermission("USER_DELETE") && (
                          <button
                            onClick={() => handleDeleteUser(user._id)}
                            style={{
                              padding: "8px",
                              width: "36px",
                              height: "36px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "white",
                              border: "1.5px solid #e2e8f0",
                              borderRadius: "8px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#FEF2F2";
                              e.currentTarget.style.borderColor = "#DC2626";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "white";
                              e.currentTarget.style.borderColor = "#e2e8f0";
                            }}
                            title={getText("Delete", "हटवा", "हटवा")}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#DC2626"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && filteredUsers.length > 0 && (
        <div
          style={{
            marginTop: "16px",
            padding: "14px 16px",
            background: "white",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow:
              "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            display: "flex",
            justifyContent: isMobileViewport ? "center" : "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          {/* Pagination Info */}
          <div
            style={{
              fontSize: "14px",
              color: "#475569",
              fontWeight: 500,
            }}
          >
            Showing {(currentPage - 1) * usersPerPage + 1} to{" "}
            {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers}{" "}
            users
          </div>

          {/* Pagination Buttons */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: isMobileViewport ? "center" : "flex-start",
            }}
          >
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              style={{
                padding: "8px 12px",
                background: currentPage === 1 ? "#f1f5f9" : "white",
                color: currentPage === 1 ? "#9ca3af" : "#4f46e5",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = "#f8fafc";
                  e.currentTarget.style.borderColor = "#4f46e5";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = "white";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }
              }}
            >
              First
            </button>

            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: "8px 12px",
                background: currentPage === 1 ? "#f1f5f9" : "white",
                color: currentPage === 1 ? "#9ca3af" : "#4f46e5",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = "#f8fafc";
                  e.currentTarget.style.borderColor = "#4f46e5";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = "white";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }
              }}
            >
              Previous
            </button>

            {/* Page Numbers */}
            <div
              style={{
                display: "flex",
                gap: "4px",
                alignItems: "center",
              }}
            >
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      padding: "8px 12px",
                      minWidth: "40px",
                      background:
                        currentPage === pageNum
                          ? "linear-gradient(160deg, #4f46e5, #4338ca)"
                          : "white",
                      color: currentPage === pageNum ? "white" : "#4f46e5",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (currentPage !== pageNum) {
                        e.currentTarget.style.background = "#f8fafc";
                        e.currentTarget.style.borderColor = "#4f46e5";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentPage !== pageNum) {
                        e.currentTarget.style.background = "white";
                        e.currentTarget.style.borderColor = "#e2e8f0";
                      }
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              style={{
                padding: "8px 12px",
                background: currentPage === totalPages ? "#f1f5f9" : "white",
                color: currentPage === totalPages ? "#9ca3af" : "#4f46e5",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = "#f8fafc";
                  e.currentTarget.style.borderColor = "#4f46e5";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = "white";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }
              }}
            >
              Next
            </button>

            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              style={{
                padding: "8px 12px",
                background: currentPage === totalPages ? "#f1f5f9" : "white",
                color: currentPage === totalPages ? "#9ca3af" : "#4f46e5",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = "#f8fafc";
                  e.currentTarget.style.borderColor = "#4f46e5";
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = "white";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }
              }}
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Impersonation ("Login as") confirmation — reason is required (DPDP) */}
      {impersonateTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100001,
            padding: "16px",
          }}
          onClick={() => !impersonating && setImpersonateTarget(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "14px",
              padding: "24px",
              width: "100%",
              maxWidth: "460px",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#0f172a",
                margin: "0 0 6px 0",
              }}
            >
              Login as user
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "#475569",
                margin: "0 0 16px 0",
              }}
            >
              You are about to start a session as{" "}
              <strong>
                {impersonateTarget.firstName} {impersonateTarget.lastName}
              </strong>{" "}
              ({impersonateTarget.email}). This action is logged for audit. A
              reason is required.
            </p>

            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: "#334155",
                marginBottom: "6px",
              }}
            >
              Reason <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              value={impersonateReason}
              onChange={(e) => setImpersonateReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Reproducing a ticket-submission issue reported by this user"
              style={{
                width: "100%",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "8px 10px",
                fontSize: "13px",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            {impersonateError && (
              <div
                style={{
                  marginTop: "10px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#B91C1C",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  fontSize: "12px",
                }}
              >
                {impersonateError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <button
                onClick={() => setImpersonateTarget(null)}
                disabled={impersonating}
                style={{
                  padding: "9px 18px",
                  background: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  cursor: impersonating ? "not-allowed" : "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmImpersonate}
                disabled={impersonating}
                style={{
                  padding: "9px 18px",
                  background: "#B45309",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: impersonating ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  opacity: impersonating ? 0.7 : 1,
                }}
              >
                {impersonating ? "Starting…" : "Login as user"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit User Modal */}
      {showUserModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: isMobileViewport ? "8px" : "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "20px",
              maxWidth: isMobileViewport ? "100%" : "920px",
              width: "100%",
              maxHeight: isMobileViewport ? "96vh" : "92vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              border: "1px solid #e2e8f0",
              boxShadow:
                "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
            }}
          >
            <div
              style={{
                padding: isMobileViewport ? "14px 12px" : "18px 24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: isMobileViewport ? "start" : "center",
                flexDirection: isMobileViewport ? "column" : "row",
                gap: isMobileViewport ? "10px" : "0",
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    color: "#0f172a",
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {editingUser
                    ? getText(
                        "Edit User",
                        "वापरकर्ता संपादित करा",
                        "वापरकर्ता संपादित करा",
                      )
                    : getText(
                        "Create User",
                        "वापरकर्ता तयार करा",
                        "वापरकर्ता तयार करा",
                      )}
                </h2>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "13px",
                    color: "#475569",
                  }}
                >
                  {getText(
                    "Fill required details and assign role, projects, and centers.",
                    "आवश्यक तपशील भरा आणि भूमिका, प्रकल्प व केंद्रे नियुक्त करा.",
                    "आवश्यक तपशील भरा आणि भूमिका, प्रकल्प व केंद्रे नियुक्त करा.",
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowUserModal(false)}
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "999px",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  fontSize: "20px",
                  lineHeight: 1,
                  cursor: "pointer",
                  color: "#475569",
                }}
                title={getText("Close", "बंद करा", "बंद करा")}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: isMobileViewport ? "12px" : "20px 24px",
                overflowY: "auto",
                flex: 1,
                background: "#f8fafc",
              }}
            >
              {/* Primary Project Selection - FIRST */}
              <div
                style={{
                  marginBottom: "20px",
                  padding: "16px",
                  backgroundColor: "#eef2ff",
                  border: "1px solid #c7d2fe",
                  borderRadius: "12px",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#4338ca",
                    marginBottom: "8px",
                  }}
                >
                  {getText(
                    "Select Project",
                    "प्रोजेक्ट निवडा",
                    "प्रोजेक्ट निवडा",
                  )}{" "}
                  <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={formData.primaryProject}
                  onChange={async (e) => {
                    const projectId = e.target.value;
                    setFormData({
                      ...formData,
                      primaryProject: projectId,
                      projects: projectId
                        ? formData.projects.includes(projectId)
                          ? formData.projects
                          : [...formData.projects, projectId]
                        : formData.projects,
                      role: "",
                      centers: [],
                    });

                    // Fetch centers for the selected project
                    if (projectId) {
                      try {
                        const token = localStorage.getItem("authToken");
                        const centersRes = await fetch(
                          `${API_CONFIG.API_URL}/offline-module/${projectId}/centers`,
                          {
                            headers: {
                              Authorization: `Bearer ${token}`,
                              "Content-Type": "application/json",
                            },
                          },
                        );

                        const centersData = await centersRes.json();

                        if (
                          centersData.success &&
                          Array.isArray(centersData.centers)
                        ) {
                          setCenters(centersData.centers);
                        } else {
                          setCenters([]);
                        }
                      } catch (error) {
                        console.error(
                          "Error fetching centers for project:",
                          error,
                        );
                        setCenters([]);
                      }
                    } else {
                      setCenters([]);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #c7d2fe",
                    borderRadius: "10px",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                    backgroundColor: "white",
                    fontWeight: "500",
                  }}
                >
                  <option value="">
                    {getText(
                      "⚠️ Select a project first",
                      "⚠️ प्रथम प्रोजेक्ट निवडा",
                      "⚠️ प्रथम प्रोजेक्ट निवडा",
                    )}
                  </option>
                  {projects && projects.length > 0 ? (
                    projects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.name} {project.code ? `(${project.code})` : ""}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      {getText(
                        "No projects available",
                        "कोणतेही प्रोजेक्ट उपलब्ध नाहीत",
                        "कोणतेही प्रोजेक्ट उपलब्ध नाहीत",
                      )}
                    </option>
                  )}
                </select>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#4338ca",
                    marginTop: "8px",
                    fontStyle: "italic",
                  }}
                >
                  {getText(
                    "Roles and centers will be filtered based on this project",
                    "या प्रोजेक्टच्या आधारे भूमिका आणि केंद्रे फिल्टर केली जातील",
                    "या प्रोजेक्टच्या आधारे भूमिका आणि केंद्रे फिल्टर केली जातील",
                  )}
                  {projects.length === 0 && (
                    <span
                      style={{
                        display: "block",
                        color: "#ef4444",
                        marginTop: "4px",
                      }}
                    >
                      ⚠️{" "}
                      {getText(
                        "Loading projects...",
                        "प्रोजेक्ट लोड करत आहे...",
                        "प्रोजेक्ट लोड करत आहे...",
                      )}
                    </span>
                  )}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobileViewport ? "1fr" : "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText("First Name", "पहिले नाव", "पहिले नाव")}{" "}
                    <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) =>
                      handleNameChange("firstName", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: `1px solid ${nameFieldErrors.firstName ? "#ef4444" : "#e2e8f0"}`,
                      borderRadius: "6px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  {nameFieldErrors.firstName && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#ef4444",
                        marginTop: "4px",
                      }}
                    >
                      {nameFieldErrors.firstName}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText("Last Name", "आडनाव", "आडनाव")}{" "}
                    <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) =>
                      handleNameChange("lastName", e.target.value)
                    }
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: `1px solid ${nameFieldErrors.lastName ? "#ef4444" : "#e2e8f0"}`,
                      borderRadius: "6px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  {nameFieldErrors.lastName && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#ef4444",
                        marginTop: "4px",
                      }}
                    >
                      {nameFieldErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  {getText("Email", "ईमेल", "ईमेल")}{" "}
                  <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobileViewport ? "1fr" : "1fr 1fr",
                  gap: "16px",
                  marginTop: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText("Mobile", "मोबाईल", "मोबाईल")}
                  </label>
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) =>
                      setFormData({ ...formData, mobile: e.target.value })
                    }
                    placeholder={getText(
                      "10-digit number (starts with 6-9)",
                      "10-अंकी क्रमांक (6-9 ने सुरू)",
                      "10-अंकी क्रमांक (6-9 ने सुरू)",
                    )}
                    pattern="[6-9][0-9]{9}"
                    maxLength={10}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#475569",
                      marginTop: "4px",
                    }}
                  >
                    {getText(
                      "Example: 9876543210",
                      "उदाहरण: 9876543210",
                      "उदाहरण: 9876543210",
                    )}
                  </p>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText("Employee Code", "कर्मचारी कोड", "कर्मचारी कोड")}
                  </label>
                  <input
                    type="text"
                    value={formData.employeeCode}
                    onChange={(e) =>
                      setFormData({ ...formData, employeeCode: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobileViewport ? "1fr" : "1fr 1fr",
                  gap: "16px",
                  marginTop: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText("HRMS ID", "HRMS ID", "HRMS ID")}
                  </label>
                  <input
                    type="number"
                    value={formData.hrmsId}
                    onChange={(e) =>
                      setFormData({ ...formData, hrmsId: e.target.value })
                    }
                    placeholder="PeopleStrong Employee ID"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText(
                      "Joining Date",
                      "सामील होण्याचा दिनांक",
                      "सामील होण्याचा दिनांक",
                    )}
                  </label>
                  <input
                    type="date"
                    value={formData.joiningDate}
                    onChange={(e) =>
                      setFormData({ ...formData, joiningDate: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Payroll / Company */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobileViewport
                    ? "1fr"
                    : formData.payrollType === "external"
                      ? "1fr 1fr"
                      : "1fr",
                  gap: "16px",
                  marginTop: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText("Payroll Type", "पेरोल प्रकार", "पेरोल प्रकार")}
                  </label>
                  <select
                    value={formData.payrollType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        payrollType: e.target.value as
                          | ""
                          | "internal"
                          | "external",
                        company:
                          e.target.value !== "external" ? "" : formData.company,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                      backgroundColor: "white",
                    }}
                  >
                    <option value="">
                      {getText(
                        "Select payroll type",
                        "पेरोल प्रकार निवडा",
                        "पेरोल प्रकार निवडा",
                      )}
                    </option>
                    <option value="internal">
                      {getText(
                        "Internal (Own Payroll)",
                        "अंतर्गत (स्वतःचा पेरोल)",
                        "अंतर्गत (स्वतःचा पेरोल)",
                      )}
                    </option>
                    <option value="external">
                      {getText(
                        "External Company",
                        "बाह्य कंपनी",
                        "बाह्य कंपनी",
                      )}
                    </option>
                  </select>
                </div>
                {formData.payrollType === "external" && (
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#334155",
                        marginBottom: "6px",
                      }}
                    >
                      {getText("Company", "कंपनी", "कंपनी")}
                    </label>
                    <select
                      value={formData.company}
                      onChange={(e) =>
                        setFormData({ ...formData, company: e.target.value })
                      }
                      style={{
                        width: "100%",
                        padding: "12px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box",
                        backgroundColor: "white",
                      }}
                    >
                      <option value="">
                        {getText(
                          "Select company",
                          "कंपनी निवडा",
                          "कंपनी निवडा",
                        )}
                      </option>
                      {companies.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {!editingUser && (
                <div style={{ marginTop: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText("Password", "पासवर्ड", "पासवर्ड")}{" "}
                    <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder={getText(
                      "Minimum 8 characters",
                      "किमान 8 वर्ण",
                      "किमान 8 वर्ण",
                    )}
                    minLength={8}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#475569",
                      marginTop: "4px",
                    }}
                  >
                    {getText(
                      "Must be at least 8 characters long",
                      "किमान 8 वर्ण लांब असणे आवश्यक आहे",
                      "किमान 8 वर्ण लांब असणे आवश्यक आहे",
                    )}
                  </p>
                </div>
              )}

              <div style={{ marginTop: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  {getText("Role", "रोल", "रोल")}{" "}
                  <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  disabled={!formData.primaryProject}
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                    backgroundColor: !formData.primaryProject
                      ? "#f1f5f9"
                      : "white",
                    cursor: !formData.primaryProject
                      ? "not-allowed"
                      : "pointer",
                  }}
                >
                  <option value="">
                    {!formData.primaryProject
                      ? getText(
                          "⚠️ Select project first",
                          "⚠️ प्रथम प्रोजेक्ट निवडा",
                          "⚠️ प्रथम प्रोजेक्ट निवडा",
                        )
                      : getText("Select Role", "रोल निवडा", "रोल निवडा")}
                  </option>
                  {filteredRoles.map((role) => (
                    <option key={role._id} value={role._id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {!formData.primaryProject && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#ef4444",
                      marginTop: "4px",
                      fontStyle: "italic",
                    }}
                  >
                    {getText(
                      "Please select a project first to see available roles",
                      "उपलब्ध भूमिका पाहण्यासाठी कृपया प्रथम प्रोजेक्ट निवडा",
                      "उपलब्ध भूमिका पाहण्यासाठी कृपया प्रथम प्रोजेक्ट निवडा",
                    )}
                  </p>
                )}
                {formData.primaryProject && filteredRoles.length === 0 && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#f59e0b",
                      marginTop: "4px",
                      fontStyle: "italic",
                    }}
                  >
                    {getText(
                      "No roles configured for this project",
                      "या प्रोजेक्टसाठी कोणत्याही भूमिका कॉन्फिगर केल्या नाहीत",
                      "या प्रोजेक्टसाठी कोणत्याही भूमिका कॉन्फिगर केल्या नाहीत",
                    )}
                  </p>
                )}
              </div>

              {/* Multi-Project Assignment Section */}
              <div style={{ marginTop: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  {getText(
                    "Assigned Projects",
                    "नियुक्त प्रकल्प",
                    "नियुक्त प्रकल्प",
                  )}
                  {projects.length > 0 && (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        fontWeight: "normal",
                        marginLeft: "8px",
                      }}
                    >
                      ({projects.length}{" "}
                      {getText(
                        "projects available",
                        "प्रकल्प उपलब्ध",
                        "प्रकल्प उपलब्ध",
                      )}
                      )
                    </span>
                  )}
                </label>
                <div
                  style={{
                    maxHeight: "180px",
                    overflowY: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "8px",
                    backgroundColor: "white",
                  }}
                >
                  {projects && projects.length > 0 ? (
                    projects.map((project) => (
                      <label
                        key={project._id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "8px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          transition: "background-color 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#f1f5f9")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={formData.projects.includes(project._id)}
                          onChange={(e) => {
                            const projectId = project._id;
                            const newProjects = e.target.checked
                              ? [...formData.projects, projectId]
                              : formData.projects.filter(
                                  (id) => id !== projectId,
                                );

                            setFormData({
                              ...formData,
                              projects: newProjects,
                              // If unchecking the primary project, clear it
                              primaryProject:
                                !e.target.checked &&
                                formData.primaryProject === projectId
                                  ? newProjects.length > 0
                                    ? newProjects[0]
                                    : ""
                                  : formData.primaryProject,
                              // Clear role if primary project changes
                              role:
                                !e.target.checked &&
                                formData.primaryProject === projectId
                                  ? ""
                                  : formData.role,
                              // Clear centers if primary project changes
                              centers:
                                !e.target.checked &&
                                formData.primaryProject === projectId
                                  ? []
                                  : formData.centers,
                            });
                          }}
                          style={{
                            marginRight: "10px",
                            cursor: "pointer",
                            width: "16px",
                            height: "16px",
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <span
                            style={{
                              fontSize: "14px",
                              color: "#334155",
                              fontWeight: "500",
                            }}
                          >
                            {project.name}
                          </span>
                          {project.code && (
                            <span
                              style={{
                                fontSize: "12px",
                                color: "#475569",
                                marginLeft: "8px",
                              }}
                            >
                              ({project.code})
                            </span>
                          )}
                          {formData.primaryProject === project._id && (
                            <span
                              style={{
                                fontSize: "11px",
                                marginLeft: "8px",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                backgroundColor: "#eef2ff",
                                color: "#4338ca",
                                fontWeight: "500",
                              }}
                            >
                              {getText("Primary", "प्राथमिक", "प्राथमिक")}
                            </span>
                          )}
                        </div>
                      </label>
                    ))
                  ) : (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#9ca3af",
                        fontStyle: "italic",
                        margin: 0,
                        padding: "8px",
                      }}
                    >
                      {getText(
                        "No projects available",
                        "कोणतेही प्रकल्प उपलब्ध नाहीत",
                        "कोणतेही प्रकल्प उपलब्ध नाहीत",
                      )}
                    </p>
                  )}
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#475569",
                    marginTop: "6px",
                    fontStyle: "italic",
                  }}
                >
                  💡{" "}
                  {getText(
                    "Users can be assigned to multiple projects. Select a primary project above for role and center filtering.",
                    "वापरकर्त्यांना एकाधिक प्रकल्प नियुक्त केले जाऊ शकतात. भूमिका आणि केंद्र फिल्टरिंगसाठी वर एक प्राथमिक प्रकल्प निवडा.",
                    "वापरकर्त्यांना एकाधिक प्रकल्प नियुक्त केले जाऊ शकतात. भूमिका आणि केंद्र फिल्टरिंगसाठी वर एक प्राथमिक प्रकल्प निवडा.",
                  )}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "14px",
                  marginTop: "16px",
                }}
              >
                {/* Department mapping — one dropdown per selected project */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "8px",
                    }}
                  >
                    {getText(
                      "Department (per project)",
                      "विभाग (प्रकल्पानुसार)",
                      "विभाग (प्रकल्पानुसार)",
                    )}
                  </label>
                  {formData.projects.length === 0 ? (
                    <p
                      style={{ fontSize: "12px", color: "#9ca3af", margin: 0 }}
                    >
                      {getText(
                        "Select projects above to map departments",
                        "विभाग मॅप करण्यासाठी वर प्रकल्प निवडा",
                        "विभाग मॅप करण्यासाठी वर प्रकल्प निवडा",
                      )}
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {formData.projects.map((projectId) => {
                        const project = projects.find(
                          (p) => p._id === projectId,
                        );
                        const depts = departmentsByProject[projectId] || [];
                        return (
                          <div
                            key={projectId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "8px 10px",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              background: "#ffffff",
                            }}
                          >
                            <span
                              style={{
                                minWidth: isMobileViewport ? "120px" : "200px",
                                fontSize: "13px",
                                color: "#334155",
                                fontWeight: "500",
                              }}
                            >
                              {project?.name || projectId}
                              {projectId === formData.primaryProject && (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    marginLeft: "6px",
                                    padding: "1px 6px",
                                    borderRadius: "10px",
                                    backgroundColor: "#eef2ff",
                                    color: "#4338ca",
                                  }}
                                >
                                  {getText("Primary", "प्राथमिक", "प्राथमिक")}
                                </span>
                              )}
                            </span>
                            <select
                              value={
                                formData.projectDepartments[projectId] || ""
                              }
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  projectDepartments: {
                                    ...prev.projectDepartments,
                                    [projectId]: e.target.value,
                                  },
                                }))
                              }
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                border: "1px solid #e2e8f0",
                                borderRadius: "6px",
                                fontSize: "14px",
                                outline: "none",
                                background: "white",
                              }}
                            >
                              <option value="">— None —</option>
                              {depts.map((d) => (
                                <option key={d._id} value={d._id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    {getText("Designation", "पदनाम", "पदनाम")}
                  </label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) =>
                      setFormData({ ...formData, designation: e.target.value })
                    }
                    placeholder={getText(
                      "Enter designation",
                      "पदनाम लिहा",
                      "पदनाम लिहा",
                    )}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                      background: "#ffffff",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: "16px",
                  padding: "14px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  background: "#ffffff",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  {getText(
                    "Reporting Manager",
                    "रिपोर्टिंग मॅनेजर",
                    "रिपोर्टिंग मॅनेजर",
                  )}
                  {filteredReportingManagers.length > 0 && (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        fontWeight: "normal",
                        marginLeft: "8px",
                      }}
                    >
                      ({filteredReportingManagers.length}{" "}
                      {getText("available", "उपलब्ध", "उपलब्ध")})
                    </span>
                  )}
                </label>
                <select
                  value={formData.reportingManager}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      reportingManager: e.target.value,
                    })
                  }
                  disabled={
                    !formData.primaryProject &&
                    (!editingUser ||
                      !editingUser.projects ||
                      editingUser.projects.length === 0)
                  }
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                    backgroundColor:
                      !formData.primaryProject &&
                      (!editingUser ||
                        !editingUser.projects ||
                        editingUser.projects.length === 0)
                        ? "#f1f5f9"
                        : "white",
                    cursor:
                      !formData.primaryProject &&
                      (!editingUser ||
                        !editingUser.projects ||
                        editingUser.projects.length === 0)
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  <option value="">
                    {getText(
                      "Select Reporting Manager (Optional)",
                      "रिपोर्टिंग मॅनेजर निवडा (वैकल्पिक)",
                      "रिपोर्टिंग मॅनेजर निवडा (वैकल्पिक)",
                    )}
                  </option>
                  {filteredReportingManagers.map((user) => {
                    // Determine display format based on center mapping
                    const roleName = user.role?.name || "No Role";
                    const hasCenter =
                      user.centers &&
                      Array.isArray(user.centers) &&
                      user.centers.length > 0;

                    let displayText = `${user.firstName} ${user.lastName} - ${roleName}`;

                    if (hasCenter && user.centers) {
                      // Get center names (show first center, indicate if more exist)
                      const firstCenter = user.centers![0];
                      const centerName =
                        typeof firstCenter === "string"
                          ? firstCenter
                          : firstCenter?.centerName || "Center";
                      const additionalCount = user.centers!.length - 1;

                      displayText += ` - ${centerName}`;
                      if (additionalCount > 0) {
                        displayText += ` (+${additionalCount})`;
                      }
                    }

                    return (
                      <option key={user._id} value={user._id}>
                        {displayText}
                      </option>
                    );
                  })}
                </select>
                {!formData.primaryProject && !editingUser && (
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#475569",
                      marginTop: "4px",
                    }}
                  >
                    ℹ️{" "}
                    {getText(
                      "Please select Primary Project above to see available managers",
                      "उपलब्ध प्रबंधकों को देखने के लिए कृपया ऊपर प्राथमिक प्रोजेक्ट चुनें",
                      "उपलब्ध व्यवस्थापक पाहण्यासाठी कृपया वरील प्राथमिक प्रकल्प निवडा",
                    )}
                  </p>
                )}
              </div>

              {/* Center Assignment - Multi-select with checkboxes */}
              <div
                style={{
                  marginTop: "16px",
                  padding: "14px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  background: "#ffffff",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  {getText(
                    "Assigned Centers (Offline Module)",
                    "नियुक्त केंद्रे (ऑफलाइन मॉड्यूल)",
                    "नियुक्त केंद्रे (ऑफलाइन मॉड्यूल)",
                  )}
                  {formData.primaryProject && filteredCenters.length > 0 && (
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        fontWeight: "normal",
                        marginLeft: "8px",
                      }}
                    >
                      ({filteredCenters.length}{" "}
                      {getText(
                        "centers available",
                        "केंद्रे उपलब्ध",
                        "केंद्रे उपलब्ध",
                      )}
                      )
                    </span>
                  )}
                </label>
                <div
                  style={{
                    maxHeight: "200px",
                    overflowY: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "8px",
                    backgroundColor: !formData.primaryProject
                      ? "#f1f5f9"
                      : "white",
                  }}
                >
                  {!formData.primaryProject ? (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#9ca3af",
                        fontStyle: "italic",
                        margin: 0,
                        padding: "8px",
                      }}
                    >
                      ⚠️{" "}
                      {getText(
                        "Select project first",
                        "प्रथम प्रोजेक्ट निवडा",
                        "प्रथम प्रोजेक्ट निवडा",
                      )}
                    </p>
                  ) : filteredCenters && filteredCenters.length > 0 ? (
                    filteredCenters.map((center) => (
                      <label
                        key={center._id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "8px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          transition: "background-color 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#f1f5f9")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={formData.centers.includes(center._id)}
                          onChange={(e) => {
                            const centerId = center._id;
                            setFormData({
                              ...formData,
                              centers: e.target.checked
                                ? [...formData.centers, centerId]
                                : formData.centers.filter(
                                    (id) => id !== centerId,
                                  ),
                            });
                          }}
                          style={{
                            marginRight: "10px",
                            cursor: "pointer",
                            width: "16px",
                            height: "16px",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "14px",
                            color: "#334155",
                            flex: 1,
                          }}
                        >
                          {center.centerName} - {center.city}, {center.state}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#9ca3af",
                        fontStyle: "italic",
                        margin: 0,
                        padding: "8px",
                      }}
                    >
                      {getText(
                        "No centers configured for this project",
                        "या प्रोजेक्टसाठी कोणतेही केंद्रे कॉन्फिगर केलेले नाहीत",
                        "या प्रोजेक्टसाठी कोणतेही केंद्रे कॉन्फिगर केलेले नाहीत",
                      )}
                    </p>
                  )}
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#475569",
                    marginTop: "6px",
                    fontStyle: "italic",
                  }}
                >
                  💡{" "}
                  {getText(
                    "Users can be assigned to multiple centers for offline ticket management",
                    "ऑफलाइन तिकीट व्यवस्थापनासाठी वापरकर्त्यांना एकाधिक केंद्रे नियुक्त केली जाऊ शकतात",
                    "ऑफलाइन तिकीट व्यवस्थापनासाठी वापरकर्त्यांना एकाधिक केंद्रे नियुक्त केली जाऊ शकतात",
                  )}
                </p>
              </div>
            </div>

            <div
              style={{
                padding: isMobileViewport ? "12px" : "14px 24px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                background: "#ffffff",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => setShowUserModal(false)}
                disabled={saving}
                style={{
                  padding: "10px 18px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  backgroundColor: "white",
                  color: "#334155",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {getText("Cancel", "रद्द करा", "रद्द करा")}
              </button>
              <button
                onClick={handleSaveUser}
                disabled={
                  saving ||
                  !formData.firstName ||
                  !formData.lastName ||
                  !formData.email ||
                  !formData.role
                }
                style={{
                  padding: "10px 18px",
                  border: "none",
                  borderRadius: "8px",
                  background:
                    !formData.firstName ||
                    !formData.lastName ||
                    !formData.email ||
                    !formData.role ||
                    saving
                      ? "#cbd5e1"
                      : "linear-gradient(160deg, #4f46e5, #4338ca)",
                  boxShadow:
                    !formData.firstName ||
                    !formData.lastName ||
                    !formData.email ||
                    !formData.role ||
                    saving
                      ? "none"
                      : "0 4px 14px rgba(67,56,202,.35)",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor:
                    !formData.firstName ||
                    !formData.lastName ||
                    !formData.email ||
                    !formData.role ||
                    saving
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {saving
                  ? getText("Saving...", "जतन करत आहे...", "जतन करत आहे...")
                  : editingUser
                    ? getText(
                        "Update User",
                        "वापरकर्ता अद्यतनित करा",
                        "वापरकर्ता अद्यतनित करा",
                      )
                    : getText(
                        "Create User",
                        "वापरकर्ता तयार करा",
                        "वापरकर्ता तयार करा",
                      )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkUploadModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,23,42,.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              maxWidth: "720px",
              width: "100%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <h2
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {getText(
                  "Bulk Upload Users",
                  "बल्क वापरकर्ता अपलोड",
                  "बल्क वापरकर्ता अपलोड",
                )}
              </h2>
              <button
                onClick={() => {
                  setShowBulkUploadModal(false);
                  setBulkUploadFile(null);
                  setBulkUploadResults(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#475569",
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
              {/* Step 1: Download Template */}
              <div
                style={{
                  marginBottom: "24px",
                  padding: "20px",
                  backgroundColor: "#eef2ff",
                  borderRadius: "8px",
                  border: "1px solid #c7d2fe",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: "#4f46e5",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: "bold",
                      flexShrink: 0,
                    }}
                  >
                    1
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "15px",
                      color: "#0f172a",
                    }}
                  >
                    {getText(
                      "Download Template",
                      "टेम्पलेट डाउनलोड करा",
                      "टेम्पलेट डाउनलोड करा",
                    )}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#475569",
                    margin: "0 0 12px 40px",
                  }}
                >
                  {getText(
                    "Download the Excel template, fill in user details, and upload it back. The template includes reference sheets for valid Role Codes and Project Codes.",
                    "एक्सेल टेम्पलेट डाउनलोड करा, वापरकर्ता तपशील भरा आणि ते परत अपलोड करा.",
                    "एक्सेल टेम्पलेट डाउनलोड करा, वापरकर्ता तपशील भरा आणि ते परत अपलोड करा.",
                  )}
                </p>
                <div style={{ marginLeft: "40px" }}>
                  <button
                    onClick={handleDownloadTemplate}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 16px",
                      background: "linear-gradient(160deg, #4f46e5, #4338ca)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(67,56,202,.35)",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {getText(
                      "Download Template (.xlsx)",
                      "टेम्पलेट डाउनलोड (.xlsx)",
                      "टेम्पलेट डाउनलोड (.xlsx)",
                    )}
                  </button>
                </div>
              </div>

              {/* Step 2: Upload File */}
              <div
                style={{
                  marginBottom: "24px",
                  padding: "20px",
                  backgroundColor: "#fefce8",
                  borderRadius: "8px",
                  border: "1px solid #fde68a",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: "#f59e0b",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: "bold",
                      flexShrink: 0,
                    }}
                  >
                    2
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "15px",
                      color: "#0f172a",
                    }}
                  >
                    {getText(
                      "Upload Filled Template",
                      "भरलेला टेम्पलेट अपलोड करा",
                      "भरलेला टेम्पलेट अपलोड करा",
                    )}
                  </span>
                </div>
                <div style={{ marginLeft: "40px" }}>
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setBulkUploadFile(e.target.files[0]);
                        setBulkUploadResults(null);
                      }
                    }}
                  />
                  <div
                    onClick={() => bulkFileInputRef.current?.click()}
                    style={{
                      border: "2px dashed #e2e8f0",
                      borderRadius: "8px",
                      padding: "24px",
                      textAlign: "center",
                      cursor: "pointer",
                      backgroundColor: bulkUploadFile ? "#f0fdf4" : "#f8fafc",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {bulkUploadFile ? (
                      <div>
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ margin: "0 auto 8px" }}
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <polyline points="9 15 12 12 15 15" />
                        </svg>
                        <p
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#10b981",
                            margin: 0,
                          }}
                        >
                          {bulkUploadFile.name}
                        </p>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#475569",
                            margin: "4px 0 0",
                          }}
                        >
                          {(bulkUploadFile.size / 1024).toFixed(1)} KB -{" "}
                          {getText(
                            "Click to change",
                            "बदलण्यासाठी क्लिक करा",
                            "बदलण्यासाठी क्लिक करा",
                          )}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#9ca3af"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ margin: "0 auto 8px" }}
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <p
                          style={{
                            fontSize: "14px",
                            color: "#475569",
                            margin: 0,
                          }}
                        >
                          {getText(
                            "Click to select Excel file (.xlsx)",
                            "एक्सेल फाइल (.xlsx) निवडण्यासाठी क्लिक करा",
                            "एक्सेल फाइल (.xlsx) निवडण्यासाठी क्लिक करा",
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Results */}
              {bulkUploadResults && (
                <div
                  style={{
                    padding: "20px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "#0f172a",
                      margin: "0 0 12px",
                    }}
                  >
                    {getText("Upload Results", "अपलोड निकाल", "अपलोड निकाल")}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      gap: "16px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 20px",
                        backgroundColor: "#f0fdf4",
                        borderRadius: "8px",
                        flex: 1,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "24px",
                          fontWeight: "bold",
                          color: "#10b981",
                        }}
                      >
                        {bulkUploadResults.created}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>
                        {getText("Created", "तयार केले", "तयार केले")}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "12px 20px",
                        backgroundColor: "#fef2f2",
                        borderRadius: "8px",
                        flex: 1,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "24px",
                          fontWeight: "bold",
                          color: "#ef4444",
                        }}
                      >
                        {bulkUploadResults.failed}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>
                        {getText("Failed", "अयशस्वी", "अयशस्वी")}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "12px 20px",
                        backgroundColor: "#eef2ff",
                        borderRadius: "8px",
                        flex: 1,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "24px",
                          fontWeight: "bold",
                          color: "#4f46e5",
                        }}
                      >
                        {bulkUploadResults.total}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>
                        {getText("Total", "एकूण", "एकूण")}
                      </div>
                    </div>
                  </div>

                  {/* Failed rows detail */}
                  {bulkUploadResults.results.filter(
                    (r) => r.status === "failed",
                  ).length > 0 && (
                    <div>
                      <h4
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#ef4444",
                          marginBottom: "8px",
                        }}
                      >
                        {getText(
                          "Failed Rows:",
                          "अयशस्वी पंक्ती:",
                          "अयशस्वी पंक्ती:",
                        )}
                      </h4>
                      <div
                        style={{
                          maxHeight: "200px",
                          overflowY: "auto",
                          border: "1px solid #fecaca",
                          borderRadius: "6px",
                        }}
                      >
                        <table
                          style={{
                            width: "100%",
                            fontSize: "12px",
                            borderCollapse: "collapse",
                          }}
                        >
                          <thead>
                            <tr style={{ backgroundColor: "#fef2f2" }}>
                              <th
                                style={{
                                  padding: "8px",
                                  textAlign: "left",
                                  borderBottom: "1px solid #fecaca",
                                }}
                              >
                                Row
                              </th>
                              <th
                                style={{
                                  padding: "8px",
                                  textAlign: "left",
                                  borderBottom: "1px solid #fecaca",
                                }}
                              >
                                Email
                              </th>
                              <th
                                style={{
                                  padding: "8px",
                                  textAlign: "left",
                                  borderBottom: "1px solid #fecaca",
                                }}
                              >
                                Error
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkUploadResults.results
                              .filter((r) => r.status === "failed")
                              .map((r, i) => (
                                <tr
                                  key={i}
                                  style={{ borderBottom: "1px solid #fee2e2" }}
                                >
                                  <td style={{ padding: "6px 8px" }}>
                                    {r.row}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {r.email}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 8px",
                                      color: "#dc2626",
                                    }}
                                  >
                                    {r.error}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => {
                  setShowBulkUploadModal(false);
                  setBulkUploadFile(null);
                  setBulkUploadResults(null);
                }}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  backgroundColor: "white",
                  color: "#334155",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                {getText("Close", "बंद करा", "बंद करा")}
              </button>
              <button
                onClick={handleBulkUpload}
                disabled={!bulkUploadFile || bulkUploading}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor:
                    !bulkUploadFile || bulkUploading ? "#e2e8f0" : "#f59e0b",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor:
                    !bulkUploadFile || bulkUploading
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {bulkUploading
                  ? getText(
                      "Uploading...",
                      "अपलोड करत आहे...",
                      "अपलोड करत आहे...",
                    )
                  : getText(
                      "Upload & Create Users",
                      "अपलोड आणि वापरकर्ते तयार करा",
                      "अपलोड आणि वापरकर्ते तयार करा",
                    )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add from HRMS Modal */}
      {showHRMSModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.52)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
            overflowY: "auto",
          }}
        >
          <style>
            {`
              .hrms-modal-scroll {
                scrollbar-width: thin;
                scrollbar-color: #cbd5e1 transparent;
              }
              .hrms-modal-scroll::-webkit-scrollbar {
                width: 10px;
                height: 10px;
              }
              .hrms-modal-scroll::-webkit-scrollbar-track {
                background: transparent;
              }
              .hrms-modal-scroll::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 999px;
                border: 2px solid transparent;
                background-clip: padding-box;
              }
              .hrms-modal-scroll::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
                background-clip: padding-box;
              }
            `}
          </style>
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "20px",
              maxWidth: "1120px",
              width: "100%",
              height: "min(900px, calc(100vh - 40px))",
              maxHeight: "calc(100vh - 40px)",
              display: "flex",
              flexDirection: "column",
              margin: "auto",
              border: "1px solid #e2e8f0",
              boxShadow:
                "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "22px 28px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
                background:
                  "linear-gradient(180deg, rgba(255,247,237,0.8) 0%, rgba(255,255,255,1) 100%)",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "24px",
                    fontWeight: "700",
                    color: "#0f172a",
                    margin: 0,
                    lineHeight: 1.1,
                  }}
                >
                  {getText(
                    "Add Users from HRMS",
                    "HRMS मधून वापरकर्ते जोडा",
                    "HRMS मधून वापरकर्ते जोडा",
                  )}
                </h2>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: "13px",
                    color: "#475569",
                  }}
                >
                  Search, preview, map fields, and import HRMS employees.
                </p>
              </div>
              <button
                onClick={closeHrmsModal}
                aria-label="Close HRMS import modal"
                title="Close"
                style={{
                  background: "none",
                  border: "1px solid #e2e8f0",
                  width: "40px",
                  height: "40px",
                  borderRadius: "999px",
                  fontSize: "24px",
                  lineHeight: 1,
                  cursor: "pointer",
                  color: "#475569",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {hrmsEmployees.length === 0 ? (
              <div
                className="hrms-modal-scroll"
                style={{
                  padding: "32px",
                  overflowY: "auto",
                }}
              >
                <p
                  style={{
                    fontSize: "14px",
                    color: "#475569",
                    marginBottom: "20px",
                    textAlign: "center",
                  }}
                >
                  {getText(
                    "Enter employee code(s) or load all employees from HRMS (PeopleStrong)",
                    "कर्मचारी कोड प्रविष्ट करा किंवा HRMS (PeopleStrong) मधून सर्व कर्मचारी लोड करा",
                    "कर्मचारी कोड प्रविष्ट करा किंवा HRMS (PeopleStrong) मधून सर्व कर्मचारी लोड करा",
                  )}
                </p>

                <div style={{ maxWidth: "600px", margin: "0 auto" }}>
                  {/* MDM Source selector (provenance) */}
                  <div style={{ marginBottom: "20px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#334155",
                        marginBottom: "8px",
                      }}
                    >
                      🗄️{" "}
                      {getText(
                        "MDM Data Source",
                        "MDM डेटा स्रोत",
                        "MDM डेटा स्रोत",
                      )}
                    </label>
                    <select
                      value={selectedMdmSource}
                      onChange={(e) => setSelectedMdmSource(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box",
                        backgroundColor: "white",
                      }}
                    >
                      {mdmSources.length === 0 ? (
                        <option value="">
                          {getText(
                            "No MDM source configured — using sample data",
                            "कोणताही MDM स्रोत कॉन्फिगर केलेला नाही — नमुना डेटा वापरत आहे",
                            "कोणताही MDM स्रोत कॉन्फिगर केलेला नाही — नमुना डेटा वापरत आहे",
                          )}
                        </option>
                      ) : (
                        mdmSources.map((s) => (
                          <option
                            key={s._id}
                            value={s._id}
                            disabled={!s.enabled}
                          >
                            {s.name}
                            {!s.enabled ? " (disabled)" : ""}
                          </option>
                        ))
                      )}
                    </select>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        marginTop: "4px",
                      }}
                    >
                      {getText(
                        "Imported employees are tagged with this source.",
                        "आयात केलेले कर्मचारी या स्रोतासह टॅग केले जातात.",
                        "आयात केलेले कर्मचारी या स्रोतासह टॅग केले जातात.",
                      )}
                    </p>
                  </div>

                  {/* Employee Code Input */}
                  <div style={{ marginBottom: "20px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#334155",
                        marginBottom: "8px",
                      }}
                    >
                      {getText(
                        "Search Employees",
                        "कर्मचारी शोधा",
                        "कर्मचारी शोधा",
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder={getText(
                        "Search by name, code, designation, or department",
                        "नाव, कोड, पदनाम किंवा विभागाद्वारे शोधा",
                        "नाव, कोड, पदनाम किंवा विभागाद्वारे शोधा",
                      )}
                      value={hrmsEmployeeCodes}
                      onChange={(e) => setHrmsEmployeeCodes(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#475569",
                        marginTop: "4px",
                      }}
                    >
                      {getText(
                        '💡 Tip: Enter search term (e.g., "District Coordinator", "EMP001", "ICT") or leave blank to load all',
                        '💡 सूचना: शोध शब्द प्रविष्ट करा (उदा., "District Coordinator", "EMP001", "ICT") किंवा सर्व लोड करण्यासाठी रिक्त सोडा',
                        '💡 सूचना: शोध शब्द प्रविष्ट करा (उदा., "District Coordinator", "EMP001", "ICT") किंवा सर्व लोड करण्यासाठी रिक्त सोडा',
                      )}
                    </p>
                  </div>

                  <div
                    style={{
                      marginBottom: "20px",
                      padding: "14px",
                      border: "1px solid #eef2ff",
                      borderRadius: 14,
                      background: "#eef2ff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#475569",
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          People in source
                        </div>
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 800,
                            color: "#4f46e5",
                            lineHeight: 1.1,
                          }}
                        >
                          {hrmsLoadMeta?.totalAvailable ?? "Loading..."}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          padding: 4,
                          borderRadius: 12,
                          background: "white",
                          border: "1px solid #e2e8f0",
                          gap: 4,
                        }}
                      >
                        {(["all", "range"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setHrmsLoadMode(mode)}
                            style={{
                              border: "none",
                              borderRadius: 9,
                              padding: "8px 12px",
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 700,
                              color:
                                hrmsLoadMode === mode ? "white" : "#4f46e5",
                              background:
                                hrmsLoadMode === mode ? "#4f46e5" : "white",
                            }}
                          >
                            {mode === "all" ? "All people" : "Range"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {hrmsLoadMode === "range" && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: 10,
                        }}
                      >
                        <label
                          style={{
                            fontSize: 12,
                            color: "#334155",
                            fontWeight: 700,
                          }}
                        >
                          Start row
                          <input
                            type="number"
                            min={1}
                            value={hrmsRangeStart}
                            onChange={(e) => setHrmsRangeStart(e.target.value)}
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              marginTop: 6,
                              padding: "10px 12px",
                              border: "1px solid #c7d2fe",
                              borderRadius: 10,
                              fontSize: 14,
                              outline: "none",
                              background: "white",
                            }}
                          />
                        </label>
                        <label
                          style={{
                            fontSize: 12,
                            color: "#334155",
                            fontWeight: 700,
                          }}
                        >
                          End row
                          <input
                            type="number"
                            min={1}
                            value={hrmsRangeEnd}
                            onChange={(e) => setHrmsRangeEnd(e.target.value)}
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              marginTop: 6,
                              padding: "10px 12px",
                              border: "1px solid #c7d2fe",
                              borderRadius: 10,
                              fontSize: 14,
                              outline: "none",
                              background: "white",
                            }}
                          />
                        </label>
                        <div
                          style={{
                            alignSelf: "end",
                            fontSize: 12,
                            color: "#475569",
                            padding: "10px 0",
                          }}
                        >
                          Loads rows {Math.max(1, Number(hrmsRangeStart) || 1)}-
                          {Math.max(
                            Math.max(1, Number(hrmsRangeStart) || 1),
                            Number(hrmsRangeEnd) || 1,
                          )}
                        </div>
                      </div>
                    )}
                    <p
                      style={{
                        margin: hrmsLoadMode === "range" ? "8px 0 0" : 0,
                        color: "#64748b",
                        fontSize: 12,
                      }}
                    >
                      Count is exact when MDM API returns total metadata. If the
                      source only returns one page, this shows rows returned by
                      that source.
                    </p>
                  </div>

                  {/* Load Button */}
                  <div style={{ textAlign: "center" }}>
                    <button
                      onClick={handleFetchFromHRMS}
                      disabled={hrmsLoading}
                      style={{
                        padding: "12px 32px",
                        backgroundColor: "#f97316",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: "500",
                        cursor: hrmsLoading ? "not-allowed" : "pointer",
                        opacity: hrmsLoading ? 0.5 : 1,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span>🔍</span>
                      {hrmsLoading
                        ? getText(
                            "Loading...",
                            "लोड करत आहे...",
                            "लोड करत आहे...",
                          )
                        : getText(
                            "Load Employees from HRMS",
                            "HRMS मधून कर्मचारी लोड करा",
                            "HRMS मधून कर्मचारी लोड करा",
                          )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Search and Selection Controls - Fixed Header */}
                <div
                  style={{
                    display: hrmsImportStep === "employees" ? "block" : "none",
                    padding: "18px 24px 14px",
                    borderBottom: "1px solid #e2e8f0",
                    flexShrink: 0,
                    background: "#ffffff",
                  }}
                >
                  {/* Search box */}
                  <div
                    style={{
                      position: "relative",
                      marginBottom: "16px",
                      padding: "14px",
                      border: "1px solid #e2e8f0",
                      borderRadius: 14,
                      background: "#f8fafc",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "26px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#9ca3af",
                        fontSize: "18px",
                      }}
                    >
                      🔍
                    </span>
                    <input
                      type="text"
                      placeholder={getText(
                        "Search by name, email, or employee code...",
                        "नाव, ईमेल किंवा कर्मचारी कोडद्वारे शोधा...",
                        "नाव, ईमेल किंवा कर्मचारी कोडद्वारे शोधा...",
                      )}
                      value={hrmsSearchQuery}
                      onChange={(e) => {
                        setHrmsSearchQuery(e.target.value);
                        setHrmsPage(1);
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 12px 12px 40px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box",
                        background: "white",
                      }}
                    />
                  </div>

                  {/* Preset bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: "10px",
                      padding: "8px 10px",
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                      borderRadius: 12,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#c2410c" }}>
                      💾 {getText("Preset", "प्रीसेट", "प्रीसेट")}
                    </span>
                    <select
                      value={presetName}
                      onChange={(e) => applyPreset(e.target.value)}
                      style={{
                        padding: "6px 8px",
                        border: "1px solid #e2e8f0",
                        borderRadius: 6,
                        fontSize: 13,
                        background: "white",
                        minWidth: 140,
                      }}
                    >
                      {(presets.length
                        ? presets.map((p) => p.name)
                        : ["Default"]
                      )
                        .filter((n, i, a) => a.indexOf(n) === i)
                        .map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => saveFieldConfig()}
                      disabled={cfgSaving}
                      style={{
                        padding: "6px 12px",
                        background: "#10b981",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: cfgSaving ? "not-allowed" : "pointer",
                      }}
                    >
                      {cfgSaving ? "Saving…" : getText("Save", "जतन करा", "जतन करा")}
                    </button>
                    <button
                      onClick={saveAsPreset}
                      style={{
                        padding: "6px 12px",
                        background: "white",
                        color: "#334155",
                        border: "1px solid #e2e8f0",
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {getText("Save As…", "असे जतन करा…", "असे जतन करा…")}
                    </button>
                    <button
                      onClick={deletePreset}
                      disabled={!presets.some((p) => p.name === presetName)}
                      style={{
                        padding: "6px 12px",
                        background: "white",
                        color: "#dc2626",
                        border: "1px solid #fecaca",
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: "pointer",
                        opacity: presets.some((p) => p.name === presetName)
                          ? 1
                          : 0.5,
                      }}
                    >
                      {getText("Delete", "हटवा", "हटवा")}
                    </button>
                    {cfgMsg && (
                      <span
                        style={{
                          fontSize: 12,
                          color: cfgMsg.includes("✓") ? "#059669" : "#475569",
                        }}
                      >
                        {cfgMsg}
                      </span>
                    )}
                  </div>

                  {/* Selection + field toolbar */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: "12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#334155",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      {getText("Selected", "निवडले", "निवडले")}:{" "}
                      <span style={{ color: "#4f46e5", fontWeight: "600" }}>
                        {selectedEmployees.length}
                      </span>{" "}
                      / {hrmsFiltered.length}
                      {hrmsLoadMeta && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#4f46e5",
                            background: "#eef2ff",
                            border: "1px solid #c7d2fe",
                            borderRadius: 9999,
                            padding: "4px 10px",
                          }}
                        >
                          Total {hrmsLoadMeta.totalAvailable}
                        </span>
                      )}
                      {hrmsLoadMeta && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#475569",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: 9999,
                            padding: "4px 10px",
                          }}
                        >
                          Loaded {hrmsLoadMeta.loadedCount}
                          {hrmsLoadMeta.loadMode === "range" &&
                          hrmsLoadMeta.rangeStart &&
                          hrmsLoadMeta.rangeEnd
                            ? ` (${hrmsLoadMeta.rangeStart}-${hrmsLoadMeta.rangeEnd})`
                            : ""}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: 9999,
                          padding: "4px 10px",
                        }}
                      >
                        Ready {hrmsSelectableCodes.length}
                      </span>
                      {hrmsImportedCount > 0 && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "#166534",
                            background: "#ecfdf5",
                            border: "1px solid #bbf7d0",
                            borderRadius: 9999,
                            padding: "4px 10px",
                          }}
                        >
                          Imported {hrmsImportedCount}
                        </span>
                      )}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        onClick={() => {
                          setHrmsEmployees([]);
                          setSelectedEmployees([]);
                          setHrmsSearchQuery("");
                          setHrmsImportStep("employees");
                        }}
                        style={hrmsToolbarButtonStyle(false)}
                      >
                        Change load
                      </button>
                      <button
                        onClick={() => setShowColPicker((v) => !v)}
                        style={hrmsToolbarButtonStyle(showColPicker)}
                      >
                        🧩 {getText("Columns", "स्तंभ", "स्तंभ")} (
                        {selectedCols.length})
                      </button>
                      <button
                        onClick={() => setShowMapping((v) => !v)}
                        style={hrmsToolbarButtonStyle(showMapping)}
                      >
                        🔗 {getText("Field Mapping", "फील्ड मॅपिंग", "फील्ड मॅपिंग")}
                      </button>
                      <button
                        onClick={() => setShowPreview((v) => !v)}
                        style={hrmsToolbarButtonStyle(showPreview)}
                      >
                        👁 {getText("Preview", "पूर्वावलोकन", "पूर्वावलोकन")}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedEmployees(
                            hrmsAllSelectableSelected &&
                              hrmsSelectableCodes.length > 0
                              ? []
                              : hrmsSelectableCodes,
                          );
                        }}
                        style={{
                          padding: "9px 16px",
                          backgroundColor: hrmsAllSelectableSelected
                            ? "#ea580c"
                            : "#f97316",
                          color: "white",
                          border: "none",
                          borderRadius: "10px",
                          fontSize: "14px",
                          fontWeight: "600",
                          cursor: "pointer",
                          boxShadow: "0 8px 18px rgba(249, 115, 22, 0.18)",
                        }}
                      >
                        {hrmsAllSelectableSelected && selectedEmployees.length > 0
                          ? getText("✓ Deselect All", "✓ सर्व अनिवडा", "✓ सर्व अनिवडा")
                          : getText("Select All", "सर्व निवडा", "सर्व निवडा")}
                      </button>
                    </div>
                  </div>

                  {/* Column picker */}
                  {showColPicker && (
                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 12,
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#334155",
                          marginBottom: 8,
                        }}
                      >
                        {getText(
                          "Choose columns to display",
                          "दाखवायचे स्तंभ निवडा",
                          "दाखवायचे स्तंभ निवडा",
                        )}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(220px, 1fr) auto",
                          gap: 10,
                          alignItems: "center",
                          marginBottom: 12,
                        }}
                      >
                        <div style={{ position: "relative" }}>
                          <span
                            style={{
                              position: "absolute",
                              left: 12,
                              top: "50%",
                              transform: "translateY(-50%)",
                              color: "#94a3b8",
                              fontSize: 13,
                              fontWeight: 700,
                              pointerEvents: "none",
                            }}
                          >
                            Search
                          </span>
                          <input
                            type="text"
                            value={hrmsColumnSearch}
                            onChange={(e) =>
                              setHrmsColumnSearch(e.target.value)
                            }
                            placeholder="Search columns by field name..."
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              padding: "10px 40px 10px 64px",
                              border: "1px solid #e2e8f0",
                              borderRadius: 12,
                              background: "white",
                              color: "#0f172a",
                              fontSize: 13,
                              outline: "none",
                            }}
                          />
                          {hrmsColumnSearch && (
                            <button
                              type="button"
                              onClick={() => setHrmsColumnSearch("")}
                              style={{
                                position: "absolute",
                                right: 8,
                                top: "50%",
                                transform: "translateY(-50%)",
                                border: "none",
                                background: "#f1f5f9",
                                color: "#475569",
                                borderRadius: 999,
                                width: 24,
                                height: 24,
                                cursor: "pointer",
                                lineHeight: "24px",
                                fontSize: 12,
                              }}
                              aria-label="Clear column search"
                            >
                              x
                            </button>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {hrmsVisibleFields.length} of {hrmsFields.length}{" "}
                          fields
                        </span>
                      </div>
                      <div
                        className="hrms-modal-scroll"
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 10,
                          maxHeight: 156,
                          overflowY: "auto",
                          paddingRight: 4,
                        }}
                      >
                        {hrmsFields.length === 0 ? (
                          <span style={{ fontSize: 12, color: "#9ca3af" }}>
                            {getText(
                              "Load employees to discover fields.",
                              "फील्ड शोधण्यासाठी कर्मचारी लोड करा.",
                              "फील्ड शोधण्यासाठी कर्मचारी लोड करा.",
                            )}
                          </span>
                        ) : hrmsVisibleFields.length === 0 ? (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#64748b",
                              background: "white",
                              border: "1px dashed #cbd5e1",
                              borderRadius: 12,
                              padding: "12px 14px",
                              width: "100%",
                              textAlign: "center",
                            }}
                          >
                            No columns match "{hrmsColumnSearch}".
                          </span>
                        ) : (
                          hrmsVisibleFields.map((f) => (
                            <label
                              key={f}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                color: "#334155",
                                cursor: "pointer",
                                padding: "6px 10px",
                                borderRadius: 9999,
                                background: selectedCols.includes(f)
                                  ? "#ffedd5"
                                  : "white",
                                border: `1px solid ${
                                  selectedCols.includes(f)
                                    ? "#fdba74"
                                    : "#e2e8f0"
                                }`,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedCols.includes(f)}
                                onChange={() =>
                                  setSelectedCols((p) =>
                                    p.includes(f)
                                      ? p.filter((x) => x !== f)
                                      : [...p, f],
                                  )
                                }
                              />
                              {f}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Import field mapping */}
                  {showMapping && (
                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 12,
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#334155",
                          marginBottom: 8,
                        }}
                      >
                        {getText(
                          "Map API fields → user account (used on import)",
                          "API फील्ड → वापरकर्ता खाते मॅप करा (आयातावेळी)",
                          "API फील्ड → वापरकर्ता खाते मॅप करा (आयातावेळी)",
                        )}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(200px, 1fr))",
                          gap: 8,
                        }}
                      >
                        {HRMS_MAP_TARGETS.map((t) => (
                          <div key={t.key}>
                            <label
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#475569",
                                display: "block",
                                marginBottom: 4,
                              }}
                            >
                              {t.label}
                            </label>
                            <select
                              value={fieldMapping[t.key] || ""}
                              onChange={(e) =>
                                setFieldMapping((m) => ({
                                  ...m,
                                  [t.key]: e.target.value,
                                }))
                              }
                              style={{
                                width: "100%",
                                padding: "8px 10px",
                                border: "1px solid #e2e8f0",
                                borderRadius: 10,
                                fontSize: 12,
                                background: "white",
                              }}
                            >
                              <option value="">
                                {getText("(auto-detect)", "(स्वयं)", "(स्वयं)")}
                              </option>
                              {hrmsFields.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <p
                        style={{
                          fontSize: 11,
                          color: "#475569",
                          marginTop: 6,
                        }}
                      >
                        {getText(
                          "Leave blank to auto-detect. Click Save to persist.",
                          "स्वयं-शोधासाठी रिक्त ठेवा. जतन करण्यासाठी Save दाबा.",
                          "स्वयं-शोधासाठी रिक्त ठेवा. जतन करण्यासाठी Save दाबा.",
                        )}
                      </p>
                    </div>
                  )}

                  {/* Import preview (mapping applied to a sample row) */}
                  {showPreview && previewEmp && (
                    <div
                      style={{
                        border: "1px solid #c7d2fe",
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 12,
                        background: "#eef2ff",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#4f46e5",
                          marginBottom: 8,
                        }}
                      >
                        👁{" "}
                        {getText(
                          "Import preview — how this employee resolves to a user account",
                          "आयात पूर्वावलोकन — हा कर्मचारी वापरकर्ता खात्यात कसा रूपांतरित होतो",
                          "आयात पूर्वावलोकन — हा कर्मचारी वापरकर्ता खात्यात कसा रूपांतरित होतो",
                        )}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: 8,
                        }}
                      >
                        {Object.entries(previewResolved(previewEmp)).map(
                          ([k, v]) => (
                            <div
                              key={k}
                              style={{
                                background: "white",
                                border: "1px solid #eef2ff",
                                borderRadius: 6,
                                padding: "6px 8px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10,
                                  textTransform: "uppercase",
                                  color: "#475569",
                                  fontWeight: 600,
                                }}
                              >
                                {k}
                              </div>
                              <div style={{ fontSize: 13, color: "#0f172a" }}>
                                {v || "—"}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Employee List - Scrollable Area */}
                {hrmsImportStep === "employees" && (
                <div
                  className="hrms-modal-scroll"
                  style={{
                    flex: "1 1 auto",
                    overflowY: "auto",
                    overflowX: "auto",
                    padding: "0 24px 16px",
                    minHeight: "200px",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {(() => {
                    const cols =
                      selectedCols.length > 0
                        ? selectedCols
                        : ["employeeCode", "__name", "email"];
                    const thStyle: React.CSSProperties = {
                      padding: "12px 8px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#475569",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      backgroundColor: "#f8fafc",
                    };
                    return (
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          overflow: "hidden",
                          backgroundColor: "white",
                          minWidth: "100%",
                        }}
                      >
                        <table
                        style={{
                          width: "100%",
                          minWidth: 760,
                          borderCollapse: "collapse",
                          backgroundColor: "white",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              backgroundColor: "#f8fafc",
                              borderBottom: "2px solid #e2e8f0",
                            }}
                          >
                            <th style={{ ...thStyle, width: "40px" }}></th>
                            {cols.map((col) => (
                                  <th key={col} style={thStyle}>
                                {col === "__name"
                                  ? getText("Name", "नाव", "नाव")
                                  : col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {hrmsFiltered.map((employee, ri) => {
                            const id = employee.employeeCode;
                            const imported = isImported(id);
                            const isSel = selectedEmployees.includes(id);
                            return (
                              <tr
                                key={id || ri}
                                style={{
                                  borderBottom: "1px solid #e2e8f0",
                                  cursor: id && !imported ? "pointer" : "default",
                                  backgroundColor: isSel
                                    ? "#fef3c7"
                                    : imported
                                      ? "#f8fafc"
                                      : "transparent",
                                  opacity: imported ? 0.6 : 1,
                                }}
                                onClick={() => {
                                  if (!id || imported) return;
                                  setSelectedEmployees((prev) =>
                                    prev.includes(id)
                                      ? prev.filter((x) => x !== id)
                                      : Array.from(new Set([...prev, id])),
                                  );
                                }}
                              >
                                <td style={{ padding: "12px 8px" }}>
                                  <input
                                    type="checkbox"
                                    disabled={!id || imported}
                                    checked={isSel}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      if (!id || imported) return;
                                      setSelectedEmployees((prev) =>
                                        e.target.checked
                                          ? Array.from(new Set([...prev, id]))
                                          : prev.filter((x) => x !== id),
                                      );
                                    }}
                                    style={{
                                      cursor: "pointer",
                                      width: "16px",
                                      height: "16px",
                                    }}
                                  />
                                </td>
                                {cols.map((col, ci) => (
                                  <td
                                    key={col}
                                    style={{
                                      padding: "12px 8px",
                                      fontSize: "14px",
                                      color: "#334155",
                                      whiteSpace: "nowrap",
                                      maxWidth: 260,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                    title={
                                      col === "__name"
                                        ? `${employee.firstName || ""} ${
                                            employee.lastName || ""
                                          }`.trim()
                                        : hrmsCell(employee, col)
                                    }
                                  >
                                    {col === "__name"
                                      ? `${employee.firstName || ""} ${
                                          employee.lastName || ""
                                        }`.trim() || "—"
                                      : hrmsCell(employee, col)}
                                    {ci === 0 && imported && (
                                      <span
                                        style={{
                                          marginLeft: 6,
                                          fontSize: 10,
                                          fontWeight: 600,
                                          color: "#059669",
                                          background: "#d1fae5",
                                          padding: "1px 6px",
                                          borderRadius: 9999,
                                        }}
                                      >
                                        {getText("Imported", "आयात", "आयात")}
                                      </span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                        </table>
                      </div>
                    );
                  })()}
                  {hrmsFiltered.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "32px",
                        color: "#9ca3af",
                      }}
                    >
                      {getText(
                        "No employees found",
                        "कर्मचारी आढळले नाहीत",
                        "कर्मचारी आढळले नाहीत",
                      )}
                    </div>
                  )}
                </div>
                )}

                {/* Pagination */}
                {false && hrmsFiltered.length > HRMS_PAGE_SIZE && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 12,
                      padding: "10px 24px",
                      borderTop: "1px solid #e2e8f0",
                      fontSize: 13,
                      color: "#475569",
                      flexShrink: 0,
                    }}
                  >
                    <span>
                      {getText("Showing", "दाखवत आहे", "दाखवत आहे")}{" "}
                      {(hrmsPage - 1) * HRMS_PAGE_SIZE + 1}–
                      {Math.min(hrmsPage * HRMS_PAGE_SIZE, hrmsFiltered.length)}{" "}
                      / {hrmsFiltered.length}
                    </span>
                    <button
                      onClick={() => setHrmsPage((p) => Math.max(1, p - 1))}
                      disabled={hrmsPage <= 1}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                        background: "white",
                        cursor: hrmsPage <= 1 ? "default" : "pointer",
                        color: hrmsPage <= 1 ? "#9ca3af" : "#334155",
                      }}
                    >
                      {getText("Prev", "मागील", "मागील")}
                    </button>
                    <span>
                      {hrmsPage} / {hrmsTotalPages}
                    </span>
                    <button
                      onClick={() =>
                        setHrmsPage((p) => Math.min(hrmsTotalPages, p + 1))
                      }
                      disabled={hrmsPage >= hrmsTotalPages}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                        background: "white",
                        cursor:
                          hrmsPage >= hrmsTotalPages ? "default" : "pointer",
                        color: hrmsPage >= hrmsTotalPages ? "#9ca3af" : "#334155",
                      }}
                    >
                      {getText("Next", "पुढील", "पुढील")}
                    </button>
                  </div>
                )}

                {/* Project Assignment - Fixed Footer */}
                {hrmsImportStep === "projects" && selectedEmployees.length > 0 && (
                  <div
                    className="hrms-modal-scroll"
                    style={{
                      padding: "24px",
                      borderTop: "1px solid #e2e8f0",
                      backgroundColor: "#f8fafc",
                      flex: "1 1 auto",
                      minHeight: 0,
                      overflowY: "auto",
                  }}
                >
                    {/* Project Assignment */}
                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 16,
                        background:
                          "linear-gradient(180deg, #ffffff 0%, #eef2ff 100%)",
                        boxShadow:
                          "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 15,
                                color: "#0f172a",
                                fontWeight: 800,
                              }}
                            >
                              Assign Projects
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: "#4f46e5",
                                background: "#eef2ff",
                                border: "1px solid #c7d2fe",
                                borderRadius: 999,
                                padding: "4px 10px",
                                fontWeight: 700,
                              }}
                            >
                              {selectedEmployees.length} employee
                              {selectedEmployees.length === 1 ? "" : "s"} ready
                            </span>
                          </div>
                          <div
                            style={{
                              color: "#64748b",
                              fontSize: 12,
                              marginTop: 4,
                            }}
                          >
                            Choose projects before import. Listing opens with
                            selected project filter.
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#4f46e5",
                            background: "#eef2ff",
                            border: "1px solid #c7d2fe",
                            borderRadius: 999,
                            padding: "4px 10px",
                            fontWeight: 600,
                          }}
                        >
                          Roles auto-assigned by Role Mapping Rules
                        </div>
                      </div>
                      <label
                        style={{
                          display: "none",
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "#334155",
                          marginBottom: "6px",
                        }}
                      >
                        🏢{" "}
                        {getText(
                          "Assign Projects",
                          "प्रकल्प नियुक्त करा (वैकल्पिक)",
                          "प्रकल्प नियुक्त करा (वैकल्पिक)",
                        )}
                      </label>
                      {selectedHrmsProjects.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            marginBottom: 12,
                          }}
                        >
                          {selectedHrmsProjects.map((project) => (
                            <span
                              key={project._id}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 9px 6px 10px",
                                borderRadius: 999,
                                border: "1px solid #c7d2fe",
                                background: "#eef2ff",
                                color: "#4338ca",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {project.name}
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedProjects((prev) =>
                                    prev.filter((id) => id !== project._id),
                                  )
                                }
                                style={{
                                  border: "none",
                                  background: "#eef2ff",
                                  color: "#4338ca",
                                  borderRadius: 999,
                                  width: 18,
                                  height: 18,
                                  cursor: "pointer",
                                  lineHeight: "18px",
                                  fontSize: 12,
                                }}
                                aria-label={`Remove ${project.name}`}
                              >
                                x
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        style={{
                          position: "relative",
                          marginBottom: "8px",
                        }}
                      >
                        <input
                          type="text"
                          value={hrmsProjectSearch}
                          onChange={(e) => setHrmsProjectSearch(e.target.value)}
                          placeholder="Search project by name, code, or status..."
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "12px 42px 12px 14px",
                            border: "1px solid #eef2ff",
                            borderRadius: "12px",
                            background: "white",
                            color: "#0f172a",
                            fontSize: "14px",
                            outline: "none",
                            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                          }}
                        />
                        {hrmsProjectSearch && (
                          <button
                            type="button"
                            onClick={() => setHrmsProjectSearch("")}
                            style={{
                              position: "absolute",
                              right: 8,
                              top: "50%",
                              transform: "translateY(-50%)",
                              border: "none",
                              background: "#f1f5f9",
                              color: "#475569",
                              borderRadius: 999,
                              width: 24,
                              height: 24,
                              cursor: "pointer",
                              lineHeight: "24px",
                            }}
                            aria-label="Clear project search"
                          >
                            x
                          </button>
                        )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 10,
                          color: "#64748b",
                          fontSize: 12,
                          fontWeight: 600,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          {hrmsFilteredProjects.length} of {projects.length}{" "}
                          projects
                        </span>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <span>
                            {selectedProjects.length} selected
                            {hrmsFilteredProjects.length > 0
                              ? `, ${selectedVisibleHrmsProjectCount} visible`
                              : ""}
                          </span>
                          <button
                            type="button"
                            onClick={toggleVisibleHrmsProjects}
                            disabled={visibleHrmsProjectIds.length === 0}
                            style={{
                              border: "1px solid #c7d2fe",
                              background: "white",
                              color: "#4f46e5",
                              borderRadius: 999,
                              padding: "5px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor:
                                visibleHrmsProjectIds.length === 0
                                  ? "not-allowed"
                                  : "pointer",
                              opacity:
                                visibleHrmsProjectIds.length === 0 ? 0.5 : 1,
                            }}
                          >
                            {allVisibleHrmsProjectsSelected
                              ? "Clear visible"
                              : "Select visible"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedProjects([])}
                            disabled={selectedProjects.length === 0}
                            style={{
                              border: "1px solid #e2e8f0",
                              background: "white",
                              color: "#475569",
                              borderRadius: 999,
                              padding: "5px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor:
                                selectedProjects.length === 0
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: selectedProjects.length === 0 ? 0.5 : 1,
                            }}
                          >
                            Clear all
                          </button>
                        </div>
                      </div>
                      <div
                        style={{
                          border: "1px solid #eef2ff",
                          borderRadius: "14px",
                          backgroundColor: "white",
                          maxHeight: "420px",
                          overflowY: "auto",
                          padding: "10px",
                        }}
                      >
                        {projects.length === 0 ? (
                          <div
                            style={{
                              padding: "12px",
                              textAlign: "center",
                              color: "#92400e",
                              fontSize: "13px",
                            }}
                          >
                            {getText(
                              "No projects available",
                              "कोणतेही प्रकल्प उपलब्ध नाहीत",
                              "कोणतेही प्रकल्प उपलब्ध नाहीत",
                            )}
                          </div>
                        ) : hrmsFilteredProjects.length === 0 ? (
                          <div
                            style={{
                              padding: "18px 12px",
                              textAlign: "center",
                              color: "#64748b",
                              fontSize: "13px",
                            }}
                          >
                            No projects match this search.
                          </div>
                        ) : (
                          hrmsFilteredProjects.map((project) => (
                            <label
                              key={project._id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "12px 14px",
                                marginBottom: 8,
                                cursor: "pointer",
                                borderRadius: "12px",
                                border: selectedProjects.includes(project._id)
                                  ? "1px solid #c7d2fe"
                                  : "1px solid #e2e8f0",
                                backgroundColor: selectedProjects.includes(
                                  project._id,
                                )
                                  ? "#eef2ff"
                                  : "white",
                                boxShadow: selectedProjects.includes(project._id)
                                  ? "0 8px 18px rgba(37, 99, 235, 0.08)"
                                  : "none",
                                transition: "all 0.2s ease",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  selectedProjects.includes(project._id)
                                    ? "#eef2ff"
                                    : "#f8fafc")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  selectedProjects.includes(project._id)
                                    ? "#eef2ff"
                                    : "white")
                              }
                            >
                              <input
                                type="checkbox"
                                checked={selectedProjects.includes(project._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedProjects([
                                      ...selectedProjects,
                                      project._id,
                                    ]);
                                  } else {
                                    setSelectedProjects(
                                      selectedProjects.filter(
                                        (id) => id !== project._id,
                                      ),
                                    );
                                  }
                                }}
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  cursor: "pointer",
                                  accentColor: "#4f46e5",
                                }}
                              />
                              <div style={{ flex: 1 }}>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: "700",
                                    color: "#0f172a",
                                  }}
                                >
                                  {project.name}
                                </div>
                                {project.code && (
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "#475569",
                                      marginTop: "2px",
                                    }}
                                  >
                                    {getText("Code", "कोड", "कोड")}:{" "}
                                    {project.code}
                                  </div>
                                )}
                              </div>
                              <span
                                style={{
                                  fontSize: "11px",
                                  padding: "4px 9px",
                                  borderRadius: "12px",
                                  backgroundColor:
                                    project.status === "active"
                                      ? "#dcfce7"
                                      : "#fee2e2",
                                  color:
                                    project.status === "active"
                                      ? "#166534"
                                      : "#991b1b",
                                  fontWeight: "700",
                                }}
                              >
                                {project.status}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#64748b",
                          marginTop: "6px",
                          fontStyle: "italic",
                        }}
                      >
                        💡{" "}
                        {getText(
                          "Select projects for assignment. In single-project mode, the current project is used automatically.",
                          "निवडलेल्या कर्मचाऱ्यांना नियुक्त करण्यासाठी एक किंवा अधिक प्रकल्प निवडा.",
                          "निवडलेल्या कर्मचाऱ्यांना नियुक्त करण्यासाठी एक किंवा अधिक प्रकल्प निवडा.",
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons - Fixed Footer */}
                <div
                  style={{
                    padding: "16px 24px",
                    borderTop: "1px solid #e2e8f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexShrink: 0,
                    backgroundColor: "white",
                    boxShadow: "0 -10px 24px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  <button
                    onClick={closeHrmsModal}
                    disabled={saving}
                    style={{
                      padding: "10px 20px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      backgroundColor: "white",
                      color: "#334155",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.5 : 1,
                    }}
                  >
                    {getText("Cancel", "रद्द करा", "रद्द करा")}
                  </button>
                  {hrmsImportStep === "projects" && hrmsRequiresProjectSelection && (
                    <div
                      style={{
                        color: "#b45309",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: 999,
                        padding: "7px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      Select project to enable import
                    </div>
                  )}
                  {hrmsImportStep === "projects" && (
                    <button
                      type="button"
                      onClick={() => setHrmsImportStep("employees")}
                      disabled={saving}
                      style={{
                        padding: "10px 18px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        backgroundColor: "white",
                        color: "#334155",
                        fontSize: "14px",
                        fontWeight: "600",
                        cursor: saving ? "not-allowed" : "pointer",
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      Back to employees
                    </button>
                  )}
                  <button
                    onClick={
                      hrmsImportStep === "employees"
                        ? () => setHrmsImportStep("projects")
                        : handleConfirmHRMS
                    }
                    disabled={hrmsPrimaryDisabled}
                    style={{
                      padding: "10px 32px",
                      border: "none",
                      borderRadius: "10px",
                      backgroundColor:
                        hrmsPrimaryDisabled
                          ? "#e2e8f0"
                          : hrmsImportStep === "employees"
                            ? "#4f46e5"
                            : "#f97316",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: "600",
                      boxShadow:
                        hrmsPrimaryDisabled
                          ? "none"
                          : hrmsImportStep === "employees"
                            ? "0 10px 20px rgba(37, 99, 235, 0.22)"
                            : "0 10px 20px rgba(249, 115, 22, 0.22)",
                      cursor:
                        hrmsPrimaryDisabled
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {hrmsImportStep === "employees"
                      ? `Next: Assign Projects (${selectedEmployees.length})`
                      : saving
                      ? getText("Adding...", "जोडत आहे...", "जोडत आहे...")
                      : getText(
                          `Add ${selectedEmployees.length} User(s)`,
                          `${selectedEmployees.length} वापरकर्ते जोडा`,
                          `${selectedEmployees.length} वापरकर्ते जोडा`,
                        )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* View Credentials Modal */}
      {showCredentialsModal && selectedUserForCredentials && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,23,42,.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "20px",
              maxWidth: "500px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow:
                "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background:
                      "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: "20px",
                      fontWeight: "700",
                      color: "#0f172a",
                      margin: 0,
                    }}
                  >
                    {getText(
                      "User Login Credentials",
                      "वापरकर्ता लॉगिन क्रेडेन्शियल",
                      "वापरकर्ता लॉगिन क्रेडेन्शियल",
                    )}
                  </h2>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#475569",
                      margin: "4px 0 0 0",
                    }}
                  >
                    {selectedUserForCredentials.firstName}{" "}
                    {selectedUserForCredentials.lastName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCredentialsModal(false);
                  setSelectedUserForCredentials(null);
                }}
                style={{
                  padding: "8px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                      borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#475569"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: "24px" }}>
              {/* Project URLs */}
              {selectedUserForCredentials.projects &&
                selectedUserForCredentials.projects.length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#334155",
                        marginBottom: "12px",
                      }}
                    >
                      🌐{" "}
                      {getText(
                        "Project Login URLs",
                        "प्रोजेक्ट लॉगिन URLs",
                        "प्रोजेक्ट लॉगिन URLs",
                      )}
                    </label>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {selectedUserForCredentials.projects.map((project) => {
                        const projectData = projects.find(
                          (p) => p._id === project._id,
                        );
                        const customPath =
                          (projectData as any)?.branding?.customUrlPath ||
                          project.name.toLowerCase().replace(/\s+/g, "");
                        const loginUrl = `${window.location.origin}/${customPath}/portal/login`;

                        return (
                          <div
                            key={project._id}
                            style={{
                              padding: "12px",
                              backgroundColor: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "12px",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: "13px",
                                  fontWeight: "600",
                                  color: "#0f172a",
                                  marginBottom: "4px",
                                }}
                              >
                                {project.name}
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#10B981",
                                  fontFamily: "monospace",
                                }}
                              >
                                {loginUrl}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(loginUrl);
                                alert(
                                  getText(
                                    "URL copied to clipboard!",
                                    "URL क्लिपबोर्डवर कॉपी केले!",
                                    "URL क्लिपबोर्डवर कॉपी केले!",
                                  ),
                                );
                              }}
                              style={{
                                padding: "6px 12px",
                                border: "1px solid #10B981",
                                borderRadius: "6px",
                                backgroundColor: "white",
                                color: "#10B981",
                                fontSize: "12px",
                                fontWeight: "600",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {getText("Copy", "कॉपी", "कॉपी")}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Username */}
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#334155",
                    marginBottom: "8px",
                  }}
                >
                  👤{" "}
                  {getText(
                    "Username (Email)",
                    "वापरकर्तानाव (ईमेल)",
                    "वापरकर्तानाव (ईमेल)",
                  )}
                </label>
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: "#0f172a",
                    fontFamily: "monospace",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <span>{selectedUserForCredentials.email}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        selectedUserForCredentials.email,
                      );
                      alert(
                        getText(
                          "Email copied to clipboard!",
                          "ईमेल क्लिपबोर्डवर कॉपी केले!",
                          "ईमेल क्लिपबोर्डवर कॉपी केले!",
                        ),
                      );
                    }}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "4px",
                      backgroundColor: "white",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    {getText("Copy", "कॉपी", "कॉपी")}
                  </button>
                </div>
              </div>

              {/* Password - Development Phase */}
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#334155",
                    marginBottom: "8px",
                  }}
                >
                  🔐 {getText("Password", "पासवर्ड", "पासवर्ड")}
                </label>
                <div
                  style={{
                    padding: "12px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    color: "#0f172a",
                    fontFamily: "monospace",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <span>{getDefaultPassword(selectedUserForCredentials)}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        getDefaultPassword(selectedUserForCredentials),
                      );
                      alert(
                        getText(
                          "Password copied to clipboard!",
                          "पासवर्ड क्लिपबोर्डवर कॉपी केले!",
                          "पासवर्ड क्लिपबोर्डवर कॉपी केले!",
                        ),
                      );
                    }}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "4px",
                      backgroundColor: "white",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    {getText("Copy", "कॉपी", "कॉपी")}
                  </button>
                </div>
              </div>

              {/* Dev Phase Notice */}
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#eef2ff",
                  border: "1px solid #c7d2fe",
                  borderRadius: "8px",
                  marginBottom: "20px",
                }}
              >
                <p
                  style={{
                    fontSize: "12px",
                    color: "#4338ca",
                    margin: 0,
                    lineHeight: "1.5",
                  }}
                >
                  ℹ️{" "}
                  {getText(
                    `Development Phase: Default password is "${getDefaultPassword(selectedUserForCredentials)}". Users can change it after first login.`,
                    `विकास टप्पा: डीफॉल्ट पासवर्ड "${getDefaultPassword(selectedUserForCredentials)}" आहे. वापरकर्ते पहिल्या लॉगिननंतर ते बदलू शकतात.`,
                    `विकास टप्पा: डीफॉल्ट पासवर्ड "${getDefaultPassword(selectedUserForCredentials)}" आहे. वापरकर्ते पहिल्या लॉगिननंतर ते बदलू शकतात.`,
                  )}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => {
                    setShowCredentialsModal(false);
                    setSelectedUserForCredentials(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    backgroundColor: "white",
                    color: "#334155",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {getText("Close", "बंद करा", "बंद करा")}
                </button>
                {hasPermission("USER_RESET_PASSWORD") && (
                  <button
                    onClick={() => {
                      setShowCredentialsModal(false);
                      setResetPasswordUser(selectedUserForCredentials);
                      setShowResetPasswordModal(true);
                      setSelectedUserForCredentials(null);
                      setNewPassword("");
                      setConfirmPassword("");
                      setResetPasswordError("");
                      setResetPasswordPolicy(null);
                      if (selectedUserForCredentials)
                        fetchResetPasswordPolicy(selectedUserForCredentials);
                    }}
                    style={{
                      flex: 1,
                      padding: "12px",
                      border: "none",
                      borderRadius: "8px",
                      background:
                        "linear-gradient(160deg, #4f46e5, #4338ca)",
                      color: "white",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    {getText(
                      "Reset Password",
                      "पासवर्ड रीसेट करा",
                      "पासवर्ड रीसेट करा",
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && resetPasswordUser && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15,23,42,.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "20px",
              maxWidth: "450px",
              width: "100%",
              boxShadow:
                "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "24px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {getText(
                  "Reset Password",
                  "पासवर्ड रीसेट करा",
                  "पासवर्ड रीसेट करा",
                )}
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "#475569",
                  margin: "8px 0 0 0",
                }}
              >
                {getText(
                  "Set new password for",
                  "यासाठी नवीन पासवर्ड सेट करा",
                  "यासाठी नवीन पासवर्ड सेट करा",
                )}
                : {resetPasswordUser.firstName} {resetPasswordUser.lastName}
              </p>
            </div>

            {/* Form */}
            <div style={{ padding: "24px" }}>
              {/* Password policy requirements */}
              {loadingResetPolicy && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#475569",
                    marginBottom: "12px",
                  }}
                >
                  Loading password requirements…
                </p>
              )}
              {!loadingResetPolicy && resetPasswordPolicy && (
                <div
                  style={{
                    background: "#eef2ff",
                    border: "1px solid #c7d2fe",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    marginBottom: "16px",
                    fontSize: "13px",
                  }}
                >
                  <p
                    style={{
                      fontWeight: 600,
                      color: "#4338ca",
                      margin: "0 0 6px 0",
                    }}
                  >
                    Password Requirements:
                  </p>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "18px",
                      color: "#334155",
                      lineHeight: "1.8",
                    }}
                  >
                    <li>
                      Minimum {resetPasswordPolicy.minLength || 6} characters
                    </li>
                    {resetPasswordPolicy.requireUppercase && (
                      <li>At least one uppercase letter (A-Z)</li>
                    )}
                    {resetPasswordPolicy.requireLowercase && (
                      <li>At least one lowercase letter (a-z)</li>
                    )}
                    {resetPasswordPolicy.requireNumbers && (
                      <li>At least one number (0-9)</li>
                    )}
                    {resetPasswordPolicy.requireSpecialChars && (
                      <li>At least one special character (@!%*?"#$[]^~_-+=)</li>
                    )}
                  </ul>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                      fontWeight: "600",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  {getText("New Password", "नवीन पासवर्ड", "नवीन पासवर्ड")}{" "}
                  <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setResetPasswordError("");
                  }}
                  placeholder={getText(
                    resetPasswordPolicy
                      ? `Enter new password (min. ${resetPasswordPolicy.minLength || 6} characters)`
                      : "Enter new password (min. 6 characters)",
                    "नवीन पासवर्ड एंटर करा",
                    "नवीन पासवर्ड एंटर करा",
                  )}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "8px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  {getText(
                    "Confirm Password",
                    "पासवर्डची पुष्टी करा",
                    "पासवर्डची पुष्टी करा",
                  )}{" "}
                  <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setResetPasswordError("");
                  }}
                  placeholder={getText(
                    "Re-enter new password",
                    "नवीन पासवर्ड पुन्हा एंटर करा",
                    "नवीन पासवर्ड पुन्हा एंटर करा",
                  )}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Inline error message */}
              {resetPasswordError && (
                <p
                  style={{
                    color: "#ef4444",
                    fontSize: "13px",
                    margin: "6px 0 16px 0",
                  }}
                >
                  {resetPasswordError}
                </p>
              )}
              {!resetPasswordError && <div style={{ marginBottom: "16px" }} />}

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setResetPasswordUser(null);
                    setNewPassword("");
                    setConfirmPassword("");
                    setResetPasswordError("");
                    setResetPasswordPolicy(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    backgroundColor: "white",
                    color: "#334155",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {getText("Cancel", "रद्द करा", "रद्द करा")}
                </button>
                <button
                  onClick={handleResetPassword}
                  style={{
                    flex: 1,
                    padding: "12px",
                    border: "none",
                    borderRadius: "8px",
                    background:
                      "linear-gradient(160deg, #4f46e5, #4338ca)",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {getText(
                    "Reset Password",
                    "पासवर्ड रीसेट करा",
                    "पासवर्ड रीसेट करा",
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "28px",
              width: "520px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow:
                "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: "18px",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Delete {selectedUserIds.size} User
              {selectedUserIds.size > 1 ? "s" : ""}?
            </h3>
            <p
              style={{
                margin: "0 0 16px 0",
                fontSize: "14px",
                color: "#475569",
              }}
            >
              This action cannot be undone. The following user
              {selectedUserIds.size > 1 ? "s" : ""} will be permanently deleted:
            </p>
            <div
              style={{
                border: "1px solid #FCA5A5",
                borderRadius: "8px",
                background: "#FFF5F5",
                padding: "12px",
                marginBottom: "20px",
                maxHeight: "260px",
                overflowY: "auto",
              }}
            >
              {users
                .filter((u) => selectedUserIds.has(u._id))
                .map((u) => (
                  <div
                    key={u._id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "8px 0",
                      borderBottom: "1px solid #FECACA",
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: "#EF4444",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {(u.firstName?.[0] || "?").toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "#0f172a",
                        }}
                      >
                        {u.firstName} {u.lastName}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#475569",
                          marginTop: "2px",
                        }}
                      >
                        {u.email}
                      </div>
                      {u.role && (
                        <div
                          style={{
                            display: "inline-block",
                            marginTop: "4px",
                            padding: "1px 8px",
                            borderRadius: "12px",
                            background: "#FEE2E2",
                            color: "#B91C1C",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}
                        >
                          {typeof u.role === "object"
                            ? (u.role as any).name
                            : u.role}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "white",
                  color: "#334155",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: bulkDeleting ? "not-allowed" : "pointer",
                  opacity: bulkDeleting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDeleteUsers}
                disabled={bulkDeleting}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: "8px",
                  background: "#DC2626",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: bulkDeleting ? "not-allowed" : "pointer",
                  opacity: bulkDeleting ? 0.7 : 1,
                }}
              >
                {bulkDeleting
                  ? "Deleting..."
                  : `Delete ${selectedUserIds.size} User${selectedUserIds.size > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (wrapWithLayout) {
    return <DashboardLayout>{mainContent}</DashboardLayout>;
  }

  return mainContent;
};

export default UserManagement;
