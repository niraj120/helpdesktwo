/**
 * Widget Definition Controller
 *
 * GET /api/v1/admin/widget-definitions        — list all active (flat array)
 * GET /api/v1/admin/widget-definitions/:id    — single definition
 */

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { WidgetDefinition } from "../../models/dashboard/WidgetDefinition";
import { WIDGET_CATALOG } from "./widgetCatalog";

async function ensureWidgetsSeedeed(): Promise<void> {
  // Upsert by widgetKey so newly added catalog widgets (e.g. SR widgets) appear
  // on existing installs without a manual reseed — mirrors the report data-point
  // self-seed. Existing rows are refreshed; user data is untouched.
  const ops = (WIDGET_CATALOG as any[]).map((w) => ({
    updateOne: {
      filter: { widgetKey: w.widgetKey },
      update: { $set: w },
      upsert: true,
    },
  }));
  if (ops.length) await WidgetDefinition.bulkWrite(ops);
}

export async function listWidgetDefinitions(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    await ensureWidgetsSeedeed();

    const definitions = await WidgetDefinition.find({ isActive: true })
      .select("-__v")
      .lean();

    res.json({ success: true, data: definitions });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getWidgetDefinition(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const def = await WidgetDefinition.findById(req.params.id)
      .select("-__v")
      .lean();
    if (!def) {
      res
        .status(404)
        .json({ success: false, message: "Widget definition not found" });
      return;
    }
    res.json({ success: true, data: def });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
