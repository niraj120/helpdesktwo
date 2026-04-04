# Category-Based Ticket Assignment — User Stories

> **Feature**: Replace the current flat condition-rule system with a first-class
> per-category assignment engine supporting multiple modes, per-category SLA,
> per-category escalation, and agent availability awareness.
>
> **Current state**: Assignment is baked into `Project.configuration.ticketAssignmentSettings.conditionRules`
> (a plain array of `{categories: string[], assignToAgents: string[]}`).
> `AutoAssignment.ts`, `autoAssignmentController.ts` exist but are **empty**.
>
> **Approach**: Phase 0 → Phase 3, each phase independently deployable.

---

## Roles Referenced

| Role | Description |
|---|---|
| **Super Admin** | Full system access; configures project-level settings |
| **Project Admin** | Manages one project; can configure categories and assignment rules |
| **Center Manager** | Manages a center; may have manual-assignment permissions |
| **Agent (L1/L2/L3)** | Handles tickets |
| **Student** | Submits tickets via online/offline portal |

---

## EPIC 1 — Per-Category Assignment Engine (Phase 0)

> **Goal**: Tickets are automatically assigned to the right agent based on the category
> selected by the student. The system records how and why a ticket was assigned.

---

### US-001 · Define assignment config per category

**As a** Project Admin,
**I want to** attach an assignment configuration to each ticket category,
**So that** tickets in different categories are routed to the right pool of agents automatically.

**Acceptance Criteria**
- [ ] A new `CategoryAssignmentConfig` document can be created/updated for any `Category` in the project.
- [ ] Supported assignment modes: `round-robin`, `by-role`, `by-user`, `manual`.
- [ ] Each config stores: `mode`, `agentPool: ObjectId[]` (for `by-user`), `rolePool: ObjectId[]` (for `by-role`), `isActive: boolean`.
- [ ] Config is scoped to `(categoryId, projectId)` — one config per category per project.
- [ ] If no config exists for a category, the engine falls back to the project-level `ticketAssignmentSettings`.
- [ ] API: `GET /api/categories/:categoryId/assignment-config` returns the config or `null`.
- [ ] API: `PUT /api/categories/:categoryId/assignment-config` upserts the config (requires `MASTER_DATA_MANAGE_CATEGORIES` permission).

---

### US-002 · Round-robin assignment by category

**As a** Project Admin,
**I want to** configure a category to use round-robin assignment from a specific agent pool,
**So that** tickets in that category are distributed evenly across those agents.

**Acceptance Criteria**
- [ ] When `mode = round-robin` and `agentPool` is set, the system picks the next agent in the pool using the last-assigned logic (same as current project-level round-robin).
- [ ] If all agents in the pool are inactive, fall back to the project-level round-robin pool.
- [ ] The agent pool can include agents from any role that `isAgent = true` and is mapped to the project.
- [ ] Admin can add/remove agents from the pool via the UI.

---

### US-003 · By-role assignment by category

**As a** Project Admin,
**I want to** configure a category so tickets are automatically assigned to all active agents in a specific role,
**So that** e.g. "Visa" category tickets always go to L2 agents.

**Acceptance Criteria**
- [ ] When `mode = by-role` and `rolePool` is set, the engine queries all active users with any of those roles who are mapped to the project, then applies round-robin over that set.
- [ ] Role pool can have multiple roles (e.g., [L2 Agent, L3 Agent]).
- [ ] Existing `isAgent: true` flag on `Role` model used to validate the selected roles.
- [ ] If no active users found in the role(s), fall back to project-level round-robin.

---

### US-004 · By-user (direct) assignment by category

**As a** Project Admin,
**I want to** pin a category to a specific named agent,
**So that** e.g. "Fee Refund" tickets always go to the same specialist.

**Acceptance Criteria**
- [ ] When `mode = by-user` and `agentPool` has exactly one entry, that user always gets assigned if they are active.
- [ ] When `agentPool` has multiple users, round-robin over that explicit list.
- [ ] If the pinned user is inactive (deactivated account), fall back gracefully per US-010.

---

### US-005 · Record how a ticket was assigned (`assignedVia`)

**As a** System,
**I want to** store on every ticket how it was assigned,
**So that** admins can audit and report on assignment methods.

**Acceptance Criteria**
- [ ] `Ticket` model gains field: `assignedVia: 'manual' | 'round-robin' | 'by-role' | 'by-user' | 'condition-based' | 'fallback' | null`.
- [ ] `Ticket` model gains field: `assignmentAttempts: number` (default `0`) — incremented each time the engine tries to find an agent.
- [ ] When auto-assignment succeeds via category config → `assignedVia` set to the mode used (`round-robin`, `by-role`, `by-user`).
- [ ] When falling back to project-level → `assignedVia = 'fallback'`.
- [ ] When manually assigned by a user → `assignedVia = 'manual'`.
- [ ] These fields are included in all ticket GET responses.

---

### US-006 · Auto-assignment works for email-sourced tickets

**As a** System,
**I want to** apply category-based assignment when a ticket is created from an inbound email,
**So that** email tickets get the same smart routing as portal tickets.

**Acceptance Criteria**
- [ ] `ticketFromEmail.ts` resolves the category `ObjectId` from `categoryHierarchy.level1` before calling `autoAssignTicket()`.
- [ ] `autoAssignTicket()` receives `categoryId: ObjectId | undefined` (not the raw string).
- [ ] `assignedVia` and `assignmentAttempts` are written to the ticket document.
- [ ] Agent receives the assigned-email notification as before.

---

### US-007 · Manual assignment mode per category

**As a** Project Admin,
**I want to** mark certain categories as "manual only",
**So that** tickets in sensitive categories (e.g., Complaints) are never auto-assigned and must be reviewed first.

**Acceptance Criteria**
- [ ] When `mode = manual`, the engine does not attempt auto-assignment for tickets in this category.
- [ ] Ticket is created unassigned (`assignedTo = null`), `assignedVia = null`.
- [ ] Admin dashboard highlights unassigned tickets.
- [ ] This does NOT override the project-level fallback — if the category is `manual`, no fallback either.

---

### US-008 · Category assignment config is inherited by child categories

**As a** Project Admin,
**I want** the assignment config of a parent category (Level 1) to automatically apply to child categories (Level 2/3/4) unless overridden,
**So that** I don't have to duplicate config for every sub-category.

**Acceptance Criteria**
- [ ] The assignment engine walks up `hierarchyPath` from the ticket's deepest category level to find the nearest config.
- [ ] If Level 3 has its own config, use it; else check Level 2, then Level 1, then project-level.
- [ ] The UI clearly shows whether a child category's config is "inherited" or explicitly set.

---

### US-009 · Activate / deactivate category assignment config

**As a** Project Admin,
**I want to** be able to disable a category-specific assignment config without deleting it,
**So that** I can temporarily revert to the project-level rule during testing.

**Acceptance Criteria**
- [ ] `isActive: false` on a `CategoryAssignmentConfig` causes the engine to skip that config and use the fallback.
- [ ] The UI shows a toggle per category with "Category rule active / inactive".

---

### US-010 · Fallback chain when assignment fails

**As a** System,
**I want to** have a defined fallback sequence when no agent can be found,
**So that** no ticket ever silently drops without any assignment attempt.

**Acceptance Criteria**
- [ ] If category-config-based assignment fails (empty pool, all inactive) → try project-level `ticketAssignmentSettings`.
- [ ] If project-level also fails → ticket is created unassigned, `assignedVia = null`.
- [ ] Each fallback step increments `assignmentAttempts`.
- [ ] A console warning is logged: `[AutoAssign] Category config failed for <categoryId>, falling back to project-level`.

---

## EPIC 2 — Category Assignment Settings UI (Phase 1)

> **Goal**: Admins can configure assignment rules per category from the project settings
> panel without editing raw JSON.

---

### US-011 · View per-category assignment settings in project management

**As a** Project Admin,
**I want to** see a list of all categories for my project alongside their current assignment mode,
**So that** I have a single overview of how tickets will be routed.

**Acceptance Criteria**
- [ ] In **Project Management → Edit Project → Ticket Portal tab**, a new "Category Assignment" section lists all active Level-1 categories.
- [ ] Each row shows: category name, color badge, current mode (`Round Robin` / `By Role` / `By User` / `Manual` / `Inherited` / `Not configured`), and an Edit button.
- [ ] "Inherited" is shown when the category has no explicit config but a parent does.
- [ ] "Not configured" falls back to project-level rule.

---

### US-012 · Configure assignment for a specific category via drawer

**As a** Project Admin,
**I want to** click a category and edit its assignment config in a side drawer,
**So that** I can configure rules without leaving the page.

**Acceptance Criteria**
- [ ] Clicking Edit opens a right-side drawer showing:
  - Category name + hierarchy breadcrumb.
  - Assignment mode selector (radio: Round Robin / By Role / By User / Manual / Use Project Default).
  - Conditionally visible:
    - `By Role`: Multi-select of roles where `isAgent = true` and mapped to project.
    - `By User`: Multi-select of active agents mapped to project; search by name.
    - `Round Robin`: Multi-select of agents OR leave empty to use all eligible agents.
  - Active/inactive toggle.
  - Save and Cancel buttons.
- [ ] On Save, calls `PUT /api/categories/:categoryId/assignment-config`.
- [ ] Shows success toast or inline error.

---

### US-013 · Replace legacy condition-rules builder in AddProjectForm

**As a** Project Admin,
**I want** the old flat "condition rules" list removed from the project form,
**So that** I'm not confused by two overlapping ways to configure category routing.

**Acceptance Criteria**
- [ ] The `conditionRules` block in `AddProjectForm.tsx` Ticket Portal tab is replaced by a link: "Configure category-level assignment rules →" that opens the Category Assignment page.
- [ ] Existing projects with `conditionRules` data continue to work via the `condition-based` fallback in the assignment engine (no data migration needed; old rules are read as `condition-based` mode).
- [ ] No regression in existing category-based assignments for live projects.

---

### US-014 · Assignment preview when selecting category on ticket submission

**As a** Student submitting a ticket,
**I want to** see a small note like "Will be handled by: L2 Support Team",
**So that** I know my ticket will reach the right person.

**Acceptance Criteria**
- [ ] Calling `GET /api/categories/:categoryId/assignment-preview` (no auth required, returns only the role name / "Assigned automatically") gives a safe public preview.
- [ ] `AuthenticatedStudentSubmitTicket.tsx` displays this note below the Category field after selection.
- [ ] The note only shows if the category has an active config with `by-role` mode (shows role name). For other modes show "Will be assigned automatically".
- [ ] Does NOT reveal specific agent names.

---

### US-015 · Show `assignedVia` on ticket detail page

**As an** Agent or Admin,
**I want to** see how a ticket was assigned on the ticket detail view,
**So that** I can understand why I received it.

**Acceptance Criteria**
- [ ] In `AgentTicketDetail.tsx`, below the "Assigned To" field, show a small badge:
  - `Round Robin` (blue) / `By Role` (purple) / `By User` (green) / `Manual` (gray) / `Fallback` (orange) / `Email Auto` (teal).
- [ ] Badge only visible to agents and admins, not to students.
- [ ] `assignedVia` value comes from the ticket GET response (already returned).

---

## EPIC 3 — Per-Category SLA (Phase 2)

> **Goal**: SLA response and resolution times can be overridden at the category level,
> so high-priority categories (e.g., "Emergency Admission") get tighter deadlines
> independent of the ticket's priority level.

---

### US-016 · Define SLA override for a category

**As a** Project Admin,
**I want to** set custom response and resolution times for a specific category,
**So that** "Emergency Admission" tickets always have a 2-hour resolution target regardless of their priority.

**Acceptance Criteria**
- [ ] New model `CategorySLA` with fields: `categoryId`, `projectId`, `responseTime {value, unit}`, `resolutionTime {value, unit}`, `isActive`.
- [ ] API: `GET/PUT /api/categories/:categoryId/sla` (requires `MASTER_DATA_MANAGE_CATEGORIES`).
- [ ] CategorySLA values override the priority-based `SLARule` for tickets in that category.
- [ ] If no `CategorySLA` exists, fall back to `SLARule` by priority (existing behaviour unchanged).

---

### US-017 · SLA is initialized using category override when available

**As a** System,
**I want to** use the category-level SLA when creating `SLATracking` for a new ticket,
**So that** the correct deadlines are set from ticket creation.

**Acceptance Criteria**
- [ ] `slaHelperService.initializeSLATracking()` first checks `CategorySLA` for `categoryHierarchy.level1`.
- [ ] If found and active → use its `responseTime` and `resolutionTime`.
- [ ] If not found → use `SLARule` by priority (existing logic).
- [ ] `Ticket.slaSource` field added: `'category' | 'priority' | 'default'` — set accordingly.
- [ ] `SLATracking` document stores `slaSource` for reporting.

---

### US-018 · View and configure category SLA in settings UI

**As a** Project Admin,
**I want to** see and edit the SLA override for a category in the same drawer where I configure assignment,
**So that** all category-specific settings are in one place.

**Acceptance Criteria**
- [ ] The Category Assignment drawer (US-012) gets a second tab: "SLA Override".
- [ ] Tab shows: Response Time (input + unit dropdown), Resolution Time (input + unit dropdown), Active toggle, and the fallback label "Uses priority SLA if not set".
- [ ] Save calls `PUT /api/categories/:categoryId/sla`.
- [ ] A visual indicator (e.g., a clock icon) on the category list row shows whether a custom SLA is active.

---

### US-019 · SLA timer on ticket detail reflects the correct source

**As an** Agent,
**I want to** see whether the SLA countdown is driven by the category rule or the priority rule,
**So that** I understand why a ticket has an unusually tight deadline.

**Acceptance Criteria**
- [ ] The existing `DualSLATimer` component receives `slaSource` from the ticket.
- [ ] When `slaSource = 'category'`, the timer label shows "Category SLA" instead of "Priority SLA".
- [ ] Tooltip on the timer label explains: "SLA set by category: [Category Name]" or "SLA set by priority: [Priority Name]".

---

## EPIC 4 — Per-Category Escalation Matrix (Phase 3)

> **Goal**: Different categories can escalate through different role chains, independent
> of the project-level escalation matrix.

---

### US-020 · Assign an escalation matrix to a category

**As a** Project Admin,
**I want to** link a specific escalation matrix to a category,
**So that** "Technical" tickets escalate through L1→L2→L3 while "Admission" tickets escalate through Counselor→Senior Counselor.

**Acceptance Criteria**
- [ ] `Category` document or a new `CategoryEscalationConfig` stores: `categoryId`, `projectId`, `escalationMatrixId` (ref to `EscalationMatrix`), `isActive`.
- [ ] API: `GET/PUT /api/categories/:categoryId/escalation-config`.
- [ ] `escalationMatrixService.getMatrixByProjectId()` is extended to accept optional `categoryId`; when supplied, tries category-scoped matrix first, then falls back to project-level.
- [ ] `autoEscalationService` passes `categoryId` through to `getMatrixByProjectId()`.

---

### US-021 · Category escalation fallback to project matrix

**As a** System,
**I want to** fall back to the project-level escalation matrix when no category-specific matrix is configured,
**So that** tickets always have an escalation path even if the category setting is missing.

**Acceptance Criteria**
- [ ] Lookup order: category-specific matrix → project-level matrix → no matrix (log warning).
- [ ] No change to escalation behaviour for categories without explicit config.
- [ ] Existing escalation tests are unaffected.

---

### US-022 · View and configure escalation matrix per category

**As a** Project Admin,
**I want to** select an escalation matrix for a category in the category settings drawer,
**So that** I can assign the correct escalation path without leaving the page.

**Acceptance Criteria**
- [ ] Category drawer gets a third tab: "Escalation".
- [ ] Tab shows: Escalation Matrix dropdown (lists all active matrices for the project), Active toggle, and "Uses project-level matrix if not set" fallback label.
- [ ] Save calls `PUT /api/categories/:categoryId/escalation-config`.
- [ ] Escalation matrix preview (level names + roles) shown read-only below the dropdown.

---

## EPIC 5 — Agent Availability & Capacity (Phase 3 extended)

> **Goal**: The assignment engine respects agent working hours and ticket load,
> so tickets are not assigned to unavailable or overloaded agents.

---

### US-023 · Agent can mark themselves as unavailable

**As an** Agent,
**I want to** set my status to "Unavailable" (e.g., on leave or in training),
**So that** new tickets are not auto-assigned to me while I'm away.

**Acceptance Criteria**
- [ ] New `AgentAvailabilityState` model: `userId`, `projectId`, `status: 'available' | 'unavailable' | 'busy'`, `reason?`, `until?: Date`.
- [ ] Agent can toggle status from a header button; optionally set an "until" date.
- [ ] Assignment engine skips agents with `status != 'available'` when selecting from the pool.
- [ ] API: `PUT /api/agents/availability` (auth required, own record only).

---

### US-024 · Admin can set max concurrent tickets per agent (capacity)

**As a** Project Admin,
**I want to** set a maximum number of open tickets per agent,
**So that** the system doesn't overload any single agent.

**Acceptance Criteria**
- [ ] `MaxConcurrentTickets` config stored on the `Role` (or `Project.ticketAssignmentSettings.maxConcurrentPerAgent`).
- [ ] Assignment engine counts each candidate agent's currently `open` / `in-progress` tickets.
- [ ] Agents at or above the cap are skipped; if all agents are at cap, assignment falls back.
- [ ] Admin UI shows current load per agent (open ticket count) in the agent selection list.

---

## Non-Functional / Cross-Cutting Stories

---

### US-025 · Backward compatibility — existing condition-based rules continue to work

**As a** System,
**I want to** continue reading legacy `conditionRules` from `Project.ticketAssignmentSettings`,
**So that** existing projects don't break when the new engine is deployed.

**Acceptance Criteria**
- [ ] `autoAssignTicket()` checks `CategoryAssignmentConfig` first; if none found AND `assignmentType = 'condition-based'`, runs existing legacy logic.
- [ ] No database migration required for existing projects.
- [ ] Legacy mode is logged: `[AutoAssign] Using legacy condition-based rule for project <id>`.

---

### US-026 · All assignment events are audited

**As a** Super Admin,
**I want to** see a log of every automatic assignment attempt,
**So that** I can investigate mis-routing complaints.

**Acceptance Criteria**
- [ ] Ticket activity log already exists (`ticket.activityLog`); a new entry is added on auto-assign: `{ action: 'auto_assigned', field: 'assignedTo', newValue: agentId, description: 'Auto-assigned via <mode> (Category: <name>)' }`.
- [ ] `assignedVia` and `assignmentAttempts` are visible in the ticket export/report.

---

### US-027 · API responses are consistent

**As a** Frontend developer,
**I want** all new category config endpoints to follow the existing response shape `{ success, data, message }`,
**So that** the frontend API layer doesn't need special-casing.

**Acceptance Criteria**
- [ ] All new controllers return `{ success: true, data: <payload> }` on success.
- [ ] Validation errors return `{ success: false, error: <string>, details?: [...] }` with HTTP 400.
- [ ] Auth errors return HTTP 401/403 in the same shape used project-wide.

---

## Story Size Estimates

| Story | Phase | Complexity | Backend | Frontend |
|---|---|---|---|---|
| US-001 | 0 | M | New model + controller + routes | — |
| US-002 | 0 | S | Engine extension | — |
| US-003 | 0 | S | Engine extension | — |
| US-004 | 0 | S | Engine extension | — |
| US-005 | 0 | S | Ticket model fields | — |
| US-006 | 0 | S | ticketFromEmail change | — |
| US-007 | 0 | XS | Engine skip path | — |
| US-008 | 0 | M | Hierarchy walk logic | — |
| US-009 | 0 | XS | isActive flag + engine check | — |
| US-010 | 0 | S | Fallback chain in engine | — |
| US-011 | 1 | M | — | Category list section |
| US-012 | 1 | L | — | Drawer + form + API calls |
| US-013 | 1 | S | — | Remove old UI block |
| US-014 | 1 | M | Preview API endpoint | Student form change |
| US-015 | 1 | S | — | Badge component |
| US-016 | 2 | M | CategorySLA model + API | — |
| US-017 | 2 | M | slaHelperService + slaSource field | — |
| US-018 | 2 | M | — | Drawer second tab |
| US-019 | 2 | S | — | Timer label tweak |
| US-020 | 3 | M | CategoryEscalationConfig + service | — |
| US-021 | 3 | S | Fallback in escalation service | — |
| US-022 | 3 | M | — | Drawer third tab |
| US-023 | 3 | L | AgentAvailabilityState model + API | Header toggle |
| US-024 | 3 | L | Capacity check in engine | Admin UI |
| US-025 | 0 | S | Legacy-mode guard in engine | — |
| US-026 | 0 | XS | activityLog entry | — |
| US-027 | All | XS | Consistent shape check | — |

---

## Development Order (Suggested)

```
Phase 0 (engine — backend only, no UI changes visible to users)
  US-001 → US-005 → US-002 → US-003 → US-004 → US-007
  → US-010 → US-008 → US-009 → US-006 → US-025 → US-026

Phase 1 (config UI + ticket detail badge)
  US-011 → US-012 → US-013 → US-015 → US-014

Phase 2 (per-category SLA)
  US-016 → US-017 → US-018 → US-019

Phase 3 (escalation + availability)
  US-020 → US-021 → US-022 → US-023 → US-024
```

---

*Last updated: 2026-04-01*
