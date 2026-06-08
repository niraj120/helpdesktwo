/**
 * Phase 3 Widget Query Handlers — Helpdesk Ticketing (ht_* namespace)
 *
 * All status codes, names, and classifications are resolved dynamically from
 * the project's Status, Priority, and Category collections — nothing is
 * hardcoded. The Ticket.status field is a Number that maps to Status.code.
 *
 * Status model: { code: Number, name: String, isClosed: Boolean, isDefault: Boolean }
 * SLA:          ticketLevelSLA.dueAt / ticketLevelSLA.breachedAt
 * Escalation:   escalationHistory[] (non-empty means escalated)
 * Reopen:       changeHistory[] field:"status" old→closed new→active
 * First reply:  first thread not authored by the ticket creator
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

// ─── Lazy model accessors ─────────────────────────────────────────────────────

const getTicketModel = () => mongoose.model("Ticket");
const getStatusModel = () => mongoose.model("Status");
const getPriorityModel = () => mongoose.model("Priority");
const getCategoryModel = () => mongoose.model("Category");
const getSLATrackingModel = () => mongoose.model("SLATracking");

// ─── Status helper types ──────────────────────────────────────────────────────

interface ProjectStatus {
  code: number;
  name: string;
  isClosed: boolean;
  isDefault: boolean;
  color?: string;
}

/** Load all active statuses for the given project from the Status collection. */
async function loadProjectStatuses(
  projectId: string,
): Promise<ProjectStatus[]> {
  const statuses = await getStatusModel()
    .find({ projectId: new mongoose.Types.ObjectId(projectId), isActive: true })
    .select("code name isClosed isDefault color")
    .lean();
  return statuses as unknown as ProjectStatus[];
}

/** Status codes where isClosed = true  → ticket is done (resolved OR closed). */
const closedCodes = (ss: ProjectStatus[]) =>
  ss.filter((s) => s.isClosed).map((s) => s.code);
/** Status codes where isClosed = true AND name matches "resolved" → resolved only. */
const resolvedOnlyCodes = (ss: ProjectStatus[]) =>
  ss
    .filter((s) => s.isClosed && s.name.toLowerCase().includes("resolv"))
    .map((s) => s.code);
/** Status codes where isClosed = true AND name does NOT match "resolved" → truly closed only. */
const strictClosedCodes = (ss: ProjectStatus[]) =>
  ss
    .filter((s) => s.isClosed && !s.name.toLowerCase().includes("resolv"))
    .map((s) => s.code);
/** Status codes where isClosed = false → ticket is still active. */
const activeCodes = (ss: ProjectStatus[]) =>
  ss.filter((s) => !s.isClosed).map((s) => s.code);
/** Status codes where isClosed = false AND isDefault = false → in-progress / on-hold / pending. */
const pendingCodes = (ss: ProjectStatus[]) =>
  ss.filter((s) => !s.isClosed && !s.isDefault).map((s) => s.code);
/** Map from status code → display name. */
const codeToName = (ss: ProjectStatus[]) =>
  new Map(ss.map((s) => [s.code, s.name]));

// ─── Shared KPI trend builder ─────────────────────────────────────────────────

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

/**
 * Extracts per-widget filter overrides from resolvedFilters that apply to
 * ticket queries.
 *
 *   assignedTo  → narrow results to tickets assigned to a specific user
 *                 (set via `data_config.filters = { assignedTo: "@ctx.userId" }`)
 *   project     → override the scoped metadata.projectId with a specific project
 *                 (set via `data_config.filters = { project: "@ctx.primaryProjectId" }`)
 *
 * Both can be combined: a counselor sees only their own tickets within a
 * specific project when both are present.
 */
function ticketFilterOverrides(
  rf: Record<string, any>,
  ctx?: WidgetQueryContext,
): Record<string, any> {
  const extra: Record<string, any> = {};

  // @ctx.userId → assignedTo (agent viewing their assigned tickets)
  if (rf.assignedTo) {
    try {
      extra.assignedTo = new mongoose.Types.ObjectId(String(rf.assignedTo));
    } catch {
      // invalid ObjectId — skip rather than crash
    }
  }

  // @ctx.userId → createdBy (user viewing tickets they submitted)
  if (rf.createdBy) {
    try {
      extra.createdBy = new mongoose.Types.ObjectId(String(rf.createdBy));
    } catch {
      // invalid ObjectId — skip
    }
  }

  // @ctx.primaryProjectId → metadata.projectId (single project scope)
  // Takes precedence over projectIds if both are set.
  if (rf.project) {
    extra["metadata.projectId"] = String(rf.project);
  } else if (Array.isArray(rf.projectIds) && rf.projectIds.length > 0) {
    // @ctx.projectIds → metadata.projectId $in (multi-project users)
    extra["metadata.projectId"] = { $in: rf.projectIds.map(String) };
  } else if (
    (rf.assignedTo || rf.createdBy) &&
    ctx?.projectIds &&
    ctx.projectIds.length > 1
  ) {
    // Auto-expand: when scoping to a specific user (assignedTo/createdBy) but no
    // explicit project filter is set, include ALL the user's projects — this
    // matches the behaviour of My Queries and prevents a 1-ticket gap when a
    // user has tickets spread across multiple projects.
    extra["metadata.projectId"] = { $in: ctx.projectIds.map(String) };
  }

  // @ctx.centreId → metadata.centreId (centre-scoped counsellor view)
  if (rf.centreId) {
    extra["metadata.centreId"] = String(rf.centreId);
  }

  // @ctx.districtId → metadata.districtId (district manager view)
  if (rf.districtId) {
    extra["metadata.districtId"] = String(rf.districtId);
  }

  // @ctx.email → metadata.studentEmail (student viewing their own tickets)
  if (rf.email) {
    extra["metadata.studentEmail"] = String(rf.email);
  }

  // Note: @ctx.roleCode has no direct ticket field — not mapped here.

  return extra;
}

// ─── 1. ht_total_tickets ──────────────────────────────────────────────────────

const htTotalTicketsHandler: QueryHandler = {
  widgetKey: "ht_total_tickets",
  cacheTtlSeconds: 120,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const extra = ticketFilterOverrides(rf, ctx);
    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        createdAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        createdAt: { $gte: prevStart, $lt: start },
      }),
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
      trendDirection: "higher_is_better",
    };
  },
};

// ─── 2. ht_open_tickets ───────────────────────────────────────────────────────

const htOpenTicketsHandler: QueryHandler = {
  widgetKey: "ht_open_tickets",
  cacheTtlSeconds: 60,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const aCodes = activeCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        status: { $in: aCodes },
        createdAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        status: { $in: aCodes },
        createdAt: { $gte: prevStart, $lt: start },
      }),
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

// ─── 3. ht_resolved_tickets ───────────────────────────────────────────────────

const htResolvedTicketsHandler: QueryHandler = {
  widgetKey: "ht_resolved_tickets",
  cacheTtlSeconds: 120,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = resolvedOnlyCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    // Count by STATUS over createdAt (consistent with Total/Open/Closed widgets
    // and the View Queries per-status cards). Filtering by closedAt undercounted
    // resolved tickets that have no closedAt timestamp set.
    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        status: { $in: dCodes },
        createdAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        status: { $in: dCodes },
        createdAt: { $gte: prevStart, $lt: start },
      }),
    ]);
    return kpiTrend(current, previous, true);
  },
};

// ─── 4. ht_closed_tickets ─────────────────────────────────────────────────────

const htClosedTicketsHandler: QueryHandler = {
  widgetKey: "ht_closed_tickets",
  cacheTtlSeconds: 120,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = strictClosedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    // Tickets that were created in range AND are now in a closed status
    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        status: { $in: dCodes },
        createdAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        status: { $in: dCodes },
        createdAt: { $gte: prevStart, $lt: start },
      }),
    ]);
    return kpiTrend(current, previous, true);
  },
};

// ─── 5. ht_pending_tickets ────────────────────────────────────────────────────
// "Pending" = active statuses that are NOT the default initial status
// (i.e. in-progress, on-hold, waiting — anything the agent has touched but not closed)

const htPendingTicketsHandler: QueryHandler = {
  widgetKey: "ht_pending_tickets",
  cacheTtlSeconds: 60,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const pCodes = pendingCodes(statuses);
    if (pCodes.length === 0)
      return { value: 0, trendDirection: "lower_is_better" };
    const extra = ticketFilterOverrides(rf, ctx);
    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        status: { $in: pCodes },
        createdAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        status: { $in: pCodes },
        createdAt: { $gte: prevStart, $lt: start },
      }),
    ]);
    return kpiTrend(current, previous, false);
  },
};

// ─── 6. ht_escalated_tickets ──────────────────────────────────────────────────
// Escalated = ticket has at least one escalationHistory entry

const htEscalatedTicketsHandler: QueryHandler = {
  widgetKey: "ht_escalated_tickets",
  cacheTtlSeconds: 120,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const extra = ticketFilterOverrides(rf, ctx);
    const escalatedFilter = {
      escalationHistory: { $exists: true },
      "escalationHistory.0": { $exists: true },
    };
    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        ...escalatedFilter,
        createdAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        ...escalatedFilter,
        createdAt: { $gte: prevStart, $lt: start },
      }),
    ]);
    return kpiTrend(current, previous, false);
  },
};

// ─── 7. ht_sla_breached ───────────────────────────────────────────────────────
// SLA breached = ticket missed its resolution deadline.
// Uses the slatrackings collection (752 records) which has resolutionDeadline
// set at ticket creation. Falls back to resolutionStatus == "breached" if set.

const htSlaBreachedHandler: QueryHandler = {
  widgetKey: "ht_sla_breached",
  cacheTtlSeconds: 120,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = closedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    const now = new Date();

    // A ticket is SLA-breached if it has a slatracking record AND:
    //   1. Still open AND resolutionDeadline has passed, OR
    //   2. Closed AND closedAt > resolutionDeadline (resolved late).
    // Note: resolutionStatus field is NOT used — it is unreliable in the DB
    // (tickets can be closed-late but still show resolutionStatus="met").
    const breachMatchStage = {
      $or: [
        {
          status: { $nin: dCodes },
          "slaTracking.resolutionDeadline": { $lt: now },
        },
        {
          status: { $in: dCodes },
          closedAt: { $exists: true, $ne: null },
          $expr: { $gt: ["$closedAt", "$slaTracking.resolutionDeadline"] },
        },
      ],
    };

    const runQuery = async (dateFilter: Record<string, any>) => {
      const result = await Ticket.aggregate([
        { $match: { ...scopedQuery, ...extra, ...dateFilter } },
        {
          $lookup: {
            from: "slatrackings",
            localField: "_id",
            foreignField: "ticketId",
            as: "slaTracking",
          },
        },
        { $unwind: "$slaTracking" }, // excludes tickets without SLA tracking
        { $match: breachMatchStage },
        { $count: "n" },
      ]);
      return result[0]?.n ?? 0;
    };

    const [current, previous] = await Promise.all([
      runQuery({ createdAt: { $gte: start, $lte: end } }),
      runQuery({ createdAt: { $gte: prevStart, $lt: start } }),
    ]);
    return kpiTrend(current, previous, false);
  },
};

// ─── 8. ht_resolved_within_sla ───────────────────────────────────────────────
// Resolved within SLA = closed ticket resolved before or on its resolutionDeadline.
// Uses the slatrackings collection for the actual deadline.

const htResolvedWithinSlaHandler: QueryHandler = {
  widgetKey: "ht_resolved_within_sla",
  cacheTtlSeconds: 120,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = closedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);

    // A ticket is resolved within SLA if:
    //   Closed AND closedAt <= resolutionDeadline.
    // Note: resolutionStatus field is NOT used — it is unreliable in the DB.
    const withinSlaMatchStage = {
      status: { $in: dCodes },
      closedAt: { $exists: true, $ne: null },
      $expr: { $lte: ["$closedAt", "$slaTracking.resolutionDeadline"] },
    };

    const runQuery = async (dateFilter: Record<string, any>) => {
      const result = await Ticket.aggregate([
        { $match: { ...scopedQuery, ...extra, ...dateFilter } },
        {
          $lookup: {
            from: "slatrackings",
            localField: "_id",
            foreignField: "ticketId",
            as: "slaTracking",
          },
        },
        { $unwind: "$slaTracking" },
        { $match: withinSlaMatchStage },
        { $count: "n" },
      ]);
      return result[0]?.n ?? 0;
    };

    const [current, previous] = await Promise.all([
      runQuery({ createdAt: { $gte: start, $lte: end } }),
      runQuery({ createdAt: { $gte: prevStart, $lt: start } }),
    ]);
    return kpiTrend(current, previous, true);
  },
};

// ─── 9. ht_resolution_rate ────────────────────────────────────────────────────

const htResolutionRateHandler: QueryHandler = {
  widgetKey: "ht_resolution_rate",
  cacheTtlSeconds: 180,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const dateFilter = { createdAt: { $gte: start, $lte: end } };
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = closedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    const [total, resolved] = await Promise.all([
      Ticket.countDocuments({ ...scopedQuery, ...extra, ...dateFilter }),
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        ...dateFilter,
        status: { $in: dCodes },
      }),
    ]);
    const rate = total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0;
    return { value: rate, unit: "percent", trendDirection: "higher_is_better" };
  },
};

// ─── 10. ht_sla_compliance_rate ──────────────────────────────────────────────
// SLA compliance rate = (resolved within SLA / total closed with SLA tracking) × 100.
// Uses slatrackings collection for the actual resolution deadline.

const htSlaComplianceRateHandler: QueryHandler = {
  widgetKey: "ht_sla_compliance_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = closedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);

    // Base pipeline: match tickets in date range, join with slatrackings.
    const basePipeline = [
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
          status: { $in: dCodes },
        },
      },
      {
        $lookup: {
          from: "slatrackings",
          localField: "_id",
          foreignField: "ticketId",
          as: "slaTracking",
        },
      },
      { $unwind: "$slaTracking" }, // denominator: closed tickets with SLA tracking
    ];

    // Denominator: all closed tickets that have SLA tracking records.
    // Numerator: those where closedAt <= resolutionDeadline.
    // Note: resolutionStatus field is NOT used — it is unreliable in the DB.
    const [aggResult] = await Ticket.aggregate([
      ...basePipeline,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withinSla: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $ifNull: ["$closedAt", false] },
                    { $lte: ["$closedAt", "$slaTracking.resolutionDeadline"] },
                  ],
                },
                then: 1,
                else: 0,
              },
            },
          },
        },
      },
    ]);

    const total = aggResult?.total ?? 0;
    const withinSla = aggResult?.withinSla ?? 0;
    const rate = total > 0 ? Math.round((withinSla / total) * 1000) / 10 : 0;
    return { value: rate, unit: "percent", trendDirection: "higher_is_better" };
  },
};

// ─── 11. ht_avg_resolution_hours ─────────────────────────────────────────────

const htAvgResolutionHoursHandler: QueryHandler = {
  widgetKey: "ht_avg_resolution_hours",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = closedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
          status: { $in: dCodes },
          closedAt: { $exists: true, $ne: null },
        },
      },
      {
        $project: { resolutionMs: { $subtract: ["$closedAt", "$createdAt"] } },
      },
      { $group: { _id: null, avgMs: { $avg: "$resolutionMs" } } },
    ]);
    const avgHours =
      agg.length > 0 ? Math.round((agg[0].avgMs / 3_600_000) * 10) / 10 : 0;
    return {
      value: avgHours,
      unit: "hours",
      trendDirection: "lower_is_better",
    };
  },
};

// ─── 12. ht_tickets_by_category ──────────────────────────────────────────────
// Groups by category ObjectId; joins Category collection for display name.

const htTicketsByCategoryHandler: QueryHandler = {
  widgetKey: "ht_tickets_by_category",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const extra = ticketFilterOverrides(rf, ctx);
    // Group by the TRUE level-1 category. The legacy `category` field stores the
    // DEEPEST selected level (offline tickets set it to level 2–5), so grouping
    // by it mixes hierarchy levels. Prefer categoryHierarchy.level1, falling back
    // to the legacy `category` only for old tickets with no hierarchy stored.
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$categoryHierarchy.level1", "$category"] },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "cat",
        },
      },
      { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
    ]);
    // Merge by name — distinct level-1 nodes can share a name; show unique labels.
    const byName = new Map<string, number>();
    for (const r of agg as any[]) {
      const label = r.cat?.name ?? "Uncategorized";
      byName.set(label, (byName.get(label) ?? 0) + r.count);
    }
    const total = [...byName.values()].reduce((s, v) => s + v, 0);
    const items = [...byName.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([label, count]) => ({
        label,
        value: count,
        percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      }));
    return { items };
  },
};

// ─── 13. ht_tickets_by_status ────────────────────────────────────────────────
// Groups by numeric status code; joins project's Status collection for name + color.

const htTicketsByStatusHandler: QueryHandler = {
  widgetKey: "ht_tickets_by_status",
  cacheTtlSeconds: 120,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const nameMap = codeToName(statuses);
    const colorMap = new Map(
      statuses.map((s) => [s.code, s.color ?? "#94a3b8"]),
    );
    const extra = ticketFilterOverrides(rf, ctx);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      items: agg.map((r: any) => ({
        code: r._id,
        label: nameMap.get(r._id) ?? String(r._id),
        color: colorMap.get(r._id),
        value: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
    };
  },
};

// ─── 14. ht_tickets_by_priority ──────────────────────────────────────────────
// Groups by priority code (string); joins project's Priority collection for name + color.

const htTicketsByPriorityHandler: QueryHandler = {
  widgetKey: "ht_tickets_by_priority",
  cacheTtlSeconds: 120,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    // Load project priorities for display names (code is uppercase string e.g. LOW, MEDIUM)
    const priorities = (await getPriorityModel()
      .find({
        projectId: new mongoose.Types.ObjectId(ctx.tenantId),
        isActive: true,
      })
      .select("code name color order")
      .lean()) as Array<{
      code: string;
      name: string;
      color?: string;
      order?: number;
    }>;
    const prioNameMap = new Map(priorities.map((p) => [p.code, p.name]));
    const prioColorMap = new Map(
      priorities.map((p) => [p.code, p.color ?? "#94a3b8"]),
    );
    const extra = ticketFilterOverrides(rf, ctx);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      items: agg.map((r: any) => ({
        code: r._id,
        label: prioNameMap.get(r._id) ?? r._id ?? "Unknown",
        color: prioColorMap.get(r._id),
        value: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
    };
  },
};

// ─── 15. ht_daily_trend ──────────────────────────────────────────────────────

const htDailyTrendHandler: QueryHandler = {
  widgetKey: "ht_daily_trend",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = closedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    const [created, closed] = await Promise.all([
      Ticket.aggregate([
        {
          $match: {
            ...scopedQuery,
            ...extra,
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Ticket.aggregate([
        {
          $match: {
            ...scopedQuery,
            ...extra,
            status: { $in: dCodes },
            closedAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$closedAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const closedMap = new Map(closed.map((r: any) => [r._id, r.count]));
    return {
      series: [
        {
          name: "Created",
          data: created.map((r: any) => ({ date: r._id, value: r.count })),
        },
        {
          name: "Closed",
          data: created.map((r: any) => ({
            date: r._id,
            value: closedMap.get(r._id) ?? 0,
          })),
        },
      ],
    };
  },
};

// ─── 16. ht_agent_workload ───────────────────────────────────────────────────

const htAgentWorkloadHandler: QueryHandler = {
  widgetKey: "ht_agent_workload",
  cacheTtlSeconds: 180,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const aCodes = activeCodes(statuses);
    const dCodes = closedCodes(statuses);
    // Only apply project filter override for workload chart; assignedTo would
    // reduce it to one agent row which is fine but unusual for a workload view.
    const extra = ticketFilterOverrides(rf, ctx);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
          assignedTo: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$assignedTo",
          open: { $sum: { $cond: [{ $in: ["$status", aCodes] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $in: ["$status", dCodes] }, 1, 0] } },
          total: { $sum: 1 },
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
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]);
    return {
      items: agg.map((r: any) => ({
        agentId: r._id,
        name:
          r.agent?.fullName ??
          (r.agent
            ? `${r.agent.firstName ?? ""} ${r.agent.lastName ?? ""}`.trim()
            : null) ??
          r.agent?.email ??
          "Unassigned",
        open: r.open,
        closed: r.closed,
        total: r.total,
      })),
    };
  },
};

// ─── 17. ht_tickets_heatmap ──────────────────────────────────────────────────

const htTicketsHeatmapHandler: QueryHandler = {
  widgetKey: "ht_tickets_heatmap",
  cacheTtlSeconds: 600,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const extra = ticketFilterOverrides(rf, ctx);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            dow: { $dayOfWeek: "$createdAt" }, // 1=Sun … 7=Sat
            hour: { $hour: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
    ]);
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      cells: agg.map((r: any) => ({
        day: DAYS[(r._id.dow - 1) % 7],
        hour: r._id.hour,
        value: r.count,
      })),
    };
  },
};

// ─── 18. ht_first_response_time ──────────────────────────────────────────────
// First response = earliest thread added by someone OTHER than the ticket creator.

const htFirstResponseTimeHandler: QueryHandler = {
  widgetKey: "ht_first_response_time",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const extra = ticketFilterOverrides(rf, ctx);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
          "threads.0": { $exists: true },
        },
      },
      {
        // Keep only threads not authored by the ticket creator (agent replies)
        $addFields: {
          agentThreads: {
            $filter: {
              input: "$threads",
              as: "t",
              cond: { $ne: ["$$t.createdBy", "$createdBy"] },
            },
          },
        },
      },
      { $match: { "agentThreads.0": { $exists: true } } },
      {
        $project: {
          firstResponseMs: {
            $subtract: [{ $min: "$agentThreads.createdAt" }, "$createdAt"],
          },
        },
      },
      { $match: { firstResponseMs: { $gt: 0 } } },
      { $group: { _id: null, avgMs: { $avg: "$firstResponseMs" } } },
    ]);
    const avgHours =
      agg.length > 0 ? Math.round((agg[0].avgMs / 3_600_000) * 10) / 10 : 0;
    return {
      value: avgHours,
      unit: "hours",
      trendDirection: "lower_is_better",
    };
  },
};

// ─── 19. ht_reopen_rate ───────────────────────────────────────────────────────
// Reopen = ticket has a changeHistory entry where field="status",
// oldValue is a closed-status code (as string), newValue is an active-status code (as string).

const htReopenRateHandler: QueryHandler = {
  widgetKey: "ht_reopen_rate",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const dCodes = closedCodes(statuses).map(String);
    const aCodes = activeCodes(statuses).map(String);
    const dateFilter = { createdAt: { $gte: start, $lte: end } };
    const extra = ticketFilterOverrides(rf, ctx);
    const [reopened, resolved] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        ...dateFilter,
        changeHistory: {
          $elemMatch: {
            field: "status",
            oldValue: { $in: dCodes },
            newValue: { $in: aCodes },
          },
        },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        ...extra,
        ...dateFilter,
        status: { $in: closedCodes(statuses) },
      }),
    ]);
    const rate =
      resolved > 0 ? Math.round((reopened / resolved) * 1000) / 10 : 0;
    return { value: rate, unit: "percent", trendDirection: "lower_is_better" };
  },
};

// ─── 20. ht_tickets_by_project ───────────────────────────────────────────────
// Groups by metadata.projectId; joins Project collection for display name.

const htTicketsByProjectHandler: QueryHandler = {
  widgetKey: "ht_tickets_by_project",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    // Note: project override from resolvedFilters is intentionally NOT applied
    // here — this widget is meant to show a cross-project breakdown.
    // Only assignedTo filter is applied.
    const extra: Record<string, any> = {};
    if (rf.assignedTo) {
      try {
        extra.assignedTo = new mongoose.Types.ObjectId(String(rf.assignedTo));
      } catch {
        /* skip */
      }
    }
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
        },
      },
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
      { $sort: { count: -1 } },
    ]);
    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      items: agg.map((r: any) => ({
        projectId: r._id,
        label: r.project?.name ?? String(r._id),
        value: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
    };
  },
};

// ─── Category-hierarchy breakdowns (levels 1–5) ──────────────────────────────
// The project's category hierarchy can have up to 5 levels (e.g. Category →
// Subcategory → Topic → Course → Department). Level 1 is stored on `category`;
// levels 2–5 on `categoryHierarchy.levelN`. These factories build "tickets
// count" and "resolution efficiency" breakdowns grouped by a given level.

/** Count of tickets per value at a hierarchy level (breakdown). */
function makeCountByHierarchyLevel(
  widgetKey: string,
  levelField: string,
): QueryHandler {
  return {
    widgetKey,
    cacheTtlSeconds: 300,
    async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
      const Ticket = getTicketModel();
      const { start, end } = buildDateRange(params.dateRangeDays);
      const extra = ticketFilterOverrides(rf, ctx);
      const agg = await Ticket.aggregate([
        {
          $match: {
            ...scopedQuery,
            ...extra,
            createdAt: { $gte: start, $lte: end },
            [levelField]: { $nin: [null, ""] },
          },
        },
        { $group: { _id: `$${levelField}`, count: { $sum: 1 } } },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "cat",
          },
        },
        { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
      ]);
      // A hierarchy can have several distinct nodes that share the SAME name
      // (e.g. a "Higher" department under different courses). Merge by name so
      // the breakdown shows unique labels with summed counts.
      const byName = new Map<string, number>();
      for (const r of agg as any[]) {
        const label = r.cat?.name ?? "Uncategorized";
        byName.set(label, (byName.get(label) ?? 0) + r.count);
      }
      const total = [...byName.values()].reduce((s, v) => s + v, 0);
      const items = [...byName.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([label, count]) => ({
          label,
          value: count,
          percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        }));
      return { items };
    },
  };
}

/** Resolution efficiency (resolved ÷ total %) per value at a hierarchy level. */
function makeEfficiencyByHierarchyLevel(
  widgetKey: string,
  levelField: string,
): QueryHandler {
  return {
    widgetKey,
    cacheTtlSeconds: 300,
    async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
      const Ticket = getTicketModel();
      const { start, end } = buildDateRange(params.dateRangeDays);
      const statuses = await loadProjectStatuses(ctx.tenantId);
      const done = closedCodes(statuses);
      const extra = ticketFilterOverrides(rf, ctx);
      const agg = await Ticket.aggregate([
        {
          $match: {
            ...scopedQuery,
            ...extra,
            createdAt: { $gte: start, $lte: end },
            [levelField]: { $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: `$${levelField}`,
            total: { $sum: 1 },
            resolved: {
              $sum: { $cond: [{ $in: ["$status", done] }, 1, 0] },
            },
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "cat",
          },
        },
        { $unwind: { path: "$cat", preserveNullAndEmptyArrays: true } },
      ]);
      // Merge distinct nodes that share the same name (see count factory above).
      const byName = new Map<string, { resolved: number; total: number }>();
      for (const r of agg as any[]) {
        const label = r.cat?.name ?? "Uncategorized";
        const cur = byName.get(label) ?? { resolved: 0, total: 0 };
        cur.resolved += r.resolved;
        cur.total += r.total;
        byName.set(label, cur);
      }
      const items = [...byName.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 30)
        .map(([label, { resolved, total }]) => {
          const rate =
            total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0;
          return {
            label,
            value: rate,
            percent: rate,
            unit: "%",
            resolved,
            total,
            subtitle: `${resolved}/${total} resolved`,
          };
        });
      return { items };
    },
  };
}

// Count breakdowns — level 1 is the existing ht_tickets_by_category.
const htTicketsBySubcategoryHandler = makeCountByHierarchyLevel(
  "ht_tickets_by_subcategory",
  "categoryHierarchy.level2",
);
const htTicketsByTopicHandler = makeCountByHierarchyLevel(
  "ht_tickets_by_topic",
  "categoryHierarchy.level3",
);
const htTicketsByCourseHandler = makeCountByHierarchyLevel(
  "ht_tickets_by_course",
  "categoryHierarchy.level4",
);
const htTicketsByDepartmentHandler = makeCountByHierarchyLevel(
  "ht_tickets_by_department",
  "categoryHierarchy.level5",
);

// Efficiency breakdowns by hierarchy level (level 1 groups by legacy `category`).
// Group by the true level-1 category (categoryHierarchy.level1), not the legacy
// `category` field which holds the deepest selected level for offline tickets.
const htEfficiencyByCategoryHandler = makeEfficiencyByHierarchyLevel(
  "ht_efficiency_by_category",
  "categoryHierarchy.level1",
);
const htEfficiencyBySubcategoryHandler = makeEfficiencyByHierarchyLevel(
  "ht_efficiency_by_subcategory",
  "categoryHierarchy.level2",
);
const htEfficiencyByTopicHandler = makeEfficiencyByHierarchyLevel(
  "ht_efficiency_by_topic",
  "categoryHierarchy.level3",
);
const htEfficiencyByCourseHandler = makeEfficiencyByHierarchyLevel(
  "ht_efficiency_by_course",
  "categoryHierarchy.level4",
);
const htEfficiencyByDepartmentHandler = makeEfficiencyByHierarchyLevel(
  "ht_efficiency_by_department",
  "categoryHierarchy.level5",
);

// ─── Efficiency by Offline Center ────────────────────────────────────────────
// metadata.centerId is stored as a STRING; convert to ObjectId in the lookup.
const htEfficiencyByCenterHandler: QueryHandler = {
  widgetKey: "ht_efficiency_by_center",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const done = closedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
          "metadata.centerId": { $nin: [null, "", "online"] },
        },
      },
      {
        $group: {
          _id: "$metadata.centerId",
          total: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $in: ["$status", done] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: "centers",
          let: { cid: "$_id" },
          as: "center",
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    "$_id",
                    {
                      $convert: {
                        input: "$$cid",
                        to: "objectId",
                        onError: null,
                        onNull: null,
                      },
                    },
                  ],
                },
              },
            },
            { $project: { centerName: 1 } },
          ],
        },
      },
      { $unwind: { path: "$center", preserveNullAndEmptyArrays: true } },
      { $sort: { total: -1 } },
      { $limit: 50 },
    ]);
    return {
      items: agg.map((r: any) => {
        const rate =
          r.total > 0 ? Math.round((r.resolved / r.total) * 1000) / 10 : 0;
        return {
          label: r.center?.centerName ?? "Unknown center",
          value: rate,
          percent: rate,
          unit: "%",
          resolved: r.resolved,
          total: r.total,
          subtitle: `${r.resolved}/${r.total} resolved`,
        };
      }),
    };
  },
};

// ─── Efficiency by User (assignee) ───────────────────────────────────────────
const htEfficiencyByUserHandler: QueryHandler = {
  widgetKey: "ht_efficiency_by_user",
  cacheTtlSeconds: 300,
  async execute(ctx, params, rf, scopedQuery): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const done = closedCodes(statuses);
    const extra = ticketFilterOverrides(rf, ctx);
    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          ...extra,
          createdAt: { $gte: start, $lte: end },
          assignedTo: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$assignedTo",
          total: { $sum: 1 },
          resolved: { $sum: { $cond: [{ $in: ["$status", done] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { firstName: 1, lastName: 1, fullName: 1 } }],
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      { $sort: { total: -1 } },
      { $limit: 50 },
    ]);
    return {
      items: agg.map((r: any) => {
        const rate =
          r.total > 0 ? Math.round((r.resolved / r.total) * 1000) / 10 : 0;
        const name =
          r.user?.fullName ||
          [r.user?.firstName, r.user?.lastName].filter(Boolean).join(" ") ||
          "Unassigned";
        return {
          label: name,
          value: rate,
          percent: rate,
          unit: "%",
          resolved: r.resolved,
          total: r.total,
          subtitle: `${r.resolved}/${r.total} resolved`,
        };
      }),
    };
  },
};

// ─── Register all Phase 3 handlers ───────────────────────────────────────────

export function registerPhase3Handlers(): void {
  registerWidgetHandler(htTotalTicketsHandler);
  registerWidgetHandler(htOpenTicketsHandler);
  registerWidgetHandler(htResolvedTicketsHandler);
  registerWidgetHandler(htClosedTicketsHandler);
  registerWidgetHandler(htPendingTicketsHandler);
  registerWidgetHandler(htEscalatedTicketsHandler);
  registerWidgetHandler(htSlaBreachedHandler);
  registerWidgetHandler(htResolvedWithinSlaHandler);
  registerWidgetHandler(htResolutionRateHandler);
  registerWidgetHandler(htSlaComplianceRateHandler);
  registerWidgetHandler(htAvgResolutionHoursHandler);
  registerWidgetHandler(htTicketsByCategoryHandler);
  registerWidgetHandler(htTicketsByStatusHandler);
  registerWidgetHandler(htTicketsByPriorityHandler);
  registerWidgetHandler(htDailyTrendHandler);
  registerWidgetHandler(htAgentWorkloadHandler);
  registerWidgetHandler(htTicketsHeatmapHandler);
  registerWidgetHandler(htFirstResponseTimeHandler);
  registerWidgetHandler(htReopenRateHandler);
  registerWidgetHandler(htTicketsByProjectHandler);

  // ── Category-hierarchy breakdowns (levels 1–5) ────────────────────────────
  registerWidgetHandler(htTicketsBySubcategoryHandler);
  registerWidgetHandler(htTicketsByTopicHandler);
  registerWidgetHandler(htTicketsByCourseHandler);
  registerWidgetHandler(htTicketsByDepartmentHandler);
  registerWidgetHandler(htEfficiencyByCategoryHandler);
  registerWidgetHandler(htEfficiencyBySubcategoryHandler);
  registerWidgetHandler(htEfficiencyByTopicHandler);
  registerWidgetHandler(htEfficiencyByCourseHandler);
  registerWidgetHandler(htEfficiencyByDepartmentHandler);
  registerWidgetHandler(htEfficiencyByCenterHandler);
  registerWidgetHandler(htEfficiencyByUserHandler);

  // ── Catalogue-key aliases ─────────────────────────────────────────────────
  // These allow dashboards to reference widgets by semantic catalogue keys
  // (e.g. "ticket_by_priority") while reusing the same proven ht_* execute logic.
  registerWidgetHandler({
    ...htTicketsByPriorityHandler,
    widgetKey: "ticket_by_priority",
  });
  registerWidgetHandler({
    ...htTicketsByCategoryHandler,
    widgetKey: "ticket_by_category",
  });
  registerWidgetHandler({
    ...htDailyTrendHandler,
    widgetKey: "ticket_volume_trend",
  });
  registerWidgetHandler({
    ...htEscalatedTicketsHandler,
    widgetKey: "ticket_escalation_count",
  });
  registerWidgetHandler({
    ...htFirstResponseTimeHandler,
    widgetKey: "ticket_first_response_time",
  });
  registerWidgetHandler({
    ...htAvgResolutionHoursHandler,
    widgetKey: "ticket_avg_resolution_time",
  });
  registerWidgetHandler({
    ...htResolutionRateHandler,
    widgetKey: "ticket_resolution_rate",
  });
}
