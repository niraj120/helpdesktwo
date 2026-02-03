/**
 * Database Monitoring Service
 * ============================
 * Comprehensive MongoDB performance monitoring with:
 * - Query execution time tracking
 * - Connection pool monitoring
 * - Slow query detection
 * - Lock/deadlock monitoring
 * - Alerting for anomalies
 */

import mongoose from 'mongoose';
import { EventEmitter } from 'events';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface QueryMetric {
  operation: string;
  collection: string;
  query: Record<string, any>;
  executionTimeMs: number;
  timestamp: Date;
  indexUsed?: boolean;
  documentsExamined?: number;
  documentsReturned?: number;
  isSlow: boolean;
}

export interface ConnectionPoolMetrics {
  totalConnections: number;
  availableConnections: number;
  currentOperations: number;
  waitQueueSize: number;
  timestamp: Date;
}

export interface AlertEvent {
  type: 'slow_query' | 'connection_pool_exhausted' | 'high_wait_queue' | 
        'connection_error' | 'deadlock' | 'high_latency' | 'reconnection';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: Date;
}

export interface DBStats {
  // Connection info
  connectionState: string;
  host: string;
  database: string;
  isRunning: boolean;
  
  // Query metrics in format expected by frontend
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
  
  // Legacy fields (for backwards compatibility)
  queryCount: number;
  avgQueryTimeMs: number;
  slowQueryCount: number;
  slowQueryThresholdMs: number;
  
  // Query breakdown
  operationCounts: Record<string, number>;
  collectionCounts: Record<string, number>;
  
  // Connection pool
  connectionPool: {
    current: number;
    available: number;
    totalCreated: number;
    waitQueueSize: number;
    maxPoolSize: number;
  } | null;
  
  // Recent slow queries
  recentSlowQueries: QueryMetric[];
  
  // Recent alerts
  recentAlerts: AlertEvent[];
  
  // Server status
  serverStatus: Record<string, any> | null;
  
  // Uptime
  uptime: number;
  lastChecked: Date;
  monitoringStartTime: Date;
  uptimeMs: number;
}

// ============================================================================
// Monitoring Service Class
// ============================================================================

class DatabaseMonitoringService extends EventEmitter {
  private isRunning: boolean = false;
  private startTime: Date = new Date();
  
  // Configuration
  private slowQueryThresholdMs: number = 100; // Queries over 100ms are slow
  private connectionPoolCheckInterval: number = 30000; // Check every 30s
  private metricsRetentionMs: number = 3600000; // Keep 1 hour of metrics
  private maxRecentSlowQueries: number = 50;
  private maxRecentAlerts: number = 100;
  
  // Metrics storage (in-memory, reset on restart)
  private queryMetrics: QueryMetric[] = [];
  private connectionPoolHistory: ConnectionPoolMetrics[] = [];
  private alerts: AlertEvent[] = [];
  private operationCounts: Record<string, number> = {};
  private collectionCounts: Record<string, number> = {};
  private totalQueryTime: number = 0;
  private queryCount: number = 0;
  private maxExecutionTimeMs: number = 0;
  private criticalQueryCount: number = 0;
  private queryTimestamps: number[] = []; // For calculating queries per second
  
  // Timers
  private connectionPoolTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Alert thresholds
  private alertThresholds = {
    slowQueryThresholdMs: 100,
    criticalQueryThresholdMs: 1000,
    connectionPoolWarningPercent: 70,
    connectionPoolCriticalPercent: 90,
    waitQueueWarningSize: 5,
    waitQueueCriticalSize: 10,
    avgLatencyWarningMs: 50,
    avgLatencyCriticalMs: 100,
  };

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️  [DBMonitor] Already running');
      return;
    }

    console.log('📊 [DBMonitor] Starting database monitoring...');
    this.isRunning = true;
    this.startTime = new Date();
    
    // Set up mongoose event listeners
    this.setupMongooseListeners();
    
    // Start periodic connection pool monitoring
    this.startConnectionPoolMonitoring();
    
    // Start periodic cleanup
    this.startCleanup();
    
    // Initial connection pool check
    this.checkConnectionPool();
    
    console.log('✅ [DBMonitor] Database monitoring started');
    console.log(`   Slow query threshold: ${this.slowQueryThresholdMs}ms`);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) return;
    
    console.log('📊 [DBMonitor] Stopping database monitoring...');
    this.isRunning = false;
    
    if (this.connectionPoolTimer) {
      clearInterval(this.connectionPoolTimer);
      this.connectionPoolTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    console.log('✅ [DBMonitor] Database monitoring stopped');
  }

  /**
   * Set up mongoose connection event listeners
   */
  private setupMongooseListeners(): void {
    const connection = mongoose.connection;

    connection.on('connected', () => {
      this.addAlert({
        type: 'reconnection',
        severity: 'info',
        message: 'Database connected',
        details: { host: connection.host, db: connection.name },
      });
    });

    connection.on('disconnected', () => {
      this.addAlert({
        type: 'connection_error',
        severity: 'critical',
        message: 'Database disconnected',
        details: {},
      });
    });

    connection.on('error', (err) => {
      this.addAlert({
        type: 'connection_error',
        severity: 'critical',
        message: `Database error: ${err.message}`,
        details: { error: err.message },
      });
    });

    connection.on('reconnected', () => {
      this.addAlert({
        type: 'reconnection',
        severity: 'info',
        message: 'Database reconnected',
        details: { host: connection.host },
      });
    });
  }

  /**
   * Start connection pool monitoring
   */
  private startConnectionPoolMonitoring(): void {
    this.connectionPoolTimer = setInterval(() => {
      this.checkConnectionPool();
    }, this.connectionPoolCheckInterval);
  }

  /**
   * Start periodic cleanup of old metrics
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, 60000); // Every minute
  }

  /**
   * Check connection pool status
   */
  private async checkConnectionPool(): Promise<void> {
    try {
      const connection = mongoose.connection;
      
      if (connection.readyState !== 1) {
        return; // Not connected
      }

      // Get server status for connection pool info
      const admin = connection.db?.admin();
      if (!admin) return;

      const serverStatus = await admin.serverStatus();
      
      const metrics: ConnectionPoolMetrics = {
        totalConnections: serverStatus.connections?.current || 0,
        availableConnections: serverStatus.connections?.available || 0,
        currentOperations: serverStatus.globalLock?.currentQueue?.total || 0,
        waitQueueSize: serverStatus.globalLock?.currentQueue?.readers || 0,
        timestamp: new Date(),
      };

      this.connectionPoolHistory.push(metrics);
      
      // Trim history
      const cutoff = Date.now() - this.metricsRetentionMs;
      this.connectionPoolHistory = this.connectionPoolHistory.filter(
        m => m.timestamp.getTime() > cutoff
      );

      // Check for alerts
      this.checkConnectionPoolAlerts(metrics, serverStatus);
      
      // Emit metrics event
      this.emit('connectionPool', metrics);
      
    } catch (error) {
      // Silently fail - might not have admin access
    }
  }

  /**
   * Check connection pool for alert conditions
   */
  private checkConnectionPoolAlerts(metrics: ConnectionPoolMetrics, serverStatus: any): void {
    const { totalConnections, availableConnections, waitQueueSize } = metrics;
    
    // Calculate pool usage percentage
    const totalCapacity = totalConnections + availableConnections;
    const usagePercent = totalCapacity > 0 ? (totalConnections / totalCapacity) * 100 : 0;

    // Connection pool usage alerts
    if (usagePercent >= this.alertThresholds.connectionPoolCriticalPercent) {
      this.addAlert({
        type: 'connection_pool_exhausted',
        severity: 'critical',
        message: `Connection pool at ${usagePercent.toFixed(1)}% capacity`,
        details: { usagePercent, totalConnections, availableConnections },
      });
    } else if (usagePercent >= this.alertThresholds.connectionPoolWarningPercent) {
      this.addAlert({
        type: 'connection_pool_exhausted',
        severity: 'warning',
        message: `Connection pool at ${usagePercent.toFixed(1)}% capacity`,
        details: { usagePercent, totalConnections, availableConnections },
      });
    }

    // Wait queue alerts
    if (waitQueueSize >= this.alertThresholds.waitQueueCriticalSize) {
      this.addAlert({
        type: 'high_wait_queue',
        severity: 'critical',
        message: `High wait queue: ${waitQueueSize} operations waiting`,
        details: { waitQueueSize },
      });
    } else if (waitQueueSize >= this.alertThresholds.waitQueueWarningSize) {
      this.addAlert({
        type: 'high_wait_queue',
        severity: 'warning',
        message: `Wait queue growing: ${waitQueueSize} operations waiting`,
        details: { waitQueueSize },
      });
    }

    // Check for lock contention (potential deadlocks)
    const lockWaits = serverStatus.locks?.Global?.acquireWaitCount?.w || 0;
    const lockTimeMs = serverStatus.locks?.Global?.timeAcquiringMicros?.w || 0;
    
    if (lockTimeMs > 10000000) { // Over 10 seconds of lock wait time
      this.addAlert({
        type: 'deadlock',
        severity: 'warning',
        message: 'High lock contention detected',
        details: { lockWaits, lockTimeMs: lockTimeMs / 1000 },
      });
    }
  }

  /**
   * Record a query metric (called from middleware)
   */
  recordQuery(metric: Omit<QueryMetric, 'timestamp' | 'isSlow'>): void {
    if (!this.isRunning) return;

    const isSlow = metric.executionTimeMs > this.slowQueryThresholdMs;
    const isCritical = metric.executionTimeMs >= this.alertThresholds.criticalQueryThresholdMs;
    
    const fullMetric: QueryMetric = {
      ...metric,
      timestamp: new Date(),
      isSlow,
    };

    // Update counters
    this.queryCount++;
    this.totalQueryTime += metric.executionTimeMs;
    this.operationCounts[metric.operation] = (this.operationCounts[metric.operation] || 0) + 1;
    this.collectionCounts[metric.collection] = (this.collectionCounts[metric.collection] || 0) + 1;
    
    // Track max execution time
    if (metric.executionTimeMs > this.maxExecutionTimeMs) {
      this.maxExecutionTimeMs = metric.executionTimeMs;
    }
    
    // Track critical queries
    if (isCritical) {
      this.criticalQueryCount++;
    }
    
    // Track query timestamps for queries per second calculation
    const now = Date.now();
    this.queryTimestamps.push(now);
    // Keep only last 60 seconds of timestamps
    const oneMinuteAgo = now - 60000;
    this.queryTimestamps = this.queryTimestamps.filter(t => t > oneMinuteAgo);

    // Store slow queries
    if (isSlow) {
      this.queryMetrics.push(fullMetric);
      
      // Trim to max size
      if (this.queryMetrics.length > this.maxRecentSlowQueries) {
        this.queryMetrics.shift();
      }

      // Alert for slow/critical queries
      if (isCritical) {
        this.addAlert({
          type: 'slow_query',
          severity: 'critical',
          message: `Critical slow query: ${metric.executionTimeMs}ms on ${metric.collection}`,
          details: {
            collection: metric.collection,
            operation: metric.operation,
            executionTimeMs: metric.executionTimeMs,
            query: this.sanitizeQuery(metric.query),
          },
        });
      } else if (isSlow) {
        this.addAlert({
          type: 'slow_query',
          severity: 'warning',
          message: `Slow query: ${metric.executionTimeMs}ms on ${metric.collection}`,
          details: {
            collection: metric.collection,
            operation: metric.operation,
            executionTimeMs: metric.executionTimeMs,
          },
        });
      }

      // Emit slow query event
      this.emit('slowQuery', fullMetric);
    }

    // Check average latency
    const avgLatency = this.totalQueryTime / this.queryCount;
    if (avgLatency >= this.alertThresholds.avgLatencyCriticalMs) {
      this.addAlert({
        type: 'high_latency',
        severity: 'critical',
        message: `Average query latency is ${avgLatency.toFixed(1)}ms`,
        details: { avgLatency, queryCount: this.queryCount },
      });
    }
  }

  /**
   * Add an alert
   */
  private addAlert(alert: Omit<AlertEvent, 'timestamp'>): void {
    const fullAlert: AlertEvent = {
      ...alert,
      timestamp: new Date(),
    };

    // Avoid duplicate alerts within 1 minute
    const recentDuplicate = this.alerts.find(
      a => a.type === alert.type && 
           a.message === alert.message &&
           Date.now() - a.timestamp.getTime() < 60000
    );

    if (recentDuplicate) return;

    this.alerts.push(fullAlert);
    
    // Trim to max size
    if (this.alerts.length > this.maxRecentAlerts) {
      this.alerts.shift();
    }

    // Emit alert event
    this.emit('alert', fullAlert);
    
    // Log critical alerts
    if (alert.severity === 'critical') {
      console.error(`🚨 [DBMonitor] CRITICAL: ${alert.message}`);
    } else if (alert.severity === 'warning') {
      console.warn(`⚠️  [DBMonitor] WARNING: ${alert.message}`);
    }
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   */
  private sanitizeQuery(query: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(query)) {
      // Hide password and token fields
      if (/password|token|secret|key/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeQuery(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Cleanup old metrics
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.metricsRetentionMs;
    
    this.queryMetrics = this.queryMetrics.filter(m => m.timestamp.getTime() > cutoff);
    this.connectionPoolHistory = this.connectionPoolHistory.filter(m => m.timestamp.getTime() > cutoff);
    this.alerts = this.alerts.filter(a => a.timestamp.getTime() > cutoff);
  }

  /**
   * Get current stats
   */
  async getStats(): Promise<DBStats> {
    const connection = mongoose.connection;
    let serverStatus: Record<string, any> | null = null;
    
    try {
      const admin = connection.db?.admin();
      if (admin && connection.readyState === 1) {
        serverStatus = await admin.serverStatus();
      }
    } catch {
      // May not have admin access
    }

    const connectionStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    // Calculate queries per second (queries in last 60 seconds / 60)
    const queriesPerSecond = this.queryTimestamps.length / 60;
    
    // Get connection pool from server status or history
    const latestPoolMetrics = this.connectionPoolHistory.length > 0 
      ? this.connectionPoolHistory[this.connectionPoolHistory.length - 1]
      : null;

    return {
      // Connection info
      connectionState: connectionStates[connection.readyState] || 'unknown',
      host: connection.host || 'unknown',
      database: connection.name || 'unknown',
      isRunning: this.isRunning,
      
      // Query metrics in format expected by frontend
      queryMetrics: {
        totalQueries: this.queryCount,
        slowQueries: this.queryMetrics.length,
        criticalQueries: this.criticalQueryCount,
        avgExecutionTimeMs: this.queryCount > 0 ? this.totalQueryTime / this.queryCount : 0,
        maxExecutionTimeMs: this.maxExecutionTimeMs,
        queriesPerSecond: queriesPerSecond,
        queryByOperation: { ...this.operationCounts },
        queryByCollection: { ...this.collectionCounts },
      },
      
      // Legacy fields (for backwards compatibility)
      queryCount: this.queryCount,
      avgQueryTimeMs: this.queryCount > 0 ? this.totalQueryTime / this.queryCount : 0,
      slowQueryCount: this.queryMetrics.length,
      slowQueryThresholdMs: this.slowQueryThresholdMs,
      
      // Query breakdown
      operationCounts: { ...this.operationCounts },
      collectionCounts: { ...this.collectionCounts },
      
      // Connection pool in format expected by frontend
      connectionPool: latestPoolMetrics ? {
        current: latestPoolMetrics.totalConnections,
        available: latestPoolMetrics.availableConnections,
        totalCreated: serverStatus?.connections?.totalCreated || latestPoolMetrics.totalConnections,
        waitQueueSize: latestPoolMetrics.waitQueueSize,
        maxPoolSize: serverStatus?.connections?.available || 100,
      } : null,
      
      // Recent slow queries (last 10)
      recentSlowQueries: this.queryMetrics.slice(-10).reverse(),
      
      // Recent alerts (last 20)
      recentAlerts: this.alerts.slice(-20).reverse(),
      
      // Server status (subset)
      serverStatus: serverStatus ? {
        version: serverStatus.version,
        uptime: serverStatus.uptime,
        connections: serverStatus.connections,
        opcounters: serverStatus.opcounters,
        mem: serverStatus.mem,
        network: serverStatus.network,
      } : null,
      
      // Uptime
      uptime: Date.now() - this.startTime.getTime(),
      lastChecked: new Date(),
      monitoringStartTime: this.startTime,
      uptimeMs: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Get connection pool history
   */
  getConnectionPoolHistory(): ConnectionPoolMetrics[] {
    return [...this.connectionPoolHistory];
  }

  /**
   * Get all slow queries
   */
  getSlowQueries(): QueryMetric[] {
    return [...this.queryMetrics];
  }

  /**
   * Get all alerts
   */
  getAlerts(severity?: AlertEvent['severity']): AlertEvent[] {
    if (severity) {
      return this.alerts.filter(a => a.severity === severity);
    }
    return [...this.alerts];
  }

  /**
   * Clear all metrics (reset)
   */
  reset(): void {
    this.queryMetrics = [];
    this.connectionPoolHistory = [];
    this.alerts = [];
    this.operationCounts = {};
    this.collectionCounts = {};
    this.totalQueryTime = 0;
    this.queryCount = 0;
    this.startTime = new Date();
    
    console.log('📊 [DBMonitor] Metrics reset');
  }

  /**
   * Update configuration
   */
  configure(options: {
    slowQueryThresholdMs?: number;
    connectionPoolCheckInterval?: number;
    metricsRetentionMs?: number;
  }): void {
    if (options.slowQueryThresholdMs !== undefined) {
      this.slowQueryThresholdMs = options.slowQueryThresholdMs;
      this.alertThresholds.slowQueryThresholdMs = options.slowQueryThresholdMs;
    }
    if (options.connectionPoolCheckInterval !== undefined) {
      this.connectionPoolCheckInterval = options.connectionPoolCheckInterval;
      // Restart connection pool monitoring with new interval
      if (this.connectionPoolTimer) {
        clearInterval(this.connectionPoolTimer);
        this.startConnectionPoolMonitoring();
      }
    }
    if (options.metricsRetentionMs !== undefined) {
      this.metricsRetentionMs = options.metricsRetentionMs;
    }
    
    console.log('📊 [DBMonitor] Configuration updated');
  }

  /**
   * Check if monitoring is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const dbMonitoringService = new DatabaseMonitoringService();
export default dbMonitoringService;
