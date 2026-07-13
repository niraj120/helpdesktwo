# External MDM Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase B admin UX for External MDM by making source/cache/join/sync configuration understandable and usable from the existing React admin page.

**Architecture:** Keep `/integrations/external-mdm` as the single External MDM admin surface. Reuse existing backend routes for MDM source CRUD, cache config, dataset sync, join rebuild, cache lookup, and sync jobs. Add frontend organization and missing sync-history visibility without changing the backend contract.

**Tech Stack:** React + TypeScript frontend, existing `frontend/src/services/mdmService.ts`, existing Express/Mongo backend routes.

---

### Task 1: Organize External MDM Admin Into Clear Tabs

**Files:**
- Modify: `frontend/src/pages/integrations/ExternalMDMPage.tsx`

- [ ] Add local `activeTab` state with these values: `sources`, `builder`, `collections`, `history`.
- [ ] Render a compact tab bar below the page header.
- [ ] Move existing source summary/API table selection into `sources`.
- [ ] Move existing table selection, key matching, cached collection config, and preview/save blocks into `builder`.
- [ ] Move saved collections and Mongo preview into `collections`.
- [ ] Add an empty `history` tab placeholder that will be populated in Task 2.
- [ ] Preserve all existing functions and state names so current save/edit/preview behavior keeps working.

### Task 2: Surface Sync History

**Files:**
- Modify: `frontend/src/pages/integrations/ExternalMDMPage.tsx`
- Reuse: `listMDMSyncJobs` from `frontend/src/services/mdmService.ts`

- [ ] Import `listMDMSyncJobs`.
- [ ] Add `selectedHistorySourceId`, `syncJobs`, and `historyLoading` state.
- [ ] Load jobs for the selected source when the History tab opens or the selected source changes.
- [ ] Render job rows with operation, dataset/join key, status, inserted, updated, skipped, failed, started, finished, and error.
- [ ] Add a Refresh button.
- [ ] Show a friendly empty state when no jobs exist.

### Task 3: Improve Non-Technical Labels

**Files:**
- Modify: `frontend/src/pages/integrations/ExternalMDMPage.tsx`

- [ ] Rename the visible sections to simple labels:
  - `API Sources`
  - `Build Mongo Collection`
  - `Saved Collections`
  - `Sync History`
- [ ] Ensure helper text explains what the user should do next.
- [ ] Keep technical terms like `responsePath`, `joinKey`, and `datasetKey` out of primary labels where possible.

### Task 4: Verify

**Files:**
- Test: `frontend/src/pages/integrations/externalMdmWizard.test.ts`

- [ ] Run `npm exec vitest run src/pages/integrations/externalMdmWizard.test.ts` from `frontend/`.
- [ ] Run `npm run build` from `frontend/`.
- [ ] Run `git diff --check -- frontend/src/pages/integrations/ExternalMDMPage.tsx docs/superpowers/plans/2026-07-04-external-mdm-phase-b.md`.
