import { Request, Response } from 'express';
import { Category } from '../models/Category';
import { Project } from '../models/Project';
import { AuthRequest } from '../middleware/auth';
import { logActivity } from '../utils/logger';

// Get all categories across all projects (for debugging/admin)
export const getAllCategories = async (req: AuthRequest, res: Response) => {
  try {
    const { includeInactive } = req.query;

    const filter: any = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const categories = await Category.find(filter)
      .populate('projectId', 'name code projectId')
      .sort({ projectId: 1, order: 1, name: 1 });

    console.log(`Found ${categories.length} total categories across all projects`);

    return res.json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error) {
    console.error('Get all categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get all categories for a project
export const getCategoriesByProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { includeInactive } = req.query;

    console.log(`📁 Fetching categories for project: ${projectId}, includeInactive: ${includeInactive}`);

    const filter: any = { projectId };
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const categories = await Category.find(filter)
      .sort({ order: 1, name: 1 })
      .select('name description color icon order isActive projectId');

    console.log(`📁 Found ${categories.length} categories for project ${projectId}`);
    
    // Also check if there are ANY categories in the database
    const totalCategories = await Category.countDocuments({});
    console.log(`📁 Total categories in database: ${totalCategories}`);
    
    if (totalCategories > 0 && categories.length === 0) {
      // Let's see what projectIds exist
      const allProjectIds = await Category.distinct('projectId');
      console.log(`📁 Categories exist for these project IDs:`, allProjectIds);
    }

    return res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Get categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Create a new category
export const createCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, code, description, color, icon, order, defaultPriority } = req.body;
    const userId = req.user?.userId;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    // Auto-generate code if not provided
    let categoryCode = code;
    if (!categoryCode) {
      // Generate code from name: convert to uppercase, replace spaces with underscores
      categoryCode = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
      
      // Ensure uniqueness by appending number if needed
      let counter = 1;
      let testCode = categoryCode;
      while (await Category.findOne({ projectId, code: testCode })) {
        testCode = `${categoryCode}_${counter}`;
        counter++;
      }
      categoryCode = testCode;
      
      console.log(`🔤 Auto-generated category code: ${categoryCode} from name: ${name}`);
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

    // Check if category already exists by name or code
    const existingCategory = await Category.findOne({ 
      projectId,
      $or: [{ name }, { code: categoryCode }]
    });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: existingCategory.name === name 
          ? 'Category with this name already exists in this project'
          : 'Category with this code already exists in this project',
      });
    }

    const category = new Category({
      name,
      code: categoryCode,
      description,
      projectId,
      color,
      icon,
      order,
      defaultPriority,
      createdBy: userId,
    });

    await category.save();

    // Also update project configuration to include this category in onlineFormFields
    const categoryField = project.configuration?.ticketSubmissionSettings?.onlineFormFields?.find(
      (field: any) => field.fieldName === 'Category'
    );

    if (categoryField) {
      if (!categoryField.options) {
        categoryField.options = [];
      }
      if (!categoryField.options.includes(name)) {
        categoryField.options.push(name);
        await project.save();
      }
    } else {
      // Create category field if it doesn't exist
      if (!project.configuration) {
        project.configuration = {};
      }
      if (!project.configuration.ticketSubmissionSettings) {
        project.configuration.ticketSubmissionSettings = {};
      }
      if (!project.configuration.ticketSubmissionSettings.onlineFormFields) {
        project.configuration.ticketSubmissionSettings.onlineFormFields = [];
      }
      project.configuration.ticketSubmissionSettings.onlineFormFields.push({
        fieldName: 'Category',
        fieldType: 'dropdown',
        required: true,
        placeholder: 'Select category',
        options: [name],
      });
      await project.save();
    }
    
    // Log activity
    try {
      const currentUser = req.user;
      if (currentUser) {
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'create',
          entity: 'category',
          entityId: category._id.toString(),
          entityName: category.name,
          projectId: projectId,
          projectName: project.name,
          description: `Category ${category.name} created in project ${project.name}`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    });
  } catch (error) {
    console.error('Create category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update a category
export const updateCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { name, code, description, color, icon, order, isActive, defaultPriority } = req.body;
    const userId = req.user?.userId;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const oldName = category.name;

    // Check for duplicate name or code if changing
    if (name && name !== category.name) {
      const existingByName = await Category.findOne({ 
        name, 
        projectId: category.projectId,
        _id: { $ne: categoryId }
      });
      if (existingByName) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists in this project',
        });
      }
    }

    if (code && code.toUpperCase() !== category.code) {
      const existingByCode = await Category.findOne({ 
        code: code.toUpperCase(), 
        projectId: category.projectId,
        _id: { $ne: categoryId }
      });
      if (existingByCode) {
        return res.status(400).json({
          success: false,
          message: 'Category with this code already exists in this project',
        });
      }
    }

    // Update category fields
    if (name !== undefined) category.name = name;
    if (code !== undefined) category.code = code.toUpperCase();
    if (description !== undefined) category.description = description;
    if (color !== undefined) category.color = color;
    if (icon !== undefined) category.icon = icon;
    if (order !== undefined) category.order = order;
    if (isActive !== undefined) category.isActive = isActive;
    if (defaultPriority !== undefined) category.defaultPriority = defaultPriority;
    category.updatedBy = userId as any;

    await category.save();

    // If name changed, update project configuration
    if (name && name !== oldName) {
      const project = await Project.findById(category.projectId);
      if (project) {
        const categoryField = project.configuration?.ticketSubmissionSettings?.onlineFormFields?.find(
          (field: any) => field.fieldName === 'Category'
        );
        if (categoryField?.options) {
          const index = categoryField.options.indexOf(oldName);
          if (index !== -1) {
            categoryField.options[index] = name;
            await project.save();
          }
        }
      }
    }
    
    // Log activity
    try {
      const currentUser = req.user;
      if (currentUser) {
        const projectData = await Project.findById(category.projectId);
        const changes = [];
        if (name && name !== oldName) changes.push({ field: 'name', oldValue: oldName, newValue: name });
        if (color !== undefined) changes.push({ field: 'color', oldValue: 'previous', newValue: color });
        
        await logActivity({
          userId: currentUser.userId,
          userName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
          userEmail: currentUser.email,
          action: 'update',
          entity: 'category',
          entityId: category._id.toString(),
          entityName: category.name,
          projectId: category.projectId.toString(),
          projectName: projectData?.name,
          changes: changes.length > 0 ? changes : undefined,
          description: `Category ${category.name} updated`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return res.json({
      success: true,
      message: 'Category updated successfully',
      data: category,
    });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete a category
export const deleteCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const categoryName = category.name;
    const projectId = category.projectId;

    // Soft delete - just mark as inactive
    category.isActive = false;
    await category.save();

    // Remove from project configuration
    const project = await Project.findById(projectId);
    if (project) {
      const categoryField = project.configuration?.ticketSubmissionSettings?.onlineFormFields?.find(
        (field: any) => field.fieldName === 'Category'
      );
      if (categoryField?.options) {
        categoryField.options = categoryField.options.filter((opt: string) => opt !== categoryName);
        await project.save();
      }
    }
    
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
          entity: 'category',
          entityId: category._id.toString(),
          entityName: categoryName,
          projectId: projectId.toString(),
          projectName: projectData?.name,
          description: `Category ${categoryName} deleted (soft delete)`,
          req
        });
      }
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    console.error('Delete category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get a single category
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    return res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('Get category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
