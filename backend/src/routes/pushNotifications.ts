import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getVapidKey, subscribe, unsubscribe } from '../controllers/pushNotificationController';

const router = Router();

// Public — frontend needs the VAPID public key before auth
router.get('/vapid-public-key', getVapidKey);

// Protected
router.post('/subscribe', authMiddleware, subscribe);
router.delete('/unsubscribe', authMiddleware, unsubscribe);

export default router;
