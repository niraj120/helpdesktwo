# External MDM Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move MDM setup from Master Data to Integrations as External MDM and add a configurable MongoDB cache/join layer for faster, reliable PSR parent/student lookup.

**Architecture:** Existing live MDM API configuration remains the source definition. New cache configuration defines datasets, selected stored/indexed columns, sync behavior, and joins. Raw API records are stored in Mongo with selected normalized fields, and optional joined collections are built for parent-student lookup.

**Tech Stack:** Node.js, Express, TypeScript, Mongoose, MongoDB, React, Vite, existing permission/RBAC system, existing `node-cron` dependency.

---

## File Structure

- Modify: `backend/src/models/MDMSource.ts`
  - Add `cache` configuration to each MDM source.
  - Cache config contains datasets, joins, and sync settings.
- Create: `backend/src/models/MDMCacheRecord.ts`
  - Stores raw records and selected fields per source/dataset/external id.
- Create: `backend/src/models/MDMCacheJoin.ts`
  - Stores joined parent/student directory rows generated from datasets.
- Create: `backend/src/models/MDMSyncJob.ts`
  - Stores sync run status, counts, errors, and timestamps.
- Create: `backend/src/services/mdmCacheService.ts`
  - Syncs configured datasets, extracts selected fields, rebuilds joins, and searches cached joins.
- Modify: `backend/src/services/mdmService.ts`
  - Export reusable helpers needed by cache service: API selection, raw fetch, flattening, normalization.
- Modify: `backend/src/controllers/mdmController.ts`
  - Add endpoints for cache config save, sync now, rebuild joins, sync logs, and cached lookup test.
- Modify: `backend/src/routes/mdmRoutes.ts`
  - Add External MDM cache routes under existing `/api/mdm`.
- Modify: `backend/src/modules/service-request/types.ts`
  - Add lookup source option `cache` and `hybrid_cache`.
- Modify: `backend/src/modules/service-request/serviceRequestConfig.ts`
  - Add default lookup config for cached mode.
- Modify: `backend/src/modules/service-request/controllers/serviceRequestController.ts`
  - Parent lookup uses Mongo cache when configured, with live API fallback only when selected.
- Modify: `frontend/src/services/mdmService.ts`
  - Add cache config types and API functions.
- Create: `frontend/src/pages/integrations/ExternalMDMPage.tsx`
  - Full-page External MDM management experience.
- Modify: `frontend/src/components/IntegrationsManagement.tsx`
  - Add External MDM card.
- Modify: `frontend/src/config/menuConfig.tsx`
  - Add Integrations > External MDM menu entry.
- Modify: `frontend/src/App.tsx`
  - Add route `/integrations/external-mdm`.
- Modify: `frontend/src/components/MasterDataManagement.tsx`
  - Remove or hide MDM Master entry from Master Data page.
- Modify: `frontend/src/pages/service-request/ServiceRequestSettings.tsx`
  - Add lookup mode choices: Live API, Mongo Cache, Mongo First + API Fallback.

---

## Data Model

### MDMSource.cache

```ts
cache: {
  enabled: boolean;
  datasets: Array<{
    key: string;
    label: string;
    apiIndex: number;
    enabled: boolean;
    uniqueKeyField: string;
    displayField?: string;
    searchFields: string[];
    storedFields: string[];
    incremental: {
      mode: "full" | "count" | "latest_id" | "updated_at";
      countPath?: string;
      latestIdField?: string;
      updatedAtField?: string;
    };
    schedule: {
      enabled: boolean;
      cron: string;
    };
  }>;
  joins: Array<{
    key: string;
    label: string;
    enabled: boolean;
    outputType: "parent_with_children";
    parentDatasetKey: string;
    mappingDatasetKey: string;
    studentDatasetKey: string;
    parentKeyField: string;
    mappingParentKeyField: string;
    mappingStudentKeyField: string;
    studentKeyField: string;
    parentStoredFields: string[];
    childStoredFields: string[];
  }>;
}
```

### MDMCacheRecord

```ts
{
  sourceId: ObjectId;
  projectIds: ObjectId[];
  datasetKey: string;
  externalId: string;
  raw: Mixed;
  selected: Map<string, string>;
  searchableText: string;
  sourceUpdatedAt?: Date;
  lastSyncedAt: Date;
  syncJobId?: ObjectId;
}
```

Indexes:

```ts
{ sourceId: 1, datasetKey: 1, externalId: 1 } unique
{ sourceId: 1, datasetKey: 1, searchableText: "text" }
{ projectIds: 1, sourceId: 1, datasetKey: 1 }
```

### MDMCacheJoin

```ts
{
  sourceId: ObjectId;
  projectIds: ObjectId[];
  joinKey: string;
  parentExternalId: string;
  parent: Mixed;
  children: Mixed[];
  searchableText: string;
  lastBuiltAt: Date;
}
```

Indexes:

```ts
{ sourceId: 1, joinKey: 1, parentExternalId: 1 } unique
{ sourceId: 1, joinKey: 1, searchableText: "text" }
```

### MDMSyncJob

```ts
{
  sourceId: ObjectId;
  datasetKey?: string;
  joinKey?: string;
  type: "dataset_sync" | "join_rebuild";
  status: "queued" | "running" | "success" | "failed";
  startedAt: Date;
  finishedAt?: Date;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
  sampleErrors: string[];
}
```

---

## Task 1: Backend Cache Models

**Files:**
- Create: `backend/src/models/MDMCacheRecord.ts`
- Create: `backend/src/models/MDMCacheJoin.ts`
- Create: `backend/src/models/MDMSyncJob.ts`
- Modify: `backend/src/models/MDMSource.ts`

- [ ] **Step 1: Create `MDMCacheRecord` model**

Create `backend/src/models/MDMCacheRecord.ts`:

```ts
import mongoose, { Document, Schema } from "mongoose";

export interface IMDMCacheRecord extends Document {
  sourceId: mongoose.Types.ObjectId;
  projectIds: mongoose.Types.ObjectId[];
  datasetKey: string;
  externalId: string;
  raw: any;
  selected: Map<string, string>;
  searchableText: string;
  sourceUpdatedAt?: Date;
  lastSyncedAt: Date;
  syncJobId?: mongoose.Types.ObjectId;
}

const mdmCacheRecordSchema = new Schema<IMDMCacheRecord>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "MDMSource", required: true, index: true },
    projectIds: [{ type: Schema.Types.ObjectId, ref: "Project", index: true }],
    datasetKey: { type: String, required: true, trim: true, index: true },
    externalId: { type: String, required: true, trim: true },
    raw: { type: Schema.Types.Mixed, default: {} },
    selected: { type: Map, of: String, default: {} },
    searchableText: { type: String, default: "", index: true },
    sourceUpdatedAt: { type: Date },
    lastSyncedAt: { type: Date, default: Date.now },
    syncJobId: { type: Schema.Types.ObjectId, ref: "MDMSyncJob" },
  },
  { timestamps: true },
);

mdmCacheRecordSchema.index(
  { sourceId: 1, datasetKey: 1, externalId: 1 },
  { unique: true },
);
mdmCacheRecordSchema.index({ sourceId: 1, datasetKey: 1, searchableText: "text" });

export default mongoose.model<IMDMCacheRecord>("MDMCacheRecord", mdmCacheRecordSchema);
```

- [ ] **Step 2: Create `MDMCacheJoin` model**

Create `backend/src/models/MDMCacheJoin.ts`:

```ts
import mongoose, { Document, Schema } from "mongoose";

export interface IMDMCacheJoin extends Document {
  sourceId: mongoose.Types.ObjectId;
  projectIds: mongoose.Types.ObjectId[];
  joinKey: string;
  parentExternalId: string;
  parent: any;
  children: any[];
  searchableText: string;
  lastBuiltAt: Date;
}

const mdmCacheJoinSchema = new Schema<IMDMCacheJoin>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "MDMSource", required: true, index: true },
    projectIds: [{ type: Schema.Types.ObjectId, ref: "Project", index: true }],
    joinKey: { type: String, required: true, trim: true, index: true },
    parentExternalId: { type: String, required: true, trim: true },
    parent: { type: Schema.Types.Mixed, default: {} },
    children: { type: [Schema.Types.Mixed], default: [] },
    searchableText: { type: String, default: "", index: true },
    lastBuiltAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

mdmCacheJoinSchema.index(
  { sourceId: 1, joinKey: 1, parentExternalId: 1 },
  { unique: true },
);
mdmCacheJoinSchema.index({ sourceId: 1, joinKey: 1, searchableText: "text" });

export default mongoose.model<IMDMCacheJoin>("MDMCacheJoin", mdmCacheJoinSchema);
```

- [ ] **Step 3: Create `MDMSyncJob` model**

Create `backend/src/models/MDMSyncJob.ts`:

```ts
import mongoose, { Document, Schema } from "mongoose";

export type MDMSyncJobType = "dataset_sync" | "join_rebuild";
export type MDMSyncJobStatus = "queued" | "running" | "success" | "failed";

export interface IMDMSyncJob extends Document {
  sourceId: mongoose.Types.ObjectId;
  datasetKey?: string;
  joinKey?: string;
  type: MDMSyncJobType;
  status: MDMSyncJobStatus;
  startedAt: Date;
  finishedAt?: Date;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
  sampleErrors: string[];
}

const mdmSyncJobSchema = new Schema<IMDMSyncJob>(
  {
    sourceId: { type: Schema.Types.ObjectId, ref: "MDMSource", required: true, index: true },
    datasetKey: { type: String, default: "", index: true },
    joinKey: { type: String, default: "", index: true },
    type: { type: String, enum: ["dataset_sync", "join_rebuild"], required: true },
    status: { type: String, enum: ["queued", "running", "success", "failed"], default: "queued", index: true },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    error: { type: String, default: "" },
    sampleErrors: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model<IMDMSyncJob>("MDMSyncJob", mdmSyncJobSchema);
```

- [ ] **Step 4: Add cache config schema to `MDMSource`**

Modify `backend/src/models/MDMSource.ts` by adding interfaces and schema fields for `cache`. Use `Schema.Types.Mixed` only for flexible future config where needed; keep dataset and join keys typed and indexed by consumers.

- [ ] **Step 5: Build backend**

Run: `npm run build` from `backend`

Expected: TypeScript build passes.

---

## Task 2: Cache Sync Service

**Files:**
- Modify: `backend/src/services/mdmService.ts`
- Create: `backend/src/services/mdmCacheService.ts`

- [ ] **Step 1: Export reusable MDM helpers**

Modify `backend/src/services/mdmService.ts` to export:

```ts
export { extractArray, flattenRecord, configuredScalar };
export const fetchMdmRawArray = fetchRawArray;
export const pickExplicitApiForSource = pickExplicitSourceApi;
```

- [ ] **Step 2: Create cache sync service**

Create `backend/src/services/mdmCacheService.ts` with functions:

```ts
export const syncDataset = async (sourceId: string, datasetKey: string) => { ... };
export const rebuildJoin = async (sourceId: string, joinKey: string) => { ... };
export const searchCachedParentDirectory = async (params: {
  sourceId: string;
  projectId?: string;
  joinKey?: string;
  query: string;
  limit?: number;
}) => { ... };
```

Rules:

- `syncDataset` loads source, finds dataset config, calls configured API row, flattens each record, extracts `uniqueKeyField`, stores `raw`, selected `storedFields`, and `searchFields`.
- `storedFields` controls what normalized fields appear in `selected`, but `raw` is still stored so future columns can be added and joins can be rebuilt without immediate API refetch.
- `searchableText` is built from `searchFields` and selected scalar raw values.
- Upsert by `{ sourceId, datasetKey, externalId }`.
- `rebuildJoin` reads parent/mapping/student cached records and writes `MDMCacheJoin`.
- `searchCachedParentDirectory` searches `MDMCacheJoin` and returns the same parent shape used by `parent-lookup`.

- [ ] **Step 3: Add defensive validation**

`syncDataset` returns failed job when:

- source does not exist
- cache is disabled
- dataset key is missing
- API row index is invalid
- unique key field is blank

- [ ] **Step 4: Build backend**

Run: `npm run build` from `backend`

Expected: TypeScript build passes.

---

## Task 3: Backend Cache API Endpoints

**Files:**
- Modify: `backend/src/controllers/mdmController.ts`
- Modify: `backend/src/routes/mdmRoutes.ts`

- [ ] **Step 1: Add controller handlers**

Add:

```ts
export const updateMDMCacheConfig = async (req, res) => { ... };
export const syncMDMDatasetNow = async (req, res) => { ... };
export const rebuildMDMJoinNow = async (req, res) => { ... };
export const listMDMSyncJobs = async (req, res) => { ... };
export const testMDMCacheLookup = async (req, res) => { ... };
```

- [ ] **Step 2: Add routes**

Add before `/:id` routes in `backend/src/routes/mdmRoutes.ts`:

```ts
router.put("/:id/cache-config", checkPermission("MDM_MANAGE"), updateMDMCacheConfig);
router.post("/:id/cache/datasets/:datasetKey/sync", checkPermission("MDM_MANAGE"), syncMDMDatasetNow);
router.post("/:id/cache/joins/:joinKey/rebuild", checkPermission("MDM_MANAGE"), rebuildMDMJoinNow);
router.get("/:id/cache/jobs", checkPermission("MDM_VIEW"), listMDMSyncJobs);
router.get("/:id/cache/test-lookup", checkPermission("MDM_VIEW"), testMDMCacheLookup);
```

- [ ] **Step 3: Build backend**

Run: `npm run build` from `backend`

Expected: TypeScript build passes.

---

## Task 4: External MDM Integration Page

**Files:**
- Create: `frontend/src/pages/integrations/ExternalMDMPage.tsx`
- Modify: `frontend/src/services/mdmService.ts`
- Modify: `frontend/src/components/IntegrationsManagement.tsx`
- Modify: `frontend/src/config/menuConfig.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/MasterDataManagement.tsx`

- [ ] **Step 1: Add frontend service methods**

Modify `frontend/src/services/mdmService.ts`:

```ts
export interface MDMCacheDatasetConfig { ... }
export interface MDMCacheJoinConfig { ... }
export interface MDMCacheConfig { ... }
export interface MDMSyncJob { ... }

export const updateMDMCacheConfig = (id: string, cache: MDMCacheConfig) => ...
export const syncMDMDatasetNow = (id: string, datasetKey: string) => ...
export const rebuildMDMJoinNow = (id: string, joinKey: string) => ...
export const listMDMSyncJobs = (id: string) => ...
export const testMDMCacheLookup = (id: string, query: string, joinKey?: string) => ...
```

- [ ] **Step 2: Create External MDM page**

Create `frontend/src/pages/integrations/ExternalMDMPage.tsx`.

UI sections:

- Source list and create/edit source panel.
- API setup section reused from `MDMConfigModal` patterns.
- Cache datasets section:
  - Add dataset.
  - Select API row.
  - Load keys from API sample.
  - Select unique key field.
  - Select search fields.
  - Select stored fields.
  - Add future stored field manually if key is not in sample.
  - Select sync mode and schedule.
- Join builder section:
  - Select parent dataset.
  - Select mapping dataset.
  - Select student dataset.
  - Select key fields from loaded dataset columns.
  - Select parent/child output fields.
  - Rebuild join button.
- Sync status section:
  - Sync now per dataset.
  - Rebuild join.
  - Last jobs table with status and errors.
  - Test cached lookup.

- [ ] **Step 3: Add Integrations card**

Modify `frontend/src/components/IntegrationsManagement.tsx`:

Add card:

```ts
{
  id: "external-mdm",
  title: "External MDM",
  description: "Configure external master data APIs, cache selected data into MongoDB, and build joined lookup directories.",
  path: "/integrations/external-mdm",
  permission: PERMISSIONS.MDM_VIEW,
  status: "available",
  badge: "Configurable"
}
```

- [ ] **Step 4: Add menu entry**

Modify `frontend/src/config/menuConfig.tsx` under Integrations:

```ts
{
  path: "/integrations/external-mdm",
  icon: <MdStorage />,
  label: "External MDM",
  permission: PERMISSIONS.MDM_VIEW,
}
```

- [ ] **Step 5: Add route**

Modify `frontend/src/App.tsx`:

```ts
const ExternalMDMPage = lazy(() => import("./pages/integrations/ExternalMDMPage"));
...
<Route path="/integrations/external-mdm" element={<ProtectedRoute permission={PERMISSIONS.MDM_VIEW}><ExternalMDMPage /></ProtectedRoute>} />
```

- [ ] **Step 6: Remove Master Data MDM entry**

Modify `frontend/src/components/MasterDataManagement.tsx` to hide/remove the MDM Master card. Existing backend permissions remain unchanged.

- [ ] **Step 7: Build frontend**

Run: `npm run build` from `frontend`

Expected: TypeScript and Vite build pass.

---

## Task 5: PSR Lookup Uses Cache

**Files:**
- Modify: `backend/src/modules/service-request/types.ts`
- Modify: `backend/src/modules/service-request/serviceRequestConfig.ts`
- Modify: `backend/src/modules/service-request/controllers/serviceRequestController.ts`
- Modify: `frontend/src/pages/service-request/ServiceRequestSettings.tsx`

- [ ] **Step 1: Extend lookup source types**

Add:

```ts
type LookupSource = "auto" | "mdm" | "database" | "cache" | "hybrid_cache";
```

- [ ] **Step 2: Add cache config to SR lookup**

Add fields:

```ts
cacheMdmSourceId?: string;
cacheJoinKey?: string;
```

- [ ] **Step 3: Update parent lookup controller**

Logic:

```ts
if source === "cache": search cache only.
if source === "hybrid_cache": search cache, then live MDM, then database fallback if enabled.
if source === "mdm": current live MDM.
if source === "auto": current MDM then database fallback.
if source === "database": current database.
```

- [ ] **Step 4: Update SR Settings UI**

Add options:

- `Live MDM API`
- `Mongo MDM Cache`
- `Mongo cache first, API fallback`
- `Mongo database fallback only`

When cache mode is selected, show:

- External MDM source
- Join key
- Test cache lookup button

- [ ] **Step 5: Build backend and frontend**

Run:

```powershell
npm run build
```

in both `backend` and `frontend`.

Expected: both builds pass.

---

## Task 6: Cron Scheduler

**Files:**
- Create: `backend/src/services/mdmCacheScheduler.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Create scheduler**

Create a scheduler that:

- Loads enabled MDM sources with cache enabled.
- Registers cron jobs for enabled datasets.
- Runs `syncDataset`.
- Rebuilds enabled joins after successful dataset sync.
- Exposes `startMDMCacheScheduler()` and `stopMDMCacheScheduler()`.

- [ ] **Step 2: Start scheduler in server**

Modify `backend/src/server.ts` near other schedulers:

```ts
import { startMDMCacheScheduler } from "./services/mdmCacheScheduler";
...
startMDMCacheScheduler();
```

- [ ] **Step 3: Build backend**

Run: `npm run build` from `backend`.

Expected: TypeScript build passes.

---

## Task 7: Verification

**Files:**
- No new files unless test harness exists.

- [ ] **Step 1: Backend build**

Run: `npm run build` in `backend`.

Expected: build passes.

- [ ] **Step 2: Frontend build**

Run: `npm run build` in `frontend`.

Expected: build passes.

- [ ] **Step 3: Manual admin flow**

Verify:

1. Open Integrations > External MDM.
2. Create or edit an MDM source.
3. Add three API rows: Parent, Student, Guardian Mapping.
4. Add three cache datasets.
5. Load sample keys for each dataset.
6. Select unique/search/stored fields.
7. Sync datasets.
8. Rebuild join.
9. Test cached lookup.

- [ ] **Step 4: Manual PSR flow**

Verify:

1. Open SR Settings.
2. Select lookup mode `Mongo MDM Cache`.
3. Select External MDM source and join key.
4. Search parent in PSR New Request.
5. Parent and children appear without live MDM API calls.

---

## Self-Review

- Requirement covered: Move MDM from Master Setup to Integrations.
- Requirement covered: Store selected MDM data in MongoDB.
- Requirement covered: Allow future columns by keeping raw plus selected fields.
- Requirement covered: Configure joins for multiple API tables with common identifiers.
- Requirement covered: Keep current live MDM method available.
- Requirement covered: Add manual sync and later cron.
- No hardcoded parent/student API fields in design; all keys are selected in UI.
