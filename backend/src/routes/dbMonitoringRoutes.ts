/**
 * Database Monitoring Routes
 * ==========================
 * API endpoints for database performance monitoring.
 * Provides access to:
 * - Real-time stats and metrics
 * - Slow query logs
 * - Connection pool status
 * - Alerts
 */

import express from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/roleCheck";
import { dbMonitoringService } from "../services/dbMonitoringService";
import {
  enableQueryProfiling,
  disableQueryProfiling,
  isQueryProfilingEnabled,
} from "../middleware/queryProfiler";
import { emailPollingService } from "../services/emailPollingService";
import { emailProcessingWorker } from "../services/emailProcessingWorker";
import { autoEscalationService } from "../services/autoEscalationService";
import { jobQueue } from "../services/jobQueue";

const router = express.Router();

// All routes require authentication and super admin access
router.use(authMiddleware);
router.use(requireSuperAdmin);

/**
 * GET /api/db-monitoring/stats
 * Get comprehensive database monitoring statistics
 */
router.get("/stats", async (req: AuthRequest, res) => {
  try {
    const stats = await dbMonitoringService.getStats();

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/db-monitoring/slow-queries
 * Get list of slow queries
 */
router.get("/slow-queries", async (req: AuthRequest, res) => {
  try {
    const { limit = 50 } = req.query;
    const slowQueries = dbMonitoringService.getSlowQueries();

    return res.json({
      success: true,
      data: {
        count: slowQueries.length,
        queries: slowQueries.slice(-Number(limit)).reverse(),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/db-monitoring/connection-pool
 * Get connection pool history
 */
router.get("/connection-pool", async (req: AuthRequest, res) => {
  try {
    const history = dbMonitoringService.getConnectionPoolHistory();

    return res.json({
      success: true,
      data: {
        count: history.length,
        history: history.slice(-60), // Last 60 data points
        latest: history.length > 0 ? history[history.length - 1] : null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/db-monitoring/alerts
 * Get monitoring alerts
 */
router.get("/alerts", async (req: AuthRequest, res) => {
  try {
    const { severity, limit = 100 } = req.query;

    let alerts = dbMonitoringService.getAlerts(
      severity as "info" | "warning" | "critical" | undefined,
    );

    return res.json({
      success: true,
      data: {
        count: alerts.length,
        alerts: alerts.slice(-Number(limit)).reverse(),
        summary: {
          critical: alerts.filter((a) => a.severity === "critical").length,
          warning: alerts.filter((a) => a.severity === "warning").length,
          info: alerts.filter((a) => a.severity === "info").length,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/db-monitoring/status
 * Get monitoring service status
 */
router.get("/status", async (req: AuthRequest, res) => {
  try {
    const stats = await dbMonitoringService.getStats();

    return res.json({
      success: true,
      data: {
        isActive: dbMonitoringService.isActive(),
        isProfilingEnabled: isQueryProfilingEnabled(),
        connectionState: stats.connectionState,
        monitoringStartTime: stats.monitoringStartTime,
        uptimeMs: stats.uptimeMs,
        uptimeFormatted: formatUptime(stats.uptimeMs),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/db-monitoring/start
 * Start monitoring service
 */
router.post("/start", async (req: AuthRequest, res) => {
  try {
    dbMonitoringService.start();
    enableQueryProfiling();

    return res.json({
      success: true,
      message: "Database monitoring started",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/db-monitoring/stop
 * Stop monitoring service
 */
router.post("/stop", async (req: AuthRequest, res) => {
  try {
    dbMonitoringService.stop();
    disableQueryProfiling();

    return res.json({
      success: true,
      message: "Database monitoring stopped",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/db-monitoring/reset
 * Reset all metrics
 */
router.post("/reset", async (req: AuthRequest, res) => {
  try {
    dbMonitoringService.reset();

    return res.json({
      success: true,
      message: "Metrics reset successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/db-monitoring/configure
 * Update monitoring configuration
 */
router.post("/configure", async (req: AuthRequest, res) => {
  try {
    const {
      slowQueryThresholdMs,
      connectionPoolCheckInterval,
      connectionPoolCheckIntervalMs,
      metricsRetentionMs,
    } = req.body;

    dbMonitoringService.configure({
      slowQueryThresholdMs,
      connectionPoolCheckInterval:
        connectionPoolCheckInterval ?? connectionPoolCheckIntervalMs,
      metricsRetentionMs,
    });

    return res.json({
      success: true,
      message: "Configuration updated",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/db-monitoring/health
 * Get database health summary (for dashboard widget)
 */
router.get("/health", async (req: AuthRequest, res) => {
  try {
    const stats = await dbMonitoringService.getStats();

    // Calculate health score (0-100)
    let healthScore = 100;
    let issues: string[] = [];
    let components: Array<{
      name: string;
      status: "healthy" | "degraded" | "critical";
      message: string;
    }> = [];

    // Connection state check
    if (stats.connectionState !== "connected") {
      healthScore -= 50;
      issues.push("Database not connected");
      components.push({
        name: "Connection",
        status: "critical",
        message: "Database not connected",
      });
    } else {
      components.push({
        name: "Connection",
        status: "healthy",
        message: `Connected (${stats.host})`,
      });
    }

    // Slow query check
    if (stats.slowQueryCount > 10) {
      healthScore -= 10;
      issues.push(`${stats.slowQueryCount} slow queries in last hour`);
      components.push({
        name: "Slow Queries",
        status: "degraded",
        message: `${stats.slowQueryCount} slow queries detected`,
      });
    } else {
      components.push({
        name: "Slow Queries",
        status: "healthy",
        message: `${stats.slowQueryCount} slow queries`,
      });
    }

    // Average latency check
    if (stats.avgQueryTimeMs > 100) {
      healthScore -= 20;
      issues.push(
        `High average query latency: ${stats.avgQueryTimeMs.toFixed(1)}ms`,
      );
      components.push({
        name: "Latency",
        status: "critical",
        message: `Avg ${stats.avgQueryTimeMs.toFixed(1)}ms`,
      });
    } else if (stats.avgQueryTimeMs > 50) {
      healthScore -= 10;
      issues.push(
        `Elevated query latency: ${stats.avgQueryTimeMs.toFixed(1)}ms`,
      );
      components.push({
        name: "Latency",
        status: "degraded",
        message: `Avg ${stats.avgQueryTimeMs.toFixed(1)}ms`,
      });
    } else {
      components.push({
        name: "Latency",
        status: "healthy",
        message: `Avg ${stats.avgQueryTimeMs.toFixed(1)}ms`,
      });
    }

    // Connection pool check
    if (stats.connectionPool) {
      const { current, available } = stats.connectionPool;
      const usagePercent = (current / (current + available)) * 100;

      if (usagePercent > 90) {
        healthScore -= 20;
        issues.push("Connection pool nearly exhausted");
        components.push({
          name: "Connection Pool",
          status: "critical",
          message: `${usagePercent.toFixed(0)}% used`,
        });
      } else if (usagePercent > 70) {
        healthScore -= 10;
        issues.push("Connection pool usage high");
        components.push({
          name: "Connection Pool",
          status: "degraded",
          message: `${usagePercent.toFixed(0)}% used`,
        });
      } else {
        components.push({
          name: "Connection Pool",
          status: "healthy",
          message: `${usagePercent.toFixed(0)}% used`,
        });
      }
    } else {
      components.push({
        name: "Connection Pool",
        status: "healthy",
        message: "No pool data yet",
      });
    }

    // Recent critical alerts
    const criticalAlerts = stats.recentAlerts.filter(
      (a) => a.severity === "critical",
    ).length;
    if (criticalAlerts > 0) {
      healthScore -= criticalAlerts * 5;
      issues.push(`${criticalAlerts} critical alerts`);
    }

    // Ensure score is within bounds
    healthScore = Math.max(0, Math.min(100, healthScore));

    let status: "healthy" | "degraded" | "critical";
    if (healthScore >= 80) {
      status = "healthy";
    } else if (healthScore >= 50) {
      status = "degraded";
    } else {
      status = "critical";
    }

    return res.json({
      success: true,
      data: {
        score: healthScore,
        status,
        components,
        issues,
        lastChecked: new Date(),
        metrics: {
          connectionState: stats.connectionState,
          queryCount: stats.queryCount,
          avgQueryTimeMs: Math.round(stats.avgQueryTimeMs * 100) / 100,
          slowQueryCount: stats.slowQueryCount,
          alertCount: stats.recentAlerts.length,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/db-monitoring/realtime
 * SSE endpoint for real-time updates
 */
router.get("/realtime", async (req: AuthRequest, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send initial connection message
  res.write(
    `data: ${JSON.stringify({ type: "connected", timestamp: new Date() })}\n\n`,
  );

  // Subscribe to monitoring events
  const sendEvent = (type: string, data: any) => {
    res.write(
      `data: ${JSON.stringify({ type, data, timestamp: new Date() })}\n\n`,
    );
  };

  const onSlowQuery = (query: any) => sendEvent("slow_query", query);
  const onAlert = (alert: any) => sendEvent("alert", alert);
  const onConnectionPool = (metrics: any) =>
    sendEvent("connectionPool", metrics);

  dbMonitoringService.on("slowQuery", onSlowQuery);
  dbMonitoringService.on("alert", onAlert);
  dbMonitoringService.on("connectionPool", onConnectionPool);

  // Send periodic stats (every 5 seconds)
  const statsInterval = setInterval(async () => {
    try {
      const stats = await dbMonitoringService.getStats();
      sendEvent("stats", stats);
    } catch {
      // Ignore errors
    }
  }, 5000);

  // Handle client disconnect
  req.on("close", () => {
    dbMonitoringService.off("slowQuery", onSlowQuery);
    dbMonitoringService.off("alert", onAlert);
    dbMonitoringService.off("connectionPool", onConnectionPool);
    clearInterval(statsInterval);
  });
});

/**
 * GET /api/db-monitoring/services
 * Get status of all background polling/worker services
 */
router.get("/services", async (req: AuthRequest, res) => {
  try {
    const [pollingStatus, workerStatus, escalationStatus, queueStats] =
      await Promise.allSettled([
        Promise.resolve(emailPollingService.getStatus()),
        Promise.resolve(emailProcessingWorker.getStatus()),
        Promise.resolve(autoEscalationService.getStatus()),
        jobQueue.getStats(),
      ]);

    const services = [
      {
        id: "email_polling",
        name: "Email Polling",
        description: "Polls IMAP and Microsoft Graph for incoming emails",
        status:
          pollingStatus.status === "fulfilled" ? pollingStatus.value : null,
        error:
          pollingStatus.status === "rejected"
            ? String(pollingStatus.reason)
            : null,
      },
      {
        id: "email_processing_worker",
        name: "Email Processing Worker",
        description: "Processes queued emails and creates/updates tickets",
        status: workerStatus.status === "fulfilled" ? workerStatus.value : null,
        error:
          workerStatus.status === "rejected"
            ? String(workerStatus.reason)
            : null,
      },
      {
        id: "auto_escalation",
        name: "Auto Escalation",
        description:
          "Checks SLA breaches and escalates overdue tickets every 3 minutes",
        status:
          escalationStatus.status === "fulfilled"
            ? escalationStatus.value
            : null,
        error:
          escalationStatus.status === "rejected"
            ? String(escalationStatus.reason)
            : null,
      },
      {
        id: "job_queue",
        name: "Job Queue",
        description:
          "MongoDB-backed job queue with priority scheduling and retry",
        status: queueStats.status === "fulfilled" ? queueStats.value : null,
        error:
          queueStats.status === "rejected" ? String(queueStats.reason) : null,
      },
    ];

    return res.json({
      success: true,
      data: { services, timestamp: new Date() },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to format uptime
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export default router;
