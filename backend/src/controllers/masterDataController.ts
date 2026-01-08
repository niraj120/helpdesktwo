import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { MasterData } from '../models/MasterData';

// @desc    Get all master data
// @route   GET /api/master-data
// @access  Private
export const getMasterData = async (req: AuthRequest, res: Response) => {
  try {
    const masterData = await MasterData.find();
    res.json({
      success: true,
      data: masterData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch master data',
    });
  }
};

// @desc    Get master data by category
// @route   GET /api/master-data/category/:category
// @access  Private
export const getMasterDataByCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.params;
    const { includeInactive } = req.query;
    
    const query: any = { category };
    if (includeInactive !== 'true') {
      query.isActive = true;
    }
    
    const masterData = await MasterData.find(query).sort({ displayOrder: 1, value: 1 });
    
    res.json({
      success: true,
      data: {
        category,
        items: masterData,
        count: masterData.length
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch master data',
    });
  }
};

// @desc    Create master data
// @route   POST /api/master-data
// @access  Private
export const createMasterData = async (req: AuthRequest, res: Response) => {
  try {
    const { category, key, value, metadata } = req.body;

    const masterData = await MasterData.create({
      category,
      key,
      value,
      metadata,
    });

    res.status(201).json({
      success: true,
      data: masterData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create master data',
    });
  }
};

// @desc    Update master data
// @route   PUT /api/master-data/:id
// @access  Private
export const updateMasterData = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { category, key, value, metadata, isActive } = req.body;

    const masterData = await MasterData.findById(id);
    if (!masterData) {
      res.status(404).json({
        success: false,
        error: 'Master data not found',
      });
      return;
    }

    masterData.category = category || masterData.category;
    masterData.key = key || masterData.key;
    masterData.value = value || masterData.value;
    masterData.metadata = metadata !== undefined ? metadata : masterData.metadata;
    masterData.isActive = isActive !== undefined ? isActive : masterData.isActive;

    await masterData.save();

    res.json({
      success: true,
      data: masterData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update master data',
    });
  }
};

// @desc    Delete master data
// @route   DELETE /api/master-data/:id
// @access  Private
export const deleteMasterData = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const masterData = await MasterData.findById(id);
    if (!masterData) {
      res.status(404).json({
        success: false,
        error: 'Master data not found',
      });
      return;
    }

    await masterData.deleteOne();

    res.json({
      success: true,
      message: 'Master data deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete master data',
    });
  }
};
