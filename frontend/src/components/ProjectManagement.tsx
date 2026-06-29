import { useState, useEffect, useRef } from "react";
import DashboardLayout from "./DashboardLayout";
import AddProjectForm from "./AddProjectForm";
import { usePermissions } from "../hooks/usePermissions";
import { API_CONFIG } from "../config/constants";

interface Project {
  _id: string;
  projectId?: string;
  name: string;
  code: string;
  status: string;
  isActive: boolean;
  users?: number;
  branding?: {
    logo?: string;
    favicon?: string;
    headerText?: string;
    footerText?: string;
    domainUrl?: string;
    customUrlPath?: string;
    colorTheme?: {
      primary?: string;
      secondary?: string;
    };
  };
  address?: any;
  contactInfo?: any;
  primaryContact?: any;
  modules?: any;
  settings?: any;
  configuration?: any;
  createdAt: string;
  updatedAt?: string;
}

const ProjectManagement = () => {
  const { hasPermission } = usePermissions();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Pagination state
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  // Prevent duplicate API calls in React StrictMode (development)
  const hasFetchedProjects = useRef(false);

  useEffect(() => {
    // Only fetch once, even in StrictMode
    if (!hasFetchedProjects.current) {
      hasFetchedProjects.current = true;
      fetchProjects();
    }
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/projects?limit=100`, {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setProjects(data.data.projects || []);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetails = async (projectId: string) => {
    try {
      setLoadingProject(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/projects/${projectId}`,
        {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json();
      if (data.success) {
        console.log("Fetched project details:", data.data.project);
        setSelectedProject(data.data.project);
        setShowAddForm(true);
      } else {
        console.error("Failed to fetch project details:", data.message);
      }
    } catch (error) {
      console.error("Error fetching project details:", error);
    } finally {
      setLoadingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    try {
      setDeleting(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/projects/${projectToDelete._id}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json();

      if (data.success) {
        // Remove deleted project from list
        setProjects(projects.filter((p) => p._id !== projectToDelete._id));
        setShowDeleteConfirm(false);
        setProjectToDelete(null);
        // If last item on page was deleted, go back a page
        const remaining = projects.length - 1;
        const maxPage = Math.max(1, Math.ceil(remaining / PAGE_SIZE));
        setCurrentPage((p) => Math.min(p, maxPage));
        alert("Project deleted successfully!");
      } else {
        alert(data.message || "Failed to delete project");
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("An error occurred while deleting the project");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const paginatedProjects = projects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const statsCards = [
    {
      label: "Total Projects",
      value: projects.length,
      icon: "📁",
      bg: "#F4F3FF",
      color: "#5925DC",
    },
    {
      label: "Active",
      value: projects.filter((project) => project.isActive).length,
      icon: "✅",
      bg: "#ECFDF3",
      color: "#027A48",
    },
    {
      label: "Inactive",
      value: projects.filter((project) => !project.isActive).length,
      icon: "⏸",
      bg: "#FFF4ED",
      color: "#B93815",
    },
    {
      label: "With Branding",
      value: projects.filter((project) => !!project.branding?.logo).length,
      icon: "🎨",
      bg: "#EFF8FF",
      color: "#175CD3",
    },
  ];

  return (
    <DashboardLayout>
      <div
        style={{
          padding: "24px 20px 32px",
          maxWidth: "1380px",
          margin: "0 auto",
          background: "#f8fafc",
          minHeight: "100vh",
          fontFamily:
            '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: "22px 24px",
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
              fontSize: "24px",
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              fontFamily: '"DM Serif Display", Georgia, serif',
            }}
          >
            Projects
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#475569",
              fontWeight: 400,
            }}
          >
            Manage your projects and their configurations
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          {statsCards.map((stat) => (
            <div
              key={stat.label}
              style={{
                flex: "1 1 200px",
                background: "#ffffff",
                borderRadius: "16px",
                padding: "20px 24px",
                border: "1px solid #e2e8f0",
                boxShadow:
                  "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: stat.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  flexShrink: 0,
                }}
              >
                {stat.icon}
              </div>
              <div>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: 700,
                    color: "#0f172a",
                    lineHeight: 1.2,
                  }}
                >
                  {stat.value.toLocaleString()}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: stat.color,
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "12px 14px",
            boxShadow:
              "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              color: "#475569",
              fontWeight: 500,
            }}
          >
            Status overview and project controls
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            {hasPermission("PROJECT_CREATE") && (
              <button
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 16px",
                  background: "linear-gradient(160deg, #4f46e5, #4338ca)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(67,56,202,.35)",
                  transition: "all 0.2s ease",
                }}
                onClick={() => {
                  setSelectedProject(null);
                  setShowAddForm(true);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 18px rgba(67,56,202,.45)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 14px rgba(67,56,202,.35)";
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Project
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              boxShadow:
                "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
              textAlign: "center",
              padding: "56px 24px",
              color: "#475569",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "999px",
                border: "3px solid #e2e8f0",
                borderTopColor: "#4f46e5",
                margin: "0 auto 10px",
                animation: "spin 1s linear infinite",
              }}
            />
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              boxShadow:
                "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
              textAlign: "center",
              padding: "56px 24px",
            }}
          >
            <div
              style={{
                width: "96px",
                height: "96px",
                margin: "0 auto 24px",
                background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#667eea"
                strokeWidth="1.5"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3
              style={{
                margin: "0 0 12px 0",
                fontSize: "20px",
                fontWeight: 700,
                color: "#0f172a",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}
            >
              No Projects Found
            </h3>
            <p
              style={{
                margin: 0,
                color: "#475569",
                fontSize: "14px",
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}
            >
              Click "Add Project" to create your first project
            </p>
          </div>
        ) : (
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              boxShadow:
                "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Project ID
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
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
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Users
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Created
                  </th>
                  <th
                    style={{
                      padding: "12px 24px",
                      textAlign: "left",
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
                {projects
                  .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                  .map((project) => (
                    <tr
                      key={project._id}
                      style={{ borderBottom: "1px solid #e2e8f0" }}
                    >
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: "#94a3b8",
                        }}
                      >
                        {project.projectId || "N/A"}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: "#0f172a",
                          fontWeight: 600,
                        }}
                      >
                        {project.name}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: "#475569",
                        }}
                      >
                        <span
                          style={{
                            padding: "3px 10px",
                            backgroundColor: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "12px",
                            fontFamily: "monospace",
                            fontSize: "12px",
                            color: "#475569",
                          }}
                        >
                          {project.code}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: "#475569",
                        }}
                      >
                        {project.users || 0}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: 600,
                            background: project.isActive
                              ? "#ECFDF3"
                              : "#FFF4ED",
                            color: project.isActive ? "#027A48" : "#B93815",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {project.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontSize: "13px",
                          color: "#94a3b8",
                        }}
                      >
                        {new Date(project.createdAt).toLocaleDateString()}
                      </td>
                      <td
                        style={{ padding: "12px 16px", whiteSpace: "nowrap" }}
                      >
                        {hasPermission("PROJECT_EDIT") && (
                          <button
                            onClick={() => fetchProjectDetails(project._id)}
                            disabled={loadingProject}
                            style={{
                              padding: "7px 12px",
                              background: loadingProject ? "#f1f5f9" : "#fff",
                              border: "1.5px solid #e2e8f0",
                              borderRadius: "8px",
                              fontSize: "13px",
                              color: "#334155",
                              cursor: loadingProject
                                ? "not-allowed"
                                : "pointer",
                              marginRight: "8px",
                            }}
                          >
                            {loadingProject ? "Loading..." : "Edit"}
                          </button>
                        )}
                        {hasPermission("PROJECT_DELETE") && (
                          <button
                            onClick={() => {
                              setProjectToDelete(project);
                              setShowDeleteConfirm(true);
                            }}
                            style={{
                              padding: "7px 12px",
                              background: "#FEF2F2",
                              color: "#DC2626",
                              border: "1px solid #FECACA",
                              borderRadius: "8px",
                              fontSize: "13px",
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = "#FECACA")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "#FEE2E2")
                            }
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {/* Pagination bar */}
            {projects.length > PAGE_SIZE && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 24px",
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <span style={{ fontSize: "13px", color: "#475569" }}>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, projects.length)} of{" "}
                  {projects.length} projects
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    alignItems: "center",
                  }}
                >
                  {/* Prev */}
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{
                      padding: "6px 10px",
                      fontSize: "13px",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: "8px",
                      background: currentPage === 1 ? "#f8fafc" : "#fff",
                      color: currentPage === 1 ? "#94a3b8" : "#334155",
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    }}
                  >
                    ‹ Prev
                  </button>

                  {/* Page number buttons */}
                  {Array.from(
                    { length: Math.ceil(projects.length / PAGE_SIZE) },
                    (_, i) => i + 1,
                  )
                    .filter((page) => {
                      const total = Math.ceil(projects.length / PAGE_SIZE);
                      return (
                        page === 1 ||
                        page === total ||
                        Math.abs(page - currentPage) <= 1
                      );
                    })
                    .reduce<(number | "...")[]>((acc, page, idx, arr) => {
                      if (
                        idx > 0 &&
                        typeof arr[idx - 1] === "number" &&
                        (page as number) - (arr[idx - 1] as number) > 1
                      ) {
                        acc.push("...");
                      }
                      acc.push(page);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "..." ? (
                        <span
                          key={`ellipsis-${idx}`}
                          style={{
                            padding: "6px 4px",
                            color: "#94a3b8",
                            fontSize: "13px",
                          }}
                        >
                          …
                        </span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => setCurrentPage(item as number)}
                          style={{
                            width: "34px",
                            height: "34px",
                            fontSize: "13px",
                            border: "1.5px solid",
                            borderColor:
                              currentPage === item ? "#4f46e5" : "#e2e8f0",
                            borderRadius: "8px",
                            background:
                              currentPage === item ? "#4f46e5" : "#fff",
                            color: currentPage === item ? "white" : "#334155",
                            cursor: "pointer",
                            fontWeight: currentPage === item ? 600 : 400,
                          }}
                        >
                          {item}
                        </button>
                      ),
                    )}

                  {/* Next */}
                  <button
                    onClick={() =>
                      setCurrentPage((p) =>
                        Math.min(Math.ceil(projects.length / PAGE_SIZE), p + 1),
                      )
                    }
                    disabled={
                      currentPage === Math.ceil(projects.length / PAGE_SIZE)
                    }
                    style={{
                      padding: "6px 10px",
                      fontSize: "13px",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: "8px",
                      background:
                        currentPage === totalPages ? "#f8fafc" : "#fff",
                      color: currentPage === totalPages ? "#94a3b8" : "#334155",
                      cursor:
                        currentPage === totalPages ? "not-allowed" : "pointer",
                    }}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* Add/Edit Project Form Modal */}
      {showAddForm && (
        <AddProjectForm
          project={selectedProject}
          onClose={() => {
            setShowAddForm(false);
            setSelectedProject(null);
          }}
          onSave={() => {
            setShowAddForm(false);
            setSelectedProject(null);
            fetchProjects(); // Refresh the projects list
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && projectToDelete && (
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
            zIndex: 10000,
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "440px",
              boxShadow:
                "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              overflow: "hidden",
            }}
          >
            {/* Icon and Title */}
            <div style={{ padding: "24px 24px 20px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    stroke="#ef4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#0f172a",
                }}
              >
                Delete Project?
              </h3>
              <p
                style={{
                  margin: "0",
                  fontSize: "14px",
                  color: "#475569",
                  lineHeight: "1.5",
                }}
              >
                Are you sure you want to delete{" "}
                <strong>{projectToDelete.name}</strong>? This action cannot be
                undone and will permanently remove all project data including
                users, tickets, and configurations.
              </p>
            </div>

            {/* Actions */}
            <div
              style={{
                padding: "16px 24px 24px",
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setProjectToDelete(null);
                }}
                disabled={deleting}
                style={{
                  padding: "10px 20px",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "8px",
                  backgroundColor: "#fff",
                  color: "#334155",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: deleting ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                  opacity: deleting ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!deleting)
                    e.currentTarget.style.backgroundColor = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#fff";
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={deleting}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: deleting ? "#9ca3af" : "#ef4444",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: deleting ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                  minWidth: "100px",
                }}
                onMouseEnter={(e) => {
                  if (!deleting)
                    e.currentTarget.style.backgroundColor = "#dc2626";
                }}
                onMouseLeave={(e) => {
                  if (!deleting)
                    e.currentTarget.style.backgroundColor = "#ef4444";
                }}
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default ProjectManagement;
