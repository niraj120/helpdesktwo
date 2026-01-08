import { Request, Response } from 'express';
import { Priority } from '../models/master-data/Priority';

// Get all priorities (with optional projectId filter)
export const getAllPriorities = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const filter: any = {};
    
    if (projectId) {
      filter.projectId = projectId;
    }
    
    const priorities = await Priority.find(filter)
      .populate('projectId', 'name code')
      .sort({ order: 1 });
    
    // Transform to include project info
    const transformedPriorities = priorities.map(p => ({
      ...p.toObject(),
      project: p.projectId,
      projectId: (p.projectId as any)?._id || p.projectId,
    }));
    
    return res.json({
      success: true,
      data: transformedPriorities,
    });
  } catch (error) {
    console.error('Error fetching priorities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch priorities',
    });
  }
};

// Get active priorities only (with optional projectId filter)
export const getActivePriorities = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const filter: any = { isActive: true };
    
    if (projectId) {
      filter.projectId = projectId;
    }
    
    const priorities = await Priority.find(filter)
      .populate('projectId', 'name code')
      .sort({ order: 1 });
    
    const transformedPriorities = priorities.map(p => ({
      ...p.toObject(),
      project: p.projectId,
      projectId: (p.projectId as any)?._id || p.projectId,
    }));
    
    return res.json({
      success: true,
      data: transformedPriorities,
    });
  } catch (error) {
    console.error('Error fetching active priorities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch priorities',
    });
  }
};

// Get priority by ID
export const getPriorityById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const priority = await Priority.findById(id).populate('projectId', 'name code');
    
    if (!priority) {
      return res.status(404).json({
        success: false,
        message: 'Priority not found',
      });
    }
    
    return res.json({
      success: true,
      data: {
        ...priority.toObject(),
        project: priority.projectId,
        projectId: (priority.projectId as any)?._id || priority.projectId,
      },
    });
  } catch (error) {
    console.error('Error fetching priority:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch priority',
    });
  }
};

// Create new priority
export const createPriority = async (req: Request, res: Response) => {
  try {
    const { name, code, color, order, responseTime, resolutionTime, isActive, isDefault, description, projectId, projectIds } = req.body;
    
    // Support both projectId (old) and projectIds (new) for backward compatibility
    const finalProjectIds = projectIds && Array.isArray(projectIds) && projectIds.length > 0 
      ? projectIds 
      : (projectId ? [projectId] : []);
    
    if (finalProjectIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Project is required',
      });
    }
    
    // For backward compatibility, use first project for duplicate checks
    const checkProjectId = finalProjectIds[0];
    
    // Check if priority with same name or code exists for this project
    const existing = await Priority.findOne({
      projectId: checkProjectId,
      $or: [{ name }, { code: code?.toUpperCase() }],
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Priority with this name or code already exists for this project',
      });
    }
    
    const priority = new Priority({
      name,
      code: code?.toUpperCase() || name.toUpperCase().replace(/\s+/g, '_'),
      color: color || '#6b7280',
      order: order || 0,
      responseTime,
      resolutionTime,
      isActive: isActive !== false,
      isDefault: isDefault || false,
      description,
      projectId: finalProjectIds[0], // Store first project ID for backward compatibility
      createdBy: (req as any).user?.id,
    });
    
    await priority.save();
    
    // Populate project info before returning
    await priority.populate('projectId', 'name code');
    
    return res.status(201).json({
      success: true,
      message: 'Priority created successfully',
      data: {
        ...priority.toObject(),
        project: priority.projectId,
        projectId: (priority.projectId as any)?._id || priority.projectId,
      },
    });
  } catch (error) {
    console.error('Error creating priority:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create priority',
    });
  }
};

// Update priority
export const updatePriority = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, color, order, responseTime, resolutionTime, isActive, isDefault, description, projectId } = req.body;
    
    const priority = await Priority.findById(id);
    
    if (!priority) {
      return res.status(404).json({
        success: false,
        message: 'Priority not found',
      });
    }
    
    const targetProjectId = projectId || priority.projectId;
    
    // Check for duplicates if name or code changed within the same project
    if (name !== priority.name || (code && code.toUpperCase() !== priority.code)) {
      const existing = await Priority.findOne({
        _id: { $ne: id },
        projectId: targetProjectId,
        $or: [
          { name },
          { code: code?.toUpperCase() || priority.code },
        ],
      });
      
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Priority with this name or code already exists for this project',
        });
      }
    }
    
    priority.name = name || priority.name;
    priority.code = code?.toUpperCase() || priority.code;
    priority.color = color || priority.color;
    priority.order = order !== undefined ? order : priority.order;
    priority.responseTime = responseTime || priority.responseTime;
    priority.resolutionTime = resolutionTime || priority.resolutionTime;
    priority.isActive = isActive !== undefined ? isActive : priority.isActive;
    priority.isDefault = isDefault !== undefined ? isDefault : priority.isDefault;
    priority.description = description !== undefined ? description : priority.description;
    if (projectId) priority.projectId = projectId;
    priority.updatedBy = (req as any).user?.id;
    
    await priority.save();
    
    // Populate project info before returning
    await priority.populate('projectId', 'name code');
    
    return res.json({
      success: true,
      message: 'Priority updated successfully',
      data: {
        ...priority.toObject(),
        project: priority.projectId,
        projectId: (priority.projectId as any)?._id || priority.projectId,
      },
    });
  } catch (error) {
    console.error('Error updating priority:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update priority',
    });
  }
};

// Delete priority
export const deletePriority = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const priority = await Priority.findById(id);
    
    if (!priority) {
      return res.status(404).json({
        success: false,
        message: 'Priority not found',
      });
    }
    
    // Don't allow deleting default priority
    if (priority.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the default priority',
      });
    }
    
    await priority.deleteOne();
    
    return res.json({
      success: true,
      message: 'Priority deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting priority:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete priority',
    });
  }
};

// Note: seedDefaultPriorities removed - priorities are now project-specific
// Each project should create its own priority levels
