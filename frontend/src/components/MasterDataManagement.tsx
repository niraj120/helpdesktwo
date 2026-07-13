import { useState, useEffect, useRef } from "react";
import axios from "axios";
import DashboardLayout from "./DashboardLayout";
import MDMConfigModal from "./MDMConfigModal";
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdSave,
  MdClose,
  MdSearch,
  MdUploadFile,
} from "react-icons/md";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";
import { API_CONFIG } from "../config/constants";

interface MasterItem {
  _id: string;
  key?: string;
  value?: string;
  name?: string;
  code?: string;
  country?: string;
  state?: string;
  displayOrder?: number;
  isActive: boolean;
  color?: string;
  icon?: string;
  projectId?: string;
  isClosed?: boolean;
  description?: string;
  defaultPriority?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Priority {
  _id: string;
  name: string;
  code: string;
  color?: string;
}

interface Project {
  _id: string;
  name: string;
  code: string;
  projectId: string;
}

const MASTER_CATEGORIES = [
  {
    key: "countries",
    label: "Countries",
    icon: "🌍",
    api: "/api/master/countries",
    requiresProject: false,
  },
  {
    key: "states",
    label: "States",
    icon: "🗺️",
    api: "/api/master/states",
    requiresProject: false,
  },
  {
    key: "cities",
    label: "Cities",
    icon: "🏙️",
    api: "/api/master/cities",
    requiresProject: false,
  },
  {
    key: "categories",
    label: "Categories",
    icon: "📁",
    api: "/api/categories/project",
    requiresProject: true,
  },
  {
    key: "assetCategories",
    label: "Asset Categories",
    icon: "📦",
    api: "/api/asset-categories/project",
    requiresProject: true,
  },
  {
    key: "statuses",
    label: "Status",
    icon: "🏷️",
    api: "/api/statuses/project",
    requiresProject: true,
  },
  {
    key: "departments",
    label: "Departments",
    icon: "🏢",
    api: "/api/departments/project",
    requiresProject: true,
  },
  {
    key: "companies",
    label: "Companies",
    icon: "🏭",
    api: "/api/master/companies",
    requiresProject: false,
  },
];

const MasterDataManagement = () => {
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState("countries");
  const [items, setItems] = useState<MasterItem[]>([]);
  const [showMdmModal, setShowMdmModal] = useState(false);

  // Refs to prevent duplicate API calls from React.StrictMode
  const hasFetchedCountries = useRef(false);
  const hasFetchedStates = useRef(false);
  const hasFetchedProjects = useRef(false);
  const [countries, setCountries] = useState<MasterItem[]>([]);
  const [states, setStates] = useState<MasterItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [bulkUploadProjectId, setBulkUploadProjectId] = useState("");
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadResult, setBulkUploadResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [editingItem, setEditingItem] = useState<MasterItem | null>(null);
  const [formData, setFormData] = useState<any>({
    key: "",
    value: "",
    name: "",
    code: "",
    country: "",
    state: "",
    displayOrder: 0,
    color: "#3b82f6",
    icon: "",
    description: "",
    defaultPriority: "",
    isActive: true,
  });

  const currentCategory = MASTER_CATEGORIES.find((c) => c.key === activeTab);
  const isMobile = viewportWidth <= 768;
  const isNarrowMobile = viewportWidth <= 420;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Fetch reference data for dropdowns
  useEffect(() => {
    // Prevent duplicate calls from React.StrictMode
    if (!hasFetchedCountries.current) {
      fetchCountries();
      hasFetchedCountries.current = true;
    }
    if (!hasFetchedStates.current) {
      fetchStates();
      hasFetchedStates.current = true;
    }
    if (!hasFetchedProjects.current) {
      fetchProjects();
      hasFetchedProjects.current = true;
    }
  }, []);

  useEffect(() => {
    const category = MASTER_CATEGORIES.find((c) => c.key === activeTab);
    if (category?.requiresProject && !selectedProjectId) {
      // Don't fetch if project is required but not selected
      setItems([]);
      return;
    }
    setSearchTerm("");
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedProjectId]);

  const filteredItems = items.filter((item) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      item.key,
      item.value,
      item.name,
      item.code,
      item.country,
      item.state,
      item.description,
      item.defaultPriority,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const activeItems = items.filter((item) => item.isActive).length;
  const inactiveItems = items.length - activeItems;
  const selectedProjectName =
    projects.find((p) => p._id === selectedProjectId)?.name || "Not selected";

  const statsCards = [
    {
      label: "Total Records",
      value: items.length,
      icon: "📚",
      bg: "#F4F3FF",
    },
    {
      label: "Active",
      value: activeItems,
      icon: "✅",
      bg: "#ECFDF3",
    },
    {
      label: "Inactive",
      value: inactiveItems,
      icon: "⛔",
      bg: "#FEF2F2",
    },
    {
      label: currentCategory?.requiresProject
        ? "Project Scope"
        : "Master Scope",
      value: currentCategory?.requiresProject ? selectedProjectName : "Global",
      icon: currentCategory?.requiresProject ? "🏢" : "🌐",
      bg: "#EFF8FF",
    },
  ];

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects?limit=1000`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.data.success) {
        const projectsList = response.data.data?.projects || [];
        setProjects(projectsList);
        // Auto-select first project for categories/statuses
        if (projectsList.length > 0 && !selectedProjectId) {
          setSelectedProjectId(projectsList[0]._id);
        }
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  const fetchCountries = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/master/countries?includeInactive=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.data.success) {
        setCountries(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching countries:", error);
    }
  };

  const fetchStates = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/master/states?includeInactive=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.data.success) {
        setStates(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching states:", error);
    }
  };

  const fetchPriorities = async () => {
    if (!selectedProjectId) return;
    try {
      const token = localStorage.getItem("authToken");
      // Fetch priorities from SLA rules for this project
      const response = await axios.get(
        `${API_CONFIG.API_URL}/sla-rules?projectId=${selectedProjectId}&isActive=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.data.success && response.data.data) {
        // Use SLA rule names as priorities (e.g., "High", "Medium", "Low")
        const prioritiesFromRules = response.data.data.map((rule: any) => ({
          _id: rule._id,
          code: rule.name.toLowerCase(),
          name: rule.name,
          color: undefined, // SLA rules don't have colors
        }));
        setPriorities(prioritiesFromRules);
      }
    } catch (error) {
      console.error("Error fetching priorities from SLA rules:", error);
    }
  };

  // Fetch priorities when project changes
  useEffect(() => {
    if (selectedProjectId) {
      fetchPriorities();
    }
  }, [selectedProjectId]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");

      // Build URL based on whether category requires project
      let url: string;
      if (currentCategory?.requiresProject && selectedProjectId) {
        url = `${API_CONFIG.BASE_URL}${currentCategory.api}/${selectedProjectId}?includeInactive=true`;
      } else if (currentCategory?.requiresProject && !selectedProjectId) {
        // Project required but not selected
        setItems([]);
        setLoading(false);
        return;
      } else {
        url = `${API_CONFIG.BASE_URL}${currentCategory?.api}?includeInactive=true`;
      }

      console.log(`Fetching ${currentCategory?.label} from:`, url);
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log(`${currentCategory?.label} response:`, response.data);

      if (response.data.success) {
        const fetchedData = response.data.data || [];
        console.log(
          `Loaded ${fetchedData.length} ${currentCategory?.label}:`,
          fetchedData,
        );
        setItems(fetchedData);
      }
    } catch (error) {
      console.error(`Error fetching ${currentCategory?.label}:`, error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    setFormData({
      key: "",
      value: "",
      name: "",
      code: "",
      country: "",
      state: "",
      displayOrder: 0,
      color: "#3b82f6",
      description: "",
      defaultPriority: "",
      isActive: true,
    });
    setShowModal(true);
  };

  const handleEdit = (item: MasterItem) => {
    setEditingItem(item);
    setFormData({
      key: item.key || "",
      value: item.value || item.name || "",
      name: item.name || "",
      code: item.code || "",
      country: item.country || "",
      state: item.state || "",
      displayOrder: item.displayOrder || 0,
      color: item.color || "#3b82f6",
      description: item.description || "",
      isActive: item.isActive,
      isClosed: item.isClosed || false,
      defaultPriority: item.defaultPriority || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("authToken");

      // Determine URL and method based on master type and edit mode
      let url: string;
      let method: "post" | "put";

      if (
        activeTab === "categories" ||
        activeTab === "statuses" ||
        activeTab === "assetCategories" ||
        activeTab === "departments"
      ) {
        // Categories, Asset Categories, Status, and Departments have different URL patterns
        if (editingItem) {
          // Update: PUT /api/categories/:id or PUT /api/statuses/:id or PUT /api/asset-categories/:id or PUT /api/departments/:id
          let baseApi = "/api/categories";
          if (activeTab === "statuses") baseApi = "/api/statuses";
          if (activeTab === "assetCategories")
            baseApi = "/api/asset-categories";
          if (activeTab === "departments") baseApi = "/api/departments";
          url = `${API_CONFIG.BASE_URL}${baseApi}/${editingItem._id}`;
          method = "put";
        } else {
          // Create: POST /api/categories/project/:projectId or .../statuses/... or .../departments/...
          if (!selectedProjectId) {
            alert("Please select a project first");
            return;
          }
          url = `${API_CONFIG.BASE_URL}${currentCategory?.api}/${selectedProjectId}`;
          method = "post";
        }
      } else {
        // Countries, States, Cities use consistent pattern
        url = editingItem
          ? `${API_CONFIG.BASE_URL}${currentCategory?.api}/${editingItem._id}`
          : `${API_CONFIG.BASE_URL}${currentCategory?.api}`;
        method = editingItem ? "put" : "post";
      }

      // Prepare data based on master type
      let data: any = {};

      if (activeTab === "countries") {
        data = {
          key: formData.key,
          value: formData.value,
          code: formData.code,
          displayOrder: formData.displayOrder,
          isActive: formData.isActive,
        };
      } else if (activeTab === "states") {
        data = {
          key: formData.key,
          value: formData.value,
          country: formData.country,
          displayOrder: formData.displayOrder,
          isActive: formData.isActive,
        };
      } else if (activeTab === "cities") {
        data = {
          key: formData.key,
          value: formData.value,
          state: formData.state,
          country: formData.country,
          displayOrder: formData.displayOrder,
          isActive: formData.isActive,
        };
      } else if (activeTab === "categories") {
        data = {
          name: formData.name,
          description: formData.description,
          color: formData.color,
          defaultPriority: formData.defaultPriority,
          isActive: formData.isActive,
        };
      } else if (activeTab === "assetCategories") {
        data = {
          name: formData.name,
          description: formData.description,
          color: formData.color,
          icon: formData.icon,
          isActive: formData.isActive,
        };
      } else if (activeTab === "statuses") {
        data = {
          name: formData.name,
          code: formData.code.toUpperCase(),
          color: formData.color,
          description: formData.description,
          isClosed: formData.isClosed,
          displayOrder: formData.displayOrder,
          isActive: formData.isActive,
        };
      } else if (activeTab === "departments") {
        data = {
          name: formData.name,
          description: formData.description,
          isActive: formData.isActive,
        };
      } else if (activeTab === "companies") {
        data = {
          name: formData.name,
          isActive: formData.isActive,
        };
      }

      await axios[method](url, data, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setShowModal(false);
      fetchItems();
      if (activeTab === "countries") fetchCountries();
      if (activeTab === "states") fetchStates();
    } catch (error: any) {
      alert(error.response?.data?.message || "Error saving data");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;

    try {
      const token = localStorage.getItem("authToken");

      // Categories and Status use /:id directly, others use the API path + /:id
      let url: string;
      if (activeTab === "categories") {
        url = `${API_CONFIG.API_URL}/categories/${id}`;
      } else if (activeTab === "statuses") {
        url = `${API_CONFIG.API_URL}/statuses/${id}`;
      } else if (activeTab === "assetCategories") {
        url = `${API_CONFIG.API_URL}/asset-categories/${id}`;
      } else if (activeTab === "departments") {
        url = `${API_CONFIG.API_URL}/departments/${id}`;
      } else {
        url = `${API_CONFIG.BASE_URL}${currentCategory?.api}/${id}`;
      }

      await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchItems();
    } catch (error: any) {
      alert(error.response?.data?.message || "Error deleting data");
    }
  };

  const getColumnCount = () => {
    if (activeTab === "cities") return 6;
    if (activeTab === "statuses") return 6;
    if (activeTab === "assetCategories") return 6;
    if (activeTab === "countries") return 5;
    if (activeTab === "states") return 5;
    if (activeTab === "categories") return 5;
    if (activeTab === "departments") return 4;
    if (activeTab === "companies") return 3;
    return 6;
  };

  const getBulkTemplateHeaders = () => {
    switch (activeTab) {
      case "countries":
        return ["key", "value", "code", "displayOrder", "isActive"];
      case "states":
        return ["country", "key", "value", "displayOrder", "isActive"];
      case "cities":
        return ["country", "state", "key", "value", "displayOrder", "isActive"];
      case "categories":
        return ["name", "description", "color", "defaultPriority", "isActive"];
      case "assetCategories":
        return ["name", "description", "color", "icon", "isActive"];
      case "statuses":
        return [
          "name",
          "code",
          "color",
          "description",
          "isClosed",
          "displayOrder",
          "isActive",
        ];
      case "departments":
        return ["name", "description", "isActive"];
      default:
        return ["name", "isActive"];
    }
  };

  const downloadBulkTemplate = () => {
    const headers = getBulkTemplateHeaders();
    const sampleRow = headers
      .map((h) => {
        if (h === "isActive") return "true";
        if (h === "displayOrder") return "0";
        if (h === "color") return "#3b82f6";
        return "";
      })
      .join(",");
    const csvContent = `${headers.join(",")}\n${sampleRow}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}-bulk-template.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const parseBoolean = (value: string | undefined, defaultValue = true) => {
    if (!value) return defaultValue;
    const normalized = value.toLowerCase().trim();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
    return defaultValue;
  };

  const parseCsvRows = (content: string) => {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || "";
      });
      return row;
    });
  };

  const mapBulkRowToPayload = (row: Record<string, string>) => {
    if (activeTab === "countries") {
      return {
        key: row.key,
        value: row.value,
        code: row.code,
        displayOrder: Number(row.displayOrder || 0),
        isActive: parseBoolean(row.isActive, true),
      };
    }
    if (activeTab === "states") {
      return {
        country: row.country,
        key: row.key,
        value: row.value,
        displayOrder: Number(row.displayOrder || 0),
        isActive: parseBoolean(row.isActive, true),
      };
    }
    if (activeTab === "cities") {
      return {
        country: row.country,
        state: row.state,
        key: row.key,
        value: row.value,
        displayOrder: Number(row.displayOrder || 0),
        isActive: parseBoolean(row.isActive, true),
      };
    }
    if (activeTab === "categories") {
      return {
        name: row.name,
        description: row.description,
        color: row.color || "#3b82f6",
        defaultPriority: row.defaultPriority || "",
        isActive: parseBoolean(row.isActive, true),
      };
    }
    if (activeTab === "assetCategories") {
      return {
        name: row.name,
        description: row.description,
        color: row.color || "#3b82f6",
        icon: row.icon || "📦",
        isActive: parseBoolean(row.isActive, true),
      };
    }
    if (activeTab === "statuses") {
      return {
        name: row.name,
        code: (row.code || "").toUpperCase(),
        color: row.color || "#3b82f6",
        description: row.description || "",
        isClosed: parseBoolean(row.isClosed, false),
        displayOrder: Number(row.displayOrder || 0),
        isActive: parseBoolean(row.isActive, true),
      };
    }
    if (activeTab === "departments") {
      return {
        name: row.name,
        description: row.description,
        isActive: parseBoolean(row.isActive, true),
      };
    }
    return row;
  };

  const handleBulkUpload = async () => {
    if (!bulkUploadFile) {
      alert("Please select a CSV file");
      return;
    }

    const effectiveProjectId = currentCategory?.requiresProject
      ? bulkUploadProjectId || selectedProjectId
      : "";

    if (currentCategory?.requiresProject && !effectiveProjectId) {
      alert("Please select a project for bulk upload");
      return;
    }

    try {
      setBulkUploading(true);
      setBulkUploadResult(null);
      const token = localStorage.getItem("authToken");
      const content = await bulkUploadFile.text();
      const rows = parseCsvRows(content);

      if (!rows.length) {
        alert("CSV file is empty or invalid");
        return;
      }

      const errors: string[] = [];
      let success = 0;
      let failed = 0;

      const createUrl = currentCategory?.requiresProject
        ? `${API_CONFIG.BASE_URL}${currentCategory?.api}/${effectiveProjectId}`
        : `${API_CONFIG.BASE_URL}${currentCategory?.api}`;

      for (let idx = 0; idx < rows.length; idx += 1) {
        try {
          const payload = mapBulkRowToPayload(rows[idx]);
          await axios.post(createUrl, payload, {
            headers: { Authorization: `Bearer ${token}` },
          });
          success += 1;
        } catch (error: any) {
          failed += 1;
          const message =
            error.response?.data?.message || error.message || "Upload failed";
          if (errors.length < 10) {
            errors.push(`Row ${idx + 2}: ${message}`);
          }
        }
      }

      setBulkUploadResult({ success, failed, errors });
      fetchItems();
      if (activeTab === "countries") fetchCountries();
      if (activeTab === "states") fetchStates();
    } finally {
      setBulkUploading(false);
    }
  };

  const renderActiveBadge = (isActive: boolean) => (
    <span
      style={{
        padding: "4px 12px",
        borderRadius: "12px",
        fontSize: "12px",
        background: isActive ? "#dcfce7" : "#fee2e2",
        color: isActive ? "#166534" : "#991b1b",
        fontWeight: 600,
      }}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );

  const renderRow = (label: string, value: React.ReactNode) => (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        alignItems: isMobile ? "flex-start" : "center",
        gap: "10px",
        padding: "6px 0",
        borderBottom: "1px dashed #e2e8f0",
      }}
    >
      <span style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "13px",
          color: "#0f172a",
          textAlign: isMobile ? "left" : "right",
          width: isMobile ? "100%" : "auto",
          wordBreak: "break-word",
        }}
      >
        {value || "-"}
      </span>
    </div>
  );

  const renderActionButtons = (item: MasterItem) => (
    <div
      style={{
        display: "flex",
        gap: "8px",
        justifyContent: "flex-end",
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}
    >
      {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
        <button
          onClick={() => handleEdit(item)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "8px",
            border: "none",
            background: "#eef2ff",
            color: "#4f46e5",
            borderRadius: "8px",
            cursor: "pointer",
            flex: isMobile ? "1 1 120px" : "0 0 auto",
          }}
        >
          <MdEdit size={18} />
          {isMobile && "Edit"}
        </button>
      )}
      {hasPermission(PERMISSIONS.MASTER_DATA_DELETE) && (
        <button
          onClick={() => handleDelete(item._id)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "8px",
            border: "none",
            background: "#fee2e2",
            color: "#991b1b",
            borderRadius: "8px",
            cursor: "pointer",
            flex: isMobile ? "1 1 120px" : "0 0 auto",
          }}
        >
          <MdDelete size={18} />
          {isMobile && "Delete"}
        </button>
      )}
    </div>
  );

  const renderMobileCard = (item: MasterItem) => {
    const priority = priorities.find((p) => p.code === item.defaultPriority);
    return (
      <div
        key={item._id}
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "16px",
          boxShadow:
            "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
          padding: "12px",
          overflow: "hidden",
        }}
      >
        <div style={{ marginBottom: "8px" }}>
          {renderActiveBadge(item.isActive)}
        </div>

        {activeTab === "countries" && (
          <>
            {renderRow("Key", item.key)}
            {renderRow("Country", item.value)}
            {renderRow("ISO Code", item.code)}
          </>
        )}
        {activeTab === "states" && (
          <>
            {renderRow("Key", item.key)}
            {renderRow("State", item.value)}
            {renderRow(
              "Country",
              countries.find((c) => c.key === item.country)?.value ||
                item.country,
            )}
          </>
        )}
        {activeTab === "cities" && (
          <>
            {renderRow("Key", item.key)}
            {renderRow("City", item.value)}
            {renderRow(
              "State",
              states.find((s) => s.key === item.state)?.value || item.state,
            )}
            {renderRow(
              "Country",
              countries.find((c) => c.key === item.country)?.value ||
                item.country,
            )}
          </>
        )}
        {activeTab === "categories" && (
          <>
            {renderRow("Category", item.name || "N/A")}
            {renderRow(
              "Default Priority",
              priority ? priority.name : "Not set",
            )}
            {renderRow(
              "Color",
              <span
                style={{
                  display: "inline-block",
                  width: "16px",
                  height: "16px",
                  background: item.color || "#cbd5e1",
                  borderRadius: "4px",
                }}
              />,
            )}
          </>
        )}
        {activeTab === "assetCategories" && (
          <>
            {renderRow("Icon", item.icon || "📦")}
            {renderRow("Category", item.name || "N/A")}
            {renderRow("Code", item.code)}
            {renderRow(
              "Color",
              <span
                style={{
                  display: "inline-block",
                  width: "16px",
                  height: "16px",
                  background: item.color || "#cbd5e1",
                  borderRadius: "4px",
                }}
              />,
            )}
          </>
        )}
        {activeTab === "statuses" && (
          <>
            {renderRow("Status", item.name || item.code || "N/A")}
            {renderRow("Code", item.code)}
            {renderRow("Closed", item.isClosed ? "Yes" : "No")}
            {renderRow(
              "Color",
              <span
                style={{
                  display: "inline-block",
                  width: "16px",
                  height: "16px",
                  background: item.color || "#cbd5e1",
                  borderRadius: "4px",
                }}
              />,
            )}
          </>
        )}
        {activeTab === "departments" && (
          <>
            {renderRow("Department", item.name || "N/A")}
            {renderRow("Description", item.description || "—")}
          </>
        )}
        {activeTab === "companies" && (
          <>{renderRow("Company", item.name || "N/A")}</>
        )}

        <div style={{ marginTop: "10px" }}>{renderActionButtons(item)}</div>
      </div>
    );
  };

  const renderFormFields = () => {
    switch (activeTab) {
      case "countries":
        return (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Key *
              </label>
              <input
                type="text"
                value={formData.key}
                onChange={(e) =>
                  setFormData({ ...formData, key: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Country Name *
              </label>
              <input
                type="text"
                value={formData.value}
                onChange={(e) =>
                  setFormData({ ...formData, value: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                ISO Code *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase(),
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                maxLength={3}
                required
              />
            </div>
          </>
        );

      case "states":
        return (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Country *
              </label>
              <select
                value={formData.country}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              >
                <option value="">Select Country</option>
                {countries.map((c) => (
                  <option key={c._id} value={c.key}>
                    {c.value}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Key *
              </label>
              <input
                type="text"
                value={formData.key}
                onChange={(e) =>
                  setFormData({ ...formData, key: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                State Name *
              </label>
              <input
                type="text"
                value={formData.value}
                onChange={(e) =>
                  setFormData({ ...formData, value: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
          </>
        );

      case "cities":
        const filteredStates = states.filter(
          (s) => s.country === formData.country,
        );
        return (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Country *
              </label>
              <select
                value={formData.country}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    country: e.target.value,
                    state: "",
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              >
                <option value="">Select Country</option>
                {countries.map((c) => (
                  <option key={c._id} value={c.key}>
                    {c.value}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                State *
              </label>
              <select
                value={formData.state}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
                disabled={!formData.country}
              >
                <option value="">Select State</option>
                {filteredStates.map((s) => (
                  <option key={s._id} value={s.key}>
                    {s.value}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Key *
              </label>
              <input
                type="text"
                value={formData.key}
                onChange={(e) =>
                  setFormData({ ...formData, key: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                City Name *
              </label>
              <input
                type="text"
                value={formData.value}
                onChange={(e) =>
                  setFormData({ ...formData, value: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
          </>
        );

      case "categories":
        return (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Category Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                  minHeight: "80px",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Default Priority
              </label>
              <select
                value={formData.defaultPriority || ""}
                onChange={(e) =>
                  setFormData({ ...formData, defaultPriority: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
              >
                <option value="">No default priority</option>
                {priorities.map((p) => (
                  <option key={p._id} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Color
              </label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) =>
                  setFormData({ ...formData, color: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "4px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
              />
            </div>
          </>
        );

      case "assetCategories":
        const assetIcons = [
          { emoji: "🪑", label: "Chair/Furniture" },
          { emoji: "🖥️", label: "Computer" },
          { emoji: "💻", label: "Laptop" },
          { emoji: "🖨️", label: "Printer" },
          { emoji: "📱", label: "Phone/Mobile" },
          { emoji: "⌨️", label: "Keyboard" },
          { emoji: "🖱️", label: "Mouse" },
          { emoji: "📺", label: "Monitor/TV" },
          { emoji: "🎧", label: "Headphones" },
          { emoji: "📷", label: "Camera" },
          { emoji: "🔌", label: "Electronics" },
          { emoji: "💡", label: "Lighting" },
          { emoji: "📦", label: "Package/Box" },
          { emoji: "🔧", label: "Tools" },
          { emoji: "📚", label: "Books" },
          { emoji: "🗄️", label: "Cabinet" },
          { emoji: "🚗", label: "Vehicle" },
          { emoji: "🏢", label: "Building" },
          { emoji: "📄", label: "Document" },
          { emoji: "🎯", label: "Other" },
        ];

        return (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Category Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
                placeholder="e.g., Furniture, Electronics"
              />
              <small style={{ color: "#94a3b8", fontSize: "12px" }}>
                Code will be auto-generated from name
              </small>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                  minHeight: "80px",
                }}
                placeholder="Optional description for this asset category"
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Color
              </label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) =>
                  setFormData({ ...formData, color: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "4px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Icon
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: "8px",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                {assetIcons.map((icon) => (
                  <button
                    key={icon.emoji}
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, icon: icon.emoji })
                    }
                    style={{
                      padding: "12px",
                      border:
                        formData.icon === icon.emoji
                          ? "2px solid #4f46e5"
                          : "1.5px solid #e2e8f0",
                      borderRadius: "12px",
                      background:
                        formData.icon === icon.emoji ? "#eef2ff" : "white",
                      cursor: "pointer",
                      fontSize: "24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s",
                      position: "relative",
                    }}
                    title={icon.label}
                    onMouseEnter={(e) => {
                      if (formData.icon !== icon.emoji) {
                        e.currentTarget.style.background = "#f8fafc";
                        e.currentTarget.style.transform = "scale(1.05)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (formData.icon !== icon.emoji) {
                        e.currentTarget.style.background = "white";
                        e.currentTarget.style.transform = "scale(1)";
                      }
                    }}
                  >
                    {icon.emoji}
                  </button>
                ))}
              </div>
              <small
                style={{
                  color: "#94a3b8",
                  fontSize: "12px",
                  display: "block",
                  marginTop: "8px",
                }}
              >
                {formData.icon
                  ? `Selected: ${formData.icon}`
                  : "Select an icon (optional)"}
              </small>
            </div>
          </>
        );

      case "statuses":
        return (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Status Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Status Code *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase(),
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Color
              </label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) =>
                  setFormData({ ...formData, color: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "4px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                  minHeight: "80px",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <input
                  type="checkbox"
                  checked={formData.isClosed}
                  onChange={(e) =>
                    setFormData({ ...formData, isClosed: e.target.checked })
                  }
                  style={{ accentColor: "#4f46e5" }}
                />
                <span>Is Closed Status</span>
              </label>
            </div>
          </>
        );

      case "departments":
        return (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Department Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                  minHeight: "80px",
                }}
              />
            </div>
          </>
        );

      case "companies":
        return (
          <>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                }}
              >
                Company Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  background: "#fff",
                }}
                required
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div
        style={{
          padding: isMobile ? "16px" : "24px",
          width: "100%",
          boxSizing: "border-box",
          maxWidth: "1400px",
          margin: "0 auto",
          background: "#f8fafc",
          minHeight: "100vh",
          overflowX: "hidden",
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
            Master Data Management
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
            Manage global and project-level master records with governed inputs
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          {statsCards.map((stat) => (
            <div
              key={stat.label}
              style={{
                flex: isMobile
                  ? isNarrowMobile
                    ? "1 1 100%"
                    : "1 1 calc(50% - 8px)"
                  : "1 1 180px",
                minWidth: isMobile
                  ? isNarrowMobile
                    ? "100%"
                    : "calc(50% - 8px)"
                  : "180px",
                background: "#ffffff",
                borderRadius: "16px",
                padding: isMobile ? "14px 14px" : "20px 24px",
                border: "1px solid #e2e8f0",
                boxShadow:
                  "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
                display: "flex",
                alignItems: "center",
                gap: isMobile ? "10px" : "16px",
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
                    color: "#0f172a",
                    lineHeight: 1.2,
                  }}
                >
                  {String(stat.value)}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#475569",
                    marginTop: "2px",
                  }}
                >
                  {stat.label}
                </div>
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
          }}
        >
          <div
            style={{
              display: isMobile ? "grid" : "flex",
              gridTemplateColumns: isMobile
                ? isNarrowMobile
                  ? "1fr"
                  : "1fr 1fr"
                : undefined,
              gap: "8px",
              overflowX: isMobile ? "visible" : "auto",
              WebkitOverflowScrolling: isMobile ? "auto" : "touch",
            }}
          >
            {MASTER_CATEGORIES.map((category) => (
              <button
                key={category.key}
                onClick={() => setActiveTab(category.key)}
                style={{
                  height: "38px",
                  padding: "0 14px",
                  backgroundColor:
                    activeTab === category.key ? "#eef2ff" : "white",
                  color: activeTab === category.key ? "#4f46e5" : "#334155",
                  border:
                    activeTab === category.key
                      ? "1px solid #4f46e5"
                      : "1px solid #e2e8f0",
                  borderRadius: "12px",
                  fontSize: "14px",
                  fontWeight: activeTab === category.key ? 600 : 500,
                  cursor: "pointer",
                  whiteSpace: isMobile ? "normal" : "nowrap",
                  textAlign: "left",
                }}
              >
                <span style={{ marginRight: "8px" }}>{category.icon}</span>
                {category.label}
              </button>
            ))}
            {false && hasPermission(PERMISSIONS.MDM_VIEW) && (
              <button
                onClick={() => setShowMdmModal(true)}
                style={{
                  height: "38px",
                  padding: "0 14px",
                  backgroundColor: "#fef3c7",
                  color: "#92400e",
                  border: "1px solid #fcd34d",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: isMobile ? "normal" : "nowrap",
                  textAlign: "left",
                }}
                title="Configure company MDM (master database) data sources"
              >
                <span style={{ marginRight: "8px" }}>🗄️</span>
                MDM Master
              </button>
            )}
          </div>
        </div>

        <MDMConfigModal
          isOpen={showMdmModal}
          onClose={() => setShowMdmModal(false)}
          canManage={hasPermission(PERMISSIONS.MDM_MANAGE)}
        />

        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "14px",
            boxShadow:
              "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            marginBottom: "16px",
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
                minWidth: isMobile ? "100%" : "220px",
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
                placeholder={`Search ${currentCategory?.label.toLowerCase()}...`}
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

            {currentCategory?.requiresProject && (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{
                  height: "42px",
                  padding: "8px 12px",
                  border:
                    selectedProjectId !== ""
                      ? "1.5px solid #4f46e5"
                      : "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  color: selectedProjectId !== "" ? "#4f46e5" : "#475569",
                  background: selectedProjectId !== "" ? "#eef2ff" : "#fff",
                  cursor: "pointer",
                  minWidth: isMobile ? "100%" : "240px",
                }}
              >
                <option value="">-- Select a Project --</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name} ({project.code})
                  </option>
                ))}
              </select>
            )}

            {hasPermission(PERMISSIONS.MASTER_DATA_CREATE) && (
              <button
                onClick={() => {
                  setBulkUploadResult(null);
                  setBulkUploadProjectId(selectedProjectId || "");
                  setBulkUploadFile(null);
                  setShowBulkUploadModal(true);
                }}
                disabled={
                  currentCategory?.requiresProject && !selectedProjectId
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  height: "42px",
                  padding: "0 16px",
                  background:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? "#9ca3af"
                      : "#fff",
                  color:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? "white"
                      : "#334155",
                  border:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? "none"
                      : "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? "not-allowed"
                      : "pointer",
                  width: isMobile ? "100%" : "auto",
                  justifyContent: "center",
                  opacity:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? 0.7
                      : 1,
                }}
              >
                <MdUploadFile size={18} />
                Bulk Upload
              </button>
            )}

            {hasPermission(PERMISSIONS.MASTER_DATA_CREATE) && (
              <button
                onClick={handleCreate}
                disabled={
                  currentCategory?.requiresProject && !selectedProjectId
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  height: "42px",
                  padding: "0 16px",
                  background:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? "#9ca3af"
                      : "linear-gradient(160deg, #4f46e5, #4338ca)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  boxShadow:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? "none"
                      : "0 4px 14px rgba(67,56,202,.35)",
                  cursor:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? "not-allowed"
                      : "pointer",
                  width: isMobile ? "100%" : "auto",
                  justifyContent: "center",
                  opacity:
                    currentCategory?.requiresProject && !selectedProjectId
                      ? 0.7
                      : 1,
                }}
              >
                <MdAdd size={18} />
                Add {currentCategory?.label}
              </button>
            )}
          </div>

          {currentCategory?.requiresProject && !selectedProjectId && (
            <p style={{ margin: 0, fontSize: "13px", color: "#ef4444" }}>
              Please select a project to view and manage{" "}
              {currentCategory?.label.toLowerCase()}.
            </p>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "40px",
              textAlign: "center",
              border: "1px solid #e2e8f0",
              boxShadow:
                "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            }}
          >
            Loading...
          </div>
        ) : currentCategory?.requiresProject && !selectedProjectId ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "40px",
              textAlign: "center",
              border: "1px solid #e2e8f0",
              boxShadow:
                "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            }}
          >
            <p style={{ fontSize: "16px", color: "#475569" }}>
              Please select a project to view{" "}
              {currentCategory?.label.toLowerCase()}
            </p>
          </div>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredItems.length === 0 ? (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "16px",
                  padding: "30px 16px",
                  textAlign: "center",
                  border: "1px solid #e2e8f0",
                  boxShadow:
                    "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
                  color: "#475569",
                }}
              >
                {searchTerm
                  ? `No ${currentCategory?.label} matched your search`
                  : `No ${currentCategory?.label} found`}
              </div>
            ) : (
              filteredItems.map((item) => renderMobileCard(item))
            )}
          </div>
        ) : (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              overflow: "hidden",
              border: "1px solid #e2e8f0",
              boxShadow:
                "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            }}
          >
            <div
              style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: isMobile ? "940px" : "100%",
                }}
              >
                <thead
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <tr>
                    {activeTab === "countries" && (
                      <>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Key
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Country Name
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          ISO Code
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Actions
                        </th>
                      </>
                    )}
                    {activeTab === "states" && (
                      <>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Key
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          State Name
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Country
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Actions
                        </th>
                      </>
                    )}
                    {activeTab === "cities" && (
                      <>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Key
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          City Name
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          State
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Country
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Actions
                        </th>
                      </>
                    )}
                    {activeTab === "categories" && (
                      <>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Category Name
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Default Priority
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Color
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Actions
                        </th>
                      </>
                    )}
                    {activeTab === "assetCategories" && (
                      <>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Icon
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Category Name
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Code
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Color
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Actions
                        </th>
                      </>
                    )}
                    {activeTab === "statuses" && (
                      <>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Status Name
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Code
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Color
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Closed
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Active
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Actions
                        </th>
                      </>
                    )}
                    {activeTab === "departments" && (
                      <>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Department Name
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Description
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Actions
                        </th>
                      </>
                    )}
                    {activeTab === "companies" && (
                      <>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Company Name
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Actions
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={getColumnCount()}
                        style={{
                          padding: "40px",
                          textAlign: "center",
                          color: "#475569",
                        }}
                      >
                        {searchTerm
                          ? `No ${currentCategory?.label} matched your search`
                          : `No ${currentCategory?.label} found`}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr
                        key={item._id}
                        style={{ borderBottom: "1px solid #e2e8f0" }}
                      >
                        {activeTab === "countries" && (
                          <>
                            <td style={{ padding: "12px" }}>{item.key}</td>
                            <td style={{ padding: "12px" }}>{item.value}</td>
                            <td style={{ padding: "12px" }}>{item.code}</td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isActive
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                  color: item.isActive ? "#166534" : "#991b1b",
                                }}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  style={{
                                    marginRight: "8px",
                                    padding: "6px",
                                    border: "none",
                                    background: "#eef2ff",
                                    color: "#4f46e5",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdEdit size={18} />
                                </button>
                              )}
                              {hasPermission(
                                PERMISSIONS.MASTER_DATA_DELETE,
                              ) && (
                                <button
                                  onClick={() => handleDelete(item._id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    background: "#fef2f2",
                                    color: "#dc2626",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdDelete size={18} />
                                </button>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === "states" && (
                          <>
                            <td style={{ padding: "12px" }}>{item.key}</td>
                            <td style={{ padding: "12px" }}>{item.value}</td>
                            <td style={{ padding: "12px" }}>
                              {countries.find((c) => c.key === item.country)
                                ?.value || item.country}
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isActive
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                  color: item.isActive ? "#166534" : "#991b1b",
                                }}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  style={{
                                    marginRight: "8px",
                                    padding: "6px",
                                    border: "none",
                                    background: "#eef2ff",
                                    color: "#4f46e5",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdEdit size={18} />
                                </button>
                              )}
                              {hasPermission(
                                PERMISSIONS.MASTER_DATA_DELETE,
                              ) && (
                                <button
                                  onClick={() => handleDelete(item._id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdDelete size={18} />
                                </button>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === "cities" && (
                          <>
                            <td style={{ padding: "12px" }}>{item.key}</td>
                            <td style={{ padding: "12px" }}>{item.value}</td>
                            <td style={{ padding: "12px" }}>
                              {states.find((s) => s.key === item.state)
                                ?.value || item.state}
                            </td>
                            <td style={{ padding: "12px" }}>
                              {countries.find((c) => c.key === item.country)
                                ?.value || item.country}
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isActive
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                  color: item.isActive ? "#166534" : "#991b1b",
                                }}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  style={{
                                    marginRight: "8px",
                                    padding: "6px",
                                    border: "none",
                                    background: "#eef2ff",
                                    color: "#4f46e5",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdEdit size={18} />
                                </button>
                              )}
                              {hasPermission(
                                PERMISSIONS.MASTER_DATA_DELETE,
                              ) && (
                                <button
                                  onClick={() => handleDelete(item._id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdDelete size={18} />
                                </button>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === "categories" && (
                          <>
                            <td style={{ padding: "12px" }}>
                              {item.name || "N/A"}
                            </td>
                            <td style={{ padding: "12px" }}>
                              {(() => {
                                const priority = priorities.find(
                                  (p) => p.code === item.defaultPriority,
                                );
                                if (priority) {
                                  return (
                                    <span
                                      style={{
                                        padding: "4px 12px",
                                        borderRadius: "12px",
                                        fontSize: "12px",
                                        background: priority.color
                                          ? `${priority.color}20`
                                          : "#dbeafe",
                                        color: priority.color || "#1e40af",
                                      }}
                                    >
                                      {priority.name}
                                    </span>
                                  );
                                }
                                return (
                                  <span style={{ color: "#9ca3af" }}>
                                    Not set
                                  </span>
                                );
                              })()}
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <div
                                style={{
                                  width: "30px",
                                  height: "30px",
                                  background: item.color,
                                  borderRadius: "4px",
                                  margin: "0 auto",
                                }}
                              ></div>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isActive
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                  color: item.isActive ? "#166534" : "#991b1b",
                                }}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  style={{
                                    marginRight: "8px",
                                    padding: "6px",
                                    border: "none",
                                    background: "#eef2ff",
                                    color: "#4f46e5",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdEdit size={18} />
                                </button>
                              )}
                              {hasPermission(
                                PERMISSIONS.MASTER_DATA_DELETE,
                              ) && (
                                <button
                                  onClick={() => handleDelete(item._id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdDelete size={18} />
                                </button>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === "assetCategories" && (
                          <>
                            <td style={{ padding: "12px", fontSize: "24px" }}>
                              {item.icon || "📦"}
                            </td>
                            <td style={{ padding: "12px" }}>
                              {item.name || "N/A"}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                fontFamily: "monospace",
                              }}
                            >
                              {item.code}
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <div
                                style={{
                                  width: "30px",
                                  height: "30px",
                                  background: item.color,
                                  borderRadius: "4px",
                                  margin: "0 auto",
                                }}
                              ></div>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isActive
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                  color: item.isActive ? "#166534" : "#991b1b",
                                }}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  style={{
                                    marginRight: "8px",
                                    padding: "6px",
                                    border: "none",
                                    background: "#eef2ff",
                                    color: "#4f46e5",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdEdit size={18} />
                                </button>
                              )}
                              {hasPermission(
                                PERMISSIONS.MASTER_DATA_DELETE,
                              ) && (
                                <button
                                  onClick={() => handleDelete(item._id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdDelete size={18} />
                                </button>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === "statuses" && (
                          <>
                            <td style={{ padding: "12px" }}>
                              {item.name || item.code || "N/A"}
                            </td>
                            <td style={{ padding: "12px" }}>{item.code}</td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <div
                                style={{
                                  width: "30px",
                                  height: "30px",
                                  background: item.color,
                                  borderRadius: "4px",
                                  margin: "0 auto",
                                }}
                              ></div>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isClosed
                                    ? "#dcfce7"
                                    : "#e5e7eb",
                                  color: item.isClosed ? "#166534" : "#374151",
                                }}
                              >
                                {item.isClosed ? "Yes" : "No"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isActive
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                  color: item.isActive ? "#166534" : "#991b1b",
                                }}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  style={{
                                    marginRight: "8px",
                                    padding: "6px",
                                    border: "none",
                                    background: "#eef2ff",
                                    color: "#4f46e5",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdEdit size={18} />
                                </button>
                              )}
                              {hasPermission(
                                PERMISSIONS.MASTER_DATA_DELETE,
                              ) && (
                                <button
                                  onClick={() => handleDelete(item._id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdDelete size={18} />
                                </button>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === "departments" && (
                          <>
                            <td style={{ padding: "12px" }}>
                              {item.name || "N/A"}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                color: "#475569",
                                fontSize: "13px",
                              }}
                            >
                              {item.description || "—"}
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isActive
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                  color: item.isActive ? "#166534" : "#991b1b",
                                }}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  style={{
                                    marginRight: "8px",
                                    padding: "6px",
                                    border: "none",
                                    background: "#eef2ff",
                                    color: "#4f46e5",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdEdit size={18} />
                                </button>
                              )}
                              {hasPermission(
                                PERMISSIONS.MASTER_DATA_DELETE,
                              ) && (
                                <button
                                  onClick={() => handleDelete(item._id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdDelete size={18} />
                                </button>
                              )}
                            </td>
                          </>
                        )}
                        {activeTab === "companies" && (
                          <>
                            <td style={{ padding: "12px" }}>
                              {item.name || "N/A"}
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  background: item.isActive
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                  color: item.isActive ? "#166534" : "#991b1b",
                                }}
                              >
                                {item.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td
                              style={{ padding: "12px", textAlign: "center" }}
                            >
                              {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  style={{
                                    marginRight: "8px",
                                    padding: "6px",
                                    border: "none",
                                    background: "#eef2ff",
                                    color: "#4f46e5",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdEdit size={18} />
                                </button>
                              )}
                              {hasPermission(
                                PERMISSIONS.MASTER_DATA_DELETE,
                              ) && (
                                <button
                                  onClick={() => handleDelete(item._id)}
                                  style={{
                                    padding: "6px",
                                    border: "none",
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <MdDelete size={18} />
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: isMobile ? "10px" : "16px",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "20px",
                padding: isMobile ? "16px" : "24px",
                width: "100%",
                maxWidth: "560px",
                maxHeight: isMobile ? "calc(100vh - 20px)" : "90vh",
                overflow: "auto",
                boxShadow:
                  "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                  gap: "10px",
                }}
              >
                <h2
                  style={{
                    fontSize: isMobile ? "18px" : "20px",
                    fontWeight: 700,
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  Bulk Upload {currentCategory?.label}
                </h2>
                <button
                  onClick={() => {
                    setShowBulkUploadModal(false);
                    setBulkUploadResult(null);
                  }}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  <MdClose size={24} />
                </button>
              </div>

              <p
                style={{ marginTop: 0, marginBottom: "14px", color: "#475569" }}
              >
                Upload CSV rows for <strong>{currentCategory?.label}</strong>.
                {currentCategory?.requiresProject
                  ? " This category is project-scoped."
                  : " This category is global."}
              </p>

              {currentCategory?.requiresProject && (
                <div style={{ marginBottom: "14px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: 600,
                    }}
                  >
                    Project *
                  </label>
                  <select
                    value={bulkUploadProjectId}
                    onChange={(e) => setBulkUploadProjectId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "#fff",
                    }}
                  >
                    <option value="">-- Select a Project --</option>
                    {projects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.name} ({project.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div
                style={{
                  marginBottom: "14px",
                  padding: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    marginBottom: "8px",
                    fontSize: "13px",
                    color: "#334155",
                  }}
                >
                  Required CSV headers:
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#475569",
                    wordBreak: "break-word",
                  }}
                >
                  {getBulkTemplateHeaders().join(", ")}
                </div>
                <button
                  type="button"
                  onClick={downloadBulkTemplate}
                  style={{
                    marginTop: "10px",
                    border: "1.5px solid #e2e8f0",
                    background: "#fff",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#334155",
                  }}
                >
                  Download Sample CSV
                </button>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: 600,
                  }}
                >
                  CSV File *
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) =>
                    setBulkUploadFile(e.target.files?.[0] || null)
                  }
                  style={{ width: "100%" }}
                />
              </div>

              {bulkUploadResult && (
                <div
                  style={{
                    marginBottom: "14px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      marginBottom: "6px",
                    }}
                  >
                    Upload summary: {bulkUploadResult.success} success,{" "}
                    {bulkUploadResult.failed} failed
                  </div>
                  {bulkUploadResult.errors.length > 0 && (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: "18px",
                        color: "#b91c1c",
                        fontSize: "13px",
                      }}
                    >
                      {bulkUploadResult.errors.map((err, idx) => (
                        <li key={`${idx}-${err}`}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  flexDirection: isMobile ? "column" : "row",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkUploadModal(false);
                    setBulkUploadResult(null);
                  }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "1.5px solid #e2e8f0",
                    background: "#fff",
                    color: "#334155",
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleBulkUpload}
                  disabled={bulkUploading}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: bulkUploading
                      ? "#9ca3af"
                      : "linear-gradient(160deg, #4f46e5, #4338ca)",
                    color: "#fff",
                    boxShadow: bulkUploading
                      ? "none"
                      : "0 4px 14px rgba(67,56,202,.35)",
                    cursor: bulkUploading ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  {bulkUploading ? "Uploading..." : "Upload CSV"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: isMobile ? "10px" : "16px",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "20px",
                padding: isMobile ? "16px" : "24px",
                width: "100%",
                maxWidth: "500px",
                maxHeight: isMobile ? "calc(100vh - 20px)" : "90vh",
                overflow: "auto",
                boxShadow:
                  "0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "24px",
                }}
              >
                <h2 style={{ fontSize: "20px", fontWeight: "600" }}>
                  {editingItem ? "Edit" : "Add"} {currentCategory?.label}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  <MdClose size={24} />
                </button>
              </div>

              {/* Show project info for categories and statuses */}
              {currentCategory?.requiresProject && selectedProjectId && (
                <div
                  style={{
                    marginBottom: "20px",
                    padding: "12px",
                    background: "#eef2ff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                  }}
                >
                  <p style={{ fontSize: "14px", color: "#4f46e5", margin: 0 }}>
                    <strong>Project:</strong>{" "}
                    {projects.find((p) => p._id === selectedProjectId)?.name}
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#475569",
                      margin: "4px 0 0 0",
                    }}
                  >
                    This {currentCategory?.label.toLowerCase().slice(0, -1)}{" "}
                    will be available for both online and offline ticket
                    submission in this project.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {renderFormFields()}

                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontWeight: "500",
                    }}
                  >
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        displayOrder: parseInt(e.target.value) || 0,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: "8px",
                      background: "#fff",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.checked })
                      }
                      style={{ accentColor: "#4f46e5" }}
                    />
                    <span>Active</span>
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                    flexDirection: isMobile ? "column" : "row",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      padding: "10px 20px",
                      border: "1.5px solid #e2e8f0",
                      background: "#fff",
                      color: "#334155",
                      borderRadius: "8px",
                      cursor: "pointer",
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: "10px 20px",
                      background: "linear-gradient(160deg, #4f46e5, #4338ca)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      boxShadow: "0 4px 14px rgba(67,56,202,.35)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    <MdSave size={18} />
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MasterDataManagement;
