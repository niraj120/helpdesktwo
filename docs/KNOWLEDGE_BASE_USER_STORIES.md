# Knowledge Base - Developer User Stories (Implementation-Safe)

Purpose: Add HTML upload, isolated rendering, and global full-text search without breaking existing Knowledge Base behavior.
Scope: New capabilities must coexist with current KB article model, visibility rules, and public/internal flows.

## System Safety Guardrails (Mandatory)

- Do not remove or alter existing permissions, visibility filters, or route contracts.
- Do not break current document types: pdf, html, both, link.
- Keep existing student-portal visibility behavior intact.
- Keep current KB list/detail pages working even if new search/index features are disabled.
- Add new features in additive mode using feature flags and backward-compatible payloads.
- No DB migration that changes existing fields semantics without fallback readers.

## Current Architecture Reference (Use As-Is)

- Backend article model supports htmlContent and metadata: backend/src/models/KBArticle.ts
- Protected KB CRUD routes: backend/src/routes/kbArticles.ts
- Public KB visibility filter and listing: backend/src/controllers/kbPublicController.ts
- KB management form/editor: frontend/src/components/knowledge-base/KBArticleForm.tsx
- KB viewer/list and local search: frontend/src/components/knowledge-base/KnowledgeBaseViewer.tsx
- Article rendering/detail: frontend/src/components/knowledge-base/ArticleDetailView.tsx

## EPIC 1 - HTML Document Upload

### US-01 Upload an HTML file via picker

As a KB user, I want to select an .html file from my device, so that I can quickly add content.

Acceptance Criteria:

- Upload control is visible in KB Manage screen.
- Accepts only .html MIME/extension; invalid files show: Only .html files are supported.
- 5 MB limit enforced; overflow shows: File too large. Maximum size is 5 MB.
- On success, default title is filename without extension.

Implementation Notes:

- Add HtmlUploadZone component in frontend/src/components/knowledge-base/
- Use input type=file accept=.html and optional drag-and-drop.
- Keep existing PDF upload logic untouched.

### US-02 Drag-and-drop HTML upload

As a KB user, I want drag-and-drop upload, so that I can upload faster.

Acceptance Criteria:

- Dropzone visual highlight on drag-over.
- Drop invokes same validation and pipeline as picker.
- Invalid drops show inline error and do not crash UI.

Implementation Notes:

- Manage isDragging state and reuse file validation function.

### US-03 Capture metadata for uploaded document

As a KB admin, I want title, document number, and page number metadata, so that search and navigation are accurate.

Acceptance Criteria:

- Title prefilled from filename.
- docNumber and pageNumber editable before save.
- Metadata persisted with htmlContent and searchable text.

Implementation Notes:

- Add fields in form state and API payload as optional, backward compatible keys.
- Existing articles without metadata continue to render normally.

## EPIC 2 - Isolated HTML Rendering

### US-04 Render HTML in isolation

As a KB user, I want uploaded HTML to render without host CSS conflicts, so that document layout remains correct.

Acceptance Criteria:

- HTML rendered in sandboxed iframe via Blob URL.
- Host CSS does not bleed into uploaded HTML.
- iframe has no visible border and supports full content rendering.

Implementation Notes:

- Extend ArticleDetailView renderer path for html documentType.
- Keep existing current HTML rendering as fallback if iframe mode is disabled.

### US-05 Auto-resize iframe height

As a KB user, I want iframe height to fit document content, so that nested scrollbars are minimized.

Acceptance Criteria:

- On load, iframe height set from body.scrollHeight.
- On cross-origin access errors, fallback to 600px.
- Switching docs recalculates height.

### US-06 Revoke Blob URLs to avoid memory leaks

As a developer, I want blob URLs revoked on switch/unmount, so that long sessions do not leak memory.

Acceptance Criteria:

- Previous URL revoked before assigning new one.
- URL revoked in effect cleanup.

## EPIC 3 - Search Index

### US-07 Index HTML content on upload

As a KB user, I want uploaded HTML indexed automatically, so that content is searchable immediately.

Acceptance Criteria:

- HTML to plain-text extraction using DOMParser.
- Index entry stores id, title, docNumber, pageNumber, htmlContent, plainText.
- Indexing is in-session and does not require server indexing.

Implementation Notes:

- Add useKbSearch hook (frontend) and keep current server/public search untouched.

### US-08 Re-index on metadata edit

As a KB admin, I want metadata edits reflected in search results, so that results stay current.

Acceptance Criteria:

- updateMeta overwrites same id in index.
- No duplicate index entries for same document.

## EPIC 4 - Global Search UI

### US-09 Global search bar across uploaded docs

As a KB user, I want one top search bar to search all indexed docs, so that discovery is fast.

Acceptance Criteria:

- Search bar always visible in KB page.
- Case-insensitive search across all indexed plain text.
- Debounce 300 ms.
- Clearing query hides result panel.

### US-10 Result cards with contextual snippets

As a KB user, I want title/doc/page and snippet preview, so that I can judge relevance quickly.

Acceptance Criteria:

- Each result includes title, #docNumber, Page badge, and snippet.
- Up to 5 snippets per document.
- No results message shown for empty hits.

### US-11 Highlight term in opened document

As a KB user, I want matches highlighted in viewer, so that I can locate text instantly.

Acceptance Criteria:

- Opened doc wraps matched term in mark styling.
- Auto-scroll to first mark.
- No highlight when query is empty.

### US-12 Next/Previous match navigation

As a KB user, I want to jump between matches, so that long documents are easier to review.

Acceptance Criteria:

- Prev/Next controls shown when highlights exist.
- Match counter displays current/total.
- Buttons disabled at bounds.

## EPIC 5 - Document List and Navigation

### US-13 Sidebar list of uploaded docs

As a KB user, I want a document list panel, so that I can browse without searching.

Acceptance Criteria:

- List shows title, doc number, and page number.
- Active item is highlighted.
- Newest first ordering.

### US-14 Delete document safely

As a KB admin, I want to remove documents, so that obsolete content is not discoverable.

Acceptance Criteria:

- Delete action with confirmation.
- Removal updates UI list and in-memory index.
- If deleted doc is open, viewer resets to empty state.

Implementation Notes:

- Keep backend delete route behavior unchanged; only add UI + index cleanup.

## EPIC 6 - Errors and Performance

### US-15 Handle malformed or empty HTML

As a KB user, I want clear upload feedback on invalid files, so that I can correct issues quickly.

Acceptance Criteria:

- 0-byte file shows explicit empty file error.
- Empty parsed body shows warning but still allows save.

### US-16 Large file handling up to 500 KB

As a KB user, I want smooth handling of larger docs, so that the app stays responsive.

Acceptance Criteria:

- Show processing spinner during read/index.
- Upload+index+render complete within acceptable limits on standard hardware.
- Search remains responsive with moderate document counts.

## Rollout Plan (Do Not Hamper Existing System)

Phase 1:

- Add new frontend components and hook behind feature flag KB_HTML_SEARCH_V1.
- Keep existing KnowledgeBaseViewer search and ArticleDetailView behavior as default.

Phase 2:

- Enable upload/index/highlight for internal KB_MANAGE users only.
- Validate no regressions on public portal visibility filters.

Phase 3:

- Enable for all KB viewers after performance and permission validation.

## Definition of Done

- Existing KB CRUD, visibility, and student portal behavior remain unchanged.
- New HTML upload and search features pass acceptance criteria above.
- No regressions in current routes, permissions, or rendering of existing articles.
- Backend and frontend build pass.
