/**
 * Performance Monitoring Middleware
 * 
 * Tracks API response times, payload sizes, and logs slow endpoints.
 * 
 * Features:
 * - Response time tracking for all endpoints
 * - Payload size monitoring
 * - Automatic slow endpoint detection (>500ms)
 * - Memory usage tracking
 * - Database query timing (when integrated with mongoose)
 * 
 * Created: 2026-01-31
 */

import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';

// Performance metrics storage
interface PerformanceMetric {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  responseSize: number;
  timestamp: Date;
  memoryUsage: number;
  slow: boolean;
}

interface EndpointStats {
  endpoint: string;
  method: string;
  totalRequests: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  avgPayloadSize: number;
  maxPayloadSize: number;
  slowRequests: number;
  errorCount: number;
  lastAccessed: Date;
}

// In-memory metrics store (use Redis in production for distributed systems)
class PerformanceMetricsStore {
  private metrics: PerformanceMetric[] = [];
  private endpointStats: Map<string, EndpointStats> = new Map();
  private readonly maxMetrics = 10000; // Keep last 10k metrics in memory
  private readonly slowThresholdMs = 500;
  private readonly largePayloadBytes = 1024 * 1024; // 1MB

  readonly events = new EventEmitter();

  addMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // Keep only last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Update endpoint stats
    const key = `${metric.method}:${metric.endpoint}`;
    const existing = this.endpointStats.get(key);

    if (existing) {
      existing.totalRequests++;
      existing.avgResponseTime = (existing.avgResponseTime * (existing.totalRequests - 1) + metric.responseTime) / existing.totalRequests;
      existing.maxResponseTime = Math.max(existing.maxResponseTime, metric.responseTime);
      existing.minResponseTime = Math.min(existing.minResponseTime, metric.responseTime);
      existing.avgPayloadSize = (existing.avgPayloadSize * (existing.totalRequests - 1) + metric.responseSize) / existing.totalRequests;
      existing.maxPayloadSize = Math.max(existing.maxPayloadSize, metric.responseSize);
      if (metric.slow) existing.slowRequests++;
      if (metric.statusCode >= 400) existing.errorCount++;
      existing.lastAccessed = metric.timestamp;
    } else {
      this.endpointStats.set(key, {
        endpoint: metric.endpoint,
        method: metric.method,
        totalRequests: 1,
        avgResponseTime: metric.responseTime,
        maxResponseTime: metric.responseTime,
        minResponseTime: metric.responseTime,
        avgPayloadSize: metric.responseSize,
        maxPayloadSize: metric.responseSize,
        slowRequests: metric.slow ? 1 : 0,
        errorCount: metric.statusCode >= 400 ? 1 : 0,
        lastAccessed: metric.timestamp,
      });
    }

    // Emit events for monitoring
    if (metric.slow) {
      this.events.emit('slowEndpoint', metric);
    }
    if (metric.responseSize > this.largePayloadBytes) {
      this.events.emit('largePayload', metric);
    }
  }

  getSlowEndpoints(threshold = this.slowThresholdMs): EndpointStats[] {
    return Array.from(this.endpointStats.values())
      .filter(s => s.avgResponseTime > threshold)
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime);
  }

  getLargePayloadEndpoints(threshold = this.largePayloadBytes): EndpointStats[] {
    return Array.from(this.endpointStats.values())
      .filter(s => s.avgPayloadSize > threshold)
      .sort((a, b) => b.avgPayloadSize - a.avgPayloadSize);
  }

  getAllStats(): EndpointStats[] {
    return Array.from(this.endpointStats.values())
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime);
  }

  getRecentMetrics(count = 100): PerformanceMetric[] {
    return this.metrics.slice(-count);
  }

  getEndpointMetrics(method: string, endpoint: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.method === method && m.endpoint === endpoint);
  }

  getSummary() {
    const stats = this.getAllStats();
    const slowEndpoints = this.getSlowEndpoints();
    const largePayloadEndpoints = this.getLargePayloadEndpoints();

    return {
      totalEndpoints: stats.length,
      totalRequests: stats.reduce((sum, s) => sum + s.totalRequests, 0),
      slowEndpoints: {
        count: slowEndpoints.length,
        top5: slowEndpoints.slice(0, 5).map(s => ({
          endpoint: `${s.method} ${s.endpoint}`,
          avgResponseTime: Math.round(s.avgResponseTime),
          maxResponseTime: Math.round(s.maxResponseTime),
          slowRequestPercentage: ((s.slowRequests / s.totalRequests) * 100).toFixed(1),
        })),
      },
      largePayloads: {
        count: largePayloadEndpoints.length,
        top5: largePayloadEndpoints.slice(0, 5).map(s => ({
          endpoint: `${s.method} ${s.endpoint}`,
          avgPayloadSize: `${(s.avgPayloadSize / 1024).toFixed(1)} KB`,
          maxPayloadSize: `${(s.maxPayloadSize / 1024).toFixed(1)} KB`,
        })),
      },
      errorRate: {
        total: stats.reduce((sum, s) => sum + s.errorCount, 0),
        percentage: stats.length > 0
          ? ((stats.reduce((sum, s) => sum + s.errorCount, 0) / 
              stats.reduce((sum, s) => sum + s.totalRequests, 0)) * 100).toFixed(2)
          : '0',
      },
    };
  }

  reset(): void {
    this.metrics = [];
    this.endpointStats.clear();
  }
}

// Singleton instance
export const performanceStore = new PerformanceMetricsStore();

// Log slow endpoints to console
performanceStore.events.on('slowEndpoint', (metric: PerformanceMetric) => {
  console.warn(`⚠️  [SLOW ENDPOINT] ${metric.method} ${metric.endpoint} - ${metric.responseTime}ms`);
});

// Log large payloads to console
performanceStore.events.on('largePayload', (metric: PerformanceMetric) => {
  console.warn(`⚠️  [LARGE PAYLOAD] ${metric.method} ${metric.endpoint} - ${(metric.responseSize / 1024).toFixed(1)} KB`);
});

/**
 * Performance monitoring middleware
 * Add this to your Express app to track all API response times
 */
export const performanceMonitor = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage().heapUsed;

  // Capture original methods
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);

  let responseSize = 0;

  // Override send
  res.send = function(body: any): Response {
    responseSize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body?.toString() || '');
    return originalSend(body);
  };

  // Override json
  res.json = function(body: any): Response {
    const jsonString = JSON.stringify(body);
    responseSize = Buffer.byteLength(jsonString);
    return originalJson(body);
  };

  // On response finish, record metrics
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const responseTimeNs = Number(endTime - startTime);
    const responseTimeMs = responseTimeNs / 1_000_000;
    const endMemory = process.memoryUsage().heapUsed;

    // Normalize endpoint (replace IDs with :id placeholder)
    const normalizedEndpoint = normalizeEndpoint(req.path);

    const metric: PerformanceMetric = {
      endpoint: normalizedEndpoint,
      method: req.method,
      responseTime: responseTimeMs,
      statusCode: res.statusCode,
      responseSize,
      timestamp: new Date(),
      memoryUsage: endMemory - startMemory,
      slow: responseTimeMs > 500,
    };

    performanceStore.addMetric(metric);
  });

  next();
};

/**
 * Normalize endpoint path by replacing ObjectIds and numeric IDs with placeholders
 */
function normalizeEndpoint(path: string): string {
  return path
    // Replace MongoDB ObjectIds (24 hex characters)
    .replace(/[a-f0-9]{24}/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Replace UUIDs
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, ':uuid');
}

/**
 * API endpoint to get performance stats (add to your routes)
 * 
 * Usage:
 * router.get('/api/_perf/stats', performanceStatsHandler);
 */
export const performanceStatsHandler = (req: Request, res: Response): void => {
  const { type = 'summary' } = req.query;

  switch (type) {
    case 'summary':
      res.json({
        success: true,
        data: performanceStore.getSummary(),
      });
      break;
    case 'slow':
      res.json({
        success: true,
        data: performanceStore.getSlowEndpoints(),
      });
      break;
    case 'large':
      res.json({
        success: true,
        data: performanceStore.getLargePayloadEndpoints(),
      });
      break;
    case 'all':
      res.json({
        success: true,
        data: performanceStore.getAllStats(),
      });
      break;
    case 'recent':
      res.json({
        success: true,
        data: performanceStore.getRecentMetrics(parseInt(req.query.count as string) || 100),
      });
      break;
    default:
      res.json({
        success: true,
        data: performanceStore.getSummary(),
      });
  }
};

/**
 * Reset performance stats (admin only)
 */
export const resetPerformanceStats = (req: Request, res: Response): void => {
  performanceStore.reset();
  res.json({
    success: true,
    message: 'Performance stats reset',
  });
};

export default performanceMonitor;
