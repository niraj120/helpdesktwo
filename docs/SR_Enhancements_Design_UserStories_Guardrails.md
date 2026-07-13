# SR Enhancements — Design, User Stories & Anti-Regression Guardrails

Single source for developing the Vector-parity gaps in our Service Request (SR) module **our way** (configurable, multi-tenant, no client-specific code).

- **Part A — Implementation & Configurability Plan:** which module/file owns each feature, where config is stored, hook points, UI surface, build order.
- **Part B — Detailed User Stories:** backend + frontend stories with acceptance.
- **Part C — Do-Not-Regress vs Vector:** what we already do better + Vector anti-patterns to avoid + golden rules.

> Source analysis: `Vector_PSR_vs_Our_Platform_Mapping.md`.
> Legend: ✅ Present · 🟡 Partial · ❌ Missing · 🔧 Config exists.

---

# PART A — Implementation & Configurability Plan

## Module ownership map (where things live)

| Concern | Backend owner | Frontend / config UI |
|---|---|---|
| SR lifecycle / status | `modules/service-request/serviceRequestService.ts` + `srWorkflow.ts` | `components/sr/SrLifecyclePanel.tsx`, `AgentTicketDetail` |
| Create + auto rules | `modules/service-request/createServiceRequest.ts` | New Request wizard |
| Routing / assignment | `srMasterData.ts` + `utils/ticketAutoAssignment.ts` + `models/ticket-module/CategoryAssignmentConfig.ts` | **SR Settings → Routing** (`ServiceRequestRouting.tsx`) |
| Per-project SR config | `Project.configuration.sr` + `srConfigAdmin.ts` | **SR Settings → General** (`ServiceRequestSettings.tsx`) |
| Dynamic forms | `srForms.ts` + `utils/conditionEngine` | **SR Settings → Forms** + `FormFieldBuilder`/`FormRenderer` |
| SLA / TAT / escalation | SLA module + working calendar + `EscalationMatrix` | **SLA & Escalation** |
| Email intake | `emailTriage.ts` + `emailProcessingWorker.ts` + `ProjectEmailConfig` | Email config + **Email Triage** |
| IVR | `callTriage.ts` + `publicIvrController.ts` + IVR-agent module | **IVR Agents** + **IVR Calls** |
| Notifications | `Notification` + `notifySrWatchers` | **SR Settings → Notifications** (new) |
| MDM / lookup / user-sync | `mdmService`/`hrmsService` + `mdmUserSync` | **MDM** config |
| Feedback | Feedback forms + `PublicFeedbackPage` | Feedback Form Management |

## Phase 1 — expose config on existing logic
1. **Assign matrix + center** — `CategoryAssignmentConfig.centerId` (null=default); resolve most-specific (category+center → category → project). Logic in `srMasterData.resolveSrRouting`/`ticketAutoAssignment`. UI: SR Routing center picker. **M**
2. **Reopen matrix** — `CategoryAssignmentConfig.reopen{mode,pools,cc}`; `resolveReopenAssignee` uses it, falls back to `sr.reopen`. UI: SR Routing. **M**
3. **Cancel status** — `srWorkflow.SR_STATUS.CANCEL` + `Any→Cancel`; `Ticket.cancel{reason,replacementSrId,by,at}`; `cancelSr()`; perm `SR_CANCEL`. UI: `SrLifecyclePanel`. **M**
4. **Editable messages** — `Project.configuration.sr.messages{duplicate,closureDefault,responseDefault}`. UI: SR General. **S**
5. **Field showToParent + visibleAtStatus** — `srForms` field props; `FormRenderer`/detail filter; server enforces on parent reads. UI: `FormFieldBuilder`. **S–M**
6. **Escalation 5 levels + per-level CC** — `EscalationMatrix` level `{assignee,tatHrs,ccUsers,ccRoles}` + parentDeadline. UI: `EscalationMatrixContent`. **S**
7. **Source-based TAT** — category SLA `slaBySource{portal,email,ivr,walk_in:{responseHrs,resolutionHrs}}`; TAT calc keyed on `submissionSource`. UI: category SLA. **M**

## Phase 2 — new configurable features
8. **Auto-close rules** — `CategoryAssignmentConfig.autoClose{enabled,conditions[],remarkTemplate}` via `conditionEngine`; evaluated in `createServiceRequest` → Closed + templated remark. UI: SR Routing rule builder. **M**
9. **Notification templates** — new model `SrNotificationTemplate{projectId,event,subject,body,toParent,cc[]}`; rendered in `notifySrWatchers`/status change; placeholders. UI: **SR Settings → Notifications** (new tab). **M–L**
10. **Not-happy escalation** — `sr.feedback{notifyManagerOnNegative,ratingThreshold}`; feedback handler notifies manager when unsatisfied & not reopened. UI: SR General/Feedback. **S–M**
11. **Email auto-forward + junk** — `CategoryAssignmentConfig.autoForwardTo[]`; `sr.emailJunk.senders[]`; logic in `emailTriage`/`emailProcessingWorker`. UI: SR Routing + Email config. **M**
12. **IVR linked-child PSRs + bulk reassign** — `callTriage.convert` N PSRs per `callid` (typed link); `bulkReassignCalls(callIds[],toUserId)`. UI: IVR Calls. **M**
13. **TAT recompute** — `POST /sr/recompute-tat?projectId` (+ post-calendar trigger); recompute open tickets via working calendar. UI: SLA page button. **S–M**
14. **Reports/exports** — PSR full export (+sub-fields sheet), Response/Resolution-TAT, Delegate/Reassign, Mailbox, IVR; SR dashboard widgets. **L**

## Config storage crosswalk
| Setting | Storage |
|---|---|
| Enable PSR/ISR, WIP limits, messages, auto-close defaults, feedback triggers, email junk | `Project.configuration.sr` (`srConfigAdmin`) |
| Assignment (+center), CC, reopen, auto-close rule, auto-forward | `CategoryAssignmentConfig` (extended) |
| Dynamic fields (+showToParent/visibleAtStatus) | `srForms` schema |
| SLA/TAT (+ per-source), escalation levels/CC, holidays | SLA + `EscalationMatrix` + working calendar |
| Mailboxes | `ProjectEmailConfig` |
| IVR digit buckets, agents, leaves/availability | IVR-agent models |
| Notification templates | `SrNotificationTemplate` (new) |

**Build order:** P1 → #4, #5, #3, #6 (fast wins) → #1, #2, #7. P2 → #8, #10, #9 → #11, #12 → #13, #14.

---

# PART B — Detailed User Stories (Backend + Frontend)

**Conventions:** config in `Project.configuration.sr`/`CategoryAssignmentConfig`/`srForms`/SLA/new models. New perms → `constants/permissions.ts` + seed. Every change: `tsc` clean; UI: `tsc`+build clean; nothing hardcoded per client.

### EPIC 1 — Assignment matrix by Center (+CC)
**US-1.1 (BE)** — per (project, category, **center**) assignment.
- Model `CategoryAssignmentConfig.centerId?` (unique w/ project+category); Service `resolveSrRouting`/`resolveAgentFromConfig` most-specific-first; extend GET/PUT for `centerId`.
- AC: center config used for that center; else category default; else project default; RR cursor per (subcat, center).
**US-1.2 (FE)** — SR Routing center dropdown; edit mode/pools/CC per (subcat, center); “Default (all centers)” edits null row.

### EPIC 2 — Reopen assignment matrix
**US-2.1 (BE)** — `CategoryAssignmentConfig.reopen{mode,agentPool,rolePool,ccUsers,ccRoles}` (+center); `resolveReopenAssignee` uses it → fallback `sr.reopen` → last assignee. AC accordingly.
**US-2.2 (FE)** — SR Routing “Reopen assignment” block; visible when SR reopen enabled.

### EPIC 3 — Cancel status + action
**US-3.1 (BE)** — `SR_STATUS.CANCEL` + `Any→Cancel`; `Ticket.cancel{reason,replacementSrId?,by,at}`; `cancelSr(id,actorId,{reason,replacementSrId})` (reason required, validate replacement, history); perm `SR_CANCEL`.
- AC: cancel sets status+block+history+notify; no reason→400; bad replacement→400, valid→two-way link.
**US-3.2 (FE)** — `SrLifecyclePanel` Cancel button → modal (reason req, optional replacement SR#); gated; chip shows Cancel + link.

### EPIC 4 — Editable messages
**US-4.1 (BE)** — `sr.messages{duplicate,closureDefault,responseDefault}`; `srDuplicateDetection` returns configured message; status change seeds defaults. AC: configured message shown; blank→fallback.
**US-4.2 (FE)** — SR General three textareas w/ placeholder help.

### EPIC 5 — Field show-to-parent + per-status
**US-5.1 (BE)** — schema props `showToParent`, `visibleAtStatus[]`; enforce server-side on parent reads. AC: parent-hidden never returned to parent; status-scoped field only at that status.
**US-5.2 (FE)** — `FormFieldBuilder` toggle + status multiselect; `FormRenderer`/detail filter.

### EPIC 6 — Escalation 5 levels + per-level CC
**US-6.1 (BE)** — level `{level,assignee,tatHrs,ccUsers[],ccRoles[]}` ≥5 + `parentDeadline`; on level TAT breach notify assignee+CC. AC: level CC copied; parent-deadline fires parent notice.
**US-6.2 (FE)** — `EscalationMatrixContent` CC per level; 5 levels; ordering validation.

### EPIC 7 — Source-based TAT
**US-7.1 (BE)** — category SLA `slaBySource{...}`; TAT calc reads `submissionSource` → source SLA → base. AC: IVR→4h, email→24h; missing→base.
**US-7.2 (FE)** — per-source SLA rows on sub-category; blank inherits base.

### EPIC 8 — Auto-close rules
**US-8.1 (BE)** — `CategoryAssignmentConfig.autoClose{enabled,conditions[],remarkTemplate}` (conditionEngine); in `createServiceRequest` after insert → if match set Closed + `autoClose=true` + templated remark + closed notif. AC: matching PSR created Closed w/ remark+history; else Open.
**US-8.2 (FE)** — SR Routing condition builder (reuse conditionEngine UI) + remark template + preview.

### EPIC 9 — Notification templates
**US-9.1 (BE)** — model `SrNotificationTemplate{projectId,event,subject,body,toParent,cc[]}`; events created/wip/resolved/closed/reopen/reassign/delegate/cancel; placeholders; `notifySrWatchers` renders per event; CRUD `/sr/notification-templates`; perm `SR_CONFIG_MANAGE`; fallback to built-in default.
- AC: resolved template rendered+sent w/ placeholders; toParent emails parent + CC; no template→default (no crash).
**US-9.2 (FE)** — SR Settings **Notifications** tab: list events, edit subject/body (placeholder helper), toParent toggle, CC, test-render preview.

### EPIC 10 — Not-happy escalation
**US-10.1 (BE)** — `sr.feedback{notifyManagerOnNegative,ratingThreshold}`; feedback submit → if (not satisfied OR rating≤threshold) AND not reopened → notify reportingManager/L1. AC: fires once at threshold; reopen path no double-notify.
**US-10.2 (FE)** — SR General/Feedback enable+threshold.

### EPIC 11 — Email auto-forward + permanent junk
**US-11.1 (BE)** — `CategoryAssignmentConfig.autoForwardTo[]`; `emailTriage` convert forwards original + logs.
**US-11.2 (BE)** — `sr.emailJunk.senders[]`; `emailProcessingWorker` ingest auto-junks listed senders; add/remove endpoint. AC: junked sender future mail auto-junk + excluded.
**US-11.3 (FE)** — Email config auto-forward per sub-cat + junk list + “mark permanent junk” action.

### EPIC 12 — IVR linked-child PSRs + bulk reassign
**US-12.1 (BE)** — `callTriage.convert` N PSRs per `callid`, typed link (reuse `linkedIsr`/parent). AC: multiple PSRs linked to call, shown together.
**US-12.2 (BE)** — `bulkReassignCalls(callIds[],toUserId)`; perm `IVR_TRIAGE_CONVERT`/`IVR_AGENT_MANAGE`; history. AC: batch moves + history.
**US-12.3 (FE)** — IVR Calls: “Raise another PSR” on open call; multi-select→reassign; linked PSRs shown.

### EPIC 13 — TAT recompute on calendar change
**US-13.1 (BE)** — `POST /sr/recompute-tat?projectId` (+ optional post-calendar trigger); recompute open tickets’ TAT via working calendar. AC: TAT shifts after holiday edit; closed untouched.
**US-13.2 (FE)** — SLA page “Recompute open TATs” + result count.

### EPIC 14 — Reports & exports
**US-14.1 (BE)** — PSR full export (lifecycle cols + sub-fields sheet); filters center/date/category/status/source.
**US-14.2 (BE)** — Response-TAT, Resolution-TAT (actual vs SLA), Delegate/Reassign, Mailbox, IVR reports.
**US-14.3 (FE)** — Reports/Dashboard SR widgets (call summary, SLA compliance, volume) + exports.

### Cross-cutting
- **US-X.1 (BE)** — add/seed new perms (`SR_CANCEL`, template manage); RBAC-visible.
- **US-X.2 (BE)** — all new `sr.*` config defaults gracefully (no crash on missing).
- **US-X.3 (QA)** — per epic: backend `tsc`, frontend `tsc`+build, happy-path + fallback test.

---

# PART C — Do-Not-Regress vs Vector

## Where we already improved (keep it)
| # | Vector limitation | Our enhancement (built) | Guardrail |
|---|---|---|---|
| 1 | Single client, per-client code | Multi-tenant `Project.configuration.sr` | Never hardcode a client; all per-project config. |
| 2 | Hardcoded designation IDs (`142,482,…`), access-code=1 | Granular RBAC + Role Mapping | Gate by permission, never designation/employee ID lists. |
| 3 | Magic IDs (dept 21, subcat 15 Leave, tool_type) | Config hierarchy + `interactionType` | No magic numeric IDs in logic. |
| 4 | 3 separate PSR tabs, tab switching | Unified SR hub (tabs+filters+source tag) | Keep single unified view. |
| 5 | Live+archive dual-table fallback chain | Single indexed Mongo collection | No dual-table archive read path. |
| 6 | `exec("php … cron")` + hardcoded Gmail SMTP | Notification model + email worker | Use notification/worker; never exec/hardcoded creds. |
| 7 | Inline Knowlarity/Graph/Directory | Provider-agnostic MDM/adapters | Provider from config; no inline endpoints/tokens. |
| 8 | Static `ivr_users` extension mapping | IVR-agent module (buckets, RR, leaves, availability) | Keep RR + availability. |
| 9 | `hd_sub_fields` simple | Typed forms + `conditionEngine` | Keep schema-driven conditional engine. |
| 10 | `CheckDuplicatePSR` + global message table | `srDuplicateDetection` service | Keep service; message → per-project config. |
| 11 | Old PHP views | OneOS React UI + shared `theme/oneos` | New screens use OneOS tokens/components. |
| 12 | `userid==1` debug prints, hardcoded creds, dead code | Encrypted secrets, audit, RBAC | No backdoors; secrets encrypted; no dead code. |
| 13 | Separate `service_request` module | `interactionType` on shared Ticket spine | Keep single ticket spine. |
| 14 | Vector↔Hubble manual | `leadCrmSync` | Keep automated CRM sync. |
| 15 | Ad-hoc per-location TAT math | Central SLA + working-calendar | Reuse SLA module; don’t re-implement TAT. |
| 16 | Graph-token-fragile, single-owner inbox | Triage inbox + per-project mailbox + reply-in-thread | Abstracted mailbox; agent-scoped inboxes. |
| 17 | MDM no sync-back, manual active/inactive | MDM→User sync (scheduled+manual, mirror, missing-flag) | Keep automated sync. |

## Anti-patterns to avoid per gap epic
| Building… | Vector did (avoid) | Our rule |
|---|---|---|
| Assignment/reopen (1–2) | matrix keyed by literal location IDs; RR state ad-hoc | `CategoryAssignmentConfig` (+`centerId` ref), config pools, RR on config row. |
| Cancel (3) | status strings + free-text `new_sr_no` | typed transition + `Ticket.cancel` + validated link. |
| Messages (4) | global `hd_messages` client text | per-project `sr.messages` + fallback. |
| Auto-close (8) | `if id_subcategory==15 && days<=1` | generic `conditionEngine` rule; no subcat-ID literals. |
| Notif templates (9) | `exec()` PHP + fixed SMTP + if-else per transition | template model + notification service; provider from config. |
| Source TAT (7) | duplicated `ivr_*_tat` columns | one `slaBySource` read by shared TAT calc. |
| Escalation (6) | fixed `first…fifth_esc_time` columns | level array + CC; loop not fixed columns. |
| Email fwd/junk (11) | inline Graph, ad-hoc flags | config `autoForwardTo`/`emailJunk`; worker-driven. |
| IVR linked/bulk (12) | `callid` free-linking, manual moves | typed linkage + bulk endpoint + history. |
| TAT recompute (13) | manual per-location tool | endpoint/job on central calendar; project-scoped. |
| Reports (14) | 60-col PHPExcel dumps + dead formats | structured export service + filters; reuse infra. |
| Anywhere | `userid==1` debug; hardcoded emails/IDs; `exec()` | RBAC + config + services/workers; secrets encrypted. |

## Golden rules (every SR PR)
1. No hardcoded client data (IDs/centres/subcats/emails/endpoints/tokens) → all config.
2. Permission-gated, not identity-gated.
3. One ticket spine (`interactionType`), one unified SR list, one collection.
4. Services/workers/schedulers — never `exec()` shell or per-request cron.
5. Provider-agnostic via MDM/integration config; secrets encrypted.
6. Config defaults gracefully (missing config never crashes).
7. OneOS UI + shared `theme/oneos`/`components/ui`.
8. No debug backdoors, no dead commented logic.

_Dev spec + guardrails. Not a client deliverable._
