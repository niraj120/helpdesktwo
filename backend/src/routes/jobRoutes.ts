/**
 * Job Queue API Routes
 * =====================
 * Endpoints for job status, progress tracking, and management.
 */

import express from 'express';
import { jobQueue } from '../services/jobQueue';
import Job from '../models/Job';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/jobs/stats
 * Get queue statistics
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await jobQueue.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/jobs/:jobId
 * Get job details and status
 */
router.get('/:jobId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobQueue.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }
    
    return res.json({
      success: true,
      data: {
        jobId: job.jobId,
        type: job.type,
        status: job.status,
        progress: job.progress,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
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
 * GET /api/jobs/:jobId/progress
 * Get just the job progress (for polling)
 */
router.get('/:jobId/progress', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findOne({ jobId }).select('status progress error').lean();
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }
    
    return res.json({
      success: true,
      data: {
        status: job.status,
        progress: job.progress,
        error: job.error,
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
 * GET /api/jobs/:jobId/result
 * Get job result (for completed jobs)
 */
router.get('/:jobId/result', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findOne({ jobId }).select('status result error').lean();
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }
    
    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Job is not completed. Current status: ${job.status}`,
        status: job.status,
      });
    }
    
    return res.json({
      success: true,
      data: job.result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/jobs/:jobId/download
 * Download job result (for export jobs)
 */
router.get('/:jobId/download', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await Job.findOne({ jobId }).lean();
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }
    
    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Job is not completed. Current status: ${job.status}`,
      });
    }
    
    if (!job.result?.data) {
      return res.status(400).json({
        success: false,
        error: 'No downloadable data in job result',
      });
    }
    
    // Decode base64 and send file
    const buffer = Buffer.from(job.result.data, 'base64');
    const filename = job.result.filename || `export-${jobId}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/jobs/:jobId/cancel
 * Cancel a pending job
 */
router.post('/:jobId/cancel', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const cancelled = await jobQueue.cancelJob(jobId);
    
    if (!cancelled) {
      return res.status(400).json({
        success: false,
        error: 'Could not cancel job. It may already be processing or completed.',
      });
    }
    
    return res.json({
      success: true,
      message: 'Job cancelled',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/jobs/:jobId/retry
 * Retry a failed job
 */
router.post('/:jobId/retry', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const retried = await jobQueue.retryJob(jobId);
    
    if (!retried) {
      return res.status(400).json({
        success: false,
        error: 'Could not retry job. It may not be in failed state.',
      });
    }
    
    return res.json({
      success: true,
      message: 'Job queued for retry',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/jobs/entity/:entityType/:entityId
 * Get all jobs for a specific entity
 */
router.get('/entity/:entityType/:entityId', authMiddleware, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const jobs = await jobQueue.getJobsByEntity(entityType, entityId);
    
    return res.json({
      success: true,
      data: jobs.map(job => ({
        jobId: job.jobId,
        type: job.type,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
