/**
 * Job Queue Service
 * ==================
 * MongoDB-based job queue for background task processing.
 * 
 * Features:
 * - Priority-based job scheduling
 * - Automatic retries with exponential backoff
 * - Progress tracking
 * - Job result/error storage
 * - Concurrent worker support
 * - Graceful shutdown
 * 
 * Usage:
 *   import { jobQueue } from './services/jobQueue';
 *   
 *   // Add a job
 *   await jobQueue.add('email:send', { to: 'user@example.com', subject: 'Hello' });
 *   
 *   // Register a processor
 *   jobQueue.process('email:send', async (job, progress) => {
 *     await sendEmail(job.data);
 *     return { sent: true };
 *   });
 */

import { v4 as uuidv4 } from 'uuid';
import Job, { IJob, JobStatus, JobPriority } from '../models/Job';
import mongoose from 'mongoose';

// ============================================================================
// Types
// ============================================================================

export interface JobOptions {
  /** Job priority */
  priority?: JobPriority;
  /** Delay before execution (ms) */
  delay?: number;
  /** Maximum retry attempts */
  maxAttempts?: number;
  /** Related entity for querying */
  entityId?: string;
  /** Entity type for grouping */
  entityType?: string;
  /** User who created the job */
  createdBy?: string;
  /** Project context */
  projectId?: string;
  /** Additional metadata for tracking */
  metadata?: Record<string, any>;
}

// Re-export JobPriority for convenience
export { JobPriority };

export interface JobResult {
  jobId: string;
  status: JobStatus;
  result?: Record<string, any>;
  error?: string;
}

export type ProgressCallback = (percent: number) => Promise<void>;

export type JobProcessor = (
  job: IJob,
  progress: ProgressCallback
) => Promise<Record<string, any> | void>;

// ============================================================================
// Job Queue Class
// ============================================================================

class JobQueue {
  private processors: Map<string, JobProcessor> = new Map();
  private isRunning: boolean = false;
  private pollInterval: number = 1000; // 1 second
  private workerId: string;
  private concurrency: number = 3;
  private activeJobs: number = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor() {
    this.workerId = `worker-${process.pid}-${uuidv4().slice(0, 8)}`;
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Set polling interval
   */
  setPollInterval(ms: number): void {
    this.pollInterval = ms;
  }

  /**
   * Set concurrency (max parallel jobs)
   */
  setConcurrency(count: number): void {
    this.concurrency = count;
  }

  // ==========================================================================
  // Job Management
  // ==========================================================================

  /**
   * Add a job to the queue
   */
  async add(
    type: string,
    data: Record<string, any>,
    options: JobOptions = {}
  ): Promise<IJob> {
    const jobId = `${type}-${uuidv4()}`;
    const scheduledFor = options.delay
      ? new Date(Date.now() + options.delay)
      : new Date();

    const job = await Job.create({
      jobId,
      type,
      data,
      status: 'pending',
      priority: options.priority || 'normal',
      maxAttempts: options.maxAttempts || 3,
      delay: options.delay || 0,
      scheduledFor,
      entityId: options.entityId,
      entityType: options.entityType,
      createdBy: options.createdBy
        ? new mongoose.Types.ObjectId(options.createdBy)
        : undefined,
      projectId: options.projectId
        ? new mongoose.Types.ObjectId(options.projectId)
        : undefined,
    });

    console.log(`📥 [JobQueue] Added job: ${jobId} (${type})`);
    return job;
  }

  /**
   * Add multiple jobs in bulk
   */
  async addBulk(
    jobs: Array<{ type: string; data: Record<string, any>; options?: JobOptions }>
  ): Promise<IJob[]> {
    const jobDocs = jobs.map(({ type, data, options = {} }) => ({
      jobId: `${type}-${uuidv4()}`,
      type,
      data,
      status: 'pending' as JobStatus,
      priority: options.priority || 'normal',
      maxAttempts: options.maxAttempts || 3,
      delay: options.delay || 0,
      scheduledFor: options.delay
        ? new Date(Date.now() + options.delay)
        : new Date(),
      entityId: options.entityId,
      entityType: options.entityType,
      createdBy: options.createdBy
        ? new mongoose.Types.ObjectId(options.createdBy)
        : undefined,
      projectId: options.projectId
        ? new mongoose.Types.ObjectId(options.projectId)
        : undefined,
    }));

    const created = await Job.insertMany(jobDocs);
    console.log(`📥 [JobQueue] Added ${created.length} jobs in bulk`);
    return created;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<IJob | null> {
    return Job.findOne({ jobId });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<JobResult | null> {
    const job = await Job.findOne({ jobId }).select('jobId status result error');
    if (!job) return null;
    return {
      jobId: job.jobId,
      status: job.status,
      result: job.result,
      error: job.error,
    };
  }

  /**
   * Get jobs by entity
   */
  async getJobsByEntity(
    entityType: string,
    entityId: string
  ): Promise<IJob[]> {
    return Job.find({ entityType, entityId }).sort({ createdAt: -1 });
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const result = await Job.updateOne(
      { jobId, status: 'pending' },
      { status: 'failed', error: 'Cancelled by user' }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<boolean> {
    const result = await Job.updateOne(
      { jobId, status: 'failed' },
      { status: 'pending', attempts: 0, error: null, errorStack: null }
    );
    return result.modifiedCount > 0;
  }

  // ==========================================================================
  // Processor Registration
  // ==========================================================================

  /**
   * Register a job processor
   */
  process(type: string, processor: JobProcessor): void {
    this.processors.set(type, processor);
    console.log(`⚙️ [JobQueue] Registered processor for: ${type}`);
  }

  // ==========================================================================
  // Queue Processing
  // ==========================================================================

  /**
   * Start processing jobs
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ [JobQueue] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 [JobQueue] Started with ${this.concurrency} workers`);
    this.poll();
  }

  /**
   * Stop processing jobs gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 [JobQueue] Stopping...');
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for active jobs to complete
    if (this.activeJobs > 0) {
      console.log(`⏳ [JobQueue] Waiting for ${this.activeJobs} active jobs...`);
      this.shutdownPromise = new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.activeJobs === 0) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      await this.shutdownPromise;
    }

    // Release any stuck processing jobs
    await Job.updateMany(
      { status: 'processing', workerId: this.workerId },
      { status: 'pending', workerId: null }
    );

    console.log('✅ [JobQueue] Stopped');
  }

  /**
   * Poll for new jobs
   */
  private poll(): void {
    if (!this.isRunning) return;

    this.processNextBatch().finally(() => {
      if (this.isRunning) {
        this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
      }
    });
  }

  /**
   * Process the next batch of jobs
   */
  private async processNextBatch(): Promise<void> {
    const availableSlots = this.concurrency - this.activeJobs;
    if (availableSlots <= 0) return;

    try {
      // Find pending jobs sorted by priority and schedule time
      const jobs = await Job.find({
        status: 'pending',
        scheduledFor: { $lte: new Date() },
        type: { $in: Array.from(this.processors.keys()) },
      })
        .sort({ 
          priority: -1, // critical > high > normal > low
          scheduledFor: 1, 
          createdAt: 1 
        })
        .limit(availableSlots);

      // Process jobs concurrently
      const promises = jobs.map((job) => this.processJob(job));
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('❌ [JobQueue] Error fetching jobs:', error);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: IJob): Promise<void> {
    const processor = this.processors.get(job.type);
    if (!processor) {
      console.warn(`⚠️ [JobQueue] No processor for job type: ${job.type}`);
      return;
    }

    // Claim the job atomically
    const claimed = await Job.findOneAndUpdate(
      { _id: job._id, status: 'pending' },
      { 
        status: 'processing', 
        workerId: this.workerId, 
        startedAt: new Date(),
        $inc: { attempts: 1 }
      },
      { new: true }
    );

    if (!claimed) {
      // Job was claimed by another worker
      return;
    }

    this.activeJobs++;
    console.log(`🔄 [JobQueue] Processing: ${job.jobId} (attempt ${claimed.attempts}/${claimed.maxAttempts})`);

    try {
      // Progress callback
      const updateProgress = async (percent: number): Promise<void> => {
        await Job.updateOne(
          { _id: job._id },
          { progress: Math.min(100, Math.max(0, percent)) }
        );
      };

      // Execute processor
      const result = await processor(claimed, updateProgress);

      // Mark as completed
      await Job.updateOne(
        { _id: job._id },
        {
          status: 'completed',
          completedAt: new Date(),
          progress: 100,
          result: result || {},
        }
      );

      console.log(`✅ [JobQueue] Completed: ${job.jobId}`);
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      const errorStack = error.stack;

      console.error(`❌ [JobQueue] Failed: ${job.jobId}`, errorMessage);

      // Check if we should retry
      if (claimed.attempts < claimed.maxAttempts) {
        // Exponential backoff: 1s, 4s, 9s, 16s, ...
        const backoffDelay = Math.pow(claimed.attempts, 2) * 1000;
        await Job.updateOne(
          { _id: job._id },
          {
            status: 'pending',
            workerId: null,
            error: errorMessage,
            errorStack,
            scheduledFor: new Date(Date.now() + backoffDelay),
          }
        );
        console.log(`🔁 [JobQueue] Retry scheduled for ${job.jobId} in ${backoffDelay}ms`);
      } else {
        // Max retries exceeded
        await Job.updateOne(
          { _id: job._id },
          {
            status: 'failed',
            completedAt: new Date(),
            error: errorMessage,
            errorStack,
          }
        );
        console.log(`💀 [JobQueue] Max retries exceeded for: ${job.jobId}`);
      }
    } finally {
      this.activeJobs--;
    }
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byType: Record<string, number>;
  }> {
    const [statusCounts, typeCounts] = await Promise.all([
      Job.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Job.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
    ]);

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      byType: {} as Record<string, number>,
    };

    statusCounts.forEach(({ _id, count }) => {
      if (_id in stats) {
        (stats as any)[_id] = count;
      }
    });

    typeCounts.forEach(({ _id, count }) => {
      stats.byType[_id] = count;
    });

    return stats;
  }

  /**
   * Clean up old completed/failed jobs
   */
  async cleanup(olderThanDays: number = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await Job.deleteMany({
      status: { $in: ['completed', 'failed'] },
      completedAt: { $lt: cutoff },
    });
    console.log(`🧹 [JobQueue] Cleaned up ${result.deletedCount} old jobs`);
    return result.deletedCount;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const jobQueue = new JobQueue();
export default jobQueue;
