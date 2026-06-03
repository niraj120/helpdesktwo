import React, { useState, useEffect } from "react";
import DashboardLayout from "./DashboardLayout";
import { API_CONFIG } from "../config/constants";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface AccessLog {
  _id: string;
  userId?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  userName?: string;
  userEmail: string;
  action:
    | "login"
    | "logout"
    | "login_failed"
    | "password_reset"
    | "forgot_password"
    | "session_expired";
  success: boolean;
  failureReason?: string;
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
  sessionDuration?: number;
}

interface AccessLogsProps {
  wrapWithLayout?: boolean;
}

const AccessLogs: React.FC<AccessLogsProps> = ({ wrapWithLayout = true }) => {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [successfulLogins, setSuccessfulLogins] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AccessLog | null>(null);
  const [dateError, setDateError] = useState("");
  const [exportLoading, setExportLoading] = useState<
    "csv" | "excel" | "pdf" | null
  >(null);

  // Filters
  const [filters, setFilters] = useState({
    action: "",
    success: "",
    search: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    fetchAccessLogs();
  }, [page, filters]);

  // Fetch overall stats whenever date filters change (independent of page)
  useEffect(() => {
    fetchStats();
  }, [filters.startDate, filters.endDate]);

  const fetchAccessLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");

      // Get projectId if in project portal context
      const projectContextStr = localStorage.getItem("projectContext");
      const projectId = projectContextStr
        ? JSON.parse(projectContextStr).projectId
        : null;

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.success && { success: filters.success }),
        ...(filters.search && { search: filters.search }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(projectId && { projectId: projectId }),
      });

      const response = await fetch(
        `${API_CONFIG.API_URL}/access-logs?${params}`,
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
      console.error("Error fetching access logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const projectContextStr = localStorage.getItem("projectContext");
      const projectId = projectContextStr
        ? JSON.parse(projectContextStr).projectId
        : null;

      const params = new URLSearchParams({
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(projectId && { projectId }),
      });

      const response = await fetch(
        `${API_CONFIG.API_URL}/access-logs/stats?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        const loginStats: { _id: boolean; count: number }[] =
          data.data.loginStats || [];
        const failureStats: { _id: string; count: number }[] =
          data.data.failureStats || [];

        const successEntry = loginStats.find((s) => s._id === true);
        setSuccessfulLogins(successEntry ? successEntry.count : 0);

        const totalFailed = failureStats.reduce((sum, s) => sum + s.count, 0);
        setFailedAttempts(totalFailed);
      }
    } catch (error) {
      console.error("Error fetching access stats:", error);
    }
  };

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    try {
      setExportLoading(format);
      const token = localStorage.getItem("authToken");
      const projectContextStr = localStorage.getItem("projectContext");
      const projectId = projectContextStr
        ? JSON.parse(projectContextStr).projectId
        : null;

      const params = new URLSearchParams({
        ...(filters.action && { action: filters.action }),
        ...(filters.success && { success: filters.success }),
        ...(filters.search && { search: filters.search }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(projectId && { projectId }),
      });

      const response = await fetch(
        `${API_CONFIG.API_URL}/access-logs/export?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) throw new Error("Export failed");
      const result = await response.json();
      const rows: AccessLog[] = result.data || [];

      const fileName = `access-logs-${new Date().toISOString().slice(0, 10)}`;

      if (format === "csv") {
        const header = [
          "Timestamp",
          "User",
          "Email",
          "Role",
          "Action",
          "Status",
          "Failure Reason",
          "IP Address",
          "Project",
        ];
        const csvRows = rows.map((r) =>
          [
            formatDate(r.timestamp),
            r.userName || "Unknown",
            r.userEmail,
            r.role || "",
            r.action,
            r.success ? "Success" : "Failed",
            r.failureReason ? r.failureReason.replace(/"/g, '""') : "",
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
            "Status",
            "Failure Reason",
            "IP Address",
            "Project",
          ],
          ...rows.map((r) => [
            formatDate(r.timestamp),
            r.userName || "Unknown",
            r.userEmail,
            r.role || "",
            r.action,
            r.success ? "Success" : "Failed",
            r.failureReason || "",
            r.ipAddress || "",
            r.projectName || "",
          ]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Access Logs");
        XLSX.writeFile(wb, `${fileName}.xlsx`);
      } else if (format === "pdf") {
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(14);
        doc.text("Access Logs", 14, 15);
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
              "Status",
              "Failure Reason",
              "IP Address",
              "Project",
            ],
          ],
          body: rows.map((r) => [
            formatDate(r.timestamp),
            `${r.userName || "Unknown"}\n${r.userEmail}`,
            r.action.replace(/_/g, " ").toUpperCase(),
            r.success ? "Success" : "Failed",
            r.failureReason || "-",
            r.ipAddress || "-",
            r.projectName || "-",
          ]),
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [124, 58, 237] },
          columnStyles: { 1: { cellWidth: 40 }, 4: { cellWidth: 40 } },
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

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "N/A";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      login: "#10b981",
      logout: "#6b7280",
      login_failed: "#ef4444",
      forgot_password: "#f59e0b",
      password_reset: "#f59e0b",
      session_expired: "#ef4444",
    };
    return colors[action] || "#6b7280";
  };

  const totalPages = Math.ceil(total / limit);

  const loadingContent = (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <div>Loading access logs...</div>
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
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: 600 }}
          >
            Access Logs
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
            Track all authentication events: login, logout, and forgot password
            attempts
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          {(["csv", "excel", "pdf"] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => handleExport(fmt)}
              disabled={exportLoading !== null}
              style={{
                padding: "8px 14px",
                backgroundColor:
                  exportLoading === fmt
                    ? "#e5e7eb"
                    : fmt === "pdf"
                      ? "#fef2f2"
                      : fmt === "excel"
                        ? "#f0fdf4"
                        : "#eff6ff",
                color:
                  exportLoading === fmt
                    ? "#9ca3af"
                    : fmt === "pdf"
                      ? "#dc2626"
                      : fmt === "excel"
                        ? "#16a34a"
                        : "#2563eb",
                border: `1px solid ${fmt === "pdf" ? "#fecaca" : fmt === "excel" ? "#bbf7d0" : "#bfdbfe"}`,
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: exportLoading !== null ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              {exportLoading === fmt
                ? "..."
                : fmt === "csv"
                  ? "⬇ CSV"
                  : fmt === "excel"
                    ? "⬇ Excel"
                    : "⬇ PDF"}
            </button>
          ))}
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
              placeholder="User, email, IP..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
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
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="login_failed">Login Failed</option>
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
              Status
            </label>
            <select
              value={filters.success}
              onChange={(e) => handleFilterChange("success", e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            >
              <option value="">All</option>
              <option value="true">Success</option>
              <option value="false">Failed</option>
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
              Start Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                const val = e.target.value;
                setDateError("");
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

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={() => {
                setDateError("");
                setFilters({
                  action: "",
                  success: "",
                  search: "",
                  startDate: "",
                  endDate: "",
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
            Successful Logins
          </div>
          <div style={{ fontSize: "28px", fontWeight: 600, color: "#10b981" }}>
            {successfulLogins.toLocaleString()}
          </div>
        </div>

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
            Failed Attempts
          </div>
          <div style={{ fontSize: "28px", fontWeight: 600, color: "#ef4444" }}>
            {failedAttempts.toLocaleString()}
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
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔐</div>
          <h3
            style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 600 }}
          >
            No Access Logs Found
          </h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
            {filters.search || filters.action || filters.success
              ? "Try adjusting your filters"
              : "Access logs will appear here as users log in and out"}
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
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    STATUS
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
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    PROJECT
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
                        {log.userName || "Unknown"}
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
                        {log.action.replace("_", " ")}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        textAlign: "center",
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
                          backgroundColor: log.success ? "#dcfce7" : "#fee2e2",
                          color: log.success ? "#166534" : "#991b1b",
                        }}
                      >
                        {log.success ? "Success" : "Failed"}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        color: "#6b7280",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {log.ipAddress || "-"}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: "13px",
                        color: "#6b7280",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      {log.projectName || "N/A"}
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
              maxWidth: "600px",
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
              Access Log Details
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
                  {selectedLog.userName || "Unknown"} ({selectedLog.userEmail})
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
                  {selectedLog.action.replace("_", " ")}
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
                  Status
                </div>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor: selectedLog.success
                      ? "#dcfce7"
                      : "#fee2e2",
                    color: selectedLog.success ? "#166534" : "#991b1b",
                    display: "inline-block",
                  }}
                >
                  {selectedLog.success ? "Success" : "Failed"}
                </span>
              </div>

              {!selectedLog.success && selectedLog.failureReason && (
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      marginBottom: "4px",
                      fontWeight: 500,
                    }}
                  >
                    Failure Reason
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#ef4444",
                      backgroundColor: "#fee2e2",
                      padding: "8px 12px",
                      borderRadius: "6px",
                    }}
                  >
                    {selectedLog.failureReason}
                  </div>
                </div>
              )}

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

                {selectedLog.action === "logout" &&
                  selectedLog.sessionDuration && (
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginBottom: "4px",
                          fontWeight: 500,
                        }}
                      >
                        Session Duration
                      </div>
                      <div style={{ fontSize: "14px", color: "#1f2937" }}>
                        {formatDuration(selectedLog.sessionDuration)}
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

export default AccessLogs;
