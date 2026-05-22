# Dashboard Module — End-to-End Development Document

**Document Version:** 1.0
**Project:** SAC Helpdesk Portal — Custom Dashboard Engine
**Stack:** Node.js + TypeScript + Express + MongoDB + Mongoose + Socket.io (already installed)
**Audience:** Development Team (AI Developer)
**Scope:** Additive only — zero changes to any existing working module

---

## 0. Ground Rules for Implementation

Before writing a single line of code, the developer must follow these rules without exception:

1. **No changes to existing files** unless the file is in the list of approved modifications at the end of each sprint. Every new file is a new file.
2. **Existing routes are untouched.** The old `GET /api/dashboard/statistics` endpoint stays exactly as it is. New dashboard endpoints are under `/api/v2/dashboard/`.
3. **Existing models are extended only by adding optional fields.** No field is renamed or removed. No existing index is dropped.
4. **The old `dashboardController.ts` is not modified.** A new `dashboardV2Controller.ts` is created alongside it.
5. **Feature flag.** A single environment variable `DASHBOARD_V2_ENABLED=true` controls whether the new dashboard is active. When false, the system behaves exactly as before.
6. **Every new collection name is prefixed** `dash_` to avoid any collision with existing collections: `dash_widget_definitions`, `dash_templates`, `dash_widgets`, `dash_assignments`, `dash_user_prefs`.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EXISTING SYSTEM (untouched)                                            │
│  GET /api/dashboard/statistics → dashboardController.ts (keep as-is)   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  NEW DASHBOARD ENGINE (additive)                                        │
│                                                                         │
│  POST /api/v2/dashboard/templates          → Builder CRUD               │
│  GET  /api/v2/dashboard/widgets/registry   → Widget catalogue           │
│  GET  /api/v2/dashboard/widgets/:key/data  → Widget data (scoped)       │
│  GET  /api/v2/dashboard/me                 → Resolve user's dashboards  │
│  POST /api/v2/dashboard/assignments        → Assign templates           │
│  GET  /api/v2/dashboard/events             → SSE real-time stream       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  NEW COLLECTIONS (prefixed dash_)                                       │
│  dash_widget_definitions   dash_templates   dash_widgets                │
│  dash_assignments          dash_user_prefs                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  ADDITIVE SCHEMA CHANGES (optional fields added to existing models)     │
│  Ticket: +closedAt  +sla_due_at  +firstRespondedAt                     │
│  User:   +centreId                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology decisions (using what is already in package.json):
- Real-time: `socket.io` is already installed — use it for widget push updates instead of SSE
- Excel export: `exceljs` is already installed — use for widget CSV/Excel export
- Auth: `authMiddleware` from `src/middleware/auth.ts` — reuse as-is
- Permission check: `checkPermission` from `src/middleware/permissions.ts` — reuse as-is

---

## 2. Project Plan — Sprints

### Sprint Overview

| Sprint | Name | Duration | Output |
|---|---|---|---|
| 1 | Foundation — DB + Registry | 1 week | Collections seeded, widget definitions registered |
| 2 | Scope Resolver + Widget Data API | 1 week | All widget data endpoints live and scoped |
| 3 | Schema additions + SLA widgets | 3 days | closedAt/sla_due_at added, SLA rate working |
| 4 | Template Builder API | 1 week | Dashboard templates CRUD, assignment system |
| 5 | Frontend — Viewer | 1 week | Dashboard page renders assigned dashboards |
| 6 | Frontend — Builder | 1 week | Admin builder UI with drag-and-drop |
| 7 | Real-time + Export | 3 days | Socket.io push, CSV/Excel export |
| 8 | Polish + Permissions + QA | 3 days | RBAC integrated, acceptance criteria met |

**Total estimated duration: 6–7 weeks**

---

## 3. Sprint 1 — Foundation (Database + Widget Registry)

### Goal
Create all new MongoDB collections, define schemas, and seed the complete widget registry. No API endpoints yet. No frontend. Just the data layer.

### Files to create (new — touch nothing existing):

```
backend/src/models/dashboard/
  ├── DashWidgetDefinition.ts
  ├── DashTemplate.ts
  ├── DashWidget.ts
  ├── DashAssignment.ts
  ├── DashUserPref.ts
  └── index.ts

backend/src/seeds/
  └── seedWidgetDefinitions.ts
```

---

### US-1.1 — DashWidgetDefinition Model

**As a system**, I need a `dash_widget_definitions` MongoDB collection that stores every available widget type so that the dashboard builder can offer them for selection without any code change.

**File:** `backend/src/models/dashboard/DashWidgetDefinition.ts`

**Schema fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `widget_key` | String | Yes | Unique. e.g. `ticket_open_count`. Never changes after creation. |
| `module` | String enum | Yes | `ticketing`, `users`, `knowledge_base`, `sla`, `activity`, `email`, `approvals` |
| `display_name` | String | Yes | Shown in builder panel |
| `description` | String | No | Tooltip in builder |
| `supported_viz` | String[] | Yes | Array from: `kpi_tile`, `kpi_pair`, `line_chart`, `area_chart`, `bar_chart`, `donut_chart`, `pie_chart`, `gauge`, `progress_bar`, `table`, `feed`, `heatmap` |
| `default_viz` | String | Yes | Must be in `supported_viz` |
| `scope_dimensions` | String[] | Yes | Subset of: `project`, `user`, `centre`, `email_domain` |
| `filter_params` | Mixed (Object) | No | JSON definition of accepted filters |
| `query_handler` | String | Yes | Maps to a function in the query handler registry |
| `is_exportable` | Boolean | No | Default false |
| `cache_ttl_seconds` | Number | No | Default 60 |
| `is_real_time` | Boolean | No | Default false — if true, socket.io emits on data change |
| `aggregation_level` | String enum | Yes | `count`, `rate`, `trend`, `list`, `distribution` |
| `requires_permission` | String[] | No | e.g. `["TICKET_VIEW_ALL"]` — OR logic |
| `is_active` | Boolean | No | Default true |
| `version` | Number | No | Default 1 |

**Indexes:**
- `{ widget_key: 1 }` — unique
- `{ module: 1, is_active: 1 }`

**Acceptance criteria:**
- Collection is created on app start if it does not exist.
- `widget_key` is enforced unique at DB level.
- Model is exported from `index.ts`.

---

### US-1.2 — DashTemplate Model

**As a system**, I need a `dash_templates` collection to store admin-composed dashboard layouts.

**File:** `backend/src/models/dashboard/DashTemplate.ts`

**Schema fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenant_id` | String | Yes | Tenant identifier — use project's tenant or a global tenant string from config |
| `name` | String | Yes | Dashboard display name |
| `description` | String | No | |
| `icon` | String | No | Icon name string |
| `accent_colour` | String | No | Hex colour, default `#3b82f6` |
| `status` | String enum | Yes | `draft`, `published`, `archived`. Default `draft`. |
| `theme` | String enum | No | `light`, `dark`, `system`. Default `system`. |
| `global_date_range_days` | Number | No | Default 30 |
| `allow_user_date_override` | Boolean | No | Default true |
| `allow_widget_export` | Boolean | No | Default false |
| `auto_refresh_seconds` | Number | No | Default 60. Min 30. |
| `created_by` | ObjectId → User | Yes | |
| `last_modified_by` | ObjectId → User | No | |

**Timestamps:** enabled (createdAt, updatedAt)

**Indexes:**
- `{ tenant_id: 1, status: 1 }`
- `{ created_by: 1 }`

---

### US-1.3 — DashWidget Model

**As a system**, I need a `dash_widgets` collection to store individual widget placements on a template canvas, with full configuration per widget instance.

**File:** `backend/src/models/dashboard/DashWidget.ts`

**Schema fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `dashboard_template_id` | ObjectId → DashTemplate | Yes | Parent template |
| `widget_definition_id` | ObjectId → DashWidgetDefinition | Yes | Which widget type |
| `widget_key` | String | Yes | Denormalised for fast lookup without join |
| `widget_definition_version` | Number | No | Snapshot version at time of placement |
| `title` | String | Yes | Display title (admin-editable) |
| `subtitle` | String | No | Optional description under title |
| `visualisation_type` | String | Yes | Must be valid for this widget definition |
| `grid_x` | Number | Yes | Column start, 0-indexed |
| `grid_y` | Number | Yes | Row start, 0-indexed |
| `grid_width` | Number | Yes | 3–12. Default 4. |
| `grid_height` | Number | Yes | 2–8. Default 2. |
| `mobile_order` | Number | No | Stack order on mobile |
| `display_config` | Mixed | No | `{ show_header, show_footer_timestamp, colour_override }` |
| `data_config` | Mixed | No | `{ date_range_days, override_global_date, filters, group_by, top_n, scope_override }` |
| `threshold_config` | Mixed | No | `{ green_min, green_max, amber_min, amber_max, red_min, red_max, good_direction }` |
| `table_config` | Mixed | No | `{ columns, sort_by, sort_dir, drill_through_url, show_search, per_page }` |
| `is_collapsed_default` | Boolean | No | Default false |

**Indexes:**
- `{ dashboard_template_id: 1 }` — for loading all widgets of a template
- `{ widget_key: 1 }` — for real-time invalidation

---

### US-1.4 — DashAssignment Model

**As a system**, I need a `dash_assignments` collection to store which dashboard templates are assigned to which roles or users, with optional project/centre/email-domain scoping.

**File:** `backend/src/models/dashboard/DashAssignment.ts`

**Schema fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `tenant_id` | String | Yes | |
| `dashboard_template_id` | ObjectId → DashTemplate | Yes | |
| `assignee_type` | String enum | Yes | `role`, `user` |
| `assignee_id` | ObjectId | Yes | Role ID or User ID |
| `scope_type` | String enum | Yes | `global`, `project`, `centre`, `email_domain`, `multi_centre` |
| `scope_project_id` | ObjectId → Project | No | Set when scope_type = `project` |
| `scope_centre_ids` | ObjectId[] | No | Set when scope_type = `centre` or `multi_centre` |
| `scope_email_domain` | String | No | Set when scope_type = `email_domain` e.g. `@district5.gov.in` |
| `tab_order` | Number | No | Default 0 |
| `is_default_tab` | Boolean | No | Default false |
| `assigned_by` | ObjectId → User | Yes | |

**Timestamps:** enabled

**Unique constraint:** `{ tenant_id, dashboard_template_id, assignee_type, assignee_id, scope_type, scope_project_id }`

**Indexes:**
- `{ assignee_type: 1, assignee_id: 1, tenant_id: 1 }` — critical for user dashboard resolution
- `{ tenant_id: 1, dashboard_template_id: 1 }`

---

### US-1.5 — DashUserPref Model

**As a system**, I need a `dash_user_prefs` collection to store each user's per-dashboard preferences such as collapsed widgets and saved filter state.

**File:** `backend/src/models/dashboard/DashUserPref.ts`

**Schema fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `user_id` | ObjectId → User | Yes | |
| `tenant_id` | String | Yes | |
| `dashboard_template_id` | ObjectId → DashTemplate | Yes | |
| `collapsed_widget_ids` | ObjectId[] | No | IDs of DashWidget documents the user has collapsed |
| `saved_date_range_days` | Number | No | User's saved date range override |
| `saved_filters` | Mixed | No | `{ status, priority, category, centre_id }` |
| `last_viewed_at` | Date | No | |

**Unique constraint:** `{ user_id, dashboard_template_id }`

**Index:** `{ user_id: 1, tenant_id: 1 }`

---

### US-1.6 — Additive Schema Changes to Ticket Model

**As a system**, I need three new optional fields on the `Ticket` model to enable SLA resolution rate and first response time widgets. These must not break any existing code.

**Approved modification file:** `backend/src/models/Ticket.ts`

**Fields to add (all optional — no `required: true`):**

```typescript
// Add to ITicket interface:
closedAt?: Date;          // Set when status changes to 'closed' or 'resolved'
sla_due_at?: Date;        // Computed from Priority.resolutionTime at ticket creation
firstRespondedAt?: Date;  // Set when first non-system agent reply is posted
```

```typescript
// Add to TicketSchema:
closedAt: { type: Date, index: true },
sla_due_at: { type: Date, index: true },
firstRespondedAt: { type: Date },
```

**New compound indexes to add (additive only):**
```typescript
TicketSchema.index({ project: 1, status: 1, createdAt: -1 });
TicketSchema.index({ project: 1, priority: 1, createdAt: -1 });
TicketSchema.index({ project: 1, category: 1, createdAt: -1 });
TicketSchema.index({ project: 1, assignedTo: 1, status: 1 });
TicketSchema.index({ project: 1, closedAt: -1 });
TicketSchema.index({ project: 1, sla_due_at: 1 });
```

**No existing indexes removed. No existing fields changed.**

---

### US-1.7 — Additive Schema Change to User Model

**As a system**, I need a `centreId` optional field on the `User` model for centre-level dashboard scoping.

**Approved modification file:** `backend/src/models/User.ts`

**Field to add:**
```typescript
// Add to IUser interface:
centreId?: mongoose.Types.ObjectId;  // Centre assignment for dashboard scoping

// Add to userSchema:
centreId: {
  type: Schema.Types.ObjectId,
  ref: 'Center',
  sparse: true,
  index: true,
}
```

---

### US-1.8 — Widget Definition Seed Script

**As a system**, I need a seed script that populates `dash_widget_definitions` with all 40+ widget definitions so that the builder has a complete catalogue from day one.

**File:** `backend/src/seeds/seedWidgetDefinitions.ts`

**Must seed all widgets defined in the Datapoint Mapping document (dashboard-widget-datapoint-mapping.md), including:**

Ticketing (20 widgets): `ticket_open_count`, `ticket_closed_count`, `ticket_inprogress_count`, `ticket_resolved_count`, `ticket_onhold_count`, `ticket_by_status`, `ticket_by_priority`, `ticket_by_category`, `ticket_by_submission_source`, `ticket_volume_trend`, `ticket_escalation_count`, `ticket_assignee_workload`, `my_assigned_tickets`, `ticket_recent_list`, `ticket_sla_resolution_rate`, `ticket_first_response_time`, `ticket_escalated_this_period`, `ticket_sla_rules_overview`, `ticket_comment_count`, `ticket_merge_count`

Users (10 widgets): `user_total_count`, `user_active_count`, `user_inactive_count`, `user_by_role`, `user_new_registrations`, `user_by_registration_source`, `user_last_login_list`, `user_never_logged_in`, `user_by_department`, `user_eula_acceptance_rate`, `user_password_setup_pending`

Knowledge Base (6 widgets): `kb_total_articles`, `kb_published_count`, `kb_draft_count`, `kb_top_viewed`, `kb_helpfulness_rate`, `kb_recent_updates`, `kb_by_category`

Activity & Access (5 widgets): `activity_feed`, `login_failure_count`, `active_session_count`, `avg_session_duration`, `email_sent_count`, `email_failure_rate`, `email_by_type`

SLA & Escalation (4 widgets): `sla_rules_overview`, `escalation_policies_count`, `ticket_sla_resolution_rate`, `ticket_escalated_this_period`

**Seed behaviour:** Upsert by `widget_key`. Running the seed twice must not create duplicates.

**Run command:** `npx ts-node src/seeds/seedWidgetDefinitions.ts`

---

## 4. Sprint 2 — Scope Resolver + Widget Data API

### Goal
Every widget has a live data endpoint that automatically scopes data to the requesting user's identity. This is the engine room of the entire dashboard.

### Files to create:

```
backend/src/services/dashboard/
  ├── scopeResolver.ts
  ├── queryHandlers/
  │   ├── ticketHandlers.ts
  │   ├── userHandlers.ts
  │   ├── kbHandlers.ts
  │   ├── activityHandlers.ts
  │   ├── emailHandlers.ts
  │   └── slaHandlers.ts
  └── widgetDataService.ts

backend/src/controllers/
  └── dashboardV2Controller.ts

backend/src/routes/
  └── dashboardV2.ts
```

---

### US-2.1 — Scope Resolver Service

**As a system**, I need a `scopeResolver` function that reads the authenticated user from `req.user` (already populated by `authMiddleware`) and returns a scope object telling every widget query what data the user is allowed to see.

**File:** `backend/src/services/dashboard/scopeResolver.ts`

**Input:** `req.user` (the `AuthRequest` user object already populated by existing `authMiddleware`)

**Output (ScopeContext object):**
```typescript
interface ScopeContext {
  userId: string;
  email: string;
  emailDomain: string;           // email.split('@')[1]
  roleId: string;
  roleCode: string;              // Role.code e.g. 'SUPER_ADMIN', 'AGENT'
  roleName: string;
  scopedProjectIds: string[];    // ObjectId strings — what projects this user sees
  centreId?: string;             // User.centreId if set
  isSuperAdmin: boolean;         // role.code === 'SUPER_ADMIN'
  permissions: string[];         // Array of permission codes the user holds
}
```

**Resolution logic:**

```
Step 1: Extract userId from req.user.userId

Step 2: Fetch User with populated role and projects:
  User.findById(userId)
    .select('email role projects centreId')
    .populate({ path: 'role', select: 'name code permissions projects' })
    .lean()

Step 3: Role code check:
  if role.code === 'SUPER_ADMIN':
    scopedProjectIds = fetch ALL active project IDs from Project collection
  else:
    scopedProjectIds = user.projects.map(id => id.toString())
    // Intersect with role.projects if role.projects is non-empty

Step 4: Extract permission codes from role.permissions
  (handle both ObjectId refs and inline codes — same dual check as existing permissions.ts)

Step 5: Return ScopeContext
```

**Caching:** Cache the resolved scope in-memory per `userId` with 5-minute TTL using a `Map<string, {scope, expiresAt}>`. This avoids the DB lookup on every widget request. Clear cache entry when a role change event fires.

**No external cache dependency (no Redis required)** — in-memory Map is sufficient for this phase.

**Acceptance criteria:**
- Super admin gets `scopedProjectIds` = all project IDs.
- Agent gets `scopedProjectIds` = only their assigned projects.
- Two users with same role but different project assignments get different `scopedProjectIds`.
- Cache returns in < 1ms on hit.
- Cache miss triggers DB lookup and stores result.

---

### US-2.2 — Query Handler Registry

**As a system**, I need a registry of query handler functions, one per `widget_key`, so that the widget data API can look up and execute the correct query for any widget without a giant if-else chain.

**Pattern:**
```typescript
// backend/src/services/dashboard/widgetDataService.ts

type QueryHandler = (scope: ScopeContext, config: WidgetDataConfig) => Promise<WidgetDataResult>;

const QUERY_REGISTRY: Record<string, QueryHandler> = {
  ticket_open_count:          ticketHandlers.openCount,
  ticket_closed_count:        ticketHandlers.closedCount,
  ticket_by_status:           ticketHandlers.byStatus,
  ticket_by_priority:         ticketHandlers.byPriority,
  ticket_by_category:         ticketHandlers.byCategory,
  ticket_volume_trend:        ticketHandlers.volumeTrend,
  ticket_escalation_count:    ticketHandlers.escalationCount,
  ticket_assignee_workload:   ticketHandlers.assigneeWorkload,
  my_assigned_tickets:        ticketHandlers.myAssigned,
  ticket_recent_list:         ticketHandlers.recentList,
  ticket_sla_resolution_rate: ticketHandlers.slaResolutionRate,
  user_total_count:           userHandlers.totalCount,
  user_active_count:          userHandlers.activeCount,
  user_by_role:               userHandlers.byRole,
  user_new_registrations:     userHandlers.newRegistrations,
  user_last_login_list:       activityHandlers.lastLoginList,
  kb_total_articles:          kbHandlers.totalArticles,
  kb_top_viewed:              kbHandlers.topViewed,
  kb_helpfulness_rate:        kbHandlers.helpfulnessRate,
  activity_feed:              activityHandlers.feed,
  login_failure_count:        activityHandlers.loginFailureCount,
  email_sent_count:           emailHandlers.sentCount,
  email_failure_rate:         emailHandlers.failureRate,
  // ... all registered widgets
};
```

**`WidgetDataConfig`:**
```typescript
interface WidgetDataConfig {
  date_range_days: number;       // Default 30
  start_date: Date;              // Computed from date_range_days
  end_date: Date;                // Now
  filters: Record<string, any>;  // Widget-specific filters from data_config
  top_n?: number;                // For list/distribution widgets
  group_by?: string;             // For grouped charts
}
```

**`WidgetDataResult`:**
```typescript
interface WidgetDataResult {
  data: any;                    // The actual chart/table data
  metadata: {
    date_range_start: Date;
    date_range_end: Date;
    scope_applied: Partial<ScopeContext>;
    last_updated: Date;
    total_records?: number;
  };
  threshold_state?: 'green' | 'amber' | 'red';  // Computed from threshold_config
  trend?: {
    previous_value: number;
    change_pct: number;
    direction: 'up' | 'down' | 'flat';
  };
}
```

---

### US-2.3 — Ticket Query Handlers

**As a system**, I need query handler implementations for all ticketing module widgets.

**File:** `backend/src/services/dashboard/queryHandlers/ticketHandlers.ts`

**Implement each of the following. Every handler receives `(scope: ScopeContext, config: WidgetDataConfig)` and returns `WidgetDataResult`:**

#### `openCount` — ticket_open_count
```typescript
// Query:
const value = await Ticket.countDocuments({
  project: { $in: scope.scopedProjectIds },
  status: 'open',
  createdAt: { $gte: config.start_date }
});
// Trend: same query for previous period
const prev = await Ticket.countDocuments({
  project: { $in: scope.scopedProjectIds },
  status: 'open',
  createdAt: { $gte: prevStart, $lt: config.start_date }
});
```

#### `closedCount` — ticket_closed_count
Same pattern, `status: 'closed'`.

#### `byStatus` — ticket_by_status
```typescript
Ticket.aggregate([
  { $match: { project: { $in: projectObjectIds }, createdAt: { $gte: config.start_date } }},
  { $group: { _id: '$status', count: { $sum: 1 } }},
  { $project: { label: '$_id', value: '$count', _id: 0 }}
])
```

#### `byPriority` — ticket_by_priority
Same aggregate, group by `priority`.

#### `byCategory` — ticket_by_category
Same aggregate, group by `category`, limit to `config.top_n || 10`, sort by count desc.

#### `volumeTrend` — ticket_volume_trend
```typescript
Ticket.aggregate([
  { $match: { project: { $in: projectObjectIds }, createdAt: { $gte: config.start_date }}},
  { $group: {
    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }},
    count: { $sum: 1 }
  }},
  { $sort: { _id: 1 }}
])
// Return as: [{ date: "2025-05-01", value: 12 }, ...]
```

#### `assigneeWorkload` — ticket_assignee_workload
```typescript
Ticket.aggregate([
  { $match: {
    project: { $in: projectObjectIds },
    status: { $in: ['open', 'in-progress'] },
    assignedTo: { $exists: true, $ne: null }
  }},
  { $group: { _id: '$assignedTo', count: { $sum: 1 } }},
  { $sort: { count: -1 }},
  { $limit: config.top_n || 10 },
  { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' }},
  { $unwind: '$agent' },
  { $project: {
    label: '$agent.fullName',
    email: '$agent.email',
    value: '$count',
    _id: 0
  }}
])
```

#### `myAssigned` — my_assigned_tickets
```typescript
Ticket.find({
  assignedTo: new mongoose.Types.ObjectId(scope.userId),
  status: { $in: ['open', 'in-progress', 'on-hold'] }
})
.select('ticketNumber title status priority category project createdAt updatedAt')
.sort({ updatedAt: -1 })
.limit(config.top_n || 25)
.lean()
```

#### `escalationCount` — ticket_escalation_count
```typescript
Ticket.countDocuments({
  project: { $in: projectObjectIds },
  'escalationHistory.0': { $exists: true },
  createdAt: { $gte: config.start_date }
})
```

#### `recentList` — ticket_recent_list
```typescript
Ticket.find({ project: { $in: projectObjectIds } })
.select('ticketNumber title status priority createdBy createdAt')
.sort({ createdAt: -1 })
.limit(config.top_n || 20)
.populate('createdBy', 'fullName email')
.lean()
```

#### `slaResolutionRate` — ticket_sla_resolution_rate ⚠ requires Sprint 3 schema change
```typescript
// Only executable after Ticket.closedAt and Ticket.sla_due_at are added
const baseMatch = {
  project: { $in: projectObjectIds },
  status: { $in: ['closed', 'resolved'] },
  closedAt: { $gte: config.start_date, $lte: config.end_date }
};
const [denominator, numerator] = await Promise.all([
  Ticket.countDocuments(baseMatch),
  Ticket.countDocuments({
    ...baseMatch,
    sla_due_at: { $exists: true, $ne: null },
    $expr: { $lte: ['$closedAt', '$sla_due_at'] }
  })
]);
const rate = denominator > 0 ? Math.round((numerator / denominator) * 100 * 10) / 10 : null;
```

**Important:** All handlers must convert `scope.scopedProjectIds` (strings) to `mongoose.Types.ObjectId` before use in queries. Helper:
```typescript
const projectObjectIds = scope.scopedProjectIds.map(id => new mongoose.Types.ObjectId(id));
```

---

### US-2.4 — User Query Handlers

**File:** `backend/src/services/dashboard/queryHandlers/userHandlers.ts`

#### `totalCount` — user_total_count
```typescript
User.countDocuments({
  projects: { $in: projectObjectIds },
  isActive: true
})
```

#### `activeCount` — user_active_count
Same with `isActive: true`.

#### `inactiveCount` — user_inactive_count
`isActive: false`.

#### `byRole` — user_by_role
```typescript
User.aggregate([
  { $match: { projects: { $in: projectObjectIds }, isActive: true }},
  { $group: { _id: '$role', count: { $sum: 1 } }},
  { $lookup: { from: 'roles', localField: '_id', foreignField: '_id', as: 'roleInfo' }},
  { $unwind: '$roleInfo' },
  { $project: { label: '$roleInfo.name', code: '$roleInfo.code', value: '$count', _id: 0 }},
  { $sort: { value: -1 }}
])
```

#### `newRegistrations` — user_new_registrations
```typescript
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
User.countDocuments({
  projects: { $in: projectObjectIds },
  createdAt: { $gte: startOfMonth }
})
```

#### `neverLoggedIn` — user_never_logged_in
```typescript
User.countDocuments({
  projects: { $in: projectObjectIds },
  isActive: true,
  $or: [{ lastLogin: { $exists: false } }, { lastLogin: null }]
})
```

#### `eulaAcceptanceRate` — user_eula_acceptance_rate
```typescript
const [total, accepted] = await Promise.all([
  User.countDocuments({ projects: { $in: projectObjectIds }, isActive: true }),
  User.countDocuments({ projects: { $in: projectObjectIds }, isActive: true, eulaAccepted: true })
]);
const rate = total > 0 ? Math.round((accepted / total) * 100 * 10) / 10 : 0;
```

#### `passwordSetupPending` — user_password_setup_pending
```typescript
User.countDocuments({
  projects: { $in: projectObjectIds },
  requirePasswordSetup: true,
  isActive: true
})
```

---

### US-2.5 — KB, Activity, Email Query Handlers

**Files:**
- `backend/src/services/dashboard/queryHandlers/kbHandlers.ts`
- `backend/src/services/dashboard/queryHandlers/activityHandlers.ts`
- `backend/src/services/dashboard/queryHandlers/emailHandlers.ts`

#### KB Handlers:

**`totalArticles`:** `KnowledgeBaseArticle.countDocuments({ projectId: { $in: projectObjectIds }, isActive: true })`

**`publishedCount`:** Add `status: 'published'`

**`topViewed`:**
```typescript
KnowledgeBaseArticle.find({
  projectId: { $in: projectObjectIds },
  status: 'published',
  isActive: true
})
.select('title category viewCount helpfulCount notHelpfulCount publishedAt')
.sort({ viewCount: -1 })
.limit(config.top_n || 10)
.lean()
```

**`helpfulnessRate`:**
```typescript
KnowledgeBaseArticle.aggregate([
  { $match: { projectId: { $in: projectObjectIds }, status: 'published', isActive: true }},
  { $group: {
    _id: null,
    helpful: { $sum: '$helpfulCount' },
    notHelpful: { $sum: '$notHelpfulCount' }
  }},
  { $project: {
    rate: { $cond: [
      { $gt: [{ $add: ['$helpful', '$notHelpful'] }, 0] },
      { $multiply: [{ $divide: ['$helpful', { $add: ['$helpful', '$notHelpful'] }] }, 100] },
      0
    ]}
  }}
])
```

#### Activity Handlers:

**`feed`:**
```typescript
ActivityLog.find({ project: { $in: projectObjectIds }, timestamp: { $gte: config.start_date } })
.sort({ timestamp: -1 })
.limit(config.top_n || 20)
.select('userName userEmail action entity entityName timestamp role')
.lean()
```

**`loginFailureCount`:**
```typescript
AccessLog.countDocuments({
  project: { $in: projectObjectIds },
  action: 'login_failed',
  timestamp: { $gte: config.start_date }
})
```

**`activeSessionCount`:**
```typescript
const today = new Date(); today.setHours(0, 0, 0, 0);
const ids = await AccessLog.distinct('userId', {
  project: { $in: projectObjectIds },
  action: 'login',
  success: true,
  timestamp: { $gte: today }
});
return { data: { value: ids.length } };
```

#### Email Handlers:

**`sentCount`:** `EmailLog.countDocuments({ projectId: { $in: projectObjectIds }, status: 'sent', sentAt: { $gte: config.start_date } })`

**`failureRate`:**
```typescript
const [total, failed] = await Promise.all([
  EmailLog.countDocuments({ projectId: { $in: projectObjectIds }, sentAt: { $gte: config.start_date } }),
  EmailLog.countDocuments({ projectId: { $in: projectObjectIds }, status: 'failed', sentAt: { $gte: config.start_date } })
]);
const rate = total > 0 ? Math.round((failed / total) * 100 * 10) / 10 : 0;
```

---

### US-2.6 — Widget Data API Endpoint

**As a user**, I need an API endpoint that returns live, scoped data for any registered widget so that the dashboard frontend can render each widget independently.

**Route:** `GET /api/v2/dashboard/widgets/:widget_key/data`

**File (controller):** `backend/src/controllers/dashboardV2Controller.ts`
**File (route):** `backend/src/routes/dashboardV2.ts`

**Middleware chain:**
```typescript
router.get(
  '/widgets/:widget_key/data',
  authMiddleware,               // existing middleware — no change
  checkPermission('DASHBOARD_VIEW'),  // existing middleware — no change
  getWidgetData                 // new handler
);
```

**Handler logic (`getWidgetData`):**
```
1. Extract widget_key from params
2. Look up widget definition in dash_widget_definitions (or in-memory registry)
3. Check requires_permission[] — if user lacks all required permissions → 403
4. Resolve scope: const scope = await scopeResolver(req)
5. Parse config from query params: date_range_days, filters (JSON), top_n, group_by
6. Build WidgetDataConfig object
7. Look up query handler from QUERY_REGISTRY[widget_key]
8. If no handler found → 404 "Widget not registered"
9. Execute: const result = await handler(scope, config)
10. Return standardised response envelope
```

**Response envelope:**
```json
{
  "success": true,
  "widget_key": "ticket_open_count",
  "viz_type": "kpi_tile",
  "data": { "value": 47, "label": "Open Tickets" },
  "trend": { "previous_value": 39, "change_pct": 20.5, "direction": "up" },
  "threshold_state": "amber",
  "metadata": {
    "date_range_start": "2025-04-19T00:00:00.000Z",
    "date_range_end": "2025-05-19T00:00:00.000Z",
    "scope_applied": { "project_count": 3, "user_id": "...", "role_code": "AGENT" },
    "last_updated": "2025-05-19T09:00:00.000Z"
  }
}
```

**Query params accepted:**
- `date_range_days` — integer, default 30
- `top_n` — integer, default 10
- `group_by` — string
- `filters` — JSON string e.g. `{"status":["open"],"priority":["high"]}`

**Error responses:**
- `401` — no valid JWT
- `403` — missing permission
- `404` — widget_key not registered
- `400` — invalid filter format
- `500` — query execution error with sanitised message

---

### US-2.7 — Widget Registry Endpoint

**As an admin**, I need an endpoint to list all registered widget definitions grouped by module so the dashboard builder can populate its widget panel.

**Route:** `GET /api/v2/dashboard/widgets/registry`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Response:**
```json
{
  "success": true,
  "data": {
    "ticketing": [
      {
        "widget_key": "ticket_open_count",
        "display_name": "Open Tickets",
        "description": "Count of open tickets in scope",
        "supported_viz": ["kpi_tile", "trend_line"],
        "default_viz": "kpi_tile",
        "is_real_time": true,
        "requires_permission": ["TICKET_VIEW_ALL", "TICKET_VIEW_OWN"]
      }
    ],
    "users": [...],
    "knowledge_base": [...],
    "activity": [...],
    "email": [...]
  }
}
```

**Filter by permission:** Only return widgets where the requesting user has at least one of `requires_permission`. Widgets with empty `requires_permission` are always returned.

---

## 5. Sprint 3 — Schema Additions + SLA Population

### Goal
Populate the three new Ticket fields (`closedAt`, `sla_due_at`, `firstRespondedAt`) at the right moments in the existing ticket lifecycle — without breaking any existing endpoint.

### Files to modify (approved modifications only):

```
backend/src/controllers/ticketController.ts  ← Add 3 field-setting operations
```

### US-3.1 — Populate closedAt on Status Change

**As a system**, when a ticket's status is changed to `closed` or `resolved`, I need `closedAt` to be automatically set to the current timestamp so that SLA resolution rate can be computed.

**In `ticketController.ts`**, find the handler(s) that update ticket status (`TICKET_CHANGE_STATUS` permission guards, `PATCH /tickets/:id/status` or equivalent). Add this block after the status is changed and before save:

```typescript
// Dashboard: track when ticket is closed (additive — does not affect any existing logic)
if (['closed', 'resolved'].includes(newStatus) && !ticket.closedAt) {
  (ticket as any).closedAt = new Date();
}
```

**Must not change any existing response shape. Must not change any existing validation.**

---

### US-3.2 — Populate sla_due_at on Ticket Creation

**As a system**, when a new ticket is created, I need `sla_due_at` computed from the ticket's priority SLA rule and stored on the ticket.

**In `ticketController.ts`**, in the ticket creation handler, after the ticket document is built and before save:

```typescript
// Dashboard: compute SLA deadline (additive)
try {
  if (newTicket.priority && newTicket.project) {
    const SLARule = require('../models/sla-module/SLARule').default;
    const slaRule = await SLARule.findOne({
      projectIds: newTicket.project,
      priority: newTicket.priority.charAt(0).toUpperCase() + newTicket.priority.slice(1),
      isActive: true
    }).lean();
    if (slaRule) {
      const resHours = slaRule.resolutionTime.unit === 'hours'
        ? slaRule.resolutionTime.value
        : slaRule.resolutionTime.unit === 'days'
          ? slaRule.resolutionTime.value * 24
          : slaRule.resolutionTime.value / 60;
      const due = new Date();
      due.setTime(due.getTime() + resHours * 60 * 60 * 1000);
      (newTicket as any).sla_due_at = due;
    }
  }
} catch (slaErr) {
  // Non-fatal — ticket creation must succeed even if SLA lookup fails
  console.warn('[DASHBOARD] SLA due date computation failed:', slaErr);
}
```

---

### US-3.3 — Populate firstRespondedAt on First Agent Reply

**As a system**, when the first non-system reply is added to a ticket by an agent (not the ticket creator), I need `firstRespondedAt` set to the current timestamp.

**In `ticketController.ts`**, in the handler that adds comments or thread messages:

```typescript
// Dashboard: track first agent response (additive)
try {
  if (!ticket.firstRespondedAt) {
    const isCreator = ticket.createdBy.toString() === req.user?.userId;
    const isSystemMsg = false; // set appropriately based on context
    if (!isCreator && !isSystemMsg) {
      (ticket as any).firstRespondedAt = new Date();
    }
  }
} catch (e) {
  // Non-fatal
}
```

---

### US-3.4 — Migration Script for Existing Closed Tickets

**As a system**, I need a one-time migration script that backfills `closedAt` for tickets that are already in `closed` or `resolved` status so that historical SLA data is not zero.

**File:** `backend/src/seeds/migrateClosedAt.ts`

```typescript
// Use updatedAt as a proxy for closedAt for historical tickets
await Ticket.updateMany(
  { status: { $in: ['closed', 'resolved'] }, closedAt: { $exists: false } },
  [{ $set: { closedAt: '$updatedAt' } }]
);
```

**Run once:** `npx ts-node src/seeds/migrateClosedAt.ts`
**Idempotent:** Only updates documents where `closedAt` does not exist.

---

## 6. Sprint 4 — Dashboard Template Builder API

### Goal
Full CRUD for dashboard templates, widget placement management, and assignment system. These are the APIs that the frontend builder UI will call.

---

### US-4.1 — Create Dashboard Template

**Route:** `POST /api/v2/dashboard/templates`
**Permission:** `DASHBOARD_VIEW_ANALYTICS` (as a proxy for admin access — or add `DASHBOARD_MANAGE` to permissions seed)

**Request body:**
```json
{
  "name": "District Performance Dashboard",
  "description": "Overview for district officers",
  "icon": "chart-bar",
  "accent_colour": "#3b82f6",
  "global_date_range_days": 30,
  "allow_user_date_override": true,
  "allow_widget_export": false,
  "auto_refresh_seconds": 60
}
```

**Handler logic:**
1. Validate required fields (name).
2. Set `status: 'draft'`, `created_by: req.user.userId`, `tenant_id` from config or a global constant.
3. Save to `dash_templates`.
4. Return created template document.

---

### US-4.2 — Add Widget to Template

**Route:** `POST /api/v2/dashboard/templates/:templateId/widgets`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Request body:**
```json
{
  "widget_key": "ticket_open_count",
  "title": "Open Tickets",
  "visualisation_type": "kpi_tile",
  "grid_x": 0,
  "grid_y": 0,
  "grid_width": 4,
  "grid_height": 2,
  "data_config": {
    "date_range_days": 30,
    "override_global_date": false,
    "filters": {}
  },
  "threshold_config": {
    "green_max": 50,
    "amber_max": 100,
    "red_min": 101,
    "good_direction": "down"
  }
}
```

**Handler logic:**
1. Validate `templateId` exists and belongs to a non-archived template.
2. Validate `widget_key` exists in `dash_widget_definitions`.
3. Validate `visualisation_type` is in the definition's `supported_viz`.
4. Validate grid values: `grid_x` 0–11, `grid_width` 3–12, `grid_height` 2–8.
5. Look up widget definition, snapshot `widget_definition_version`.
6. Save to `dash_widgets`.
7. Return created widget document.

---

### US-4.3 — Update Widget Configuration

**Route:** `PATCH /api/v2/dashboard/templates/:templateId/widgets/:widgetId`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Accepts partial update of any widget field:** `title`, `visualisation_type`, `grid_x`, `grid_y`, `grid_width`, `grid_height`, `data_config`, `threshold_config`, `table_config`, `display_config`.

**Handler:** Validate template ownership, update only provided fields using `$set`.

---

### US-4.4 — Remove Widget from Template

**Route:** `DELETE /api/v2/dashboard/templates/:templateId/widgets/:widgetId`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Handler:** Soft delete or hard delete. Recommended: hard delete (widget placement is replaceable). Validate template is not archived.

---

### US-4.5 — Get Template with All Widgets

**Route:** `GET /api/v2/dashboard/templates/:templateId`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Handler:**
1. Fetch template from `dash_templates`.
2. Fetch all widgets from `dash_widgets` where `dashboard_template_id = templateId`.
3. For each widget, join widget definition fields (`display_name`, `supported_viz`, `module`) for the builder to use.
4. Return combined response.

---

### US-4.6 — List All Templates

**Route:** `GET /api/v2/dashboard/templates`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Query params:** `?status=draft|published|archived` (optional filter)

**Response:** Array of templates with widget count, assignment count, last modified.

---

### US-4.7 — Publish Template

**Route:** `POST /api/v2/dashboard/templates/:templateId/publish`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Handler:**
1. Validate template has at least 1 widget (cannot publish empty dashboard).
2. Set `status: 'published'`, `last_modified_by: req.user.userId`.
3. Return updated template.

---

### US-4.8 — Archive Template

**Route:** `POST /api/v2/dashboard/templates/:templateId/archive`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Handler:**
1. Check if template has active assignments. If yes, warn in response but allow archive.
2. Set `status: 'archived'`.
3. Archived templates no longer appear in user dashboards.

---

### US-4.9 — Duplicate Template

**Route:** `POST /api/v2/dashboard/templates/:templateId/duplicate`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Handler:**
1. Fetch original template and all its widgets.
2. Create new `dash_templates` document with same config, `status: 'draft'`, `name: "Copy of [original name]"`.
3. Create new `dash_widgets` documents for each original widget, pointing to new template ID.
4. Return new template.

---

### US-4.10 — Create Assignment

**Route:** `POST /api/v2/dashboard/templates/:templateId/assignments`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Request body:**
```json
{
  "assignee_type": "role",
  "assignee_id": "<role_id>",
  "scope_type": "project",
  "scope_project_id": "<project_id>",
  "tab_order": 1,
  "is_default_tab": false
}
```

**Handler:**
1. Validate template is published.
2. Validate `assignee_id` references a valid Role or User document.
3. Validate scope fields based on `scope_type`.
4. Upsert by unique constraint (update if exists, create if not).
5. Return assignment.

---

### US-4.11 — List Assignments for Template

**Route:** `GET /api/v2/dashboard/templates/:templateId/assignments`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

**Response:** Assignments with populated role name / user name, scope details, assigned by, assigned at.

---

### US-4.12 — Delete Assignment

**Route:** `DELETE /api/v2/dashboard/templates/:templateId/assignments/:assignmentId`
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

---

### US-4.13 — Resolve User's Dashboards

**Route:** `GET /api/v2/dashboard/me`
**Permission:** `DASHBOARD_VIEW`

**This is the most critical viewer endpoint.** Called by the frontend on page load to know which dashboards to show and in what order.

**Handler logic:**
```
1. Resolve scope: const scope = await scopeResolver(req)

2. Find all matching assignments:
   DashAssignment.find({
     tenant_id: TENANT_ID,
     $or: [
       // Role-based assignments
       { assignee_type: 'role', assignee_id: scope.roleId },
       // User-specific assignments
       { assignee_type: 'user', assignee_id: scope.userId }
     ]
   })

3. Filter by scope compatibility:
   - scope_type 'global': always matches
   - scope_type 'project': scope_project_id must be in scope.scopedProjectIds
   - scope_type 'centre': scope_centre_ids must overlap with user's centreId
   - scope_type 'email_domain': user's emailDomain must match scope_email_domain

4. Deduplicate by dashboard_template_id (same template from multiple rules → show once)

5. Apply priority ordering:
   User-specific assignments first, then role assignments
   Within same level, order by tab_order ASC

6. Fetch template details + widget list for each matched template

7. Apply user preferences from dash_user_prefs (collapsed widgets, saved date range)

8. Return:
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dashboards": [
      {
        "template_id": "...",
        "name": "My Work Queue",
        "icon": "user",
        "accent_colour": "#3b82f6",
        "is_default_tab": true,
        "tab_order": 0,
        "global_date_range_days": 30,
        "allow_user_date_override": true,
        "auto_refresh_seconds": 60,
        "user_prefs": {
          "saved_date_range_days": null,
          "collapsed_widget_ids": [],
          "saved_filters": {}
        },
        "widgets": [
          {
            "widget_id": "...",
            "widget_key": "ticket_open_count",
            "title": "Open Tickets",
            "visualisation_type": "kpi_tile",
            "grid_x": 0, "grid_y": 0,
            "grid_width": 4, "grid_height": 2,
            "data_config": { "date_range_days": 30, "filters": {} },
            "threshold_config": { "green_max": 50, "amber_max": 100 },
            "module": "ticketing",
            "is_real_time": true
          }
        ]
      }
    ],
    "total_dashboards": 2
  }
}
```

---

### US-4.14 — Save User Dashboard Preferences

**Route:** `PATCH /api/v2/dashboard/me/:templateId/preferences`
**Permission:** `DASHBOARD_VIEW`

**Request body:** Any subset of `{ collapsed_widget_ids, saved_date_range_days, saved_filters }`

**Handler:** Upsert `dash_user_prefs` by `{ user_id, dashboard_template_id }`.

---

## 7. Sprint 5 — Frontend: Dashboard Viewer

### Goal
The `/dashboard` page renders all assigned dashboards as tabs and fetches widget data in parallel. End users consume dashboards here.

### Files to create (frontend):

```
src/pages/Dashboard/
  ├── DashboardPage.tsx            Main page — tab bar + active panel
  ├── DashboardTabBar.tsx          Horizontal tab strip
  ├── DashboardPanel.tsx           Single dashboard grid
  └── index.ts

src/components/dashboard/
  ├── DashboardGrid.tsx            12-column CSS grid renderer
  ├── WidgetCard.tsx               Wrapper — header, body, footer, states
  ├── WidgetLoadingSkeleton.tsx    Skeleton per widget size
  ├── GlobalFilterBar.tsx          Date range + project/centre filters
  └── widgets/
      ├── KpiTileWidget.tsx
      ├── KpiPairWidget.tsx
      ├── LineChartWidget.tsx
      ├── AreaChartWidget.tsx
      ├── BarChartWidget.tsx
      ├── DonutChartWidget.tsx
      ├── GaugeWidget.tsx
      ├── ProgressBarWidget.tsx
      ├── DataTableWidget.tsx
      └── ActivityFeedWidget.tsx

src/services/
  └── dashboardV2Service.ts       API call wrappers

src/hooks/
  ├── useDashboards.ts            Fetch and cache /me response
  └── useWidgetData.ts            Per-widget data fetch with refresh
```

---

### US-5.1 — Dashboard Page Route

**As a user**, I need a `/dashboard` route that loads my assigned dashboards so I have a central view of my work.

**DashboardPage.tsx logic:**
1. On mount, call `GET /api/v2/dashboard/me`.
2. If no dashboards returned, render empty state: "Your administrator has not set up a dashboard for your role yet."
3. If dashboards returned, render `<DashboardTabBar>` and the active `<DashboardPanel>`.
4. Default active tab = the tab with `is_default_tab: true`, else first tab.

---

### US-5.2 — Dashboard Tab Bar

**As a user**, I need to see all my dashboards as tabs and switch between them so I can view different data contexts.

**DashboardTabBar.tsx:**
- Horizontal scrollable tab strip.
- Each tab: accent colour dot, icon, dashboard name.
- Active tab is visually highlighted.
- On mobile: collapses to `<select>` dropdown.
- Alert badge on tab if any widget on that dashboard is in `threshold_state: 'red'`.

---

### US-5.3 — Dashboard Grid and Widget Rendering

**As a user**, when I open a dashboard tab I need all widgets to appear immediately in skeleton loading state and then fill in with real data as it arrives.

**DashboardPanel.tsx + DashboardGrid.tsx:**

1. Receive the widgets array from the `/me` response.
2. Render the 12-column CSS grid using `grid-column: span {grid_width}` and `grid-row: span {grid_height}`.
3. Each widget slot renders `<WidgetCard>` in `loading` state initially.
4. Fire `GET /api/v2/dashboard/widgets/:widget_key/data` in parallel for all widgets (use `Promise.allSettled` — one failing widget must not block others).
5. As each response arrives, update the relevant widget from `loading` → `loaded` or `error`.

**DashboardGrid CSS pattern:**
```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}
.widget-slot {
  grid-column: span var(--widget-width);
  grid-row: span var(--widget-height);
}
```

---

### US-5.4 — WidgetCard Component

**As a user**, every widget must look consistent regardless of what it shows, with a header, body, and footer.

**WidgetCard.tsx structure:**
```
┌─────────────────────────────────────┐
│ [icon] Widget Title    [⋯ menu]     │ ← Header (show_header config)
├─────────────────────────────────────┤
│                                     │
│   [Widget body — viz renderer]      │
│                                     │
├─────────────────────────────────────┤
│ Last updated: 2 min ago   [↻]       │ ← Footer (show_footer_timestamp)
└─────────────────────────────────────┘
```

**Widget states the card must handle:**

| State | What to render |
|---|---|
| `loading` | `<WidgetLoadingSkeleton>` matching widget's grid size |
| `loaded` | The appropriate viz renderer component |
| `empty` | Centered text: "No data for selected period" + icon |
| `error` | "Could not load widget" + retry button |
| `no_permission` | Lock icon + "You don't have access to this data" |

**Widget menu (three-dot):** Refresh, Expand (full-screen modal), Export CSV (if exportable), View as table (for charts), Collapse.

**Threshold alert dot:** If `threshold_state === 'red'`, show a red dot on the widget header.

---

### US-5.5 — KPI Tile Widget Renderer

**KpiTileWidget.tsx:**

```
┌──────────────────────────┐
│  47                      │  ← large primary value
│  Open Tickets            │  ← label
│  ↑ 20.5% vs last period  │  ← trend (green if good_direction=down and trend=down)
│  ▁▂▃▄▅▆▇ (sparkline)     │  ← optional 7-day mini bar
└──────────────────────────┘
```

**Props consumed from API response:**
- `data.value` — the number
- `data.label` — displayed under the number
- `trend.change_pct`, `trend.direction` — arrow + %
- `threshold_state` — determines the accent colour bar on left edge
- `threshold_config.good_direction` — determines if up is green or red

---

### US-5.6 — Chart Widget Renderers

**As a user**, I need chart visualisations rendered with interactive tooltips and correct colours.

Use the charting library already available in the project (the project uses React — install `recharts` which is lightweight and works without a build step).

**LineChartWidget.tsx / AreaChartWidget.tsx:**
- X-axis: date labels, Y-axis: values
- Tooltip on hover with exact date and value
- `data` array format from API: `[{ date: "2025-05-01", value: 12 }, ...]`

**BarChartWidget.tsx:**
- Horizontal or vertical (from `display_config.orientation`)
- Each bar coloured by module accent colour
- Tooltip on hover
- `data` format: `[{ label: "Open", value: 47 }, ...]`

**DonutChartWidget.tsx:**
- Centre label shows total
- Legend below
- `data` format: `[{ label: "Open", value: 47 }, ...]`

**GaugeWidget.tsx:**
- Semi-circle needle gauge
- Green/amber/red zones from `threshold_config`
- Value label in centre

---

### US-5.7 — Data Table Widget Renderer

**DataTableWidget.tsx:**

- Renders a paginated table of records.
- Columns are defined by `table_config.columns` array from the widget configuration.
- Default page size: 10 rows. Controls: 10 / 25 / 50.
- Clicking a row navigates to `table_config.drill_through_url` with the row's entity ID substituted.
- Column sorting on click (client-side for small datasets, API-side for large).
- Search input above table if `table_config.show_search` is true.
- "Export CSV" button in widget menu downloads current data using `exceljs`.

---

### US-5.8 — Global Filter Bar

**As a user**, I need a filter bar above the widget grid so I can change the date range and other filters and see all supporting widgets update.

**GlobalFilterBar.tsx:**
- Date range picker: 7 / 14 / 30 / 60 / 90 days or custom. Only shows if `allow_user_date_override: true`.
- Project selector dropdown: only shows if user has multiple `scopedProjectIds`.
- "Reset" button: clears all session filters.

**Behaviour:**
- On filter change, update local state `activeFilters`.
- All widget data fetch calls include `activeFilters` merged with widget's own `data_config.filters`.
- Does not persist across sessions (session state only). User can save via `PATCH /me/:templateId/preferences`.

---

### US-5.9 — Widget Expand Modal

**As a user**, I need to expand a widget to full-screen so I can see more detail.

**WidgetExpandModal.tsx:**
- Full-screen overlay modal.
- Renders the same viz renderer but with more space.
- For tables: shows all rows, full column widths, search enabled.
- For charts: larger render area, all data labels visible.
- Additional filter controls shown in modal header.
- "Download as PNG" button for chart widgets.
- "Export CSV" for table widgets.

---

### US-5.10 — Auto-Refresh

**As a user**, I need dashboard widgets to refresh automatically at the configured interval so I always see current data.

**In `useWidgetData.ts`:**
- After initial load, set `setInterval(() => refetch(), template.auto_refresh_seconds * 1000)`.
- Clear interval on component unmount.
- Show "refreshing..." indicator on widget footer during a background refresh.
- Do not show skeleton state during background refresh — only update value on completion.

---

## 8. Sprint 6 — Frontend: Dashboard Builder

### Goal
The admin builder UI where super admins compose dashboards by selecting widgets from a panel, positioning them on a grid, and configuring each one.

---

### US-6.1 — Builder Page Route

**Route:** `/admin/dashboards/builder` (new) and `/admin/dashboards/:id/edit` (new)
**Guard:** Only render if user has `DASHBOARD_VIEW_ANALYTICS` permission. Redirect to `/dashboard` otherwise.

**On mount:**
- If `/builder`: fetch widget registry from `GET /api/v2/dashboard/widgets/registry`. Start with empty canvas.
- If `/edit/:id`: fetch registry + existing template from `GET /api/v2/dashboard/templates/:id`. Populate canvas with existing widgets.

---

### US-6.2 — Builder Layout

**DashboardBuilderPage.tsx:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: [Dashboard Name input] [Status badge] [Preview] [Save Draft] [Publish] │
├──────────────┬──────────────────────────────────────────┬────────────────┤
│ WIDGET PANEL │ CANVAS                                   │ CONFIG PANEL   │
│ (left, 280px)│ 12-column grid                           │ (right, 320px) │
│              │                                          │ appears when a │
│ [search]     │ Drop widgets here                        │ widget is      │
│              │                                          │ selected       │
│ Grouped by   │                                          │                │
│ module       │                                          │                │
└──────────────┴──────────────────────────────────────────┴────────────────┘
│ BOTTOM BAR: Grid lines [toggle] | Mobile preview | Undo | Redo | Widget count │
```

---

### US-6.3 — Widget Panel

**WidgetPanel.tsx:**

- Search input: filters widget list by name.
- Sections: one collapsible `<details>` block per module.
- Each widget card: widget name, default viz icon, module colour badge.
- Hover: shows description tooltip.
- Drag behaviour: makes the card draggable (`draggable="true"`, `onDragStart` sets `dataTransfer`).
- Double click: adds widget at next available canvas position.

---

### US-6.4 — Canvas with Grid

**BuilderCanvas.tsx:**

- Renders a 12-column ghost grid (visible when grid lines are on).
- `onDragOver` and `onDrop` handlers to accept dropped widgets.
- Dropped widget appears as a `BuilderWidgetSlot` at the nearest grid cell.
- Each `BuilderWidgetSlot`:
  - Renders widget title and a preview (static placeholder — not live data).
  - Selection border on click.
  - Resize handle bottom-right: drag to resize.
  - Three-dot menu: Configure, Duplicate, Remove.
- Widget drag: hold and drag an already-placed widget to reposition.
- Auto-arrange: when a widget is resized or dropped, adjacent widgets shift down to avoid overlap.
- **Undo/redo**: maintain a `history` array of canvas states (up to 20 steps). Undo = pop and reapply previous state.

**Canvas state object:**
```typescript
interface CanvasState {
  widgets: Array<{
    tempId: string;        // Client-side temp ID before save
    widget_key: string;
    title: string;
    visualisation_type: string;
    grid_x: number; grid_y: number;
    grid_width: number; grid_height: number;
    data_config: any;
    threshold_config: any;
    table_config: any;
    display_config: any;
  }>;
}
```

**Save behaviour:** On "Save Draft" click, diff the current canvas state against the server state. Call `POST /templates/:id/widgets` for new widgets, `PATCH /templates/:id/widgets/:id` for changed ones, `DELETE` for removed ones.

---

### US-6.5 — Widget Configuration Panel (Right Side)

**WidgetConfigPanel.tsx:**

Opens when any canvas widget is clicked. Four tabs:

**Tab 1 — Display:**
- Widget title (text input)
- Visualisation type selector (only `supported_viz` options shown)
- Colour override toggle + colour picker
- Show/hide header toggle
- Show/hide footer timestamp toggle
- Widget description/subtitle text input

**Tab 2 — Data:**
- Date window: radio/select for 7 / 14 / 30 / 60 / 90 / 365 / all-time / custom
- "Override global date" toggle
- Dynamic filter fields based on `filter_params` from widget definition:
  - Multi-select dropdowns for `status`, `priority`, `category`
  - Centre selector (if user has `centreId` scope)
- Top N: number input (for list/distribution widgets)
- Group by: select from supported dimensions

**Tab 3 — Thresholds:**
- Good direction: "Up is good" / "Down is good" / "Neutral" radio
- Green zone: min and max number inputs
- Amber zone: min and max
- Red zone: min and max
- Preview: a small gauge showing the current zone configuration
- (Only shown for `kpi_tile` and `gauge` viz types)

**Tab 4 — Table Columns:** (only shown for `table` viz type)
- List of available columns from widget definition
- Checkbox per column to show/hide
- Drag handles to reorder
- Row drill-through URL pattern input (e.g. `/tickets/{{entity_id}}`)

**Apply changes:** Updates happen on the canvas state immediately (optimistic UI). Saved to DB on "Save Draft" click.

---

### US-6.6 — Dashboard Settings Modal

**DashboardSettingsModal.tsx:** Opened by a settings gear icon in the top bar.

Fields:
- Dashboard name (text)
- Description (textarea)
- Icon selector (grid of icon options)
- Accent colour picker
- Global date range (select)
- Allow user date override (toggle)
- Allow widget export (toggle)
- Auto-refresh interval (select: 30s / 1min / 5min / manual)
- Theme: Light / Dark / System

---

### US-6.7 — Preview Mode

**As an admin**, I need to switch to preview mode and see the dashboard as a specific role would see it, using live data.

**In the builder top bar:**
- "Preview" toggle button switches builder to preview mode.
- In preview mode: left panel and right config panel collapse. Canvas renders with live data.
- A "Preview as" dropdown appears: list of all roles.
- Selecting a role re-fetches all widget data with a `preview_as_role=<role_id>` query param.
- The widget data API checks for this param and simulates that role's scope context (Super Admin only).
- "Exit preview" returns to builder mode.

---

### US-6.8 — Assignment Management UI

**Route:** `/admin/dashboards/:id/assignments`

**DashboardAssignmentPage.tsx:**

- Table of current assignments: type, target, scope, tab order, default tab, assigned by, date.
- "+ Add Assignment" button opens a drawer:
  - Assignee type: Role / User (radio)
  - Target: role dropdown (from existing roles) or user search (from existing user list)
  - Scope type: Global / Project / Centre / Email Domain
  - Scope value: project dropdown / centre picker / text input depending on scope type
  - Tab order: number
  - Set as default tab: toggle
  - "Impact preview": "This will add the dashboard for N users"
  - Save calls `POST /templates/:id/assignments`
- Delete button per row calls `DELETE /templates/:id/assignments/:id`

---

## 9. Sprint 7 — Real-Time Updates + Export

### Goal
Socket.io push for KPI tile updates. CSV/Excel export for table widgets.

---

### US-7.1 — Socket.io Dashboard Channel

**As a system**, when source data changes (e.g. a ticket is created or closed), I need connected dashboard clients to receive an event so their KPI tiles update without a full refresh.

**The project already has `socket.io` installed.** Leverage the existing socket server instance.

**File to create:** `backend/src/services/dashboard/dashboardSocketService.ts`

**Events the server emits:**

| Event Name | Payload | When emitted |
|---|---|---|
| `dashboard:widget_update` | `{ widget_key, project_id, new_value, previous_value, threshold_state }` | When a countable metric changes |
| `dashboard:refresh_widget` | `{ widget_key, project_id }` | When cache-based data is invalidated |

**When to emit events:**

In `ticketController.ts` (approved modification), after a ticket is created/updated/closed, add:
```typescript
// Dashboard real-time emit (additive — non-fatal if socket not available)
try {
  const dashSocket = require('../services/dashboard/dashboardSocketService');
  dashSocket.emitTicketCountChange(ticket.project?.toString());
} catch (e) { /* non-fatal */ }
```

**`emitTicketCountChange(projectId)`** logic:
1. Recompute open ticket count for the project: `Ticket.countDocuments({ project, status: 'open' })`
2. Emit `dashboard:widget_update` to a room named `dashboard:project:${projectId}`.
3. All clients viewing a dashboard that includes the project join this room on connect.

**Frontend socket connection (DashboardPage.tsx):**
```typescript
// On mount, join rooms for all scoped projects
socket.emit('join:dashboard', { project_ids: scopedProjectIds });

// Listen for updates
socket.on('dashboard:widget_update', ({ widget_key, project_id, new_value, threshold_state }) => {
  // Update the relevant widget's value in local state without a full re-fetch
  updateWidgetValue(widget_key, project_id, new_value, threshold_state);
});
```

---

### US-7.2 — CSV Export for Table Widgets

**As a user**, I need to export a table widget's data as a CSV or Excel file so I can analyse it offline.

**Widget menu → "Export CSV":**
1. Call `GET /api/v2/dashboard/widgets/:widget_key/data?format=export&date_range_days=...&filters=...`
2. The API responds with full data (no `top_n` limit) when `format=export`.
3. Frontend receives the full dataset, then uses `exceljs` (already in package.json) to generate and download a `.xlsx` file client-side.

**Alternatively** (simpler): add an export endpoint that streams the file directly:

**Route:** `GET /api/v2/dashboard/widgets/:widget_key/export`
**Permission:** `DASHBOARD_EXPORT`

Handler:
1. Execute the query handler with `top_n: 10000` (no practical limit).
2. Use `exceljs` to create a workbook with widget name as sheet title.
3. Pipe the workbook stream to `res` with headers `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
4. The browser downloads it as `[widget_display_name]_[date].xlsx`.

---

## 10. Sprint 8 — Permissions, Seeding, QA

### Goal
Add dashboard permissions to the existing RBAC system, seed default dashboard templates, and verify all acceptance criteria.

---

### US-8.1 — Add Dashboard Permissions to Existing RBAC Seed

**Approved modification:** The existing permissions seed script or migrations.

**New permission codes to add:**

```typescript
// Add to backend/src/constants/permissions.ts PERMISSION_CODES:
DASHBOARD_MANAGE: 'DASHBOARD_MANAGE',           // Create/edit/publish/archive templates
DASHBOARD_ASSIGN: 'DASHBOARD_ASSIGN',           // Assign templates to roles/users
DASHBOARD_VIEW: 'DASHBOARD_VIEW',               // Already exists — keep
DASHBOARD_VIEW_ANALYTICS: 'DASHBOARD_VIEW_ANALYTICS',  // Already exists — keep
DASHBOARD_EXPORT: 'DASHBOARD_EXPORT',           // Already exists — keep
DASHBOARD_PERSONAL_CREATE: 'DASHBOARD_PERSONAL_CREATE', // Create personal dashboards
```

**Migration script:** `backend/src/seeds/addDashboardPermissions.ts`
- Upsert each new permission code into the `permissions` collection.
- Add `DASHBOARD_MANAGE` and `DASHBOARD_ASSIGN` to Super Admin role.
- Idempotent: check if permission exists before inserting.

---

### US-8.2 — Seed Default Dashboard Templates

**File:** `backend/src/seeds/seedDefaultDashboards.ts`

**Seed the following pre-built templates (published status, assigned to their default roles):**

1. **"Executive Overview"** — 15 widgets — Assign to Super Admin role (global scope)
2. **"Agent Work Queue"** — 6 widgets — Assign to Agent role (global scope)

Each seed must:
1. Check if a template with this name already exists for the tenant → skip if so.
2. Create the `dash_templates` document.
3. Create all `dash_widgets` documents with correct grid positions.
4. Create `dash_assignments` for the default role.

---

### US-8.3 — Environment Flag

**Approved modification:** `.env` and `backend/src/config/index.ts`

Add:
```
DASHBOARD_V2_ENABLED=true
```

```typescript
// In config/index.ts:
dashboardV2: {
  enabled: process.env.DASHBOARD_V2_ENABLED === 'true',
}
```

**In `dashboardV2.ts` route file:**
```typescript
router.use((req, res, next) => {
  if (!config.dashboardV2.enabled) {
    return res.status(404).json({ message: 'Dashboard V2 is not enabled' });
  }
  next();
});
```

This means zero impact on existing behaviour when the flag is off.

---

## 11. API Route Summary

All new routes are registered under `/api/v2/dashboard/` in a new file `backend/src/routes/dashboardV2.ts`. This file is imported into `app.ts` or `server.ts` alongside existing routes.

```
GET    /api/v2/dashboard/me                                → Resolve user's dashboards
PATCH  /api/v2/dashboard/me/:templateId/preferences       → Save user preferences

GET    /api/v2/dashboard/widgets/registry                 → Widget catalogue
GET    /api/v2/dashboard/widgets/:widget_key/data         → Widget data
GET    /api/v2/dashboard/widgets/:widget_key/export       → Widget data as Excel

GET    /api/v2/dashboard/templates                        → List templates
POST   /api/v2/dashboard/templates                        → Create template
GET    /api/v2/dashboard/templates/:id                    → Get template + widgets
PUT    /api/v2/dashboard/templates/:id                    → Update template metadata
POST   /api/v2/dashboard/templates/:id/publish            → Publish
POST   /api/v2/dashboard/templates/:id/archive            → Archive
POST   /api/v2/dashboard/templates/:id/duplicate          → Duplicate

POST   /api/v2/dashboard/templates/:id/widgets            → Add widget
PATCH  /api/v2/dashboard/templates/:id/widgets/:wid       → Update widget
DELETE /api/v2/dashboard/templates/:id/widgets/:wid       → Remove widget

GET    /api/v2/dashboard/templates/:id/assignments        → List assignments
POST   /api/v2/dashboard/templates/:id/assignments        → Create assignment
PATCH  /api/v2/dashboard/templates/:id/assignments/:aid   → Update tab order / default
DELETE /api/v2/dashboard/templates/:id/assignments/:aid   → Delete assignment
```

---

## 12. File Change Summary — Approved Modifications to Existing Files

The following existing files are the **only** permitted modifications. All other changes must be in new files.

| File | What changes | Why |
|---|---|---|
| `backend/src/models/Ticket.ts` | Add 3 optional fields + 6 indexes | Sprint 1 — US-1.6 |
| `backend/src/models/User.ts` | Add `centreId` optional field | Sprint 1 — US-1.7 |
| `backend/src/controllers/ticketController.ts` | Add `closedAt` set on status change, `sla_due_at` set on create, `firstRespondedAt` on first reply, socket emit | Sprint 3 — US-3.1, 3.2, 3.3 and Sprint 7 — US-7.1 |
| `backend/src/constants/permissions.ts` | Add 2 new permission code constants | Sprint 8 — US-8.1 |
| `backend/src/config/index.ts` | Add `dashboardV2.enabled` config key | Sprint 8 — US-8.3 |
| `backend/src/server.ts` or `app.ts` | Import and mount `dashboardV2` router | Sprint 2 — route registration |
| `.env` | Add `DASHBOARD_V2_ENABLED=true` | Sprint 8 — US-8.3 |

**Everything else is a new file.**

---

## 13. Acceptance Criteria — Full System

### Database Layer
- [ ] All 5 new `dash_` collections are created on app start without error.
- [ ] `dash_widget_definitions` is seeded with 40+ widgets. Running seed twice produces no duplicates.
- [ ] `Ticket.closedAt`, `Ticket.sla_due_at`, `Ticket.firstRespondedAt` exist as optional fields.
- [ ] `User.centreId` exists as an optional field.
- [ ] All new compound indexes on Ticket collection exist and are confirmed with `db.tickets.getIndexes()`.

### Scope Resolver
- [ ] Super Admin gets `scopedProjectIds` = all project IDs.
- [ ] Agent gets `scopedProjectIds` = only their own projects.
- [ ] Two agents with different project assignments get different scoped data from the same widget.
- [ ] Scope resolution cache returns in < 5ms on cache hit.
- [ ] Scope cache is cleared when a user's role is changed.

### Widget Data API
- [ ] `GET /api/v2/dashboard/widgets/ticket_open_count/data` returns a correct count scoped to the requesting user's projects.
- [ ] A Super Admin and an Agent calling the same endpoint receive different values.
- [ ] A user without `TICKET_VIEW_ALL` or `TICKET_VIEW_OWN` permission receives `403`.
- [ ] An unknown `widget_key` receives `404`.
- [ ] `ticket_sla_resolution_rate` returns a correct percentage after `closedAt` and `sla_due_at` are populated.
- [ ] All queries use indexes (verify with `.explain("executionStats")` — no `COLLSCAN` on scoped fields).

### Template Builder API
- [ ] A template cannot be published with 0 widgets.
- [ ] An assignment cannot be created for a draft or archived template.
- [ ] Duplicating a template creates a new draft with all widgets and no assignments.
- [ ] Archiving a template with active assignments succeeds but returns a warning count.

### User Dashboard Resolution
- [ ] `GET /api/v2/dashboard/me` returns correct dashboards for a role-assigned user.
- [ ] An individual user assignment appears before role assignments in tab order.
- [ ] A user with a project-scoped assignment only sees that dashboard when they have that project in their scope.
- [ ] User with no assignments sees the empty state response.

### Frontend — Viewer
- [ ] Dashboard page loads and shows tab bar within 400ms (template metadata, not widget data).
- [ ] All widgets show skeleton state immediately, then populate as data arrives.
- [ ] One widget failing to load does not break other widgets.
- [ ] Clicking a table row in `my_assigned_tickets` navigates to the correct ticket detail page.
- [ ] Changing the global date range filter causes all supporting widgets to re-fetch.
- [ ] Auto-refresh fires at the configured interval and updates values without skeleton flash.

### Frontend — Builder
- [ ] Admin can create a new dashboard, add 5 widgets, configure each, and publish in under 10 minutes.
- [ ] Undo reverses the last canvas action (remove widget, reposition, resize).
- [ ] Preview mode shows live data scoped to the admin's own identity.
- [ ] Preview as role correctly simulates a different role's scope.

### Real-Time
- [ ] Creating a new ticket causes connected users' `ticket_open_count` widget to update within 5 seconds.
- [ ] Socket connection is maintained across page navigations within the app.

### Security
- [ ] No widget data endpoint returns data from a project the user is not a member of.
- [ ] No user can call `POST /api/v2/dashboard/templates` without `DASHBOARD_VIEW_ANALYTICS`.
- [ ] The old `GET /api/dashboard/statistics` endpoint continues to work unchanged.
- [ ] Setting `DASHBOARD_V2_ENABLED=false` makes all `/api/v2/dashboard/` routes return 404 with zero impact on existing functionality.

---

## 14. Running Order — Day by Day

### Week 1 (Sprint 1)
- Day 1–2: Create 5 model files. Add fields to Ticket + User. Run index creation.
- Day 3: Write and run seed script. Verify all 40+ widgets in DB.
- Day 4–5: Write migration script for existing closed tickets. Test schema changes.

### Week 2 (Sprint 2)
- Day 1: Build `scopeResolver.ts`. Write unit tests for Super Admin vs Agent scope.
- Day 2–3: Build all query handlers (ticket, user, KB, activity, email).
- Day 4: Build `widgetDataService.ts` registry. Build `dashboardV2Controller.ts`.
- Day 5: Create routes. Register in app. Manual test all widget endpoints.

### Week 3 (Sprint 3 + Start 4)
- Day 1–2: Add `closedAt`, `sla_due_at`, `firstRespondedAt` population to `ticketController.ts`. Test.
- Day 3: Verify SLA resolution rate widget returns correct values.
- Day 4–5: Build template CRUD API (US-4.1 through US-4.8).

### Week 4 (Sprint 4 continued)
- Day 1–2: Build assignment API (US-4.10 through US-4.13).
- Day 3–4: Build `GET /me` resolver with priority ordering logic.
- Day 5: Build user preferences endpoint. Test end-to-end flow.

### Week 5 (Sprint 5)
- Day 1: Set up routing + `useDashboards` hook + `DashboardPage`.
- Day 2: Build `DashboardGrid` + `WidgetCard` + all widget states.
- Day 3: Build all viz renderer components (KPI, line, bar, donut, gauge, table, feed).
- Day 4: Build `GlobalFilterBar` + wire filters to widget fetches.
- Day 5: Widget expand modal + auto-refresh.

### Week 6 (Sprint 6)
- Day 1–2: Builder layout + widget panel + canvas grid.
- Day 3: Drag-and-drop + resize + undo/redo.
- Day 4: Widget config panel (all 4 tabs).
- Day 5: Dashboard settings modal + preview mode + assignment management UI.

### Week 7 (Sprints 7 + 8)
- Day 1–2: Socket.io real-time — server emit + client listener.
- Day 3: Excel export endpoint.
- Day 4: Permissions seed + default template seed.
- Day 5: Full QA pass against acceptance criteria. Fix any gaps.

---

*End of Document — Dashboard Module End-to-End Development Guide v1.0*
