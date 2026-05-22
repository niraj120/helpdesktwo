# Dashboard Module — Market Benchmark Addendum
## Sprint 9, 10 & 11: Features the Best Platforms Have That We Should Add

**Document Version:** 1.0 (Addendum to E2E Development Guide v1.0)
**Research Base:** Zendesk Explore, Freshdesk Analytics, Datadog, HubSpot, Tableau, ServiceDesk Plus, Sumo Logic, Qualtrics — May 2026
**Audience:** Development Team
**Scope:** Additive only — no changes to existing Sprints 1–8

---

## What Was Researched

Every major enterprise helpdesk and analytics platform was evaluated for what they offer beyond a basic configurable dashboard. The finding is clear: the gap between a good dashboard and a market-leading one is not in the widgets — it's in three capabilities that transform a dashboard from a passive viewer into an active intelligence tool:

1. **CSAT / NPS / CES measurement** — Zendesk, Freshdesk, ServiceDesk Plus, and every enterprise tool treat satisfaction scoring as a first-class dashboard feature. Your platform has a feedback module but no structured satisfaction score computation on the dashboard.

2. **Scheduled Report Delivery** — Datadog, HubSpot, Sumo Logic, Tableau, and Exabeam all send automated dashboard snapshots via email on a recurring schedule. This is the single most-requested feature by managers and commissioners who don't log in daily but need weekly visibility.

3. **Threshold Alerts as Notifications** — Every enterprise platform (Zendesk, Freshdesk, Datadog, Kapture) sends active alerts when a KPI crosses a threshold. The current design has threshold state colour-coding on widgets — but no proactive push when a metric enters the red zone.

---

## Sprint 9 — CSAT / NPS / CES Scoring on the Dashboard

### Why This Matters

A single NPS or CSAT score tells you where you are. A trend line tells you whether you're improving. Every platform that leads the market — Freshdesk Analytics, Zendesk Explore, Qualtrics — treats satisfaction measurement as a core dashboard primitive, not an add-on.

### What CSAT, NPS, and CES Mean in This Context

| Metric | Formula | Source Data | What It Tells You |
|---|---|---|---|
| **CSAT** (Customer Satisfaction Score) | Sum of positive ratings ÷ Total ratings × 100 | Post-ticket feedback rating (1–5 stars or thumbs up/down) | % of users who were satisfied with the resolution |
| **NPS** (Net Promoter Score) | % Promoters − % Detractors | "How likely to recommend?" 0–10 scale | Overall loyalty signal |
| **CES** (Customer Effort Score) | Average effort rating | "How easy was it to resolve?" 1–7 scale | Friction in the support experience |

### Data Model Addition

**Collection:** `feedback_scores` (new)
**File:** `backend/src/models/dashboard/FeedbackScore.ts`

| Field | Type | Notes |
|---|---|---|
| `ticket_id` | ObjectId → Ticket | The ticket this score relates to |
| `project_id` | ObjectId → Project | For scoping |
| `respondent_user_id` | ObjectId → User | Who submitted the feedback |
| `agent_id` | ObjectId → User | Agent who handled the ticket |
| `csat_rating` | Number (1–5) | nullable — only if CSAT survey was presented |
| `nps_rating` | Number (0–10) | nullable — only if NPS survey was presented |
| `ces_rating` | Number (1–7) | nullable — only if CES survey was presented |
| `comment` | String | Optional free-text comment |
| `submitted_at` | Date | When the response was submitted |
| `ticket_category` | String | Denormalised from ticket for fast grouping |
| `ticket_priority` | String | Denormalised |

**Indexes:** `{ project_id: 1, submitted_at: -1 }`, `{ agent_id: 1, submitted_at: -1 }`, `{ project_id: 1, csat_rating: 1 }`

---

### US-9.1 — CSAT Score Widget

**Widget Key:** `csat_score`
**Display Name:** CSAT Score
**Viz Types:** KPI tile (%), gauge, trend line
**Module:** `satisfaction`

**Computation:**
```javascript
const [positive, total] = await Promise.all([
  FeedbackScore.countDocuments({
    project_id: { $in: scopedProjectIds },
    csat_rating: { $gte: 4 },
    submitted_at: { $gte: config.start_date }
  }),
  FeedbackScore.countDocuments({
    project_id: { $in: scopedProjectIds },
    csat_rating: { $exists: true, $ne: null },
    submitted_at: { $gte: config.start_date }
  })
]);
const csat = total > 0 ? Math.round((positive / total) * 100 * 10) / 10 : null;
```

**Gauge thresholds (defaults):** Green ≥ 80%, Amber 60–79%, Red < 60%

---

### US-9.2 — NPS Score Widget

**Widget Key:** `nps_score`
**Display Name:** Net Promoter Score
**Viz Types:** KPI tile, gauge, trend line
**Module:** `satisfaction`

```javascript
// Promoters = 9–10, Detractors = 0–6, Passives = 7–8
// NPS = (% Promoters) − (% Detractors), range: -100 to +100
```

---

### US-9.3 — CES Score Widget

**Widget Key:** `ces_score`
**Display Name:** Customer Effort Score
**Viz Types:** KPI tile, gauge
**Module:** `satisfaction`
**Display:** "2.4 / 7" — lower is better

---

### US-9.4 — Satisfaction Trend Widget

**Widget Key:** `satisfaction_trend`
**Display Name:** CSAT Trend Over Time
**Viz Types:** Line chart, area chart
**Module:** `satisfaction`
**Query:** Group CSAT by day over selected period, compute % per day

---

### US-9.5 — CSAT by Agent Widget

**Widget Key:** `csat_by_agent`
**Display Name:** CSAT by Agent
**Viz Types:** Bar chart, table
**Module:** `satisfaction`
**Purpose:** Shows which agents have highest/lowest satisfaction scores

---

### US-9.6 — Satisfaction Response Rate Widget

**Widget Key:** `feedback_response_rate`
**Display Name:** Feedback Response Rate
**Viz Types:** KPI tile (%), gauge
**Module:** `satisfaction`
**Computation:** responded FeedbackScores ÷ closed tickets × 100

---

### US-9.7 — Seed Satisfaction Widgets into Registry

Add all 6 satisfaction widgets to `backend/src/utils/seedWidgetDefinitions.ts` under module `satisfaction`.

### US-9.8 — Add Satisfaction Section to Pre-Built Dashboards

- Add `csat_score` + `satisfaction_trend` to **Executive Overview** dashboard
- Add `csat_by_agent` to **Agent Work Queue** dashboard
- Create new template: **"Satisfaction Overview"** (6 widgets) for Super Admin + Project Admin

---

## Sprint 10 — Scheduled Report Delivery

### New Packages
```bash
npm install node-cron html-pdf-node
npm install @types/node-cron --save-dev
```

### Data Model Addition

**Collection:** `dash_scheduled_reports` (new)
**File:** `backend/src/models/dashboard/DashScheduledReport.ts`

| Field | Type | Notes |
|---|---|---|
| `dashboard_template_id` | ObjectId → DashTemplate | Which dashboard to snapshot |
| `name` | String | e.g. "Weekly District Summary" |
| `schedule_type` | String enum | `daily`, `weekly`, `monthly`, `custom_cron` |
| `cron_expression` | String | e.g. `0 8 * * 1` = Monday 8 AM |
| `timezone` | String | Default: `Asia/Kolkata` |
| `recipients` | Array of Objects | `[{ email, name, is_portal_user }]` |
| `format` | String enum | `pdf`, `csv`, `email_inline`. Default `pdf` |
| `date_range_days` | Number | Override dashboard's default date range |
| `include_widgets` | ObjectId[] | Subset of widgets to include. Empty = all. |
| `subject_template` | String | Supports `{{dashboard_name}}`, `{{date}}`, `{{period}}` |
| `body_template` | String | Optional intro text |
| `is_active` | Boolean | Default true |
| `last_run_at` | Date | After each successful send |
| `last_run_status` | String enum | `success`, `failed`, `partial` |
| `last_error` | String | Error message if last run failed |
| `created_by` | ObjectId → User | |
| `tenant_id` | String | |

**Index:** `{ is_active: 1, schedule_type: 1 }`

---

### US-10.1 — Scheduled Report CRUD API

```
GET    /api/v2/dashboard/scheduled-reports               → List all
POST   /api/v2/dashboard/scheduled-reports               → Create
GET    /api/v2/dashboard/scheduled-reports/:id           → Get
PUT    /api/v2/dashboard/scheduled-reports/:id           → Update
DELETE /api/v2/dashboard/scheduled-reports/:id           → Delete
POST   /api/v2/dashboard/scheduled-reports/:id/send-now  → Test send
```

**Permission required:** `DASHBOARD_MANAGE`

---

### US-10.2 — Report Generation Service

**File:** `backend/src/services/dashboard/reportGenerationService.ts`

For PDF format:
1. Fetch all widget data for the dashboard
2. Build HTML template (dashboard name, date range, widget values)
3. Pass to `html-pdf-node` → PDF buffer

For CSV: full table data, combine into ZIP if multiple tables.
For email_inline: same HTML sent as email body.

---

### US-10.3 — Email Delivery

**File:** `backend/src/services/dashboard/reportEmailService.ts`

- Uses existing nodemailer setup
- Attaches PDF buffer as `{{dashboard_name}}_{{date}}.pdf`
- Logs to existing `EmailLog` collection with `type: 'other'`
- Updates `last_run_at`, `last_run_status`

---

### US-10.4 — Cron Job Runner

**File:** `backend/src/services/dashboard/reportScheduler.ts`

On app start: reads all active `dash_scheduled_reports`, registers `node-cron` jobs.
Dynamic registration: create = register new cron, delete = destroy task.
Call `startReportScheduler()` from `server.ts` after DB connects.

---

### US-10.5 — Scheduled Report UI

**Route:** `/admin/dashboards/:id/scheduled-reports`
**File:** `frontend/src/pages/DashboardScheduledReportsPage.tsx`

Features:
- List: name, human-readable schedule, recipients count, last run, status badge
- "+ Schedule Report" drawer form
- Edit, delete, "Send Now" per row

---

### US-10.6 — Cron to Human Helper

**`cronToHuman(expression: string): string`**
```
"0 8 * * 1"    → "Every Monday at 8:00 AM"
"0 9 1 * *"    → "1st of every month at 9:00 AM"
"0 7 * * *"    → "Every day at 7:00 AM"
"*/30 * * * *" → "Every 30 minutes"
```

---

## Sprint 11 — Threshold Alerts as Active Notifications

### Data Model Addition

**Collection:** `dash_threshold_alerts` (new)
**File:** `backend/src/models/dashboard/DashThresholdAlert.ts`

| Field | Type | Notes |
|---|---|---|
| `dashboard_template_id` | ObjectId | Which dashboard |
| `dashboard_widget_id` | ObjectId | Specific widget |
| `widget_key` | String | Denormalised |
| `alert_name` | String | e.g. "High SLA Breach Alert" |
| `condition` | Object | `{ operator: 'gt'|'lt'|'gte'|'lte'|'eq', value: number }` |
| `severity` | String enum | `info`, `warning`, `critical` |
| `notify_roles` | ObjectId[] | Roles to notify |
| `notify_users` | ObjectId[] | Individual users |
| `cooldown_minutes` | Number | Default 60 |
| `last_triggered_at` | Date | For cooldown enforcement |
| `last_triggered_value` | Number | Value that caused last trigger |
| `is_active` | Boolean | Default true |
| `created_by` | ObjectId | |
| `tenant_id` | String | |

**Index:** `{ dashboard_widget_id: 1, is_active: 1 }`

---

### US-11.1 — Threshold Alert CRUD API

```
GET    /api/v2/dashboard/templates/:id/alerts       → List alerts
POST   /api/v2/dashboard/templates/:id/alerts       → Create alert
PUT    /api/v2/dashboard/templates/:id/alerts/:aid  → Update
DELETE /api/v2/dashboard/templates/:id/alerts/:aid  → Delete
```

**Permission:** `DASHBOARD_MANAGE`

---

### US-11.2 — Alert Evaluation Service

**File:** `backend/src/services/dashboard/alertEvaluationService.ts`

`evaluateAlerts(widget_key, new_value, project_ids)`:
1. Find active alerts for widget_key
2. Check cooldown (skip if within cooldown_minutes)
3. Evaluate condition (gt/lt/gte/lte/eq)
4. Fire notification via existing notification engine
5. Update `last_triggered_at` + `last_triggered_value`

---

### US-11.3 — Alert Notification Integration

`fireAlertNotification(alert, value)`:
- Resolve recipients from `notify_roles` + `notify_users`
- Create `Notification` records (`trigger_type: 'dashboard_alert'`)
- Emit via Socket.io to connected users
- Fallback: nodemailer if Notification module unavailable

---

### US-11.4 — Alert Management UI

**Route:** `/admin/dashboards/:id/alerts`
**File:** `frontend/src/pages/DashboardAlertsPage.tsx`

Features:
- List: alert name, widget, condition (human-readable), severity badge, recipients, last triggered
- Drawer: widget selector, condition (operator+value), severity, roles+users, cooldown
- "Test Alert" button (no cooldown update), enable/disable toggle

---

### US-11.5 — Alert History Widget

**Widget Key:** `dashboard_alert_history`
**Module:** `system`
**Viz:** Table — widget name, triggered value, severity, triggered_at

---

## Summary

| Sprint | Feature | Market Equivalent | Value |
|---|---|---|---|
| 9 | CSAT / NPS / CES widgets | Zendesk Explore, Freshdesk, Qualtrics | Structured satisfaction scoring on admin dashboard |
| 10 | Scheduled report delivery (PDF/CSV via email) | Datadog, HubSpot, Sumo Logic, Tableau | Commissioners get weekly summaries without logging in |
| 11 | Threshold alerts → portal notifications | Zendesk, Freshdesk, Kapture, Datadog | Proactive intelligence — system tells you when something is wrong |

---

## New Files

### Backend
```
backend/src/models/dashboard/
  ├── FeedbackScore.ts          (Sprint 9)
  ├── DashScheduledReport.ts    (Sprint 10)
  └── DashThresholdAlert.ts     (Sprint 11)

backend/src/services/dashboard/
  ├── reportGenerationService.ts   (Sprint 10)
  ├── reportEmailService.ts        (Sprint 10)
  ├── reportScheduler.ts           (Sprint 10)
  └── alertEvaluationService.ts    (Sprint 11)

backend/src/services/widgetHandlers/
  └── phase4Handlers.ts            (Sprint 9 — satisfaction widgets)

backend/src/routes/dashboardV2Routes.ts   ← new routes for Sprints 9–11
```

### Frontend
```
frontend/src/pages/
  ├── DashboardScheduledReportsPage.tsx  (Sprint 10)
  └── DashboardAlertsPage.tsx            (Sprint 11)
```

### Modified Files (additive only)
```
backend/src/routes/widgetDataRoutes.ts          — existing pattern unchanged
backend/src/utils/seedWidgetDefinitions.ts      — add 7 new widget defs
backend/src/utils/seedDashboardTemplates.ts     — add Satisfaction Overview template
backend/src/models/dashboard/WidgetDefinition.ts — add 'satisfaction' to module enum
backend/src/server.ts                           — registerPhase4Handlers(), startReportScheduler()
```

## Implementation Notes (codebase-specific)

- Seed files are in `backend/src/utils/` (NOT `src/seeds/`)
- Widget handlers follow `QueryHandler` interface: `{ widgetKey, cacheTtlSeconds, execute(ctx, params, resolvedFilters, scopedQuery) }`
- `WidgetModule` enum in `WidgetDefinition.ts` currently: `"ticketing" | "onboarding" | "attendance" | "capacity" | "feedback" | "system"` — add `"satisfaction"`
- Phase 4 handlers file will be `phase4Handlers.ts` following existing naming convention
- Routes v2 will use prefix `/api/v2/` to stay clean from existing `/api/v1/` routes
- `buildDateRange(days)` utility available from `widgetQueryEngine.ts`
- Lazy model accessor pattern: `const getFeedbackScoreModel = () => mongoose.model("FeedbackScore")`

---

*End of Document — Dashboard Module Market Benchmark Addendum v1.0*
