import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import API_BASE_URL from "../config/api";
import DashboardLayout from "../components/DashboardLayout";
import ModuleHeader from "../components/ModuleHeader";
import {
  ServerStackIcon,
  CircleStackIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ChartBarIcon,
  BoltIcon,
  ShieldExclamationIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  CogIcon,
} from "@heroicons/react/24/outline";

// Interfaces
interface QueryMetric {
  operation: string;
  collection: string;
  query: Record<string, unknown>;
  executionTimeMs: number;
  documentsReturned: number;
  timestamp: Date;
  isSlow: boolean;
  isCritical: boolean;
  tags: string[];
}

interface ConnectionPoolMetrics {
  current: number;
  available: number;
  totalCreated: number;
  waitQueueSize: number;
  maxPoolSize: number;
}

interface AlertEvent {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

interface DBStats {
  isRunning: boolean;
  connectionState: string;
  connectionPool: ConnectionPoolMetrics;
  queryMetrics: {
    totalQueries: number;
    slowQueries: number;
    criticalQueries: number;
    avgExecutionTimeMs: number;
    maxExecutionTimeMs: number;
    queriesPerSecond: number;
    queryByOperation: Record<string, number>;
    queryByCollection: Record<string, number>;
  };
  recentSlowQueries: QueryMetric[];
  recentAlerts: AlertEvent[];
  uptime: number;
  lastChecked: Date;
}

interface HealthData {
  status: "healthy" | "degraded" | "critical";
  score: number;
  components: {
    name: string;
    status: "healthy" | "degraded" | "critical";
    message: string;
  }[];
  issues: string[];
  lastChecked: Date;
}

interface ServiceStatus {
  id: string;
  name: string;
  description: string;
  error: string | null;
  status: {
    isActive?: boolean;
    isRunning?: boolean;
    isProcessing?: boolean;
    interval?: string;
    batchSize?: number;
    maxEmailsPerFetch?: number;
    stats?: { totalProcessed: number; successful: number; failed: number };
    // job queue
    pending?: number;
    processing?: number;
    completed?: number;
    failed?: number;
  } | null;
}

const DBMonitoringDashboard: React.FC = () => {
  const [stats, setStats] = useState<DBStats | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [slowQueries, setSlowQueries] = useState<QueryMetric[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [alertFilter, setAlertFilter] = useState<string>("all");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState({
    slowQueryThresholdMs: 100,
    criticalQueryThresholdMs: 1000,
    metricsRetentionMs: 3600000,
    connectionPoolCheckIntervalMs: 30000,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const getAuthToken = () => localStorage.getItem("authToken");

  // Fetch all stats
  const fetchStats = useCallback(async () => {
    try {
      const token = getAuthToken();
      const [statsRes, healthRes, slowRes, alertsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/db-monitoring/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE_URL}/db-monitoring/health`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE_URL}/db-monitoring/slow-queries?limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(
          `${API_BASE_URL}/db-monitoring/alerts?limit=50&severity=${alertFilter !== "all" ? alertFilter : ""}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
      ]);

      if (statsRes.data.success) setStats(statsRes.data.data);
      if (healthRes.data.success) setHealth(healthRes.data.data);
      if (slowRes.data.success) setSlowQueries(slowRes.data.data.queries || []);
      if (alertsRes.data.success) setAlerts(alertsRes.data.data.alerts || []);

      // Fetch service statuses (non-critical, ignore failure)
      try {
        const servicesRes = await axios.get(
          `${API_BASE_URL}/db-monitoring/services`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (servicesRes.data.success)
          setServices(servicesRes.data.data.services || []);
      } catch {
        // non-critical
      }

      setError("");
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to fetch monitoring data";
      setError(errorMsg);
      console.error("Error fetching DB monitoring data:", err);
    } finally {
      setLoading(false);
    }
  }, [alertFilter]);

  // Control actions
  const startMonitoring = async () => {
    try {
      const token = getAuthToken();
      await axios.post(
        `${API_BASE_URL}/db-monitoring/start`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      await fetchStats();
    } catch (err) {
      console.error("Error starting monitoring:", err);
    }
  };

  const stopMonitoring = async () => {
    try {
      const token = getAuthToken();
      await axios.post(
        `${API_BASE_URL}/db-monitoring/stop`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      await fetchStats();
    } catch (err) {
      console.error("Error stopping monitoring:", err);
    }
  };

  const resetMetrics = async () => {
    if (
      !window.confirm(
        "Are you sure you want to reset all metrics? This cannot be undone.",
      )
    )
      return;
    try {
      const token = getAuthToken();
      await axios.post(
        `${API_BASE_URL}/db-monitoring/reset`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      await fetchStats();
    } catch (err) {
      console.error("Error resetting metrics:", err);
    }
  };

  const updateConfig = async () => {
    try {
      const token = getAuthToken();
      await axios.post(`${API_BASE_URL}/db-monitoring/configure`, config, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setShowConfigModal(false);
      await fetchStats();
    } catch (err) {
      console.error("Error updating config:", err);
    }
  };

  // Setup SSE for real-time updates
  const setupRealtimeUpdates = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const token = getAuthToken();
    const eventSource = new EventSource(
      `${API_BASE_URL}/db-monitoring/realtime?token=${token}`,
    );

    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "stats") {
          setStats(msg.data);
        } else if (msg.type === "alert") {
          setAlerts((prev) => [msg.data, ...prev.slice(0, 49)]);
        } else if (msg.type === "slow_query") {
          setSlowQueries((prev) => [msg.data, ...prev.slice(0, 19)]);
        }
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };

    eventSource.onerror = () => {
      console.error("SSE connection error");
      eventSource.close();
      // Retry after 5 seconds
      setTimeout(setupRealtimeUpdates, 5000);
    };

    eventSourceRef.current = eventSource;
  }, []);

  // Initial fetch and interval
  useEffect(() => {
    fetchStats();

    if (autoRefresh) {
      const interval = setInterval(fetchStats, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchStats, autoRefresh, refreshInterval]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Helper functions
  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-500";
      case "degraded":
        return "text-yellow-500";
      case "critical":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getHealthBgColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-100 border-green-200";
      case "degraded":
        return "bg-yellow-100 border-yellow-200";
      case "critical":
        return "bg-red-100 border-red-200";
      default:
        return "bg-gray-100 border-gray-200";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "info":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000)
      return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  };

  const formatTimestamp = (timestamp: Date | string) => {
    return new Date(timestamp).toLocaleString();
  };

  const truncateQuery = (query: Record<string, unknown>, maxLength = 100) => {
    const str = JSON.stringify(query);
    return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <ModuleHeader
          title="Database Monitoring"
          subtitle="Real-time MongoDB performance monitoring, query analysis, and alerts"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Control Bar */}
        <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              {stats?.isRunning ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircleIcon className="h-5 w-5" />
                  Running
                </span>
              ) : (
                <span className="flex items-center gap-1 text-gray-500">
                  <XCircleIcon className="h-5 w-5" />
                  Stopped
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">
                Connection:
              </span>
              <span
                className={`font-medium ${stats?.connectionState === "connected" ? "text-green-600" : "text-red-600"}`}
              >
                {stats?.connectionState || "Unknown"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Auto-refresh
            </label>

            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              disabled={!autoRefresh}
              className="text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>

            <button
              onClick={fetchStats}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
              title="Refresh"
            >
              <ArrowPathIcon className="h-5 w-5" />
            </button>

            {stats?.isRunning ? (
              <button
                onClick={stopMonitoring}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
              >
                <StopIcon className="h-4 w-4" />
                Stop
              </button>
            ) : (
              <button
                onClick={startMonitoring}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
              >
                <PlayIcon className="h-4 w-4" />
                Start
              </button>
            )}

            <button
              onClick={resetMetrics}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              <TrashIcon className="h-4 w-4" />
              Reset
            </button>

            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
            >
              <CogIcon className="h-4 w-4" />
              Configure
            </button>
          </div>
        </div>

        {/* Health Score Card */}
        {health && (
          <div
            className={`rounded-lg border p-6 ${getHealthBgColor(health.status)}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`text-4xl font-bold ${getHealthStatusColor(health.status)}`}
                >
                  {health.score}%
                </div>
                <div>
                  <h3
                    className={`text-lg font-semibold ${getHealthStatusColor(health.status)}`}
                  >
                    Database Health: {health.status.toUpperCase()}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Last checked: {formatTimestamp(health.lastChecked)}
                  </p>
                </div>
              </div>
              {health.issues && health.issues.length > 0 && (
                <div className="text-right">
                  <p className="text-sm font-medium text-red-600">
                    {health.issues.length} issue(s) detected
                  </p>
                </div>
              )}
            </div>

            {health.components && health.components.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                {health.components.map((component, idx) => (
                  <div key={idx} className="bg-white/50 rounded p-3">
                    <div className="flex items-center gap-2">
                      {component.status === "healthy" && (
                        <CheckCircleIcon className="h-4 w-4 text-green-500" />
                      )}
                      {component.status === "degraded" && (
                        <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
                      )}
                      {component.status === "critical" && (
                        <XCircleIcon className="h-4 w-4 text-red-500" />
                      )}
                      <span className="font-medium text-sm">
                        {component.name}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {component.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Queries */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ChartBarIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Queries</p>
                <p className="text-2xl font-bold">
                  {stats?.queryMetrics?.totalQueries?.toLocaleString() || 0}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {stats?.queryMetrics?.queriesPerSecond?.toFixed(2) || 0}{" "}
              queries/sec
            </p>
          </div>

          {/* Slow Queries */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <ClockIcon className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Slow Queries</p>
                <p className="text-2xl font-bold">
                  {stats?.queryMetrics?.slowQueries?.toLocaleString() || 0}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {stats?.queryMetrics?.criticalQueries || 0} critical (&gt;1s)
            </p>
          </div>

          {/* Avg Execution Time */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <BoltIcon className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg Execution</p>
                <p className="text-2xl font-bold">
                  {formatDuration(stats?.queryMetrics?.avgExecutionTimeMs || 0)}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Max:{" "}
              {formatDuration(stats?.queryMetrics?.maxExecutionTimeMs || 0)}
            </p>
          </div>

          {/* Connection Pool */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ServerStackIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Connection Pool</p>
                <p className="text-2xl font-bold">
                  {stats?.connectionPool?.current || 0} /{" "}
                  {stats?.connectionPool?.maxPoolSize || 0}
                </p>
              </div>
            </div>
            <div className="mt-2">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    (stats?.connectionPool?.current || 0) /
                      (stats?.connectionPool?.maxPoolSize || 1) >
                    0.9
                      ? "bg-red-500"
                      : (stats?.connectionPool?.current || 0) /
                            (stats?.connectionPool?.maxPoolSize || 1) >
                          0.7
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{
                    width: `${((stats?.connectionPool?.current || 0) / (stats?.connectionPool?.maxPoolSize || 1)) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {stats?.connectionPool?.waitQueueSize || 0} in wait queue
              </p>
            </div>
          </div>
        </div>

        {/* Query Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Operation */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CircleStackIcon className="h-5 w-5 text-blue-500" />
              Queries by Operation
            </h3>
            <div className="space-y-2">
              {stats?.queryMetrics?.queryByOperation &&
                Object.entries(stats.queryMetrics.queryByOperation)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([operation, count]) => (
                    <div
                      key={operation}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm font-medium text-gray-700 uppercase">
                        {operation}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{
                              width: `${(count / (stats.queryMetrics?.totalQueries || 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-500 w-16 text-right">
                          {count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          {/* By Collection */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CircleStackIcon className="h-5 w-5 text-purple-500" />
              Queries by Collection
            </h3>
            <div className="space-y-2">
              {stats?.queryMetrics?.queryByCollection &&
                Object.entries(stats.queryMetrics.queryByCollection)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([collection, count]) => (
                    <div
                      key={collection}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm font-medium text-gray-700">
                        {collection}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{
                              width: `${(count / (stats.queryMetrics?.totalQueries || 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-500 w-16 text-right">
                          {count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ShieldExclamationIcon className="h-5 w-5 text-red-500" />
              Recent Alerts
            </h3>
            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div className="divide-y max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <CheckCircleIcon className="h-12 w-12 mx-auto mb-2 text-green-300" />
                <p>No alerts at this time</p>
              </div>
            ) : (
              alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`p-3 ${getSeverityColor(alert.severity)} border-l-4`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        {alert.type.replace(/_/g, " ").toUpperCase()}
                      </p>
                      <p className="text-sm">{alert.message}</p>
                    </div>
                    <span className="text-xs whitespace-nowrap ml-2">
                      {formatTimestamp(alert.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Polling Services Section */}
        {services.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ServerStackIcon className="h-5 w-5 text-indigo-500" />
                Background Services
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-y">
              {services.map((svc) => {
                const isActive =
                  svc.status?.isActive ?? svc.status?.isRunning ?? false;
                const isProcessing = svc.status?.isProcessing ?? false;
                return (
                  <div key={svc.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-800">
                          {svc.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {svc.description}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          svc.error
                            ? "bg-red-100 text-red-700"
                            : isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {svc.error ? (
                          <>
                            <XCircleIcon className="h-3 w-3" />
                            Error
                          </>
                        ) : isActive ? (
                          <>
                            <CheckCircleIcon className="h-3 w-3" />
                            {isProcessing ? "Running" : "Active"}
                          </>
                        ) : (
                          <>
                            <XCircleIcon className="h-3 w-3" />
                            Stopped
                          </>
                        )}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-gray-500">
                      {svc.status?.interval && (
                        <div className="flex justify-between">
                          <span>Interval</span>
                          <span className="font-mono text-gray-700">
                            {svc.status.interval}
                          </span>
                        </div>
                      )}
                      {svc.status?.batchSize !== undefined && (
                        <div className="flex justify-between">
                          <span>Batch size</span>
                          <span className="font-medium text-gray-700">
                            {svc.status.batchSize}
                          </span>
                        </div>
                      )}
                      {svc.status?.maxEmailsPerFetch !== undefined && (
                        <div className="flex justify-between">
                          <span>Max per fetch</span>
                          <span className="font-medium text-gray-700">
                            {svc.status.maxEmailsPerFetch}
                          </span>
                        </div>
                      )}
                      {svc.status?.stats && (
                        <>
                          <div className="flex justify-between">
                            <span>Processed</span>
                            <span className="font-medium text-gray-700">
                              {svc.status.stats.totalProcessed}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-green-600">Success</span>
                            <span className="font-medium text-green-700">
                              {svc.status.stats.successful}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-red-500">Failed</span>
                            <span className="font-medium text-red-600">
                              {svc.status.stats.failed}
                            </span>
                          </div>
                        </>
                      )}
                      {svc.status?.pending !== undefined && (
                        <>
                          <div className="flex justify-between">
                            <span>Pending</span>
                            <span className="font-medium text-yellow-600">
                              {svc.status.pending}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Processing</span>
                            <span className="font-medium text-blue-600">
                              {svc.status.processing}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Completed</span>
                            <span className="font-medium text-green-600">
                              {svc.status.completed}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-red-500">Failed</span>
                            <span className="font-medium text-red-600">
                              {svc.status.failed}
                            </span>
                          </div>
                        </>
                      )}
                      {svc.error && (
                        <p
                          className="text-red-500 mt-1 truncate"
                          title={svc.error}
                        >
                          {svc.error}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Slow Queries Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-yellow-500" />
              Recent Slow Queries (&gt;{config.slowQueryThresholdMs}ms)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Collection
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Operation
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Docs
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Query
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {slowQueries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No slow queries recorded
                    </td>
                  </tr>
                ) : (
                  slowQueries.map((query, idx) => (
                    <tr
                      key={idx}
                      className={
                        query.isCritical ? "bg-red-50" : "hover:bg-gray-50"
                      }
                    >
                      <td className="px-4 py-3 text-sm font-medium">
                        {query.collection}
                      </td>
                      <td className="px-4 py-3 text-sm uppercase">
                        {query.operation}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            query.isCritical
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {formatDuration(query.executionTimeMs)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {query.documentsReturned}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-xs text-gray-500 max-w-xs truncate">
                        {truncateQuery(query.query)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {formatTimestamp(query.timestamp)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Configuration Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">
                Configure Monitoring
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Slow Query Threshold (ms)
                  </label>
                  <input
                    type="number"
                    value={config.slowQueryThresholdMs}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        slowQueryThresholdMs: Number(e.target.value),
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Critical Query Threshold (ms)
                  </label>
                  <input
                    type="number"
                    value={config.criticalQueryThresholdMs}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        criticalQueryThresholdMs: Number(e.target.value),
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Metrics Retention (minutes)
                  </label>
                  <input
                    type="number"
                    value={config.metricsRetentionMs / 60000}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        metricsRetentionMs: Number(e.target.value) * 60000,
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Connection Pool Check Interval (seconds)
                  </label>
                  <input
                    type="number"
                    value={config.connectionPoolCheckIntervalMs / 1000}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        connectionPoolCheckIntervalMs:
                          Number(e.target.value) * 1000,
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={updateConfig}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DBMonitoringDashboard;
