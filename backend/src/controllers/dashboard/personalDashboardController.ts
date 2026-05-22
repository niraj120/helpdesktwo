/**
 * Personal Dashboard Controller (Phase 3)
 *
 * Handles CRUD for user-owned personal dashboards.
 *
 * GET    /api/v1/me/personal-dashboards
 * POST   /api/v1/me/personal-dashboards
 * PUT    /api/v1/me/personal-dashboards/:id
 * DELETE /api/v1/me/personal-dashboards/:id
 * POST   /api/v1/me/personal-dashboards/:id/set-default
 */

import mongoose from "mongoose";
import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import {
  PersonalDashboard,
  IPersonalDashboardWidget,
} from "../../models/dashboard/PersonalDashboard";
import { WidgetDefinition } from "../../models/dashboard/WidgetDefinition";

const MAX_PERSONAL_DASHBOARDS = 20;
const MAX_WIDGETS_PER_DASHBOARD = 50;

function getTenantId(req: AuthRequest): string | null {
  const projects = (req.user as any)?.projects;
  if (Array.isArray(projects) && projects.length > 0) {
    return projects[0]?._id?.toString() ?? projects[0]?.toString() ?? null;
  }
  return null;
}

// ─── GET /api/v1/me/personal-dashboards ──────────────────────────────────────

export async function listPersonalDashboards(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.json({ success: true, data: [] });
      return;
    }

    const dashboards = await PersonalDashboard.find({
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();

    res.json({ success: true, data: dashboards });
  } catch (err) {
    console.error("listPersonalDashboards error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// ─── POST /api/v1/me/personal-dashboards ─────────────────────────────────────

export async function createPersonalDashboard(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const userOid = new mongoose.Types.ObjectId(userId);
    const tenantOid = new mongoose.Types.ObjectId(tenantId);

    // Enforce limit
    const count = await PersonalDashboard.countDocuments({
      userId: userOid,
      tenantId: tenantOid,
    });
    if (count >= MAX_PERSONAL_DASHBOARDS) {
      res.status(422).json({
        success: false,
        message: `Maximum ${MAX_PERSONAL_DASHBOARDS} personal dashboards allowed`,
      });
      return;
    }

    const {
      name,
      description,
      colourLabel,
      globalDateRangeDays,
      allowUserDateOverride,
      widgets = [],
      isDefault = false,
    } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(422).json({ success: false, message: "name is required" });
      return;
    }

    if (widgets.length > MAX_WIDGETS_PER_DASHBOARD) {
      res.status(422).json({
        success: false,
        message: `Maximum ${MAX_WIDGETS_PER_DASHBOARD} widgets per dashboard`,
      });
      return;
    }

    // Validate widget definitions exist
    if (widgets.length > 0) {
      const widgetKeys = [...new Set(widgets.map((w: any) => w.widgetKey))];
      const defs = await WidgetDefinition.find({
        widgetKey: { $in: widgetKeys },
        isActive: true,
      }).lean();
      const validKeys = new Set(defs.map((d) => d.widgetKey));
      const invalid = (widgetKeys as string[]).filter((k) => !validKeys.has(k));
      if (invalid.length > 0) {
        res.status(422).json({
          success: false,
          message: `Unknown widget keys: ${invalid.join(", ")}`,
        });
        return;
      }
    }

    // If making this the default, clear previous default
    if (isDefault) {
      await PersonalDashboard.updateMany(
        { userId: userOid, tenantId: tenantOid, isDefault: true },
        { $set: { isDefault: false } },
      );
    }

    const dashboard = await PersonalDashboard.create({
      userId: userOid,
      tenantId: tenantOid,
      name: name.trim(),
      description: description ?? "",
      colourLabel: colourLabel ?? "#2563eb",
      globalDateRangeDays: globalDateRangeDays ?? 30,
      allowUserDateOverride: allowUserDateOverride !== false,
      widgets,
      isDefault,
    });

    res.status(201).json({ success: true, data: dashboard });
  } catch (err) {
    console.error("createPersonalDashboard error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// ─── PUT /api/v1/me/personal-dashboards/:id ──────────────────────────────────

export async function updatePersonalDashboard(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const dashboard = await PersonalDashboard.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined,
    });

    if (!dashboard) {
      res.status(404).json({ success: false, message: "Dashboard not found" });
      return;
    }

    const {
      name,
      description,
      colourLabel,
      globalDateRangeDays,
      allowUserDateOverride,
      widgets,
    } = req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        res
          .status(422)
          .json({ success: false, message: "name cannot be empty" });
        return;
      }
      dashboard.name = name.trim();
    }
    if (description !== undefined) dashboard.description = description;
    if (colourLabel !== undefined) dashboard.colourLabel = colourLabel;
    if (globalDateRangeDays !== undefined)
      dashboard.globalDateRangeDays = globalDateRangeDays;
    if (allowUserDateOverride !== undefined)
      dashboard.allowUserDateOverride = allowUserDateOverride;

    if (widgets !== undefined) {
      if (widgets.length > MAX_WIDGETS_PER_DASHBOARD) {
        res
          .status(422)
          .json({
            success: false,
            message: `Maximum ${MAX_WIDGETS_PER_DASHBOARD} widgets allowed`,
          });
        return;
      }
      dashboard.widgets = widgets;
    }

    await dashboard.save();
    res.json({ success: true, data: dashboard });
  } catch (err) {
    console.error("updatePersonalDashboard error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// ─── DELETE /api/v1/me/personal-dashboards/:id ───────────────────────────────

export async function deletePersonalDashboard(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const result = await PersonalDashboard.findOneAndDelete({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!result) {
      res.status(404).json({ success: false, message: "Dashboard not found" });
      return;
    }

    res.json({ success: true, message: "Dashboard deleted" });
  } catch (err) {
    console.error("deletePersonalDashboard error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// ─── POST /api/v1/me/personal-dashboards/:id/set-default ─────────────────────

export async function setDefaultPersonalDashboard(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const userOid = new mongoose.Types.ObjectId(userId);
    const tenantOid = tenantId
      ? new mongoose.Types.ObjectId(tenantId)
      : undefined;

    const dashboard = await PersonalDashboard.findOne({
      _id: id,
      userId: userOid,
      ...(tenantOid ? { tenantId: tenantOid } : {}),
    });

    if (!dashboard) {
      res.status(404).json({ success: false, message: "Dashboard not found" });
      return;
    }

    // Clear previous default
    await PersonalDashboard.updateMany(
      {
        userId: userOid,
        ...(tenantOid ? { tenantId: tenantOid } : {}),
        isDefault: true,
      },
      { $set: { isDefault: false } },
    );

    dashboard.isDefault = true;
    await dashboard.save();

    res.json({ success: true, data: dashboard });
  } catch (err) {
    console.error("setDefaultPersonalDashboard error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
