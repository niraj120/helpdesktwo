# Dashboard Module — Master Development Guide

## SAC Helpdesk Portal | Complete End-to-End Implementation Reference

**Document Version:** 2.0 — Final  
**Project:** SAC Helpdesk Portal — Custom Dashboard Engine  
**Stack:** Node.js + TypeScript + Express + MongoDB + Mongoose + Socket.io  
**Codebase Reference:** hubblehox-technologies-helpdesk (commit 8f39a778e8ad)  
**Audience:** Development Team (AI Developer)  
**Date:** May 2026

---

## Table of Contents

1. [Ground Rules](#1-ground-rules)
2. [Architecture Overview](#2-architecture-overview)
3. [Complete Project Plan — All 11 Sprints](#3-complete-project-plan)
4. [Datapoint-to-Widget Mapping](#4-datapoint-to-widget-mapping)
5. [Sprint 1 — Foundation: Database + Widget Registry](#5-sprint-1)
6. [Sprint 2 — Scope Resolver + Widget Data API](#6-sprint-2)
7. [Sprint 3 — Schema Additions + SLA Population](#7-sprint-3)
8. [Sprint 4 — Template Builder API](#8-sprint-4)
9. [Sprint 5 — Frontend: Dashboard Viewer](#9-sprint-5)
10. [Sprint 6 — Frontend: Dashboard Builder](#10-sprint-6)
11. [Sprint 7 — Real-Time Updates + Export](#11-sprint-7)
12. [Sprint 8 — Permissions, Seeding, QA](#12-sprint-8)
13. [Sprint 9 — CSAT / NPS / CES Scoring](#13-sprint-9)
14. [Sprint 10 — Scheduled Report Delivery](#14-sprint-10)
15. [Sprint 11 — Threshold Alerts as Notifications](#15-sprint-11)
16. [Complete API Route Reference](#16-api-route-reference)
17. [Approved File Modifications](#17-approved-file-modifications)
18. [New File Tree](#18-new-file-tree)
19. [Full Acceptance Criteria](#19-acceptance-criteria)
20. [Day-by-Day Execution Plan](#20-day-by-day-plan)

---

## 1. Ground Rules

These rules are non-negotiable. Every developer must follow them before writing a single line.

**Rule 1 — Additive only.** No existing file is deleted or broken. Every new feature is in a new file. The only permitted modifications to existing files are listed explicitly in Section 17.

**Rule 2 — Old endpoints survive.** `GET /api/dashboard/statistics` stays exactly as it is. The old `dashboardController.ts` is not touched. New endpoints live under `/api/v2/dashboard/`.

**Rule 3 — Models are extended, not changed.** No field is renamed or removed. No existing index is dropped. New optional fields are appended only.

**Rule 4 — Feature flag controls activation.** `DASHBOARD_V2_ENABLED=true` in `.env` activates the new system. When false, all `/api/v2/dashboard/` routes return 404 and the rest of the system is unaffected.

**Rule 5 — Collection naming.** Every new MongoDB collection is prefixed `dash_` to prevent collisions: `dash_widget_definitions`, `dash_templates`, `dash_widgets`, `dash_assignments`, `dash_user_prefs`, `dash_scheduled_reports`, `dash_threshold_alerts`.

**Rule 6 — Existing middleware reused.** `authMiddleware` from `src/middleware/auth.ts` and `checkPermission` from `src/middleware/permissions.ts` are used as-is on all new routes.

**Rule 7 — Non-fatal dashboard additions.** Any code added to existing controller files (e.g. `ticketController.ts`) must be wrapped in try/catch and must not affect the existing response in any way.

---

## 2. Architecture Overview

### 2.1 System Layers

```
┌────────────────────────────────────────────────────────────┐
│  EXISTING SYSTEM — UNTOUCHED                               │
│  GET /api/dashboard/statistics → dashboardController.ts    │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  NEW DASHBOARD ENGINE — ADDITIVE                           │
│                                                            │
│  Layer 1 — Widget Registry (developer-defined)             │
│  Layer 2 — Dashboard Builder (admin-composed)              │
│  Layer 3 — Dashboard Viewer (user-consumed, scoped)        │
│  Layer 4 — Scheduled Reports (commissioner delivery)       │
│  Layer 5 — Threshold Alerts (proactive intelligence)       │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  NEW COLLECTIONS (all prefixed dash_)                      │
│  dash_widget_definitions  dash_templates  dash_widgets     │
│  dash_assignments  dash_user_prefs                         │
│  dash_scheduled_reports  dash_threshold_alerts             │
│  feedback_scores  (Sprint 9)                               │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  ADDITIVE SCHEMA ADDITIONS (optional fields only)          │
│  Ticket  → +closedAt  +sla_due_at  +firstRespondedAt      │
│  User    → +centreId                                       │
└────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow — Widget Request

```
Browser → GET /api/v2/dashboard/widgets/ticket_open_count/data
              ↓
        authMiddleware   (existing — reads JWT)
              ↓
        checkPermission  (existing — RBAC check)
              ↓
        scopeResolver    (NEW — reads user.projects, role.code)
              ↓ returns ScopeContext
        QUERY_REGISTRY['ticket_open_count']
              ↓ calls ticketHandlers.openCount(scope, config)
              ↓
        MongoDB query with scope.scopedProjectIds injected
              ↓
        Standardised response envelope
              ↓
        Browser renders widget
```

### 2.3 Scope Resolver — The Core Principle

Every widget query is scoped to the requesting user's identity. The same dashboard template assigned to a Commissioner and a District Officer returns different data because the Scope Resolver injects different project ID sets. This is **always server-side from the JWT** — the client sends no scope parameters that the server trusts.

```
Super Admin  → scopedProjectIds = ALL project IDs in tenant
Project Admin → scopedProjectIds = their assigned projects
Agent        → scopedProjectIds = their assigned projects (personal data filtered further)
End User     → scopedProjectIds = their projects + userId filter on personal widgets
```

### 2.4 Technology Map (all already in package.json)

| Capability     | Technology        | Source                                     |
| -------------- | ----------------- | ------------------------------------------ |
| Authentication | `authMiddleware`  | `src/middleware/auth.ts` (existing)        |
| Permissions    | `checkPermission` | `src/middleware/permissions.ts` (existing) |
| Real-time push | `socket.io`       | Already in `package.json`                  |
| Excel export   | `exceljs`         | Already in `package.json`                  |
| Email delivery | `nodemailer`      | Already in `package.json`                  |
| Scheduled jobs | `node-cron`       | **New install required**                   |
| PDF generation | `html-pdf-node`   | **New install required**                   |

**New packages to install (Sprint 10 only):**

```bash
npm install node-cron html-pdf-node
npm install @types/node-cron --save-dev
```

---

## 3. Complete Project Plan

### Sprint Overview — All 11 Sprints

| Sprint | Name                             | Duration | Produces                              |
| ------ | -------------------------------- | -------- | ------------------------------------- |
| 1      | Foundation — DB + Registry       | 1 week   | 7 new collections, 47+ widgets seeded |
| 2      | Scope Resolver + Widget Data API | 1 week   | All widget endpoints live             |
| 3      | Schema Additions + SLA           | 3 days   | SLA rate widget working               |
| 4      | Template Builder API             | 1 week   | Templates CRUD + assignment           |
| 5      | Frontend — Viewer                | 1 week   | Dashboard page renders widgets        |
| 6      | Frontend — Builder               | 1 week   | Admin builder with drag/drop          |
| 7      | Real-time + Export               | 3 days   | Socket.io push + Excel export         |
| 8      | Permissions + QA                 | 3 days   | RBAC complete, all tests pass         |
| 9      | CSAT / NPS / CES Scoring         | 4 days   | Satisfaction widgets                  |
| 10     | Scheduled Report Delivery        | 1 week   | PDF/CSV email delivery                |
| 11     | Threshold Alerts                 | 4 days   | Proactive KPI alerts                  |

**Total duration: 9–10 weeks**  
Sprints 9–11 can be parallelised with Sprints 6–8 by a second developer.

---

## 4. Datapoint-to-Widget Mapping

This section maps every field from every MongoDB model in the codebase to its corresponding dashboard widget. Developers must use exact field names as listed.

### 4.1 Critical Finding — What the Current Controller Is Missing

The existing `dashboardController.ts` has:

- `averageResponseTime = 2.5` — **hardcoded, not computed**
- `slaCompliance = 95` — **hardcoded, not computed**
- All queries run **without project scope** — every tenant sees all tickets

The new engine replaces all of this. The old controller is kept running untouched.

### 4.2 Ticket Model Fields (`backend/src/models/Ticket.ts`)

| Field                    | MongoDB Field       | Type             | Indexed  | Widget Usage                                      |
| ------------------------ | ------------------- | ---------------- | -------- | ------------------------------------------------- |
| `ticketNumber`           | `ticketNumber`      | String           | Unique   | Display in table widgets                          |
| `title`                  | `title`             | String           | Text     | Table widgets, search                             |
| `status`                 | `status`            | Enum             | Yes      | `ticket_by_status`, count widgets                 |
| `priority`               | `priority`          | Enum             | Yes      | `ticket_by_priority`, SLA                         |
| `category`               | `category`          | String           | Yes      | `ticket_by_category`                              |
| `createdBy`              | `createdBy`         | ObjectId→User    | Compound | Scope for end users                               |
| `assignedTo`             | `assignedTo`        | ObjectId→User    | Compound | `ticket_assignee_workload`, `my_assigned_tickets` |
| `project`                | `project`           | ObjectId→Project | Yes      | **PRIMARY SCOPE FIELD** — all ticket widgets      |
| `submissionSource`       | `submissionSource`  | Enum             | Yes      | `ticket_by_submission_source`                     |
| `escalationHistory`      | `escalationHistory` | Array            | No       | `ticket_escalation_count`                         |
| `comments`               | `comments`          | Array            | No       | `ticket_comment_count`                            |
| `createdAt`              | `createdAt`         | Date             | Compound | All trend widgets                                 |
| `updatedAt`              | `updatedAt`         | Date             | Yes      | `ticket_recent_list`                              |
| `closedAt` ⚠ ADD         | `closedAt`          | Date             | Add      | `ticket_sla_resolution_rate`                      |
| `sla_due_at` ⚠ ADD       | `sla_due_at`        | Date             | Add      | `ticket_sla_resolution_rate`                      |
| `firstRespondedAt` ⚠ ADD | `firstRespondedAt`  | Date             | No       | `ticket_first_response_time`                      |

### 4.3 User Model Fields (`backend/src/models/User.ts`)

| Field                  | MongoDB Field          | Widget Usage                                   |
| ---------------------- | ---------------------- | ---------------------------------------------- |
| `email`                | `email`                | `user_by_email_domain`, scoping                |
| `role`                 | `role`                 | `user_by_role`                                 |
| `isActive`             | `isActive`             | `user_active_count`, `user_inactive_count`     |
| `lastLogin`            | `lastLogin`            | `user_never_logged_in`, `user_last_login_list` |
| `projects`             | `projects`             | **PRIMARY SCOPE FIELD** — all user widgets     |
| `registrationSource`   | `registrationSource`   | `user_by_registration_source`                  |
| `eulaAccepted`         | `eulaAccepted`         | `user_eula_acceptance_rate`                    |
| `requirePasswordSetup` | `requirePasswordSetup` | `user_password_setup_pending`                  |
| `department`           | `department`           | `user_by_department`                           |
| `centreId` ⚠ ADD       | `centreId`             | Centre-scoped widgets                          |
| `createdAt`            | `createdAt`            | `user_new_registrations`                       |

### 4.4 KnowledgeBaseArticle Fields (`backend/src/models/KnowledgeBaseArticle.ts`)

| Field                              | Widget Usage                           |
| ---------------------------------- | -------------------------------------- |
| `projectId`                        | Scope field for all KB widgets         |
| `status`                           | `kb_published_count`, `kb_draft_count` |
| `viewCount`                        | `kb_top_viewed`                        |
| `helpfulCount` + `notHelpfulCount` | `kb_helpfulness_rate`                  |
| `category`                         | `kb_by_category`                       |
| `isActive`                         | Filter — exclude soft-deleted          |

### 4.5 ActivityLog + AccessLog Fields

ActivityLog (`backend/src/models/ActivityLog.ts`):

- `userId`, `userEmail`, `action`, `entity`, `entityName`, `timestamp`, `project` → `activity_feed`

AccessLog (`backend/src/models/AccessLog.ts`):

- `action: 'login_failed'`, `timestamp`, `project` → `login_failure_count`
- `action: 'login'`, `success: true`, `userId`, `timestamp` → `active_session_count`
- `action: 'logout'`, `sessionDuration` → `avg_session_duration`

### 4.6 EmailLog Fields (`backend/src/models/EmailLog.ts`)

- `projectId`, `status`, `sentAt` → `email_sent_count`, `email_failure_rate`
- `type` → `email_by_type`

### 4.7 SLARule Fields (`backend/src/models/sla-module/SLARule.ts`)

- `priority`, `responseTime`, `resolutionTime`, `isActive`, `projectIds` → `sla_rules_overview`
- Used during ticket creation to compute `sla_due_at`

### 4.8 EscalationPolicy Fields (`backend/src/models/sla-module/EscalationPolicy.ts`)

- `isActive`, `projectIds` → `escalation_policies_count`
- `levels` → detailed escalation audit widget

### 4.9 What Is Ready vs What Needs Work

**✅ Ready to query immediately (fields exist):**
All ticket count widgets, ticket by status/priority/category, ticket volume trend, escalation count, assignee workload, my assigned tickets, all KB widgets, user count/active/inactive/by-role, new registrations, never logged in, EULA rate, activity feed, login failure count, email sent/failure

**⚠ Needs schema additions first (Sprint 3):**

- `ticket_sla_resolution_rate` — needs `Ticket.closedAt` and `Ticket.sla_due_at`
- `ticket_first_response_time` — needs `Ticket.firstRespondedAt`
- Centre-scoped widgets — needs `User.centreId`

**⚠ Needs new compound indexes (add in Sprint 1):**

```typescript
{ project: 1, status: 1, createdAt: -1 }
{ project: 1, priority: 1, createdAt: -1 }
{ project: 1, category: 1, createdAt: -1 }
{ project: 1, assignedTo: 1, status: 1 }
{ project: 1, closedAt: -1 }
{ project: 1, sla_due_at: 1 }
```

---

## 5. Sprint 1 — Foundation: Database + Widget Registry

### Goal

Create all new MongoDB collections and seed the complete widget registry. No API endpoints. No frontend. Pure data layer.

### New Files to Create

```
backend/src/models/dashboard/
  ├── DashWidgetDefinition.ts
  ├── DashTemplate.ts
  ├── DashWidget.ts
  ├── DashAssignment.ts
  ├── DashUserPref.ts
  └── index.ts

backend/src/seeds/
  ├── seedWidgetDefinitions.ts
  └── migrateClosedAt.ts
```

### Approved Modifications to Existing Files (Sprint 1)

- `backend/src/models/Ticket.ts` — add 3 optional fields + 6 indexes
- `backend/src/models/User.ts` — add 1 optional field

---

### US-1.1 — DashWidgetDefinition Model

**As a system**, I need a `dash_widget_definitions` collection storing every available widget type so admins can select from them in the builder without any code change.

**File:** `backend/src/models/dashboard/DashWidgetDefinition.ts`

| Field                 | Type        | Required | Notes                                                                                                                                                  |
| --------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `widget_key`          | String      | Yes      | Unique. Never changes. e.g. `ticket_open_count`                                                                                                        |
| `module`              | String enum | Yes      | `ticketing`, `users`, `knowledge_base`, `sla`, `activity`, `email`, `approvals`, `satisfaction`, `system`                                              |
| `display_name`        | String      | Yes      | Shown in builder panel                                                                                                                                 |
| `description`         | String      | No       | Builder tooltip                                                                                                                                        |
| `supported_viz`       | String[]    | Yes      | From: `kpi_tile`, `kpi_pair`, `line_chart`, `area_chart`, `bar_chart`, `donut_chart`, `pie_chart`, `gauge`, `progress_bar`, `table`, `feed`, `heatmap` |
| `default_viz`         | String      | Yes      | Must be in `supported_viz`                                                                                                                             |
| `scope_dimensions`    | String[]    | Yes      | Subset of: `project`, `user`, `centre`, `email_domain`                                                                                                 |
| `filter_params`       | Mixed       | No       | JSON — accepted filter parameter definitions                                                                                                           |
| `query_handler`       | String      | Yes      | Maps to function in QUERY_REGISTRY                                                                                                                     |
| `is_exportable`       | Boolean     | No       | Default false                                                                                                                                          |
| `cache_ttl_seconds`   | Number      | No       | Default 60                                                                                                                                             |
| `is_real_time`        | Boolean     | No       | Default false                                                                                                                                          |
| `aggregation_level`   | String enum | Yes      | `count`, `rate`, `trend`, `list`, `distribution`                                                                                                       |
| `requires_permission` | String[]    | No       | OR logic — user needs at least one                                                                                                                     |
| `is_active`           | Boolean     | No       | Default true                                                                                                                                           |
| `version`             | Number      | No       | Default 1                                                                                                                                              |

**Indexes:**

- `{ widget_key: 1 }` — unique index
- `{ module: 1, is_active: 1 }` — for builder panel grouping

---

### US-1.2 — DashTemplate Model

**As a system**, I need a `dash_templates` collection to store admin-composed dashboard layouts.

**File:** `backend/src/models/dashboard/DashTemplate.ts`

| Field                      | Type            | Required | Notes                                             |
| -------------------------- | --------------- | -------- | ------------------------------------------------- |
| `tenant_id`                | String          | Yes      | Multi-tenancy scope — global for now, one tenant  |
| `name`                     | String          | Yes      | Dashboard display name                            |
| `description`              | String          | No       |                                                   |
| `icon`                     | String          | No       | Icon name string                                  |
| `accent_colour`            | String          | No       | Hex. Default `#3b82f6`                            |
| `status`                   | String enum     | Yes      | `draft`, `published`, `archived`. Default `draft` |
| `theme`                    | String enum     | No       | `light`, `dark`, `system`. Default `system`       |
| `global_date_range_days`   | Number          | No       | Default 30                                        |
| `allow_user_date_override` | Boolean         | No       | Default true                                      |
| `allow_widget_export`      | Boolean         | No       | Default false                                     |
| `auto_refresh_seconds`     | Number          | No       | Default 60. Minimum 30.                           |
| `created_by`               | ObjectId → User | Yes      |                                                   |
| `last_modified_by`         | ObjectId → User | No       |                                                   |

**Timestamps:** enabled  
**Indexes:** `{ tenant_id: 1, status: 1 }`, `{ created_by: 1 }`

---

### US-1.3 — DashWidget Model

**As a system**, I need a `dash_widgets` collection to store individual widget placements with full per-instance configuration.

**File:** `backend/src/models/dashboard/DashWidget.ts`

| Field                       | Type                            | Required | Notes                                                                                 |
| --------------------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `dashboard_template_id`     | ObjectId → DashTemplate         | Yes      |                                                                                       |
| `widget_definition_id`      | ObjectId → DashWidgetDefinition | Yes      |                                                                                       |
| `widget_key`                | String                          | Yes      | Denormalised for fast lookup                                                          |
| `widget_definition_version` | Number                          | No       | Snapshot at time of placement                                                         |
| `title`                     | String                          | Yes      | Admin-set display title                                                               |
| `subtitle`                  | String                          | No       | Optional under-title description                                                      |
| `visualisation_type`        | String                          | Yes      | Must be in definition's `supported_viz`                                               |
| `grid_x`                    | Number                          | Yes      | Column start, 0-indexed, 0–11                                                         |
| `grid_y`                    | Number                          | Yes      | Row start, 0-indexed                                                                  |
| `grid_width`                | Number                          | Yes      | 3–12, default 4                                                                       |
| `grid_height`               | Number                          | Yes      | 2–8, default 2                                                                        |
| `mobile_order`              | Number                          | No       | Stacking order on mobile                                                              |
| `display_config`            | Mixed                           | No       | `{ show_header, show_footer_timestamp, colour_override }`                             |
| `data_config`               | Mixed                           | No       | `{ date_range_days, override_global_date, filters, group_by, top_n, scope_override }` |
| `threshold_config`          | Mixed                           | No       | `{ green_min, green_max, amber_min, amber_max, red_min, red_max, good_direction }`    |
| `table_config`              | Mixed                           | No       | `{ columns, sort_by, sort_dir, drill_through_url, show_search, per_page }`            |
| `is_collapsed_default`      | Boolean                         | No       | Default false                                                                         |

**Indexes:** `{ dashboard_template_id: 1 }`, `{ widget_key: 1 }`

---

### US-1.4 — DashAssignment Model

**As a system**, I need a `dash_assignments` collection storing which templates are assigned to which roles or users, with optional project/centre/email-domain scoping.

**File:** `backend/src/models/dashboard/DashAssignment.ts`

| Field                   | Type                    | Required | Notes                                                         |
| ----------------------- | ----------------------- | -------- | ------------------------------------------------------------- |
| `tenant_id`             | String                  | Yes      |                                                               |
| `dashboard_template_id` | ObjectId → DashTemplate | Yes      |                                                               |
| `assignee_type`         | String enum             | Yes      | `role` or `user`                                              |
| `assignee_id`           | ObjectId                | Yes      | Role ID or User ID                                            |
| `scope_type`            | String enum             | Yes      | `global`, `project`, `centre`, `email_domain`, `multi_centre` |
| `scope_project_id`      | ObjectId → Project      | No       | When `scope_type = project`                                   |
| `scope_centre_ids`      | ObjectId[]              | No       | When `scope_type = centre` or `multi_centre`                  |
| `scope_email_domain`    | String                  | No       | When `scope_type = email_domain` e.g. `@district5.gov.in`     |
| `tab_order`             | Number                  | No       | Default 0                                                     |
| `is_default_tab`        | Boolean                 | No       | Default false                                                 |
| `assigned_by`           | ObjectId → User         | Yes      |                                                               |

**Timestamps:** enabled  
**Unique constraint:** `{ tenant_id, dashboard_template_id, assignee_type, assignee_id, scope_type, scope_project_id }`  
**Indexes:** `{ assignee_type: 1, assignee_id: 1, tenant_id: 1 }`, `{ tenant_id: 1, dashboard_template_id: 1 }`

---

### US-1.5 — DashUserPref Model

**As a system**, I need a `dash_user_prefs` collection to store per-user per-dashboard preferences.

**File:** `backend/src/models/dashboard/DashUserPref.ts`

| Field                   | Type                    | Notes                                       |
| ----------------------- | ----------------------- | ------------------------------------------- |
| `user_id`               | ObjectId → User         |                                             |
| `tenant_id`             | String                  |                                             |
| `dashboard_template_id` | ObjectId → DashTemplate |                                             |
| `collapsed_widget_ids`  | ObjectId[]              | DashWidget IDs user has collapsed           |
| `saved_date_range_days` | Number                  | User's saved date range override            |
| `saved_filters`         | Mixed                   | `{ status, priority, category, centre_id }` |
| `last_viewed_at`        | Date                    |                                             |

**Unique constraint:** `{ user_id, dashboard_template_id }`  
**Index:** `{ user_id: 1, tenant_id: 1 }`

---

### US-1.6 — Additive Schema Changes to Ticket Model

**Approved modification:** `backend/src/models/Ticket.ts`

Add to `ITicket` interface and `TicketSchema` (all optional — no `required: true`):

```typescript
// Interface additions:
closedAt?: Date;          // Set when status → 'closed' or 'resolved'
sla_due_at?: Date;        // Computed from Priority.resolutionTime at ticket creation
firstRespondedAt?: Date;  // Set when first non-system agent reply posted

// Schema additions:
closedAt:         { type: Date, index: true },
sla_due_at:       { type: Date, index: true },
firstRespondedAt: { type: Date },
```

**New compound indexes (append — do not remove existing):**

```typescript
TicketSchema.index({ project: 1, status: 1, createdAt: -1 });
TicketSchema.index({ project: 1, priority: 1, createdAt: -1 });
TicketSchema.index({ project: 1, category: 1, createdAt: -1 });
TicketSchema.index({ project: 1, assignedTo: 1, status: 1 });
TicketSchema.index({ project: 1, closedAt: -1 });
TicketSchema.index({ project: 1, sla_due_at: 1 });
```

---

### US-1.7 — Additive Schema Change to User Model

**Approved modification:** `backend/src/models/User.ts`

```typescript
// Interface addition:
centreId?: mongoose.Types.ObjectId;

// Schema addition:
centreId: {
  type: Schema.Types.ObjectId,
  ref: 'Center',
  sparse: true,
  index: true,
}
```

---

### US-1.8 — Widget Definition Seed Script

**File:** `backend/src/seeds/seedWidgetDefinitions.ts`

Seed behaviour: upsert by `widget_key`. Idempotent — running twice creates no duplicates.  
Run command: `npx ts-node src/seeds/seedWidgetDefinitions.ts`

**Complete widget catalogue to seed (47 widgets):**

**Module: ticketing (20 widgets)**

| widget_key                     | display_name            | default_viz | scope_dimensions | real_time | requires_permission              |
| ------------------------------ | ----------------------- | ----------- | ---------------- | --------- | -------------------------------- |
| `ticket_open_count`            | Open Tickets            | kpi_tile    | project, user    | Yes       | TICKET_VIEW_ALL, TICKET_VIEW_OWN |
| `ticket_closed_count`          | Closed Tickets          | kpi_tile    | project          | Yes       | TICKET_VIEW_ALL                  |
| `ticket_inprogress_count`      | In-Progress Tickets     | kpi_tile    | project          | Yes       | TICKET_VIEW_ALL                  |
| `ticket_resolved_count`        | Resolved Tickets        | kpi_tile    | project          | Yes       | TICKET_VIEW_ALL                  |
| `ticket_onhold_count`          | On-Hold Tickets         | kpi_tile    | project          | Yes       | TICKET_VIEW_ALL                  |
| `ticket_by_status`             | Tickets by Status       | donut_chart | project          | No        | TICKET_VIEW_ALL                  |
| `ticket_by_priority`           | Tickets by Priority     | donut_chart | project          | No        | TICKET_VIEW_ALL                  |
| `ticket_by_category`           | Tickets by Category     | bar_chart   | project          | No        | TICKET_VIEW_ALL                  |
| `ticket_by_submission_source`  | Tickets by Source       | donut_chart | project          | No        | TICKET_VIEW_ALL                  |
| `ticket_volume_trend`          | Ticket Volume Trend     | line_chart  | project          | No        | TICKET_VIEW_ALL                  |
| `ticket_escalation_count`      | Escalated Tickets       | kpi_tile    | project          | Yes       | TICKET_VIEW_ALL                  |
| `ticket_assignee_workload`     | Agent Workload          | bar_chart   | project          | No        | TICKET_VIEW_ALL                  |
| `my_assigned_tickets`          | My Assigned Tickets     | table       | user             | Yes       | TICKET_VIEW_OWN                  |
| `ticket_recent_list`           | Recent Tickets          | feed        | project          | Yes       | TICKET_VIEW_ALL                  |
| `ticket_sla_resolution_rate`   | SLA Resolution Rate     | kpi_tile    | project          | No        | REPORT_VIEW_SLA                  |
| `ticket_first_response_time`   | Avg First Response Time | kpi_tile    | project          | No        | REPORT_VIEW_SLA                  |
| `ticket_escalated_this_period` | Escalated (Period)      | kpi_tile    | project          | No        | TICKET_VIEW_ALL                  |
| `ticket_sla_rules_overview`    | SLA Rules Configured    | table       | project          | No        | REPORT_VIEW_SLA                  |
| `ticket_comment_count`         | Total Comments          | kpi_tile    | project          | No        | TICKET_VIEW_ALL                  |
| `ticket_merge_count`           | Merged Tickets          | kpi_tile    | project          | No        | TICKET_VIEW_ALL                  |

**Module: users (11 widgets)**

| widget_key                    | display_name           | default_viz | scope_dimensions |
| ----------------------------- | ---------------------- | ----------- | ---------------- |
| `user_total_count`            | Total Users            | kpi_tile    | project          |
| `user_active_count`           | Active Users           | kpi_tile    | project          |
| `user_inactive_count`         | Inactive Users         | kpi_tile    | project          |
| `user_by_role`                | Users by Role          | donut_chart | project          |
| `user_new_registrations`      | New Registrations MTD  | kpi_tile    | project          |
| `user_by_registration_source` | Users by Source        | bar_chart   | project          |
| `user_last_login_list`        | Recent Login Activity  | table       | project          |
| `user_never_logged_in`        | Never Logged In        | kpi_tile    | project          |
| `user_by_department`          | Users by Department    | bar_chart   | project          |
| `user_eula_acceptance_rate`   | EULA Acceptance Rate   | gauge       | project          |
| `user_password_setup_pending` | Password Setup Pending | kpi_tile    | project          |

**Module: knowledge_base (7 widgets)**

| widget_key            | display_name         | default_viz |
| --------------------- | -------------------- | ----------- |
| `kb_total_articles`   | Total KB Articles    | kpi_tile    |
| `kb_published_count`  | Published Articles   | kpi_tile    |
| `kb_draft_count`      | Draft Articles       | kpi_tile    |
| `kb_archived_count`   | Archived Articles    | kpi_tile    |
| `kb_top_viewed`       | Top Viewed Articles  | table       |
| `kb_helpfulness_rate` | KB Helpfulness Rate  | gauge       |
| `kb_recent_updates`   | Recently Updated     | table       |
| `kb_by_category`      | Articles by Category | bar_chart   |

**Module: activity (4 widgets)**

| widget_key             | display_name          | default_viz |
| ---------------------- | --------------------- | ----------- |
| `activity_feed`        | Recent Activity Feed  | feed        |
| `login_failure_count`  | Failed Login Attempts | kpi_tile    |
| `active_session_count` | Active Users Today    | kpi_tile    |
| `avg_session_duration` | Avg Session Duration  | kpi_tile    |

**Module: email (3 widgets)**

| widget_key           | display_name       | default_viz |
| -------------------- | ------------------ | ----------- |
| `email_sent_count`   | Emails Sent        | kpi_tile    |
| `email_failure_rate` | Email Failure Rate | gauge       |
| `email_by_type`      | Emails by Type     | bar_chart   |

**Module: satisfaction (6 widgets — Sprint 9)**

| widget_key               | display_name           | default_viz |
| ------------------------ | ---------------------- | ----------- |
| `csat_score`             | CSAT Score             | kpi_tile    |
| `nps_score`              | Net Promoter Score     | kpi_tile    |
| `ces_score`              | Customer Effort Score  | kpi_tile    |
| `satisfaction_trend`     | CSAT Trend             | line_chart  |
| `csat_by_agent`          | CSAT by Agent          | bar_chart   |
| `feedback_response_rate` | Feedback Response Rate | gauge       |

---

### US-1.9 — Historical Data Migration Script

**File:** `backend/src/seeds/migrateClosedAt.ts`

One-time run. Backfills `closedAt` using `updatedAt` as a proxy for tickets already in closed/resolved status.

```typescript
await Ticket.updateMany(
  { status: { $in: ["closed", "resolved"] }, closedAt: { $exists: false } },
  [{ $set: { closedAt: "$updatedAt" } }],
);
```

Run once: `npx ts-node src/seeds/migrateClosedAt.ts`  
Idempotent: only updates documents where `closedAt` does not already exist.

---

## 6. Sprint 2 — Scope Resolver + Widget Data API

### Goal

Every widget has a live, scoped data endpoint. This is the engine room of the entire dashboard.

### New Files to Create

```
backend/src/services/dashboard/
  ├── scopeResolver.ts
  ├── widgetDataService.ts
  └── queryHandlers/
      ├── ticketHandlers.ts
      ├── userHandlers.ts
      ├── kbHandlers.ts
      ├── activityHandlers.ts
      ├── emailHandlers.ts
      └── slaHandlers.ts

backend/src/controllers/dashboardV2Controller.ts
backend/src/routes/dashboardV2.ts
```

---

### US-2.1 — Scope Resolver Service

**File:** `backend/src/services/dashboard/scopeResolver.ts`

**Input:** `req.user` (populated by existing `authMiddleware`)  
**Output:** `ScopeContext`

```typescript
interface ScopeContext {
  userId: string;
  email: string;
  emailDomain: string; // email.split('@')[1]
  roleId: string;
  roleCode: string; // e.g. 'SUPER_ADMIN', 'AGENT'
  roleName: string;
  scopedProjectIds: string[]; // ObjectId strings
  centreId?: string;
  isSuperAdmin: boolean;
  permissions: string[]; // Permission codes
}
```

**Resolution algorithm:**

```
1. Extract userId from req.user.userId

2. Try in-memory cache:
   Key: `scope:${userId}`
   TTL: 5 minutes
   If hit: return cached ScopeContext

3. Cache miss → DB lookup:
   User.findById(userId)
     .select('email role projects centreId')
     .populate({ path: 'role', select: 'name code permissions projects' })
     .lean()

4. Determine scopedProjectIds:
   IF role.code === 'SUPER_ADMIN':
     fetch all active Project._id values
   ELSE:
     user.projects.map(id => id.toString())
     (intersect with role.projects if role.projects is non-empty)

5. Extract permission codes from role.permissions
   (dual-check: both inline codes and ObjectId refs, matching existing permissions.ts logic)

6. Build ScopeContext, store in cache, return
```

**Cache invalidation:** Call `clearScopeCache(userId)` when a user's role is changed. Implement as:

```typescript
const scopeCache = new Map<
  string,
  { scope: ScopeContext; expiresAt: number }
>();
export function clearScopeCache(userId: string) {
  scopeCache.delete(userId);
}
```

**Acceptance criteria:**

- Super Admin → `scopedProjectIds` = all project IDs
- Agent → `scopedProjectIds` = only assigned projects
- Cache hit returns in < 1ms
- Cache is cleared immediately on role change

---

### US-2.2 — Widget Data Service + Query Registry

**File:** `backend/src/services/dashboard/widgetDataService.ts`

**TypeScript types:**

```typescript
export interface WidgetDataConfig {
  date_range_days: number;
  start_date: Date;
  end_date: Date;
  filters: Record<string, any>;
  top_n?: number;
  group_by?: string;
}

export interface WidgetDataResult {
  data: any;
  metadata: {
    date_range_start: Date;
    date_range_end: Date;
    scope_applied: Partial<ScopeContext>;
    last_updated: Date;
    total_records?: number;
  };
  threshold_state?: "green" | "amber" | "red";
  trend?: {
    previous_value: number | null;
    change_pct: number | null;
    direction: "up" | "down" | "flat";
  };
}

type QueryHandler = (
  scope: ScopeContext,
  config: WidgetDataConfig,
) => Promise<WidgetDataResult>;

export const QUERY_REGISTRY: Record<string, QueryHandler> = {
  ticket_open_count: ticketHandlers.openCount,
  ticket_closed_count: ticketHandlers.closedCount,
  ticket_inprogress_count: ticketHandlers.inProgressCount,
  ticket_resolved_count: ticketHandlers.resolvedCount,
  ticket_onhold_count: ticketHandlers.onHoldCount,
  ticket_by_status: ticketHandlers.byStatus,
  ticket_by_priority: ticketHandlers.byPriority,
  ticket_by_category: ticketHandlers.byCategory,
  ticket_by_submission_source: ticketHandlers.bySubmissionSource,
  ticket_volume_trend: ticketHandlers.volumeTrend,
  ticket_escalation_count: ticketHandlers.escalationCount,
  ticket_assignee_workload: ticketHandlers.assigneeWorkload,
  my_assigned_tickets: ticketHandlers.myAssigned,
  ticket_recent_list: ticketHandlers.recentList,
  ticket_sla_resolution_rate: ticketHandlers.slaResolutionRate,
  ticket_first_response_time: ticketHandlers.firstResponseTime,
  user_total_count: userHandlers.totalCount,
  user_active_count: userHandlers.activeCount,
  user_inactive_count: userHandlers.inactiveCount,
  user_by_role: userHandlers.byRole,
  user_new_registrations: userHandlers.newRegistrations,
  user_never_logged_in: userHandlers.neverLoggedIn,
  user_eula_acceptance_rate: userHandlers.eulaAcceptanceRate,
  user_password_setup_pending: userHandlers.passwordSetupPending,
  kb_total_articles: kbHandlers.totalArticles,
  kb_published_count: kbHandlers.publishedCount,
  kb_draft_count: kbHandlers.draftCount,
  kb_top_viewed: kbHandlers.topViewed,
  kb_helpfulness_rate: kbHandlers.helpfulnessRate,
  kb_recent_updates: kbHandlers.recentUpdates,
  kb_by_category: kbHandlers.byCategory,
  activity_feed: activityHandlers.feed,
  login_failure_count: activityHandlers.loginFailureCount,
  active_session_count: activityHandlers.activeSessionCount,
  avg_session_duration: activityHandlers.avgSessionDuration,
  email_sent_count: emailHandlers.sentCount,
  email_failure_rate: emailHandlers.failureRate,
  email_by_type: emailHandlers.byType,
  csat_score: satisfactionHandlers.csatScore,
  nps_score: satisfactionHandlers.npsScore,
  ces_score: satisfactionHandlers.cesScore,
  satisfaction_trend: satisfactionHandlers.trend,
  csat_by_agent: satisfactionHandlers.csatByAgent,
  feedback_response_rate: satisfactionHandlers.responseRate,
};
```

**Helper used in every handler:**

```typescript
// Convert string IDs to ObjectId — required for $in queries
const toObjectIds = (ids: string[]) =>
  ids.map((id) => new mongoose.Types.ObjectId(id));
```

---

### US-2.3 — Ticket Query Handlers

**File:** `backend/src/services/dashboard/queryHandlers/ticketHandlers.ts`

Every handler signature: `(scope: ScopeContext, config: WidgetDataConfig): Promise<WidgetDataResult>`

**`openCount` — ticket_open_count:**

```typescript
const projectOIds = toObjectIds(scope.scopedProjectIds);
const [value, prev] = await Promise.all([
  Ticket.countDocuments({ project: { $in: projectOIds }, status: 'open', createdAt: { $gte: config.start_date } }),
  Ticket.countDocuments({ project: { $in: projectOIds }, status: 'open', createdAt: { $gte: prevStart, $lt: config.start_date } })
]);
const change_pct = prev > 0 ? Math.round(((value - prev) / prev) * 100 * 10) / 10 : null;
return { data: { value, label: 'Open Tickets' }, trend: { previous_value: prev, change_pct, direction: value > prev ? 'up' : value < prev ? 'down' : 'flat' }, metadata: { ... } };
```

**`byStatus` — ticket_by_status:**

```typescript
const results = await Ticket.aggregate([
  {
    $match: {
      project: { $in: projectOIds },
      createdAt: { $gte: config.start_date },
    },
  },
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $project: { label: "$_id", value: "$count", _id: 0 } },
]);
```

**`byCategory` — ticket_by_category:**

```typescript
const results = await Ticket.aggregate([
  {
    $match: {
      project: { $in: projectOIds },
      createdAt: { $gte: config.start_date },
    },
  },
  { $group: { _id: "$category", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: config.top_n || 10 },
  { $project: { label: "$_id", value: "$count", _id: 0 } },
]);
```

**`volumeTrend` — ticket_volume_trend:**

```typescript
const results = await Ticket.aggregate([
  {
    $match: {
      project: { $in: projectOIds },
      createdAt: { $gte: config.start_date },
    },
  },
  {
    $group: {
      _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
      count: { $sum: 1 },
    },
  },
  { $sort: { _id: 1 } },
  { $project: { date: "$_id", value: "$count", _id: 0 } },
]);
```

**`assigneeWorkload` — ticket_assignee_workload:**

```typescript
await Ticket.aggregate([
  {
    $match: {
      project: { $in: projectOIds },
      status: { $in: ["open", "in-progress"] },
      assignedTo: { $exists: true, $ne: null },
    },
  },
  { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: config.top_n || 10 },
  {
    $lookup: {
      from: "users",
      localField: "_id",
      foreignField: "_id",
      as: "agent",
    },
  },
  { $unwind: "$agent" },
  {
    $project: {
      label: "$agent.fullName",
      email: "$agent.email",
      value: "$count",
      _id: 0,
    },
  },
]);
```

**`myAssigned` — my_assigned_tickets:** (personal scope — uses `scope.userId`)

```typescript
await Ticket.find({
  assignedTo: new mongoose.Types.ObjectId(scope.userId),
  status: { $in: ["open", "in-progress", "on-hold"] },
})
  .select(
    "ticketNumber title status priority category project createdAt updatedAt",
  )
  .sort({ updatedAt: -1 })
  .limit(config.top_n || 25)
  .lean();
```

**`escalationCount`:**

```typescript
await Ticket.countDocuments({
  project: { $in: projectOIds },
  "escalationHistory.0": { $exists: true },
  createdAt: { $gte: config.start_date },
});
```

**`slaResolutionRate`** ⚠ Requires Sprint 3 schema:

```typescript
const baseMatch = {
  project: { $in: projectOIds },
  status: { $in: ["closed", "resolved"] },
  closedAt: { $gte: config.start_date, $lte: config.end_date },
};
const [denominator, numerator] = await Promise.all([
  Ticket.countDocuments(baseMatch),
  Ticket.countDocuments({
    ...baseMatch,
    sla_due_at: { $exists: true, $ne: null },
    $expr: { $lte: ["$closedAt", "$sla_due_at"] },
  }),
]);
const rate =
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
// null means "no data" — display "N/A" not 0%
```

---

### US-2.4 — User Query Handlers

**File:** `backend/src/services/dashboard/queryHandlers/userHandlers.ts`

```typescript
// totalCount:
User.countDocuments({ projects: { $in: projectOIds }, isActive: true });

// byRole:
User.aggregate([
  { $match: { projects: { $in: projectOIds }, isActive: true } },
  { $group: { _id: "$role", count: { $sum: 1 } } },
  {
    $lookup: {
      from: "roles",
      localField: "_id",
      foreignField: "_id",
      as: "roleInfo",
    },
  },
  { $unwind: "$roleInfo" },
  {
    $project: {
      label: "$roleInfo.name",
      code: "$roleInfo.code",
      value: "$count",
      _id: 0,
    },
  },
  { $sort: { value: -1 } },
]);

// newRegistrations (MTD):
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
User.countDocuments({
  projects: { $in: projectOIds },
  createdAt: { $gte: startOfMonth },
});

// neverLoggedIn:
User.countDocuments({
  projects: { $in: projectOIds },
  isActive: true,
  $or: [{ lastLogin: { $exists: false } }, { lastLogin: null }],
});

// eulaAcceptanceRate:
const [total, accepted] = await Promise.all([
  User.countDocuments({ projects: { $in: projectOIds }, isActive: true }),
  User.countDocuments({
    projects: { $in: projectOIds },
    isActive: true,
    eulaAccepted: true,
  }),
]);
const rate = total > 0 ? Math.round((accepted / total) * 1000) / 10 : 0;
```

---

### US-2.5 — KB, Activity, Email Query Handlers

**File:** `backend/src/services/dashboard/queryHandlers/kbHandlers.ts`

```typescript
// totalArticles:
KnowledgeBaseArticle.countDocuments({
  projectId: { $in: projectOIds },
  isActive: true,
});

// topViewed:
KnowledgeBaseArticle.find({
  projectId: { $in: projectOIds },
  status: "published",
  isActive: true,
})
  .select("title category viewCount helpfulCount notHelpfulCount publishedAt")
  .sort({ viewCount: -1 })
  .limit(config.top_n || 10)
  .lean();

// helpfulnessRate:
KnowledgeBaseArticle.aggregate([
  {
    $match: {
      projectId: { $in: projectOIds },
      status: "published",
      isActive: true,
    },
  },
  {
    $group: {
      _id: null,
      helpful: { $sum: "$helpfulCount" },
      notHelpful: { $sum: "$notHelpfulCount" },
    },
  },
  {
    $project: {
      rate: {
        $cond: [
          { $gt: [{ $add: ["$helpful", "$notHelpful"] }, 0] },
          {
            $multiply: [
              { $divide: ["$helpful", { $add: ["$helpful", "$notHelpful"] }] },
              100,
            ],
          },
          0,
        ],
      },
    },
  },
]);
```

**File:** `backend/src/services/dashboard/queryHandlers/activityHandlers.ts`

```typescript
// feed:
ActivityLog.find({
  project: { $in: projectOIds },
  timestamp: { $gte: config.start_date },
})
  .sort({ timestamp: -1 })
  .limit(config.top_n || 20)
  .select("userName userEmail action entity entityName timestamp role")
  .lean();

// loginFailureCount:
AccessLog.countDocuments({
  project: { $in: projectOIds },
  action: "login_failed",
  timestamp: { $gte: config.start_date },
});

// activeSessionCount:
const today = new Date();
today.setHours(0, 0, 0, 0);
const ids = await AccessLog.distinct("userId", {
  project: { $in: projectOIds },
  action: "login",
  success: true,
  timestamp: { $gte: today },
});
return { data: { value: ids.length } };
```

**File:** `backend/src/services/dashboard/queryHandlers/emailHandlers.ts`

```typescript
// sentCount:
EmailLog.countDocuments({
  projectId: { $in: projectOIds },
  status: "sent",
  sentAt: { $gte: config.start_date },
});

// failureRate:
const [total, failed] = await Promise.all([
  EmailLog.countDocuments({
    projectId: { $in: projectOIds },
    sentAt: { $gte: config.start_date },
  }),
  EmailLog.countDocuments({
    projectId: { $in: projectOIds },
    status: "failed",
    sentAt: { $gte: config.start_date },
  }),
]);
const rate = total > 0 ? Math.round((failed / total) * 1000) / 10 : 0;
```

---

### US-2.6 — Widget Data API Endpoint

**Route:** `GET /api/v2/dashboard/widgets/:widget_key/data`  
**File:** `backend/src/controllers/dashboardV2Controller.ts` + `backend/src/routes/dashboardV2.ts`

**Middleware chain:**

```typescript
router.get(
  "/widgets/:widget_key/data",
  authMiddleware,
  checkPermission("DASHBOARD_VIEW"),
  getWidgetData,
);
```

**Handler: `getWidgetData`**

```
1. Extract widget_key from req.params
2. Look up definition in QUERY_REGISTRY — 404 if not found
3. Check requires_permission[] against scope.permissions — 403 if fails
4. Resolve scope: await scopeResolver(req)
5. Parse query params: date_range_days (default 30), top_n, group_by, filters (JSON.parse)
6. Build WidgetDataConfig: compute start_date = now - date_range_days
7. Execute: result = await QUERY_REGISTRY[widget_key](scope, config)
8. Apply threshold evaluation if widget has threshold_config
9. Return standardised envelope
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
    "scope_applied": { "project_count": 3, "role_code": "AGENT" },
    "last_updated": "2025-05-19T09:00:00.000Z"
  }
}
```

**Error responses:** `401` no JWT, `403` no permission, `404` unknown widget_key, `400` bad filter JSON, `500` query error

---

### US-2.7 — Widget Registry Endpoint

**Route:** `GET /api/v2/dashboard/widgets/registry`  
**Permission:** `DASHBOARD_VIEW_ANALYTICS`

Returns all active widget definitions grouped by module. Only returns widgets where the requesting user has at least one required permission. Widgets with empty `requires_permission` are always returned.

---

## 7. Sprint 3 — Schema Additions + SLA Population

### Goal

Populate the three new Ticket fields at the right moments in the ticket lifecycle. Zero changes to existing response shapes.

### Approved Modifications (Sprint 3)

- `backend/src/controllers/ticketController.ts` — 3 additive try/catch blocks

---

### US-3.1 — Set closedAt on Status Change

In `ticketController.ts`, in the status-change handler, after `newStatus` is set and before `ticket.save()`:

```typescript
// Dashboard: track closure time (additive — non-fatal)
try {
  if (["closed", "resolved"].includes(newStatus) && !(ticket as any).closedAt) {
    (ticket as any).closedAt = new Date();
  }
} catch (e) {
  /* never breaks ticket update */
}
```

---

### US-3.2 — Set sla_due_at on Ticket Creation

In `ticketController.ts`, in the creation handler, after ticket document is built and before save:

```typescript
// Dashboard: compute SLA deadline (additive — non-fatal)
try {
  if (newTicket.priority && newTicket.project) {
    const SLARuleModel = require("../models/sla-module/SLARule").default;
    const slaRule = await SLARuleModel.findOne({
      projectIds: newTicket.project,
      priority:
        newTicket.priority.charAt(0).toUpperCase() +
        newTicket.priority.slice(1),
      isActive: true,
    }).lean();
    if (slaRule) {
      const unit = slaRule.resolutionTime.unit;
      const val = slaRule.resolutionTime.value;
      const hrs =
        unit === "hours" ? val : unit === "days" ? val * 24 : val / 60;
      const due = new Date(Date.now() + hrs * 3600000);
      (newTicket as any).sla_due_at = due;
    }
  }
} catch (slaErr) {
  console.warn("[DASHBOARD] SLA due date computation skipped:", slaErr);
}
```

---

### US-3.3 — Set firstRespondedAt on First Agent Reply

In `ticketController.ts`, in the comment/thread add handler, before save:

```typescript
// Dashboard: track first agent response (additive — non-fatal)
try {
  if (!(ticket as any).firstRespondedAt) {
    const isCreator = ticket.createdBy.toString() === req.user?.userId;
    const isSystemMsg = false; // evaluate from context
    if (!isCreator && !isSystemMsg) {
      (ticket as any).firstRespondedAt = new Date();
    }
  }
} catch (e) {
  /* non-fatal */
}
```

---

## 8. Sprint 4 — Template Builder API

### Goal

Full CRUD for dashboard templates, widget placement, and assignment system.

---

### US-4.1 — Create / Update / Get / Delete Template

| Method | Route                                       | Description                                |
| ------ | ------------------------------------------- | ------------------------------------------ | --------- | --------- |
| POST   | `/api/v2/dashboard/templates`               | Create new template (status: draft)        |
| GET    | `/api/v2/dashboard/templates`               | List all templates. Filter: `?status=draft | published | archived` |
| GET    | `/api/v2/dashboard/templates/:id`           | Get template with all widgets joined       |
| PUT    | `/api/v2/dashboard/templates/:id`           | Update metadata                            |
| POST   | `/api/v2/dashboard/templates/:id/publish`   | Publish — requires ≥ 1 widget              |
| POST   | `/api/v2/dashboard/templates/:id/archive`   | Archive — warns if active assignments      |
| DELETE | `/api/v2/dashboard/templates/:id`           | Delete — 409 if active assignments exist   |
| POST   | `/api/v2/dashboard/templates/:id/duplicate` | Create draft copy with all widgets         |

**Permission for all:** `DASHBOARD_VIEW_ANALYTICS`

**Create request body:**

```json
{
  "name": "District Performance Dashboard",
  "description": "For district officers",
  "icon": "chart-bar",
  "accent_colour": "#3b82f6",
  "global_date_range_days": 30,
  "allow_user_date_override": true,
  "allow_widget_export": false,
  "auto_refresh_seconds": 60
}
```

---

### US-4.2 — Widget Placement CRUD

| Method | Route                                          | Description            |
| ------ | ---------------------------------------------- | ---------------------- |
| POST   | `/api/v2/dashboard/templates/:id/widgets`      | Add widget to template |
| PATCH  | `/api/v2/dashboard/templates/:id/widgets/:wid` | Update widget config   |
| DELETE | `/api/v2/dashboard/templates/:id/widgets/:wid` | Remove widget          |

**Add widget request body:**

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

**Validation rules:**

- `widget_key` must exist in `dash_widget_definitions`
- `visualisation_type` must be in `supported_viz` of that definition
- `grid_x`: 0–11, `grid_width`: 3–12, `grid_height`: 2–8
- Template must not be archived

---

### US-4.3 — Assignment CRUD

| Method | Route                                              | Description                       |
| ------ | -------------------------------------------------- | --------------------------------- |
| GET    | `/api/v2/dashboard/templates/:id/assignments`      | List assignments                  |
| POST   | `/api/v2/dashboard/templates/:id/assignments`      | Create assignment                 |
| PATCH  | `/api/v2/dashboard/templates/:id/assignments/:aid` | Update tab_order / is_default_tab |
| DELETE | `/api/v2/dashboard/templates/:id/assignments/:aid` | Remove assignment                 |

**Permission:** `DASHBOARD_ASSIGN`  
**Constraint:** Can only assign published templates.

**Create assignment body:**

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

---

### US-4.4 — Resolve User's Dashboards (GET /me)

**Route:** `GET /api/v2/dashboard/me`  
**Permission:** `DASHBOARD_VIEW`

**This is the most critical endpoint in the entire system.** Called on page load to determine which dashboards to show and in what order.

**Resolution logic:**

```
1. Resolve scope from JWT
2. Query dash_assignments WHERE:
   - assignee_type='role' AND assignee_id = scope.roleId
   - OR assignee_type='user' AND assignee_id = scope.userId
3. Filter by scope compatibility:
   - scope_type='global' → always matches
   - scope_type='project' → scope_project_id must be in scope.scopedProjectIds
   - scope_type='centre' → scope_centre_ids must overlap with scope.centreId
   - scope_type='email_domain' → scope.emailDomain must match
4. Deduplicate by dashboard_template_id
5. Priority order:
   - User-specific assignments first
   - Then role-based, ordered by tab_order ASC
6. Fetch DashTemplate + DashWidget[] for each matched template
7. Merge user preferences from dash_user_prefs
8. Return ordered array
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
            "grid_x": 0,
            "grid_y": 0,
            "grid_width": 4,
            "grid_height": 2,
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

### US-4.5 — Save User Preferences

**Route:** `PATCH /api/v2/dashboard/me/:templateId/preferences`  
**Permission:** `DASHBOARD_VIEW`

Upsert `dash_user_prefs` by `{ user_id, dashboard_template_id }`. Accepts any subset of `{ collapsed_widget_ids, saved_date_range_days, saved_filters }`.

---

## 9. Sprint 5 — Frontend: Dashboard Viewer

### Goal

The `/dashboard` page renders all assigned dashboards as tabs, loads widget data in parallel, handles all widget states, and supports global filtering.

### New Frontend Files

```
src/pages/Dashboard/
  ├── DashboardPage.tsx
  ├── DashboardTabBar.tsx
  ├── DashboardPanel.tsx
  └── index.ts

src/components/dashboard/
  ├── DashboardGrid.tsx
  ├── WidgetCard.tsx
  ├── WidgetLoadingSkeleton.tsx
  ├── GlobalFilterBar.tsx
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

src/services/dashboardV2Service.ts
src/hooks/useDashboards.ts
src/hooks/useWidgetData.ts
```

---

### US-5.1 — Dashboard Page Load Sequence

**DashboardPage.tsx:**

1. On mount: call `GET /api/v2/dashboard/me`
2. If empty response: render empty state — "Your administrator has not set up a dashboard for your role yet."
3. Render `<DashboardTabBar>` with all dashboard names
4. Default active tab = `is_default_tab: true` else first tab
5. Render active `<DashboardPanel>` with widgets in skeleton state
6. Fire parallel widget data fetches using `Promise.allSettled`

---

### US-5.2 — Dashboard Grid

**DashboardGrid.tsx:**

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
  padding: 16px;
}
.widget-slot {
  grid-column: span var(--widget-width); /* grid_width from config */
  grid-row: span var(--widget-height); /* grid_height from config */
}
```

Each slot renders `<WidgetCard>` with the widget's configuration. Widgets load independently — one failing does not affect others (`Promise.allSettled`).

---

### US-5.3 — WidgetCard States

Every widget must handle all of these without crashing:

| State             | Render                                           |
| ----------------- | ------------------------------------------------ |
| `loading`         | `<WidgetLoadingSkeleton>` matching grid size     |
| `loaded`          | Active visualisation renderer                    |
| `empty`           | "No data for selected period" + icon             |
| `error`           | "Could not load widget" + retry button           |
| `no_permission`   | Lock icon + "You don't have access to this data" |
| `threshold_alert` | Normal render + red dot in header                |

**Widget header (when `display_config.show_header: true`):**

- Widget title (left)
- Threshold dot (if `threshold_state === 'red'`)
- Three-dot menu (right): Refresh, Expand, Export CSV, View as table, Collapse

**Widget footer (when `display_config.show_footer_timestamp: true`):**

- "Last updated: N min ago" + manual refresh icon

---

### US-5.4 — KPI Tile Widget

```
┌──────────────────────────────┐
│  47                          │  ← value (32px, semi-bold)
│  Open Tickets                │  ← label (13px, muted)
│  ↑ 20.5% vs last period      │  ← trend (green if direction=up and good_direction=up)
│  ▁▂▃▄▅▆▇ (sparkline)        │  ← optional 7-day mini bar chart
│  ● (left accent border = threshold colour)
└──────────────────────────────┘
```

Props from API: `data.value`, `data.label`, `trend.change_pct`, `trend.direction`, `threshold_state`, `threshold_config.good_direction`

Trend colour logic:

- `good_direction = 'up'` AND `direction = 'up'` → green
- `good_direction = 'up'` AND `direction = 'down'` → red
- `good_direction = 'down'` AND `direction = 'down'` → green
- `good_direction = 'down'` AND `direction = 'up'` → red
- `good_direction = 'neutral'` → grey always

---

### US-5.5 — Chart Renderers

**Library:** Install `recharts` (`npm install recharts`).

**LineChartWidget / AreaChartWidget:**

- X-axis: date labels from `data[].date`
- Y-axis: auto-scaled values
- Tooltip on hover: exact date + value
- Area fill for `area_chart` viz type

**BarChartWidget:**

- Horizontal or vertical based on `display_config.orientation`
- Each bar = one `{ label, value }` pair
- Tooltip on hover

**DonutChartWidget:**

- Centre label = total sum
- Legend below chart
- Max slices = `data_config.top_n`, remainder = "Others"

**GaugeWidget:**

- Semi-circle, 0–100 (or 0–`threshold_config.red_min * 1.5` for values that can exceed 100)
- Green/amber/red zones from `threshold_config`
- Needle pointing to current value

---

### US-5.6 — Data Table Widget

**DataTableWidget.tsx:**

- Columns from `table_config.columns` array
- Default sort: `table_config.sort_by` / `table_config.sort_dir`
- Pagination: 10 / 25 / 50 rows (client-side for ≤ 100 rows, else request new page from API)
- Row click: navigate to `table_config.drill_through_url` with `entity_id` substituted
- Search input above table if `table_config.show_search: true`
- "Export CSV" in widget menu if `widget.is_exportable && template.allow_widget_export`

---

### US-5.7 — Global Filter Bar

**GlobalFilterBar.tsx** (sticky below tab bar):

- Date range selector: 7 / 14 / 30 / 60 / 90 days or custom. Only shown if `allow_user_date_override: true`
- Project selector: only shown if user has > 1 scoped project
- "Reset" button: clears session filters

On filter change: update `activeFilters` state → all widget `useWidgetData` hooks re-fetch with new params.

---

### US-5.8 — Auto-Refresh

In `useWidgetData.ts`:

```typescript
useEffect(() => {
  const interval = setInterval(
    () => refetch(),
    template.auto_refresh_seconds * 1000,
  );
  return () => clearInterval(interval);
}, [template.auto_refresh_seconds]);
```

During background refresh: show a subtle spinner in widget footer. Do not show skeleton. Replace value atomically when new data arrives.

---

### US-5.9 — Widget Expand Modal

Full-screen modal on clicking "Expand" from widget menu:

- Larger render of same viz renderer
- For charts: all data labels visible, full tooltips
- For tables: all rows (paginated), full column widths, search enabled
- "Download as PNG" button for chart widgets
- "Export CSV" for table widgets
- Additional filter controls in modal header

---

## 10. Sprint 6 — Frontend: Dashboard Builder

### Goal

Admin builder UI where super admins compose dashboards from a widget panel, position on a 12-column grid, configure each widget instance, and preview before publishing.

---

### US-6.1 — Builder Routes + Access Guard

- `/admin/dashboards/builder` — new template
- `/admin/dashboards/:id/edit` — edit existing template
- Guard: require `DASHBOARD_VIEW_ANALYTICS` permission. Redirect to `/dashboard` if absent.

---

### US-6.2 — Builder Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Dashboard Name input] │ Status: Draft │ Preview │ Save Draft │ Publish │
├──────────────┬──────────────────────────────────────┬───────────────────┤
│ WIDGET PANEL │ CANVAS (12-col grid)                  │ CONFIG PANEL      │
│ (left 280px) │                                       │ (right 320px)     │
│ [search]     │ [drop widgets here]                   │ (shows when       │
│ by module    │ [grid lines]                          │  widget selected) │
├──────────────┴──────────────────────────────────────┴───────────────────┤
│ Grid lines [toggle] | Mobile preview | Undo | Redo | Widget count: 5    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### US-6.3 — Widget Panel

- Search box to filter by name
- Collapsible sections per module
- Each card: widget name + icon + module badge
- Hover: description tooltip
- Drag to canvas or double-click to add at next available position
- Greyed-out cards for widgets the admin lacks permission to use

---

### US-6.4 — Canvas with Drag/Drop and Resize

**Canvas state (client-side, not saved until Save Draft):**

```typescript
interface CanvasState {
  widgets: Array<{
    tempId: string;
    widget_key: string;
    title: string;
    visualisation_type: string;
    grid_x: number;
    grid_y: number;
    grid_width: number;
    grid_height: number;
    data_config: any;
    threshold_config: any;
    table_config: any;
    display_config: any;
  }>;
}
```

**Drag/drop:** `draggable="true"` on widget cards. `onDragOver` + `onDrop` on canvas grid cells. Dropped widget appears at nearest open cell.

**Resize:** Handle at bottom-right. Drag to resize within bounds (min 3×2, max 12×8). Adjacent widgets shift down on overlap.

**Undo/redo:** History array, max 20 steps. Undo = pop from history and apply.

**Save behaviour:** On "Save Draft" — diff canvas state vs server. Call POST for new widgets, PATCH for changed, DELETE for removed. Batch into sequential API calls.

---

### US-6.5 — Widget Configuration Panel (4 Tabs)

**Tab 1 — Display:**

- Title (text input)
- Visualisation type selector (only `supported_viz` options)
- Colour override
- Show/hide header toggle
- Show/hide footer timestamp toggle
- Subtitle text input

**Tab 2 — Data:**

- Date window: 7 / 14 / 30 / 60 / 90 / 365 / custom
- Override global date filter: toggle
- Dynamic filter fields from widget definition's `filter_params`:
  - Status multi-select (for ticket widgets)
  - Priority multi-select (for ticket widgets)
  - Category multi-select (for ticket widgets)
  - Centre selector (for centre-scoped widgets)
- Top N: number input
- Group by: select

**Tab 3 — Thresholds:**

- Good direction: Up is good / Down is good / Neutral
- Green zone: min + max number inputs
- Amber zone: min + max
- Red zone: min + max
- Preview gauge showing zones
- (Only active for `kpi_tile`, `gauge` viz types)

**Tab 4 — Table Columns:** (only for `table` viz type)

- Checkbox list of available columns from widget definition
- Drag handles to reorder
- Column width: Auto / Fixed
- Row drill-through URL pattern (e.g. `/tickets/{{entity_id}}`)
- Search toggle

---

### US-6.6 — Preview Mode

Toggle button in top bar. In preview mode:

- Canvas renders with live data (scoped to admin's identity)
- "Preview as role" dropdown: simulates chosen role's scope context
- The widget data API supports `?preview_as_role=<role_id>` for Super Admin users only
- "Exit preview" returns to builder

---

### US-6.7 — Assignment Management UI

**Route:** `/admin/dashboards/:id/assignments`

- Table: type, target name, scope, tab order, default tab, assigned by, date
- "+ Add Assignment" drawer:
  - Assignee type: Role / User
  - Target: role dropdown or user search
  - Scope type + scope value
  - Tab order number
  - Default tab toggle
  - Impact preview: "This will affect N users"
- Delete per row
- Inline enable/disable `is_default_tab`

---

## 11. Sprint 7 — Real-Time Updates + Export

---

### US-7.1 — Socket.io Dashboard Channel

**File:** `backend/src/services/dashboard/dashboardSocketService.ts`

**Events emitted by server:**

| Event                      | Payload                                                  | Trigger                         |
| -------------------------- | -------------------------------------------------------- | ------------------------------- |
| `dashboard:widget_update`  | `{ widget_key, project_id, new_value, threshold_state }` | When a KPI counter changes      |
| `dashboard:refresh_widget` | `{ widget_key, project_id }`                             | When cached data is invalidated |

**Approved modification: `ticketController.ts`**

After ticket create / status change:

```typescript
// Dashboard real-time emit (additive — non-fatal)
try {
  const dashSocket = require("../services/dashboard/dashboardSocketService");
  dashSocket.emitTicketCountChange(ticket.project?.toString());
} catch (e) {
  /* non-fatal */
}
```

**`emitTicketCountChange(projectId)`:**

```typescript
1. Recompute: const count = await Ticket.countDocuments({ project: projectId, status: 'open' })
2. io.to(`dashboard:project:${projectId}`).emit('dashboard:widget_update', {
     widget_key: 'ticket_open_count',
     project_id: projectId,
     new_value: count
   })
```

**Frontend (DashboardPage.tsx):**

```typescript
// On mount — join rooms for all scoped projects
socket.emit("join:dashboard", { project_ids: scopedProjectIds });

// Listen for live updates
socket.on(
  "dashboard:widget_update",
  ({ widget_key, project_id, new_value, threshold_state }) => {
    updateWidgetValue(widget_key, project_id, new_value, threshold_state);
    // Updates in-state without re-fetching the entire widget
  },
);
```

---

### US-7.2 — Excel Export Endpoint

**Route:** `GET /api/v2/dashboard/widgets/:widget_key/export`  
**Permission:** `DASHBOARD_EXPORT`

Handler:

1. Execute query handler with `top_n: 10000` (no practical limit)
2. Use `exceljs` (already in package.json) to create workbook
3. Sheet title = widget `display_name`
4. Stream response with headers: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="${display_name}_${date}.xlsx"`

---

## 12. Sprint 8 — Permissions, Seeding, QA

---

### US-8.1 — Add Permissions to RBAC

**Approved modification:** `backend/src/constants/permissions.ts`

Add to `PERMISSION_CODES`:

```typescript
DASHBOARD_MANAGE:         'DASHBOARD_MANAGE',
DASHBOARD_ASSIGN:         'DASHBOARD_ASSIGN',
DASHBOARD_PERSONAL_CREATE: 'DASHBOARD_PERSONAL_CREATE',
```

**New seed file:** `backend/src/seeds/addDashboardPermissions.ts`

- Upsert each new permission code into `permissions` collection
- Add `DASHBOARD_MANAGE` + `DASHBOARD_ASSIGN` to Super Admin role
- Idempotent check before insert

---

### US-8.2 — Seed Default Dashboard Templates

**File:** `backend/src/seeds/seedDefaultDashboards.ts`

Seed two templates:

**Template 1: "Executive Overview"** (15 widgets — Super Admin role)

Grid layout (12-column):

```
Row 1 (height 2): ticket_open_count [4] | ticket_closed_count [4] | ticket_sla_resolution_rate [4]
Row 2 (height 2): user_active_count [3] | kb_published_count [3] | csat_score [3] | email_sent_count [3]
Row 3 (height 3): ticket_volume_trend [8] | ticket_by_status [4]
Row 4 (height 3): ticket_by_priority [4] | ticket_assignee_workload [8]
Row 5 (height 3): ticket_recent_list [12]
```

**Template 2: "Agent Work Queue"** (6 widgets — Agent role)

```
Row 1 (height 2): my_assigned_tickets [8] | ticket_open_count [4]
Row 2 (height 3): ticket_volume_trend [6] | ticket_by_priority [6]
Row 3 (height 3): activity_feed [12]
```

Seed logic per template:

1. Check if name exists → skip if so (idempotent)
2. Insert `DashTemplate` (status: published)
3. Insert all `DashWidget` documents
4. Insert `DashAssignment` (role-based, global scope)

---

### US-8.3 — Feature Flag

**Approved modifications:**

- `.env`: add `DASHBOARD_V2_ENABLED=true`
- `backend/src/config/index.ts`: add `dashboardV2: { enabled: process.env.DASHBOARD_V2_ENABLED === 'true' }`

In `dashboardV2.ts`:

```typescript
router.use((req, res, next) => {
  if (!config.dashboardV2.enabled)
    return res.status(404).json({ message: "Not enabled" });
  next();
});
```

---

## 13. Sprint 9 — CSAT / NPS / CES Scoring

### Why This Sprint

Every enterprise helpdesk platform — Zendesk Explore, Freshdesk Analytics, Qualtrics — treats satisfaction measurement as a first-class dashboard primitive. Your platform collects feedback (KB helpful/not-helpful counts) but has no structured CSAT/NPS/CES score computed on the dashboard. This sprint adds the data model and six widgets.

---

### US-9.1 — FeedbackScore Model

**File:** `backend/src/models/dashboard/FeedbackScore.ts`  
**Collection:** `feedback_scores`

| Field                | Type               | Notes                        |
| -------------------- | ------------------ | ---------------------------- |
| `ticket_id`          | ObjectId → Ticket  |                              |
| `project_id`         | ObjectId → Project | Scope field                  |
| `respondent_user_id` | ObjectId → User    | Who submitted feedback       |
| `agent_id`           | ObjectId → User    | Agent who handled the ticket |
| `csat_rating`        | Number (1–5)       | Nullable                     |
| `nps_rating`         | Number (0–10)      | Nullable                     |
| `ces_rating`         | Number (1–7)       | Nullable                     |
| `comment`            | String             | Free-text                    |
| `submitted_at`       | Date               |                              |
| `ticket_category`    | String             | Denormalised                 |
| `ticket_priority`    | String             | Denormalised                 |

**Indexes:** `{ project_id: 1, submitted_at: -1 }`, `{ agent_id: 1, submitted_at: -1 }`

---

### US-9.2 — Satisfaction Query Handlers

**File:** `backend/src/services/dashboard/queryHandlers/satisfactionHandlers.ts`

**`csatScore` — csat_score:**

```typescript
// CSAT = (ratings of 4 or 5) ÷ (total ratings) × 100
const [positive, total] = await Promise.all([
  FeedbackScore.countDocuments({
    project_id: { $in: projectOIds },
    csat_rating: { $gte: 4 },
    submitted_at: { $gte: config.start_date },
  }),
  FeedbackScore.countDocuments({
    project_id: { $in: projectOIds },
    csat_rating: { $exists: true, $ne: null },
    submitted_at: { $gte: config.start_date },
  }),
]);
const csat = total > 0 ? Math.round((positive / total) * 1000) / 10 : null;
// null → display "No data" not 0%
```

**Gauge thresholds (defaults, admin-configurable per widget instance):**

- Green ≥ 80%, Amber 60–79%, Red < 60%

**`npsScore` — nps_score:**

```typescript
// Promoters = 9–10, Detractors = 0–6
const [{ total = 0, promoters = 0, detractors = 0 } = {}] =
  await FeedbackScore.aggregate([
    {
      $match: {
        project_id: { $in: projectOIds },
        nps_rating: { $exists: true, $ne: null },
        submitted_at: { $gte: config.start_date },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        promoters: { $sum: { $cond: [{ $gte: ["$nps_rating", 9] }, 1, 0] } },
        detractors: { $sum: { $cond: [{ $lte: ["$nps_rating", 6] }, 1, 0] } },
      },
    },
  ]);
const nps =
  total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;
// Display as +42 or -18 (signed integer, range -100 to +100)
```

**`cesScore`:** Simple average of `ces_rating` (1–7, lower = less effort = better).

**`csatByAgent`:**

```typescript
FeedbackScore.aggregate([
  {
    $match: {
      project_id: { $in: projectOIds },
      csat_rating: { $exists: true },
      submitted_at: { $gte: config.start_date },
    },
  },
  {
    $group: {
      _id: "$agent_id",
      total: { $sum: 1 },
      positive: { $sum: { $cond: [{ $gte: ["$csat_rating", 4] }, 1, 0] } },
    },
  },
  {
    $project: {
      csat_pct: { $multiply: [{ $divide: ["$positive", "$total"] }, 100] },
      response_count: "$total",
    },
  },
  { $sort: { csat_pct: -1 } },
  {
    $lookup: {
      from: "users",
      localField: "_id",
      foreignField: "_id",
      as: "agent",
    },
  },
  { $unwind: "$agent" },
  {
    $project: {
      label: "$agent.fullName",
      email: "$agent.email",
      value: "$csat_pct",
      response_count: 1,
      _id: 0,
    },
  },
]);
```

**`responseRate`:**

```typescript
const [closed, responded] = await Promise.all([
  Ticket.countDocuments({
    project: { $in: projectOIds },
    status: { $in: ["closed", "resolved"] },
    closedAt: { $gte: config.start_date },
  }),
  FeedbackScore.countDocuments({
    project_id: { $in: projectOIds },
    submitted_at: { $gte: config.start_date },
  }),
]);
const rate = closed > 0 ? Math.round((responded / closed) * 1000) / 10 : 0;
```

---

### US-9.3 — Satisfaction Widgets in Registry + Dashboards

Add 6 satisfaction widgets to `seedWidgetDefinitions.ts` under module `satisfaction`.

Update `seedDefaultDashboards.ts`:

- Add `csat_score` (KPI 4-wide) + `satisfaction_trend` (line 8-wide) to Executive Overview row
- Add `csat_by_agent` table to Agent Work Queue
- Create new pre-built template: **"Satisfaction Overview"** (6 widgets) — assign to Super Admin + Project Admin roles

---

## 14. Sprint 10 — Scheduled Report Delivery

### Why This Sprint

Enterprise platforms universally send automated dashboard snapshots on recurring schedules. Platforms like Datadog, HubSpot, Sumo Logic, and Exabeam all treat scheduled PDF/CSV delivery as a core feature. For your Commissioner who needs a Monday 8 AM summary without logging in, this is essential.

### New Packages

```bash
npm install node-cron html-pdf-node
npm install @types/node-cron --save-dev
```

---

### US-10.1 — DashScheduledReport Model

**File:** `backend/src/models/dashboard/DashScheduledReport.ts`  
**Collection:** `dash_scheduled_reports`

| Field                   | Type                    | Notes                                                   |
| ----------------------- | ----------------------- | ------------------------------------------------------- |
| `dashboard_template_id` | ObjectId → DashTemplate | Which dashboard to snapshot                             |
| `name`                  | String                  | e.g. "Weekly District Summary"                          |
| `schedule_type`         | String enum             | `daily`, `weekly`, `monthly`, `custom_cron`             |
| `cron_expression`       | String                  | e.g. `0 8 * * 1` = Mon 8 AM                             |
| `timezone`              | String                  | Default `Asia/Kolkata`                                  |
| `recipients`            | Array                   | `[{ email, name, is_portal_user }]`                     |
| `format`                | String enum             | `pdf`, `csv`, `email_inline`. Default `pdf`             |
| `date_range_days`       | Number                  | Override dashboard's global date range                  |
| `include_widgets`       | ObjectId[]              | Subset of widgets to include. Empty = all               |
| `subject_template`      | String                  | Supports `{{dashboard_name}}`, `{{date}}`, `{{period}}` |
| `body_template`         | String                  | Email intro text                                        |
| `is_active`             | Boolean                 | Default true                                            |
| `last_run_at`           | Date                    | After each send                                         |
| `last_run_status`       | String enum             | `success`, `failed`, `partial`                          |
| `last_error`            | String                  | Error message if failed                                 |
| `created_by`            | ObjectId → User         |                                                         |
| `tenant_id`             | String                  |                                                         |

**Index:** `{ is_active: 1, schedule_type: 1 }`

---

### US-10.2 — Scheduled Report API

**Routes:**

```
GET    /api/v2/dashboard/scheduled-reports          → List all (admin)
POST   /api/v2/dashboard/scheduled-reports          → Create
GET    /api/v2/dashboard/scheduled-reports/:id      → Get details
PUT    /api/v2/dashboard/scheduled-reports/:id      → Update
DELETE /api/v2/dashboard/scheduled-reports/:id      → Delete
POST   /api/v2/dashboard/scheduled-reports/:id/send-now → Send immediately (test)
```

**Permission:** `DASHBOARD_MANAGE`

**Create body:**

```json
{
  "dashboard_template_id": "...",
  "name": "Weekly District Summary",
  "schedule_type": "weekly",
  "cron_expression": "0 8 * * 1",
  "timezone": "Asia/Kolkata",
  "recipients": [
    {
      "email": "commissioner@gov.in",
      "name": "Commissioner",
      "is_portal_user": false
    }
  ],
  "format": "pdf",
  "date_range_days": 7,
  "subject_template": "{{dashboard_name}} — Week ending {{date}}",
  "body_template": "Please find the weekly summary attached."
}
```

---

### US-10.3 — Report Generation Service

**File:** `backend/src/services/dashboard/reportGenerationService.ts`

**`generateReport(report, scope)` → `Buffer`**

For PDF format:

1. Fetch all widget data in parallel using `QUERY_REGISTRY` with admin scope
2. Build HTML string with styled widget sections
3. Pass to `html-pdf-node` → PDF buffer

**HTML template structure:**

```html
<html>
  <head>
    <style>
      /* table styles, KPI tile styles, heading styles */
      body {
        font-family: Arial, sans-serif;
        padding: 24px;
      }
      .kpi-row {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
      }
      .kpi-tile {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        flex: 1;
      }
      .kpi-value {
        font-size: 32px;
        font-weight: 600;
      }
      .kpi-label {
        font-size: 13px;
        color: #6b7280;
        margin-top: 4px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        border: 1px solid #e5e7eb;
        padding: 8px 12px;
        text-align: left;
        font-size: 13px;
      }
      th {
        background: #f9fafb;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <h1>{{dashboard_name}}</h1>
    <p>Period: {{start_date}} to {{end_date}} | Generated: {{generated_at}}</p>
    <!-- KPI tiles section -->
    <!-- Charts section (bar charts as simple SVG) -->
    <!-- Table sections -->
    <p style="color:#9ca3af;font-size:11px;">Generated by {{portal_name}}</p>
  </body>
</html>
```

For CSV format: per-widget CSVs zipped into a single download.

---

### US-10.4 — Cron Job Runner

**File:** `backend/src/services/dashboard/reportScheduler.ts`

```typescript
import cron from "node-cron";

const activeTasks = new Map<string, cron.ScheduledTask>();

export async function startReportScheduler() {
  const reports = await DashScheduledReport.find({ is_active: true }).lean();
  for (const report of reports) {
    registerTask(report);
  }
  console.log(`[REPORT_SCHEDULER] ${reports.length} schedule(s) active`);
}

function registerTask(report: any) {
  const task = cron.schedule(
    report.cron_expression,
    async () => {
      try {
        const buffer = await reportGenerationService.generateReport(report);
        await reportEmailService.sendReport(report, buffer);
        await DashScheduledReport.findByIdAndUpdate(report._id, {
          last_run_at: new Date(),
          last_run_status: "success",
          last_error: null,
        });
      } catch (err: any) {
        await DashScheduledReport.findByIdAndUpdate(report._id, {
          last_run_at: new Date(),
          last_run_status: "failed",
          last_error: err.message,
        });
      }
    },
    { timezone: report.timezone },
  );
  activeTasks.set(report._id.toString(), task);
}

// Call after POST /scheduled-reports to register immediately
export function registerNewTask(report: any) {
  registerTask(report);
}

// Call after DELETE /scheduled-reports/:id
export function destroyTask(reportId: string) {
  const task = activeTasks.get(reportId);
  if (task) {
    task.destroy();
    activeTasks.delete(reportId);
  }
}
```

**Approved modification: `backend/src/server.ts`**

```typescript
// After DB connection established:
import { startReportScheduler } from "./services/dashboard/reportScheduler";
if (config.dashboardV2.enabled) {
  startReportScheduler();
}
```

---

### US-10.5 — Email Delivery Service

**File:** `backend/src/services/dashboard/reportEmailService.ts`

Uses existing `nodemailer` setup. For each recipient:

1. Attach PDF buffer as `{{dashboard_name}}_{{YYYY-MM-DD}}.pdf`
2. Send via existing SMTP configuration (from existing `EmailConfig` model)
3. Log send to existing `EmailLog` collection with `type: 'other'`
4. Update `DashScheduledReport.last_run_status`

---

### US-10.6 — Scheduled Reports UI

**Route:** `/admin/dashboards/:id/scheduled-reports`

**DashboardScheduledReportsPage.tsx:**

- List: name, schedule (human-readable), recipients count, last run, status badge
- "+ Schedule Report" drawer form with all fields
- "Send Test Now" button per row (triggers `POST .../send-now`)
- Edit / Delete per row
- Schedule examples shown as human-readable text using `cronToHuman()` helper

---

## 15. Sprint 11 — Threshold Alerts as Notifications

### Why This Sprint

The current design turns widgets red when thresholds are crossed — but only if someone is looking at the dashboard. Enterprise platforms like Zendesk, Freshdesk, Kapture, and Datadog send active alerts when a KPI crosses a threshold. This sprint connects the dashboard threshold system to the portal's notification engine.

---

### US-11.1 — DashThresholdAlert Model

**File:** `backend/src/models/dashboard/DashThresholdAlert.ts`  
**Collection:** `dash_threshold_alerts`

| Field                   | Type                    | Notes                                   |
| ----------------------- | ----------------------- | --------------------------------------- | ---- | ----- | ----- | ---------------------- |
| `dashboard_template_id` | ObjectId → DashTemplate |                                         |
| `dashboard_widget_id`   | ObjectId → DashWidget   | Specific widget                         |
| `widget_key`            | String                  | Denormalised                            |
| `alert_name`            | String                  | e.g. "High SLA Breach Alert"            |
| `condition`             | Object                  | `{ operator: 'gt'                       | 'lt' | 'gte' | 'lte' | 'eq', value: number }` |
| `severity`              | String enum             | `info`, `warning`, `critical`           |
| `notify_roles`          | ObjectId[]              | Roles to notify                         |
| `notify_users`          | ObjectId[]              | Individual users to notify              |
| `cooldown_minutes`      | Number                  | Min minutes between alerts. Default 60. |
| `last_triggered_at`     | Date                    | To enforce cooldown                     |
| `last_triggered_value`  | Number                  | Value that caused last trigger          |
| `is_active`             | Boolean                 | Default true                            |
| `created_by`            | ObjectId → User         |                                         |
| `tenant_id`             | String                  |                                         |

**Index:** `{ dashboard_widget_id: 1, is_active: 1 }`, `{ widget_key: 1, is_active: 1 }`

---

### US-11.2 — Threshold Alert API

```
GET    /api/v2/dashboard/templates/:id/alerts         → List alerts
POST   /api/v2/dashboard/templates/:id/alerts         → Create alert
PUT    /api/v2/dashboard/templates/:id/alerts/:aid    → Update
DELETE /api/v2/dashboard/templates/:id/alerts/:aid    → Delete
POST   /api/v2/dashboard/templates/:id/alerts/:aid/test → Test (sends notification without updating last_triggered_at)
```

**Permission:** `DASHBOARD_MANAGE`

**Create body:**

```json
{
  "dashboard_widget_id": "...",
  "alert_name": "SLA Breach Critical Alert",
  "condition": { "operator": "gte", "value": 5 },
  "severity": "critical",
  "notify_roles": ["<super_admin_role_id>"],
  "notify_users": [],
  "cooldown_minutes": 120
}
```

---

### US-11.3 — Alert Evaluation Service

**File:** `backend/src/services/dashboard/alertEvaluationService.ts`

Called from `dashboardSocketService.ts` after every widget value update:

```typescript
export async function evaluateAlerts(
  widget_key: string,
  new_value: number,
  project_id: string,
) {
  const alerts = await DashThresholdAlert.find({
    widget_key,
    is_active: true,
  }).lean();

  for (const alert of alerts) {
    // Cooldown check
    if (alert.last_triggered_at) {
      const elapsed = (Date.now() - alert.last_triggered_at.getTime()) / 60000;
      if (elapsed < alert.cooldown_minutes) continue;
    }

    // Condition evaluation
    if (!evalCondition(new_value, alert.condition)) continue;

    // Fire notification
    await fireAlertNotification(alert, new_value);

    // Update last triggered
    await DashThresholdAlert.findByIdAndUpdate(alert._id, {
      last_triggered_at: new Date(),
      last_triggered_value: new_value,
    });
  }
}

function evalCondition(
  val: number,
  cond: { operator: string; value: number },
): boolean {
  const ops: Record<string, (a: number, b: number) => boolean> = {
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    eq: (a, b) => a === b,
  };
  return ops[cond.operator]?.(val, cond.value) ?? false;
}
```

---

### US-11.4 — Notification Integration

**`fireAlertNotification(alert, triggered_value)`:**

Integrates with the Notification Module (as specified in Notification Module PRD). If not yet built, falls back to direct email via `nodemailer`.

```typescript
async function fireAlertNotification(
  alert: IDashThresholdAlert,
  value: number,
) {
  // Try to use Notification module if available
  try {
    const Notification = require("../models/Notification");
    const recipientIds = await resolveRecipients(
      alert.notify_roles,
      alert.notify_users,
    );
    await Notification.insertMany(
      recipientIds.map((userId) => ({
        recipient_user_id: userId,
        trigger_type: "dashboard_alert",
        title: `Dashboard Alert: ${alert.alert_name}`,
        body: `Metric reached ${value} (condition: ${alert.condition.operator} ${alert.condition.value})`,
        deep_link_url: `/dashboard`,
        entity_type: "dashboard_widget",
        entity_id: alert.dashboard_widget_id,
        severity: alert.severity,
      })),
    );
  } catch (notifErr) {
    // Fallback: direct email
    console.warn(
      "[ALERTS] Notification module not available, falling back to email",
    );
    await sendAlertEmail(alert, value);
  }
}
```

---

### US-11.5 — Alert Management UI

**Route:** `/admin/dashboards/:id/alerts`

**DashboardAlertsPage.tsx:**

- List: alert name, widget, condition (human-readable), severity badge, recipients, last triggered, cooldown, active toggle
- "+ Create Alert" drawer:
  - Widget selector dropdown (widgets on this dashboard)
  - Alert name
  - Condition: operator dropdown + value number input
  - Severity: Info / Warning / Critical
  - Notify roles (multi-select from role list)
  - Notify users (search)
  - Cooldown minutes
  - "Test Alert" button
- Enable/disable per row (sets `is_active`)

---

## 16. API Route Reference

All new routes mount under `/api/v2/dashboard/` in `backend/src/routes/dashboardV2.ts`.

```
# User dashboard resolution
GET    /api/v2/dashboard/me
PATCH  /api/v2/dashboard/me/:templateId/preferences

# Widget data
GET    /api/v2/dashboard/widgets/registry
GET    /api/v2/dashboard/widgets/:widget_key/data
GET    /api/v2/dashboard/widgets/:widget_key/export

# Template CRUD
GET    /api/v2/dashboard/templates
POST   /api/v2/dashboard/templates
GET    /api/v2/dashboard/templates/:id
PUT    /api/v2/dashboard/templates/:id
DELETE /api/v2/dashboard/templates/:id
POST   /api/v2/dashboard/templates/:id/publish
POST   /api/v2/dashboard/templates/:id/archive
POST   /api/v2/dashboard/templates/:id/duplicate

# Widget placement
POST   /api/v2/dashboard/templates/:id/widgets
PATCH  /api/v2/dashboard/templates/:id/widgets/:wid
DELETE /api/v2/dashboard/templates/:id/widgets/:wid

# Assignments
GET    /api/v2/dashboard/templates/:id/assignments
POST   /api/v2/dashboard/templates/:id/assignments
PATCH  /api/v2/dashboard/templates/:id/assignments/:aid
DELETE /api/v2/dashboard/templates/:id/assignments/:aid

# Scheduled reports (Sprint 10)
GET    /api/v2/dashboard/scheduled-reports
POST   /api/v2/dashboard/scheduled-reports
GET    /api/v2/dashboard/scheduled-reports/:id
PUT    /api/v2/dashboard/scheduled-reports/:id
DELETE /api/v2/dashboard/scheduled-reports/:id
POST   /api/v2/dashboard/scheduled-reports/:id/send-now

# Threshold alerts (Sprint 11)
GET    /api/v2/dashboard/templates/:id/alerts
POST   /api/v2/dashboard/templates/:id/alerts
PUT    /api/v2/dashboard/templates/:id/alerts/:aid
DELETE /api/v2/dashboard/templates/:id/alerts/:aid
POST   /api/v2/dashboard/templates/:id/alerts/:aid/test
```

---

## 17. Approved File Modifications

Only these existing files may be changed. Every other change is in a new file.

| File                                          | What Changes                                                                                                           | Sprint |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| `backend/src/models/Ticket.ts`                | Add 3 optional fields + 6 compound indexes                                                                             | 1      |
| `backend/src/models/User.ts`                  | Add `centreId` optional field + index                                                                                  | 1      |
| `backend/src/controllers/ticketController.ts` | Add closedAt on close, sla_due_at on create, firstRespondedAt on first reply, socket emit — all in non-fatal try/catch | 3 + 7  |
| `backend/src/constants/permissions.ts`        | Add 3 new permission code constants                                                                                    | 8      |
| `backend/src/config/index.ts`                 | Add `dashboardV2.enabled` config key                                                                                   | 8      |
| `backend/src/server.ts`                       | Import + mount dashboardV2 router; call startReportScheduler()                                                         | 2 + 10 |
| `.env`                                        | Add `DASHBOARD_V2_ENABLED=true`                                                                                        | 8      |

**Everything else is a brand new file.**

---

## 18. New File Tree

```
backend/src/
├── models/dashboard/
│   ├── DashWidgetDefinition.ts    (Sprint 1)
│   ├── DashTemplate.ts            (Sprint 1)
│   ├── DashWidget.ts              (Sprint 1)
│   ├── DashAssignment.ts          (Sprint 1)
│   ├── DashUserPref.ts            (Sprint 1)
│   ├── FeedbackScore.ts           (Sprint 9)
│   ├── DashScheduledReport.ts     (Sprint 10)
│   ├── DashThresholdAlert.ts      (Sprint 11)
│   └── index.ts                   (Sprint 1)
│
├── seeds/
│   ├── seedWidgetDefinitions.ts   (Sprint 1)
│   ├── migrateClosedAt.ts         (Sprint 1)
│   ├── addDashboardPermissions.ts (Sprint 8)
│   └── seedDefaultDashboards.ts   (Sprint 8)
│
├── services/dashboard/
│   ├── scopeResolver.ts           (Sprint 2)
│   ├── widgetDataService.ts       (Sprint 2)
│   ├── dashboardSocketService.ts  (Sprint 7)
│   ├── reportGenerationService.ts (Sprint 10)
│   ├── reportEmailService.ts      (Sprint 10)
│   ├── reportScheduler.ts         (Sprint 10)
│   ├── alertEvaluationService.ts  (Sprint 11)
│   └── queryHandlers/
│       ├── ticketHandlers.ts      (Sprint 2)
│       ├── userHandlers.ts        (Sprint 2)
│       ├── kbHandlers.ts          (Sprint 2)
│       ├── activityHandlers.ts    (Sprint 2)
│       ├── emailHandlers.ts       (Sprint 2)
│       ├── slaHandlers.ts         (Sprint 2)
│       └── satisfactionHandlers.ts (Sprint 9)
│
├── controllers/
│   └── dashboardV2Controller.ts   (Sprint 2)
│
└── routes/
    └── dashboardV2.ts             (Sprint 2)

frontend/src/
├── pages/
│   ├── Dashboard/
│   │   ├── DashboardPage.tsx         (Sprint 5)
│   │   ├── DashboardTabBar.tsx       (Sprint 5)
│   │   ├── DashboardPanel.tsx        (Sprint 5)
│   │   └── index.ts
│   └── Admin/
│       ├── DashboardBuilderPage.tsx       (Sprint 6)
│       ├── DashboardAssignmentPage.tsx    (Sprint 6)
│       ├── DashboardScheduledReportsPage.tsx (Sprint 10)
│       └── DashboardAlertsPage.tsx        (Sprint 11)
│
├── components/dashboard/
│   ├── DashboardGrid.tsx              (Sprint 5)
│   ├── WidgetCard.tsx                 (Sprint 5)
│   ├── WidgetLoadingSkeleton.tsx      (Sprint 5)
│   ├── GlobalFilterBar.tsx            (Sprint 5)
│   ├── WidgetExpandModal.tsx          (Sprint 5)
│   └── widgets/
│       ├── KpiTileWidget.tsx          (Sprint 5)
│       ├── KpiPairWidget.tsx          (Sprint 5)
│       ├── LineChartWidget.tsx        (Sprint 5)
│       ├── AreaChartWidget.tsx        (Sprint 5)
│       ├── BarChartWidget.tsx         (Sprint 5)
│       ├── DonutChartWidget.tsx       (Sprint 5)
│       ├── GaugeWidget.tsx            (Sprint 5)
│       ├── ProgressBarWidget.tsx      (Sprint 5)
│       ├── DataTableWidget.tsx        (Sprint 5)
│       └── ActivityFeedWidget.tsx     (Sprint 5)
│
├── components/builder/
│   ├── WidgetPanel.tsx                (Sprint 6)
│   ├── BuilderCanvas.tsx              (Sprint 6)
│   ├── BuilderWidgetSlot.tsx          (Sprint 6)
│   ├── WidgetConfigPanel.tsx          (Sprint 6)
│   └── DashboardSettingsModal.tsx     (Sprint 6)
│
├── hooks/
│   ├── useDashboards.ts              (Sprint 5)
│   └── useWidgetData.ts              (Sprint 5)
│
└── services/
    └── dashboardV2Service.ts          (Sprint 5)
```

---

## 19. Full Acceptance Criteria

### Database Layer

- [ ] All 7 new `dash_` collections created on app start without error
- [ ] `feedback_scores` collection created (Sprint 9)
- [ ] `dash_widget_definitions` seeded with 47+ widgets — running seed twice produces no duplicates
- [ ] `Ticket.closedAt`, `Ticket.sla_due_at`, `Ticket.firstRespondedAt` exist as optional fields
- [ ] `User.centreId` exists as optional field
- [ ] All 6 new compound indexes confirmed via `db.tickets.getIndexes()`
- [ ] Historical migration: all existing closed/resolved tickets have `closedAt` backfilled

### Scope Resolver

- [ ] Super Admin → `scopedProjectIds` = all project IDs
- [ ] Agent → `scopedProjectIds` = only assigned projects
- [ ] Two agents with different project assignments receive different widget data from same endpoint
- [ ] Scope cache returns in < 1ms on hit
- [ ] Scope cache is cleared immediately when user role changes

### Widget Data API

- [ ] `GET /api/v2/dashboard/widgets/ticket_open_count/data` returns correctly scoped count
- [ ] Super Admin and Agent receive different values for same endpoint
- [ ] User without `TICKET_VIEW_ALL` or `TICKET_VIEW_OWN` receives `403`
- [ ] Unknown `widget_key` receives `404`
- [ ] `ticket_sla_resolution_rate` returns correct % after schema additions
- [ ] Queries verified with `.explain("executionStats")` — no `COLLSCAN`
- [ ] `csat_score` returns `null` (not 0%) when no feedback records exist
- [ ] `nps_score` displays as signed integer (e.g. `+42`)

### Template Builder API

- [ ] Template cannot be published with 0 widgets → `400`
- [ ] Assignment cannot be created for draft/archived template → `400`
- [ ] Duplicate creates new draft with all widgets and no assignments
- [ ] Archive with active assignments succeeds and returns warning count
- [ ] Preview as role (`?preview_as_role=<id>`) only available to Super Admin

### User Dashboard Resolution

- [ ] `GET /api/v2/dashboard/me` returns correct dashboards for role-assigned user
- [ ] Individual user assignment appears before role assignments
- [ ] Project-scoped assignment only appears when user has that project in scope
- [ ] User with no assignments receives `{ dashboards: [], total_dashboards: 0 }`

### Frontend — Viewer

- [ ] Tab bar visible within 400ms of navigation (metadata only, no widget data yet)
- [ ] All widgets render in skeleton state immediately on tab load
- [ ] One widget error does not block other widgets from loading
- [ ] Clicking table row in `my_assigned_tickets` navigates to correct ticket
- [ ] Global date range filter causes all supporting widgets to re-fetch
- [ ] Auto-refresh updates values without skeleton flash
- [ ] CSAT widget shows "No data" when no feedback exists, not 0%

### Frontend — Builder

- [ ] Admin can create 5-widget dashboard and publish in < 10 minutes
- [ ] Undo reverses last canvas action (add, remove, reposition, resize)
- [ ] Preview mode shows live data scoped to admin's identity
- [ ] Preview as role simulates correct project scope for chosen role
- [ ] Dashboard settings modal saves and applies theme/date/refresh changes

### Real-Time

- [ ] New ticket created → `ticket_open_count` KPI tile updates within 5 seconds for all connected users
- [ ] Socket connection maintained across page navigations within the app

### Scheduled Reports

- [ ] Creating a scheduled report registers the cron job immediately (no restart)
- [ ] Deleting a scheduled report destroys the cron task immediately
- [ ] "Send Now" delivers PDF to configured recipients within 30 seconds
- [ ] Failed send logs error to `DashScheduledReport.last_error` and `last_run_status: 'failed'`
- [ ] PDF includes all configured widgets with correct data
- [ ] Cron uses configured timezone correctly (IST vs UTC)

### Threshold Alerts

- [ ] Alert fires when condition is met (e.g. `ticket_open_count >= 50`)
- [ ] Cooldown prevents second alert firing within configured window
- [ ] "Test Alert" fires notification without updating `last_triggered_at`
- [ ] Alert integrates with Notification Module if available; falls back to email if not
- [ ] Alert history widget displays last 10 triggered alerts

### Security

- [ ] No widget returns data from a project the requesting user is not a member of
- [ ] `POST /api/v2/dashboard/templates` requires `DASHBOARD_VIEW_ANALYTICS`
- [ ] `POST /api/v2/dashboard/templates/:id/assignments` requires `DASHBOARD_ASSIGN`
- [ ] `POST /api/v2/dashboard/scheduled-reports` requires `DASHBOARD_MANAGE`
- [ ] Old `GET /api/dashboard/statistics` works unchanged
- [ ] `DASHBOARD_V2_ENABLED=false` makes all `/api/v2/dashboard/` routes return `404`
- [ ] Scope injection is server-side only — no client-provided scope parameter is trusted

---

## 20. Day-by-Day Execution Plan

### Week 1 — Sprint 1: Foundation

- **Day 1–2:** Create 5 model files (`DashWidgetDefinition`, `DashTemplate`, `DashWidget`, `DashAssignment`, `DashUserPref`). Add optional fields to `Ticket.ts` and `User.ts`. Add 6 compound indexes.
- **Day 3:** Write and run `seedWidgetDefinitions.ts`. Verify 47 widgets in DB via MongoDB shell.
- **Day 4:** Write and run `migrateClosedAt.ts`. Verify backfill.
- **Day 5:** Run `db.tickets.getIndexes()` to confirm all new compound indexes exist. Document any issues.

### Week 2 — Sprint 2: Scope Resolver + API

- **Day 1:** Build `scopeResolver.ts`. Test manually: login as Super Admin → verify all projects returned. Login as Agent → verify only assigned projects.
- **Day 2–3:** Build all query handlers: `ticketHandlers`, `userHandlers`, `kbHandlers`, `activityHandlers`, `emailHandlers`.
- **Day 4:** Build `widgetDataService.ts` (QUERY_REGISTRY). Build `dashboardV2Controller.ts` (getWidgetData, getWidgetRegistry).
- **Day 5:** Create `dashboardV2.ts` routes. Register in `server.ts`. Manual test 10 widget endpoints with curl. Verify scope isolation (login as different users, confirm different values).

### Week 3 — Sprint 3 + Sprint 4 (start)

- **Day 1–2:** Add 3 try/catch blocks to `ticketController.ts`. Create a test ticket → verify `sla_due_at` is set. Close a ticket → verify `closedAt` is set. Add a reply → verify `firstRespondedAt` is set.
- **Day 3:** Test `ticket_sla_resolution_rate` widget returns correct percentage.
- **Day 4–5:** Build template CRUD API (US-4.1 through US-4.3): create, list, get, update, publish, archive, duplicate, delete.

### Week 4 — Sprint 4 (continued)

- **Day 1–2:** Build assignment API (US-4.3: list, create, update, delete).
- **Day 3–4:** Build `GET /me` resolver with full priority ordering logic. Test: role-assigned user, individual user assignment, scoped assignment, no-assignment user.
- **Day 5:** Build user preferences endpoint. Full API integration test: create template → add widgets → publish → assign to role → login as role member → call `/me`.

### Week 5 — Sprint 5: Frontend Viewer

- **Day 1:** Set up routing. Build `useDashboards` hook + `DashboardPage.tsx` with empty state.
- **Day 2:** Build `DashboardGrid.tsx` + `WidgetCard.tsx` with all 5 states (loading, loaded, empty, error, no_permission).
- **Day 3:** Build all viz renderers: `KpiTileWidget`, `LineChartWidget`, `BarChartWidget`, `DonutChartWidget`, `GaugeWidget`, `DataTableWidget`, `ActivityFeedWidget`.
- **Day 4:** Build `GlobalFilterBar.tsx`. Wire filter changes to all widget data fetches.
- **Day 5:** Widget expand modal (`WidgetExpandModal.tsx`). Auto-refresh (`useWidgetData.ts`). Tab bar with active state.

### Week 6 — Sprint 6: Frontend Builder

- **Day 1–2:** Builder page layout. Widget panel with search and module groups. Canvas with ghost grid.
- **Day 3:** Drag-and-drop from panel to canvas. Resize handles. Undo/redo (20 steps).
- **Day 4:** Widget config panel — all 4 tabs (Display, Data, Thresholds, Table Columns).
- **Day 5:** Dashboard settings modal. Preview mode. Assignment management page.

### Week 7 — Sprints 7 + 8: Real-time + QA

- **Day 1–2:** Socket.io server: `dashboardSocketService.ts`. Add emit to `ticketController.ts`. Frontend: join rooms on mount, listen for `dashboard:widget_update`.
- **Day 3:** Excel export endpoint. Test PDF download from widget menu.
- **Day 4:** Permissions seed + default dashboards seed. Run full seed suite. Verify in DB.
- **Day 5:** Full acceptance criteria pass. Fix any gaps.

### Week 8 — Sprint 9: CSAT / NPS / CES

- **Day 1:** `FeedbackScore.ts` model. `satisfactionHandlers.ts` query handlers.
- **Day 2:** 6 satisfaction widgets seeded. Update `seedDefaultDashboards.ts` with Satisfaction Overview template.
- **Day 3–4:** Frontend satisfaction widget renderers (CSAT gauge, NPS tile with signed number, CES tile, CSAT by agent bar chart).
- **Day 5:** End-to-end test satisfaction widgets. Verify `null` displays as "No data" not 0%.

### Week 9 — Sprint 10: Scheduled Reports

- **Day 1:** Install `node-cron` + `html-pdf-node`. Build `DashScheduledReport.ts` model. Build scheduled report API endpoints.
- **Day 2:** `reportGenerationService.ts` — HTML template + `html-pdf-node` PDF generation.
- **Day 3:** `reportEmailService.ts` — attach PDF + send via nodemailer.
- **Day 4:** `reportScheduler.ts` — cron registration, dynamic task management. Hook into `server.ts`.
- **Day 5:** Frontend: `DashboardScheduledReportsPage.tsx`. Test full flow: create schedule → "Send Now" → verify email received.

### Week 10 — Sprint 11: Threshold Alerts

- **Day 1:** `DashThresholdAlert.ts` model. Alert CRUD API endpoints.
- **Day 2:** `alertEvaluationService.ts` — condition evaluation + cooldown + notification integration.
- **Day 3:** Wire alert evaluation to Socket.io emit path in `dashboardSocketService.ts`.
- **Day 4:** Frontend: `DashboardAlertsPage.tsx`.
- **Day 5:** Full system acceptance criteria pass across all 11 sprints.

---

_End of Document — Dashboard Module Master Development Guide v2.0 Final_

_Generated: May 2026 | Based on codebase: hubblehox-technologies-helpdesk commit 8f39a778e8ad_
_Generated: May 2026 | Based on codebase: hubblehox-technologies-helpdesk commit 8f39a778e8ad_
