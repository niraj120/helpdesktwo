import React from "react";
import KBArticleManagement from "../components/knowledge-base/KBArticleManagement";
import DashboardLayout from "../components/DashboardLayout";
import { useAdminProjects } from "../hooks/useAdminProjects";

interface KBArticleManagementPageProps {
  wrapWithLayout?: boolean;
}

/**
 * KB Article Management Page
 *
 * Shows project dropdown to select which project's KB articles to manage.
 * Super Admin can switch across all projects; other users can switch across assigned projects.
 */
const KBArticleManagementPage: React.FC<KBArticleManagementPageProps> = ({
  wrapWithLayout = true,
}) => {
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    selectedProject,
    isLoading,
    isSuperAdmin,
  } = useAdminProjects();

  if (isLoading) {
    const content = (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading projects...</p>
      </div>
    );
    return wrapWithLayout ? (
      <DashboardLayout>{content}</DashboardLayout>
    ) : (
      content
    );
  }

  const content = (
    <div style={{ padding: "20px" }}>
      {/* Project Selector */}
      {projects.length > 0 && (
        <div
          style={{
            backgroundColor: "#f8fafc",
            padding: "16px 20px",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <label
              style={{ fontWeight: "600", color: "#374151", fontSize: "14px" }}
            >
              📁 {isSuperAdmin ? "Select Project:" : "Assigned Project:"}
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{
                padding: "10px 16px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                minWidth: "280px",
                backgroundColor: "#fff",
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
            {selectedProject && (
              <span
                style={{
                  color: "#059669",
                  fontSize: "13px",
                  backgroundColor: "#d1fae5",
                  padding: "4px 10px",
                  borderRadius: "4px",
                }}
              >
                ✓ Managing KB Articles for: {selectedProject.name}
              </span>
            )}
          </div>
        </div>
      )}

      {selectedProjectId ? (
        <KBArticleManagement projectId={selectedProjectId} />
      ) : (
        <div
          style={{
            backgroundColor: "#fef3c7",
            padding: "24px",
            borderRadius: "8px",
            border: "1px solid #f59e0b",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>📝</div>
          <h3
            style={{ color: "#92400e", marginBottom: "8px", fontSize: "18px" }}
          >
            {projects.length === 0 ? "No Project Assigned" : "Select a Project"}
          </h3>
          <p style={{ color: "#b45309", fontSize: "14px" }}>
            {projects.length === 0
              ? "No active projects are assigned to your user/role. Please ask admin to map project access in RBAC."
              : "Please select a project from the dropdown above to manage its Knowledge Base articles."}
          </p>
        </div>
      )}
    </div>
  );

  return wrapWithLayout ? (
    <DashboardLayout>{content}</DashboardLayout>
  ) : (
    content
  );
};

export default KBArticleManagementPage;
