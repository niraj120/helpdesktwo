# Code Changes Note — SAC Helpdesk (branch `ISR/PSR`)

> Working note of all changes on this branch, so we can pick up and continue.
> Two layers: **(A) committed & pushed** to `origin/ISR/PSR`, and **(B) local
> work-in-progress not yet committed** (93 files changed, +10,337 / −2,368, plus
> 39 new files). Kept at feature/area level, not line-by-line.

Branch: `ISR/PSR` · in sync with origin at commit `d3f68b73` · WIP on top is **uncommitted**.

---

## A. Committed & pushed — OneOS UI/UX rollout

App-wide OneOS design language (indigo `#4f46e5`, Instrument Sans body, DM Serif
titles, `#f8fafc` canvas, 16px cards, 8px controls, gradient buttons).

- **Foundation:** `frontend/src/theme/oneos.ts` (canonical tokens + `styles`/`button`/`chip`), `utils/srTheme.ts` now aliases it, fonts in `index.html`, shared `components/ui/PageHeader.tsx` + `MetricCard.tsx`, spec in `docs/ONEOS_DESIGN_SYSTEM.md`.
- **App shell** (`DashboardLayout.tsx`): sidebar white + indigo active nav, header, `#f8fafc` canvas, app font.
- **Modules migrated:** Dashboard (Overview + 6 sub-pages), Service Requests, Project Management (+AddProjectForm), Master Data, RBAC, User Management.
- Merged the other dev's MDM/HRMS/SR feature commits; kept their logic + our styling.

**Excluded from commits (intentionally):** `FeedbackResponses.tsx` (DB-managed), local `.claude/`.

---

## B. Uncommitted WIP (current working tree)

### B1. PSR Composition / Builder + Pipelines (NEW)
A data-composition system that pulls external source data → caches → builds searchable PSR master tables.
- Backend models `backend/src/models/psr/`: `PipelineConfig`, `PsrMaster`, `PsrTable`, `SyncRun`.
- Backend services `backend/src/services/psr/`: `pipelineEngine`, `pipelineQueue`, `pipelineWorker`, `psrTableScheduler`, `sourceTestService`, `stalenessWatchdog`, `httpClient`.
- Controllers `backend/src/controllers/psr/`: `psrBuilderController`, `psrPipelineController`; routes `backend/src/routes/psr/`.
- Search: `backend/src/modules/service-request/routes/service-request/psrSearchRoutes.ts` (+ `__tests__`).
- Guardrail: `scripts/psr-guardrail.js`; audit: `backend/src/middleware/psrAuditLog.ts` (logs PSR admin mutations to ActivityLog).
- Frontend: `frontend/src/pages/integrations/PSRBuilderPage.tsx`, `PSRPipelinesPage.tsx`; services `psrBuilderService.ts`, `psrPipelineService.ts`.
- Docs: `docs/PSR_API_Composition_Search_User_Stories.md`.

### B2. MDM caching & sync (NEW)
- Models: `MDMCacheRecord`, `MDMCacheJoin`, `MDMSyncJob`; extends `MDMSource`/`MDMFieldConfig`.
- Services: `mdmCacheService.ts` (build datasets + joins), `mdmCacheScheduler.ts` (cron rebuilds); util `mdmFieldMapping.ts` (normalize field mapping).
- Controllers/routes: `mdmController.ts`, `mdmRoutes.ts` updates; frontend `MDMConfigModal.tsx`, `services/mdmService.ts`.

### B3. Service Requests (SR / PSR / ISR)
- **Permissions expanded** (`backend/src/constants/permissions.ts`, frontend mirror): `SR_VIEW_ALL/OWN/ASSIGNED`, `SR_ISR_LINK`, `SR_DELETE`, `SR_MERGE`, `EMAIL_TRIAGE_ALL`, `IVR_TRIAGE_ACCESS/CONVERT`. Wired into `menuConfig.tsx` + `routePermissions.ts` (main + project-portal SR routes).
- **Lifecycle/service**: `serviceRequestService.ts`, `serviceRequestController.ts`, `createServiceRequest.ts`, `srMasterData.ts`, `srConfigAdmin.ts`, `srTicketNumber.ts`, `types.ts`, `serviceRequestConfig.ts`.
- **New SR UI**: `components/sr/LinkedIsrPanel.tsx`, `PslCallTab.tsx`; `pages/service-request/SRSettingsNew.tsx`; updates across the SR hub/pages, `services/serviceRequests.ts`.

### B4. IVR — Smartflo/TATA public webhook (NEW)
- `modules/service-request/controllers/publicIvrController.ts` + `routes/publicIvr.ts` (public inbound webhook, header sanitization).
- Model `IvrIngestLog.ts`; `callTriage.ts`, `ivrController.ts`, `routes/ivr.ts` updates.
- Readiness doc: `docs/Smartflo_TATA_IVR_Webhook_Readiness.md`.

### B5. Email intake & processing
- `EmailProcessingQueue` model + `services/emailProcessingWorker.ts`; `ProjectEmailConfig` model + `projectEmailConfigController.ts`.
- `emailTriage.ts`, `emailIntakeController.ts`, `routes/emailIntake.ts`, `emailActivityController.ts`; frontend `AddEmailConfigModal.tsx`, `EmailToTicketConfiguration.tsx`, `hooks/useEmailActivityPolling.tsx`, `services/emailActivityPolling.ts`.

### B6. Lead CRM sync (NEW)
- `modules/service-request/services/leadCrmSync.ts` (push leads to external CRM); `Lead.ts`, `leadController.ts`, `routes/leads.ts` updates.

### B7. CSP frontend hardening (NEW)
- `frontend/src/utils/csp-jsx-runtime/` (jsx-runtime, jsx-dev-runtime, styleRuntime), `styles/csp-hardening.css`, `components/CspSafeToaster.tsx`, `NetworkStatusNotifier.tsx`.
- Config: `vite.config.ts`, `tsconfig.json`, `index.html`, `main.tsx`.
- Doc: `docs/CSP_Frontend_Hardening_Worklog.md`.

### B8. Hierarchy config
- `models/HierarchyConfig.ts`, `hierarchyConfigController.ts`, `routes/hierarchyConfig.ts`; frontend `HierarchyConfigManager.tsx`, `HierarchyCategorySelector.tsx`, `FormFieldBuilder.tsx`, `FormRenderer.tsx`, `utils/conditionEngine.ts`.

### B9. Tests (NEW)
`backend/tests/`: `emailMailboxRouting`, `hierarchyConfig.scope`, `srEmailPsrPrefill`, `srEmailTriageRouting`, `srIntakeHandoff`, `srLiveRefresh`, `srWorkflow` (`.source.test.js`).

### B10. Docs added
`docs/`: `Overall_Helpdesk_Portal_Feature_Note.md`, `SAC_Portal_Project_Notes.md`, `PSR_API_Composition_Search_User_Stories.md`, `CSP_Frontend_Hardening_Worklog.md`, `Smartflo_TATA_IVR_Webhook_Readiness.md`, `superpowers/`.

### Other touched
`roleController.ts`, `userController.ts`, `categoryController.ts`, `Category.ts`, `Ticket.ts`, `CallIntake.ts`, `EmailIntake.ts`, `seedRolesPermissions.ts`, `server.ts` (new routes/schedulers/workers wired), `ViewTickets.tsx`, `MyTickets.tsx`, `AgentTicketDetail.tsx`, `RBACSetup.tsx`, `ProjectPortalDashboard.tsx`, `FindCenterPage.tsx`, `SLA/EscalationMatrixContent.tsx`, `accessible/SkipLink.tsx`, `SrPage.tsx`, `SrTabs.tsx`, `utils/loginRedirect.ts`.

Stray artifact: `backend/debug-sync-output.txt` (should be removed before commit).

---

## C. Status & next actions
- **WIP is uncommitted and unverified in this session.** Before committing: run backend `tsc --noEmit`, frontend `tsc` + `npm run build`; run the new `backend/tests`.
- Remove `backend/debug-sync-output.txt`; confirm `.claude/` stays untracked.
- Group WIP into logical commits by theme (B1–B10) rather than one blob.
- OneOS UI rollout still pending for: **Queries** (View/My/Assign + ticket detail), SLA, Knowledge Base, Offline, Reports, Audit, Integrations pages.

_Generated as a working reference; not a client deliverable._
