import { Request, Response } from 'express';
import { KBCategory } from '../models/KBCategory';
import { KBSubcategory } from '../models/KBSubcategory';
import { KnowledgeBaseArticle } from '../models/KnowledgeBaseArticle';

// Create KB Category (1st Level)
export const createKBCategory = async (req: Request, res: Response) => {
  try {
    const { projectId, name, description, icon, displayOrder } = req.body;
    const userId = (req as any).user.id;

    const category = await KBCategory.create({
      projectId,
      name,
      description,
      icon,
      displayOrder: displayOrder || 0,
      createdBy: userId,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: 'KB Category created successfully',
      data: category
    });
  } catch (error: any) {
    console.error('Error creating KB category:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create KB category'
    });
  }
};

// Get all KB Categories for a project
export const getKBCategories = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const categories = await KBCategory.find({
      projectId,
      isActive: true
    })
      .populate('createdBy', 'firstName lastName email')
      .sort({ displayOrder: 1, name: 1 });

    return res.json({
      success: true,
      data: categories
    });
  } catch (error: any) {
    console.error('Error fetching KB categories:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch KB categories'
    });
  }
};

// Update KB Category
export const updateKBCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, icon, displayOrder, isActive } = req.body;

    const category = await KBCategory.findByIdAndUpdate(
      id,
      { name, description, icon, displayOrder, isActive },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'KB Category not found'
      });
    }

    return res.json({
      success: true,
      message: 'KB Category updated successfully',
      data: category
    });
  } catch (error: any) {
    console.error('Error updating KB category:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update KB category'
    });
  }
};

// Delete KB Category
export const deleteKBCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if there are subcategories under this category
    const subcategoriesCount = await KBSubcategory.countDocuments({
      categoryId: id,
      isActive: true
    });

    if (subcategoriesCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with active subcategories'
      });
    }

    const category = await KBCategory.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'KB Category not found'
      });
    }

    return res.json({
      success: true,
      message: 'KB Category deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting KB category:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete KB category'
    });
  }
};
