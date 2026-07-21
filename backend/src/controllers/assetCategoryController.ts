import { Request, Response } from 'express';
import { AssetCategory } from '../models/AssetCategory';
import { Project } from '../models/Project';
import { AuthRequest } from '../middleware/auth';

// Get all asset categories across all projects (for debugging/admin)
export const getAllAssetCategories = async (req: AuthRequest, res: Response) => {
  try {
    const { includeInactive } = req.query;

    const filter: any = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const assetCategories = await AssetCategory.find(filter)
      .populate('projectId', 'name code projectId')
      .sort({ projectId: 1, order: 1, name: 1 });

    console.log(`Found ${assetCategories.length} total asset categories across all projects`);

    return res.json({
      success: true,
      data: assetCategories,
      count: assetCategories.length,
    });
  } catch (error) {
    console.error('Get all asset categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all asset categories for a project
export const getAssetCategoriesByProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { includeInactive } = req.query;

    console.log(`📦 Fetching asset categories for project: ${projectId}, includeInactive: ${includeInactive}`);

    const filter: any = { projectId };
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const assetCategories = await AssetCategory.find(filter)
      .sort({ order: 1, name: 1 })
      .select('name code description color icon order isActive projectId');

    console.log(`📦 Found ${assetCategories.length} asset categories for project ${projectId}`);

    return res.json({
      success: true,
      data: assetCategories,
    });
  } catch (error) {
    console.error('Get asset categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Create a new asset category
export const createAssetCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, code, description, color, icon, order } = req.body;
    const userId = req.user?.userId;
    const userName = `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Unknown User';
    const userEmail = req.user?.email || '';

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Asset category name is required',
      });
    }

    // Auto-generate code if not provided
    let categoryCode = code;
    if (!categoryCode) {
      categoryCode = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      
      let counter = 1;
      let testCode = categoryCode;
      while (await AssetCategory.findOne({ projectId, code: testCode })) {
        testCode = `${categoryCode}_${counter}`;
        counter++;
      }
      categoryCode = testCode;
      
      console.log(`🔤 Auto-generated asset category code: ${categoryCode} from name: ${name}`);
    } else {
      categoryCode = categoryCode.toUpperCase();
    }

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check if asset category already exists by name or code
    const existingCategory = await AssetCategory.findOne({ 
      projectId,
      $or: [{ name }, { code: categoryCode }]
    });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: existingCategory.name === name 
          ? 'Asset category with this name already exists in this project'
          : 'Asset category with this code already exists in this project',
      });
    }

    const assetCategory = new AssetCategory({
      name,
      code: categoryCode,
      description,
      projectId,
      color,
      icon,
      order,
      createdBy: userId,
    });

    await assetCategory.save();

    console.log(`✅ Asset category created: ${name} (${categoryCode}) for project ${project.name}`);

    return res.status(201).json({
      success: true,
      message: 'Asset category created successfully',
      data: assetCategory,
    });
  } catch (error) {
    console.error('Create asset category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update an asset category
export const updateAssetCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, description, color, icon, order, isActive } = req.body;
    const userId = req.user?.userId;
    const userName = `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Unknown User';
    const userEmail = req.user?.email || '';
    const projectId = req.body.projectId; // Get projectId from body or use existing

    const assetCategory = await AssetCategory.findById(id);
    if (!assetCategory) {
      return res.status(404).json({
        success: false,
        message: 'Asset category not found',
      });
    }

    // Check for duplicate name or code (excluding current category)
    if (name || code) {
      const duplicateCheck: any = { 
        projectId: assetCategory.projectId,
        _id: { $ne: id }
      };
      
      const conditions = [];
      if (name) conditions.push({ name });
      if (code) conditions.push({ code: code.toUpperCase() });
      
      if (conditions.length > 0) {
        duplicateCheck.$or = conditions;
        
        const existingCategory = await AssetCategory.findOne(duplicateCheck);
        if (existingCategory) {
          return res.status(400).json({
            success: false,
            message: existingCategory.name === name
              ? 'Asset category with this name already exists in this project'
              : 'Asset category with this code already exists in this project',
          });
        }
      }
    }

    // Update fields
    if (name) assetCategory.name = name;
    if (code) assetCategory.code = code.toUpperCase();
    if (description !== undefined) assetCategory.description = description;
    if (color !== undefined) assetCategory.color = color;
    if (icon !== undefined) assetCategory.icon = icon;
    if (order !== undefined) assetCategory.order = order;
    if (isActive !== undefined) assetCategory.isActive = isActive;
    assetCategory.updatedBy = userId as any;

    await assetCategory.save();

    console.log(`✅ Asset category updated: ${assetCategory.name}`);

    return res.json({
      success: true,
      message: 'Asset category updated successfully',
      data: assetCategory,
    });
  } catch (error) {
    console.error('Update asset category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete an asset category
export const deleteAssetCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userName = `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Unknown User';
    const userEmail = req.user?.email || '';

    const assetCategory = await AssetCategory.findById(id);
    if (!assetCategory) {
      return res.status(404).json({
        success: false,
        message: 'Asset category not found',
      });
    }

    // Check if any assets are using this category
    const Asset = require('../models/Asset').Asset;
    const assetsUsingCategory = await Asset.countDocuments({ 
      category: assetCategory._id.toString()
    });

    if (assetsUsingCategory > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete asset category. ${assetsUsingCategory} asset(s) are using this category. Please update or delete those assets first.`,
      });
    }

    await AssetCategory.findByIdAndDelete(id);

    console.log(`✅ Asset category deleted: ${assetCategory.name}`);

    return res.json({
      success: true,
      message: 'Asset category deleted successfully',
    });
  } catch (error) {
    console.error('Delete asset category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
