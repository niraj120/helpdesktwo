/**
 * Error Log Controller (Task 8.1)
 * API endpoints for viewing and managing error logs
 */

import { Request, Response } from 'express';
import ErrorLog from '../models/ErrorLog';
import { ErrorLogger, ErrorSeverity, ErrorContext } from '../utils/errorLogger';

/**
 * @desc    Get all error logs with filtering and pagination
 * @route   GET /api/error-logs
 * @access  Private (Admin only)
 */
export const getErrorLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      severity,
      context,
      resolved,
      projectId,
      page = 1,
      limit = 50,
      search
    } = req.query;

    // Build query
    const query: any = {};

    if (severity) {
      query.severity = severity;
    }
    if (context) {
      query.context = context;
    }
    if (resolved !== undefined) {
      query.resolved = resolved === 'true';
    }
    if (projectId) {
      query.projectId = projectId;
    }
    if (search) {
      query.message = { $regex: search, $options: 'i' };
    }

    // Execute query with pagination
    const skip = (Number(page) - 1) * Number(limit);
    const [errors, total] = await Promise.all([
      ErrorLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('resolvedBy', 'firstName lastName email')
        .lean(),
      ErrorLog.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: errors,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    console.error('Error fetching error logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch error logs',
      details: error.message
    });
  }
};

/**
 * @desc    Get error log by ID
 * @route   GET /api/error-logs/:id
 * @access  Private (Admin only)
 */
export const getErrorLogById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const errorLog = await ErrorLog.findById(id)
      .populate('resolvedBy', 'firstName lastName email')
      .lean();

    if (!errorLog) {
      res.status(404).json({
        success: false,
        error: 'Error log not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: errorLog
    });
  } catch (error: any) {
    console.error('Error fetching error log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch error log',
      details: error.message
    });
  }
};

/**
 * @desc    Get error statistics
 * @route   GET /api/error-logs/stats
 * @access  Private (Admin only)
 */
export const getErrorStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    const stats = await ErrorLogger.getErrorStats(projectId as string);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Error fetching error stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch error statistics',
      details: error.message
    });
  }
};

/**
 * @desc    Mark error as resolved
 * @route   PATCH /api/error-logs/:id/resolve
 * @access  Private (Admin only)
 */
export const resolveError = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { resolution } = req.body;
    const user = (req as any).user;

    const errorLog = await ErrorLog.findById(id);

    if (!errorLog) {
      res.status(404).json({
        success: false,
        error: 'Error log not found'
      });
      return;
    }

    if (errorLog.resolved) {
      res.status(400).json({
        success: false,
        error: 'Error is already resolved'
      });
      return;
    }

    // Mark as resolved
    errorLog.resolved = true;
    errorLog.resolvedAt = new Date();
    errorLog.resolvedBy = user._id || user.userId;
    errorLog.resolution = resolution || 'Resolved by admin';

    await errorLog.save();

    res.status(200).json({
      success: true,
      message: 'Error marked as resolved',
      data: errorLog
    });
  } catch (error: any) {
    console.error('Error resolving error log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve error',
      details: error.message
    });
  }
};

/**
 * @desc    Delete error log
 * @route   DELETE /api/error-logs/:id
 * @access  Private (Admin only)
 */
export const deleteErrorLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const errorLog = await ErrorLog.findByIdAndDelete(id);

    if (!errorLog) {
      res.status(404).json({
        success: false,
        error: 'Error log not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Error log deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting error log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete error log',
      details: error.message
    });
  }
};

/**
 * @desc    Get recent critical errors
 * @route   GET /api/error-logs/critical/recent
 * @access  Private (Admin only)
 */
export const getCriticalErrors = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 20, projectId } = req.query;

    const query: any = {
      severity: ErrorSeverity.CRITICAL,
      resolved: false
    };

    if (projectId) {
      query.projectId = projectId;
    }

    const errors = await ErrorLog.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .lean();

    res.status(200).json({
      success: true,
      data: errors,
      count: errors.length
    });
  } catch (error: any) {
    console.error('Error fetching critical errors:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch critical errors',
      details: error.message
    });
  }
};

/**
 * @desc    Bulk resolve errors
 * @route   PATCH /api/error-logs/bulk-resolve
 * @access  Private (Admin only)
 */
export const bulkResolveErrors = async (req: Request, res: Response): Promise<void> => {
  try {
    const { errorIds, resolution } = req.body;
    const user = (req as any).user;

    if (!errorIds || !Array.isArray(errorIds) || errorIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Error IDs array is required'
      });
      return;
    }

    const result = await ErrorLog.updateMany(
      {
        _id: { $in: errorIds },
        resolved: false
      },
      {
        $set: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: user._id || user.userId,
          resolution: resolution || 'Bulk resolved by admin'
        }
      }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} errors resolved`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount
      }
    });
  } catch (error: any) {
    console.error('Error bulk resolving errors:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk resolve errors',
      details: error.message
    });
  }
};
