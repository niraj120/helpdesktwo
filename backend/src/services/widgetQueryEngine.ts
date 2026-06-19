/**
 * Widget Query Engine
 *
 * Core engine for resolving @ctx.* context variables, enforcing scope,
 * building cache keys, and dispatching to registered query handlers.
 */

import crypto from "crypto";
import mongoose from "mongoose";
import { cache } from "../utils/cache";

// ─── Context Variable Types ──────────────────────────────────────────────────

export interface WidgetQueryContext {
  tenantId: string; // project _id acting as tenant boundary
  userId: string;
  email: string;
  roleCode?: string;
  roleId?: string;
  centreId?: string; // primary centre
  centreIds?: string[]; // ALL centres assigned to the user (multi-centre roles)
  districtId?: string;
  projectIds?: string[];
  primaryProjectId?: string;
  name?: string;
}

export interface ScopeOverride {
  mode: "all" | "project" | "centre" | "user";
  projectId?: string;
  centreId?: string;
  userId?: string;
}

export interface WidgetQueryParams {
  dateRangeDays: number;
  /** Custom range bounds (used when dateRangeDays === -3). ISO date strings. */
  customStart?: string | null;
  customEnd?: string | null;
  /** Dashboard-level "All time" floor (used when dateRangeDays === 0). ISO date string. */
  allTimeStart?: string | null;
  filters: Record<string, any>;
  visualisationType: string;
  scopeOverride?: ScopeOverride;
  targetMode?: "project_total" | "monthly";
  targetCount?: number;
  /** Role ObjectId strings to exclude from all user-count widgets */
  excludeRoleIds?: string[];
}

export interface WidgetData {
  [key: string]: any;
}

export interface WidgetQueryResult {
  widgetKey: string;
  visualisationType: string;
  data: WidgetData;
  metadata: {
    dateRangeStart: string;
    dateRangeEnd: string;
    lastUpdated: string;
    scopeApplied: Record<string, any>;
  };
  cached: boolean;
  cacheExpiresAt?: string;
}

export interface QueryHandler {
  widgetKey: string;
  cacheTtlSeconds: number;
  execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
    resolvedFilters: Record<string, any>,
    scopedQuery: Record<string, any>,
  ): Promise<WidgetData>;
}

// ─── Handler Registry ────────────────────────────────────────────────────────

const handlerRegistry = new Map<string, QueryHandler>();

export function registerWidgetHandler(handler: QueryHandler): void {
  handlerRegistry.set(handler.widgetKey, handler);
}

export function getWidgetHandler(widgetKey: string): QueryHandler | undefined {
  return handlerRegistry.get(widgetKey);
}

// ─── Context Variable Resolution ─────────────────────────────────────────────

const CTX_VARIABLE_MAP: Record<string, keyof WidgetQueryContext> = {
  "@ctx.userId": "userId",
  "@ctx.email": "email",
  "@ctx.roleCode": "roleCode",
  "@ctx.roleId": "roleId",
  "@ctx.centreId": "centreId",
  "@ctx.districtId": "districtId",
  "@ctx.primaryProjectId": "primaryProjectId",
  "@ctx.name": "name",
  "@ctx.tenantId": "tenantId",
};

export function resolveContextVars(
  filters: Record<string, any>,
  ctx: WidgetQueryContext,
): Record<string, any> {
  const resolved: Record<string, any> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.startsWith("@ctx.")) {
      if (value === "@ctx.projectIds") {
        resolved[key] = ctx.projectIds ?? [];
      } else if (value === "@ctx.centreIds") {
        // Explicit full-centre-set variable (all centres of a multi-centre role).
        resolved[key] =
          ctx.centreIds && ctx.centreIds.length > 0
            ? ctx.centreIds
            : ctx.centreId
              ? [ctx.centreId]
              : [];
      } else {
        const ctxField = CTX_VARIABLE_MAP[value];
        resolved[key] = ctxField ? ctx[ctxField] : undefined;
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

// ─── Scope Enforcer ───────────────────────────────────────────────────────────

/**
 * Builds the base MongoDB query with mandatory tenant isolation + scope override.
 * tenantId is ALWAYS applied — it cannot be removed by any widget or user.
 */
export function buildScopedQuery(
  ctx: WidgetQueryContext,
  scopeOverride?: ScopeOverride,
): Record<string, any> {
  const query: Record<string, any> = {
    "metadata.projectId": ctx.tenantId, // default: tenant boundary
  };

  if (!scopeOverride || scopeOverride.mode === "all") {
    // Default: scope to tenantId (all data for this project/tenant)
    return query;
  }

  if (scopeOverride.mode === "project" && scopeOverride.projectId) {
    query["metadata.projectId"] = scopeOverride.projectId;
  } else if (scopeOverride.mode === "centre" && scopeOverride.centreId) {
    // Tickets store metadata.centerId (American spelling) as a string; match
    // both string and ObjectId forms.
    const cid = String(scopeOverride.centreId);
    query["metadata.centerId"] = mongoose.Types.ObjectId.isValid(cid)
      ? { $in: [cid, new mongoose.Types.ObjectId(cid)] }
      : cid;
    query["metadata.projectId"] = ctx.tenantId; // belt-and-braces
  } else if (scopeOverride.mode === "user" && scopeOverride.userId) {
    // user scope is handler-specific; pass tenantId guard only
    query["metadata.projectId"] = ctx.tenantId;
  }

  return query;
}

// ─── Cache Key Builder ────────────────────────────────────────────────────────

function buildCacheKey(
  widgetKey: string,
  ctx: WidgetQueryContext,
  params: WidgetQueryParams,
): string {
  const paramHash = crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        dateRangeDays: params.dateRangeDays,
        customStart: params.customStart ?? null,
        customEnd: params.customEnd ?? null,
        allTimeStart: params.allTimeStart ?? null,
        filters: params.filters,
        visualisationType: params.visualisationType,
        scopeOverride: params.scopeOverride,
        targetMode: params.targetMode,
        targetCount: params.targetCount,
        excludeRoleIds: params.excludeRoleIds?.slice().sort(),
      }),
    )
    .digest("hex")
    .substring(0, 12);

  // Use userId for user-scoped widgets, roleCode+centreId for shared views
  const userPart = `u:${ctx.userId}`;
  return `widget:${widgetKey}:tenant:${ctx.tenantId}:${userPart}:params:${paramHash}`;
}

// ─── Date Range Helper ────────────────────────────────────────────────────────

/**
 * Resolve a widget's date window.
 *
 * Accepts either the legacy `dateRangeDays` number or the full query params
 * (so custom ranges and a configurable all-time floor can flow through):
 *   0   → All time   (floor = params.allTimeStart, else 2020-01-01)
 *   -1  → Today      (local midnight → now)
 *   -2  → Yesterday  (yesterday 00:00 → yesterday 23:59:59)
 *   -3  → Custom     (params.customStart → params.customEnd, inclusive)
 *   N>0 → Last N days
 */
export function buildDateRange(
  input:
    | number
    | {
        dateRangeDays: number;
        customStart?: string | Date | null;
        customEnd?: string | Date | null;
        allTimeStart?: string | Date | null;
      },
): {
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
} {
  const p = typeof input === "number" ? { dateRangeDays: input } : input;
  const dateRangeDays = p.dateRangeDays;

  let start: Date;
  let end = new Date();

  if (dateRangeDays === -3 && (p as any).customStart) {
    // Custom range — inclusive of the whole end day.
    start = new Date((p as any).customStart);
    start.setHours(0, 0, 0, 0);
    end = (p as any).customEnd ? new Date((p as any).customEnd) : new Date();
    end.setHours(23, 59, 59, 999);
  } else if (dateRangeDays === -2) {
    // Yesterday
    start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (dateRangeDays === -1) {
    // Today
    start = new Date();
    start.setHours(0, 0, 0, 0);
  } else if (dateRangeDays === 0) {
    // All time — use the dashboard's configured floor when provided.
    start = (p as any).allTimeStart
      ? new Date((p as any).allTimeStart)
      : new Date("2020-01-01T00:00:00.000Z");
  } else {
    // Last N days
    start = new Date();
    start.setDate(start.getDate() - dateRangeDays);
  }

  return {
    start,
    end,
    startStr: start.toISOString().split("T")[0],
    endStr: end.toISOString().split("T")[0],
  };
}

// ─── Main Dispatch ────────────────────────────────────────────────────────────

export async function executeWidgetQuery(
  widgetKey: string,
  ctx: WidgetQueryContext,
  params: WidgetQueryParams,
): Promise<WidgetQueryResult> {
  const handler = handlerRegistry.get(widgetKey);
  if (!handler) {
    throw new Error(`No query handler registered for widget: ${widgetKey}`);
  }

  const cacheKey = buildCacheKey(widgetKey, ctx, params);
  const cached = cache.get<WidgetData>(cacheKey);

  const dateRange = buildDateRange(params);
  const resolvedFilters = resolveContextVars(params.filters ?? {}, ctx);
  const scopedQuery = buildScopedQuery(ctx, params.scopeOverride);

  if (cached !== null) {
    return {
      widgetKey,
      visualisationType: params.visualisationType,
      data: cached,
      metadata: {
        dateRangeStart: dateRange.startStr,
        dateRangeEnd: dateRange.endStr,
        lastUpdated: new Date().toISOString(),
        scopeApplied: { tenantId: ctx.tenantId, resolvedFilters: "[RESOLVED]" },
      },
      cached: true,
    };
  }

  const data = await handler.execute(ctx, params, resolvedFilters, scopedQuery);
  cache.set(cacheKey, data, handler.cacheTtlSeconds);

  return {
    widgetKey,
    visualisationType: params.visualisationType,
    data,
    metadata: {
      dateRangeStart: dateRange.startStr,
      dateRangeEnd: dateRange.endStr,
      lastUpdated: new Date().toISOString(),
      scopeApplied: { tenantId: ctx.tenantId, resolvedFilters: "[RESOLVED]" },
    },
    cached: false,
    cacheExpiresAt: new Date(
      Date.now() + handler.cacheTtlSeconds * 1000,
    ).toISOString(),
  };
}

// ─── Cache Invalidation ───────────────────────────────────────────────────────

/**
 * Invalidate all cached widget data for a given tenant.
 * Called by controllers after mutations (ticket create, user create, etc.).
 */
export function invalidateWidgetCache(
  tenantId: string,
  widgetKeys?: string[],
): void {
  if (widgetKeys && widgetKeys.length > 0) {
    for (const key of widgetKeys) {
      cache.deleteByPrefix(`widget:${key}:tenant:${tenantId}`);
    }
  } else {
    cache.deleteByPrefix(`widget:`);
  }
}
