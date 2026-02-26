import React, { useState, useEffect } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import DashboardLayout from "./DashboardLayout";
import ModuleHeader from "./ModuleHeader";
import { API_CONFIG } from "../config/constants";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";

interface KBArticle {
  _id: string;
  projectId: string;
  title: string;
  content: string;
  category?: string;
  categoryId?: string;
  subcategoryId?: string;
  tags?: string[];
  status: "draft" | "published" | "archived";
  displayOrder: number;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  author: { name: string; email: string };
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  _id: string;
  name: string;
}

interface KBCategory {
  _id: string;
  name: string;
  projectId: string;
}

interface KBSubcategory {
  _id: string;
  name: string;
  categoryId: string;
  projectId: string;
}

interface Role {
  _id: string;
  name: string;
  code?: string;
}

const KnowledgeBaseManagement: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState<"articles" | "settings">(
    "articles",
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KBArticle | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const projectContext = localStorage.getItem("projectContext");
  const isProjectPortal = !!projectContext;
  const contextProjectId = projectContext
    ? JSON.parse(projectContext).projectId
    : null;
  const contextProjectName = projectContext
    ? JSON.parse(projectContext).projectName
    : null;

  // KB Settings state
  const [kbSettings, setKbSettings] = useState({
    enabled: true,
    kbHomeConfiguration: {
      bannerHeading: "How can we help you?",
      bannerDescription: "",
      bannerTextColor: "#008000",
      bannerBackgroundType: "color" as "color" | "image",
      bannerBackgroundColor: "#4B0082",
      bannerBackgroundImage: null as File | null,
      showPopularArticles: true,
      popularArticlesCount: 10,
      portalViewableBy: "all" as "all" | "loggedin",
    },
    articleConfiguration: {
      showAuthorName: false,
      showPublishedDate: true,
      showLastUpdatedDate: false,
      enableTableOfContents: false,
      showRelatedArticles: true,
      relatedArticlesCount: 5,
      showRecentArticles: true,
      recentArticlesCount: 5,
      showSameCategoryArticles: true,
      excludeAgentViewCount: false,
      showArticleTags: true,
      enableStatusIndicator: true,
      showShareOption: true,
      shareOnFacebook: true,
      shareOnTwitter: true,
      shareOnLinkedIn: true,
      shareViaEmail: true,
      showEstimatedReadTime: false,
      showComments: false,
      showPreviousNextNavigation: false,
    },
    enableAIAssistance: false,
    enableSatisfactionFeedback: true,
    satisfactionFeedback: {
      infoMessage: "Was this article useful?",
      voteType: "like" as "like" | "upvote" | "yesno",
      voteLabels: {
        positive: "Like",
        negative: "Dislike",
      },
      feedbackMessages: [
        "Correct inaccurate or outdated content",
        "Improve illustrations or images",
        "Fix typos or broken links",
        "Need more information",
        "Correct inaccurate or outdated code samples",
      ],
      successMessage: "Thank you for your feedback!",
      consentMessage: "Can we contact you about this feedback?",
    },
    seoSettings: {
      changeFrequency: "weekly" as
        | "always"
        | "hourly"
        | "daily"
        | "weekly"
        | "monthly"
        | "yearly"
        | "never",
      sitemapUrl: "",
      robotsTxt: "",
      robotsTxtUrl: "",
      metaTitle: "",
      metaDescription: "",
      sameAsMetaTitleDescription: true,
      ogTitle: "",
      ogDescription: "",
      ogImage: null as File | null,
    },
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [kbHomeExpanded, setKbHomeExpanded] = useState(true);
  const [articleConfigExpanded, setArticleConfigExpanded] = useState(false);
  const [seoExpanded, setSeoExpanded] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "",
    categoryId: "",
    subcategoryId: "",
    tags: [] as string[],
    status: "draft" as "draft" | "published" | "archived",
    displayOrder: 0,
    visibility: "all" as "all" | "internal" | "public" | "role_based",
    visibleToRoles: [] as string[],
  });
  const [tagInput, setTagInput] = useState("");
  const [copiedArticleId, setCopiedArticleId] = useState<string | null>(null);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");

  // Fetch projects or use context
  useEffect(() => {
    if (isProjectPortal && contextProjectId) {
      // In project portal, use the context project
      setSelectedProject(contextProjectId);
      if (contextProjectName) {
        setProjects([{ _id: contextProjectId, name: contextProjectName }]);
      }
    } else {
      // In main system, fetch all projects
      fetchProjects();
    }
  }, []);

  // Fetch articles when project changes
  useEffect(() => {
    if (selectedProject) {
      fetchArticles();
      fetchKBSettings();
      fetchRoles();
    }
  }, [selectedProject]);

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/roles?projectId=${selectedProject}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );
      const data = await response.json();
      if (data.success) {
        setRoles(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching roles:", error);
      setRoles([]);
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/projects`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });
      const data = await response.json();
      console.log("Projects API response:", data);

      // Handle API response structure: { success: true, data: { projects: [...], pagination: {...} } }
      let projectsData = [];
      if (data.success && data.data && Array.isArray(data.data.projects)) {
        projectsData = data.data.projects;
      } else if (data.success && Array.isArray(data.data)) {
        projectsData = data.data;
      } else if (Array.isArray(data)) {
        projectsData = data;
      }

      setProjects(projectsData);
      if (projectsData.length > 0) {
        setSelectedProject(projectsData[0]._id);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
      setProjects([]);
    }
  };

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/kb/project/${selectedProject}?status=all`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );
      const data = await response.json();
      if (data.success) {
        setArticles(data.data);
      }
    } catch (error) {
      console.error("Error fetching articles:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchKBSettings = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/projects/${selectedProject}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );
      const data = await response.json();
      if (data.success && data.data.configuration?.knowledgeBaseSettings) {
        const kbConfig = data.data.configuration.knowledgeBaseSettings;
        setKbSettings({
          enabled: kbConfig.enabled ?? true,
          kbHomeConfiguration:
            kbConfig.kbHomeConfiguration || kbSettings.kbHomeConfiguration,
          articleConfiguration:
            kbConfig.articleConfiguration || kbSettings.articleConfiguration,
          enableAIAssistance: kbConfig.enableAIAssistance ?? false,
          enableSatisfactionFeedback:
            kbConfig.enableSatisfactionFeedback ?? true,
          satisfactionFeedback:
            kbConfig.satisfactionFeedback || kbSettings.satisfactionFeedback,
          seoSettings: kbConfig.seoSettings || kbSettings.seoSettings,
        });
      }
    } catch (error) {
      console.error("Error fetching KB settings:", error);
    }
  };

  const saveKBSettings = async () => {
    try {
      setSavingSettings(true);
      const token = localStorage.getItem("authToken");

      // Get current project data first
      const getResponse = await fetch(
        `${API_CONFIG.API_URL}/projects/${selectedProject}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );
      const currentData = await getResponse.json();

      if (!currentData.success) {
        throw new Error("Failed to fetch current project data");
      }

      // Update with new KB settings
      const updatedProject = {
        ...currentData.data,
        configuration: {
          ...currentData.data.configuration,
          knowledgeBaseSettings: kbSettings,
        },
      };

      const response = await fetch(
        `${API_CONFIG.API_URL}/projects/${selectedProject}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(updatedProject),
        },
      );

      const data = await response.json();
      if (data.success) {
        alert("Knowledge Base settings saved successfully!");
      } else {
        throw new Error(data.message || "Failed to save settings");
      }
    } catch (error) {
      console.error("Error saving KB settings:", error);
      alert("Failed to save Knowledge Base settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreate = () => {
    setEditingArticle(null);
    setFormData({
      title: "",
      content: "",
      category: "",
      categoryId: "",
      subcategoryId: "",
      tags: [],
      status: "draft",
      displayOrder: 0,
      visibility: "all",
      visibleToRoles: [],
    });
    setShowModal(true);
  };

  const handleEdit = (article: KBArticle) => {
    setEditingArticle(article);
    setFormData({
      title: article.title,
      content: article.content,
      category: article.category || "",
      categoryId: article.categoryId || "",
      subcategoryId: article.subcategoryId || "",
      tags: article.tags || [],
      status: article.status,
      displayOrder: article.displayOrder,
      visibility: (article as any).visibility || "all",
      visibleToRoles: (article as any).visibleToRoles || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem("authToken");
      const url = editingArticle
        ? `${API_CONFIG.API_URL}/kb/${editingArticle._id}`
        : `${API_CONFIG.API_URL}/kb`;

      const method = editingArticle ? "PUT" : "POST";

      const payload = editingArticle
        ? {
            title: formData.title,
            content: formData.content,
            ...(formData.categoryId &&
              formData.categoryId.trim() !== "" && {
                categoryId: formData.categoryId,
              }),
            ...(formData.subcategoryId &&
              formData.subcategoryId.trim() !== "" && {
                subcategoryId: formData.subcategoryId,
              }),
            tags: formData.tags,
            status: formData.status,
            displayOrder: formData.displayOrder,
            visibility: formData.visibility,
            visibleToRoles: formData.visibleToRoles,
          }
        : {
            projectId: selectedProject,
            title: formData.title,
            content: formData.content,
            ...(formData.categoryId &&
              formData.categoryId.trim() !== "" && {
                categoryId: formData.categoryId,
              }),
            ...(formData.subcategoryId &&
              formData.subcategoryId.trim() !== "" && {
                subcategoryId: formData.subcategoryId,
              }),
            tags: formData.tags,
            status: formData.status,
            displayOrder: formData.displayOrder,
            visibility: formData.visibility,
            visibleToRoles: formData.visibleToRoles,
          };

      console.log("Sending payload:", payload);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.success) {
        setShowModal(false);
        fetchArticles();
        alert(
          editingArticle
            ? "Article updated successfully!"
            : "Article created successfully!",
        );
      } else {
        alert("Error: " + data.error);
      }
    } catch (error) {
      console.error("Error saving article:", error);
      alert("Failed to save article");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this article?")) return;

    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`${API_CONFIG.API_URL}/kb/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await response.json();
      if (data.success) {
        fetchArticles();
        alert("Article deleted successfully!");
      }
    } catch (error) {
      console.error("Error deleting article:", error);
      alert("Failed to delete article");
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      });
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t) => t !== tag),
    });
  };

  const copyArticleUrl = (articleId: string) => {
    const url = `${window.location.origin}/kb/${articleId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedArticleId(articleId);
        setTimeout(() => setCopiedArticleId(null), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy URL:", err);
      });
  };

  return (
    <DashboardLayout>
      <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
        <ModuleHeader
          title="Knowledge Base Management"
          subtitle="Create and manage articles for your knowledge base"
        />

        {hasPermission(PERMISSIONS.KB_CREATE) && (
          <div
            style={{
              marginBottom: "24px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={handleCreate}
              disabled={!selectedProject}
              style={{
                padding: "10px 20px",
                background: selectedProject
                  ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  : "#9ca3af",
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: selectedProject ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                boxShadow: selectedProject
                  ? "0 4px 15px rgba(102, 126, 234, 0.4)"
                  : "none",
              }}
              onMouseEnter={(e) => {
                if (selectedProject) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 20px rgba(102, 126, 234, 0.4)";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedProject) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 15px rgba(102, 126, 234, 0.4)";
                }
              }}
            >
              + Create Article
            </button>
          </div>
        )}

        {/* Project Selector - Only show if not in project portal */}
        {!isProjectPortal && (
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              Select Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              style={{
                width: "100%",
                maxWidth: "400px",
                padding: "10px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            >
              <option value="">Select a project</option>
              {Array.isArray(projects) &&
                projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Project Info - Show when in project portal */}
        {isProjectPortal && contextProjectName && (
          <div
            style={{
              marginBottom: "24px",
              padding: "12px 16px",
              background: "#f3f4f6",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{ fontSize: "14px", color: "#6b7280", fontWeight: "500" }}
            >
              Project:
            </span>
            <span
              style={{ fontSize: "14px", color: "#111827", fontWeight: "600" }}
            >
              {contextProjectName}
            </span>
          </div>
        )}

        {/* Tabs */}
        {selectedProject && (
          <>
            <div
              style={{
                borderBottom: "1px solid #e5e7eb",
                marginBottom: "24px",
                display: "flex",
                gap: "32px",
              }}
            >
              <button
                onClick={() => setActiveTab("articles")}
                style={{
                  padding: "12px 0",
                  background: "none",
                  border: "none",
                  borderBottom:
                    activeTab === "articles"
                      ? "2px solid #3b82f6"
                      : "2px solid transparent",
                  color: activeTab === "articles" ? "#3b82f6" : "#6b7280",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Articles
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                style={{
                  padding: "12px 0",
                  background: "none",
                  border: "none",
                  borderBottom:
                    activeTab === "settings"
                      ? "2px solid #3b82f6"
                      : "2px solid transparent",
                  color: activeTab === "settings" ? "#3b82f6" : "#6b7280",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Settings
              </button>
            </div>

            {/* Articles Tab Content */}
            {activeTab === "articles" && (
              <>
                {/* Articles List */}
                {loading ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "40px",
                      color: "#6b7280",
                    }}
                  >
                    Loading articles...
                  </div>
                ) : articles.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "40px",
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      color: "#6b7280",
                    }}
                  >
                    No articles found. Create your first article!
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {articles.map((article) => (
                      <div
                        key={article._id}
                        style={{
                          padding: "20px",
                          backgroundColor: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              marginBottom: "8px",
                            }}
                          >
                            <h3
                              style={{
                                margin: 0,
                                fontSize: "18px",
                                fontWeight: "600",
                              }}
                            >
                              {article.title}
                            </h3>
                            <span
                              style={{
                                padding: "4px 12px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "500",
                                backgroundColor:
                                  article.status === "published"
                                    ? "#dcfce7"
                                    : article.status === "draft"
                                      ? "#fef3c7"
                                      : "#f3f4f6",
                                color:
                                  article.status === "published"
                                    ? "#166534"
                                    : article.status === "draft"
                                      ? "#92400e"
                                      : "#6b7280",
                              }}
                            >
                              {article.status}
                            </span>
                          </div>
                          {article.category && (
                            <div
                              style={{
                                marginBottom: "8px",
                                fontSize: "14px",
                                color: "#6b7280",
                              }}
                            >
                              Category: <strong>{article.category}</strong>
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: "14px",
                              color: "#9ca3af",
                              marginBottom: "8px",
                            }}
                          >
                            👁️ {article.viewCount} views • 👍{" "}
                            {article.helpfulCount} helpful • 👎{" "}
                            {article.notHelpfulCount} not helpful
                          </div>
                          {article.tags && article.tags.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                flexWrap: "wrap",
                                marginTop: "8px",
                              }}
                            >
                              {article.tags.map((tag) => (
                                <span
                                  key={tag}
                                  style={{
                                    padding: "4px 8px",
                                    backgroundColor: "#eff6ff",
                                    color: "#1e40af",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => copyArticleUrl(article._id)}
                            style={{
                              padding: "8px 16px",
                              backgroundColor:
                                copiedArticleId === article._id
                                  ? "#dcfce7"
                                  : "#eff6ff",
                              color:
                                copiedArticleId === article._id
                                  ? "#166534"
                                  : "#1e40af",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "14px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                            title="Copy article URL"
                          >
                            {copiedArticleId === article._id
                              ? "✓ Copied"
                              : "🔗 Copy Link"}
                          </button>
                          {hasPermission(PERMISSIONS.KB_EDIT) && (
                            <button
                              onClick={() => handleEdit(article)}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "#f3f4f6",
                                color: "#374151",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "14px",
                                cursor: "pointer",
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {hasPermission(PERMISSIONS.KB_DELETE) && (
                            <button
                              onClick={() => handleDelete(article._id)}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "#fef2f2",
                                color: "#dc2626",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "14px",
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Settings Tab Content */}
            {activeTab === "settings" && (
              <div style={{ maxWidth: "900px" }}>
                <div style={{ marginBottom: "32px" }}>
                  <h2
                    style={{
                      fontSize: "20px",
                      fontWeight: "600",
                      marginBottom: "24px",
                    }}
                  >
                    Knowledge Base Settings
                  </h2>

                  {/* Enable KB */}
                  <div
                    style={{
                      padding: "16px",
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      marginBottom: "24px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={kbSettings.enabled}
                      onChange={(e) =>
                        setKbSettings({
                          ...kbSettings,
                          enabled: e.target.checked,
                        })
                      }
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    <div>
                      <label
                        style={{
                          fontWeight: "600",
                          fontSize: "14px",
                          display: "block",
                          marginBottom: "4px",
                        }}
                      >
                        Enable Knowledge Base
                      </label>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "#6b7280",
                          margin: 0,
                        }}
                      >
                        Turn on the knowledge base module for this project
                      </p>
                    </div>
                  </div>

                  {/* KB Home Configuration */}
                  <div style={{ marginBottom: "24px" }}>
                    <button
                      type="button"
                      onClick={() => setKbHomeExpanded(!kbHomeExpanded)}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        backgroundColor: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "14px",
                      }}
                    >
                      KB Home Page Configuration
                      <span
                        style={{
                          transform: kbHomeExpanded
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                          transition: "transform 0.2s",
                        }}
                      >
                        ▼
                      </span>
                    </button>
                    {kbHomeExpanded && (
                      <div
                        style={{
                          padding: "16px",
                          border: "1px solid #e5e7eb",
                          borderTop: "none",
                          borderRadius: "0 0 6px 6px",
                        }}
                      >
                        <div style={{ marginBottom: "16px" }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "13px",
                              fontWeight: "500",
                              marginBottom: "6px",
                            }}
                          >
                            Banner Heading
                          </label>
                          <input
                            type="text"
                            value={kbSettings.kbHomeConfiguration.bannerHeading}
                            onChange={(e) =>
                              setKbSettings({
                                ...kbSettings,
                                kbHomeConfiguration: {
                                  ...kbSettings.kbHomeConfiguration,
                                  bannerHeading: e.target.value,
                                },
                              })
                            }
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              border: "1px solid #d1d5db",
                              borderRadius: "6px",
                              fontSize: "14px",
                            }}
                          />
                        </div>

                        <div style={{ marginBottom: "16px" }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "13px",
                              fontWeight: "500",
                              marginBottom: "6px",
                            }}
                          >
                            Banner Description
                          </label>
                          <textarea
                            value={
                              kbSettings.kbHomeConfiguration.bannerDescription
                            }
                            onChange={(e) =>
                              setKbSettings({
                                ...kbSettings,
                                kbHomeConfiguration: {
                                  ...kbSettings.kbHomeConfiguration,
                                  bannerDescription: e.target.value,
                                },
                              })
                            }
                            rows={3}
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              border: "1px solid #d1d5db",
                              borderRadius: "6px",
                              fontSize: "14px",
                              resize: "vertical",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            marginBottom: "16px",
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "16px",
                          }}
                        >
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: "13px",
                                fontWeight: "500",
                                marginBottom: "6px",
                              }}
                            >
                              Banner Text Color
                            </label>
                            <input
                              type="color"
                              value={
                                kbSettings.kbHomeConfiguration.bannerTextColor
                              }
                              onChange={(e) =>
                                setKbSettings({
                                  ...kbSettings,
                                  kbHomeConfiguration: {
                                    ...kbSettings.kbHomeConfiguration,
                                    bannerTextColor: e.target.value,
                                  },
                                })
                              }
                              style={{
                                width: "100%",
                                height: "40px",
                                cursor: "pointer",
                              }}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: "13px",
                                fontWeight: "500",
                                marginBottom: "6px",
                              }}
                            >
                              Banner Background Color
                            </label>
                            <input
                              type="color"
                              value={
                                kbSettings.kbHomeConfiguration
                                  .bannerBackgroundColor
                              }
                              onChange={(e) =>
                                setKbSettings({
                                  ...kbSettings,
                                  kbHomeConfiguration: {
                                    ...kbSettings.kbHomeConfiguration,
                                    bannerBackgroundColor: e.target.value,
                                  },
                                })
                              }
                              style={{
                                width: "100%",
                                height: "40px",
                                cursor: "pointer",
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ marginBottom: "16px" }}>
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                kbSettings.kbHomeConfiguration
                                  .showPopularArticles
                              }
                              onChange={(e) =>
                                setKbSettings({
                                  ...kbSettings,
                                  kbHomeConfiguration: {
                                    ...kbSettings.kbHomeConfiguration,
                                    showPopularArticles: e.target.checked,
                                  },
                                })
                              }
                              style={{
                                width: "16px",
                                height: "16px",
                                cursor: "pointer",
                              }}
                            />
                            <span style={{ fontSize: "14px" }}>
                              Show Popular Articles
                            </span>
                          </label>
                        </div>

                        {kbSettings.kbHomeConfiguration.showPopularArticles && (
                          <div style={{ marginBottom: "16px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: "13px",
                                fontWeight: "500",
                                marginBottom: "6px",
                              }}
                            >
                              Popular Articles Count
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={
                                kbSettings.kbHomeConfiguration
                                  .popularArticlesCount
                              }
                              onChange={(e) =>
                                setKbSettings({
                                  ...kbSettings,
                                  kbHomeConfiguration: {
                                    ...kbSettings.kbHomeConfiguration,
                                    popularArticlesCount:
                                      parseInt(e.target.value) || 10,
                                  },
                                })
                              }
                              style={{
                                width: "100%",
                                padding: "8px 12px",
                                border: "1px solid #d1d5db",
                                borderRadius: "6px",
                                fontSize: "14px",
                              }}
                            />
                          </div>
                        )}

                        <div style={{ marginBottom: "16px" }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "13px",
                              fontWeight: "500",
                              marginBottom: "6px",
                            }}
                          >
                            Portal Viewable By
                          </label>
                          <select
                            value={
                              kbSettings.kbHomeConfiguration.portalViewableBy
                            }
                            onChange={(e) =>
                              setKbSettings({
                                ...kbSettings,
                                kbHomeConfiguration: {
                                  ...kbSettings.kbHomeConfiguration,
                                  portalViewableBy: e.target.value as
                                    | "all"
                                    | "loggedin",
                                },
                              })
                            }
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              border: "1px solid #d1d5db",
                              borderRadius: "6px",
                              fontSize: "14px",
                            }}
                          >
                            <option value="all">Everyone (Public)</option>
                            <option value="loggedin">
                              Logged-in Users Only
                            </option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI Assistance */}
                  <div
                    style={{
                      padding: "16px",
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      marginBottom: "24px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={kbSettings.enableAIAssistance}
                      onChange={(e) =>
                        setKbSettings({
                          ...kbSettings,
                          enableAIAssistance: e.target.checked,
                        })
                      }
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    <div>
                      <label
                        style={{
                          fontWeight: "600",
                          fontSize: "14px",
                          display: "block",
                          marginBottom: "4px",
                        }}
                      >
                        Enable AI Assistance
                      </label>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "#6b7280",
                          margin: 0,
                        }}
                      >
                        Allow AI-powered article suggestions and search
                      </p>
                    </div>
                  </div>

                  {/* Satisfaction Feedback */}
                  <div
                    style={{
                      padding: "16px",
                      backgroundColor: "#f9fafb",
                      borderRadius: "8px",
                      marginBottom: "24px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={kbSettings.enableSatisfactionFeedback}
                      onChange={(e) =>
                        setKbSettings({
                          ...kbSettings,
                          enableSatisfactionFeedback: e.target.checked,
                        })
                      }
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    <div>
                      <label
                        style={{
                          fontWeight: "600",
                          fontSize: "14px",
                          display: "block",
                          marginBottom: "4px",
                        }}
                      >
                        Enable Satisfaction Feedback
                      </label>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "#6b7280",
                          margin: 0,
                        }}
                      >
                        Allow users to rate articles as helpful or not helpful
                      </p>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      paddingTop: "16px",
                      borderTop: "1px solid #e5e7eb",
                    }}
                  >
                    <button
                      onClick={saveKBSettings}
                      disabled={savingSettings}
                      style={{
                        padding: "10px 24px",
                        backgroundColor: savingSettings ? "#9ca3af" : "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: "600",
                        cursor: savingSettings ? "not-allowed" : "pointer",
                      }}
                    >
                      {savingSettings ? "Saving..." : "Save Settings"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal */}
        {showModal && (
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
              zIndex: 1000,
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                width: "90%",
                maxWidth: "900px",
                maxHeight: "90vh",
                overflow: "auto",
                padding: "24px",
              }}
            >
              <h2
                style={{
                  margin: "0 0 24px 0",
                  fontSize: "20px",
                  fontWeight: "700",
                }}
              >
                {editingArticle ? "Edit Article" : "Create New Article"}
              </h2>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "14px",
                        fontWeight: "500",
                      }}
                    >
                      Content *
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {showHtmlSource && (
                        <button
                          type="button"
                          onClick={() => {
                            // Save HTML directly without switching to visual editor
                            setFormData({ ...formData, content: htmlSource });
                            alert(
                              "HTML content saved! The formatting will be preserved when the article is displayed.",
                            );
                          }}
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#16a34a",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "12px",
                            cursor: "pointer",
                          }}
                          title="Save HTML content as-is (preserves complex formatting)"
                        >
                          ✓ Apply HTML
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (showHtmlSource) {
                            // Check if HTML has complex styling that will be lost
                            const hasComplexHtml =
                              htmlSource.includes("<style") ||
                              htmlSource.includes("position:") ||
                              htmlSource.includes("pdf24") ||
                              htmlSource.includes("<!DOCTYPE");
                            if (hasComplexHtml) {
                              const confirmSwitch = window.confirm(
                                "Warning: Switching to Visual Editor will remove complex formatting (CSS styles, positioning, etc.).\n\n" +
                                  "To preserve formatting, click 'Apply HTML' instead, which saves the content as-is.\n\n" +
                                  "Do you still want to switch to Visual Editor?",
                              );
                              if (!confirmSwitch) return;
                            }
                            // Switching from HTML to visual - apply HTML changes
                            setFormData({ ...formData, content: htmlSource });
                          } else {
                            // Switching from visual to HTML - load current content
                            setHtmlSource(formData.content);
                          }
                          setShowHtmlSource(!showHtmlSource);
                        }}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#4b5563",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        {showHtmlSource
                          ? "👁 Visual Editor"
                          : "</> HTML Source"}
                      </button>
                    </div>
                  </div>

                  {showHtmlSource ? (
                    <div>
                      <div
                        style={{
                          marginBottom: "8px",
                          display: "flex",
                          gap: "8px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                          style={{
                            padding: "4px 10px",
                            border: "1px solid #d1d5db",
                            borderRadius: "4px",
                            fontSize: "12px",
                            cursor: "pointer",
                            backgroundColor: "white",
                          }}
                        >
                          {showHtmlPreview ? "Hide Preview" : "Show Preview"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Extract body content from full HTML document
                            let content = htmlSource;
                            const bodyMatch = content.match(
                              /<body[^>]*>([\s\S]*?)<\/body>/i,
                            );
                            if (bodyMatch) {
                              // Extract style tags and body content
                              const styleMatch = content.match(
                                /<style[^>]*>([\s\S]*?)<\/style>/gi,
                              );
                              const styles = styleMatch
                                ? styleMatch.join("\n")
                                : "";
                              content = styles + bodyMatch[1];
                            }
                            setHtmlSource(content);
                          }}
                          style={{
                            padding: "4px 10px",
                            border: "1px solid #d1d5db",
                            borderRadius: "4px",
                            fontSize: "12px",
                            cursor: "pointer",
                            backgroundColor: "white",
                          }}
                          title="Extract body content from full HTML document"
                        >
                          Extract Body
                        </button>
                      </div>
                      <div
                        style={{
                          display: showHtmlPreview ? "grid" : "block",
                          gridTemplateColumns: showHtmlPreview
                            ? "1fr 1fr"
                            : "1fr",
                          gap: "16px",
                        }}
                      >
                        <textarea
                          value={htmlSource}
                          onChange={(e) => setHtmlSource(e.target.value)}
                          style={{
                            width: "100%",
                            height: "350px",
                            padding: "12px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            fontFamily: "monospace",
                            fontSize: "13px",
                          }}
                          placeholder="Paste your HTML code here (tables, images, formatted content)..."
                        />
                        {showHtmlPreview && (
                          <iframe
                            srcDoc={htmlSource}
                            style={{
                              border: "1px solid #d1d5db",
                              borderRadius: "6px",
                              height: "350px",
                              width: "100%",
                              backgroundColor: "white",
                            }}
                            sandbox="allow-same-origin allow-scripts"
                            title="HTML Preview"
                          />
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginTop: "8px",
                        }}
                      >
                        💡 Tip: Convert PDF to HTML using{" "}
                        <a
                          href="https://tools.pdf24.org/en/pdf-to-html"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#2563eb",
                            textDecoration: "underline",
                          }}
                        >
                          PDF24 Tools
                        </a>
                        . Paste the full HTML, click "Extract Body" to clean up.
                        Tables and formatting will be preserved.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <ReactQuill
                        theme="snow"
                        value={formData.content}
                        onChange={(content) =>
                          setFormData({ ...formData, content })
                        }
                        style={{ height: "300px", marginBottom: "50px" }}
                      />
                      <p
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginTop: "8px",
                        }}
                      >
                        💡 Tip: For tables and complex layouts, switch to HTML
                        Source mode.
                      </p>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "16px",
                    marginBottom: "20px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "8px",
                        fontSize: "14px",
                        fontWeight: "500",
                      }}
                    >
                      Display Order
                    </label>
                    <input
                      type="number"
                      value={formData.displayOrder}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          displayOrder: parseInt(e.target.value) || 0,
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    Tags
                  </label>
                  <div
                    style={{ display: "flex", gap: "8px", marginBottom: "8px" }}
                  >
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) =>
                        e.key === "Enter" && (e.preventDefault(), addTag())
                      }
                      placeholder="Add a tag and press Enter"
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "14px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      style={{
                        padding: "10px 16px",
                        backgroundColor: "#f3f4f6",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "14px",
                        cursor: "pointer",
                      }}
                    >
                      Add Tag
                    </button>
                  </div>
                  <div
                    style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}
                  >
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#eff6ff",
                          color: "#1e40af",
                          borderRadius: "6px",
                          fontSize: "13px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#1e40af",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: "16px",
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    Status *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as any,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                {/* Visibility Settings */}
                <div
                  style={{
                    marginBottom: "24px",
                    padding: "16px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 12px 0",
                      fontSize: "14px",
                      fontWeight: "600",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    👁 Visibility Settings
                  </h4>

                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "6px",
                        fontSize: "13px",
                        fontWeight: "500",
                      }}
                    >
                      Who can view this article?
                    </label>
                    <select
                      value={formData.visibility}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          visibility: e.target.value as any,
                          visibleToRoles:
                            e.target.value !== "role_based"
                              ? []
                              : formData.visibleToRoles,
                        })
                      }
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "6px",
                        fontSize: "14px",
                      }}
                    >
                      <option value="all">All Users (Everyone)</option>
                      <option value="public">
                        Public Only (End Users / Students)
                      </option>
                      <option value="internal">Internal Only (Agents)</option>
                      <option value="role_based">
                        Role-Based (Select specific roles)
                      </option>
                    </select>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginTop: "4px",
                      }}
                    >
                      {formData.visibility === "all" &&
                        "This article will be visible to everyone."}
                      {formData.visibility === "public" &&
                        "This article will only be visible to end users (students) on the public portal."}
                      {formData.visibility === "internal" &&
                        "This article will only be visible to internal agents for ticket resolution."}
                      {formData.visibility === "role_based" &&
                        "Select which roles can view this article below."}
                    </p>
                  </div>

                  {formData.visibility === "role_based" && (
                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "6px",
                          fontSize: "13px",
                          fontWeight: "500",
                        }}
                      >
                        👥 Select Roles
                      </label>
                      <div
                        style={{
                          maxHeight: "150px",
                          overflowY: "auto",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          padding: "8px",
                          backgroundColor: "white",
                        }}
                      >
                        {roles.length === 0 ? (
                          <p
                            style={{
                              fontSize: "13px",
                              color: "#6b7280",
                              padding: "8px",
                            }}
                          >
                            No roles found for this project
                          </p>
                        ) : (
                          roles.map((role) => (
                            <label
                              key={role._id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "6px 8px",
                                cursor: "pointer",
                                borderRadius: "4px",
                              }}
                              onMouseOver={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  "#f3f4f6")
                              }
                              onMouseOut={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                  "transparent")
                              }
                            >
                              <input
                                type="checkbox"
                                checked={formData.visibleToRoles.includes(
                                  role._id,
                                )}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      visibleToRoles: [
                                        ...formData.visibleToRoles,
                                        role._id,
                                      ],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      visibleToRoles:
                                        formData.visibleToRoles.filter(
                                          (id) => id !== role._id,
                                        ),
                                    });
                                  }
                                }}
                                style={{ width: "16px", height: "16px" }}
                              />
                              <span style={{ fontSize: "13px" }}>
                                {role.name}
                              </span>
                              {role.code && (
                                <span
                                  style={{ fontSize: "11px", color: "#9ca3af" }}
                                >
                                  ({role.code})
                                </span>
                              )}
                            </label>
                          ))
                        )}
                      </div>
                      {formData.visibleToRoles.length > 0 && (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#3b82f6",
                            marginTop: "4px",
                          }}
                        >
                          {formData.visibleToRoles.length} role(s) selected
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#f3f4f6",
                      color: "#374151",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    {editingArticle ? "Update Article" : "Create Article"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default KnowledgeBaseManagement;
