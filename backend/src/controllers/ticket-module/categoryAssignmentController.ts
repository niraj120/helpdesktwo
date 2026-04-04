import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../../middleware/auth";
import { CategoryAssignmentConfig } from "../../models/ticket-module/CategoryAssignmentConfig";
import { Category } from "../../models/Category";

/**
 * GET /api/categories/:categoryId/assignment-config
 * Returns the CategoryAssignmentConfig for the given category in the request's project context.
 * The projectId is resolved from the category document itself so public callers only need
 * the categoryId.
 */
export const getAssignmentConfig = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      res.status(400).json({ success: false, error: "Invalid categoryId" });
      return;
    }

    const category = await Category.findById(categoryId).select("projectId").lean();
    if (!category) {
      res.status(404).json({ success: false, error: "Category not found" });
      return;
    }

    const config = await CategoryAssignmentConfig.findOne({
      categoryId: new mongoose.Types.ObjectId(categoryId),
      projectId: category.projectId,
    })
      .populate("agentPool", "firstName lastName email")
      .populate("rolePool", "name code");

    res.json({ success: true, data: config ?? null });
  } catch (error) {
    console.error("[CategoryAssignmentConfig] getAssignmentConfig error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * PUT /api/categories/:categoryId/assignment-config
 * Upserts the CategoryAssignmentConfig for a category.
 * Requires MASTER_DATA_MANAGE_CATEGORIES permission (enforced in router).
 *
 * Body: { mode, agentPool?, rolePool?, isActive? }
 */
export const upsertAssignmentConfig = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { categoryId } = req.params;
    const { mode, agentPool = [], rolePool = [], isActive = true } = req.body;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      res.status(400).json({ success: false, error: "Invalid categoryId" });
      return;
    }

    const validModes = ["round-robin", "by-role", "by-user", "manual"];
    if (!validModes.includes(mode)) {
      res.status(400).json({
        success: false,
        error: `mode must be one of: ${validModes.join(", ")}`,
      });
      return;
    }

    const category = await Category.findById(categoryId).select("projectId").lean();
    if (!category) {
      res.status(404).json({ success: false, error: "Category not found" });
      return;
    }

    const userId = req.user?.userId;

    const config = await CategoryAssignmentConfig.findOneAndUpdate(
      {
        categoryId: new mongoose.Types.ObjectId(categoryId),
        projectId: category.projectId,
      },
      {
        $set: {
          mode,
          agentPool: agentPool.map((id: string) => new mongoose.Types.ObjectId(id)),
          rolePool: rolePool.map((id: string) => new mongoose.Types.ObjectId(id)),
          isActive,
          updatedBy: userId,
        },
        $setOnInsert: {
          createdBy: userId,
        },
      },
      { upsert: true, new: true, runValidators: true },
    )
      .populate("agentPool", "firstName lastName email")
      .populate("rolePool", "name code");

    res.json({ success: true, data: config });
  } catch (error) {
    console.error("[CategoryAssignmentConfig] upsertAssignmentConfig error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * DELETE /api/categories/:categoryId/assignment-config
 * Removes the assignment config for a category (reverts to project-level fallback).
 * Requires MASTER_DATA_MANAGE_CATEGORIES permission.
 */
export const deleteAssignmentConfig = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      res.status(400).json({ success: false, error: "Invalid categoryId" });
      return;
    }

    const category = await Category.findById(categoryId).select("projectId").lean();
    if (!category) {
      res.status(404).json({ success: false, error: "Category not found" });
      return;
    }

    await CategoryAssignmentConfig.deleteOne({
      categoryId: new mongoose.Types.ObjectId(categoryId),
      projectId: category.projectId,
    });

    res.json({ success: true, message: "Assignment config removed" });
  } catch (error) {
    console.error("[CategoryAssignmentConfig] deleteAssignmentConfig error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * GET /api/projects/:projectId/category-assignment-configs
 * List all assignment configs for a project (for the admin overview UI — US-011).
 */
export const listConfigsByProject = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      res.status(400).json({ success: false, error: "Invalid projectId" });
      return;
    }

    const configs = await CategoryAssignmentConfig.find({
      projectId: new mongoose.Types.ObjectId(projectId),
    })
      .populate("categoryId", "name color icon level parentId path")
      .populate("agentPool", "firstName lastName email")
      .populate("rolePool", "name code")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: configs });
  } catch (error) {
    console.error("[CategoryAssignmentConfig] listConfigsByProject error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * GET /api/categories/:categoryId/assignment-preview
 * Public endpoint — returns a safe display label for the student portal (US-014).
 * Never exposes specific agent names.
 */
export const assignmentPreview = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      res.status(400).json({ success: false, error: "Invalid categoryId" });
      return;
    }

    const category = await Category.findById(categoryId).select("projectId").lean();
    if (!category) {
      res.status(404).json({ success: false, error: "Category not found" });
      return;
    }

    const config = await CategoryAssignmentConfig.findOne({
      categoryId: new mongoose.Types.ObjectId(categoryId),
      projectId: category.projectId,
      isActive: true,
    }).populate("rolePool", "name");

    let label = "Will be assigned automatically";
    if (config) {
      if (config.mode === "by-role" && config.rolePool.length > 0) {
        const roleNames = (config.rolePool as any[]).map((r) => r.name).join(", ");
        label = `Will be handled by: ${roleNames}`;
      } else if (config.mode === "manual") {
        label = "Will be reviewed and assigned by a team member";
      }
    }

    res.json({ success: true, data: { label } });
  } catch (error) {
    console.error("[CategoryAssignmentConfig] assignmentPreview error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
