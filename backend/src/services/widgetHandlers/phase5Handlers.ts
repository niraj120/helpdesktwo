/**
 * Phase 5 Widget Query Handlers
 *
 * New handlers for supplementary ticket views and full user analytics:
 *
 * Ticket (supplementary):
 *   1.  ticket_inprogress_count      — pending-code tickets (isClosed=false, non-default)
 *   2.  ticket_resolved_count        — closed-code tickets closed in range
 *   3.  ticket_onhold_count          — alias for pending-code tickets
 *   4.  ticket_by_submission_source  — breakdown by submissionSource field
 *   5.  ticket_recent_list           — last N tickets (any status)
 *   6.  ticket_comment_count         — total comments across open tickets
 *
 * User analytics:
 *   7.  user_total_count             — all project users (active + inactive)
 *   8.  user_new_registrations       — users created since start-of-month
 *   9.  user_by_registration_source  — breakdown by registrationSource field
 *   10. user_never_logged_in         — users with no lastLogin recorded
 *   11. user_by_department           — breakdown by department field
 *   12. user_eula_acceptance_rate    — % of active users who accepted EULA
 *   13. user_password_setup_pending  — users with requirePasswordSetup = true
 *
 * IMPORTANT — Status scope:
 *   "pendingCodes" = statuses where isClosed=false AND isDefault=false.
 *   This covers both "in-progress" and "on-hold" statuses because the Status
 *   model has no dedicated statusType discriminator field. If per-status
 *   distinction is required in future, add a `statusType` field to Status.
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
const getUserModel = () => mongoose.model("User");
const getStatusModel = () => mongoose.model("Status");

// ─── Status helpers ───────────────────────────────────────────────────────────

interface StatusDoc {
  code: number;
  isClosed: boolean;
  isDefault: boolean;
}

async function loadStatuses(tenantId: string): Promise<StatusDoc[]> {
  try {
    return (await getStatusModel()
      .find({ projectId: new mongoose.Types.ObjectId(tenantId), isActive: true })
      .select("code isClosed isDefault")
      .lean()) as StatusDoc[];
  } catch {
    return [];
  }
}

/** isClosed=false codes — all active statuses */
function activeCodes(statuses: StatusDoc[]): number[] {
  return statuses.filter((s) => !s.isClosed).map((s) => s.code);
}

/** isClosed=true codes — resolved/closed statuses */
function closedCodes(statuses: StatusDoc[]): number[] {
  return statuses.filter((s) => s.isClosed).map((s) => s.code);
}

/**
 * pendingCodes = isClosed=false AND isDefault=false
 * Represents tickets that have been touched by an agent (not in initial "open"
 * state) but have not yet been resolved. Covers "in-progress" + "on-hold".
 */
function pendingCodes(statuses: StatusDoc[]): number[] {
  return statuses.filter((s) => !s.isClosed && !s.isDefault).map((s) => s.code);
}

// ─── kpiTrend helper ─────────────────────────────────────────────────────────

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

// ─── 1. ticket_inprogress_count ───────────────────────────────────────────────
// Tickets currently in "pending" statuses (agent has touched them but not closed).
// NOTE: Because Status has no statusType field, this returns isClosed=false +
// isDefault=false codes, which covers both "in-progress" and "on-hold" statuses.

const ticketInprogressCountHandler: QueryHandler = {
  widgetKey: "ticket_inprogress_count",
  cacheTtlSeconds: 60,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(start.getTime() - params.dateRangeDays * 86400000);
    const statuses = await loadStatuses(ctx.tenantId);
    const pCodes = pendingCodes(statuses);

    if (pCodes.length === 0) return { value: 0, trendDirection: "lower_is_better" };

    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        status: { $in: pCodes },
        createdAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        status: { $in: pCodes },
        createdAt: { $gte: prevStart, $lt: start },
      }),
    ]);

    return kpiTrend(current, previous, false);
  },
};

// ─── 2. ticket_resolved_count ─────────────────────────────────────────────────
// Tickets that were closed (resolved) within the date range.

const ticketResolvedCountHandler: QueryHandler = {
  widgetKey: "ticket_resolved_count",
  cacheTtlSeconds: 120,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(start.getTime() - params.dateRangeDays * 86400000);
    const statuses = await loadStatuses(ctx.tenantId);
    const dCodes = closedCodes(statuses);

    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...scopedQuery,
        status: { $in: dCodes },
        closedAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        status: { $in: dCodes },
        closedAt: { $gte: prevStart, $lt: start },
      }),
    ]);

    return kpiTrend(current, previous, true);
  },
};

// ─── 3. ticket_onhold_count ──────────────────────────────────────────────────
// See NOTE on ticket_inprogress_count — both use pendingCodes.
// This is an intentional alias kept as a distinct widget key for dashboard
// naming clarity; the data is the same until a statusType field is added.

const ticketOnholdCountHandler: QueryHandler = {
  widgetKey: "ticket_onhold_count",
  cacheTtlSeconds: 60,
  execute: ticketInprogressCountHandler.execute,
};

// ─── 4. ticket_by_submission_source ──────────────────────────────────────────

const ticketBySubmissionSourceHandler: QueryHandler = {
  widgetKey: "ticket_by_submission_source",
  cacheTtlSeconds: 300,

  async execute(
    _ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);

    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          createdAt: { $gte: start, $lte: end },
          submissionSource: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: "$submissionSource", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      segments: agg.map((r: any) => ({
        source: r._id,
        count: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
      total,
    };
  },
};

// ─── 5. ticket_recent_list ────────────────────────────────────────────────────

const ticketRecentListHandler: QueryHandler = {
  widgetKey: "ticket_recent_list",
  cacheTtlSeconds: 60,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const topN = (params.filters as any)?.top_n ?? 20;
    const statuses = await loadStatuses(ctx.tenantId);
    const aCodes = activeCodes(statuses);

    const tickets = await Ticket.find({
      ...scopedQuery,
      status: { $in: aCodes },
      createdAt: { $gte: start, $lte: end },
    })
      .select("ticketNumber title status priority category assignedTo createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(topN)
      .lean();

    return { tickets, total: tickets.length };
  },
};

// ─── 6. ticket_comment_count ──────────────────────────────────────────────────
// Total number of comments across all open tickets in the date range.

const ticketCommentCountHandler: QueryHandler = {
  widgetKey: "ticket_comment_count",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadStatuses(ctx.tenantId);
    const aCodes = activeCodes(statuses);

    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          status: { $in: aCodes },
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $project: {
          commentCount: {
            $cond: {
              if: { $isArray: "$comments" },
              then: { $size: "$comments" },
              else: 0,
            },
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$commentCount" } } },
    ]);

    return { value: agg[0]?.total ?? 0 };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// User Handlers
// Scope: { projects: ctx.tenantId } (User.projects is an ObjectId[])
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 7. user_total_count ─────────────────────────────────────────────────────

const userTotalCountHandler: QueryHandler = {
  widgetKey: "user_total_count",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [active, inactive] = await Promise.all([
      User.countDocuments({ projects: projectOId, isActive: true }),
      User.countDocuments({ projects: projectOId, isActive: false }),
    ]);

    return { value: active + inactive, active, inactive };
  },
};

// ─── 8. user_new_registrations ────────────────────────────────────────────────

const userNewRegistrationsHandler: QueryHandler = {
  widgetKey: "user_new_registrations",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(start.getTime() - params.dateRangeDays * 86400000);
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [current, previous] = await Promise.all([
      User.countDocuments({
        projects: projectOId,
        createdAt: { $gte: start, $lte: end },
      }),
      User.countDocuments({
        projects: projectOId,
        createdAt: { $gte: prevStart, $lt: start },
      }),
    ]);

    return kpiTrend(current, previous, true);
  },
};

// ─── 9. user_by_registration_source ──────────────────────────────────────────

const userByRegistrationSourceHandler: QueryHandler = {
  widgetKey: "user_by_registration_source",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();

    const agg = await User.aggregate([
      {
        $match: {
          projects: new mongoose.Types.ObjectId(ctx.tenantId),
          isActive: true,
          registrationSource: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: "$registrationSource", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      segments: agg.map((r: any) => ({
        source: r._id,
        count: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
      total,
    };
  },
};

// ─── 10. user_never_logged_in ─────────────────────────────────────────────────

const userNeverLoggedInHandler: QueryHandler = {
  widgetKey: "user_never_logged_in",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [total, neverLoggedIn] = await Promise.all([
      User.countDocuments({ projects: projectOId, isActive: true }),
      User.countDocuments({
        projects: projectOId,
        isActive: true,
        $or: [{ lastLogin: { $exists: false } }, { lastLogin: null }],
      }),
    ]);

    const percent =
      total > 0 ? Math.round((neverLoggedIn / total) * 1000) / 10 : 0;

    return { value: neverLoggedIn, total, percent };
  },
};

// ─── 11. user_by_department ───────────────────────────────────────────────────

const userByDepartmentHandler: QueryHandler = {
  widgetKey: "user_by_department",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();

    const agg = await User.aggregate([
      {
        $match: {
          projects: new mongoose.Types.ObjectId(ctx.tenantId),
          isActive: true,
          department: { $exists: true, $nin: [null, ""] },
        },
      },
      { $group: { _id: "$department", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      rows: agg.map((r: any) => ({
        department: r._id,
        count: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
      total,
    };
  },
};

// ─── 12. user_eula_acceptance_rate ────────────────────────────────────────────

const userEulaAcceptanceRateHandler: QueryHandler = {
  widgetKey: "user_eula_acceptance_rate",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [total, accepted] = await Promise.all([
      User.countDocuments({ projects: projectOId, isActive: true }),
      User.countDocuments({
        projects: projectOId,
        isActive: true,
        eulaAccepted: true,
      }),
    ]);

    if (total === 0) return { value: null, noData: true };

    const rate = Math.round((accepted / total) * 1000) / 10;
    return { value: rate, accepted, total, trendDirection: "higher_is_better" };
  },
};

// ─── 13. user_password_setup_pending ─────────────────────────────────────────

const userPasswordSetupPendingHandler: QueryHandler = {
  widgetKey: "user_password_setup_pending",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [total, pending] = await Promise.all([
      User.countDocuments({ projects: projectOId, isActive: true }),
      User.countDocuments({
        projects: projectOId,
        isActive: true,
        requirePasswordSetup: true,
      }),
    ]);

    const percent =
      total > 0 ? Math.round((pending / total) * 1000) / 10 : 0;

    return { value: pending, total, percent, trendDirection: "lower_is_better" };
  },
};

// ─── Register all Phase 5 handlers ───────────────────────────────────────────

export function registerPhase5Handlers(): void {
  // Supplementary ticket handlers
  registerWidgetHandler(ticketInprogressCountHandler);
  registerWidgetHandler(ticketResolvedCountHandler);
  registerWidgetHandler(ticketOnholdCountHandler);
  registerWidgetHandler(ticketBySubmissionSourceHandler);
  registerWidgetHandler(ticketRecentListHandler);
  registerWidgetHandler(ticketCommentCountHandler);

  // User analytics handlers
  registerWidgetHandler(userTotalCountHandler);
  registerWidgetHandler(userNewRegistrationsHandler);
  registerWidgetHandler(userByRegistrationSourceHandler);
  registerWidgetHandler(userNeverLoggedInHandler);
  registerWidgetHandler(userByDepartmentHandler);
  registerWidgetHandler(userEulaAcceptanceRateHandler);
  registerWidgetHandler(userPasswordSetupPendingHandler);
}
