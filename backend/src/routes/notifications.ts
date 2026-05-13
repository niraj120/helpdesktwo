import { Router } from 'express';
import { 
  getNotifications,
  getUnreadCount,
  markNotificationAsRead, 
  markAllNotificationsAsRead,
} from '../controllers/notificationController';
import { auth } from '../middleware/auth';

const router = Router();

// GET /api/notifications
router.get('/', auth, getNotifications);

// GET /api/notifications/unread-count
router.get('/unread-count', auth, getUnreadCount);

// PATCH /api/notifications/:id/read
router.patch('/:id/read', auth, markNotificationAsRead);

// POST /api/notifications/read-all
router.post('/read-all', auth, markAllNotificationsAsRead);

export default router;
