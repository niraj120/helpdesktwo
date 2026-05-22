/**
 * se_* Widget Handlers — SLA & Escalation
 * Keys: se_active_sla_policies, se_sla_breached_count, se_sla_compliance_rate,
 *       se_escalations_raised, se_escalations_resolved, se_escalation_rate,
 *       se_avg_escalation_time, se_breach_by_priority, se_breach_trend
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetData,
  buildDateRange,
  registerWidgetHandler,
} from "../widgetQueryEngine";

const getSLA      = () => mongoose.model("SLATracking");
const getSLARule  = () => mongoose.model("SLARule");
const getTicket   = () => mongoose.model("Ticket");
const getStatus   = () => mongoose.model("Status");

async function loadClosedCodes(tenantId: string): Promise<number[]> {
  const docs = (await getStatus()
    .find({ projectId: new mongoose.Types.ObjectId(tenantId), isActive: true, isClosed: true })
    .select("code")
    .lean()) as Array<{ code: number }>;
  return docs.map((d) => d.code);
}

// ─── se_active_sla_policies ───────────────────────────────────────────────────
const seActiveSLAPoliciesHandler: QueryHandler = {
  widgetKey: "se_active_sla_policies",
  cacheTtlSeconds: 600,
  async execute(ctx): Promise<WidgetData> {
    const value = await getSLARule().countDocuments({
      isActive: true,
      projectIds: new mongoose.Types.ObjectId(ctx.tenantId),
    });
    return { value };
  },
};

// ─── se_sla_breached_count ────────────────────────────────────────────────────
const seSLABreachedCountHandler: QueryHandler = {
  widgetKey: "se_sla_breached_count",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await getSLA().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      resolutionStatus: "breached",
      createdAt: { $gte: start, $lte: end },
    });
    return { value, trendDirection: "lower_is_better" };
  },
};

// ─── se_sla_compliance_rate ───────────────────────────────────────────────────
const seSLAComplianceRateHandler: QueryHandler = {
  widgetKey: "se_sla_compliance_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const [met, total] = await Promise.all([
      getSLA().countDocuments({ projectId: pid, resolutionStatus: "met",     createdAt: { $gte: start, $lte: end } }),
      getSLA().countDocuments({ projectId: pid, resolutionStatus: { $in: ["met", "breached"] }, createdAt: { $gte: start, $lte: end } }),
    ]);
    const value = total > 0 ? Math.round((met / total) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${met} of ${total} within SLA`,
      thresholds: { green: 90, amber: 75 },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── se_escalations_raised (SLA records with at least one escalation) ─────────
const seEscalationsRaisedHandler: QueryHandler = {
  widgetKey: "se_escalations_raised",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await getSLA().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      createdAt: { $gte: start, $lte: end },
      escalationHistory: { $exists: true, $not: { $size: 0 } },
    });
    return { value, trendDirection: "lower_is_better" };
  },
};

// ─── se_escalations_resolved (escalated tickets that are now closed) ──────────
const seEscalationsResolvedHandler: QueryHandler = {
  widgetKey: "se_escalations_resolved",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const closedCodes = await loadClosedCodes(ctx.tenantId);

    // Get escalated ticket IDs in range
    const escalatedDocs = await getSLA().find({
      projectId: pid,
      createdAt: { $gte: start, $lte: end },
      escalationHistory: { $exists: true, $not: { $size: 0 } },
    }).select("ticketId").lean() as Array<{ ticketId: mongoose.Types.ObjectId }>;

    const escalatedTicketIds = escalatedDocs.map((d) => d.ticketId);
    if (escalatedTicketIds.length === 0) return { value: 0 };

    const value = await getTicket().countDocuments({
      _id: { $in: escalatedTicketIds },
      status: { $in: closedCodes },
    });

    return { value, trendDirection: "higher_is_better" };
  },
};

// ─── se_escalation_rate (% of tickets that were escalated) ───────────────────
const seEscalationRateHandler: QueryHandler = {
  widgetKey: "se_escalation_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const [escalated, total] = await Promise.all([
      getSLA().countDocuments({
        projectId: pid,
        createdAt: { $gte: start, $lte: end },
        escalationHistory: { $exists: true, $not: { $size: 0 } },
      }),
      getSLA().countDocuments({
        projectId: pid,
        createdAt: { $gte: start, $lte: end },
      }),
    ]);
    const value = total > 0 ? Math.round((escalated / total) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${escalated} of ${total} escalated`,
      thresholds: { green: 5, amber: 15 },
      trendDirection: "lower_is_better",
    };
  },
};

// ─── se_avg_escalation_time (avg hours from creation to first escalation) ─────
const seAvgEscalationTimeHandler: QueryHandler = {
  widgetKey: "se_avg_escalation_time",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const res = await getSLA().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          createdAt: { $gte: start, $lte: end },
          "escalationHistory.0": { $exists: true },
        },
      },
      {
        $project: {
          firstEscalatedAt: { $arrayElemAt: ["$escalationHistory.escalatedAt", 0] },
          createdAt: 1,
        },
      },
      {
        $group: {
          _id: null,
          avgMs: { $avg: { $subtract: ["$firstEscalatedAt", "$createdAt"] } },
        },
      },
    ]);
    const avgMs = res[0]?.avgMs ?? null;
    const value = avgMs !== null ? Math.round(avgMs / 1000 / 60 / 60 * 10) / 10 : null;
    return { value, unit: "hrs", trendDirection: "lower_is_better" };
  },
};

// ─── se_breach_by_priority (breach count grouped by ticket priority) ──────────
const seBreachByPriorityHandler: QueryHandler = {
  widgetKey: "se_breach_by_priority",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const rows = await getSLA().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          resolutionStatus: "breached",
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: "tickets",
          localField: "ticketId",
          foreignField: "_id",
          as: "ticket",
        },
      },
      { $unwind: { path: "$ticket", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id:   { $ifNull: ["$ticket.priority", "Unknown"] },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, priority: "$_id", count: 1 } },
      { $sort: { count: -1 } },
    ]);
    return { segments: rows };
  },
};

// ─── se_breach_trend (daily breach count over date range) ────────────────────
const seBreachTrendHandler: QueryHandler = {
  widgetKey: "se_breach_trend",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end, startStr, endStr } = buildDateRange(params.dateRangeDays);
    const rows = await getSLA().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          resolutionStatus: "breached",
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id:   { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, date: "$_id", count: 1 } },
      { $sort: { date: 1 } },
    ]);
    return {
      series: [
        {
          key: "breaches",
          label: "SLA Breaches",
          color: "#ef4444",
          data: rows.map((r: any) => ({ x: r.date, y: r.count })),
        },
      ],
      xAxisLabel: "Date",
      yAxisLabel: "Breaches",
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── Registration ─────────────────────────────────────────────────────────────
export function registerSlaEscHandlers(): void {
  registerWidgetHandler(seActiveSLAPoliciesHandler);
  registerWidgetHandler(seSLABreachedCountHandler);
  registerWidgetHandler(seSLAComplianceRateHandler);
  registerWidgetHandler(seEscalationsRaisedHandler);
  registerWidgetHandler(seEscalationsResolvedHandler);
  registerWidgetHandler(seEscalationRateHandler);
  registerWidgetHandler(seAvgEscalationTimeHandler);
  registerWidgetHandler(seBreachByPriorityHandler);
  registerWidgetHandler(seBreachTrendHandler);
  console.log("📊 Dashboard Engine: se_* handlers registered (9)");
}
