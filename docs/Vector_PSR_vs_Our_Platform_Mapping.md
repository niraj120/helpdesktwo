# Vector PSR → Our Platform — Mapping, Config & Gap Plan

**Goal:** replicate every Vector PSR business behaviour **our way** (configurable, multi-tenant, no per-client code), map each Vector capability to where it lives (or should live) in our Service Request (SR) module, and give a phased plan for the gaps.

**Legend:** ✅ Present · 🟡 Partial (needs config surface or extension) · ❌ Missing (build) · 🔧 Config exists

**Our stack recap (SR module):**
- Ticket-based SR (`interactionType` = normal/PSR/ISR on `tickets`), per-project `Project.configuration.sr`.
- Backend `modules/service-request/`: `serviceRequestService` (lifecycle), `srWorkflow` (state machine), `createServiceRequest` (orchestrator), `srMasterData` (routing), `srConfigAdmin`, `srForms` (form schemas), `srDuplicateDetection`, `emailTriage`, `callTriage` + `publicIvrController`, `leadCrmSync`, IVR-agent module (`IvrAgentConfig`/`IvrAgentLeave`/round-robin).
- Config surfaces: **SR Settings hub** (General / Routing / Forms / Role Mapping / Clusters), **Query Configuration** (categories/statuses/priorities), **SLA & Escalation** (+ working calendar), **MDM** (sources + user sync), **IVR Agents**, Project settings/branding.
- Cross-cutting: RBAC permissions, `Notification` + `notifySrWatchers`, KB, Feedback forms + public token link, category hierarchy (`hierarchyConfig`), dynamic forms (`FormFieldBuilder`/`FormRenderer` + `conditionEngine`), MDM parent/child lookup, audit (`activityLog` + `changeHistory`).

---

## A. Access, roles, ticket-type gateway

| Vector | Ours — status | Where | Configure / Gap plan |
|---|---|---|---|
| Employee vs Parent access modes; designation-based PSR access; mailbox access grant | ✅ | RBAC permissions (`SR_*`, `EMAIL_TRIAGE_*`, `IVR_*`), project scoping, project-portal routes | Configure per role in **RBAC Setup**. Designation-based auto-grant → use **Role Mapping** (HRMS designation → role) already built. |
| Centre whitelist for parents | 🟡 | User `projects`/`centers`, project scope | Whitelisting is via project/center assignment. If per-centre PSR enablement needed → add `sr.allowedCenters` to project SR config. |
| `choose_ticket_type()` PSR vs ISR gateway | ✅ | SR hub "New Request" (channel/type aware), perms `SR_PSR_CREATE`/`SR_ISR_CREATE` | Gateway = permission-driven; already single entry (New Request wizard). |

## B. Student / parent lookup

| Vector | Ours | Where | Configure / Gap |
|---|---|---|---|
| Student/parent search by name/enrol/mobile; 2-child pick | ✅ | `serviceRequestController.parentLookup`, `searchParentsFromMDM`, MDM cache + parent→child join | Configure MDM source + field mapping in **MDM**. Child-pick supported via parent→children join. |
| Parent-facing flow: id_student from session | ✅ | Project portal SR routes | — |

## C. Outbox / existing-ticket list + duplicate

| Vector | Ours | Where | Configure / Gap |
|---|---|---|---|
| Parent outbox (tickets for student), pagination | ✅ | SR list (`ServiceRequests`) filtered by student/scope; portal SR list | Config: SR list columns (we have PSR list columns). |
| Duplicate PSR block (same student+sub-cat open) + logged + configurable message | 🟡 | `srDuplicateDetection` (blocks dup) | Present. **Gap:** duplicate-block message not admin-editable → add `sr.messages.duplicate` to SR General config; log table → reuse `activityLog`. |
| Pending-feedback prompt on list | 🟡 | Feedback module | Surface a "feedback pending" filter/badge on SR list → small UI add. |

## D. Category → sub → sub-sub + routing (Assign Matrix)

| Vector | Ours | Where | Configure / Gap |
|---|---|---|---|
| 3-level category hierarchy + leaf search prefill | ✅ | `hierarchyConfig` + `HierarchyCategorySelector` | Configure in **Query Configuration / Hierarchy**. |
| Assign matrix: sub-cat + **location** → owner; round-robin/direct | 🟡 | `CategoryAssignmentConfig` (round-robin / by-role / by-user / manual) + `srMasterData.resolveSrRouting`, **SR Routing** tab | Present per sub-category. **Gap = location dimension.** Add optional `location`/`center` key to `CategoryAssignmentConfig` (assignment by sub-cat **+ center**). Configure in SR Routing. |
| CC matrix on new ticket | ✅ | `CategoryAssignmentConfig.ccUsers/ccRoles`, `notifySrWatchers` CC | Configure in SR Routing. |
| Reopen assign matrix (override) | 🟡 | `sr.reopen.assignToUserId/RoleId` (single) | **Gap:** make reopen assignment per sub-cat(+center) matrix, not one global. Extend `CategoryAssignmentConfig` with a `reopen` variant. |

## E. Dynamic fields (conditional)

| Vector | Ours | Where | Configure / Gap |
|---|---|---|---|
| Sub-category dynamic fields, types, required, order | ✅ | `srForms` schemas + `FormFieldBuilder`/`FormRenderer`, **SR Forms** tab | Configure per interactionType/channel/sub-category in SR Forms. |
| Conditional visibility (`field_depend`) | ✅ | `conditionEngine` (show/require on other field value) | Configure in FormFieldBuilder. |
| `show_to_parent` per field; fields at specific **status** transition | 🟡 | Schema fields | **Gap:** add per-field `showToParent` + `visibleAtStatus[]` to form schema + honour in `FormRenderer`/detail. |
| File attachments | ✅ | Ticket attachments + form file fields | — |

## F. Create + auto-close + channel linkage

| Vector | Ours | Where | Configure / Gap |
|---|---|---|---|
| Create PSR → `hd_requests`, unique seq, status Open | ✅ | `createServiceRequest`, `srTicketNumber`, Ticket `interactionType=PSR` | — |
| Auto-closure rule (Leave ≤1 day → Closed, remark) | ❌ | — | **Build:** per-sub-category **auto-close rule** (condition on a field value/threshold → set status Closed + templated remark). Config in SR Routing/Forms. Phase 2. |
| Link to mailbox email (`mailid`) / IVR call (`callid`) on create | ✅ | emailTriage convert, `callTriage`/IVR convert link to ticket | — |
| Double-submit guard | ✅ | idempotent create + client guards | — |

## G. TAT (business hours) + escalation

| Vector | Ours | Where | Configure / Gap |
|---|---|---|---|
| Response/resolution TAT per sub-cat, business hours, holidays per location | ✅🔧 | **SLA & Escalation** + working calendar (holidays), category SLA | Configure SLA + working calendar. Per-location holiday = working calendar per project/center. |
| WIP committed date + revision limits | ✅ | Ticket `wip{committedDate,revisionCount,history}`, `srConfigAdmin` (max revisions/days) | Configure in **SR Settings → General**. |
| Escalation chain up to 5 levels + `parent_tat` | 🟡🔧 | Escalation Matrix module | Present (levels configurable). Verify ≥5 levels + parent-deadline level; extend if capped. |
| CC per escalation level | 🟡 | Escalation Matrix | **Gap:** ensure per-level CC list; add if missing. |
| Recalc TATs when holiday calendar changes | 🟡 | — | **Build:** admin action "recompute open-ticket TATs" job. Phase 2. |
| Source-based TAT (call 4h vs email 24h) | 🟡 | category SLA | **Gap:** allow SLA override by **source/channel** on sub-cat. Add `slaBySource` to category SLA config. |

## H. Status state machine

| Vector transition | Ours | Where | Configure / Gap |
|---|---|---|---|
| Open→WIP→Resolved→Closed; Resolved→ReOpen→WIP→Resolved→Closed | ✅ | `srWorkflow` (`SR_TRANSITIONS`, `getTransition`), `serviceRequestService.changeSrStatus/closeSr/reopenSr` | — |
| **Cancel** (any→Cancel, remark, optional `new_sr_no` link) | 🟡 | statuses configurable (Query Config); `SR_MERGE` perm exists | **Gap:** add "Cancel" status + cancel action with mandatory remark + optional link to replacement SR (reuse merge/link). Phase 1–2. |
| Auto-close (system) | ❌ | — | See F. |
| `display_to_parent`/`parent_watch` on remarks | ✅ | `comment.displayToParent` | Honoured in portal/detail. |
| Change-log per transition | ✅ | `changeHistory` + `activityLog` | — |

## I. Reassign / Delegate

| Vector | Ours | Where | Gap |
|---|---|---|---|
| Reassign / Delegate with history + email; dept/cat change | ✅ | `serviceRequestService.reassign/delegate`, `SR_REASSIGN`/`SR_DELEGATE` | — |
| Update sub-field values on reassign | 🟡 | — | Minor: allow editing form fields during reassign. |

## J. Parent portal (view / follow-up / reopen / not-happy)

| Vector | Ours | Where | Gap |
|---|---|---|---|
| Parent sees own tickets, follow-up comment, reopen | ✅ | Project-portal SR routes, `reopenSr`, comments | — |
| "Not satisfied, not reopening" → notify manager (`not_happy`) | 🟡 | feedback + notify | **Build:** on negative feedback without reopen → escalate/notify manager. Config: feedback-driven trigger. Phase 2. |
| Normal comment → notify agent | ✅ | `notifySrWatchers` | — |

## K. Feedback

| Vector | Ours | Where | Gap |
|---|---|---|---|
| Rating (1–5), satisfied Y/N, text; portal + tokenised no-login link | ✅ | Feedback forms + `PublicFeedbackPage` (token) | Configure feedback form (**FeedbackFormManagement**). |
| Feedback → Closed | ✅ | closure flow | — |

## L. Email → PSR

| Vector | Ours | Where | Gap |
|---|---|---|---|
| Per-mailbox sync, agent-scoped inbox, convert to PSR, temp mapping | ✅ | `ProjectEmailConfig`, `emailProcessingWorker`, **Email Triage** inbox, convert | Configure mailboxes per project; agent inbox scoping present. |
| Reply in thread from ticket (Graph/SMTP), auto-reply, signature | ✅🟡 | `TicketEmailCommunication`, `EMAIL_TRIAGE_RESPOND` | Present; confirm no-reply-from + signature config surfaced. |
| Round-robin email assignment | 🟡 | assignment config | Ensure email intake uses round-robin + skip inactive. |
| Auto-forward per sub-cat (`auto_forward=yes`) | ❌ | — | **Build:** sub-cat option "auto-forward to X". Phase 2. |
| Permanent junk (auto-junk future sender) | ❌ | — | **Build:** sender junk list per project. Phase 2. |

## M. IVR → PSR

| Vector | Ours | Where | Gap |
|---|---|---|---|
| Webhook ingest (Knowlarity/TATA), call store | ✅ | `publicIvrController`, `IvrIngestLog`, `CallIntake` | Configure Smartflo webhook (readiness doc exists). |
| Agent live dashboard, convert to PSR | ✅ | **IVR Calls** page, `callTriage.convert` | — |
| Missed-call round-robin to IVR agents, digit buckets, leaves/availability | ✅ | **IVR Agents** module (new: `IvrAgentConfig`/`IvrAgentLeave`, digit config, availability) | Configure in **IVR Agents**. |
| IVR-WIP with IVR-specific TATs | 🟡 | WIP + SLA | **Gap:** add IVR/source-specific TAT (see G source-based TAT). |
| Linked child PSRs (multiple per call/parent) | 🟡 | linked-ISR linkage exists (`SR_ISR_LINK`) | Extend linkage to multiple PSRs per call (callid grouping). |
| Reassign/delegate calls (shift handover) | 🟡 | — | Add bulk call reassign in IVR Calls. |
| Recording URL | ✅ | `CallIntake.recordingUrl` | Stored (Tata link). |

## N. Background email engine (templates per transition)

| Vector | Ours | Where | Gap |
|---|---|---|---|
| Async email per transition (WIP/Resolved/Closed/ReOpen/reassign), CC, parent-watch | ✅🟡 | `Notification` + `notifySrWatchers`, email templates | Present but **per-transition template editing** is partial. **Build:** configurable SR notification templates per event/status. Phase 2. |

## O. Reports & export

| Vector | Ours | Where | Gap |
|---|---|---|---|
| PSR report (60+ cols, Excel/CSV, sub-fields sheet) | ❌ | SR list export (basic) | **Build:** full PSR export (lifecycle cols + sub-fields sheet). Phase 2. |
| Response-TAT / Resolution-TAT reports | 🟡 | SLA data | **Build:** actual-vs-SLA TAT reports. Phase 2. |
| Delegate/Reassign history report | 🟡 | `activityLog`/`changeHistory` | Build report view. |
| Mailbox report / IVR calls report | 🟡 | email/ivr data | Build exports. |
| User activity report | ✅ | `activityLog` | Configure/view. |
| Dashboards (call summary, SLA, volume) | 🟡 | SR dashboards | Extend SR dashboard widgets. |

## P. Data / archive

| Vector | Ours | Notes |
|---|---|---|
| `hd_requests` + `hd_requests_archive` fallback | N/A | Our tickets are one Mongo collection (indexed, scales). Archive = optional retention policy, not a separate lookup path. No action unless retention required. |
| `tool_type` PSR/ISR | ✅ | `interactionType` discriminator. |
| Config/message tables (`hd_messages`, matrices) | 🟡 | Ours = per-project `Project.configuration.sr` + config models; extend for editable messages/matrices (see B, D, G). |

---

## Gap Plan (prioritised, configurable, multi-tenant)

### Phase 1 — expose config on things we already have (low effort)
1. **Assign matrix + center dimension** — add optional center/location key to `CategoryAssignmentConfig` (routing by sub-cat + center). SR Routing UI.
2. **Reopen assignment matrix** — per sub-cat(+center) reopen assignee (extend assignment config), replacing single global.
3. **Cancel status + action** — add Cancel to workflow + detail action (mandatory remark, optional link to replacement SR via merge).
4. **Editable messages** — duplicate-PSR message + closure/response messages in SR General config.
5. **Per-field `showToParent` + `visibleAtStatus`** in form schema.
6. **Escalation: confirm 5 levels + per-level CC + parent deadline**; extend if capped.
7. **Source/channel-based TAT** override on category SLA (call vs email vs walk-in).

### Phase 2 — build new configurable features (medium)
8. **Auto-close rules** — per sub-cat condition→Closed + templated remark (covers Leave ≤1 day).
9. **SR notification templates** — editable per event/status (WIP/Resolved/Closed/ReOpen/reassign), CC + parent-visible.
10. **Not-happy escalation** — negative feedback w/o reopen → notify manager.
11. **Email auto-forward** (per sub-cat) + **permanent junk** sender list.
12. **IVR: linked child PSRs** per call + **bulk call reassign** (shift handover).
13. **TAT recompute job** on holiday-calendar change.
14. **Reports** — full PSR export (+sub-fields), Response/Resolution TAT, Delegate/Reassign, Mailbox, IVR calls; SR dashboard widgets (call summary/SLA/volume).

### Phase 3 — polish & verification
15. Feedback-pending badge on SR list; reassign-time field edits; retention/archive policy (optional); end-to-end crosswalk sign-off.

---

## Where each thing is configured (admin crosswalk)

| Capability | Config location (target) |
|---|---|
| PSR/ISR enable, WIP limits, messages, auto-close | **SR Settings → General** |
| Category/sub/sub-sub, routing, assign matrix (+center), CC, reopen matrix | **SR Settings → Routing** + **Query Configuration / Hierarchy** |
| Dynamic fields, conditions, show-to-parent, per-status fields | **SR Settings → Forms** |
| Role/designation → SR access | **RBAC Setup** + **SR Settings → Role Mapping** |
| SLA/TAT, escalation levels+CC, working calendar, source-based TAT | **SLA & Escalation** |
| Mailboxes, auto-reply/forward, junk | **Email config** (project) + Email Triage |
| IVR webhook, digit buckets, agents, leaves/availability | **IVR Agents** + MDM/Integrations |
| MDM sources, parent/child lookup, user sync schedule | **MDM** |
| Feedback forms + token link | **Feedback Form Management** |
| Notification templates | **SR Settings → Notifications** (to add) |

---

## Summary
The **core PSR lifecycle, routing, dynamic forms, SLA/escalation, email & IVR intake, feedback, MDM lookup, and audit are already present** in our platform — much of Vector's behaviour is a **configuration** exercise in SR Settings / SLA / MDM / RBAC. The genuine **build gaps** are: auto-close rules, editable notification templates, source-based TAT, not-happy escalation, email auto-forward/junk, IVR linked-child + bulk-reassign, and the full report/export set. All are designed here to be **per-project configurable** (no client-specific code), consistent with our config-driven architecture.

_Document: analysis + plan. Not a client deliverable._
