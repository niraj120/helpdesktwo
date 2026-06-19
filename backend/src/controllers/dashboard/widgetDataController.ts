/**
 * Widget Data Controller
 *
 * GET /api/v1/widgets/:widgetKey/data
 *
 * Query params:
 *   dateRangeDays     (number, default 30)
 *   visualisationType (string, default 'kpi_tile')
 *   filters           (JSON string, optional)
 *   scopeMode         ('all' | 'project' | 'centre' | 'user')
 *   scopeProjectId    (string, optional)
 *   scopeCentreId     (string, optional)
 *   targetMode        ('project_total' | 'monthly', optional)
 */

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import {
  WidgetQueryContext,
  WidgetQueryParams,
  executeWidgetQuery,
} from "../../services/widgetQueryEngine";
import { checkAlertThreshold } from "../../services/alertThresholdService";
import { evaluateAlerts } from "../../services/dashboard/alertEvaluationService";
import { WidgetDefinition } from "../../models/dashboard/WidgetDefinition";

export async function getWidgetData(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const { widgetKey } = req.params;
    const user = req.user!;

    // Sprint 8: Per-widget permission enforcement
    const widgetDef = await WidgetDefinition.findOne({
      widgetKey,
      isActive: true,
    }).lean();
    if (widgetDef?.requiresPermission?.length) {
      const roleCode = (user.role as any)?.code ?? (user.role as any)?.roleCode;
      const isSuperAdmin = roleCode === "SUPER_ADMIN";
      if (!isSuperAdmin) {
        const userPerms: string[] = (user.role as any)?.permissions ?? [];
        const hasAccess = widgetDef.requiresPermission.some((p) =>
          userPerms.includes(p),
        );
        if (!hasAccess) {
          res.status(403).json({
            success: false,
            message: "You do not have permission to view this widget",
          });
          return;
        }
      }
    }

    const projects = (user as any).projects;
    const primaryProject =
      Array.isArray(projects) && projects.length > 0 ? projects[0] : null;
    const tenantId =
      primaryProject?._id?.toString() ?? primaryProject?.toString() ?? null;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        message: "No project context available for this user",
      });
      return;
    }

    // Build context from authenticated user
    const ctx: WidgetQueryContext = {
      tenantId,
      userId: user.userId,
      email: user.email,
      roleCode: (user.role as any)?.code ?? (user.role as any)?.roleCode,
      roleId: (user.role as any)?._id?.toString(),
      centreId: user.centreId,
      // All centres assigned to the user, so "My Centre" filters match every
      // centre of a multi-centre role (e.g. a commissioner mapped to many).
      centreIds:
        (user as any).centreIds && (user as any).centreIds.length > 0
          ? (user as any).centreIds
          : user.centreId
            ? [user.centreId]
            : [],
      districtId: (user as any).districtId,
      projectIds: Array.isArray(projects)
        ? projects.map((p: any) => p._id?.toString() ?? p.toString())
        : [tenantId],
      primaryProjectId: tenantId,
      name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    };

    // Parse query params
    const dateRangeDays = parseInt(String(req.query.dateRangeDays ?? "30"), 10);
    const visualisationType = String(req.query.visualisationType ?? "kpi_tile");

    let filters: Record<string, any> = {};
    if (req.query.filters) {
      try {
        filters = JSON.parse(String(req.query.filters));
      } catch {
        // ignore malformed filters
      }
    }

    const scopeMode = (req.query.scopeMode as string) ?? "all";
    const scopeOverride =
      scopeMode !== "all"
        ? {
            mode: scopeMode as "project" | "centre" | "user",
            projectId: req.query.scopeProjectId as string | undefined,
            centreId: req.query.scopeCentreId as string | undefined,
            userId: req.query.scopeUserId as string | undefined,
          }
        : undefined;

    const params: WidgetQueryParams = {
      dateRangeDays: isNaN(dateRangeDays) ? 30 : dateRangeDays,
      // Custom range bounds (dateRangeDays === -3) and the dashboard-level
      // "All time" floor (dateRangeDays === 0) — passed by the frontend.
      customStart: req.query.customStart ? String(req.query.customStart) : null,
      customEnd: req.query.customEnd ? String(req.query.customEnd) : null,
      allTimeStart: req.query.allTimeStart
        ? String(req.query.allTimeStart)
        : null,
      filters,
      visualisationType,
      scopeOverride,
      targetMode:
        (req.query.targetMode as "project_total" | "monthly" | undefined) ??
        "project_total",
      targetCount: req.query.targetCount
        ? Math.max(0, parseInt(String(req.query.targetCount), 10))
        : undefined,
      excludeRoleIds: req.query.excludeRoleIds
        ? String(req.query.excludeRoleIds)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    };

    if (widgetKey === "user_required_vs_onboarded") {
      console.log("[DEBUG widget]", widgetKey, {
        targetCount: req.query.targetCount,
        excludeRoleIds: req.query.excludeRoleIds,
        parsed_targetCount: params.targetCount,
        parsed_excludeRoleIds: params.excludeRoleIds,
      });
    }

    const result = await executeWidgetQuery(widgetKey, ctx, params);

    // Phase 3: fire-and-forget alert threshold check for KPI tile values
    if (
      result?.data?.value !== undefined &&
      typeof result.data.value === "number" &&
      params.visualisationType === "kpi_tile"
    ) {
      checkAlertThreshold(
        widgetKey,
        result.data.value,
        tenantId,
        params.filters ?? {},
      ).catch(() => {});

      // Sprint 11: evaluate DB-backed threshold alerts
      evaluateAlerts(widgetKey, result.data.value, tenantId).catch(() => {});
    }

    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message?.includes("No query handler registered")) {
      res.status(404).json({ success: false, message: err.message });
    } else {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
