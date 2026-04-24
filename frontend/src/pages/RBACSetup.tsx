import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdContentCopy,
  MdStar,
  MdStarBorder,
  MdClose,
  MdSave,
  MdExpandMore,
  MdExpandLess,
} from "react-icons/md";
import DashboardLayout from "../components/DashboardLayout";
import ModuleHeader from "../components/ModuleHeader";
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

    // Report permissions that are managed internally by the Report module
    // (Assign is handled by Report > Assign Reports; others are internal)
    // Only REPORT_VIEW_TICKETS is exposed in RBAC so admins can gate access to the module.
    const REPORT_PERMISSIONS_HIDDEN_IN_RBAC = new Set([
      "REPORT_VIEW_AGENT_PERFORMANCE",
      "REPORT_VIEW_CSAT",
      "REPORT_VIEW_SLA",
      "REPORT_EXPORT",
      "REPORT_CREATE_CUSTOM",
      "REPORT_SCHEDULE",
      "REPORT_ASSIGN",
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
      <div style={{ padding: "24px" }}>
        <ModuleHeader
          title="RBAC Setup"
          subtitle="Manage roles and permissions"
        />

        <div
          style={{
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
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
                padding: "10px 20px",
                background: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(239, 68, 68, 0.35)",
              }}
            >
              <MdDelete size={18} />
              Delete Selected ({selectedRoleIds.size})
            </button>
          )}
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={() => {
                setEditingRole(null);
                resetForm();
                setShowRoleModal(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: "0 4px 15px rgba(102, 126, 234, 0.4)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 20px rgba(102, 126, 234, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 15px rgba(102, 126, 234, 0.4)";
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
            marginBottom: "24px",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: "1",
              minWidth: "250px",
              padding: "10px 16px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            {["all", "master", "system", "custom"].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type as any)}
                style={{
                  padding: "10px 16px",
                  backgroundColor: filterType === type ? "#3b82f6" : "white",
                  color: filterType === type ? "white" : "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {type}
              </button>
            ))}
          </div>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={{
              padding: "10px 16px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              color: filterProject === "all" ? "#6b7280" : "#111827",
              background: "white",
              cursor: "pointer",
              minWidth: "180px",
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

        {/* Roles Table */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  backgroundColor: "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <th style={{ padding: "12px 16px", width: "40px" }}>
                  <input
                    type="checkbox"
                    title="Select all deletable roles"
                    checked={
                      filteredRoles.filter((r) => r.type === "custom").length >
                        0 &&
                      filteredRoles
                        .filter((r) => r.type === "custom")
                        .every((r) => selectedRoleIds.has(r._id))
                    }
                    onChange={toggleSelectAllRoles}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Master
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Role Name
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Code
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Permissions
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Projects
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
                  }}
                >
                  Agents
                </th>
                <th
                  style={{
                    padding: "12px 16px",
                    textAlign: "right",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6b7280",
                    textTransform: "uppercase",
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
                    borderBottom: "1px solid #e5e7eb",
                    background: selectedRoleIds.has(role._id)
                      ? "#fef2f2"
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
                        color: role.isMaster ? "#f59e0b" : "#d1d5db",
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
                      <div style={{ fontWeight: "500", color: "#111827" }}>
                        {role.name}
                      </div>
                      {role.description && (
                        <div style={{ fontSize: "12px", color: "#6b7280" }}>
                          {role.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "#6b7280",
                      fontSize: "14px",
                    }}
                  >
                    {role.code}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "500",
                        backgroundColor:
                          role.type === "system" ? "#dbeafe" : "#fef3c7",
                        color: role.type === "system" ? "#1e40af" : "#92400e",
                      }}
                    >
                      {role.type}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "#6b7280",
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
                      color: "#6b7280",
                      fontSize: "14px",
                    }}
                  >
                    {role.projects?.length || 0}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "#6b7280",
                      fontSize: "14px",
                    }}
                  >
                    {role.agentCount || 0}
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
                            padding: "6px",
                            backgroundColor: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "#10b981",
                          }}
                          title="Clone Role"
                        >
                          <MdContentCopy size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(role)}
                        style={{
                          padding: "6px",
                          backgroundColor: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "#3b82f6",
                        }}
                        title="Edit Role"
                      >
                        <MdEdit size={18} />
                      </button>
                      {role.type === "custom" && (
                        <button
                          onClick={() => handleDeleteRole(role._id)}
                          style={{
                            padding: "6px",
                            backgroundColor: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "#ef4444",
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

        {/* Create/Edit Role Modal */}
        {showRoleModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                width: "90%",
                maxWidth: "900px",
                maxHeight: "90vh",
                overflow: "auto",
              }}
            >
              <div
                style={{
                  padding: "20px 24px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h2 style={{ fontSize: "20px", fontWeight: "600" }}>
                  {editingRole ? "Edit Role" : "Create New Role"}
                </h2>
                <button
                  onClick={() => {
                    setShowRoleModal(false);
                    setEditingRole(null);
                    resetForm();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <MdClose size={24} />
                </button>
              </div>

              <form
                onSubmit={editingRole ? handleUpdateRole : handleCreateRole}
              >
                <div style={{ padding: "24px" }}>
                  {/* Basic Info */}
                  <div style={{ marginBottom: "24px" }}>
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        marginBottom: "16px",
                      }}
                    >
                      Basic Information
                    </h3>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
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
                            padding: "8px 12px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            fontSize: "14px",
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
                            padding: "8px 12px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            fontSize: "14px",
                            backgroundColor:
                              editingRole?.type === "system"
                                ? "#f3f4f6"
                                : "#f9fafb",
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
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          fontSize: "14px",
                          resize: "vertical",
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
                            backgroundColor: "#eff6ff",
                            border: "1px solid #3b82f6",
                            borderRadius: "6px",
                            marginBottom: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
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
                                color: "#3b82f6",
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
                              backgroundColor: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
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
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          fontSize: "14px",
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
                          padding: "8px 12px",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          fontSize: "14px",
                          backgroundColor: "white",
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
                    <div style={{ marginBottom: "24px" }}>
                      <h3
                        style={{
                          fontSize: "16px",
                          fontWeight: "600",
                          marginBottom: "8px",
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
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill, minmax(250px, 1fr))",
                            gap: "12px",
                            padding: "16px",
                            backgroundColor: "#f9fafb",
                            borderRadius: "6px",
                            border: "1px solid #e5e7eb",
                          }}
                        >
                          {projects.map((project) => (
                            <label
                              key={project._id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                cursor: "pointer",
                                padding: "8px 12px",
                                backgroundColor: formData.projects.includes(
                                  project._id,
                                )
                                  ? "#eff6ff"
                                  : "white",
                                borderRadius: "6px",
                                border: formData.projects.includes(project._id)
                                  ? "1px solid #3b82f6"
                                  : "1px solid #e5e7eb",
                                transition: "all 0.2s",
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
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  cursor: "pointer",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: formData.projects.includes(
                                    project._id,
                                  )
                                    ? "500"
                                    : "400",
                                }}
                              >
                                {project.name}
                              </span>
                            </label>
                          ))}
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
                  <div>
                    <h3
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        marginBottom: "16px",
                      }}
                    >
                      Permissions{" "}
                      {formData.roleType !== "custom" &&
                        `(${formData.roleType.replace("_", " ").toUpperCase()} role)`}
                    </h3>
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        overflow: "hidden",
                      }}
                    >
                      {Object.entries(
                        getFilteredPermissions(
                          groupedPermissions,
                          formData.roleType,
                        ),
                      ).map(([category, modules]) => (
                        <div
                          key={category}
                          style={{ borderBottom: "1px solid #e5e7eb" }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleCategory(category)}
                            style={{
                              width: "100%",
                              padding: "12px 16px",
                              backgroundColor: "#f9fafb",
                              border: "none",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              cursor: "pointer",
                              fontSize: "14px",
                              fontWeight: "600",
                              textAlign: "left",
                            }}
                          >
                            <span>{getCategoryLabel(category)}</span>
                            {expandedCategories.has(category) ? (
                              <MdExpandLess size={20} />
                            ) : (
                              <MdExpandMore size={20} />
                            )}
                          </button>
                          {expandedCategories.has(category) && (
                            <div style={{ padding: "16px" }}>
                              {Object.entries(modules).map(
                                ([module, permissions]) => {
                                  const modulePermissionIds = permissions.map(
                                    (p) => p._id,
                                  );
                                  const allSelected = modulePermissionIds.every(
                                    (id) => formData.permissions.includes(id),
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
                                            color: "#374151",
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
                                                          id !== permission._id,
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
                                                  color: "#374151",
                                                }}
                                              >
                                                {permission.name}
                                              </div>
                                              {permission.description && (
                                                <div
                                                  style={{
                                                    fontSize: "12px",
                                                    color: "#6b7280",
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
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "16px 24px",
                    borderTop: "1px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowRoleModal(false);
                      setEditingRole(null);
                      resetForm();
                    }}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "white",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "500",
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
                      padding: "8px 16px",
                      backgroundColor: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: "pointer",
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
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                width: "90%",
                maxWidth: "500px",
              }}
            >
              <div
                style={{
                  padding: "20px 24px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h2 style={{ fontSize: "20px", fontWeight: "600" }}>
                  Clone Role
                </h2>
                <button
                  onClick={() => {
                    setShowCloneModal(false);
                    setCloneMasterRole(null);
                    resetForm();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <MdClose size={24} />
                </button>
              </div>

              <form onSubmit={handleCloneRole}>
                <div style={{ padding: "24px" }}>
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "#eff6ff",
                      borderRadius: "6px",
                      marginBottom: "16px",
                      fontSize: "14px",
                      color: "#1e40af",
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
                        padding: "8px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "14px",
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
                        padding: "8px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "14px",
                        backgroundColor: "#f9fafb",
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
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "14px",
                        resize: "vertical",
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
                    <div style={{ display: "grid", gap: "8px" }}>
                      {projects.map((project) => (
                        <label
                          key={project._id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.projects.includes(project._id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  projects: [...formData.projects, project._id],
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
                </div>

                <div
                  style={{
                    padding: "16px 24px",
                    borderTop: "1px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "12px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowCloneModal(false);
                      setCloneMasterRole(null);
                      resetForm();
                    }}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "white",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "500",
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
                      padding: "8px 16px",
                      backgroundColor: "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: "pointer",
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
                borderRadius: "12px",
                width: "90%",
                maxWidth: "500px",
                padding: "28px",
                boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
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
                      color: "#111827",
                    }}
                  >
                    Delete {selectedRoleIds.size} Role
                    {selectedRoleIds.size > 1 ? "s" : ""}
                  </h3>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "13px",
                      color: "#6b7280",
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
                          color: "#111827",
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
                    background: "white",
                    color: "#374151",
                    border: "1px solid #d1d5db",
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
