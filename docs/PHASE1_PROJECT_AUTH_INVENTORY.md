# Phase 1 — Project Authorization: Inventory & Progress

Effective-project rule (confirmed): **union of `User.projects` + `Role.projects`**.
Already correctly implemented in `utils/projectScope.ts` (`getAccessibleProjectIds`)
— no change needed there. The gap was that the *guard* using it was applied to
only 3 routes. This tracks closing that gap.

## Done in this pass

| Area | File | Change |
|---|---|---|
| Secrets (Phase 0) | `config/index.ts`, `config/database.ts`, `.env.example` | fail-fast on missing/weak secrets; removed hardcoded Mongo cred; untracked `.env.production.server` |
| Sockets | `socket/socketHandlers.ts` | reject missing/invalid tokens; resolve per-socket project scope; authorize every room join (`project-tickets`, `all-tickets`→super-admin only, `ticket`→resource's own project, `project-config`) |
| SMS config | `routes/smsConfig.ts` | was **fully unauthenticated** → auth + `PROJECT_MANAGE_SETTINGS` + `requireProjectAccess` |
| WhatsApp config | `routes/whatsappConfig.ts` | added `requireProjectAccess` (had auth+perm) |
| Email config | `routes/emailConfig.ts` | added `requireProjectAccess` |
| Project email configs | `routes/projectEmailConfigRoutes.ts` | added permission + `requireProjectAccess` (had auth only) |
| Hierarchy config | `routes/hierarchyConfig.ts` | added `requireProjectAccess` to 6 write routes (left public form GETs) |
| Categories | `routes/categories.ts` | guarded `POST /project/:projectId` create |
| Statuses | `routes/statuses.ts` | guarded `POST /project/:projectId` + reorder |

All changes type-check clean.

## The three tiers (why the guard isn't one-size-fits-all)

Reading the routes showed `requireProjectAccess('projectId')` is only correct for
one shape. Three distinct cases:

- **Tier A — clean `:projectId` write route.** Add `requireProjectAccess('projectId')`
  after the permission check. Safe, mechanical. *(Most of the "done" list.)*
- **Tier B — public read (form/dropdown).** No `authMiddleware` on purpose; student
  forms fetch category trees / statuses without login. **Leave untouched** — adding
  the guard both breaks forms and 403s (no `req.user`).
- **Tier C — resource `:id` mutation** (`/:categoryId`, `/:statusId`, calendar `/:id`).
  The param is a *resource* id, not a project id. `requireProjectAccess('id')` would
  wrongly treat it as a project id. These need **resource-owns-project**: load the
  record, read its `.project`, check `canAccessProject`. This is a **controller-level**
  change, not route middleware.

## Remaining work

### Tier A — still to guard (clean `:projectId` writes)
Read each, guard the write routes, leave any public reads:

- [ ] `routes/departments.ts`
- [ ] `routes/assetCategories.ts`
- [ ] `routes/feedbackForm.ts`
- [ ] `routes/feedbackResponse.ts`
- [ ] `routes/offlineModule.ts`
- [ ] `routes/knowledgeBase.ts`
- [ ] `routes/faqRoutes.ts`
- [ ] `routes/approvals.ts`

Severity: **medium** — master data (categories, departments, statuses, FAQs),
not credentials. Cross-tenant write risk, but no secret exposure.

### Tier C — resource-owns-project (controller changes)
Every `/:categoryId`, `/:statusId`, `/:id`-of-a-resource mutation, plus the same
pattern in tickets/assets/reports. Approach: a small reusable helper
`requireResourceProject(model, param, projectField='project')` that loads the doc
and authorizes its own project, OR an in-controller check. Larger surface, higher
regression risk — deserves its own sub-phase with tests.

Severity: **high for tickets/assets** (real data), **medium for master-data configs**.

## Update — Tier A complete + Tier C started

**Tier A: DONE** (all type-check clean). Added the project guard to every clean
`:projectId` write and every body-`projectId` create:
departments, offlineModule (all routes), assetCategories, faqRoutes,
feedbackForm, feedbackResponse (admin reads), approvals, knowledgeBase
(+ KB categories/subcategories creates). Verified each create controller reads
`req.body.projectId` so the guard matches.

**Canonical guard enhanced:** `requireProjectAccess` now reads the project id from
`params → query → body`, so one guard covers path-param routes and body creates.

**Tier C helper: BUILT** — `requireResourceProject(model, param, projectField='projectId')`
in `middleware/requireProjectAccess.ts`. Loads the record, reads its own project,
authorizes that. Wired to the highest-traffic master-data resources:
- `statuses` — PUT/DELETE `/:statusId`
- `departments` — PUT/DELETE `/:id`
- `faqRoutes` — PUT/DELETE `/:id`
- `categories` — PUT/DELETE `/:categoryId` + sub-config writes (assignment/sla/escalation)

### Tier C — DONE (all wired, type-check clean)
- [x] `feedbackForm` — PUT/PATCH/DELETE `/:id` (`FeedbackForm`)
- [x] `approvals` — GET/PUT/DELETE `/:id` + `/workflows/:id` (`ApprovalWorkflow`)
- [x] `knowledgeBase` — `/:id`, `/categories/:id`, `/subcategories/:id`
      (`KnowledgeBaseArticle`, `KBCategory`, `KBSubcategory`)
- [x] `workingCalendar` — all `/:id` routes + `/project/:projectId` reads + body create (`WorkingCalendar`)
- [x] **tickets** — all ~35 `/:id` routes guarded with `requireResourceProject(Ticket,"id","project")`
      (ticket controllers scoped only the LIST view; per-id ops were unguarded)
- [x] **assets** — `/:id` GET/PUT/DELETE + body create (`Asset`); coexists with `enforceAssetProjectScope`

### Verification — DONE
`tests/projectAccess.test.ts` (jest, no DB) — 10/10 pass. Proves for both guards:
own-project allow, other-project 403, super-admin bypass, body-project id, custom
`project` field (tickets), and 404 on missing resource. Added `jest.config.js`
(ts-jest) so `npm test` runs unit tests without needing Mongo.

### Also worth doing (consolidation)
Two `requireProjectAccess` implementations exist: the union-based one in
`middleware/requireProjectAccess.ts` (correct, used here) and a **role-only** one
in `middleware/projectScope.ts` (misses `User.projects`). Plus `enforceAssetProjectScope`.
Consolidate to the union-based guard to satisfy the checklist's "one effective-
project rule everywhere."

## Two known follow-ups
1. Some authenticated **read** routes (e.g. `statuses GET /:statusId`, category
   sub-config GETs) still lack the resource guard — reads leak config, lower
   severity than writes. Wire `requireResourceProject` to them in a cleanup pass.
2. Frontend `all-tickets` room now super-admin only (see below).

## Known follow-up (frontend)
`all-tickets` socket room is now super-admin-only. Multi-project non-admins lose
*live* updates on a combined list view (data still correct on refresh). Fix later:
frontend joins per-project `project-tickets-*` rooms based on accessible projects
instead of `all-tickets`.
