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
import {
  requireProjectAccess,
  requireResourceProject,
} from '../middleware/requireProjectAccess';
import { ApprovalWorkflow } from '../models/ApprovalWorkflow';

const router = express.Router();
const ownsWorkflow = requireResourceProject(ApprovalWorkflow, 'id');

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
router.get('/project/:projectId', checkPermission('APPROVAL_WORKFLOWS_VIEW'), requireProjectAccess('projectId'), getWorkflowsByProject);

// Create a new workflow (projectId in body)
router.post(
  '/workflows',
  checkPermission('APPROVAL_WORKFLOWS_CREATE'),
  requireProjectAccess('projectId'),
  createWorkflow
);

// Legacy create
router.post('/', checkPermission('APPROVAL_WORKFLOWS_CREATE'), requireProjectAccess('projectId'), createWorkflow);

// Get a single workflow
router.get('/:id', checkPermission('APPROVAL_WORKFLOWS_VIEW'), ownsWorkflow, getWorkflowById);

// Update a workflow (updated with permission)
router.put(
  '/workflows/:id',
  checkPermission('APPROVAL_WORKFLOWS_EDIT'),
  ownsWorkflow,
  updateWorkflow
);

// Legacy update
router.put('/:id', checkPermission('APPROVAL_WORKFLOWS_EDIT'), ownsWorkflow, updateWorkflow);

// Delete (soft) a workflow (updated with permission)
router.delete(
  '/workflows/:id',
  checkPermission('APPROVAL_WORKFLOWS_DELETE'),
  ownsWorkflow,
  deleteWorkflow
);

// Legacy delete
router.delete('/:id', checkPermission('APPROVAL_WORKFLOWS_DELETE'), ownsWorkflow, deleteWorkflow);

export default router;
