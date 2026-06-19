/**
 * Miscellaneous Widget Handlers
 *
 * pr_* (8)  — Project-level metrics (Project model)
 * al_* (7)  — Alert metrics (DashThresholdAlert model)
 * wf_* (9)  — Workforce module stubs (not connected)
 * oh_* (7)  — Offline Helpdesk stubs (not connected)
 * tn_* (7)  — Tenant-level overview (Project + cross-collection)
 * ai_* (8)  — AI analytics stubs (not connected)
 * legacy (3) — ticket_inflow_today, ticket_closed_today, ticket_avg_first_response
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetData,
  buildDateRange,
  registerWidgetHandler,
} from "../widgetQueryEngine";

const getProject = () => mongoose.model("Project");
const getAlert = () => mongoose.model("DashThresholdAlert");
const getTicket = () => mongoose.model("Ticket");
const getStatus = () => mongoose.model("Status");
const getSLA = () => mongoose.model("SLATracking");
const getFeedback = () => mongoose.model("FeedbackScore");
const getUser = () => mongoose.model("User");

async function loadClosedCodes(tenantId: string): Promise<number[]> {
  const docs = (await getStatus()
    .find({
      projectId: new mongoose.Types.ObjectId(tenantId),
      isActive: true,
      isClosed: true,
    })
    .select("code")
    .lean()) as Array<{ code: number }>;
  return docs.map((d) => d.code);
}

// ═══════════════════════════════════════════════════════════════════════════════
// pr_* — Project Metrics
// ═══════════════════════════════════════════════════════════════════════════════

const prTotalProjectsHandler: QueryHandler = {
  widgetKey: "pr_total_projects",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    const value = await getProject().countDocuments({});
    return { value };
  },
};

const prActiveProjectsHandler: QueryHandler = {
  widgetKey: "pr_active_projects",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    const value = await getProject().countDocuments({ status: "active" });
    return { value, trendDirection: "higher_is_better" };
  },
};

const prCompletedProjectsHandler: QueryHandler = {
  widgetKey: "pr_completed_projects",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    const value = await getProject().countDocuments({ status: "completed" });
    return { value };
  },
};

const prOverdueProjectsHandler: QueryHandler = {
  widgetKey: "pr_overdue_projects",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    // Projects that are still "active" but have passed their endDate (if field exists)
    const value = await getProject().countDocuments({
      status: "active",
      endDate: { $lt: new Date() },
    });
    return { value, trendDirection: "lower_is_better" };
  },
};

const prCompletionRateHandler: QueryHandler = {
  widgetKey: "pr_completion_rate",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    const [completed, total] = await Promise.all([
      getProject().countDocuments({ status: "completed" }),
      getProject().countDocuments({}),
    ]);
    const value =
      total > 0 ? Math.round((completed / total) * 1000) / 10 : null;
    return { value, unit: "%", trendDirection: "higher_is_better" };
  },
};

const prTicketsPerProjectHandler: QueryHandler = {
  widgetKey: "pr_tickets_per_project",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const rows = await getTicket().aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: "$metadata.projectId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          projectId: "$_id",
          name: { $ifNull: ["$project.name", "Unknown"] },
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);
    return { segments: rows };
  },
};

const prProjectHealthHandler: QueryHandler = {
  widgetKey: "pr_project_health",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    // Composite: active / total as a simple health proxy
    const { start, end } = buildDateRange(params);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const closedCodes = await loadClosedCodes(ctx.tenantId);
    const [closed, total] = await Promise.all([
      getTicket().countDocuments({
        "metadata.projectId": pid,
        status: { $in: closedCodes },
        createdAt: { $gte: start, $lte: end },
      }),
      getTicket().countDocuments({
        "metadata.projectId": pid,
        createdAt: { $gte: start, $lte: end },
      }),
    ]);
    const resolutionRate =
      total > 0 ? Math.round((closed / total) * 1000) / 10 : null;
    return {
      value: resolutionRate,
      unit: "%",
      subtitle: "Ticket resolution rate (health proxy)",
      thresholds: { green: 80, amber: 60 },
      trendDirection: "higher_is_better",
    };
  },
};

const prMilestonesMetHandler: QueryHandler = {
  widgetKey: "pr_milestones_met",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    return {
      value: null,
      noData: true,
      message: "Milestones module not connected",
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// al_* — Alert Metrics
// ═══════════════════════════════════════════════════════════════════════════════

const alActiveAlertsHandler: QueryHandler = {
  widgetKey: "al_active_alerts",
  cacheTtlSeconds: 60,
  async execute(ctx): Promise<WidgetData> {
    const value = await getAlert().countDocuments({
      tenant_id: ctx.tenantId,
      is_active: true,
    });
    return { value, trendDirection: "lower_is_better" };
  },
};

const alResolvedAlertsHandler: QueryHandler = {
  widgetKey: "al_resolved_alerts",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    // Alerts that fired (last_triggered_at) but are no longer active
    const value = await getAlert().countDocuments({
      tenant_id: ctx.tenantId,
      is_active: false,
      last_triggered_at: { $gte: start, $lte: end },
    });
    return { value };
  },
};

const alCriticalAlertsHandler: QueryHandler = {
  widgetKey: "al_critical_alerts",
  cacheTtlSeconds: 60,
  async execute(ctx): Promise<WidgetData> {
    const value = await getAlert().countDocuments({
      tenant_id: ctx.tenantId,
      is_active: true,
      severity: "critical",
    });
    return { value, trendDirection: "lower_is_better" };
  },
};

const alAlertResolutionRateHandler: QueryHandler = {
  widgetKey: "al_alert_resolution_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const [resolved, total] = await Promise.all([
      getAlert().countDocuments({
        tenant_id: ctx.tenantId,
        is_active: false,
        last_triggered_at: { $gte: start, $lte: end },
      }),
      getAlert().countDocuments({
        tenant_id: ctx.tenantId,
        last_triggered_at: { $gte: start, $lte: end },
      }),
    ]);
    const value = total > 0 ? Math.round((resolved / total) * 1000) / 10 : null;
    return { value, unit: "%" };
  },
};

const alAvgAlertResponseHandler: QueryHandler = {
  widgetKey: "al_avg_alert_response",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    return {
      value: null,
      noData: true,
      message: "Alert response time tracking not available",
    };
  },
};

const alAlertsByTypeHandler: QueryHandler = {
  widgetKey: "al_alerts_by_type",
  cacheTtlSeconds: 300,
  async execute(ctx): Promise<WidgetData> {
    const rows = await getAlert().aggregate([
      { $match: { tenant_id: ctx.tenantId, is_active: true } },
      {
        $group: {
          _id: { $ifNull: ["$widget_key", "Unknown"] },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, widgetKey: "$_id", count: 1 } },
      { $sort: { count: -1 } },
    ]);
    return { segments: rows };
  },
};

const alAlertTrendHandler: QueryHandler = {
  widgetKey: "al_alert_trend",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );
    const rows = await getAlert().aggregate([
      {
        $match: {
          tenant_id: ctx.tenantId,
          last_triggered_at: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$last_triggered_at" },
          },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: "$_id", count: 1 } },
      { $sort: { date: 1 } },
    ]);
    return {
      series: [
        {
          key: "alerts",
          label: "Alerts Triggered",
          color: "#f97316",
          data: rows.map((r: any) => ({ x: r.date, y: r.count })),
        },
      ],
      xAxisLabel: "Date",
      yAxisLabel: "Triggers",
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// wf_* — Workforce Module Stubs
// ═══════════════════════════════════════════════════════════════════════════════

function wfStub(widgetKey: string): QueryHandler {
  return {
    widgetKey,
    cacheTtlSeconds: 3600,
    async execute(): Promise<WidgetData> {
      return {
        value: null,
        noData: true,
        message: "Workforce management module not connected",
      };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// oh_* — Offline Helpdesk Module Stubs
// ═══════════════════════════════════════════════════════════════════════════════

function ohStub(widgetKey: string): QueryHandler {
  return {
    widgetKey,
    cacheTtlSeconds: 3600,
    async execute(): Promise<WidgetData> {
      return {
        value: null,
        noData: true,
        message: "Offline helpdesk module not connected",
      };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// tn_* — Tenant Overview Metrics
// ═══════════════════════════════════════════════════════════════════════════════

const tnTotalTenantsHandler: QueryHandler = {
  widgetKey: "tn_total_tenants",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    const value = await getProject().countDocuments({});
    return { value };
  },
};

const tnActiveTenantsHandler: QueryHandler = {
  widgetKey: "tn_active_tenants",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    const value = await getProject().countDocuments({ status: "active" });
    return { value, trendDirection: "higher_is_better" };
  },
};

const tnTicketsPerTenantHandler: QueryHandler = {
  widgetKey: "tn_tickets_per_tenant",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const rows = await getTicket().aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: "$metadata.projectId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          projectId: "$_id",
          name: { $ifNull: ["$project.name", "Unknown"] },
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);
    return { segments: rows };
  },
};

const tnStudentsPerTenantHandler: QueryHandler = {
  widgetKey: "tn_students_per_tenant",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    const rows = await getUser().aggregate([
      { $match: { isActive: true } },
      { $unwind: { path: "$projects", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$projects", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          projectId: "$_id",
          name: { $ifNull: ["$project.name", "Unknown"] },
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);
    return { segments: rows };
  },
};

const tnCsatByTenantHandler: QueryHandler = {
  widgetKey: "tn_csat_by_tenant",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const rows = await getFeedback().aggregate([
      { $match: { submittedAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$projectId",
          avgRating: { $avg: "$overallRating" },
          responses: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          projectId: "$_id",
          name: { $ifNull: ["$project.name", "Unknown"] },
          avgRating: { $round: ["$avgRating", 2] },
          responses: 1,
        },
      },
      { $sort: { avgRating: -1 } },
    ]);
    return { segments: rows };
  },
};

const tnSLAComplianceTenantHandler: QueryHandler = {
  widgetKey: "tn_sla_compliance_tenant",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const rows = await getSLA().aggregate([
      {
        $match: {
          resolutionStatus: { $in: ["met", "breached"] },
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$projectId",
          met: {
            $sum: { $cond: [{ $eq: ["$resolutionStatus", "met"] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          projectId: "$_id",
          name: { $ifNull: ["$project.name", "Unknown"] },
          met: 1,
          total: 1,
          rate: {
            $cond: [
              { $gt: ["$total", 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ["$met", "$total"] }, 100] },
                  1,
                ],
              },
              null,
            ],
          },
        },
      },
      { $sort: { rate: -1 } },
    ]);
    return { segments: rows };
  },
};

const tnTenantHealthIndexHandler: QueryHandler = {
  widgetKey: "tn_tenant_health_index",
  cacheTtlSeconds: 600,
  async execute(): Promise<WidgetData> {
    return {
      value: null,
      noData: true,
      message: "Tenant health index calculation not yet configured",
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ai_* — AI Analytics Stubs
// ═══════════════════════════════════════════════════════════════════════════════

function aiStub(widgetKey: string): QueryHandler {
  return {
    widgetKey,
    cacheTtlSeconds: 3600,
    async execute(): Promise<WidgetData> {
      return {
        value: null,
        noData: true,
        message: "AI analytics module not connected",
      };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy ticket_* keys
// ═══════════════════════════════════════════════════════════════════════════════

const ticketInflowTodayHandler: QueryHandler = {
  widgetKey: "ticket_inflow_today",
  cacheTtlSeconds: 60,
  async execute(ctx): Promise<WidgetData> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const value = await getTicket().countDocuments({
      "metadata.projectId": new mongoose.Types.ObjectId(ctx.tenantId),
      createdAt: { $gte: todayStart },
    });
    return { value };
  },
};

const ticketClosedTodayHandler: QueryHandler = {
  widgetKey: "ticket_closed_today",
  cacheTtlSeconds: 60,
  async execute(ctx): Promise<WidgetData> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const closedCodes = await loadClosedCodes(ctx.tenantId);
    const value =
      closedCodes.length > 0
        ? await getTicket().countDocuments({
            "metadata.projectId": new mongoose.Types.ObjectId(ctx.tenantId),
            status: { $in: closedCodes },
            updatedAt: { $gte: todayStart },
          })
        : 0;
    return { value };
  },
};

const ticketAvgFirstResponseHandler: QueryHandler = {
  widgetKey: "ticket_avg_first_response",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const res = await getSLA().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          responseTime: { $exists: true, $gt: 0 },
          createdAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: null, avg: { $avg: "$responseTime" } } },
    ]);
    const value = res[0]?.avg != null ? Math.round(res[0].avg * 10) / 10 : null;
    return { value, unit: "min", trendDirection: "lower_is_better" };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════════════

export function registerMiscHandlers(): void {
  // pr_* handlers
  registerWidgetHandler(prTotalProjectsHandler);
  registerWidgetHandler(prActiveProjectsHandler);
  registerWidgetHandler(prCompletedProjectsHandler);
  registerWidgetHandler(prOverdueProjectsHandler);
  registerWidgetHandler(prCompletionRateHandler);
  registerWidgetHandler(prTicketsPerProjectHandler);
  registerWidgetHandler(prProjectHealthHandler);
  registerWidgetHandler(prMilestonesMetHandler);

  // al_* handlers
  registerWidgetHandler(alActiveAlertsHandler);
  registerWidgetHandler(alResolvedAlertsHandler);
  registerWidgetHandler(alCriticalAlertsHandler);
  registerWidgetHandler(alAlertResolutionRateHandler);
  registerWidgetHandler(alAvgAlertResponseHandler);
  registerWidgetHandler(alAlertsByTypeHandler);
  registerWidgetHandler(alAlertTrendHandler);

  // wf_* stubs (9)
  [
    "wf_total_staff",
    "wf_on_leave_today",
    "wf_available_agents",
    "wf_shift_coverage",
    "wf_avg_login_hours",
    "wf_overtime_hours",
    "wf_staff_utilization",
    "wf_leave_rate",
    "wf_headcount_trend",
  ].forEach((key) => registerWidgetHandler(wfStub(key)));

  // oh_* stubs (7)
  [
    "oh_total_walk_ins",
    "oh_visits_today",
    "oh_avg_visit_duration",
    "oh_issues_resolved_onsite",
    "oh_onsite_resolution_rate",
    "oh_peak_hours",
    "oh_visit_trend",
  ].forEach((key) => registerWidgetHandler(ohStub(key)));

  // tn_* handlers
  registerWidgetHandler(tnTotalTenantsHandler);
  registerWidgetHandler(tnActiveTenantsHandler);
  registerWidgetHandler(tnTicketsPerTenantHandler);
  registerWidgetHandler(tnStudentsPerTenantHandler);
  registerWidgetHandler(tnCsatByTenantHandler);
  registerWidgetHandler(tnSLAComplianceTenantHandler);
  registerWidgetHandler(tnTenantHealthIndexHandler);

  // ai_* stubs (8)
  [
    "ai_predicted_ticket_volume",
    "ai_churn_risk_score",
    "ai_sentiment_score",
    "ai_auto_resolved_tickets",
    "ai_resolution_confidence",
    "ai_topic_clusters",
    "ai_anomaly_alerts",
    "ai_agent_burnout_risk",
  ].forEach((key) => registerWidgetHandler(aiStub(key)));

  // Legacy
  registerWidgetHandler(ticketInflowTodayHandler);
  registerWidgetHandler(ticketClosedTodayHandler);
  registerWidgetHandler(ticketAvgFirstResponseHandler);

  console.log(
    "📊 Dashboard Engine: misc handlers registered (pr×8, al×7, wf×9 stubs, oh×7 stubs, tn×7, ai×8 stubs, legacy×3 = 49)",
  );
}
