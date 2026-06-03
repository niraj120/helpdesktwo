/**
 * Footfall Widget Handlers
 *
 * Widgets:
 *   1. ticket_footfall_count   — unique students + total follow-up responses
 *   2. ticket_footfall_trend   — daily footfall over time (line chart)
 *   3. ticket_footfall_by_center — footfall grouped by centre (bar chart)
 *
 * "Footfall" definition:
 *   uniqueStudentCount  = distinct non-empty metadata.studentEmail values
 *   totalResponses      = total comments/replies across matched tickets
 *   footfallCount       = uniqueStudentCount + totalResponses
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetQueryContext,
  WidgetQueryParams,
  WidgetData,
  buildDateRange,
  registerWidgetHandler,
} from "../widgetQueryEngine";

const getTicketModel = () => mongoose.model("Ticket");

// ─── KPI trend helper ──────────────────────────────────────────────────────

function kpiTrend(
  current: number,
  previous: number,
  higherIsBetter = true,
): WidgetData {
  const delta = current - previous;
  const deltaPercent =
    previous > 0 ? Math.round((delta / previous) * 100 * 10) / 10 : 0;
  return {
    value: current,
    trend: {
      delta,
      deltaPercent,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    },
    trendDirection: higherIsBetter ? "higher_is_better" : "lower_is_better",
  };
}

// ─── Footfall aggregate helper ────────────────────────────────────────────────

async function computeFootfall(
  Ticket: ReturnType<typeof getTicketModel>,
  matchQuery: Record<string, any>,
): Promise<number> {
  const [agg] = await Ticket.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        uniqueStudentEmails: { $addToSet: "$metadata.studentEmail" },
        totalResponses: {
          $sum: { $size: { $ifNull: ["$threads", []] } },
        },
      },
    },
  ]);
  if (!agg) return 0;
  const uniqueCount = (agg.uniqueStudentEmails as string[]).filter(
    Boolean,
  ).length;
  return uniqueCount + (agg.totalResponses as number);
}

// ─── 1. ticket_footfall_count ─────────────────────────────────────────────────

const ticketFootfallCountHandler: QueryHandler = {
  widgetKey: "ticket_footfall_count",
  cacheTtlSeconds: 120,

  async execute(
    _ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );

    const [current, previous] = await Promise.all([
      computeFootfall(Ticket, {
        ...scopedQuery,
        createdAt: { $gte: start, $lte: end },
      }),
      computeFootfall(Ticket, {
        ...scopedQuery,
        createdAt: { $gte: prevStart, $lt: start },
      }),
    ]);

    return kpiTrend(current, previous, true);
  },
};

// ─── 2. ticket_footfall_trend ─────────────────────────────────────────────────

const ticketFootfallTrendHandler: QueryHandler = {
  widgetKey: "ticket_footfall_trend",
  cacheTtlSeconds: 300,

  async execute(
    _ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);

    const rows = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          uniqueStudentEmails: { $addToSet: "$metadata.studentEmail" },
          totalResponses: {
            $sum: { $size: { $ifNull: ["$threads", []] } },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const points = rows.map((r) => ({
      date: r._id as string,
      value:
        (r.uniqueStudentEmails as string[]).filter(Boolean).length +
        (r.totalResponses as number),
    }));

    return { points, label: "Footfall" };
  },
};

// ─── 3. ticket_footfall_by_center ─────────────────────────────────────────────

const ticketFootfallByCenterHandler: QueryHandler = {
  widgetKey: "ticket_footfall_by_center",
  cacheTtlSeconds: 300,

  async execute(
    _ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);

    const rows = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$metadata.centerName", "Unassigned"] },
          uniqueStudentEmails: { $addToSet: "$metadata.studentEmail" },
          totalResponses: {
            $sum: { $size: { $ifNull: ["$threads", []] } },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const items = rows.map((r) => ({
      label: r._id as string,
      value:
        (r.uniqueStudentEmails as string[]).filter(Boolean).length +
        (r.totalResponses as number),
    }));

    return { items };
  },
};

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerFootfallHandlers(): void {
  registerWidgetHandler(ticketFootfallCountHandler);
  registerWidgetHandler(ticketFootfallTrendHandler);
  registerWidgetHandler(ticketFootfallByCenterHandler);
}
