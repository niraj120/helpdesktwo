# Knowledge Base - Sprint Plan (Safe Rollout)

Objective: Deliver HTML upload, isolated rendering, and global search with zero regression to existing Knowledge Base features.

Base stories reference: docs/KNOWLEDGE_BASE_USER_STORIES.md

## Delivery Principles

- Additive changes only.
- Keep all current APIs, visibility behavior, and existing document types working.
- Gate new behavior with a feature flag: KB_HTML_SEARCH_V1.
- Ensure public portal behavior remains unchanged.

## Team Assumptions

- 1 Frontend engineer
- 1 Backend engineer
- 1 QA engineer
- 2-week sprint cadence

## Sprint 1 (Foundation + Upload + Safe Rendering)

### Sprint Goal

Enable safe HTML upload and isolated display for internal users, without changing default behavior for existing users.

### Backend Tasks

1. Add optional metadata fields to KB article write/read flow

- Scope: docNumber, pageNumber, uploadedAt (optional)
- Files:
  - backend/src/models/KBArticle.ts
  - backend/src/controllers/kbArticleController.ts
- Effort: 1.0 day
- Notes: Backward compatible only; old records must still read.

2. Extend validation for HTML upload constraints

- Scope: enforce .html, size limits where applicable, consistent error messages
- Files:
  - backend/src/controllers/kbArticleController.ts
  - backend/src/routes/kbArticles.ts
- Effort: 0.5 day

3. Feature flag plumbing (server-side exposure optional)

- Scope: optional config endpoint/constant for KB_HTML_SEARCH_V1
- Files:
  - backend/src/config/\* (if needed)
- Effort: 0.5 day

### Frontend Tasks

1. Build HtmlUploadZone component

- Scope: picker + drag-drop + validation + loading/error UI
- Files:
  - frontend/src/components/knowledge-base/HtmlUploadZone.tsx
  - frontend/src/components/knowledge-base/KBArticleForm.tsx (integration)
- Effort: 1.5 days

2. Build DocumentMetaForm fields integration

- Scope: title prefill, docNumber/pageNumber controlled inputs
- Files:
  - frontend/src/components/knowledge-base/KBArticleForm.tsx
- Effort: 1.0 day

3. Implement isolated HTML viewer mode using iframe Blob URL

- Scope: sandbox iframe, auto-size, fallback height, blob URL cleanup
- Files:
  - frontend/src/components/knowledge-base/ArticleDetailView.tsx
  - optional new component: frontend/src/components/knowledge-base/HtmlViewer.tsx
- Effort: 2.0 days

4. Add feature flag toggle in UI

- Scope: keep existing renderer path as fallback
- Files:
  - frontend/src/components/knowledge-base/ArticleDetailView.tsx
  - frontend/src/components/knowledge-base/KnowledgeBaseViewer.tsx
- Effort: 0.5 day

### QA Tasks

1. Regression validation for existing KB flows

- Scope:
  - existing PDF/html/both/link articles render exactly as before when flag OFF
  - visibility and role filters unchanged
- Effort: 1.5 days

2. New upload/render validation when flag ON

- Scope:
  - .html only, size checks, malformed file handling
  - iframe renders and resizes correctly
- Effort: 1.0 day

### Sprint 1 Estimate

- FE: 5.0 days
- BE: 2.0 days
- QA: 2.5 days

### Sprint 1 Exit Criteria

- HTML upload available for internal KB manage users.
- Isolated iframe rendering works behind KB_HTML_SEARCH_V1.
- No regression in current KB list/detail and visibility.

## Sprint 2 (In-Memory Index + Global Search + Highlight)

### Sprint Goal

Enable global full-text search across uploaded HTML docs with snippets and in-document highlighting.

### Backend Tasks

1. No mandatory backend changes for in-memory index mode

- Scope: maintain existing list endpoints; optional optimization only
- Effort: 0.0 to 0.5 day

2. Optional telemetry endpoint for search usage

- Scope: track query volume/perf (optional)
- Effort: 0.5 day

### Frontend Tasks

1. Build useKbSearch hook

- Scope: indexDocument, updateMeta, deleteIndex, search with snippets
- Files:
  - frontend/src/components/knowledge-base/hooks/useKbSearch.ts
- Effort: 2.0 days

2. Build KbSearchBar with debounce

- Scope: global search UI + clear behavior
- Files:
  - frontend/src/components/knowledge-base/KbSearchBar.tsx
  - frontend/src/components/knowledge-base/KnowledgeBaseViewer.tsx (integration)
- Effort: 1.0 day

3. Build KbSearchResults component

- Scope: result cards, metadata badges, no-result state
- Files:
  - frontend/src/components/knowledge-base/KbSearchResults.tsx
- Effort: 1.0 day

4. Build highlight + match navigation in viewer

- Scope: mark injection, first scroll, prev/next navigation, counter
- Files:
  - frontend/src/components/knowledge-base/HtmlViewerWithHighlight.tsx
  - frontend/src/components/knowledge-base/ArticleDetailView.tsx (integration)
- Effort: 2.0 days

5. Document list enhancements

- Scope: active state, delete action handling with index cleanup
- Files:
  - frontend/src/components/knowledge-base/KnowledgeBaseViewer.tsx
  - optional new component: frontend/src/components/knowledge-base/KbDocumentList.tsx
- Effort: 1.0 day

### QA Tasks

1. Search correctness and UX test pack

- Scope:
  - case-insensitive search
  - snippet quality
  - highlight behavior and navigation
- Effort: 1.5 days

2. Performance test pack

- Scope: 50 docs x up to 500 KB scenarios, responsiveness checks
- Effort: 1.0 day

3. Regression test pack

- Scope: all existing KB workflows still stable
- Effort: 1.0 day

### Sprint 2 Estimate

- FE: 7.0 days
- BE: 0.5 day optional
- QA: 3.5 days

### Sprint 2 Exit Criteria

- Global search + result snippets + highlight navigation available behind flag.
- Existing KB behavior unaffected when flag OFF.

## Sprint 3 (Hardening + Rollout + Monitoring)

### Sprint Goal

Production hardening, staged enablement, and rollback readiness.

### Tasks

1. Cross-browser hardening

- Scope: iframe behavior, fallback paths, memory cleanup
- Effort: FE 1.0 day, QA 0.5 day

2. Security hardening review

- Scope: HTML sanitization, sandbox attributes, script allowances audit
- Effort: FE/BE 1.0 day

3. Monitoring and rollback plan

- Scope: feature-flag rollout by user cohort/project, rollback checklist
- Effort: 0.5 day

4. UAT and sign-off

- Scope: business validation with sample real documents
- Effort: QA 1.0 day

### Sprint 3 Exit Criteria

- UAT approved.
- Rollout playbook documented.
- Rollback can be done in under 15 minutes by disabling flag.

## Dependency Sequence

1. Data compatibility and metadata support (BE)
2. Upload UI and safe renderer (FE)
3. Regression pass (QA)
4. In-memory indexing and search UI (FE)
5. Highlight navigation (FE)
6. Performance + full regression (QA)
7. Staged rollout and monitoring

## Risk Register

1. Risk: existing article rendering differences after iframe change

- Mitigation: feature flag + legacy renderer fallback

2. Risk: visibility/access regression

- Mitigation: do not alter kbPublicController visibility logic; regression tests mandatory

3. Risk: memory leaks with many document switches

- Mitigation: strict blob URL revoke on every switch and unmount; soak test 10+ switches

4. Risk: search latency on larger datasets

- Mitigation: debounce + efficient in-memory map; keep worker option for later

## Definition of Done Checklist

- Build passes (frontend + backend)
- Unit/integration checks for new components/hooks
- Regression suite for existing KB flows passes
- Feature flag verified ON/OFF
- Documentation updated:
  - docs/KNOWLEDGE_BASE_USER_STORIES.md
  - docs/KNOWLEDGE_BASE_SPRINT_PLAN.md

## Suggested Ticket Split (Ready for Jira/Boards)

- KB-FE-01 HtmlUploadZone + validation
- KB-FE-02 Metadata form integration
- KB-FE-03 Isolated iframe viewer + auto-resize + cleanup
- KB-FE-04 useKbSearch hook
- KB-FE-05 Global search bar + debounce
- KB-FE-06 Search results + snippets
- KB-FE-07 Highlight + next/previous navigation
- KB-FE-08 Document list active/delete/index-sync
- KB-BE-01 Optional metadata support in KBArticle flow
- KB-BE-02 Upload constraint hardening and message parity
- KB-QA-01 Regression matrix existing KB
- KB-QA-02 New feature validation matrix
- KB-QA-03 Performance matrix (500 KB x 50 docs)
