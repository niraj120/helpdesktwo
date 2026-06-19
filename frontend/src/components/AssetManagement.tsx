import React, { useState, useEffect } from "react";
import { MdAdd, MdEdit, MdDelete, MdSearch, MdRefresh } from "react-icons/md";
import { API_CONFIG } from "../config/constants";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";
import DashboardLayout from "./DashboardLayout";
import ModuleHeader from "./ModuleHeader";

interface AssetCategory {
  _id: string;
  name: string;
  code: string;
  description?: string;
  color?: string;
  icon?: string;
  isActive: boolean;
}

interface Asset {
  _id: string;
  name: string;
  description?: string;
  category?: string | AssetCategory; // Support both string (legacy) and object (populated)
  predefinedCount: number;
  unit?: string;
  isActive: boolean;
  createdBy: {
    _id: string;
    name: string;
    firstName?: string;
    lastName?: string;
  };
  createdAt: string;
}

interface AssetFormData {
  name: string;
  description: string;
  category: string;
  predefinedCount: number | string;
  unit: string;
}

interface Project {
  _id: string;
  name: string;
  code?: string;
}

const AssetManagement: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActive, setFilterActive] = useState<
    "all" | "active" | "inactive"
  >("all");

  // Dialog state
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [formData, setFormData] = useState<AssetFormData>({
    name: "",
    description: "",
    category: "",
    predefinedCount: 0,
    unit: "units",
  });
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof AssetFormData, string>>
  >({});
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Per-project custom link buttons (shown on the project My Assets page).
  const [linkButtons, setLinkButtons] = useState<
    Array<{ label: string; url: string }>
  >([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);

  const canCreate = hasPermission(PERMISSIONS.ASSET_CREATE);
  const canEdit = hasPermission(PERMISSIONS.ASSET_EDIT);
  const canDelete = hasPermission(PERMISSIONS.ASSET_DELETE);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchAssets();
      fetchCategories();
      loadLinkButtons();
    }
  }, [selectedProject]);

  // Load the selected project's configured asset link buttons.
  const loadLinkButtons = async () => {
    if (!selectedProject) return;
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(
        `${API_CONFIG.API_URL}/projects/${selectedProject}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const d = await res.json();
      const proj = d?.data ?? d?.project ?? d;
      const btns = proj?.configuration?.assetLinkButtons;
      setLinkButtons(Array.isArray(btns) ? btns : []);
    } catch {
      setLinkButtons([]);
    }
  };

  // Save the link buttons into the project's configuration (deep-merged server-side).
  const saveLinkButtons = async () => {
    if (!selectedProject) return;
    setSavingLinks(true);
    try {
      const token = localStorage.getItem("authToken");
      const clean = linkButtons
        .map((b) => ({
          label: (b.label || "").trim(),
          url: (b.url || "").trim(),
        }))
        .filter((b) => b.label && b.url);
      const res = await fetch(
        `${API_CONFIG.API_URL}/projects/${selectedProject}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            configuration: { assetLinkButtons: clean },
          }),
        },
      );
      const d = await res.json();
      if (d.success !== false) {
        setLinkButtons(clean);
        setShowLinkModal(false);
        setMessage({ type: "success", text: "Link buttons saved." });
      } else {
        setMessage({
          type: "error",
          text: d.message || "Failed to save link buttons.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save link buttons." });
    } finally {
      setSavingLinks(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/projects?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await response.json();

      let projectsData = [];
      if (data.success && data.data && Array.isArray(data.data.projects)) {
        projectsData = data.data.projects;
      } else if (data.success && Array.isArray(data.data)) {
        projectsData = data.data;
      } else if (Array.isArray(data.projects)) {
        projectsData = data.projects;
      }

      const activeProjects = projectsData.filter(
        (p: any) => p.isActive !== false,
      );
      setProjects(activeProjects);
      if (activeProjects.length > 0 && !selectedProject) {
        setSelectedProject(activeProjects[0]._id);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  const fetchAssets = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/assets?projectId=${selectedProject}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      );
      const data = await response.json();
      setAssets(data.data || []);
    } catch (error: any) {
      showMessage("error", error.message || "Failed to fetch assets");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    if (!selectedProject) return;

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/asset-categories/project/${selectedProject}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      );
      const data = await response.json();
      setCategories(data.data || []);
    } catch (error) {
      console.error("Failed to fetch asset categories:", error);
    }
  };

  const handleOpenModal = (asset?: Asset) => {
    if (asset) {
      setEditingAsset(asset);
      // Extract category ID if it's an object (populated), otherwise use string
      const categoryId =
        typeof asset.category === "object" && asset.category !== null
          ? asset.category._id
          : asset.category || "";
      setFormData({
        name: asset.name,
        description: asset.description || "",
        category: categoryId,
        predefinedCount: asset.predefinedCount,
        unit: asset.unit || "units",
      });
    } else {
      setEditingAsset(null);
      setFormData({
        name: "",
        description: "",
        category: "",
        predefinedCount: 0,
        unit: "units",
      });
    }
    setFormErrors({});
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAsset(null);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof AssetFormData, string>> = {};

    if (!formData.name.trim()) {
      errors.name = "Asset name is required";
    }
    if (Number(formData.predefinedCount) < 0) {
      errors.predefinedCount = "Count cannot be negative";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");

      const url = editingAsset
        ? `${API_CONFIG.API_URL}/assets/${editingAsset._id}`
        : `${API_CONFIG.API_URL}/assets`;

      const payload = editingAsset
        ? formData
        : { ...formData, projectId: selectedProject };

      const response = await fetch(url, {
        method: editingAsset ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to save asset");
      }

      showMessage(
        "success",
        editingAsset
          ? "Asset updated successfully"
          : "Asset created successfully",
      );
      handleCloseModal();
      fetchAssets();
      fetchCategories();
    } catch (error: any) {
      showMessage("error", error.message || "Failed to save asset");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm("Are you sure you want to delete this asset?")) return;

    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/assets/${assetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete asset");
      }

      showMessage("success", "Asset deleted successfully");
      fetchAssets();
    } catch (error: any) {
      showMessage(
        "error",
        error.message || "Failed to delete asset. It may be mapped to centers.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (
    assetId: string,
    currentStatus: boolean,
  ) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/assets/${assetId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update asset status");
      }

      showMessage(
        "success",
        `Asset ${!currentStatus ? "activated" : "deactivated"} successfully`,
      );
      fetchAssets();
    } catch (error: any) {
      showMessage("error", error.message || "Failed to update asset status");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const filteredAssets = assets.filter((asset) => {
    const categoryName =
      typeof asset.category === "object" && asset.category !== null
        ? asset.category.name
        : asset.category;
    const matchesSearch =
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      categoryName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      filterActive === "all" ||
      (filterActive === "active" && asset.isActive) ||
      (filterActive === "inactive" && !asset.isActive);

    return matchesSearch && matchesFilter;
  });

  return (
    <DashboardLayout>
      <div className="p-6">
        <ModuleHeader
          title="Asset Management"
          subtitle="Manage assets and inventory across projects"
        />

        <div
          style={{
            marginBottom: "24px",
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={fetchAssets}
            disabled={loading || !selectedProject}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "white",
              border: "2px solid #E5E7EB",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading || !selectedProject ? "not-allowed" : "pointer",
              opacity: loading || !selectedProject ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            <MdRefresh className="h-5 w-5" />
            Refresh
          </button>
          {canEdit && (
            <button
              onClick={() => setShowLinkModal(true)}
              disabled={!selectedProject}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                background: "white",
                border: "2px solid #E5E7EB",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: !selectedProject ? "not-allowed" : "pointer",
                opacity: !selectedProject ? 0.5 : 1,
              }}
              title="Add custom link buttons shown on this project's My Assets page"
            >
              🔗 Link Buttons
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => handleOpenModal()}
              disabled={loading || !selectedProject}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 20px",
                background:
                  loading || !selectedProject
                    ? "#9ca3af"
                    : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: loading || !selectedProject ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                boxShadow:
                  loading || !selectedProject
                    ? "none"
                    : "0 4px 15px rgba(102, 126, 234, 0.4)",
              }}
              onMouseEnter={(e) => {
                if (!loading && selectedProject) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 20px rgba(102, 126, 234, 0.4)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && selectedProject) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 15px rgba(102, 126, 234, 0.4)";
                }
              }}
            >
              <MdAdd className="h-5 w-5" />
              Add Asset
            </button>
          )}
        </div>

        {/* Project Selector */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Select Project <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:w-1/2"
          >
            <option value="">Choose a project...</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={`mb-4 rounded-lg p-4 ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
          >
            {message.text}
          </div>
        )}

        {/* Filters */}
        {selectedProject && (
          <div className="mb-6 rounded-lg bg-white p-4 shadow">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="relative">
                <MdSearch className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as any)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
              <div className="flex items-center text-sm text-gray-600">
                Total: {filteredAssets.length} asset(s)
              </div>
            </div>
          </div>
        )}

        {/* Assets Table */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Asset Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Predefined Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Unit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created By
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading && !assets.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    Loading assets...
                  </td>
                </tr>
              ) : filteredAssets.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-4 text-center text-sm text-gray-500"
                  >
                    No assets found.{" "}
                    {canCreate && 'Click "Add Asset" to create one.'}
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => (
                  <tr key={asset._id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {asset.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {typeof asset.category === "object" &&
                      asset.category !== null
                        ? asset.category.name
                        : asset.category || "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="max-w-xs truncate">
                        {asset.description || "-"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">
                      {asset.predefinedCount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {asset.unit || "units"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium ${asset.isActive ? "text-green-700" : "text-gray-500"}`}
                        >
                          {asset.isActive ? "Active" : "Inactive"}
                        </span>
                        <button
                          onClick={() =>
                            handleToggleStatus(asset._id, asset.isActive)
                          }
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                            asset.isActive ? "bg-green-600" : "bg-gray-200"
                          }`}
                          role="switch"
                          aria-checked={asset.isActive}
                          title={`Click to ${asset.isActive ? "deactivate" : "activate"}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              asset.isActive ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {asset.createdBy
                        ? `${asset.createdBy.firstName || ""} ${asset.createdBy.lastName || ""}`.trim() ||
                          "Unknown"
                        : "Unknown"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center text-sm font-medium">
                      <div className="flex justify-center gap-2">
                        {canEdit && (
                          <button
                            onClick={() => handleOpenModal(asset)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit"
                          >
                            <MdEdit className="h-5 w-5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(asset._id)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <MdDelete className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingAsset ? "Edit Asset" : "Add New Asset"}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Asset Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {formErrors.name && (
                      <p className="mt-1 text-sm text-red-600">
                        {formErrors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Asset Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select category...</option>
                      {categories
                        .filter((cat) => cat.isActive)
                        .map((cat) => (
                          <option key={cat._id} value={cat._id}>
                            {cat.icon && `${cat.icon} `}
                            {cat.name}
                          </option>
                        ))}
                    </select>
                    <p className="mt-1 text-sm text-gray-500">
                      Manage categories in Master Data Management
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
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
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Predefined Count <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.predefinedCount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          predefinedCount: parseInt(e.target.value) || 0,
                        })
                      }
                      min="0"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {formErrors.predefinedCount && (
                      <p className="mt-1 text-sm text-red-600">
                        {formErrors.predefinedCount}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-gray-500">
                      Default quantity when mapping to centers
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={formData.unit}
                      onChange={(e) =>
                        setFormData({ ...formData, unit: e.target.value })
                      }
                      placeholder="e.g., units, pieces, sets"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {editingAsset ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Manage per-project asset link buttons */}
        {showLinkModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "16px",
            }}
            onClick={() => setShowLinkModal(false)}
          >
            <div
              style={{
                background: "white",
                borderRadius: "12px",
                padding: "24px",
                width: "100%",
                maxWidth: "560px",
                maxHeight: "85vh",
                overflowY: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}
              >
                Asset Link Buttons
              </h2>
              <p
                style={{
                  fontSize: "13px",
                  color: "#6B7280",
                  marginBottom: "16px",
                }}
              >
                These buttons appear on this project's “My Assets” page and open
                their link in a new tab. If none are added, nothing is shown.
              </p>

              {linkButtons.length === 0 && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#9CA3AF",
                    marginBottom: "12px",
                  }}
                >
                  No buttons yet — add one below.
                </p>
              )}

              {linkButtons.map((b, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginBottom: "8px",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    placeholder="Button name"
                    value={b.label}
                    onChange={(e) =>
                      setLinkButtons((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    style={{
                      flex: "0 0 35%",
                      padding: "8px 10px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  />
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={b.url}
                    onChange={(e) =>
                      setLinkButtons((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, url: e.target.value } : x,
                        ),
                      )
                    }
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  />
                  <button
                    onClick={() =>
                      setLinkButtons((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    style={{
                      padding: "6px 10px",
                      background: "#FEE2E2",
                      color: "#DC2626",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                onClick={() =>
                  setLinkButtons((prev) => [...prev, { label: "", url: "" }])
                }
                style={{
                  marginTop: "8px",
                  padding: "8px 14px",
                  background: "#EEF2FF",
                  color: "#4338CA",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                + Add button
              </button>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "20px",
                }}
              >
                <button
                  onClick={() => setShowLinkModal(false)}
                  style={{
                    padding: "9px 18px",
                    background: "white",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveLinkButtons}
                  disabled={savingLinks}
                  style={{
                    padding: "9px 18px",
                    background: "#4F46E5",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: savingLinks ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                    opacity: savingLinks ? 0.6 : 1,
                  }}
                >
                  {savingLinks ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AssetManagement;
