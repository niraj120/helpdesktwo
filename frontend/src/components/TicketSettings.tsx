import React, { useState, useEffect } from "react";
import {
  MdSave,
  MdInfo,
  MdAdd,
  MdEdit,
  MdDelete,
  MdDragIndicator,
} from "react-icons/md";
import DashboardLayout from "./DashboardLayout";
import { useParams } from "react-router-dom";
import { API_CONFIG } from "../config/constants";
import HierarchyConfigManager from "./HierarchyConfigManager";
import FormFieldBuilder from "./FormFieldBuilder";
import { FormFieldSchema } from "../utils/conditionEngine";

interface TicketStatus {
  _id?: string;
  name: string;
  code: number;
  color: string;
  isDefault: boolean;
  isClosed: boolean;
  requireClosingRemark: boolean;
  displayOrder: number;
}

interface TicketCategory {
  _id?: string;
  name: string;
  code: string;
  description?: string;
  icon?: string;
  color?: string;
  defaultPriority?: string;
  order?: number;
  isActive?: boolean;
}

interface TicketNumberingConfig {
  format: string; // e.g., "TICK-{YYYY}-{####}"
  prefix: string;
  startingNumber: number;
  separator: string;
  includeYear: boolean;
  includeMonth: boolean;
  resetFrequency: "never" | "yearly" | "monthly";
}

// FormField schema is now imported from conditionEngine (FormFieldSchema)
// — includes conditions, conditionAction, requiredMode, requiredConditions

const TicketSettings: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState("numbering");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [projectName, setProjectName] = useState("");

  // Ticket Numbering State
  const [numbering, setNumbering] = useState<TicketNumberingConfig>({
    format: "TICK-{YYYY}-{####}",
    prefix: "TICK",
    startingNumber: 1,
    separator: "-",
    includeYear: true,
    includeMonth: false,
    resetFrequency: "yearly",
  });

  // Statuses State
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [editingStatus, setEditingStatus] = useState<TicketStatus | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // Priority options for ticket types - fetched from Priority master
  interface Priority {
    _id: string;
    name: string;
    code: string;
    color?: string;
  }
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loadingPriorities, setLoadingPriorities] = useState(false);

  // Form Fields State
  const [formFields, setFormFields] = useState<FormFieldSchema[]>([]);
  const [loadingFormFields, setLoadingFormFields] = useState(false);

  // Hierarchy config — drives which fixed fields appear in the form builder
  interface HierarchyLevel {
    levelNumber: number;
    displayName: string;
    isRequired: boolean;
  }
  interface HierarchyConfig {
    levelCount: number;
    levels: HierarchyLevel[];
  }
  const [hierarchyConfig, setHierarchyConfig] =
    useState<HierarchyConfig | null>(null);

  // Load project-specific ticket configuration
  useEffect(() => {
    loadProjectConfig();
    if (projectId) {
      loadStatuses();
      loadPriorities();
      loadFormFields();
      loadHierarchyConfig();
    }
  }, [projectId]);

  const loadHierarchyConfig = async () => {
    if (!projectId) return;
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(
        `${API_CONFIG.API_URL}/hierarchy-config/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) setHierarchyConfig(data.data);
      }
    } catch (e) {
      // non-critical — builder falls back to single Category chip
    }
  };

  const loadStatuses = async () => {
    if (!projectId) return;

    setLoadingStatuses(true);
    try {
      const token = localStorage.getItem("authToken");
      const cacheBuster = `?t=${Date.now()}`;
      const response = await fetch(
        `${API_CONFIG.API_URL}/statuses/project/${projectId}${cacheBuster}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Status API Response:", data);
        if (data.success && data.data) {
          console.log("✅ Setting statuses:", data.data.length, "items");
          setStatuses(data.data);
        } else {
          console.error("❌ API returned success=false or no data:", data);
        }
      } else {
        console.error(
          "❌ API response not OK:",
          response.status,
          response.statusText,
        );
      }
    } catch (error) {
      console.error("❌ Error loading statuses:", error);
    } finally {
      setLoadingStatuses(false);
    }
  };

  const loadPriorities = async () => {
    if (!projectId) return;
    setLoadingPriorities(true);
    try {
      const token = localStorage.getItem("authToken");
      // Fetch priorities from SLA rules for this project
      const response = await fetch(
        `${API_CONFIG.API_URL}/sla-rules?projectId=${projectId}&isActive=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log("✅ SLA Rules API Response:", data);
        if (data.success && data.data) {
          // Use SLA rule names as priorities (e.g., "High", "Medium", "Low")
          const prioritiesFromRules = data.data.map((rule: any) => ({
            _id: rule._id,
            code: rule.name.toLowerCase(),
            name: rule.name,
          }));
          console.log(
            "✅ Setting priorities from SLA rules:",
            prioritiesFromRules.length,
            "items",
          );
          setPriorities(prioritiesFromRules);
        } else {
          console.error(
            "❌ SLA Rules API returned success=false or no data:",
            data,
          );
        }
      } else {
        console.error(
          "❌ SLA Rules API response not OK:",
          response.status,
          response.statusText,
        );
      }
    } catch (error) {
      console.error("❌ Error loading priorities from SLA rules:", error);
    } finally {
      setLoadingPriorities(false);
    }
  };

  const loadFormFields = async () => {
    if (!projectId) return;
    setLoadingFormFields(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/projects/${projectId}/form-fields`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Form Fields API Response:", data);
        if (data.success && data.data) {
          console.log("✅ Setting form fields:", data.data.length, "items");
          setFormFields(
            data.data.sort(
              (a: FormFieldSchema, b: FormFieldSchema) =>
                (a.order || 0) - (b.order || 0),
            ),
          );
        } else {
          console.error(
            "❌ Form Fields API returned success=false or no data:",
            data,
          );
        }
      } else {
        console.error(
          "❌ Form Fields API response not OK:",
          response.status,
          response.statusText,
        );
      }
    } catch (error) {
      console.error("❌ Error loading form fields:", error);
    } finally {
      setLoadingFormFields(false);
    }
  };

  const loadProjectConfig = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const cacheBuster = `?t=${Date.now()}`;
      const response = await fetch(
        `${API_CONFIG.API_URL}/projects/${projectId}/ticket-settings${cacheBuster}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );

      if (response.ok) {
        const data = await response.json();
        setProjectName(data.projectName || "");

        if (data.ticketConfig) {
          if (data.ticketConfig.numbering)
            setNumbering(data.ticketConfig.numbering);
          // Categories are now loaded from Category API, not project config
        }
      }
    } catch (error) {
      console.error("Error loading project config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!projectId) {
      alert("Project ID is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");

      console.log(
        "💾 Saving ticket configuration with form fields:",
        formFields.length,
        "fields",
      );

      const response = await fetch(
        `${API_CONFIG.API_URL}/projects/${projectId}/ticket-settings`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            numbering,
            statuses,
            onlineFormFields: formFields, // Save form fields with main save
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Ticket configuration saved:", data);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const errorData = await response.json();
        alert(errorData.message || "Failed to save ticket configuration");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save ticket configuration");
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "numbering", label: "Ticket Numbering", labelMr: "तिकीट क्रमांकन" },
    { id: "statuses", label: "Ticket Statuses", labelMr: "तिकीट स्टेटस" },
    { id: "categories", label: "Categories", labelMr: "श्रेणी" },
    { id: "formFields", label: "Form Fields", labelMr: "फॉर्म फील्ड" },
  ];

  const generatePreview = () => {
    let preview = numbering.prefix;
    if (numbering.separator) preview += numbering.separator;
    if (numbering.includeYear) preview += "2025";
    if (numbering.includeMonth) {
      if (numbering.includeYear) preview += numbering.separator;
      preview += "11";
    }
    preview += numbering.separator + "0001";
    return preview;
  };

  // Status CRUD operations
  const handleAddStatus = () => {
    // Auto-assign next numeric code
    const nextCode =
      statuses.length > 0
        ? Math.max(...statuses.map((s) => Number(s.code))) + 1
        : 1;
    setEditingStatus({
      _id: `temp_${Date.now()}`,
      name: "",
      code: nextCode,
      color: "#3b82f6",
      isDefault: false,
      isClosed: false,
      requireClosingRemark: false,
      displayOrder: statuses.length + 1,
    });
    setShowStatusModal(true);
  };

  const handleEditStatus = (status: TicketStatus) => {
    setEditingStatus(status);
    setShowStatusModal(true);
  };

  const handleSaveStatus = async () => {
    if (!editingStatus || !projectId) return;

    // Validate required fields
    if (!editingStatus.name) {
      alert("Status name is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");

      // Determine if this is an update or create
      const isUpdate =
        editingStatus._id && !editingStatus._id.startsWith("temp_");
      const url = isUpdate
        ? `${API_CONFIG.API_URL}/statuses/${editingStatus._id}`
        : `${API_CONFIG.API_URL}/statuses/project/${projectId}`;

      const method = isUpdate ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editingStatus.name,
          code: editingStatus.code,
          color: editingStatus.color,
          isDefault: editingStatus.isDefault,
          isClosed: editingStatus.isClosed,
          requireClosingRemark: editingStatus.requireClosingRemark,
          displayOrder: editingStatus.displayOrder,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Reload statuses from server
        await loadStatuses();
        setShowStatusModal(false);
        setEditingStatus(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert(data.message || "Failed to save status");
      }
    } catch (error) {
      console.error("Error saving status:", error);
      alert("Failed to save status");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStatus = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this status?")) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/statuses/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (data.success) {
        // Reload statuses from server
        await loadStatuses();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert(data.message || "Failed to delete status");
      }
    } catch (error) {
      console.error("Error deleting status:", error);
      alert("Failed to delete status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div style={{ padding: "24px", maxWidth: "1600px", margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginBottom: "8px",
              }}
            >
              Ticket Configuration {projectName && `- ${projectName}`}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--text-secondary)",
              }}
            >
              Configure ticket numbering, statuses, priorities, categories, and
              types for this project
            </p>
            <p
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
                marginTop: "4px",
                fontStyle: "italic",
              }}
            >
              Note: Assignment rules, notifications, and SLA settings are
              configured in Project Management and SLA/Escalation pages
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={handleSave}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 24px",
                background: saved ? "#10b981" : "var(--primary-main)",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: loading ? "not-allowed" : "pointer",
                color: "white",
              }}
            >
              <MdSave />{" "}
              {saved ? "Saved!" : loading ? "Saving..." : "Save All Changes"}
            </button>
          </div>
        </div>

        {/* Two Column Layout — formFields tab is full-width (has its own live preview) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: activeTab === "formFields" ? "1fr" : "60% 38%",
            gap: "24px",
          }}
        >
          {/* Left Column - Configuration */}
          <div>
            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                borderBottom: "2px solid var(--border-subtle)",
                marginBottom: "24px",
                overflowX: "auto",
                paddingBottom: "0",
              }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "12px 20px",
                    background: "transparent",
                    border: "none",
                    borderBottom:
                      activeTab === tab.id
                        ? "3px solid var(--primary-main)"
                        : "3px solid transparent",
                    fontSize: "14px",
                    fontWeight: activeTab === tab.id ? "600" : "500",
                    color:
                      activeTab === tab.id
                        ? "var(--primary-main)"
                        : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div
              style={{
                background: "white",
                border: "1px solid var(--border-subtle)",
                borderRadius: "12px",
                padding: "32px",
              }}
            >
              {/* Ticket Numbering Tab */}
              {activeTab === "numbering" && (
                <div>
                  <h2
                    style={{
                      fontSize: "20px",
                      fontWeight: "600",
                      marginBottom: "24px",
                    }}
                  >
                    Ticket Numbering Configuration
                  </h2>

                  <div style={{ display: "grid", gap: "24px" }}>
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
                            marginBottom: "8px",
                            fontWeight: "500",
                          }}
                        >
                          Prefix
                        </label>
                        <input
                          type="text"
                          value={numbering.prefix}
                          onChange={(e) =>
                            setNumbering({
                              ...numbering,
                              prefix: e.target.value,
                            })
                          }
                          placeholder="e.g., TICK, REQ, INC"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "8px",
                            fontSize: "14px",
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "8px",
                            fontWeight: "500",
                          }}
                        >
                          Starting Number
                        </label>
                        <input
                          type="number"
                          value={numbering.startingNumber}
                          onChange={(e) =>
                            setNumbering({
                              ...numbering,
                              startingNumber: parseInt(e.target.value),
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "8px",
                            fontSize: "14px",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "8px",
                          fontWeight: "500",
                        }}
                      >
                        Separator
                      </label>
                      <input
                        type="text"
                        value={numbering.separator}
                        onChange={(e) =>
                          setNumbering({
                            ...numbering,
                            separator: e.target.value,
                          })
                        }
                        placeholder="e.g., -, _, /"
                        maxLength={1}
                        style={{
                          width: "200px",
                          padding: "10px 12px",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "8px",
                          fontSize: "14px",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "16px",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={numbering.includeYear}
                          onChange={(e) =>
                            setNumbering({
                              ...numbering,
                              includeYear: e.target.checked,
                            })
                          }
                        />
                        Include Year
                      </label>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={numbering.includeMonth}
                          onChange={(e) =>
                            setNumbering({
                              ...numbering,
                              includeMonth: e.target.checked,
                            })
                          }
                        />
                        Include Month
                      </label>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "8px",
                          fontWeight: "500",
                        }}
                      >
                        Reset Frequency
                      </label>
                      <select
                        value={numbering.resetFrequency}
                        onChange={(e) =>
                          setNumbering({
                            ...numbering,
                            resetFrequency: e.target.value as any,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "8px",
                          fontSize: "14px",
                        }}
                      >
                        <option value="never">Never (Continuous)</option>
                        <option value="yearly">Reset Yearly</option>
                        <option value="monthly">Reset Monthly</option>
                      </select>
                    </div>

                    <div
                      style={{
                        background: "#dbeafe",
                        border: "1px solid #3b82f6",
                        borderRadius: "8px",
                        padding: "16px",
                        display: "flex",
                        gap: "12px",
                      }}
                    >
                      <MdInfo
                        style={{
                          color: "#3b82f6",
                          fontSize: "20px",
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <strong style={{ color: "#1e40af" }}>Preview:</strong>
                        <p
                          style={{
                            color: "#1e40af",
                            marginTop: "4px",
                            fontSize: "18px",
                            fontWeight: "600",
                          }}
                        >
                          {generatePreview()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Ticket Statuses Tab */}
              {activeTab === "statuses" && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "24px",
                    }}
                  >
                    <h2 style={{ fontSize: "20px", fontWeight: "600" }}>
                      Ticket Statuses
                    </h2>
                    <button
                      onClick={handleAddStatus}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 16px",
                        background: "var(--primary-main)",
                        border: "none",
                        borderRadius: "8px",
                        color: "white",
                        fontSize: "14px",
                        fontWeight: "500",
                        cursor: "pointer",
                      }}
                    >
                      <MdAdd /> Add Status
                    </button>
                  </div>

                  <div style={{ display: "grid", gap: "12px" }}>
                    {loadingStatuses && (
                      <div
                        style={{
                          padding: "20px",
                          textAlign: "center",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Loading statuses...
                      </div>
                    )}
                    {!loadingStatuses && statuses.length === 0 && (
                      <div
                        style={{
                          padding: "20px",
                          textAlign: "center",
                          color: "var(--text-secondary)",
                        }}
                      >
                        No statuses found. Click "Add Status" to create one.
                      </div>
                    )}
                    {!loadingStatuses &&
                      statuses.map((status) => (
                        <div
                          key={status._id || String(status.code)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "16px",
                            padding: "16px",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "8px",
                            background: "white",
                          }}
                        >
                          <MdDragIndicator
                            style={{
                              color: "var(--text-secondary)",
                              cursor: "grab",
                            }}
                          />
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              borderRadius: "4px",
                              background: status.color,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{ fontWeight: "600", fontSize: "14px" }}
                            >
                              {status.name}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Code: {status.code}
                              {status.isDefault && " • Default"}
                              {status.isClosed && " • Closes Ticket"}
                            </div>
                          </div>
                          <button
                            onClick={() => handleEditStatus(status)}
                            style={{
                              padding: "8px 12px",
                              background: "transparent",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <MdEdit /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteStatus(status._id || "")}
                            style={{
                              padding: "8px 12px",
                              background: "transparent",
                              border: "1px solid #ef4444",
                              borderRadius: "6px",
                              color: "#ef4444",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <MdDelete /> Delete
                          </button>
                        </div>
                      ))}
                  </div>

                  {/* Status Modal */}
                  {showStatusModal && editingStatus && (
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
                          borderRadius: "12px",
                          padding: "24px",
                          width: "500px",
                          maxWidth: "90%",
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "18px",
                            fontWeight: "600",
                            marginBottom: "20px",
                          }}
                        >
                          {editingStatus._id ? "Edit Status" : "Add Status"}
                        </h3>

                        <div style={{ display: "grid", gap: "16px" }}>
                          <div>
                            <label
                              style={{
                                display: "block",
                                marginBottom: "8px",
                                fontWeight: "500",
                              }}
                            >
                              Name
                            </label>
                            <input
                              type="text"
                              value={editingStatus.name}
                              onChange={(e) => {
                                const name = e.target.value;
                                setEditingStatus({
                                  ...editingStatus,
                                  name,
                                });
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: "8px",
                              }}
                            />
                          </div>

                          <div>
                            <label
                              style={{
                                display: "block",
                                marginBottom: "8px",
                                fontWeight: "500",
                              }}
                            >
                              Code{" "}
                              <span
                                style={{ color: "#6b7280", fontSize: "12px" }}
                              >
                                (Auto-assigned)
                              </span>
                            </label>
                            <input
                              type="number"
                              value={editingStatus.code}
                              readOnly
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: "8px",
                                backgroundColor: "#f9fafb",
                                color: "#6b7280",
                                cursor: "not-allowed",
                              }}
                            />
                          </div>

                          <div>
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
                              value={editingStatus.color}
                              onChange={(e) =>
                                setEditingStatus({
                                  ...editingStatus,
                                  color: e.target.value,
                                })
                              }
                              style={{
                                width: "100%",
                                height: "50px",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: "8px",
                                cursor: "pointer",
                              }}
                            />
                          </div>

                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={editingStatus.isDefault}
                              onChange={(e) =>
                                setEditingStatus({
                                  ...editingStatus,
                                  isDefault: e.target.checked,
                                })
                              }
                            />
                            Set as Default Status
                          </label>

                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={editingStatus.isClosed}
                              onChange={(e) =>
                                setEditingStatus({
                                  ...editingStatus,
                                  isClosed: e.target.checked,
                                })
                              }
                            />
                            This Status Closes Tickets
                          </label>

                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginTop: "4px",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                editingStatus.requireClosingRemark ?? false
                              }
                              onChange={(e) =>
                                setEditingStatus({
                                  ...editingStatus,
                                  requireClosingRemark: e.target.checked,
                                })
                              }
                            />
                            <span>
                              Require Remark Before Applying This Status
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "11px",
                                  color: "#6b7280",
                                  fontWeight: 400,
                                }}
                              >
                                Agent must enter a remark + date before this
                                status is saved
                              </span>
                            </span>
                          </label>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            marginTop: "24px",
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            onClick={() => {
                              setShowStatusModal(false);
                              setEditingStatus(null);
                            }}
                            style={{
                              padding: "10px 20px",
                              background: "transparent",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "8px",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveStatus}
                            style={{
                              padding: "10px 20px",
                              background: "var(--primary-main)",
                              border: "none",
                              borderRadius: "8px",
                              color: "white",
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Categories Tab - Hierarchical Category Management */}
              {activeTab === "categories" && projectId && (
                <div>
                  <div style={{ marginBottom: "24px" }}>
                    <h2
                      style={{
                        fontSize: "20px",
                        fontWeight: "600",
                        marginBottom: "8px",
                      }}
                    >
                      Categories Configuration
                    </h2>
                  </div>

                  <p
                    style={{
                      fontSize: "14px",
                      color: "var(--text-secondary)",
                      marginBottom: "12px",
                    }}
                  >
                    Configure hierarchical category levels (1-4 levels) and
                    manage category items in a tree structure.
                  </p>
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#eff6ff",
                      border: "1px solid #3b82f6",
                      borderRadius: "8px",
                      fontSize: "13px",
                      color: "#1e40af",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      marginBottom: "16px",
                    }}
                  >
                    <MdInfo
                      size={18}
                      style={{ marginTop: "2px", flexShrink: 0 }}
                    />
                    <div>
                      <strong>How it works:</strong>
                      <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                        <li>
                          Set the number of levels (1-4) for your category
                          hierarchy
                        </li>
                        <li>
                          Give custom names to each level (e.g., Course,
                          Category, Subcategory, Topic)
                        </li>
                        <li>
                          Add category items at each level - child items appear
                          when their parent is selected
                        </li>
                        <li>
                          Level 1 is always mandatory, other levels can be
                          optional
                        </li>
                        <li>
                          Set priority mapping: select which category level
                          determines ticket priority
                        </li>
                      </ul>
                    </div>
                  </div>
                  <HierarchyConfigManager
                    projectId={projectId}
                    onSave={() => setSaved(true)}
                  />
                </div>
              )}

              {/* Form Fields Tab — drag-and-drop builder with conditions */}
              {activeTab === "formFields" && (
                <div>
                  <div style={{ marginBottom: "20px" }}>
                    <h2
                      style={{
                        fontSize: "20px",
                        fontWeight: "600",
                        marginBottom: "8px",
                      }}
                    >
                      Online Query Form Fields
                    </h2>
                    <p
                      style={{
                        fontSize: "14px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Configure custom fields for the online ticket submission
                      form. Drag to reorder. Add conditional visibility rules
                      per field.
                    </p>
                  </div>

                  {loadingFormFields ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Loading form fields…
                    </div>
                  ) : (
                    <div>
                      <FormFieldBuilder
                        fields={formFields}
                        onChange={(updated) => setFormFields(updated)}
                        projectId={projectId}
                        hierarchyConfig={hierarchyConfig || undefined}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Configuration Summary (hidden on formFields tab which has its own live preview) */}
          {activeTab !== "formFields" && (
            <div>
              <div style={{ position: "sticky", top: "24px" }}>
                <div
                  style={{
                    background: "white",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "12px",
                    padding: "24px",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "18px",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <MdInfo style={{ color: "var(--primary-main)" }} />
                    Configuration Summary
                  </h3>

                  {activeTab === "numbering" && (
                    <div>
                      <h4
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          marginBottom: "12px",
                        }}
                      >
                        Preview Format
                      </h4>
                      <div
                        style={{
                          background: "#f3f4f6",
                          padding: "16px",
                          borderRadius: "8px",
                          fontFamily: "monospace",
                          fontSize: "16px",
                          fontWeight: "600",
                          textAlign: "center",
                          color: "var(--primary-main)",
                          marginBottom: "16px",
                        }}
                      >
                        {generatePreview()}
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <p>
                          <strong>Format:</strong> {numbering.format}
                        </p>
                        <p>
                          <strong>Prefix:</strong> {numbering.prefix || "None"}
                        </p>
                        <p>
                          <strong>Starting Number:</strong>{" "}
                          {numbering.startingNumber}
                        </p>
                        <p>
                          <strong>Reset:</strong> {numbering.resetFrequency}
                        </p>
                      </div>
                    </div>
                  )}

                  {activeTab === "statuses" && (
                    <div>
                      <h4
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          marginBottom: "12px",
                        }}
                      >
                        Configured Statuses
                      </h4>
                      <div style={{ maxHeight: "500px", overflowY: "auto" }}>
                        <table
                          style={{
                            width: "100%",
                            fontSize: "13px",
                            borderCollapse: "collapse",
                          }}
                        >
                          <thead
                            style={{
                              background: "#f9fafb",
                              position: "sticky",
                              top: 0,
                            }}
                          >
                            <tr>
                              <th
                                style={{
                                  padding: "8px",
                                  textAlign: "left",
                                  fontWeight: "600",
                                }}
                              >
                                #
                              </th>
                              <th
                                style={{
                                  padding: "8px",
                                  textAlign: "left",
                                  fontWeight: "600",
                                }}
                              >
                                Name
                              </th>
                              <th
                                style={{
                                  padding: "8px",
                                  textAlign: "center",
                                  fontWeight: "600",
                                }}
                              >
                                Type
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {statuses
                              .sort((a, b) => a.displayOrder - b.displayOrder)
                              .map((status, index) => (
                                <tr
                                  key={status._id}
                                  style={{ borderBottom: "1px solid #f3f4f6" }}
                                >
                                  <td style={{ padding: "8px" }}>
                                    {index + 1}
                                  </td>
                                  <td style={{ padding: "8px" }}>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: "12px",
                                          height: "12px",
                                          borderRadius: "50%",
                                          background: status.color,
                                          display: "inline-block",
                                        }}
                                      ></span>
                                      {status.name}
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "8px",
                                      textAlign: "center",
                                    }}
                                  >
                                    {status.isDefault && (
                                      <span style={{ color: "#10b981" }}>
                                        ✓ Default
                                      </span>
                                    )}
                                    {status.isClosed && (
                                      <span style={{ color: "#6b7280" }}>
                                        Closed
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {statuses.length === 0 && (
                          <div
                            style={{
                              textAlign: "center",
                              padding: "32px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            No statuses configured yet
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "categories" && (
                    <div>
                      <h4
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          marginBottom: "12px",
                        }}
                      >
                        Hierarchical Categories
                      </h4>
                      <div
                        style={{
                          padding: "16px",
                          background: "#f0f9ff",
                          borderRadius: "8px",
                          border: "1px solid #bae6fd",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "13px",
                            color: "#0369a1",
                            margin: 0,
                          }}
                        >
                          Categories are now managed with a hierarchical
                          structure supporting up to 4 levels. Configure the
                          hierarchy and add categories in the main panel.
                        </p>
                        <div
                          style={{
                            marginTop: "12px",
                            fontSize: "12px",
                            color: "#0c4a6e",
                          }}
                        >
                          <strong>Features:</strong>
                          <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
                            <li>Configurable hierarchy depth (1-4 levels)</li>
                            <li>Priority assignment from any level</li>
                            <li>Parent-child category relationships</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "formFields" && (
                    <div>
                      <h4
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "var(--text-secondary)",
                          marginBottom: "12px",
                        }}
                      >
                        Configured Form Fields
                      </h4>

                      {/* Fixed Fields Section */}
                      <div style={{ marginBottom: "16px" }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#3b82f6",
                            marginBottom: "8px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span>🔒</span> Fixed Fields (Always Present)
                        </div>
                        <div style={{ display: "grid", gap: "8px" }}>
                          {[
                            {
                              fieldName: "Name",
                              fieldType: "text",
                              required: true,
                              placeholder: "Enter your full name",
                            },
                            {
                              fieldName: "Email",
                              fieldType: "email",
                              required: true,
                              placeholder: "Enter your email address",
                            },
                            {
                              fieldName: "Phone",
                              fieldType: "phone",
                              required: true,
                              placeholder: "Enter your phone number",
                            },
                          ].map((field, index) => (
                            <div
                              key={index}
                              style={{
                                padding: "10px 12px",
                                background: "#eff6ff",
                                borderRadius: "6px",
                                border: "1px solid #bfdbfe",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: "600",
                                    fontSize: "12px",
                                    color: "#1e40af",
                                  }}
                                >
                                  {field.fieldName}
                                  {field.required && (
                                    <span style={{ color: "#ef4444" }}> *</span>
                                  )}
                                </span>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    padding: "2px 6px",
                                    background: "white",
                                    border: "1px solid #bfdbfe",
                                    borderRadius: "4px",
                                    fontWeight: "500",
                                    color: "#1e40af",
                                  }}
                                >
                                  {field.fieldType}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: "10px",
                                  color: "#6b7280",
                                  marginTop: "4px",
                                  fontStyle: "italic",
                                }}
                              >
                                "{field.placeholder}"
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Custom Dynamic Fields Section */}
                      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                            marginBottom: "8px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span>✏️</span> Custom Fields ({formFields.length})
                        </div>
                        {formFields.length === 0 ? (
                          <div
                            style={{
                              textAlign: "center",
                              padding: "24px",
                              color: "#9ca3af",
                              fontSize: "12px",
                              background: "#f9fafb",
                              borderRadius: "6px",
                              border: "1px dashed #d1d5db",
                            }}
                          >
                            No custom fields added yet
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "12px" }}>
                            {formFields.map((field, index) => (
                              <div
                                key={field.id || index}
                                style={{
                                  padding: "12px",
                                  background: "#f9fafb",
                                  borderRadius: "8px",
                                  border: "1px solid #e5e7eb",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontWeight: "600",
                                      fontSize: "13px",
                                    }}
                                  >
                                    {field.fieldName}
                                    {field.required && (
                                      <span style={{ color: "#ef4444" }}>
                                        {" "}
                                        *
                                      </span>
                                    )}
                                  </span>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "4px",
                                      alignItems: "center",
                                    }}
                                  >
                                    {field.isFixed && (
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          padding: "2px 5px",
                                          background: "#dbeafe",
                                          color: "#1d4ed8",
                                          borderRadius: "4px",
                                          fontWeight: "600",
                                        }}
                                        title="Fixed Field — always in API schema as fixed_fields"
                                      >
                                        📌 Fixed
                                      </span>
                                    )}
                                    {!field.isFixed &&
                                      field.includeInPublicApi && (
                                        <span
                                          style={{
                                            fontSize: "10px",
                                            padding: "2px 5px",
                                            background: "#dcfce7",
                                            color: "#15803d",
                                            borderRadius: "4px",
                                            fontWeight: "600",
                                          }}
                                          title="Custom Field — exposed via External API as custom_fields"
                                        >
                                          🌐 API
                                        </span>
                                      )}
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        padding: "2px 6px",
                                        background: "white",
                                        border: "1px solid #d1d5db",
                                        borderRadius: "4px",
                                        fontWeight: "500",
                                      }}
                                    >
                                      {field.fieldType}
                                    </span>
                                  </div>
                                </div>
                                {field.placeholder && (
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "#9ca3af",
                                      marginTop: "4px",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    "{field.placeholder}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "12px",
                          background: "#eff6ff",
                          borderRadius: "8px",
                          border: "1px solid #bfdbfe",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#1e40af",
                            fontWeight: "500",
                            marginBottom: "4px",
                          }}
                        >
                          💡 Preview
                        </p>
                        <p style={{ fontSize: "11px", color: "#3b82f6" }}>
                          These fields will appear in the online ticket
                          submission form for students.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TicketSettings;
