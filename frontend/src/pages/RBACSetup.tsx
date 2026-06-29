import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdContentCopy,
  MdSearch,
  MdStar,
  MdStarBorder,
  MdClose,
  MdSave,
  MdExpandMore,
  MdExpandLess,
} from "react-icons/md";
import DashboardLayout from "../components/DashboardLayout";
import { API_CONFIG } from "../config/constants";

interface Permission {
  _id: string;
  module: string;
  name: string;
  code: string;
  description?: string;
  category: string;
}

interface Role {
  _id: string;
  name: string;
  code: string;
  description?: string;
  type: "system" | "custom";
  roleType?: "super_admin" | "agent" | "student" | "manager" | "custom";
  projects?: string[];
  permissions: Permission[] | string[];
  agentCount: number;
  isActive: boolean;
  isMaster: boolean;
  masterRoleId?: string;
  isAgent: boolean;
  document?: {
    fileName: string;
    filePath: string;
    fileUrl: string;
    uploadedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface Project {
  _id: string;
  name: string;
  code: string;
}

interface GroupedPermissions {
  [category: string]: {
    [module: string]: Permission[];
  };
}

const RBACSetup = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [masterRoles, setMasterRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [groupedPermissions, setGroupedPermissions] =
    useState<GroupedPermissions>({});
  const [loading, setLoading] = useState(true);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [cloneMasterRole, setCloneMasterRole] = useState<Role | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "system" | "custom" | "master"
  >("all");
  const [filterProject, setFilterProject] = useState<string>("all");

  // Debounce timer for fetchData to prevent rate limiting
  const fetchDataTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedData = useRef(false);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    permissions: [] as string[],
    projects: [] as string[],
    isMaster: false,
    isAgent: false,
    roleType: "custom" as
      | "super_admin"
      | "agent"
      | "student"
      | "manager"
      | "custom", // Add role type
  });

  const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
  const [existingDocument, setExistingDocument] = useState<{
    fileName: string;
    fileUrl: string;
  } | null>(null);

  // Multi-select state for bulk delete
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    new Set(),
  );
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showRoleProjectDropdown, setShowRoleProjectDropdown] = useState(false);
  const [roleProjectSearchTerm, setRoleProjectSearchTerm] = useState("");
  const [showCloneProjectDropdown, setShowCloneProjectDropdown] =
    useState(false);
  const [cloneProjectSearchTerm, setCloneProjectSearchTerm] = useState("");
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = viewportWidth <= 768;

  useEffect(() => {
    // Prevent duplicate calls from React.StrictMode
    if (hasFetchedData.current) {
      console.log("⏭️ Skipping duplicate RBAC data fetch (already loaded)");
      return;
    }
    hasFetchedData.current = true;
    fetchData();
  }, []);

  // Debounced fetchData to prevent rate limiting when doing multiple operations
  const debouncedFetchData = (delay: number = 500) => {
    if (fetchDataTimerRef.current) {
      clearTimeout(fetchDataTimerRef.current);
    }
    fetchDataTimerRef.current = setTimeout(() => {
      fetchData();
    }, delay);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = { Authorization: `Bearer ${token}` };

      const [rolesRes, permissionsRes, projectsRes, masterRolesRes] =
        await Promise.all([
          axios.get(`${API_CONFIG.API_URL}/roles`, { headers }),
          axios.get(`${API_CONFIG.API_URL}/permissions/grouped`, { headers }),
          axios.get(`${API_CONFIG.API_URL}/projects?limit=100`, { headers }),
          axios.get(`${API_CONFIG.API_URL}/roles/master/list`, { headers }),
        ]);

      setRoles(Array.isArray(rolesRes.data.data) ? rolesRes.data.data : []);
      setMasterRoles(
        Array.isArray(masterRolesRes.data.data) ? masterRolesRes.data.data : [],
      );
      setGroupedPermissions(permissionsRes.data.data || {});

      // Projects API returns {success: true, data: {projects: [...], pagination: {...}}}
      const projectsArray = Array.isArray(projectsRes.data.data?.projects)
        ? projectsRes.data.data.projects
        : Array.isArray(projectsRes.data.data)
          ? projectsRes.data.data
          : [];

      setProjects(projectsArray);

      console.log(
        "✅ RBAC Setup - Projects loaded:",
        projectsArray.length,
        projectsArray,
      );
    } catch (error: any) {
      console.error("Error fetching data:", error);
      if (error.response?.status === 401) {
        alert("Session expired. Please login again.");
        window.location.href = "/";
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("authToken");

      // Create FormData for multipart/form-data upload
      const formDataToSend = new FormData();
      formDataToSend.append("name", formData.name);
      formDataToSend.append("code", formData.code);
      formDataToSend.append("description", formData.description);
      formDataToSend.append(
        "permissions",
        JSON.stringify(formData.permissions),
      );
      formDataToSend.append("projects", JSON.stringify(formData.projects));
      formDataToSend.append("isMaster", String(formData.isMaster));
      formDataToSend.append("isAgent", String(formData.isAgent));
      formDataToSend.append("roleType", formData.roleType);

      if (selectedDocument) {
        formDataToSend.append("document", selectedDocument);
      }

      await axios.post(`${API_CONFIG.API_URL}/roles`, formDataToSend, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      setShowRoleModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to create role");
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    try {
      console.log("🔄 Updating role with data:", formData);
      console.log("🔍 isAgent value:", formData.isAgent);

      const token = localStorage.getItem("authToken");

      // Create FormData for multipart/form-data upload
      const formDataToSend = new FormData();
      formDataToSend.append("name", formData.name);
      formDataToSend.append("code", formData.code);
      formDataToSend.append("description", formData.description);
      formDataToSend.append(
        "permissions",
        JSON.stringify(formData.permissions),
      );
      formDataToSend.append("projects", JSON.stringify(formData.projects));
      formDataToSend.append("isMaster", String(formData.isMaster));
      formDataToSend.append("isAgent", String(formData.isAgent));
      formDataToSend.append("roleType", formData.roleType);

      if (selectedDocument) {
        formDataToSend.append("document", selectedDocument);
      }

      const response = await axios.put(
        `${API_CONFIG.API_URL}/roles/${editingRole._id}`,
        formDataToSend,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      console.log("✅ Role update response:", response.data);

      setShowRoleModal(false);
      setEditingRole(null);
      setShowRoleProjectDropdown(false);
      setRoleProjectSearchTerm("");
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("❌ Role update error:", error.response?.data);
      alert(error.response?.data?.error || "Failed to update role");
    }
  };

  const handleCloneRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneMasterRole) return;
    try {
      const token = localStorage.getItem("authToken");
      await axios.post(
        `${API_CONFIG.API_URL}/roles/${cloneMasterRole._id}/clone`,
        {
          name: formData.name,
          code: formData.code,
          description: formData.description,
          projects: formData.projects,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setShowCloneModal(false);
      setCloneMasterRole(null);
      setShowCloneProjectDropdown(false);
      setCloneProjectSearchTerm("");
      resetForm();
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to clone role");
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm("Are you sure you want to delete this role?")) return;
    try {
      const token = localStorage.getItem("authToken");

      // Optimistic UI update - remove from list immediately (better UX)
      setRoles((prevRoles) => prevRoles.filter((role) => role._id !== roleId));

      // Delete in background
      await axios.delete(`${API_CONFIG.API_URL}/roles/${roleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Debounced refresh to avoid rate limiting when deleting multiple roles
      debouncedFetchData(1000);
    } catch (error: any) {
      // On error, refresh to restore correct state
      fetchData();
      alert(error.response?.data?.error || "Failed to delete role");
    }
  };

  const handleBulkDeleteRoles = async () => {
    const ids = Array.from(selectedRoleIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const token = localStorage.getItem("authToken");
      // Delete sequentially to avoid server overload
      for (const id of ids) {
        await axios.delete(`${API_CONFIG.API_URL}/roles/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      setSelectedRoleIds(new Set());
      setShowBulkDeleteConfirm(false);
      debouncedFetchData(500);
    } catch (error: any) {
      fetchData();
      alert(error.response?.data?.error || "Failed to delete some roles");
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleRoleSelection = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const toggleSelectAllRoles = () => {
    const deletableIds = filteredRoles
      .filter((r) => r.type === "custom")
      .map((r) => r._id);
    if (deletableIds.every((id) => selectedRoleIds.has(id))) {
      setSelectedRoleIds(new Set());
    } else {
      setSelectedRoleIds(new Set(deletableIds));
    }
  };

  const toggleMasterRole = async (role: Role) => {
    try {
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_CONFIG.API_URL}/roles/${role._id}`,
        { isMaster: !role.isMaster },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to update role");
    }
  };

  const openEditModal = (
    role: Role & { document?: { fileName: string; fileUrl: string } },
  ) => {
    console.log("🔍 Opening Edit Modal for role:", role.name);
    console.log("🔍 Role projects:", role.projects);
    console.log("🔍 Role isAgent:", role.isAgent);
    console.log("🔍 Available projects in state:", projects);

    setEditingRole(role);
    setShowRoleProjectDropdown(false);
    setRoleProjectSearchTerm("");
    setFormData({
      name: role.name,
      code: role.code,
      description: role.description || "",
      permissions: Array.isArray(role.permissions)
        ? role.permissions.map((p: any) => (typeof p === "string" ? p : p._id))
        : [],
      projects: role.projects || [],
      isMaster: role.isMaster,
      isAgent: role.isAgent || false,
      roleType: role.roleType || "custom",
    });

    // Set existing document if available
    if (role.document) {
      setExistingDocument({
        fileName: role.document.fileName,
        fileUrl: role.document.fileUrl,
      });
    } else {
      setExistingDocument(null);
    }

    setShowRoleModal(true);
  };

  const openCloneModal = (role: Role) => {
    setCloneMasterRole(role);
    setShowCloneProjectDropdown(false);
    setCloneProjectSearchTerm("");
    setFormData({
      name: `${role.name} (Copy)`,
      code: "",
      description: role.description || "",
      permissions: [],
      projects: [],
      isMaster: false,
      isAgent: false,
      roleType: "custom",
    });
    setShowCloneModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      description: "",
      permissions: [],
      projects: [],
      isMaster: false,
      isAgent: false,
      roleType: "custom",
    });
    setSelectedDocument(null);
    setExistingDocument(null);
  };

  // Filter permissions based on role type
  const getFilteredPermissions = (
    permissions: GroupedPermissions,
    roleType: string,
  ): GroupedPermissions => {
    const filtered: GroupedPermissions = {};

    // Report permissions that are managed internally by the Report module.
    // REPORT_CREATE_CUSTOM and REPORT_ASSIGN are exposed so sub-admins can be
    // granted Report Builder + Assign access directly from RBAC Setup.
    const REPORT_PERMISSIONS_HIDDEN_IN_RBAC = new Set([
      "REPORT_VIEW_AGENT_PERFORMANCE",
      "REPORT_VIEW_CSAT",
      "REPORT_VIEW_SLA",
      "REPORT_EXPORT",
      "REPORT_SCHEDULE",
      "REPORT_DELETE",
      "REPORT_PERMISSIONS_MANAGE",
      "REPORT_DATA_POINTS_MANAGE",
    ]);

    // Define permission categories for each role type
    // ALL permission prefixes must be listed here to be visible in RBAC Setup
    const allPermissionPrefixes = [
      "RBAC",
      "USER",
      "PROJECT",
      "TICKET",
      "KB_",
      "FAQ",
      "FEEDBACK",
      "AUDIT",
      "OFFLINE",
      "STUDENT",
      "FIELDS",
      "SLA",
      "AUTOMATION",
      "REPORT",
      "INTEGRATION",
      "FORM",
      "WORKFLOW",
      "APPROVAL",
      "MASTER_DATA",
      "TICKET_CONFIG",
      "DASHBOARD",
      "ASSET",
      "MY_ASSETS",
      "EMAIL",
      "ESCALATION",
      "TOKEN",
      "DESK",
      "ATTENDANCE",
    ];

    const rolePermissionMap: Record<string, string[]> = {
      super_admin: allPermissionPrefixes,
      manager: [
        "USER",
        "TICKET",
        "KB_",
        "FAQ",
        "FEEDBACK",
        "AUDIT",
        "OFFLINE",
        "STUDENT",
        "REPORT",
        "ASSET",
        "MY_ASSETS",
        "EMAIL",
        "TOKEN",
        "DESK",
        "ATTENDANCE",
      ],
      agent: [
        "TICKET",
        "KB_",
        "FAQ",
        "FEEDBACK",
        "OFFLINE",
        "STUDENT",
        "MY_ASSETS",
        "TOKEN",
        "DESK",
      ],
      student: ["TICKET", "FAQ", "OFFLINE", "STUDENT"],
      custom: allPermissionPrefixes, // All permissions available for custom roles
    };

    const allowedPrefixes =
      rolePermissionMap[roleType] || rolePermissionMap.custom;

    Object.entries(permissions).forEach(([category, modules]) => {
      Object.entries(modules).forEach(([module, perms]) => {
        const filteredPerms = perms.filter((perm) => {
          // Hide report sub-permissions that are managed by the Report module itself
          if (REPORT_PERMISSIONS_HIDDEN_IN_RBAC.has(perm.code)) return false;
          // Check if permission code starts with any allowed prefix
          return allowedPrefixes.some((prefix) => perm.code.startsWith(prefix));
        });

        if (filteredPerms.length > 0) {
          if (!filtered[category]) filtered[category] = {};
          filtered[category][module] = filteredPerms;
        }
      });
    });

    return filtered;
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleAllPermissionsInModule = (modulePermissions: Permission[]) => {
    const modulePermissionIds = modulePermissions.map((p) => p._id);
    const allSelected = modulePermissionIds.every((id) =>
      formData.permissions.includes(id),
    );

    if (allSelected) {
      setFormData({
        ...formData,
        permissions: formData.permissions.filter(
          (id) => !modulePermissionIds.includes(id),
        ),
      });
    } else {
      setFormData({
        ...formData,
        permissions: [
          ...new Set([...formData.permissions, ...modulePermissionIds]),
        ],
      });
    }
  };

  const getCategoryLabel = (category: string) => {
    return category
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const filteredRoles = roles.filter((role) => {
    const matchesSearch =
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterType === "all" ||
      (filterType === "master" && role.isMaster) ||
      (filterType === "system" && role.type === "system") ||
      (filterType === "custom" && role.type === "custom");
    const matchesProject =
      filterProject === "all" ||
      (Array.isArray(role.projects) && role.projects.includes(filterProject));
    return matchesSearch && matchesFilter && matchesProject;
  });

  const roleProjectOptions = projects.filter((project) => {
    const term = roleProjectSearchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      project.name.toLowerCase().includes(term) ||
      project.code.toLowerCase().includes(term)
    );
  });

  const cloneProjectOptions = projects.filter((project) => {
    const term = cloneProjectSearchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      project.name.toLowerCase().includes(term) ||
      project.code.toLowerCase().includes(term)
    );
  });

  const filteredPermissionGroups = getFilteredPermissions(
    groupedPermissions,
    formData.roleType,
  );
  const permissionCategoryStats = Object.entries(filteredPermissionGroups).map(
    ([category, modules]) => {
      const allPermissions = Object.values(modules).flat();
      const total = allPermissions.length;
      const selected = allPermissions.filter((permission) =>
        formData.permissions.includes(permission._id),
      ).length;

      return {
        category,
        modules,
        total,
        selected,
      };
    },
  );
  const totalFilteredPermissionCount = permissionCategoryStats.reduce(
    (sum, entry) => sum + entry.total,
    0,
  );
  const selectedFilteredPermissionCount = permissionCategoryStats.reduce(
    (sum, entry) => sum + entry.selected,
    0,
  );

  const totalPermissionCatalog = Object.values(groupedPermissions).reduce(
    (categoryAcc, modules) =>
      categoryAcc +
      Object.values(modules as Record<string, Permission[]>).reduce(
        (moduleAcc, perms) => moduleAcc + perms.length,
        0,
      ),
    0,
  );
  const systemRoleCount = roles.filter((role) => role.type === "system").length;
  const customRoleCount = roles.filter((role) => role.type === "custom").length;
  const masterRoleCount = roles.filter((role) => role.isMaster).length;
  const projectMappedRoleCount = roles.filter(
    (role) => (role.projects?.length ?? 0) > 0,
  ).length;
  const getRoleAgentDisplayCount = (role: Role) => {
    const linkedAgents = role.agentCount || 0;
    if (linkedAgents > 0) return linkedAgents;
    return role.isAgent ? 1 : 0;
  };
  const totalAssignedAgents = roles.reduce(
    (sum, role) => sum + getRoleAgentDisplayCount(role),
    0,
  );
  const avgPermissionsPerRole =
    roles.length > 0
      ? Math.round(
          (roles.reduce(
            (sum, role) =>
              sum +
              (Array.isArray(role.permissions) ? role.permissions.length : 0),
            0,
          ) /
            roles.length) *
            10,
        ) / 10
      : 0;
  const roleProjectCoveragePct =
    roles.length > 0
      ? Math.round((projectMappedRoleCount / roles.length) * 100)
      : 0;

  const rbacStatsCards = [
    {
      title: "Total Roles",
      value: String(roles.length),
      subtitle: `${systemRoleCount} system • ${customRoleCount} custom`,
      accent: "#2563eb",
      bg: "#eff6ff",
    },
    {
      title: "Master Roles",
      value: String(masterRoleCount),
      subtitle: `${roles.length > 0 ? Math.round((masterRoleCount / roles.length) * 100) : 0}% of all roles`,
      accent: "#d97706",
      bg: "#fffbeb",
    },
    {
      title: "Project Coverage",
      value: `${roleProjectCoveragePct}%`,
      subtitle: `${projectMappedRoleCount}/${roles.length || 0} roles mapped`,
      accent: "#0284c7",
      bg: "#ecfeff",
    },
    {
      title: "Assigned Agents",
      value: String(totalAssignedAgents),
      subtitle: "Linked users + agent-marked roles",
      accent: "#059669",
      bg: "#ecfdf5",
    },
    {
      title: "Permission Catalog",
      value: String(totalPermissionCatalog),
      subtitle: "Available RBAC permissions",
      accent: "#7c3aed",
      bg: "#f5f3ff",
    },
    {
      title: "Avg Permissions",
      value: String(avgPermissionsPerRole),
      subtitle: "Per role assignment average",
      accent: "#dc2626",
      bg: "#fef2f2",
    },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "400px",
          }}
        >
          <div>Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div
        style={{
          padding: isMobile ? "16px" : "24px 20px 32px",
          maxWidth: "1380px",
          margin: "0 auto",
          background: "#f8fafc",
          minHeight: "100vh",
          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: isMobile ? "16px" : "22px 24px",
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
              fontSize: isMobile ? "20px" : "24px",
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              fontFamily: '"DM Serif Display", Georgia, serif',
            }}
          >
            RBAC Setup
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#475569",
              fontWeight: 400,
            }}
          >
            Manage roles and permissions with project-wise mapping
          </p>
        </div>

        <div
          style={{
            marginBottom: "16px",
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "10px",
          }}
        >
          {rbacStatsCards.map((card) => (
            <div
              key={card.title}
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                padding: "12px",
                boxShadow:
                  "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
              }}
            >
              <div
                style={{
                  width: "30px",
                  height: "6px",
                  borderRadius: "999px",
                  backgroundColor: card.accent,
                  marginBottom: "8px",
                }}
              />
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#94a3b8",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                }}
              >
                {card.title}
              </div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#0f172a",
                  lineHeight: 1.15,
                  marginBottom: "4px",
                }}
              >
                {card.value}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 7px",
                  borderRadius: "999px",
                  background: card.bg,
                  color: card.accent,
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                {card.subtitle}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginBottom: "16px",
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "14px",
            boxShadow:
              "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          {selectedRoleIds.size > 0 && (
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "42px",
                padding: "0 16px",
                background: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(239, 68, 68, 0.28)",
                width: isMobile ? "100%" : "auto",
                justifyContent: isMobile ? "center" : "flex-start",
              }}
            >
              <MdDelete size={18} />
              Delete Selected ({selectedRoleIds.size})
            </button>
          )}
          <div
            style={{
              marginLeft: isMobile ? 0 : "auto",
              width: isMobile ? "100%" : "auto",
            }}
          >
            <button
              onClick={() => {
                setEditingRole(null);
                setShowRoleProjectDropdown(false);
                setRoleProjectSearchTerm("");
                resetForm();
                setShowRoleModal(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                height: "42px",
                padding: "0 16px",
                background: "linear-gradient(160deg, #4f46e5, #4338ca)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: "0 4px 14px rgba(67,56,202,.35)",
                width: isMobile ? "100%" : "auto",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 20px rgba(67,56,202,.45)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 14px rgba(67,56,202,.35)";
              }}
            >
              <MdAdd size={20} />
              Create New Role
            </button>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            marginBottom: "16px",
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "14px",
            boxShadow:
              "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
          }}
        >
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
                minWidth: isMobile ? "100%" : "260px",
              }}
            >
              <MdSearch
                size={16}
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
              />
              <input
                type="text"
                placeholder="Search by role name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  height: "42px",
                  padding: "10px 14px 10px 40px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  background: "#fff",
                  outline: "none",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                }}
              />
            </div>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              style={{
                height: "42px",
                padding: "8px 12px",
                border:
                  filterProject !== "all"
                    ? "1.5px solid #4f46e5"
                    : "1.5px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "14px",
                color: filterProject !== "all" ? "#4f46e5" : "#475569",
                background: filterProject !== "all" ? "#eef2ff" : "#fff",
                cursor: "pointer",
                minWidth: isMobile ? "100%" : "200px",
                fontWeight: filterProject !== "all" ? 500 : 400,
              }}
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["all", "master", "system", "custom"].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type as any)}
                style={{
                  height: "38px",
                  padding: "0 14px",
                  backgroundColor: filterType === type ? "#eef2ff" : "#fff",
                  color: filterType === type ? "#4f46e5" : "#334155",
                  border:
                    filterType === type
                      ? "1.5px solid #4f46e5"
                      : "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: filterType === type ? 600 : 500,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Roles Table */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            boxShadow:
              "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
          }}
        >
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "980px",
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <th style={{ padding: "12px 16px", width: "40px" }}>
                    <input
                      type="checkbox"
                      title="Select all deletable roles"
                      checked={
                        filteredRoles.filter((r) => r.type === "custom")
                          .length > 0 &&
                        filteredRoles
                          .filter((r) => r.type === "custom")
                          .every((r) => selectedRoleIds.has(r._id))
                      }
                      onChange={toggleSelectAllRoles}
                      style={{
                        cursor: "pointer",
                        width: "16px",
                        height: "16px",
                      }}
                    />
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Master
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Role Name
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Code
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Permissions
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Projects
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Agents
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "right",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.map((role) => (
                  <tr
                    key={role._id}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: selectedRoleIds.has(role._id)
                        ? "#eef2ff"
                        : "white",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      {role.type === "custom" ? (
                        <input
                          type="checkbox"
                          checked={selectedRoleIds.has(role._id)}
                          onChange={() => toggleRoleSelection(role._id)}
                          style={{
                            cursor: "pointer",
                            width: "16px",
                            height: "16px",
                          }}
                        />
                      ) : (
                        <span
                          style={{ display: "inline-block", width: "16px" }}
                        />
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={() =>
                          role.type === "custom" && toggleMasterRole(role)
                        }
                        disabled={role.type === "system"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor:
                            role.type === "custom" ? "pointer" : "not-allowed",
                          color: role.isMaster ? "#f59e0b" : "#94a3b8",
                        }}
                        title={role.isMaster ? "Master Role" : "Mark as Master"}
                      >
                        {role.isMaster ? (
                          <MdStar size={20} />
                        ) : (
                          <MdStarBorder size={20} />
                        )}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div>
                        <div style={{ fontWeight: "500", color: "#0f172a" }}>
                          {role.name}
                        </div>
                        {role.description && (
                          <div style={{ fontSize: "12px", color: "#475569" }}>
                            {role.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "#475569",
                        fontSize: "14px",
                        fontFamily: '"Fira Code", "Consolas", monospace',
                        letterSpacing: "0.02em",
                      }}
                    >
                      {role.code}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: "600",
                          backgroundColor:
                            role.type === "system" ? "#dbeafe" : "#fef3c7",
                          color: role.type === "system" ? "#1e40af" : "#92400e",
                          textTransform: "capitalize",
                        }}
                      >
                        {role.type}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "#475569",
                        fontSize: "14px",
                      }}
                    >
                      {Array.isArray(role.permissions)
                        ? role.permissions.length
                        : 0}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "#475569",
                        fontSize: "14px",
                      }}
                    >
                      {role.projects?.length || 0}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        color: "#475569",
                        fontSize: "14px",
                      }}
                    >
                      {getRoleAgentDisplayCount(role)}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          justifyContent: "flex-end",
                        }}
                      >
                        {role.isMaster && (
                          <button
                            onClick={() => openCloneModal(role)}
                            style={{
                              padding: "6px 8px",
                              backgroundColor: "#ecfdf5",
                              border: "1px solid #bbf7d0",
                              borderRadius: "8px",
                              cursor: "pointer",
                              color: "#047857",
                            }}
                            title="Clone Role"
                          >
                            <MdContentCopy size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(role)}
                          style={{
                            padding: "6px 8px",
                            backgroundColor: "#eef2ff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            cursor: "pointer",
                            color: "#4f46e5",
                          }}
                          title="Edit Role"
                        >
                          <MdEdit size={18} />
                        </button>
                        {role.type === "custom" && (
                          <button
                            onClick={() => handleDeleteRole(role._id)}
                            style={{
                              padding: "6px 8px",
                              backgroundColor: "#fef2f2",
                              border: "1px solid #fecaca",
                              borderRadius: "8px",
                              cursor: "pointer",
                              color: "#b91c1c",
                            }}
                            title="Delete Role"
                          >
                            <MdDelete size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create/Edit Role Modal */}
        {showRoleModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: isMobile ? "12px" : "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "20px",
                width: "100%",
                maxWidth: "900px",
                maxHeight: "90vh",
                overflow: "auto",
                border: "1px solid #e2e8f0",
                boxShadow:
                  "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
              }}
            >
              <div
                style={{
                  padding: isMobile ? "16px" : "18px 24px",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#f8fafc",
                }}
              >
                <h2
                  style={{
                    fontSize: isMobile ? "18px" : "20px",
                    fontWeight: 700,
                    margin: 0,
                    color: "#0f172a",
                  }}
                >
                  {editingRole ? "Edit Role" : "Create New Role"}
                </h2>
                <button
                  onClick={() => {
                    setShowRoleModal(false);
                    setEditingRole(null);
                    setShowRoleProjectDropdown(false);
                    setRoleProjectSearchTerm("");
                    resetForm();
                  }}
                  style={{
                    background: "#fff",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "8px",
                    width: "34px",
                    height: "34px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MdClose size={24} />
                </button>
              </div>

              <form
                onSubmit={editingRole ? handleUpdateRole : handleCreateRole}
              >
                <div style={{ padding: isMobile ? "14px" : "20px 24px" }}>
                  {/* Basic Info */}
                  <div
                    style={{
                      marginBottom: "18px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "16px",
                      padding: isMobile ? "12px" : "14px",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        margin: "0 0 14px 0",
                        color: "#0f172a",
                      }}
                    >
                      Basic Information
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "6px",
                            fontSize: "14px",
                            fontWeight: "500",
                          }}
                        >
                          Role Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => {
                            const newName = e.target.value;
                            // Auto-generate code from name (only if not editing or code field is empty/auto-generated)
                            const autoCode = newName
                              .toUpperCase()
                              .replace(/\s+/g, "_")
                              .replace(/[^A-Z0-9_]/g, "");
                            setFormData({
                              ...formData,
                              name: newName,
                              code: editingRole ? formData.code : autoCode,
                            });
                          }}
                          style={{
                            width: "100%",
                            height: "40px",
                            padding: "8px 12px",
                            border: "1.5px solid #e2e8f0",
                            borderRadius: "8px",
                            fontSize: "14px",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "6px",
                            fontSize: "14px",
                            fontWeight: "500",
                          }}
                        >
                          Code *{" "}
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#6b7280",
                              fontWeight: "400",
                            }}
                          >
                            (auto-generated)
                          </span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.code}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              code: e.target.value.toUpperCase(),
                            })
                          }
                          disabled={editingRole?.type === "system"}
                          style={{
                            width: "100%",
                            height: "40px",
                            padding: "8px 12px",
                            border: "1.5px solid #e2e8f0",
                            borderRadius: "8px",
                            fontSize: "14px",
                            boxSizing: "border-box",
                            backgroundColor:
                              editingRole?.type === "system"
                                ? "#f1f5f9"
                                : "#fff",
                          }}
                          placeholder="Auto-generated from name"
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: "16px" }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "6px",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        Description
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: "8px",
                          fontSize: "14px",
                          resize: "vertical",
                          boxSizing: "border-box",
                          minHeight: "88px",
                        }}
                      />
                    </div>

                    {/* Document Upload */}
                    <div style={{ marginTop: "16px" }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "6px",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        Role Document (Optional)
                      </label>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginBottom: "8px",
                        }}
                      >
                        Upload a document that will be displayed in the footer
                        for users with this role
                      </p>

                      {existingDocument && !selectedDocument && (
                        <div
                          style={{
                            padding: "12px",
                            backgroundColor: "#eef2ff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "12px",
                            marginBottom: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: isMobile ? "wrap" : "nowrap",
                          }}
                        >
                          <div>
                            <span
                              style={{ fontSize: "14px", fontWeight: "500" }}
                            >
                              📄 {existingDocument.fileName}
                            </span>
                            <a
                              href={existingDocument.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                marginLeft: "12px",
                                fontSize: "12px",
                                color: "#4f46e5",
                                textDecoration: "underline",
                              }}
                            >
                              View
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                confirm(
                                  "Are you sure you want to delete this document?",
                                )
                              ) {
                                try {
                                  const token =
                                    localStorage.getItem("authToken");
                                  await axios.delete(
                                    `${API_CONFIG.API_URL}/roles/${editingRole?._id}/document`,
                                    {
                                      headers: {
                                        Authorization: `Bearer ${token}`,
                                      },
                                    },
                                  );
                                  setExistingDocument(null);
                                  alert("Document deleted successfully");
                                } catch (error: any) {
                                  alert(
                                    error.response?.data?.error ||
                                      "Failed to delete document",
                                  );
                                }
                              }
                            }}
                            style={{
                              padding: "6px 12px",
                              fontSize: "12px",
                              backgroundColor: "#dc2626",
                              color: "white",
                              border: "none",
                              borderRadius: "8px",
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}

                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSelectedDocument(file);
                          }
                        }}
                        style={{
                          width: "100%",
                          padding: "8px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: "8px",
                          fontSize: "14px",
                          boxSizing: "border-box",
                        }}
                      />
                      {selectedDocument && (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#10b981",
                            marginTop: "4px",
                          }}
                        >
                          📎 Selected: {selectedDocument.name}
                        </p>
                      )}
                      <p
                        style={{
                          fontSize: "11px",
                          color: "#6b7280",
                          marginTop: "4px",
                        }}
                      >
                        Accepted formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX,
                        TXT (Max 10MB)
                      </p>
                    </div>

                    {/* Role Type Selector */}
                    <div style={{ marginTop: "16px" }}>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "6px",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        Role Type (filters available permissions)
                      </label>
                      <select
                        value={formData.roleType}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            roleType: e.target.value as any,
                          })
                        }
                        style={{
                          width: "100%",
                          height: "40px",
                          padding: "8px 12px",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: "8px",
                          fontSize: "14px",
                          backgroundColor: "#fff",
                          boxSizing: "border-box",
                        }}
                      >
                        <option value="custom">Custom (All Permissions)</option>
                        <option value="super_admin">
                          Super Admin (Full Access)
                        </option>
                        <option value="manager">
                          Manager (User, Ticket, KB, Audit)
                        </option>
                        <option value="agent">
                          Agent (Ticket, KB, Student Support)
                        </option>
                        <option value="student">
                          Student (Basic Ticket & Support)
                        </option>
                      </select>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginTop: "4px",
                        }}
                      >
                        Selecting a role type will show only relevant
                        permissions below
                      </p>
                    </div>

                    {editingRole?.type === "custom" && (
                      <div style={{ marginTop: "16px" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            cursor: "pointer",
                            marginBottom: "12px",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.isMaster}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                isMaster: e.target.checked,
                              })
                            }
                          />
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>
                            Mark as Master Role
                          </span>
                        </label>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginBottom: "12px",
                            marginLeft: "24px",
                          }}
                        >
                          Master roles can be cloned to create new roles with
                          same permissions
                        </p>

                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.isAgent}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                isAgent: e.target.checked,
                              })
                            }
                          />
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>
                            Mark as Agent Role
                          </span>
                        </label>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginTop: "4px",
                            marginLeft: "24px",
                          }}
                        >
                          Agent roles will be included in auto-assignment
                          (round-robin) for tickets
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Project Mapping */}
                  {editingRole?.type !== "system" && (
                    <div
                      style={{
                        marginBottom: "18px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "16px",
                        padding: isMobile ? "12px" : "14px",
                        backgroundColor: "#ffffff",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "16px",
                          fontWeight: "700",
                          marginBottom: "8px",
                          marginTop: 0,
                        }}
                      >
                        Project Mapping
                      </h3>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "#6b7280",
                          marginBottom: "12px",
                        }}
                      >
                        Select which projects this role can be used in. Users
                        with this role will only have access to the checked
                        projects.
                      </p>
                      {(() => {
                        console.log(
                          "🔍 Project Mapping - Projects state:",
                          projects.length,
                          projects,
                        );
                        console.log(
                          "🔍 Project Mapping - Editing role:",
                          editingRole?.name,
                          editingRole?.type,
                        );
                        return null;
                      })()}
                      {projects.length === 0 ? (
                        <p
                          style={{
                            fontSize: "13px",
                            color: "#ef4444",
                            padding: "12px",
                            backgroundColor: "#fef2f2",
                            borderRadius: "6px",
                          }}
                        >
                          No projects available. Create a project first to map
                          roles.
                        </p>
                      ) : (
                        <div
                          style={{
                            position: "relative",
                            padding: "10px",
                            backgroundColor: "#f8fafc",
                            borderRadius: "12px",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setShowRoleProjectDropdown((prev) => !prev)
                            }
                            style={{
                              width: "100%",
                              height: "40px",
                              borderRadius: "8px",
                              border: "1.5px solid #e2e8f0",
                              background: "#fff",
                              cursor: "pointer",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0 12px",
                              fontSize: "14px",
                              color: "#0f172a",
                              fontWeight: 500,
                            }}
                          >
                            <span>
                              {formData.projects.length === 0
                                ? "Select projects"
                                : `${formData.projects.length} project${formData.projects.length > 1 ? "s" : ""} selected`}
                            </span>
                            <MdExpandMore
                              size={20}
                              style={{
                                transform: showRoleProjectDropdown
                                  ? "rotate(180deg)"
                                  : "rotate(0deg)",
                                transition: "transform 0.2s",
                                color: "#64748b",
                              }}
                            />
                          </button>

                          {showRoleProjectDropdown && (
                            <div
                              style={{
                                marginTop: "10px",
                                border: "1.5px solid #e2e8f0",
                                borderRadius: "8px",
                                background: "#fff",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  padding: "10px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <MdSearch size={16} color="#64748b" />
                                <input
                                  type="text"
                                  value={roleProjectSearchTerm}
                                  onChange={(e) =>
                                    setRoleProjectSearchTerm(e.target.value)
                                  }
                                  placeholder="Search project name or code..."
                                  style={{
                                    width: "100%",
                                    height: "36px",
                                    borderRadius: "8px",
                                    border: "1.5px solid #e2e8f0",
                                    padding: "0 10px",
                                    fontSize: "13px",
                                    boxSizing: "border-box",
                                  }}
                                />
                              </div>

                              <div
                                style={{
                                  maxHeight: "220px",
                                  overflowY: "auto",
                                  borderTop: "1px solid #eef2f7",
                                  padding: "8px",
                                  display: "grid",
                                  gap: "6px",
                                }}
                              >
                                {roleProjectOptions.length === 0 && (
                                  <div
                                    style={{
                                      fontSize: "12px",
                                      color: "#64748b",
                                      padding: "6px 4px",
                                    }}
                                  >
                                    No projects found.
                                  </div>
                                )}

                                {roleProjectOptions.map((project) => (
                                  <label
                                    key={project._id}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      cursor: "pointer",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: "8px",
                                      padding: "8px 10px",
                                      backgroundColor:
                                        formData.projects.includes(project._id)
                                          ? "#eef2ff"
                                          : "#fff",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={formData.projects.includes(
                                        project._id,
                                      )}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setFormData({
                                            ...formData,
                                            projects: [
                                              ...formData.projects,
                                              project._id,
                                            ],
                                          });
                                        } else {
                                          setFormData({
                                            ...formData,
                                            projects: formData.projects.filter(
                                              (id) => id !== project._id,
                                            ),
                                          });
                                        }
                                      }}
                                    />
                                    <span style={{ fontSize: "14px" }}>
                                      {project.name}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {formData.projects.length > 0 && (
                            <div
                              style={{
                                marginTop: "8px",
                                fontSize: "12px",
                                color: "#4f46e5",
                                fontWeight: 500,
                              }}
                            >
                              Selected: {formData.projects.length} project
                              {formData.projects.length > 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      )}
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginTop: "8px",
                        }}
                      >
                        {formData.projects.length === 0 ? (
                          <span style={{ color: "#ef4444" }}>
                            ⚠️ No projects selected. This role won't be usable
                            in any project.
                          </span>
                        ) : (
                          <span>
                            ✓ This role is mapped to {formData.projects.length}{" "}
                            project{formData.projects.length > 1 ? "s" : ""}.
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Permissions */}
                  <div
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "16px",
                      padding: isMobile ? "12px" : "14px",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        marginBottom: "14px",
                        marginTop: 0,
                      }}
                    >
                      Permissions{" "}
                      {formData.roleType !== "custom" &&
                        `(${formData.roleType.replace("_", " ").toUpperCase()} role)`}
                      <span
                        style={{
                          marginLeft: "10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#4f46e5",
                          backgroundColor: "#eef2ff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "999px",
                          padding: "2px 8px",
                          verticalAlign: "middle",
                        }}
                      >
                        {selectedFilteredPermissionCount}/
                        {totalFilteredPermissionCount} selected
                      </span>
                    </h3>
                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        overflow: "hidden",
                      }}
                    >
                      {permissionCategoryStats.map(
                        ({ category, modules, total, selected }) => (
                          <div
                            key={category}
                            style={{ borderBottom: "1px solid #e2e8f0" }}
                          >
                            <button
                              type="button"
                              onClick={() => toggleCategory(category)}
                              style={{
                                width: "100%",
                                padding: "12px 16px",
                                backgroundColor: expandedCategories.has(category)
                                  ? "#eef2ff"
                                  : "#f8fafc",
                                border: "none",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                cursor: "pointer",
                                fontSize: "14px",
                                fontWeight: "600",
                                color: expandedCategories.has(category)
                                  ? "#4f46e5"
                                  : "#0f172a",
                                textAlign: "left",
                              }}
                            >
                              <span>{getCategoryLabel(category)}</span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  color: "#475569",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}
                              >
                                <span
                                  style={{
                                    color: selected > 0 ? "#4f46e5" : "#94a3b8",
                                    backgroundColor:
                                      selected > 0 ? "#eef2ff" : "#f1f5f9",
                                    border:
                                      selected > 0
                                        ? "1px solid #e2e8f0"
                                        : "1px solid #e2e8f0",
                                    borderRadius: "999px",
                                    padding: "2px 8px",
                                  }}
                                >
                                  {selected}/{total}
                                </span>
                                {expandedCategories.has(category) ? (
                                  <MdExpandLess size={20} />
                                ) : (
                                  <MdExpandMore size={20} />
                                )}
                              </span>
                            </button>
                            {expandedCategories.has(category) && (
                              <div style={{ padding: "16px" }}>
                                {Object.entries(modules).map(
                                  ([module, permissions]) => {
                                    const modulePermissionIds = permissions.map(
                                      (p) => p._id,
                                    );
                                    const allSelected =
                                      modulePermissionIds.every((id) =>
                                        formData.permissions.includes(id),
                                      );

                                    return (
                                      <div
                                        key={module}
                                        style={{ marginBottom: "16px" }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            marginBottom: "8px",
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={() =>
                                              toggleAllPermissionsInModule(
                                                permissions,
                                              )
                                            }
                                          />
                                          <span
                                            style={{
                                              fontSize: "14px",
                                              fontWeight: "600",
                                              color: "#0f172a",
                                            }}
                                          >
                                            {module}
                                          </span>
                                        </div>
                                        <div
                                          style={{
                                            marginLeft: "28px",
                                            display: "grid",
                                            gap: "8px",
                                          }}
                                        >
                                          {permissions.map((permission) => (
                                            <label
                                              key={permission._id}
                                              style={{
                                                display: "flex",
                                                alignItems: "flex-start",
                                                gap: "8px",
                                                cursor: "pointer",
                                              }}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={formData.permissions.includes(
                                                  permission._id,
                                                )}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setFormData({
                                                      ...formData,
                                                      permissions: [
                                                        ...formData.permissions,
                                                        permission._id,
                                                      ],
                                                    });
                                                  } else {
                                                    setFormData({
                                                      ...formData,
                                                      permissions:
                                                        formData.permissions.filter(
                                                          (id) =>
                                                            id !==
                                                            permission._id,
                                                        ),
                                                    });
                                                  }
                                                }}
                                                style={{ marginTop: "2px" }}
                                              />
                                              <div>
                                                <div
                                                  style={{
                                                    fontSize: "13px",
                                                    color: "#0f172a",
                                                  }}
                                                >
                                                  {permission.name}
                                                </div>
                                                {permission.description && (
                                                  <div
                                                    style={{
                                                      fontSize: "12px",
                                                      color: "#475569",
                                                    }}
                                                  >
                                                    {permission.description}
                                                  </div>
                                                )}
                                              </div>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: isMobile ? "12px" : "14px 24px",
                    borderTop: "1px solid #e2e8f0",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowRoleModal(false);
                      setEditingRole(null);
                      setShowRoleProjectDropdown(false);
                      setRoleProjectSearchTerm("");
                      resetForm();
                    }}
                    style={{
                      height: "40px",
                      padding: "0 16px",
                      backgroundColor: "#fff",
                      color: "#334155",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      height: "40px",
                      padding: "0 16px",
                      background: "linear-gradient(160deg, #4f46e5, #4338ca)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(67,56,202,.35)",
                    }}
                  >
                    <MdSave size={18} />
                    {editingRole ? "Update Role" : "Create Role"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Clone Role Modal */}
        {showCloneModal && cloneMasterRole && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: isMobile ? "12px" : "20px",
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "20px",
                width: "100%",
                maxWidth: "500px",
                maxHeight: "90vh",
                border: "1px solid #e2e8f0",
                boxShadow:
                  "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: isMobile ? "16px" : "18px 24px",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#f8fafc",
                }}
              >
                <h2
                  style={{
                    fontSize: isMobile ? "18px" : "20px",
                    fontWeight: 700,
                    margin: 0,
                    color: "#0f172a",
                  }}
                >
                  Clone Role
                </h2>
                <button
                  onClick={() => {
                    setShowCloneModal(false);
                    setCloneMasterRole(null);
                    setShowCloneProjectDropdown(false);
                    setCloneProjectSearchTerm("");
                    resetForm();
                  }}
                  style={{
                    background: "#fff",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "8px",
                    width: "34px",
                    height: "34px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MdClose size={24} />
                </button>
              </div>

              <form
                onSubmit={handleCloneRole}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    padding: isMobile ? "14px" : "18px 24px",
                    overflowY: "auto",
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "#eef2ff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      marginBottom: "16px",
                      fontSize: "14px",
                      color: "#4f46e5",
                    }}
                  >
                    Cloning from: <strong>{cloneMasterRole.name}</strong>
                    <br />
                    All permissions will be copied to the new role.
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "6px",
                        fontSize: "14px",
                        fontWeight: "500",
                      }}
                    >
                      New Role Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        // Auto-generate code from name
                        const autoCode = newName
                          .toUpperCase()
                          .replace(/\s+/g, "_")
                          .replace(/[^A-Z0-9_]/g, "");
                        setFormData({
                          ...formData,
                          name: newName,
                          code: autoCode,
                        });
                      }}
                      style={{
                        width: "100%",
                        height: "40px",
                        padding: "8px 12px",
                        border: "1.5px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "6px",
                        fontSize: "14px",
                        fontWeight: "500",
                      }}
                    >
                      Code *{" "}
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          fontWeight: "400",
                        }}
                      >
                        (auto-generated)
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      style={{
                        width: "100%",
                        height: "40px",
                        padding: "8px 12px",
                        border: "1.5px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "14px",
                        backgroundColor: "#fff",
                        boxSizing: "border-box",
                      }}
                      placeholder="Auto-generated from name"
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "6px",
                        fontSize: "14px",
                        fontWeight: "500",
                      }}
                    >
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1.5px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "14px",
                        resize: "vertical",
                        boxSizing: "border-box",
                        minHeight: "88px",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "6px",
                        fontSize: "14px",
                        fontWeight: "500",
                      }}
                    >
                      Assign to Projects
                    </label>
                    <div
                      style={{
                        position: "relative",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        padding: "10px",
                        backgroundColor: "#f8fafc",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setShowCloneProjectDropdown((prev) => !prev)
                        }
                        style={{
                          width: "100%",
                          height: "40px",
                          borderRadius: "8px",
                          border: "1.5px solid #e2e8f0",
                          background: "#fff",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0 12px",
                          fontSize: "14px",
                          color: "#0f172a",
                          fontWeight: 500,
                        }}
                      >
                        <span>
                          {formData.projects.length === 0
                            ? "Select projects"
                            : `${formData.projects.length} project${formData.projects.length > 1 ? "s" : ""} selected`}
                        </span>
                        <MdExpandMore
                          size={20}
                          style={{
                            transform: showCloneProjectDropdown
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                            transition: "transform 0.2s",
                            color: "#64748b",
                          }}
                        />
                      </button>

                      {showCloneProjectDropdown && (
                        <div
                          style={{
                            marginTop: "10px",
                            border: "1.5px solid #e2e8f0",
                            borderRadius: "8px",
                            background: "#fff",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              padding: "10px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <MdSearch size={16} color="#64748b" />
                            <input
                              type="text"
                              value={cloneProjectSearchTerm}
                              onChange={(e) =>
                                setCloneProjectSearchTerm(e.target.value)
                              }
                              placeholder="Search project name or code..."
                              style={{
                                width: "100%",
                                height: "36px",
                                borderRadius: "8px",
                                border: "1.5px solid #e2e8f0",
                                padding: "0 10px",
                                fontSize: "13px",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>

                          <div
                            style={{
                              maxHeight: "220px",
                              overflowY: "auto",
                              borderTop: "1px solid #eef2f7",
                              padding: "8px",
                              display: "grid",
                              gap: "6px",
                            }}
                          >
                            {cloneProjectOptions.length === 0 && (
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#64748b",
                                  padding: "6px 4px",
                                }}
                              >
                                No projects found.
                              </div>
                            )}

                            {cloneProjectOptions.map((project) => (
                              <label
                                key={project._id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  cursor: "pointer",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                  padding: "8px 10px",
                                  backgroundColor: formData.projects.includes(
                                    project._id,
                                  )
                                    ? "#eef2ff"
                                    : "#fff",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.projects.includes(
                                    project._id,
                                  )}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({
                                        ...formData,
                                        projects: [
                                          ...formData.projects,
                                          project._id,
                                        ],
                                      });
                                    } else {
                                      setFormData({
                                        ...formData,
                                        projects: formData.projects.filter(
                                          (id) => id !== project._id,
                                        ),
                                      });
                                    }
                                  }}
                                />
                                <span style={{ fontSize: "14px" }}>
                                  {project.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {formData.projects.length > 0 && (
                        <div
                          style={{
                            marginTop: "8px",
                            fontSize: "12px",
                            color: "#4f46e5",
                            fontWeight: 500,
                          }}
                        >
                          Selected: {formData.projects.length} project
                          {formData.projects.length > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: isMobile ? "12px" : "14px 24px",
                    borderTop: "1px solid #e2e8f0",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowCloneModal(false);
                      setCloneMasterRole(null);
                      setShowCloneProjectDropdown(false);
                      setCloneProjectSearchTerm("");
                      resetForm();
                    }}
                    style={{
                      height: "40px",
                      padding: "0 16px",
                      backgroundColor: "#fff",
                      color: "#334155",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      height: "40px",
                      padding: "0 16px",
                      backgroundColor: "#059669",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(5, 150, 105, 0.25)",
                    }}
                  >
                    <MdContentCopy size={18} />
                    Clone Role
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Bulk Delete Confirmation Modal */}
        {showBulkDeleteConfirm && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2000,
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "20px",
                width: "90%",
                maxWidth: "500px",
                padding: "28px",
                boxShadow:
                  "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    backgroundColor: "#fef2f2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <MdDelete size={22} color="#ef4444" />
                </div>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#0f172a",
                    }}
                  >
                    Delete {selectedRoleIds.size} Role
                    {selectedRoleIds.size > 1 ? "s" : ""}
                  </h3>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "13px",
                      color: "#475569",
                    }}
                  >
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: "#fef9f9",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#374151",
                    textTransform: "uppercase",
                  }}
                >
                  Roles to be deleted:
                </p>
                {roles
                  .filter((r) => selectedRoleIds.has(r._id))
                  .map((r) => (
                    <div
                      key={r._id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 0",
                        borderBottom: "1px solid #fee2e2",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: "600",
                          fontSize: "14px",
                          color: "#0f172a",
                          flex: 1,
                        }}
                      >
                        {r.name}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#6b7280",
                          backgroundColor: "#f3f4f6",
                          padding: "2px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {r.code}
                      </span>
                      {r.agentCount > 0 && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#b45309",
                            backgroundColor: "#fef3c7",
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          ⚠ {r.agentCount} user{r.agentCount > 1 ? "s" : ""}{" "}
                          assigned
                        </span>
                      )}
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
                    padding: "9px 20px",
                    background: "#fff",
                    color: "#334155",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDeleteRoles}
                  disabled={bulkDeleting}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 20px",
                    background: bulkDeleting ? "#fca5a5" : "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: bulkDeleting ? "not-allowed" : "pointer",
                  }}
                >
                  <MdDelete size={16} />
                  {bulkDeleting
                    ? "Deleting..."
                    : `Delete ${selectedRoleIds.size} Role${selectedRoleIds.size > 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default RBACSetup;
