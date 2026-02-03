/**
 * Error Log Routes (Task 8.1)
 * API routes for error log management
 */

import { Router } from 'express';
import {
  getErrorLogs,
  getErrorLogById,
  getErrorStats,
  resolveError,
  deleteErrorLog,
  getCriticalErrors,
  bulkResolveErrors
} from '../controllers/errorLogController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication and admin privileges
// TODO: Add admin-only middleware check

/**
 * @route   GET /api/error-logs/stats
 * @desc    Get error statistics
 * @access  Private (Admin)
 */
router.get('/stats', authMiddleware, getErrorStats);

/**
 * @route   GET /api/error-logs/critical/recent
 * @desc    Get recent critical errors
 * @access  Private (Admin)
 */
router.get('/critical/recent', authMiddleware, getCriticalErrors);

/**
 * @route   GET /api/error-logs
 * @desc    Get all error logs with filtering and pagination
 * @access  Private (Admin)
 */
router.get('/', authMiddleware, getErrorLogs);

/**
 * @route   GET /api/error-logs/:id
 * @desc    Get error log by ID
 * @access  Private (Admin)
 */
router.get('/:id', authMiddleware, getErrorLogById);

/**
 * @route   PATCH /api/error-logs/:id/resolve
 * @desc    Mark error as resolved
 * @access  Private (Admin)
 */
router.patch('/:id/resolve', authMiddleware, resolveError);

/**
 * @route   PATCH /api/error-logs/bulk-resolve
 * @desc    Bulk resolve errors
 * @access  Private (Admin)
 */
router.patch('/bulk-resolve', authMiddleware, bulkResolveErrors);

/**
 * @route   DELETE /api/error-logs/:id
 * @desc    Delete error log
 * @access  Private (Admin)
 */
router.delete('/:id', authMiddleware, deleteErrorLog);

export default router;
