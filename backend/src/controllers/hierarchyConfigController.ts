import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  HierarchyConfig,
  IHierarchyConfig,
  IHierarchyLevel,
} from "../models/HierarchyConfig";
import { Category, ICategory } from "../models/Category";

/**
 * Get hierarchy configuration for a project
 * @route GET /api/hierarchy-config/:projectId
 */
export const getHierarchyConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    let config = await HierarchyConfig.findOne({
      projectId: new mongoose.Types.ObjectId(projectId),
      isActive: true,
    });

    // If no config exists, return default single-level config
    if (!config) {
      config = {
        projectId: new mongoose.Types.ObjectId(projectId),
        levelCount: 1,
        levels: [
          {
            levelNumber: 1,
            displayName: "Category",
            isMandatory: true,
            isActive: true,
          },
        ],
        visibilitySettings: {
          showInOnlineForm: [1],
          showInOfflineForm: [1],
          showInTicketDisplay: [1],
          showInFilters: [1],
        },
        priorityFromLevel: 0, // Default: manual priority selection
        isActive: true,
      } as any;
    }

    // Self-heal: ensure visibilitySettings include all configured levels.
    // Fixes configs saved before this guard was in place (showInOnlineForm had only [1]).
    if (config && (config as any).visibilitySettings) {
      const vis = (config as any).visibilitySettings;
      const levelCount = (config as any).levelCount || 1;
      const allLevels = Array.from({ length: levelCount }, (_, i) => i + 1);
      const expandArr = (arr: number[]) =>
        Array.from(new Set([...arr, ...allLevels])).sort((a, b) => a - b);
      const patched: any = {
        showInOnlineForm: expandArr(vis.showInOnlineForm || []),
        showInOfflineForm: expandArr(vis.showInOfflineForm || []),
        showInTicketDisplay: expandArr(vis.showInTicketDisplay || []),
        showInFilters: vis.showInFilters || [1, 2],
      };
      // Write back only if something changed (avoid unnecessary DB writes)
      if (
        JSON.stringify(patched.showInOnlineForm) !==
          JSON.stringify(vis.showInOnlineForm) ||
        JSON.stringify(patched.showInOfflineForm) !==
          JSON.stringify(vis.showInOfflineForm) ||
        JSON.stringify(patched.showInTicketDisplay) !==
          JSON.stringify(vis.showInTicketDisplay)
      ) {
        (config as any).visibilitySettings = patched;
        try {
          await (config as any).save();
        } catch (_) {
          /* non-critical */
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    console.error("Error fetching hierarchy config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hierarchy configuration",
      error: error.message,
    });
  }
};

/**
 * Create or update hierarchy configuration for a project
 * @route POST /api/hierarchy-config/:projectId
 */
export const saveHierarchyConfig = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user?.userId;
    const { levelCount, levels, visibilitySettings, priorityFromLevel } =
      req.body;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    // Validate level count
    if (levelCount < 1 || levelCount > 4) {
      return res.status(400).json({
        success: false,
        message: "Level count must be between 1 and 4",
      });
    }

    // Validate levels array
    if (!levels || levels.length !== levelCount) {
      return res.status(400).json({
        success: false,
        message: `Levels array must have exactly ${levelCount} items`,
      });
    }

    // Ensure levels are properly structured
    const validatedLevels: IHierarchyLevel[] = levels.map(
      (level: any, index: number) => ({
        levelNumber: index + 1,
        displayName: level.displayName || `Level ${index + 1}`,
        isMandatory: index === 0 ? true : level.isMandatory || false, // Level 1 always mandatory
        isActive: level.isActive !== false,
      }),
    );

    // Find existing config or create new
    let config = await HierarchyConfig.findOne({
      projectId: new mongoose.Types.ObjectId(projectId),
    });

    if (config) {
      // Update existing
      config.levelCount = levelCount;
      config.levels = validatedLevels;
      if (visibilitySettings) {
        config.visibilitySettings = visibilitySettings;
      } else {
        // Auto-expand visibility arrays to cover any newly added levels
        const allLevels = Array.from({ length: levelCount }, (_, i) => i + 1);
        const vis = config.visibilitySettings as any;
        const expand = (arr: number[]) =>
          Array.from(
            new Set([...arr, ...allLevels.filter((l) => l <= levelCount)]),
          );
        if (vis) {
          vis.showInOnlineForm = expand(vis.showInOnlineForm || []);
          vis.showInOfflineForm = expand(vis.showInOfflineForm || []);
          vis.showInTicketDisplay = expand(vis.showInTicketDisplay || []);
        }
      }
      // Update priority from level (0 = manual, 1-4 = from that level)
      if (priorityFromLevel !== undefined) {
        config.priorityFromLevel = Math.max(
          0,
          Math.min(4, parseInt(priorityFromLevel) || 0),
        );
      }
      config.updatedBy = new mongoose.Types.ObjectId(userId);
      await config.save();
    } else {
      // Create new
      config = await HierarchyConfig.create({
        projectId: new mongoose.Types.ObjectId(projectId),
        levelCount,
        levels: validatedLevels,
        visibilitySettings: visibilitySettings || {
          showInOnlineForm: Array.from({ length: levelCount }, (_, i) => i + 1),
          showInOfflineForm: Array.from(
            { length: levelCount },
            (_, i) => i + 1,
          ),
          showInTicketDisplay: Array.from(
            { length: levelCount },
            (_, i) => i + 1,
          ),
          showInFilters: [1, 2],
        },
        priorityFromLevel:
          priorityFromLevel !== undefined
            ? Math.max(0, Math.min(4, parseInt(priorityFromLevel) || 0))
            : 0,
        isActive: true,
        createdBy: new mongoose.Types.ObjectId(userId),
      });
    }

    console.log("✅ Hierarchy config saved:", {
      projectId,
      levelCount,
      levels: validatedLevels.map((l) => l.displayName),
    });

    // Emit WebSocket event for real-time updates
    const io = (req as any).app.get("io");
    if (io) {
      io.to(`project-config-${projectId}`).emit("hierarchy-config-updated", {
        projectId,
        config,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Hierarchy configuration saved successfully",
      data: config,
    });
  } catch (error: any) {
    console.error("Error saving hierarchy config:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save hierarchy configuration",
      error: error.message,
    });
  }
};

/**
 * Get categories as tree structure for a project
 * @route GET /api/hierarchy-config/:projectId/tree
 */
export const getCategoryTree = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { includeInactive, maxLevel } = req.query;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    const query: any = { projectId: new mongoose.Types.ObjectId(projectId) };

    if (includeInactive !== "true") {
      query.isActive = true;
    }

    if (maxLevel) {
      query.level = { $lte: parseInt(maxLevel as string) };
    }

    const categories = await Category.find(query)
      .sort({ level: 1, order: 1, name: 1 })
      .lean();

    // Build tree structure
    const buildTree = (items: any[], parentId: string | null = null): any[] => {
      return items
        .filter((item) => {
          const itemParentId = item.parentId?.toString() || null;
          return itemParentId === parentId;
        })
        .map((item) => ({
          ...item,
          children: buildTree(items, item._id.toString()),
        }));
    };

    const tree = buildTree(categories);

    return res.status(200).json({
      success: true,
      data: tree,
      total: categories.length,
    });
  } catch (error: any) {
    console.error("Error fetching category tree:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch category tree",
      error: error.message,
    });
  }
};

/**
 * Get children categories for a parent
 * @route GET /api/hierarchy-config/:projectId/children/:parentId
 */
export const getCategoryChildren = async (req: Request, res: Response) => {
  try {
    const { projectId, parentId } = req.params;
    const { includeInactive } = req.query;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    const query: any = {
      projectId: new mongoose.Types.ObjectId(projectId),
      parentId:
        parentId === "null" || parentId === "root"
          ? null
          : new mongoose.Types.ObjectId(parentId),
    };

    if (includeInactive !== "true") {
      query.isActive = true;
    }

    // For root level, we need parentId to not exist or be null
    if (parentId === "null" || parentId === "root") {
      query.$or = [{ parentId: null }, { parentId: { $exists: false } }];
      delete query.parentId;
      query.level = 1;
    }

    const children = await Category.find(query)
      .sort({ order: 1, name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: children,
    });
  } catch (error: any) {
    console.error("Error fetching category children:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch category children",
      error: error.message,
    });
  }
};

/**
 * Get categories by level for a project
 * @route GET /api/hierarchy-config/:projectId/level/:levelNumber
 */
export const getCategoriesByLevel = async (req: Request, res: Response) => {
  try {
    const { projectId, levelNumber } = req.params;
    const { parentId, includeInactive } = req.query;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    const level = parseInt(levelNumber);
    if (level < 1 || level > 4) {
      return res.status(400).json({
        success: false,
        message: "Level must be between 1 and 4",
      });
    }

    const query: any = {
      projectId: new mongoose.Types.ObjectId(projectId),
      level,
    };

    if (includeInactive !== "true") {
      query.isActive = true;
    }

    // For levels > 1, require parentId
    if (level > 1 && parentId) {
      query.parentId = new mongoose.Types.ObjectId(parentId as string);
    } else if (level > 1 && !parentId) {
      // Return empty for levels > 1 without parent
      return res.status(200).json({
        success: true,
        data: [],
        message: "Parent ID required for levels > 1",
      });
    }

    const categories = await Category.find(query)
      .sort({ order: 1, name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    console.error("Error fetching categories by level:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: error.message,
    });
  }
};

/**
 * Create a new category with hierarchy support
 * @route POST /api/hierarchy-config/:projectId/categories
 */
export const createHierarchyCategory = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user?.userId;
    const {
      name,
      code,
      description,
      parentId,
      level,
      color,
      icon,
      order,
      defaultPriority,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    // Validate code is a number
    const numericCode = typeof code === "number" ? code : parseInt(code, 10);
    if (isNaN(numericCode) || numericCode <= 0) {
      return res.status(400).json({
        success: false,
        message: "Code must be a positive number",
      });
    }

    const categoryLevel = level || 1;

    // Validate level
    if (categoryLevel < 1 || categoryLevel > 4) {
      return res.status(400).json({
        success: false,
        message: "Level must be between 1 and 4",
      });
    }

    // For levels > 1, parentId is required
    if (categoryLevel > 1 && !parentId) {
      return res.status(400).json({
        success: false,
        message: "Parent ID is required for levels > 1",
      });
    }

    // Check if parent exists and is at correct level
    if (parentId) {
      const parent = await Category.findById(parentId);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: "Parent category not found",
        });
      }
      if (parent.level !== categoryLevel - 1) {
        return res.status(400).json({
          success: false,
          message: `Parent must be at level ${categoryLevel - 1}`,
        });
      }
    }

    // Check for duplicate code in project
    const existingByCode = await Category.findOne({
      projectId: new mongoose.Types.ObjectId(projectId),
      code: numericCode,
    });
    if (existingByCode) {
      return res.status(400).json({
        success: false,
        message: "Category code already exists in this project",
      });
    }

    const category = await Category.create({
      name,
      code: numericCode,
      description,
      projectId: new mongoose.Types.ObjectId(projectId),
      parentId: parentId ? new mongoose.Types.ObjectId(parentId) : null,
      level: categoryLevel,
      color,
      icon,
      order: order || 0,
      defaultPriority,
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(userId),
    });

    console.log("✅ Category created:", {
      id: category._id,
      name,
      level: categoryLevel,
      parent: parentId,
    });

    // Emit WebSocket event for real-time updates
    const io = (req as any).app.get("io");
    if (io) {
      io.to(`project-config-${projectId}`).emit("category-tree-updated", {
        projectId,
        action: "created",
        category,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error: any) {
    console.error("Error creating category:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: error.message,
    });
  }
};

/**
 * Update a category
 * @route PUT /api/hierarchy-config/:projectId/categories/:categoryId
 */
export const updateHierarchyCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const userId = (req as any).user?.userId;
    const {
      name,
      code,
      description,
      color,
      icon,
      order,
      defaultPriority,
      isActive,
      parentId,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check for duplicate code if code is being changed
    if (code !== undefined && code !== category.code) {
      const numericCode = typeof code === "number" ? code : parseInt(code, 10);
      if (isNaN(numericCode) || numericCode <= 0) {
        return res.status(400).json({
          success: false,
          message: "Code must be a positive number",
        });
      }

      const existingByCode = await Category.findOne({
        projectId: category.projectId,
        code: numericCode,
        _id: { $ne: categoryId },
      });
      if (existingByCode) {
        return res.status(400).json({
          success: false,
          message: "Category code already exists in this project",
        });
      }
    }

    // Don't allow changing level or parent for now (complex operation)
    if (parentId !== undefined && parentId !== category.parentId?.toString()) {
      return res.status(400).json({
        success: false,
        message:
          "Changing parent category is not supported. Delete and recreate instead.",
      });
    }

    // Update fields
    if (name) category.name = name;
    if (code !== undefined) {
      const numericCode = typeof code === "number" ? code : parseInt(code, 10);
      if (!isNaN(numericCode) && numericCode > 0) {
        category.code = numericCode;
      }
    }
    if (description !== undefined) category.description = description;
    if (color !== undefined) category.color = color;
    if (icon !== undefined) category.icon = icon;
    if (order !== undefined) category.order = order;
    if (defaultPriority !== undefined)
      category.defaultPriority = defaultPriority;
    if (isActive !== undefined) category.isActive = isActive;
    category.updatedBy = new mongoose.Types.ObjectId(userId);

    await category.save();

    // If name changed, update path for this category and all descendants
    if (name && name !== category.name) {
      await updateDescendantPaths(category._id as mongoose.Types.ObjectId);
    }

    console.log("✅ Category updated:", {
      id: categoryId,
      name: category.name,
    });

    // Emit WebSocket event for real-time updates
    const io = (req as any).app.get("io");
    if (io && category.projectId) {
      io.to(`project-config-${category.projectId}`).emit(
        "category-tree-updated",
        {
          projectId: category.projectId,
          action: "updated",
          category,
        },
      );
    }

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error: any) {
    console.error("Error updating category:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update category",
      error: error.message,
    });
  }
};

/**
 * Delete a category (soft delete)
 * @route DELETE /api/hierarchy-config/:projectId/categories/:categoryId
 */
export const deleteHierarchyCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const userId = (req as any).user?.userId;
    const { hardDelete } = req.query;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if category has children
    const childCount = await Category.countDocuments({
      parentId: categoryId,
      isActive: true,
    });
    if (childCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category with ${childCount} active children. Delete children first.`,
      });
    }

    // Check if category is used in any tickets
    const Ticket = mongoose.model("Ticket");
    const ticketCount = await Ticket.countDocuments({
      $or: [
        { category: categoryId },
        { "categoryHierarchy.level1": categoryId },
        { "categoryHierarchy.level2": categoryId },
        { "categoryHierarchy.level3": categoryId },
        { "categoryHierarchy.level4": categoryId },
      ],
    });

    if (ticketCount > 0 && hardDelete === "true") {
      return res.status(400).json({
        success: false,
        message: `Cannot hard delete category used in ${ticketCount} tickets. Use soft delete instead.`,
      });
    }

    if (hardDelete === "true") {
      await Category.findByIdAndDelete(categoryId);
      console.log("🗑️ Category hard deleted:", categoryId);
    } else {
      category.isActive = false;
      category.updatedBy = new mongoose.Types.ObjectId(userId);
      await category.save();
      console.log("🗑️ Category soft deleted:", categoryId);
    }

    // Emit WebSocket event for real-time updates
    const io = (req as any).app.get("io");
    if (io && category.projectId) {
      io.to(`project-config-${category.projectId}`).emit(
        "category-tree-updated",
        {
          projectId: category.projectId,
          action: "deleted",
          categoryId,
        },
      );
    }

    return res.status(200).json({
      success: true,
      message: `Category ${hardDelete === "true" ? "deleted" : "deactivated"} successfully`,
    });
  } catch (error: any) {
    console.error("Error deleting category:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete category",
      error: error.message,
    });
  }
};

/**
 * Helper function to update paths for all descendants of a category
 */
async function updateDescendantPaths(
  categoryId: mongoose.Types.ObjectId,
): Promise<void> {
  const category = await Category.findById(categoryId);
  if (!category) return;

  const descendants = await Category.find({ hierarchyPath: categoryId });

  for (const descendant of descendants) {
    // Rebuild path by fetching all ancestors
    const ancestors = await Category.find({
      _id: { $in: descendant.hierarchyPath },
    }).sort({ level: 1 });

    descendant.path = [...ancestors.map((a) => a.name), descendant.name].join(
      " > ",
    );
    await descendant.save();
  }
}

/**
 * Bulk upload categories from CSV data
 * @route POST /api/hierarchy-config/:projectId/categories/bulk
 *
 * Expected CSV format:
 * Level,ParentName,Name,DefaultPriority
 * 1,,Category1,high
 * 1,,Category2,medium
 * 2,Category1,SubCategory1,high
 * 2,Category1,SubCategory2,normal
 */
export const bulkUploadCategories = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user?.userId;
    const { categories } = req.body; // Array of { code, level, parentName, name, defaultPriority }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Categories array is required and must not be empty",
      });
    }

    // Validate all rows have required fields
    for (let i = 0; i < categories.length; i++) {
      const row = categories[i];
      if (!row.name || !row.level) {
        return res.status(400).json({
          success: false,
          message: `Row ${i + 1}: Name and Level are required`,
        });
      }
      if (row.level < 1 || row.level > 4) {
        return res.status(400).json({
          success: false,
          message: `Row ${i + 1}: Level must be between 1 and 4`,
        });
      }
      if (row.level > 1 && !row.parentName) {
        return res.status(400).json({
          success: false,
          message: `Row ${i + 1}: ParentName is required for Level > 1`,
        });
      }
    }

    // Get existing categories
    const existingCategories = await Category.find({
      projectId: new mongoose.Types.ObjectId(projectId),
    });
    let maxCode =
      existingCategories.length > 0
        ? Math.max(
            ...existingCategories.map((c) =>
              typeof c.code === "number"
                ? c.code
                : parseInt(String(c.code), 10) || 0,
            ),
          )
        : 0;

    // Build maps for lookups
    const categoryMap = new Map<string, any>(); // name:parentId -> category
    const parentNameMap = new Map<string, any>(); // level:name -> category
    const codeMap = new Map<number, any>(); // code -> category
    existingCategories.forEach((c) => {
      const parentKey = c.parentId ? c.parentId.toString() : "root";
      categoryMap.set(`${c.name}:${parentKey}`, c);
      parentNameMap.set(`${c.level}:${c.name}`, c);
      const codeNum =
        typeof c.code === "number" ? c.code : parseInt(String(c.code), 10);
      if (!isNaN(codeNum)) {
        codeMap.set(codeNum, c);
      }
    });

    // Sort by level to process parents before children
    const sortedCategories = [...categories].sort((a, b) => a.level - b.level);

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const row of sortedCategories) {
      try {
        const code = row.code
          ? typeof row.code === "number"
            ? row.code
            : parseInt(String(row.code).trim(), 10)
          : null;
        const level =
          typeof row.level === "number" ? row.level : parseInt(row.level, 10);
        const name = String(row.name).trim();
        const parentName = row.parentName
          ? String(row.parentName).trim()
          : null;
        const defaultPriority = row.defaultPriority
          ? String(row.defaultPriority).toLowerCase().trim()
          : undefined;

        // Find parent if needed
        let parentId = null;
        let parentCategory = null;

        if (level > 1 && parentName) {
          // Find parent by name at parent level
          parentCategory = parentNameMap.get(`${level - 1}:${parentName}`);
          if (!parentCategory) {
            results.errors.push(
              `Row "${name}": Parent "${parentName}" not found at level ${level - 1}`,
            );
            results.skipped++;
            continue;
          }
          parentId = parentCategory._id;
        }

        // If code is provided, UPDATE existing category
        if (code && !isNaN(code) && codeMap.has(code)) {
          const existingCategory = codeMap.get(code);

          // Update the category
          const hierarchyPath =
            parentCategory && parentCategory.hierarchyPath
              ? [...parentCategory.hierarchyPath, parentCategory._id]
              : [];

          const path = parentCategory
            ? `${parentCategory.path} > ${name}`
            : name;

          await Category.findByIdAndUpdate(existingCategory._id, {
            name,
            parentId: parentId,
            level,
            hierarchyPath,
            path,
            defaultPriority:
              defaultPriority || existingCategory.defaultPriority,
            updatedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
          });

          // Update maps
          const newParentKey = parentId ? parentId.toString() : "root";
          categoryMap.set(`${name}:${newParentKey}`, {
            ...existingCategory,
            name,
            parentId,
            level,
            path,
            hierarchyPath,
          });
          parentNameMap.set(`${level}:${name}`, {
            ...existingCategory,
            name,
            parentId,
            level,
            path,
            hierarchyPath,
          });

          results.updated++;
          continue;
        }

        // Check if this exact category already exists (same name + same parent) - for new entries
        const parentKey = parentId ? parentId.toString() : "root";
        const existingKey = `${name}:${parentKey}`;
        if (categoryMap.has(existingKey) && !code) {
          results.skipped++;
          continue; // Same name under same parent - skip
        }

        // Create new category
        maxCode++;

        const hierarchyPath =
          parentCategory && parentCategory.hierarchyPath
            ? [...parentCategory.hierarchyPath, parentCategory._id]
            : [];

        const path = parentCategory ? `${parentCategory.path} > ${name}` : name;

        const newCategory = await Category.create({
          name,
          code: maxCode,
          projectId: new mongoose.Types.ObjectId(projectId),
          parentId: parentId,
          level,
          hierarchyPath,
          path,
          defaultPriority,
          isActive: true,
          createdBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        });

        // Add to maps for subsequent lookups
        const newParentKey = newCategory.parentId
          ? newCategory.parentId.toString()
          : "root";
        categoryMap.set(`${name}:${newParentKey}`, newCategory);
        parentNameMap.set(`${level}:${name}`, newCategory); // For parent lookups
        codeMap.set(maxCode, newCategory);
        results.created++;
      } catch (err: any) {
        results.errors.push(`Row "${row.name}": ${err.message}`);
        results.skipped++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk upload completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
      data: results,
    });
  } catch (error: any) {
    console.error("Error in bulk upload:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process bulk upload",
      error: error.message,
    });
  }
};

/**
 * Download CSV template for bulk upload - includes existing data for updates
 * @route GET /api/hierarchy-config/:projectId/categories/template
 */
export const downloadBulkTemplate = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // Get hierarchy config to know level names
    const config = await HierarchyConfig.findOne({
      projectId: new mongoose.Types.ObjectId(projectId),
    });

    const levelNames = config?.levels?.map((l) => l.displayName) || [
      "Category",
      "Subcategory",
      "Topic",
      "Subtopic",
    ];
    const levelCount = config?.levelCount || 2;

    // Get existing categories from database
    const existingCategories = await Category.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      isActive: true,
    }).sort({ level: 1, name: 1 });

    // Build parent lookup map
    const parentMap = new Map<string, string>();
    existingCategories.forEach((cat) => {
      parentMap.set(cat._id.toString(), cat.name);
    });

    // Create CSV content
    let csvContent = "Code,Level,ParentName,Name,DefaultPriority\n";
    csvContent += "# Instructions:\n";
    csvContent +=
      "# - Code: Leave empty for new categories, or use existing code to UPDATE\n";
    csvContent += "# - Level: 1-4 (based on your hierarchy configuration)\n";
    csvContent +=
      "# - ParentName: Leave empty for Level 1, otherwise enter exact parent name\n";
    csvContent += "# - Name: Category name (required)\n";
    csvContent +=
      "# - DefaultPriority: Optional - high, medium, normal, low, critical, urgent\n";
    csvContent += "# - Lines starting with # are ignored\n";
    csvContent += "#\n";

    // Include existing data
    if (existingCategories.length > 0) {
      csvContent +=
        "# === EXISTING DATA (modify and re-upload to update) ===\n";
      for (const cat of existingCategories) {
        const parentName = cat.parentId
          ? parentMap.get(cat.parentId.toString()) || ""
          : "";
        const priority = cat.defaultPriority || "";
        // Escape commas in names
        const escapedName = cat.name.includes(",") ? `"${cat.name}"` : cat.name;
        const escapedParent = parentName.includes(",")
          ? `"${parentName}"`
          : parentName;
        csvContent += `${cat.code},${cat.level},${escapedParent},${escapedName},${priority}\n`;
      }
      csvContent += "#\n";
      csvContent += "# === ADD NEW CATEGORIES BELOW (leave Code empty) ===\n";
    } else {
      csvContent += "# Example data (delete these and add your own):\n";
      if (levelCount >= 1) {
        csvContent += `,1,,${levelNames[0]} Example 1,high\n`;
        csvContent += `,1,,${levelNames[0]} Example 2,medium\n`;
      }
      if (levelCount >= 2) {
        csvContent += `,2,${levelNames[0]} Example 1,${levelNames[1]} Example 1,normal\n`;
        csvContent += `,2,${levelNames[0]} Example 1,${levelNames[1]} Example 2,low\n`;
      }
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=category_bulk_upload_template.csv",
    );
    return res.send(csvContent);
  } catch (error: any) {
    console.error("Error generating template:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate template",
      error: error.message,
    });
  }
};
