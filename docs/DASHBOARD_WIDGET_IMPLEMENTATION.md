# Dashboard Widget Implementation Reference

> **Generated**: Implementation covers Sprints 9–11 backlog  
> **Status**: All handlers implemented and verified (zero TypeScript errors)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Critical Corrections from Backlog Document](#critical-corrections)
3. [Scope Field Guide](#scope-field-guide)
4. [Status Code System](#status-code-system)
5. [Handler Files Reference](#handler-files-reference)
6. [Complete Widget Catalogue](#complete-widget-catalogue)
7. [Response Shape Reference](#response-shape-reference)
8. [Adding New Handlers](#adding-new-handlers)

---

## Architecture Overview

```
Browser → GET /api/v1/widgets/:widgetKey?projectId=...
              ↓
         widgetDataRoutes.ts (auth + extract context)
              ↓
         widgetQueryEngine.ts — executeWidgetQuery(ctx, widgetKey, params)
              ↓
         handlerRegistry.get(widgetKey) → QueryHandler.execute(ctx, params, resolvedFilters, scopedQuery)
              ↓
         { data: WidgetData, metadata: { dateRangeStart, dateRangeEnd, lastUpdated, scopeApplied }, cached }
```

### Key Components

| File | Role |
|---|---|
| `backend/src/services/widgetQueryEngine.ts` | Handler registry `Map`, context resolution, `buildScopedQuery()`, cache, response envelope |
| `backend/src/utils/seedWidgetDefinitions.ts` | Idempotent MongoDB upsert of `WidgetDefinition` documents |
| `backend/src/server.ts` | Calls all `register*Handlers()` functions at startup |

### Handler Contract

```typescript
interface QueryHandler {
  widgetKey: string;
  cacheTtlSeconds: number;
  execute(
    ctx: WidgetQueryContext,       // tenant, user, role, project context
    params: WidgetQueryParams,     // dateRangeDays, filters, targetMode
    resolvedFilters: Record<string, any>,  // pre-resolved filter overrides
    scopedQuery: Record<string, any>,      // { "metadata.projectId": ctx.tenantId }
  ): Promise<WidgetData>;          // bare object — engine adds envelope
}
```

**Critical**: Handlers return **bare `WidgetData`**. The engine wraps it with `{ data, metadata, cached }`. Never add the wrapper inside a handler — double-wrapping causes frontend crashes.

---

## Critical Corrections

The following items in the Sprint 9–11 backlog document contained architectural errors that would have caused runtime failures. All have been resolved with correct implementations.

### ❌ TASK-001 — `ticket_by_status` used string status comparisons
**Error**: Assumed `Ticket.status` is a string enum.  
**Reality**: `Ticket.status` is a **Number** (1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed).  
**Fix**: `ticket_by_status` now calls `loadProjectStatuses()` to build a `code→name` map, returning `{ segments: [{code, name, color, count, percent}], total }`.

### ❌ TASK-003 — `ticket_sla_resolution_rate` used `ticketLevelSLA.*` fields
**Error**: Used `ticketLevelSLA.dueAt` and `ticketLevelSLA.breachedAt` (fields from a legacy embedded object that was removed).  
**Reality**: SLA due date is the top-level field `sla_due_at: Date`.  
**Fix**: Changed to `sla_due_at: { $exists: true, $ne: null }` + `$expr: { $lte: ["$closedAt", "$sla_due_at"] }`.

### ❌ TASK-004 — `feedback_response_rate` scope described as wrong
**Error**: Doc claimed `"metadata.projectId"` was incorrect for feedback handler.  
**Reality**: This handler correctly uses `"metadata.projectId"` via `...scopedQuery` because it queries the **Ticket** collection, not FeedbackScore.  
**Fix**: Do NOT touch this handler. It is correct.

### ❌ TASK-005 — Referenced non-existent `widgetDataService.ts` with `QUERY_REGISTRY`
**Error**: Backlog described adding aliases to a static `QUERY_REGISTRY` object in `widgetDataService.ts`.  
**Reality**: No such file or registry exists. The system uses a `Map<string, QueryHandler>` in `widgetQueryEngine.ts` populated by `registerWidgetHandler()`.  
**Fix**: Aliases are registered by calling `registerWidgetHandler({ ...originalHandler, widgetKey: "alias_key" })` inside `registerPhase3Handlers()`.

### ❌ TASK-006 — `ht_daily_trend` described as returning wrong shape
**Error**: Doc proposed "fixing" `ht_daily_trend` to return `{ series: [...] }`.  
**Reality**: It **already** returns `{ series: [{name:"Created", data:[{date,value}]}, {name:"Closed", data:[...]}] }` — the exact dual-series shape used by the frontend chart.  
**Fix**: Do NOT touch `ht_daily_trend`. Touching it would regress the chart.

### ❌ TASK-009/010/011 — `ticket_inprogress_count` used `status: 'in-progress'`
**Error**: Hardcoded string `'in-progress'` against a numeric field.  
**Reality**: `Ticket.status` is numeric; status names are project-specific, stored in `Status` collection.  
**Fix**: `ticket_inprogress_count` uses `pendingCodes()` (isClosed=false, isDefault=false) which are resolved dynamically per project.

### ❌ TASK-041 — Proposed wrapping handlers in envelope
**Error**: Suggested handlers should return `{ data: ..., metadata: ... }`.  
**Reality**: `executeWidgetQuery()` in the engine already wraps. Adding it in handlers = double-wrap = frontend receives `data.data.value`.  
**Fix**: All handlers return bare `WidgetData` only.

### ❌ TASK-042 — Referenced non-existent `scopeResolver.ts`
**Error**: Described creating `backend/src/utils/scopeResolver.ts`.  
**Reality**: Scope resolution already lives in `widgetQueryEngine.ts` → `buildScopedQuery()`.  
**Fix**: No new scope file needed; all handlers use `scopedQuery` parameter or direct `ctx.tenantId` lookup.

---

## Scope Field Guide

Each model in this codebase uses a **different field name** for the project/tenant scope. Getting this wrong causes cross-tenant data leaks or empty results.

| Model | Scope Field | How to Query |
|---|---|---|
| `Ticket` | `metadata.projectId` (Mixed) | Use `...scopedQuery` (pre-built by engine) |
| `AccessLog` | `project` (ObjectId) | `{ project: new mongoose.Types.ObjectId(ctx.tenantId) }` |
| `ActivityLog` | `project` (ObjectId) | `{ project: new mongoose.Types.ObjectId(ctx.tenantId) }` |
| `EmailLog` | `projectId` (ObjectId) | `{ projectId: new mongoose.Types.ObjectId(ctx.tenantId) }` |
| `KnowledgeBaseArticle` | `projectId` (ObjectId) | `{ projectId: new mongoose.Types.ObjectId(ctx.tenantId) }` |
| `User` | `projects` (ObjectId[]) | `{ projects: new mongoose.Types.ObjectId(ctx.tenantId) }` |
| `Center` | `projectId` (ObjectId) | `{ projectId: new mongoose.Types.ObjectId(ctx.tenantId) }` |
| `Status` | `projectId` (ObjectId) | `{ projectId: new mongoose.Types.ObjectId(ctx.tenantId) }` |
| `FeedbackScore` | loaded via Ticket's `"metadata.projectId"` | Use `...scopedQuery` (via Ticket lookup) |

> **Rule**: Only Ticket handlers use `...scopedQuery`. All other models must set the scope field directly.

---

## Status Code System

### The `Status` Collection Schema

```
{
  code: Number,         // numeric status code stored in Ticket.status
  name: String,         // human-readable label (project-specific)
  color: String,        // hex colour for UI
  projectId: ObjectId,  // tenant scope
  isDefault: Boolean,   // true = the initial "open" state (one per project)
  isClosed: Boolean,    // true = terminal state (resolved, closed, etc.)
  displayOrder: Number,
  isActive: Boolean,
  requireClosingRemark: Boolean,
}
```

> **Important**: There is **no `statusType` field**. The system cannot distinguish "in-progress" from "on-hold" at the model level — both are `isClosed=false, isDefault=false`. If per-status-type reporting is needed, add `statusType: String` to the Status model.

### Status Code Helpers (Phase 3 / Phase 5 pattern)

```typescript
// Load all statuses for a project
const statuses = await loadProjectStatuses(ctx.tenantId);

// Derived sets:
activeCodes(statuses)  // isClosed=false          → all non-terminal statuses
closedCodes(statuses)  // isClosed=true           → resolved + closed
pendingCodes(statuses) // isClosed=false, isDefault=false → "in-progress" + "on-hold"

// Name/colour maps for display:
const nameMap  = new Map(statuses.map(s => [s.code, s.name]));
const colorMap = new Map(statuses.map(s => [s.code, s.color ?? "#888"]));
```

### Fallback Behaviour

All status helpers have a `catch` block that returns safe defaults:
- `loadClosedCodes()` → `[4, 5]`
- `loadActiveCodes()` → `[1, 2, 3]`
- `loadProjectStatuses()` → `[]` (no segments returned)

---

## Handler Files Reference

### Registration Order (server.ts)

```typescript
registerPhase1Handlers();   // 5 core handlers
registerPhase2Handlers();   // 14 handlers (incl. ticket_escalated_this_period)
registerPhase3Handlers();   // 20 ht_* handlers + 7 catalogue-key aliases
registerPhase4Handlers();   // 6 satisfaction handlers (re-export)
registerPhase5Handlers();   // 13 supplementary ticket + user handlers
registerKbHandlers();        // 8 knowledge base handlers
registerActivityHandlers();  // 6 activity / email / access handlers
```

Total registered widget keys: **79** (including aliases)

### File Locations

| File | Handler Count | Handler Keys |
|---|---|---|
| [phase1Handlers.ts](../backend/src/services/widgetHandlers/phase1Handlers.ts) | 5 | `ticket_open_count`, `ticket_by_status`, `ticket_sla_resolution_rate`, `user_required_vs_onboarded`, `centre_ideal_vs_active` |
| [phase2Handlers.ts](../backend/src/services/widgetHandlers/phase2Handlers.ts) | 14 | `ticket_closed_count`, `ticket_sla_compliance`, `ticket_trend_over_time`, `ticket_assignee_workload`, `my_assigned_tickets`, `ticket_escalated_this_period`, `user_active_count`, `user_inactive_count`, `user_onboarding_completion_rate`, `user_by_role`, `centre_capacity_gap`, `centre_capacity_utilisation`, `attendance_today_rate`, `attendance_mtd_rate` |
| [phase3Handlers.ts](../backend/src/services/widgetHandlers/phase3Handlers.ts) | 20 + 7 aliases | All `ht_*` keys + 7 catalogue aliases |
| [phase4Handlers.ts](../backend/src/services/widgetHandlers/phase4Handlers.ts) | 6 | `csat_score`, `nps_score`, `ces_score`, `satisfaction_trend`, `csat_by_agent`, `feedback_response_rate` |
| [phase5Handlers.ts](../backend/src/services/widgetHandlers/phase5Handlers.ts) | 13 | `ticket_inprogress_count`, `ticket_resolved_count`, `ticket_onhold_count`, `ticket_by_submission_source`, `ticket_recent_list`, `ticket_comment_count`, `user_total_count`, `user_new_registrations`, `user_by_registration_source`, `user_never_logged_in`, `user_by_department`, `user_eula_acceptance_rate`, `user_password_setup_pending` |
| [kbHandlers.ts](../backend/src/services/dashboard/queryHandlers/kbHandlers.ts) | 8 | `kb_total_articles`, `kb_published_count`, `kb_draft_count`, `kb_archived_count`, `kb_top_viewed`, `kb_helpfulness_rate`, `kb_recent_updates`, `kb_by_category` |
| [activityHandlers.ts](../backend/src/services/dashboard/queryHandlers/activityHandlers.ts) | 6 | `activity_feed`, `login_failure_count`, `active_session_count`, `email_sent_count`, `email_failure_rate`, `email_by_type` |

---

## Complete Widget Catalogue

### Ticketing Module

| Widget Key | Handler File | Return Shape | Vis |
|---|---|---|---|
| `ticket_open_count` | phase1 | `{ value, trend, trendDirection }` | kpi_tile |
| `ticket_by_status` | phase1 | `{ segments:[{code,name,color,count,percent}], total }` | donut, bar |
| `ticket_sla_resolution_rate` | phase1 | `{ value (%), trend, trendDirection }` | kpi_tile, gauge |
| `ticket_closed_count` | phase2 | `{ value, trend, trendDirection }` | kpi_tile |
| `ticket_sla_compliance` | phase2 | `{ value (%), trend }` | kpi_tile, gauge |
| `ticket_trend_over_time` | phase2 | `{ series:[{date,open,closed}] }` | line, area |
| `ticket_assignee_workload` | phase2 | `{ rows:[{agentId,agentName,count}] }` | bar, table |
| `my_assigned_tickets` | phase2 | `{ tickets:[...], value (count), trendDirection }` | kpi_tile, **table** |
| `ticket_escalated_this_period` | phase2 | `{ value, trend, trendDirection }` | kpi_tile |
| `ticket_inprogress_count` | phase5 | `{ value, trend, trendDirection }` | kpi_tile |
| `ticket_resolved_count` | phase5 | `{ value, trend, trendDirection }` | kpi_tile |
| `ticket_onhold_count` | phase5 | `{ value, trend, trendDirection }` | kpi_tile |
| `ticket_by_submission_source` | phase5 | `{ segments:[{source,count,percent}], total }` | donut, bar, table |
| `ticket_recent_list` | phase5 | `{ tickets:[...], total }` | table |
| `ticket_comment_count` | phase5 | `{ value }` | kpi_tile |
| `ticket_by_priority` | phase3 alias | Same as `ht_tickets_by_priority` | donut, bar, table |
| `ticket_by_category` | phase3 alias | Same as `ht_tickets_by_category` | bar, donut, table |
| `ticket_volume_trend` | phase3 alias | Same as `ht_daily_trend` — `{ series:[{name,data:[{date,value}]}] }` | line, area, bar |
| `ticket_escalation_count` | phase3 alias | Same as `ht_escalated_tickets` | kpi_tile |
| `ticket_first_response_time` | phase3 alias | Same as `ht_first_response_time` | kpi_tile |
| `ticket_avg_resolution_time` | phase3 alias | Same as `ht_avg_resolution_hours` | kpi_tile |
| `ticket_resolution_rate` | phase3 alias | Same as `ht_resolution_rate` | kpi_tile, gauge |

### Helpdesk Ticketing (`ht_*`)

All 20 `ht_*` handlers live in [phase3Handlers.ts](../backend/src/services/widgetHandlers/phase3Handlers.ts). See that file for full details.

### Satisfaction Module

| Widget Key | Return Shape | Vis |
|---|---|---|
| `csat_score` | `{ value, trend }` | kpi_tile, gauge |
| `nps_score` | `{ value, promoters, detractors, passives, total }` | kpi_tile, gauge |
| `ces_score` | `{ value, trend }` | kpi_tile, gauge |
| `satisfaction_trend` | `{ series:[{name, data:[{date,value}]}] }` | line, area |
| `csat_by_agent` | `{ rows:[{agentId,agentName,avgScore,count}] }` | bar, table |
| `feedback_response_rate` | `{ value (%), trendDirection }` | kpi_tile, gauge |

### User Module

| Widget Key | Handler File | Return Shape | Vis |
|---|---|---|---|
| `user_active_count` | phase2 | `{ value, trendDirection }` | kpi_tile |
| `user_inactive_count` | phase2 | `{ value, trendDirection }` | kpi_tile |
| `user_onboarding_completion_rate` | phase2 | `{ value (%) }` | kpi_tile |
| `user_by_role` | phase2 | `{ segments:[{roleId,roleName,count,percent}], total }` | donut, bar |
| `user_required_vs_onboarded` | phase1 | `{ current, required, gap, percentFilled }` | kpi_tile |
| `user_total_count` | phase5 | `{ value, active, inactive }` | kpi_tile |
| `user_new_registrations` | phase5 | `{ value, trend, trendDirection }` | kpi_tile |
| `user_by_registration_source` | phase5 | `{ segments:[{source,count,percent}], total }` | donut, bar, table |
| `user_never_logged_in` | phase5 | `{ value, total, percent }` | kpi_tile |
| `user_by_department` | phase5 | `{ rows:[{department,count,percent}], total }` | bar, table |
| `user_eula_acceptance_rate` | phase5 | `{ value (%), accepted, total }` | kpi_tile, gauge |
| `user_password_setup_pending` | phase5 | `{ value, total, percent }` | kpi_tile |

### Centre Module

| Widget Key | Handler File | Return Shape |
|---|---|---|
| `centre_ideal_vs_active` | phase1 | `{ rows:[{centreId,centreName,ideal,active,gap}] }` |
| `centre_capacity_gap` | phase2 | `{ value (gap count) }` |
| `centre_capacity_utilisation` | phase2 | `{ value (%) }` |

### Knowledge Base Module

| Widget Key | Handler File | Return Shape | Vis |
|---|---|---|---|
| `kb_total_articles` | kbHandlers | `{ value, published, draft, archived }` | kpi_tile |
| `kb_published_count` | kbHandlers | `{ value }` | kpi_tile |
| `kb_draft_count` | kbHandlers | `{ value }` | kpi_tile |
| `kb_archived_count` | kbHandlers | `{ value }` | kpi_tile |
| `kb_top_viewed` | kbHandlers | `{ articles:[{title,category,viewCount,...}], total }` | table |
| `kb_helpfulness_rate` | kbHandlers | `{ value (%), totalHelpful, totalNotHelpful, totalViews }` | kpi_tile, gauge |
| `kb_recent_updates` | kbHandlers | `{ articles:[{title,status,updatedAt,...}], total }` | table |
| `kb_by_category` | kbHandlers | `{ rows:[{category,count,percent}], total }` | bar, donut, table |

### Activity / Security / Email Module

| Widget Key | Handler File | Return Shape | Vis |
|---|---|---|---|
| `activity_feed` | activityHandlers | `{ events:[{action,entity,userName,timestamp,...}], total }` | table |
| `login_failure_count` | activityHandlers | `{ value, trend, trendDirection }` | kpi_tile |
| `active_session_count` | activityHandlers | `{ value }` | kpi_tile |
| `email_sent_count` | activityHandlers | `{ value, trend, trendDirection }` | kpi_tile |
| `email_failure_rate` | activityHandlers | `{ value (%), sent, failed, total }` | kpi_tile, gauge |
| `email_by_type` | activityHandlers | `{ segments:[{type,count,percent}], total }` | donut, bar, table |

### Attendance Module

| Widget Key | Handler File | Return Shape |
|---|---|---|
| `attendance_today_rate` | phase2 | `{ value (%) }` |
| `attendance_mtd_rate` | phase2 | `{ value (%) }` |

---

## Response Shape Reference

### Trend Object

All KPI widgets with trend comparison return:

```typescript
{
  value: number,
  trend: {
    delta: number,        // current - previous
    deltaPercent: number, // % change rounded to 1dp
    direction: "up" | "down" | "flat",
  },
  trendDirection: "higher_is_better" | "lower_is_better",
}
```

### Segment / Distribution

Used by donut/bar charts:

```typescript
{
  segments: Array<{ [labelField]: string, count: number, percent: number }>,
  total: number,
}
```

### Full API Response Envelope (added by engine)

```typescript
{
  data: WidgetData,            // the bare return from the handler
  metadata: {
    dateRangeStart: Date,
    dateRangeEnd: Date,
    lastUpdated: Date,
    scopeApplied: string,
  },
  cached: boolean,
}
```

---

## Adding New Handlers

### Step 1 — Write the handler

```typescript
const myWidgetHandler: QueryHandler = {
  widgetKey: "my_widget_key",
  cacheTtlSeconds: 120,
  async execute(ctx, params, resolvedFilters, scopedQuery): Promise<WidgetData> {
    // For Ticket queries:     use ...scopedQuery
    // For User queries:       use { projects: new mongoose.Types.ObjectId(ctx.tenantId) }
    // For ActivityLog/AccessLog: use { project: new mongoose.Types.ObjectId(ctx.tenantId) }
    // For EmailLog/KB:        use { projectId: new mongoose.Types.ObjectId(ctx.tenantId) }
    // NEVER add the response envelope here — the engine does it
    return { value: result };
  },
};
```

### Step 2 — Register in the appropriate phase file

Add to the phase file's `register*Handlers()` function:

```typescript
registerWidgetHandler(myWidgetHandler);
```

### Step 3 — Add to `seedWidgetDefinitions.ts`

Add a widget definition entry to the `allWidgets` array. It will be upserted on next server start.

### Step 4 — For catalogue-key aliases

If the new widget reuses an existing handler's logic:

```typescript
// In phase3Handlers.ts registerPhase3Handlers():
registerWidgetHandler({ ...htExistingHandler, widgetKey: "new_alias_key" });
```

---

## Known Limitations

### `ticket_inprogress_count` vs `ticket_onhold_count`

Both widgets currently return the same data (pendingCodes = `isClosed=false AND isDefault=false`). This is because the `Status` model has no `statusType` discriminator field.

**To distinguish them in future**: Add `statusType: { type: String, enum: ['open', 'in_progress', 'on_hold', 'resolved', 'closed', 'custom'] }` to the Status schema, then:
- `ticket_inprogress_count` → query `{ statusType: 'in_progress' }`
- `ticket_onhold_count` → query `{ statusType: 'on_hold' }`
- Run a one-time migration to set `statusType` based on existing `code` values.

### `my_assigned_tickets` dual-mode

The handler returns both `value` (count, for kpi_tile) and `tickets` (array, for table). The frontend must read the correct property based on the visualisation type.
