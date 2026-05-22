/**
 * Phase 2 Widget Query Handlers
 *
 * Adds 13 more handlers beyond Phase 1:
 *   1.  ticket_closed_count
 *   2.  ticket_sla_compliance
 *   3.  ticket_trend_over_time
 *   4.  ticket_assignee_workload
 *   5.  my_assigned_tickets
 *   6.  user_active_count
 *   7.  user_inactive_count
 *   8.  user_onboarding_completion_rate
 *   9.  user_by_role
 *   10. centre_capacity_gap
 *   11. centre_capacity_utilisation
 *   12. attendance_today_rate
 *   13. attendance_mtd_rate
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
import { UserTarget } from "../../models/dashboard/UserTarget";
import { Project } from "../../models/Project";

const getTicketModel = () => mongoose.model("Ticket");
const getUserModel = () => mongoose.model("User");
const getCenterModel = () => mongoose.model("Center");
const getRoleModel = () => mongoose.model("Role");
const getAttendanceModel = () => mongoose.model("AttendanceRecord");
const getStatusModel = () => mongoose.model("Status");

/** Load numeric status codes where isClosed=true for a project (dynamic per project). */
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

/** Load numeric status codes where isClosed=false for a project (dynamic per project). */
async function loadActiveCodes(tenantId: string): Promise<number[]> {
  try {
    const docs = (await getStatusModel()
      .find({
        projectId: new mongoose.Types.ObjectId(tenantId),
        isActive: true,
        isClosed: false,
      })
      .select("code")
      .lean()) as Array<{ code: number }>;
    return docs.map((d) => d.code);
  } catch {
    return [1, 2, 3]; // fallback: open=1, in-progress=2, on-hold=3
  }
}

// ─── 1. ticket_closed_count ──────────────────────────────────────────────────

const ticketClosedCountHandler: QueryHandler = {
  widgetKey: "ticket_closed_count",
  cacheTtlSeconds: 120,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const closedCodes = await loadClosedCodes(ctx.tenantId);

    const baseQuery: Record<string, any> = {
      ...scopedQuery,
      status: { $in: closedCodes },
    };
    if (resolvedFilters.assignedTo) {
      baseQuery.assignedTo = new mongoose.Types.ObjectId(
        resolvedFilters.assignedTo,
      );
    }

    const [current, previous] = await Promise.all([
      Ticket.countDocuments({
        ...baseQuery,
        closedAt: { $gte: start, $lte: end },
      }),
      Ticket.countDocuments({
        ...baseQuery,
        closedAt: { $gte: prevStart, $lt: start },
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

// ─── 2. ticket_sla_compliance ────────────────────────────────────────────────

const ticketSlaComplianceHandler: QueryHandler = {
  widgetKey: "ticket_sla_compliance",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(
      start.getTime() - params.dateRangeDays * 86400000,
    );
    const closedCodes = await loadClosedCodes(ctx.tenantId);
    const closedSet = new Set(closedCodes);

    const calcCompliance = async (rangeStart: Date, rangeEnd: Date) => {
      const tickets = await Ticket.find({
        ...scopedQuery,
        createdAt: { $gte: rangeStart, $lte: rangeEnd },
        slaDueAt: { $exists: true, $ne: null },
      })
        .select("status closedAt slaDueAt")
        .lean();

      if (tickets.length === 0) return null;
      const compliant = tickets.filter((t: any) => {
        // status is a numeric code — compare against dynamic closed codes
        if (closedSet.has(t.status)) {
          return t.closedAt && t.slaDueAt && t.closedAt <= t.slaDueAt;
        }
        // Still open — check if still within SLA
        return t.slaDueAt && new Date() <= t.slaDueAt;
      }).length;

      return Math.round((compliant / tickets.length) * 1000) / 10;
    };

    const [current, previous] = await Promise.all([
      calcCompliance(start, end),
      calcCompliance(prevStart, start),
    ]);

    if (current === null) return { value: null, noData: true };

    const delta =
      current !== null && previous !== null
        ? Math.round((current - previous) * 10) / 10
        : 0;

    return {
      value: current,
      trend: {
        delta,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── 3. ticket_trend_over_time ───────────────────────────────────────────────

const ticketTrendOverTimeHandler: QueryHandler = {
  widgetKey: "ticket_trend_over_time",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const closedCodes = await loadClosedCodes(ctx.tenantId);

    const agg = await Ticket.aggregate([
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
          created: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const closedAgg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          status: { $in: closedCodes },
          closedAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$closedAt" },
          },
          closed: { $sum: 1 },
        },
      },
    ]);

    const closedByDay: Record<string, number> = {};
    closedAgg.forEach((d: any) => {
      closedByDay[d._id] = d.closed;
    });

    const series = agg.map((d: any) => ({
      date: d._id,
      created: d.created,
      closed: closedByDay[d._id] ?? 0,
    }));

    return { series };
  },
};

// ─── 4. ticket_assignee_workload ─────────────────────────────────────────────

const ticketAssigneeWorkloadHandler: QueryHandler = {
  widgetKey: "ticket_assignee_workload",
  cacheTtlSeconds: 120,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const activeCodes = await loadActiveCodes(ctx.tenantId);

    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          status: { $in: activeCodes },
          assignedTo: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$assignedTo",
          count: { $sum: 1 },
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
          agentId: "$_id",
          agentName: { $ifNull: ["$agent.name", "Unassigned"] },
          count: 1,
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    return {
      rows: agg.map((r: any) => ({
        agentId: r.agentId?.toString(),
        agentName: r.agentName,
        count: r.count,
      })),
    };
  },
};

// ─── 5. my_assigned_tickets ──────────────────────────────────────────────────

const myAssignedTicketsHandler: QueryHandler = {
  widgetKey: "my_assigned_tickets",
  cacheTtlSeconds: 60,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const activeCodes = await loadActiveCodes(ctx.tenantId);
    const topN = (params.filters as any)?.top_n ?? 25;

    const [tickets, total] = await Promise.all([
      Ticket.find({
        ...scopedQuery,
        assignedTo: new mongoose.Types.ObjectId(ctx.userId),
        status: { $in: activeCodes },
      })
        .select(
          "ticketNumber title status priority category createdAt updatedAt",
        )
        .sort({ updatedAt: -1 })
        .limit(topN)
        .lean(),
      Ticket.countDocuments({
        ...scopedQuery,
        assignedTo: new mongoose.Types.ObjectId(ctx.userId),
        status: { $in: activeCodes },
      }),
    ]);

    return { tickets, value: total, trendDirection: "lower_is_better" };
  },
};

// ─── 6. ticket_escalated_this_period ─────────────────────────────────────────
// Counts tickets that had a new escalation event within the date window.
// Uses $elemMatch on escalationHistory so only tickets actually escalated
// during the period are counted (not historically escalated tickets).

const ticketEscalatedThisPeriodHandler: QueryHandler = {
  widgetKey: "ticket_escalated_this_period",
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
      Ticket.countDocuments({
        ...scopedQuery,
        escalationHistory: {
          $elemMatch: { escalatedAt: { $gte: start, $lte: end } },
        },
      }),
      Ticket.countDocuments({
        ...scopedQuery,
        escalationHistory: {
          $elemMatch: { escalatedAt: { $gte: prevStart, $lt: start } },
        },
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

// ─── 7. user_active_count ────────────────────────────────────────────────────

const userActiveCountHandler: QueryHandler = {
  widgetKey: "user_active_count",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const excludeQuery =
      params.excludeRoleIds && params.excludeRoleIds.length > 0
        ? {
            role: {
              $nin: params.excludeRoleIds.map(
                (id) => new mongoose.Types.ObjectId(id),
              ),
            },
          }
        : {};
    const count = await User.countDocuments({
      projects: new mongoose.Types.ObjectId(ctx.tenantId),
      isActive: true,
      ...excludeQuery,
    });
    return { value: count, trendDirection: "higher_is_better" };
  },
};

// ─── 7. user_inactive_count ──────────────────────────────────────────────────

const userInactiveCountHandler: QueryHandler = {
  widgetKey: "user_inactive_count",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const excludeQuery =
      params.excludeRoleIds && params.excludeRoleIds.length > 0
        ? {
            role: {
              $nin: params.excludeRoleIds.map(
                (id) => new mongoose.Types.ObjectId(id),
              ),
            },
          }
        : {};
    const count = await User.countDocuments({
      projects: new mongoose.Types.ObjectId(ctx.tenantId),
      isActive: false,
      ...excludeQuery,
    });
    return { value: count, trendDirection: "lower_is_better" };
  },
};

// ─── 8. user_onboarding_completion_rate ──────────────────────────────────────

const userOnboardingCompletionRateHandler: QueryHandler = {
  widgetKey: "user_onboarding_completion_rate",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const projectId = ctx.tenantId;

    const targetMode = params.targetMode ?? "project_total";
    const excludeQuery =
      params.excludeRoleIds && params.excludeRoleIds.length > 0
        ? {
            role: {
              $nin: params.excludeRoleIds.map(
                (id) => new mongoose.Types.ObjectId(id),
              ),
            },
          }
        : {};
    const current = await User.countDocuments({
      projects: new mongoose.Types.ObjectId(projectId),
      isActive: true,
      ...excludeQuery,
    });

    let required: number | null = null;

    // 1. Explicit count from widget config overrides everything
    if (params.targetCount && params.targetCount > 0) {
      required = params.targetCount;
    } else if (targetMode === "project_total") {
      const project = await Project.findById(projectId)
        .select("userTarget")
        .lean();
      required = (project as any)?.userTarget?.required ?? null;
    } else {
      const now = new Date();
      const targetMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const target = await UserTarget.findOne({
        tenantId: new mongoose.Types.ObjectId(projectId),
        targetMonth,
      }).lean();
      required = target?.targetCount ?? null;
    }

    if (required === null || required === 0) {
      return { value: null, noData: true };
    }

    const rate = Math.round((current / required) * 1000) / 10;
    return { value: Math.min(rate, 100), trendDirection: "higher_is_better" };
  },
};

// ─── 9. user_by_role ─────────────────────────────────────────────────────────

const userByRoleHandler: QueryHandler = {
  widgetKey: "user_by_role",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();

    const excludeRoleFilter =
      params.excludeRoleIds && params.excludeRoleIds.length > 0
        ? {
            $nin: params.excludeRoleIds.map(
              (id) => new mongoose.Types.ObjectId(id),
            ),
          }
        : undefined;

    const agg = await User.aggregate([
      {
        $match: {
          projects: new mongoose.Types.ObjectId(ctx.tenantId),
          isActive: true,
          role: excludeRoleFilter
            ? { $exists: true, $ne: null, ...excludeRoleFilter }
            : { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "roles",
          localField: "_id",
          foreignField: "_id",
          as: "roleDoc",
        },
      },
      { $unwind: { path: "$roleDoc", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          roleId: "$_id",
          roleName: {
            $ifNull: ["$roleDoc.displayName", "$roleDoc.name", "Unknown"],
          },
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      segments: agg.map((r: any) => ({
        roleId: r.roleId?.toString(),
        roleName: r.roleName,
        count: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
      total,
    };
  },
};

// ─── 10. centre_capacity_gap ─────────────────────────────────────────────────

const centreCapacityGapHandler: QueryHandler = {
  widgetKey: "centre_capacity_gap",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Center = getCenterModel();
    const User = getUserModel();
    const projectId = ctx.tenantId;

    const centres = await Center.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      isActive: true,
      idealCount: { $exists: true, $ne: null },
    })
      .select("_id idealCount")
      .lean();

    // Fallback: use project-level userTarget.required vs active user count
    if (centres.length === 0) {
      let required: number | null =
        params.targetCount && params.targetCount > 0
          ? params.targetCount
          : null;

      if (required === null) {
        const project = await Project.findById(projectId)
          .select("userTarget")
          .lean();
        required = (project as any)?.userTarget?.required ?? null;
      }

      if (required === null)
        return {
          value: null,
          noData: true,
          noDataReason: "no_capacity_config",
        };

      const current = await User.countDocuments({
        projects: new mongoose.Types.ObjectId(projectId),
        isActive: true,
      });
      const gap = Math.max(0, required - current);
      return { value: gap, trendDirection: "lower_is_better" };
    }

    const centreIds = centres.map((c: any) => c._id);

    // Count active users assigned to these centres via either `centers` array or `centreId`
    const userCounts = await User.aggregate([
      {
        $match: {
          isActive: true,
          $or: [
            { centers: { $in: centreIds } },
            { centreId: { $in: centreIds } },
          ],
        },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $in: [{ $ifNull: ["$centreId", null] }, centreIds] },
              "$centreId",
              {
                $first: {
                  $filter: {
                    input: "$centers",
                    as: "c",
                    cond: { $in: ["$$c", centreIds] },
                  },
                },
              },
            ],
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap: Record<string, number> = {};
    userCounts.forEach((u: any) => {
      if (u._id) countMap[u._id.toString()] = u.count;
    });

    let totalIdeal = 0;
    let totalActive = 0;
    centres.forEach((c: any) => {
      totalIdeal += c.idealCount ?? 0;
      totalActive += countMap[c._id.toString()] ?? 0;
    });

    const gap = Math.max(0, totalIdeal - totalActive);
    return { value: gap, trendDirection: "lower_is_better" };
  },
};

// ─── 11. centre_capacity_utilisation ─────────────────────────────────────────

const centreCapacityUtilisationHandler: QueryHandler = {
  widgetKey: "centre_capacity_utilisation",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Center = getCenterModel();
    const User = getUserModel();
    const projectId = ctx.tenantId;

    const centres = await Center.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      isActive: true,
      idealCount: { $exists: true, $ne: null, $gt: 0 },
    })
      .select("_id idealCount")
      .lean();

    if (centres.length === 0) return { value: null, noData: true };

    const centreIds = centres.map((c: any) => c._id);
    const userCounts = await User.aggregate([
      { $match: { centers: { $in: centreIds }, isActive: true } },
      { $unwind: "$centers" },
      { $match: { centers: { $in: centreIds } } },
      { $group: { _id: "$centers", count: { $sum: 1 } } },
    ]);

    const countMap: Record<string, number> = {};
    userCounts.forEach((u: any) => {
      countMap[u._id.toString()] = u.count;
    });

    let totalIdeal = 0;
    let totalActive = 0;
    centres.forEach((c: any) => {
      totalIdeal += c.idealCount ?? 0;
      totalActive += countMap[c._id.toString()] ?? 0;
    });

    const utilisation =
      totalIdeal > 0 ? Math.round((totalActive / totalIdeal) * 1000) / 10 : 0;

    return { value: utilisation, trendDirection: "higher_is_better" };
  },
};

// ─── Attendance helper ────────────────────────────────────────────────────────
// Absent status codes used by the AFT biometric partner
const ABSENT_STATUSES = ["A", "AB", "ABSENT", "absent", "Absent"];

/** Returns today's UTC-midnight boundaries as {from, to} */
function todayUtcBounds(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const to = new Date(from.getTime() + 86400000);
  return { from, to };
}

/**
 * Resolve the most-recent date that has attendance records for these users.
 * Falls back up to `lookbackDays` days (default 60).
 */
async function resolveAttendanceDate(
  Attendance: mongoose.Model<any>,
  userIds: mongoose.Types.ObjectId[],
  lookbackDays = 60,
): Promise<{ from: Date; to: Date; asOfDate: string | null; found: boolean }> {
  const { from: todayFrom, to: todayTo } = todayUtcBounds();

  // Check today first
  const todayCount = await Attendance.countDocuments({
    userId: { $in: userIds },
    attendanceDate: { $gte: todayFrom, $lt: todayTo },
  });
  if (todayCount > 0) {
    return { from: todayFrom, to: todayTo, asOfDate: null, found: true };
  }

  // Scan backwards for the most-recent date with records
  for (let d = 1; d <= lookbackDays; d++) {
    const from = new Date(todayFrom.getTime() - d * 86400000);
    const to = new Date(from.getTime() + 86400000);
    const cnt = await Attendance.countDocuments({
      userId: { $in: userIds },
      attendanceDate: { $gte: from, $lt: to },
    });
    if (cnt > 0) {
      return {
        from,
        to,
        asOfDate: from.toISOString().split("T")[0],
        found: true,
      };
    }
  }

  return { from: todayFrom, to: todayTo, asOfDate: null, found: false };
}

// ─── 12. attendance_today_rate ───────────────────────────────────────────────

const attendanceTodayRateHandler: QueryHandler = {
  widgetKey: "attendance_today_rate",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Attendance = getAttendanceModel();
    const User = getUserModel();

    const projectOid = new mongoose.Types.ObjectId(ctx.tenantId);

    // Build role filter: exclude specified roles (same approach as user_by_role)
    const roleFilter =
      params.excludeRoleIds && params.excludeRoleIds.length > 0
        ? {
            $exists: true,
            $ne: null,
            $nin: params.excludeRoleIds.map(
              (id) => new mongoose.Types.ObjectId(id),
            ),
          }
        : { $exists: true, $ne: null };

    // Get active user IDs for this project filtered by included roles
    const activeUsers = await User.find({
      projects: projectOid,
      isActive: true,
      role: roleFilter,
    })
      .select("_id")
      .lean();

    const totalActive = activeUsers.length;
    if (totalActive === 0) return { value: null, noData: true };

    const userIds = activeUsers.map(
      (u: any) => u._id as mongoose.Types.ObjectId,
    );

    // Always find the most recent day with records (ignores date range — this is a "today" widget)
    const { from, to, asOfDate, found } = await resolveAttendanceDate(
      Attendance,
      userIds,
    );

    if (!found) return { value: null, noData: true };

    const present = await Attendance.countDocuments({
      userId: { $in: userIds },
      attendanceDate: { $gte: from, $lt: to },
      status: { $nin: ABSENT_STATUSES },
    });

    const rate = Math.round((present / totalActive) * 1000) / 10;
    return {
      value: rate,
      trendDirection: "higher_is_better",
      ...(asOfDate ? { subtitle: `As of ${asOfDate}` } : {}),
    };
  },
};

// ─── 13. attendance_mtd_rate ─────────────────────────────────────────────────

const attendanceMtdRateHandler: QueryHandler = {
  widgetKey: "attendance_mtd_rate",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Attendance = getAttendanceModel();
    const User = getUserModel();

    const projectOid = new mongoose.Types.ObjectId(ctx.tenantId);

    // Build role filter: exclude specified roles (same approach as user_by_role)
    const roleFilter =
      params.excludeRoleIds && params.excludeRoleIds.length > 0
        ? {
            $exists: true,
            $ne: null,
            $nin: params.excludeRoleIds.map(
              (id) => new mongoose.Types.ObjectId(id),
            ),
          }
        : { $exists: true, $ne: null };

    // Get active user IDs for this project filtered by included roles
    const activeUsers = await User.find({
      projects: projectOid,
      isActive: true,
      role: roleFilter,
    })
      .select("_id")
      .lean();

    const totalActive = activeUsers.length;
    if (totalActive === 0) return { value: null, noData: true };

    const userIds = activeUsers.map(
      (u: any) => u._id as mongoose.Types.ObjectId,
    );

    // Use the selected date range (last 7d / last 30d / all time)
    const { start: periodStart, end: periodEnd } = buildDateRange(
      params.dateRangeDays,
    );

    // Count distinct working days that actually have records in this period
    const distinctDates = await Attendance.distinct("attendanceDate", {
      userId: { $in: userIds },
      attendanceDate: { $gte: periodStart, $lte: periodEnd },
    });

    const workingDays = distinctDates.length;
    if (workingDays === 0) return { value: null, noData: true };

    // Total expected = users × working days with records
    const expected = totalActive * workingDays;

    const present = await Attendance.countDocuments({
      userId: { $in: userIds },
      attendanceDate: { $gte: periodStart, $lte: periodEnd },
      status: { $nin: ABSENT_STATUSES },
    });

    const rate = Math.round((present / expected) * 1000) / 10;
    return {
      value: Math.min(rate, 100),
      trendDirection: "higher_is_better",
    };
  },
};

// ─── Register all Phase 2 handlers ──────────────────────────────────────────

export function registerPhase2Handlers(): void {
  registerWidgetHandler(ticketClosedCountHandler);
  registerWidgetHandler(ticketSlaComplianceHandler);
  registerWidgetHandler(ticketTrendOverTimeHandler);
  registerWidgetHandler(ticketAssigneeWorkloadHandler);
  registerWidgetHandler(myAssignedTicketsHandler);
  registerWidgetHandler(ticketEscalatedThisPeriodHandler);
  registerWidgetHandler(userActiveCountHandler);
  registerWidgetHandler(userInactiveCountHandler);
  registerWidgetHandler(userOnboardingCompletionRateHandler);
  registerWidgetHandler(userByRoleHandler);
  registerWidgetHandler(centreCapacityGapHandler);
  registerWidgetHandler(centreCapacityUtilisationHandler);
  registerWidgetHandler(attendanceTodayRateHandler);
  registerWidgetHandler(attendanceMtdRateHandler);
}
