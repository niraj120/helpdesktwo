# SAC Helpdesk — Database Schema & Data Dictionary for AI Analytics

**Purpose:** a single hand-off document for the AI analytics team. It describes the
SAC Helpdesk MongoDB database so an AI agent can read it and answer prompt/voice
analytics questions correctly. This is reference documentation — no integration needed.

**What's inside**
- **Part A — Context & Data Dictionary:** read-only connection, multi-tenancy, entity
  relationships, status/priority codes, storage gotchas, business-metric definitions,
  and ready-to-run aggregation examples. *Read this first.*
- **Part B — Full Schema Reference:** every collection with all fields, types,
  relationships, enums, indexes, live document counts and observed values.

> Database engine: **MongoDB** (`sac_helpdesk`). Queries are **aggregation pipelines**, not SQL.

---

# SAC Helpdesk — AI Analytics Context & Data Dictionary

This document teaches an AI analytics agent how to read the **SAC Helpdesk** MongoDB
database and answer prompt/voice questions correctly. Feed it to the agent **together
with** the auto-generated files:

- `backend/ai-export/ai-schema.json` — every collection: fields, types, refs, enums, indexes, live counts, observed enum values.
- `backend/ai-export/ai-data-dictionary.md` — the same, human-readable.
- `backend/ai-export/ai-report-datapoints.json` — the curated list of ~90 analytics fields with labels/descriptions (what the product itself reports on).

> Regenerate anytime the schema changes: `cd backend && npx tsx scripts/exportSchemaForAI.ts`
> Run it pointed at a **read-only** Prod connection to capture prod-specific counts & values.

---

## 1. Connect READ-ONLY to Prod (do this first)

The AI must **never** write to production. Create a dedicated read-only Mongo user and use **only** that connection string for the agent.

```js
// In the Mongo shell against the prod cluster (admin db):
db.getSiblingDB("admin").createUser({
  user: "sac_ai_readonly",
  pwd: "<strong-password>",
  roles: [{ role: "read", db: "sac_helpdesk" }]   // read ONLY, single db
})
```

Connection string for the agent:
```
mongodb://sac_ai_readonly:<pwd>@<prod-host>:27017/sac_helpdesk?authSource=admin&readPreference=secondaryPreferred
```
- `read` role = SELECT-only; the agent physically cannot insert/update/delete.
- `readPreference=secondaryPreferred` keeps analytics load off the primary.
- Store the password in the agent's secret store, never in code.

**Database name:** `sac_helpdesk`. **Engine:** MongoDB (document store, not SQL — the agent should generate aggregation pipelines, not SQL).

---

## 2. Multi-tenancy — ALWAYS scope by project

The system is multi-project. **Prod SAC = the "MH CET" project.** Almost every collection has a `projectId` (or `project`) field. Unless the user asks across all projects, scope every query to the relevant project.

- Find the project id once: `db.projects.findOne({ name: /MH ?CET/i }, { _id: 1, name: 1, code: 1 })`.
- Tickets carry the project in **two** places: top-level `project` (ObjectId) and `metadata.projectId`. Prefer `project`; fall back to `metadata.projectId`.

---

## 3. Entity map (how collections join)

```
Project (projects)                ← the tenant; everything is scoped to it
 ├─ Ticket (tickets)              project, metadata.projectId
 │   ├─ createdBy  → User         the requester/agent who created it
 │   ├─ assignedTo → User         the agent currently handling it
 │   ├─ status (NUMBER 1-5)       → Status.code  (per-project names/colours)
 │   ├─ priority (STRING)         → Priority.code (master data)
 │   ├─ categoryHierarchy.level1..5 → Category._id (per level)
 │   ├─ metadata.centerId (STRING)→ Center._id    (offline centre)
 │   ├─ threads[] / comments[]    replies & comments (each with createdAt)
 │   └─ SLATracking (1:1 by ticketId)  detailed SLA + escalation history
 ├─ User (users)                  role → Role; centers[]/centreId → Center
 ├─ Center (centers)              city = DISTRICT; projectId
 ├─ Category (categories)         level 1-5 tree; parentId; path (display)
 ├─ Status (status)               code 1-5 → name; isClosed
 ├─ FeedbackResponse (feedbackresponses)  ticketId → Ticket; overallRating (CSAT)
 └─ AttendanceRecord (attendancerecords)  userId → User; employeeCode; status
```

Join pattern in aggregation: `$lookup` from the referenced collection on `_id`
(except the gotchas in §5). Example status name join:
```js
{ $lookup: { from: "status", let: { s: "$status", p: "$project" },
  pipeline: [{ $match: { $expr: { $and: [
    { $eq: ["$code", "$$s"] }, { $eq: ["$projectId", "$$p"] } ] } } }],
  as: "_status" } }
```

---

## 4. Codes & enums the agent MUST know

**Ticket.status** is a **number**, not text:
| code | meaning |
|---|---|
| 1 | Open |
| 2 | In Progress |
| 3 | On Hold |
| 4 | Resolved |
| 5 | Closed |
- "Closed/resolved" = status ∈ {4,5}. "Open/active" = status ∈ {1,2,3}.
- Authoritative names/closed-flags live in the `status` collection per project (`code`, `name`, `isClosed`). Custom projects may add codes — prefer joining to `status` over hardcoding.

**Ticket.priority** (string, from Priority master): typically `LOW, MEDIUM, NORMAL, HIGH, URGENT, CRITICAL` (varies by project — see observed values in `ai-schema.json`).

**Ticket.submissionSource**: `online, offline, email, whatsapp, web, sms, phone, chatbot`.

**Ticket SLA status** (derive — see §6): `Within SLA` vs `Breached`.

**AttendanceRecord.status**: open-ended biometric codes (e.g. `P, A, PL, CL, SL, EL, CO, OD, WFH, HD, LWP, MP`). No fixed enum — group dynamically.

---

## 5. Storage gotchas (get these wrong → wrong answers)

1. **`Ticket.status` is numeric (1-5)** — never compare to "Open"/"Closed" strings; join to `status.code` for names.
2. **`Ticket.metadata.centerId` is stored as a STRING**, but `centers._id` is an ObjectId. To join, convert: `$toObjectId` / `{$convert:{input:"$metadata.centerId",to:"objectId",onError:null,onNull:null}}`. The sentinel `"online"` (or missing) = an online/portal ticket with no offline centre.
3. **District = `Center.city`.** There is no separate district field; the centre's `city` holds the district name. "Tickets by district" = ticket → metadata.centerId → centre → `city`.
4. **Category is multi-level & stored flat:** `Ticket.categoryHierarchy.level1..level5` are ObjectIds → `categories._id`. `categoryHierarchy.displayPath` is a cached "L1 > L2 > L3" string (fastest for display). Category names per level come from `categories.name`.
5. **SLA deadlines live on the ticket** as `roleLevelSLA.dueAt` / `ticketLevelSLA.dueAt` (and breach flags `roleLevelSLA.breachedAt` / `ticketLevelSLA.breachedAt`). The denormalised `sla_due_at` exists but is **not reliably populated** — prefer `roleLevelSLA.dueAt ?? ticketLevelSLA.dueAt`. The `slatrackings` collection (1:1 by `ticketId`) has `responseStatus`/`resolutionStatus` = `met|breached|pending`.
6. **Completion time** = `resolvedAt ?? closedAt`.
7. **`metadata` is a Mixed/flexible object** — fields like `studentName`, `studentEmail`, `createdByName`, `centerId`, `projectId`, `customFields.*` may or may not be present; handle nulls.
8. **Deleted users**: `createdBy`/`assignedTo` may reference a removed user — use `$lookup` + null handling, don't assume the join matches.
9. **`status` collection name is literally `status`** (singular), not `statuses`.
10. **Dates are UTC in the DB.** Business timezone is **IST (UTC+05:30)**. For "per day"/"this month" in IST, offset by +5:30 (or use `$dateToString` with `timezone:"+05:30"`). `attendancerecords.attendanceDate` is stored at UTC-midnight; `punchIn`/`punchOut` are IST instants.

---

## 6. Business metric definitions (so answers match the product)

- **Within SLA / Breached (a ticket):** breached if `roleLevelSLA.breachedAt` or `ticketLevelSLA.breachedAt` is set, OR (completed and `completionTime > dueAt`), OR (still open and `now > dueAt`). Otherwise Within SLA. `dueAt = roleLevelSLA.dueAt ?? ticketLevelSLA.dueAt`.
- **SLA compliance rate** = met / (met + breached) over the period.
- **Footfall (per day):** `new tickets created that day` + `count of distinct EXISTING tickets (created earlier) that received a reply (threads[]) or comment (comments[]) that day`. A ticket counts once regardless of how many replies; one created+replied same day counts once (as new).
- **MTTR (mean time to resolve)** = avg(`resolvedAt − createdAt`) for tickets resolved in the period.
- **First response time** = `firstRespondedAt − createdAt`.
- **CSAT** = avg(`feedbackresponses.overallRating`, 1-5), join by `ticketId`.
- **Escalations**: `escalationHistory[]` on the ticket and on `slatrackings`; `currentEscalationLevelNumber` is the live level. "Auto-escalated" entries have `mode:"auto"`.
- **Resolution rate** = closed/resolved in period ÷ total in period.

---

## 7. Sample aggregation pipelines (copy-adapt)

Assume `PID = ObjectId("<MH CET project id>")` and an optional date window `[start,end]` on `createdAt`.

**Open vs closed counts**
```js
db.tickets.aggregate([
  { $match: { project: PID } },
  { $group: { _id: { $cond: [ { $in: ["$status",[4,5]] }, "closed", "open" ] }, n: { $sum: 1 } } }
])
```

**Tickets by district (centre city)**
```js
db.tickets.aggregate([
  { $match: { project: PID, createdAt: { $gte: start, $lte: end } } },
  { $addFields: { cid: { $convert: { input: "$metadata.centerId", to: "objectId", onError: null, onNull: null } } } },
  { $lookup: { from: "centers", localField: "cid", foreignField: "_id", as: "c" } },
  { $addFields: { district: { $ifNull: [ { $arrayElemAt: ["$c.city",0] }, "Online/Unknown" ] } } },
  { $group: { _id: "$district", tickets: { $sum: 1 } } },
  { $sort: { tickets: -1 } }
])
```

**SLA breached (closed/resolved) in period**
```js
db.tickets.aggregate([
  { $match: { project: PID, status: { $in: [4,5] } } },
  { $addFields: {
      due:  { $ifNull: ["$roleLevelSLA.dueAt","$ticketLevelSLA.dueAt"] },
      done: { $ifNull: ["$resolvedAt","$closedAt"] },
      flag: { $or: [ { $ifNull:["$roleLevelSLA.breachedAt",false] }, { $ifNull:["$ticketLevelSLA.breachedAt",false] } ] } } },
  { $match: { done: { $gte: start, $lte: end } } },
  { $group: { _id: null,
      breached: { $sum: { $cond: [ { $or: [ "$flag", { $and: [ {$ne:["$due",null]}, {$gt:["$done","$due"]} ] } ] }, 1, 0 ] } },
      total: { $sum: 1 } } }
])
```

**CSAT (avg rating) for the project**
```js
db.feedbackresponses.aggregate([
  { $match: { projectId: PID, submittedAt: { $gte: start, $lte: end } } },
  { $group: { _id: null, avgRating: { $avg: "$overallRating" }, responses: { $sum: 1 } } }
])
```

**Agent workload (open tickets per assignee)**
```js
db.tickets.aggregate([
  { $match: { project: PID, status: { $in: [1,2,3] }, assignedTo: { $ne: null } } },
  { $group: { _id: "$assignedTo", open: { $sum: 1 } } },
  { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
  { $addFields: { agent: { $concat: [ {$arrayElemAt:["$u.firstName",0]}, " ", {$arrayElemAt:["$u.lastName",0]} ] } } },
  { $sort: { open: -1 } }
])
```

---

## 8. Which collections matter for analytics (start here)

| Collection | Use it for |
|---|---|
| `tickets` | volume, status, priority, category, source, SLA, escalation, footfall |
| `status` | status code → name/closed-flag (per project) |
| `centers` | centre & **district (city)** breakdowns, capacity (`idealCount`) |
| `categories` | category/sub-category/topic names (levels 1-5) |
| `users` | agents, requesters, roles, centres, onboarding |
| `slatrackings` | detailed SLA met/breached, response/resolution times, escalations |
| `feedbackresponses` | CSAT / satisfaction |
| `attendancerecords` | staff attendance, present/absent, working hours |
| `priorities`, `roles`, `projects` | master/config lookups |
| `reportdatapoints` | the product's own curated metric catalogue (good label source) |

Lower-priority/operational (usually not for business analytics): `joblogs`, `errorlogs`,
`accesslogs`, `apilogs`, `emaillogs`, `dashboardusageevents`, `*config`, `*queue`.

---

## 9. Guardrails for the agent

- **Read-only**: only the `sac_ai_readonly` user. Generate `find`/`aggregate` — never `insert/update/delete/drop`.
- **Always project-scope** unless explicitly asked for all projects.
- **Respect IST** for day/week/month bucketing.
- **Cap result size** (`$limit`) and add `maxTimeMS` on heavy aggregations.
- When unsure of a code/field, **join to the lookup collection** (`status`, `priorities`, `categories`, `centers`) rather than guessing.
- Don't expose PII (emails, phones, names) unless the question requires it; aggregate by default.


---

# Part B — Full Schema Reference (all collections)


Database: `sac_helpdesk` · Collections: 93 · Generated: 2026-06-19T12:15:54.725Z
Live stats included: yes

> Pair this with **AI_ANALYTICS_CONTEXT.md** for business meaning, enum codes, relationships and sample queries.

## AccessLog  `accesslogs`
Documents: ~2544

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | indexed |
| userName | String |  |  |  |
| userEmail | String |  |  | required, indexed |
| action | String |  | login, logout, login_failed, password_reset, forgot_password, session_expired | required, indexed |
| success | Boolean |  |  | required, indexed |
| failureReason | String |  |  |  |
| ipAddress | String |  |  |  |
| userAgent | String |  |  |  |
| project | ObjectId | Project |  |  |
| projectName | String |  |  |  |
| role | String |  |  |  |
| timestamp | Date |  |  | indexed |
| sessionDuration | Number |  |  |  |
| metadata | Mixed |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ActivityLog  `activitylogs`
Documents: ~886

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required, indexed |
| userName | String |  |  | required |
| userEmail | String |  |  | required, indexed |
| action | String |  | create, update, delete, edit, access_denied, impersonate, impersonate_end | required, indexed |
| entity | String |  |  | required, indexed |
| entityId | String |  |  |  |
| entityName | String |  |  |  |
| changes | Array<Mixed> |  |  |  |
| description | String |  |  |  |
| ipAddress | String |  |  |  |
| userAgent | String |  |  |  |
| project | ObjectId | Project |  |  |
| projectName | String |  |  |  |
| role | String |  |  |  |
| timestamp | Date |  |  | indexed |
| metadata | Mixed |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## APILog  `apilogs`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | indexed |
| projectName | String |  |  |  |
| apiType | String |  | webhook, sms, email, payment, hrms, erp, chat, other | required, indexed |
| endpoint | String |  |  | required, indexed |
| method | String |  | GET, POST, PUT, PATCH, DELETE | required |
| requestHeaders | Mixed |  |  |  |
| requestBody | Mixed |  |  |  |
| responseStatus | Number |  |  | indexed |
| responseBody | Mixed |  |  |  |
| error | String |  |  |  |
| status | String |  | success, failed, timeout, retrying | indexed |
| metadata | Mixed |  |  |  |
| attempt | Number |  |  |  |
| executionTime | Number |  |  |  |
| sentAt | Date |  |  | indexed |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ApprovalCategory  `approvalcategories`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| key | String |  |  | required, unique |
| name | String |  |  | required |
| description | String |  |  |  |
| sortOrder | Number |  |  |  |
| isActive | Boolean |  |  | indexed |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ApprovalRequestType  `approvalrequesttypes`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| key | String |  |  | required, unique |
| name | String |  |  | required |
| categoryId | ObjectId | ApprovalCategory |  |  |
| description | String |  |  |  |
| sortOrder | Number |  |  |  |
| isActive | Boolean |  |  | indexed |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ApprovalWorkflow  `approvalworkflows`
Documents: ~2

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| projectId | ObjectId | Project |  | required, indexed |
| description | String |  |  |  |
| categoryId | ObjectId | Permission |  | indexed |
| requestTypeId | ObjectId | Permission |  | indexed |
| requestTypeKey | String |  |  | indexed |
| requestTypes | Array<String> |  |  |  |
| approvalLogic | String |  | sequential, parallel |  |
| levels | Array<Mixed> |  |  |  |
| autoApprove | Boolean |  |  |  |
| status | String |  | active, inactive | indexed |
| isActive | Boolean |  | false, true | indexed |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Asset  `assets`
Documents: ~9

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| name | String |  |  | required |
| description | String |  |  |  |
| category | ObjectId | AssetCategory |  |  |
| predefinedCount | Number |  |  | required |
| unit | String |  |  |  |
| isActive | Boolean |  | true |  |
| createdBy | ObjectId | User |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## AssetAuditLog  `assetauditlogs`
Documents: ~9

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| centerAssetMappingId | ObjectId | CenterAssetMapping |  | required, indexed |
| userId | ObjectId | User |  | required, indexed |
| centerId | ObjectId | Center |  | required, indexed |
| assetId | ObjectId | Asset |  | required, indexed |
| changeType | String |  | working_asset, not_working_asset, both | required |
| previousValues.workingAsset | Number |  |  | required |
| previousValues.notWorkingAsset | Number |  |  | required |
| newValues.workingAsset | Number |  |  | required |
| newValues.notWorkingAsset | Number |  |  | required |
| changedAt | Date |  |  | indexed |
| remarks | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## AssetCategory  `assetcategories`
Documents: ~7

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| code | String |  |  | required |
| description | String |  |  |  |
| projectId | ObjectId | Project |  | required, indexed |
| isActive | Boolean |  | true |  |
| color | String |  |  |  |
| icon | String |  |  |  |
| order | Number |  |  |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## AttendanceConfig  `attendanceconfigs`
Documents: ~5

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, unique |
| aftBaseUrl | String |  |  |  |
| aftProjectPrefix | String |  |  |  |
| apiKeyEncrypted | String |  |  |  |
| syncActive | Boolean |  |  |  |
| syncSchedule | Array<String> |  |  |  |
| publishedCheckEnabled | Boolean |  |  |  |
| syncLookbackDays | Number |  |  |  |
| commonIdentifier | String |  |  |  |
| displayFields | Array<String> |  |  |  |
| fieldPermissions | Map |  |  |  |
| fieldPermissions.$* | Embedded |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## AttendanceRecord  `attendancerecords`
Documents: ~19

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| userId | ObjectId | User |  | required, indexed |
| employeeCode | String |  |  | required |
| attendanceDate | Date |  |  | required |
| punchIn | Date |  |  |  |
| punchOut | Date |  |  |  |
| totalWorkingHours | String |  |  |  |
| status | String |  | A, CL, H, M/p, P | required |
| center | String |  |  |  |
| geoLat | Number |  |  |  |
| geoLong | Number |  |  |  |
| published | Boolean |  |  |  |
| rawPayload | Mixed |  |  |  |
| syncRunId | ObjectId | AttendanceSyncLog |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## AttendanceSyncLog  `attendancesynclogs`
Documents: ~331

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| triggeredBy | String |  | SCHEDULE, MANUAL, API, UPLOAD | required |
| startedAt | Date |  |  | required |
| completedAt | Date |  |  |  |
| recordsFetched | Number |  |  |  |
| recordsStored | Number |  |  |  |
| recordsSkipped | Number |  |  |  |
| errorCount | Number |  |  |  |
| status | String |  | RUNNING, SUCCESS, PARTIAL, FAILED |  |
| errorDetails | Array<Mixed> |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |

## BiometricSyncLog  `biometricsynclogs`
Documents: ~17

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| userId | ObjectId | User |  | required, indexed |
| employeeCode | String |  |  | required |
| payrollNumber | Number |  |  |  |
| triggeredBy | ObjectId | User |  |  |
| status | String |  | SUCCESS, FAILED | required |
| aftEmployeeId | Number |  |  |  |
| aftBiometricId | Number |  |  |  |
| aftResponse | Mixed |  |  |  |
| errorMessage | String |  |  |  |
| syncedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |

## Category  `categories`
Documents: ~249

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| code | Number |  |  | required |
| description | String |  |  |  |
| projectId | ObjectId | Project |  | required, indexed |
| isActive | Boolean |  | true |  |
| color | String |  |  |  |
| icon | String |  |  |  |
| order | Number |  |  |  |
| defaultPriority | String |  |  |  |
| level | Number |  |  | indexed |
| parentId | ObjectId | Category |  | indexed |
| path | String |  |  |  |
| hierarchyPath | Array<ObjectId> | Category |  |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## CategoryAssignmentConfig  `categoryassignmentconfigs`
Documents: ~2

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| categoryId | ObjectId | Category |  | required, indexed |
| projectId | ObjectId | Project |  | required, indexed |
| mode | String |  | round-robin, by-role, by-user, manual | required |
| agentPool | Array<ObjectId> | User |  |  |
| rolePool | Array<ObjectId> | Role |  |  |
| isActive | Boolean |  | true | indexed |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## CategoryEscalationConfig  `categoryescalationconfigs`
Documents: ~7

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| categoryId | ObjectId | Category |  | required, indexed |
| projectId | ObjectId | Project |  | required, indexed |
| escalationMatrixId | ObjectId | EscalationMatrix |  | required |
| isActive | Boolean |  | true |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## CategorySLA  `categoryslas`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| categoryId | ObjectId | Category |  | required, unique, indexed |
| projectId | ObjectId | Project |  | required, indexed |
| responseTime | Embedded |  |  | required |
| resolutionTime | Embedded |  |  | required |
| isActive | Boolean |  |  |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Center  `centers`
Documents: ~20

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| centerName | String |  |  | required |
| address | String |  |  | required |
| country | String |  |  |  |
| city | String |  |  | required, indexed |
| state | String |  |  | required, indexed |
| pincode | String |  |  |  |
| phone | String |  |  |  |
| email | String |  |  |  |
| workingHours | String |  |  |  |
| latitude | Number |  |  |  |
| longitude | Number |  |  |  |
| features | Array<String> |  |  |  |
| mapLink | String |  |  |  |
| googleMapLink | String |  |  |  |
| contacts | Array<Mixed> |  |  |  |
| isActive | Boolean |  | true | indexed |
| createdBy | ObjectId | User |  | required |
| updatedBy | ObjectId | User |  |  |
| idealCount | Number |  |  |  |
| idealCountUpdatedBy | ObjectId | User |  |  |
| idealCountUpdatedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## CenterAssetMapping  `centerassetmappings`
Documents: ~37

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required |
| centerId | ObjectId | Center |  |  |
| assetId | ObjectId | Asset |  | required |
| totalAssigned | Number |  |  | required |
| assetUsed | Number |  |  | required |
| assetNotUsed | Number |  |  | required |
| workingAsset | Number |  |  | required |
| notWorkingAsset | Number |  |  | required |
| remark | String |  |  |  |
| photos | Array<Mixed> |  |  |  |
| lastUpdatedBy | ObjectId | User |  | required |
| lastAuditDate | Date |  |  |  |
| auditEndDate | Date |  |  |  |
| nextAuditDate | Date |  |  |  |
| auditFrequencyMonths | Number |  |  |  |
| auditSubmitted | Boolean |  |  |  |
| lastAuditSubmittedAt | Date |  |  |  |
| lastAuditSubmittedBy | ObjectId | User |  |  |
| auditAutoArchivedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## City  `cities`
Documents: ~9

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| key | String |  |  | required, unique |
| value | String |  |  | required |
| state | String |  |  |  |
| country | String |  |  |  |
| stateId | ObjectId | State |  |  |
| countryId | ObjectId | Country |  |  |
| displayOrder | Number |  |  |  |
| isActive | Boolean |  | true |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Company  `companies`
Documents: ~2

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required, unique |
| isActive | Boolean |  | true |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ConsentRecord  `consent_records`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required, indexed |
| purpose | String |  | ACCOUNT_CREATION, TICKET_MANAGEMENT, COMMUNICATION, ANALYTICS, PROFILE_MANAGEMENT, OFFLINE_REGISTRATION, HRMS_INTEGRATION, PARENT_COMMUNICATION, FEEDBACK_COLLECTION, KNOWLEDGE_BASE_ACCESS, ASSET_MANAGEMENT, PROJECT_COLLABORATION | required, indexed |
| policyVersion | String |  |  | required, indexed |
| consentedAt | Date |  |  | required, indexed |
| withdrawnAt | Date |  |  | indexed |
| status | String |  | ACTIVE, WITHDRAWN, EXPIRED | required, indexed |
| expiresAt | Date |  |  | indexed |
| ipAddress | String |  |  |  |
| userAgent | String |  |  |  |
| consentText | String |  |  | required |
| dataCategories | Array<String> |  |  |  |
| sharingAllowed | Boolean |  |  | required |
| marketingAllowed | Boolean |  |  | required |
| projectId | ObjectId | Project |  | indexed |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Country  `countries`
Documents: ~7

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| key | String |  |  | required, unique |
| value | String |  |  | required |
| code | String |  |  | required |
| displayOrder | Number |  |  |  |
| isActive | Boolean |  | true |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## DashboardAssignment  `dashboardassignments`
Documents: ~2

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| tenantId | ObjectId | Project |  | required |
| dashboardTemplateId | ObjectId | DashboardTemplate |  | required |
| assigneeType | String |  | role, user | required |
| assigneeId | ObjectId |  |  | required |
| tabOrder | Number |  |  |  |
| isDefault | Boolean |  |  |  |
| scopeType | String |  | global, project, centre, email_domain, multi_centre |  |
| scopeProjectId | ObjectId | Project |  |  |
| scopeCentreIds | Array<ObjectId> | Center |  |  |
| scopeEmailDomain | String |  |  |  |
| assignedBy | ObjectId | User |  | required |
| assignedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## DashboardSummarySnapshot  `dashboardsummarysnapshots`
Documents: ~610

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| tenantId | ObjectId | Project |  | required |
| metricKey | String |  |  | required, indexed |
| date | Date |  |  | required |
| value | Number |  |  | required |
| meta | Mixed |  |  |  |
| computedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |

## DashboardTemplate  `dashboardtemplates`
Documents: ~6

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| tenantId | ObjectId | Project |  | required, indexed |
| name | String |  |  | required |
| description | String |  |  |  |
| icon | String |  |  |  |
| colourLabel | String |  |  |  |
| status | String |  | draft, published, archived | indexed |
| globalDateRangeDays | Number |  |  |  |
| allowUserDateOverride | Boolean |  |  |  |
| allTimeStartDate | String |  |  |  |
| isSystemTemplate | Boolean |  |  |  |
| theme | String |  | light, dark, system |  |
| allowWidgetExport | Boolean |  |  |  |
| autoRefreshSeconds | Number |  |  |  |
| sections | Array<Mixed> |  |  |  |
| createdBy | ObjectId | User |  | required |
| updatedBy | ObjectId | User |  |  |
| publishedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## DashboardUsageEvent  `dashboardusageevents`
Documents: ~3782

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required, indexed |
| tenantId | ObjectId | Project |  | required, indexed |
| eventType | String |  | dashboard_view, widget_view, widget_drill_through | required |
| dashboardTemplateId | ObjectId | DashboardTemplate |  |  |
| personalDashboardId | ObjectId | PersonalDashboard |  |  |
| widgetKey | String |  |  |  |
| sessionId | String |  |  |  |
| createdAt | Date |  |  |  |
| _id | ObjectId |  |  |  |

## DashboardWidget  `dashboardwidgets`
Documents: ~35

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| dashboardTemplateId | ObjectId | DashboardTemplate |  | required, indexed |
| widgetDefinitionId | ObjectId | WidgetDefinition |  |  |
| widgetKey | String |  |  | required |
| title | String |  |  |  |
| subtitle | String |  |  |  |
| visualisationType | String |  | kpi_tile, sparkline, line_chart, bar_chart, pie_chart, donut_chart, grouped_bar, area_chart, table, progress_bar, gauge | required |
| gridX | Number |  |  |  |
| gridY | Number |  |  |  |
| gridWidth | Number |  |  |  |
| gridHeight | Number |  |  |  |
| displayOrder | Number |  |  |  |
| mobileOrder | Number |  |  |  |
| displayConfig | Mixed |  |  |  |
| thresholdConfig | Mixed |  |  |  |
| tableConfig | Mixed |  |  |  |
| config | Mixed |  |  |  |
| sectionId | ObjectId |  |  |  |
| isVisible | Boolean |  |  |  |
| isCollapsedDefault | Boolean |  |  |  |
| widgetDefinitionVersion | Number |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## DashScheduledReport  `dash_scheduled_reports`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| dashboard_template_id | ObjectId | DashboardTemplate |  | required |
| name | String |  |  | required |
| schedule_type | String |  | daily, weekly, monthly, custom_cron | required |
| cron_expression | String |  |  | required |
| timezone | String |  |  |  |
| recipients | Array<Mixed> |  |  |  |
| format | String |  | pdf, csv, email_inline |  |
| date_range_days | Number |  |  |  |
| include_widgets | Array<ObjectId> | DashboardWidget |  |  |
| subject_template | String |  |  |  |
| body_template | String |  |  |  |
| is_active | Boolean |  |  |  |
| last_run_at | Date |  |  |  |
| last_run_status | String |  | success, failed, partial |  |
| last_error | String |  |  |  |
| created_by | ObjectId | User |  | required |
| tenant_id | String |  |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## DashThresholdAlert  `dash_threshold_alerts`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| dashboard_template_id | ObjectId | DashboardTemplate |  | required |
| dashboard_widget_id | ObjectId | DashboardWidget |  | required |
| widget_key | String |  |  | required |
| alert_name | String |  |  | required |
| condition.operator | String |  | gt, lt, gte, lte, eq | required |
| condition.value | Number |  |  | required |
| severity | String |  | info, warning, critical |  |
| notify_roles | Array<ObjectId> | Role |  |  |
| notify_users | Array<ObjectId> | User |  |  |
| cooldown_minutes | Number |  |  |  |
| last_triggered_at | Date |  |  |  |
| last_triggered_value | Number |  |  |  |
| is_active | Boolean |  |  |  |
| created_by | ObjectId | User |  | required |
| tenant_id | String |  |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## DataAccessLog  `data_access_logs`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| accessorUserId | ObjectId | User |  | required, indexed |
| accessorRole | String |  |  | required |
| accessorIP | String |  |  | required |
| targetUserId | ObjectId | User |  | required, indexed |
| dataCategory | String |  |  | required, indexed |
| fields | Array<String> |  |  |  |
| accessedAt | Date |  |  | required, indexed |
| endpoint | String |  |  | required |
| method | String |  |  | required |
| purpose | String |  |  | required, indexed |
| consentId | ObjectId | ConsentRecord |  | indexed |
| action | String |  | READ, CREATE, UPDATE, DELETE, EXPORT, SHARE | required, indexed |
| result | String |  | SUCCESS, DENIED, NO_CONSENT, INVALID_PURPOSE, ERROR | required, indexed |
| reason | String |  |  |  |
| projectId | ObjectId | Project |  | indexed |
| ticketId | ObjectId | Ticket |  | indexed |
| userAgent | String |  |  |  |
| sessionId | String |  |  | indexed |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |

## DeletionRequest  `deletion_requests`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required, indexed |
| requestedBy | ObjectId | User |  | required, indexed |
| scope | String |  | FULL_ACCOUNT, PARTIAL, ANONYMIZE | required |
| dataCategories | Array<String> |  |  |  |
| reason | String |  |  |  |
| status | String |  | PENDING, IN_PROGRESS, COMPLETED, FAILED, CANCELLED, RETAINED | required, indexed |
| requestedAt | Date |  |  | required, indexed |
| processedAt | Date |  |  | indexed |
| completedAt | Date |  |  | indexed |
| slaDeadline | Date |  |  | required, indexed |
| isOverdue | Boolean |  |  | indexed |
| deletedCollections | Array<String> |  |  |  |
| retainedData | Array<String> |  |  |  |
| deletionErrors | Array<Mixed> |  |  |  |
| verificationToken | String |  |  | indexed |
| verifiedAt | Date |  |  |  |
| legalHoldReason | String |  |  |  |
| legalHoldUntil | Date |  |  | indexed |
| projectId | ObjectId | Project |  | indexed |
| ipAddress | String |  |  |  |
| userAgent | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Department  `departments`
Documents: ~4

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| description | String |  |  |  |
| projectId | ObjectId | Project |  | required, indexed |
| isActive | Boolean |  | true |  |
| createdBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## EmailConfig  `emailconfigs`
Documents: ~6

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, unique |
| enabled | Boolean |  |  |  |
| emailProvider | String |  | smtp, sendgrid |  |
| sendgridApiKey | String |  |  |  |
| smtpHost | String |  |  |  |
| smtpPort | Number |  |  |  |
| smtpSecure | Boolean |  |  |  |
| smtpUser | String |  |  |  |
| smtpPassword | String |  |  |  |
| fromEmail | String |  |  |  |
| fromName | String |  |  |  |
| connectionStatus | String |  | connected, disconnected, error, untested | indexed |
| lastConnectionTest | Date |  |  |  |
| lastConnectionError | String |  |  |  |
| lastSuccessfulConnection | Date |  |  |  |
| failedAttempts | Number |  |  |  |
| nextRetryAt | Date |  |  |  |
| triggers.accountCreated | Embedded |  |  |  |
| triggers.passwordReset | Embedded |  |  |  |
| triggers.ticketCreatedStudent | Embedded |  |  |  |
| triggers.ticketCreatedAgent | Embedded |  |  |  |
| triggers.ticketCreatedOnline | Embedded |  |  |  |
| triggers.ticketCreatedOffline | Embedded |  |  |  |
| triggers.ticketCreatedEmail | Embedded |  |  |  |
| triggers.ticketAssigned | Embedded |  |  |  |
| triggers.ticketEscalated | Embedded |  |  |  |
| triggers.ticketReassigned | Embedded |  |  |  |
| triggers.ticketStatusChanged | Embedded |  |  |  |
| triggers.ticketClosed | Embedded |  |  |  |
| triggers.ticketRejected | Embedded |  |  |  |
| triggers.ticketReopened | Embedded |  |  |  |
| triggers.ticketCommentAdded | Embedded |  |  |  |
| triggers.ticketReplied | Embedded |  |  |  |
| triggers.ticketReminderAgent24hrs | Embedded |  |  |  |
| triggers.ticketReminderAgent48hrs | Embedded |  |  |  |
| triggers.ticketDueSoon | Embedded |  |  |  |
| triggers.ticketOverdue | Embedded |  |  |  |
| triggers.studentWelcome | Embedded |  |  |  |
| triggers.studentOTP | Embedded |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## EmailLog  `emaillogs`
Documents: ~887

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | indexed |
| projectName | String |  |  |  |
| recipient | String |  |  | required, indexed |
| subject | String |  |  | required |
| body | String |  |  |  |
| type | String |  | otp, ticket_created, student_welcome, password_reset, ticket_update, other | required, indexed |
| status | String |  | sent, failed, blocked, simulated | required, indexed |
| error | String |  |  |  |
| metadata | Mixed |  |  |  |
| smtpHost | String |  |  |  |
| fromEmail | String |  |  |  |
| vendor | String |  |  | indexed |
| sentAt | Date |  |  | indexed |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## EmailProcessingQueue  `emailprocessingqueues`
Documents: ~1238

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectEmailConfigId | ObjectId | ProjectEmailConfig |  | required, indexed |
| rawEmail | String |  |  | required |
| status | String |  | pending, processing, completed, failed | required, indexed |
| errorMessage | String |  |  |  |
| error | String |  |  |  |
| retryCount | Number |  |  |  |
| processedAt | Date |  |  | indexed |
| lastAttemptAt | Date |  |  |  |
| lastRetryAt | Date |  |  |  |
| ticketId | ObjectId | Ticket |  | indexed |
| emailCommunicationId | ObjectId | TicketEmailCommunication |  |  |
| metadata.fromEmail | String |  |  |  |
| metadata.toEmail | String |  |  |  |
| metadata.subject | String |  |  |  |
| metadata.messageId | String |  |  |  |
| metadata.size | Number |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ErrorLog  `errorlogs`
Documents: ~11705

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| message | String |  |  | required, indexed |
| stack | String |  |  |  |
| context | String |  | email_polling, email_parsing, ticket_creation, ticket_update, email_sending, thread_detection, database_operation, api_request, authentication, validation, smtp_connection, file_upload | required, indexed |
| severity | String |  | low, medium, high, critical | required, indexed |
| details | Mixed |  |  |  |
| projectId | ObjectId | Project |  | indexed |
| timestamp | Date |  |  | required, indexed |
| resolved | Boolean |  |  | indexed |
| resolvedAt | Date |  |  |  |
| resolvedBy | ObjectId | User |  |  |
| resolution | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## EscalationMatrix  `escalationmatrixes`
Documents: ~18

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required, indexed |
| description | String |  |  |  |
| escalationMode | String |  | SEQUENTIAL, RANDOM | required, indexed |
| scopeMode | String |  | PRIORITY, CATEGORY | indexed |
| categoryIds | Array<ObjectId> | Category |  |  |
| priorityMode | String |  | SAME_FOR_ALL, PER_PRIORITY | required, indexed |
| allowSkipLevel | Boolean |  |  |  |
| allowBackward | Boolean |  |  |  |
| autoEscalate | Boolean |  |  |  |
| bypassGracePeriod | Boolean |  |  |  |
| slaWarningConfig.warningThresholds | Array<Number> |  |  |  |
| slaWarningConfig.notifyAssignedAgent | Boolean |  |  |  |
| slaWarningConfig.notifyRoles | Array<ObjectId> | Role |  |  |
| levels | Array<Mixed> |  |  |  |
| priorityConfigs | Array<Mixed> |  |  |  |
| projectIds | Array<ObjectId> | Project |  |  |
| applicablePriorities | Array<String> |  |  |  |
| isActive | Boolean |  | true | indexed |
| createdBy | ObjectId | User |  | required |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## EscalationPolicy  `escalationpolicies`
Documents: ~2

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| policyId | String |  |  | unique |
| name | String |  |  | required |
| description | String |  |  |  |
| levels | Array<Mixed> |  |  |  |
| isActive | Boolean |  | true |  |
| projectId | ObjectId | Project |  |  |
| projectIds | Array<ObjectId> | Project |  |  |
| slaRuleIds | Array<ObjectId> | SLARule |  |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## EulaAcceptance  `eulaacceptances`
Documents: ~1

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required |
| version | String |  |  | required |
| acceptedAt | Date |  |  |  |
| ipAddress | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## FAQ  `faqs`
Documents: ~5

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| question | String |  |  | required |
| answer | String |  |  | required |
| category | String |  |  |  |
| tags | Array<String> |  |  |  |
| status | String |  | active, inactive |  |
| displayOrder | Number |  |  |  |
| viewCount | Number |  |  |  |
| helpfulCount | Number |  |  |  |
| notHelpfulCount | Number |  |  |  |
| createdBy.userId | ObjectId | User |  | required |
| createdBy.name | String |  |  | required |
| createdBy.email | String |  |  | required |
| updatedBy.userId | ObjectId | User |  |  |
| updatedBy.name | String |  |  |  |
| updatedBy.email | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## FeedbackForm  `feedbackforms`
Documents: ~3

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required |
| name | String |  |  | required |
| description | String |  |  |  |
| questions | Array<Mixed> |  |  |  |
| isActive | Boolean |  | false, true |  |
| triggers | Array<Mixed> |  |  |  |
| emailTemplate.subject | String |  |  |  |
| emailTemplate.body | String |  |  |  |
| settings.showAfterTicketClosed | Boolean |  |  |  |
| settings.allowMultipleSubmissions | Boolean |  |  |  |
| settings.sendEmailNotification | Boolean |  |  |  |
| settings.emailDelay | Number |  |  |  |
| createdBy | ObjectId | User |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## FeedbackResponse  `feedbackresponses`
Documents: ~1

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required |
| ticketId | ObjectId | Ticket |  | required |
| formId | ObjectId | FeedbackForm |  | required |
| studentId | ObjectId | User |  | required |
| answers | Array<Mixed> |  |  |  |
| overallRating | Number |  |  |  |
| submittedAt | Date |  |  |  |
| ipAddress | String |  |  |  |
| userAgent | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## FeedbackScore  `feedback_scores`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| ticket_id | ObjectId | Ticket |  | required, indexed |
| project_id | ObjectId | Project |  | required |
| respondent_user_id | ObjectId | User |  | required |
| agent_id | ObjectId | User |  |  |
| csat_rating | Number |  |  |  |
| nps_rating | Number |  |  |  |
| ces_rating | Number |  |  |  |
| comment | String |  |  |  |
| submitted_at | Date |  |  | required |
| ticket_category | String |  |  |  |
| ticket_priority | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Form  `forms`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| description | String |  |  |  |
| context | Array<String> |  |  |  |
| versions | Array<Mixed> |  |  | required |
| activeVersion | Number |  |  | required |
| auditTrail | Array<Mixed> |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |

## FormAuditLog  `formauditlogs`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| formId | ObjectId | Form |  | required |
| action | String |  |  | required |
| performedBy | ObjectId | User |  | required |
| timestamp | Date |  |  |  |
| details | Mixed |  |  |  |
| _id | ObjectId |  |  |  |

## HierarchyConfig  `hierarchyconfigs`
Documents: ~4

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, unique, indexed |
| levelCount | Number |  |  | required |
| levels | Array<Mixed> |  |  | required |
| visibilitySettings | Embedded |  |  |  |
| priorityFromLevel | Number |  |  |  |
| isActive | Boolean |  | true |  |
| createdBy | ObjectId | User |  | required |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Job  `jobs`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| jobId | String |  |  | required, unique, indexed |
| type | String |  |  | required, indexed |
| data | Mixed |  |  | required |
| status | String |  | pending, processing, completed, failed, retry | indexed |
| priority | String |  | critical, high, normal, low | indexed |
| attempts | Number |  |  |  |
| maxAttempts | Number |  |  |  |
| delay | Number |  |  |  |
| result | Mixed |  |  |  |
| error | String |  |  |  |
| errorStack | String |  |  |  |
| progress | Number |  |  |  |
| workerId | String |  |  |  |
| scheduledFor | Date |  |  | indexed |
| startedAt | Date |  |  |  |
| completedAt | Date |  |  |  |
| entityId | String |  |  | indexed |
| entityType | String |  |  | indexed |
| createdBy | ObjectId | User |  |  |
| projectId | ObjectId | Project |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## JobLog  `joblogs`
Documents: ~38781

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| jobType | String |  |  | indexed |
| ranAt | Date |  |  | indexed |
| durationMs | Number |  |  |  |
| processed | Number |  |  |  |
| escalated | Number |  |  |  |
| skipped | Number |  |  |  |
| errorMessages | Array<String> |  |  |  |
| status | String |  | success, partial, error |  |
| _id | ObjectId |  |  |  |

## KBArticle  `kbarticles`
Documents: ~7

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| documentName | String |  |  | required |
| documentType | String |  | pdf, html, both, link | required |
| projectIds | Array<ObjectId> | Project |  |  |
| pdfUrl | String |  |  |  |
| pdfFilename | String |  |  |  |
| pdfSize | Number |  |  |  |
| htmlContent | String |  |  |  |
| externalUrl | String |  |  |  |
| publishedDate | Date |  |  |  |
| visibility | String |  | all, internal, public, role_based |  |
| visibleToRoles | Array<ObjectId> | Role |  |  |
| alsoShowOnPublicPortal | Boolean |  |  |  |
| docNumber | String |  |  |  |
| pageNumber | Number |  |  |  |
| uploadedAt | Date |  |  |  |
| description | String |  |  |  |
| tags | Array<String> |  |  |  |
| author | String |  |  |  |
| status | String |  | active, inactive |  |
| isFeatured | Boolean |  |  |  |
| showNewTag | Boolean |  |  |  |
| displayOrder | Number |  |  |  |
| viewsCount | Number |  |  |  |
| createdBy | ObjectId | User |  | required |
| updatedBy | ObjectId | User |  |  |
| publishedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## KBArticleLevelMapping  `kbarticlelevelmappings`
Documents: ~23

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| articleId | ObjectId | KBArticle |  | required |
| levelId | ObjectId | KBLevel |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |

## KBCategory  `kbcategories`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| name | String |  |  | required |
| description | String |  |  |  |
| icon | String |  |  |  |
| displayOrder | Number |  |  |  |
| isActive | Boolean |  |  |  |
| createdBy | ObjectId | User |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## KBLevel  `kblevels`
Documents: ~12

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| levelName | String |  |  | required |
| levelOrder | Number |  |  | required |
| levelIcon | String |  |  |  |
| status | String |  | active, inactive |  |
| description | String |  |  |  |
| projectIds | Array<ObjectId> | Project |  |  |
| createdBy | ObjectId | User |  | required |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## KBSubcategory  `kbsubcategories`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| categoryId | ObjectId | KBCategory |  | required, indexed |
| name | String |  |  | required |
| description | String |  |  |  |
| displayOrder | Number |  |  |  |
| isActive | Boolean |  |  |  |
| createdBy | ObjectId | User |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## KBTable  `kbtables`
Documents: ~2

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| tableName | String |  |  | required |
| description | String |  |  |  |
| projectId | ObjectId | Project |  | required, indexed |
| levelIds | Array<ObjectId> | KBLevel |  | indexed |
| dataSource | String |  | manual, articles |  |
| autoPopulateFromArticles | Boolean |  |  |  |
| displayStyle | String |  | table, tiles |  |
| columns | Array<Mixed> |  |  |  |
| rows | Array<Mixed> |  |  |  |
| status | String |  | active, inactive |  |
| showSerialNumber | Boolean |  |  |  |
| isSearchable | Boolean |  |  |  |
| isPaginated | Boolean |  |  |  |
| createdBy | ObjectId | User |  | required |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## KnowledgeBaseArticle  `knowledgebasearticles`
Documents: ~5

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| categoryId | ObjectId | KBCategory |  | indexed |
| subcategoryId | ObjectId | KBSubcategory |  | indexed |
| title | String |  |  | required |
| contentType | String |  | html, pdf | required |
| content | String |  |  |  |
| pdfUrl | String |  |  |  |
| pdfFileName | String |  |  |  |
| category | String |  |  |  |
| tags | Array<String> |  |  |  |
| author | ObjectId | User |  | required |
| status | String |  | draft, published, archived |  |
| visibility | String |  | all, internal, public, role_based |  |
| visibleToRoles | Array<ObjectId> | Role |  |  |
| viewCount | Number |  |  |  |
| helpfulCount | Number |  |  |  |
| notHelpfulCount | Number |  |  |  |
| displayOrder | Number |  |  |  |
| isActive | Boolean |  | true |  |
| publishedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## MasterData  `masterdatas`
Documents: ~42

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| category | String |  |  | required |
| key | String |  |  | required |
| value | String |  |  | required |
| metadata | Mixed |  |  |  |
| isActive | Boolean |  | true |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Notification  `notifications`
Documents: ~375

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| recipientUserId | ObjectId | User |  | required |
| triggeredByUserId | ObjectId | User |  |  |
| projectId | ObjectId | Project |  |  |
| triggerType | String |  | ticket_created, ticket_assigned_to_me, ticket_reply_added, ticket_status_changed, ticket_mentioned, ticket_closed, ticket_escalated, kb_article_published, kb_article_updated, kb_article_archived, sla_breach_warning, sla_breached | required |
| entityType | String |  | ticket, kb_article, comment | required |
| entityId | ObjectId |  |  | required |
| title | String |  |  | required |
| body | String |  |  |  |
| deepLinkUrl | String |  |  | required |
| isRead | Boolean |  |  |  |
| readAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## NotificationSetting  `notificationsettings`
Documents: ~71

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  |  |
| triggerType | String |  | ticket_created, ticket_assigned_to_me, ticket_reply_added, ticket_status_changed, ticket_mentioned, ticket_closed, ticket_escalated, kb_article_published, kb_article_updated, kb_article_archived, sla_breach_warning, sla_breached | required |
| roleId | ObjectId | Role |  | required |
| isEnabled | Boolean |  |  |  |
| channels.inApp | Boolean |  |  |  |
| channels.email | Boolean |  |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Permission  `permissions`
Documents: ~242

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| module | String |  |  | required |
| name | String |  |  | required |
| code | String |  |  | required, unique |
| description | String |  |  |  |
| category | String |  | dashboard, project-management, master-data, rbac-setup, user-management, fields-forms, ticket-automation, ticket-configuration, approval-process, workflow-role-mapping, sla-escalation, knowledge-base | required |
| isActive | Boolean |  | false, true |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## PersonalDashboard  `personaldashboards`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required, indexed |
| tenantId | ObjectId | Project |  | required, indexed |
| name | String |  |  | required |
| description | String |  |  |  |
| colourLabel | String |  |  |  |
| globalDateRangeDays | Number |  |  |  |
| allowUserDateOverride | Boolean |  |  |  |
| widgets | Array<Mixed> |  |  |  |
| isDefault | Boolean |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Priority  `priorities`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| code | String |  |  | required |
| color | String |  |  | required |
| order | Number |  |  | required |
| responseTime.value | Number |  |  | required |
| responseTime.unit | String |  | minutes, hours, days | required |
| resolutionTime.value | Number |  |  | required |
| resolutionTime.unit | String |  | minutes, hours, days | required |
| isActive | Boolean |  |  |  |
| isDefault | Boolean |  |  |  |
| description | String |  |  |  |
| projectId | ObjectId | Project |  | required |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Project  `projects`
Documents: ~12

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | String |  |  | unique |
| name | String |  |  |  |
| code | String |  |  | unique |
| description | String |  |  |  |
| address.street | String |  |  |  |
| address.city | String |  |  |  |
| address.state | String |  |  |  |
| address.country | String |  |  |  |
| address.pincode | String |  |  |  |
| contactInfo.phone | String |  |  |  |
| contactInfo.email | String |  |  |  |
| contactInfo.website | String |  |  |  |
| region | String |  |  |  |
| primaryContact.name | String |  |  |  |
| primaryContact.email | String |  |  |  |
| primaryContact.phone | String |  |  |  |
| primaryContact.designation | String |  |  |  |
| branding.logo | String |  |  |  |
| branding.logoLinkbackUrl | String |  |  |  |
| branding.colorTheme.primary | String |  |  |  |
| branding.colorTheme.secondary | String |  |  |  |
| branding.colorTheme.accent | String |  |  |  |
| branding.colorTheme.background | String |  |  |  |
| branding.headerText | String |  |  |  |
| branding.browserTitle | String |  |  |  |
| branding.footerText | String |  |  |  |
| branding.domainUrl | String |  |  |  |
| branding.favicon | String |  |  |  |
| branding.customUrlPath | String |  |  | unique |
| modules.tickets | Boolean |  |  |  |
| modules.knowledgeBase | Boolean |  |  |  |
| modules.reports | Boolean |  |  |  |
| modules.assets | Boolean |  |  |  |
| modules.communication | Boolean |  |  |  |
| modules.analytics | Boolean |  |  |  |
| modules.userManagement | Boolean |  |  |  |
| modules.workflows | Boolean |  |  |  |
| modules.approvals | Boolean |  |  |  |
| modules.notifications | Boolean |  |  |  |
| settings.defaultLanguage | String |  |  |  |
| settings.timezone | String |  |  |  |
| settings.dateFormat | String |  |  |  |
| settings.timeFormat | String |  |  |  |
| settings.currency | String |  |  |  |
| settings.firstDayOfWeek | Number |  |  |  |
| configuration.maxUsers | Number |  |  |  |
| configuration.maxStorage | Number |  |  |  |
| configuration.allowedDomains | Array<String> |  |  |  |
| configuration.customFields | Array<String> |  |  |  |
| configuration.slaSettings.enabled | Boolean |  |  |  |
| configuration.slaSettings.defaultResponseTime | Number |  |  |  |
| configuration.slaSettings.defaultResolutionTime | Number |  |  |  |
| configuration.ticketNumberSettings.prefix | String |  |  |  |
| configuration.ticketNumberSettings.format | String |  |  |  |
| configuration.ticketNumberSettings.startingNumber | Number |  |  |  |
| configuration.ticketNumberSettings.resetPeriod | String |  | never, daily, monthly, yearly |  |
| configuration.ticketAssignmentSettings.enabled | Boolean |  |  |  |
| configuration.ticketAssignmentSettings.assignmentType | String |  | round-robin, load-balanced, manual, condition-based |  |
| configuration.ticketAssignmentSettings.assignToUsers | Array<ObjectId> | User |  |  |
| configuration.ticketAssignmentSettings.assignToRoles | Array<String> |  |  |  |
| configuration.ticketAssignmentSettings.reassignOnEscalation | Boolean |  |  |  |
| configuration.ticketAssignmentSettings.notifyOnAssignment | Boolean |  |  |  |
| configuration.ticketAssignmentSettings.autoEscalateGracePeriodMins | Number |  |  |  |
| configuration.ticketAssignmentSettings.conditionRules | Array<Mixed> |  |  |  |
| configuration.ticketAssignmentSettings.manualAssignmentPermissions | Array<Mixed> |  |  |  |
| configuration.securitySettings.mfaRequired | Boolean |  |  |  |
| configuration.securitySettings.passwordPolicy.minLength | Number |  |  |  |
| configuration.securitySettings.passwordPolicy.requireUppercase | Boolean |  |  |  |
| configuration.securitySettings.passwordPolicy.requireLowercase | Boolean |  |  |  |
| configuration.securitySettings.passwordPolicy.requireNumbers | Boolean |  |  |  |
| configuration.securitySettings.passwordPolicy.requireSpecialChars | Boolean |  |  |  |
| configuration.securitySettings.passwordPolicy.expiryDays | Number |  |  |  |
| configuration.securitySettings.sessionTimeout | Number |  |  |  |
| configuration.securitySettings.ipWhitelist | Array<String> |  |  |  |
| configuration.securitySettings.allowUserSignup | Boolean |  |  |  |
| configuration.securitySettings.restrictSignupViaSocial | Boolean |  |  |  |
| configuration.loginSettings.enableFormLogin | Boolean |  |  |  |
| configuration.loginSettings.enableGoogleRecaptcha | Boolean |  |  |  |
| configuration.loginSettings.socialLogins.google | Boolean |  |  |  |
| configuration.loginSettings.socialLogins.facebook | Boolean |  |  |  |
| configuration.loginSettings.socialLogins.microsoft | Boolean |  |  |  |
| configuration.loginSettings.ssoSettings.oauth20 | Boolean |  |  |  |
| configuration.loginSettings.ssoSettings.openIdConnect | Boolean |  |  |  |
| configuration.loginSettings.ssoSettings.jwt | Boolean |  |  |  |
| configuration.loginSettings.ssoSettings.keycloak.enabled | Boolean |  |  |  |
| configuration.loginSettings.ssoSettings.keycloak.url | String |  |  |  |
| configuration.loginSettings.ssoSettings.keycloak.realm | String |  |  |  |
| configuration.loginSettings.ssoSettings.keycloak.clientId | String |  |  |  |
| configuration.loginSettings.ssoSettings.keycloak.clientSecret | String |  |  |  |
| configuration.loginSettings.ssoSettings.keycloak.userMatchField | String |  | email, mobile |  |
| configuration.knowledgeBaseSettings.enabled | Boolean |  |  |  |
| configuration.knowledgeBaseSettings.kbHomeConfiguration | Mixed |  |  |  |
| configuration.knowledgeBaseSettings.articleConfiguration | Mixed |  |  |  |
| configuration.knowledgeBaseSettings.enableAIAssistance | Boolean |  |  |  |
| configuration.knowledgeBaseSettings.enableSatisfactionFeedback | Boolean |  |  |  |
| configuration.knowledgeBaseSettings.satisfactionFeedback | Mixed |  |  |  |
| configuration.knowledgeBaseSettings.seoSettings | Mixed |  |  |  |
| configuration.assetLinkButtons | Array<Mixed> |  |  |  |
| configuration.customizationSettings.loginPageBackgroundImage | String |  |  |  |
| configuration.customizationSettings.themeMode | String |  | light, dark |  |
| configuration.customizationSettings.themeColor | String |  |  |  |
| configuration.customizationSettings.customCSS | String |  |  |  |
| configuration.customizationSettings.customJS | String |  |  |  |
| configuration.footerLinks.copyright | String |  |  |  |
| configuration.footerLinks.termsOfUse | String |  |  |  |
| configuration.footerLinks.privacyPolicy | String |  |  |  |
| configuration.footerLinks.cookiePolicy | String |  |  |  |
| configuration.announcementBanner.message | String |  |  |  |
| configuration.announcementBanner.type | String |  | plain, rich |  |
| configuration.ticketSubmissionSettings.mode | String |  | online, offline, both |  |
| configuration.ticketSubmissionSettings.enableOnlineForm | Boolean |  |  |  |
| configuration.ticketSubmissionSettings.enableOfflineCenter | Boolean |  |  |  |
| configuration.ticketSubmissionSettings.tableColumns | Array<String> |  |  |  |
| configuration.ticketSubmissionSettings.filterableColumns | Array<String> |  |  |  |
| configuration.ticketSubmissionSettings.onlineFormFields | Array<Mixed> |  |  |  |
| configuration.ticketSubmissionSettings.offlineCenters | Array<Mixed> |  |  |  |
| configuration.ticketSubmissionSettings.welcomeMessage | String |  |  |  |
| configuration.ticketSubmissionSettings.successMessage | String |  |  |  |
| configuration.ticketSubmissionSettings.announcement | String |  |  |  |
| configuration.ticketSubmissionSettings.allowAttachments | Boolean |  |  |  |
| configuration.ticketSubmissionSettings.maxAttachmentSize | Number |  |  |  |
| configuration.ticketSubmissionSettings.allowedFileTypes | Array<String> |  |  |  |
| configuration.offlineModuleSettings.registrationFields | Array<Mixed> |  |  |  |
| configuration.offlineModuleSettings.ticketFields | Array<Mixed> |  |  |  |
| configuration.offlineModuleSettings.allowAgentToMarkResolved | Boolean |  |  |  |
| configuration.offlineModuleSettings.allowAgentToEscalate | Boolean |  |  |  |
| configuration.offlineModuleSettings.autoAssignToCreatingAgent | Boolean |  |  |  |
| configuration.offlineModuleSettings.requireStudentVerification | Boolean |  |  |  |
| configuration.offlineModuleSettings.offlineTicketNumbering.prefix | String |  |  |  |
| configuration.offlineModuleSettings.offlineTicketNumbering.startingNumber | Number |  |  |  |
| configuration.offlineModuleSettings.offlineTicketNumbering.separator | String |  |  |  |
| configuration.offlineModuleSettings.offlineTicketNumbering.includeYear | Boolean |  |  |  |
| configuration.offlineModuleSettings.offlineTicketNumbering.includeMonth | Boolean |  |  |  |
| configuration.offlineModuleSettings.offlineTicketNumbering.resetFrequency | String |  | never, yearly, monthly |  |
| configuration.offlineModuleSettings.notificationSettings.notifyStudentOnRegistration | Boolean |  |  |  |
| configuration.offlineModuleSettings.notificationSettings.notifyStudentOnTicketCreation | Boolean |  |  |  |
| configuration.offlineModuleSettings.notificationSettings.sendWelcomeEmail | Boolean |  |  |  |
| configuration.whatsappWidget.enabled | Boolean |  |  |  |
| configuration.whatsappWidget.visibility | String |  | always, pre-login, post-login |  |
| configuration.whatsappWidget.roleVisibility | String |  | all, roles |  |
| configuration.whatsappWidget.visibleRoles | Array<String> |  |  |  |
| configuration.whatsappWidget.phoneNumber | String |  |  |  |
| configuration.whatsappWidget.predefinedMessage | String |  |  |  |
| configuration.whatsappWidget.position | String |  | bottom-right, bottom-left |  |
| configuration.whatsappWidget.iconSize | String |  | small, medium, large |  |
| status | String |  | active, inactive, suspended |  |
| isActive | Boolean |  | true |  |
| users | Number |  |  |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| ticketSequence | Number |  |  |  |
| publicApiSettings.estimatedResponseTime | String |  |  |  |
| publicApiSettings.duplicateTicketWindowMinutes | Number |  |  |  |
| publicApiSettings.projectCode | String |  |  |  |
| publicApiSettings.customFields | Array<Mixed> |  |  |  |
| userTarget.required | Number |  |  |  |
| userTarget.requiredUpdatedBy | ObjectId | User |  |  |
| userTarget.requiredUpdatedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ProjectEmailConfig  `projectemailconfigs`
Documents: ~1

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| emailAddress | String |  |  | required, indexed |
| isEnabled | Boolean |  |  | indexed |
| provider | String |  | google, microsoft, other |  |
| authMethod | String |  | basic, oauth2, app_password |  |
| inboundMethod | String |  | imap, sendgrid, webhook, graph |  |
| outboundMethod | String |  | smtp, sendgrid, graph |  |
| sendgridApiKey | String |  |  |  |
| webhookProvider | String |  |  |  |
| webhookPayloadMap.to | String |  |  |  |
| webhookPayloadMap.from | String |  |  |  |
| webhookPayloadMap.subject | String |  |  |  |
| webhookPayloadMap.text | String |  |  |  |
| webhookPayloadMap.html | String |  |  |  |
| webhookPayloadMap.messageId | String |  |  |  |
| isForwardedMailbox | Boolean |  |  |  |
| originalEmailAddress | String |  |  |  |
| replySignature | String |  |  |  |
| imapHost | String |  |  | required |
| imapPort | Number |  |  | required |
| imapUsername | String |  |  | required |
| imapPassword | String |  |  | required |
| smtpHost | String |  |  | required |
| smtpPort | Number |  |  | required |
| smtpUsername | String |  |  | required |
| smtpPassword | String |  |  | required |
| oauth2.clientId | String |  |  |  |
| oauth2.clientSecret | String |  |  |  |
| oauth2.tenantId | String |  |  |  |
| oauth2.refreshToken | String |  |  |  |
| oauth2.accessToken | String |  |  |  |
| oauth2.tokenExpiry | Date |  |  |  |
| oauth2.scope | String |  |  |  |
| lastCheckedAt | Date |  |  |  |
| lastCheckStatus | String |  | success, failed |  |
| lastCheckError | String |  |  |  |
| lastConnectionTest | Date |  |  |  |
| connectionStatus | String |  | connected, error, untested |  |
| lastSuccessfulConnection | Date |  |  |  |
| failedAttempts | Number |  |  |  |
| nextRetryAt | Date |  |  |  |
| lastConnectionError | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## PublicApiKey  `publicapikeys`
Documents: ~10

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, indexed |
| name | String |  |  | required |
| keyHash | String |  |  | required |
| keyPrefix | String |  |  | required |
| isActive | Boolean |  | false, true | indexed |
| createdBy | ObjectId | User |  | required |
| revokedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## PushSubscription  `pushsubscriptions`
Documents: ~5

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required, indexed |
| endpoint | String |  |  | required, unique |
| keys.p256dh | String |  |  | required |
| keys.auth | String |  |  | required |
| userAgent | String |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ReassignmentConfig  `reassignmentconfigs`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, unique, indexed |
| isEnabled | Boolean |  |  | required |
| mode | String |  | sequential, flexible | required |
| maxReassignments | Number |  |  | required |
| requireReason | Boolean |  |  | required |
| reasonCategories | Array<String> |  |  |  |
| resetSlaOnReassignment | Boolean |  |  | required |
| allowCrossProject | Boolean |  |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ReportAssignment  `reportassignments`
Documents: ~6

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| reportId | ObjectId | SavedReport |  | required, unique |
| assignedToUsers | Array<ObjectId> | User |  |  |
| assignedToRoles | Array<ObjectId> | Role |  |  |
| assignedBy | ObjectId | User |  | required |
| assignedAt | Date |  |  |  |
| alertEnabled | Boolean |  |  |  |
| scheduleType | String |  | daily, weekly, monthly |  |
| scheduleDay | Number |  |  |  |
| scheduleTime | String |  |  |  |
| lastAlertSentAt | Date |  |  |  |
| ccUsers | Array<ObjectId> | User |  |  |
| ccEmails | Array<String> |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ReportDataPoint  `reportdatapoints`
Documents: ~124

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| key | String |  |  | required, unique |
| label | String |  |  | required |
| description | String |  |  |  |
| category | String |  | ticket, agent, customer, sla, channel, feedback, footfall, custom_form, user, asset, asset_audit, asset_inventory | required |
| source | String |  | ticket, user, asset, asset_audit, asset_inventory, feedback, service_request, call, inquiry |  |
| fieldPath | String |  |  | required |
| fieldType | String |  | string, number, date, boolean, array | required |
| isActive | Boolean |  | true |  |
| isSystem | Boolean |  |  |  |
| order | Number |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ReportDataPointAccess  `reportdatapointaccesses`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| roleId | ObjectId | Role |  | required, unique |
| roleCode | String |  |  | required |
| allowedDataPoints | Array<String> |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## ReportModulePermission  `reportmodulepermissions`
Documents: ~1

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| roleId | ObjectId | Role |  | required, unique |
| roleCode | String |  |  | required |
| roleName | String |  |  | required |
| canView | Boolean |  |  |  |
| canCreate | Boolean |  |  |  |
| canExport | Boolean |  |  |  |
| canSchedule | Boolean |  |  |  |
| canAssign | Boolean |  |  |  |
| canDelete | Boolean |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Role  `roles`
Documents: ~51

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| code | String |  |  | required |
| description | String |  |  |  |
| type | String |  | system, custom |  |
| projectId | ObjectId | Project |  |  |
| projects | Array<ObjectId> | Project |  |  |
| permissions | Array<ObjectId> | Permission |  |  |
| agentCount | Number |  |  |  |
| isActive | Boolean |  | true |  |
| isMaster | Boolean |  |  |  |
| masterRoleId | ObjectId | Role |  |  |
| isAgent | Boolean |  |  |  |
| document.fileName | String |  |  |  |
| document.filePath | String |  |  |  |
| document.fileUrl | String |  |  |  |
| document.uploadedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## SavedReport  `savedreports`
Documents: ~10

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| description | String |  |  |  |
| reportType | String |  | ticket, attendance, footfall |  |
| createdBy | ObjectId | User |  | required |
| projectId | ObjectId | Project |  |  |
| dataPoints | Array<String> |  |  | required |
| filters | Array<Mixed> |  |  |  |
| sortBy | String |  |  |  |
| sortOrder | String |  | asc, desc |  |
| footfallDays | Number |  |  |  |
| reportMode | String |  | detail, summary |  |
| pivotRow | String |  |  |  |
| pivotCol | String |  |  |  |
| isActive | Boolean |  | false, true |  |
| rowCount | Number |  |  |  |
| lastRunAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## SLARule  `slarules`
Documents: ~12

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| description | String |  |  |  |
| priority | String |  | Critical, Urgent, High, Normal, Low |  |
| dashboardCategory | String |  | high, medium, low |  |
| responseTime.value | Number |  |  | required |
| responseTime.unit | String |  | minutes, hours, days | required |
| resolutionTime.value | Number |  |  | required |
| resolutionTime.unit | String |  | minutes, hours, days | required |
| isActive | Boolean |  | true |  |
| projectIds | Array<ObjectId> | Project |  |  |
| escalationPolicyId | ObjectId | EscalationPolicy |  |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## SLATracking  `slatrackings`
Documents: ~852

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| ticketId | ObjectId | Ticket |  | required, unique |
| projectId | ObjectId | Project |  | required |
| slaRuleId | ObjectId | SLARule |  |  |
| escalationPolicyId | ObjectId | EscalationPolicy |  |  |
| responseDeadline | Date |  |  |  |
| resolutionDeadline | Date |  |  | required |
| responseStatus | String |  | met, breached, pending |  |
| resolutionStatus | String |  | met, breached, pending |  |
| firstResponseAt | Date |  |  |  |
| responseTime | Number |  |  |  |
| resolvedAt | Date |  |  |  |
| resolutionTime | Number |  |  |  |
| currentEscalationLevel | Number |  |  |  |
| lastEscalationAt | Date |  |  |  |
| nextEscalationDue | Date |  |  |  |
| escalationHistory | Array<Mixed> |  |  |  |
| slaSource | String |  | category, priority, default |  |
| isPaused | Boolean |  |  |  |
| pausedAt | Date |  |  |  |
| pausedDuration | Number |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## SMSConfig  `smsconfigs`
Documents: ~6

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, unique |
| enabled | Boolean |  |  |  |
| vendor | String |  | gupshup, ttbs, custom |  |
| apiUrl | String |  |  |  |
| usernameParamName | String |  |  |  |
| passwordParamName | String |  |  |  |
| phoneParamName | String |  |  |  |
| messageParamName | String |  |  |  |
| senderIdParamName | String |  |  |  |
| senderId | String |  |  |  |
| peid | String |  |  |  |
| extraStaticParams | String |  |  |  |
| successPattern | String |  |  |  |
| userId | String |  |  |  |
| password | String |  |  |  |
| triggers.accountCreated | Embedded |  |  |  |
| triggers.passwordReset | Embedded |  |  |  |
| triggers.studentOTP | Embedded |  |  |  |
| triggers.ticketCreatedStudent | Embedded |  |  |  |
| triggers.ticketCreatedAgent | Embedded |  |  |  |
| triggers.ticketAssigned | Embedded |  |  |  |
| triggers.ticketStatusChanged | Embedded |  |  |  |
| triggers.ticketClosed | Embedded |  |  |  |
| triggers.ticketCommentAdded | Embedded |  |  |  |
| triggers.ticketCreatedOnline | Embedded |  |  |  |
| triggers.ticketCreatedOffline | Embedded |  |  |  |
| triggers.ticketCreatedEmail | Embedded |  |  |  |
| triggers.ticketEscalated | Embedded |  |  |  |
| triggers.ticketReassigned | Embedded |  |  |  |
| triggers.ticketRejected | Embedded |  |  |  |
| triggers.ticketReopened | Embedded |  |  |  |
| triggers.ticketReplied | Embedded |  |  |  |
| triggers.ticketReminderAgent24hrs | Embedded |  |  |  |
| triggers.ticketReminderAgent48hrs | Embedded |  |  |  |
| triggers.ticketDueSoon | Embedded |  |  |  |
| triggers.ticketOverdue | Embedded |  |  |  |
| triggers.studentWelcome | Embedded |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## SMSLog  `smslogs`
Documents: ~4

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required |
| recipient | String |  |  | required |
| message | String |  |  | required |
| triggerType | String |  |  | required |
| status | String |  | sent, failed, blocked | required |
| responseId | String |  |  |  |
| error | String |  |  |  |
| metadata | Mixed |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## State  `states`
Documents: ~27

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| key | String |  |  | required, unique |
| value | String |  |  | required |
| country | String |  |  |  |
| countryId | ObjectId | Country |  |  |
| displayOrder | Number |  |  |  |
| isActive | Boolean |  | true |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Status  `status`
Documents: ~24

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| code | Number |  |  | required |
| color | String |  |  | required |
| projectId | ObjectId | Project |  | required, indexed |
| isDefault | Boolean |  |  |  |
| isClosed | Boolean |  | false, true |  |
| requireClosingRemark | Boolean |  |  |  |
| displayOrder | Number |  |  |  |
| description | String |  |  |  |
| isActive | Boolean |  | false, true |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## SystemSettings  `systemsettings`
Documents: ~1

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| key | String |  |  | required, unique |
| value | Mixed |  |  | required |
| description | String |  |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## Ticket  `tickets`
Documents: ~870

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| ticketNumber | String |  |  | required, unique, indexed |
| subject | String |  |  | required |
| description | String |  |  |  |
| status | Number |  | 1, 2, 4, 5 | required, indexed |
| priority | String |  | HIGH, LOW, MEDIUM, NORMAL, URGENT | required, indexed |
| slaRuleId | ObjectId | SLARule |  | indexed |
| category | ObjectId | Category |  | indexed |
| categoryHierarchy.level1 | ObjectId | Category |  | indexed |
| categoryHierarchy.level2 | ObjectId | Category |  | indexed |
| categoryHierarchy.level3 | ObjectId | Category |  | indexed |
| categoryHierarchy.level4 | ObjectId | Category |  | indexed |
| categoryHierarchy.level5 | ObjectId | Category |  | indexed |
| categoryHierarchy.displayPath | String |  |  |  |
| createdBy | ObjectId | User |  |  |
| assignedTo | ObjectId | User |  |  |
| project | ObjectId | Project |  | indexed |
| attachments | Array<Mixed> |  |  |  |
| threads | Array<Mixed> |  |  |  |
| comments | Array<Mixed> |  |  |  |
| internalNotes | Array<Mixed> |  |  |  |
| escalationHistory | Array<Mixed> |  |  |  |
| changeHistory | Array<Mixed> |  |  |  |
| tags | Array<String> |  |  |  |
| submissionSource | String |  | online, offline, email, whatsapp, chatbot, web, sms | indexed |
| mobile | String |  |  | indexed |
| isRegistered | Boolean |  |  |  |
| sourceEmail | String |  |  | indexed |
| sourceEmailMessageId | String |  |  | indexed |
| sourceEmailName | String |  |  |  |
| sourceEmailConfigId | ObjectId | ProjectEmailConfig |  |  |
| metadata | Mixed |  |  |  |
| resolvedAt | Date |  |  | indexed |
| closedAt | Date |  |  | indexed |
| sla_due_at | Date |  |  | indexed |
| firstRespondedAt | Date |  |  |  |
| escalationMatrixId | ObjectId | EscalationMatrix |  | indexed |
| currentEscalationLevelId | ObjectId |  |  |  |
| currentEscalationLevelNumber | Number |  |  | indexed |
| workingCalendarId | ObjectId | WorkingCalendar |  | indexed |
| ticketLevelSLA.dueAt | Date |  |  |  |
| ticketLevelSLA.breachedAt | Date |  |  |  |
| ticketLevelSLA.pausedAt | Date |  |  |  |
| ticketLevelSLA.pausedDuration | Number |  |  |  |
| roleLevelSLA.startedAt | Date |  |  |  |
| roleLevelSLA.dueAt | Date |  |  |  |
| roleLevelSLA.breachedAt | Date |  |  |  |
| roleLevelSLA.pausedAt | Date |  |  |  |
| roleLevelSLA.pausedDuration | Number |  |  |  |
| roleLevelSLA.warningsSent | Array<Number> |  |  |  |
| isMerged | Boolean |  |  | indexed |
| mergedInto | ObjectId | Ticket |  |  |
| mergedTickets | Array<ObjectId> | Ticket |  |  |
| mergedAt | Date |  |  |  |
| formSchemaSnapshot | Mixed |  |  |  |
| hasNewReply | Boolean |  |  | indexed |
| hasAgentReply | Boolean |  |  | indexed |
| assignedVia | String |  | manual, round-robin, by-role, by-user, condition-based, fallback,  | indexed |
| assignmentAttempts | Number |  |  |  |
| assignedViaCategoryId | ObjectId | Category |  |  |
| slaSource | String |  | category, priority, default,  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## TicketDraft  `ticketdrafts`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| ticketId | ObjectId | Ticket |  | required |
| userId | ObjectId | User |  | required |
| type | String |  | reply, email | required |
| content | String |  |  |  |
| savedAt | Date |  |  |  |
| _id | ObjectId |  |  |  |

## TicketEmailCommunication  `ticketemailcommunications`
Documents: ~669

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| ticketId | ObjectId | Ticket |  | required, indexed |
| direction | String |  | incoming, outgoing, inbound, outbound | required, indexed |
| from | String |  |  |  |
| fromEmail | String |  |  | required, indexed |
| to | Array<String> |  |  |  |
| toEmail | String |  |  | required, indexed |
| cc | Array<String> |  |  |  |
| ccEmails | Array<String> |  |  |  |
| bccEmails | Array<String> |  |  |  |
| subject | String |  |  | required |
| body | String |  |  |  |
| htmlBody | String |  |  |  |
| bodyHtml | String |  |  |  |
| messageId | String |  |  | required, unique, indexed |
| inReplyTo | String |  |  | indexed |
| references | Mixed |  |  |  |
| conversationId | String |  |  | indexed |
| rawEmailHeaders | String |  |  |  |
| attachments | Array<Mixed> |  |  |  |
| inboundSource | String |  |  | indexed |
| isProcessed | Boolean |  |  | indexed |
| processingError | String |  |  |  |
| sentAt | Date |  |  |  |
| receivedAt | Date |  |  |  |
| status | String |  | sent, received, failed, pending, delivered |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## User  `users`
Documents: ~2149

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| email | String |  |  | required, unique |
| password | String |  |  | required |
| firstName | String |  |  |  |
| lastName | String |  |  |  |
| fullName | String |  |  | indexed |
| phone | String |  |  |  |
| uniqueId | String |  |  | unique, indexed |
| mobile | String |  |  |  |
| parentMobile | String |  |  |  |
| role | ObjectId | Role |  | required |
| isActive | Boolean |  | true |  |
| lastLogin | Date |  |  |  |
| eulaAccepted | Boolean |  |  |  |
| eulaAcceptedAt | Date |  |  |  |
| requirePasswordSetup | Boolean |  |  |  |
| registrationSource | String |  | online, offline, hrms, manual, email |  |
| hrmsId | Number |  |  |  |
| employeeCode | String |  |  | unique |
| department | String |  |  |  |
| departmentRef | ObjectId | Department |  |  |
| projectDepartments | Array<Mixed> |  |  |  |
| designation | String |  |  |  |
| joiningDate | Date |  |  |  |
| reportingManager | ObjectId | User |  |  |
| projects | Array<ObjectId> | Project |  |  |
| centers | Array<ObjectId> | Center |  |  |
| centreId | ObjectId | Center |  | indexed |
| resetPasswordOTP | String |  |  |  |
| resetPasswordOTPExpires | Date |  |  |  |
| resetPasswordAttempts | Number |  |  |  |
| resetPasswordLockedUntil | Date |  |  |  |
| tokenVersion | Number |  |  |  |
| payrollNumber | Number |  |  |  |
| biometricSynced | Boolean |  |  |  |
| biometricEmployeeId | Number |  |  |  |
| biometricDeviceId | Number |  |  |  |
| biometricSyncedAt | Date |  |  |  |
| biometricSyncError | String |  |  |  |
| payrollType | String |  | , external |  |
| company | ObjectId | Company |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## UserDashboardConfig  `userdashboardconfigs`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required, indexed |
| projectId | ObjectId | Project |  | indexed |
| defaultViewMode | String |  | self, team, hierarchy, all |  |
| showAggregatedCounts | Boolean |  |  |  |
| showIndividualBreakdown | Boolean |  |  |  |
| includeIndirectReportees | Boolean |  |  |  |
| maxHierarchyDepth | Number |  |  |  |
| customFilters | Mixed |  |  |  |
| isActive | Boolean |  |  | indexed |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## UserDashboardPreference  `userdashboardpreferences`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required |
| dashboardTemplateId | ObjectId | DashboardTemplate |  | required |
| dateRangeDays | Number |  |  |  |
| widgetOverrides | Array<Mixed> |  |  |  |
| scopeOverride.mode | String |  | all, project, centre, user |  |
| scopeOverride.projectId | ObjectId | Project |  |  |
| scopeOverride.centreId | ObjectId | Center |  |  |
| scopeOverride.userId | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## UserNotificationPreference  `usernotificationpreferences`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| userId | ObjectId | User |  | required |
| triggerType | String |  | ticket_created, ticket_assigned_to_me, ticket_reply_added, ticket_status_changed, ticket_mentioned, ticket_closed, ticket_escalated, kb_article_published, kb_article_updated, kb_article_archived, sla_breach_warning, sla_breached | required |
| inAppEnabled | Boolean |  |  |  |
| emailEnabled | Boolean |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## UserReportingHierarchy  `userreportinghierarchies`
Documents: ~2

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| reporteeUserId | ObjectId | User |  | required, indexed |
| supervisorUserId | ObjectId | User |  | required, indexed |
| hierarchyLevel | Number |  |  |  |
| relationshipType | String |  |  |  |
| isActive | Boolean |  | true |  |
| effectiveFrom | Date |  |  |  |
| projectId | ObjectId | Project |  | indexed |
| metadata | Mixed |  |  |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## UserTarget  `usertargets`
Documents: ~0

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| tenantId | ObjectId | Project |  | required |
| projectId | ObjectId | Project |  |  |
| centreId | ObjectId | Center |  |  |
| roleId | ObjectId | Role |  |  |
| targetMonth | Date |  |  | required |
| targetCount | Number |  |  | required |
| setBy | ObjectId | User |  | required |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## WhatsAppConfig  `whatsappconfigs`
Documents: ~7

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | required, unique |
| enabled | Boolean |  |  |  |
| apiBaseUrl | String |  |  |  |
| accessToken | String |  |  |  |
| triggers.accountCreated | Embedded |  |  |  |
| triggers.passwordReset | Embedded |  |  |  |
| triggers.ticketCreatedStudent | Embedded |  |  |  |
| triggers.ticketCreatedAgent | Embedded |  |  |  |
| triggers.ticketCreatedOnline | Embedded |  |  |  |
| triggers.ticketCreatedOffline | Embedded |  |  |  |
| triggers.ticketCreatedEmail | Embedded |  |  |  |
| triggers.ticketAssigned | Embedded |  |  |  |
| triggers.ticketEscalated | Embedded |  |  |  |
| triggers.ticketReassigned | Embedded |  |  |  |
| triggers.ticketStatusChanged | Embedded |  |  |  |
| triggers.ticketClosed | Embedded |  |  |  |
| triggers.ticketRejected | Embedded |  |  |  |
| triggers.ticketReopened | Embedded |  |  |  |
| triggers.ticketCommentAdded | Embedded |  |  |  |
| triggers.ticketReplied | Embedded |  |  |  |
| triggers.ticketReminderAgent24hrs | Embedded |  |  |  |
| triggers.ticketReminderAgent48hrs | Embedded |  |  |  |
| triggers.ticketDueSoon | Embedded |  |  |  |
| triggers.ticketOverdue | Embedded |  |  |  |
| triggers.studentWelcome | Embedded |  |  |  |
| triggers.studentOTP | Embedded |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## WhatsAppLog  `whatsapplogs`
Documents: ~67

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| projectId | ObjectId | Project |  | indexed |
| projectName | String |  |  |  |
| recipient | String |  |  | required, indexed |
| templateName | String |  |  | required, indexed |
| templateLanguage | String |  |  |  |
| status | String |  | sent, delivered, read, failed, blocked, simulated | required, indexed |
| error | String |  |  |  |
| whatsappMessageId | String |  |  | indexed |
| triggerType | String |  |  |  |
| triggerName | String |  |  | indexed |
| metadata | Mixed |  |  |  |
| sentAt | Date |  |  | indexed |
| deliveredAt | Date |  |  |  |
| readAt | Date |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## WidgetDefinition  `widgetdefinitions`
Documents: ~97

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| widgetKey | String |  |  | required, unique |
| module | String |  | ticketing, users, onboarding, attendance, capacity, feedback, satisfaction, system | required, indexed |
| displayName | String |  |  | required |
| description | String |  |  |  |
| supportedVisualisations | Array<String> |  |  | required |
| defaultVisualisation | String |  | kpi_tile, line_chart, bar_chart, donut_chart, grouped_bar, area_chart, table, progress_bar, gauge | required |
| scopeLevels | Array<String> |  |  |  |
| cacheTtlSeconds | Number |  |  |  |
| dataQueryKey | String |  |  | required |
| defaultConfig | Mixed |  |  |  |
| isActive | Boolean |  | true | indexed |
| requiresPermission | Array<String> |  |  |  |
| version | Number |  |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |

## WorkingCalendar  `workingcalendars`
Documents: ~3

| Field | Type | Ref | Enum / Observed | Notes |
|---|---|---|---|---|
| name | String |  |  | required |
| description | String |  |  |  |
| projectId | ObjectId | Project |  | required, indexed |
| timezone | String |  |  | required |
| workingHours | Array<Mixed> |  |  |  |
| holidays | Array<Mixed> |  |  |  |
| isActive | Boolean |  | true |  |
| isDefault | Boolean |  |  |  |
| createdBy | ObjectId | User |  |  |
| updatedBy | ObjectId | User |  |  |
| _id | ObjectId |  |  |  |
| createdAt | Date |  |  |  |
| updatedAt | Date |  |  |  |
