import { Request, Response } from 'express';
import KBLevel from '../models/KBLevel';
import KBArticleLevelMapping from '../models/KBArticleLevelMapping';
import mongoose from 'mongoose';

/**
 * Create a new KB Level
 */
export const createLevel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { levelName, levelOrder, levelIcon, status, projectIds, description } = req.body;
    const userId = (req as any).user.userId;

    // Validation
    if (!levelName || !levelOrder || !projectIds || projectIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Level name, order, and at least one project are required',
      });
      return;
    }

    // Check if level name already exists for these projects
    const existingLevel = await KBLevel.findOne({
      levelName: levelName,
      projectIds: { $in: projectIds },
    });

    if (existingLevel) {
      res.status(400).json({
        success: false,
        message: 'A level with this name already exists for one of the selected projects',
      });
      return;
    }

    // Create new level
    const newLevel = new KBLevel({
      levelName,
      levelOrder,
      levelIcon,
      status: status || 'active',
      projectIds,
      description,
      createdBy: userId,
    });

    await newLevel.save();

    res.status(201).json({
      success: true,
      message: 'KB Level created successfully',
      data: newLevel,
    });
  } catch (error: any) {
    console.error('Create KB Level error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create KB Level',
      error: error.message,
    });
  }
};

/**
 * Get all KB Levels (with optional filters)
 */
export const getLevels = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, status } = req.query;

    const filter: any = {};

    // Only add project filter if projectId is provided and not 'all' (super admin view)
    if (projectId && projectId !== 'all') {
      filter.projectIds = projectId;
    }

    if (status) {
      filter.status = status;
    }

    const levels = await KBLevel.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ levelOrder: 1 })
      .lean();

    // Optimized: Single aggregation to get article counts for all levels at once
    const levelIds = levels.map(l => l._id);
    const articleCounts = await KBArticleLevelMapping.aggregate([
      { $match: { levelId: { $in: levelIds } } },
      { $group: { _id: '$levelId', count: { $sum: 1 } } }
    ]);
    
    // Create a map of levelId -> count
    const countMap = new Map(
      articleCounts.map((ac: any) => [ac._id.toString(), ac.count])
    );
    
    // Attach counts to levels
    const levelsWithCount = levels.map((level) => ({
      ...level,
      articleCount: countMap.get(level._id.toString()) || 0,
    }));

    res.status(200).json({
      success: true,
      data: levelsWithCount,
    });
  } catch (error: any) {
    console.error('Get KB Levels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KB Levels',
      error: error.message,
    });
  }
};

/**
 * Get single KB Level by ID
 */
export const getLevelById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid level ID',
      });
      return;
    }

    const level = await KBLevel.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!level) {
      res.status(404).json({
        success: false,
        message: 'KB Level not found',
      });
      return;
    }

    const articleCount = await KBArticleLevelMapping.countDocuments({
      levelId: level._id,
    });

    res.status(200).json({
      success: true,
      data: {
        ...level.toObject(),
        articleCount: articleCount,
      },
    });
  } catch (error: any) {
    console.error('Get KB Level by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KB Level',
      error: error.message,
    });
  }
};

/**
 * Update KB Level
 */
export const updateLevel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { levelName, levelOrder, levelIcon, status, projectIds, description } = req.body;
    const userId = (req as any).user.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid level ID',
      });
      return;
    }

    const level = await KBLevel.findById(id);

    if (!level) {
      res.status(404).json({
        success: false,
        message: 'KB Level not found',
      });
      return;
    }

    // Check if new level name conflicts with existing levels
    if (levelName && levelName !== level.levelName) {
      const existingLevel = await KBLevel.findOne({
        _id: { $ne: id },
        levelName: levelName,
        projectIds: { $in: projectIds || level.projectIds },
      });

      if (existingLevel) {
        res.status(400).json({
          success: false,
          message: 'A level with this name already exists for one of the selected projects',
        });
        return;
      }
    }

    // Update fields
    if (levelName) level.levelName = levelName;
    if (levelOrder) level.levelOrder = levelOrder;
    if (levelIcon !== undefined) level.levelIcon = levelIcon;
    if (status) level.status = status;
    if (projectIds) level.projectIds = projectIds;
    if (description !== undefined) level.description = description;
    level.updatedBy = userId;

    await level.save();

    res.status(200).json({
      success: true,
      message: 'KB Level updated successfully',
      data: level,
    });
  } catch (error: any) {
    console.error('Update KB Level error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update KB Level',
      error: error.message,
    });
  }
};

/**
 * Delete KB Level
 */
export const deleteLevel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid level ID',
      });
      return;
    }

    const level = await KBLevel.findById(id);

    if (!level) {
      res.status(404).json({
        success: false,
        message: 'KB Level not found',
      });
      return;
    }

    // Check how many articles are mapped to this level
    const mappedArticlesCount = await KBArticleLevelMapping.countDocuments({
      levelId: id,
    });

    // Delete all mappings for this level
    await KBArticleLevelMapping.deleteMany({ levelId: id });

    // Delete the level
    await KBLevel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'KB Level deleted successfully',
      warning:
        mappedArticlesCount > 0
          ? `${mappedArticlesCount} article(s) were unmapped from this level`
          : undefined,
    });
  } catch (error: any) {
    console.error('Delete KB Level error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete KB Level',
      error: error.message,
    });
  }
};

/**
 * Reorder KB Levels
 */
export const reorderLevels = async (req: Request, res: Response): Promise<void> => {
  try {
    const { levels } = req.body;
    const userId = (req as any).user.userId;

    if (!levels || !Array.isArray(levels) || levels.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Levels array is required',
      });
      return;
    }

    // Update each level's order
    const updatePromises = levels.map(async (levelData: any) => {
      if (!levelData.id || !levelData.order) {
        throw new Error('Each level must have id and order');
      }

      return KBLevel.findByIdAndUpdate(
        levelData.id,
        {
          levelOrder: levelData.order,
          updatedBy: userId,
        },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      message: 'KB Levels reordered successfully',
    });
  } catch (error: any) {
    console.error('Reorder KB Levels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder KB Levels',
      error: error.message,
    });
  }
};
