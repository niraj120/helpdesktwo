/**
 * MongoDB Query Profiling Middleware
 * ===================================
 * Hooks into Mongoose to track query execution times
 * and feed metrics to the DB Monitoring Service.
 */

import mongoose from 'mongoose';
import { dbMonitoringService } from '../services/dbMonitoringService';

// Track if profiling is enabled
let isProfilingEnabled = false;

/**
 * Enable query profiling
 * This hooks into Mongoose's pre/post query hooks
 */
export function enableQueryProfiling(): void {
  if (isProfilingEnabled) {
    console.log('⚠️  [QueryProfiler] Already enabled');
    return;
  }

  console.log('📊 [QueryProfiler] Enabling query profiling...');
  isProfilingEnabled = true;

  // Get the mongoose Schema prototype
  const originalExec = mongoose.Query.prototype.exec;

  // Override the exec function to measure query time
  mongoose.Query.prototype.exec = async function(this: any, ...args: any[]) {
    const startTime = Date.now();
    const operation = this.op; // find, findOne, update, etc.
    const collection = this.model?.collection?.name || this.mongooseCollection?.name || 'unknown';
    
    // Get the query filter (sanitized)
    const query = this.getFilter ? this.getFilter() : this._conditions || {};
    
    try {
      // Execute the original query
      const result = await originalExec.apply(this, args as any);
      
      // Calculate execution time
      const executionTimeMs = Date.now() - startTime;
      
      // Record the metric
      dbMonitoringService.recordQuery({
        operation: operation || 'unknown',
        collection,
        query,
        executionTimeMs,
        documentsReturned: Array.isArray(result) ? result.length : (result ? 1 : 0),
      });
      
      return result;
    } catch (error) {
      // Still record the metric for failed queries
      const executionTimeMs = Date.now() - startTime;
      
      dbMonitoringService.recordQuery({
        operation: operation || 'unknown',
        collection,
        query,
        executionTimeMs,
      });
      
      throw error;
    }
  };

  // Also hook into aggregations
  const originalAggregate = mongoose.Aggregate.prototype.exec;
  
  mongoose.Aggregate.prototype.exec = async function(this: any, ...args: any[]) {
    const startTime = Date.now();
    const collection = this._model?.collection?.name || 'unknown';
    
    // Get pipeline (first few stages for context)
    const pipeline = this.pipeline ? this.pipeline().slice(0, 3) : [];
    
    try {
      const result = await originalAggregate.apply(this, args as any);
      
      const executionTimeMs = Date.now() - startTime;
      
      dbMonitoringService.recordQuery({
        operation: 'aggregate',
        collection,
        query: { pipeline: pipeline.map((stage: any) => Object.keys(stage)[0]) },
        executionTimeMs,
        documentsReturned: Array.isArray(result) ? result.length : 0,
      });
      
      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      
      dbMonitoringService.recordQuery({
        operation: 'aggregate',
        collection,
        query: { pipeline: pipeline.map((stage: any) => Object.keys(stage)[0]) },
        executionTimeMs,
      });
      
      throw error;
    }
  };

  console.log('✅ [QueryProfiler] Query profiling enabled');
}

/**
 * Disable query profiling
 * Note: This doesn't fully restore the original functions,
 * but stops recording metrics
 */
export function disableQueryProfiling(): void {
  isProfilingEnabled = false;
  console.log('📊 [QueryProfiler] Query profiling disabled');
}

/**
 * Check if profiling is enabled
 */
export function isQueryProfilingEnabled(): boolean {
  return isProfilingEnabled;
}

export default {
  enableQueryProfiling,
  disableQueryProfiling,
  isQueryProfilingEnabled,
};
