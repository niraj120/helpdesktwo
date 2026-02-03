import express from 'express';
import { 
  toggleEmailConfig,
  deleteEmailConfigById,
  testEmailConfigConnection 
} from '../controllers/projectEmailConfigController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * PATCH /api/email-configs/:configId/toggle
 * Toggle email configuration on/off (Task 2.3)
 */
router.patch('/:configId/toggle', toggleEmailConfig);

/**
 * DELETE /api/email-configs/:configId
 * Delete email configuration with ticket check (Task 2.4)
 */
router.delete('/:configId', deleteEmailConfigById);

/**
 * POST /api/email-configs/:configId/test
 * Test email configuration connection (Task 2.5)
 */
router.post('/:configId/test', testEmailConfigConnection);

export default router;
