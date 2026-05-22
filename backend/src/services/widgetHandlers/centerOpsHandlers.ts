/**
 * co_* Widget Handlers — Center Operations
 * Keys: co_total_centers, co_active_centers, co_center_capacity,
 *       co_capacity_utilization, co_tickets_per_center,
 *       co_students_per_center, co_center_performance
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetData,
  buildDateRange,
  registerWidgetHandler,
} from "../widgetQueryEngine";

const getCenter  = () => mongoose.model("Center");
const getTicket  = () => mongoose.model("Ticket");
const getUser    = () => mongoose.model("User");
const getStatus  = () => mongoose.model("Status");

async function loadClosedCodes(tenantId: string): Promise<number[]> {
  const docs = (await getStatus()
    .find({ projectId: new mongoose.Types.ObjectId(tenantId), isActive: true, isClosed: true })
    .select("code")
    .lean()) as Array<{ code: number }>;
  return docs.map((d) => d.code);
}

// ─── co_total_centers ─────────────────────────────────────────────────────────
const coTotalCentersHandler: QueryHandler = {
  widgetKey: "co_total_centers",
  cacheTtlSeconds: 600,
  async execute(ctx): Promise<WidgetData> {
    const value = await getCenter().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
    });
    return { value };
  },
};

// ─── co_active_centers ────────────────────────────────────────────────────────
const coActiveCentersHandler: QueryHandler = {
  widgetKey: "co_active_centers",
  cacheTtlSeconds: 600,
  async execute(ctx): Promise<WidgetData> {
    const value = await getCenter().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      isActive: true,
    });
    return { value, trendDirection: "higher_is_better" };
  },
};

// ─── co_center_capacity (sum of idealCount across active centers) ─────────────
const coCenterCapacityHandler: QueryHandler = {
  widgetKey: "co_center_capacity",
  cacheTtlSeconds: 600,
  async execute(ctx): Promise<WidgetData> {
    const res = await getCenter().aggregate([
      { $match: { projectId: new mongoose.Types.ObjectId(ctx.tenantId), isActive: true } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$idealCount", 0] } } } },
    ]);
    return { value: res[0]?.total ?? 0 };
  },
};

// ─── co_capacity_utilization (active users / sum idealCount × 100) ────────────
const coCapacityUtilizationHandler: QueryHandler = {
  widgetKey: "co_capacity_utilization",
  cacheTtlSeconds: 600,
  async execute(ctx): Promise<WidgetData> {
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const [capRes, activeUsers] = await Promise.all([
      getCenter().aggregate([
        { $match: { projectId: pid, isActive: true } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$idealCount", 0] } } } },
      ]),
      getUser().countDocuments({ projects: pid, isActive: true }),
    ]);
    const capacity = capRes[0]?.total ?? 0;
    const value = capacity > 0 ? Math.round((activeUsers / capacity) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      numerator: activeUsers,
      denominator: capacity,
      thresholds: { green: 80, amber: 60 },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── co_tickets_per_center (tickets grouped by assigned agent's centreId) ─────
const coTicketsPerCenterHandler: QueryHandler = {
  widgetKey: "co_tickets_per_center",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const rows = await getTicket().aggregate([
      {
        $match: {
          "metadata.projectId": new mongoose.Types.ObjectId(ctx.tenantId),
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "assignedTo",
          foreignField: "_id",
          as: "agent",
        },
      },
      { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "centers",
          localField: "agent.centreId",
          foreignField: "_id",
          as: "centre",
        },
      },
      { $unwind: { path: "$centre", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$centre.centerName", "Unassigned"] },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, center: "$_id", count: 1 } },
      { $sort: { count: -1 } },
    ]);
    return { segments: rows };
  },
};

// ─── co_students_per_center (active users grouped by centreId) ────────────────
const coStudentsPerCenterHandler: QueryHandler = {
  widgetKey: "co_students_per_center",
  cacheTtlSeconds: 600,
  async execute(ctx): Promise<WidgetData> {
    const rows = await getUser().aggregate([
      { $match: { projects: new mongoose.Types.ObjectId(ctx.tenantId), isActive: true } },
      {
        $lookup: {
          from: "centers",
          localField: "centreId",
          foreignField: "_id",
          as: "centre",
        },
      },
      { $unwind: { path: "$centre", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$centre.centerName", "Unassigned"] },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, center: "$_id", count: 1 } },
      { $sort: { count: -1 } },
    ]);
    return { segments: rows };
  },
};

// ─── co_center_performance (per-center: users + capacity + closed tickets) ────
const coCenterPerformanceHandler: QueryHandler = {
  widgetKey: "co_center_performance",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const closedCodes = await loadClosedCodes(ctx.tenantId);

    // Per-center user count
    const usersByCenter = await getUser().aggregate([
      { $match: { projects: pid, isActive: true } },
      {
        $lookup: { from: "centers", localField: "centreId", foreignField: "_id", as: "centre" },
      },
      { $unwind: { path: "$centre", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$centre._id", centerName: { $first: "$centre.centerName" }, idealCount: { $first: "$centre.idealCount" }, users: { $sum: 1 } } },
    ]);

    // Per-center closed tickets (via agent's centreId)
    const closedByCenter = await getTicket().aggregate([
      {
        $match: {
          "metadata.projectId": pid,
          status: { $in: closedCodes },
          updatedAt: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: { from: "users", localField: "assignedTo", foreignField: "_id", as: "agent" },
      },
      { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
      { $group: { _id: "$agent.centreId", closedTickets: { $sum: 1 } } },
    ]);

    const closedMap = new Map(closedByCenter.map((r: any) => [String(r._id), r.closedTickets]));

    const segments = usersByCenter.map((c: any) => ({
      center:       c.centerName ?? "Unassigned",
      users:        c.users,
      capacity:     c.idealCount ?? 0,
      utilization:  c.idealCount > 0 ? Math.round((c.users / c.idealCount) * 1000) / 10 : null,
      closedTickets: closedMap.get(String(c._id)) ?? 0,
    }));

    return { segments };
  },
};

// ─── Registration ─────────────────────────────────────────────────────────────
export function registerCenterOpsHandlers(): void {
  registerWidgetHandler(coTotalCentersHandler);
  registerWidgetHandler(coActiveCentersHandler);
  registerWidgetHandler(coCenterCapacityHandler);
  registerWidgetHandler(coCapacityUtilizationHandler);
  registerWidgetHandler(coTicketsPerCenterHandler);
  registerWidgetHandler(coStudentsPerCenterHandler);
  registerWidgetHandler(coCenterPerformanceHandler);
  console.log("📊 Dashboard Engine: co_* handlers registered (7)");
}
