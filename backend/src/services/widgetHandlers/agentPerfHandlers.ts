/**
 * ap_* Widget Handlers — Agent Performance
 * Keys: ap_total_agents, ap_tickets_handled, ap_avg_handle_time,
 *       ap_resolution_rate, ap_first_contact_res, ap_csat_by_agent,
 *       ap_sla_compliance, ap_leaderboard, ap_avg_response_time
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetData,
  buildDateRange,
  registerWidgetHandler,
} from "../widgetQueryEngine";

const getTicket = () => mongoose.model("Ticket");
const getStatus = () => mongoose.model("Status");
const getSLA = () => mongoose.model("SLATracking");
const getFeedback = () => mongoose.model("FeedbackScore");

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

// ─── ap_total_agents (distinct assignedTo values in this project) ─────────────
const apTotalAgentsHandler: QueryHandler = {
  widgetKey: "ap_total_agents",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const ids = await getTicket().distinct("assignedTo", {
      "metadata.projectId": new mongoose.Types.ObjectId(ctx.tenantId),
      assignedTo: { $ne: null },
      createdAt: { $gte: start, $lte: end },
    });
    return { value: ids.length };
  },
};

// ─── ap_tickets_handled (tickets with an agent assigned in date range) ─────────
const apTicketsHandledHandler: QueryHandler = {
  widgetKey: "ap_tickets_handled",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await getTicket().countDocuments({
      "metadata.projectId": new mongoose.Types.ObjectId(ctx.tenantId),
      assignedTo: { $ne: null },
      createdAt: { $gte: start, $lte: end },
    });
    return { value, trendDirection: "higher_is_better" };
  },
};

// ─── ap_avg_handle_time (avg hours from createdAt to updatedAt for closed tickets) ──
const apAvgHandleTimeHandler: QueryHandler = {
  widgetKey: "ap_avg_handle_time",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const closedCodes = await loadClosedCodes(ctx.tenantId);
    if (closedCodes.length === 0) return { value: null, noData: true };

    const res = await getTicket().aggregate([
      {
        $match: {
          "metadata.projectId": new mongoose.Types.ObjectId(ctx.tenantId),
          status: { $in: closedCodes },
          updatedAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          avgMs: {
            $avg: { $subtract: ["$updatedAt", "$createdAt"] },
          },
        },
      },
    ]);

    const avgMs = res[0]?.avgMs ?? null;
    const value =
      avgMs !== null ? Math.round((avgMs / 1000 / 60 / 60) * 10) / 10 : null;
    return { value, unit: "hrs", trendDirection: "lower_is_better" };
  },
};

// ─── ap_resolution_rate (% of tickets that are closed in date range) ──────────
const apResolutionRateHandler: QueryHandler = {
  widgetKey: "ap_resolution_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const closedCodes = await loadClosedCodes(ctx.tenantId);
    const [closed, total] = await Promise.all([
      getTicket().countDocuments({
        "metadata.projectId": pid,
        status: { $in: closedCodes },
        updatedAt: { $gte: start, $lte: end },
      }),
      getTicket().countDocuments({
        "metadata.projectId": pid,
        createdAt: { $gte: start, $lte: end },
      }),
    ]);
    const value = total > 0 ? Math.round((closed / total) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${closed} of ${total} resolved`,
      thresholds: { green: 80, amber: 60 },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── ap_first_contact_res (closed tickets with no escalation history) ─────────
const apFirstContactResHandler: QueryHandler = {
  widgetKey: "ap_first_contact_res",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const closedCodes = await loadClosedCodes(ctx.tenantId);

    const [fcrCount, totalClosed] = await Promise.all([
      getSLA().countDocuments({
        projectId: pid,
        resolutionStatus: "met",
        createdAt: { $gte: start, $lte: end },
        $or: [
          { escalationHistory: { $exists: false } },
          { escalationHistory: { $size: 0 } },
        ],
      }),
      getSLA().countDocuments({
        projectId: pid,
        resolutionStatus: { $in: ["met", "breached"] },
        createdAt: { $gte: start, $lte: end },
      }),
    ]);

    const value =
      totalClosed > 0 ? Math.round((fcrCount / totalClosed) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `${fcrCount} of ${totalClosed} resolved on first contact`,
      thresholds: { green: 70, amber: 50 },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── ap_csat_by_agent (avg rating per agent from FeedbackScore) ───────────────
const apCsatByAgentHandler: QueryHandler = {
  widgetKey: "ap_csat_by_agent",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const rows = await getFeedback().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          submittedAt: { $gte: start, $lte: end },
          agent_id: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$agent_id",
          avgRating: { $avg: "$overallRating" },
          responses: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "agent",
        },
      },
      { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          agentId: "$_id",
          agentName: { $ifNull: ["$agent.fullName", "Unknown Agent"] },
          avgRating: { $round: ["$avgRating", 2] },
          responses: 1,
        },
      },
      { $sort: { avgRating: -1 } },
    ]);
    return { segments: rows };
  },
};

// ─── ap_sla_compliance (% of tickets where resolutionStatus = "met") ──────────
const apSlaComplianceHandler: QueryHandler = {
  widgetKey: "ap_sla_compliance",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const pid = new mongoose.Types.ObjectId(ctx.tenantId);
    const [met, total] = await Promise.all([
      getSLA().countDocuments({
        projectId: pid,
        resolutionStatus: "met",
        createdAt: { $gte: start, $lte: end },
      }),
      getSLA().countDocuments({
        projectId: pid,
        resolutionStatus: { $in: ["met", "breached"] },
        createdAt: { $gte: start, $lte: end },
      }),
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

// ─── ap_leaderboard (top 10 agents by closed ticket count) ────────────────────
const apLeaderboardHandler: QueryHandler = {
  widgetKey: "ap_leaderboard",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
    const closedCodes = await loadClosedCodes(ctx.tenantId);
    if (closedCodes.length === 0) return { segments: [] };

    const rows = await getTicket().aggregate([
      {
        $match: {
          "metadata.projectId": new mongoose.Types.ObjectId(ctx.tenantId),
          status: { $in: closedCodes },
          assignedTo: { $ne: null },
          updatedAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: "$assignedTo", closed: { $sum: 1 } } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "agent",
        },
      },
      { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          agentId: "$_id",
          name: { $ifNull: ["$agent.fullName", "Unknown"] },
          closed: 1,
        },
      },
      { $sort: { closed: -1 } },
      { $limit: 10 },
    ]);
    return { segments: rows };
  },
};

// ─── ap_avg_response_time (avg SLATracking.responseTime in minutes) ───────────
const apAvgResponseTimeHandler: QueryHandler = {
  widgetKey: "ap_avg_response_time",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params.dateRangeDays);
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

// ─── Registration ─────────────────────────────────────────────────────────────
export function registerAgentPerfHandlers(): void {
  registerWidgetHandler(apTotalAgentsHandler);
  registerWidgetHandler(apTicketsHandledHandler);
  registerWidgetHandler(apAvgHandleTimeHandler);
  registerWidgetHandler(apResolutionRateHandler);
  registerWidgetHandler(apFirstContactResHandler);
  registerWidgetHandler(apCsatByAgentHandler);
  registerWidgetHandler(apSlaComplianceHandler);
  registerWidgetHandler(apLeaderboardHandler);
  registerWidgetHandler(apAvgResponseTimeHandler);
  console.log("📊 Dashboard Engine: ap_* handlers registered (9)");
}
