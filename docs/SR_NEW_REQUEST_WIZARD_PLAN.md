# SR New Request Wizard — Feature Plan

Status: **Implemented** (both apps build clean). Decisions locked below.

## Locked decisions
1. Scope = **classify step (image 2) + the 2 blocks (image 3)**: Priority&Schedule, Offline/RE Entry.
2. Build **all 6 classify routes**, and classify channels are a **configurable master** — admin can add new routes later, each permission-gated, managed by anyone holding the manage permission. No code change to add a future channel.
3. Parent/children data = **MDM first, internal User fallback**.
4. **Reuse existing SR_ codes**; add new SR_ codes only for gaps.

## Grounding (existing code)
- New Request form: `frontend/src/pages/ServiceRequestCreate.tsx` — single form, PSR hardcoded (`interactionType:"PSR"` L161), project `<select>` always shown (L197-212), `modeOfContact` (L31-37, 51, 308-319), student search via `serviceRequestApi.studentLookup` (L113-129), category leaf select (L257-269).
- Hub/tabs: `pages/ServiceRequestsHub.tsx`, `components/sr/SrTabs.tsx` (`{active==="new" && <ServiceRequestCreate embedded/>}`).
- Classify enums already exist (IVR/email): `pages/IVRCalls.tsx` REQUESTER_TYPES, `pages/EmailTriageInbox.tsx` SENDER_TYPES.
- Backend create: `backend/src/modules/service-request/createServiceRequest.ts` (`CreateServiceRequestInput` accepts projectId, interactionType, channel, categoryId, subject, studentUserId, assignedTo, metadata…). Assignment: explicit `assignedTo` else category agentPool[0] else null; cc from routing.
- SR config: `backend/src/modules/service-request/serviceRequestConfig.ts` (`SR_CONFIG_DEFAULTS`), admin patch `srConfigAdmin.ts`; stored `project.configuration.sr` (Mixed). Form schemas under `configuration.sr.formSchemas`.
- Category SR meta: `models/Category.ts` `sr.appliesTo (['PSR','ISR'])`, `sr.proactiveHelpText`. Routing: `srMasterData.resolveSrRouting`.
- MDM: `models/MDMSource.ts` dataTypes `schools|employees|principals|students|custom` + per-API `projectIds`; `services/mdmService.ts` `pickApiForDataType(source,dataType,projectId)`, `normalizeEmployee`, `fetchEmployeesFromMDM`.
- Perms: `utils/seedRolesPermissions.ts` SR_PSR_CREATE, SR_ISR_CREATE, SR_*_RECEIVE, SR_REASSIGN, SR_DELEGATE, SR_CLOSE, SR_REOPEN, SR_DISPLAY_TO_PARENT, SR_CONFIG_MANAGE.
- OTP: `/api/otp` route exists (reuse for RE-entry requester email).

## Feature A — Hide project selector by role
`ServiceRequestCreate`: if user NOT super-admin AND `userProjects.length === 1` → auto-set `projectId = userProjects[0]`, hide `<select>`, show read-only label. Super-admin or multi-project → keep selector. Role/projects from `usePermissions` + `useProjectContext`.

## Feature B — New Request wizard (replaces single form)
Stepper inside `ServiceRequestCreate` (or new `components/sr/SrNewRequestWizard.tsx`):
1. **Project** (hidden per Feature A).
2. **ISR vs PSR** cards — show only the ones permitted (`SR_PSR_CREATE` / `SR_ISR_CREATE`).
3. **PSR → Classify** step (config-driven channels). Show channels whose `enabled` and whose `requiredPermission` the user holds (empty = any creator).
4. **Channel flow**:
   - `existing_parent`: MDM **parent search** (name, mobile, email, school) → select → autofill → **children multiselect** (name + grade) → category/subcategory → subject/description → PSR.
   - `prospect_parent`: lead/CRM form (name/mobile/email/enquiry) → routes to CRM/lead.
   - `vendor`: SR → Procurement (channel default category/assignee).
   - `job`: SR → HR.
   - `others`: generic SR (category/subject/desc).
   - `junk`: archive as junk (no SR).
   - `custom` (future channels): generic SR form using channel `routing` defaults — works with **no new code**.
5. **ISR path**: category + subject/desc + **explicit assignee emails** block (Feature D-1).
- **Remove Mode of Contact** (UI + payload; leave backend field optional).

## Feature C — Configurable classify-channel master
Store `project.configuration.sr.classifyChannels: SrClassifyChannel[]`:
```
{ key, label, description, icon?, color?, enabled, order,
  requiredPermission?,                 // any permission code; empty = any SR creator
  flow: "existing_parent"|"prospect_parent"|"vendor"|"job"|"others"|"junk"|"custom",
  routing: { interactionType?, target?, defaultCategoryId?, defaultAssigneeEmails?, defaultRoleId? } }
```
- Seed the 6 defaults (from image 2) when SR enabled / config first read.
- Admin CRUD in **SR Settings** page, gated `SR_CONFIG_MANAGE` (existing). Adding a `custom` channel + picking a `requiredPermission` = new permission-gated route, no code.

## Feature D — The 2 image-3 blocks + assignee emails (configurable + permission)
All gated by SR config toggle AND permission; server re-checks.
- **D-1 Assignee emails (ISR)**: textarea, split on comma/semicolon/newline, first = primary `assignedTo`, rest = cc. Resolve emails→User; unknown emails stored in `metadata.assigneeEmails`. New perm **`SR_ASSIGN_EMAILS`**.
- **D-2 Priority & Schedule**: "Override priority and schedule manually" → priority select + schedule dispatch date. New perm **`SR_PRIORITY_OVERRIDE`**. Stores `ticket.priority` + `metadata.scheduleDispatchDate`.
- **D-3 Offline / RE Entry**: "Created by RE" + requester email from directory + **Send OTP** (reuse `/api/otp`). New perm **`SR_OFFLINE_ENTRY`**. Sets `submissionSource:"offline"`, `metadata.requesterEmail`, requires verified OTP token server-side.
- Config toggles in `project.configuration.sr`: `assigneeEmails.enabled`, `prioritySchedule.enabled`, `offlineReEntry.enabled`.

## Feature E — MDM parents/children
- `MDMSource` dataTypes += `parents`, `children`.
- `mdmService`: `normalizeParent(raw)` → {name,firstName,lastName,mobile,email,school,parentCode}; `normalizeChild(raw)` → {name,grade,enrollmentId,parentCode}; `searchParentsFromMDM(query, projectId, mdmSourceId?)` → parents[] each with children[] (embedded, else fetch `children` dataType filtered by parentCode).
- **Fallback** (no MDM parents endpoint): internal Users — match name/mobile/email; group children by `parentMobile`.
- Route: `GET /service-requests/parent-lookup?query=&projectId=` (SR-permission cohesive) or `GET /api/mdm/parents/search`. Gated `SR_PSR_CREATE`.

## Backend create changes
`CreateServiceRequestInput` += `classification?`, `assignedToEmails?: string[]`, `requesterEmail?`, `requesterOtpToken?`, `createdByRE?: boolean`, `priority?`, `scheduleDispatchDate?`, `parent?`, `children?: [{id?,name,grade}]`. Persist parent/children/classification in `metadata`. Server-side permission re-checks for D-1/2/3. Drop `modeOfContact` requirement.

## New permission codes (seed, service-request category)
`SR_ASSIGN_EMAILS`, `SR_PRIORITY_OVERRIDE`, `SR_OFFLINE_ENTRY`. (Manage classify master = existing `SR_CONFIG_MANAGE`.) Add to backend `seedRolesPermissions.ts` + frontend `constants/permissions.ts`.

## Build order
1. MDM parents/children dataTypes + `searchParentsFromMDM` + fallback + lookup route.
2. SR config: `classifyChannels` + toggles + 6 defaults seed + admin patch.
3. `createServiceRequest` extend + new perms seed.
4. Frontend wizard skeleton (project hide, ISR/PSR, config-driven classify).
5. Existing Parent MDM form + child multiselect; generic channel renderer; remove Mode of Contact.
6. D-1/2/3 blocks (perm + config gated).
7. SR Settings → classify-channel manager.
8. Build both apps, commit to ISR/PSR.

## Open notes
- `scheduleDispatchDate` stored only (actual scheduled dispatch job = out of scope).
- Junk channel: log + archive, no ticket.
- Prospect→CRM: creates lead via existing leads route if present, else SR tagged `target:crm`.
