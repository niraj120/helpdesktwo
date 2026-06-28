# ISR / PSR Build Plan — Multi-Channel Intake & Walk-In PSL Flow

> **Status:** Planning · **Branch:** `ISR/PSR` · **Author:** Senior dev plan · **Last updated:** 2026-06-26
>
> This is the **living build plan** for the ISR/PSR feature set being ported into the
> HubbleHox helpdesk (`backend/` Node+Express+Mongoose, `frontend/` React+Vite). It is
> grounded in the **real codebase**, not the prototype.
>
> **Reference docs (read before coding):**
> - `docs/ISR_PSR_COMPREHENSIVE_DOCUMENTATION.md` — the **prototype** (separate React app). Describes *desired behaviour / target UX*. Not the real code.
> - `docs/SR_NEW_REQUEST_WIZARD_PLAN.md` — shipped SR wizard plan.
> - `docs/PSR_LIST_COLUMNS_PLAN.md` — shipped PSR list + PSR↔ISR linkage.
> - `docs/MDM_HRMS_FEATURE_PLAN.md` — shipped MDM master + HRMS user mapping.
> - `CLAUDE.md` + `docs/reference/*` — architecture, RBAC, schema.

---

## 0. Glossary (real codebase semantics)

| Term | Real meaning in this repo |
|------|---------------------------|
| **PSR** | Parent Service Request. `Ticket.interactionType = "PSR"`, `requestType = "SR"`. Parent-facing. Can spawn child ISRs. |
| **ISR** | Internal Service Request. `Ticket.interactionType = "ISR"`. Internal/operational. Links to a parent PSR via `Ticket.linkedPsrId`. |
| **PSL** | Parent Service Lead / Parent Satisfaction Liaison. **NOT a dedicated role.** It is a *permissioned functional actor* — a user holding `SR_PSR_CREATE` / `SR_PSR_RECEIVE` / `SR_DELEGATE` / `SR_CLOSE`, optionally CC'd/delegated onto PSRs. Has a dedicated **PSL Call tab** on PSR detail. |
| **Channel (mode of contact)** | *How the request physically arrived.* `Ticket.modeOfContact` ∈ `telephone · walk_in · email · portal · ivr · digital`. Derived `Ticket.submissionSource` ∈ `online · offline · email · whatsapp · chatbot · web · sms · ivr`. |
| **Classify channel** | *Who/what the request is about* — the triage bucket. `metadata.classification` key ∈ `existing_parent · prospect_parent · vendor · job · others · junk` (+ admin custom). Configurable per project at `Project.configuration.sr.classifyChannels`. |
| **Walk-in** | A parent physically visits; a permissioned agent (the PSL) raises the PSR on their behalf. `modeOfContact = "walk_in"` → `submissionSource = "offline"`. |

> ⚠️ **Two different "channel" concepts.** "Mode of contact" (walk_in/ivr/email) ≠ "classify channel" (existing_parent/vendor/junk). The wizard currently conflates them by **hardcoding** `channel: "walk_in"`. Section 4 fixes this.

---

## 1. Feature scope (this document)

**Feature 1 — Multi-channel PSR intake.** A parent raises a PSR via four channels:
1. **IVR** (phone → IVR → agent triages call → converts to PSR)
2. **Email** (inbound mail → triage → convert to PSR)
3. **Walk-in** (parent visits → PSL agent raises PSR)
4. **Web app** (parent self-service portal raises PSR directly)

**Feature 2 — Walk-in PSL flow (primary deliverable).** When a parent walks in, the permissioned PSL agent opens the new-request form and fills:
`description, parent name, mobile no., email id, student name (free-text OR selection), category, sub-category`, plus the other existing blocks (priority, assignee, offline/RE-entry). On submit → PSR appears in the PSR list with `mode = walk_in`, `classification = existing_parent` (or chosen).

> Future features (IVR deep flow, parent portal self-service, VSR, escalation, etc.) will be **appended as new sections** to this same doc.

---

## 2. Current state — what is ALREADY built (verified in code)

This branch already shipped most of the plumbing. **Do not rebuild it.**

### 2.1 Data model — `backend/src/models/Ticket.ts`
| Field | Line | Notes |
|-------|------|-------|
| `interactionType` | 188 | `"normal" \| "PSR" \| "ISR"` (default `normal`) |
| `requestType` | 597 | `"OCR" \| "SR"` (PSR ⇒ `"SR"`) |
| `linkedPsrId` | 603 | ISR → parent PSR, sparse + compound index `{linkedPsrId,status}` |
| `modeOfContact` | 610 | `telephone·walk_in·email·portal·ivr·digital` |
| `submissionSource` | 424 | `online·offline·email·whatsapp·chatbot·web·sms·ivr` |
| `metadata` (Mixed) | 472 | `parent · children · classification · studentEnrollment · studentName · requesterEmail · createdByRE · formData · scheduleDispatchDate · assigneeEmails` |
| `categoryHierarchy` | 367 | `{level1..5, displayPath}` |
| `wip / delegation / reopen / parentClosure / pslCall` | 624–655 | full PSR lifecycle subdocs |

### 2.2 Backend SR module — `backend/src/modules/service-request/`
- **`createServiceRequest.ts:78`** — `createServiceRequest(input)`. Accepts `parent`, `children`, `studentUserId`, `studentEnrollment`, `classification`, `channel`, `priority`, `createdByRE`, `requesterEmail`, `linkedPsrId`, etc. Maps `channel → submissionSource` via `CHANNEL_TO_SOURCE` (`walk_in → offline`).
- **`types.ts:17`** — `SrChannel = "online" | "walk_in" | "email" | "ivr"`.
- **`types.ts:157`** — `SR_DEFAULT_CLASSIFY_CHANNELS` (6 seeded).
- **`emailTriage.ts:169`** — email → PSR/ISR conversion (`EmailIntake` model). **Phase 4 done.**
- **`callTriage.ts`** + **`CallIntake.ts`** — IVR call capture → conversion. **Phase 5 partial.**
- **`serviceRequestService.ts`** — list/get/linkedIsrs/linkIsrToPsr + linked-ISR rollup aggregate.

### 2.3 SR endpoints — `backend/src/routes/serviceRequest.ts` (19 routes)
`POST /` (create, gated `SR_PSR_CREATE|SR_ISR_CREATE`), `GET /parent-lookup` (MDM parent search), `GET /student-lookup`, `GET /` (list), status/close/reassign/delegate/reopen/psl-call/parent-close, `GET /:id/linked-isrs`, `POST /:id/link-psr`.

### 2.4 Frontend
- **`pages/ServiceRequestCreate.tsx`** — 3-step wizard (`type → classify → form`). `existing_parent` flow = MDM parent search + child multi-select + category + subject + description. Blocks: assignee emails (ISR), priority/schedule, offline/RE-entry (OTP).
- **`pages/ServiceRequests.tsx`** — PSR list (14 cols incl. Priority, Channel=`metadata.classification`, Linked ISRs, Age, WIP date). Hardcoded `interactionType:"PSR"`.
- **`components/sr/`** — `SrLifecyclePanel`, `LinkedIsrPanel`, `PslCallTab`, `PsrDetailLayout`, `SrStatusProgress`.
- **`services/serviceRequests.ts`** — API client: `create`, `parentLookup`, `studentLookup`, `list`, `linkedIsrs`, `linkPsr`, `pslCall`, `changeStatus`, `leads.create`.

### 2.5 RBAC — SR permission codes (already seeded)
`SR_PSR_CREATE · SR_PSR_RECEIVE · SR_ISR_CREATE · SR_ISR_RECEIVE · SR_REASSIGN · SR_DELEGATE · SR_CLOSE · SR_REOPEN · SR_DISPLAY_TO_PARENT · SR_CONFIG_MANAGE · SR_ASSIGN_EMAILS · SR_PRIORITY_OVERRIDE · SR_OFFLINE_ENTRY · EMAIL_TRIAGE_ACCESS · EMAIL_TRIAGE_CONVERT · EMAIL_TRIAGE_RESPOND`
(seed source of truth: `backend/src/utils/seedRolesPermissions.ts`)

---

## 3. Feature 1 — Multi-channel intake: status & gaps

| Channel | How it reaches PSR | Built? | Gap |
|---------|--------------------|--------|-----|
| **Walk-in** | PSL agent → wizard (`channel:"walk_in"`) | ⚠️ Partial | No mode-of-contact selector (hardcoded). No **manual** parent/student entry (MDM-search-only). → **Section 4.** |
| **Email** | Inbound mail → `EmailIntake` → `emailTriage.actionEmailIntake` → `createServiceRequest({channel:"email"})` | ✅ Phase 4 | Verify runtime wiring; ensure `modeOfContact="email"` set. |
| **IVR** | Call → `CallIntake` → `callTriage` → convert | ⚠️ Phase 5 partial | Confirm convert path calls `createServiceRequest({channel:"ivr"})`; build/verify the call-triage UI + "Convert to PSR" action. |
| **Web app (parent self-service)** | Parent portal raises PSR directly | ❌ **Missing** | No parent-facing self-service PSR create. → **Future section (Feature: Parent Portal).** |

**Intake architecture (target):**

```
            ┌─────────────┐
 Phone ───► │  CallIntake │──┐
            └─────────────┘  │
            ┌─────────────┐  │   convert / triage
 Email ───► │ EmailIntake │──┤        │
            └─────────────┘  │        ▼
 Walk-in ─► [ SR Wizard ]────┼──► createServiceRequest()  ──►  Ticket{interactionType:PSR}
            (PSL agent)       │     • channel→submissionSource        │
 Web ─────► [ Parent Portal ]─┘     • modeOfContact                  ▼
            (self-service)          • metadata.classification    PSR List (ServiceRequests.tsx)
```

Single funnel = `createServiceRequest()`. Every channel differs only by **`channel` + `modeOfContact` + who is `createdBy`**. This is the key design invariant — keep all intake paths converging on that one service function.

---

## 4. Feature 2 — Walk-In PSL Flow (DETAILED PLAN)

### 4.1 User story
> As a **PSL agent** (holding `SR_PSR_CREATE`), when a parent walks into the centre, I open **New Request → Walk-in**, capture the parent's details (by MDM search **or by typing them manually**), pick the student, classify the request, choose category/sub-category, write a description, and submit. The PSR appears in the PSR list marked **Walk-in**, assigned per the routing matrix, and I (PSL) can follow it through its lifecycle.

### 4.2 Gap analysis (what's missing vs. what exists)

| # | Requirement | Current state | Action |
|---|-------------|---------------|--------|
| G1 | Mark mode of contact = **walk_in** (vs telephone/ivr) | `channel` hardcoded to `"walk_in"` at `ServiceRequestCreate.tsx:427` | Add a **Mode-of-contact selector** in form step; send real `channel` + `modeOfContact`. |
| G2 | PSL can **type** parent name / mobile / email when parent **not in MDM** | `existing_parent` flow is **MDM-search-only** (`:675`) | Add **"Enter manually" toggle** → manual parent fields. |
| G3 | Student name as **free-text OR selection** | Children come only from selected MDM parent | Manual mode: free-text `studentName` (+ optional enrollment). MDM mode: keep child multi-select. |
| G4 | Description, category, sub-category, priority | ✅ Exists | Reuse. Ensure sub-category (deep `categoryHierarchy`) captured. |
| G5 | PSR shows correct **Channel** in list | List shows `metadata.classification` (existing_parent) as "Channel" | Decide: add a **Mode column** distinct from Classification, or relabel. (Mode already present as col 6 `modeOfContact`.) Confirm walk-in rows show `Mode = Walk-in`. |
| G6 | Permission gating for PSL | `SR_PSR_CREATE` already gates `POST /` and the wizard | ✅ No change. Confirm PSL role has it. |
| G7 | Manual parent → no `studentUserId` | Backend expects optional `studentUserId`; metadata stores `studentName` | Backend already tolerant (all optional). Ensure manual path sends `parent{}` + `metadata.studentName` without `studentUserId`. |

### 4.3 Design decisions

**D1. Manual-entry as a sub-mode of `existing_parent`, not a new classify channel.**
The classify channel stays `existing_parent`. Inside the form, add a segmented toggle:
`◉ Search MDM   ○ Enter manually`. Manual reveals 4 inputs (parent name*, mobile*, email, student name*) + optional enrollment. This avoids touching the channel config and keeps routing identical.

**D2. Mode-of-contact selector.**
Add a small `<select>` in the form header for `existing_parent`/`others` flows:
`Walk-in · Telephone · Portal · Digital`. Default **Walk-in**. Maps to payload `channel` (SrChannel) + `modeOfContact`. Stop hardcoding line 427.

> Decision needed from you (see §7 Q1): keep the simple default-walk_in, or expose the full selector now? Recommendation: expose selector (cheap, future-proofs telephone/portal).

**D3. No new permissions.** Reuse `SR_PSR_CREATE`. PSL = any role granted it. (If you want a *named* PSL role, that's a separate RBAC task — see §7 Q3.)

**D4. Validation.** Manual mode requires `parentName` + `mobile` (E.164-ish) + `studentName`. Email optional but validated if present. MDM mode requires ≥1 child selected (current behaviour).

### 4.4 Backend changes

| File | Change |
|------|--------|
| `modules/service-request/createServiceRequest.ts` | Accept `modeOfContact` from input (already accepts `channel`). Ensure manual path: when no `studentUserId`, still persist `metadata.parent`, `metadata.studentName`, `metadata.children:[]`. Set `modeOfContact` from input (fallback derive from `channel`). |
| `modules/service-request/types.ts` | If exposing telephone/portal in wizard, confirm `SrChannel` covers them or extend `CHANNEL_TO_SOURCE` (add `telephone→offline`, `portal→web`). |
| `controllers/serviceRequestController.ts` | `create()` — pass through `modeOfContact`; keep permission stripping. No new validation beyond subject (manual-field validation can stay client-side + light server guard). |

**Minimal & low-risk:** the service layer already stores everything in `metadata` (Mixed). The manual path is mostly a **frontend** change; backend just needs to (a) read `modeOfContact`, (b) not assume `studentUserId` exists.

### 4.5 Frontend changes — `pages/ServiceRequestCreate.tsx`

1. **State:** add `entryMode: "mdm" | "manual"`, `manualParent {name,mobile,email}`, `manualStudent {name,enrollment}`, `modeOfContact` (default `"walk_in"`).
2. **`renderExistingParent()` (`:675`):** add the `Search MDM / Enter manually` toggle. When `manual`, render 4 inputs instead of the search box.
3. **Mode-of-contact selector** (D2) near the top of the form step.
4. **Payload build (`:423`):** stop hardcoding `channel:"walk_in"`. Set `channel = modeOfContact`-derived SrChannel; set `payload.modeOfContact`. For manual mode:
   ```ts
   payload.parent = { name: manualParent.name, mobile: manualParent.mobile, email: manualParent.email };
   payload.metadata = { studentName: manualStudent.name, studentEnrollment: manualStudent.enrollment };
   // no studentUserId, no children
   ```
5. **Validation guard** before submit (D4).
6. **`ServiceRequests.tsx` list:** verify col 6 `Mode` renders `Walk-in` for these; optionally add a Mode filter chip alongside the existing Source filter.

### 4.6 Sequence (walk-in, manual parent)

```
PSL opens /service-requests?tab=new
  → Step type: pick project, interactionType=PSR
  → Step classify: pick "Existing Parent"
  → Step form:
       mode-of-contact = Walk-in
       entryMode = Manual → type parent name/mobile/email + student name
       category → sub-category (categoryHierarchy)
       subject + description
       [optional] priority/schedule, offline RE-entry
  → POST /service-requests {channel:"walk_in", modeOfContact:"walk_in",
       interactionType:"PSR", classification:"existing_parent",
       parent{...}, metadata{studentName}, categoryId, subject, description}
  → createServiceRequest(): submissionSource="offline", routing matrix → assignedTo
  → PSR appears in ServiceRequests.tsx (Mode=Walk-in)
```

### 4.7 Acceptance criteria
- [ ] PSL with `SR_PSR_CREATE` can open the wizard; user without it is blocked (route guard).
- [ ] MDM search path still works (regression).
- [ ] Manual path creates a PSR with `parent.name/mobile/email` + `metadata.studentName`, **no** `studentUserId`, no crash.
- [ ] Created PSR has `modeOfContact="walk_in"`, `submissionSource="offline"`, `interactionType="PSR"`, `metadata.classification="existing_parent"`.
- [ ] PSR shows in list with Mode=Walk-in, correct category path, routed assignee.
- [ ] Sub-category persists in `categoryHierarchy.displayPath`.
- [ ] Both `backend` and `frontend` `npm run build` clean; no TS errors.

### 4.8 Task checklist (file-level)
**Backend**
- [ ] `createServiceRequest.ts` — read `modeOfContact`; tolerate missing `studentUserId` in manual path; ensure `metadata.studentName` persisted.
- [ ] `types.ts` / `CHANNEL_TO_SOURCE` — extend if telephone/portal exposed.
- [ ] `serviceRequestController.ts` — pass `modeOfContact` through `create()`.

**Frontend**
- [ ] `ServiceRequestCreate.tsx` — entryMode toggle, manual fields, mode-of-contact selector, payload rewrite (remove hardcode `:427`), validation.
- [ ] `services/serviceRequests.ts` — type the `create` payload to include `modeOfContact`, manual `parent`.
- [ ] `ServiceRequests.tsx` — confirm Mode column; optional Mode filter.

**Verify**
- [ ] Manual + MDM smoke test; build both apps.

---

## 5. Implementation phases (suggested order)

1. **Phase A — Walk-in manual entry (Feature 2 core).** §4.4–4.8. Highest user value, low risk, mostly frontend. **Start here.**
2. **Phase B — Mode-of-contact selector.** Generalises §4 D2 so telephone/portal also work.
3. **Phase C — IVR convert path.** Finish Phase-5 `callTriage` → `createServiceRequest({channel:"ivr"})` + call-triage UI "Convert to PSR".
4. **Phase D — Email triage verify.** Confirm Phase-4 `emailTriage` end-to-end; ensure `modeOfContact="email"`.
5. **Phase E — Parent portal self-service (Feature 1, channel 4).** New parent-facing PSR create (separate doc section; needs parent auth flow — studentAuth/OTP exists).

---

## 6. Risk & gotchas (from CLAUDE.md + code)
- `Ticket.metadata` is **Mixed** — flexible but no schema validation; guard reads.
- Status is **numeric** (1 Open, 2 WIP, 4 Resolved, 5 Closed, 6 Re-open, 7 Re-opened WIP).
- Route order in `server.ts` matters; SR routes already mounted.
- `ServiceRequests.tsx` "Channel" column = **classification**, not mode — don't confuse users (§4 G5).
- Multi-tenant: every create is project-scoped; wizard already enforces `projectId`.
- Manual parent entry has **no MDM provenance** — acceptable for walk-in, but flag it (e.g. `metadata.parentSource="manual"`) so reporting can distinguish.

---

## 7. Open questions — DECISIONS NEEDED FROM YOU

- **Q1.** Expose a full **mode-of-contact selector** (Walk-in/Telephone/Portal/Digital) now, or keep default `walk_in` and only add the manual-entry toggle? *(Rec: expose selector.)*
- **Q2.** When a walk-in parent is entered **manually** and isn't in MDM — should we **create/upsert a parent User record** (like HRMS import), or just store `metadata.parent` (no User)? *(Rec: store in metadata only for now; optional "promote to MDM/User" later.)*
- **Q3.** Do you want a **named "PSL" role** seeded (with the SR perms bundled), or keep PSL purely permission-driven on existing roles? *(Rec: seed a `PSL` role bundling `SR_PSR_CREATE/RECEIVE/CLOSE/REOPEN/DELEGATE` for clean assignment.)*
- **Q4.** Student in manual mode — free-text only, or free-text **with** an optional `student-lookup` autocomplete (the `/student-lookup` endpoint already exists)? *(Rec: free-text + optional autocomplete.)*

---

## 8. Future feature slots (to be filled as you send them)
- [x] **Feature 3 — Email → Auto-PSR + two-way parent thread** → see Part II below.
- [x] **Feature 4 — IVR (TATA telephony) → PSR** → see Part III below.
- [x] **Feature 5 — Parent web-app self-service PSR + assignment routing** → see Part IV below.
- [x] **Feature 6 — Sub-ISR under PSR + PSR↔PSR linking + duplicate detect & combine** → see Part V below.
- [ ] VSR (vendor) subsystem
- [ ] Escalation / SLA breach automation for PSR

---
---

# PART II — Feature 3: Email → Auto-PSR + Two-Way Parent Email Thread

> **Status:** Planning · added 2026-06-26. Builds on Part I (shared `createServiceRequest()` funnel).

## 9. Feature 3 — scope & user story

> A parent emails their issue to one **common project mailbox** (e.g. `support@school.hubblehox.ai`).
> The system **auto-converts** that email into a **PSR**. The parent is **identified from the MDM
> database by their email**; if not identifiable by email, fall back to a **student name** found in
> the email; if still unidentifiable, the email lands in a **PSL triage queue** for manual
> identification. The **PSL can ask the parent for more details on the same email thread**, and the
> parent's reply is **threaded back into the same PSR** so the PSL can enrich it. The PSR then runs
> its full lifecycle (WIP, resolve, close, reopen, PSL call, linked ISRs).

**Three intake outcomes for an inbound email:**
1. **Reply to an existing PSR** → thread into that PSR's conversation (no new ticket).
2. **New, parent identified** → auto-create PSR, link parent+children, auto-acknowledge.
3. **New, parent NOT identified** → PSL triage queue → PSL identifies → convert to PSR.

---

## 10. Current state — email subsystem (verified)

> ⚠️ **Two parallel email tracks already exist.** Understand both before changing anything.

### 10.1 Track A — Auto ticket (makes a *normal* ticket, NOT a PSR)
```
emailPollingService (IMAP/Graph, every 30s)
  → EmailProcessingQueue (raw email rows, dedup by messageId)
  → emailProcessingWorker (every 1 min)
       → findEmailThread()  ── match? ──► addReplyToTicket()   (append to existing ticket)
       └─ no match ────────────────────► createTicketFromEmail()  (NEW *normal* Ticket)
```
- `services/emailPollingService.ts` — `pollEmails()`, `fetchEmailsForConfig()` (IMAP), `fetchEmailsViaGraph()`, `addToQueue()`.
- `models/EmailProcessingQueue.ts` — `rawEmail`, `status(pending/processing/completed/failed)`, `ticketId`, `metadata{fromEmail,messageId}`.
- `services/emailProcessingWorker.ts` — `processQueue()`, `processEmail()` (`:146`), thread branch (`:173`), new-ticket branch (`:184`).
- `utils/ticketFromEmail.ts` — `createTicketFromEmail()` (`:432`); contact name = `parsedEmail.from.name` only.

### 10.2 Track B — Human triage (makes a PSR, but manual)
```
ingestEmail() → EmailIntake (status "open")
  → human opens triage inbox → clicks "Convert to PSR"
  → actionEmailIntake() case "psr" → createServiceRequest({channel:"email", modeOfContact:"email"})
```
- `models/EmailIntake.ts` — `fromEmail`, `subject`, `body`, `htmlBody`, `senderType(existing_student/left_student/new_admission/others)`, `status(open/wip/closed)`, `actions[]`, `studentUserId`, `assignedTo`, `uniqueId(M000000001)`.
- `modules/service-request/emailTriage.ts` — `ingestEmail()` (`:35`), `actionEmailIntake()` (`:149`); PSR case `:168`, **`channel`/`modeOfContact` hardcoded `"email"`** (`:178`), passes `metadata{emailIntakeId, fromEmail}`. **No parent MDM identification here.**
- `controllers/emailIntakeController.ts` + `routes/emailIntake.ts` (`/api/email-intake`), gated `EMAIL_TRIAGE_ACCESS / EMAIL_TRIAGE_CONVERT / EMAIL_TRIAGE_RESPOND`.

### 10.3 Threading & outbound (EXISTS — reuse)
- `models/TicketEmailCommunication.ts` — `messageId(unique)`, `inReplyTo`, `references`, `conversationId` (all indexed) + outgoing/incoming log.
- `utils/emailThreadDetection.ts` — `findEmailThread()` (`:17`) → 4 strategies: `conversationId` → `inReplyTo` → `references` → fuzzy subject (7-day). Also matches Ticket `metadata.emailMessageId`.
- `utils/emailService.ts` — `getEmailTransporter()` (`:78`), `sendTicketReplyEmail()` (`:2339`, sets reply `messageId` + `inReplyTo`/`references` chain), `sendTicketCreatedEmail()` (`:708`, auto-ack), status/closed/assigned senders.
- `controllers/emailCommunicationController.ts` — `sendTicketReply()` (`POST /api/tickets/:id/reply-email`), logs via `logOutgoingEmail()`, appends reply as ticket comment.

### 10.4 PSR ticket structure (where email content lands)
- Detail page `pages/AgentTicketDetail.tsx` — tabs: **Replies · Linked ISRs · Internal Notes · PSL Call · History · Audit · Emails** (`activeTab` `:539`, tab bar `:2476`). "Emails" tab shows only for email-source tickets (`:2559`).
- Layout `components/sr/PsrDetailLayout.tsx` — cards: StatusProgress, WipCommitment, PslAssignment, **ParentStudent** (`metadata.parent{name,mobile}`, `metadata.studentName`), SrDetails, Lifecycle, LinkedIsr.
- `models/Ticket.ts` — `threads[]` (IThread: message, createdBy, attachments, isSystemMessage), `comments[]` (IComment: text, createdBy, `displayToParent`), `internalNotes[]`, `changeHistory[]`, `attachments[]` (IAttachment), `metadata.parent/children/studentName/emailMessageId`.
- `serviceRequestService.ts` — `getServiceRequest()` (`:722`) populates assignedTo/createdBy/cc; returns all arrays. `addFollowUp()` (`:72`) pushes a parent-visible comment.
- Status FSM `modules/service-request/srWorkflow.ts` — numeric `1 Open · 2 WIP · 4 Resolved · 5 Closed · 6 Re-open · 7 Re-opened WIP` (3 On-Hold exists, unused in SR). Transitions `:33`.

---

## 11. Gap analysis (Feature 3)

| # | Requirement | Current state | Action |
|---|-------------|---------------|--------|
| E1 | **Auto** email → **PSR** (not normal ticket) | Auto-worker makes *normal* ticket; PSR is manual triage only | Add a **PSR-intake pipeline**: when email hits a PSR mailbox, branch to PSR creation. |
| E2 | Identify parent **by exact email** from MDM | `searchParentsFromMDM` is **fuzzy only**; no exact-email fn | **Build `findParentByEmail(email, projectId, mdmSourceId)`** in `mdmService.ts`; return parent + children. |
| E3 | Fallback: identify by **student name** in email | No student-name extraction (only `from.name`) | Best-effort: parse subject/body for a known student (match against MDM children / `student-lookup`); if 1 confident match → attach. |
| E4 | If unidentified → **PSL triage queue** | EmailIntake triage exists but isn't parent-aware | Route unidentified emails to EmailIntake with `senderType` + a **"needs identification"** flag; PSL identifies (MDM search / manual / by student) then converts. |
| E5 | PSL **asks parent for more info on same email** | `sendTicketReplyEmail` + `/reply-email` exist | Add a PSR **"Request info from parent"** action → outbound email + set **awaiting-info** flag (+ optional SLA pause). |
| E6 | Parent **reply threads back into the same PSR** | `findEmailThread` matches Ticket via messageId/conversationId | Ensure inbound PSR replies are matched to the PSR and appended as a **parent-visible comment / Emails-tab entry**; store inbound `messageId` chain. |
| E7 | Auto-**acknowledge** parent on PSR creation | `sendTicketCreatedEmail` exists | Wire auto-ack on auto-PSR create (config-toggle). |
| E8 | Email **attachments** → PSR | `IThreadAttachment`/`IAttachment` exist | Map parsed email attachments into `ticket.attachments` / first thread. |
| E9 | Surface email conversation in PSR detail | "Emails"/"Replies" tabs exist | Confirm auto-PSR sets email-source so "Emails" tab renders; thread inbound+outbound there. |

---

## 12. Target pipeline (Feature 3)

```
Inbound email → common PSR mailbox (ProjectEmailConfig.intakeMode = "psr")
   │  emailPollingService → EmailProcessingQueue   (REUSE)
   ▼
PSR-aware processor (extend emailProcessingWorker OR new psrEmailIntake worker)
   │
   ├─(1) findEmailThread() matches an existing PSR?
   │        └─► append inbound as parent comment + TicketEmailCommunication log → DONE (no new PSR)
   │
   ├─(2) findParentByEmail(fromEmail) → parent found in MDM?
   │        └─► createServiceRequest({
   │               interactionType:"PSR", channel:"email", modeOfContact:"email",
   │               classification:"existing_parent",
   │               parent:{...}, children:[...], studentUserId?, categoryId?(default/uncategorized),
   │               subject, description:body, metadata:{ emailMessageId, fromEmail, autoCreated:true }
   │             })  → route via matrix → sendTicketCreatedEmail() auto-ack → DONE
   │
   ├─(3) student-name match in email → single confident student?
   │        └─► resolve parent via that student → createServiceRequest(...) as (2)
   │
   └─(4) unidentified → EmailIntake(status open, senderType, needsIdentification:true)
            └─► PSL triage queue → PSL identifies (MDM search / manual / student-lookup)
                 → actionEmailIntake("psr") → createServiceRequest(...)  (now parent-linked)

PSL on PSR detail → "Request info from parent"
   → sendTicketReplyEmail() (threaded) + ticket.metadata.awaitingParentInfo=true (+ optional SLA pause)
Parent replies → poller → findEmailThread() → appended to SAME PSR (Emails/Replies tab)
   → PSL edits PSR (category/subcategory/description), clears awaiting-info, advances lifecycle
```

**Design invariant:** every branch still ends at `createServiceRequest()` (same as Part I). Only the *pre-identification* differs.

---

## 13. Design decisions (Feature 3)

- **D5. PSR mailbox is config-driven.** Add `ProjectEmailConfig.intakeMode: "psr" | "triage" | "normal_ticket"` (default `"normal_ticket"` = current behaviour, zero regression). Only `"psr"` mailboxes run the new pipeline. *(Decision Q5.)*
- **D6. Auto-create vs always-triage.** Recommend **hybrid**: confident parent match (E2/E3) → auto-PSR; otherwise → PSL triage (E4). Avoids junk auto-PSRs. *(Decision Q6.)*
- **D7. Category at auto-create.** Email has no category. Create PSR **uncategorized** (or a configurable default category) with status Open; PSL sets category/subcategory during enrichment. Use `Category.sr.appliesTo` to offer PSR categories.
- **D8. Awaiting-info state.** Reuse a `metadata.awaitingParentInfo` boolean + timeline marker rather than adding a new numeric status (keeps FSM intact). Optional SLA pause via existing WIP/`slaPaused` semantics. *(Decision Q7.)*
- **D9. Parent provenance.** Auto-identified → `metadata.parentSource="mdm"`; triage-resolved → `"mdm"`/`"manual"`. Mirrors Part I D-Q2.
- **D10. Reuse threading, don't reinvent.** Inbound PSR replies use existing `findEmailThread` + `TicketEmailCommunication`; store original inbound `messageId` on PSR (`metadata.emailMessageId`) so strategy-3/4 match.
- **D11. No new permission for auto-pipeline** (it's a background worker). PSL triage reuses `EMAIL_TRIAGE_*`. "Request info from parent" reuses `SR_DISPLAY_TO_PARENT` + reply perm. *(Confirm Q8.)*

---

## 14. Implementation changes (Feature 3)

### 14.1 Backend
| File | Change |
|------|--------|
| `services/mdmService.ts` | **NEW** `findParentByEmail(email, projectId?, mdmSourceId?)` — exact (normalized, case-insensitive) email match over MDM parents; return `{source, parent, children}` or null. Reuse `normalizeParent`. |
| `models/ProjectEmailConfig.ts` | **NEW** `intakeMode` enum (`psr`/`triage`/`normal_ticket`, default `normal_ticket`) + optional `defaultPsrCategoryId`, `autoAckEnabled`. |
| `services/emailProcessingWorker.ts` **or** new `services/psrEmailIntakeWorker.ts` | Branch on `config.intakeMode==="psr"`: run §12 pipeline (thread → parent-by-email → student → triage). Keep normal-ticket path untouched for other modes. |
| `modules/service-request/emailTriage.ts` | Extend `ingestEmail()` to run `findParentByEmail` + set `needsIdentification`/`senderType`; extend `actionEmailIntake("psr")` to pass resolved `parent`/`children`/`studentUserId` + `classification:"existing_parent"`. |
| `models/EmailIntake.ts` | Add `needsIdentification: boolean`, `matchedParent` (cached MDM parent), `messageId/inReplyTo/references` (for threading triage replies). |
| `modules/service-request/createServiceRequest.ts` | Accept inbound email context: persist `metadata.emailMessageId`, `metadata.fromEmail`, `metadata.autoCreated`; ensure email-source flag so PSR detail "Emails" tab renders. Map email attachments → `attachments[]`. |
| `serviceRequestService.ts` / controller | **NEW** action `requestParentInfo(psrId, message)` → `sendTicketReplyEmail` + set `metadata.awaitingParentInfo=true` + timeline entry; clear on next parent reply. Endpoint `POST /service-requests/:id/request-info` gated `SR_DISPLAY_TO_PARENT`. |
| `utils/emailThreadDetection.ts` | Ensure PSR tickets are discoverable (already matches `metadata.emailMessageId`); add PSR-reply append helper if needed. |

### 14.2 Frontend
| File | Change |
|------|--------|
| `pages/AgentTicketDetail.tsx` | Ensure "Emails" tab renders for auto-PSR (email source). Add **"Request info from parent"** button (reuses reply composer) + an **awaiting-info** banner when `metadata.awaitingParentInfo`. Show `metadata.parentSource` badge (Auto/MDM/Manual/Unidentified). |
| Email-triage inbox page (existing) | Add **"Needs identification"** filter + an **identify-parent** action (MDM search / manual / student-lookup) before convert. |
| `components/sr/PsrDetailLayout.tsx` ParentStudent card | Show identification status + allow PSL to attach/correct parent & student when unidentified. |
| `pages/ServiceRequestSettingsHub.tsx` / email config UI | Expose `intakeMode` (PSR / triage / normal), `defaultPsrCategoryId`, `autoAck` per mailbox. |
| `pages/ServiceRequests.tsx` | Optional: filter/badge for `metadata.autoCreated` + awaiting-info. |

---

## 15. Phases (Feature 3)

1. **Phase F — Parent-by-email lookup.** Build `findParentByEmail`; unit-test exact/normalized match. (Foundational, isolated.)
2. **Phase G — Auto email→PSR pipeline.** `ProjectEmailConfig.intakeMode`; PSR-aware worker branch (thread → parent → triage); auto-ack. Gate behind `intakeMode="psr"` so nothing else changes.
3. **Phase H — PSL triage identification.** Unidentified → EmailIntake `needsIdentification`; triage UI identify-then-convert; student-name fallback (E3).
4. **Phase I — Two-way "Request info from parent".** `requestParentInfo` endpoint + UI; awaiting-info flag; inbound reply threads back into PSR (verify `findEmailThread`).
5. **Phase J — Attachments + detail polish.** Email attachments → PSR; "Emails" tab + provenance badges; settings UI.

---

## 16. Acceptance criteria (Feature 3)
- [ ] `findParentByEmail` returns the right parent+children for an exact MDM email; null when absent.
- [ ] Email to a `intakeMode="psr"` mailbox with a **known** parent → auto-creates a PSR (`interactionType="PSR"`, `channel/modeOfContact="email"`, `submissionSource="email"`, `classification="existing_parent"`, `metadata.parent/children/emailMessageId`), routed via matrix, parent auto-acked.
- [ ] Email from an **unknown** sender → lands in PSL triage as `needsIdentification`, **no** auto-PSR.
- [ ] PSL identifies parent in triage → convert produces a parent-linked PSR.
- [ ] PSL "Request info from parent" sends a threaded email; PSR shows awaiting-info.
- [ ] Parent's reply is matched to the **same** PSR and appears in Emails/Replies; awaiting-info clears.
- [ ] Reply to an already-open PSR does **not** create a duplicate PSR.
- [ ] Email attachments appear on the PSR.
- [ ] `normal_ticket` mailboxes behave exactly as before (no regression). Both apps build clean.

---

## 17. Open questions — Feature 3 (DECISIONS NEEDED)
- **Q5.** Add `ProjectEmailConfig.intakeMode` (`psr`/`triage`/`normal_ticket`) so only designated mailboxes auto-PSR? *(Rec: yes — clean opt-in, zero regression.)*
- **Q6.** Hybrid (auto-PSR when parent confidently identified, else PSL triage), or **always** route through PSL triage first? *(Rec: hybrid.)*
- **Q7.** Awaiting-parent-info: lightweight `metadata` flag (no FSM change) or a real status? Pause SLA while awaiting? *(Rec: metadata flag + optional SLA pause.)*
- **Q8.** Student-name fallback (E3) — implement now (parse + match MDM children), or defer and send all unidentified to PSL triage? *(Rec: defer parsing; ship triage path first, add matching in Phase H.)*
- **Q9.** Auto-categorization — leave auto-PSRs **uncategorized** for PSL, or set a configurable **default PSR category**? *(Rec: configurable default, PSL refines.)*

---

*Part I (walk-in) and Part II (email) implementation-ready. Phase F (`findParentByEmail`) safest standalone start for Feature 3.*

---
---

# PART III — Feature 4: IVR (TATA Telephony) → PSR

> **Status:** Planning · added 2026-06-26. Builds on Part II (parent-by-phone mirrors parent-by-email; both feed `createServiceRequest`). Reference UI = prototype mockups (IVR Calls Integration list + "Convert Unregistered Call" wizard).

## 18. Feature 4 — scope & user story

> A parent dials one **common number**. **TATA telephony** answers, records the call, and stores
> the **recording on TATA's own database** (external). The agent (PSL) sees the call in an **IVR Calls
> list** with caller, school, time, duration, call type (answered/missed/voicemail) and a **link to the
> recording** (no in-app player — just open the external link). The agent talks to the parent and,
> **during or after** the call, **converts the call into a PSR**. If the **caller's phone number is in the
> MDM database**, the system fetches **parent name, student name, school** automatically; the agent then
> picks **category + sub-category** and the PSR is created. The 6 **classify channels** (existing_parent,
> prospect_parent, vendor, job, junk, others — already per-project configurable) decide routing:
> **admission enquiry → CRM**, **job enquiry → HR**, **vendor → procurement**, **junk → mark junk (no SR)**,
> existing/others → PSR. Each category's **input form is customizable**.

**Registered vs unregistered caller (from mockups):**
- **Registered** (phone matches MDM/User) → **"Raise SR"** — parent/student pre-filled, straight to form.
- **Unregistered** → **"Convert SR"** — classify first (pick channel), then channel-specific form/outcome.

---

## 19. Current state — IVR subsystem (verified)

> Substantial scaffolding exists. This feature is mostly **wiring + telephony + MDM**, not greenfield.

### 19.1 Backend (built)
- `models/CallIntake.ts` — fields: `externalId`(unique, telephony idempotency), `callerName`, `callerMobile`(idx), `schoolName`, `callType("answered"|"missed")`, `durationSeconds`, **`voiceNoteUrl`(String — external recording URL)**, `receivedAt`, `registered`(bool), `studentUserId`, `studentCount`, `requesterType("existing_parent"|"prospective_parent"|"left_parent"|"vendor"|"job"|"junk"|"other")`, `callStatus("new"|"assigned"|"converted")`, `convertedTicketId/Number/At`, `status("open"|"closed")`, `resolvedOnCall`(OCR), `assignedTo`, `remark`.
- `modules/service-request/callTriage.ts` — `ingestCall()`(`:41`, runs `matchCaller`), `listCalls()`(`:76`), `getCall()`(`:108`), `classifyCall()`(`:114`), **`convertCall()`(`:129` → `createServiceRequest({channel:"ivr", modeOfContact:"telephone"})`)**, `resolveCallOnCall()`(`:181`, OCR no-SR).
- `matchCaller()` (`callTriage.ts:28`) — **LOCAL User DB only** (`$or:[{mobile},{parentMobile},{phone}]`, 10-digit normalize). Sets `registered`, `studentUserId`, `requesterType="existing_parent"`.
- Routes `routes/ivr.ts` → `/api/ivr/calls` (POST ingest, GET list, GET :id, POST :id/classify, POST :id/convert, POST :id/resolve-on-call). Guards: `SR_PSR_CREATE` / `SR_PSR_RECEIVE` / `EMAIL_TRIAGE_ACCESS` (no IVR_* codes). Mounted `server.ts:301`.

### 19.2 Frontend (built)
- `pages/IVRCalls.tsx` (`:66`) — call list + **inline** convert UI (`REQUESTER_TYPES` dropdown `:37`, category dropdown, Convert / Resolve-on-call buttons). Rendered embedded in `pages/ServiceRequestsHub.tsx` tab `"ivr"` (`:39`). Legacy redirect `/ivr-calls` → `?tab=ivr` (`App.tsx:620`).
- API client `services/serviceRequests.ts:103` — `serviceRequestApi.ivr.{list, convert, resolveOnCall}`.
- Classify-channel cards live in `ServiceRequestCreate.tsx` (`DEFAULT_CHANNELS :54`, `renderClassifyStep :564`) — **reusable** for IVR convert. IVRCalls currently does NOT use them (hardcodes `REQUESTER_TYPES`).
- `components/sr/PslCallTab.tsx` — **unrelated** (post-PSR satisfaction call, not inbound intake).

### 19.3 Reused funnel
`convertCall()` → `createServiceRequest()` — same single funnel as walk-in (Part I) and email (Part II). Only pre-identification + classification differ.

---

## 20. Gap analysis (Feature 4)

| # | Requirement | Current state | Action |
|---|-------------|---------------|--------|
| I1 | **TATA inbound webhook** auto-creates call records | Manual POST only (`ivrController` comment "normally a Tata webhook") | Build **`POST /api/ivr/webhook/tata`** (public/secured by shared secret) → `ingestCall()`; idempotent via `externalId`; store `voiceNoteUrl`. |
| I2 | Recording = **external link**, no player | `voiceNoteUrl` is a URL; `IVRCalls.tsx` shows a **player** | Replace player with an **"Open recording ↗"** link (new tab) when `voiceNoteUrl` present; "—" otherwise. |
| I3 | Identify caller from **MDM** by phone → parent/student/school | `matchCaller` = **local User DB only** | Build **`findParentByPhone(mobile, projectId?, mdmSourceId?)`** in `mdmService.ts`; wire into `ingestCall`/convert to prefill `parent`, `children`, `schoolName`. |
| I4 | **prospect_parent → CRM** (admission) | `convertCall` makes a PSR for all types; lead NOT created | In convert, branch `prospective_parent` → **create Lead** (`source:"ivr"`, Lead model ready), NOT a PSR (mirror `emailTriage` lead case). |
| I5 | **job → HR**, **vendor → procurement** forward | routing targets defined in `types.ts`, **no handler** (forward is recorded-only project-wide) | Implement forward: create ISR routed to HR/procurement dept **and/or** email-forward. (Shared gap with Part II §13 D-Q.) |
| I6 | **junk → mark junk** (no SR) | `convertCall` would still create a PSR | Add **`markJunk(callId)`** → `requesterType="junk"`, `status="closed"`, no SR. |
| I7 | **Per-category customizable input form** | SR `form-schemas` endpoints exist (Part I); IVR convert uses fixed fields | Drive IVR convert form from the **classify-channel + form schema** (vendor: Company/Contact/Nature; prospect: Contact/Inquiry; etc. as in mockups). |
| I8 | Convert **during or after** call; **OCR** (resolved on call) | `resolveCallOnCall` exists | ✅ Keep. Surface OCR clearly in UI. |
| I9 | **Registered → "Raise SR"** vs **unregistered → "Convert SR"** | List has both labels in mockup; logic not branched | Branch action by `registered`: registered → skip classify, prefill parent, open form; unregistered → classify wizard first. |
| I10 | Reuse the **6 configurable classify channels** | IVR hardcodes `REQUESTER_TYPES`; SR uses `classifyChannels` config | Switch IVR convert to the project's `classifyChannels` (single source of truth). Reconcile naming **`prospective_parent`↔`prospect_parent`**. |
| I11 | Stepper Wizard vs Single Form toggle (mockup) | Inline simple form | Optional UX: two render modes for convert. Low priority. |
| I12 | Permissions | Reuses SR perms | Optional: add `IVR_VIEW` / `IVR_CONVERT` codes, or keep SR_PSR_*. *(Decision Q14.)* |

---

## 21. Target pipeline (Feature 4)

```
Parent dials common number → TATA answers + records (recording stays on TATA DB)
   │  TATA → webhook POST /api/ivr/webhook/tata  {externalId, callerMobile, callType,
   │         durationSeconds, voiceNoteUrl(link), receivedAt}              (BUILD I1)
   ▼
ingestCall()
   ├─ findParentByPhone(callerMobile) via MDM  (BUILD I3)
   │     match? → registered=true, parent{name,school}, children[], studentUserId, requesterType=existing_parent
   │     none?  → registered=false, requesterType=other
   ▼
IVR Calls list (IVRCalls.tsx)  — caller, school, time, duration, callType,
   recording LINK (I2), status, callStatus, action:
        registered → [Raise SR]        unregistered → [Convert SR]
   │
Agent talks to parent, then acts:
   ├─ Existing/Others        → convertCall(categoryId, subcat) → createServiceRequest({channel:"ivr",
   │                              modeOfContact:"telephone", classification, parent, children})  → PSR
   ├─ Prospect (admission)   → create Lead(source:"ivr") → CRM            (BUILD I4)  [no PSR]
   ├─ Job                    → forward to HR (ISR to HR dept / email)     (BUILD I5)
   ├─ Vendor                 → forward to Procurement (ISR / email)       (BUILD I5)
   ├─ Junk                   → markJunk(): status=closed, no SR           (BUILD I6)
   └─ Resolved on call (OCR) → resolveCallOnCall(): closed, no SR         (EXISTS I8)

Convert form per channel = classifyChannels + form-schema (I7).  CallIntake.callStatus→"converted",
convertedTicketId/Number set. PSR carries metadata.callIntakeId + voiceNoteUrl for traceability.
```

**Invariant:** existing/others end at `createServiceRequest()`; prospect/job/vendor/junk **diverge** (lead/forward/junk) — IVR is the first channel that genuinely uses all 6 classify routings, so §I4–I6 forwarding is the real net-new logic.

---

## 22. Design decisions (Feature 4)

- **D12. Telephony config model.** Add a `TelephonyConfig` (or reuse `MDMSource`-style pattern): per-project TATA account, webhook secret, recording base URL. Webhook validates secret + `projectId`. *(Decision Q10.)*
- **D13. Recording is a link, never proxied.** Store only `voiceNoteUrl`; UI opens it in a new tab. Do not download/host audio. (Matches requirement + avoids storage/PII.) 
- **D14. `findParentByPhone` reuses Feature-3 pattern.** Same MDM-source resolution + `normalizeParent`; exact match on normalized 10-digit mobile, then fall back to local `matchCaller`. Build both phone+email lookups in one `mdmService` pass.
- **D15. Classify channels are the single source of truth.** Retire IVR's hardcoded `REQUESTER_TYPES`; read `Project.configuration.sr.classifyChannels`. Reconcile `prospective_parent`→`prospect_parent` (keep CallIntake enum, map at the boundary, or migrate enum). *(Decision Q11.)*
- **D16. Forwarding mechanism.** For job/vendor: create an **ISR auto-routed to the HR/Procurement department** (via the assignment matrix `Category.department`) rather than blind email — keeps it tracked in-system; optionally also email. Prospect → **Lead** only (CRM). *(Decision Q12.)*
- **D17. Junk = soft archive.** `markJunk` closes the CallIntake, no SR, audit remark; reversible. 
- **D18. Per-category forms via existing `form-schemas`.** The convert UI loads the schema bound to the chosen channel/category and renders dynamic fields → `metadata.formData` (already supported by `createServiceRequest`). *(Decision Q13.)*
- **D19. Permissions.** Default: reuse `SR_PSR_CREATE`/`SR_PSR_RECEIVE`. Optionally seed `IVR_VIEW`/`IVR_CONVERT` for cleaner role design. *(Decision Q14.)*

---

## 23. Implementation changes (Feature 4)

### 23.1 Backend
| File | Change |
|------|--------|
| **NEW** `models/TelephonyConfig.ts` | Per-project TATA config: account id, webhook secret (encrypted), recording base URL, enabled. (Mirror `ProjectEmailConfig` encryption pattern.) |
| **NEW** `routes/ivr.ts` + `ivrController.ts` `webhookTata()` | `POST /api/ivr/webhook/tata` — validate secret → map payload → `ingestCall()`; idempotent on `externalId`; persist `voiceNoteUrl`. |
| `services/mdmService.ts` | **NEW** `findParentByPhone(mobile, projectId?, mdmSourceId?)` (+ companion `findParentByEmail` from Feature 3). |
| `modules/service-request/callTriage.ts` | `ingestCall`: call `findParentByPhone` before/with `matchCaller`, prefill parent/children/schoolName. `convertCall`: branch by `requesterType`/channel — existing/others → PSR (as now); **prospect → Lead**; **job/vendor → forward ISR**; add **`markJunk()`**. Pass `metadata.callIntakeId`, `metadata.voiceNoteUrl`, `classification`. |
| `modules/service-request/leadIntake` (or `emailTriage` lead helper) | Reuse/extract Lead-creation helper so IVR + email share it (`source:"ivr"|"email"`). |
| `modules/service-request/types.ts` | Reconcile `requesterType` ↔ `classifyChannels` keys (mapping or enum migration). |
| `utils/seedRolesPermissions.ts` (optional) | Seed `IVR_VIEW`, `IVR_CONVERT` if chosen (Q14). |

### 23.2 Frontend
| File | Change |
|------|--------|
| `pages/IVRCalls.tsx` | (a) Replace recording **player → "Open recording ↗" link** (I2). (b) Action button: `registered ? "Raise SR" : "Convert SR"` (I9). (c) Convert UI: use **classifyChannels** cards (I10) + **per-channel dynamic form** from form-schema (I7). (d) Show prefilled parent/student/school from MDM (I3). (e) Junk button → `markJunk`. (f) Prospect → lead-forward confirmation; job/vendor → forward confirmation. |
| `services/serviceRequests.ts` | Extend `serviceRequestApi.ivr` with `classify`, `markJunk`, and convert payloads carrying channel + formData. |
| `pages/ServiceRequestSettingsHub.tsx` | New **Telephony** settings card (TATA config, webhook URL/secret, recording base URL). |
| (reuse) classify cards + form-schema renderer | Factor the classify-card + dynamic-form bits out of `ServiceRequestCreate.tsx` so IVRCalls + email-triage + walk-in share them. |

---

## 24. Phases (Feature 4)

1. **Phase K — `findParentByPhone` (+ `findParentByEmail`).** MDM exact lookups. Foundational, isolated. (Combine with Feature 3 Phase F.)
2. **Phase L — TATA webhook + recording link.** `TelephonyConfig`, `POST /ivr/webhook/tata`, idempotent ingest; UI recording link. Real calls start flowing.
3. **Phase M — MDM-prefilled convert + Raise/Convert branch.** Wire phone lookup into ingest/convert; registered→Raise, unregistered→Convert; classifyChannels as source of truth.
4. **Phase N — Routing divergence.** prospect→Lead/CRM, job/vendor→forward ISR, junk→markJunk. The net-new business logic.
5. **Phase O — Per-category dynamic forms + polish.** form-schema-driven convert; stepper/single toggle; settings UI.

---

## 25. Acceptance criteria (Feature 4)
- [ ] TATA webhook creates a CallIntake (idempotent on `externalId`); duplicate POST does not double-insert.
- [ ] `voiceNoteUrl` shows as an **external link** ("Open recording ↗"); no in-app player; "—" when absent.
- [ ] `findParentByPhone` returns parent+children+school for a known MDM mobile; null otherwise.
- [ ] Registered caller → "Raise SR" with parent/student/school **prefilled**; unregistered → "Convert SR" classify flow.
- [ ] existing_parent/others convert → PSR (`channel:"ivr"`, `modeOfContact:"telephone"`, `classification`, `metadata.callIntakeId`+`voiceNoteUrl`), routed via matrix; CallIntake `callStatus="converted"` + `convertedTicketNumber`.
- [ ] prospect_parent → **Lead** (`source:"ivr"`) in CRM, **no PSR**.
- [ ] job → routed to HR; vendor → routed to Procurement (tracked ISR and/or email).
- [ ] junk → `markJunk` closes call, **no SR**.
- [ ] OCR "resolved on call" closes call, no SR.
- [ ] Per-channel custom form fields persist to `metadata.formData`.
- [ ] Classify channels come from project config (not hardcoded); `prospective_parent`/`prospect_parent` reconciled.
- [ ] Both apps build clean; manual-ingest path still works for testing.

---

## 26. Open questions — Feature 4 (DECISIONS NEEDED)
- **Q10.** Telephony config — new `TelephonyConfig` model per project (TATA account + webhook secret + recording base URL), or hardcode env for now? *(Rec: model, mirrors ProjectEmailConfig.)*
- **Q11.** Reconcile `requesterType` (`prospective_parent`) with classify keys (`prospect_parent`) — map at boundary, or migrate the CallIntake enum? *(Rec: map at boundary now; migrate later.)*
- **Q12.** job/vendor forwarding — create a tracked **ISR routed to HR/Procurement** dept, a raw **email forward**, or **both**? *(Rec: tracked ISR via matrix; email optional.)*
- **Q13.** Per-category custom forms — reuse existing SR **`form-schemas`** for IVR convert now, or ship fixed per-channel fields first and add schemas later? *(Rec: fixed fields first (Phase N), schema-driven in Phase O.)*
- **Q14.** Add `IVR_VIEW`/`IVR_CONVERT` permissions, or keep reusing `SR_PSR_*`? *(Rec: add the two codes for clean role design.)*
- **Q15.** Recording link — open raw TATA URL directly, or proxy through backend with auth (TATA URLs may be unauthenticated/expiring)? *(Rec: confirm TATA URL auth model; proxy if links are sensitive/expiring.)*

---

## 27. Cross-feature shared work (build once, use everywhere)
These appear in multiple features — build as shared utilities, not per-feature:
- **MDM exact lookups** — `findParentByEmail` (F3) + `findParentByPhone` (F4) in `mdmService.ts`. *(Phase F/K — do together.)*
- **Classify-channel cards + dynamic form-schema renderer** — shared by walk-in wizard (F2), email triage (F3), IVR convert (F4). Factor out of `ServiceRequestCreate.tsx`.
- **Lead creation helper** (`source` per channel) — email (F3) + IVR prospect (F4).
- **Forward-to-dept (HR/Procurement)** — email forward (F3 E?) + IVR job/vendor (F4 I5). Currently recorded-only project-wide → real gap.
- **`createServiceRequest()` funnel** — already shared by all four channels. Keep it the single convergence point.

---

*Parts I–III (walk-in, email, IVR) implementation-ready. Recommended global start: **Phase F/K** — MDM `findParentBy{Email,Phone}`.*

---
---

# PART IV — Feature 5: Parent Web-App Self-Service PSR + Assignment Routing

> **Status:** Planning · added 2026-06-26. Channel 4 of Feature 1. Builds on MDM lookups (F3/F4) + form-schemas (F1). Introduces the **assignment-method** question for ALL PSRs.

## 28. Feature 5 — scope & user story

> A parent opens the **web app**, fills a self-service form: **phone, email, name, student name**.
> As they type **phone or email**, the system **auto-fetches** parent + student + school from **MDM**.
> If **not found**, the parent **manually enters** student details + school name (and possibly **roll
> number** — *open for confirmation*). The parent **selects category + sub-category** (dropdowns **or a
> search box** that fills both). On submit, a **PSR is created directly** and appears in the PSR list.
> The form and its fields are **customizable per project and permission-based**. The new PSR must be
> **assigned to an agent** — **by what method? round-robin / load-balanced / by-role / matrix?** *(open
> question — §33.)*

---

## 29. Current state (verified)

### 29.1 Parent portal — NOT built (precedents exist)
| Thing | State | File |
|-------|-------|------|
| Parent login/auth | **NOT FOUND** — only `studentAuth` (OTP), `projectAuth` (staff) | `routes/studentAuth.ts`, `routes/projectAuth.ts` |
| Generic **OTP service** (reusable) | ✅ `POST /api/otp/send-phone · send-email · verify` (6-digit, 10-min TTL, purpose `field_verification`) | `routes/otp.ts`, `controllers/otpController.ts` |
| Public PSR endpoint | **NOT FOUND** — all `/api/service-requests` auth+`SR_PSR_CREATE` gated | `routes/serviceRequest.ts:10` |
| Public ticket form precedent | ✅ `StudentPortal.tsx` (unauthenticated, student-ID based) + `/api/v1/tickets/lms-form` (X-API-Key) creating **regular tickets** | `pages/StudentPortal.tsx`, `routes/publicApi.ts:86` |
| **Configurable online form** precedent | ✅ `project.configuration.ticketSubmissionSettings.onlineFormFields` drives a dynamic public form (tickets) | `controllers/publicApiController.ts:244` |
| Parent records | Users with `parentMobile` (STUDENT role); `registrationSource` enum incl `"online"` | `models/User.ts:13,164` |
| Parent lookup | `GET /parent-lookup` (MDM + internal fallback) — but **staff-gated** (`SR_PSR_CREATE`) | `controllers/serviceRequestController.ts:308` |

### 29.2 Assignment routing — rich, but PSR underuses it
| Mechanism | State | File |
|-----------|-------|------|
| `CategoryAssignmentConfig` | ✅ per-category: `mode ∈ round-robin · by-role · by-user · manual`; `agentPool[]`, `rolePool[]`, `ccUsers[]`, `ccRoles[]`; hierarchy walk leaf→root | `models/ticket-module/CategoryAssignmentConfig.ts` |
| `ticketAutoAssignment.ts` | ✅ `getNextRoundRobinAgent()`, `resolveAgentFromConfig()`, `autoAssignTicket()` (category→project cascade) | `utils/ticketAutoAssignment.ts` |
| Load-balanced | ⚠️ `getLeastLoadedAgent()` exists but **NOT wired** into autoAssign | `controllers/ticketController.ts:203` |
| Project-level default | `ticketAssignmentSettings.assignmentType ∈ round-robin · load-balanced · manual · condition-based` | `models/Project.ts:114` |
| `Ticket.assignedVia` | tracks `manual · round-robin · by-role · by-user · condition-based · fallback` | `models/Ticket.ts:169` |
| **SR routing reality** | ⚠️ `resolveSrRouting()` returns the assignment config, but **`createServiceRequest` just takes `agentPool[0]`** — **PSRs do NOT actually round-robin** | `srMasterData.ts:36`, `createServiceRequest.ts:137` |
| OOO auto-reroute | **NOT FOUND** — delegation is **manual** (`delegateSr`) | `serviceRequestService.ts:286` |
| UserGroup / Team / pool model | **NOT FOUND** — pools are inline arrays in `CategoryAssignmentConfig` or derived from Role | — |

> **Key takeaway:** the machinery for round-robin/by-role/by-user already exists for *tickets*; PSR creation simply doesn't call it. Wiring SR → `CategoryAssignmentConfig`/`autoAssignTicket` fixes assignment for **all** PSRs (walk-in, email, IVR, web), not just this feature.

---

## 30. Gap analysis (Feature 5)

| # | Requirement | Current state | Action |
|---|-------------|---------------|--------|
| P1 | Parent self-service **entry point** (web app) | No parent portal | Build a **public PSR form page** + route (pattern: `StudentPortal`). *(Auth model = §31 D20.)* |
| P2 | **Public PSR create endpoint** (no staff perm) | All SR routes staff-gated | Build **`POST /api/service-requests/public`** — **OTP-verified**, rate-limited, no `SR_PSR_CREATE`. |
| P3 | Auto-fetch parent/student/school as parent types **phone/email** | `parent-lookup` is staff-gated, fuzzy | Build **public, OTP-gated lookup** using `findParentByPhone/Email` (F3/F4). Prefill student, school. |
| P4 | If not found → **manual** student + school entry | Manual path designed in Part I (walk-in) | Reuse manual-entry pattern: parent types student name, school. |
| P5 | **Roll number** auto-fetch | Not designed | **OPEN — Q16.** Confirm whether MDM child record carries roll number and whether to auto-fill it. |
| P6 | Category + sub-category **select OR search** | Wizard has category load + leaf list | Reuse; add a **search box** that resolves to a leaf category (fills both). Proactive help via `Category.sr.proactiveHelpText`. |
| P7 | **Direct PSR creation** → appears in list | `createServiceRequest` funnel | Public endpoint → `createServiceRequest({channel:"online", modeOfContact:"portal", submissionSource:"web", classification:"existing_parent"/"self_service"})`. |
| P8 | Form **customizable per project + permission-based** | `form-schemas` + `onlineFormFields` precedents | Add a **parent-intake form config** (which fields shown/required, which categories allowed). Admin-managed. |
| P9 | **Assignment** of the new PSR to an agent | PSR picks `agentPool[0]` (no real distribution) | **Wire SR → `CategoryAssignmentConfig`/`autoAssignTicket`** so mode (round-robin/by-role/by-user) is honored. *(Method = §33 Q17.)* |
| P10 | Parent identity persistence | metadata.parent vs User upsert (Part I D-Q2) | **OPEN — Q18.** Upsert a parent User (`registrationSource:"online"`) or store metadata only. |
| P11 | Abuse protection (public form) | none | OTP gate + rate limit + optional captcha; spam → junk classification. |

---

## 31. Architecture options — parent entry (DECISION D20 / Q15)

**Option A — Public OTP-verified form (no login). *Recommended.***
Parent enters phone/email → receives OTP → verifies → form unlocks → fills + submits. No session, no parent account. Mirrors `StudentPortal` + reuses `/api/otp`. Lightest; matches "parent fills a form" requirement.

**Option B — Authenticated parent portal.**
New `parentAuth` flow (OTP login issues a PARENT-scoped token), parent dashboard, view past PSRs, reopen, feedback. Heavier; needs a PARENT role + token + guarded routes. Better long-term (parents track tickets) but larger build.

> **Rec:** ship **Option A** now (fast, low-risk public intake). Layer **Option B** later as a "Parent Portal" feature (ties into existing `parent-close`/reopen, which are already auth-gated). Keep open — **Q15**.

---

## 32. Target flow (Feature 5, Option A)

```
Parent → web app → /psr/new  (public page)
  1. Enter phone OR email  →  Send OTP  →  Verify OTP            (reuse /api/otp)
  2. On verify → public lookup: findParentByPhone/Email (MDM)    (BUILD P3, reuse F3/F4)
        found?   → prefill parent name, student(s), school (+ roll# if Q16=yes)
        none?    → parent manually enters student name, school   (P4)
  3. Category + sub-category: dropdowns OR search box → leaf      (P6)
  4. Custom fields (per project parent-intake config)            (P8)
  5. Subject + description (+ attachments)
  6. Submit → POST /api/service-requests/public (OTP-token)      (BUILD P2)
        → createServiceRequest({ channel:"online", modeOfContact:"portal",
             submissionSource:"web", classification:"existing_parent",
             parent{...}, children[...]|studentName, categoryId, metadata.formData })
        → ASSIGNMENT: autoAssignTicket / CategoryAssignmentConfig (BUILD P9, §33)
        → PSR appears in ServiceRequests.tsx list (Mode=Portal, Source=web)
        → auto-ack to parent (reuse sendTicketCreatedEmail / SMS)
```

---

## 33. Assignment routing — the OPEN design question (Q17)

**What EXISTS (reuse, don't rebuild):** `CategoryAssignmentConfig` (round-robin / by-role / by-user / manual) + `autoAssignTicket()` + `getNextRoundRobinAgent()`. Load-balanced (`getLeastLoadedAgent`) exists but unwired.

**The decision — how should a parent-created (and every) PSR be assigned?**

| Method | Exists? | Behaviour | Best when |
|--------|:------:|-----------|-----------|
| **Round-robin** | ✅ | Rotate evenly across `agentPool` (or all project agents) | Fair distribution, equal-skill agents |
| **Load-balanced** | ⚠️ unwired | Assign to agent with fewest active tickets (`getLeastLoadedAgent`) | Uneven workloads; needs wiring |
| **By-role** | ✅ | Round-robin within a role pool | Skill/department teams |
| **By-user** | ✅ | Fixed/rotated explicit user pool | Small teams, named owners |
| **By-category → department** | partial | `Category.department` exists but **unused**; would route to a dept team | Dept ownership (needs Dept→users) |
| **Manual** | ✅ | Land in an unassigned queue; PSL/lead picks up | Triage-first orgs |
| **Matrix (multi-condition)** | ❌ | Rules on category+location+priority → assignee (prototype `MatrixRule`) | Complex routing (future) |

> **Recommendation:** **wire SR creation to `CategoryAssignmentConfig` + `autoAssignTicket`** and default to the **per-category `mode`** (start `round-robin`), with **project-level fallback**. Optionally enable **load-balanced** by wiring `getLeastLoadedAgent` into `autoAssignTicket`. This makes the method **configurable per category** rather than a single hardcoded choice — and fixes assignment for **all four channels**, not just web. **Confirm — Q17.**

---

## 34. Implementation changes (Feature 5)

### 34.1 Backend
| File | Change |
|------|--------|
| **NEW** `routes/publicServiceRequest.ts` + controller | `POST /api/service-requests/public` (OTP-token gated, rate-limited) → `createServiceRequest`. `GET /api/service-requests/public/parent-lookup` (OTP-gated) → `findParentByPhone/Email`. |
| `controllers/otpController.ts` | Add a PSR-intake OTP purpose; issue a short-lived intake token on verify (to authorize the public POST). |
| `modules/service-request/createServiceRequest.ts` | **Wire assignment**: replace `agentPool[0]` with `autoAssignTicket()` / `resolveAgentFromConfig()` so `mode` is honored; set `Ticket.assignedVia`. Accept `channel:"online"`, `modeOfContact:"portal"`. |
| `utils/ticketAutoAssignment.ts` | Expose a reusable `assignForSR(projectId, categoryId)` entry; optionally wire `getLeastLoadedAgent` for load-balanced. |
| **NEW** `Project.configuration.sr.parentIntakeForm` (config) | Field list (shown/required), allowed categories, OTP channel (phone/email/both), captcha toggle. |
| `models/User.ts` (optional) | Parent upsert path (`registrationSource:"online"`) — *Q18.* |

### 34.2 Frontend
| File | Change |
|------|--------|
| **NEW** `pages/ParentPsrPortal.tsx` (public) + route | Multi-step public form: contact+OTP → identify(MDM)/manual → category(select/search) → details → submit. Pattern from `StudentPortal.tsx`. |
| `App.tsx` | Public route (no `ProtectedRoute`), e.g. `/:customUrlPath/psr/new` or `/psr/new`. |
| **NEW** `services/publicSr.ts` | Public API client (otp, lookup, create). |
| `pages/ServiceRequestSettingsHub.tsx` | **Parent Intake Form** admin tab (fields, required, allowed categories, OTP channel, captcha). |
| (reuse) classify/category + dynamic-form renderer | Shared component from §27. |

---

## 35. Security (public, outward-facing — handle carefully)
- **OTP-gate every public call** (lookup + create); never expose `parent-lookup` unauthenticated (it leaks PII).
- **Rate-limit + optional captcha** on OTP send + submit (note: CLAUDE.md says rate limiting is disabled in prod — must enable for these routes specifically).
- **Minimal lookup response** — return only the verified parent's own children, never a search list, on the public lookup.
- **Validate project scope** from the public URL path; never trust a client-supplied `projectId` alone.
- Spam submissions → `classification:"junk"`; auto-close.

---

## 36. Phases (Feature 5)
1. **Phase P — Wire SR assignment** to `CategoryAssignmentConfig`/`autoAssignTicket` (fixes ALL PSR channels; isolated, high value). *(Can ship before the portal.)*
2. **Phase Q — Public OTP-gated endpoints** (`/public` create + lookup) + intake token.
3. **Phase R — Parent PSR portal page** (Option A form, MDM prefill + manual fallback, category select/search).
4. **Phase S — Parent-intake form config** (customizable, permission-based) + admin UI.
5. **Phase T — Hardening** (rate limit, captcha, auto-ack, abuse/junk).

---

## 37. Acceptance criteria (Feature 5)
- [ ] Parent verifies phone/email via OTP before any data is fetched or submitted.
- [ ] Known parent → student(s)+school prefilled from MDM; unknown → manual entry works.
- [ ] Category via dropdowns OR search box (search fills the leaf + path).
- [ ] Submit creates a PSR (`channel:"online"`, `modeOfContact:"portal"`, `submissionSource:"web"`) visible in the PSR list.
- [ ] New PSR is **assigned by the configured method** (round-robin verified by rotation across ≥2 agents); `assignedVia` recorded.
- [ ] Parent-intake form fields honor per-project config (shown/required/allowed categories).
- [ ] Public endpoints reject non-OTP-verified calls and are rate-limited.
- [ ] Auto-acknowledgement sent to parent.
- [ ] Both apps build clean; staff create paths unaffected (regression).

---

## 38. Open questions — Feature 5 (DECISIONS NEEDED)
- **Q15.** Entry model: **public OTP form (Option A, rec)** now, or full **authenticated parent portal (Option B)**?
- **Q16.** **Roll number** — does the MDM child record carry a roll number, and should the form **auto-fill** it (read-only) or let the parent enter it? *(USER FLAGGED OPEN — confirm.)*
- **Q17.** **Assignment method** for PSRs — adopt **per-category `CategoryAssignmentConfig` mode (rec, default round-robin)** with project fallback? Also wire **load-balanced**? Or a single global method? *(USER FLAGGED OPEN.)*
- **Q18.** Parent identity — **upsert a parent User** (`registrationSource:"online"`) on submit, or store `metadata.parent` only? *(Consistent with Part I Q2.)*
- **Q19.** OTP channel — phone, email, or **either** (parent's choice)? Captcha required?
- **Q20.** Portal URL — project-scoped (`/:customUrlPath/psr/new`) or a single global entry resolving project from parent's MDM record?

---

## 39. Cross-feature note (update to §27)
- **MDM exact lookups** now power **3** features (email F3, IVR F4, web F5) — confirms Phase F/K as the top-priority shared build.
- **SR assignment wiring (Phase P)** is shared by **all four channels** (walk-in/email/IVR/web) — recommend doing it early; it is currently the single biggest correctness gap (PSRs don't truly distribute).
- **OTP + parent identification + manual-fallback** pattern is shared by walk-in (F2), web (F5), and RE-entry.

---

*Parts I–IV cover walk-in, email, IVR, parent web self-service + assignment wiring. Foundational shared builds: **Phase F/K** (`findParentBy{Email,Phone}`) and **Phase P** (wire SR assignment).*

---
---

# PART V — Feature 6: Sub-ISR under PSR · PSR↔PSR Linking · Duplicate Detect & Combine

> **Status:** Planning · added 2026-06-26. Mostly **surfacing existing infra** + 3 real builds. Three distinct concepts — keep them separate (§40).

## 40. Three concepts — do NOT conflate

| Concept | Meaning | Destructive? | State |
|---------|---------|:---:|-------|
| **Sub-ISR / Linked ISR** | Agent delegates internal work: create a child ISR under a PSR (or link an existing ISR). Child ISRs roll up progress to the PSR. | No | ✅ **Built** (LinkedIsrPanel). Add: pause visibility + progress→status. |
| **Link (Related / Duplicate-link)** | Non-destructive relationship between two tickets. ISR→PSR exists; **PSR↔PSR does not**. Both tickets stay open. | No | ⚠️ ISR→PSR only. PSR↔PSR = **build**. |
| **Combine / Merge** | Absorb duplicate(s) into one primary; secondaries closed, content moved, "combined" badge, shows merged-with. | Yes (closes secondaries) | ✅ **Built at Ticket level** (`mergeTickets`/TicketMergeModal). Surface for SR + drive from dup-detection + list. |

## 41. Feature 6 — scope & user story

> In a PSR, the agent **creates sub-ISRs** (or **links existing ISRs**) to delegate internal tasks to
> different people. Each linked ISR's **status is visible** in the PSR; their **progress rolls up** and
> **helps update the PSR status**; if an ISR is **paused/blocked**, that state is shown. Each ISR can be
> **reassigned**. On the **PSR list page**, the agent can **link multiple PSRs into one PSR**. A
> **duplicate-detection mechanism** flags duplicate ISRs/PSRs so they can be **combined**; a combined
> ticket carries a **"combined" status/badge**, and opening it **shows which ticket it was combined with**.

---

## 42. Current state (verified)

### 42.1 Sub-ISR / linked ISR — built
- `components/sr/LinkedIsrPanel.tsx` — `createLinked()` (`:119`, nav to create wizard w/ `linkedPsrId` state), `link()` (`:102`, `linkPsr`), progress bar done/total (`:166`), per-ISR `StatusPill` + assignee (`:232`), perms `canCreate=SR_ISR_CREATE`, `canLink=SR_ISR_CREATE|SR_REASSIGN`.
- Backend `serviceRequestService.ts` — `listLinkedIsrs(psrId)` (`:670`, returns `{items,total,done}`, done=status∈[4,5]), list rollup aggregate (`:636`) → `it.linkedIsr{total,done}`.
- `createServiceRequest.ts:94` — linkedPsrId validation (ISR-only, same project).
- `ServiceRequests.tsx` — `LinkedIsrCell` (`:200`) progress + popover.
- Reassign/delegate — `reassignSr()` (`:261`), `delegateSr()` (`:287`); `POST /:id/reassign`(SR_REASSIGN), `/:id/delegate`(SR_DELEGATE).

### 42.2 Merge / combine — built at Ticket level
- `models/Ticket.ts` — `isMerged`(`:130`), `mergedInto`(`:131`), `mergedTickets[]`(`:132`), `mergedAt`(`:133`), `comments[].mergedFrom`(`:279`).
- `controllers/ticketMergeController.ts` — `mergeTickets()` (`POST /api/tickets/:id/merge`), `getMergeCandidates()` (`GET /:id/merge-candidates`); absorbs comments/attachments/threads (prefixed `[From TICKET-XX]`), secondaries→status 5, escalates primary priority, system comment, notifies. Perm **`TICKET_MERGE`**.
- `components/tickets/TicketMergeModal.tsx` — production UI (candidate search, multi-select, priority preview).
- `AgentTicketDetail.tsx` — "Merge Ticket" button (`:2090`), merged-into banner (`:2103`), "Merged Tickets ({n})" panel (`:2134`), "Merged from #X" comment badges (`:2737`).
- `ticketController.getOne` populates `mergedTickets` + `mergedInto` (`:2984`).

### 42.3 Duplicate detection — PSR-only, advisory
- `modules/service-request/srDuplicateDetection.ts:30` — `findDuplicateServiceRequests(q)`; matches **project + interactionType="PSR" + sub-category(any level) + student(createdBy|metadata.studentEnrollment)**; open statuses; ≤20; sorted desc.
- `serviceRequestController.checkDuplicates` (`GET /service-requests/duplicates`), wrapper `checkSrDuplicates()`; advisory, skippable via `skipDuplicateCheck`.

### 42.4 Gaps (verified absent)
- **ISR progress → PSR status auto-update: NOT FOUND** (no `linkedISRBehavior`/`AUTO_RESOLVE`; manual only).
- **ISR pause/on-hold: NOT FOUND in SR workflow** (`srWorkflow.ts` has only 1,2,4,5,6,7; status 3 unused; no `slaPaused`/`blocked`).
- **PSR↔PSR linking: NOT FOUND** (only `linkedPsrId` ISR→PSR).
- **Duplicate detection for ISR: NOT FOUND** (PSR-only).
- **Combine from dup-detection / from list bulk-select: NOT FOUND** (merge is per-ticket, manual via modal).
- **Bulk multi-select on PSR list: NOT FOUND** (verify — `ServiceRequests.tsx` has no selection column).

---

## 43. Gap analysis & actions (Feature 6)

| # | Requirement | State | Action |
|---|-------------|-------|--------|
| S1 | Create sub-ISR / link existing ISR under PSR | ✅ LinkedIsrPanel | Reuse. (Mockups "Create Linked ISR", "Link Ticket" map to this + §S5.) |
| S2 | Linked ISR **status visible** in PSR | ✅ StatusPill + cell | Reuse; add pause state (S4). |
| S3 | ISR **progress → updates PSR status** | ❌ manual | **Build auto-propagation** (config `linkedISRBehavior`): when all linked ISRs resolved → auto-resolve PSR **or** notify/suggest. *(Q21.)* |
| S4 | **Paused** ISR shown | ❌ | **Build pause state** — add On-Hold to SR workflow **or** `metadata.paused`/`slaPaused` flag; surface in LinkedIsrPanel/cell + reflect "blocked" on PSR. *(Q22.)* |
| S5 | ISR **reassign** | ✅ reassignSr | Reuse; expose reassign in LinkedIsrPanel per-ISR. |
| S6 | **Link existing ISR** to PSR | ✅ linkPsr | Reuse. |
| S7 | **Link multiple PSRs into a PSR** on **list page** | ❌ | **Build PSR↔PSR link** (`relatedPsrIds[]` or generic link) + **bulk multi-select** on `ServiceRequests.tsx` → "Link". *(Q23, Q24.)* |
| S8 | **Duplicate detection** for ISR **and** PSR | ⚠️ PSR-only | Extend `findDuplicateServiceRequests` to ISR (match subject/category/assignee/linkedPsr). |
| S9 | **Combine** duplicates | ✅ mergeTickets | Drive a **"Combine"** action from dup-detection results + from list bulk-select → call `mergeTickets`. Confirm it works for PSR/ISR interactionType. |
| S10 | **"Combined" status/badge** + show **merged-with** on open | ✅ banners exist | Ensure the **SR detail layout** (PsrDetailLayout / AgentTicketDetail) shows the merged banner for PSR/ISR; add a list **badge/filter** for merged. |

---

## 44. Design decisions (Feature 6)

- **D21. Auto-status propagation = configurable, default "notify".** Add `Project.configuration.sr.linkedISRBehavior ∈ "auto_resolve" | "notify_only"`. `notify_only` (default, safe): when all linked ISRs reach 4/5, flag the PSR ("all sub-tasks done — ready to resolve") but don't change status. `auto_resolve`: move PSR to Resolved automatically. Recompute on every linked-ISR status change (hook in `changeStatus`). *(Q21.)*
- **D22. Pause = SLA-pause flag, not a new core status.** Add `metadata.paused{by,at,reason}` + reuse `slaPausedAt/slaPausedDuration` so TAT freezes; render a "Paused/Blocked" pill in LinkedIsrPanel and a "⏸ N blocked" indicator on the PSR. Avoids expanding the numeric FSM. (Alternative: wire status 3 On-Hold into `srWorkflow` — heavier.) *(Q22.)*
- **D23. Two PSR-relationship verbs.** **Link (related)** = non-destructive (`relatedPsrIds[]`, both stay open, shown as "Related PSRs"). **Combine (merge)** = destructive (existing `mergeTickets`, secondary closed, "Combined" badge). The list bulk action offers **both**: "Link as related" and "Combine duplicates". *(Q23.)*
- **D24. PSR↔PSR link storage.** Add `Ticket.relatedPsrIds: ObjectId[]` (symmetric — write on both, or store once + query both ways) for related-links; keep `mergedInto/mergedTickets` for combine. *(Q24 = which model.)*
- **D25. Combine direction.** Default primary = **oldest open** PSR (or agent-chosen in modal, as TicketMergeModal already allows). Secondaries closed + `mergedInto` set; primary shows `mergedTickets`.
- **D26. Permissions.** Reuse `TICKET_MERGE` for combine; add `SR_LINK` (or reuse `SR_REASSIGN|SR_ISR_CREATE`) for PSR↔PSR related-link. *(Q25.)*
- **D27. Duplicate detection scope.** Keep advisory (non-blocking); extend matcher to ISR; surface candidates in the create flow AND as a "Possible duplicates" panel on detail + a list action.

---

## 45. Implementation changes (Feature 6)

### 45.1 Backend
| File | Change |
|------|--------|
| `models/Ticket.ts` | **NEW** `relatedPsrIds: ObjectId[]` (PSR↔PSR related-link, indexed). **NEW** `metadata.paused{by,at,reason}` usage. |
| `models/Project.ts` (config) | **NEW** `configuration.sr.linkedISRBehavior` (`auto_resolve`/`notify_only`, default notify). |
| `modules/service-request/serviceRequestService.ts` | `changeStatus`/status hook → recompute linked-ISR rollup → apply `linkedISRBehavior` (auto-resolve or set a `metadata.allSubTasksDone` flag). **NEW** `linkPsrToPsr(psrId, otherIds, notes)` + `unlinkPsr`. **NEW** pause/resume action setting `metadata.paused` + `slaPausedAt`. |
| `modules/service-request/srDuplicateDetection.ts` | Extend to ISR (interactionType param); ISR match on subject/category/assignee/linkedPsrId. |
| `controllers/serviceRequestController.ts` + `routes/serviceRequest.ts` | **NEW** `POST /:id/link-related` (PSR↔PSR), `POST /:id/pause` + `/:id/resume`, `POST /bulk/link`, `POST /bulk/combine` (calls `mergeTickets`). Guards per D26. |
| (reuse) `ticketMergeController.mergeTickets` | Confirm/allow merge for `interactionType` PSR & ISR; ensure SR list reflects `isMerged`. |

### 45.2 Frontend
| File | Change |
|------|--------|
| `components/sr/LinkedIsrPanel.tsx` | Per-ISR **reassign** button; **pause/blocked** pill; show paused count; "Create Linked ISR" + "Link existing" already present. |
| `pages/ServiceRequests.tsx` | **Bulk multi-select** column + action bar: "Link as related", "Combine duplicates". **Merged/Combined badge** + filter. Related-PSR indicator. |
| PSR/ISR detail (`AgentTicketDetail.tsx` / `PsrDetailLayout.tsx`) | Show **Related PSRs** card; ensure **merged-into banner + Merged Tickets panel** render for PSR/ISR; "Possible duplicates" panel (from dup-detection). |
| `components/sr` (new `LinkRelatedModal` or reuse `TicketMergeModal`) | Link-as-related modal (Related/Duplicate/PSR-link types as in mockup); Combine reuses TicketMergeModal. |
| `services/serviceRequests.ts` | Add `linkRelated`, `pause`, `resume`, `bulkLink`, `bulkCombine`, duplicate-check(ISR). |

---

## 46. Phases (Feature 6)
1. **Phase U — Linked-ISR polish.** Per-ISR reassign in panel; pause/blocked state (D22) + rollup of paused count. (Low risk, immediate value.)
2. **Phase V — Auto-status propagation.** `linkedISRBehavior` config + recompute hook (notify default; auto-resolve opt-in). (D21.)
3. **Phase W — PSR↔PSR linking + list bulk-select.** `relatedPsrIds`, link-related modal, bulk action bar. (D23/D24.)
4. **Phase X — Duplicate→Combine.** Extend dup-detection to ISR; "Possible duplicates" panel; "Combine" wired to `mergeTickets` from detail + list; combined badge/filter. (D27.)

---

## 47. Acceptance criteria (Feature 6)
- [ ] PSL/agent creates a sub-ISR and links an existing ISR under a PSR; both show with status + assignee.
- [ ] Linked ISR can be reassigned from the PSR panel.
- [ ] When an ISR is paused, a "Paused/Blocked" state shows on the ISR and a blocked indicator on the PSR; TAT freezes.
- [ ] When all linked ISRs reach resolved/closed: `notify_only` flags the PSR as ready; `auto_resolve` moves it to Resolved. Behaviour follows project config.
- [ ] On the PSR list, multi-select two+ PSRs → "Link as related" creates a symmetric related link (both stay open, shown as Related).
- [ ] On the PSR list (or detail), duplicates can be **Combined**: secondaries close, primary shows "Combined ({n})"; opening any secondary shows "Combined into #PRIMARY"; opening primary lists merged tickets.
- [ ] Duplicate detection returns candidates for **both** PSR and ISR.
- [ ] Combined/merged PSRs carry a visible badge in the list + a filter.
- [ ] Both apps build clean; existing ticket-merge (non-SR) unaffected.

---

## 48. Open questions — Feature 6 (DECISIONS NEEDED)
- **Q21.** Auto-status: when all linked ISRs done, **auto-resolve the PSR** or **notify/suggest only** (default)? Make it **per-project config** (`linkedISRBehavior`)? *(Rec: config, default notify_only.)*
- **Q22.** Pause: a lightweight **`metadata.paused` + SLA-pause flag** (rec) or a real **On-Hold status (3)** added to the SR workflow FSM?
- **Q23.** PSR↔PSR: support **both** "Link as related" (non-destructive) **and** "Combine/merge" (destructive)? Or only combine? *(Rec: both — they answer different needs.)*
- **Q24.** Related-link storage: new **`relatedPsrIds[]`** on Ticket (rec), or a separate generic `TicketLink` model with link types (related/duplicate/psr-link)? A generic model is cleaner long-term but heavier.
- **Q25.** Permissions: reuse **`TICKET_MERGE`** for combine + add **`SR_LINK`** for related-link, or fold into existing `SR_REASSIGN`/`SR_ISR_CREATE`?
- **Q26.** Combine direction: default primary = **oldest open** PSR, or always **agent-chosen** in the modal? (TicketMergeModal already supports choosing.)
- **Q27.** Duplicate detection — keep **advisory** (rec), or make it **blocking** (force review before create)? And match keys for ISR (subject? category? same parent PSR?).
- **Q28.** Should **combining PSRs** also **re-link their child ISRs** to the surviving primary PSR (so sub-tasks consolidate)? *(Rec: yes — re-point `linkedPsrId` of secondaries' ISRs to primary.)*

---

## 49. Cross-feature note (update to §27/§39)
- **Combine/merge infra (`mergeTickets`/TicketMergeModal/`mergedInto`) already exists** — Feature 6 reuses it rather than rebuilding; net-new is PSR↔PSR *related* links, ISR dup-detection, auto-status, pause, and list bulk-select.
- **Linked-ISR rollup** (`listLinkedIsrs`/aggregate) is the hook point for auto-status (D21) — already computes done/total.
- The mockups' **"Link Ticket"** modal (Duplicate / Related / PSR Link tabs) maps to **§D23** (related-link) + reuse of the merge flow for the Duplicate case.

---

*End of plan. Parts I–V now cover: walk-in (I), email (II), IVR (III), parent web self-service + assignment (IV), and sub-ISR/linking/duplicate-combine (VI). Recommended build order across all features: **Phase F/K** (MDM lookups) → **Phase P** (assignment wiring) → then per-feature phases. Combine (Feature 6) is largely reuse of existing `mergeTickets`. Await decisions: §7, §17, §26, §33/§38, §48.*
