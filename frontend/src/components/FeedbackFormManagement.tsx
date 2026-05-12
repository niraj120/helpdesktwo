import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import FeedbackFormBuilder from "./FeedbackFormBuilder";
import DashboardLayout from "./DashboardLayout";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  ChevronDownIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const FONT = '"Noto Sans", system-ui, -apple-system, sans-serif';

interface FeedbackQuestion {
  id: string;
  type: "rating" | "text" | "textarea" | "radio" | "checkbox" | "select";
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maxRating?: number;
  order: number;
}

interface FeedbackTrigger {
  type:
    | "ticket_created"
    | "ticket_status_changed"
    | "ticket_closed"
    | "student_registered"
    | "agent_assigned";
  enabled: boolean;
  conditions: {
    statusIds?: string[];
    [key: string]: any;
  };
}

interface FeedbackForm {
  _id: string;
  projectId: string;
  name: string;
  description?: string;
  questions: FeedbackQuestion[];
  isActive: boolean;
  triggers?: FeedbackTrigger[];
  emailTemplate?: {
    subject: string;
    body: string;
  };
  settings: {
    showAfterTicketClosed: boolean;
    allowMultipleSubmissions: boolean;
    sendEmailNotification: boolean;
    emailDelay?: number;
  };
  createdBy: any;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  _id: string;
  name: string;
  code: string;
}

const FeedbackFormManagement: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [forms, setForms] = useState<FeedbackForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingForm, setEditingForm] = useState<FeedbackForm | null>(null);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [selectedFormForBuilder, setSelectedFormForBuilder] = useState<
    string | null
  >(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    isActive: boolean;
    triggers: FeedbackTrigger[];
    emailTemplate: {
      subject: string;
      body: string;
    };
    settings: {
      showAfterTicketClosed: boolean;
      allowMultipleSubmissions: boolean;
      sendEmailNotification: boolean;
      emailDelay: number | undefined;
    };
  }>({
    name: "",
    description: "",
    isActive: true,
    triggers: [
      {
        type: "ticket_closed",
        enabled: true,
        conditions: {},
      },
    ],
    emailTemplate: {
      subject: "Please share your feedback on Ticket #{ticketNumber}",
      body: "Dear {studentName},\n\nYour ticket #{ticketNumber} has been resolved. We would love to hear your feedback.\n\nPlease click the link below to share your experience:\n{feedbackLink}\n\nThank you for your time!",
    },
    settings: {
      showAfterTicketClosed: true,
      allowMultipleSubmissions: false,
      sendEmailNotification: true,
      emailDelay: 0,
    },
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchForms();
    } else {
      setForms([]);
      setLoading(false);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects?limit=100`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        const projectsArray = Array.isArray(response.data.data?.projects)
          ? response.data.data.projects
          : Array.isArray(response.data.data)
            ? response.data.data
            : [];
        setProjects(projectsArray);
      }
    } catch (error: any) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchForms = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/feedback-forms/project/${selectedProjectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        setForms(response.data.data);
      }
    } catch (error: any) {
      console.error("Error fetching feedback forms:", error);
      alert(error.response?.data?.message || "Failed to fetch feedback forms");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingForm(null);
    setFormData({
      name: "",
      description: "",
      isActive: true,
      triggers: [{ type: "ticket_closed", enabled: true, conditions: {} }],
      emailTemplate: {
        subject: "Please share your feedback on Ticket #{ticketNumber}",
        body: "Dear {studentName},\n\nYour ticket #{ticketNumber} has been resolved. We would love to hear your feedback.\n\nPlease click the link below to share your experience:\n{feedbackLink}\n\nThank you for your time!",
      },
      settings: {
        showAfterTicketClosed: true,
        allowMultipleSubmissions: false,
        sendEmailNotification: true,
        emailDelay: 0,
      },
    });
    setShowModal(true);
  };

  const handleEdit = (form: FeedbackForm) => {
    setEditingForm(form);
    setFormData({
      name: form.name,
      description: form.description || "",
      isActive: form.isActive,
      triggers: form.triggers || [
        { type: "ticket_closed", enabled: true, conditions: {} },
      ],
      emailTemplate: form.emailTemplate || {
        subject: "Please share your feedback on Ticket #{ticketNumber}",
        body: "Dear {studentName},\n\nYour ticket #{ticketNumber} has been resolved.",
      },
      settings: {
        ...form.settings,
        emailDelay: form.settings.emailDelay || 0,
      },
    });
    setShowModal(true);
  };

  const handleToggleActive = async (formId: string) => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/feedback-forms/${formId}/toggle-active`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        alert(response.data.message);
        fetchForms();
      }
    } catch (error: any) {
      console.error("Error toggling form status:", error);
      alert(error.response?.data?.message || "Failed to toggle form status");
    }
  };

  const handleDelete = async (formId: string) => {
    if (
      !window.confirm("Are you sure you want to delete this feedback form?")
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.delete(
        `${API_CONFIG.API_URL}/feedback-forms/${formId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        alert("Feedback form deleted successfully");
        fetchForms();
      }
    } catch (error: any) {
      console.error("Error deleting feedback form:", error);
      alert(error.response?.data?.message || "Failed to delete feedback form");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log("Form submit triggered");
    console.log("Selected Project ID:", selectedProjectId);

    if (!selectedProjectId) {
      alert("Please select a project first");
      return;
    }

    if (!formData.name.trim()) {
      alert("Please enter a form name");
      return;
    }

    if (!formData.triggers || formData.triggers.length === 0) {
      alert(
        "Please select at least one trigger for when to send this feedback form",
      );
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const userId = localStorage.getItem("userId");

      console.log("Token exists:", !!token);
      console.log("User ID found:", userId);

      if (!userId) {
        alert("User information not found. Please log in again.");
        return;
      }

      // NOTE: questions are intentionally excluded from this payload.
      // They are managed exclusively via the "Design Form" builder.
      // Sending questions: [] here would wipe all builder-added questions.
      const { ...formDataWithoutQuestions } = formData as any;
      delete formDataWithoutQuestions.questions;
      const payload = {
        projectId: selectedProjectId,
        createdBy: userId,
        ...formDataWithoutQuestions,
      };

      console.log("Payload:", payload);
      console.log("API URL:", `${API_CONFIG.API_URL}/feedback-forms`);

      let response;
      if (editingForm) {
        console.log("Updating form:", editingForm._id);
        response = await axios.put(
          `${API_CONFIG.API_URL}/feedback-forms/${editingForm._id}`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } else {
        console.log("Creating new form");
        response = await axios.post(
          `${API_CONFIG.API_URL}/feedback-forms`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      }

      console.log("Response:", response.data);

      if (response.data.success) {
        alert(response.data.message || "Feedback form saved successfully!");
        setShowModal(false);
        fetchForms();
      }
    } catch (error: any) {
      console.error("Error saving feedback form:", error);
      console.error("Error response:", error.response?.data);
      alert(
        error.response?.data?.message ||
          error.message ||
          "Failed to save feedback form",
      );
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 13,
    color: "#111827",
    background: "#fff",
    outline: "none",
    fontFamily: FONT,
    boxSizing: "border-box",
  };

  return (
    <DashboardLayout>
      <div
        style={{
          padding: "24px 20px 32px",
          maxWidth: 1380,
          margin: "0 auto",
          background: "#f6f8fc",
          minHeight: "100vh",
          fontFamily: FONT,
        }}
      >
        {/* â”€â”€ Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div
          style={{
            background: "#fff",
            padding: "22px 24px",
            borderRadius: 14,
            marginBottom: 16,
            border: "1px solid #e7ebf3",
            boxShadow: "0 4px 18px rgba(15,23,42,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                margin: "0 0 4px",
                fontSize: 24,
                fontWeight: 700,
                color: "#111827",
                letterSpacing: "-0.01em",
                fontFamily: FONT,
              }}
            >
              Feedback Forms
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#6b7280",
                fontFamily: FONT,
              }}
            >
              Create and manage customizable feedback forms to collect student
              feedback on resolved tickets
            </p>
          </div>

          {/* Project selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#374151",
                fontFamily: FONT,
                whiteSpace: "nowrap",
              }}
            >
              Project:
            </label>
            <div style={{ position: "relative" }}>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                style={{
                  appearance: "none",
                  padding: "8px 36px 8px 12px",
                  border: "1.5px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: selectedProjectId ? "#111827" : "#9ca3af",
                  background: "#fff",
                  cursor: "pointer",
                  outline: "none",
                  fontFamily: FONT,
                  minWidth: 200,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <option value="">-- Select a project --</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  color: "#6b7280",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
        </div>

        {/* â”€â”€ No project placeholder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {!selectedProjectId && (
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e7ebf3",
              boxShadow: "0 4px 18px rgba(15,23,42,0.05)",
              padding: "64px 24px",
              textAlign: "center",
            }}
          >
            <DocumentTextIcon
              style={{
                width: 48,
                height: 48,
                color: "#d1d5db",
                margin: "0 auto 16px",
              }}
            />
            <p
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#374151",
                margin: "0 0 6px",
                fontFamily: FONT,
              }}
            >
              Select a project to get started
            </p>
            <p
              style={{
                fontSize: 13,
                color: "#9ca3af",
                margin: 0,
                fontFamily: FONT,
              }}
            >
              Choose a project from the dropdown above to manage its feedback
              forms.
            </p>
          </div>
        )}

        {/* â”€â”€ Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {selectedProjectId && (
          <>
            {/* Loading spinner */}
            {loading && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: 200,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    border: "3px solid #e5e7eb",
                    borderTopColor: "#6366f1",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {!loading && (
              <>
                {/* Section header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: "0 0 2px",
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#111827",
                        fontFamily: FONT,
                      }}
                    >
                      Forms Library
                    </h2>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "#6b7280",
                        fontFamily: FONT,
                      }}
                    >
                      Manage all feedback forms for the selected project
                    </p>
                  </div>
                  <button
                    onClick={handleCreate}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "9px 18px",
                      background: "#6366f1",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fff",
                      cursor: "pointer",
                      fontFamily: FONT,
                      boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
                    }}
                  >
                    <PlusIcon style={{ width: 16, height: 16 }} />
                    Create New Form
                  </button>
                </div>

                {/* Empty state */}
                {forms.length === 0 && (
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: 14,
                      border: "1.5px dashed #d1d5db",
                      padding: "64px 24px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        background: "#eef2ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px",
                      }}
                    >
                      <DocumentTextIcon
                        style={{ width: 32, height: 32, color: "#6366f1" }}
                      />
                    </div>
                    <p
                      style={{
                        fontSize: 17,
                        fontWeight: 600,
                        color: "#374151",
                        margin: "0 0 6px",
                        fontFamily: FONT,
                      }}
                    >
                      No Feedback Forms Yet
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        color: "#9ca3af",
                        margin: "0 0 20px",
                        fontFamily: FONT,
                        maxWidth: 360,
                        marginLeft: "auto",
                        marginRight: "auto",
                      }}
                    >
                      Create your first feedback form to start collecting
                      valuable insights from students.
                    </p>
                    <button
                      onClick={handleCreate}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "9px 20px",
                        background: "#6366f1",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#fff",
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      <PlusIcon style={{ width: 16, height: 16 }} />
                      Create Your First Form
                    </button>
                  </div>
                )}

                {/* Forms grid */}
                {forms.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(300px, 1fr))",
                      gap: 16,
                    }}
                  >
                    {forms.map((form) => (
                      <div
                        key={form._id}
                        style={{
                          background: "#fff",
                          borderRadius: 14,
                          border: "1px solid #e7ebf3",
                          boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
                          overflow: "hidden",
                        }}
                      >
                        {/* Gradient card header */}
                        <div
                          style={{
                            background:
                              "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                            padding: "16px 18px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 10,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h3
                              style={{
                                margin: "0 0 4px",
                                fontSize: 16,
                                fontWeight: 700,
                                color: "#fff",
                                fontFamily: FONT,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {form.name}
                            </h3>
                            {form.description && (
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 12,
                                  color: "rgba(255,255,255,0.72)",
                                  fontFamily: FONT,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {form.description}
                              </p>
                            )}
                          </div>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "3px 10px",
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 600,
                              flexShrink: 0,
                              background: form.isActive ? "#dcfce7" : "#f3f4f6",
                              color: form.isActive ? "#15803d" : "#6b7280",
                              fontFamily: FONT,
                            }}
                          >
                            {form.isActive ? (
                              <CheckCircleIcon
                                style={{ width: 12, height: 12 }}
                              />
                            ) : (
                              <XCircleIcon style={{ width: 12, height: 12 }} />
                            )}
                            {form.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>

                        {/* Card body */}
                        <div style={{ padding: "16px 18px" }}>
                          {/* Stats */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 10,
                              marginBottom: 14,
                            }}
                          >
                            <div
                              style={{
                                background: "#eef2ff",
                                borderRadius: 8,
                                padding: "10px 12px",
                              }}
                            >
                              <p
                                style={{
                                  margin: "0 0 2px",
                                  fontSize: 11,
                                  color: "#6366f1",
                                  fontWeight: 600,
                                  fontFamily: FONT,
                                }}
                              >
                                Questions
                              </p>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 22,
                                  fontWeight: 700,
                                  color: "#3730a3",
                                  fontFamily: FONT,
                                }}
                              >
                                {form.questions?.length ?? 0}
                              </p>
                            </div>
                            <div
                              style={{
                                background: "#f5f3ff",
                                borderRadius: 8,
                                padding: "10px 12px",
                              }}
                            >
                              <p
                                style={{
                                  margin: "0 0 2px",
                                  fontSize: 11,
                                  color: "#7c3aed",
                                  fontWeight: 600,
                                  fontFamily: FONT,
                                }}
                              >
                                Email
                              </p>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: "#5b21b6",
                                  fontFamily: FONT,
                                }}
                              >
                                {form.settings.sendEmailNotification
                                  ? "Enabled"
                                  : "Disabled"}
                              </p>
                            </div>
                          </div>

                          {/* Triggers */}
                          {form.triggers && form.triggers.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <p
                                style={{
                                  margin: "0 0 6px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "#9ca3af",
                                  fontFamily: FONT,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}
                              >
                                Triggers:
                              </p>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 4,
                                }}
                              >
                                {form.triggers.map((trigger, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: "#4f46e5",
                                      background: "#eef2ff",
                                      padding: "2px 8px",
                                      borderRadius: 20,
                                      fontFamily: FONT,
                                    }}
                                  >
                                    {trigger.type
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Design Form button */}
                          <button
                            onClick={() => {
                              setSelectedFormForBuilder(form._id);
                              setShowFormBuilder(true);
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "9px 0",
                              background: "#6366f1",
                              border: "none",
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#fff",
                              cursor: "pointer",
                              fontFamily: FONT,
                              marginBottom: 8,
                              boxShadow: "0 2px 6px rgba(99,102,241,0.25)",
                            }}
                          >
                            <WrenchScrewdriverIcon
                              style={{ width: 15, height: 15 }}
                            />
                            Design Form
                          </button>

                          {/* Edit / Toggle / Delete */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr 1fr",
                              gap: 6,
                            }}
                          >
                            <button
                              onClick={() => handleEdit(form)}
                              title="Edit"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "8px 0",
                                background: "#fff",
                                border: "1.5px solid #d1d5db",
                                borderRadius: 8,
                                color: "#374151",
                                cursor: "pointer",
                              }}
                            >
                              <PencilIcon style={{ width: 15, height: 15 }} />
                            </button>
                            <button
                              onClick={() => handleToggleActive(form._id)}
                              title={form.isActive ? "Deactivate" : "Activate"}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "8px 0",
                                background: "#fff",
                                border: `1.5px solid ${form.isActive ? "#fbbf24" : "#86efac"}`,
                                borderRadius: 8,
                                color: form.isActive ? "#d97706" : "#15803d",
                                cursor: "pointer",
                              }}
                            >
                              {form.isActive ? (
                                <XCircleIcon
                                  style={{ width: 15, height: 15 }}
                                />
                              ) : (
                                <CheckCircleIcon
                                  style={{ width: 15, height: 15 }}
                                />
                              )}
                            </button>
                            <button
                              onClick={() => handleDelete(form._id)}
                              title="Delete"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "8px 0",
                                background: "#fff",
                                border: "1.5px solid #fca5a5",
                                borderRadius: 8,
                                color: "#dc2626",
                                cursor: "pointer",
                              }}
                            >
                              <TrashIcon style={{ width: 15, height: 15 }} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* â”€â”€ Create / Edit Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {showModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 16,
            }}
            onClick={() => setShowModal(false)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                width: "100%",
                maxWidth: 600,
                maxHeight: "90vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div
                style={{
                  padding: "20px 24px 16px",
                  borderBottom: "1px solid #f1f3f9",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  flexShrink: 0,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: "0 0 2px",
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#111827",
                      fontFamily: FONT,
                    }}
                  >
                    {editingForm
                      ? "Edit Feedback Form"
                      : "Create Feedback Form"}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "#6b7280",
                      fontFamily: FONT,
                    }}
                  >
                    {editingForm
                      ? "Update form settings below"
                      : 'Fill in details, then use "Design Form" to add questions'}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: 6,
                    background: "#f3f4f6",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <XMarkIcon
                    style={{ width: 18, height: 18, color: "#6b7280" }}
                  />
                </button>
              </div>

              {/* Modal scrollable body */}
              <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
                {/* Step hint for new forms */}
                {!editingForm && (
                  <div
                    style={{
                      background: "#eef2ff",
                      borderRadius: 10,
                      padding: "12px 14px",
                      marginBottom: 20,
                      display: "flex",
                      gap: 10,
                    }}
                  >
                    <WrenchScrewdriverIcon
                      style={{
                        width: 18,
                        height: 18,
                        color: "#6366f1",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    />
                    <div>
                      <p
                        style={{
                          margin: "0 0 4px",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#3730a3",
                          fontFamily: FONT,
                        }}
                      >
                        Form Creation Steps
                      </p>
                      <ol
                        style={{
                          margin: 0,
                          paddingLeft: 16,
                          fontSize: 12,
                          color: "#4f46e5",
                          fontFamily: FONT,
                          lineHeight: 1.8,
                        }}
                      >
                        <li>Fill in the basic details below</li>
                        <li>Click "Create Form" to save</li>
                        <li>
                          Use <strong>Design Form</strong> to add questions
                        </li>
                        <li>Activate the form when ready</li>
                      </ol>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {/* Form Name */}
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: 5,
                        fontFamily: FONT,
                      }}
                    >
                      Form Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                      style={inputStyle}
                      placeholder="e.g. Post-Resolution Feedback"
                    />
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: 5,
                        fontFamily: FONT,
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
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                      placeholder="Brief description of this form's purpose"
                    />
                  </div>

                  {/* Email Settings */}
                  <div
                    style={{
                      borderTop: "1px solid #f1f3f9",
                      margin: "20px 0 16px",
                    }}
                  />
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#374151",
                      fontFamily: FONT,
                    }}
                  >
                    Email Settings
                  </p>

                  <div style={{ marginBottom: 12 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.settings.sendEmailNotification}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            settings: {
                              ...formData.settings,
                              sendEmailNotification: e.target.checked,
                            },
                          })
                        }
                        style={{
                          width: 15,
                          height: 15,
                          accentColor: "#6366f1",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: "#374151",
                          fontFamily: FONT,
                        }}
                      >
                        Send email notification when ticket closes
                      </span>
                    </label>
                  </div>

                  {formData.settings.sendEmailNotification && (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#374151",
                            marginBottom: 5,
                            fontFamily: FONT,
                          }}
                        >
                          Email Delay (minutes)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formData.settings.emailDelay}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              settings: {
                                ...formData.settings,
                                emailDelay: parseInt(e.target.value) || 0,
                              },
                            })
                          }
                          style={{ ...inputStyle, width: 120 }}
                        />
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 11,
                            color: "#9ca3af",
                            fontFamily: FONT,
                          }}
                        >
                          0 = send immediately
                        </p>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#374151",
                            marginBottom: 5,
                            fontFamily: FONT,
                          }}
                        >
                          Email Subject
                        </label>
                        <input
                          type="text"
                          value={formData.emailTemplate.subject}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              emailTemplate: {
                                ...formData.emailTemplate,
                                subject: e.target.value,
                              },
                            })
                          }
                          style={inputStyle}
                        />
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 11,
                            color: "#9ca3af",
                            fontFamily: FONT,
                          }}
                        >
                          Use {"{ticketNumber}"}, {"{studentName}"} as
                          placeholders
                        </p>
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#374151",
                            marginBottom: 5,
                            fontFamily: FONT,
                          }}
                        >
                          Email Body
                        </label>
                        <textarea
                          value={formData.emailTemplate.body}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              emailTemplate: {
                                ...formData.emailTemplate,
                                body: e.target.value,
                              },
                            })
                          }
                          rows={5}
                          style={{ ...inputStyle, resize: "vertical" }}
                        />
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 11,
                            color: "#9ca3af",
                            fontFamily: FONT,
                          }}
                        >
                          Use {"{ticketNumber}"}, {"{studentName}"},{" "}
                          {"{feedbackLink}"} as placeholders
                        </p>
                      </div>
                    </>
                  )}

                  {/* Triggers */}
                  <div
                    style={{
                      borderTop: "1px solid #f1f3f9",
                      margin: "20px 0 16px",
                    }}
                  />
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#374151",
                      fontFamily: FONT,
                    }}
                  >
                    Feedback Triggers
                  </p>
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: 12,
                      color: "#6b7280",
                      fontFamily: FONT,
                    }}
                  >
                    Select when to send this feedback form to users
                  </p>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginBottom: 16,
                    }}
                  >
                    {[
                      {
                        value: "ticket_created",
                        label: "When Ticket is Created",
                        desc: "Send immediately after ticket creation",
                      },
                      {
                        value: "ticket_closed",
                        label: "When Ticket is Closed / Resolved",
                        desc: "Send when ticket status is marked as closed",
                      },
                      {
                        value: "ticket_status_changed",
                        label: "On Specific Status Change",
                        desc: "Send when ticket moves to selected statuses",
                      },
                    ].map((trigger) => {
                      const isChecked =
                        formData.triggers?.some(
                          (t) => t.type === trigger.value && t.enabled,
                        ) ?? false;
                      return (
                        <label
                          key={trigger.value}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            padding: "10px 12px",
                            border: `1px solid ${isChecked ? "#c7d2fe" : "#e5e7eb"}`,
                            borderRadius: 8,
                            cursor: "pointer",
                            background: isChecked ? "#f5f3ff" : "#fff",
                            transition: "background 0.15s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const newTriggers = e.target.checked
                                ? [
                                    ...(formData.triggers || []),
                                    {
                                      type: trigger.value as any,
                                      enabled: true,
                                      conditions: {},
                                    },
                                  ]
                                : formData.triggers?.filter(
                                    (t) => t.type !== trigger.value,
                                  ) || [];
                              setFormData({
                                ...formData,
                                triggers: newTriggers,
                              });
                            }}
                            style={{
                              marginTop: 1,
                              width: 14,
                              height: 14,
                              accentColor: "#6366f1",
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <p
                              style={{
                                margin: "0 0 2px",
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#111827",
                                fontFamily: FONT,
                              }}
                            >
                              {trigger.label}
                            </p>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 11,
                                color: "#9ca3af",
                                fontFamily: FONT,
                              }}
                            >
                              {trigger.desc}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Form Settings */}
                  <div
                    style={{ borderTop: "1px solid #f1f3f9", margin: "16px 0" }}
                  />
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#374151",
                      fontFamily: FONT,
                    }}
                  >
                    Form Settings
                  </p>
                  <div style={{ marginBottom: 20 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.settings.allowMultipleSubmissions}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            settings: {
                              ...formData.settings,
                              allowMultipleSubmissions: e.target.checked,
                            },
                          })
                        }
                        style={{
                          width: 15,
                          height: 15,
                          accentColor: "#6366f1",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: "#374151",
                          fontFamily: FONT,
                        }}
                      >
                        Allow multiple submissions per ticket
                      </span>
                    </label>
                  </div>

                  {/* Footer buttons */}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      style={{
                        flex: 1,
                        padding: "9px 0",
                        background: "#fff",
                        border: "1.5px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#374151",
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={{
                        flex: 1,
                        padding: "9px 0",
                        background: "#6366f1",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#fff",
                        cursor: "pointer",
                        fontFamily: FONT,
                        boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
                      }}
                    >
                      {editingForm
                        ? "Update Form"
                        : "Create Form & Add Questions"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ Form Builder Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {showFormBuilder && selectedFormForBuilder && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 16,
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                width: "100%",
                maxWidth: 860,
                maxHeight: "90vh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
              }}
            >
              <FeedbackFormBuilder
                formId={selectedFormForBuilder}
                onClose={() => {
                  setShowFormBuilder(false);
                  setSelectedFormForBuilder(null);
                  fetchForms();
                }}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FeedbackFormManagement;
