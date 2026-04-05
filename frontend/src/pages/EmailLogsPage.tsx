import { useState, useEffect } from "react";
import DashboardLayout from "../components/DashboardLayout";
import ModuleHeader from "../components/ModuleHeader";
import axios from "axios";
import DOMPurify from "dompurify";
import API_BASE_URL from "../config/api";

interface EmailLog {
  _id: string;
  projectId?: {
    _id: string;
    name: string;
    code: string;
  };
  projectName?: string;
  recipient: string;
  subject: string;
  body?: string;
  type:
    | "otp"
    | "ticket_created"
    | "student_welcome"
    | "password_reset"
    | "ticket_update"
    | "other";
  status: "sent" | "failed" | "blocked" | "simulated";
  error?: string;
  metadata?: any;
  smtpHost?: string;
  fromEmail?: string;
  vendor?: string;
  sentAt: string;
}

interface IncomingEmail {
  _id: string;
  ticketId: {
    _id: string;
    ticketNumber: string;
    title: string;
    status: string;
    projectId?: { _id: string; name: string };
  };
  projectName?: string;
  direction: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  htmlBody?: string;
  messageId: string;
  isProcessed: boolean;
  processingError?: string;
  inboundSource?: string;
  receivedAt: string;
  createdAt: string;
}

interface Statistics {
  total: number;
  sent?: number;
  failed?: number;
  blocked?: number;
  simulated?: number;
  processed?: number;
  pending?: number;
}

const EmailLogsPage = () => {
  const [activeTab, setActiveTab] = useState<"outgoing" | "incoming">(
    "outgoing",
  );
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [incomingEmails, setIncomingEmails] = useState<IncomingEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics>({
    total: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    simulated: 0,
  });
  const [incomingStats, setIncomingStats] = useState<Statistics>({
    total: 0,
    processed: 0,
    failed: 0,
    pending: 0,
  });
  const [filters, setFilters] = useState({
    status: "",
    type: "",
    recipient: "",
    page: 1,
    limit: 50,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1,
  });
  const [selectedLog, setSelectedLog] = useState<
    EmailLog | IncomingEmail | null
  >(null);

  // Type guard to check if log is EmailLog
  const isEmailLog = (log: EmailLog | IncomingEmail): log is EmailLog => {
    return "status" in log && "recipient" in log && "sentAt" in log;
  };

  useEffect(() => {
    if (activeTab === "outgoing") {
      fetchEmailLogs();
    } else {
      fetchIncomingEmails();
    }
  }, [filters, activeTab]);

  const fetchEmailLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const params = new URLSearchParams();

      if (filters.status) params.append("status", filters.status);
      if (filters.type) params.append("type", filters.type);
      if (filters.recipient) params.append("recipient", filters.recipient);
      params.append("page", filters.page.toString());
      params.append("limit", filters.limit.toString());

      const response = await axios.get(
        `${API_BASE_URL}/email-logs?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        setLogs(response.data.data.logs);
        setPagination(response.data.data.pagination);
        setStatistics(response.data.data.statistics);
      }
    } catch (error) {
      console.error("Error fetching email logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchIncomingEmails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const params = new URLSearchParams();

      if (filters.recipient) params.append("fromEmail", filters.recipient);
      params.append("page", filters.page.toString());
      params.append("limit", filters.limit.toString());

      const response = await axios.get(
        `${API_BASE_URL}/email-communications/incoming?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        setIncomingEmails(response.data.data);
        setPagination(response.data.pagination);
        setIncomingStats(response.data.statistics);
      }
    } catch (error) {
      console.error("Error fetching incoming emails:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent":
        return "#10b981";
      case "failed":
        return "#ef4444";
      case "blocked":
        return "#f59e0b";
      case "simulated":
        return "#6b7280";
      default:
        return "#6b7280";
    }
  };

  const getVendorInfo = (vendor?: string): { label: string; color: string } => {
    switch (vendor) {
      case "sendgrid": return { label: "SendGrid", color: "#6366f1" };
      case "graph":    return { label: "MS Graph", color: "#0078d4" };
      case "smtp":     return { label: "SMTP",     color: "#10b981" };
      case "simulated":return { label: "Simulated",color: "#6b7280" };
      default:         return { label: vendor || "—", color: "#9ca3af" };
    }
  };

  const getSourceInfo = (source?: string): { label: string; color: string } => {
    switch (source) {
      case "imap":     return { label: "IMAP",      color: "#10b981" };
      case "graph":    return { label: "Graph API", color: "#0078d4" };
      case "sendgrid": return { label: "SendGrid",  color: "#6366f1" };
      case "webhook":  return { label: "Webhook",   color: "#f59e0b" };
      default:         return { label: source || "—", color: "#9ca3af" };
    }
  };

  const getVendorBadge = (vendor?: string) => {
    const { label, color } = getVendorInfo(vendor);
    return (
      <span style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "600", background: `${color}18`, color, border: `1px solid ${color}40` }}>
        {label}
      </span>
    );
  };

  const getSourceBadge = (source?: string) => {
    const { label, color } = getSourceInfo(source);
    return (
      <span style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "600", background: `${color}18`, color, border: `1px solid ${color}40` }}>
        {label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    return (
      <span
        style={{
          padding: "4px 12px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: "500",
          background: `${getStatusColor(status)}20`,
          color: getStatusColor(status),
        }}
      >
        {status.toUpperCase()}
      </span>
    );
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <DashboardLayout>
      <div style={{ padding: "24px" }}>
        {/* Header */}
        <ModuleHeader
          title="Email Logs"
          subtitle="View all email activity and troubleshoot delivery issues"
        />

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "24px",
            borderBottom: "2px solid #e5e7eb",
          }}
        >
          <button
            onClick={() => setActiveTab("outgoing")}
            style={{
              padding: "12px 24px",
              background: activeTab === "outgoing" ? "#7c3aed" : "transparent",
              color: activeTab === "outgoing" ? "white" : "#6b7280",
              border: "none",
              borderRadius: "8px 8px 0 0",
              cursor: "pointer",
              fontWeight: "500",
              transition: "all 0.2s",
            }}
          >
            📤 Outgoing Emails (System Sent)
          </button>
          <button
            onClick={() => setActiveTab("incoming")}
            style={{
              padding: "12px 24px",
              background: activeTab === "incoming" ? "#7c3aed" : "transparent",
              color: activeTab === "incoming" ? "white" : "#6b7280",
              border: "none",
              borderRadius: "8px 8px 0 0",
              cursor: "pointer",
              fontWeight: "500",
              transition: "all 0.2s",
            }}
          >
            📥 Incoming Emails (Received)
          </button>
        </div>

        {/* Statistics Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {activeTab === "outgoing" ? (
            <>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Total Emails
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#111827",
                  }}
                >
                  {statistics.total}
                </div>
              </div>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  borderLeft: "4px solid #10b981",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Sent
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#10b981",
                  }}
                >
                  {statistics.sent}
                </div>
              </div>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  borderLeft: "4px solid #ef4444",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Failed
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#ef4444",
                  }}
                >
                  {statistics.failed}
                </div>
              </div>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  borderLeft: "4px solid #f59e0b",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Blocked
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#f59e0b",
                  }}
                >
                  {statistics.blocked}
                </div>
              </div>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  borderLeft: "4px solid #6b7280",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Simulated
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#6b7280",
                  }}
                >
                  {statistics.simulated}
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Total Received
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#111827",
                  }}
                >
                  {incomingStats.total}
                </div>
              </div>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  borderLeft: "4px solid #10b981",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Processed
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#10b981",
                  }}
                >
                  {incomingStats.processed}
                </div>
              </div>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  borderLeft: "4px solid #f59e0b",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Pending
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#f59e0b",
                  }}
                >
                  {incomingStats.pending}
                </div>
              </div>
              <div
                style={{
                  background: "white",
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  borderLeft: "4px solid #ef4444",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Failed
                </div>
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "700",
                    color: "#ef4444",
                  }}
                >
                  {incomingStats.failed}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Filters */}
        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            marginBottom: "24px",
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
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "8px",
                }}
              >
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value, page: 1 })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              >
                <option value="">All</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="blocked">Blocked</option>
                <option value="simulated">Simulated</option>
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "8px",
                }}
              >
                Type
              </label>
              <select
                value={filters.type}
                onChange={(e) =>
                  setFilters({ ...filters, type: e.target.value, page: 1 })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              >
                <option value="">All Types</option>
                <option value="otp">OTP</option>
                <option value="ticket_created">Ticket Created</option>
                <option value="student_welcome">Student Welcome</option>
                <option value="password_reset">Password Reset</option>
                <option value="ticket_update">Ticket Update</option>
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  marginBottom: "8px",
                }}
              >
                Recipient
              </label>
              <input
                type="text"
                placeholder="Search by email..."
                value={filters.recipient}
                onChange={(e) =>
                  setFilters({ ...filters, recipient: e.target.value, page: 1 })
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
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={() =>
                  setFilters({
                    status: "",
                    type: "",
                    recipient: "",
                    page: 1,
                    limit: 50,
                  })
                }
                style={{
                  padding: "8px 16px",
                  background: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div
          style={{
            background: "white",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          {loading ? (
            <div
              style={{ padding: "48px", textAlign: "center", color: "#6b7280" }}
            >
              Loading email logs...
            </div>
          ) : activeTab === "outgoing" && logs.length === 0 ? (
            <div
              style={{ padding: "48px", textAlign: "center", color: "#6b7280" }}
            >
              No outgoing email logs found
            </div>
          ) : activeTab === "incoming" && incomingEmails.length === 0 ? (
            <div
              style={{ padding: "48px", textAlign: "center", color: "#6b7280" }}
            >
              No incoming emails found
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      background: "#f9fafb",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                      }}
                    >
                      DATE
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                      }}
                    >
                      {activeTab === "outgoing" ? "RECIPIENT" : "FROM"}
                    </th>
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                      }}
                    >
                      SUBJECT
                    </th>
                    {activeTab === "outgoing" ? (
                      <>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          TYPE
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          STATUS
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          DELIVERY
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          PROJECT
                        </th>
                      </>
                    ) : (
                      <>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          TO
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          PROJECT NAME
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          TICKET #
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          STATUS
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                          }}
                        >
                          SOURCE
                        </th>
                      </>
                    )}
                    <th
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                      }}
                    >
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeTab === "outgoing"
                    ? logs.map((log) => (
                        <tr
                          key={log._id}
                          style={{ borderBottom: "1px solid #e5e7eb" }}
                        >
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {formatDate(log.sentAt)}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {log.recipient}
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              fontSize: "14px",
                              maxWidth: "300px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {log.subject}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            <span style={{ textTransform: "capitalize" }}>
                              {log.type.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {getStatusBadge(log.status)}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {getVendorBadge(log.vendor)}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {log.projectName || "-"}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            <button
                              onClick={() => setSelectedLog(log)}
                              style={{
                                padding: "4px 12px",
                                background: "#3b82f6",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))
                    : incomingEmails.map((email) => (
                        <tr
                          key={email._id}
                          style={{ borderBottom: "1px solid #e5e7eb" }}
                        >
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {formatDate(email.receivedAt || email.createdAt)}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {email.fromEmail}
                          </td>
                          <td
                            style={{
                              padding: "12px 16px",
                              fontSize: "14px",
                              maxWidth: "200px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {email.subject}
                          </td>
                          {/* TO column */}
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {email.toEmail || "-"}
                          </td>
                          {/* PROJECT NAME column */}
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {email.projectName ||
                              email.ticketId?.projectId?.name ||
                              "-"}
                          </td>
                          {/* TICKET # column */}
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {email.ticketId ? (
                              <a
                                href={`/tickets/${email.ticketId._id}`}
                                style={{
                                  color: "#3b82f6",
                                  textDecoration: "none",
                                }}
                              >
                                #{email.ticketId.ticketNumber}
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {email.isProcessed ? (
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  fontWeight: "500",
                                  background: "#10b98120",
                                  color: "#10b981",
                                }}
                              >
                                PROCESSED
                              </span>
                            ) : email.processingError ? (
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  fontWeight: "500",
                                  background: "#ef444420",
                                  color: "#ef4444",
                                }}
                              >
                                FAILED
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  fontWeight: "500",
                                  background: "#f59e0b20",
                                  color: "#f59e0b",
                                }}
                              >
                                PENDING
                              </span>
                            )}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            {getSourceBadge((email as IncomingEmail).inboundSource)}
                          </td>
                          <td
                            style={{ padding: "12px 16px", fontSize: "14px" }}
                          >
                            <button
                              onClick={() => setSelectedLog(email)}
                              style={{
                                padding: "4px 12px",
                                background: "#3b82f6",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "12px",
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
          )}

          {/* Pagination */}
          {!loading &&
            ((activeTab === "outgoing" && logs.length > 0) ||
              (activeTab === "incoming" && incomingEmails.length > 0)) && (
              <div
                style={{
                  padding: "16px",
                  borderTop: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: "14px", color: "#6b7280" }}>
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}{" "}
                  of {pagination.total} entries
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    disabled={pagination.page === 1}
                    onClick={() =>
                      setFilters({ ...filters, page: filters.page - 1 })
                    }
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background: pagination.page === 1 ? "#f3f4f6" : "white",
                      cursor: pagination.page === 1 ? "not-allowed" : "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Previous
                  </button>
                  <button
                    disabled={pagination.page >= pagination.pages}
                    onClick={() =>
                      setFilters({ ...filters, page: filters.page + 1 })
                    }
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      background:
                        pagination.page >= pagination.pages
                          ? "#f3f4f6"
                          : "white",
                      cursor:
                        pagination.page >= pagination.pages
                          ? "not-allowed"
                          : "pointer",
                      fontSize: "14px",
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
        </div>

        {/* Detail Modal */}
        {selectedLog && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setSelectedLog(null)}
          >
            <div
              style={{
                background: "white",
                borderRadius: "12px",
                maxWidth: "800px",
                width: "90%",
                maxHeight: "80vh",
                overflow: "auto",
                padding: "24px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "24px",
                }}
              >
                <h2 style={{ fontSize: "20px", fontWeight: "600" }}>
                  Email Details
                </h2>
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "24px",
                    cursor: "pointer",
                    color: "#6b7280",
                  }}
                >
                  ×
                </button>
              </div>

              {isEmailLog(selectedLog) ? (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Status
                    </label>
                    {getStatusBadge(selectedLog.status)}
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Recipient
                    </label>
                    <div style={{ fontSize: "14px" }}>
                      {selectedLog.recipient}
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Subject
                    </label>
                    <div style={{ fontSize: "14px" }}>
                      {selectedLog.subject}
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Type
                    </label>
                    <div
                      style={{ fontSize: "14px", textTransform: "capitalize" }}
                    >
                      {selectedLog.type.replace(/_/g, " ")}
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Sent At
                    </label>
                    <div style={{ fontSize: "14px" }}>
                      {formatDate(selectedLog.sentAt)}
                    </div>
                  </div>

                  {selectedLog.smtpHost && (
                    <div style={{ marginBottom: "16px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                          marginBottom: "4px",
                        }}
                      >
                        SMTP Host
                      </label>
                      <div style={{ fontSize: "14px" }}>
                        {selectedLog.smtpHost}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Delivery Method
                    </label>
                    {getVendorBadge(selectedLog.vendor)}
                  </div>

                  {selectedLog.fromEmail && (
                    <div style={{ marginBottom: "16px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                          marginBottom: "4px",
                        }}
                      >
                        From Email
                      </label>
                      <div style={{ fontSize: "14px" }}>
                        {selectedLog.fromEmail}
                      </div>
                    </div>
                  )}

                  {selectedLog.error && (
                    <div style={{ marginBottom: "16px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#ef4444",
                          marginBottom: "4px",
                        }}
                      >
                        Error
                      </label>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "#ef4444",
                          background: "#fee2e2",
                          padding: "12px",
                          borderRadius: "6px",
                        }}
                      >
                        {selectedLog.error}
                      </div>
                    </div>
                  )}

                  {selectedLog.body && (
                    <div style={{ marginBottom: "16px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                          marginBottom: "4px",
                        }}
                      >
                        Email Body
                      </label>
                      <div
                        style={{
                          fontSize: "14px",
                          background: "#f9fafb",
                          padding: "12px",
                          borderRadius: "6px",
                          maxHeight: "200px",
                          overflow: "auto",
                        }}
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(selectedLog.body),
                        }}
                      ></div>
                    </div>
                  )}

                  {selectedLog.metadata &&
                    Object.keys(selectedLog.metadata).length > 0 && (
                      <div style={{ marginBottom: "16px" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6b7280",
                            marginBottom: "4px",
                          }}
                        >
                          Metadata
                        </label>
                        <pre
                          style={{
                            fontSize: "12px",
                            background: "#f9fafb",
                            padding: "12px",
                            borderRadius: "6px",
                            overflow: "auto",
                          }}
                        >
                          {JSON.stringify(selectedLog.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      From
                    </label>
                    <div style={{ fontSize: "14px" }}>
                      {selectedLog.fromEmail}
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Inbound Source
                    </label>
                    {getSourceBadge((selectedLog as IncomingEmail).inboundSource)}
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Subject
                    </label>
                    <div style={{ fontSize: "14px" }}>
                      {selectedLog.subject}
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#6b7280",
                        marginBottom: "4px",
                      }}
                    >
                      Received At
                    </label>
                    <div style={{ fontSize: "14px" }}>
                      {formatDate(selectedLog.receivedAt)}
                    </div>
                  </div>

                  {selectedLog.body && (
                    <div style={{ marginBottom: "16px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6b7280",
                          marginBottom: "4px",
                        }}
                      >
                        Email Body
                      </label>
                      <div
                        style={{
                          fontSize: "14px",
                          background: "#f9fafb",
                          padding: "12px",
                          borderRadius: "6px",
                          maxHeight: "200px",
                          overflow: "auto",
                        }}
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(selectedLog.body),
                        }}
                      ></div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EmailLogsPage;
