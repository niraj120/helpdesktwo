import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  getAllAccessLogs,
  getAccessLogById,
  createAccessLog,
  getAccessStats,
  exportAccessLogs
} from '../controllers/accessLogController';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// @desc    Get all access logs with filters
// @route   GET /api/access-logs
// @access  Private (Admin/Superadmin)
router.get('/', checkPermission('AUDIT_VIEW_ACCESS'), getAllAccessLogs);

// @desc    Get access log statistics
// @route   GET /api/access-logs/stats
// @access  Private (Admin/Superadmin)
router.get('/stats', checkPermission('AUDIT_VIEW_ACCESS'), getAccessStats);

// @desc    Export access logs
// @route   GET /api/access-logs/export
// @access  Private (Admin/Superadmin)
router.get('/export', checkPermission('AUDIT_EXPORT'), exportAccessLogs);

// @desc    Get single access log by ID
// @route   GET /api/access-logs/:id
// @access  Private (Admin/Superadmin)
router.get('/:id', checkPermission('AUDIT_VIEW_ACCESS'), getAccessLogById);

// @desc    Create access log
// @route   POST /api/access-logs
// @access  Private (typically called by system)
router.post('/', createAccessLog);

export default router;
