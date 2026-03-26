import { useState, useEffect, useRef } from "react";
import axios from "axios";
import DashboardLayout from "./DashboardLayout";
import ModuleHeader from "./ModuleHeader";
import { MdAdd, MdEdit, MdDelete, MdSave, MdClose } from "react-icons/md";
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
];

const MasterDataManagement = () => {
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState("countries");
  const [items, setItems] = useState<MasterItem[]>([]);

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
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedProjectId]);

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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
                required
                placeholder="e.g., Furniture, Electronics"
              />
              <small style={{ color: "#6b7280", fontSize: "12px" }}>
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                          ? "2px solid var(--primary-main)"
                          : "1px solid #ddd",
                      borderRadius: "8px",
                      background:
                        formData.icon === icon.emoji ? "#eff6ff" : "white",
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
                        e.currentTarget.style.background = "#f9fafb";
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
                  color: "#6b7280",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
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
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  minHeight: "80px",
                }}
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
      <div style={{ padding: "24px" }}>
        <ModuleHeader
          title="Master Data Management"
          subtitle="Manage system-wide master data"
        />

        {/* Tabs */}
        <div
          style={{ borderBottom: "2px solid #e5e7eb", marginBottom: "24px" }}
        >
          <div style={{ display: "flex", gap: "4px" }}>
            {MASTER_CATEGORIES.map((category) => (
              <button
                key={category.key}
                onClick={() => setActiveTab(category.key)}
                style={{
                  padding: "12px 24px",
                  border: "none",
                  background:
                    activeTab === category.key
                      ? "var(--primary-main)"
                      : "transparent",
                  color: activeTab === category.key ? "white" : "#6b7280",
                  fontWeight: activeTab === category.key ? "600" : "400",
                  cursor: "pointer",
                  borderRadius: "8px 8px 0 0",
                  transition: "all 0.2s",
                }}
              >
                <span style={{ marginRight: "8px" }}>{category.icon}</span>
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {/* Project Selector - Show only for categories and statuses */}
        {currentCategory?.requiresProject && (
          <div
            style={{
              marginBottom: "16px",
              background: "white",
              padding: "16px",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                color: "#374151",
              }}
            >
              Select Project *
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{
                width: "100%",
                maxWidth: "400px",
                padding: "10px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <option value="">-- Select a Project --</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name} ({project.code})
                </option>
              ))}
            </select>
            {!selectedProjectId && (
              <p
                style={{ marginTop: "8px", fontSize: "13px", color: "#ef4444" }}
              >
                Please select a project to view and manage{" "}
                {currentCategory?.label.toLowerCase()}
              </p>
            )}
          </div>
        )}

        {/* Add Button */}
        <div
          style={{
            marginBottom: "16px",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          {hasPermission(PERMISSIONS.MASTER_DATA_CREATE) && (
            <button
              onClick={handleCreate}
              disabled={currentCategory?.requiresProject && !selectedProjectId}
              style={{
                padding: "10px 20px",
                background:
                  currentCategory?.requiresProject && !selectedProjectId
                    ? "#9ca3af"
                    : "var(--primary-main)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor:
                  currentCategory?.requiresProject && !selectedProjectId
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: "500",
                opacity:
                  currentCategory?.requiresProject && !selectedProjectId
                    ? 0.6
                    : 1,
              }}
            >
              <MdAdd size={20} />
              Add {currentCategory?.label}
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>Loading...</div>
        ) : currentCategory?.requiresProject && !selectedProjectId ? (
          <div
            style={{
              background: "white",
              borderRadius: "8px",
              padding: "40px",
              textAlign: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <p style={{ fontSize: "16px", color: "#6b7280" }}>
              Please select a project to view{" "}
              {currentCategory?.label.toLowerCase()}
            </p>
          </div>
        ) : (
          <div
            style={{
              background: "white",
              borderRadius: "8px",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead
                style={{
                  background: "#f9fafb",
                  borderBottom: "2px solid #e5e7eb",
                }}
              >
                <tr>
                  {activeTab === "countries" && (
                    <>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Key
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Country Name
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        ISO Code
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Status
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Actions
                      </th>
                    </>
                  )}
                  {activeTab === "states" && (
                    <>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Key
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        State Name
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Country
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Status
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Actions
                      </th>
                    </>
                  )}
                  {activeTab === "cities" && (
                    <>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Key
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        City Name
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        State
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Country
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Status
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Actions
                      </th>
                    </>
                  )}
                  {activeTab === "categories" && (
                    <>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Category Name
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Default Priority
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Color
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Status
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Actions
                      </th>
                    </>
                  )}
                  {activeTab === "assetCategories" && (
                    <>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Icon
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Category Name
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Code
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Color
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Status
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Actions
                      </th>
                    </>
                  )}
                  {activeTab === "statuses" && (
                    <>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Status Name
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Code
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Color
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Closed
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Active
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Actions
                      </th>
                    </>
                  )}
                  {activeTab === "departments" && (
                    <>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Department Name
                      </th>
                      <th style={{ padding: "12px", textAlign: "left" }}>
                        Description
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Status
                      </th>
                      <th style={{ padding: "12px", textAlign: "center" }}>
                        Actions
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "#6b7280",
                      }}
                    >
                      No {currentCategory?.label} found
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item._id}
                      style={{ borderBottom: "1px solid #e5e7eb" }}
                    >
                      {activeTab === "countries" && (
                        <>
                          <td style={{ padding: "12px" }}>{item.key}</td>
                          <td style={{ padding: "12px" }}>{item.value}</td>
                          <td style={{ padding: "12px" }}>{item.code}</td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                              <button
                                onClick={() => handleEdit(item)}
                                style={{
                                  marginRight: "8px",
                                  padding: "6px",
                                  border: "none",
                                  background: "#dbeafe",
                                  color: "#1e40af",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                <MdEdit size={18} />
                              </button>
                            )}
                            {hasPermission(PERMISSIONS.MASTER_DATA_DELETE) && (
                              <button
                                onClick={() => handleDelete(item._id)}
                                style={{
                                  padding: "6px",
                                  border: "none",
                                  background: "#fef2f2",
                                  color: "#dc2626",
                                  borderRadius: "4px",
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                              <button
                                onClick={() => handleEdit(item)}
                                style={{
                                  marginRight: "8px",
                                  padding: "6px",
                                  border: "none",
                                  background: "#dbeafe",
                                  color: "#1e40af",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                <MdEdit size={18} />
                              </button>
                            )}
                            {hasPermission(PERMISSIONS.MASTER_DATA_DELETE) && (
                              <button
                                onClick={() => handleDelete(item._id)}
                                style={{
                                  padding: "6px",
                                  border: "none",
                                  background: "#fee2e2",
                                  color: "#991b1b",
                                  borderRadius: "4px",
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
                            {states.find((s) => s.key === item.state)?.value ||
                              item.state}
                          </td>
                          <td style={{ padding: "12px" }}>
                            {countries.find((c) => c.key === item.country)
                              ?.value || item.country}
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                              <button
                                onClick={() => handleEdit(item)}
                                style={{
                                  marginRight: "8px",
                                  padding: "6px",
                                  border: "none",
                                  background: "#dbeafe",
                                  color: "#1e40af",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                <MdEdit size={18} />
                              </button>
                            )}
                            {hasPermission(PERMISSIONS.MASTER_DATA_DELETE) && (
                              <button
                                onClick={() => handleDelete(item._id)}
                                style={{
                                  padding: "6px",
                                  border: "none",
                                  background: "#fee2e2",
                                  color: "#991b1b",
                                  borderRadius: "4px",
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                              <button
                                onClick={() => handleEdit(item)}
                                style={{
                                  marginRight: "8px",
                                  padding: "6px",
                                  border: "none",
                                  background: "#dbeafe",
                                  color: "#1e40af",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                <MdEdit size={18} />
                              </button>
                            )}
                            {hasPermission(PERMISSIONS.MASTER_DATA_DELETE) && (
                              <button
                                onClick={() => handleDelete(item._id)}
                                style={{
                                  padding: "6px",
                                  border: "none",
                                  background: "#fee2e2",
                                  color: "#991b1b",
                                  borderRadius: "4px",
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
                            style={{ padding: "12px", fontFamily: "monospace" }}
                          >
                            {item.code}
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                              <button
                                onClick={() => handleEdit(item)}
                                style={{
                                  marginRight: "8px",
                                  padding: "6px",
                                  border: "none",
                                  background: "#dbeafe",
                                  color: "#1e40af",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                <MdEdit size={18} />
                              </button>
                            )}
                            {hasPermission(PERMISSIONS.MASTER_DATA_DELETE) && (
                              <button
                                onClick={() => handleDelete(item._id)}
                                style={{
                                  padding: "6px",
                                  border: "none",
                                  background: "#fee2e2",
                                  color: "#991b1b",
                                  borderRadius: "4px",
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                              <button
                                onClick={() => handleEdit(item)}
                                style={{
                                  marginRight: "8px",
                                  padding: "6px",
                                  border: "none",
                                  background: "#dbeafe",
                                  color: "#1e40af",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                <MdEdit size={18} />
                              </button>
                            )}
                            {hasPermission(PERMISSIONS.MASTER_DATA_DELETE) && (
                              <button
                                onClick={() => handleDelete(item._id)}
                                style={{
                                  padding: "6px",
                                  border: "none",
                                  background: "#fee2e2",
                                  color: "#991b1b",
                                  borderRadius: "4px",
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
                              color: "#6b7280",
                              fontSize: "13px",
                            }}
                          >
                            {item.description || "—"}
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
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
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            {hasPermission(PERMISSIONS.MASTER_DATA_EDIT) && (
                              <button
                                onClick={() => handleEdit(item)}
                                style={{
                                  marginRight: "8px",
                                  padding: "6px",
                                  border: "none",
                                  background: "#dbeafe",
                                  color: "#1e40af",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                <MdEdit size={18} />
                              </button>
                            )}
                            {hasPermission(PERMISSIONS.MASTER_DATA_DELETE) && (
                              <button
                                onClick={() => handleDelete(item._id)}
                                style={{
                                  padding: "6px",
                                  border: "none",
                                  background: "#fee2e2",
                                  color: "#991b1b",
                                  borderRadius: "4px",
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
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: "8px",
                padding: "24px",
                width: "90%",
                maxWidth: "500px",
                maxHeight: "90vh",
                overflow: "auto",
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
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "6px",
                  }}
                >
                  <p style={{ fontSize: "14px", color: "#1e40af", margin: 0 }}>
                    <strong>Project:</strong>{" "}
                    {projects.find((p) => p._id === selectedProjectId)?.name}
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
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
                      border: "1px solid #ddd",
                      borderRadius: "4px",
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
                    />
                    <span>Active</span>
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      padding: "10px 20px",
                      border: "1px solid #d1d5db",
                      background: "white",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: "10px 20px",
                      background: "var(--primary-main)",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
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
