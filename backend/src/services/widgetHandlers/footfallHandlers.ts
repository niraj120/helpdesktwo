/**
 * Footfall Widget Handlers
 *
 * Widgets:
 *   1. ticket_footfall_count   — unique students + total follow-up responses
 *   2. ticket_footfall_trend   — daily footfall over time (line chart)
 *   3. ticket_footfall_by_center — footfall grouped by centre (bar chart)
 *
 * "Footfall" definition (per day / per range):
 *   footfall = (new queries created in range)
 *            + (distinct EXISTING queries — created before the range — that
 *               received at least one reply (thread) or comment in the range)
 *
 *   - An existing query counts ONCE no matter how many replies it got.
 *   - A query created AND replied to in the same range counts once (as "new").
 *   - A status change made together with a comment counts (comments are included).
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

// $or that matches a ticket with at least one reply (thread) OR comment whose
// createdAt falls inside [start, end].
function activityInRange(start: Date, end: Date) {
  return {
    $or: [
      { threads: { $elemMatch: { createdAt: { $gte: start, $lte: end } } } },
      { comments: { $elemMatch: { createdAt: { $gte: start, $lte: end } } } },
    ],
  };
}

async function computeFootfall(
  Ticket: ReturnType<typeof getTicketModel>,
  scopedQuery: Record<string, any>,
  start: Date,
  end: Date,
): Promise<number> {
  const [newCount, existingAgg] = await Promise.all([
    // New queries created in the range.
    Ticket.countDocuments({
      ...scopedQuery,
      createdAt: { $gte: start, $lte: end },
    }),
    // Distinct existing queries (created before the range) with a reply/comment
    // in the range. One document per ticket, so a $count is already distinct.
    Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          createdAt: { $lt: start },
          ...activityInRange(start, end),
        },
      },
      { $count: "n" },
    ]),
  ]);

  return (newCount as number) + ((existingAgg[0]?.n as number) ?? 0);
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
    const { start, end } = buildDateRange(params);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );

    const [current, previous] = await Promise.all([
      computeFootfall(Ticket, scopedQuery, start, end),
      computeFootfall(Ticket, scopedQuery, prevStart, start),
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
    const { start, end } = buildDateRange(params);
    const day = (field: any) => ({
      $dateToString: { format: "%Y-%m-%d", date: field },
    });

    // New queries created, per day.
    const newRows = await Ticket.aggregate([
      { $match: { ...scopedQuery, createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: day("$createdAt"), c: { $sum: 1 } } },
    ]);

    // Existing queries active per day: a reply/comment dated on a LATER calendar
    // day than the ticket's creation. Each ticket counts once per active day.
    const activeRows = await Ticket.aggregate([
      { $match: { ...scopedQuery, ...activityInRange(start, end) } },
      {
        $project: {
          createdDay: day("$createdAt"),
          events: {
            $concatArrays: [
              {
                $map: {
                  input: { $ifNull: ["$threads", []] },
                  as: "t",
                  in: "$$t.createdAt",
                },
              },
              {
                $map: {
                  input: { $ifNull: ["$comments", []] },
                  as: "c",
                  in: "$$c.createdAt",
                },
              },
            ],
          },
        },
      },
      { $unwind: "$events" },
      { $match: { events: { $gte: start, $lte: end } } },
      { $project: { eventDay: day("$events"), createdDay: 1 } },
      // Only days AFTER the creation day → the ticket was "existing" that day.
      { $match: { $expr: { $gt: ["$eventDay", "$createdDay"] } } },
      // Dedupe: one entry per (ticket, day).
      { $group: { _id: { day: "$eventDay", ticket: "$_id" } } },
      { $group: { _id: "$_id.day", c: { $sum: 1 } } },
    ]);

    const dayMap = new Map<string, number>();
    for (const r of newRows)
      dayMap.set(r._id as string, (dayMap.get(r._id as string) ?? 0) + r.c);
    for (const r of activeRows)
      dayMap.set(r._id as string, (dayMap.get(r._id as string) ?? 0) + r.c);

    const points = [...dayMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, value]) => ({ date, value }));

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
    const Center = mongoose.model("Center");
    const { start, end } = buildDateRange(params);

    // Group by centerId (online tickets use the sentinel "online"); resolve
    // names from the Center collection. Grouping by metadata.centerName would
    // bucket everything as "Unassigned" because tickets only store centerId.
    // Footfall per centre = new queries created in range + existing queries
    // (created earlier) with a reply/comment in range, each ticket counted once.
    const [newByCenter, activeByCenter] = await Promise.all([
      Ticket.aggregate([
        { $match: { ...scopedQuery, createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $ifNull: ["$metadata.centerId", null] },
            c: { $sum: 1 },
          },
        },
      ]),
      Ticket.aggregate([
        {
          $match: {
            ...scopedQuery,
            createdAt: { $lt: start },
            ...activityInRange(start, end),
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$metadata.centerId", null] },
            c: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Merge the two per-centre counts into a single rows[] shape: { _id, value }.
    const countByCenter = new Map<string | null, number>();
    for (const r of [...newByCenter, ...activeByCenter]) {
      const key = r._id ? String(r._id) : null;
      countByCenter.set(key, (countByCenter.get(key) ?? 0) + (r.c as number));
    }
    const rows = [...countByCenter.entries()].map(([k, value]) => ({
      _id: k,
      value,
    }));

    const ids = rows
      .map((r) => r._id)
      .filter(
        (id) =>
          id && id !== "online" && mongoose.Types.ObjectId.isValid(String(id)),
      )
      .map((id) => new mongoose.Types.ObjectId(String(id)));
    const centerDocs = await Center.find({ _id: { $in: ids } })
      .select("centerName")
      .lean();
    const idToName = new Map<string, string>();
    for (const c of centerDocs)
      idToName.set(String(c._id), (c as any).centerName || "Unnamed center");

    const items = rows
      .map((r) => {
        const key = r._id ? String(r._id) : null;
        const label = key && idToName.has(key) ? idToName.get(key)! : "Unassigned";
        return { label, value: r.value };
      })
      .sort((a, b) => b.value - a.value);

    return { items };
  },
};

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerFootfallHandlers(): void {
  registerWidgetHandler(ticketFootfallCountHandler);
  registerWidgetHandler(ticketFootfallTrendHandler);
  registerWidgetHandler(ticketFootfallByCenterHandler);
}
