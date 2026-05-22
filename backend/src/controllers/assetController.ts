import { Request, Response } from 'express';
import { Asset } from '../models/Asset';
import { CenterAssetMapping } from '../models/CenterAssetMapping';
import { Project } from '../models/Project';
import { logActivity } from '../utils/logger';

// @desc    Create new asset
// @route   POST /api/assets
// @access  Private (Super Admin)
export const createAsset = async (req: Request, res: Response) => {
  try {
    const { projectId, name, description, category, predefinedCount, unit } = req.body;
    const user = (req as any).user;
    const userId = user.userId;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
    const userEmail = user.email || '';

    if (!projectId || !name || predefinedCount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Project, name and predefined count are required'
      });
    }

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check if asset with same name already exists in this project
    const existingAsset = await Asset.findOne({ 
      projectId,
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    if (existingAsset) {
      return res.status(400).json({
        success: false,
        message: 'Asset with this name already exists in this project'
      });
    }

    const asset = await Asset.create({
      projectId,
      name,
      description,
      category,
      predefinedCount,
      unit: unit || 'units',
      createdBy: userId
    });

    await logActivity({
      userId,
      userName,
      userEmail,
      action: 'create',
      entity: 'Asset',
      entityId: asset._id.toString(),
      entityName: name,
      projectId: projectId,
      projectName: project.name,
      description: `Asset "${name}" created with predefined count ${predefinedCount}${unit ? ` ${unit}` : ''}`,
      req,
    });

    return res.status(201).json({
      success: true,
      message: 'Asset created successfully',
      data: asset
    });
  } catch (error: any) {
    console.error('Error creating asset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create asset',
      error: error.message
    });
  }
};

// @desc    Get all assets
// @route   GET /api/assets
// @access  Private
// OPTIMIZED: Added pagination support
export const getAllAssets = async (req: Request, res: Response) => {
  try {
    const { projectId, isActive, search, page, limit } = req.query;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      });
    }

    const filter: any = { projectId };
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    // Check if pagination is requested
    const isPaginated = page !== undefined || limit !== undefined;
    
    if (isPaginated) {
      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limit as string) || 50, 100); // Max 100
      const skip = (pageNum - 1) * limitNum;
      
      const [assets, total] = await Promise.all([
        Asset.find(filter)
          .populate('createdBy', 'firstName lastName email')
          .populate('projectId', 'projectName')
          .populate('category', 'name code color icon')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Asset.countDocuments(filter)
      ]);

      return res.status(200).json({
        success: true,
        data: assets,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    }

    // Non-paginated (for backward compatibility) - add safety limit
    const assets = await Asset.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .populate('projectId', 'projectName')
      .populate('category', 'name code color icon')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      success: true,
      data: assets
    });
  } catch (error: any) {
    console.error('Error fetching assets:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch assets',
      error: error.message
    });
  }
};

// @desc    Get asset by ID
// @route   GET /api/assets/:id
// @access  Private
export const getAssetById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const asset = await Asset.findById(id)
      .populate('createdBy', 'firstName lastName email')
      .populate('category', 'name code color icon');

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: asset
    });
  } catch (error: any) {
    console.error('Error fetching asset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch asset',
      error: error.message
    });
  }
};

// @desc    Update asset
// @route   PUT /api/assets/:id
// @access  Private (Super Admin)
export const updateAsset = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category, predefinedCount, unit, isActive } = req.body;
    const user = (req as any).user;
    const userId = user.userId;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
    const userEmail = user.email || '';

    const asset = await Asset.findById(id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Check if name is being changed and if it conflicts with existing asset in the same project
    if (name && name !== asset.name) {
      const existingAsset = await Asset.findOne({
        projectId: asset.projectId,
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: id }
      });
      
      if (existingAsset) {
        return res.status(400).json({
          success: false,
          message: 'Asset with this name already exists in this project'
        });
      }
    }

    // Capture old values for audit trail
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
    if (name && name !== asset.name)                     changes.push({ field: 'name', oldValue: asset.name, newValue: name });
    if (description !== undefined && description !== asset.description) changes.push({ field: 'description', oldValue: asset.description, newValue: description });
    if (category !== undefined && String(category) !== String(asset.category)) changes.push({ field: 'category', oldValue: asset.category, newValue: category });
    if (predefinedCount !== undefined && predefinedCount !== asset.predefinedCount) changes.push({ field: 'predefinedCount', oldValue: asset.predefinedCount, newValue: predefinedCount });
    if (unit && unit !== asset.unit)                     changes.push({ field: 'unit', oldValue: asset.unit, newValue: unit });
    if (isActive !== undefined && isActive !== asset.isActive) changes.push({ field: 'isActive', oldValue: asset.isActive, newValue: isActive });

    // Update fields
    if (name) asset.name = name;
    if (description !== undefined) asset.description = description;
    if (category !== undefined) asset.category = category;
    if (predefinedCount !== undefined) asset.predefinedCount = predefinedCount;
    if (unit) asset.unit = unit;
    if (isActive !== undefined) asset.isActive = isActive;

    await asset.save();

    await logActivity({
      userId,
      userName,
      userEmail,
      action: 'update',
      entity: 'Asset',
      entityId: asset._id.toString(),
      entityName: asset.name,
      projectId: asset.projectId?.toString(),
      changes,
      description: changes.length > 0
        ? `Asset "${asset.name}" updated: ${changes.map(c => c.field).join(', ')}`
        : `Asset "${asset.name}" updated (no field changes)`,
      req,
    });

    return res.status(200).json({
      success: true,
      message: 'Asset updated successfully',
      data: asset
    });
  } catch (error: any) {
    console.error('Error updating asset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update asset',
      error: error.message
    });
  }
};

// @desc    Delete asset
// @route   DELETE /api/assets/:id
// @access  Private (Super Admin)
export const deleteAsset = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const userId = user.userId;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User';
    const userEmail = user.email || '';

    const asset = await Asset.findById(id);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    // Check if asset is mapped to any centers
    const mappingCount = await CenterAssetMapping.countDocuments({ assetId: id });

    if (mappingCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete asset. It is currently mapped to ${mappingCount} center(s). Please remove all mappings first.`
      });
    }

    // Log before deletion so we retain asset info
    await logActivity({
      userId,
      userName,
      userEmail,
      action: 'delete',
      entity: 'Asset',
      entityId: asset._id.toString(),
      entityName: asset.name,
      projectId: asset.projectId?.toString(),
      description: `Asset "${asset.name}" deleted`,
      metadata: {
        predefinedCount: asset.predefinedCount,
        unit: asset.unit,
        category: asset.category,
        isActive: asset.isActive,
      },
      req,
    });

    await Asset.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Asset deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting asset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete asset',
      error: error.message
    });
  }
};

// @desc    Get asset categories
// @route   GET /api/assets/categories/list
// @access  Private
export const getAssetCategories = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    
    const filter: any = {};
    if (projectId) {
      filter.projectId = projectId;
    }
    
    const allCategories = await Asset.distinct('category', filter);
    const categories = allCategories.filter((cat: any) => cat && cat !== null && cat !== '');

    return res.status(200).json({
      success: true,
      data: categories.sort()
    });
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};
