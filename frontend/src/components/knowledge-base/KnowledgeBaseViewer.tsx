import React, { useState, useEffect } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Search,
  Eye,
  Table as TableIcon,
  Sparkles,
  LayoutGrid,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import ArticleDetailView from "./ArticleDetailView";
import KBTableViewer from "./KBTableViewer";
import { API_CONFIG } from "../../config/constants";

interface KBLevel {
  id: string;
  levelName: string;
  levelOrder: number;
  levelIcon?: string;
  articles: KBArticle[];
  tables: KBTable[];
}

interface KBTable {
  _id: string;
  tableName: string;
  description?: string;
  status: string;
  displayStyle?: "table" | "tiles";
  dataSource?: "manual" | "articles";
}

interface KBArticle {
  id: string;
  documentName: string;
  documentType: "pdf" | "html" | "both" | "link";
  docNumber?: string;
  pageNumber?: number;
  searchableText?: string;
  pdfUrl?: string;
  htmlContent?: string;
  externalUrl?: string;
  description?: string;
  showNewTag?: boolean;
  isFeatured: boolean;
  author?: string;
  publishedAt?: Date;
  viewsCount: number;
  tags: string[];
}

interface KBArticleWithSnippet extends KBArticle {
  searchSnippet?: string;
}

interface KnowledgeBaseViewerProps {
  projectId: string;
  showControls?: boolean; // Hide toggle buttons for regular users
  isStudentPortal?: boolean; // When true, shows content visible to Student role even if not authenticated
}

const KnowledgeBaseViewer: React.FC<KnowledgeBaseViewerProps> = ({
  projectId,
  showControls = false,
  isStudentPortal = false,
}) => {
  const { t } = useTranslation();
  const [levels, setLevels] = useState<KBLevel[]>([]);
  const [allLevels, setAllLevels] = useState<KBLevel[]>([]); // master copy, never filtered
  const [activeLevel, setActiveLevel] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState(""); // set on Search click, passed to tables
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"articles" | "tables" | "all">(
    "all",
  );

  useEffect(() => {
    if (projectId) {
      fetchKnowledgeBase();
    }
  }, [projectId]);

  const fetchKnowledgeBase = async () => {
    if (!projectId) {
      console.log("KnowledgeBaseViewer: No projectId provided, skipping fetch");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      // Build headers - only include auth if NOT student portal and token exists
      // For student portal, skip token to avoid expired token errors on public access
      const headers: any = {};
      if (!isStudentPortal && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      console.log(
        "KnowledgeBaseViewer: Fetching KB with projectId:",
        projectId,
        "isStudentPortal:",
        isStudentPortal,
      );

      const params: any = { projectId };

      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/public/articles`,
        {
          headers,
          params,
        },
      );
      const fetchedLevels = response.data.data.levels || [];
      setAllLevels(fetchedLevels);
      setLevels(fetchedLevels);
      if (fetchedLevels.length > 0) {
        setActiveLevel(fetchedLevels[0].id);
      }
    } catch (error: any) {
      console.error("Failed to fetch knowledge base:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    const q = searchQuery.trim().toLowerCase();

    if (!q) {
      // Restore full view
      setLevels(allLevels);
      if (allLevels.length > 0) setActiveLevel(allLevels[0].id);
      setAppliedSearchQuery("");
      return;
    }

    setAppliedSearchQuery(q);

    const getSearchSnippet = (article: KBArticle, query: string) => {
      const htmlText = (article.searchableText || article.htmlContent || "")
        .replace(/\s+/g, " ")
        .trim();

      const text = [article.description || "", htmlText, article.tags.join(" ")]
        .join(" ")
        .trim();

      if (!text) return "";

      const lower = text.toLowerCase();
      const idx = lower.indexOf(query);
      if (idx === -1) {
        return text.slice(0, 140) + (text.length > 140 ? "..." : "");
      }

      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + query.length + 80);
      const prefix = start > 0 ? "..." : "";
      const suffix = end < text.length ? "..." : "";
      return `${prefix}${text.slice(start, end)}${suffix}`;
    };

    const normalizeHtmlText = (html?: string) => {
      if (!html) return "";
      return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    };

    // In-memory search across article metadata + HTML content.
    const filtered = allLevels
      .map((level) => {
        const matchedArticles = level.articles
          .filter((article) => {
            const searchable = [
              article.documentName,
              article.description || "",
              article.author || "",
              article.docNumber || "",
              article.pageNumber !== undefined
                ? String(article.pageNumber)
                : "",
              article.tags.join(" "),
              article.searchableText || "",
              normalizeHtmlText(article.htmlContent),
            ]
              .join(" ")
              .toLowerCase();

            return searchable.includes(q);
          })
          .map((article) => ({
            ...article,
            searchSnippet: getSearchSnippet(article, q),
          }));

        return {
          ...level,
          articles: matchedArticles,
          // Keep tables available so global query can filter table rows via externalSearchQuery.
          tables: level.tables || [],
        };
      })
      .filter(
        (level) =>
          level.articles.length > 0 ||
          (level.tables && level.tables.length > 0),
      );

    setLevels(filtered);
    if (filtered.length > 0) setActiveLevel(filtered[0].id);
  };

  if (selectedArticle) {
    return (
      <ArticleDetailView
        articleId={selectedArticle}
        projectId={projectId}
        onBack={() => setSelectedArticle(null)}
        onSelectArticle={(nextArticleId) => setSelectedArticle(nextArticleId)}
        isStudentPortal={isStudentPortal}
        searchQuery={appliedSearchQuery}
      />
    );
  }

  if (selectedTable) {
    return (
      <KBTableViewer
        tableId={selectedTable}
        onClose={() => setSelectedTable(null)}
        isStudentPortal={isStudentPortal}
      />
    );
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "200px",
        }}
      >
        <div style={{ color: "#667085", fontSize: "14px" }}>
          {t("loadingArticles")}
        </div>
      </div>
    );
  }

  const currentLevel = levels.find((l) => l.id === activeLevel);

  const hasArticleDataSourceTable = currentLevel?.tables?.some(
    (t) => t.dataSource === "articles",
  );

  return (
    <div
      style={{
        background: "#F8F9FC",
        minHeight: "100vh",
        padding: "20px",
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header Card */}
      <div
        style={{
          background:
            "linear-gradient(135deg,#7F56D9 0%,#9E77ED 60%,#6941C6 100%)",
          padding: "28px 28px 24px",
          borderRadius: "16px",
          marginBottom: "20px",
          boxShadow: "0 8px 32px rgba(127,86,217,.25)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
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
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "rgba(255,255,255,.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
              }}
            >
              <Sparkles size={24} style={{ color: "white" }} />
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "26px",
                fontWeight: 800,
                color: "white",
                letterSpacing: "-0.02em",
              }}
            >
              {t("knowledgeBaseTitle")}
            </h2>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "rgba(255,255,255,.8)",
              fontWeight: 400,
            }}
          >
            {t("discoverKnowledgeBase")}
          </p>
        </div>
        {/* View Mode Toggle — admin only */}
        {showControls && (
          <div
            style={{
              display: "inline-flex",
              gap: "4px",
              background: "rgba(255,255,255,.15)",
              borderRadius: "10px",
              padding: "4px",
            }}
          >
            {(
              [
                ["all", "all", LayoutGrid],
                ["articles", "articles", BookOpen],
                ["tables", "tables", TableIcon],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as any)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    viewMode === mode ? "rgba(255,255,255,.95)" : "transparent",
                  color:
                    viewMode === mode ? "#7F56D9" : "rgba(255,255,255,.85)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all .15s",
                }}
              >
                <Icon size={15} />
                {t(label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          border: "1px solid #E4E7EC",
          boxShadow: "0 2px 12px rgba(0,0,0,.06)",
          display: "flex",
          alignItems: "center",
          gap: "0",
          marginBottom: "20px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "0 14px", color: "#9CA3AF", flexShrink: 0 }}>
          <Search size={20} />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!e.target.value.trim()) {
              setLevels(allLevels);
              if (allLevels.length > 0) setActiveLevel(allLevels[0].id);
              setAppliedSearchQuery("");
            }
          }}
          onKeyPress={(e) => e.key === "Enter" && handleSearch()}
          placeholder={t("searchForArticles")}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            padding: "14px 8px",
            fontSize: "15px",
            background: "transparent",
            color: "#101828",
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#7F56D9",
            color: "white",
            border: "none",
            padding: "14px 24px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Search size={16} />
          {t("search")}
        </button>
      </div>

      {levels.length === 0 ? (
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            border: "1px solid #E4E7EC",
            padding: "64px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📄</div>
          <p style={{ color: "#667085", fontSize: "14px", margin: 0 }}>
            {t("noArticlesAvailable")}
          </p>
        </div>
      ) : (
        <>
          {/* Level Tabs */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "20px",
            }}
          >
            {levels.map((level) => {
              const isActive = activeLevel === level.id;
              const count = level.tables?.some(
                (t) => t.dataSource === "articles",
              )
                ? level.articles?.length || 0
                : (level.articles?.length || 0) + (level.tables?.length || 0);
              return (
                <button
                  key={level.id}
                  onClick={() => setActiveLevel(level.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 18px",
                    borderRadius: "10px",
                    border: isActive
                      ? "2px solid #7F56D9"
                      : "1px solid #E4E7EC",
                    background: isActive ? "#F4F3FF" : "white",
                    color: isActive ? "#7F56D9" : "#344054",
                    fontSize: "14px",
                    fontWeight: isActive ? 700 : 500,
                    cursor: "pointer",
                    boxShadow: isActive
                      ? "0 0 0 3px #F4F3FF"
                      : "0 1px 3px rgba(0,0,0,.04)",
                    transition: "all .15s",
                  }}
                >
                  {level.levelIcon && (
                    <span style={{ fontSize: "18px" }}>{level.levelIcon}</span>
                  )}
                  <span>{level.levelName}</span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: isActive ? "#7F56D9" : "#F2F4F7",
                      color: isActive ? "white" : "#667085",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Article Cards */}
          {currentLevel &&
            !hasArticleDataSourceTable &&
            (viewMode === "all" || viewMode === "articles") &&
            (currentLevel.articles.length === 0 && viewMode === "articles" ? (
              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  border: "1px solid #E4E7EC",
                  padding: "48px 24px",
                  textAlign: "center",
                  marginBottom: "20px",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>📄</div>
                <p style={{ color: "#667085", fontSize: "14px", margin: 0 }}>
                  No articles in this category.
                </p>
              </div>
            ) : (
              currentLevel.articles.length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                  <h3
                    style={{
                      margin: "0 0 14px 0",
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "#344054",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <FileText size={16} />
                    Articles ({currentLevel.articles.length})
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: "14px",
                    }}
                  >
                    {currentLevel.articles.map((article) => {
                      const searchAwareArticle =
                        article as KBArticleWithSnippet;
                      return (
                        <div
                          key={article.id}
                          onClick={() => setSelectedArticle(article.id)}
                          style={{
                            background: "white",
                            borderRadius: "12px",
                            border: "1px solid #E4E7EC",
                            padding: "18px 20px",
                            cursor: "pointer",
                            boxShadow: "0 1px 3px rgba(0,0,0,.05)",
                            transition: "all .15s",
                            borderLeft: article.showNewTag
                              ? "3px solid #7F56D9"
                              : "1px solid #E4E7EC",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.boxShadow =
                              "0 4px 16px rgba(0,0,0,.10)";
                            (e.currentTarget as HTMLElement).style.transform =
                              "translateY(-1px)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.boxShadow =
                              "0 1px 3px rgba(0,0,0,.05)";
                            (e.currentTarget as HTMLElement).style.transform =
                              "none";
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              marginBottom: "8px",
                            }}
                          >
                            <h3
                              style={{
                                margin: 0,
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "#101828",
                                flex: 1,
                                lineHeight: "1.4",
                                overflow: "hidden",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical" as any,
                              }}
                            >
                              {article.documentName}
                            </h3>
                            <div
                              style={{
                                display: "flex",
                                gap: "4px",
                                marginLeft: "8px",
                                flexShrink: 0,
                              }}
                            >
                              {article.showNewTag && (
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "20px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    background: "#7F56D9",
                                    color: "white",
                                  }}
                                >
                                  NEW
                                </span>
                              )}
                              {article.isFeatured && (
                                <span style={{ fontSize: "16px" }}>⭐</span>
                              )}
                            </div>
                          </div>
                          {article.description && (
                            <p
                              style={{
                                margin: "0 0 8px 0",
                                fontSize: "12px",
                                color: "#667085",
                                overflow: "hidden",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical" as any,
                                lineHeight: "1.5",
                              }}
                            >
                              {article.description}
                            </p>
                          )}
                          {!!appliedSearchQuery &&
                            !!searchAwareArticle.searchSnippet && (
                              <p
                                style={{
                                  margin: "0 0 8px 0",
                                  fontSize: "12px",
                                  color: "#92400E",
                                  background: "#FFFBEB",
                                  borderRadius: "6px",
                                  padding: "6px 10px",
                                  border: "1px solid #FDE68A",
                                  lineHeight: "1.5",
                                  overflow: "hidden",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical" as any,
                                }}
                              >
                                {searchAwareArticle.searchSnippet}
                              </p>
                            )}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
                              marginBottom: "10px",
                            }}
                          >
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "20px",
                                fontSize: "11px",
                                fontWeight: 600,
                                background: "#EFF8FF",
                                color: "#175CD3",
                              }}
                            >
                              {article.documentType}
                            </span>
                            {article.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: "20px",
                                  fontSize: "11px",
                                  background: "#F2F4F7",
                                  color: "#667085",
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              fontSize: "12px",
                              color: "#9CA3AF",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Eye size={12} />
                              {article.viewsCount} views
                            </span>
                            <span
                              style={{
                                color: "#7F56D9",
                                fontWeight: 600,
                                fontSize: "12px",
                              }}
                            >
                              Read more →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ))}

          {/* Tables */}
          {currentLevel &&
            (viewMode === "all" || viewMode === "tables") &&
            (currentLevel.tables &&
            currentLevel.tables.length === 0 &&
            viewMode === "tables" ? (
              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  border: "1px solid #E4E7EC",
                  padding: "48px 24px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>📊</div>
                <p style={{ color: "#667085", fontSize: "14px", margin: 0 }}>
                  No tables in this category.
                </p>
              </div>
            ) : (
              currentLevel.tables &&
              currentLevel.tables.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  {currentLevel.tables.map((table) => (
                    <div key={table._id}>
                      <KBTableViewer
                        tableId={table._id}
                        levelId={currentLevel.id}
                        showHeader={false}
                        autoPopulate={true}
                        isStudentPortal={isStudentPortal}
                        externalSearchQuery={appliedSearchQuery}
                        projectId={projectId}
                        useGlobalSearchOnly={true}
                      />
                    </div>
                  ))}
                </div>
              )
            ))}
        </>
      )}
    </div>
  );
};

export default KnowledgeBaseViewer;
