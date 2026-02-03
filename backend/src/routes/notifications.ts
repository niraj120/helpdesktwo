import { Router } from 'express';
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from '../controllers/notificationController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// @desc    Get notifications for current user
// @route   GET /api/notifications
// @access  Private
router.get('/', authMiddleware, getNotifications);

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
router.patch('/:id/read', authMiddleware, markNotificationAsRead);

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/mark-all-read
// @access  Private
router.patch('/mark-all-read', authMiddleware, markAllNotificationsAsRead);

export default router;
