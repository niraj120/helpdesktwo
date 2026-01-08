import { Request, Response } from 'express';
import { KBSubcategory } from '../models/KBSubcategory';
import { KnowledgeBaseArticle } from '../models/KnowledgeBaseArticle';

// Create KB Subcategory (2nd Level)
export const createKBSubcategory = async (req: Request, res: Response) => {
  try {
    const { projectId, categoryId, name, description, displayOrder } = req.body;
    const userId = (req as any).user.id;

    const subcategory = await KBSubcategory.create({
      projectId,
      categoryId,
      name,
      description,
      displayOrder: displayOrder || 0,
      createdBy: userId,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: 'KB Subcategory created successfully',
      data: subcategory
    });
  } catch (error: any) {
    console.error('Error creating KB subcategory:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create KB subcategory'
    });
  }
};

// Get all KB Subcategories for a category
export const getKBSubcategories = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;

    const subcategories = await KBSubcategory.find({
      categoryId,
      isActive: true
    })
      .populate('createdBy', 'firstName lastName email')
      .populate('categoryId', 'name')
      .sort({ displayOrder: 1, name: 1 });

    return res.json({
      success: true,
      data: subcategories
    });
  } catch (error: any) {
    console.error('Error fetching KB subcategories:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch KB subcategories'
    });
  }
};

// Get all KB Subcategories for a project
export const getKBSubcategoriesByProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const subcategories = await KBSubcategory.find({
      projectId,
      isActive: true
    })
      .populate('createdBy', 'firstName lastName email')
      .populate('categoryId', 'name')
      .sort({ displayOrder: 1, name: 1 });

    return res.json({
      success: true,
      data: subcategories
    });
  } catch (error: any) {
    console.error('Error fetching KB subcategories:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch KB subcategories'
    });
  }
};

// Update KB Subcategory
export const updateKBSubcategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, displayOrder, isActive } = req.body;

    const subcategory = await KBSubcategory.findByIdAndUpdate(
      id,
      { name, description, displayOrder, isActive },
      { new: true, runValidators: true }
    );

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'KB Subcategory not found'
      });
    }

    return res.json({
      success: true,
      message: 'KB Subcategory updated successfully',
      data: subcategory
    });
  } catch (error: any) {
    console.error('Error updating KB subcategory:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update KB subcategory'
    });
  }
};

// Delete KB Subcategory
export const deleteKBSubcategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if there are articles under this subcategory
    const articlesCount = await KnowledgeBaseArticle.countDocuments({
      subcategoryId: id,
      isActive: true
    });

    if (articlesCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete subcategory with active articles'
      });
    }

    const subcategory = await KBSubcategory.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: 'KB Subcategory not found'
      });
    }

    return res.json({
      success: true,
      message: 'KB Subcategory deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting KB subcategory:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete KB subcategory'
    });
  }
};
