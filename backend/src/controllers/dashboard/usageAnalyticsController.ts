/**
 * Dashboard Usage Analytics Controller (Phase 3)
 *
 * POST /api/v1/usage/track         — record a usage event (fire-and-forget)
 * GET  /api/v1/admin/usage/summary — admin analytics summary
 */

import mongoose from "mongoose";
import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { DashboardUsageEvent } from "../../models/dashboard/DashboardUsageEvent";

function getTenantId(req: AuthRequest): string | null {
  const projects = (req.user as any)?.projects;
  if (Array.isArray(projects) && projects.length > 0) {
    const first = projects[0];
    return first?._id?.toString() ?? first?.toString() ?? null;
  }
  return null;
}

// ─── POST /api/v1/usage/track ──────────────────────────────────────────────────

export async function trackUsageEvent(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  // Respond immediately — analytics is fire-and-forget
  res.status(202).json({ success: true });

  try {
    const userId = req.user!.userId;
    const tenantId = getTenantId(req);
    if (!tenantId) return;

    const {
      eventType,
      dashboardTemplateId,
      personalDashboardId,
      widgetKey,
      sessionId,
    } = req.body;

    const validEvents = [
      "dashboard_view",
      "widget_view",
      "widget_drill_through",
    ];
    if (!validEvents.includes(eventType)) return;

    await DashboardUsageEvent.create({
      userId: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      eventType,
      dashboardTemplateId: dashboardTemplateId
        ? new mongoose.Types.ObjectId(dashboardTemplateId)
        : undefined,
      personalDashboardId: personalDashboardId
        ? new mongoose.Types.ObjectId(personalDashboardId)
        : undefined,
      widgetKey: widgetKey ?? undefined,
      sessionId:
        typeof sessionId === "string" ? sessionId.slice(0, 64) : undefined,
    });
  } catch {
    // Silently swallow analytics errors — never affect user experience
  }
}

// ─── GET /api/v1/admin/usage/summary ──────────────────────────────────────────

export async function getUsageSummary(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: "No project context" });
      return;
    }

    const tenantOid = new mongoose.Types.ObjectId(tenantId);
    const days = Math.min(Number(req.query.days ?? 30), 90);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const [dashboardViews, widgetViews, topWidgets, topDashboards] =
      await Promise.all([
        // Total dashboard views
        DashboardUsageEvent.countDocuments({
          tenantId: tenantOid,
          eventType: "dashboard_view",
          createdAt: { $gte: since },
        }),
        // Total widget views
        DashboardUsageEvent.countDocuments({
          tenantId: tenantOid,
          eventType: "widget_view",
          createdAt: { $gte: since },
        }),
        // Top 10 widgets by views
        DashboardUsageEvent.aggregate([
          {
            $match: {
              tenantId: tenantOid,
              eventType: "widget_view",
              widgetKey: { $exists: true },
              createdAt: { $gte: since },
            },
          },
          { $group: { _id: "$widgetKey", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          { $project: { widgetKey: "$_id", count: 1, _id: 0 } },
        ]),
        // Top 10 dashboards by views
        DashboardUsageEvent.aggregate([
          {
            $match: {
              tenantId: tenantOid,
              eventType: "dashboard_view",
              dashboardTemplateId: { $exists: true },
              createdAt: { $gte: since },
            },
          },
          { $group: { _id: "$dashboardTemplateId", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "dashboardtemplates",
              localField: "_id",
              foreignField: "_id",
              as: "template",
            },
          },
          {
            $project: {
              dashboardTemplateId: "$_id",
              name: { $arrayElemAt: ["$template.name", 0] },
              count: 1,
              _id: 0,
            },
          },
        ]),
        // Unique active users in period
      ]);

    const uniqueUsers = await DashboardUsageEvent.distinct("userId", {
      tenantId: tenantOid,
      createdAt: { $gte: since },
    });

    res.json({
      success: true,
      data: {
        period: { days, since },
        summary: {
          dashboardViews,
          widgetViews,
          uniqueActiveUsers: uniqueUsers.length,
        },
        topWidgets,
        topDashboards,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
