import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";
import DashboardLayout from "./DashboardLayout";
import ModuleHeader from "./ModuleHeader";
import EmailConfigModal from "./AddEmailConfigModal";
import EmailConnectionStatus from "./EmailConnectionStatus"; // Task 8.2
import {
  PlusIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  TrashIcon,
  PencilIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";

interface Project {
  _id: string;
  name: string;
  code?: string;
}

interface EmailConfig {
  _id: string;
  projectId: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  isEnabled: boolean;
  lastCheckedAt?: string;
  lastCheckStatus?: "success" | "failed";
  lastCheckError?: string;
  createdAt: string;
  updatedAt: string;
  inboundMethod?: "imap" | "webhook" | "sendgrid";
  webhookProvider?: string;
  // Task 8.2: Connection status tracking
  connectionStatus?: "connected" | "disconnected" | "error" | "untested";
  lastConnectionTest?: string;
  lastConnectionError?: string;
  failedAttempts?: number;
  nextRetryAt?: string;
  lastSuccessfulConnection?: string;
}

const EmailToTicketConfiguration: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [emailConfigs, setEmailConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingConfig, setTestingConfig] = useState<string | null>(null);
  const [togglingConfig, setTogglingConfig] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EmailConfig | null>(null);

  const { hasPermission } = usePermissions();
  const canView = hasPermission(PERMISSIONS.EMAIL_CONFIG_VIEW);
  const canCreate = hasPermission(PERMISSIONS.EMAIL_CONFIG_EDIT); // Using EDIT permission for create
  const canEdit = hasPermission(PERMISSIONS.EMAIL_CONFIG_EDIT);
  const canDelete = hasPermission(PERMISSIONS.EMAIL_CONFIG_EDIT); // Using EDIT permission for delete

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchEmailConfigs();
    } else {
      setEmailConfigs([]);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(`${API_CONFIG.API_URL}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        const projectsArray = Array.isArray(response.data.data?.projects)
          ? response.data.data.projects
          : Array.isArray(response.data.data)
            ? response.data.data
            : [];
        setProjects(projectsArray);

        // Auto-select first project if available
        if (projectsArray.length > 0) {
          setSelectedProjectId(projectsArray[0]._id);
        }
      }
    } catch (error: any) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailConfigs = async () => {
    if (!selectedProjectId) return;

    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/${selectedProjectId}/email-configs`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        setEmailConfigs(response.data.data || []);
      }
    } catch (error: any) {
      console.error("Error fetching email configs:", error);
      setEmailConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (configId: string) => {
    try {
      console.log("Testing connection for config:", configId);
      setTestingConfig(configId);
      const token = localStorage.getItem("authToken");

      if (!token) {
        alert("❌ Authentication token not found. Please log in again.");
        return;
      }

      console.log(
        "Making request to:",
        `${API_CONFIG.API_URL}/email-configs/${configId}/test`,
      );

      const response = await axios.post(
        `${API_CONFIG.API_URL}/email-configs/${configId}/test`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      console.log("Test response:", response.data);

      if (response.data.success) {
        alert("✅ Connection test successful!");
      } else {
        alert(`❌ Connection test failed:\n${response.data.message}`);
      }

      // Refresh the list to get updated status
      fetchEmailConfigs();
    } catch (error: any) {
      console.error("Error testing connection:", error);
      const errorMessage =
        error.response?.data?.message || error.message || "Unknown error";
      alert(`❌ Connection test failed:\n${errorMessage}`);
    } finally {
      setTestingConfig(null);
    }
  };

  const handleToggleEnabled = async (configId: string) => {
    // Find current config to get current state
    const currentConfig = emailConfigs.find((c) => c._id === configId);
    if (!currentConfig) return;

    const previousState = currentConfig.isEnabled;

    try {
      // Set loading state
      setTogglingConfig(configId);

      // Optimistic UI update - update state immediately
      setEmailConfigs((prevConfigs) =>
        prevConfigs.map((config) =>
          config._id === configId
            ? { ...config, isEnabled: !config.isEnabled }
            : config,
        ),
      );

      const token = localStorage.getItem("authToken");
      const response = await axios.patch(
        `${API_CONFIG.API_URL}/email-configs/${configId}/toggle`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // If successful, fetch fresh data to ensure sync
      if (response.data.success) {
        await fetchEmailConfigs();
      }
    } catch (error: any) {
      console.error("Error toggling config:", error);

      // Revert optimistic update on error
      setEmailConfigs((prevConfigs) =>
        prevConfigs.map((config) =>
          config._id === configId
            ? { ...config, isEnabled: previousState }
            : config,
        ),
      );

      // Show error message
      const errorMsg =
        error.response?.data?.message ||
        error.message ||
        "Failed to toggle configuration";
      alert(`❌ Error: ${errorMsg}`);
    } finally {
      setTogglingConfig(null);
    }
  };

  const handleDelete = async (configId: string) => {
    if (!confirm("Are you sure you want to delete this email configuration?")) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(`${API_CONFIG.API_URL}/email-configs/${configId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert("✅ Email configuration deleted successfully");
      fetchEmailConfigs();
    } catch (error: any) {
      console.error("Error deleting config:", error);
      if (error.response?.status === 409) {
        alert(
          `Cannot delete: ${error.response.data.message}\n\nThis email has created ${error.response.data.data?.ticketCount || 0} ticket(s).`,
        );
      } else {
        alert(`Error: ${error.response?.data?.message || error.message}`);
      }
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusBadge = (config: EmailConfig) => {
    if (!config.lastCheckStatus) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <ExclamationCircleIcon className="w-4 h-4 mr-1" />
          Not Tested
        </span>
      );
    }

    if (config.lastCheckStatus === "success") {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircleIcon className="w-4 h-4 mr-1" />
          Connected
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XCircleIcon className="w-4 h-4 mr-1" />
        Failed
      </span>
    );
  };

  if (!canView) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">
              You don't have permission to view email configurations.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ModuleHeader
        title="Email-to-Ticket Configuration"
        subtitle="Configure email accounts to automatically convert incoming emails into support tickets"
      />

      <div className="p-6">
        {/* Project Selector */}
        <div className="mb-6">
          <label
            htmlFor="project-select"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Select Project
          </label>
          <select
            id="project-select"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="block w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">-- Select a Project --</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name} {project.code ? `(${project.code})` : ""}
              </option>
            ))}
          </select>
        </div>

        {!selectedProjectId ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <EnvelopeIcon className="w-12 h-12 text-blue-400 mx-auto mb-3" />
            <p className="text-blue-800 font-medium">
              Please select a project to manage email configurations
            </p>
          </div>
        ) : (
          <>
            {/* Header with Add Button */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Email Configurations ({emailConfigs.length})
              </h2>
              {canCreate && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm transition-colors"
                >
                  <PlusIcon className="w-5 h-5 mr-2" />
                  Add Email
                </button>
              )}
            </div>

            {/* Loading State */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <ArrowPathIcon className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="ml-3 text-gray-600">Loading...</span>
              </div>
            ) : emailConfigs.length === 0 ? (
              /* Empty State */
              <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
                <EnvelopeIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No Email Configurations
                </h3>
                <p className="text-gray-500 mb-6">
                  Get started by adding an email account to convert incoming
                  emails into support tickets.
                </p>
                {canCreate && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm transition-colors"
                  >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Add Your First Email
                  </button>
                )}
              </div>
            ) : (
              /* Email Configurations List */
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {emailConfigs.map((config) => (
                  <div
                    key={config._id}
                    className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                  >
                    {/* Card Header */}
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center mb-2">
                            <EnvelopeIcon className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" />
                            <h3 className="text-sm font-medium text-gray-900 truncate">
                              {config.emailAddress}
                            </h3>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(config)}
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                config.isEnabled
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {config.isEnabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-3">
                      {/* Connection Details */}
                      <div className="text-xs space-y-1">
                        {config.inboundMethod === "webhook" ? (
                          <div className="flex items-center text-gray-600">
                            <span className="font-medium w-16">Inbound:</span>
                            <span className="truncate">
                              Webhook
                              {config.webhookProvider
                                ? ` (${config.webhookProvider})`
                                : ""}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center text-gray-600">
                            <span className="font-medium w-16">IMAP:</span>
                            <span className="truncate">
                              {config.imapHost}:{config.imapPort}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center text-gray-600">
                          <span className="font-medium w-16">SMTP:</span>
                          <span className="truncate">
                            {config.smtpHost}:{config.smtpPort}
                          </span>
                        </div>
                      </div>

                      {/* Task 8.2: Connection Status */}
                      {config.connectionStatus && (
                        <div className="pt-2 border-t border-gray-100">
                          <EmailConnectionStatus
                            configId={config._id}
                            status={config.connectionStatus}
                            lastConnectionTest={
                              config.lastConnectionTest
                                ? new Date(config.lastConnectionTest)
                                : undefined
                            }
                            lastConnectionError={config.lastConnectionError}
                            failedAttempts={config.failedAttempts}
                            nextRetryAt={
                              config.nextRetryAt
                                ? new Date(config.nextRetryAt)
                                : undefined
                            }
                            onStatusChange={() => fetchEmailConfigs()}
                          />
                        </div>
                      )}

                      {/* Last Check Status */}
                      {config.lastCheckedAt && (
                        <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                          <div>
                            Last tested: {formatDate(config.lastCheckedAt)}
                          </div>
                          {config.lastCheckError && (
                            <div
                              className="text-red-600 mt-1 truncate"
                              title={config.lastCheckError}
                            >
                              Error: {config.lastCheckError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex space-x-2">
                        {/* Test Connection Button */}
                        <button
                          onClick={() => handleTestConnection(config._id)}
                          disabled={testingConfig === config._id}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Test Connection"
                        >
                          {testingConfig === config._id ? (
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                          ) : (
                            <SignalIcon className="w-4 h-4" />
                          )}
                          <span className="ml-1.5">Test</span>
                        </button>

                        {/* Toggle Enabled */}
                        {canEdit && (
                          <button
                            onClick={() => handleToggleEnabled(config._id)}
                            disabled={togglingConfig === config._id}
                            className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              config.isEnabled
                                ? "text-gray-700 bg-gray-50 hover:bg-gray-100 border-gray-200"
                                : "text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                            }`}
                            title={config.isEnabled ? "Disable" : "Enable"}
                          >
                            {togglingConfig === config._id ? (
                              <>
                                <ArrowPathIcon className="w-4 h-4 animate-spin mr-1.5" />
                                <span>...</span>
                              </>
                            ) : (
                              <span>
                                {config.isEnabled ? "Disable" : "Enable"}
                              </span>
                            )}
                          </button>
                        )}
                      </div>

                      <div className="flex space-x-1">
                        {/* Edit Button */}
                        {canEdit && (
                          <button
                            onClick={() => setEditingConfig(config)}
                            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete Button */}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(config._id)}
                            className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Email Configuration Modal (Add/Edit) */}
      <EmailConfigModal
        isOpen={showAddModal || editingConfig !== null}
        onClose={() => {
          setShowAddModal(false);
          setEditingConfig(null);
        }}
        onSuccess={() => {
          setShowAddModal(false);
          setEditingConfig(null);
          fetchEmailConfigs();
        }}
        projectId={selectedProjectId}
        editingConfig={editingConfig}
      />
    </DashboardLayout>
  );
};

export default EmailToTicketConfiguration;
