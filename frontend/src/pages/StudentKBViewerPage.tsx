import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import KnowledgeBaseViewer from "../components/knowledge-base/KnowledgeBaseViewer";
import { API_CONFIG } from "../config/constants";

interface Project {
  _id: string;
  name: string;
  code: string;
  customUrlPath: string;
}

/**
 * Student-specific KB Viewer Page
 * - Gets project from URL path (/:customUrlPath/kb)
 * - No project dropdown shown
 * - Read-only view for students
 */
const StudentKBViewerPage: React.FC = () => {
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const [searchParams] = useSearchParams();
  const initialArticleId = searchParams.get("articleId") ?? undefined;
  const [projectId, setProjectId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (customUrlPath) {
      fetchProjectByUrl(customUrlPath);
    }
  }, [customUrlPath]);

  const fetchProjectByUrl = async (urlPath: string) => {
    try {
      const response = await fetch(
        `${API_CONFIG.API_URL}/projects/branding/${urlPath}`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.projectId) {
          setProjectId(data.data.projectId);
        } else {
          setError("Project not found");
        }
      } else {
        setError("Failed to load project");
      }
    } catch (err) {
      console.error("Error fetching project:", err);
      setError("Error loading project");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Knowledge Base...</p>
        </div>
      </div>
    );
  }

  if (error || !projectId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 text-lg mb-2">
            ⚠️ {error || "Project not found"}
          </p>
          <p className="text-gray-500">Please check the URL and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 80px)",
        backgroundColor: "#f9fafb",
      }}
    >
      {/* Student KB Viewer - No project dropdown, read-only */}
      <KnowledgeBaseViewer
        projectId={projectId}
        showControls={false}
        isStudentPortal={true}
        initialArticleId={initialArticleId}
      />
    </div>
  );
};

export default StudentKBViewerPage;
