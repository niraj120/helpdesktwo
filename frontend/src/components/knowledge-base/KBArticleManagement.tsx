import React, { useState, useEffect } from "react";
import axios from "axios";
import { Plus, Edit2, Trash2, Eye, FileText, Calendar } from "lucide-react";
import KBArticleForm from "./KBArticleForm";
import { API_CONFIG } from "../../config/constants";

interface KBArticle {
  _id: string;
  documentName: string;
  documentType: "pdf" | "html" | "both";
  status: "active" | "inactive";
  publishedDate?: Date;
  scheduledPublishDate?: Date;
  isFeatured: boolean;
  showNewTag: boolean;
  description?: string;
  viewsCount: number;
  tags: string[];
  levels: { _id: string; levelName: string }[];
  createdBy?: { name: string };
}

interface KBArticleManagementProps {
  projectId: string;
}

const KBArticleManagement: React.FC<KBArticleManagementProps> = ({
  projectId,
}) => {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KBArticle | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    levelId: "",
    search: "",
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchArticles();
  }, [projectId, filters, page]);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/articles`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          projectId,
          status: filters.status !== "all" ? filters.status : undefined,
          levelId: filters.levelId || undefined,
          search: filters.search || undefined,
          page,
          limit: 20,
        },
      });
      setArticles(response.data.data.articles || []);
      setTotalPages(response.data.data.pagination.totalPages || 1);
    } catch (error: any) {
      console.error("Failed to fetch KB articles:", error);
      alert(error.response?.data?.message || "Failed to fetch articles");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (articleId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this article? This will also delete any associated PDFs.",
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(`${API_CONFIG.API_URL}/kb/articles/${articleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchArticles();
    } catch (error: any) {
      console.error("Failed to delete article:", error);
      alert(error.response?.data?.message || "Failed to delete article");
    }
  };

  const handleEdit = async (article: KBArticle) => {
    try {
      setIsLoadingArticle(true);
      setShowForm(true); // Show form with loading state
      // Fetch full article details including levels
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/articles/${article._id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      console.log("Fetched article for editing:", response.data.data);
      setEditingArticle(response.data.data);
    } catch (error) {
      console.error("Failed to fetch article details:", error);
      alert("Failed to load article details");
      setShowForm(false);
    } finally {
      setIsLoadingArticle(false);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingArticle(null);
    fetchArticles();
  };

  if (showForm) {
    // Show loading state while fetching article for edit
    if (isLoadingArticle) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading article...</p>
          </div>
        </div>
      );
    }

    return (
      <KBArticleForm
        key={editingArticle?._id || "new"} // Force remount when editing different articles
        projectId={projectId}
        article={editingArticle}
        onClose={handleFormClose}
      />
    );
  }

  const totalArticles = articles.length;
  const activeArticles = articles.filter((a) => a.status === "active").length;
  const featuredArticles = articles.filter((a) => a.isFeatured).length;
  const newTagArticles = articles.filter((a) => a.showNewTag).length;

  return (
    <div
      style={{
        background: "#F8F9FC",
        minHeight: "100vh",
        padding: "24px 20px 32px",
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Page Header */}
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
            📄 Knowledge Base Articles
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#667085" }}>
            Manage documents, PDFs, and HTML content for the knowledge base
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
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
          Add Article
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
            label: "Total Articles",
            value: totalArticles,
            bg: "#F4F3FF",
            icon: "📄",
          },
          { label: "Active", value: activeArticles, bg: "#ECFDF3", icon: "✅" },
          {
            label: "Featured",
            value: featuredArticles,
            bg: "#FFFAEB",
            icon: "⭐",
          },
          {
            label: "New Tag",
            value: newTagArticles,
            bg: "#EFF8FF",
            icon: "🆕",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: "1 1 140px",
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
                width: "40px",
                height: "40px",
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
                  fontSize: "22px",
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

      {/* Filter Bar */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "12px 16px",
          marginBottom: "16px",
          boxShadow: "0 1px 4px rgba(0,0,0,.06)",
          border: "1px solid #F3F4F6",
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <span
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#9CA3AF",
            }}
          >
            🔍
          </span>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search articles..."
            style={{
              width: "100%",
              paddingLeft: "32px",
              paddingRight: "10px",
              paddingTop: "9px",
              paddingBottom: "9px",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              background: "#F9FAFB",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          style={{
            padding: "9px 28px 9px 10px",
            border:
              filters.status !== "all"
                ? "1.5px solid #3B82F6"
                : "1px solid #E5E7EB",
            borderRadius: "8px",
            background: filters.status !== "all" ? "#EFF6FF" : "#F9FAFB",
            fontSize: "14px",
            color: filters.status !== "all" ? "#1D4ED8" : "#374151",
            fontWeight: filters.status !== "all" ? 500 : 400,
            cursor: "pointer",
          }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {(filters.search || filters.status !== "all") && (
          <button
            onClick={() =>
              setFilters({ status: "all", levelId: "", search: "" })
            }
            style={{
              padding: "9px 14px",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              background: "white",
              color: "#6B7280",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Articles Table */}
      {loading ? (
        <div
          style={{
            background: "white",
            borderRadius: "10px",
            border: "1px solid #E4E7EC",
            padding: "48px 24px",
            textAlign: "center",
            color: "#667085",
            fontSize: "14px",
          }}
        >
          Loading articles...
        </div>
      ) : articles.length === 0 ? (
        <div
          style={{
            background: "white",
            borderRadius: "10px",
            border: "1px solid #E4E7EC",
            padding: "64px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📄</div>
          <p style={{ color: "#667085", fontSize: "14px", margin: 0 }}>
            No articles found. Click <strong>Add Article</strong> to get
            started.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              background: "white",
              borderRadius: "10px",
              border: "1px solid #E4E7EC",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    background: "#F9FAFB",
                    borderBottom: "1px solid #E4E7EC",
                  }}
                >
                  {[
                    "Document Name",
                    "Type",
                    "Status",
                    "Tags / Levels",
                    "Views",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#667085",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr
                    key={article._id}
                    style={{
                      borderBottom: "1px solid #F2F4F7",
                      background: "white",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#F9FAFB")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    <td style={{ padding: "12px 16px", maxWidth: "300px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 500,
                              color: "#101828",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "260px",
                            }}
                          >
                            {article.documentName}
                          </div>
                          {article.description && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#667085",
                                marginTop: "2px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "260px",
                              }}
                            >
                              {article.description}
                            </div>
                          )}
                        </div>
                        {article.showNewTag && (
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: "20px",
                              fontSize: "10px",
                              fontWeight: 700,
                              background: "#ECFDF3",
                              color: "#027A48",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            NEW
                          </span>
                        )}
                        {article.isFeatured && (
                          <span style={{ fontSize: "14px", flexShrink: 0 }}>
                            ⭐
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: "#EFF8FF",
                          color: "#175CD3",
                          textTransform: "uppercase",
                        }}
                      >
                        {article.documentType}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background:
                            article.status === "active" ? "#ECFDF3" : "#F2F4F7",
                          color:
                            article.status === "active" ? "#027A48" : "#344054",
                        }}
                      >
                        {article.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "4px",
                        }}
                      >
                        {article.levels?.slice(0, 2).map((level) => (
                          <span
                            key={level._id}
                            style={{
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              background: "#F4F3FF",
                              color: "#7F56D9",
                            }}
                          >
                            {level.levelName}
                          </span>
                        ))}
                        {article.levels?.length > 2 && (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              background: "#F2F4F7",
                              color: "#667085",
                            }}
                          >
                            +{article.levels.length - 2}
                          </span>
                        )}
                        {(!article.levels || article.levels.length === 0) && (
                          <span style={{ color: "#9CA3AF", fontSize: "12px" }}>
                            —
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        color: "#667085",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Eye size={13} />
                        {article.viewsCount}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: "4px",
                        }}
                      >
                        <button
                          onClick={() => handleEdit(article)}
                          title="Edit"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: "1px solid #E4E7EC",
                            background: "white",
                            color: "#344054",
                            fontSize: "13px",
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          <Edit2 size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(article._id)}
                          title="Delete"
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #FCA5A5",
                            background: "#FEF2F2",
                            color: "#DC2626",
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                marginTop: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "14px",
                color: "#6B7280",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #D1D5DB",
                    background: page <= 1 ? "#F3F4F6" : "white",
                    color: page <= 1 ? "#9CA3AF" : "#374151",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  ← Previous
                </button>
                <span style={{ padding: "0 12px" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #D1D5DB",
                    background: page >= totalPages ? "#F3F4F6" : "white",
                    color: page >= totalPages ? "#9CA3AF" : "#374151",
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next →
                </button>
              </div>
              <div>
                Showing {Math.min((page - 1) * 20 + 1, totalArticles)}–
                {Math.min(page * 20, totalArticles)} of {totalArticles} articles
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default KBArticleManagement;
