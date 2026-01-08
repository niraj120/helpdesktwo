import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { getDashboardStatistics, exportDashboardData } from '../controllers/dashboardController';

const router = express.Router();

// Get dashboard statistics
router.get(
  '/statistics',
  authMiddleware,
  checkPermission('DASHBOARD_VIEW'),
  getDashboardStatistics
);

// Export dashboard data
router.post(
  '/export',
  authMiddleware,
  checkPermission('DASHBOARD_EXPORT'),
  exportDashboardData
);

export default router;
