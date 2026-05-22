/**
 * Activity, Access, and Email Log Widget Query Handlers
 *
 * Scope rules (IMPORTANT — these differ from Ticket handlers):
 *   ActivityLog  → `project: ObjectId`   field — scope: { project: new mongoose.Types.ObjectId(ctx.tenantId) }
 *   AccessLog    → `project: ObjectId`   field — scope: { project: new mongoose.Types.ObjectId(ctx.tenantId) }
 *   EmailLog     → `projectId: ObjectId` field — scope: { projectId: new mongoose.Types.ObjectId(ctx.tenantId) }
 *
 * Do NOT use `...scopedQuery` in these handlers — that spreads the Ticket-only
 * `"metadata.projectId"` field which does not exist on these models.
 *
 * Handlers:
 *   1.  activity_feed          — latest agent activity entries (ActivityLog)
 *   2.  login_failure_count    — failed login attempts in window (AccessLog)
 *   3.  active_session_count   — unique successful logins today (AccessLog)
 *   4.  email_sent_count       — sent email count in window (EmailLog)
 *   5.  email_failure_rate     — failed / total emails × 100 (EmailLog)
 *   6.  email_by_type          — email volume by type enum (EmailLog)
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

const getActivityLogModel = () => mongoose.model("ActivityLog");
const getAccessLogModel = () => mongoose.model("AccessLog");
const getEmailLogModel = () => mongoose.model("EmailLog");

// ─── 1. activity_feed ─────────────────────────────────────────────────────────
// Returns the most recent agent activity entries for the dashboard feed.

const activityFeedHandler: QueryHandler = {
  widgetKey: "activity_feed",
  cacheTtlSeconds: 60,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const ActivityLog = getActivityLogModel();
    const { start } = buildDateRange(params.dateRangeDays);
    const topN = (params.filters as any)?.top_n ?? 20;

    const events = await ActivityLog.find({
      project: new mongoose.Types.ObjectId(ctx.tenantId),
      timestamp: { $gte: start },
    })
      .select("action entity entityName userName role timestamp userEmail")
      .sort({ timestamp: -1 })
      .limit(topN)
      .lean();

    return { events, total: events.length };
  },
};

// ─── 2. login_failure_count ───────────────────────────────────────────────────

const loginFailureCountHandler: QueryHandler = {
  widgetKey: "login_failure_count",
  cacheTtlSeconds: 120,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const AccessLog = getAccessLogModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(start.getTime() - params.dateRangeDays * 86400000);
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [current, previous] = await Promise.all([
      AccessLog.countDocuments({
        project: projectOId,
        action: "login_failed",
        timestamp: { $gte: start, $lte: end },
      }),
      AccessLog.countDocuments({
        project: projectOId,
        action: "login_failed",
        timestamp: { $gte: prevStart, $lt: start },
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

// ─── 3. active_session_count ──────────────────────────────────────────────────
// Counts distinct users who had a successful login today.

const activeSessionCountHandler: QueryHandler = {
  widgetKey: "active_session_count",
  cacheTtlSeconds: 120,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const AccessLog = getAccessLogModel();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const distinctUsers = await AccessLog.distinct("userId", {
      project: new mongoose.Types.ObjectId(ctx.tenantId),
      action: "login",
      success: true,
      timestamp: { $gte: today, $lt: tomorrow },
    });

    return { value: distinctUsers.length };
  },
};

// ─── 4. email_sent_count ──────────────────────────────────────────────────────

const emailSentCountHandler: QueryHandler = {
  widgetKey: "email_sent_count",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const EmailLog = getEmailLogModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const prevStart = new Date(start.getTime() - params.dateRangeDays * 86400000);
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [current, previous] = await Promise.all([
      EmailLog.countDocuments({
        projectId: projectOId,
        status: "sent",
        sentAt: { $gte: start, $lte: end },
      }),
      EmailLog.countDocuments({
        projectId: projectOId,
        status: "sent",
        sentAt: { $gte: prevStart, $lt: start },
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

// ─── 5. email_failure_rate ────────────────────────────────────────────────────
// failed / (sent + failed) × 100

const emailFailureRateHandler: QueryHandler = {
  widgetKey: "email_failure_rate",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const EmailLog = getEmailLogModel();
    const { start, end } = buildDateRange(params.dateRangeDays);
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [sent, failed] = await Promise.all([
      EmailLog.countDocuments({
        projectId: projectOId,
        status: "sent",
        sentAt: { $gte: start, $lte: end },
      }),
      EmailLog.countDocuments({
        projectId: projectOId,
        status: "failed",
        sentAt: { $gte: start, $lte: end },
      }),
    ]);

    const total = sent + failed;
    if (total === 0) return { value: null, noData: true };

    const rate = Math.round((failed / total) * 1000) / 10;
    return { value: rate, sent, failed, total, trendDirection: "lower_is_better" };
  },
};

// ─── 6. email_by_type ─────────────────────────────────────────────────────────

const emailByTypeHandler: QueryHandler = {
  widgetKey: "email_by_type",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const EmailLog = getEmailLogModel();
    const { start, end } = buildDateRange(params.dateRangeDays);

    const agg = await EmailLog.aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          sentAt: { $gte: start, $lte: end },
          type: { $exists: true, $ne: null },
        },
      },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      segments: agg.map((r: any) => ({
        type: r._id,
        count: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
      total,
    };
  },
};

// ─── Register all Activity/Email handlers ─────────────────────────────────────

export function registerActivityHandlers(): void {
  registerWidgetHandler(activityFeedHandler);
  registerWidgetHandler(loginFailureCountHandler);
  registerWidgetHandler(activeSessionCountHandler);
  registerWidgetHandler(emailSentCountHandler);
  registerWidgetHandler(emailFailureRateHandler);
  registerWidgetHandler(emailByTypeHandler);
}
