# MDM Master + HRMS Mapping — Feature Plan

Status: **Implemented** (both apps build clean). Decisions locked below.

## Implemented files
- Backend: `models/MDMSource.ts` (global, encrypted auth), `services/mdmService.ts` (fetch/normalize/test), `controllers/mdmController.ts`, `routes/mdmRoutes.ts` (`/api/mdm`), rewired `services/hrmsService.ts` (MDM + mock fallback), `models/User.ts` (`mdmSourceId`), `controllers/userController.ts` (provenance + `mdmSourceId` passthrough), `utils/seedRolesPermissions.ts` (`MDM_VIEW`/`MDM_MANAGE`), `server.ts` (model+route mount).
- Frontend: `services/mdmService.ts`, `components/MDMConfigModal.tsx`, `MasterDataManagement.tsx` (🗄️ MDM Master button + modal), `constants/permissions.ts`, `UserManagement.tsx` (HRMS modal MDM-source dropdown + `mdmSourceId` on fetch/import).
- Not done (optional follow-up): per-row / user-list source badge beyond the import dropdown.

## Locked decisions
1. **MDM scope = Global (company-wide).** One set of MDM sources, shared across all projects. Not per-tenant. ("Master database of the company.")
2. **HRMS = an MDM dataType.** No separate HRMS integration. The HRMS employee/principal list is fetched from a configured MDM source's `employees`/`principals` endpoint.
3. **HRMS mapping creates/upserts full User accounts** (`registrationSource: 'hrms'`), mapped to a project. Login-capable, assignable.

## Grounding (existing code to mirror / reuse)
- **Master Data UI:** `frontend/src/components/MasterDataManagement.tsx` — `MASTER_CATEGORIES` array (~line 51), tiles rendered (~line 1954). Permissions `MASTER_DATA_VIEW/EDIT/DELETE`.
- **HRMS already half-built:** `frontend/src/components/UserManagement.tsx` — `showHRMSModal`, `handleFetchFromHRMS()` → `GET /users/hrms/search`, `handleConfirmHRMS()` bulk-creates users with project assignment.
- **HRMS backend is a STUB:** `backend/src/services/hrmsService.ts` — `syncEmployeeData(code)`, `searchEmployees(query)`, `validateEmployeeCode(code)` return MOCK data (EMP001–EMP010). Wire these to real MDM source; keep signatures so controller is untouched.
- **Config-storage precedent:** `backend/src/models/ProjectEmailConfig.ts` / `WhatsAppConfig.ts` — encrypted secrets via aes-256-cbc pre-save hook + `getDecrypted*()` methods, `connectionStatus`/`lastConnectionTest`/`failedAttempts`, test endpoint `projectEmailConfigController.testEmailCredentials` (`POST /test-credentials`).
- **Modal house style:** `frontend/src/components/AddEmailConfigModal.tsx` — custom `useState` (not react-hook-form), `isOpen/onClose/onSuccess` props, `if (!isOpen) return null`, inline `testResult` with `testing` flag, `Test Connection` button.
- **User↔Project write path:** `backend/src/controllers/userController.ts` (`user.projects = projects`), `User.projects[]`, `User.projectDepartments[]`. `User.registrationSource` enum already includes `'hrms'`. HRMS fields on User: `hrmsId`, `employeeCode` (sparse unique), `departmentRef`, `designation`, `joiningDate`, `reportingManager`.
- **Model/route registration:** `backend/src/server.ts` — import model near top (registration order), import route, `app.use('/api/...', route)`. Nested/specific routes before parameterized.
- **Encryption util:** aes-256-cbc, key from `EMAIL_ENCRYPTION_KEY`, format `iv:cipher`, `:` delimiter detects encrypted.

## Feature 1 — MDM Master

### Backend
- **Model** `backend/src/models/MDMSource.ts` (GLOBAL — no `projectId`):
  - `name`, `description`, `enabled`
  - `apis[]`: `{ label, baseUrl, method, path, dataType: 'schools'|'employees'|'principals'|'students'|'custom', isDefaultForType }`
  - `auth`: `{ type: 'apiKey'|'bearer'|'basic', apiKey?, token?, username?, password?, headerName?, extraHeaders? }` — secrets encrypted (mirror WhatsAppConfig).
  - `connectionStatus: 'connected'|'error'|'untested'`, `lastConnectionTest`, `lastConnectionError`, `failedAttempts`
- **Routes** `backend/src/routes/mdmRoutes.ts`, mount `app.use('/api/mdm', mdmRoutes)`:
  - `GET /api/mdm`, `POST /api/mdm`, `PUT /api/mdm/:id`, `DELETE /api/mdm/:id`
  - `POST /api/mdm/:id/test` (test saved API) and `POST /api/mdm/test-credentials` (test unsaved, like email)
  - Test = fire configured request, return `{ success, status, sampleData, error }`.
- **Permissions:** add `MDM_VIEW`, `MDM_EDIT` (seed in `utils/seedRolesPermissions.ts`), or reuse `MASTER_DATA_*`. Decide at impl.
- Register model import + route in `server.ts`.

### Frontend
- Add tile to `MASTER_CATEGORIES`: `{ key: 'mdm', label: 'MDM Master', icon: '🗄️' }`. Clicking opens modal (not a data table).
- **`MDMConfigModal.tsx`** (mirror `AddEmailConfigModal`):
  - List sources → add/edit
  - Multiple API rows (label, URL, method, dataType, auth)
  - **Test** per row → inline ✅/❌ + sample response preview
  - Per-source enable toggle, last-tested badge, "default source for dataType" picker, optional JSON field-mapping (MDM field → internal field), Save.

## Feature 2 — HRMS in User Management

### Backend
- Rewrite `hrmsService.ts` internals: `syncEmployeeData(code)` / `searchEmployees(query)` call the chosen `MDMSource` API (`employees`/`principals` dataType) instead of mock. Same signatures.
- Add `mdmSourceId` param to fetch (which source to pull from).
- `handleConfirmHRMS` write path → upsert User: `registrationSource:'hrms'`, set `projects`, `employeeCode`, `hrmsId`, `departmentRef`, **`mdmSourceId` (new User field, provenance)**.

### Frontend (`UserManagement.tsx` — wire existing modal)
- Flow: enter **code/ID** → fetch list (employees, principals…) → **single/multi select** (checkbox list) → **map to project** (reuse project dropdown + `projectDepartments`) → Save.
- Show **source badge** ("from: <MDM source name>") on fetched rows + on mapped users.

## Provenance ("team knows which MDM")
- New `User.mdmSourceId` + `registrationSource:'hrms'`.
- Display source name on user list/detail.
- Any MDM-fetched master data (schools etc.) tagged with `mdmSourceId`.

## Build order
1. `MDMSource` model + routes + test endpoint (backend, curl-testable in isolation)
2. `MDMConfigModal` + Master Data tile (frontend)
3. Wire `hrmsService` → MDMSource (employees/principals dataType)
4. HRMS modal: code → fetch → multi-select → project map → create Users + provenance
5. Seed permissions, register model/route in `server.ts`, provenance display
