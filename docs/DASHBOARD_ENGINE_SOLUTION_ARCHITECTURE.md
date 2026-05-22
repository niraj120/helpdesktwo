# Custom Dashboard Engine — Solution Architecture & User Stories

**Document Version:** 1.0  
**Supersedes:** Custom Dashboard Module PRD v1.1 (architectural and dev guidance layer on top of it)  
**Audience:** Development Team  
**Classification:** Internal — Engineering Specification

---

## 1. Market Research & Benchmark Analysis

Before locking in architecture, we benchmarked the top systems. Key patterns we're adopting:

| Platform                | Pattern Borrowed                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Grafana**             | Template variable system (`$variable`) — auto-injected context; panel plugin registry; dashboard-as-JSON; folder organisation |
| **Metabase**            | "Questions as atomic units" = our widget definitions; sandbox row-level security per user attribute                           |
| **Zendesk Explore**     | Dataset-abstraction over queries; bookmark/parameter filters; role-scoped default dashboards                                  |
| **Looker**              | LookML-inspired: data model layer separate from presentation; "explore" drill-through; field-level permissions                |
| **Freshdesk Analytics** | Canned report seeding + custom builder; widget-level refresh intervals                                                        |
| **Power BI**            | Row-Level Security (RLS) via user attribute injection; paginated reports; embed token for external sharing                    |
| **Retool / Appsmith**   | Query variables (`{{current_user.id}}`); component-level binding; data source abstraction                                     |

**Critical gap the PRD doesn't fully address (now solved below):**  
The PRD treats scoping as implicit (role-based at query time). The market standard — and the correct approach for a 400-user system with individual assignments — is an explicit **Context Variable System** where any filter anywhere can reference `@ctx.userId`, `@ctx.centreId`, etc. This means one template serves everyone; individual "personal" filtering is solved by variables, not by creating 400 copies of the same dashboard.

---

## 2. Core Architecture Enhancement: Context Variable System

### 2.1 The Problem with 400 Individual Dashboards

Without context variables, to personalise a dashboard for 400 users you'd need 400 assignments each with hardcoded filter values. That's unmanageable.

**The solution:** Any widget filter value can be set to a **context variable** that resolves at query time to the requesting user's own attributes. This is the `@self` concept the team identified.

### 2.2 Context Variable Reference

All context variables are prefixed `@ctx.` and resolved server-side from the JWT. They are **never** sent from the client.

| Variable                | Resolves To                              | Example Value              |
| ----------------------- | ---------------------------------------- | -------------------------- |
| `@ctx.userId`           | Logged-in user's MongoDB `_id`           | `"6731abc..."`             |
| `@ctx.email`            | User's email                             | `"rahul@sac.in"`           |
| `@ctx.name`             | User's full name                         | `"Rahul Sharma"`           |
| `@ctx.roleId`           | User's role `_id`                        | `"671def..."`              |
| `@ctx.roleCode`         | User's role code                         | `"DISTRICT_NODAL_OFFICER"` |
| `@ctx.tenantId`         | Always injected; never overrideable      | `"67abc123"`               |
| `@ctx.projectIds`       | Array of project IDs the user belongs to | `["id1", "id2"]`           |
| `@ctx.primaryProjectId` | First/default project ID                 | `"id1"`                    |
| `@ctx.centreId`         | User's assigned centre                   | `"67centre1"`              |
| `@ctx.districtId`       | User's assigned district                 | `"67district1"`            |

### 2.3 How `@self` Works in Practice

When a super admin builds a dashboard and wants a "My Assigned Tickets" widget that works for **every agent individually** — even if 400 agents are assigned the same template — they configure the widget filter as:

```
assignedTo  =  @ctx.userId
```

At render time for Agent A, the system queries `assignedTo = "Agent_A_ObjectId"`.  
At render time for Agent B, the same widget queries `assignedTo = "Agent_B_ObjectId"`.  
**One template. Zero individual copies needed.**

This extends to all scope levels:

| Use Case                                        | Filter Configuration           | Who Sees What                           |
| ----------------------------------------------- | ------------------------------ | --------------------------------------- |
| Facilitator sees only their centre's attendance | `centreId = @ctx.centreId`     | Each facilitator sees their own centre  |
| DNO sees their district's tickets               | `districtId = @ctx.districtId` | Each DNO sees their own district        |
| Student sees their own tickets                  | `studentEmail = @ctx.email`    | Each student sees only their records    |
| Agent workload widget                           | `assignedTo = @ctx.userId`     | Each agent sees only their queue        |
| "My Projects" summary                           | `projectId IN @ctx.projectIds` | User sees all their projects aggregated |

### 2.4 When Individual Assignment IS Needed

Individual dashboard assignment (not the variable system) is only needed when:

1. A specific user needs a **different template** than their role (e.g. a senior DNO gets the Commissioner view)
2. A user needs an **extra tab** beyond their role default (e.g. a power user who also monitors feedback)
3. A user has been **granted temporary access** to a project outside their normal scope

For all cases of "personalise the data shown", context variables solve it. For "show a different layout", individual assignment solves it.

---

## 3. Revised Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                              │
│                                                                      │
│  DashboardPage                                                       │
│  ├── TabBar (resolved from /me/dashboards)                          │
│  ├── GlobalFilterBar (@ctx injected, user date/project overrides)   │
│  └── DashboardGrid (react-grid-layout)                              │
│       └── WidgetFrame[]                                             │
│            ├── WidgetRenderer (dispatches to correct chart type)    │
│            ├── LoadingSkeleton / EmptyState / ErrorState            │
│            └── FooterBar (last refresh + cache TTL countdown)       │
│                                                                      │
│  AdminDashboardBuilder                                               │
│  ├── WidgetPanel (grouped by module, searchable)                    │
│  ├── GridCanvas (drag-drop + resize)                                │
│  ├── WidgetConfigPanel (right drawer)                               │
│  │    └── FilterBuilder (visual, with @ctx variable picker)        │
│  └── PreviewMode / MobilePreview                                    │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────────────────────┐
│                        BACKEND (Node.js + TS)                        │
│                                                                      │
│  Dashboard Resolution Service                                        │
│  ├── Resolves role + individual assignments for user                │
│  └── Returns ordered tab manifest (metadata only, no widget data)  │
│                                                                      │
│  Widget Query Engine                                                 │
│  ├── Registry: widgetKey → QueryHandler                             │
│  ├── Context Injector: merges @ctx vars from JWT                    │
│  ├── Filter Evaluator: resolves @ctx.* in filter config            │
│  ├── Scope Enforcer: tenant_id always applied, cannot be removed   │
│  └── Cache Layer (Redis): TTL + event-driven invalidation          │
│                                                                      │
│  Event Bus (in-process for v1, Kafka-ready)                         │
│  └── Events: ticket.closed, user.created, centre.ideal_count_changed│
│       → triggers targeted cache invalidation                        │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ Mongoose
┌──────────────────────▼──────────────────────────────────────────────┐
│                      MongoDB Collections                             │
│  widget_definitions  dashboard_templates  dashboard_widgets         │
│  dashboard_assignments  user_dashboard_preferences                  │
│  user_targets  (centres.idealCount field added)                     │
│  + existing: tickets  users  projects  centres  districts           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Widget Query Engine — Technical Design

### 4.1 Query Handler Interface

Every widget definition maps to a `QueryHandler`. Handlers are registered at server startup. Adding a new widget means registering a new handler — no other files change.

```typescript
interface WidgetQueryContext {
  tenantId: string; // Always present, from JWT
  userId: string; // From JWT
  roleCode: string; // From JWT
  projectIds: string[]; // From JWT/user record
  centreId?: string; // From user record
  districtId?: string; // From user record
  email: string; // From JWT
}

interface WidgetQueryParams {
  dateRangeDays: number;
  filters: Record<string, any>; // Admin-configured, may contain @ctx.* values
  visualisationType: string;
}

interface QueryHandler {
  widgetKey: string;
  execute(
    ctx: WidgetQueryContext,
    params: WidgetQueryParams,
  ): Promise<WidgetDataResult>;
  cacheTtlSeconds: number;
  cacheKeyFn(ctx: WidgetQueryContext, params: WidgetQueryParams): string;
}
```

### 4.2 Context Variable Resolution

Before any query runs, the filter config is passed through the context resolver:

```typescript
function resolveContextVars(
  filters: Record<string, any>,
  ctx: WidgetQueryContext,
): Record<string, any> {
  return Object.fromEntries(
    Object.entries(filters).map(([key, value]) => {
      if (typeof value === "string" && value.startsWith("@ctx.")) {
        const ctxKey = value.replace("@ctx.", "") as keyof WidgetQueryContext;
        return [key, ctx[ctxKey]]; // Server-side resolution only
      }
      return [key, value];
    }),
  );
}
```

Client never sees the resolved value — only the `@ctx.*` string. Server resolves it. Scope cannot be forged.

### 4.3 Automatic Scope Enforcement

The scope enforcer wraps EVERY query. `tenantId` is always injected regardless of widget configuration. This is the tenant isolation guarantee.

```typescript
function buildScopeEnforcedQuery(
  baseQuery: Record<string, any>,
  ctx: WidgetQueryContext,
  widgetDef: WidgetDefinition,
): Record<string, any> {
  // tenantId ALWAYS applied — non-negotiable
  const query = { ...baseQuery, tenantId: ctx.tenantId };

  // Role-level scope auto-applied based on widget's scope_levels
  if (widgetDef.scopeLevels.includes("project") && ctx.projectIds.length > 0) {
    if (!query.projectId) {
      query["metadata.projectId"] = { $in: ctx.projectIds };
    }
  }

  if (widgetDef.scopeLevels.includes("centre") && ctx.centreId) {
    if (!query.centreId && ctx.roleCode === "FACILITATOR") {
      query.centreId = ctx.centreId;
    }
  }

  return query;
}
```

### 4.4 Cache Key Strategy

Cache keys encode the full resolved context so two users with different scopes never share a cache entry:

```
cache_key = `widget:${widgetKey}:tenant:${tenantId}:user:${userId}:params:${hash(resolvedParams)}`
```

For role-based widgets where all users of the same role+district see identical data, the key uses role context:

```
cache_key = `widget:${widgetKey}:tenant:${tenantId}:district:${districtId}:role:${roleCode}:params:${hash(params)}`
```

---

## 5. Frontend Architecture

### 5.1 Technology Choices

| Concern                      | Library                 | Rationale                                                                          |
| ---------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Dashboard grid layout        | `react-grid-layout`     | Industry standard; used by Grafana, Retool; handles drag/resize/responsive         |
| Charts                       | `recharts`              | React-native, tree-shakeable, all chart types needed, good accessibility           |
| Widget data fetching         | `@tanstack/react-query` | Built-in caching, background refetch, loading/error states, stale-while-revalidate |
| Date picker                  | `react-datepicker`      | Lightweight; already likely in the project                                         |
| Drag-and-drop (widget panel) | `@dnd-kit/core`         | Modern, accessible DnD; works with react-grid-layout                               |
| Skeleton loading             | CSS + custom component  | Match exact widget shape during loading                                            |

### 5.2 Widget Component Architecture

```
WidgetFrame (container — handles all states)
├── props: widgetConfig, dashboardDateRange, globalFilters
├── useWidgetData(widgetKey, mergedParams) → React Query
├── renders:
│    ├── <LoadingSkeleton /> when status === 'loading'
│    ├── <WidgetRenderer type={visualisationType} data={data} /> when loaded
│    ├── <EmptyState /> when data is empty
│    ├── <ErrorState onRetry={refetch} /> when error
│    └── <NoPermissionState /> when 403
└── footer: last refreshed timestamp + manual refresh icon
```

### 5.3 Global → Widget Filter Propagation

```
DashboardPage
  └── GlobalFilterContext: { dateRangeDays, projectId, districtId }
       └── WidgetFrame reads GlobalFilterContext
            └── merges with widget's own config filters
                 (widget-level config overrides global only if widget has override: true)
```

### 5.4 Drill-Through Navigation

Widgets that support drill-through emit a `onDrillThrough(filters)` event. The page catches it and navigates:

```typescript
const drillThroughMap: Record<string, (filters: any) => string> = {
  ticket_by_status: (f) => `/tickets?status=${f.status}`,
  ticket_by_category: (f) => `/tickets?category=${f.categoryId}`,
  ticket_by_priority: (f) => `/tickets?priority=${f.priority}`,
  attendance_by_centre: (f) => `/attendance?centreId=${f.centreId}`,
  user_by_role: (f) => `/users?roleId=${f.roleId}`,
};
```

Chart click → resolved filter → navigate with pre-applied query params. The target list page reads these params on mount and applies them to its own filter state.

---

## 6. MongoDB Schema (Aligned to Existing Stack)

> The existing codebase uses Mongoose. All new collections follow the same pattern. No UUID PKs — use ObjectId.

### 6.1 `WidgetDefinition` Model

```typescript
const WidgetDefinitionSchema = new Schema(
  {
    widgetKey: { type: String, unique: true, required: true }, // e.g. "ticket_open_count"
    module: {
      type: String,
      enum: ["ticketing", "users", "attendance", "feedback", "kb", "tasks"],
      required: true,
    },
    displayName: { type: String, required: true },
    description: String,
    supportedVisualisations: { type: [String], required: true }, // ['kpi_tile','bar_chart','line_chart',...]
    defaultVisualisation: { type: String, required: true },
    scopeLevels: [String], // ['tenant','project','centre','user']
    filterParams: Schema.Types.Mixed, // { priority: 'enum', dateRange: 'range', ... }
    dataQueryKey: { type: String, required: true }, // maps to QueryHandler registry
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    requiresPermissions: [String], // ['attendance.read']
    cacheTtlSeconds: { type: Number, default: 300 },
    supportsDrillThrough: { type: Boolean, default: false },
    drillThroughTarget: String, // route pattern e.g. "/tickets?status=$status"
    trendDirection: {
      type: String,
      enum: ["higher_is_better", "lower_is_better"],
      default: "higher_is_better",
    },
  },
  { timestamps: true },
);
```

### 6.2 `DashboardTemplate` Model

```typescript
const DashboardTemplateSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true },
    description: String,
    icon: String,
    colourLabel: String,
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    globalDateRangeDays: { type: Number, default: 30 },
    allowUserDateOverride: { type: Boolean, default: true },
    isSystemDefault: { type: Boolean, default: false }, // seeded templates
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
```

### 6.3 `DashboardWidget` Model (embedded or referenced)

```typescript
const DashboardWidgetSchema = new Schema(
  {
    dashboardTemplateId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
      required: true,
    },
    widgetDefinitionId: {
      type: Schema.Types.ObjectId,
      ref: "WidgetDefinition",
      required: true,
    },
    widgetDefinitionVersion: Number,
    title: String,
    visualisationType: String,
    gridX: Number, // 0-11
    gridY: Number,
    gridWidth: Number, // 1-12
    gridHeight: Number,
    config: {
      // Per-widget configuration
      dateRangeDays: Number,
      filters: Schema.Types.Mixed, // Can contain "@ctx.userId" etc.
      colourTheme: String,
      showHeader: { type: Boolean, default: true },
      refreshInterval: { type: Number, default: 300 }, // seconds
      gaugeThresholds: {
        // For gauge visualisations
        green: Number, // e.g. 80
        amber: Number, // e.g. 60
      },
      trendEnabled: { type: Boolean, default: true },
    },
    displayOrder: Number,
    isCollapsedDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);
```

### 6.4 `DashboardAssignment` Model

```typescript
const DashboardAssignmentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    dashboardTemplateId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
      required: true,
    },
    assigneeType: { type: String, enum: ["role", "user"], required: true },
    assigneeId: { type: Schema.Types.ObjectId, required: true }, // role _id or user _id
    projectId: { type: Schema.Types.ObjectId, ref: "Project" }, // optional project scope
    tabOrder: { type: Number, default: 0 },
    isDefaultTab: { type: Boolean, default: false },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Unique: one template assigned once per assignee
DashboardAssignmentSchema.index(
  {
    tenantId: 1,
    dashboardTemplateId: 1,
    assigneeType: 1,
    assigneeId: 1,
    projectId: 1,
  },
  { unique: true },
);
DashboardAssignmentSchema.index({
  assigneeType: 1,
  assigneeId: 1,
  tenantId: 1,
}); // Dashboard resolution query
```

### 6.5 `UserDashboardPreference` Model

```typescript
const UserDashboardPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    dashboardTemplateId: {
      type: Schema.Types.ObjectId,
      ref: "DashboardTemplate",
      required: true,
    },
    collapsedWidgetIds: [Schema.Types.ObjectId],
    activeDateRangeDays: Number,
    lastViewedAt: Date,
  },
  { timestamps: true },
);

UserDashboardPreferenceSchema.index(
  { userId: 1, dashboardTemplateId: 1 },
  { unique: true },
);
```

### 6.6 `UserTarget` Model (Onboarding KPI)

```typescript
const UserTargetSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    centreId: { type: Schema.Types.ObjectId, ref: "Centre" },
    roleId: { type: Schema.Types.ObjectId, ref: "Role" },
    targetMonth: { type: Date, required: true }, // first day of month, e.g. 2025-05-01
    targetCount: { type: Number, required: true },
    setBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

UserTargetSchema.index({ tenantId: 1, centreId: 1, targetMonth: 1 });
UserTargetSchema.index({ tenantId: 1, projectId: 1, targetMonth: 1 });
UserTargetSchema.index(
  { tenantId: 1, projectId: 1, centreId: 1, roleId: 1, targetMonth: 1 },
  { unique: true, sparse: true },
);
```

### 6.7 Centres Schema Addition (Migration)

```typescript
// Add to existing Centre schema:
idealCount:             { type: Number, default: null },
idealCountUpdatedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
idealCountUpdatedAt:    Date,
```

### 6.8 Project Schema Addition — Project-Level User Target (Migration)

For cases where a project has a **fixed total headcount requirement** (not a per-month target), the simplest approach is to store it directly on the Project document. This avoids the overhead of querying the `UserTarget` collection when only the project-level figure is needed.

```typescript
// Add to existing Project schema:
userTarget: {
  required:             { type: Number, default: null }, // total users required for this project
  requiredUpdatedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
  requiredUpdatedAt:    Date,
},
```

**Two-tier target model:**

| Tier          | Stored on                     | Use Case                                                                              |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| Project total | `Project.userTarget.required` | "This project needs 130 users" — a fixed headcount ceiling for the project's lifetime |
| Monthly pace  | `UserTarget` collection       | "We need to onboard 20 users this month" — MTD tracking against a scheduled rollout   |

Widgets can use either tier independently. The "Users Required vs Onboarded" widget (US-024) can be configured in the builder to use **project-total mode** or **monthly-pace mode** via a widget-instance config flag:

```json
{ "targetMode": "project_total" }  // uses Project.userTarget.required
{ "targetMode": "monthly" }        // uses UserTarget collection (default)
```

---

## 7. API Design

### 7.1 Route Structure

All dashboard routes mount under the existing Express router.

```
/api/v1/admin/widget-definitions          GET
/api/v1/admin/widget-definitions/:id      GET

/api/v1/admin/dashboards                  GET, POST
/api/v1/admin/dashboards/:id              GET, PUT, DELETE
/api/v1/admin/dashboards/:id/publish      POST
/api/v1/admin/dashboards/:id/duplicate    POST
/api/v1/admin/dashboards/:id/export       GET
/api/v1/admin/dashboards/import           POST

/api/v1/admin/dashboards/:id/assignments           GET, POST
/api/v1/admin/dashboards/:id/assignments/:asgId    PUT, DELETE

/api/v1/me/dashboards                         GET  ← dashboard resolution (< 200ms)
/api/v1/me/dashboards/:id/preferences         GET, PUT

/api/v1/me/personal-dashboards                GET, POST
/api/v1/me/personal-dashboards/:id            PUT, DELETE

/api/v1/widgets/:widgetKey/data               GET  ← widget data (cached)

/api/v1/admin/user-targets                    GET, POST    ← list / create single target
/api/v1/admin/user-targets/:id                GET, PUT, DELETE
/api/v1/admin/user-targets/import             POST         ← bulk CSV (US-026)

/api/v1/admin/projects/:id/user-target        GET, PUT     ← project-level total target (US-050)
```

### 7.2 Dashboard Resolution Response (`GET /me/dashboards`)

Returns the tab manifest only — no widget data. Fast.

```json
{
  "tabs": [
    {
      "dashboardId": "...",
      "name": "Executive Overview",
      "icon": "chart-bar",
      "colourLabel": "#2563eb",
      "isDefault": true,
      "tabOrder": 0,
      "globalDateRangeDays": 30,
      "allowUserDateOverride": true,
      "widgets": [
        {
          "widgetId": "...",
          "widgetKey": "ticket_open_count",
          "title": "Open Tickets",
          "visualisationType": "kpi_tile",
          "gridX": 0,
          "gridY": 0,
          "gridWidth": 3,
          "gridHeight": 2,
          "config": {
            "refreshInterval": 60,
            "filters": { "assignedTo": "@ctx.userId" }
          },
          "displayOrder": 0
        }
      ]
    }
  ],
  "contextAvailable": [
    "userId",
    "roleCode",
    "centreId",
    "districtId",
    "projectIds"
  ]
}
```

Note: `filters` in the response **still shows `@ctx.userId`** — the client sends this back as-is in the widget data request. The server resolves it. The client never knows the actual value.

### 7.3 Widget Data Request/Response

```
GET /api/v1/widgets/ticket_open_count/data
    ?dateRangeDays=30
    &filters={"assignedTo":"@ctx.userId"}
    &visualisationType=kpi_tile
```

Response:

```json
{
  "widgetKey": "ticket_open_count",
  "visualisationType": "kpi_tile",
  "data": {
    "value": 24,
    "trend": { "delta": -3, "deltaPercent": -11.1, "direction": "down" },
    "trendDirection": "lower_is_better",
    "sparkline": [28, 26, 25, 24]
  },
  "metadata": {
    "dateRangeStart": "2025-04-15",
    "dateRangeEnd": "2025-05-15",
    "lastUpdated": "2025-05-15T06:00:00Z"
  },
  "scopeApplied": {
    "tenantId": "...",
    "resolvedFilters": { "assignedTo": "[RESOLVED]" }
  },
  "cached": true,
  "cacheExpiresAt": "2025-05-15T06:05:00Z"
}
```

Note: `resolvedFilters` shows `"[RESOLVED]"` — the actual user ID is never echoed back.

---

## 8. Cache Invalidation Strategy

Event-driven invalidation ensures data stays fresh without over-querying.

| Event                          | Widgets Invalidated                                                            | Scope                   |
| ------------------------------ | ------------------------------------------------------------------------------ | ----------------------- |
| `ticket.created`               | `ticket_open_count`, `ticket_by_status`, `ticket_trend_over_time`              | tenant + project        |
| `ticket.closed`                | `ticket_closed_count`, `ticket_sla_compliance`, `ticket_sla_resolution_rate`   | tenant + project        |
| `ticket.assigned`              | `ticket_assignee_workload`, `my_assigned_tickets`                              | specific assignee       |
| `user.created` (status=active) | `user_required_vs_onboarded`, `user_onboarding_completion_rate`                | tenant + centre/project |
| `user.status_changed`          | `user_active_count`, `user_inactive_count`, `centre_ideal_vs_active`           | tenant + centre         |
| `centre.ideal_count_changed`   | `centre_ideal_vs_active`, `centre_capacity_gap`, `centre_capacity_utilisation` | specific centreId       |
| `attendance.submitted`         | `attendance_today_rate`, `attendance_mtd_rate`                                 | centre                  |
| `user_target.created/updated`  | `user_required_vs_onboarded`, `user_onboarding_gap`                            | project/centre          |

Implementation: emit events from the relevant controller actions using a lightweight in-process event emitter. The cache service listens and calls `redis.del(cacheKey)` for all matching keys.

---

## 9. Implementation Phases (Revised)

### Phase 1 — Core Engine (Weeks 1–4)

Deliverables:

- All MongoDB models created and migrated
- Widget registry seeded with all v1.1 widget definitions (data query key registered, handlers TBD in Phase 1–2)
- Dashboard template CRUD (admin)
- Dashboard assignment (role-level)
- `GET /me/dashboards` resolution (< 200ms)
- Widget data API skeleton — 5 handlers implemented: `ticket_open_count`, `ticket_by_status`, `ticket_sla_resolution_rate`, `user_required_vs_onboarded`, `centre_ideal_vs_active`
- Basic dashboard viewer (React): tab bar, widget frames, loading/error states
- Context variable system (`@ctx.*`) in place
- Redis caching layer with TTL

### Phase 2 — Full Builder & All Widgets (Weeks 5–8)

Deliverables:

- All remaining widget query handlers implemented (full list from PRD Section 5)
- Dashboard builder UI: grid canvas, widget panel, drag-drop, resize
- Widget config panel: title, visualisation type, filter builder with `@ctx` variable picker
- Global date range filter + propagation
- Mobile responsive grid (single-column stacking)
- Drill-through from charts to list pages
- Dashboard duplication
- Undo/redo (10 steps)
- Event-driven cache invalidation
- All 5 pre-built dashboard templates seeded

### Phase 3 — Personal Dashboards & Advanced (Weeks 9–12)

Deliverables:

- Personal dashboards (user-created)
- Dashboard export/import as JSON
- Pre-aggregated summary collection for heavy queries (district-level, tenant-level aggregates)
- Alert thresholds on KPI tiles → notification trigger
- Accessibility: data table alternative for charts, ARIA live regions
- Dashboard usage analytics

---

## 10. User Stories

> Format: Story → Acceptance Criteria → Priority → Story Points  
> Priority: **P0** = must for Phase 1, **P1** = Phase 2, **P2** = Phase 3  
> Story Points: Fibonacci (1, 2, 3, 5, 8, 13)

---

### Epic 1: Widget Registry

---

#### US-001 — Widget Registry Seeding

**As a** developer,  
**I want** all widget definitions pre-seeded in the database at application startup,  
**so that** admins can immediately see and use all available widgets without manual setup.

**Acceptance Criteria:**

- Given the server starts fresh, when the seed script runs, then all widgets listed in PRD Section 5.1–5.7 are present in `widget_definitions` collection
- Each definition has: `widgetKey`, `module`, `displayName`, `supportedVisualisations`, `defaultVisualisation`, `scopeLevels`, `cacheTtlSeconds`, `dataQueryKey`
- Seed is idempotent — running it twice does not create duplicates (upsert by `widgetKey`)
- `GET /api/v1/admin/widget-definitions` returns all active definitions grouped by module

**Priority:** P0 | **Points:** 3

---

#### US-002 — Widget Definition Registry Read API

**As a** super admin,  
**I want** to view all available widget definitions grouped by module,  
**so that** I know what data points I can add to a dashboard.

**Acceptance Criteria:**

- `GET /api/v1/admin/widget-definitions` returns all `isActive: true` definitions
- Response groups widgets by `module` field
- Supports `?module=ticketing` filter to return one module's widgets only
- Each widget shows: `widgetKey`, `displayName`, `description`, `supportedVisualisations`, `scopeLevels`
- Returns 403 if caller does not have `dashboard.manage` permission
- Response time < 100ms (no aggregation; simple collection read)

**Priority:** P0 | **Points:** 2

---

### Epic 2: Dashboard Template Management (Admin)

---

#### US-003 — Create Dashboard Template

**As a** super admin,  
**I want** to create a new dashboard template and configure its name, description, and global settings,  
**so that** I have a blank canvas to build a dashboard.

**Acceptance Criteria:**

- `POST /api/v1/admin/dashboards` creates a template with `status: 'draft'`
- Required fields: `name`. Optional: `description`, `icon`, `colourLabel`, `globalDateRangeDays`
- Response includes the created template's `_id`
- Template is scoped to `tenantId` from the admin's JWT — they cannot set a different tenantId
- Admin sees the new template listed on `/admin/dashboards` page immediately
- Returns 422 if `name` is empty or > 255 chars
- Returns 403 if caller does not have `dashboard.manage` permission

**Priority:** P0 | **Points:** 2

---

#### US-004 — Add Widgets to Dashboard Template

**As a** super admin,  
**I want** to add widgets from the registry to a dashboard template by selecting them from a panel,  
**so that** I can compose the dashboard's content.

**Acceptance Criteria:**

- `PUT /api/v1/admin/dashboards/:id` accepts a `widgets` array in the request body
- Each widget entry must reference a valid, active `widgetDefinitionId`
- Grid position (`gridX`, `gridY`, `gridWidth`, `gridHeight`) is stored per widget
- Widget title defaults to the definition's `displayName` if not overridden
- `visualisationType` must be one of the definition's `supportedVisualisations`; returns 422 otherwise
- A dashboard can hold up to 50 widgets (returns 422 if exceeded)
- Updating an existing dashboard preserves `widgetDefinitionVersion` at the time of placement

**Priority:** P0 | **Points:** 5

---

#### US-005 — Configure Widget Filters with @ctx Variables

**As a** super admin building a dashboard,  
**I want** to set a widget's filter value to `@ctx.userId` (or any context variable),  
**so that** the same template personalises its data for every assigned user without needing individual copies.

**Acceptance Criteria:**

- The widget config panel shows a "Context Variable" option in the filter value picker alongside literal values
- Available context variables are listed: `@ctx.userId`, `@ctx.email`, `@ctx.centreId`, `@ctx.districtId`, `@ctx.roleCode`, `@ctx.projectIds`, `@ctx.primaryProjectId`
- When saved, the filter value is stored literally as the string `"@ctx.userId"` in the widget's `config.filters` JSON
- At query time, the backend resolves `@ctx.userId` to the requesting user's actual `_id` from their JWT claims
- The resolved value is never returned in API responses (shown as `"[RESOLVED]"` in `scopeApplied`)
- If the JWT does not have the field required by the context variable (e.g. user has no `centreId`), the widget renders an "Insufficient context" state rather than an error
- A preview of the variable tooltip in the builder shows: "Resolves to the logged-in user's centre ID"

**Priority:** P0 | **Points:** 5

---

#### US-006 — Publish Dashboard Template

**As a** super admin,  
**I want** to publish a draft dashboard so it becomes available for assignment,  
**so that** users can be assigned the dashboard after I'm satisfied with its configuration.

**Acceptance Criteria:**

- `POST /api/v1/admin/dashboards/:id/publish` transitions `status` from `draft` to `published`
- Returns 409 if already published (idempotent — re-publishing same template is a no-op)
- Returns 422 if the dashboard has no widgets (cannot publish an empty dashboard)
- Once published, the dashboard appears in the assignment UI
- Editing a published dashboard takes effect immediately for all assigned users on next data refresh (no unpublish required)
- Audit log entry created: `entity_type: 'dashboard'`, `action: 'published'`, `by: adminId`

**Priority:** P0 | **Points:** 2

---

#### US-007 — Delete Dashboard Template

**As a** super admin,  
**I want** to delete a dashboard template,  
**so that** obsolete dashboards don't clutter the admin view.

**Acceptance Criteria:**

- `DELETE /api/v1/admin/dashboards/:id` soft-deletes the template
- If the template has active assignments, the API returns 409 with a message listing how many roles/users are assigned
- Admin must confirm deletion (frontend shows: "This dashboard is assigned to 3 roles and 2 users. Deleting it will remove it from their tabs. Confirm?")
- On confirmation (second DELETE call with `?force=true`), all associated assignments are removed and the template is deleted
- Deleted templates are not visible in any listing or assignment UI
- Returns 403 if caller lacks `dashboard.manage`

**Priority:** P1 | **Points:** 3

---

#### US-008 — Duplicate Dashboard Template

**As a** super admin,  
**I want** to duplicate an existing dashboard template,  
**so that** I can create a variant without rebuilding from scratch.

**Acceptance Criteria:**

- `POST /api/v1/admin/dashboards/:id/duplicate` creates a new template in `draft` status
- Copy has name: `"Copy of [original name]"`
- All widget configurations (positions, filters, @ctx vars, titles) are preserved exactly
- Original's assignments are NOT copied — the duplicate starts with zero assignments
- `createdBy` is set to the admin making the duplicate request, not the original creator

**Priority:** P1 | **Points:** 2

---

### Epic 3: Dashboard Assignment

---

#### US-009 — Assign Dashboard to a Role

**As a** super admin,  
**I want** to assign a published dashboard template to a role,  
**so that** all users with that role automatically see the dashboard as a tab.

**Acceptance Criteria:**

- `POST /api/v1/admin/dashboards/:id/assignments` with body `{ assigneeType: 'role', assigneeId: roleId }`
- Assignment is tenant-scoped (admin can only assign within their tenant's roles)
- Returns 409 on duplicate assignment (same template + same role already exists)
- `tabOrder` defaults to the count of existing assignments for that role
- Admin sees the assignment in the assignments list immediately
- Returns 422 if the template is in `draft` status (only published templates can be assigned)

**Priority:** P0 | **Points:** 3

---

#### US-010 — Assign Dashboard to an Individual User

**As a** super admin,  
**I want** to assign a dashboard to a specific user individually,  
**so that** I can give a power user extra dashboards beyond what their role provides.

**Acceptance Criteria:**

- `POST /api/v1/admin/dashboards/:id/assignments` with `{ assigneeType: 'user', assigneeId: userId }`
- Individual user assignments appear as additional tabs AFTER role-based tabs in the user's dashboard view
- `tabOrder` for user assignments starts after the last role-based tab order value
- `isDefaultTab` can be set to `true` — this overrides the role-based default tab for this user
- If the same template is already assigned via role AND individually, the user only sees it once (deduplication in resolution logic)
- Admin can search users by name/email in the assignment UI

**Priority:** P0 | **Points:** 3

---

#### US-011 — Set Default Tab for Role Assignment

**As a** super admin,  
**I want** to mark one dashboard as the default tab for a role,  
**so that** users with that role land on the most relevant dashboard when they first visit.

**Acceptance Criteria:**

- `PUT /api/v1/admin/dashboards/:id/assignments/:asgId` with `{ isDefaultTab: true }`
- Setting a new default automatically unsets `isDefaultTab` on any previous default for that role
- Only one assignment per role can be `isDefaultTab: true` at a time
- Individual user override: if a user has their own assignment with `isDefaultTab: true`, it overrides the role default for that user only

**Priority:** P1 | **Points:** 2

---

#### US-012 — Dashboard Assignment Resolves on Role Change

**As a** user whose role has been changed by an admin,  
**I want** my dashboard tabs to update to reflect my new role's dashboards,  
**so that** I always see the dashboards appropriate to my current role.

**Acceptance Criteria:**

- Role-based dashboard assignments are resolved dynamically at `/me/dashboards` request time — no cache of role assignments per user
- When user's role changes, next page load shows updated dashboards without any manual admin action
- Individual user assignments persist through role changes (not removed when role changes)
- If new role has no dashboard assigned, user sees: "Your administrator has not set up a dashboard for your role yet."

**Priority:** P0 | **Points:** 2

---

### Epic 4: Dashboard Viewer (End User Experience)

---

#### US-013 — View Assigned Dashboards as Tabs

**As a** logged-in user,  
**I want** to see all my assigned dashboards as tabs at the top of the dashboard page,  
**so that** I can navigate between different views of my data.

**Acceptance Criteria:**

- `GET /me/dashboards` returns my ordered tab list within 200ms (metadata only)
- Dashboard page renders the tab bar immediately; widget data loads asynchronously
- Active/default tab is highlighted; user's last-viewed tab is remembered via `UserDashboardPreference`
- If zero dashboards assigned: full-page empty state shown with message and icon — no error
- If one dashboard: no tab bar (single dashboard shown directly without tab chrome)
- Tab bar scrolls horizontally on overflow (does not wrap or truncate)
- On mobile: tab bar collapses to a `<select>` dropdown

**Priority:** P0 | **Points:** 5

---

#### US-014 — Widget Loading and Error States

**As a** user viewing my dashboard,  
**I want** each widget to show a loading placeholder while its data loads, and a clear error state if it fails,  
**so that** the page is usable immediately and I understand when something goes wrong.

**Acceptance Criteria:**

- All widgets render a skeleton (matching the widget's size and shape) while data is being fetched
- Skeleton uses CSS animation (pulsing grey) — no spinners on individual widgets
- On load success: data is rendered; footer shows "Last updated: [time]"
- On error (network/server): widget shows "Could not load this widget" + retry button
- On timeout (> 10s): same error state with "Timed out" label
- On 403 (no permission): widget shows lock icon + "You do not have access to this data"
- On empty data: widget shows "No data for the selected period" with an icon (not 0 or blank)
- Retrying a failed widget does not reload the entire dashboard

**Priority:** P0 | **Points:** 5

---

#### US-015 — Global Date Range Filter

**As a** user on my dashboard,  
**I want** to change the date range from a global picker at the top and have all widgets update,  
**so that** I can quickly shift my view from the last 30 days to last 7 days, for example.

**Acceptance Criteria:**

- Global filter bar shows a date range picker: presets 7d / 30d / 90d / 365d + custom range
- Changing the global range triggers a refetch for all widgets on the active tab that have `dateRangeSupported: true`
- Widgets with a widget-level date override (configured in builder with `overrideGlobal: true`) do NOT update — they maintain their own range
- The global selection is applied to the active tab only — switching tabs applies that tab's own stored date range
- User's date range selection is persisted in `UserDashboardPreference.activeDateRangeDays`
- If `allowUserDateOverride: false` on the template, the date picker is hidden/disabled

**Priority:** P1 | **Points:** 3

---

#### US-016 — Widget Drill-Through to List Page

**As a** user clicking on a data segment in a chart,  
**I want** to be taken to the relevant list page with that filter pre-applied,  
**so that** I can investigate the underlying records behind a KPI.

**Acceptance Criteria:**

- Clicking a segment/bar/slice on a chart widget navigates to the configured drill-through URL
- Example: clicking "Open" in the ticket status donut navigates to `/tickets?status=open`
- Example: clicking a bar for "Centre A" in the attendance chart navigates to `/attendance?centreId=[id]`
- The target list page reads the URL query params on mount and applies them to its filter state
- Drill-through is only available on widgets with `supportsDrillThrough: true` in their definition
- Cursor changes to pointer on hoverable chart segments to indicate interactivity
- A breadcrumb or back link on the list page shows "← Back to Dashboard" (uses browser history)

**Priority:** P1 | **Points:** 5

---

#### US-017 — Collapse Individual Widgets

**As a** user,  
**I want** to collapse widgets I don't frequently use to save screen space,  
**so that** I can focus on the widgets most relevant to me.

**Acceptance Criteria:**

- Each widget has a collapse toggle in its header (chevron icon)
- Collapsed widget shows only its header/title bar; body is hidden
- Collapsed state is saved to `UserDashboardPreference.collapsedWidgetIds` via `PUT /me/dashboards/:id/preferences`
- Preference persists across sessions and devices
- Collapsing/expanding does not trigger a data refetch
- Admin can set a widget as `isCollapsedDefault: true` in the builder — it starts collapsed for all users until they expand it

**Priority:** P2 | **Points:** 3

---

### Epic 5: Context Variables & Self-Filtering

---

#### US-018 — Context Variable Injection is Server-Side Only

**As a** security requirement,  
**I need** all context variable resolution to happen exclusively server-side,  
**so that** users cannot forge their identity to see other users' data.

**Acceptance Criteria:**

- Client sends `"@ctx.userId"` as a literal filter value; server replaces it with the JWT-derived `userId` before executing any query
- No API endpoint accepts a raw user ID as a scope override when a `@ctx.*` variable is configured on the widget
- If a client sends `userId: "some_other_user_id"` in the request, it is ignored; only the JWT-derived value is used
- Unit tests cover: (a) context var resolves correctly from JWT, (b) manual userId override is rejected, (c) unknown context var returns widget "Insufficient context" state

**Priority:** P0 | **Points:** 3

---

#### US-019 — "My Data" Pattern: Single Template for All Agents

**As a** super admin,  
**I want** to build one "Agent Work Queue" dashboard that automatically shows each agent only their own tickets,  
**so that** I don't need to create 400 individual dashboards for 400 agents.

**Acceptance Criteria:**

- Admin configures `my_assigned_tickets` widget with filter: `assignedTo = @ctx.userId`
- Admin saves and publishes template; assigns it to the "Agent" role
- Agent A logs in → sees their own assigned tickets only
- Agent B logs in → sees only their own assigned tickets
- Super admin reviewing the builder sees `"@ctx.userId"` displayed as the filter value with a tooltip: "Resolves to the viewing user's account ID"
- Test case: same API endpoint with two different JWT tokens returns two different datasets

**Priority:** P0 | **Points:** 3

---

#### US-020 — Facilitator Sees Only Their Centre's Data

**As a** centre facilitator,  
**I want** my dashboard widgets to automatically show data for my centre only,  
**so that** I don't see data from other centres I'm not responsible for.

**Acceptance Criteria:**

- Widgets on the Facilitator dashboard template use filter: `centreId = @ctx.centreId`
- `@ctx.centreId` resolves from the facilitator's user record (`user.centreId`)
- If facilitator has no `centreId` assigned, affected widgets show: "No centre assigned to your account. Contact your administrator."
- Attendance, ticket, user count widgets all scope correctly to the facilitator's centre
- A facilitator cannot access dashboard data for other centres by manipulating API calls

**Priority:** P0 | **Points:** 3

---

### Epic 6: Widget Data — Ticketing KPIs

---

#### US-021 — Open Ticket Count Widget

**As a** user with the ticket_open_count widget on my dashboard,  
**I want** to see the current count of open tickets within my scope,  
**so that** I have an at-a-glance view of outstanding work.

**Acceptance Criteria:**

- Query counts tickets where `status NOT IN ('closed', 'resolved')` + scope filters
- KPI tile shows: value (integer), trend vs previous equivalent period, sparkline for last 7 data points
- `trendDirection: 'lower_is_better'` — red arrow if count increased, green if decreased
- Cache TTL: 60 seconds
- `ticket.created` and `ticket.closed` events invalidate this widget's cache
- Scope enforcement: Super Admin sees all; DNO sees district; Agent sees `assignedTo = @ctx.userId` if configured

**Priority:** P0 | **Points:** 3

---

#### US-022 — SLA Resolution Rate Widget

**As a** super admin or district officer,  
**I want** to see what percentage of closed tickets were resolved within their SLA deadline,  
**so that** I can monitor the team's SLA performance.

**Acceptance Criteria:**

- Formula: `(tickets WHERE status IN ('closed','resolved') AND closedAt <= slaDueAt AND closedAt IN period) / (tickets WHERE status IN ('closed','resolved') AND closedAt IN period) × 100`
- Tickets with `slaDueAt IS NULL` are excluded from BOTH numerator and denominator
- If denominator is 0 (no tickets closed in period): widget displays "No data" — never 0%
- KPI tile shows: percentage (1 decimal, e.g. "87.4%"), trend delta vs previous period, direction arrow
- Green = rate improved (higher), red = rate declined — because `trendDirection: 'higher_is_better'`
- Gauge visualisation: green zone ≥ threshold (default 80%), amber 60–threshold, red < 60%; thresholds configurable per widget instance in builder
- Supported filters configurable in builder: category, priority, assignedAgent, projectId
- Cache TTL: 300 seconds; invalidated by `ticket.closed` event

**Priority:** P1 | **Points:** 5

---

#### US-023 — Ticket by Status Donut Chart

**As a** user with the ticket_by_status widget,  
**I want** to see a donut chart of ticket counts grouped by status,  
**so that** I understand the current distribution at a glance.

**Acceptance Criteria:**

- Returns counts for each distinct `status` value within scope and date range
- Chart renders as donut with legend; each segment labelled with status name + count + %
- Hover tooltip shows exact count and percentage
- Clicking a segment triggers drill-through to `/tickets?status=[status]`
- Empty state: "No tickets in the selected period" — no empty donut
- Cache TTL: 120 seconds

**Priority:** P1 | **Points:** 3

---

### Epic 7: Widget Data — User/Onboarding KPIs

---

#### US-024 — Users Required vs Onboarded Widget

**As a** district nodal officer, super admin, or project head,  
**I want** to see the target number of users required for a project vs how many are currently active,  
**so that** I can track onboarding progress against the plan.

**Acceptance Criteria:**

- Widget supports two modes, configurable per instance in the dashboard builder:
  - **`project_total` mode** (default for project-scoped views): `required = Project.userTarget.required` — the fixed headcount target set on the project; `current = COUNT(active users in project)`
  - **`monthly` mode**: `required = user_targets.targetCount` WHERE `targetMonth = first day of current month` AND `scope = @ctx.districtId / centreId / tenantId`
- "Users Onboarded (MTD)" in monthly mode = COUNT(users) WHERE `createdAt >= first day of current month` AND `createdAt <= NOW()` AND `status = 'active'` AND scope applied
- If target not configured in either mode: widget shows "Target not set — [+ Set target]" link (leads to `/admin/targets`) — NOT 0 required
- Users in `pending`, `suspended`, `deactivated` status are NOT counted in Onboarded
- KPI tile pair shows two numbers side by side: "Required: 130" / "Have: 87" with a thin progress bar below showing % filled (66.9%)
- Gap is shown as a third sub-value: "Gap: 43" in red if gap > 20% of required, amber if 5–20%, green if < 5%
- Bar chart visualisation option: one grouped bar per centre/project — grey bar (Required), teal bar (Have)
- Cache TTL: 900 seconds; invalidated by `user.created` (status=active) event and `user_target.updated` event
- DNO scope (monthly mode): aggregates all centres in their district — they do NOT see figures from other districts
- Project Head scope: restricted to their assigned project(s) only

**Priority:** P1 | **Points:** 8

---

#### US-025 — Onboarding Gap Widget

**As a** district officer or facilitator,  
**I want** to see the gap between required and actual onboarded users as a single number,  
**so that** I know how many more users need to be onboarded this month.

**Acceptance Criteria:**

- Gap = `targetCount - onboardedCount`; never displays negative — if onboarded ≥ required, shows "On track" with green indicator
- KPI tile: value (e.g. "26 remaining"), status colour — red if gap > 20% of required, amber if 5–20%, green if < 5%
- If target not configured: shows "Target not configured" (inherits from US-024 data source)
- Same scope rules as US-024

**Priority:** P1 | **Points:** 3

---

#### US-026 — Bulk Import User Targets via CSV

**As a** super admin,  
**I want** to upload a CSV file with target user counts per centre per month,  
**so that** I can configure all targets at once without entering each one manually.

**Acceptance Criteria:**

- CSV format: `centre_id, target_month (YYYY-MM), target_count, role_id (optional)`
- Upload endpoint: `POST /api/v1/admin/user-targets/import` (multipart/form-data)
- Validates each row: centre must exist, target_month must be a valid first-of-month, target_count must be positive integer
- Returns a preview response before saving: `{ valid: 47, invalid: 3, errors: [{row:5, reason:"Centre not found"}] }`
- Admin confirms the import; another POST with `?confirm=true` persists valid rows
- Duplicate rows (same centre + month) are updated (upsert), not rejected
- After import, fires `user_target.updated` cache invalidation event for all affected centres

**Priority:** P2 | **Points:** 5

---

#### US-050 — Set Project-Level User Requirement (Total Headcount Target)

**As a** super admin or project head,  
**I want** to set a total required user count on a project (e.g. "this project needs 130 users"),  
**so that** the dashboard can show "Required: 130 / Have: 87 / Gap: 43" without needing a monthly schedule.

**Acceptance Criteria:**

- `PUT /api/v1/admin/projects/:id/user-target` with body `{ "required": 130 }` — updates `Project.userTarget.required`
- `GET /api/v1/admin/projects/:id/user-target` returns `{ required: 130, current: 87, gap: 43, percentFilled: 66.9, updatedBy: {...}, updatedAt: "..." }`
- `current` is computed live: `COUNT(users WHERE projectId = id AND status = 'active')`
- `required: null` means target not configured — dashboard widget shows "Target not set" (not 0)
- Setting `required` to `null` removes the target
- Only users with `project.manage` or `dashboard.manage` permission can set/update the target
- Project Head can set targets only for their own assigned project(s)
- Audit log entry on every change: `event: 'project_user_target_updated'`, `projectId`, `oldRequired`, `newRequired`, `changedBy`
- Cache for the "Required vs Onboarded" widget is invalidated on change (`user_target.updated` event)

**Priority:** P1 | **Points:** 3

---

#### US-051 — Target Management UI in Admin Panel

**As a** super admin or project head,  
**I want** a simple table in the admin panel that lists all projects with their required, current, and gap user counts,  
**so that** I can see and edit targets in one place without using bulk CSV upload.

**Acceptance Criteria:**

- Admin panel page `/admin/targets` (or tab within Project settings): table with columns — Project Name, Required, Current (live), Gap, % Filled, Last Updated By
- Clicking the "Required" cell makes it inline-editable (number input); pressing Enter or clicking away saves via `PUT /api/v1/admin/projects/:id/user-target`
- Gap column: colour-coded — red if gap > 20% of required, amber if 5–20%, green if < 5%, grey if no target set
- "% Filled" shows a thin progress bar in-cell (e.g. 66.9% filled = teal fill)
- Unset targets show a "+ Set target" button in the Required cell instead of a number
- Save is optimistic — cell updates immediately; rolls back with toast error if API fails
- Project Head sees only their project(s) in this table
- Monthly targets (per-centre, per-month) are managed via a separate tab on the same page (existing bulk CSV flow + future row-level edit)
- Pagination if > 20 projects; search/filter by project name

**Priority:** P1 | **Points:** 5

---

### Epic 8: Widget Data — Centre Capacity KPIs

---

#### US-027 — Centre Ideal vs Active Count Widget

**As a** super admin or district officer,  
**I want** to see each centre's ideal (sanctioned) capacity vs current active user count,  
**so that** I can identify under-utilised or over-capacity centres.

**Acceptance Criteria:**

- "Ideal Count" = `centre.idealCount` (manually set by admin)
- "Active Count" = COUNT(users) WHERE `centreId = centre._id` AND `status = 'active'`
- Centres with `idealCount IS NULL` appear in a separate "Unconfigured" section of the table view with a "Configure" link to `/admin/centres/:id`
- Unconfigured centres are excluded from gauge and aggregate calculations
- Table visualisation: columns — Centre Name, District, Ideal, Active, Gap, Utilisation %, Status badge
- Status badge: "Under capacity" (blue, gap > 0), "At capacity" (green, gap = 0), "Over capacity" (amber, active > ideal)
- Bar chart: grouped bars per centre — grey bar (ideal), teal bar (active); active bars exceeding ideal shown in amber
- Utilisation above 100% displayed as-is (e.g. "112%") with amber indicator — NOT capped
- Cache TTL: 1800 seconds; invalidated immediately on `centre.ideal_count_changed` event and on `user.status_changed` event

**Priority:** P1 | **Points:** 8

---

#### US-028 — Edit Centre Ideal Count

**As a** super admin or district admin,  
**I want** to set or update the ideal count for a centre from the centre settings page,  
**so that** the capacity widgets reflect current planning targets.

**Acceptance Criteria:**

- `PUT /api/v1/admin/centres/:id` accepts `idealCount` field update
- `idealCount` must be a positive integer; returns 422 if <= 0 or non-integer
- On save: `idealCountUpdatedBy` and `idealCountUpdatedAt` are stamped
- Audit log entry: `entity_type: 'centre'`, `field: 'idealCount'`, `beforeValue`, `afterValue`, `changedBy`
- Cache invalidation: immediately fires `centre.ideal_count_changed` event for this `centreId`; all three centre capacity widget cache entries for this centre are purged
- Permission required: `centre.manage` (existing permission)

**Priority:** P1 | **Points:** 3

---

### Epic 9: Dashboard Builder UI

---

#### US-029 — Widget Panel and Grid Canvas

**As a** super admin in the dashboard builder,  
**I want** a left panel listing available widgets and a grid canvas where I place them,  
**so that** I can visually compose a dashboard layout.

**Acceptance Criteria:**

- Left panel lists all active widget definitions grouped by module, searchable by name
- Each widget card shows: name, module badge, default visualisation icon, description tooltip on hover
- Dragging a widget card from the panel onto the canvas places it at 4 cols wide × 2 rows tall (default)
- Canvas is a 12-column grid with visible gridlines (toggleable)
- Placed widgets show their title, a mock/preview of their visualisation type
- Dragging a placed widget repositions it; drag handle is a dotted grip area in widget header
- Resize handle at bottom-right corner; minimum 2×1, maximum 12×6
- Overlapping widgets are highlighted with a red outline warning
- Widget count shown in builder top bar: "9 widgets"
- Undo/redo buttons in top bar; supports 10 steps
- Auto-save to draft every 30 seconds (debounced)

**Priority:** P1 | **Points:** 13

---

#### US-030 — Widget Configuration Panel

**As a** super admin in the builder,  
**I want** to click a placed widget and configure its title, visualisation type, date range, filters, and colour,  
**so that** each widget is precisely tuned to its purpose.

**Acceptance Criteria:**

- Clicking a placed widget opens a right-side configuration panel (drawer or sidebar)
- Panel shows: title input, visualisation type selector (only types in the definition's `supportedVisualisations`), date range selector (7/30/90/365 or custom), filter builder, colour theme picker, show/hide header toggle, refresh interval selector
- Filter builder: shows each filter param declared in the widget definition; value input accepts literals OR `@ctx.*` variable picker
- `@ctx.*` picker shows a dropdown of all available context variables with descriptions
- Gauge widgets show threshold configuration: green min %, amber min %
- Changes are reflected live in the canvas preview (mock data for preview)
- "Remove widget" button in the panel with confirmation

**Priority:** P1 | **Points:** 8

---

#### US-031 — Mobile Preview in Builder

**As a** super admin,  
**I want** to toggle a mobile preview in the builder,  
**so that** I can verify the dashboard layout works on narrow screens before publishing.

**Acceptance Criteria:**

- "Mobile Preview" toggle in builder top bar
- Mobile preview renders the canvas in a ~375px wide frame
- Widgets stack in a single column, ordered by `displayOrder` (left-to-right, top-to-bottom)
- Preview is read-only — admin cannot drag/resize in mobile preview mode
- Exiting mobile preview returns to desktop grid view
- Switching to preview does not lose any unsaved changes

**Priority:** P2 | **Points:** 3

---

#### US-032 — Dashboard Export and Import

**As a** super admin,  
**I want** to export a dashboard template as a JSON file and import one from JSON,  
**so that** I can share configurations between tenants or restore from backup.

**Acceptance Criteria:**

- `GET /api/v1/admin/dashboards/:id/export` returns a JSON file download
- Export JSON contains: template metadata, widget configurations, filter configs (with `@ctx.*` variables intact), grid positions — but NOT tenant-specific IDs (no `tenantId`, no actual `roleId` in assignments)
- `POST /api/v1/admin/dashboards/import` accepts the JSON file; creates template in `draft` status under the importing admin's tenant
- Any widgets in the import that reference a `widgetKey` not present in the importing tenant's registry are listed as warnings and excluded from the import
- Imported template name gets "(Imported)" suffix to distinguish from originals
- Import validates JSON schema; returns 422 with detailed errors for malformed files
- Requires `dashboard.export_import` permission

**Priority:** P2 | **Points:** 5

---

### Epic 10: Pre-Built Dashboard Templates

---

#### US-033 — Seed Pre-Built Dashboard Templates

**As a** system administrator setting up a new tenant,  
**I want** the five pre-built dashboard templates to be available immediately,  
**so that** the system is useful out of the box without manual configuration.

**Acceptance Criteria:**

- On first-time tenant setup, seed script creates all 5 templates: Executive Overview, District Performance, Centre Operations, Agent Work Queue, My Services Overview
- Each template is pre-configured with widgets, grid positions, and filter configurations (including appropriate `@ctx.*` variables)
- Templates are marked `isSystemDefault: true` and `status: 'published'`
- Templates are also assigned to their default roles automatically (Super Admin → Executive Overview, etc.)
- Seeded templates can be duplicated and modified; the originals remain unchanged as reference
- Seed is idempotent — re-running on an existing tenant does not create duplicates

**Priority:** P0 | **Points:** 8

---

### Epic 11: RBAC Integration

---

#### US-034 — Dashboard Permissions Seeded for All Roles

**As a** system,  
**I need** the five new dashboard permissions to be seeded and assigned to their default roles,  
**so that** access control works correctly from the start.

**Acceptance Criteria:**

- Permissions seeded: `dashboard.manage`, `dashboard.assign`, `dashboard.view`, `dashboard.personal_create`, `dashboard.export_import`
- Super Admin role gets all five permissions
- District Nodal Officer, Facilitator, Agent, End User roles get `dashboard.view`
- No other role gets `dashboard.manage` or `dashboard.assign` by default
- All dashboard API endpoints enforce the correct permission via existing `requirePermission()` middleware
- A user without `dashboard.view` accessing `/dashboard` sees a 403 page, not the dashboard

**Priority:** P0 | **Points:** 3

---

#### US-035 — Widget Module Permission Check

**As a** user without attendance module access,  
**I want** attendance widgets on my dashboard to show a "no permission" state,  
**so that** I'm not shown an error and no attendance data is leaked to me.

**Acceptance Criteria:**

- Each widget definition's `requiresPermissions` array is checked against the requesting user's permissions before executing the query
- If user lacks required permission: returns HTTP 403 from the widget data endpoint
- Frontend `WidgetFrame` renders the "No Permission" state on 403 (lock icon + "You do not have access to this data")
- This check happens server-side — the widget data endpoint returns 403 regardless of how the request is made (direct API call, Postman, etc.)
- In the builder's widget panel, widgets the admin building the dashboard does not have module access to are greyed out with a tooltip explaining why

**Priority:** P0 | **Points:** 3

---

### Epic 12: Non-Functional & Infrastructure

---

#### US-036 — Dashboard Resolution Under 200ms

**As a** user navigating to the dashboard,  
**I want** the tab list to appear instantly (< 200ms),  
**so that** the page feels responsive even before widget data loads.

**Acceptance Criteria:**

- `GET /me/dashboards` must return within 200ms at p95 under normal load
- Implementation: query `dashboard_assignments` by `(assigneeType: 'role', assigneeId: userRoleId)` + `(assigneeType: 'user', assigneeId: userId)` — both indexed queries
- Dashboard widget configs are joined in the same response (embedded in template)
- No widget data is fetched in this call — only metadata
- Load test: 200 concurrent requests to `/me/dashboards` must all return within 200ms

**Priority:** P0 | **Points:** 3

---

#### US-037 — Parallel Widget Data Fetching

**As a** user,  
**I want** all dashboard widgets to load their data simultaneously (not one after another),  
**so that** the page fully populates as fast as possible.

**Acceptance Criteria:**

- Frontend fires all widget data API requests in parallel using `Promise.all` / React Query parallel queries — not sequentially
- Backend: each widget data request is an independent stateless API call; no sequential dependencies between them
- N+1 query prevention: the widget query engine for aggregate widgets (e.g. `attendance_by_centre`) fetches all centres in one query, not one query per centre
- A dashboard with 10 widgets must fully load (all widgets rendered) within the time of the slowest single widget, not the sum of all widgets

**Priority:** P0 | **Points:** 3

---

#### US-038 — Widget Data Caching with Redis

**As a** system operator,  
**I want** widget data responses to be cached in Redis with appropriate TTLs,  
**so that** the database is not hit on every page load for every user.

**Acceptance Criteria:**

- All widget data endpoints check Redis cache before executing the MongoDB query
- Cache key encodes: `widgetKey + tenantId + resolvedScopeHash + paramHash`
- Cache HIT: returns cached data with `cached: true` and `cacheExpiresAt` in response
- Cache MISS: executes query, stores result in Redis with the widget definition's `cacheTtlSeconds`
- Event-driven invalidation: relevant events clear affected cache keys (see Section 8)
- Cache can be manually cleared per widget via admin action (for debugging)
- If Redis is unavailable, the system falls back to direct DB queries gracefully (no 500 errors)

**Priority:** P0 | **Points:** 5

---

#### US-039 — Attendance KPI Widgets

**As a** district officer or facilitator,  
**I want** to see today's attendance rate and month-to-date attendance rate on my dashboard,  
**so that** I can monitor attendance at a glance without navigating to the attendance module.

**Acceptance Criteria:**

- `attendance_today_rate`: count of attendance records for today's date / total active users in scope × 100
- `attendance_mtd_rate`: average daily attendance rate for the current month to date
- `attendance_today_vs_mtd`: KPI tile pair — today's rate left, MTD rate right; difference shown as arrow
- Date is resolved server-side in the tenant's configured timezone (not UTC)
- Scope: DNO → all centres in district; Facilitator → their centre (`@ctx.centreId`)
- Empty state: "No attendance data recorded today" — not 0%
- Cache TTL: 300 seconds; invalidated by `attendance.submitted` event

**Priority:** P1 | **Points:** 5

---

## 11. Definition of Done

A user story is done when:

1. Backend API endpoint implemented, passes unit tests, returns correct data for all scope levels
2. Frontend widget renders all states: loading, loaded, empty, error, no-permission
3. Context variable resolution tested with at least 2 different user roles
4. Cache TTL and at least one invalidation event implemented
5. TypeScript: no compile errors
6. No new `console.log` debug statements
7. Existing tests still pass (no regression)
8. Code reviewed and merged to `dev`

---

---

## 13. CEO / Commissioner Dashboard — Scope Selector System

> **Addressing the CEO requirement:** One dashboard, four lens modes — All Projects, Specific Project, Specific Centre, Specific User — covering Tickets, Users, Feedback, and Attendance simultaneously.

---

### 13.1 The CEO Use Case — Two Different Problems

There are two distinct personalisation needs in this system that must not be confused:

| Need                                               | Mechanism                            | Example                              |
| -------------------------------------------------- | ------------------------------------ | ------------------------------------ |
| "Show me MY data" (user viewing their own)         | `@ctx.*` variable system (Section 2) | Agent sees their own tickets         |
| "Show me DATA FOR X" (admin inspecting any entity) | **Scope Selector** (this section)    | CEO switches to view Centre A's data |

The CEO needs the second: an **administrative scope override** that lets them pivot the entire dashboard's data lens to any project, centre, or individual user — on the fly, without leaving the dashboard.

---

### 13.2 Scope Selector — Architecture

The Scope Selector is a special component in the CEO dashboard's global filter bar. It is **separate from and overrides** widget-level filters and `@ctx.*` variables when active.

```
GlobalFilterBar (CEO Dashboard)
├── Date Range Picker          ← always visible
├── [Scope Mode Selector]      ← NEW: dropdown
│    ├── All Projects (default — no override)
│    ├── By Project            → shows Project Picker dropdown
│    ├── By Centre             → shows Centre Picker (searchable)
│    └── By User               → shows User Search (name / email / mobile)
└── Refresh All button
```

**Scope Mode** is a dashboard-level runtime state — it is NOT stored in the template. It is stored per session in `UserDashboardPreference.activeScopeOverride` (cleared on page reload by default, optional persistence).

```typescript
interface ScopeOverride {
  mode: "all" | "project" | "centre" | "user";
  projectId?: string; // set when mode = 'project'
  centreId?: string; // set when mode = 'centre'
  userId?: string; // set when mode = 'user' — admin-chosen user, NOT @ctx
}
```

The scope override is sent with every widget data request as a query parameter:

```
GET /api/v1/widgets/ticket_open_count/data
    ?dateRangeDays=30
    &scopeOverride[mode]=project
    &scopeOverride[projectId]=693bd618...
```

The backend validates that the requesting user (from JWT) has permission to view the requested scope before executing the query. A CEO/Super Admin can view any scope. A DNO can only scope to centres/projects within their district.

---

### 13.3 How Each Scope Mode Affects Widget Queries

| Scope Mode       | Effect on Widget Queries                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **All Projects** | Default Super Admin scope — tenant-wide aggregate. No override.                                                                                              |
| **By Project**   | Appends `projectId = [selected]` to every widget query. Replaces any `@ctx.projectIds` expansion.                                                            |
| **By Centre**    | Appends `centreId = [selected]` to every widget query. Widgets that don't support centre scope show "Not applicable at this scope level."                    |
| **By User**      | Appends `userId = [selected]` to every widget query. Each widget shows that user's data: their tickets, their attendance, their feedback, their user record. |

The **Scope Enforcer** (Section 4.3) is updated to apply scope overrides AFTER context variable resolution:

```
Priority chain (highest wins):
  1. tenantId (always, non-overrideable — tenant isolation)
  2. ScopeOverride (if set by admin in the filter bar)
  3. Widget-level configured filters
  4. @ctx.* auto-scope (role-based default)
```

---

### 13.4 CEO All-In-One Dashboard Template

**Name:** Commissioner Executive View  
**Scope Selector:** Enabled  
**Default Mode:** All Projects  
**Modules:** Tickets + Users + Attendance + Feedback — all on one canvas

**Suggested Layout (4-section grid):**

```
┌─────────────────────────────────────────────────────────────────┐
│  SCOPE:  [All Projects ▼]  [Date: Last 30 days ▼]  [↻ Refresh] │
├────────────┬────────────┬────────────┬─────────────────────────┤
│            │            │            │                          │
│ TICKET     │ USER       │ ATTENDANCE │  FEEDBACK                │
│ SUMMARY    │ SUMMARY    │ SUMMARY    │  SUMMARY                 │
│            │            │            │                          │
│ Open: KPI  │ Total: KPI │ Today %    │  Avg Rating: KPI         │
│ Closed:KPI │ Active:KPI │ MTD %      │  Total Responses: KPI    │
│ SLA Rate % │ New MTD    │ Today vs   │  Positive/Neg split      │
│ Breached   │ Req vs On  │ MTD pair   │  Pending Action: KPI     │
│            │            │            │                          │
├────────────┴──────┬─────┴────────────┴─────────────────────────┤
│                   │                                              │
│  Ticket Trend     │  Users Required vs Onboarded (bar chart)    │
│  (line, 30d)      │  — grouped by project/centre                │
│                   │                                              │
├───────────────────┴──────────────────────────────────────────────┤
│                                                                   │
│  Centre Ideal vs Active (bar chart — all centres)                │
│                                                                   │
├─────────────────────────────┬─────────────────────────────────  ┤
│  Tickets by Category (donut)│  Attendance by Centre (bar chart)  │
│                             │                                     │
├─────────────────────────────┴─────────────────────────────────   ┤
│  Top 10 Unresolved Tickets (table — with drill-through)           │
└───────────────────────────────────────────────────────────────── ┘
```

**Behaviour when CEO selects "By Project: Maharashtra CET 2026":**

- All KPI tiles refresh to show data for that project only
- Trend line shows that project's ticket volume
- User onboarding bar chart shows only centres in that project
- Attendance shows only students in that project
- Feedback shows only feedback submitted for that project

**Behaviour when CEO selects "By Centre: Pune Centre 3":**

- All KPI tiles scope to Pune Centre 3
- Onboarding widget shows Pune Centre 3's required vs onboarded
- Centre capacity shows a single row (just this centre)
- Attendance shows Pune Centre 3's daily rates
- Ticket widget shows tickets raised by or assigned to users at that centre

**Behaviour when CEO selects "By User: Rahul Sharma" (search by name/email/mobile):**

- Ticket widgets show Rahul's tickets only
- Attendance widget shows Rahul's personal attendance history
- Feedback widget shows feedback submitted by or about Rahul
- User widget shows Rahul's profile summary: role, status, centre, project memberships, last login

---

### 13.5 "By User" Widget Behaviour — User Profile Dashboard Mode

When `scopeOverride.mode = 'user'`, each widget that supports user-level scope shifts into a **user profile card mode**:

| Widget                    | "By User" Output                                                        |
| ------------------------- | ----------------------------------------------------------------------- |
| `ticket_open_count`       | Count of tickets created by or assigned to this user                    |
| `my_assigned_tickets`     | All tickets for this user (table view)                                  |
| `attendance_mtd_rate`     | This user's attendance % for the current month                          |
| `my_attendance_summary`   | Calendar view of this user's attendance                                 |
| `feedback_response_count` | Feedback this user has submitted                                        |
| `user_total_count`        | Replaced by a user profile card: name, role, centre, status, last login |
| `user_by_role`            | Not applicable at user scope — renders "N/A at user level"              |

This effectively turns the CEO dashboard into a **360° user view** when a specific user is selected — seeing all their activity across every module from one screen.

---

### 13.6 Scope Selector Permission Model

The Scope Selector is controlled by a new permission: `dashboard.scope_override`.

| Role                       | Can Override Scope | Scope Limits                                                     |
| -------------------------- | ------------------ | ---------------------------------------------------------------- |
| Super Admin / Commissioner | Yes                | Any project, centre, user in the tenant                          |
| **Project Head**           | **Yes**            | **Only projects/centres/users within their assigned project(s)** |
| District Nodal Officer     | Yes                | Only projects/centres/users within their district                |
| Facilitator                | No                 | Scope Selector is hidden; their centre is always `@ctx.centreId` |
| Agent                      | No                 | Scope Selector hidden; personal scope via `@ctx.*` only          |
| End User                   | No                 | Scope Selector hidden                                            |

The backend validates the scope override against the requesting user's `districtId`/`projectIds` claims. A DNO cannot select a centre outside their district even via direct API call. A **Project Head** cannot select any project, centre, or user outside their assigned project(s) — see Section 16 for full specification.

---

### 13.7 Widget `scopeSupport` Declaration

Each widget definition declares which scope modes it can meaningfully handle. This prevents nonsensical combinations (e.g. "Centre Ideal vs Active" at user scope makes no sense).

```typescript
// Added to WidgetDefinition schema:
scopeSupport: {
  all:     Boolean,  // tenant-wide aggregate
  project: Boolean,  // scoped to a single project
  centre:  Boolean,  // scoped to a single centre
  user:    Boolean,  // scoped to a single user
}
```

| Widget                       | all | project | centre          | user                          |
| ---------------------------- | --- | ------- | --------------- | ----------------------------- |
| `ticket_open_count`          | ✅  | ✅      | ✅              | ✅                            |
| `attendance_today_rate`      | ✅  | ✅      | ✅              | ❌ (daily rate needs a group) |
| `my_attendance_summary`      | ❌  | ❌      | ❌              | ✅                            |
| `centre_ideal_vs_active`     | ✅  | ✅      | ✅ (single row) | ❌                            |
| `user_required_vs_onboarded` | ✅  | ✅      | ✅              | ❌                            |
| `user_total_count`           | ✅  | ✅      | ✅              | ❌ → becomes profile card     |

When the CEO switches to a scope mode that a widget doesn't support, the widget renders: **"Not available at [Centre / User] level"** with an info icon — it does NOT throw an error.

---

### 13.8 Scope Selector State Persistence

| Behaviour                                              | Implementation                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Switching tabs resets scope selector to "All Projects" | Default — prevents confusion when moving between dashboards                                   |
| CEO can "bookmark" a scoped view                       | URL query params: `/dashboard?tab=exec&scopeMode=project&projectId=693bd...` — shareable link |
| Last used scope is remembered within the session       | `sessionStorage` on frontend — cleared on browser close                                       |
| Scope selector state is shown in widget footer         | Each widget footer shows: "Scope: Project — Maharashtra CET 2026"                             |

---

## 14. What This Solves — CEO Requirements Matrix

| CEO Requirement                       | Solved By                                                                                     | How                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| All projects in one view              | Default Super Admin scope (`@ctx.tenantId` always applied)                                    | No scope selector needed; auto-applied                                 |
| Specific project view                 | Scope Selector → "By Project"                                                                 | Selects one project; all 4 module widgets update                       |
| Specific centre view (offline)        | Scope Selector → "By Centre"                                                                  | Centre picker; all attendance/user/ticket widgets scope to that centre |
| Specific user view                    | Scope Selector → "By User"                                                                    | User search; all widgets show that user's data across all modules      |
| User management data                  | `user_total_count`, `user_by_role`, `user_required_vs_onboarded`, `user_active_count` widgets | All on the same dashboard canvas                                       |
| Ticket data                           | `ticket_open_count`, `ticket_by_status`, `ticket_sla_resolution_rate`, `ticket_trend` widgets | All on the same dashboard canvas                                       |
| Feedback data                         | `feedback_avg_rating`, `feedback_response_count`, `feedback_sentiment_split` widgets          | All on the same dashboard canvas                                       |
| Attendance data                       | `attendance_today_rate`, `attendance_mtd_rate`, `attendance_by_centre` widgets                | All on the same dashboard canvas                                       |
| All modules customizable              | Widget registry — add/remove/reconfigure any widget in the builder                            | Admin rebuilds the CEO template any time; no code change               |
| One template, not rebuilding per user | `@ctx.*` variables for personal views; Scope Selector for admin views                         | Two complementary systems                                              |

---

## 15. User Stories — CEO Scope Selector (Epic 13)

---

#### US-040 — Scope Selector: All Projects Mode (Default)

**As a** CEO/Commissioner,  
**I want** my dashboard to show aggregated data across all projects in the tenant by default,  
**so that** I always start with the full picture.

**Acceptance Criteria:**

- When no scope override is active, all widgets run with `tenantId`-level scope only
- "All Projects" is shown as the default label in the Scope Selector dropdown
- Aggregate KPIs show totals across all projects (e.g. Open Tickets = sum across all projects)
- Scope Selector is only visible to users with `dashboard.scope_override` permission — hidden for all other roles
- Widget footer shows "Scope: All Projects"

**Priority:** P0 | **Points:** 2

---

#### US-041 — Scope Selector: Filter by Specific Project

**As a** CEO,  
**I want** to select a specific project from the Scope Selector and have every widget on the dashboard update to show only that project's data,  
**so that** I can deep-dive into a particular project without navigating away.

**Acceptance Criteria:**

- Selecting "By Project" in the Scope Selector reveals a project picker dropdown populated from the CEO's accessible projects
- On project selection, all widgets re-fetch with `scopeOverride.projectId` in the request
- All four module widgets (tickets, users, attendance, feedback) update simultaneously (parallel fetch)
- Widgets that don't support project scope render "N/A at project level"
- The selected project name is shown in the filter bar and in each widget's footer
- Clearing the selection returns all widgets to "All Projects" mode
- URL updates to include `?scopeMode=project&projectId=...` for shareability

**Priority:** P1 | **Points:** 5

---

#### US-042 — Scope Selector: Filter by Specific Centre (Offline Projects)

**As a** CEO reviewing an offline/centre-based project,  
**I want** to select a specific centre and see all data scoped to that centre,  
**so that** I can assess the operational health of any individual centre.

**Acceptance Criteria:**

- "By Centre" option in Scope Selector shows a searchable centre picker (search by name, district, or centre code)
- Centres list groups by district for easier navigation
- Attendance, ticket, user, and feedback widgets all scope to the selected centre
- `centre_ideal_vs_active` widget shows a single row for the selected centre (not a full table)
- `user_required_vs_onboarded` widget shows that centre's monthly target vs actual
- A DNO using this selector only sees centres within their own district — centres outside their district are not listed
- Widget footer shows "Scope: Centre — [Centre Name], [District]"

**Priority:** P1 | **Points:** 5

---

#### US-043 — Scope Selector: Filter by Specific User (360° User View)

**As a** CEO or district officer,  
**I want** to search for and select a specific user, and see all of their data across all modules on one screen,  
**so that** I can understand a user's full engagement without jumping between modules.

**Acceptance Criteria:**

- "By User" option shows a searchable user picker: search by name, email, or mobile number
- Results show: user name, role, centre, status (active/inactive)
- On selection, all user-scope-supporting widgets switch to that user's data:
  - Tickets: their open/closed tickets + table of recent tickets
  - Attendance: their MTD attendance rate + calendar view
  - Feedback: their submitted feedback history
  - User profile card: name, role, centre, project(s), last login, account status
- Widgets that do NOT support user scope (e.g. `centre_ideal_vs_active`) render "Not available at user level" — no error
- The user's name is shown prominently in the filter bar while user scope is active: "Viewing: Rahul Sharma"
- Selecting a different user from the picker updates all widgets without page reload
- Only users the selector has permission to view are searchable (DNO can only see users in their district)
- This does NOT use `@ctx.userId` — it uses `scopeOverride.userId` which is the selected user's ID

**Priority:** P1 | **Points:** 8

---

#### US-044 — Scope Selector: Permission Enforcement on Backend

**As a** security requirement,  
**I need** scope override requests to be validated server-side against the requesting user's own access scope,  
**so that** a DNO cannot use the scope selector to view data from another district.

**Acceptance Criteria:**

- Every widget data request with `scopeOverride` is validated: does the requesting user (from JWT) have authority over the requested scope entity?
- Super Admin: can override to any project, centre, or user in the tenant
- DNO: can only override to projects/centres/users within their `districtId`
- Validation failure returns 403 with message: "You do not have access to view data for [Centre Name]"
- This check runs BEFORE the widget query — no data is returned on a failed scope check
- A DNO cannot bypass this by directly calling the API with a centre ID from another district
- All scope override accesses are audit-logged: `entity: 'scope_override'`, `scopeMode`, `targetId`, `requestedBy`

**Priority:** P0 | **Points:** 3

---

#### US-045 — All-In-One CEO Dashboard Template (Multi-Module Seed)

**As a** system,  
**I need** the Commissioner Executive View dashboard seeded with widgets from all four modules (Tickets, Users, Attendance, Feedback) in a single canvas with scope selector enabled,  
**so that** the CEO has a complete operational view immediately after setup.

**Acceptance Criteria:**

- Template seeded: "Commissioner Executive View" with `scopeSelectorEnabled: true`
- Contains at minimum: 4 ticket KPI tiles, 4 user KPI tiles, 3 attendance KPI tiles, 3 feedback KPI tiles, ticket trend line, onboarding bar chart, centre capacity bar chart, top 10 unresolved tickets table
- All KPIs update correctly across all four scope modes (all / project / centre / user)
- Template assigned by default to Super Admin role
- Widgets not applicable in a given scope mode show "N/A" state, not errors
- Dashboard loads within 500ms to interactive state (widgets begin loading in parallel); all KPI tiles loaded within 3s under normal load

**Priority:** P0 | **Points:** 8

---

## 12. Sprint Breakdown Suggestion

| Sprint        | Stories                                                                                | Goal                                                                              |
| ------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Sprint 1 (2w) | US-001, US-002, US-003, US-012, US-033 partial, US-034, US-035, US-036, US-037, US-038 | Foundation: models, registry, resolution API, RBAC, caching                       |
| Sprint 2 (2w) | US-004, US-005, US-006, US-007, US-009, US-010, US-011, US-013, US-014                 | Assignment + basic viewer                                                         |
| Sprint 3 (2w) | US-018, US-019, US-020, US-021, US-022, US-023, US-033 complete, US-040, US-044        | Context vars + ticketing widgets + scope enforcement                              |
| Sprint 4 (2w) | US-024, US-025, US-027, US-028, US-039, US-041, US-042, US-045, US-050, US-051         | Onboarding + capacity + attendance + CEO project/centre scope + target management |
| Sprint 5 (2w) | US-029, US-030, US-015, US-016, US-017, US-043, US-046, US-047, US-048, US-049         | Builder UI + interactivity + Project Head role                                    |
| Sprint 6 (2w) | US-008, US-026, US-031, US-032, US-033 final polish, US-036–US-039 load testing        | Advanced features + hardening                                                     |

---

## 16. Project Head Role — Project-Scoped CEO Access

> **The requirement:** A Project Head gets the same dashboard power as the CEO — all modules, scope selector, full visibility — but they are **hard-capped to their assigned project(s)**. They cannot see, select, or accidentally access any data outside those projects.

---

### 16.1 Design Principle: Bounded Super-Admin

This is the **Bounded Super-Admin** pattern: the same capabilities as a Super Admin, but with a hard project boundary enforced at every layer — JWT, scope validation, picker UI, and query engine.

The critical difference from how the existing system thinks about project scope:

| Approach                                                                     | Problem                                                                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Give Project Head the Super Admin role, rely on UI to limit                  | A determined user hits the API directly and gets all-tenant data. Unacceptable.                    |
| Create a new role code `PROJECT_HEAD` with `projectIds` in their user record | The **correct approach** — boundary is in the JWT claim and validated server-side on every request |

---

### 16.2 Project Head — Identity in the System

A Project Head user has:

```typescript
// On their user record (User model addition):
{
  role: { code: "PROJECT_HEAD", ... },
  projectIds: ["proj_id_1", "proj_id_2"],  // already exists on User model
  // No districtId, no centreId — their scope is project-level
}
```

`projectIds` is already stored on the User model (used for existing `@ctx.projectIds`). No new field is needed. The difference is that for `PROJECT_HEAD`, these IDs are their **ceiling** — they cannot be elevated, only used as a hard filter.

The JWT payload for a Project Head includes:

```json
{
  "userId": "...",
  "roleCode": "PROJECT_HEAD",
  "projectIds": ["proj_id_1", "proj_id_2"],
  "tenantId": "..."
  // districtId and centreId are absent — Project Head has no district/centre hierarchy
}
```

---

### 16.3 Scope Enforcer — Project Head Rules

The Scope Enforcer (Section 4.3) adds the following branch for `PROJECT_HEAD`:

```typescript
if (ctx.roleCode === "PROJECT_HEAD") {
  // Hard ceiling: ALWAYS restrict to their assigned projects
  // This runs regardless of what scopeOverride says
  const allowedProjectIds = ctx.projectIds; // from JWT — cannot be forged

  if (scopeOverride?.projectId) {
    // Validate the requested project is within their allowed set
    if (!allowedProjectIds.includes(scopeOverride.projectId)) {
      throw new ForbiddenError("Project not within your access scope");
    }
    query.projectId = scopeOverride.projectId; // allowed — apply it
  } else if (scopeOverride?.centreId) {
    // Validate the centre belongs to one of their projects
    const centre = await Centre.findById(scopeOverride.centreId).lean();
    if (!centre || !allowedProjectIds.includes(centre.projectId?.toString())) {
      throw new ForbiddenError("Centre not within your project scope");
    }
    query.centreId = scopeOverride.centreId;
    query["metadata.projectId"] = { $in: allowedProjectIds }; // belt-and-braces
  } else if (scopeOverride?.userId) {
    // Validate the selected user belongs to one of their projects
    const targetUser = await User.findById(scopeOverride.userId).lean();
    const userProjectIds = (targetUser?.projectIds || []).map(String);
    const overlap = allowedProjectIds.some((id) => userProjectIds.includes(id));
    if (!overlap) {
      throw new ForbiddenError("User not within your project scope");
    }
    query.userId = scopeOverride.userId;
    query["metadata.projectId"] = { $in: allowedProjectIds };
  } else {
    // Default (no override): show aggregated data across all their projects
    query["metadata.projectId"] = { $in: allowedProjectIds };
  }
}
```

This runs **after** context variable resolution and **before** the widget query handler. The Project Head's `projectIds` from the JWT is the only source of truth — it cannot be overridden by anything the client sends.

---

### 16.4 Scope Selector UI — Project Head View

The Scope Selector dropdown for a Project Head is **identical in capability to the CEO's** but its option lists are filtered:

| Scope Mode   | CEO Sees                | Project Head Sees                                           |
| ------------ | ----------------------- | ----------------------------------------------------------- |
| All Projects | All projects in tenant  | "All My Projects" (their 1–N assigned projects, aggregated) |
| By Project   | Every project in tenant | Only their assigned project(s)                              |
| By Centre    | Every centre in tenant  | Only centres belonging to their project(s)                  |
| By User      | Every user in tenant    | Only users who are members of their project(s)              |

The picker dropdowns are populated from project-scoped API endpoints that enforce the same boundary server-side. Even if a Project Head manipulates the frontend, the backend validates and rejects out-of-scope requests.

**Label difference in the filter bar:**

| User            | "All" label       |
| --------------- | ----------------- |
| CEO/Super Admin | "All Projects"    |
| Project Head    | "All My Projects" |

---

### 16.5 Project Head Dashboard — Seeded Template

**Name:** Project Head Overview  
**Scope Selector:** Enabled, but bounded to `@ctx.projectIds`  
**Default Mode:** All My Projects (aggregate across their assigned project(s))  
**Modules:** All four — same widget set as the CEO dashboard, different default scope

**Key behavioural differences from CEO template:**

| Feature              | CEO Dashboard          | Project Head Dashboard                  |
| -------------------- | ---------------------- | --------------------------------------- |
| Default scope        | All tenant projects    | Their projects only (`@ctx.projectIds`) |
| "By Project" picker  | Shows all 20+ projects | Shows only their 1–3 projects           |
| "By Centre" picker   | All 200 centres        | Only centres in their projects          |
| "By User" search     | All 10,000 users       | Only users in their projects            |
| Widget data default  | Tenant aggregate       | Their-project aggregate                 |
| SLA / ticket widgets | Tenant-wide            | Project-scoped only                     |

Same layout, same widgets — just a different boundary wall around the data.

---

### 16.6 Assigning Projects to a Project Head

Project membership for a Project Head is managed on their user profile by a Super Admin:

- `PATCH /api/v1/admin/users/:id` with `{ projectIds: ["proj_id_1", "proj_id_2"] }`
- Adding a project: Project Head immediately gains access to that project's data in their dashboard (JWT is re-issued on next login, or the scope check uses the DB value if JWT is short-lived)
- Removing a project: Project Head immediately loses access — any cached widget data for that project is inaccessible on next request
- A Project Head with `projectIds: []` sees an empty dashboard with a warning: "No projects assigned to your account. Contact your administrator."

**JWT refresh consideration:** If JWTs are long-lived (e.g. 24h), a project removal does not take effect until token expiry. Recommendation: use short-lived access tokens (15 min) + refresh tokens, or validate `projectIds` against the DB on every widget data request for Project Head role specifically.

---

### 16.7 RBAC Additions for Project Head

New role code and permissions added to the existing RBAC system:

**New role:** `PROJECT_HEAD`

| Permission                  | Project Head Gets | Notes                                                 |
| --------------------------- | ----------------- | ----------------------------------------------------- |
| `dashboard.view`            | ✅                | Same as all roles                                     |
| `dashboard.scope_override`  | ✅                | Bounded to their projectIds                           |
| `dashboard.manage`          | ❌                | Cannot create/edit dashboard templates                |
| `dashboard.assign`          | ❌                | Cannot assign dashboards to others                    |
| `dashboard.personal_create` | ✅ (configurable) | Can create personal dashboards from available widgets |
| `ticket.view_all`           | ✅ within project | Scoped — can see all tickets in their project         |
| `user.view`                 | ✅ within project | Scoped — can see all users in their project           |
| `attendance.read`           | ✅ within project | Scoped — can see all attendance in their project      |
| `feedback.read`             | ✅ within project | Scoped — can see all feedback in their project        |

The key distinction: `dashboard.scope_override` is the same permission as the CEO has — the **boundary comes from `roleCode === 'PROJECT_HEAD'`** in the scope enforcer, not from a different permission. This keeps the permission model clean — one permission for "can use scope selector", scope limits enforced by role.

---

## 15. User Stories — Project Head (Epic 14)

---

#### US-046 — Project Head Sees Only Their Project Data by Default

**As a** Project Head assigned to "Maharashtra CET 2026",  
**I want** my dashboard to show data for my assigned project(s) only by default,  
**so that** I get the same rich view as the CEO but limited to what I'm responsible for.

**Acceptance Criteria:**

- When Project Head loads the dashboard, all widgets default-scope to `projectId IN @ctx.projectIds`
- KPI tiles show only ticket/user/attendance/feedback counts for their project(s)
- The filter bar label shows "All My Projects" (not "All Projects")
- A Project Head with multiple assigned projects sees aggregated data across all of them in default mode
- A Project Head with a single project sees that project's data — no toggle needed
- Switching to another tab does not change the project scope ceiling
- Super Admin loading the same template sees tenant-wide data (template is the same; scope is role-dependent)

**Priority:** P1 | **Points:** 3

---

#### US-047 — Project Head Scope Selector: Project and Centre Pickers Are Pre-Filtered

**As a** Project Head,  
**I want** the Scope Selector's "By Project" and "By Centre" pickers to show only options within my project(s),  
**so that** I cannot accidentally select — or even see — data I'm not authorised to access.

**Acceptance Criteria:**

- "By Project" picker: lists only projects in `@ctx.projectIds` — if only one project, no picker shown (locked to that project)
- "By Centre" picker: lists only centres whose `projectId` is in `@ctx.projectIds`
- Neither picker ever shows projects or centres outside the Project Head's scope, even via search
- Picker data is populated from backend endpoints that enforce the same project boundary server-side
- If a Project Head searches for a centre by name and the result is from another project, it does not appear

**Priority:** P1 | **Points:** 3

---

#### US-048 — Project Head Scope Selector: User Search Is Project-Bounded

**As a** Project Head,  
**I want** to search for a user by name/email/mobile in the "By User" scope mode and see only users in my project(s),  
**so that** I can view a 360° profile of any user in my project without seeing users from other projects.

**Acceptance Criteria:**

- User search endpoint for Project Head: `GET /api/v1/admin/users/search?q=Rahul&projectScoped=true`
- Returns only users whose `projectIds` intersects with the Project Head's `projectIds`
- A user who exists in the system but belongs only to other projects does NOT appear in results
- Selecting a found user: all widgets update to show that user's data scoped to the Project Head's project(s)
- Attempting to load a user outside scope via direct API call returns 403

**Priority:** P1 | **Points:** 5

---

#### US-049 — Backend Rejects Out-of-Scope Requests for Project Head

**As a** security requirement,  
**I need** all widget data requests with a `scopeOverride` outside a Project Head's assigned projects to be rejected server-side,  
**so that** a Project Head cannot access other projects' data by crafting direct API calls.

**Acceptance Criteria:**

- Widget data request with `scopeOverride.projectId` not in Project Head's `projectIds` → 403
- Widget data request with `scopeOverride.centreId` belonging to a different project → 403
- Widget data request with `scopeOverride.userId` whose projects don't overlap → 403
- All three rejections return the same generic 403 body: `{ "message": "Scope not within your access" }` — no information leakage about what the target entity is
- Default widget data request (no scope override) auto-applies `projectId IN [their projectIds]` — Project Head cannot remove this filter
- Audit log entry on every 403 scope rejection: `event: 'scope_override_rejected'`, `requestedBy`, `requestedScope`, `reason`
- Unit tests cover all three rejection cases and the default auto-scoping

**Priority:** P0 | **Points:** 5

---

_End of Document — Dashboard Engine Solution Architecture v1.2_
