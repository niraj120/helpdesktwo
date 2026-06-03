/**
 * Satisfaction Query Handlers — CSAT / NPS / CES (Sprint 9)
 *
 * Widgets registered here:
 *   1. csat_score             — CSAT % (ratings ≥4 / total × 100)
 *   2. nps_score              — Net Promoter Score (% promoters − % detractors)
 *   3. ces_score              — Customer Effort Score (avg 1–7)
 *   4. satisfaction_trend     — Daily CSAT % over selected period
 *   5. csat_by_agent          — CSAT % per agent (bar chart / table)
 *   6. feedback_response_rate — Responded ÷ closed tickets × 100
 *
 * Source: feedback_scores collection (FeedbackScore model)
 * All queries are scoped to ctx.tenantId (= project _id).
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetQueryContext,
  WidgetQueryParams,
  WidgetData,
  buildDateRange,
  registerWidgetHandler,
} from "../../widgetQueryEngine";

// ─── Lazy model accessors ─────────────────────────────────────────────────────

const getFeedbackScoreModel = () => mongoose.model("FeedbackScore");
const getTicketModel = () => mongoose.model("Ticket");
const getStatusModel = () => mongoose.model("Status");

/** Load numeric status codes marked isClosed for a project */
async function loadClosedCodes(tenantId: string): Promise<number[]> {
  try {
    const docs = (await getStatusModel()
      .find({
        projectId: new mongoose.Types.ObjectId(tenantId),
        isActive: true,
        isClosed: true,
      })
      .select("code")
      .lean()) as Array<{ code: number }>;
    return docs.map((d) => d.code);
  } catch {
    return [4, 5]; // fallback: resolved=4, closed=5
  }
}

// ─── 1. csat_score ────────────────────────────────────────────────────────────

const csatScoreHandler: QueryHandler = {
  widgetKey: "csat_score",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const FeedbackScore = getFeedbackScoreModel();
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );
    const prevStart = new Date(
      start.getTime() - (end.getTime() - start.getTime()),
    );

    const baseMatch = {
      project_id: new mongoose.Types.ObjectId(ctx.tenantId),
      csat_rating: { $exists: true, $ne: null },
      submitted_at: { $gte: start, $lte: end },
    };

    const [positive, total, prevPositive, prevTotal] = await Promise.all([
      FeedbackScore.countDocuments({ ...baseMatch, csat_rating: { $gte: 4 } }),
      FeedbackScore.countDocuments(baseMatch),
      FeedbackScore.countDocuments({
        project_id: new mongoose.Types.ObjectId(ctx.tenantId),
        csat_rating: { $exists: true, $ne: null, $gte: 4 },
        submitted_at: { $gte: prevStart, $lt: start },
      }),
      FeedbackScore.countDocuments({
        project_id: new mongoose.Types.ObjectId(ctx.tenantId),
        csat_rating: { $exists: true, $ne: null },
        submitted_at: { $gte: prevStart, $lt: start },
      }),
    ]);

    const current =
      total > 0 ? Math.round((positive / total) * 1000) / 10 : null;
    const previous =
      prevTotal > 0 ? Math.round((prevPositive / prevTotal) * 1000) / 10 : null;
    const delta =
      current !== null && previous !== null
        ? Math.round((current - previous) * 10) / 10
        : 0;

    return {
      value: current,
      unit: "%",
      subtitle: `Based on ${total} response${total !== 1 ? "s" : ""}`,
      trend: {
        delta,
        deltaPercent:
          previous !== null && previous > 0
            ? Math.round((delta / previous) * 100 * 10) / 10
            : 0,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
        isPositive: delta >= 0,
      },
      thresholds: { green: 80, amber: 60 }, // ≥80 green, 60–79 amber, <60 red
      responseCount: total,
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── 2. nps_score ─────────────────────────────────────────────────────────────

const npsScoreHandler: QueryHandler = {
  widgetKey: "nps_score",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const FeedbackScore = getFeedbackScoreModel();
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );
    const prevStart = new Date(
      start.getTime() - (end.getTime() - start.getTime()),
    );

    const computeNPS = async (from: Date, to: Date) => {
      const result = await FeedbackScore.aggregate([
        {
          $match: {
            project_id: new mongoose.Types.ObjectId(ctx.tenantId),
            nps_rating: { $exists: true, $ne: null },
            submitted_at: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            promoters: {
              $sum: { $cond: [{ $gte: ["$nps_rating", 9] }, 1, 0] },
            },
            detractors: {
              $sum: { $cond: [{ $lte: ["$nps_rating", 6] }, 1, 0] },
            },
          },
        },
      ]);
      const r = result[0];
      if (!r || r.total === 0) return { score: null, total: 0 };
      const score = Math.round(((r.promoters - r.detractors) / r.total) * 100);
      return {
        score,
        total: r.total,
        promoters: r.promoters,
        detractors: r.detractors,
      };
    };

    const [current, prev] = await Promise.all([
      computeNPS(start, end),
      computeNPS(prevStart, new Date(start.getTime() - 1)),
    ]);

    const delta =
      current.score !== null && prev.score !== null
        ? current.score - prev.score
        : 0;

    return {
      value: current.score,
      unit: "",
      displayValue:
        current.score !== null
          ? current.score >= 0
            ? `+${current.score}`
            : `${current.score}`
          : null,
      subtitle: `Based on ${current.total} response${current.total !== 1 ? "s" : ""}`,
      trend: {
        delta,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
        isPositive: delta >= 0,
      },
      breakdown: {
        promoters: current.promoters ?? 0,
        detractors: current.detractors ?? 0,
        passives:
          (current.total ?? 0) -
          (current.promoters ?? 0) -
          (current.detractors ?? 0),
        total: current.total ?? 0,
      },
      gaugeMin: -100,
      gaugeMax: 100,
      thresholds: { green: 30, amber: 0 }, // ≥30 excellent, 0–29 good, <0 needs work
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── 3. ces_score ─────────────────────────────────────────────────────────────

const cesScoreHandler: QueryHandler = {
  widgetKey: "ces_score",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const FeedbackScore = getFeedbackScoreModel();
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );

    const result = await FeedbackScore.aggregate([
      {
        $match: {
          project_id: new mongoose.Types.ObjectId(ctx.tenantId),
          ces_rating: { $exists: true, $ne: null },
          submitted_at: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          avg_ces: { $avg: "$ces_rating" },
          total: { $sum: 1 },
        },
      },
    ]);

    const r = result[0];
    const avg = r ? Math.round(r.avg_ces * 10) / 10 : null;

    return {
      value: avg,
      unit: "/ 7",
      displayValue: avg !== null ? `${avg} / 7` : null,
      subtitle: `Based on ${r?.total ?? 0} response${(r?.total ?? 0) !== 1 ? "s" : ""} — lower is better`,
      thresholds: { green: 3, amber: 5, invertedScale: true }, // ≤3 green, 3–5 amber, >5 red
      responseCount: r?.total ?? 0,
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── 4. satisfaction_trend ────────────────────────────────────────────────────

const satisfactionTrendHandler: QueryHandler = {
  widgetKey: "satisfaction_trend",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const FeedbackScore = getFeedbackScoreModel();
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );

    const points = await FeedbackScore.aggregate([
      {
        $match: {
          project_id: new mongoose.Types.ObjectId(ctx.tenantId),
          csat_rating: { $exists: true, $ne: null },
          submitted_at: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$submitted_at" } },
          total: { $sum: 1 },
          positive: { $sum: { $cond: [{ $gte: ["$csat_rating", 4] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          csat_pct: {
            $round: [
              { $multiply: [{ $divide: ["$positive", "$total"] }, 100] },
              1,
            ],
          },
          response_count: "$total",
        },
      },
      { $sort: { date: 1 } },
    ]);

    return {
      series: [
        {
          key: "csat_pct",
          label: "CSAT %",
          color: "#22c55e",
          data: points.map((p: any) => ({ x: p.date, y: p.csat_pct })),
        },
        {
          key: "response_count",
          label: "Responses",
          color: "#94a3b8",
          data: points.map((p: any) => ({ x: p.date, y: p.response_count })),
        },
      ],
      xAxisLabel: "Date",
      yAxisLabel: "CSAT %",
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── 5. csat_by_agent ─────────────────────────────────────────────────────────

const csatByAgentHandler: QueryHandler = {
  widgetKey: "csat_by_agent",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const FeedbackScore = getFeedbackScoreModel();
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );

    const rows = await FeedbackScore.aggregate([
      {
        $match: {
          project_id: new mongoose.Types.ObjectId(ctx.tenantId),
          csat_rating: { $exists: true, $ne: null },
          agent_id: { $exists: true, $ne: null },
          submitted_at: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$agent_id",
          total: { $sum: 1 },
          positive: { $sum: { $cond: [{ $gte: ["$csat_rating", 4] }, 1, 0] } },
        },
      },
      {
        $project: {
          csat_pct: {
            $round: [
              { $multiply: [{ $divide: ["$positive", "$total"] }, 100] },
              1,
            ],
          },
          response_count: "$total",
        },
      },
      { $sort: { csat_pct: -1 } },
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
          agent_id: "$_id",
          agent_name: {
            $ifNull: [
              "$agent.fullName",
              {
                $concat: [
                  { $ifNull: ["$agent.firstName", ""] },
                  " ",
                  { $ifNull: ["$agent.lastName", ""] },
                ],
              },
            ],
          },
          agent_email: "$agent.email",
          csat_pct: 1,
          response_count: 1,
        },
      },
    ]);

    return {
      items: rows,
      columns: [
        { key: "agent_name", label: "Agent", type: "string" },
        { key: "csat_pct", label: "CSAT %", type: "number", unit: "%" },
        { key: "response_count", label: "Responses", type: "number" },
      ],
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── 6. feedback_response_rate ────────────────────────────────────────────────

const feedbackResponseRateHandler: QueryHandler = {
  widgetKey: "feedback_response_rate",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const FeedbackScore = getFeedbackScoreModel();
    const Ticket = getTicketModel();
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );
    const closedCodes = await loadClosedCodes(ctx.tenantId);

    const projectOid = new mongoose.Types.ObjectId(ctx.tenantId);

    const [closedCount, respondedCount] = await Promise.all([
      Ticket.countDocuments({
        "metadata.projectId": projectOid,
        status: { $in: closedCodes },
        updatedAt: { $gte: start, $lte: end },
      }),
      FeedbackScore.countDocuments({
        project_id: projectOid,
        submitted_at: { $gte: start, $lte: end },
      }),
    ]);

    const rate =
      closedCount > 0
        ? Math.round((respondedCount / closedCount) * 1000) / 10
        : 0;

    return {
      value: rate,
      unit: "%",
      subtitle: `${respondedCount} of ${closedCount} resolved tickets received feedback`,
      numerator: respondedCount,
      denominator: closedCount,
      thresholds: { green: 40, amber: 20 }, // ≥40% good, 20–39% fair, <20% low
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

// ─── Registration ─────────────────────────────────────────────────────────────

// ─── fb_* handlers (FeedbackResponse-based) ──────────────────────────────────

const getFeedbackResponseModel = () => mongoose.model("FeedbackResponse");

const fbTotalResponsesHandler: QueryHandler = {
  widgetKey: "fb_total_responses",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await FR.countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      submittedAt: { $gte: start, $lte: end },
    });
    return { value, trendDirection: "higher_is_better" };
  },
};

const fbAvgRatingHandler: QueryHandler = {
  widgetKey: "fb_avg_rating",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const result = await FR.aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          overallRating: { $exists: true, $ne: null },
          submittedAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          avg: { $avg: "$overallRating" },
          total: { $sum: 1 },
        },
      },
    ]);
    const r = result[0];
    const avg = r ? Math.round(r.avg * 10) / 10 : null;
    return {
      value: avg,
      unit: "/ 5",
      subtitle: r
        ? `Based on ${r.total} response${r.total !== 1 ? "s" : ""}`
        : "No data",
      trendDirection: "higher_is_better",
    };
  },
};

const fbCsatScoreHandler: QueryHandler = {
  widgetKey: "fb_csat_score",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const baseMatch = {
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      overallRating: { $exists: true, $ne: null },
      submittedAt: { $gte: start, $lte: end },
    };
    const [positive, total] = await Promise.all([
      FR.countDocuments({ ...baseMatch, overallRating: { $gte: 4 } }),
      FR.countDocuments(baseMatch),
    ]);
    const value = total > 0 ? Math.round((positive / total) * 1000) / 10 : null;
    return {
      value,
      unit: "%",
      subtitle: `Based on ${total} response${total !== 1 ? "s" : ""}`,
      thresholds: { green: 80, amber: 60 },
      trendDirection: "higher_is_better",
    };
  },
};

const fbNpsScoreHandler: QueryHandler = {
  widgetKey: "fb_nps_score",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    // Map 1-5 scale: 5=promoter, 3-4=passive, 1-2=detractor
    const result = await FR.aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          overallRating: { $exists: true, $ne: null },
          submittedAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          promoters: {
            $sum: { $cond: [{ $eq: ["$overallRating", 5] }, 1, 0] },
          },
          detractors: {
            $sum: { $cond: [{ $lte: ["$overallRating", 2] }, 1, 0] },
          },
        },
      },
    ]);
    const r = result[0];
    if (!r || r.total === 0) return { value: null, noData: true };
    const score = Math.round(((r.promoters - r.detractors) / r.total) * 100);
    return {
      value: score,
      displayValue: score >= 0 ? `+${score}` : `${score}`,
      subtitle: `Based on ${r.total} response${r.total !== 1 ? "s" : ""}`,
      breakdown: {
        promoters: r.promoters,
        detractors: r.detractors,
        passives: r.total - r.promoters - r.detractors,
        total: r.total,
      },
      thresholds: { green: 30, amber: 0 },
      trendDirection: "higher_is_better",
    };
  },
};

const fbPromotersHandler: QueryHandler = {
  widgetKey: "fb_promoters",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await FR.countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      overallRating: 5,
      submittedAt: { $gte: start, $lte: end },
    });
    return { value, trendDirection: "higher_is_better" };
  },
};

const fbDetractorsHandler: QueryHandler = {
  widgetKey: "fb_detractors",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const value = await FR.countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      overallRating: { $lte: 2 },
      submittedAt: { $gte: start, $lte: end },
    });
    return { value, trendDirection: "lower_is_better" };
  },
};

const fbByCategoryHandler: QueryHandler = {
  widgetKey: "fb_by_category",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const rows = await FR.aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          submittedAt: { $gte: start, $lte: end },
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
        $lookup: {
          from: "categories",
          localField: "ticket.category",
          foreignField: "_id",
          as: "cat",
        },
      },
      { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$cat.name", "Uncategorised"] },
          count: { $sum: 1 },
          avgRating: { $avg: "$overallRating" },
        },
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          count: 1,
          avgRating: { $round: ["$avgRating", 1] },
        },
      },
      { $sort: { count: -1 } },
    ]);
    const total = rows.reduce((s: number, r: any) => s + r.count, 0);
    return {
      segments: rows.map((r: any) => ({
        ...r,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
      total,
    };
  },
};

const fbResponseRateHandler: QueryHandler = {
  widgetKey: "fb_response_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const closedCodes = await loadClosedCodes(ctx.tenantId);
    const projectOid = new mongoose.Types.ObjectId(ctx.tenantId);
    const [closedCount, respondedCount] = await Promise.all([
      Ticket.countDocuments({
        "metadata.projectId": projectOid,
        status: { $in: closedCodes },
        updatedAt: { $gte: start, $lte: end },
      }),
      FR.countDocuments({
        projectId: projectOid,
        submittedAt: { $gte: start, $lte: end },
      }),
    ]);
    const rate =
      closedCount > 0
        ? Math.round((respondedCount / closedCount) * 1000) / 10
        : 0;
    return {
      value: rate,
      unit: "%",
      subtitle: `${respondedCount} of ${closedCount} resolved tickets received feedback`,
      numerator: respondedCount,
      denominator: closedCount,
      thresholds: { green: 40, amber: 20 },
      trendDirection: "higher_is_better",
    };
  },
};

const fbRatingTrendHandler: QueryHandler = {
  widgetKey: "fb_rating_trend",
  cacheTtlSeconds: 600,
  async execute(ctx, params): Promise<WidgetData> {
    const FR = getFeedbackResponseModel();
    const { start, end, startStr, endStr } = buildDateRange(
      params.dateRangeDays,
    );
    const points = await FR.aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          overallRating: { $exists: true, $ne: null },
          submittedAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$submittedAt" } },
          avgRating: { $avg: "$overallRating" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          avgRating: { $round: ["$avgRating", 1] },
          count: 1,
        },
      },
      { $sort: { date: 1 } },
    ]);
    return {
      series: [
        {
          key: "avgRating",
          label: "Avg Rating",
          color: "#f59e0b",
          data: points.map((p: any) => ({ x: p.date, y: p.avgRating })),
        },
        {
          key: "count",
          label: "Responses",
          color: "#94a3b8",
          data: points.map((p: any) => ({ x: p.date, y: p.count })),
        },
      ],
      xAxisLabel: "Date",
      yAxisLabel: "Rating (1–5)",
      dateRangeStart: startStr,
      dateRangeEnd: endStr,
    };
  },
};

export function registerSatisfactionHandlers(): void {
  registerWidgetHandler(csatScoreHandler);
  registerWidgetHandler(npsScoreHandler);
  registerWidgetHandler(cesScoreHandler);
  registerWidgetHandler(satisfactionTrendHandler);
  registerWidgetHandler(csatByAgentHandler);
  registerWidgetHandler(feedbackResponseRateHandler);
  // fb_* handlers (FeedbackResponse-based)
  registerWidgetHandler(fbTotalResponsesHandler);
  registerWidgetHandler(fbAvgRatingHandler);
  registerWidgetHandler(fbCsatScoreHandler);
  registerWidgetHandler(fbNpsScoreHandler);
  registerWidgetHandler(fbPromotersHandler);
  registerWidgetHandler(fbDetractorsHandler);
  registerWidgetHandler(fbByCategoryHandler);
  registerWidgetHandler(fbResponseRateHandler);
  registerWidgetHandler(fbRatingTrendHandler);
  console.log(
    "📊 Dashboard Engine: Satisfaction handlers registered (csat_score, nps_score, ces_score, satisfaction_trend, csat_by_agent, feedback_response_rate, fb_total_responses, fb_avg_rating, fb_csat_score, fb_nps_score, fb_promoters, fb_detractors, fb_by_category, fb_response_rate, fb_rating_trend)",
  );
}
