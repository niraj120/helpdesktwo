/**
 * Dashboard Template Controller
 *
 * POST   /api/v1/admin/dashboards            — create draft template
 * GET    /api/v1/admin/dashboards            — list templates (tenantId scoped)
 * GET    /api/v1/admin/dashboards/:id        — single template
 * PUT    /api/v1/admin/dashboards/:id        — update template + widgets
 * DELETE /api/v1/admin/dashboards/:id        — soft delete (if no active assignments)
 * POST   /api/v1/admin/dashboards/:id/publish — publish template
 */

import mongoose from "mongoose";
import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { DashboardTemplate } from "../../models/dashboard/DashboardTemplate";
import { DashboardWidget } from "../../models/dashboard/DashboardWidget";
import { WidgetDefinition } from "../../models/dashboard/WidgetDefinition";
import { DashboardAssignment } from "../../models/dashboard/DashboardAssignment";

function getTenantId(req: AuthRequest): string | null {
  const projects = (req.user as any)?.projects;
  if (Array.isArray(projects) && projects.length > 0) {
    const first = projects[0];
    return first?._id?.toString() ?? first?.toString() ?? null;
  }
  return null;
}

export async function createDashboardTemplate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const {
      name,
      globalDateRangeDays,
      allowUserDateOverride,
      isSystemTemplate,
    } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ success: false, message: "name is required" });
      return;
    }

    const template = await DashboardTemplate.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      name: name.trim(),
      status: "draft",
      globalDateRangeDays: globalDateRangeDays ?? 30,
      allowUserDateOverride: allowUserDateOverride ?? true,
      isSystemTemplate: isSystemTemplate ?? false,
      createdBy: new mongoose.Types.ObjectId(req.user!.userId),
    });

    // Save widgets if provided at creation time
    const { widgets, sections } = req.body;
    if (Array.isArray(sections) && sections.length > 0) {
      (template as any).sections = sections.map((s: any, i: number) => ({
        // Preserve existing MongoDB _id so widget sectionId references remain stable
        ...(s._id && mongoose.Types.ObjectId.isValid(s._id)
          ? { _id: new mongoose.Types.ObjectId(s._id) }
          : {}),
        name: s.name ?? "Section",
        order: s.order ?? i,
      }));
      await template.save();
    }

    // Build name→_id map from saved sections so widgets whose sectionId was stored
    // as a section name (before the section had a DB _id) can be resolved correctly
    const sectionNameToId: Record<string, mongoose.Types.ObjectId> =
      Object.fromEntries(
        ((template as any).sections ?? []).map((s: any) => [s.name, s._id]),
      );

    if (Array.isArray(widgets) && widgets.length > 0) {
      const keysNeedingLookup = widgets
        .filter(
          (w: any) => !mongoose.Types.ObjectId.isValid(w.widgetDefinitionId),
        )
        .map((w: any) => w.widgetKey as string);

      let keyToDefId: Record<string, mongoose.Types.ObjectId> = {};
      if (keysNeedingLookup.length > 0) {
        const defs = await WidgetDefinition.find({
          widgetKey: { $in: keysNeedingLookup },
        })
          .select("widgetKey")
          .lean();
        keyToDefId = Object.fromEntries(
          (defs as any[]).map((d) => [d.widgetKey, d._id]),
        );
      }

      const widgetDocs = widgets.map((w: any, idx: number) => {
        const defId = mongoose.Types.ObjectId.isValid(w.widgetDefinitionId)
          ? new mongoose.Types.ObjectId(w.widgetDefinitionId)
          : (keyToDefId[w.widgetKey] ?? null);
        return {
          dashboardTemplateId: template._id,
          widgetDefinitionId: defId,
          widgetKey: w.widgetKey,
          title: w.displayName ?? w.title ?? null,
          visualisationType: w.visualisationType,
          gridX: w.gridX ?? w.gridColumn ?? 0,
          gridY: w.gridY ?? w.gridRow ?? 0,
          gridWidth: w.gridWidth ?? 4,
          gridHeight: w.gridHeight ?? 2,
          displayOrder: w.displayOrder ?? idx,
          config: w.config ?? {},
          sectionId: w.sectionId
            ? mongoose.Types.ObjectId.isValid(w.sectionId)
              ? new mongoose.Types.ObjectId(w.sectionId)
              : (sectionNameToId[w.sectionId] ?? null)
            : null,
          widgetDefinitionVersion: w.widgetDefinitionVersion ?? 1,
        };
      });

      await DashboardWidget.insertMany(widgetDocs);
    }

    const savedWidgets = await DashboardWidget.find({
      dashboardTemplateId: template._id,
    })
      .sort({ displayOrder: 1 })
      .lean();

    res.status(201).json({
      success: true,
      data: { ...template.toObject(), widgets: savedWidgets },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function listDashboardTemplates(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const { status } = req.query;
    const filter: Record<string, any> = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $ne: "archived" }, // never show archived in default list
    };
    if (status) filter.status = status; // explicit status param overrides

    const templates = await DashboardTemplate.find(filter)
      .sort({ updatedAt: -1 })
      .select("-__v")
      .lean();

    // Attach widgetCount for each template (widgets live in DashboardWidget collection)
    const templateIds = templates.map((t: any) => t._id);
    const widgetCountAgg = await DashboardWidget.aggregate([
      { $match: { dashboardTemplateId: { $in: templateIds } } },
      { $group: { _id: "$dashboardTemplateId", count: { $sum: 1 } } },
    ]);
    const widgetCountMap: Record<string, number> = {};
    for (const row of widgetCountAgg) {
      widgetCountMap[row._id.toString()] = row.count;
    }
    const templatesWithCount = templates.map((t: any) => ({
      ...t,
      widgetCount: widgetCountMap[t._id.toString()] ?? 0,
      // Keep widgets as empty array so frontend shape is consistent
      widgets: [],
    }));

    res.json({ success: true, data: templatesWithCount });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getDashboardTemplate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const template = await DashboardTemplate.findOne({
      _id: req.params.id,
      tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined,
    })
      .select("-__v")
      .lean();

    if (!template) {
      res.status(404).json({ success: false, message: "Template not found" });
      return;
    }

    // Include widgets
    const widgets = await DashboardWidget.find({
      dashboardTemplateId: template._id,
    })
      .sort({ displayOrder: 1 })
      .select("-__v")
      .lean();

    res.json({ success: true, data: { ...template, widgets } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateDashboardTemplate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const template = await DashboardTemplate.findOne({
      _id: req.params.id,
      tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined,
      status: { $ne: "archived" },
    });

    if (!template) {
      res
        .status(404)
        .json({ success: false, message: "Template not found or archived" });
      return;
    }

    const {
      name,
      globalDateRangeDays,
      allowUserDateOverride,
      widgets,
      sections,
    } = req.body;

    if (name !== undefined) template.name = name.trim();
    if (globalDateRangeDays !== undefined)
      template.globalDateRangeDays = globalDateRangeDays;
    if (allowUserDateOverride !== undefined)
      template.allowUserDateOverride = allowUserDateOverride;
    if (Array.isArray(sections)) {
      (template as any).sections = sections.map((s: any, i: number) => ({
        // Preserve existing MongoDB _id so widget sectionId references remain stable
        ...(s._id && mongoose.Types.ObjectId.isValid(s._id)
          ? { _id: new mongoose.Types.ObjectId(s._id) }
          : {}),
        name: s.name ?? "Section",
        order: s.order ?? i,
      }));
    }

    await template.save();

    // Build name→_id map from saved sections so widgets whose sectionId was stored
    // as a section name can be resolved to a real ObjectId
    const sectionNameToId: Record<string, mongoose.Types.ObjectId> =
      Object.fromEntries(
        ((template as any).sections ?? []).map((s: any) => [s.name, s._id]),
      );

    // Sync widgets if provided
    if (Array.isArray(widgets)) {
      // Build docs first — resolve widgetDefinitionId for DataPoint/formula widgets
      // that may not carry a valid ObjectId (e.g. widgetKey like "ht_total_tickets")
      let widgetDocs: any[] = [];
      if (widgets.length > 0) {
        const keysNeedingLookup = widgets
          .filter(
            (w: any) => !mongoose.Types.ObjectId.isValid(w.widgetDefinitionId),
          )
          .map((w: any) => w.widgetKey as string);

        let keyToDefId: Record<string, mongoose.Types.ObjectId> = {};
        if (keysNeedingLookup.length > 0) {
          const defs = await WidgetDefinition.find({
            widgetKey: { $in: keysNeedingLookup },
          })
            .select("widgetKey")
            .lean();
          keyToDefId = Object.fromEntries(
            (defs as any[]).map((d) => [d.widgetKey, d._id]),
          );
        }

        widgetDocs = widgets.map((w: any, idx: number) => {
          const defId = mongoose.Types.ObjectId.isValid(w.widgetDefinitionId)
            ? new mongoose.Types.ObjectId(w.widgetDefinitionId)
            : (keyToDefId[w.widgetKey] ?? null);
          return {
            dashboardTemplateId: template._id,
            widgetDefinitionId: defId,
            widgetKey: w.widgetKey,
            title: w.displayName ?? w.title ?? null,
            visualisationType: w.visualisationType,
            gridX: w.gridX ?? w.gridColumn ?? 0,
            gridY: w.gridY ?? w.gridRow ?? 0,
            gridWidth: w.gridWidth ?? 4,
            gridHeight: w.gridHeight ?? 2,
            displayOrder: w.displayOrder ?? idx,
            config: w.config ?? {},
            sectionId: w.sectionId
              ? mongoose.Types.ObjectId.isValid(w.sectionId)
                ? new mongoose.Types.ObjectId(w.sectionId)
                : (sectionNameToId[w.sectionId] ?? null)
              : null,
            widgetDefinitionVersion: w.widgetDefinitionVersion ?? 1,
          };
        });
      }

      // Delete only after docs are validated — prevents data loss on error
      await DashboardWidget.deleteMany({ dashboardTemplateId: template._id });
      if (widgetDocs.length > 0) {
        await DashboardWidget.insertMany(widgetDocs);
      }
    }

    const updatedWidgets = await DashboardWidget.find({
      dashboardTemplateId: template._id,
    })
      .sort({ displayOrder: 1 })
      .lean();

    res.json({
      success: true,
      data: { ...template.toObject(), widgets: updatedWidgets },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function publishDashboardTemplate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const template = await DashboardTemplate.findById(req.params.id);

    if (!template) {
      res.status(404).json({
        success: false,
        message: "Template not found",
      });
      return;
    }

    // Already published — idempotent, just return success
    if (template.status === "published") {
      res.json({ success: true, data: template });
      return;
    }

    template.status = "published";
    await template.save();

    res.json({ success: true, data: template });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteDashboardTemplate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const template = await DashboardTemplate.findById(req.params.id);
    if (!template) {
      res.status(404).json({ success: false, message: "Template not found" });
      return;
    }

    // Block deletion if active assignments exist
    const hasAssignments = await DashboardAssignment.countDocuments({
      dashboardTemplateId: template._id,
    });
    if (hasAssignments > 0) {
      res.status(409).json({
        success: false,
        message:
          "Cannot delete: template has active assignments. Unassign first.",
      });
      return;
    }

    // Drafts have never been published — hard delete them entirely.
    // Published templates may have historical context — soft archive instead.
    if (template.status === "draft") {
      await DashboardWidget.deleteMany({ dashboardTemplateId: template._id });
      await DashboardTemplate.deleteOne({ _id: template._id });
      res.json({ success: true, message: "Template deleted" });
    } else {
      template.status = "archived";
      await template.save();
      res.json({ success: true, message: "Template archived" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── Duplicate template ───────────────────────────────────────────────────────

export async function duplicateDashboardTemplate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const original = await DashboardTemplate.findOne({
      _id: req.params.id,
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $ne: "archived" },
    }).lean();

    if (!original) {
      res.status(404).json({ success: false, message: "Template not found" });
      return;
    }

    const widgets = await DashboardWidget.find({
      dashboardTemplateId: original._id,
    }).lean();

    const newTemplate = await DashboardTemplate.create({
      tenantId: original.tenantId,
      name: `${original.name} (Copy)`,
      description: original.description,
      icon: original.icon,
      colourLabel: original.colourLabel,
      globalDateRangeDays: original.globalDateRangeDays,
      allowUserDateOverride: (original as any).allowUserDateOverride,
      status: "draft",
      createdBy: (req.user as any)?._id,
    });

    if (widgets.length > 0) {
      await DashboardWidget.insertMany(
        widgets.map((w: any) => ({
          dashboardTemplateId: newTemplate._id,
          widgetDefinitionId: w.widgetDefinitionId,
          widgetDefinitionVersion: w.widgetDefinitionVersion,
          title: w.title,
          visualisationType: w.visualisationType,
          gridX: w.gridX,
          gridY: w.gridY,
          gridWidth: w.gridWidth,
          gridHeight: w.gridHeight,
          displayOrder: w.displayOrder,
          config: w.config,
        })),
      );
    }

    res.status(201).json({ success: true, data: { _id: newTemplate._id } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─── Export / Import ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/dashboards/:id/export
 * Returns the template + all its widgets as a portable JSON bundle.
 * The bundle can be imported on any tenant via the import endpoint.
 */
export async function exportDashboardTemplate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const template = await DashboardTemplate.findOne({
      _id: req.params.id,
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).lean();

    if (!template) {
      res.status(404).json({ success: false, message: "Template not found" });
      return;
    }

    const widgets = await DashboardWidget.find({
      dashboardTemplateId: template._id,
    }).lean();

    const bundle = {
      __exportVersion: 1,
      __exportedAt: new Date().toISOString(),
      __exportedBy: req.user!.userId,
      template: {
        name: template.name,
        description: template.description,
        icon: template.icon,
        colourLabel: template.colourLabel,
        globalDateRangeDays: template.globalDateRangeDays,
        allowUserDateOverride: (template as any).allowUserDateOverride,
        targetScope: (template as any).targetScope,
      },
      widgets: widgets.map((w: any) => ({
        widgetKey: w.widgetKey,
        title: w.title,
        visualisationType: w.visualisationType,
        gridX: w.gridX,
        gridY: w.gridY,
        gridWidth: w.gridWidth,
        gridHeight: w.gridHeight,
        displayOrder: w.displayOrder,
        config: w.config,
      })),
    };

    const filename = `dashboard-${template.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(bundle);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/v1/admin/dashboards/import
 * Accepts a JSON bundle (as produced by export) and creates a new draft template.
 * Unknown widgetKeys are silently skipped (the definition may not exist on target tenant).
 */
export async function importDashboardTemplate(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const bundle = req.body;

    if (
      !bundle?.__exportVersion ||
      !bundle?.template ||
      !Array.isArray(bundle?.widgets)
    ) {
      res.status(422).json({
        success: false,
        message: "Invalid bundle format. Expected a dashboard export bundle.",
      });
      return;
    }

    const t = bundle.template;
    if (!t?.name) {
      res
        .status(422)
        .json({ success: false, message: "Bundle missing template.name" });
      return;
    }

    // Validate widget keys against known definitions
    const { WidgetDefinition } =
      await import("../../models/dashboard/WidgetDefinition");
    const widgetKeys: string[] = [
      ...new Set<string>(bundle.widgets.map((w: any) => w.widgetKey as string)),
    ];
    const validDefs = await WidgetDefinition.find({
      widgetKey: { $in: widgetKeys },
      isActive: true,
    }).lean();
    const validKeySet = new Set(validDefs.map((d) => d.widgetKey));
    const validWidgets = bundle.widgets.filter((w: any) =>
      validKeySet.has(w.widgetKey),
    );
    const skippedKeys = widgetKeys.filter((k) => !validKeySet.has(k));

    const tenantOid = new mongoose.Types.ObjectId(tenantId);

    const newTemplate = await DashboardTemplate.create({
      tenantId: tenantOid,
      name: `${t.name} (Imported)`,
      description: t.description ?? "",
      icon: t.icon,
      colourLabel: t.colourLabel,
      globalDateRangeDays: t.globalDateRangeDays ?? 30,
      allowUserDateOverride: t.allowUserDateOverride !== false,
      status: "draft",
      createdBy: new mongoose.Types.ObjectId(req.user!.userId),
    });

    if (validWidgets.length > 0) {
      const defMap = Object.fromEntries(
        validDefs.map((d) => [d.widgetKey, d._id]),
      );
      await DashboardWidget.insertMany(
        validWidgets.map((w: any) => ({
          dashboardTemplateId: newTemplate._id,
          widgetDefinitionId: defMap[w.widgetKey],
          widgetKey: w.widgetKey,
          title: w.title ?? null,
          visualisationType: w.visualisationType,
          gridX: w.gridX ?? 0,
          gridY: w.gridY ?? 0,
          gridWidth: w.gridWidth ?? 4,
          gridHeight: w.gridHeight ?? 2,
          displayOrder: w.displayOrder ?? 0,
          config: w.config ?? {},
        })),
      );
    }

    res.status(201).json({
      success: true,
      data: {
        _id: newTemplate._id,
        name: newTemplate.name,
        widgetsImported: validWidgets.length,
        widgetsSkipped: skippedKeys,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
