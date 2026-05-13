import React, { useState, useEffect } from "react";
import axios from "axios";
import { Plus, Edit2, Trash2, Eye, EyeOff, Move } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { API_CONFIG } from "../../config/constants";

interface KBLevel {
  _id: string;
  levelName: string;
  levelOrder: number;
  levelIcon?: string;
  status: "active" | "inactive";
  description?: string;
  articleCount?: number;
  createdBy?: { name: string };
}

interface KBLevelManagementProps {
  projectId: string;
}

const KBLevelManagement: React.FC<KBLevelManagementProps> = ({ projectId }) => {
  const [levels, setLevels] = useState<KBLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<KBLevel | null>(null);
  const [formData, setFormData] = useState({
    levelName: "",
    levelIcon: "",
    description: "",
    status: "active" as "active" | "inactive",
  });

  useEffect(() => {
    fetchLevels();
  }, [projectId]);

  const fetchLevels = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/levels`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { projectId },
      });
      setLevels(response.data.data || []);
    } catch (error: any) {
      console.error("Failed to fetch KB levels:", error);
      alert(error.response?.data?.message || "Failed to fetch levels");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate level name
    if (!formData.levelName.trim()) {
      alert("Level name is required");
      return;
    }

    try {
      const token = localStorage.getItem("authToken");

      // Calculate levelOrder for new levels
      let levelOrder = editingLevel
        ? editingLevel.levelOrder
        : levels.length + 1;

      const payload = {
        levelName: formData.levelName.trim(),
        levelIcon: formData.levelIcon.trim(),
        description: formData.description.trim(),
        status: formData.status,
        levelOrder,
        projectIds: [projectId],
      };

      console.log("Submitting KB Level:", payload);

      if (editingLevel) {
        // Update existing level
        await axios.put(
          `${API_CONFIG.API_URL}/kb/levels/${editingLevel._id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        // Create new level
        const response = await axios.post(
          `${API_CONFIG.API_URL}/kb/levels`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        console.log("Create response:", response.data);
      }

      setShowModal(false);
      resetForm();
      fetchLevels();
    } catch (error: any) {
      console.error("Failed to save level:", error);
      console.error("Error response:", error.response?.data);
      alert(
        error.response?.data?.message ||
          error.message ||
          "Failed to save level",
      );
    }
  };

  const handleDelete = async (levelId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this level? This will unmap all articles.",
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(`${API_CONFIG.API_URL}/kb/levels/${levelId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchLevels();
    } catch (error: any) {
      console.error("Failed to delete level:", error);
      alert(error.response?.data?.message || "Failed to delete level");
    }
  };

  const handleToggleStatus = async (level: KBLevel) => {
    try {
      const token = localStorage.getItem("authToken");
      await axios.put(
        `${API_CONFIG.API_URL}/kb/levels/${level._id}`,
        { status: level.status === "active" ? "inactive" : "active" },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      fetchLevels();
    } catch (error: any) {
      console.error("Failed to toggle status:", error);
      alert(error.response?.data?.message || "Failed to update status");
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const reorderedLevels = Array.from(levels);
    const [moved] = reorderedLevels.splice(result.source.index, 1);
    reorderedLevels.splice(result.destination.index, 0, moved);

    // Update local state immediately
    setLevels(reorderedLevels);

    // Send reorder request
    try {
      const token = localStorage.getItem("authToken");
      const updates = reorderedLevels.map((level, index) => ({
        levelId: level._id,
        levelOrder: index + 1,
      }));

      await axios.put(
        `${API_CONFIG.API_URL}/kb/levels/reorder/batch`,
        { levels: updates },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error: any) {
      console.error("Failed to reorder levels:", error);
      alert(error.response?.data?.message || "Failed to reorder levels");
      fetchLevels(); // Revert on error
    }
  };

  const openEditModal = (level: KBLevel) => {
    setEditingLevel(level);
    setFormData({
      levelName: level.levelName,
      levelIcon: level.levelIcon || "",
      description: level.description || "",
      status: level.status,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingLevel(null);
    setFormData({
      levelName: "",
      levelIcon: "",
      description: "",
      status: "active",
    });
  };

  const totalLevels = levels.length;
  const activeLevels = levels.filter((l) => l.status === "active").length;
  const inactiveLevels = levels.filter((l) => l.status === "inactive").length;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "64px",
        }}
      >
        <div style={{ color: "#667085", fontSize: "14px" }}>
          Loading levels...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#F8F9FC",
        minHeight: "100vh",
        padding: "24px 20px 32px",
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Page Header — matches ViewTickets style */}
      <div
        style={{
          background: "#ffffff",
          padding: "22px 24px",
          borderRadius: "14px",
          marginBottom: "16px",
          border: "1px solid #e7ebf3",
          boxShadow: "0 4px 18px rgba(15,23,42,.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 4px 0",
              fontSize: "22px",
              fontWeight: 700,
              color: "#101828",
              letterSpacing: "-0.01em",
            }}
          >
            📚 Knowledge Base Levels
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#667085" }}>
            Manage and reorder categories — drag rows to change order
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#7F56D9",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={18} />
          Add Level
        </button>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        {[
          {
            label: "Total Levels",
            value: totalLevels,
            color: "#7F56D9",
            bg: "#F4F3FF",
            icon: "📋",
          },
          {
            label: "Active",
            value: activeLevels,
            color: "#027A48",
            bg: "#ECFDF3",
            icon: "✅",
          },
          {
            label: "Inactive",
            value: inactiveLevels,
            color: "#344054",
            bg: "#F2F4F7",
            icon: "⏸",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: "1 1 160px",
              background: "white",
              borderRadius: "10px",
              padding: "16px 20px",
              border: "1px solid #E4E7EC",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                background: stat.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}
            >
              {stat.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#101828",
                  lineHeight: 1.2,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}
              >
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Levels Table */}
      <div
        style={{
          background: "white",
          borderRadius: "10px",
          border: "1px solid #E4E7EC",
          boxShadow: "0 1px 3px rgba(0,0,0,.06)",
          overflow: "hidden",
        }}
      >
        {/* Table Header */}
        <div
          style={{
            background: "#F9FAFB",
            borderBottom: "1px solid #E4E7EC",
            display: "grid",
            gridTemplateColumns: "40px 60px 1fr 180px 80px 120px",
            padding: "12px 16px",
            gap: "0",
          }}
        >
          {["", "ICON", "LEVEL NAME", "DESCRIPTION", "ARTICLES", "ACTIONS"].map(
            (h, i) => (
              <div
                key={i}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#667085",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  paddingRight: "8px",
                }}
              >
                {h}
              </div>
            ),
          )}
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="levels">
            {(provided: any) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {levels.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "48px 24px",
                      color: "#667085",
                      fontSize: "14px",
                    }}
                  >
                    No levels found. Click <strong>Add Level</strong> to get
                    started.
                  </div>
                ) : (
                  levels.map((level, index) => (
                    <Draggable
                      key={level._id}
                      draggableId={level._id}
                      index={index}
                    >
                      {(provided: any, snapshot: any) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={{
                            ...provided.draggableProps.style,
                            background: snapshot.isDragging
                              ? "#F4F3FF"
                              : "white",
                            borderBottom: "1px solid #F2F4F7",
                            display: "grid",
                            gridTemplateColumns:
                              "40px 60px 1fr 180px 80px 120px",
                            padding: "14px 16px",
                            alignItems: "center",
                            borderLeft: `3px solid ${level.status === "active" ? "#027A48" : "#E4E7EC"}`,
                          }}
                        >
                          {/* Drag Handle */}
                          <div
                            {...provided.dragHandleProps}
                            style={{
                              cursor: "grab",
                              color: "#9CA3AF",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Move size={16} />
                          </div>
                          {/* Icon */}
                          <div style={{ fontSize: "22px" }}>
                            {level.levelIcon || "📄"}
                          </div>
                          {/* Name + Status */}
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: 600,
                                  color: "#101828",
                                }}
                              >
                                {level.levelName}
                              </span>
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: "20px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  background:
                                    level.status === "active"
                                      ? "#ECFDF3"
                                      : "#F2F4F7",
                                  color:
                                    level.status === "active"
                                      ? "#027A48"
                                      : "#344054",
                                }}
                              >
                                {level.status}
                              </span>
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#667085",
                                marginTop: "2px",
                              }}
                            >
                              Order: {level.levelOrder}
                            </div>
                          </div>
                          {/* Description */}
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#667085",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {level.description || "—"}
                          </div>
                          {/* Article count */}
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#344054",
                              fontWeight: 500,
                            }}
                          >
                            {level.articleCount || 0}
                          </div>
                          {/* Actions */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <button
                              onClick={() => handleToggleStatus(level)}
                              title={
                                level.status === "active"
                                  ? "Deactivate"
                                  : "Activate"
                              }
                              style={{
                                padding: "6px",
                                borderRadius: "6px",
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color:
                                  level.status === "active"
                                    ? "#027A48"
                                    : "#9CA3AF",
                              }}
                            >
                              {level.status === "active" ? (
                                <Eye size={16} />
                              ) : (
                                <EyeOff size={16} />
                              )}
                            </button>
                            <button
                              onClick={() => openEditModal(level)}
                              title="Edit"
                              style={{
                                padding: "6px",
                                borderRadius: "6px",
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: "#7F56D9",
                              }}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(level._id)}
                              title="Delete"
                              style={{
                                padding: "6px",
                                borderRadius: "6px",
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: "#DC2626",
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        {levels.length > 0 && (
          <div
            style={{
              padding: "12px 16px",
              background: "#F9FAFB",
              borderTop: "1px solid #E4E7EC",
              fontSize: "13px",
              color: "#667085",
            }}
          >
            {totalLevels} level{totalLevels !== 1 ? "s" : ""} total
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 20px 60px rgba(0,0,0,.3)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                background: "linear-gradient(135deg,#7F56D9 0%,#9E77ED 100%)",
                padding: "20px 24px",
                color: "white",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
                {editingLevel ? "✏️ Edit Level" : "➕ Create New Level"}
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "13px", opacity: 0.85 }}>
                {editingLevel
                  ? "Update the level details below"
                  : "Add a new category to the knowledge base"}
              </p>
            </div>
            {/* Modal Body */}
            <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#344054",
                    marginBottom: "6px",
                  }}
                >
                  Level Name *
                </label>
                <input
                  type="text"
                  value={formData.levelName}
                  onChange={(e) =>
                    setFormData({ ...formData, levelName: e.target.value })
                  }
                  required
                  maxLength={100}
                  style={{
                    width: "100%",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    fontSize: "14px",
                    background: "#F9FAFB",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#344054",
                    marginBottom: "6px",
                  }}
                >
                  Icon (Emoji)
                </label>
                <input
                  type="text"
                  value={formData.levelIcon}
                  onChange={(e) =>
                    setFormData({ ...formData, levelIcon: e.target.value })
                  }
                  placeholder="📚"
                  maxLength={10}
                  style={{
                    width: "100%",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    fontSize: "14px",
                    background: "#F9FAFB",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#344054",
                    marginBottom: "6px",
                  }}
                >
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                  style={{
                    width: "100%",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    fontSize: "14px",
                    background: "#F9FAFB",
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#344054",
                    marginBottom: "6px",
                  }}
                >
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as "active" | "inactive",
                    })
                  }
                  style={{
                    width: "100%",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    padding: "9px 12px",
                    fontSize: "14px",
                    background: "#F9FAFB",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "1px solid #E4E7EC",
                    background: "white",
                    color: "#344054",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#7F56D9",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {editingLevel ? "Update Level" : "Create Level"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KBLevelManagement;
