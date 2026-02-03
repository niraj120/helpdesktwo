import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Center } from '../models/Center';
import { Project } from '../models/Project';
import mongoose from 'mongoose';

/**
 * Get all centers for a project or all projects
 * Supports pagination for better performance
 */
export const getCenters = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, page, limit, search } = req.query;
    
    const query: any = { isActive: true };
    if (projectId) {
      query.projectId = projectId;
    }
    
    // Add search filter if provided
    if (search) {
      query.$or = [
        { centerName: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { state: { $regex: search, $options: 'i' } },
      ];
    }
    
    // Check if pagination is requested
    const isPaginated = page !== undefined || limit !== undefined;
    
    if (isPaginated) {
      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limit as string) || 50, 100); // Max 100
      const skip = (pageNum - 1) * limitNum;
      
      const [centers, total] = await Promise.all([
        Center.find(query)
          .populate('projectId', 'name')
          .sort({ centerName: 1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Center.countDocuments(query)
      ]);
      
      return res.json({
        success: true,
        data: centers,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    }
    
    // Non-paginated (for backward compatibility) - add reasonable limit
    const centers = await Center.find(query)
      .populate('projectId', 'name')
      .sort({ centerName: 1 })
      .limit(500) // Safety limit
      .lean();
    
    return res.json({
      success: true,
      data: centers,
    });
  } catch (error) {
    console.error('Get centers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch centers',
    });
  }
};

/**
 * Get single center by ID
 */
export const getCenterById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const center = await Center.findById(id)
      .populate('projectId', 'name');
    
    if (!center) {
      return res.status(404).json({
        success: false,
        message: 'Center not found',
      });
    }
    
    return res.json({
      success: true,
      data: center,
    });
  } catch (error) {
    console.error('Get center by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch center',
    });
  }
};

/**
 * Create a new center
 */
export const createCenter = async (req: AuthRequest, res: Response) => {
  try {
    const { 
      projectId, 
      centerName, 
      address, 
      city, 
      state, 
      pincode, 
      phone, 
      email, 
      workingHours, 
      latitude,
      longitude,
      features,
      mapLink,
      googleMapLink,
      contacts 
    } = req.body;
    
    // Validate required fields
    if (!projectId || !centerName || !address || !city || !state) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: projectId, centerName, address, city, state',
      });
    }
    
    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }
    
    // Check for duplicate center name in the same project
    const existingCenter = await Center.findOne({
      projectId,
      centerName: { $regex: new RegExp(`^${centerName}$`, 'i') },
    });
    
    if (existingCenter) {
      return res.status(409).json({
        success: false,
        message: `Center with name "${centerName}" already exists in this project`,
      });
    }
    
    // Create center
    const center = await Center.create({
      projectId,
      centerName,
      address,
      city,
      state,
      pincode,
      phone,
      email,
      workingHours,
      latitude,
      longitude,
      features,
      mapLink,
      googleMapLink,
      contacts,
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(req.user!.userId),
    });
    
    return res.status(201).json({
      success: true,
      message: 'Center created successfully',
      data: center,
    });
  } catch (error) {
    console.error('Create center error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create center',
    });
  }
};

/**
 * Update a center
 */
export const updateCenter = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated
    const { _id, projectId, createdBy, createdAt, isActive, ...allowedUpdates } = updateData;
    
    const center = await Center.findById(id);
    if (!center) {
      return res.status(404).json({
        success: false,
        message: 'Center not found',
      });
    }
    
    // If updating centerName, check for duplicates
    if (allowedUpdates.centerName && allowedUpdates.centerName !== center.centerName) {
      const existingCenter = await Center.findOne({
        projectId: center.projectId,
        centerName: { $regex: new RegExp(`^${allowedUpdates.centerName}$`, 'i') },
        _id: { $ne: id },
      });
      
      if (existingCenter) {
        return res.status(409).json({
          success: false,
          message: `Center with name "${allowedUpdates.centerName}" already exists in this project`,
        });
      }
    }
    
    // Update center with allowed fields
    Object.assign(center, allowedUpdates);
    center.updatedBy = new mongoose.Types.ObjectId(req.user!.userId);
    await center.save();
    
    return res.json({
      success: true,
      message: 'Center updated successfully',
      data: center,
    });
  } catch (error) {
    console.error('Update center error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update center',
    });
  }
};

/**
 * Delete a center
 */
export const deleteCenter = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const center = await Center.findById(id);
    if (!center) {
      return res.status(404).json({
        success: false,
        message: 'Center not found',
      });
    }
    
    // Soft delete - set isActive to false
    center.isActive = false;
    center.updatedBy = new mongoose.Types.ObjectId(req.user!.userId);
    await center.save();
    
    return res.json({
      success: true,
      message: 'Center deleted successfully',
    });
  } catch (error) {
    console.error('Delete center error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete center',
    });
  }
};
