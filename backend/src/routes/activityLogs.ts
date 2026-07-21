import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import {
  getAllActivityLogs,
  getActivityLogById,
  createActivityLog,
  getActivityStats,
  exportActivityLogs,
  getArchivedActivityLogs,
  getArchiveSettings,
  updateArchiveSettings,
  runArchiveNow
} from '../controllers/activityLogController';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// @desc    Get all activity logs with filters
// @route   GET /api/activity-logs
// @access  Private (Admin/Superadmin)
router.get('/', checkPermission('AUDIT_VIEW_ACTIVITY'), getAllActivityLogs);

// @desc    Get activity log statistics
// @route   GET /api/activity-logs/stats
// @access  Private (Admin/Superadmin)
router.get('/stats', checkPermission('AUDIT_VIEW_ACTIVITY'), getActivityStats);

// @desc    Export activity logs
// @route   GET /api/activity-logs/export
// @access  Private (Admin/Superadmin)
router.get('/export', checkPermission('AUDIT_EXPORT'), exportActivityLogs);

// @desc    Search archived (cold/GCS) activity logs
// @route   GET /api/activity-logs/archive
// @access  Private (Admin/Superadmin)
router.get('/archive', checkPermission('AUDIT_VIEW_ACTIVITY'), getArchivedActivityLogs);

// @desc    Archival settings (enable toggle + retention days; bucket is env-only)
// @route   GET/PUT /api/activity-logs/archive-settings
router.get('/archive-settings', checkPermission('AUDIT_VIEW_ACTIVITY'), getArchiveSettings);
router.put('/archive-settings', checkPermission('AUDIT_EXPORT'), updateArchiveSettings);

// @desc    Trigger an archival pass on demand
// @route   POST /api/activity-logs/archive/run
router.post('/archive/run', checkPermission('AUDIT_EXPORT'), runArchiveNow);

// @desc    Get single activity log by ID
// @route   GET /api/activity-logs/:id
// @access  Private (Admin/Superadmin)
router.get('/:id', checkPermission('AUDIT_VIEW_ACTIVITY'), getActivityLogById);

// @desc    Create activity log
// @route   POST /api/activity-logs
// @access  Private (typically called by system)
router.post('/', createActivityLog);

export default router;
