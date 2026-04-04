# SAC Helpdesk — User Stories for Missing Gaps

**Date:** April 3, 2026  
**Scope:** All features present in market-leading portals (Zendesk, Freshservice, JSM, ServiceNow, ManageEngine) that are currently missing or incomplete in SAC Helpdesk.

---

## Epic 1 — Escalation Matrix: Category-Level UI

> Backend infrastructure exists (`CategoryEscalationConfig` model, `GET/PUT /api/categories/:id/escalation-config` endpoints, `getMatrixByProjectId` with category-first lookup). The gap is purely in surfacing this through dedicated UI.

---

### US-ESC-001 — View category-escalation binding on the Escalation Matrix card

**As an** admin  
**I want to** see which categories are linked to an escalation matrix directly on the matrix list/card  
**So that** I can understand at a glance what is covered without opening every category drawer.

**Acceptance Criteria:**

- [ ] Each escalation matrix card/row shows a "Linked Categories" count badge (e.g., `3 categories`)
- [ ] Clicking the badge opens an inline popover listing: Category Name, Project, Active/Inactive toggle
- [ ] If 0 categories linked → badge shows "No category overrides — applies project-wide"
- [ ] Data comes from `GET /api/escalation-matrix/:id` which should return an aggregated `linkedCategories[]` array
- [ ] Backend: add `linkedCategories` population to `getEscalationMatrixById` controller by querying `CategoryEscalationConfig.find({ escalationMatrixId })`

**Priority:** P0 | **Effort:** 3 SP | **Depends on:** (none — backend ready)

---

### US-ESC-002 — Link a category to an escalation matrix from within the Escalation Matrix form

**As an** admin  
**I want to** select categories to link to an escalation matrix directly inside the matrix create/edit form  
**So that** I don't have to navigate to Project → Category Config → each category to set up the binding.

**Acceptance Criteria:**

- [ ] Escalation matrix form has a new "Category Overrides" section (below Project selection)
- [ ] When a project is selected, a multi-select category picker loads all active categories for that project (hierarchical tree preferred: Course > Category > Subcategory)
- [ ] Admin can select one or more categories; saving the matrix calls `PUT /api/categories/:id/escalation-config` for each selected category
- [ ] Previously linked categories are pre-selected when editing a matrix
- [ ] Removing a category from the selection sets `isActive: false` on its `CategoryEscalationConfig`
- [ ] UI shows a clear label: "Tickets in these categories will use THIS matrix instead of the project-level one"

**Priority:** P0 | **Effort:** 5 SP | **Depends on:** US-ESC-001

---

### US-ESC-003 — Show escalation matrix inheritance chain in Category Config drawer

**As an** admin  
**I want to** see in the Category Config drawer whether a category inherits its escalation matrix from a parent category  
**So that** I know why a ticket gets assigned to a particular matrix without explicitly configuring the leaf category.

**Acceptance Criteria:**

- [ ] Category Config drawer (in Project > Categories tab) shows an "Escalation Matrix" row
- [ ] If the category has its own `CategoryEscalationConfig` → show the matrix name with a "Direct" badge
- [ ] If no direct config → show the nearest ancestor's matrix name with an "Inherited from [Parent Name]" label
- [ ] If no config in the entire hierarchy → show "Using project-default matrix" (or "None configured")
- [ ] Backend: new endpoint `GET /api/categories/:id/escalation-config/resolved` that walks `hierarchyPath` upward and returns `{ source: 'direct'|'inherited'|'project'|'none', categoryName, matrixName, matrixId }`

**Priority:** P1 | **Effort:** 5 SP | **Depends on:** US-ESC-001

---

### US-ESC-004 — Category-escalation config visible in Ticket Detail sidebar

**As an** agent  
**I want to** see which escalation matrix is active on my ticket and why (category-level, priority-level, or project-level)  
**So that** I understand what the escalation path looks like before I escalate.

**Acceptance Criteria:**

- [ ] Ticket detail sidebar shows: "Escalation Matrix: [Name]" with a source label
- [ ] Source label: `Category` / `Priority` / `Project Fallback`
- [ ] Clicking the matrix name expands the full level chain (L1 → role, L2 → role, L3 → role with SLA per level)
- [ ] The current level is highlighted
- [ ] If no matrix is assigned → shows "No escalation matrix — contact admin"

**Priority:** P1 | **Effort:** 3 SP | **Depends on:** (none — ticket already stores `escalationMatrixId`)

---

## Epic 2 — Escalation Level Types: Notify vs Reassign

> Currently every escalation level unconditionally reassigns the ticket. Industry standard (Freshservice, ServiceNow, ManageEngine) supports "notify only" levels that alert a manager without pulling the ticket away from the current agent.

---

### US-ESC-005 — Add `levelType` field to escalation levels (reassign / notify)

**As an** admin  
**I want to** configure each escalation level as either "Reassign" or "Notify Only"  
**So that** when a Level 1 SLA breaches, the manager gets notified but the ticket stays with the Level 1 agent until Level 2 SLA also breaches.

**Acceptance Criteria:**

- [ ] `IEscalationLevel` gains a new optional field: `levelType: 'reassign' | 'notify'` (default `'reassign'`)
- [ ] Escalation matrix form shows a toggle/radio per level: "Reassign agent" vs "Notify only"
- [ ] When `levelType = 'notify'`:
  - `processAutoEscalation` does NOT change `ticket.assignedTo` or `currentEscalationLevelNumber`
  - Sends email/SMS/WhatsApp notification to all users of the escalation level's role
  - Records a `type: 'notification'` entry in `ticket.escalationHistory` with timestamp
  - Sets a new `roleLevelSLA.notifiedAt` timestamp so the same tier is not re-notified
- [ ] When `levelType = 'reassign'` (existing behavior) — no change
- [ ] The Ticket detail escalation panel shows "Notified" entries in a different colour from "Escalated" entries

**Priority:** P1 | **Effort:** 8 SP | **Depends on:** (none)

---

### US-ESC-006 — Notify-level recipients: role pool + specific user overrides

**As an** admin  
**I want to** configure both a role (all users in that role get notified) and optional named users for notify-type levels  
**So that** e.g., the Head of Operations always gets notified on Level 2 SLA breach regardless of role assignment.

**Acceptance Criteria:**

- [ ] `IEscalationLevel` gains an optional `notifyUserIds: ObjectId[]` array (specific named recipients)
- [ ] When `levelType = 'notify'` and `notifyUserIds` is populated → notifications go to those users AND all users with `roleId`
- [ ] Escalation matrix form shows an optional "Also notify users" multi-select (active users picker)
- [ ] If `notifyUserIds` is empty and role has no members → log a warning but don't fail the auto-escalation job

**Priority:** P2 | **Effort:** 3 SP | **Depends on:** US-ESC-005

---

## Epic 3 — SLA % Threshold Escalation Triggers

> Currently `slaHours` is a fixed duration from when the level started. Industry leaders (ManageEngine, Freshservice, JSM) allow setting triggers as "% of the ticket's overall SLA consumed" which is more meaningful for tickets with varying SLA durations.

---

### US-ESC-007 — Support SLA percentage threshold as escalation trigger

**As an** admin  
**I want to** set an escalation level to trigger at "75% of ticket SLA consumed" instead of a fixed 24 hours  
**So that** a ticket with a 2-hour SLA escalates at 1.5 hours rather than waiting for a 24-hour timer that's irrelevant.

**Acceptance Criteria:**

- [ ] `IEscalationLevel` gains two new optional fields:
  - `slaThresholdType: 'fixed' | 'percent'` (default `'fixed'`)
  - `slaThresholdPercent?: number` (1–100, only used when `slaThresholdType = 'percent'`)
- [ ] When `slaThresholdType = 'percent'`:
  - `processAutoEscalation` calculates threshold as `ticket.slaDeadline * (slaThresholdPercent / 100)`
  - Falls back to `roleLevelSLA.dueAt` → `SLATracking.resolutionDeadline` to determine total SLA
- [ ] Escalation matrix form shows a mode selector per level: "Fixed time" → shows existing SLA hours/unit inputs; "% of SLA" → shows a 1–100 number input + label "% of ticket SLA consumed"
- [ ] Mixed levels are valid: L1 = 75% of SLA (warn), L2 = 100% of SLA (reassign)
- [ ] Backward compatible: existing configs with only `slaHours` continue to work as `slaThresholdType = 'fixed'`

**Priority:** P2 | **Effort:** 8 SP | **Depends on:** US-ESC-005

---

## Epic 4 — Pre-Breach SLA Warning Notifications

> Currently notifications only fire at the moment of breach. No helpdesk platform fires without warnings; all send proactive alerts at configurable thresholds before the SLA deadline.

---

### US-ESC-008 — Pre-breach SLA warning at configurable thresholds

**As an** agent  
**I want to** receive a warning notification when my ticket is at 50%, 75%, and 90% of its SLA time  
**So that** I can act before the SLA breaches instead of learning about it after.

**Acceptance Criteria:**

- [ ] New model/config: `SLAWarningConfig` embeds in `EscalationMatrix` or `SLARule` (admin-defined):
  - `warningThresholds: number[]` — array of percentages e.g. `[50, 75, 90]`
  - `notifyRoles: ObjectId[]` — roles to notify (default: assigned agent's role)
  - `notifyAssignedAgent: boolean` — always include the currently assigned agent
- [ ] `processAutoEscalation` (or a new `processSLAWarnings` function) runs every 5 minutes and:
  - Checks all open tickets with an active escalation matrix
  - For each threshold: if `now >= slaStart + (threshold% × totalSLA)` AND no warning sent yet → send notification
  - Tracks sent warnings in `ticket.roleLevelSLA.warningsSent: number[]` (stores which % thresholds have fired)
- [ ] Notification channels: email + in-app notification (Bell icon) — must match existing `sendTicketEscalatedEmail` pattern
- [ ] Admin UI: escalation matrix form shows a "SLA Warning Thresholds" section with add/remove threshold inputs
- [ ] Does NOT re-notify for the same threshold on the same ticket

**Priority:** P2 | **Effort:** 13 SP | **Depends on:** (none — can piggyback on `processAutoEscalation` cron)

---

### US-ESC-009 — In-app SLA countdown indicator on ticket list and ticket detail

**As an** agent  
**I want to** see a visual SLA countdown on my ticket list  
**So that** I can prioritise tickets approaching breach at a glance.

**Acceptance Criteria:**

- [ ] Ticket list table shows a "SLA" column with colour-coded status:
  - Green pill: `>50%` time remaining
  - Amber pill: `25%–50%` remaining
  - Red pill: `<25%` remaining (or already breached: shows "BREACHED")
  - Tooltip shows exact deadline in `DD MMM, HH:MM` format
- [ ] Ticket detail header shows the same pill + a countdown timer that updates every 60 seconds
- [ ] SLA deadline used: `ticket.roleLevelSLA.dueAt` → fallback `SLATracking.resolutionDeadline` → null
- [ ] Breached tickets remain marked "BREACHED" even after escalation (the escalation resets `roleLevelSLA.dueAt` for the next level — show both: "Current level SLA" and "Overall ticket SLA" if different)
- [ ] Paused SLA (`roleLevelSLA.pausedAt`) shows a "PAUSED" badge

**Priority:** P2 | **Effort:** 5 SP | **Depends on:** (none)

---

## Epic 5 — Ticket Assignment: Project-Level Round-Robin Pool

> When no `CategoryAssignmentConfig` exists and the project's `ticketAssignmentSettings` uses round-robin, but `assignToUsers` is empty, tickets fall back to the authenticated session user. This is silent and incorrect.

---

### US-ASSIGN-001 — Validate project-level assignment pool is not empty on save

**As an** admin  
**I want to** be warned when I save a project with "round-robin" assignment enabled but no users or roles in the pool  
**So that** tickets don't silently fall back to the last logged-in admin.

**Acceptance Criteria:**

- [ ] In the Project settings form (Assignment Settings tab): if `assignmentType = 'round-robin'` and both `assignToUsers` and `assignToRoles` are empty → show inline warning: "⚠ No agents in pool — tickets will fall back to the submitting user"
- [ ] Warning is non-blocking (admin can still save) but must be visible before saving
- [ ] Backend: `ticketController.ts` — when fallback occurs (project round-robin pool is empty), log a `WARN` entry in `ticket.auditLog` with `{ message: 'Assignment fallback: pool empty, assigned to authenticated user' }`
- [ ] Admin dashboard: new metric widget "Fallback Assignments This Month" pulls from `auditLog` entries with this message

**Priority:** P1 | **Effort:** 3 SP | **Depends on:** (none)

---

### US-ASSIGN-002 — Category assignment config: show deepest matched level in ticket detail

**As an** agent  
**I want to** see in the ticket detail sidebar which category assignment rule caused me to be assigned  
**So that** I understand why I received this ticket.

**Acceptance Criteria:**

- [ ] Ticket detail sidebar shows: "Assigned via: Category Rule — [Category Name]" OR "Assigned via: Project Round-Robin" OR "Assigned via: Fallback"
- [ ] Data source: `ticket.assignedVia` field (already saved by `ticketController.ts`)
- [ ] If `assignedVia = 'fallback'` → show amber warning tag "⚠ Fallback Assignment"
- [ ] If `assignedVia = 'by-user'` → show the matched category name (requires storing `assignedViaCategoryId` on the ticket)
- [ ] Backend: add `assignedViaCategoryId?: ObjectId` to `Ticket` schema; `ticketController.ts` saves `deepestCategoryObjectId` here when assignment comes from a category config

**Priority:** P2 | **Effort:** 3 SP | **Depends on:** deepest category fix (already done)

---

### US-ASSIGN-003 — Preview assignment before ticket is created

**As an** admin submitting a ticket on behalf of a student  
**I want to** see a preview of which agent will be assigned before I submit  
**So that** I can verify the assignment is correct.

**Acceptance Criteria:**

- [ ] Ticket creation form (admin side) shows a "Predicted Assignment" info row that fires `GET /api/projects/:id/assignment-preview?categoryId=X&priority=Y`
- [ ] New backend endpoint: dry-runs `autoAssignTicket` without saving — returns `{ agentName, agentEmail, assignedVia, matrixName }`
- [ ] Shown as: "Will be assigned to: Sameer Hapani (via Category Rule: Admit card not able to download)"
- [ ] If round-robin pool empty → shows "⚠ No agents available — will fall back"
- [ ] Triggers on change of category or priority selection
- [ ] Does NOT show for student portal (StudentPortal.tsx) — agents-only feature

**Priority:** P2 | **Effort:** 8 SP | **Depends on:** US-ASSIGN-001

---

## Epic 6 — Escalation History & Audit Trail

---

### US-ESC-010 — Full escalation timeline in ticket detail

**As an** agent or admin  
**I want to** see a visual escalation timeline on the ticket detail page  
**So that** I can review every escalation event (who escalated, when, from which level, to which level, and why).

**Acceptance Criteria:**

- [ ] New "Escalation History" section in ticket detail (below the activity log or as a separate tab)
- [ ] Each event shows: timestamp, From Level → To Level, escalated by (name), reason, channel (manual/auto), assigned to (name)
- [ ] Notification-only events (US-ESC-005) appear with a bell icon instead of an arrow
- [ ] SLA breach events appear with a clock icon
- [ ] The current level is marked with a "Current" badge
- [ ] All-time escalation path is shown as a horizontal step-indicator at the top: `L1 (2h) → L2 (4h) → [L3 Current]`
- [ ] Data source: `ticket.escalationHistory[]` — no new backend needed

**Priority:** P1 | **Effort:** 5 SP | **Depends on:** (none)

---

### US-ESC-011 — Escalation matrix coverage report for admins

**As an** admin  
**I want to** see a report showing which project tickets have no escalation matrix assigned  
**So that** I can identify gaps in coverage before SLA breaches go unmanaged.

**Acceptance Criteria:**

- [ ] New page or section in "Escalation Matrix" config area: "Coverage Report"
- [ ] Table: Project Name | Open Tickets | With Matrix | Without Matrix | % Coverage
- [ ] Clicking "Without Matrix" count shows a list of those ticket numbers with category + priority
- [ ] Tickets without a matrix are highlighted in the main escalation matrix list as "X tickets unmatched"
- [ ] Backend: new endpoint `GET /api/escalation-matrix/coverage?projectId=` that aggregates from `Ticket` collection

**Priority:** P2 | **Effort:** 5 SP | **Depends on:** (none)

---

## Epic 7 — Notification-Only Escalation: Email Templates

---

### US-NOTIF-001 — Dedicated email template for escalation warning (vs breach)

**As an** admin  
**I want to** configure different email templates for "SLA Warning" and "SLA Breach/Escalation" events  
**So that** agents receive contextually appropriate messages at different stages.

**Acceptance Criteria:**

- [ ] `emailService.ts` has two separate functions: `sendSLAWarningEmail(ticket, thresholdPercent)` and the existing `sendTicketEscalatedEmail`
- [ ] Warning email subject: `[ACTION REQUIRED] SLA Warning — Ticket #{ticketNumber} at {X}% time consumed`
- [ ] Breach/escalation email subject: `[ESCALATED] Ticket #{ticketNumber} escalated to Level {N}`
- [ ] Both templates are configurable per project (stored as `ProjectEmailTemplate` if that model exists, otherwise hardcoded with variables)
- [ ] Notification preferences (in-app bell + email + WhatsApp) apply consistently for both event types

**Priority:** P2 | **Effort:** 5 SP | **Depends on:** US-ESC-008

---

## Epic 8 — Auto-Escalation Reliability & Monitoring

---

### US-ESC-012 — Auto-escalation job health dashboard widget

**As an** admin  
**I want to** see when the auto-escalation job last ran, how many tickets it processed, and if it errored  
**So that** I know the automation is functioning.

**Acceptance Criteria:**

- [ ] New admin dashboard widget: "Auto-Escalation Monitor"
  - Last run: `DD MMM, HH:MM`
  - Status: `Success` / `Partial` / `Error`
  - Stats: X tickets processed, Y escalated, Z errors
- [ ] Backend: `processAutoEscalation()` result is persisted to a `JobLog` collection (or similar) after each run
- [ ] Endpoint: `GET /api/escalation-matrix/auto-escalate/job-log?limit=10` returns last N runs
- [ ] On error: admin is notified by email (using existing `sendTicketEscalatedEmail` infrastructure or a new ops-alert function)

**Priority:** P2 | **Effort:** 5 SP | **Depends on:** (none)

---

### US-ESC-013 — Auto-escalation: do not re-escalate tickets already being reviewed

**As a** system  
**I want to** skip auto-escalation for tickets actively being updated (last updated < 10 minutes ago)  
**So that** agents aren't interrupted mid-response by an automatic escalation.

**Acceptance Criteria:**

- [ ] `processAutoEscalation` checks `ticket.updatedAt`: if `now - updatedAt < 10 minutes` → skip this ticket (log skip reason)
- [ ] Skip window is configurable per project via `project.configuration.ticketAssignmentSettings.autoEscalateGracePeriodMins` (default 10)
- [ ] Skipped tickets are counted in the job result: `{ processed, escalated, skipped, errors }`
- [ ] Admin can override: matrix-level flag `bypassGracePeriod: boolean` (for critical priority matrices)

**Priority:** P2 | **Effort:** 3 SP | **Depends on:** (none)

---

## Epic 9 — Category Hierarchy in Assignment Config

> The `CategoryAssignmentConfig` system currently requires configuring each category node individually. No "inherit from parent" concept in the UI.

---

### US-ASSIGN-004 — Inherit assignment rule from parent category

**As an** admin  
**I want to** mark an assignment rule as "Inherited" so child categories automatically use their parent's rule  
**So that** I don't have to configure 20 leaf categories individually when they all go to the same agent pool.

**Acceptance Criteria:**

- [ ] Category Config drawer shows a toggle: "Use parent category rule" (only shown for non-root categories)
- [ ] When toggled ON: no `CategoryAssignmentConfig` is saved for this category (the `resolveConfigForCategory` walk-up in `ticketAutoAssignment.ts` already handles this)
- [ ] When toggled ON: drawer shows the inherited rule in read-only mode: "Inheriting from [Parent Name]: by-user → Sameer Hapani"
- [ ] When toggled OFF (or for root categories): shows the existing assignment config form
- [ ] UI correctly detects "no direct config + parent has config" as the Inherited state

**Priority:** P2 | **Effort:** 3 SP | **Depends on:** (none — backend already walks hierarchy)

---

## Summary Table

| ID            | Epic                                              | Priority | Effort (SP) | Backend Ready?             |
| ------------- | ------------------------------------------------- | -------- | ----------- | -------------------------- |
| US-ESC-001    | Category escalation — matrix card badge           | P0       | 3           | Partial (add aggregation)  |
| US-ESC-002    | Category escalation — bind from matrix form       | P0       | 5           | ✅ Full                    |
| US-ESC-003    | Category escalation — inheritance chain in drawer | P1       | 5           | New endpoint needed        |
| US-ESC-004    | Matrix visible in ticket detail sidebar           | P1       | 3           | ✅ Full                    |
| US-ESC-005    | Level type: reassign vs notify                    | P1       | 8           | ❌ Model + service changes |
| US-ESC-006    | Notify-level named user recipients                | P2       | 3           | ❌ Model + service changes |
| US-ESC-007    | SLA % threshold escalation trigger                | P2       | 8           | ❌ Model + service changes |
| US-ESC-008    | Pre-breach SLA warning notifications              | P2       | 13          | ❌ New service + model     |
| US-ESC-009    | In-app SLA countdown on ticket list               | P2       | 5           | ✅ Data available          |
| US-ESC-010    | Full escalation timeline in ticket detail         | P1       | 5           | ✅ Data available          |
| US-ESC-011    | Escalation coverage report                        | P2       | 5           | New endpoint needed        |
| US-ESC-012    | Auto-escalation job health widget                 | P2       | 5           | Partial (add JobLog)       |
| US-ESC-013    | Grace period: skip active tickets                 | P2       | 3           | ❌ Service change          |
| US-ASSIGN-001 | Validate empty round-robin pool                   | P1       | 3           | ❌ Minor backend + UI      |
| US-ASSIGN-002 | Assignment via label in ticket detail             | P2       | 3           | ❌ Add field to schema     |
| US-ASSIGN-003 | Preview assignment before create                  | P2       | 8           | ❌ New dry-run endpoint    |
| US-ASSIGN-004 | Inherit assignment rule from parent               | P2       | 3           | ✅ Backend already walks   |
| US-NOTIF-001  | SLA warning email template                        | P2       | 5           | Partial (new function)     |

**Total: 18 stories | ~106 story points**

---

## Recommended Sprint Plan

### Sprint 1 (Quick wins — backend already ready)

- US-ESC-001 (3 SP) — Matrix card badge
- US-ESC-002 (5 SP) — Bind categories from matrix form
- US-ESC-004 (3 SP) — Matrix in ticket detail sidebar
- US-ESC-010 (5 SP) — Escalation timeline
- US-ASSIGN-004 (3 SP) — Inherit assignment from parent
  **Sprint 1 Total: 19 SP**

### Sprint 2 (High impact, medium effort)

- US-ESC-003 (5 SP) — Inheritance chain in drawer
- US-ASSIGN-001 (3 SP) — Empty pool validation
- US-ESC-009 (5 SP) — SLA countdown on ticket list
- US-ESC-005 (8 SP) — Level type: reassign vs notify
  **Sprint 2 Total: 21 SP**

### Sprint 3 (Advanced features)

- US-ESC-006 (3 SP) — Named notify recipients
- US-ESC-007 (8 SP) — SLA % threshold trigger
- US-ESC-013 (3 SP) — Grace period skip
- US-ASSIGN-002 (3 SP) — Assignment-via label
- US-ESC-012 (5 SP) — Job health widget
  **Sprint 3 Total: 22 SP**

### Sprint 4 (Complex / new infrastructure)

- US-ESC-008 (13 SP) — Pre-breach warnings
- US-NOTIF-001 (5 SP) — Warning email template
- US-ASSIGN-003 (8 SP) — Assignment preview
- US-ESC-011 (5 SP) — Coverage report
  **Sprint 4 Total: 31 SP**
