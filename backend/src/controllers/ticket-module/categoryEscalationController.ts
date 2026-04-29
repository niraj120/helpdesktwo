import { Request, Response } from "express";
import mongoose from "mongoose";
import CategoryEscalationConfig from "../../models/ticket-module/CategoryEscalationConfig";
import { Category } from "../../models/Category";

/**
 * GET /api/categories/:categoryId/escalation-config
 * Returns the CategoryEscalationConfig for a category, or { data: null } if none exists.
 */
export const getCategoryEscalationConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid category ID" });
    }

    const config = await CategoryEscalationConfig.findOne({
      categoryId,
    }).populate("escalationMatrixId", "name levels isActive");

    return res.status(200).json({ success: true, data: config || null });
  } catch (error: any) {
    console.error(
      "[CategoryEscalation] getCategoryEscalationConfig error:",
      error,
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/categories/:categoryId/escalation-config
 * Upserts the CategoryEscalationConfig for a category.
 * Body: { escalationMatrixId: string, isActive?: boolean }
 */
export const upsertCategoryEscalationConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { categoryId } = req.params;
    const userId = (req as any).user?.userId;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid category ID" });
    }

    const { escalationMatrixId, isActive } = req.body;

    if (
      !escalationMatrixId ||
      !mongoose.Types.ObjectId.isValid(escalationMatrixId)
    ) {
      return res.status(400).json({
        success: false,
        error: "Valid escalationMatrixId is required",
      });
    }

    // Resolve projectId from the Category document
    const category = await Category.findById(categoryId).select("projectId");
    if (!category) {
      return res
        .status(404)
        .json({ success: false, error: "Category not found" });
    }

    const config = await CategoryEscalationConfig.findOneAndUpdate(
      { categoryId: new mongoose.Types.ObjectId(categoryId) },
      {
        $set: {
          projectId: category.projectId,
          escalationMatrixId: new mongoose.Types.ObjectId(escalationMatrixId),
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          updatedBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        },
        $setOnInsert: {
          createdBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        },
      },
      { upsert: true, new: true, runValidators: true },
    );

    console.log(
      `[CategoryEscalation] Upserted config for category ${categoryId}: matrix=${escalationMatrixId}`,
    );
    return res.status(200).json({ success: true, data: config });
  } catch (error: any) {
    console.error(
      "[CategoryEscalation] upsertCategoryEscalationConfig error:",
      error,
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/categories/:categoryId/escalation-config/resolved
 * US-ESC-003: Walk the category hierarchy to find the effective escalation matrix.
 * Returns { source: 'direct'|'inherited'|'none', matrixName, matrixId, inheritedFromCategoryName }
 */
export const resolvedCategoryEscalationConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid category ID" });
    }

    const cat = await Category.findById(categoryId)
      .select("name level parentId hierarchyPath projectId")
      .lean();
    if (!cat) {
      return res
        .status(404)
        .json({ success: false, error: "Category not found" });
    }

    // 1. Check direct active config
    const directConfig = await CategoryEscalationConfig.findOne({
      categoryId: new mongoose.Types.ObjectId(categoryId),
      isActive: true,
    })
      .populate("escalationMatrixId", "name levels isActive")
      .lean();

    if (directConfig && (directConfig as any).escalationMatrixId) {
      const matrix = (directConfig as any).escalationMatrixId;
      return res.json({
        success: true,
        data: {
          source: "direct",
          categoryId: cat._id,
          categoryName: (cat as any).name,
          matrixId: matrix._id,
          matrixName: matrix.name,
          inheritedFromCategoryId: null,
          inheritedFromCategoryName: null,
        },
      });
    }

    // 2. Walk hierarchyPath from end (nearest ancestor) to beginning
    const ancestors = [...((cat as any).hierarchyPath || [])].reverse();
    for (const ancestorId of ancestors) {
      const ancestorConfig = await CategoryEscalationConfig.findOne({
        categoryId: ancestorId,
        isActive: true,
      })
        .populate("escalationMatrixId", "name levels isActive")
        .lean();

      if (ancestorConfig && (ancestorConfig as any).escalationMatrixId) {
        const matrix = (ancestorConfig as any).escalationMatrixId;
        const ancestor = await Category.findById(ancestorId)
          .select("name")
          .lean();
        return res.json({
          success: true,
          data: {
            source: "inherited",
            categoryId: cat._id,
            categoryName: (cat as any).name,
            matrixId: matrix._id,
            matrixName: matrix.name,
            inheritedFromCategoryId: ancestorId,
            inheritedFromCategoryName:
              (ancestor as any)?.name || "Parent Category",
          },
        });
      }
    }

    // 3. No config found in hierarchy
    return res.json({
      success: true,
      data: {
        source: "none",
        categoryId: cat._id,
        categoryName: (cat as any).name,
        matrixId: null,
        matrixName: null,
        inheritedFromCategoryId: null,
        inheritedFromCategoryName: null,
      },
    });
  } catch (error: any) {
    console.error(
      "[CategoryEscalation] resolvedCategoryEscalationConfig error:",
      error,
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/projects/:projectId/category-escalation-configs
 * Bulk-fetch all escalation configs for every category in a project.
 * Used by the admin overview to show configured/not-configured status per category.
 */
export const listEscalationConfigsByProject = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid projectId" });
    }

    const configs = await CategoryEscalationConfig.find({
      projectId: new mongoose.Types.ObjectId(projectId),
    })
      .populate("categoryId", "name level parentId")
      .populate("escalationMatrixId", "name isActive")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: configs });
  } catch (error: any) {
    console.error(
      "[CategoryEscalation] listEscalationConfigsByProject error:",
      error,
    );
    return res.status(500).json({ success: false, error: error.message });
  }
};
