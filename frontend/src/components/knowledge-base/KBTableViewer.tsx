import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Table,
  Download,
  ExternalLink,
  Calendar,
  X,
  Search,
} from "lucide-react";
import { API_CONFIG } from "../../config/constants";
import ArticleDetailView from "./ArticleDetailView";

interface TableColumn {
  columnName: string;
  columnType: "text" | "number" | "date" | "url" | "file";
  isRequired: boolean;
  order: number;
  articleFieldMapping?: string;
}

interface TableRow {
  _id: string;
  rowData: { [key: string]: any };
  order: number;
}

interface KBTableData {
  _id: string;
  tableName: string;
  description?: string;
  displayStyle?: "table" | "tiles";
  columns: TableColumn[];
  rows: TableRow[];
  showSerialNumber: boolean;
  isSearchable: boolean;
  isPaginated: boolean;
}

interface KBTableViewerProps {
  tableId: string;
  levelId?: string; // Optional: filter table data by specific level
  onClose?: () => void;
  showHeader?: boolean;
  autoPopulate?: boolean;
  isStudentPortal?: boolean; // When true, adds student-portal context for visibility filtering
  externalSearchQuery?: string; // When provided, filters table rows from parent search
  projectId?: string; // Passed to ArticleDetailView for public article access
  useGlobalSearchOnly?: boolean; // Hide local table search when parent global search is the single source
}

const KBTableViewer: React.FC<KBTableViewerProps> = ({
  tableId,
  levelId,
  onClose,
  showHeader = true,
  autoPopulate = true,
  isStudentPortal = false,
  externalSearchQuery = "",
  projectId,
  useGlobalSearchOnly = false,
}) => {
  const [table, setTable] = useState<KBTableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingArticleId, setViewingArticleId] = useState<string | null>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchTable();
  }, [tableId, levelId]);

  const fetchTable = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const headers: Record<string, string> = {};
      // Only send token if NOT student portal to avoid expired token errors
      if (!isStudentPortal && token) {
        headers.Authorization = `Bearer ${token}`;
      }
      // Build query params - include levelId if provided to filter articles
      const params: Record<string, string> = {};
      if (levelId) {
        params.levelId = levelId;
      }
      // Add student-portal context for visibility filtering when unauthenticated
      if (isStudentPortal && !token) {
        params.context = "student-portal";
      }
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/tables/public/${tableId}`,
        { headers, params },
      );
      // Set default displayStyle for backward compatibility
      const tableData = response.data.data;
      if (!tableData.displayStyle) {
        tableData.displayStyle = "table";
      }
      setTable(tableData);

      // Auto-populate table from articles if enabled, has valid token, not student portal, and no rows exist
      if (
        autoPopulate &&
        !isStudentPortal &&
        token &&
        (!response.data.data.rows || response.data.data.rows.length === 0)
      ) {
        await populateFromArticles(tableId, token || "");
        // Refetch after population
        const updatedResponse = await axios.get(
          `${API_CONFIG.API_URL}/kb/tables/public/${tableId}`,
          { headers, params },
        );
        // Set default displayStyle for backward compatibility
        const updatedTableData = updatedResponse.data.data;
        if (!updatedTableData.displayStyle) {
          updatedTableData.displayStyle = "table";
        }
        setTable(updatedTableData);
      }
    } catch (error) {
      console.error("Failed to fetch table:", error);
    } finally {
      setLoading(false);
    }
  };

  const populateFromArticles = async (id: string, token: string) => {
    try {
      await axios.post(
        `${API_CONFIG.API_URL}/kb/tables/${id}/populate-from-articles`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      console.error("Failed to populate table:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading table...</div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Table not found</p>
      </div>
    );
  }

  if (viewingArticleId) {
    return (
      <ArticleDetailView
        articleId={viewingArticleId}
        projectId={projectId || ""}
        isStudentPortal={isStudentPortal}
        searchQuery={externalSearchQuery || searchQuery}
        onSelectArticle={(nextArticleId) => setViewingArticleId(nextArticleId)}
        onBack={() => setViewingArticleId(null)}
      />
    );
  }

  // Filter rows based on search query (external from parent search bar takes priority)
  const activeQuery = externalSearchQuery || searchQuery;
  const filteredRows = activeQuery
    ? table.rows.filter((row) =>
        Object.values(row.rowData).some((value) =>
          String(value).toLowerCase().includes(activeQuery.toLowerCase()),
        ),
      )
    : table.rows;

  // Pagination
  const totalPages = table.isPaginated
    ? Math.ceil(filteredRows.length / itemsPerPage)
    : 1;
  const paginatedRows = table.isPaginated
    ? filteredRows.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage,
      )
    : filteredRows;

  const sortedColumns = [...table.columns].sort((a, b) => a.order - b.order);

  const isTruthyNewValue = (value: any): boolean => {
    if (value === true || value === "Yes" || value === "yes") return true;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return (
        normalized === "true" || normalized === "yes" || normalized === "1"
      );
    }
    return value === 1;
  };

  const rowHasNewTag = (row: TableRow): boolean => {
    const entries = Object.entries(row.rowData || {});
    return entries.some(([key, value]) => {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
      const isNewField =
        normalizedKey === "shownewtag" ||
        normalizedKey === "new" ||
        normalizedKey.includes("newtag");
      return isNewField && isTruthyNewValue(value);
    });
  };

  const renderCellContent = (
    column: TableColumn,
    value: any,
    row: TableRow,
  ) => {
    if (!value || value === "N/A") {
      return <span className="text-gray-400 italic">N/A</span>;
    }

    // Handle showNewTag field - render as badge instead of text
    if (
      column.columnName.toLowerCase().includes("new") ||
      column.articleFieldMapping?.includes("showNewTag") ||
      value === "Yes" ||
      value === "No" ||
      value === true ||
      value === false
    ) {
      if (value === "Yes" || value === true) {
        return (
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-md bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg animate-pulse">
            🔥 NEW
          </span>
        );
      } else if (value === "No" || value === false) {
        return <span className="text-gray-400 text-xs">—</span>;
      }
    }

    // Auto-detect URLs even if column type is 'text'
    const isUrl =
      typeof value === "string" &&
      (value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("www.") ||
        value.startsWith("/kb"));

    // Special handling for columns named 'View', 'Download', 'Link', 'URL', etc.
    const isLinkColumn = column.columnName
      .toLowerCase()
      .match(/view|download|link|url|open/);

    // If it's a URL or looks like a link column with a URL value, render as link
    if (
      (column.columnType === "url" || isUrl || (isLinkColumn && isUrl)) &&
      typeof value === "string"
    ) {
      // Check if this is a KB article link (contains article ID)
      const isKBArticle = value.includes("/kb/") || row._id;
      const isExternalUrl = value.startsWith("http");

      if (isKBArticle && row._id) {
        // Open in full-page article detail view under dashboard layout
        return (
          <button
            onClick={() => setViewingArticleId(row._id)}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
          >
            <ExternalLink size={16} />
            <span>
              {column.columnName.toLowerCase().includes("download")
                ? "Download"
                : "View"}
            </span>
          </button>
        );
      } else if (isExternalUrl) {
        // Open external URLs in new tab
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:text-green-800 flex items-center gap-1 hover:underline"
          >
            <ExternalLink size={16} />
            <span>External Link</span>
          </a>
        );
      } else {
        // Default link behavior
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
          >
            <ExternalLink size={16} />
            <span>
              {column.columnName.toLowerCase().includes("download")
                ? "Download"
                : "View"}
            </span>
          </a>
        );
      }
    }

    switch (column.columnType) {
      case "file":
        return (
          <a
            href={value}
            download
            style={{
              color: "#027A48",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            <Download size={15} />
            <span>Download</span>
          </a>
        );
      case "date":
        return (
          <span style={{ color: "#344054", fontSize: "13px" }}>
            {new Date(value).toLocaleDateString()}
          </span>
        );
      case "number":
        return (
          <span style={{ fontWeight: 600, color: "#101828", fontSize: "13px" }}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </span>
        );
      default:
        return (
          <span style={{ color: "#344054", fontSize: "13px" }}>{value}</span>
        );
    }
  };

  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        border: "1px solid #E4E7EC",
        boxShadow: "0 1px 3px rgba(0,0,0,.06)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      {showHeader && (
        <div
          style={{ padding: "18px 20px", borderBottom: "1px solid #E4E7EC" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "4px",
                }}
              >
                <Table size={22} style={{ color: "#7F56D9", flexShrink: 0 }} />
                <h2
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#101828",
                  }}
                >
                  {table.tableName}
                </h2>
              </div>
              {table.description && (
                <p style={{ margin: 0, fontSize: "13px", color: "#667085" }}>
                  {table.description}
                </p>
              )}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                style={{
                  padding: "6px",
                  borderRadius: "50%",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#667085",
                }}
              >
                <X size={20} />
              </button>
            )}
          </div>
          {table.isSearchable && !useGlobalSearchOnly && (
            <div style={{ marginTop: "12px", position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9CA3AF",
                }}
              >
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search table..."
                style={{
                  width: "100%",
                  paddingLeft: "34px",
                  paddingRight: "12px",
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
          )}
        </div>
      )}

      {/* Search when header hidden */}
      {!showHeader && table.isSearchable && !useGlobalSearchOnly && (
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #E4E7EC",
            background: "#F9FAFB",
          }}
        >
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9CA3AF",
              }}
            >
              <Search size={16} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search in table..."
              style={{
                width: "100%",
                paddingLeft: "34px",
                paddingRight: "12px",
                paddingTop: "9px",
                paddingBottom: "9px",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                background: "white",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      )}

      {/* Tile View */}
      {table.displayStyle === "tiles" ? (
        <div style={{ padding: "20px", background: "#F8F9FC" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "14px",
            }}
          >
            {paginatedRows.length === 0 ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  padding: "48px 24px",
                  color: "#667085",
                  fontSize: "14px",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>📋</div>
                <p style={{ margin: 0 }}>
                  {searchQuery ? "No results found" : "No data available"}
                </p>
              </div>
            ) : (
              paginatedRows.map((row) => (
                <div
                  key={row._id}
                  style={{
                    background: "white",
                    borderRadius: "12px",
                    border: "1px solid #E4E7EC",
                    padding: "18px",
                    boxShadow: "0 1px 3px rgba(0,0,0,.06)",
                    borderLeft: rowHasNewTag(row)
                      ? "3px solid #7F56D9"
                      : "1px solid #E4E7EC",
                  }}
                >
                  {rowHasNewTag(row) && (
                    <span
                      style={{
                        display: "inline-block",
                        marginBottom: "10px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: "#F4F3FF",
                        color: "#7F56D9",
                      }}
                    >
                      NEW
                    </span>
                  )}
                  {sortedColumns.map((column) => (
                    <div
                      key={column.columnName}
                      style={{ marginBottom: "10px" }}
                    >
                      <div
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "#667085",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: "4px",
                        }}
                      >
                        {column.columnName}
                      </div>
                      <div style={{ fontSize: "13px", color: "#101828" }}>
                        {renderCellContent(
                          column,
                          row.rowData[column.columnName],
                          row,
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Table View */
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "#F9FAFB",
                  borderBottom: "2px solid #E4E7EC",
                }}
              >
                {table.showSerialNumber && (
                  <th
                    style={{
                      padding: "12px 16px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#667085",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      borderRight: "1px solid #E4E7EC",
                    }}
                  >
                    Sr.
                  </th>
                )}
                {sortedColumns.map((column, idx) => (
                  <th
                    key={column.columnName}
                    style={{
                      padding: "12px 16px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#667085",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      borderRight:
                        idx < sortedColumns.length - 1
                          ? "1px solid #E4E7EC"
                          : "none",
                    }}
                  >
                    {column.columnName}
                    {column.isRequired && (
                      <span style={{ color: "#DC2626", marginLeft: "2px" }}>
                        *
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      sortedColumns.length + (table.showSerialNumber ? 1 : 0)
                    }
                    style={{
                      padding: "48px 24px",
                      textAlign: "center",
                      color: "#667085",
                      fontSize: "14px",
                    }}
                  >
                    <div style={{ fontSize: "36px", marginBottom: "8px" }}>
                      📋
                    </div>
                    <p style={{ margin: 0 }}>
                      {searchQuery ? "No results found" : "No data available"}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => (
                  <tr
                    key={row._id}
                    style={{
                      borderBottom: "1px solid #F2F4F7",
                      background: rowHasNewTag(row) ? "#FAFBFF" : "white",
                      borderLeft: rowHasNewTag(row)
                        ? "3px solid #7F56D9"
                        : "3px solid transparent",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#F9FAFB")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = rowHasNewTag(row)
                        ? "#FAFBFF"
                        : "white")
                    }
                  >
                    {table.showSerialNumber && (
                      <td
                        style={{
                          padding: "12px 16px",
                          borderRight: "1px solid #F2F4F7",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "24px",
                              height: "24px",
                              borderRadius: "50%",
                              background: "#F4F3FF",
                              color: "#7F56D9",
                              fontSize: "11px",
                              fontWeight: 700,
                            }}
                          >
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </span>
                          {rowHasNewTag(row) && (
                            <span
                              style={{
                                padding: "2px 7px",
                                borderRadius: "6px",
                                fontSize: "10px",
                                fontWeight: 700,
                                background: "#F4F3FF",
                                color: "#7F56D9",
                              }}
                            >
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {sortedColumns.map((column, idx) => (
                      <td
                        key={column.columnName}
                        style={{
                          padding: "12px 16px",
                          borderRight:
                            idx < sortedColumns.length - 1
                              ? "1px solid #F2F4F7"
                              : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {!table.showSerialNumber &&
                            idx === 0 &&
                            rowHasNewTag(row) && (
                              <span
                                style={{
                                  padding: "2px 7px",
                                  borderRadius: "6px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  background: "#F4F3FF",
                                  color: "#7F56D9",
                                  flexShrink: 0,
                                }}
                              >
                                NEW
                              </span>
                            )}
                          {renderCellContent(
                            column,
                            row.rowData[column.columnName],
                            row,
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {table.isPaginated && totalPages > 1 && (
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #E4E7EC",
            background: "#F9FAFB",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "13px",
            color: "#667085",
          }}
        >
          <div>
            Showing {(currentPage - 1) * itemsPerPage + 1}–
            {Math.min(currentPage * itemsPerPage, filteredRows.length)} of{" "}
            {filteredRows.length} entries
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              style={{
                padding: "5px 12px",
                borderRadius: "6px",
                border: "1px solid #D1D5DB",
                background: currentPage === 1 ? "#F3F4F6" : "white",
                color: currentPage === 1 ? "#9CA3AF" : "#374151",
                fontSize: "13px",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
              }}
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum =
                totalPages <= 5
                  ? i + 1
                  : currentPage <= 3
                    ? i + 1
                    : currentPage >= totalPages - 2
                      ? totalPages - 4 + i
                      : currentPage - 2 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border:
                      currentPage === pageNum
                        ? "2px solid #7F56D9"
                        : "1px solid #D1D5DB",
                    background: currentPage === pageNum ? "#F4F3FF" : "white",
                    color: currentPage === pageNum ? "#7F56D9" : "#374151",
                    fontSize: "13px",
                    fontWeight: currentPage === pageNum ? 700 : 400,
                    cursor: "pointer",
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
              style={{
                padding: "5px 12px",
                borderRadius: "6px",
                border: "1px solid #D1D5DB",
                background: currentPage === totalPages ? "#F3F4F6" : "white",
                color: currentPage === totalPages ? "#9CA3AF" : "#374151",
                fontSize: "13px",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Footer info */}
      <div
        style={{
          padding: "10px 20px",
          borderTop: "1px solid #F2F4F7",
          background: "#F9FAFB",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "12px",
          color: "#9CA3AF",
        }}
      >
        <span>Total rows: {table.rows.length}</span>
        <span>Columns: {table.columns.length}</span>
      </div>
    </div>
  );
};

export default KBTableViewer;
