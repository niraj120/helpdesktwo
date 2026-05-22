/**
 * Knowledge Base Widget Query Handlers
 *
 * All 8 handlers scope to a project via:
 *   { projectId: new mongoose.Types.ObjectId(ctx.tenantId) }
 *
 * Note: KnowledgeBaseArticle uses `projectId` (top-level ObjectId field), NOT
 * the ticket-scoped `metadata.projectId`. Never use `...scopedQuery` here.
 *
 * Handlers:
 *   1.  kb_total_articles       — total article count (any status)
 *   2.  kb_published_count      — published articles
 *   3.  kb_draft_count          — draft articles
 *   4.  kb_archived_count       — archived articles
 *   5.  kb_top_viewed           — top N articles by viewCount
 *   6.  kb_helpfulness_rate     — helpfulCount / (helpfulCount + notHelpfulCount)
 *   7.  kb_recent_updates       — recently updated articles
 *   8.  kb_by_category          — article count grouped by category
 */

import mongoose from "mongoose";
import {
  QueryHandler,
  WidgetQueryContext,
  WidgetQueryParams,
  WidgetData,
  registerWidgetHandler,
} from "../../widgetQueryEngine";

const getKbModel = () => mongoose.model("KnowledgeBaseArticle");

// ─── 1. kb_total_articles ─────────────────────────────────────────────────────

const kbTotalArticlesHandler: QueryHandler = {
  widgetKey: "kb_total_articles",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const KB = getKbModel();
    const projectOId = new mongoose.Types.ObjectId(ctx.tenantId);

    const [total, published, draft, archived] = await Promise.all([
      KB.countDocuments({ projectId: projectOId, isActive: true }),
      KB.countDocuments({ projectId: projectOId, isActive: true, status: "published" }),
      KB.countDocuments({ projectId: projectOId, isActive: true, status: "draft" }),
      KB.countDocuments({ projectId: projectOId, isActive: true, status: "archived" }),
    ]);

    return { value: total, published, draft, archived };
  },
};

// ─── 2. kb_published_count ───────────────────────────────────────────────────

const kbPublishedCountHandler: QueryHandler = {
  widgetKey: "kb_published_count",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const count = await getKbModel().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      isActive: true,
      status: "published",
    });
    return { value: count, trendDirection: "higher_is_better" };
  },
};

// ─── 3. kb_draft_count ───────────────────────────────────────────────────────

const kbDraftCountHandler: QueryHandler = {
  widgetKey: "kb_draft_count",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const count = await getKbModel().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      isActive: true,
      status: "draft",
    });
    return { value: count };
  },
};

// ─── 4. kb_archived_count ────────────────────────────────────────────────────

const kbArchivedCountHandler: QueryHandler = {
  widgetKey: "kb_archived_count",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const count = await getKbModel().countDocuments({
      projectId: new mongoose.Types.ObjectId(ctx.tenantId),
      isActive: true,
      status: "archived",
    });
    return { value: count };
  },
};

// ─── 5. kb_top_viewed ────────────────────────────────────────────────────────

const kbTopViewedHandler: QueryHandler = {
  widgetKey: "kb_top_viewed",
  cacheTtlSeconds: 600,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const topN = (params.filters as any)?.top_n ?? 10;

    const articles = await getKbModel()
      .find({
        projectId: new mongoose.Types.ObjectId(ctx.tenantId),
        isActive: true,
        status: "published",
      })
      .select("title category viewCount helpfulCount notHelpfulCount publishedAt")
      .sort({ viewCount: -1 })
      .limit(topN)
      .lean();

    return { articles, total: articles.length };
  },
};

// ─── 6. kb_helpfulness_rate ──────────────────────────────────────────────────
// helpfulCount / (helpfulCount + notHelpfulCount) × 100

const kbHelpfulnessRateHandler: QueryHandler = {
  widgetKey: "kb_helpfulness_rate",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const agg = await getKbModel().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          isActive: true,
          status: "published",
        },
      },
      {
        $group: {
          _id: null,
          totalHelpful: { $sum: "$helpfulCount" },
          totalNotHelpful: { $sum: "$notHelpfulCount" },
          totalViews: { $sum: "$viewCount" },
        },
      },
    ]);

    if (!agg[0]) return { value: null, noData: true };

    const { totalHelpful, totalNotHelpful, totalViews } = agg[0];
    const totalVotes = totalHelpful + totalNotHelpful;

    if (totalVotes === 0) return { value: null, noData: true, totalViews };

    const rate = Math.round((totalHelpful / totalVotes) * 1000) / 10;
    return {
      value: rate,
      totalHelpful,
      totalNotHelpful,
      totalVotes,
      totalViews,
      trendDirection: "higher_is_better",
    };
  },
};

// ─── 7. kb_recent_updates ────────────────────────────────────────────────────

const kbRecentUpdatesHandler: QueryHandler = {
  widgetKey: "kb_recent_updates",
  cacheTtlSeconds: 300,

  async execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const topN = (params.filters as any)?.top_n ?? 10;

    const articles = await getKbModel()
      .find({
        projectId: new mongoose.Types.ObjectId(ctx.tenantId),
        isActive: true,
      })
      .select("title category status viewCount updatedAt publishedAt")
      .sort({ updatedAt: -1 })
      .limit(topN)
      .lean();

    return { articles, total: articles.length };
  },
};

// ─── 8. kb_by_category ───────────────────────────────────────────────────────

const kbByCategoryHandler: QueryHandler = {
  widgetKey: "kb_by_category",
  cacheTtlSeconds: 900,

  async execute(
    ctx: WidgetQueryContext,
    _params: WidgetQueryParams,
    _resolvedFilters: Record<string, any>,
    _scopedQuery: Record<string, any>,
  ): Promise<WidgetData> {
    const agg = await getKbModel().aggregate([
      {
        $match: {
          projectId: new mongoose.Types.ObjectId(ctx.tenantId),
          isActive: true,
          status: "published",
          category: { $exists: true, $nin: [null, ""] },
        },
      },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const total = agg.reduce((s: number, r: any) => s + r.count, 0);
    return {
      rows: agg.map((r: any) => ({
        category: r._id,
        count: r.count,
        percent: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
      })),
      total,
    };
  },
};

// ─── Register all KB handlers ─────────────────────────────────────────────────

export function registerKbHandlers(): void {
  registerWidgetHandler(kbTotalArticlesHandler);
  registerWidgetHandler(kbPublishedCountHandler);
  registerWidgetHandler(kbDraftCountHandler);
  registerWidgetHandler(kbArchivedCountHandler);
  registerWidgetHandler(kbTopViewedHandler);
  registerWidgetHandler(kbHelpfulnessRateHandler);
  registerWidgetHandler(kbRecentUpdatesHandler);
  registerWidgetHandler(kbByCategoryHandler);
}
