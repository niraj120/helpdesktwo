import { Request, Response } from "express";
import mongoose from "mongoose";
import CategorySLA from "../../models/ticket-module/CategorySLA";
import { Category } from "../../models/Category";

const VALID_UNITS = ["minutes", "hours", "days"];
const normTime = (t: any) =>
  t && Number(t.value) > 0 && VALID_UNITS.includes(t.unit)
    ? { value: Number(t.value), unit: t.unit }
    : undefined;

/**
 * Keep only well-formed per-source SLA entries. Each source may carry an
 * optional responseTime and/or resolutionTime; empty sources are dropped.
 * Returns undefined when nothing valid is present (so the field stays unset).
 */
const sanitizeSlaBySource = (raw: any) => {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, any> = {};
  for (const [source, val] of Object.entries(raw)) {
    const response = normTime((val as any)?.responseTime);
    const resolution = normTime((val as any)?.resolutionTime);
    if (response || resolution) {
      out[source] = {
        ...(response ? { responseTime: response } : {}),
        ...(resolution ? { resolutionTime: resolution } : {}),
      };
    }
  }
  return Object.keys(out).length ? out : undefined;
};

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

    const { responseTime, resolutionTime, isActive, slaBySource } = req.body;

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
          // Per-source SLA overrides (#7) — sanitized to only valid time shapes.
          slaBySource: sanitizeSlaBySource(slaBySource),
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
