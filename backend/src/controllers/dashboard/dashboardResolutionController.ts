/**
 * Dashboard Resolution Controller
 *
 * GET /api/v1/me/dashboards — resolves which templates/tabs this user sees.
 *
 * Resolution order (highest priority first):
 *   1. Individual user assignment (assigneeType = 'user')
 *   2. Role-level assignment (assigneeType = 'role')
 *
 * Returns ordered list of tabs (template manifests) with widget layout.
 */

import mongoose from "mongoose";
import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { DashboardAssignment } from "../../models/dashboard/DashboardAssignment";
import { DashboardTemplate } from "../../models/dashboard/DashboardTemplate";
import { DashboardWidget } from "../../models/dashboard/DashboardWidget";
import { UserDashboardPreference } from "../../models/dashboard/UserDashboardPreference";
import { User } from "../../models/User";

export async function resolveMyDashboards(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const roleId = (req.user?.role as any)?._id?.toString();

    console.log(
      `[DashboardResolution] userId=${userId} roleId=${roleId} roleCode=${(req.user?.role as any)?.code}`,
    );

    // Collect all tenantIds this user might belong to:
    // 1. User's own projects (direct assignment)
    // 2. Role's projects (role-scoped projects)
    // This handles mixed scenarios where the assignment was created from either source.
    const dbUser = await User.findById(userId).select("projects").lean();
    const userProjects: string[] = ((dbUser as any)?.projects ?? [])
      .map((p: any) => p?._id?.toString() ?? p?.toString())
      .filter(Boolean);
    const roleProjects: string[] = ((req.user as any)?.projects ?? [])
      .map((p: any) => p?._id?.toString() ?? p?.toString())
      .filter(Boolean);
    const allTenantIds = [...new Set([...userProjects, ...roleProjects])];

    // Only bail out early for user-assignment queries when there are no projects.
    // Role assignments are system-wide, so we proceed even with an empty tenantList.
    const tenantOidList = allTenantIds.map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    // Fetch user-level and role-level assignments in parallel.
    // User assignments are scoped to the user's projects (tenantId filter).
    // Role assignments are system-wide — a role is not tied to a specific project,
    // so we intentionally skip the tenantId filter for role-type lookups. This
    // prevents the mismatch where the admin who created the assignment was on a
    // different project than the counselor who is resolving their dashboards.
    const [userAssignments, roleAssignments] = await Promise.all([
      // User-level assignments: only run if the user has project memberships.
      // An empty $in array matches nothing in MongoDB, which is correct here.
      tenantOidList.length > 0
        ? DashboardAssignment.find({
            assigneeType: "user",
            assigneeId: new mongoose.Types.ObjectId(userId),
            tenantId: { $in: tenantOidList },
          })
            .sort({ tabOrder: 1 })
            .lean()
        : Promise.resolve([]),
      roleId
        ? DashboardAssignment.find({
            assigneeType: "role",
            assigneeId: new mongoose.Types.ObjectId(roleId),
          })
            .sort({ tabOrder: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

    console.log(
      `[DashboardResolution] userAssignments=${userAssignments.length} roleAssignments=${roleAssignments.length}`,
    );

    // Deduplicate: user-level overrides role-level
    const seen = new Set<string>();
    const merged = [...userAssignments, ...roleAssignments].filter((a) => {
      const key = a.dashboardTemplateId.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(
      `[DashboardResolution] merged=${merged.length} assignments total`,
    );

    if (merged.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const templateIds = merged.map((a) => a.dashboardTemplateId);

    // Debug: check what templates exist and whether they are published
    const allTemplatesCheck = await DashboardTemplate.find({
      _id: { $in: templateIds },
    })
      .select("name status")
      .lean();
    console.log(
      `[DashboardResolution] templates found for assigned IDs:`,
      allTemplatesCheck.map((t: any) => `${t.name} (${t.status})`),
    );

    // Load templates, widgets, and preferences in parallel
    const [templates, widgetsByTemplate, preferences] = await Promise.all([
      DashboardTemplate.find({
        _id: { $in: templateIds },
        status: "published",
      })
        .select("-__v")
        .lean(),
      DashboardWidget.find({ dashboardTemplateId: { $in: templateIds } })
        .sort({ displayOrder: 1 })
        .select("-__v")
        .lean(),
      UserDashboardPreference.find({
        userId: new mongoose.Types.ObjectId(userId),
        dashboardTemplateId: { $in: templateIds },
      }).lean(),
    ]);

    const templateMap = new Map(templates.map((t) => [t._id.toString(), t]));
    const widgetMap = new Map<string, any[]>();
    for (const w of widgetsByTemplate) {
      const key = w.dashboardTemplateId.toString();
      if (!widgetMap.has(key)) widgetMap.set(key, []);
      widgetMap.get(key)!.push(w);
    }
    const prefMap = new Map(
      preferences.map((p) => [p.dashboardTemplateId.toString(), p]),
    );

    const tabs = merged
      .map((assignment, idx) => {
        const templateId = assignment.dashboardTemplateId.toString();
        const template = templateMap.get(templateId);
        if (!template) return null; // template not published, skip

        const pref = prefMap.get(templateId);
        // Merge widget-level overrides (isCollapsed, isHidden) into widget objects
        const rawWidgets = widgetMap.get(templateId) ?? [];
        const widgetOverrideMap = new Map(
          (pref?.widgetOverrides ?? []).map((o) => [o.widgetId?.toString(), o]),
        );
        const widgets = rawWidgets.map((w) => {
          const override = widgetOverrideMap.get(w._id?.toString());
          if (!override) return w;
          return {
            ...w,
            isCollapsed: override.isCollapsed ?? false,
            isHidden: override.isHidden ?? false,
          };
        });
        return {
          tabIndex: idx,
          tabOrder: assignment.tabOrder ?? idx,
          isDefault: assignment.isDefault ?? false,
          dashboardTemplateId: templateId,
          name: template.name,
          globalDateRangeDays:
            pref?.dateRangeDays ?? template.globalDateRangeDays ?? 30,
          allowUserDateOverride: template.allowUserDateOverride ?? true,
          allTimeStartDate: (template as any).allTimeStartDate ?? null,
          autoRefreshSeconds: (template as any).autoRefreshSeconds ?? 0,
          allowWidgetExport: (template as any).allowWidgetExport ?? true,
          scopeOverride: pref?.scopeOverride ?? null,
          sections: ((template as any).sections ?? []).sort(
            (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
          ),
          widgets,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.tabOrder ?? 0) - (b!.tabOrder ?? 0));

    res.json({ success: true, data: tabs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateMyPreference(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.userId);
    const dashboardTemplateId = new mongoose.Types.ObjectId(
      req.params.templateId,
    );
    const { dateRangeDays, scopeOverride, widgetId, isCollapsed } = req.body;

    // Widget-level collapse toggle: upsert into widgetOverrides array
    if (widgetId !== undefined && isCollapsed !== undefined) {
      const widgetObjectId = new mongoose.Types.ObjectId(widgetId);
      let pref = await UserDashboardPreference.findOne({
        userId,
        dashboardTemplateId,
      });
      if (!pref) {
        pref = new UserDashboardPreference({
          userId,
          dashboardTemplateId,
          widgetOverrides: [],
        });
      }
      const overrides = pref.widgetOverrides ?? [];
      const idx = overrides.findIndex(
        (o) => o.widgetId?.toString() === widgetId,
      );
      if (idx >= 0) {
        overrides[idx] = {
          ...overrides[idx],
          widgetId: widgetObjectId,
          isCollapsed,
        };
      } else {
        overrides.push({ widgetId: widgetObjectId, isCollapsed });
      }
      pref.widgetOverrides = overrides;
      await pref.save();
      res.json({ success: true, data: pref });
      return;
    }

    // Dashboard-level preference update (date range / scope)
    const pref = await UserDashboardPreference.findOneAndUpdate(
      { userId, dashboardTemplateId },
      { $set: { dateRangeDays, scopeOverride } },
      { new: true, upsert: true },
    );

    res.json({ success: true, data: pref });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
