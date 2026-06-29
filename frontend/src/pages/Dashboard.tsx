import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/ui/PageHeader";
import MetricCard from "../components/ui/MetricCard";
import ViewModeSelector from "../components/ViewModeSelector";
import { tokens, styles } from "../theme/oneos";
import TeamBreakdown from "../components/TeamBreakdown";
import { API_CONFIG } from "../config/constants";
import { usePermissions } from "../hooks/usePermissions";
import { PERMISSIONS } from "../constants/permissions";

type ViewMode = "self" | "team" | "hierarchy" | "all";

interface TeamMemberStats {
  userId: string;
  name: string;
  email: string;
  stats: {
    total: number;
    pending: number;
    resolved: number;
    closed: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  };
}

interface TicketStats {
  total: number;
  pending: number;
  resolved: number;
  closed?: number;
  highPriority?: number;
  mediumPriority?: number;
  lowPriority?: number;
  withinSLA?: number;
  outsideSLA?: number;
  pendingWithinSLA?: number;
  pendingOutsideSLA?: number;
  viewMode?: ViewMode;
  teamBreakdown?: TeamMemberStats[];
  fallbackAssignmentsThisMonth?: number;
  footfallCount?: number;
  recentActivity: Array<{
    ticketId: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
}

const Dashboard = () => {
  const { hasPermission } = usePermissions();
  const [userData, setUserData] = useState({
    email: "",
    role: "",
    firstName: "",
    lastName: "",
  });

  const [viewMode, setViewMode] = useState<ViewMode>("self");
  const [ticketStats, setTicketStats] = useState<TicketStats>({
    total: 0,
    pending: 0,
    resolved: 0,
    closed: 0,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0,
    recentActivity: [],
    teamBreakdown: [],
    fallbackAssignmentsThisMonth: 0,
    footfallCount: 0,
  });

  const [loading, setLoading] = useState(true);
  // US-ESC-012: last auto-escalation job run
  const [jobLog, setJobLog] = useState<{
    ranAt: string;
    status: "success" | "partial" | "error";
    processed: number;
    escalated: number;
    skipped: number;
    errors: string[];
    durationMs: number;
  } | null>(null);

  useEffect(() => {
    // Get user data from localStorage
    const email = localStorage.getItem("userEmail") || "";
    const role = localStorage.getItem("userRole") || "";
    const firstName = localStorage.getItem("userFirstName") || "";
    const lastName = localStorage.getItem("userLastName") || "";

    setUserData({ email, role, firstName, lastName });

    // Fetch ticket statistics
    fetchTicketStats(viewMode);
    fetchJobLog();
  }, [viewMode]); // Re-fetch when view mode changes

  const fetchJobLog = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(
        `${API_CONFIG.API_URL}/escalation-matrix/auto-escalate/job-log?limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.ok) {
        const data = await response.json();
        const logs = data.data;
        if (Array.isArray(logs) && logs.length > 0) {
          setJobLog(logs[0]);
        }
      }
    } catch (err) {
      // non-critical — swallow
    }
  };

  const fetchTicketStats = async (currentViewMode: ViewMode) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");

      // Get projectId from projectContext (if in project portal mode)
      let projectId = "";
      const projectContextStr = localStorage.getItem("projectContext");
      if (projectContextStr) {
        try {
          const projectContext = JSON.parse(projectContextStr);
          projectId = projectContext.projectId || "";
        } catch (e) {
          console.error("Error parsing projectContext:", e);
        }
      }

      // Build URL with projectId and viewMode parameters
      const params = new URLSearchParams();
      if (projectId) params.append("projectId", projectId);
      params.append("viewMode", currentViewMode);

      const url = `${API_CONFIG.API_URL}/tickets/dashboard-stats?${params.toString()}`;

      console.log(
        "📊 Dashboard: Fetching stats with viewMode:",
        currentViewMode,
        "projectId:",
        projectId || "none",
      );

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("📊 Dashboard: Received data:", data);
        setTicketStats({
          ...data,
          closed: data.closed || 0,
          highPriority: data.highPriority || 0,
          mediumPriority: data.mediumPriority || 0,
          lowPriority: data.lowPriority || 0,
          teamBreakdown: data.teamBreakdown || [],
          fallbackAssignmentsThisMonth: data.fallbackAssignmentsThisMonth ?? 0,
          footfallCount: data.footfallCount ?? 0,
        });
      } else {
        console.error("Failed to fetch dashboard stats:", response.status);
      }
    } catch (error) {
      console.error("Error fetching ticket stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewModeChange = (newMode: ViewMode) => {
    console.log(
      "📊 Dashboard: Switching view mode from",
      viewMode,
      "to",
      newMode,
    );
    setViewMode(newMode);
  };

  return (
    <DashboardLayout>
      <div style={{ ...styles.page, maxWidth: "none" }}>
        <PageHeader
          title="Dashboard"
          subtitle={`Overview of ${viewMode === "self" ? "your" : viewMode === "team" ? "your team's" : viewMode === "hierarchy" ? "your hierarchy's" : "all"} work`}
          actions={
            <ViewModeSelector
              value={viewMode}
              onChange={handleViewModeChange}
              disabled={loading}
            />
          }
        />

        {/* Stats Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <MetricCard
            label="Total Queries"
            value={loading ? "-" : ticketStats.total}
            color={tokens.text}
            accent={tokens.primary}
          />

          <MetricCard
            label="Pending"
            value={loading ? "-" : ticketStats.pending}
            color={tokens.warn}
            accent={tokens.warn}
          />

          <MetricCard
            label="Resolved"
            value={loading ? "-" : ticketStats.resolved}
            color={tokens.success}
            accent={tokens.success}
          />

          <MetricCard
            label="Closed"
            value={loading ? "-" : ticketStats.closed}
            color={tokens.sub}
            accent={tokens.muted}
          />

          <MetricCard
            label="Footfall Count"
            value={loading ? "-" : ticketStats.footfallCount}
            color={tokens.primary}
            accent={tokens.primary}
          />
        </div>

        {/* Team Breakdown - Show only if permission exists and data available */}
        {hasPermission(PERMISSIONS.DASHBOARD_VIEW_TEAM_BREAKDOWN) &&
          ticketStats.teamBreakdown &&
          ticketStats.teamBreakdown.length > 0 && (
            <div style={{ marginBottom: "24px" }}>
              <TeamBreakdown
                teamMembers={ticketStats.teamBreakdown}
                loading={loading}
                onMemberClick={(userId) => {
                  console.log("Team member clicked:", userId);
                  // TODO: Navigate to tickets filtered by user
                }}
              />
            </div>
          )}

        {/* US-ASSIGN-001: Fallback Assignments Warning */}
        {(ticketStats.fallbackAssignmentsThisMonth ?? 0) > 0 && (
          <div
            style={{
              background: tokens.warnBg,
              border: "1px solid #fde68a",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: "24px",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  color: "#92400e",
                  fontSize: "14px",
                }}
              >
                Fallback Assignments This Month:{" "}
                {ticketStats.fallbackAssignmentsThisMonth}
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "#78350f",
                  fontSize: "12px",
                }}
              >
                These tickets were assigned via fallback because no eligible
                agents were found in the pool. Check your agent pool and
                escalation matrix configuration.
              </p>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div style={styles.card}>
          <h2
            style={{
              fontFamily: tokens.displayFont,
              fontSize: "20px",
              fontWeight: 700,
              marginBottom: "16px",
              color: tokens.text,
            }}
          >
            Recent Activity
          </h2>
          {loading ? (
            <p style={{ color: "#6b7280" }}>Loading...</p>
          ) : ticketStats.recentActivity.length > 0 ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {ticketStats.recentActivity.map((activity) => (
                <div
                  key={activity.ticketId}
                  style={{
                    padding: "12px",
                    borderRadius: 10,
                    background: tokens.pageBg,
                    border: `1px solid ${tokens.border}`,
                  }}
                >
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "4px",
                    }}
                  >
                    {activity.title}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      fontSize: "12px",
                      color: "#6b7280",
                    }}
                  >
                    <span>Ticket #{activity.ticketId.slice(-6)}</span>
                    <span>•</span>
                    <span>{activity.status}</span>
                    <span>•</span>
                    <span>
                      {new Date(activity.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#6b7280" }}>No recent activity</p>
          )}
        </div>

        {/* US-ESC-012: Auto-Escalation Monitor widget */}
        {jobLog && hasPermission(PERMISSIONS.ESCALATION_MATRIX_VIEW) && (
          <div
            style={{
              ...styles.card,
              marginTop: "24px",
              borderLeft: `4px solid ${
                jobLog.status === "success"
                  ? tokens.success
                  : jobLog.status === "partial"
                    ? tokens.warn
                    : tokens.danger
              }`,
            }}
          >
            <h2
              style={{
                fontFamily: tokens.displayFont,
                fontSize: "20px",
                fontWeight: 700,
                marginBottom: "12px",
                color: tokens.text,
              }}
            >
              Auto-Escalation Monitor
            </h2>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "24px",
                alignItems: "center",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginBottom: "2px",
                  }}
                >
                  Last Run
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#111827",
                  }}
                >
                  {new Date(jobLog.ranAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginBottom: "2px",
                  }}
                >
                  Status
                </p>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: "12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor:
                      jobLog.status === "success"
                        ? "#d1fae5"
                        : jobLog.status === "partial"
                          ? "#fef3c7"
                          : "#fee2e2",
                    color:
                      jobLog.status === "success"
                        ? "#065f46"
                        : jobLog.status === "partial"
                          ? "#92400e"
                          : "#991b1b",
                  }}
                >
                  {jobLog.status.charAt(0).toUpperCase() +
                    jobLog.status.slice(1)}
                </span>
              </div>
              <div style={{ display: "flex", gap: "16px" }}>
                {[
                  {
                    label: "Processed",
                    value: jobLog.processed,
                    color: "#374151",
                  },
                  {
                    label: "Escalated",
                    value: jobLog.escalated,
                    color: "#7c3aed",
                  },
                  { label: "Skipped", value: jobLog.skipped, color: "#6b7280" },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginBottom: "2px",
                      }}
                    >
                      {label}
                    </p>
                    <p style={{ fontSize: "22px", fontWeight: 700, color }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              {(jobLog.errors?.length ?? 0) > 0 && (
                <div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#ef4444",
                      fontWeight: 500,
                    }}
                  >
                    {jobLog.errors!.length} error
                    {jobLog.errors!.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
              <div style={{ marginLeft: "auto" }}>
                <p style={{ fontSize: "11px", color: "#9ca3af" }}>
                  {jobLog.durationMs}ms
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
