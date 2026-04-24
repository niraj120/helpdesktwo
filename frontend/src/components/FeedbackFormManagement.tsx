import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import FeedbackFormBuilder from "./FeedbackFormBuilder";
import DashboardLayout from "./DashboardLayout";
import ModuleHeader from "./ModuleHeader";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

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

      const payload = {
        projectId: selectedProjectId,
        createdBy: userId,
        ...formData,
        questions: [], // Will be managed in form builder
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <ModuleHeader
          title="Feedback Forms"
          subtitle="Create and manage customizable feedback forms to collect student feedback on resolved tickets"
        />

        {/* Project Selector Card */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-8 shadow-sm">
          <div className="flex items-center mb-3">
            <DocumentTextIcon className="w-5 h-5 text-blue-600 mr-2" />
            <label className="text-sm font-semibold text-gray-700">
              Select Project <span className="text-red-500">*</span>
            </label>
          </div>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all text-gray-900 font-medium"
          >
            <option value="">-- Select a Project to Get Started --</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name} ({project.code})
              </option>
            ))}
          </select>
          {!selectedProjectId && (
            <p className="mt-3 text-sm text-blue-700 flex items-center">
              <span className="inline-block w-1.5 h-1.5 bg-blue-600 rounded-full mr-2"></span>
              Choose a project to start creating and managing feedback forms
            </p>
          )}
        </div>

        {selectedProjectId && (
          <>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Forms Library
                </h2>
                <p className="text-gray-600 text-sm mt-1">
                  Manage all feedback forms for the selected project
                </p>
              </div>
              <button
                onClick={handleCreate}
                className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all font-medium"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Create New Form
              </button>
            </div>

            {forms.length === 0 ? (
              <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl border-2 border-dashed border-gray-300">
                <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5">
                  <DocumentTextIcon className="w-10 h-10 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No Feedback Forms Yet
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Get started by creating your first feedback form to collect
                  valuable insights from students
                </p>
                <button
                  onClick={handleCreate}
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all font-medium"
                >
                  <PlusIcon className="w-5 h-5 mr-2" />
                  Create Your First Form
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {forms.map((form) => (
                  <div
                    key={form._id}
                    className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200 overflow-hidden group"
                  >
                    {/* Card Header */}
                    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-1">
                            {form.name}
                          </h3>
                          {form.description && (
                            <p className="text-sm text-blue-100 line-clamp-2">
                              {form.description}
                            </p>
                          )}
                        </div>
                        {form.isActive ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-400 text-green-900 shadow-sm">
                            <CheckCircleIcon className="w-3 h-3 mr-1" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-300 text-gray-700 shadow-sm">
                            <XCircleIcon className="w-3 h-3 mr-1" />
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5">
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                          <p className="text-xs text-blue-600 font-medium mb-1">
                            Questions
                          </p>
                          <p className="text-lg font-bold text-blue-900">
                            {form.questions?.length || 0}
                          </p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                          <p className="text-xs text-purple-600 font-medium mb-1">
                            Email
                          </p>
                          <p className="text-sm font-semibold text-purple-900">
                            {form.settings.sendEmailNotification
                              ? "Enabled"
                              : "Disabled"}
                          </p>
                        </div>
                      </div>
                      {form.settings.emailDelay ? (
                        <div className="bg-amber-50 rounded-lg p-2 mb-4 border border-amber-100">
                          <p className="text-xs text-amber-700">
                            <span className="font-semibold">Delay:</span>{" "}
                            {form.settings.emailDelay} minutes after ticket
                            closure
                          </p>
                        </div>
                      ) : null}

                      {/* Triggers Display */}
                      {form.triggers && form.triggers.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-700 mb-2">
                            Triggers:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {form.triggers.map((trigger, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                              >
                                {trigger.type
                                  .replace(/_/g, " ")
                                  .replace(/\b\w/g, (l) => l.toUpperCase())}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFormForBuilder(form._id);
                            setShowFormBuilder(true);
                          }}
                          className="w-full flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 shadow-sm hover:shadow-md transition-all font-medium"
                        >
                          <WrenchScrewdriverIcon className="w-4 h-4 mr-2" />
                          Design Form
                        </button>

                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => handleEdit(form)}
                            className="flex items-center justify-center px-3 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all"
                            title="Edit Form"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(form._id)}
                            className={`flex items-center justify-center px-3 py-2 rounded-lg transition-all border-2 ${
                              form.isActive
                                ? "border-orange-300 text-orange-700 hover:bg-orange-50 hover:border-orange-400"
                                : "border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400"
                            }`}
                            title={form.isActive ? "Deactivate" : "Activate"}
                          >
                            {form.isActive ? (
                              <XCircleIcon className="w-4 h-4" />
                            ) : (
                              <CheckCircleIcon className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(form._id)}
                            className="flex items-center justify-center px-3 py-2 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-50 hover:border-red-400 transition-all"
                            title="Delete Form"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modal */}
            {showModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-4">
                      {editingForm
                        ? "Edit Feedback Form"
                        : "Create Feedback Form"}
                    </h3>

                    {!editingForm && (
                      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded">
                        <div className="flex items-start">
                          <WrenchScrewdriverIcon className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-blue-900 mb-1">
                              Form Creation Steps
                            </p>
                            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                              <li>Fill in the basic form details below</li>
                              <li>Click "Create Form" to save</li>
                              <li>
                                Click the{" "}
                                <span className="font-semibold">
                                  "Design Form"
                                </span>{" "}
                                button to add questions (rating, text,
                                checkboxes, etc.)
                              </li>
                              <li>Activate the form when ready to use</li>
                            </ol>
                          </div>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Form Name *
                        </label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          rows={3}
                        />
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-3">Email Settings</h4>

                        <div className="space-y-3">
                          <div className="flex items-center">
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
                              className="h-4 w-4 text-blue-600 rounded"
                            />
                            <label className="ml-2 text-sm text-gray-700">
                              Send email notification when ticket closes
                            </label>
                          </div>

                          {formData.settings.sendEmailNotification && (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                                        emailDelay:
                                          parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Delay before sending feedback email (0 = send
                                  immediately)
                                </p>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Use {"{ticketNumber}"}, {"{studentName}"} as
                                  placeholders
                                </p>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  rows={5}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Use {"{ticketNumber}"}, {"{studentName}"},{" "}
                                  {"{feedbackLink}"} as placeholders
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-3">Feedback Triggers</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Select when to send this feedback form to users
                        </p>

                        <div className="space-y-2">
                          {[
                            {
                              value: "ticket_created",
                              label: "When Ticket is Created",
                              desc: "Send immediately after ticket creation",
                            },
                            {
                              value: "ticket_closed",
                              label: "When Ticket is Closed/Resolved",
                              desc: "Send when ticket status is marked as closed",
                            },
                            {
                              value: "ticket_status_changed",
                              label: "On Specific Status Change",
                              desc: "Send when ticket moves to selected statuses",
                            },
                          ].map((trigger) => (
                            <label
                              key={trigger.value}
                              className="flex items-start p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={formData.triggers?.some(
                                  (t) => t.type === trigger.value && t.enabled,
                                )}
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
                                className="mt-1 h-4 w-4 text-blue-600 rounded"
                              />
                              <div className="ml-3">
                                <div className="text-sm font-medium text-gray-900">
                                  {trigger.label}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {trigger.desc}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-3">Form Settings</h4>

                        <div className="space-y-3">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={
                                formData.settings.allowMultipleSubmissions
                              }
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  settings: {
                                    ...formData.settings,
                                    allowMultipleSubmissions: e.target.checked,
                                  },
                                })
                              }
                              className="h-4 w-4 text-blue-600 rounded"
                            />
                            <label className="ml-2 text-sm text-gray-700">
                              Allow multiple submissions per ticket
                            </label>
                          </div>
                        </div>
                      </div>

                      {!editingForm && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                          <p className="text-sm text-amber-800">
                            <span className="font-semibold">💡 Note:</span>{" "}
                            After creating the form, use the{" "}
                            <span className="font-semibold">"Design Form"</span>{" "}
                            button to add questions like ratings, text fields,
                            multiple choice, etc.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-4">
                        <button
                          type="button"
                          onClick={() => setShowModal(false)}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
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

            {/* Form Builder Modal */}
            {showFormBuilder && selectedFormForBuilder && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FeedbackFormManagement;
