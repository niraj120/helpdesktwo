import React, { useState, useEffect, useRef } from "react";
import DashboardLayout from "./DashboardLayout";
import { API_CONFIG } from "../config/constants";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface ActivityLog {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  userName: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId?: string;
  entityName?: string;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  project?: {
    _id: string;
    name: string;
    code: string;
  };
  projectName?: string;
  role?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface CenterOption {
  _id: string;
  name: string;
}

interface ActivityLogsProps {
  wrapWithLayout?: boolean;
  /** When provided (portal context), locks the project filter to this ID */
  projectId?: string | null;
  /** Centers the current user has access to; when provided shows a center dropdown */
  centerOptions?: CenterOption[];
}

const ActivityLogs: React.FC<ActivityLogsProps> = ({
  wrapWithLayout = true,
  projectId: lockedProjectId,
  centerOptions,
}) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [exportLoading, setExportLoading] = useState<
    "csv" | "excel" | "pdf" | null
  >(null);

  // Filters
  const [filters, setFilters] = useState({
    action: "",
    entity: "",
    search: "",
    startDate: "",
    endDate: "",
    centerId: "",
  });

  // Separate local state for text inputs (debounced before updating filters)
  const [searchInput, setSearchInput] = useState("");
  const [entityInput, setEntityInput] = useState("");
  const [dateError, setDateError] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input → filters.search (350ms)
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput }));
      setPage(1);
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput]);

  // Debounce entity input → filters.entity (350ms)
  useEffect(() => {
    if (entityDebounceRef.current) clearTimeout(entityDebounceRef.current);
    entityDebounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, entity: entityInput }));
      setPage(1);
    }, 350);
    return () => {
      if (entityDebounceRef.current) clearTimeout(entityDebounceRef.current);
    };
  }, [entityInput]);

  useEffect(() => {
    fetchActivityLogs();
  }, [page, filters]);

  // Resolve the effective projectId: prop (portal context) takes priority over localStorage
  const resolveProjectId = (): string | null => {
    if (lockedProjectId) return lockedProjectId;
    try {
      const ctx = localStorage.getItem("projectContext");
      return ctx ? JSON.parse(ctx).projectId : null;
    } catch {
      return null;
    }
  };

  const buildFilterParams = (
    extra?: Record<string, string>,
  ): URLSearchParams => {
    const projectId = resolveProjectId();
    return new URLSearchParams({
      ...(filters.action && { action: filters.action }),
      ...(filters.entity && { entity: filters.entity }),
      ...(filters.search && { search: filters.search }),
      ...(filters.startDate && { startDate: filters.startDate }),
      ...(filters.endDate && { endDate: filters.endDate }),
      ...(filters.centerId && { centerId: filters.centerId }),
      ...(projectId && { projectId }),
      ...extra,
    });
  };

  const fetchActivityLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const params = buildFilterParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      const response = await fetch(
        `${API_CONFIG.API_URL}/activity-logs?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setLogs(data.data);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error("Error fetching activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    try {
      setExportLoading(format);
      const token = localStorage.getItem("authToken");
      const params = buildFilterParams();

      const response = await fetch(
        `${API_CONFIG.API_URL}/activity-logs/export?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) throw new Error("Export failed");
      const result = await response.json();
      const rows: ActivityLog[] = result.data || [];

      const fileName = `activity-logs-${new Date().toISOString().slice(0, 10)}`;

      if (format === "csv") {
        const header = [
          "Timestamp",
          "User",
          "Email",
          "Role",
          "Action",
          "Entity",
          "Entity Name",
          "Description",
          "IP Address",
          "Project",
        ];
        const csvRows = rows.map((r) =>
          [
            formatDate(r.timestamp),
            r.userName,
            r.userEmail,
            r.role || "",
            r.action,
            r.entity,
            r.entityName || "",
            r.description ? r.description.replace(/"/g, '""') : "",
            r.ipAddress || "",
            r.projectName || "",
          ]
            .map((v) => `"${v}"`)
            .join(","),
        );
        const csvContent = [header.join(","), ...csvRows].join("\n");
        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === "excel") {
        const wsData = [
          [
            "Timestamp",
            "User",
            "Email",
            "Role",
            "Action",
            "Entity",
            "Entity Name",
            "Description",
            "IP Address",
            "Project",
          ],
          ...rows.map((r) => [
            formatDate(r.timestamp),
            r.userName,
            r.userEmail,
            r.role || "",
            r.action,
            r.entity,
            r.entityName || "",
            r.description || "",
            r.ipAddress || "",
            r.projectName || "",
          ]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Activity Logs");
        XLSX.writeFile(wb, `${fileName}.xlsx`);
      } else if (format === "pdf") {
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(14);
        doc.text("Activity Logs", 14, 15);
        doc.setFontSize(9);
        doc.text(
          `Exported: ${new Date().toLocaleString()}  |  Total records: ${rows.length}`,
          14,
          22,
        );
        autoTable(doc, {
          startY: 28,
          head: [
            [
              "Timestamp",
              "User",
              "Action",
              "Entity",
              "Entity Name",
              "Description",
              "IP Address",
              "Project",
            ],
          ],
          body: rows.map((r) => [
            formatDate(r.timestamp),
            `${r.userName}\n${r.userEmail}`,
            r.action.toUpperCase(),
            r.entity,
            r.entityName || "-",
            r.description ? r.description.substring(0, 80) : "-",
            r.ipAddress || "-",
            r.projectName || "-",
          ]),
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [124, 58, 237] },
          columnStyles: { 1: { cellWidth: 35 }, 5: { cellWidth: 40 } },
        });
        doc.save(`${fileName}.pdf`);
      }
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setExportLoading(null);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filtering
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  };

  const formatDisplayText = (text: string) => {
    if (!text) return text;
    return text.replace(/ticket/gi, "query").replace(/Ticket/g, "Query");
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      create: "#10b981",
      update: "#3b82f6",
      edit: "#3b82f6",
      delete: "#ef4444",
    };
    return colors[action] || "#6b7280";
  };

  const totalPages = Math.ceil(total / limit);

  const loadingContent = (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <div>Loading activity logs...</div>
    </div>
  );

  if (loading && logs.length === 0) {
    if (wrapWithLayout) {
      return <DashboardLayout>{loadingContent}</DashboardLayout>;
    }
    return loadingContent;
  }

  const mainContent = (
    <div style={{ padding: "32px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: 600 }}
          >
            Activity Logs
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
            Track all CRUD operations: create, update, edit, and delete actions
            across the system
          </p>
          {/* Context badges when in portal/project context */}
          {lockedProjectId && (
            <div
              style={{
                marginTop: "8px",
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 10px",
                  backgroundColor: "#ede9fe",
                  color: "#7c3aed",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                🏢 Filtered by your project
              </span>
              {filters.centerId && centerOptions && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "3px 10px",
                    backgroundColor: "#d1fae5",
                    color: "#065f46",
                    borderRadius: "9999px",
                    fontSize: "12px",
                    fontWeight: 500,
                  }}
                >
                  📍{" "}
                  {centerOptions.find((c) => c._id === filters.centerId)
                    ?.name || "Center filtered"}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={() => handleExport("csv")}
            disabled={exportLoading !== null}
            style={{
              padding: "8px 14px",
              backgroundColor: exportLoading === "csv" ? "#d1fae5" : "#ecfdf5",
              color: "#065f46",
              border: "1px solid #6ee7b7",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: exportLoading !== null ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {exportLoading === "csv" ? "Exporting..." : "⬇ CSV"}
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={exportLoading !== null}
            style={{
              padding: "8px 14px",
              backgroundColor:
                exportLoading === "excel" ? "#dbeafe" : "#eff6ff",
              color: "#1e40af",
              border: "1px solid #93c5fd",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: exportLoading !== null ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {exportLoading === "excel" ? "Exporting..." : "⬇ Excel"}
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exportLoading !== null}
            style={{
              padding: "8px 14px",
              backgroundColor: exportLoading === "pdf" ? "#fce7f3" : "#fdf2f8",
              color: "#9d174d",
              border: "1px solid #f9a8d4",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: exportLoading !== null ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {exportLoading === "pdf" ? "Exporting..." : "⬇ PDF"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              Search
            </label>
            <input
              type="text"
              placeholder="User, entity, description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              Action
            </label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange("action", e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              Entity
            </label>
            <input
              type="text"
              placeholder="query, user, project..."
              value={entityInput}
              onChange={(e) => setEntityInput(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              Start Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                const val = e.target.value;
                setDateError("");
                // Clear end date if it's now before the new start date
                if (filters.endDate && filters.endDate < val) {
                  handleFilterChange("endDate", "");
                }
                handleFilterChange("startDate", val);
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              End Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              disabled={!filters.startDate}
              min={filters.startDate || undefined}
              onClick={() => {
                if (!filters.startDate) {
                  setDateError("Please select a Start Date first.");
                }
              }}
              onChange={(e) => {
                const val = e.target.value;
                if (filters.startDate && val < filters.startDate) {
                  setDateError("End Date cannot be before Start Date.");
                } else {
                  setDateError("");
                  handleFilterChange("endDate", val);
                }
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: `1px solid ${dateError ? "#ef4444" : "#d1d5db"}`,
                borderRadius: "6px",
                fontSize: "14px",
                backgroundColor: !filters.startDate ? "#f9fafb" : "white",
                cursor: !filters.startDate ? "not-allowed" : "pointer",
              }}
            />
            {dateError && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "12px",
                  color: "#ef4444",
                }}
              >
                {dateError}
              </p>
            )}
          </div>

          {/* Center filter — shown only when centerOptions available (portal context) */}
          {centerOptions && centerOptions.length > 0 && (
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Center
              </label>
              <select
                value={filters.centerId}
                onChange={(e) => handleFilterChange("centerId", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              >
                <option value="">All Centers</option>
                {centerOptions.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={() => {
                setSearchInput("");
                setEntityInput("");
                setDateError("");
                setFilters({
                  action: "",
                  entity: "",
                  search: "",
                  startDate: "",
                  endDate: "",
                  centerId: "",
                });
                setPage(1);
              }}
              style={{
                padding: "8px 16px",
                backgroundColor: "#f3f4f6",
                color: "#374151",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "20px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{ fontSize: "13px", color: "#6b7280", marginBottom: "4px" }}
          >
            Total Logs
          </div>
          <div style={{ fontSize: "28px", fontWeight: 600, color: "#1f2937" }}>
            {total.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "60px 20px",
            textAlign: "center",
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
          <h3
            style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 600 }}
          >
            No Activity Logs Found
          </h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
            {filters.search || filters.action || filters.entity
              ? "Try adjusting your filters"
              : "Activity logs will appear here as users perform actions"}
          </p>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ backgroundColor: "#f9fafb" }}>
                <tr>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    TIMESTAMP
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    USER
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    ACTION
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    ENTITY
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    DESCRIPTION
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    IP ADDRESS
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => (
                  <tr
                    key={log._id}
                    style={{
                      backgroundColor: index % 2 === 0 ? "white" : "#f9fafb",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "#f3f4f6")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        index % 2 === 0 ? "white" : "#f9fafb")
                    }
                  >
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        color: "#374151",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {formatDate(log.timestamp)}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontWeight: 500, color: "#1f2937" }}>
                        {log.userName}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>
                        {log.userEmail}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          backgroundColor: `${getActionColor(log.action)}20`,
                          color: getActionColor(log.action),
                          textTransform: "uppercase",
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontWeight: 500, color: "#1f2937" }}>
                        {formatDisplayText(log.entity)}
                      </div>
                      {log.entityName && (
                        <div style={{ fontSize: "12px", color: "#6b7280" }}>
                          {log.entityName}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        color: "#6b7280",
                        borderBottom: "1px solid #e5e7eb",
                        maxWidth: "300px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {log.description
                        ? formatDisplayText(log.description)
                        : "-"}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        color: "#6b7280",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {log.ipAddress ?? "-"}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        textAlign: "center",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <button
                        onClick={() => setSelectedLog(log)}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#ede9fe",
                          color: "#7c3aed",
                          border: "none",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: "14px", color: "#6b7280" }}>
              Showing {(page - 1) * limit + 1} to{" "}
              {Math.min(page * limit, total)} of {total} logs
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: "6px 12px",
                  backgroundColor: page === 1 ? "#f3f4f6" : "white",
                  color: page === 1 ? "#9ca3af" : "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                }}
              >
                Previous
              </button>
              <div
                style={{
                  padding: "6px 12px",
                  fontSize: "14px",
                  color: "#374151",
                }}
              >
                Page {page} of {totalPages}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: "6px 12px",
                  backgroundColor: page === totalPages ? "#f3f4f6" : "white",
                  color: page === totalPages ? "#9ca3af" : "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
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
            padding: "20px",
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "700px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                margin: "0 0 24px 0",
                fontSize: "20px",
                fontWeight: 600,
              }}
            >
              Activity Log Details
            </h2>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginBottom: "4px",
                    fontWeight: 500,
                  }}
                >
                  Timestamp
                </div>
                <div style={{ fontSize: "14px", color: "#1f2937" }}>
                  {formatDate(selectedLog.timestamp)}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginBottom: "4px",
                    fontWeight: 500,
                  }}
                >
                  User
                </div>
                <div style={{ fontSize: "14px", color: "#1f2937" }}>
                  {selectedLog.userName} ({selectedLog.userEmail})
                </div>
                {selectedLog.role && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginTop: "2px",
                    }}
                  >
                    Role: {selectedLog.role}
                  </div>
                )}
              </div>

              <div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginBottom: "4px",
                    fontWeight: 500,
                  }}
                >
                  Action
                </div>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor: `${getActionColor(selectedLog.action)}20`,
                    color: getActionColor(selectedLog.action),
                    textTransform: "uppercase",
                    display: "inline-block",
                  }}
                >
                  {selectedLog.action}
                </span>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginBottom: "4px",
                    fontWeight: 500,
                  }}
                >
                  Entity
                </div>
                <div style={{ fontSize: "14px", color: "#1f2937" }}>
                  {formatDisplayText(selectedLog.entity)}
                  {selectedLog.entityId && (
                    <span style={{ color: "#6b7280" }}>
                      {" "}
                      (ID: {selectedLog.entityId})
                    </span>
                  )}
                </div>
                {selectedLog.entityName && (
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#6b7280",
                      marginTop: "2px",
                    }}
                  >
                    {selectedLog.entityName}
                  </div>
                )}
              </div>

              {selectedLog.description && (
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginBottom: "4px",
                      fontWeight: 500,
                    }}
                  >
                    Description
                  </div>
                  <div style={{ fontSize: "14px", color: "#1f2937" }}>
                    {formatDisplayText(selectedLog.description)}
                  </div>
                </div>
              )}

              {selectedLog.changes && selectedLog.changes.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginBottom: "8px",
                      fontWeight: 500,
                    }}
                  >
                    Changes Made
                  </div>
                  <div
                    style={{
                      backgroundColor: "#f9fafb",
                      borderRadius: "6px",
                      padding: "12px",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {selectedLog.changes.map((change, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom:
                            idx < selectedLog.changes!.length - 1 ? "12px" : 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 500,
                            color: "#1f2937",
                            marginBottom: "4px",
                          }}
                        >
                          {change.field}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            fontSize: "13px",
                          }}
                        >
                          <span style={{ color: "#ef4444" }}>
                            {JSON.stringify(change.oldValue)}
                          </span>
                          <span style={{ color: "#6b7280" }}>→</span>
                          <span style={{ color: "#10b981" }}>
                            {JSON.stringify(change.newValue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginBottom: "4px",
                      fontWeight: 500,
                    }}
                  >
                    IP Address
                  </div>
                  <div style={{ fontSize: "14px", color: "#1f2937" }}>
                    {selectedLog.ipAddress || "N/A"}
                  </div>
                </div>

                {selectedLog.projectName && (
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginBottom: "4px",
                        fontWeight: 500,
                      }}
                    >
                      Project
                    </div>
                    <div style={{ fontSize: "14px", color: "#1f2937" }}>
                      {selectedLog.projectName}
                    </div>
                  </div>
                )}
              </div>

              {selectedLog.userAgent && (
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginBottom: "4px",
                      fontWeight: 500,
                    }}
                  >
                    User Agent
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      backgroundColor: "#f9fafb",
                      padding: "8px",
                      borderRadius: "4px",
                      wordBreak: "break-all",
                    }}
                  >
                    {selectedLog.userAgent}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: "24px", textAlign: "right" }}>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#7c3aed",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (wrapWithLayout) {
    return <DashboardLayout>{mainContent}</DashboardLayout>;
  }

  return mainContent;
};

export default ActivityLogs;
