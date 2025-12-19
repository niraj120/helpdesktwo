import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { CenterAssetMapping } from '../models/CenterAssetMapping';
import { Asset } from '../models/Asset';
import { Project } from '../models/Project';

// Configure multer for asset photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/asset-photos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'asset-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadAssetPhotos = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
}).array('photos', 10); // Max 10 photos

// @desc    Map assets to centers (bulk)
// @route   POST /api/center-assets/bulk-map
// @access  Private (Super Admin)
export const bulkMapAssets = async (req: Request, res: Response) => {
  try {
    const { assetIds, projectIds, applyToAllCenters } = req.body;
    const userId = (req as any).user.userId;

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Asset IDs are required'
      });
    }

    let targetProjectIds = projectIds;

    // If applyToAllCenters is true, get all active projects
    if (applyToAllCenters) {
      const allProjects = await Project.find({ isActive: true }, '_id');
      targetProjectIds = allProjects.map(p => p._id.toString());
    }

    if (!targetProjectIds || !Array.isArray(targetProjectIds) || targetProjectIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Project IDs are required'
      });
    }

    const mappings = [];
    const errors = [];

    for (const assetId of assetIds) {
      // Verify asset exists
      const asset = await Asset.findById(assetId);
      if (!asset) {
        errors.push(`Asset ${assetId} not found`);
        continue;
      }

      for (const projectId of targetProjectIds) {
        try {
          // Check if mapping already exists
          const existingMapping = await CenterAssetMapping.findOne({
            projectId,
            assetId
          });

          if (existingMapping) {
            mappings.push(existingMapping);
          } else {
            // Create new mapping with predefined count
            const newMapping = await CenterAssetMapping.create({
              projectId,
              assetId,
              totalAssigned: asset.predefinedCount,
              assetUsed: 0,
              assetNotUsed: asset.predefinedCount,
              workingAsset: 0,
              notWorkingAsset: 0,
              photos: [],
              lastUpdatedBy: userId
            });
            mappings.push(newMapping);
          }
        } catch (error: any) {
          errors.push(`Error mapping asset ${assetId} to project ${projectId}: ${error.message}`);
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: `Successfully mapped ${mappings.length} asset(s) to center(s)`,
      data: {
        mappings,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error: any) {
    console.error('Error bulk mapping assets:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to map assets',
      error: error.message
    });
  }
};

// @desc    Get center asset mappings
// @route   GET /api/center-assets
// @access  Private
export const getCenterAssetMappings = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const user = (req as any).user;

    const filter: any = {};

    // If projectId is provided, filter by it
    if (projectId) {
      filter.projectId = projectId;
    } else if (user.projectId) {
      // If user has projectId, filter by their project
      filter.projectId = user.projectId;
    }

    const mappings = await CenterAssetMapping.find(filter)
      .populate('projectId', 'name customUrlPath')
      .populate('assetId', 'name description category unit')
      .populate('lastUpdatedBy', 'firstName lastName email')
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      data: mappings
    });
  } catch (error: any) {
    console.error('Error fetching center asset mappings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch mappings',
      error: error.message
    });
  }
};

// @desc    Get center asset mapping by ID
// @route   GET /api/center-assets/:id
// @access  Private
export const getCenterAssetMappingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const mapping = await CenterAssetMapping.findById(id)
      .populate('projectId', 'name customUrlPath')
      .populate('assetId', 'name description category unit predefinedCount')
      .populate('lastUpdatedBy', 'firstName lastName email');

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Asset mapping not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: mapping
    });
  } catch (error: any) {
    console.error('Error fetching center asset mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch mapping',
      error: error.message
    });
  }
};

// @desc    Update center asset mapping
// @route   PUT /api/center-assets/:id
// @access  Private
export const updateCenterAssetMapping = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { totalAssigned, assetUsed, assetNotUsed, workingAsset } = req.body;
    const userId = (req as any).user.userId;

    const mapping = await CenterAssetMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Asset mapping not found'
      });
    }

    // Update fields
    if (totalAssigned !== undefined) mapping.totalAssigned = totalAssigned;
    if (assetUsed !== undefined) mapping.assetUsed = assetUsed;
    if (assetNotUsed !== undefined) mapping.assetNotUsed = assetNotUsed;
    if (workingAsset !== undefined) mapping.workingAsset = workingAsset;
    
    mapping.lastUpdatedBy = userId;

    await mapping.save();

    const updatedMapping = await CenterAssetMapping.findById(id)
      .populate('projectId', 'name customUrlPath')
      .populate('assetId', 'name description category unit')
      .populate('lastUpdatedBy', 'firstName lastName email');

    return res.status(200).json({
      success: true,
      message: 'Asset mapping updated successfully',
      data: updatedMapping
    });
  } catch (error: any) {
    console.error('Error updating center asset mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update mapping',
      error: error.message
    });
  }
};

// @desc    Upload photos for center asset mapping
// @route   POST /api/center-assets/:id/photos
// @access  Private
export const uploadCenterAssetPhotos = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    const mapping = await CenterAssetMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Asset mapping not found'
      });
    }

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No photos uploaded'
      });
    }

    // Add photos to mapping
    const photos = (req.files as Express.Multer.File[]).map(file => ({
      filename: file.filename,
      path: `/uploads/asset-photos/${file.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    }));

    mapping.photos.push(...photos);
    mapping.lastUpdatedBy = userId;
    await mapping.save();

    return res.status(200).json({
      success: true,
      message: 'Photos uploaded successfully',
      data: photos
    });
  } catch (error: any) {
    console.error('Error uploading photos:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload photos',
      error: error.message
    });
  }
};

// @desc    Delete photo from center asset mapping
// @route   DELETE /api/center-assets/:id/photos/:photoIndex
// @access  Private
export const deleteCenterAssetPhoto = async (req: Request, res: Response) => {
  try {
    const { id, photoIndex } = req.params;
    const userId = (req as any).user.userId;

    const mapping = await CenterAssetMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Asset mapping not found'
      });
    }

    const index = parseInt(photoIndex);
    if (isNaN(index) || index < 0 || index >= mapping.photos.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid photo index'
      });
    }

    // Delete physical file
    const photo = mapping.photos[index];
    const filePath = path.join(__dirname, '../../', photo.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from array
    mapping.photos.splice(index, 1);
    mapping.lastUpdatedBy = userId;
    await mapping.save();

    return res.status(200).json({
      success: true,
      message: 'Photo deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting photo:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete photo',
      error: error.message
    });
  }
};

// @desc    Delete center asset mapping
// @route   DELETE /api/center-assets/:id
// @access  Private (Super Admin)
export const deleteCenterAssetMapping = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const mapping = await CenterAssetMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: 'Asset mapping not found'
      });
    }

    // Delete all physical photo files
    for (const photo of mapping.photos) {
      const filePath = path.join(__dirname, '../../', photo.path);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`Failed to delete file: ${filePath}`, error);
        }
      }
    }

    await CenterAssetMapping.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Asset mapping deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting center asset mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete mapping',
      error: error.message
    });
  }
};

// @desc    Get asset mapping statistics
// @route   GET /api/center-assets/stats/summary
// @access  Private
export const getAssetMappingStats = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const user = (req as any).user;

    const filter: any = {};
    if (projectId) {
      filter.projectId = projectId;
    } else if (user.projectId) {
      filter.projectId = user.projectId;
    }

    const stats = await CenterAssetMapping.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAssignedSum: { $sum: '$totalAssigned' },
          assetUsedSum: { $sum: '$assetUsed' },
          assetNotUsedSum: { $sum: '$assetNotUsed' },
          workingAssetSum: { $sum: '$workingAsset' },
          notWorkingAssetSum: { $sum: '$notWorkingAsset' },
          totalMappings: { $sum: 1 }
        }
      }
    ]);

    const result = stats[0] || {
      totalAssignedSum: 0,
      assetUsedSum: 0,
      assetNotUsedSum: 0,
      workingAssetSum: 0,
      notWorkingAssetSum: 0,
      totalMappings: 0
    };

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};
