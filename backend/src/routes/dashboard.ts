import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { attachProjectContext } from '../middleware/projectScope';
import { getDashboardStatistics, exportDashboardData } from '../controllers/dashboardController';

const router = express.Router();

// Get dashboard statistics (supports both single and unified view)
router.get(
  '/statistics',
  authMiddleware,
  attachProjectContext, // Attach project context
  checkPermission('DASHBOARD_VIEW'),
  getDashboardStatistics
);

// Export dashboard data
router.post(
  '/export',
  authMiddleware,
  attachProjectContext, // Attach project context
  checkPermission('DASHBOARD_EXPORT'),
  exportDashboardData
);

export default router;
