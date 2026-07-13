# PSR — Configurable API Composition & Search: User Stories

**Product:** PSR (Parent Service Request) — configurable pipeline + local search
**Audience:** Product, engineering, QA. Stories are implementation-ready.
**Format:** Each story has a narrative, acceptance criteria (AC), technical tasks, and API/schema references.

---

## Confirmed design decisions (baked into every story)

| #   | Decision                                                                             | Impact                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Mixed bulk/single lookups** — some source APIs accept a list of IDs, some only one | Each source declares a `bulkLookup` capability; the engine chooses a **bulk fetch** or a **bounded-concurrency single-fetch** strategy per source                                                                 |
| 2   | **Ops = structural + filters + light expressions/transforms**                        | Pipeline supports `root`, `lookup`, `filter`, `map/transform`, `rename` — expressions run in a **sandboxed safe evaluator**, no arbitrary code                                                                    |
| 3   | **Large volume (>500k) + near-real-time**                                            | Rules out Strapi cron for the hot path. Use a **queue-based worker (BullMQ/Redis)** + **change-data-capture (CDC) / incremental watermark polling** on a short interval; full re-sync is a separate scheduled job |

**Fixed architecture assumptions:** local MongoDB is a **read mirror** (MDM authoritative); joins resolved **at sync time** (denormalize-on-write); registry + UI as a **Strapi plugin**; sync as a **separate queue worker**; nothing domain-specific is hardcoded (parent/student/guardian exist only as admin-entered data).

---

## Personas

- **Config Admin** — non-developer who registers APIs and composes pipelines in the UI.
- **PSL Agent** — end user creating tickets; consumes search.
- **Developer / System** — owns the engine, worker, and platform-level tasks (explicit dev stories below).

---

## Epic map

- **E1 — API Source Registry**
- **E2 — Pipeline Composition (builder)**
- **E3 — Sync Engine & Scheduling**
- **E4 — Search & PSL Integration**
- **E5 — Observability, Security & Platform (dev)**

---

# E1 — API Source Registry

## US-1.1 — Register an external API source

**As a** Config Admin **I want** to register an external API with its connection details **so that** the system can pull data from it.

**Acceptance criteria**

- I can create a source with: display name, admin handle/key (e.g. `s1`), base URL, method, auth type (`bearer` / `apikey` / `basic` / `none`), static headers, pagination config, `responsePath` (JSON path to the row array), and `primaryKey`.
- Secrets are entered as **references** (env/vault key), never stored as raw values; raw secrets never appear in any GET response.
- Handle must be unique within a pipeline and validate against `^[a-z][a-z0-9_]*$`.
- Saving an invalid config (missing base URL, bad JSON path) returns a field-level validation error, not a 500.

**Technical tasks**

- Strapi content-type `api_source` (or embedded sub-document of `pipeline_config`).
- Secret-reference resolver (`env:NAME`, `vault:path`) resolved only at execution time in the worker.
- JSON-path validator for `responsePath`.

**API / schema**

- `POST /admin/pipelines/:id/sources`, `PUT/DELETE /admin/pipelines/:id/sources/:key`
- Schema: `sources[]` per the spec (`key,name,baseUrl,method,auth,headers,pagination,responsePath,primaryKey,bulkLookup,discoveredColumns`).

---

## US-1.2 — Declare bulk vs single lookup capability

**As a** Config Admin **I want** to declare whether a source supports fetching many records by a list of IDs **so that** the engine uses the fastest safe strategy for each source.

**Acceptance criteria**

- Each source has a `bulkLookup` block: `supported` (bool), `param` (name), `style` (`query-csv` / `body-array` / `repeat-param`), optional `maxIds` (batch cap).
- If `supported=false`, the engine must fall back to single-ID fetches with bounded concurrency (configurable, default 10) and per-request retry.
- UI clearly labels each source as **bulk** or **single**.

**Technical tasks**

- Extend source schema with `bulkLookup`.
- Engine strategy selector keyed on `bulkLookup.supported`.
- Batch chunker respecting `maxIds`.

**API / schema** — `bulkLookup: { supported, param, style, maxIds }`.

---

## US-1.3 — Test connection & auto-discover columns

**As a** Config Admin **I want** to test a source and see its returned columns **so that** I can select fields without reading API docs.

**Acceptance criteria**

- A "Test & Discover" action fetches one page and returns: HTTP status, sample rows (max 5, secrets/PII masked in preview), and a flat list of discovered column paths (including nested, dot-notated).
- On failure I see the status code and error body snippet, not a stack trace.
- Discovered columns persist to `discoveredColumns` and feed all downstream dropdowns.
- Timeout capped (e.g. 10s); the call never blocks the admin UI thread.

**Technical tasks**

- `POST /admin/sources/test` (stateless — accepts a source config, returns sample + columns).
- Recursive key flattener for nested JSON.
- PII/secret masking in preview output.

**API / schema** — `POST /admin/sources/test` → `{ status, sample[], columns[] }`.

---

# E2 — Pipeline Composition (builder)

## US-2.1 — Create a pipeline with an admin-named target collection

**As a** Config Admin **I want** to create a pipeline that writes to a Mongo collection I name **so that** I control where composed data lands.

**Acceptance criteria**

- I set pipeline name and `targetCollection` (validated collection name, no clashes with system collections).
- A pipeline starts empty (no sources, no steps) and is not runnable until it has a `root` step and an output `keyField`.
- I can clone an existing pipeline as a starting point.

**Technical tasks** — `pipeline_config` content-type; runnable-state validator; clone endpoint.
**API / schema** — `POST/GET/PUT/DELETE /admin/pipelines`, `POST /admin/pipelines/:id/clone`.

---

## US-2.2 — Choose the root source

**As a** Config Admin **I want** to pick which registered source is the starting set of rows **so that** the pipeline iterates the right entity.

**AC** — Exactly one `root` step; changing it warns me that downstream step field references may break and highlights invalid references.
**Tasks** — `root` step type; reference-integrity checker across steps.
**Schema** — `{ "op":"root", "source":"s1" }`.

---

## US-2.3 — Chain a lookup/join step to another source

**As a** Config Admin **I want** to join the current rows to another source on a key and carry or embed fields **so that** I can compose data spanning multiple APIs.

**Acceptance criteria**

- A `lookup` step captures: target `source`, `matchLeft` (field on current row), `matchRight` (field on target), `pick[]` (fields to carry), optional `embedAs` (nest matches as an array), and `cardinality` (`one` / `many`).
- `matchLeft`/`matchRight`/`pick` dropdowns are populated from discovered columns of the relevant sources.
- I can add, remove, and **reorder** lookup steps; the chain re-validates on each change.
- The example parent→guardian→student chain is expressible as `root(s1) → lookup(s2) → lookup(s3, embedAs:students)` with **no code change**.
- Adding a 4th source + lookup is purely a UI action.

**Technical tasks**

- `lookup` step type + builder card UI.
- Field-source resolution so later steps can reference fields produced by earlier steps (e.g. `studentId` from s2).
- Cardinality handling: `one` merges columns, `many` produces/embeds arrays.

**Schema**

```json
{
  "op": "lookup",
  "source": "s2",
  "matchLeft": "s1.parentId",
  "matchRight": "parentId",
  "pick": ["studentId"],
  "cardinality": "many"
}
```

---

## US-2.4 — Add a filter step

**As a** Config Admin **I want** to keep only rows meeting a condition **so that** the composed collection excludes irrelevant records (e.g. inactive).

**Acceptance criteria**

- A `filter` step accepts a condition over available fields using a **restricted expression grammar** (comparisons `== != > >= < <=`, `in`, `and/or/not`, string/number/bool/null literals, field refs).
- The expression is validated at save (parse + field existence); invalid expressions block save with a clear message.
- Expressions run in a **sandbox** — no access to globals, no I/O, no unbounded loops; evaluation is time-bounded per row.

**Technical tasks**

- Safe expression parser + evaluator (allowlist AST; e.g. a vetted library or custom mini-grammar — **not** `eval`/`Function`).
- Field-reference validation against the current pipeline field set.

**Schema** — `{ "op":"filter","condition":"status == \"active\" and gradeYear >= 1" }`.

---

## US-2.5 — Add a map/transform step

**As a** Config Admin **I want** to derive or normalise fields **so that** stored data is clean and search-ready (e.g. normalise mobile numbers, concat name).

**Acceptance criteria**

- A `map` step defines output fields as expressions over existing fields (same sandboxed grammar plus a small allowlisted function set: `lower`, `upper`, `trim`, `concat`, `coalesce`, `substr`, `replace`, `toString`).
- No function performs I/O; execution is deterministic and time-bounded.
- Errors in one row's transform are recorded per-row (row skipped or field nulled per config) without failing the whole run.

**Technical tasks** — extend evaluator with allowlisted pure functions; per-row error policy (`skip` / `null` / `fail-run`).
**Schema** — `{ "op":"map","set":{ "mobileNorm":"replace(mobile,\"+91\",\"\")", "fullName":"concat(firstName,\" \",lastName)" } }`.

---

## US-2.6 — Rename fields

**As a** Config Admin **I want** to rename source fields **so that** the stored schema uses my naming.
**AC** — `rename` maps source→output names; collisions flagged.
**Schema** — `{ "op":"rename","map":{ "fname":"firstName" } }`.

---

## US-2.7 — Select output columns, key, and search indexes

**As a** Config Admin **I want** to choose which fields are stored, which is the key, and which are searchable **so that** the collection is lean and fast.

**Acceptance criteria**

- Output mapper lists every field available at the end of the chain (including embedded arrays and mapped fields).
- I mark exactly one `keyField` (unique upsert key), select stored columns with optional `as` rename, and mark fields as search indexes (plain, or grouped `text` index).
- Saving triggers index creation/reconciliation on the target collection on next run (or immediately via "Rebuild indexes").

**Technical tasks** — output projector; dynamic Mongo index reconciliation (create missing, warn on conflicting).
**Schema** — `output.columns[]`, `output.keyField`, `output.searchIndexes[]`.

---

## US-2.8 — Validate & preview the whole pipeline (dry run)

**As a** Config Admin **I want** to dry-run a pipeline on a small sample **so that** I can verify output shape before a full sync.

**Acceptance criteria**

- "Dry run" executes the full chain over the first N root rows (default 25), **without writing to Mongo**, and returns sample composed documents + per-step row counts + timing.
- Lookup fan-out, filters, and transforms are all applied in the preview.
- Errors are surfaced per step (which step, which field, sample offending value).

**Technical tasks** — engine `dryRun` mode (in-memory, no upsert); step-level instrumentation.
**API / schema** — `POST /admin/pipelines/:id/dry-run?limit=25`.

---

# E3 — Sync Engine & Scheduling

## US-3.1 — Generic engine executes any pipeline config

**As a** Developer **I want** the engine to be a pure interpreter of pipeline config **so that** no domain logic is hardcoded and new pipelines need no deploys.

**Acceptance criteria**

- Engine reads config and executes steps in order: paginate root → per step apply `lookup`/`filter`/`map`/`rename` → project to output → bulk upsert on `keyField`.
- No source/collection/field names appear in engine code (verified by a lint/test that greps for domain terms in `/engine`).
- Engine is unit-tested against fixture pipelines of 1, 2, and 4 sources.

**Technical tasks** — engine module (`runPipeline`, `applyLookup`, `applyFilter`, `applyMap`, `selectColumns`, `bulkUpsert`, `ensureIndexes`); fixtures + tests.

**Reference (pseudocode)**

```js
async function runPipeline(cfg, mode, watermark) {
  const root = cfg.steps.find((s) => s.op === "root").source;
  for await (const page of paginate(sourceOf(cfg, root), mode, watermark)) {
    let rows = page;
    for (const step of cfg.steps)
      rows = await applyStep(rows, step, cfg.sources);
    await bulkUpsert(
      cfg.targetCollection,
      rows.map((r) => selectColumns(r, cfg.output)),
      cfg.output.keyField,
    );
  }
  await ensureIndexes(cfg.targetCollection, cfg.output.searchIndexes);
}
```

---

## US-3.2 — Per-source bulk/single lookup strategy

**As a** Developer **I want** the engine to batch bulk-capable lookups and bound single-fetch ones **so that** >500k syncs stay performant despite mixed APIs.

**Acceptance criteria**

- For a `lookup` on a **bulk** source: collect all `matchLeft` keys for the page, dedupe, chunk by `maxIds`, issue one request per chunk, join in memory.
- For a **single** source: issue single-ID requests at bounded concurrency (default 10, configurable), with retry+backoff and an in-run cache to avoid refetching the same ID.
- Lookups within a page are cached so repeated keys hit the cache, not the network.

**Technical tasks** — strategy selector; chunker; p-limit style concurrency guard; per-run LRU cache; exponential backoff.

---

## US-3.3 — Incremental sync with watermark / CDC

**As a** Developer **I want** near-real-time incremental syncs **so that** new/changed records appear within minutes without full re-pulls.

**Acceptance criteria**

- Each pipeline tracks a `watermark` (timestamp or cursor) persisted per run.
- Incremental runs request only root rows changed since the watermark (via source's modified-since param or cursor); if a source lacks change support, it's marked **full-only** and excluded from the fast path.
- Short-interval scheduler (e.g. every 5 min) enqueues incremental jobs; a separate schedule runs periodic full reconciliation (e.g. nightly) to catch deletes/missed updates.
- Hard deletes are reconciled by the full job (tombstone or set-difference); soft deletes honored via filter.

**Technical tasks** — watermark store; modified-since query builder per pagination style; nightly full-reconcile job with delete detection; `full-only` flag on sources without CDC.

---

## US-3.4 — Idempotent upsert with change detection

**As a** Developer **I want** upserts keyed with content hashing **so that** unchanged records are skipped and writes are minimized.

**AC** — Compute a stable content `hash` per output doc; skip write when unchanged; store `_source.{pipeline,syncedAt,hash}`. Concurrent runs use last-write-wins on the key.
**Tasks** — canonical-JSON hasher; Mongo `bulkWrite` upserts; skip counter in run log.

---

## US-3.5 — Queue-based worker & scheduling

**As a** Developer **I want** syncs to run on a horizontally scalable queue worker **so that** large volumes don't block the app and can scale out.

**Acceptance criteria**

- Jobs run on BullMQ/Redis (or equivalent); workers are stateless and scale horizontally.
- Per-pipeline concurrency limit prevents overlapping runs of the same pipeline (lock/mutex).
- Jobs are checkpointed per page so a failed job resumes from the last watermark, not from zero.
- Backpressure: if a queue is saturated, new incremental jobs coalesce rather than pile up.

**Technical tasks** — queue setup; per-pipeline mutex; page checkpointing; job coalescing; graceful shutdown/drain.

---

## US-3.6 — Configure schedule & mode in the UI

**As a** Config Admin **I want** to set sync frequency and mode **so that** freshness matches the use case.
**AC** — Per pipeline: incremental interval (cron or minutes), full-reconcile cron, enable/disable. Disabling stops enqueueing immediately.
**Schema** — `schedule: { incrementalEveryMinutes, fullCron, mode, enabled }`.

---

## US-3.7 — Trigger a manual run

**As a** Config Admin **I want** a "Run now" button **so that** I can sync on demand.
**AC** — Enqueues a run; button disabled while a run for that pipeline is active; shows live status.
**API** — `POST /admin/pipelines/:id/run?mode=incremental|full`.

---

# E4 — Search & PSL Integration

## US-4.1 — Generic search endpoint over any composed collection

**As a** Developer **I want** one search endpoint that works for any pipeline **so that** no per-pipeline code is needed.

**Acceptance criteria**

- `GET /psr/search?pipeline=:id&q=:term&fields=mobile,email` queries only the pipeline's declared `searchIndexes`; unknown fields rejected.
- Returns denormalized documents (embedded arrays included), paginated (`limit`/`offset` or cursor), P95 < 150 ms at target volume.
- No live external API call occurs during search.
- Query is index-backed; a query that would collection-scan is refused or logged as slow.

**Technical tasks** — query builder from `searchIndexes`; field allowlist; pagination; slow-query guard/metrics.
**API** — `GET /psr/search`, `GET /psr/record?pipeline=:id&key=:value`.

---

## US-4.2 — PSL agent searches an existing parent

**As a** PSL Agent **I want** to search a parent by name, email, or mobile **so that** I can start an existing-parent ticket quickly.

**Acceptance criteria**

- In the existing-parent flow, typing ≥3 chars queries `/psr/search` (debounced ~250 ms) against the parent pipeline.
- Results show name + a disambiguator (mobile/email); selecting one loads the full record.
- Results come from local Mongo (no live MDM call); if the collection is empty/stale, a non-blocking banner indicates last sync time.

**Technical tasks** — search box component; debounce; result list; empty/stale-state handling.

---

## US-4.3 — Linked students appear on parent select

**As a** PSL Agent **I want** the selected parent's linked students to appear below **so that** I can pick the relevant student and fill the form.

**Acceptance criteria**

- On selecting a parent, the embedded `students[]` renders as a sub-select (no extra API round trip — data already embedded).
- Each student shows name + disambiguator (grade/school); multi-select supported if the flow allows.
- The submitted ticket stores the **real MDM IDs** (`parentId`, `studentId`s), not local `_id`s.

**Technical tasks** — student sub-select bound to embedded array; ticket payload maps to MDM IDs.

---

## US-4.4 — Category branching preserved

**As a** PSL Agent **I want** each PSL category (existing parent, prospect, junk, job-inquiry call/visit) to route to its own flow **so that** the right form is shown.
**AC** — Category selector drives which flow/form loads; only "existing parent" (and any admin-mapped category) uses the composed-search component; others use their own forms. Category→pipeline binding is configurable, not hardcoded.
**Tasks** — category registry; per-category flow mapping; bind search component to a configurable pipeline id.

---

# E5 — Observability, Security & Platform (developer)

## US-5.1 — Sync run logs & dashboard

**As a** Config Admin **I want** to see each run's status, counts, and errors **so that** I can trust the data.
**AC** — `sync_runs` records: pipeline, start/end, mode, status, counts (`read/upserted/skipped/errors`), watermark, error summary. Dashboard lists pipelines with last-run status, record count, and "Run now"; drill-down shows recent runs and per-step error samples.
**API** — `GET /admin/pipelines/:id/runs`, `GET /admin/runs/:runId`.

---

## US-5.2 — Alerting on failure & staleness

**As a** Developer **I want** alerts when runs fail or data goes stale **so that** issues are caught before agents notice.
**AC** — Alert (email/Slack/webhook) when a run fails N times consecutively or when a pipeline's `syncedAt` age exceeds a configured SLA. Metrics exported (run duration, rows/sec, error rate, queue depth, search P95).
**Tasks** — alert rules; Prometheus/OpenTelemetry metrics; staleness watchdog.

---

## US-5.3 — Secrets management

**As a** Developer **I want** source credentials stored as references resolved at runtime **so that** secrets never sit in config or logs.
**AC** — Config stores only references; worker resolves via env/vault at execution; secrets redacted in logs, previews, and API responses; rotating a secret needs no config edit.
**Tasks** — secret resolver; log redaction filter; test asserting no secret leakage in any endpoint.

---

## US-5.4 — AuthZ on admin surface

**As a** Developer **I want** role-gated access to the registry/builder **so that** only authorized admins configure pipelines.
**AC** — Strapi RBAC: only `psr-admin` role can CRUD sources/pipelines and trigger runs; PSL agents get search-only. All admin mutations audit-logged (who/what/when).
**Tasks** — role/permission setup; audit-log middleware.

---

## US-5.5 — Resilience & rate-limit safety

**As a** Developer **I want** the engine to respect source rate limits and recover from transient failures **so that** syncs don't hammer or crash on MDM hiccups.
**AC** — Per-source rate-limit config (max req/sec); retry with exponential backoff + jitter on 429/5xx; circuit-breaker per source; a page failure retries then checkpoints without losing prior pages.
**Tasks** — token-bucket limiter per source; backoff; circuit breaker; resumable checkpointing.

---

## US-5.6 — No-hardcoding guardrail (test)

**As a** Developer **I want** an automated check that the engine/search contain no domain terms **so that** configurability can't silently regress.
**AC** — CI test greps `/engine` and `/search` for a denylist (`parent`, `student`, `guardian`, etc.) outside fixtures/tests and fails the build on a match.
**Tasks** — CI lint rule + denylist.

---

## Cross-cutting non-functional requirements

| Category            | Requirement                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Performance**     | Search P95 < 150 ms; incremental freshness ≤ 5 min at >500k records; full reconcile within its nightly window        |
| **Scalability**     | Workers scale horizontally; per-pipeline concurrency capped to 1 active run                                          |
| **Data integrity**  | Deletes reconciled by the full job; upserts idempotent via content hash                                              |
| **Security**        | Secrets as references only; RBAC on admin; audit logging; PII masked in previews/logs                                |
| **Configurability** | 1–N sources, arbitrary lookup chains, filters/transforms, admin-named collections and indexes — all without redeploy |

---

## Suggested delivery order (thin vertical slices)

| Slice                     | Stories                                                                               | Outcome                                                      |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **A — Prove read path**   | US-1.1, US-1.3, US-2.1, US-2.2, US-2.3 (one lookup), US-2.7, US-3.1 (minimal), US-4.1 | Parent search with embedded students works end-to-end        |
| **B — Scale + freshness** | US-1.2, US-3.2, US-3.3, US-3.4, US-3.5, US-5.1                                        | Queue worker, incremental sync, sync logs live               |
| **C — Power + polish**    | US-2.4, US-2.5, US-2.6, US-2.8, US-3.6, US-3.7, US-4.2, US-4.3, US-4.4                | Filter/map/rename, dry-run, scheduling, PSL UI complete      |
| **D — Hardening**         | US-5.2, US-5.3, US-5.4, US-5.5, US-5.6                                                | Observability, security, resilience, no-hardcoding guardrail |

---

## Relation to existing External MDM page

This PSR system **replaces** the current `/integrations/external-mdm` page. The current page provides a simpler, single-collection builder (fixed 4 tabs: API Sources → Build Mongo Collection → Saved Collections → Sync History). The PSR design supersedes it with:

- **Named pipelines** (many, not one per source)
- **Step-based composition** (root → lookup chain → filter → map → rename → output) vs. a flat field picker
- **BullMQ queue worker** for scale vs. direct cron
- **Incremental/watermark sync** vs. full-rebuild only
- **Generic search endpoint** consumed by PSL ticket creation UI
- **Dry-run mode** before committing a full sync
