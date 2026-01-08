import { Request, Response } from 'express';
import { Status } from '../models/Status';
import { Project } from '../models/Project';
import { AuthRequest } from '../middleware/auth';
import { logActivity } from '../utils/logger';

// Get all statuses across all projects (for debugging/admin)
export const getAllStatuses = async (req: AuthRequest, res: Response) => {
  try {
    const { includeInactive } = req.query;

    const filter: any = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const statuses = await Status.find(filter)
      .populate('projectId', 'name code projectId')
      .sort({ projectId: 1, displayOrder: 1, name: 1 });

    console.log(`Found ${statuses.length} total statuses across all projects`);

    return res.json({
      success: true,
      data: statuses,
      count: statuses.length,
    });
  } catch (error) {
    console.error('Get all statuses error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all statuses for a project
export const getStatusesByProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { includeInactive } = req.query;

    console.log(`🏷️  Fetching statuses for project: ${projectId}, includeInactive: ${includeInactive}`);

    const filter: any = { projectId };
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const statuses = await Status.find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .select('name code color isDefault isClosed displayOrder description isActive projectId');

    console.log(`🏷️  Found ${statuses.length} statuses for project ${projectId}`);
    
    // Also check if there are ANY statuses in the database
    const totalStatuses = await Status.countDocuments({});
    console.log(`🏷️  Total statuses in database: ${totalStatuses}`);
    
    if (totalStatuses > 0 && statuses.length === 0) {
      // Let's see what projectIds exist
      const allProjectIds = await Status.distinct('projectId');
      console.log(`🏷️  Statuses exist for these project IDs:`, allProjectIds);
    }

    return res.json({
      success: true,
      data: statuses,
    });
  } catch (error) {
    console.error('Get statuses error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Create a new status
export const createStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, code, color, isDefault, isClosed, displayOrder, description } = req.body;
    const userId = req.user?.userId;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Status name and code are required',
      });
    }

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check if status code already exists for this project
    const existingStatus = await Status.findOne({ code: code.toUpperCase(), projectId });
    if (existingStatus) {
      return res.status(400).json({
        success: false,
        message: 'Status with this code already exists in this project',
      });
    }

    // If this is set as default, unset other default statuses
    if (isDefault) {
      await Status.updateMany(
        { projectId, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const status = new Status({
      name,
      code: code.toUpperCase(),
      color: color || '#3b82f6',
      projectId,
      isDefault: isDefault || false,
      isClosed: isClosed || false,
      displayOrder: displayOrder || 0,
      description,
      createdBy: userId,
    });

    await status.save();
    
    // Log activity
    try {
      const currentUser = req.user;
      if (currentUser) {
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'create',
          entity: 'status',
          entityId: status._id.toString(),
          entityName: status.name,
          projectId: projectId,
          projectName: project.name,
          description: `Status ${status.name} (${status.code}) created in project ${project.name}`,
          req,
          metadata: { code: status.code, isDefault: status.isDefault, isClosed: status.isClosed }
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return res.status(201).json({
      success: true,
      message: 'Status created successfully',
      data: status,
    });
  } catch (error) {
    console.error('Create status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update a status
export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId } = req.params;
    const { name, code, color, isDefault, isClosed, displayOrder, description, isActive } = req.body;
    const userId = req.user?.userId;

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Status not found',
      });
    }

    // If setting this as default, unset other default statuses
    if (isDefault && !status.isDefault) {
      await Status.updateMany(
        { projectId: status.projectId, isDefault: true, _id: { $ne: statusId } },
        { $set: { isDefault: false } }
      );
    }

    // Update status fields
    if (name !== undefined) status.name = name;
    if (code !== undefined) status.code = code.toUpperCase();
    if (color !== undefined) status.color = color;
    if (isDefault !== undefined) status.isDefault = isDefault;
    if (isClosed !== undefined) status.isClosed = isClosed;
    if (displayOrder !== undefined) status.displayOrder = displayOrder;
    if (description !== undefined) status.description = description;
    if (isActive !== undefined) status.isActive = isActive;
    status.updatedBy = userId as any;

    await status.save();
    
    // Log activity
    try {
      const currentUser = req.user;
      if (currentUser) {
        const projectData = await Project.findById(status.projectId);
        const changes = [];
        if (name !== undefined) changes.push({ field: 'name', oldValue: 'previous', newValue: name });
        if (code !== undefined) changes.push({ field: 'code', oldValue: 'previous', newValue: code });
        if (isDefault !== undefined) changes.push({ field: 'isDefault', oldValue: !isDefault, newValue: isDefault });
        
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'update',
          entity: 'status',
          entityId: status._id.toString(),
          entityName: status.name,
          projectId: status.projectId.toString(),
          projectName: projectData?.name,
          changes: changes.length > 0 ? changes : undefined,
          description: `Status ${status.name} updated`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return res.json({
      success: true,
      message: 'Status updated successfully',
      data: status,
    });
  } catch (error) {
    console.error('Update status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete a status
export const deleteStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId } = req.params;

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Status not found',
      });
    }

    // Prevent deletion of default status
    if (status.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the default status. Please set another status as default first.',
      });
    }

    // Soft delete - just mark as inactive
    const statusName = status.name;
    const statusCode = status.code;
    const projectId = status.projectId;
    
    status.isActive = false;
    await status.save();
    
    // Log activity
    try {
      const currentUser = req.user;
      if (currentUser) {
        const projectData = await Project.findById(projectId);
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'delete',
          entity: 'status',
          entityId: status._id.toString(),
          entityName: statusName,
          projectId: projectId.toString(),
          projectName: projectData?.name,
          description: `Status ${statusName} (${statusCode}) deleted (soft delete)`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return res.json({
      success: true,
      message: 'Status deleted successfully',
    });
  } catch (error) {
    console.error('Delete status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get a single status
export const getStatusById = async (req: Request, res: Response) => {
  try {
    const { statusId } = req.params;

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({
        success: false,
        message: 'Status not found',
      });
    }

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Get status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Reorder statuses
export const reorderStatuses = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { statusIds } = req.body; // Array of status IDs in the new order

    if (!Array.isArray(statusIds)) {
      return res.status(400).json({
        success: false,
        message: 'statusIds must be an array',
      });
    }

    // Update display order for each status
    const updatePromises = statusIds.map((statusId, index) =>
      Status.findByIdAndUpdate(statusId, { displayOrder: index })
    );

    await Promise.all(updatePromises);

    return res.json({
      success: true,
      message: 'Statuses reordered successfully',
    });
  } catch (error) {
    console.error('Reorder statuses error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
