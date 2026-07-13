/**
 * Service Request (PSR/ISR) dashboard widget handlers.
 * SR tickets live on the shared Ticket collection (interactionType), so these
 * simply add an interactionType-scoped view on top of the existing engine.
 *
 *   1. sr_open_count       — KPI: open PSR/ISR count
 *   2. sr_volume_by_type   — breakdown: Normal vs PSR vs ISR
 *   3. sr_by_status        — breakdown: SR by status (incl. Re-open/Cancelled)
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

// Live (non-terminal) SR statuses — Closed(5) / Cancelled(8) excluded.
const OPEN_SR_STATUSES = [1, 2, 4, 6, 7];
const SR_TYPES = { $in: ["PSR", "ISR"] };

const SR_STATUS_META: Record<number, { name: string; color: string }> = {
  1: { name: "Open", color: "#3b82f6" },
  2: { name: "Work In Progress", color: "#f59e0b" },
  4: { name: "Resolved", color: "#10b981" },
  5: { name: "Closed", color: "#6b7280" },
  6: { name: "Re-open", color: "#ef4444" },
  7: { name: "Re-Opened WIP", color: "#f97316" },
  8: { name: "Cancelled", color: "#94a3b8" },
};

// ─── 1. sr_open_count ─────────────────────────────────────────────────────────
const srOpenCountHandler: QueryHandler = {
  widgetKey: "sr_open_count",
  cacheTtlSeconds: 120,
  async execute(
    _ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start } = buildDateRange(params);
    const baseQuery = {
      ...scopedQuery,
      interactionType: SR_TYPES,
      status: { $in: OPEN_SR_STATUSES },
    };
    const [current, previous] = await Promise.all([
      Ticket.countDocuments(baseQuery),
      Ticket.countDocuments({ ...baseQuery, createdAt: { $lt: start } }),
    ]);
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
      trendDirection: "lower_is_better",
    };
  },
};

// ─── 2. sr_volume_by_type ─────────────────────────────────────────────────────
const srVolumeByTypeHandler: QueryHandler = {
  widgetKey: "sr_volume_by_type",
  cacheTtlSeconds: 120,
  async execute(
    _ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          interactionType: SR_TYPES,
          createdAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: "$interactionType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    const colors: Record<string, string> = { PSR: "#4f46e5", ISR: "#0ea5e9" };
    const segments = agg.map((r: any) => ({
      name: r._id,
      color: colors[r._id] ?? "#6366f1",
      count: r.count,
      percent: total > 0 ? Math.round((r.count / total) * 100 * 10) / 10 : 0,
    }));
    return { segments, total };
  },
};

// ─── 3. sr_by_status ──────────────────────────────────────────────────────────
const srByStatusHandler: QueryHandler = {
  widgetKey: "sr_by_status",
  cacheTtlSeconds: 120,
  async execute(
    _ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          interactionType: SR_TYPES,
          createdAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    const segments = agg.map((r: any) => ({
      code: r._id,
      name: SR_STATUS_META[r._id]?.name ?? String(r._id),
      color: SR_STATUS_META[r._id]?.color ?? "#888",
      count: r.count,
      percent: total > 0 ? Math.round((r.count / total) * 100 * 10) / 10 : 0,
    }));
    return { segments, total };
  },
};

export function registerSrDashboardHandlers(): void {
  registerWidgetHandler(srOpenCountHandler);
  registerWidgetHandler(srVolumeByTypeHandler);
  registerWidgetHandler(srByStatusHandler);
}
