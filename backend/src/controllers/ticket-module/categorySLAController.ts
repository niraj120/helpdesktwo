import { Request, Response } from "express";
import mongoose from "mongoose";
import CategorySLA from "../../models/ticket-module/CategorySLA";
import { Category } from "../../models/Category";

/**
 * GET /api/categories/:categoryId/sla
 * Returns the CategorySLA override for a category, or { data: null } if none exists.
 */
export const getCategorySLA = async (
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

    const sla = await CategorySLA.findOne({ categoryId });
    return res.status(200).json({ success: true, data: sla || null });
  } catch (error: any) {
    console.error("[CategorySLA] getCategorySLA error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/categories/:categoryId/sla
 * Upserts the CategorySLA override for a category.
 * Body: { responseTime: {value, unit}, resolutionTime: {value, unit}, isActive }
 */
export const upsertCategorySLA = async (
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

    const { responseTime, resolutionTime, isActive } = req.body;

    if (
      !responseTime?.value ||
      !responseTime?.unit ||
      !resolutionTime?.value ||
      !resolutionTime?.unit
    ) {
      return res.status(400).json({
        success: false,
        error:
          "responseTime and resolutionTime are required with value and unit",
      });
    }

    const validUnits = ["minutes", "hours", "days"];
    if (
      !validUnits.includes(responseTime.unit) ||
      !validUnits.includes(resolutionTime.unit)
    ) {
      return res.status(400).json({
        success: false,
        error: "unit must be one of: minutes, hours, days",
      });
    }

    // Resolve projectId from the Category document
    const category = await Category.findById(categoryId).select("projectId");
    if (!category) {
      return res
        .status(404)
        .json({ success: false, error: "Category not found" });
    }

    const sla = await CategorySLA.findOneAndUpdate(
      { categoryId: new mongoose.Types.ObjectId(categoryId) },
      {
        $set: {
          projectId: category.projectId,
          responseTime: {
            value: Number(responseTime.value),
            unit: responseTime.unit,
          },
          resolutionTime: {
            value: Number(resolutionTime.value),
            unit: resolutionTime.unit,
          },
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
      `[CategorySLA] Upserted SLA for category ${categoryId}: response=${responseTime.value}${responseTime.unit} resolution=${resolutionTime.value}${resolutionTime.unit}`,
    );

    return res.status(200).json({ success: true, data: sla });
  } catch (error: any) {
    console.error("[CategorySLA] upsertCategorySLA error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
