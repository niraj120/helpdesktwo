/**
 * Phase 1 Widget Query Handlers
 *
 * Handlers registered at startup for the 5 core widgets:
 *   1. ticket_open_count
 *   2. ticket_by_status
 *   3. ticket_sla_resolution_rate
 *   4. user_required_vs_onboarded
 *   5. centre_ideal_vs_active
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
import { Project } from "../../models/Project";
import { UserTarget } from "../../models/dashboard/UserTarget";

// Lazy-load Ticket and User models (already registered by server.ts)
const getTicketModel = () => mongoose.model("Ticket");
const getUserModel = () => mongoose.model("User");
const getCenterModel = () => mongoose.model("Center");
const getStatusModel = () => mongoose.model("Status");

/** Load the numeric status codes that are marked isClosed for a project */
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

interface ProjectStatusInfo {
  code: number;
  name: string;
  isClosed: boolean;
  color: string;
}

/** Load full status definitions (code + name + color) for a project */
async function loadProjectStatuses(
  tenantId: string,
): Promise<ProjectStatusInfo[]> {
  try {
    const docs = (await getStatusModel()
      .find({ projectId: new mongoose.Types.ObjectId(tenantId), isActive: true })
      .select("code name isClosed color")
      .sort({ displayOrder: 1 })
      .lean()) as Array<{
      code: number;
      name: string;
      isClosed: boolean;
      color: string;
    }>;
    return docs;
  } catch {
    return [];
  }
}

// ─── 1. ticket_open_count ─────────────────────────────────────────────────────

const ticketOpenCountHandler: QueryHandler = {
  widgetKey: "ticket_open_count",
  cacheTtlSeconds: 120,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start } = buildDateRange(params.dateRangeDays);
    const closedCodes = await loadClosedCodes(ctx.tenantId);

    const baseQuery: Record<string, any> = {
      ...scopedQuery,
      status: { $nin: closedCodes },
    };

    // Apply resolved filters (e.g. assignedTo = @ctx.userId)
    if (resolvedFilters.assignedTo) {
      baseQuery.assignedTo = new mongoose.Types.ObjectId(
        resolvedFilters.assignedTo,
      );
    }

    const [currentCount, previousCount] = await Promise.all([
      Ticket.countDocuments(baseQuery),
      Ticket.countDocuments({
        ...baseQuery,
        createdAt: { $lt: start },
        status: { $nin: closedCodes },
      }),
    ]);

    const delta = currentCount - previousCount;
    const deltaPercent =
      previousCount > 0
        ? Math.round((delta / previousCount) * 100 * 10) / 10
        : 0;

    return {
      value: currentCount,
      trend: {
        delta,
        deltaPercent,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      },
      trendDirection: "lower_is_better",
    };
  },
};

// ─── 2. ticket_by_status ─────────────────────────────────────────────────────

const ticketByStatusHandler: QueryHandler = {
  widgetKey: "ticket_by_status",
  cacheTtlSeconds: 120,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const statuses = await loadProjectStatuses(ctx.tenantId);
    const nameMap = new Map(statuses.map((s) => [s.code, s.name]));
    const colorMap = new Map(statuses.map((s) => [s.code, s.color ?? "#888"]));

    const agg = await Ticket.aggregate([
      {
        $match: {
          ...scopedQuery,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((sum: number, s: any) => sum + s.count, 0);
    const segments = agg.map((s: any) => ({
      code: s._id,
      name: nameMap.get(s._id) ?? String(s._id),
      color: colorMap.get(s._id) ?? "#888",
      count: s.count,
      percent: total > 0 ? Math.round((s.count / total) * 100 * 10) / 10 : 0,
    }));

    return { segments, total };
  },
};

// ─── 3. ticket_sla_resolution_rate ──────────────────────────────────────────

const ticketSlaResolutionRateHandler: QueryHandler = {
  widgetKey: "ticket_sla_resolution_rate",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const Ticket = getTicketModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - params.dateRangeDays);
    const closedCodes = await loadClosedCodes(ctx.tenantId);

    const calcRate = async (rangeStart: Date, rangeEnd: Date) => {
      const [total, withinSla] = await Promise.all([
        Ticket.countDocuments({
          ...scopedQuery,
          status: { $in: closedCodes },
          closedAt: { $gte: rangeStart, $lte: rangeEnd },
          sla_due_at: { $exists: true, $ne: null },
        }),
        Ticket.countDocuments({
          ...scopedQuery,
          status: { $in: closedCodes },
          closedAt: { $gte: rangeStart, $lte: rangeEnd },
          sla_due_at: { $exists: true, $ne: null },
          $expr: { $lte: ["$closedAt", "$sla_due_at"] },
        }),
      ]);
      if (total === 0) return null;
      return Math.round((withinSla / total) * 1000) / 10;
    };

    const [currentRate, previousRate] = await Promise.all([
      calcRate(start, end),
      calcRate(prevStart, start),
    ]);

    if (currentRate === null) {
      return { value: null, noData: true };
    }

    const delta =
      currentRate !== null && previousRate !== null
        ? Math.round((currentRate - previousRate) * 10) / 10
        : 0;

    return {
      value: currentRate,
      trend: {
        delta,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      },
      trendDirection: "higher_is_better",
    };
  },
};

// ─── 4. user_required_vs_onboarded ──────────────────────────────────────────

const userRequiredVsOnboardedHandler: QueryHandler = {
  widgetKey: "user_required_vs_onboarded",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const User = getUserModel();
    const targetMode = params.targetMode ?? "project_total";
    const projectId = ctx.tenantId;

    // Current active user count for this project
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
      // monthly mode
      const now = new Date();
      const targetMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const target = await UserTarget.findOne({
        tenantId: new mongoose.Types.ObjectId(projectId),
        targetMonth,
      }).lean();
      required = target?.targetCount ?? null;
    }

    if (required === null) {
      // Still return current so kpi_tile can show the count
      return { value: current, current, required: null, gap: null, percentFilled: null };
    }

    const gap = Math.max(0, required - current);
    const percentFilled =
      required > 0 ? Math.round((current / required) * 1000) / 10 : 0;

    return { value: current, current, required, gap, percentFilled };
  },
};

// ─── 5. centre_ideal_vs_active ───────────────────────────────────────────────

const centreIdealVsActiveHandler: QueryHandler = {
  widgetKey: "centre_ideal_vs_active",
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
    })
      .select("_id centerName idealCount")
      .lean();

    const centreIds = centres.map((c: any) => c._id);

    // Count active users per centre
    const userCounts = await User.aggregate([
      {
        $match: {
          centers: { $in: centreIds },
          isActive: true,
        },
      },
      { $unwind: "$centers" },
      {
        $match: { centers: { $in: centreIds } },
      },
      {
        $group: {
          _id: "$centers",
          activeCount: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map(
      userCounts.map((u: any) => [u._id.toString(), u.activeCount]),
    );

    const rows = centres.map((c: any) => {
      const active = countMap.get(c._id.toString()) ?? 0;
      const ideal = c.idealCount ?? null;
      const gap = ideal !== null ? Math.max(0, ideal - active) : null;
      return {
        centreId: c._id,
        centreName: c.centerName,
        ideal,
        active,
        gap,
      };
    });

    return { rows };
  },
};

// ─── Register all Phase 1 handlers ──────────────────────────────────────────

export function registerPhase1Handlers(): void {
  registerWidgetHandler(ticketOpenCountHandler);
  registerWidgetHandler(ticketByStatusHandler);
  registerWidgetHandler(ticketSlaResolutionRateHandler);
  registerWidgetHandler(userRequiredVsOnboardedHandler);
  registerWidgetHandler(centreIdealVsActiveHandler);
}
