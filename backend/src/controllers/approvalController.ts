import { Request, Response } from 'express';
import { ApprovalWorkflow } from '../models/ApprovalWorkflow';
import { AuthRequest } from '../middleware/auth';
import { Project } from '../models/Project';
import { Permission } from '../models/Permission';

const normalizeLevels = (levels: any[] = []) => {
  return levels.map((level, idx) => ({
    level: typeof level.level === 'number' ? level.level : idx + 1,
    approvers: Array.isArray(level.approvers) ? level.approvers : [],
    roles: Array.isArray(level.roles) ? level.roles : [],
    criteria: level.criteria,
  }));
};

// Get workflows for a project
export const getWorkflowsByProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const workflows = await ApprovalWorkflow.find({ projectId, isActive: true })
      .populate('categoryId')
      .populate('requestTypeId')
      .populate('levels.approvers', 'firstName lastName email role')
      .populate('levels.roles', 'name code')
      .sort({ createdAt: -1 });
    return res.json({ success: true, data: workflows });
  } catch (error) {
    console.error('Get workflows error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create a new workflow
export const createWorkflow = async (req: AuthRequest, res: Response) => {
  try {
    const {
      projectId,
      name,
      description,
      categoryId,
      approvalLogic,
      levels,
      autoApprove,
      status,
    } = req.body;
    const userId = req.user?.userId;

    if (!projectId || !name || !categoryId) {
      return res.status(400).json({ success: false, message: 'projectId, name, and categoryId are required' });
    }

    const [project, permission] = await Promise.all([
      Project.findById(projectId),
      Permission.findById(categoryId),
    ]);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    if (!permission || !permission.isActive) {
      return res.status(404).json({ success: false, message: 'Permission/Category not found or inactive' });
    }

    const workflow = new ApprovalWorkflow({
      projectId,
      name,
      description,
      categoryId,
      requestTypeId: categoryId, // Use same as categoryId for now
      requestTypeKey: permission.code,
      requestTypes: [permission.code],
      approvalLogic: approvalLogic || 'sequential',
      levels: normalizeLevels(levels),
      autoApprove: !!autoApprove,
      status: status || 'active',
      createdBy: userId,
    });

    await workflow.save();
    await workflow.populate([
      { path: 'categoryId' },
      { path: 'requestTypeId' },
      { path: 'levels.approvers', select: 'firstName lastName email role' },
      { path: 'levels.roles', select: 'name code' },
    ]);

    return res.status(201).json({ success: true, message: 'Workflow created', data: workflow });
  } catch (error) {
    console.error('Create workflow error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get a single workflow
export const getWorkflowById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const workflow = await ApprovalWorkflow.findById(id)
      .populate('categoryId')
      .populate('requestTypeId')
      .populate('levels.approvers', 'firstName lastName email role')
      .populate('levels.roles', 'name code');
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found' });
    return res.json({ success: true, data: workflow });
  } catch (error) {
    console.error('Get workflow error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update workflow
export const updateWorkflow = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.userId;

    const workflow = await ApprovalWorkflow.findById(id);
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found' });

    if (updates.categoryId) {
      const permission = await Permission.findById(updates.categoryId);
      if (!permission || !permission.isActive) {
        return res.status(404).json({ success: false, message: 'Permission/Category not found or inactive' });
      }
      workflow.categoryId = updates.categoryId;
      workflow.requestTypeId = updates.categoryId;
      workflow.requestTypeKey = permission.code;
      workflow.requestTypes = [permission.code];
    }

    if (updates.levels) {
      workflow.levels = normalizeLevels(updates.levels);
    }

    if (updates.name) workflow.name = updates.name;
    if (updates.description !== undefined) workflow.description = updates.description;
    if (updates.approvalLogic) workflow.approvalLogic = updates.approvalLogic;
    if (typeof updates.autoApprove === 'boolean') workflow.autoApprove = updates.autoApprove;
    if (updates.status && ['active', 'inactive'].includes(updates.status)) {
      workflow.status = updates.status;
    }

    workflow.updatedBy = userId as any;
    await workflow.save();

    const populatedWorkflow = await ApprovalWorkflow.findById(workflow._id)
      .populate('categoryId')
      .populate('requestTypeId')
      .populate('levels.approvers', 'firstName lastName email role')
      .populate('levels.roles', 'name code');

    return res.json({ success: true, message: 'Workflow updated', data: populatedWorkflow });
  } catch (error) {
    console.error('Update workflow error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete (soft) workflow
export const deleteWorkflow = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const workflow = await ApprovalWorkflow.findById(id);
    if (!workflow) return res.status(404).json({ success: false, message: 'Workflow not found' });
    workflow.isActive = false;
    workflow.status = 'inactive';
    await workflow.save();
    return res.json({ success: true, message: 'Workflow deleted' });
  } catch (error) {
    console.error('Delete workflow error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
