import express from 'express';
import {
  getStatusesByProject,
  getAllStatuses,
  createStatus,
  updateStatus,
  deleteStatus,
  getStatusById,
  reorderStatuses,
} from '../controllers/statusController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// Get all statuses (admin/debug endpoint)
router.get('/all', authMiddleware, getAllStatuses);

// Get all statuses for a project (agents need this to change ticket status)
router.get('/project/:projectId', authMiddleware, checkPermission(['TICKET_VIEW_ALL', 'MASTER_DATA_VIEW', 'View Own Tickets', 'Change Ticket Status']), getStatusesByProject);

// Create new status
router.post('/project/:projectId', authMiddleware, checkPermission(['MASTER_DATA_MANAGE_STATUSES', 'TICKET_CONFIG_MANAGE_STATUSES']), createStatus);

// Reorder statuses
router.put('/project/:projectId/reorder', authMiddleware, checkPermission(['MASTER_DATA_MANAGE_STATUSES', 'TICKET_CONFIG_MANAGE_STATUSES']), reorderStatuses);

// Get single status
router.get('/:statusId', authMiddleware, checkPermission('MASTER_DATA_VIEW'), getStatusById);

// Update a status
router.put('/:statusId', authMiddleware, checkPermission(['MASTER_DATA_MANAGE_STATUSES', 'TICKET_CONFIG_MANAGE_STATUSES']), updateStatus);

// Delete a status
router.delete('/:statusId', authMiddleware, checkPermission(['MASTER_DATA_MANAGE_STATUSES', 'TICKET_CONFIG_MANAGE_STATUSES']), deleteStatus);

export default router;
