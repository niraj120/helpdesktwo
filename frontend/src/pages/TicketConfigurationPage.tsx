import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { MdSettings, MdArrowForward, MdSearch } from "react-icons/md";
import { API_CONFIG } from "../config/constants";

interface Project {
  _id: string;
  name: string;
  code: string;
  description?: string;
  branding?: {
    logo?: string;
    customUrlPath?: string;
  };
}

const TicketConfigurationPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedProjects = useRef(false);

  useEffect(() => {
    // Prevent duplicate calls from React.StrictMode
    if (hasFetchedProjects.current) {
      console.log("⏭️ Skipping duplicate projects fetch (already loaded)");
      return;
    }
    hasFetchedProjects.current = true;
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");

      if (!token) {
        console.error("No auth token found");
        navigate("/login");
        return;
      }

      const response = await fetch(`${API_CONFIG.API_URL}/projects?limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error("Unauthorized - redirecting to login");
          localStorage.removeItem("authToken");
          navigate("/login");
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Projects data:", data);

      // Handle different response structures
      let projectsList = [];
      // Check for nested structure: data.data.projects (current API response)
      if (data.data && Array.isArray(data.data.projects)) {
        projectsList = data.data.projects;
      } else if (Array.isArray(data.projects)) {
        projectsList = data.projects;
      } else if (Array.isArray(data.data)) {
        projectsList = data.data;
      } else if (Array.isArray(data)) {
        projectsList = data;
      }

      console.log("Projects list:", projectsList);
      setProjects(projectsList);
    } catch (error) {
      console.error("Error fetching projects:", error);
      alert(
        "Failed to load projects. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.code.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleConfigureProject = (projectId: string) => {
    navigate(`/ticket-config/settings/${projectId}`);
  };

  const statsCards = [
    {
      label: "Total Projects",
      value: projects.length,
      bg: "#F4F3FF",
      color: "#5925DC",
      icon: "📁",
      sub: "All accessible projects",
    },
    {
      label: "Visible Results",
      value: filteredProjects.length,
      bg: "#EFF8FF",
      color: "#175CD3",
      icon: "🔎",
      sub: searchTerm ? "Matching current search" : "Ready to configure",
    },
    {
      label: "With Branding",
      value: projects.filter((project) => !!project.branding?.logo).length,
      bg: "#ECFDF3",
      color: "#027A48",
      icon: "🎨",
      sub: "Projects with logo set",
    },
    {
      label: "With Description",
      value: projects.filter((project) => !!project.description?.trim()).length,
      bg: "#FFFAEB",
      color: "#B54708",
      icon: "📝",
      sub: "Projects with context notes",
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
        <div
          style={{
            background: "#ffffff",
            padding: "22px 24px",
            borderRadius: "14px",
            marginBottom: "16px",
            border: "1px solid #e7ebf3",
            boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
          }}
        >
          <h1
            style={{
              margin: "0 0 6px 0",
              fontSize: "24px",
              fontWeight: 700,
              color: "#111827",
              letterSpacing: "-0.01em",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}
          >
            Query Configuration
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#6b7280",
              fontWeight: 400,
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}
          >
            Select a project to configure its ticket settings
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
                flex: "1 1 220px",
                background: "white",
                borderRadius: "10px",
                padding: "20px 24px",
                border: "1px solid #E4E7EC",
                boxShadow: "0 1px 3px rgba(0,0,0,.06)",
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
                    color: "#101828",
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
                    fontWeight: 600,
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#667085",
                    marginTop: "2px",
                  }}
                >
                  {stat.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#FFFFFF",
            border: "1px solid #E4E7EC",
            borderRadius: "14px",
            padding: "12px 14px",
            boxShadow: "0 4px 16px rgba(15,23,42,.06)",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: "1 1 320px",
              minWidth: "260px",
            }}
          >
            <MdSearch
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "18px",
                color: "#98A2B3",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search by project name or code"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 38px",
                border: "1px solid #D0D5DD",
                borderRadius: "10px",
                fontSize: "14px",
                color: "#344054",
                background: "#F9FAFB",
                outline: "none",
              }}
            />
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              borderRadius: "10px",
              border: "1px solid #E4E7EC",
              background: "#F9FAFB",
              color: "#475467",
              fontSize: "13px",
              fontWeight: 600,
              padding: "9px 12px",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "#101828" }}>{filteredProjects.length}</span>
            <span>
              {filteredProjects.length === 1 ? "project" : "projects"} found
            </span>
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "56px 24px",
              color: "#667085",
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: "14px",
              boxShadow: "0 4px 16px rgba(15,23,42,.06)",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "999px",
                border: "3px solid #E2E8F0",
                borderTopColor: "#334155",
                margin: "0 auto 10px",
                animation: "spin 1s linear infinite",
              }}
            />
            Loading projects...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "56px 24px",
              color: "#667085",
              background: "#FFFFFF",
              border: "1px solid #E4E7EC",
              borderRadius: "14px",
              boxShadow: "0 4px 16px rgba(15,23,42,.06)",
            }}
          >
            {searchTerm
              ? "No projects found matching your search"
              : "No projects available"}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "20px",
            }}
          >
            {filteredProjects.map((project) => (
              <div
                key={project._id}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E4E7EC",
                  borderRadius: "16px",
                  padding: "24px",
                  cursor: "pointer",
                  transition: "all 0.22s ease",
                  position: "relative",
                  boxShadow: "0 8px 22px rgba(15,23,42,.06)",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 14px 34px rgba(15,23,42,.14)";
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.borderColor = "#CBD5E1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 8px 22px rgba(15,23,42,.06)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "#E4E7EC";
                }}
                onClick={() => handleConfigureProject(project._id)}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-32px",
                    right: "-32px",
                    width: "120px",
                    height: "120px",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle, rgba(59,130,246,.12), transparent 68%)",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "16px",
                    marginBottom: "16px",
                  }}
                >
                  {project.branding?.logo ? (
                    <img
                      src={project.branding.logo}
                      alt={project.name}
                      loading="lazy"
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "10px",
                        objectFit: "contain",
                        border: "1px solid #E4E7EC",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "10px",
                        background: "linear-gradient(135deg, #EFF6FF, #DBEAFE)",
                        border: "1px solid #BFDBFE",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MdSettings
                        style={{ fontSize: "24px", color: "#1D4ED8" }}
                      />
                    </div>
                  )}

                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        fontSize: "18px",
                        fontWeight: 700,
                        color: "#101828",
                        marginBottom: "4px",
                      }}
                    >
                      {project.name}
                    </h3>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#475467",
                        fontWeight: 700,
                        letterSpacing: ".03em",
                        textTransform: "uppercase",
                      }}
                    >
                      {project.code}
                    </p>
                  </div>
                </div>

                {project.description && (
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#475467",
                      marginBottom: "16px",
                      lineHeight: 1.55,
                    }}
                  >
                    {project.description.length > 100
                      ? `${project.description.substring(0, 100)}...`
                      : project.description}
                  </p>
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "16px",
                    borderTop: "1px dashed #D0D5DD",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      color: "#1D4ED8",
                      fontWeight: 700,
                    }}
                  >
                    Configure Tickets
                  </span>
                  <MdArrowForward
                    style={{
                      fontSize: "20px",
                      color: "#1D4ED8",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <style>
          {`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
        </style>
      </div>
    </DashboardLayout>
  );
};

export default TicketConfigurationPage;
