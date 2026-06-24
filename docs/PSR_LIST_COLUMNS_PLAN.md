# PSR List — Extra Columns + Linked-ISR Widget — Feature Plan

Status: **Planned** (not yet implemented). Decisions locked below.

## Locked decisions
1. **Linked ISR scope = FULL**: add `linkedPsrId` linkage field + list aggregate + a "Create / Link ISR" action on PSR detail so the widget shows real data end-to-end.
2. **New columns**: Linked ISR (widget), Priority, Source, Age/SLA, Last Updated, Classification. **Keep** Mode column.
3. Linkage direction = **FK on the ISR (child)**: `linkedPsrId` on ISR ticket. One PSR → many ISRs.

## Grounding (existing code)
- List page: `frontend/src/pages/ServiceRequests.tsx` — table headers L244-254, rows L270-301, `SrRow` interface L12-24, fetch params L75-85 (`interactionType:"PSR"`).
- Status meta: `frontend/src/services/serviceRequests.ts:156-167` (`SR_STATUS_META`). Done = status 4 (Resolved) / 5 (Closed).
- API client: `serviceRequestApi.list` `serviceRequests.ts:29`.
- Backend list: `backend/src/modules/service-request/serviceRequestService.ts:408` `listServiceRequests` → `.find(q).populate(assignedTo,createdBy).lean()` L437-443. `.lean()` already returns `priority` + `submissionSource` (just untyped in `SrRow`).
- Controller: `serviceRequestController.ts:164` `list`. Route `routes/serviceRequest.ts:30`.
- Ticket model `backend/src/models/Ticket.ts`: `priority` L342-350 (String, no enum), `submissionSource` L422-436 (online|offline|email|whatsapp|chatbot|web|sms|ivr), `modeOfContact` L600-612, `interactionType` L589-594, `metadata.classification`, `updatedAt` (timestamps).
- PSR detail page: `frontend/src/pages/ServiceRequestDetail.tsx`.
- Create: `backend/src/modules/service-request/createServiceRequest.ts` (`CreateServiceRequestInput`).
- **NO existing PSR↔ISR linkage** anywhere — greenfield. Demo `PSR-DEMO-779650-1-PSR1` = hand-seeded DB row, not code.

## Feature A — trivial columns (data already returned)
Pure frontend in `ServiceRequests.tsx`:
- Add to `SrRow`: `priority?: string; submissionSource?: string; metadata.classification?: string; updatedAt?: string`.
- **Priority** cell: colored pill, map by name (CRITICAL=red, HIGH=orange, MEDIUM=amber, LOW/NORMAL=gray). Unknown → gray.
- **Source** cell: pill + icon from `submissionSource` (📧 email, 📞 ivr, 🌐 web/online, 🏢 offline/walk_in, 💬 whatsapp, 📱 sms, 🤖 chatbot). Fallback `modeOfContact` then `—`.
- **Age / SLA** cell: `now - createdAt` humanized ("2h", "3d"). Red text + ⚠ if SR open (status 1/2/3/6/7) past SLA. Phase 1: age only; SLA overdue needs category SLA join (note below).
- **Last Updated** cell: `updatedAt` relative ("5m ago").
- **Classification** cell: `metadata.classification` → human label via classify-channel config label lookup; else raw key; else `—`.
- Verify backend lean projection doesn't strip these (it doesn't today). If a projection is later added, include them.

## Feature B — Linked ISR linkage (backend)
- **Schema**: add to `Ticket.ts` `linkedPsrId?: mongoose.Types.ObjectId` (`ref: "Ticket"`, indexed, sparse). Only set on ISR tickets.
- **Create**: `CreateServiceRequestInput += linkedPsrId?`. In `createServiceRequest`, when `interactionType==="ISR"` and `linkedPsrId` present → validate it's a PSR in same project, persist. (Permission re-check uses existing `SR_ISR_CREATE`.)
- **List aggregate**: in `listServiceRequests`, after fetching the PSR page, collect `pageIds`, run ONE aggregate over Tickets:
  ```
  match { linkedPsrId in pageIds }
  group { _id:"$linkedPsrId", total:{$sum:1}, done:{$sum:{$cond:[{$in:["$status",[4,5]]},1,0]}} }
  ```
  Map result onto each PSR row as `linkedIsr: { total, done }`. Rows with no children → `{total:0,done:0}`.
- **Popover data**: include `linkedIsrs: [{ _id, ticketNumber, status }]` inline per row (cheap, same aggregate or a `$push`). Avoids N+1 on hover.
- Response per row gains `linkedIsr` + `linkedIsrs`.

## Feature C — Linked ISR widget (frontend, polished past screenshot)
New cell component `LinkedIsrCell` in `ServiceRequests.tsx` (or `components/sr/LinkedIsrCell.tsx`):
- Header text "LINKED ISRS" style → small uppercase label above `done/total`.
- Big `done/total` number, thin rounded progress bar (`done/total` width).
- Sub-line: `● N pending` (N = total - done). Dot + count.
- **Color states**: total 0 → gray "No ISRs"; pending>0 → amber bar + red dot; all done → green bar + ✓.
- **Hover popover**: list `linkedIsrs` — each row `ticketNumber` + `StatusChip`, clickable → `/service-requests/:id`. "+ Link ISR" footer link if user has `SR_ISR_CREATE`.
- Click cell → same popover (mobile/no-hover).

## Feature D — Create / Link ISR from PSR (makes data real)
On `ServiceRequestDetail.tsx` (PSR view), add a **"Linked ISRs"** panel:
- Lists current linked ISRs (number, status, assignee).
- **"Create linked ISR"** button → opens SR create wizard pre-set `interactionType:"ISR"` + `linkedPsrId = thisPsr._id` (+ carry parent/children/category context). Gated `SR_ISR_CREATE`.
- Optional **"Link existing ISR"**: search ISR by number → set its `linkedPsrId` (new endpoint `POST /service-requests/:id/link-psr {psrId}`, gated `SR_ISR_CREATE` or `SR_REASSIGN`).
- API client additions: `serviceRequestApi.linkPsr(id,{psrId})`, and `create` already accepts body so pass `linkedPsrId`.

## Backend endpoints
- (reuse) `GET /service-requests` — now returns `linkedIsr` + `linkedIsrs` on PSR rows.
- (new, optional) `POST /service-requests/:id/link-psr` — link an existing ISR to a PSR.
- `GET /service-requests/:id` detail — include `linkedIsrs` for the PSR panel.

## Permissions
No new codes needed. Reuse `SR_ISR_CREATE` (create/link), `SR_REASSIGN` (relink). View gated by existing list VIEW perms.

## Build order
1. Ticket `linkedPsrId` field + index.
2. `createServiceRequest` accept/validate `linkedPsrId`.
3. `listServiceRequests` aggregate → `linkedIsr` + `linkedIsrs` on rows; type `SrRow`.
4. Frontend trivial columns (Priority, Source, Age, Last Updated, Classification).
5. `LinkedIsrCell` widget + popover.
6. PSR detail "Linked ISRs" panel + Create/Link ISR (+ `link-psr` endpoint).
7. UI polish pass (sticky header, pills, truncation+tooltip, density).
8. Build both apps, commit to ISR/PSR.

## Open notes
- **SLA overdue** colour needs category SLA join in the list aggregate (category → `sla`). Phase 1 = age only; flag overdue once category SLA is joined. Decide if worth the extra lookup.
- "done" = status ∈ {4 Resolved, 5 Closed}. Confirm Closed counts as done (yes per `SR_STATUS_META`).
- Mode column kept (per decision) — sits next to Source; consider merging visually later.
- Column count getting wide (13) — consider a column-visibility toggle / responsive hide on small screens.
