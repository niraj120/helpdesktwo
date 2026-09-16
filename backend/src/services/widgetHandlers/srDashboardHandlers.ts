/**
 * Service Request (PSR/ISR) dashboard widget handlers.
 *
 * SR records live on the shared Ticket collection (interactionType), and the
 * call inbox on CallIntake, so these are interactionType-scoped views on top of
 * the existing widget engine rather than a parallel reporting stack.
 *
 * Status names and which codes count as "open" are read from the project's
 * status master, never hardcoded — projects do not agree on what a code means.
 *
 *   Volume        sr_open_count, sr_created_count, sr_closed_count,
 *                 sr_unassigned_count, sr_volume_by_type, sr_by_status,
 *                 sr_trend_over_time, sr_aging_buckets
 *   Commitment    sr_wip_due_soon_count, sr_wip_expired_count,
 *                 sr_committed_date_met_rate
 *   SLA           sr_sla_compliance, sr_overdue_count, sr_on_hold_count
 *   Quality       sr_reopen_rate, sr_cancel_rate, sr_parent_satisfaction_rate,
 *                 sr_avg_resolution_hrs
 *   Slices        sr_by_mode_of_contact, sr_by_channel, sr_by_category,
 *                 sr_by_assignee
 *   Call inbox    sr_call_volume, sr_call_answer_rate, sr_call_conversion_rate,
 *                 sr_call_by_status, sr_call_pending_callbacks,
 *                 sr_call_agent_load
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
const getCallModel = () => mongoose.model("CallIntake");
const getStatusModel = () => mongoose.model("Status");
const getEmailIntakeModel = () => mongoose.model("EmailIntake");

const SR_TYPES = { $in: ["PSR", "ISR"] };
const PALETTE = [
  "#4f46e5",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#ec4899",
];

/**
 * Fallback status meaning, used only for a project that has not configured its
 * status master. The configured names win wherever they exist.
 */
const FALLBACK_STATUS: Record<number, { name: string; color: string; closed?: boolean }> = {
  1: { name: "Open", color: "#3b82f6" },
  2: { name: "Work In Progress", color: "#f59e0b" },
  4: { name: "Resolved", color: "#10b981" },
  5: { name: "Closed", color: "#6b7280", closed: true },
  6: { name: "Re-open", color: "#ef4444" },
  7: { name: "Re-Opened WIP", color: "#f97316" },
  8: { name: "Cancelled", color: "#94a3b8", closed: true },
};

interface StatusMeta {
  byCode: Record<number, { name: string; color: string; closed: boolean }>;
  openCodes: number[];
  closedCodes: number[];
}

const statusCache = new Map<string, { at: number; meta: StatusMeta }>();
const STATUS_TTL_MS = 60_000;

/** The project's statuses, as configured. Cached for a minute. */
async function statusMeta(projectId: string): Promise<StatusMeta> {
  const hit = statusCache.get(projectId);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.meta;

  const byCode: StatusMeta["byCode"] = {};
  try {
    if (mongoose.Types.ObjectId.isValid(projectId)) {
      const rows: any[] = await getStatusModel()
        .find({ projectId: new mongoose.Types.ObjectId(projectId) })
        .select("code name color isClosed isActive")
        .lean();
      for (const r of rows) {
        if (r.isActive === false) continue;
        byCode[Number(r.code)] = {
          name: r.name,
          color: r.color || FALLBACK_STATUS[Number(r.code)]?.color || "#64748b",
          closed: r.isClosed === true,
        };
      }
    }
  } catch {
    /* status master unavailable — fall through to the defaults */
  }

  for (const [code, def] of Object.entries(FALLBACK_STATUS)) {
    const n = Number(code);
    if (!byCode[n]) byCode[n] = { ...def, closed: !!def.closed };
  }

  const meta: StatusMeta = {
    byCode,
    openCodes: Object.entries(byCode)
      .filter(([, v]) => !v.closed)
      .map(([c]) => Number(c)),
    closedCodes: Object.entries(byCode)
      .filter(([, v]) => v.closed)
      .map(([c]) => Number(c)),
  };
  statusCache.set(projectId, { at: Date.now(), meta });
  return meta;
}

const srMatch = (scopedQuery: Record<string, any>, extra: Record<string, any> = {}) => ({
  ...scopedQuery,
  interactionType: SR_TYPES,
  isMerged: { $ne: true },
  ...extra,
});

/** Call records are scoped by their own projectId, not ticket metadata. */
const callMatch = (ctx: WidgetQueryContext, extra: Record<string, any> = {}) => {
  const q: Record<string, any> = { ...extra };
  if (mongoose.Types.ObjectId.isValid(ctx.tenantId)) {
    q.projectId = new mongoose.Types.ObjectId(ctx.tenantId);
  }
  return q;
};

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

const trendOf = (current: number, previous: number, lowerIsBetter = true) => ({
  value: current,
  trend: {
    delta: current - previous,
    deltaPercent: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : 0,
    direction: current > previous ? "up" : current < previous ? "down" : "flat",
  },
  trendDirection: lowerIsBetter ? "lower_is_better" : "higher_is_better",
});

/** The window immediately before the selected one, for a like-for-like trend. */
const previousWindow = (start: Date, end: Date) => {
  const span = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - span), end: start };
};

const segmentsFrom = (
  rows: { _id: any; count: number }[],
  label: (id: any) => string,
  color?: (id: any, i: number) => string,
) => {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return {
    segments: rows.map((r, i) => ({
      key: r._id ?? "",
      name: label(r._id),
      color: color ? color(r._id, i) : PALETTE[i % PALETTE.length],
      count: r.count,
      percent: pct(r.count, total),
    })),
    total,
  };
};

/** Shorthand for a counting KPI handler with a previous-window trend. */
function countHandler(
  widgetKey: string,
  build: (args: {
    ctx: WidgetQueryContext;
    scopedQuery: Record<string, any>;
    meta: StatusMeta;
    start: Date;
    end: Date;
  }) => Promise<{ query: Record<string, any>; dateField?: string | null }>,
  opts: { lowerIsBetter?: boolean; cacheTtlSeconds?: number } = {},
): QueryHandler {
  return {
    widgetKey,
    cacheTtlSeconds: opts.cacheTtlSeconds ?? 120,
    async execute(ctx, params, _filters, scopedQuery): Promise<WidgetData> {
      const Ticket = getTicketModel();
      const { start, end } = buildDateRange(params);
      const meta = await statusMeta(ctx.tenantId);
      const { query, dateField } = await build({ ctx, scopedQuery, meta, start, end });

      if (!dateField) {
        // A "right now" count (e.g. what is open): no date window to compare.
        const value = await Ticket.countDocuments(query);
        return { value, trendDirection: opts.lowerIsBetter === false ? "higher_is_better" : "lower_is_better" };
      }
      const prev = previousWindow(start, end);
      const [current, previous] = await Promise.all([
        Ticket.countDocuments({ ...query, [dateField]: { $gte: start, $lte: end } }),
        Ticket.countDocuments({ ...query, [dateField]: { $gte: prev.start, $lt: prev.end } }),
      ]);
      return trendOf(current, previous, opts.lowerIsBetter !== false);
    },
  };
}

// ─── Volume ──────────────────────────────────────────────────────────────────

const srOpenCount = countHandler("sr_open_count", async ({ scopedQuery, meta }) => ({
  query: srMatch(scopedQuery, { status: { $in: meta.openCodes } }),
  dateField: null,
}));

const srCreatedCount = countHandler(
  "sr_created_count",
  async ({ scopedQuery }) => ({ query: srMatch(scopedQuery), dateField: "createdAt" }),
  { lowerIsBetter: false },
);

const srClosedCount = countHandler(
  "sr_closed_count",
  async ({ scopedQuery }) => ({ query: srMatch(scopedQuery), dateField: "closedAt" }),
  { lowerIsBetter: false },
);

const srUnassignedCount = countHandler("sr_unassigned_count", async ({ scopedQuery, meta }) => ({
  query: srMatch(scopedQuery, {
    status: { $in: meta.openCodes },
    $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }],
  }),
  dateField: null,
}));

const srVolumeByType: QueryHandler = {
  widgetKey: "sr_volume_by_type",
  cacheTtlSeconds: 120,
  async execute(_ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getTicketModel().aggregate([
      { $match: srMatch(scopedQuery, { createdAt: { $gte: start, $lte: end } }) },
      { $group: { _id: "$interactionType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const colors: Record<string, string> = { PSR: "#4f46e5", ISR: "#0ea5e9" };
    return segmentsFrom(agg, (id) => String(id ?? ""), (id, i) => colors[id] ?? PALETTE[i % PALETTE.length]);
  },
};

const srByStatus: QueryHandler = {
  widgetKey: "sr_by_status",
  cacheTtlSeconds: 120,
  async execute(ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const meta = await statusMeta(ctx.tenantId);
    const agg = await getTicketModel().aggregate([
      { $match: srMatch(scopedQuery, { createdAt: { $gte: start, $lte: end } }) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      segments: agg.map((r: any) => ({
        code: r._id,
        name: meta.byCode[r._id]?.name ?? String(r._id),
        color: meta.byCode[r._id]?.color ?? "#64748b",
        count: r.count,
        percent: pct(r.count, total),
      })),
      total,
    };
  },
};

const srTrendOverTime: QueryHandler = {
  widgetKey: "sr_trend_over_time",
  cacheTtlSeconds: 300,
  async execute(_ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const Ticket = getTicketModel();
    const byDay = (field: string, as: string) => [
      { $match: srMatch(scopedQuery, { [field]: { $gte: start, $lte: end } }) },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}` } },
          [as]: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 as 1 } },
    ];
    const [created, closed] = await Promise.all([
      Ticket.aggregate(byDay("createdAt", "created")),
      Ticket.aggregate(byDay("closedAt", "closed")),
    ]);
    const createdByDay: Record<string, number> = Object.fromEntries(
      created.map((r: any) => [r._id, r.created]),
    );
    const closedByDay: Record<string, number> = Object.fromEntries(
      closed.map((r: any) => [r._id, r.closed]),
    );
    // Same shape as the ticket trend widget, so the line renderer draws it.
    const days = [...new Set([...Object.keys(createdByDay), ...Object.keys(closedByDay)])].sort();
    return {
      series: days.map((date) => ({
        date,
        created: createdByDay[date] ?? 0,
        closed: closedByDay[date] ?? 0,
      })),
    };
  },
};

const AGE_BUCKETS = [
  { name: "Under 1 day", maxHrs: 24, color: "#10b981" },
  { name: "1–3 days", maxHrs: 72, color: "#f59e0b" },
  { name: "3–7 days", maxHrs: 168, color: "#f97316" },
  { name: "Over 7 days", maxHrs: Infinity, color: "#ef4444" },
];

const srAgingBuckets: QueryHandler = {
  widgetKey: "sr_aging_buckets",
  cacheTtlSeconds: 300,
  async execute(ctx, _params, _f, scopedQuery): Promise<WidgetData> {
    const meta = await statusMeta(ctx.tenantId);
    const agg = await getTicketModel().aggregate([
      { $match: srMatch(scopedQuery, { status: { $in: meta.openCodes } }) },
      {
        $project: {
          ageHrs: { $divide: [{ $subtract: ["$$NOW", "$createdAt"] }, 3600000] },
        },
      },
      {
        $bucket: {
          groupBy: "$ageHrs",
          boundaries: [0, 24, 72, 168, Number.MAX_SAFE_INTEGER],
          default: "other",
          output: { count: { $sum: 1 } },
        },
      },
    ]);
    const counts: Record<number, number> = Object.fromEntries(
      agg.map((r: any) => [r._id, r.count]),
    );
    const boundaries = [0, 24, 72, 168];
    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      segments: AGE_BUCKETS.map((b, i) => ({
        name: b.name,
        color: b.color,
        count: counts[boundaries[i]] ?? 0,
        percent: pct(counts[boundaries[i]] ?? 0, total),
      })),
      total,
    };
  },
};

// ─── Commitment (the WIP committed date) ─────────────────────────────────────

const srWipDueSoonCount: QueryHandler = {
  widgetKey: "sr_wip_due_soon_count",
  cacheTtlSeconds: 120,
  async execute(ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const meta = await statusMeta(ctx.tenantId);
    const hours = Number((params.filters as any)?.withinHours) || 48;
    const now = new Date();
    const until = new Date(now.getTime() + hours * 3600000);
    const value = await getTicketModel().countDocuments(
      srMatch(scopedQuery, {
        status: { $in: meta.openCodes },
        "wip.committedDate": { $gt: now, $lte: until },
      }),
    );
    return { value, subtitle: `Committed within ${hours}h`, trendDirection: "lower_is_better" };
  },
};

const srWipExpiredCount: QueryHandler = {
  widgetKey: "sr_wip_expired_count",
  cacheTtlSeconds: 120,
  async execute(ctx, _params, _f, scopedQuery): Promise<WidgetData> {
    const meta = await statusMeta(ctx.tenantId);
    const value = await getTicketModel().countDocuments(
      srMatch(scopedQuery, {
        status: { $in: meta.openCodes },
        "wip.committedDate": { $lt: new Date() },
      }),
    );
    return { value, subtitle: "Past their committed date", trendDirection: "lower_is_better" };
  },
};

const srCommittedDateMetRate: QueryHandler = {
  widgetKey: "sr_committed_date_met_rate",
  cacheTtlSeconds: 300,
  async execute(_ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getTicketModel().aggregate([
      {
        $match: srMatch(scopedQuery, {
          closedAt: { $gte: start, $lte: end },
          "wip.committedDate": { $exists: true, $ne: null },
        }),
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          met: { $sum: { $cond: [{ $lte: ["$closedAt", "$wip.committedDate"] }, 1, 0] } },
        },
      },
    ]);
    const { total = 0, met = 0 } = agg[0] || {};
    return {
      value: pct(met, total),
      unit: "%",
      numerator: met,
      denominator: total,
      trendDirection: "higher_is_better",
    };
  },
};

// ─── SLA ─────────────────────────────────────────────────────────────────────

const srSlaCompliance: QueryHandler = {
  widgetKey: "sr_sla_compliance",
  cacheTtlSeconds: 300,
  async execute(_ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getTicketModel().aggregate([
      {
        $match: srMatch(scopedQuery, {
          closedAt: { $gte: start, $lte: end },
          "ticketLevelSLA.dueAt": { $exists: true, $ne: null },
        }),
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          within: { $sum: { $cond: [{ $lte: ["$closedAt", "$ticketLevelSLA.dueAt"] }, 1, 0] } },
        },
      },
    ]);
    const { total = 0, within = 0 } = agg[0] || {};
    return {
      value: pct(within, total),
      unit: "%",
      numerator: within,
      denominator: total,
      trendDirection: "higher_is_better",
    };
  },
};

const srOverdueCount: QueryHandler = {
  widgetKey: "sr_overdue_count",
  cacheTtlSeconds: 120,
  async execute(ctx, _params, _f, scopedQuery): Promise<WidgetData> {
    const meta = await statusMeta(ctx.tenantId);
    // A held clock is not overdue: it is waiting on a date someone committed to.
    const value = await getTicketModel().countDocuments(
      srMatch(scopedQuery, {
        status: { $in: meta.openCodes },
        "ticketLevelSLA.dueAt": { $lt: new Date() },
        "ticketLevelSLA.pausedAt": null,
      }),
    );
    return { value, subtitle: "Past SLA, clock running", trendDirection: "lower_is_better" };
  },
};

const srOnHoldCount: QueryHandler = {
  widgetKey: "sr_on_hold_count",
  cacheTtlSeconds: 120,
  async execute(_ctx, _params, _f, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const query = srMatch(scopedQuery, {
      $or: [
        { "roleLevelSLA.pausedAt": { $ne: null } },
        { "ticketLevelSLA.pausedAt": { $ne: null } },
      ],
    });
    const [value, resumingToday] = await Promise.all([
      Ticket.countDocuments(query),
      Ticket.countDocuments({
        ...query,
        $and: [
          {
            $or: [
              { "roleLevelSLA.resumeAt": { $lte: new Date(Date.now() + 86400000) } },
              { "ticketLevelSLA.resumeAt": { $lte: new Date(Date.now() + 86400000) } },
            ],
          },
        ],
      }),
    ]);
    return {
      value,
      subtitle: `${resumingToday} restarting within 24h`,
      trendDirection: "lower_is_better",
    };
  },
};

// ─── Quality ─────────────────────────────────────────────────────────────────

const rateHandler = (
  widgetKey: string,
  numerator: Record<string, any>,
  subtitle: string,
): QueryHandler => ({
  widgetKey,
  cacheTtlSeconds: 300,
  async execute(_ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params);
    const base = srMatch(scopedQuery, { createdAt: { $gte: start, $lte: end } });
    const [total, part] = await Promise.all([
      Ticket.countDocuments(base),
      Ticket.countDocuments({ ...base, ...numerator }),
    ]);
    return {
      value: pct(part, total),
      unit: "%",
      numerator: part,
      denominator: total,
      subtitle,
      trendDirection: "lower_is_better",
    };
  },
});

const srReopenRate = rateHandler(
  "sr_reopen_rate",
  { "reopen.count": { $gt: 0 } },
  "Re-opened at least once",
);

const srCancelRate = rateHandler(
  "sr_cancel_rate",
  { "cancel.at": { $exists: true, $ne: null } },
  "Cancelled after being raised",
);

const srParentSatisfactionRate: QueryHandler = {
  widgetKey: "sr_parent_satisfaction_rate",
  cacheTtlSeconds: 300,
  async execute(_ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params);
    const base = srMatch(scopedQuery, {
      "parentClosure.closedAt": { $gte: start, $lte: end },
    });
    const [total, satisfied] = await Promise.all([
      Ticket.countDocuments(base),
      Ticket.countDocuments({ ...base, "parentClosure.satisfied": true }),
    ]);
    return {
      value: pct(satisfied, total),
      unit: "%",
      numerator: satisfied,
      denominator: total,
      subtitle: "Parents who confirmed they were satisfied",
      trendDirection: "higher_is_better",
    };
  },
};

const srAvgResolutionHrs: QueryHandler = {
  widgetKey: "sr_avg_resolution_hrs",
  cacheTtlSeconds: 300,
  async execute(_ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getTicketModel().aggregate([
      { $match: srMatch(scopedQuery, { closedAt: { $gte: start, $lte: end } }) },
      {
        $group: {
          _id: null,
          avgHrs: { $avg: { $divide: [{ $subtract: ["$closedAt", "$createdAt"] }, 3600000] } },
          count: { $sum: 1 },
        },
      },
    ]);
    const row = agg[0] || { avgHrs: 0, count: 0 };
    return {
      value: Math.round((row.avgHrs || 0) * 10) / 10,
      unit: "hrs",
      denominator: row.count,
      subtitle: "Average time from raised to closed",
      trendDirection: "lower_is_better",
    };
  },
};

// ─── Slices ──────────────────────────────────────────────────────────────────

const breakdown = (
  widgetKey: string,
  groupBy: string,
  label: (id: any) => string,
  opts: { limit?: number; lookup?: any[]; openOnly?: boolean } = {},
): QueryHandler => ({
  widgetKey,
  cacheTtlSeconds: 300,
  async execute(ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const meta = await statusMeta(ctx.tenantId);
    const match = opts.openOnly
      ? srMatch(scopedQuery, { status: { $in: meta.openCodes } })
      : srMatch(scopedQuery, { createdAt: { $gte: start, $lte: end } });
    const agg = await getTicketModel().aggregate([
      { $match: match },
      ...(opts.lookup || []),
      { $group: { _id: groupBy, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: opts.limit ?? 10 },
    ]);
    return segmentsFrom(agg, label);
  },
});

const srByModeOfContact = breakdown(
  "sr_by_mode_of_contact",
  { $ifNull: ["$modeOfContact", "not recorded"] } as any,
  (id) => String(id ?? "not recorded").replace(/_/g, " "),
);

const srByChannel = breakdown(
  "sr_by_channel",
  { $ifNull: ["$metadata.sourceLabel", { $ifNull: ["$submissionSource", "not recorded"] }] } as any,
  (id) => String(id ?? "not recorded").replace(/_/g, " "),
);

const srByCategory = breakdown(
  "sr_by_category",
  { $ifNull: [{ $arrayElemAt: ["$_cat.name", 0] }, "Uncategorised"] } as any,
  (id) => String(id ?? "Uncategorised"),
  {
    lookup: [
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "_cat",
          pipeline: [{ $project: { name: 1 } }],
        },
      },
    ],
  },
);

const srByAssignee = breakdown(
  "sr_by_assignee",
  {
    $ifNull: [
      {
        $trim: {
          input: {
            $concat: [
              { $ifNull: [{ $arrayElemAt: ["$_user.firstName", 0] }, ""] },
              " ",
              { $ifNull: [{ $arrayElemAt: ["$_user.lastName", 0] }, ""] },
            ],
          },
        },
      },
      "Unassigned",
    ],
  } as any,
  (id) => (String(id ?? "").trim() ? String(id) : "Unassigned"),
  {
    openOnly: true,
    limit: 15,
    lookup: [
      {
        $lookup: {
          from: "users",
          localField: "assignedTo",
          foreignField: "_id",
          as: "_user",
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        },
      },
    ],
  },
);

// ─── Call inbox (IVR) ────────────────────────────────────────────────────────

const srCallVolume: QueryHandler = {
  widgetKey: "sr_call_volume",
  cacheTtlSeconds: 120,
  async execute(ctx, params): Promise<WidgetData> {
    const Call = getCallModel();
    const { start, end } = buildDateRange(params);
    const prev = previousWindow(start, end);
    const [current, previous] = await Promise.all([
      Call.countDocuments(callMatch(ctx, { receivedAt: { $gte: start, $lte: end } })),
      Call.countDocuments(callMatch(ctx, { receivedAt: { $gte: prev.start, $lt: prev.end } })),
    ]);
    return trendOf(current, previous, false);
  },
};

const srCallAnswerRate: QueryHandler = {
  widgetKey: "sr_call_answer_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const Call = getCallModel();
    const { start, end } = buildDateRange(params);
    const base = callMatch(ctx, { receivedAt: { $gte: start, $lte: end } });
    const [total, answered] = await Promise.all([
      Call.countDocuments(base),
      Call.countDocuments({ ...base, callType: "answered" }),
    ]);
    return {
      value: pct(answered, total),
      unit: "%",
      numerator: answered,
      denominator: total,
      subtitle: `${total - answered} missed`,
      trendDirection: "higher_is_better",
    };
  },
};

const srCallConversionRate: QueryHandler = {
  widgetKey: "sr_call_conversion_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const Call = getCallModel();
    const { start, end } = buildDateRange(params);
    const base = callMatch(ctx, { receivedAt: { $gte: start, $lte: end } });
    const [total, converted, onCall] = await Promise.all([
      Call.countDocuments(base),
      Call.countDocuments({ ...base, callStatus: "converted" }),
      Call.countDocuments({ ...base, resolvedOnCall: true }),
    ]);
    return {
      value: pct(converted, total),
      unit: "%",
      numerator: converted,
      denominator: total,
      subtitle: `${onCall} resolved on the call`,
      trendDirection: "higher_is_better",
    };
  },
};

const srCallByStatus: QueryHandler = {
  widgetKey: "sr_call_by_status",
  cacheTtlSeconds: 120,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getCallModel().aggregate([
      { $match: callMatch(ctx, { receivedAt: { $gte: start, $lte: end } }) },
      { $group: { _id: "$callStatus", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const names: Record<string, string> = {
      new: "New",
      assigned: "Assigned",
      converted: "Converted",
      junk: "Junk",
    };
    return segmentsFrom(agg, (id) => names[id] ?? String(id ?? ""));
  },
};

const srCallPendingCallbacks: QueryHandler = {
  widgetKey: "sr_call_pending_callbacks",
  cacheTtlSeconds: 60,
  async execute(ctx): Promise<WidgetData> {
    const Call = getCallModel();
    const now = new Date();
    const [due, overdue] = await Promise.all([
      Call.countDocuments(callMatch(ctx, { status: "open", callbackAt: { $ne: null } })),
      Call.countDocuments(callMatch(ctx, { status: "open", callbackAt: { $lt: now } })),
    ]);
    return {
      value: due,
      subtitle: `${overdue} already past due`,
      trendDirection: "lower_is_better",
    };
  },
};

const srCallAgentLoad: QueryHandler = {
  widgetKey: "sr_call_agent_load",
  cacheTtlSeconds: 300,
  async execute(ctx): Promise<WidgetData> {
    const agg = await getCallModel().aggregate([
      { $match: callMatch(ctx, { status: "open" }) },
      {
        $lookup: {
          from: "users",
          localField: "assignedTo",
          foreignField: "_id",
          as: "_user",
          pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
        },
      },
      {
        $group: {
          _id: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: [{ $arrayElemAt: ["$_user.firstName", 0] }, ""] },
                  " ",
                  { $ifNull: [{ $arrayElemAt: ["$_user.lastName", 0] }, ""] },
                ],
              },
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);
    return segmentsFrom(agg, (id) => (String(id ?? "").trim() ? String(id) : "Unassigned"));
  },
};

// ─── More slices ─────────────────────────────────────────────────────────────

const srByPriority = breakdown(
  "sr_by_priority",
  { $ifNull: ["$priority", "not set"] } as any,
  (id) => String(id ?? "not set"),
);

const srByRequestType = breakdown(
  "sr_by_request_type",
  { $ifNull: ["$requestType", "not set"] } as any,
  (id) => (id === "OCR" ? "On-call resolution" : id === "SR" ? "Full workflow" : "Not set"),
);

const srByCenter = breakdown(
  "sr_by_center",
  { $ifNull: [{ $arrayElemAt: ["$_center.centerName", 0] }, "No centre"] } as any,
  (id) => String(id ?? "No centre"),
  {
    limit: 15,
    lookup: [
      {
        $lookup: {
          from: "centers",
          let: { cid: "$metadata.centerId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    "$_id",
                    { $convert: { input: "$$cid", to: "objectId", onError: null, onNull: null } },
                  ],
                },
              },
            },
            { $project: { centerName: 1 } },
          ],
          as: "_center",
        },
      },
    ],
  },
);

const srByEscalationLevel = breakdown(
  "sr_by_escalation_level",
  { $ifNull: ["$currentEscalationLevelNumber", 0] } as any,
  (id) => (Number(id) > 0 ? `Level ${id}` : "Not escalated"),
  { openOnly: true },
);

// ─── More quality measures ───────────────────────────────────────────────────

const srEscalationRate = rateHandler(
  "sr_escalation_rate",
  { currentEscalationLevelNumber: { $gt: 0 } },
  "Escalated at least once",
);

const srAvgFirstResponseHrs: QueryHandler = {
  widgetKey: "sr_avg_first_response_hrs",
  cacheTtlSeconds: 300,
  async execute(_ctx, params, _f, scopedQuery): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getTicketModel().aggregate([
      {
        $match: srMatch(scopedQuery, {
          createdAt: { $gte: start, $lte: end },
          firstRespondedAt: { $ne: null },
        }),
      },
      {
        $group: {
          _id: null,
          avgHrs: {
            $avg: { $divide: [{ $subtract: ["$firstRespondedAt", "$createdAt"] }, 3600000] },
          },
          count: { $sum: 1 },
        },
      },
    ]);
    const row = agg[0] || { avgHrs: 0, count: 0 };
    return {
      value: Math.round((row.avgHrs || 0) * 10) / 10,
      unit: "hrs",
      denominator: row.count,
      subtitle: "Average wait for the first reply",
      trendDirection: "lower_is_better",
    };
  },
};

// ─── Call-back ladder and outbound attempts ──────────────────────────────────

const srCallByLadderStep: QueryHandler = {
  widgetKey: "sr_call_by_ladder_step",
  cacheTtlSeconds: 120,
  async execute(ctx): Promise<WidgetData> {
    const agg = await getCallModel().aggregate([
      { $match: callMatch(ctx, { status: "open", followUps: { $ne: [] } }) },
      {
        $group: {
          _id: {
            $ifNull: [
              { $getField: { field: "wipLevel", input: { $arrayElemAt: ["$followUps", -1] } } },
              0,
            ],
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return segmentsFrom(agg, (id) =>
      Number(id) > 0 ? `Step ${id}` : "No step logged",
    );
  },
};

const srOutboundCallStats: QueryHandler = {
  widgetKey: "sr_outbound_call_stats",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getCallModel().aggregate([
      { $match: callMatch(ctx, { receivedAt: { $gte: start, $lte: end } }) },
      { $unwind: "$outboundCalls" },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          answered: { $sum: { $cond: [{ $eq: ["$outboundCalls.status", "answered"] }, 1, 0] } },
          talkSecs: { $sum: { $ifNull: ["$outboundCalls.durationSeconds", 0] } },
        },
      },
    ]);
    const row = agg[0] || { attempts: 0, answered: 0, talkSecs: 0 };
    return {
      value: row.attempts,
      numerator: row.answered,
      denominator: row.attempts,
      subtitle: `${pct(row.answered, row.attempts)}% answered, ${Math.round(row.talkSecs / 60)} min talk time`,
      trendDirection: "higher_is_better",
    };
  },
};

// ─── Email triage queue ──────────────────────────────────────────────────────

const srEmailVolume: QueryHandler = {
  widgetKey: "sr_email_volume",
  cacheTtlSeconds: 120,
  async execute(ctx, params): Promise<WidgetData> {
    const Email = getEmailIntakeModel();
    const { start, end } = buildDateRange(params);
    const prev = previousWindow(start, end);
    const [current, previous] = await Promise.all([
      Email.countDocuments(callMatch(ctx, { receivedAt: { $gte: start, $lte: end } })),
      Email.countDocuments(callMatch(ctx, { receivedAt: { $gte: prev.start, $lt: prev.end } })),
    ]);
    return trendOf(current, previous, false);
  },
};

const srEmailOverdueCount: QueryHandler = {
  widgetKey: "sr_email_overdue_count",
  cacheTtlSeconds: 120,
  async execute(ctx): Promise<WidgetData> {
    const value = await getEmailIntakeModel().countDocuments(
      callMatch(ctx, {
        status: { $in: ["open", "wip"] },
        dueAt: { $lt: new Date() },
      }),
    );
    return { value, subtitle: "Past their triage TAT", trendDirection: "lower_is_better" };
  },
};

const srEmailByStatus: QueryHandler = {
  widgetKey: "sr_email_by_status",
  cacheTtlSeconds: 120,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getEmailIntakeModel().aggregate([
      { $match: callMatch(ctx, { receivedAt: { $gte: start, $lte: end } }) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return segmentsFrom(agg, (id) =>
      String(id ?? "").replace(/^\w/, (c: string) => c.toUpperCase()),
    );
  },
};

const srEmailAvgCloseHrs: QueryHandler = {
  widgetKey: "sr_email_avg_close_hrs",
  cacheTtlSeconds: 300,
  async execute(ctx, params): Promise<WidgetData> {
    const { start, end } = buildDateRange(params);
    const agg = await getEmailIntakeModel().aggregate([
      { $match: callMatch(ctx, { closedAt: { $gte: start, $lte: end } }) },
      {
        $group: {
          _id: null,
          avgHrs: { $avg: { $divide: [{ $subtract: ["$closedAt", "$receivedAt"] }, 3600000] } },
          count: { $sum: 1 },
        },
      },
    ]);
    const row = agg[0] || { avgHrs: 0, count: 0 };
    return {
      value: Math.round((row.avgHrs || 0) * 10) / 10,
      unit: "hrs",
      denominator: row.count,
      subtitle: "Average time to clear an email",
      trendDirection: "lower_is_better",
    };
  },
};

export function registerSrDashboardHandlers(): void {
  [
    srOpenCount,
    srCreatedCount,
    srClosedCount,
    srUnassignedCount,
    srVolumeByType,
    srByStatus,
    srTrendOverTime,
    srAgingBuckets,
    srWipDueSoonCount,
    srWipExpiredCount,
    srCommittedDateMetRate,
    srSlaCompliance,
    srOverdueCount,
    srOnHoldCount,
    srReopenRate,
    srCancelRate,
    srParentSatisfactionRate,
    srAvgResolutionHrs,
    srByModeOfContact,
    srByChannel,
    srByCategory,
    srByAssignee,
    srCallVolume,
    srCallAnswerRate,
    srCallConversionRate,
    srCallByStatus,
    srCallPendingCallbacks,
    srCallAgentLoad,
    srByPriority,
    srByRequestType,
    srByCenter,
    srByEscalationLevel,
    srEscalationRate,
    srAvgFirstResponseHrs,
    srCallByLadderStep,
    srOutboundCallStats,
    srEmailVolume,
    srEmailOverdueCount,
    srEmailByStatus,
    srEmailAvgCloseHrs,
  ].forEach(registerWidgetHandler);
}
