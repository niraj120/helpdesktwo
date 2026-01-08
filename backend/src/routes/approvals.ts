import express from 'express';
import {
  getWorkflowsByProject,
  createWorkflow,
  getWorkflowById,
  updateWorkflow,
  deleteWorkflow,
} from '../controllers/approvalController';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';

const router = express.Router();

// Apply authentication to all routes
router.use(authMiddleware);

// ===========================
// APPROVAL WORKFLOW ROUTES (Admin Interface)
// ===========================

// Get all workflows (updated with permission)
router.get(
  '/workflows',
  checkPermission('APPROVAL_WORKFLOWS_VIEW'),
  getWorkflowsByProject
);

// Legacy route - Get workflows for a project
router.get('/project/:projectId', checkPermission('APPROVAL_WORKFLOWS_VIEW'), getWorkflowsByProject);

// Create a new workflow (updated with permission)
router.post(
  '/workflows',
  checkPermission('APPROVAL_WORKFLOWS_CREATE'),
  createWorkflow
);

// Legacy create
router.post('/', checkPermission('APPROVAL_WORKFLOWS_CREATE'), createWorkflow);

// Get a single workflow
router.get('/:id', checkPermission('APPROVAL_WORKFLOWS_VIEW'), getWorkflowById);

// Update a workflow (updated with permission)
router.put(
  '/workflows/:id',
  checkPermission('APPROVAL_WORKFLOWS_EDIT'),
  updateWorkflow
);

// Legacy update
router.put('/:id', checkPermission('APPROVAL_WORKFLOWS_EDIT'), updateWorkflow);

// Delete (soft) a workflow (updated with permission)
router.delete(
  '/workflows/:id',
  checkPermission('APPROVAL_WORKFLOWS_DELETE'),
  deleteWorkflow
);

// Legacy delete
router.delete('/:id', checkPermission('APPROVAL_WORKFLOWS_DELETE'), deleteWorkflow);

export default router;
