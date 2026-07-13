import axios, { AxiosRequestConfig } from "axios";
import { psrHttpRequest } from "./httpClient";
import PipelineConfig, {
  IPipelineConfig,
  IPsrSource,
  IPsrStep,
  ILookupStep,
  IFilterStep,
  IMapStep,
  IRenameStep,
} from "../../models/psr/PipelineConfig";
import SyncRun, { IStepLog, ISyncRunCounts } from "../../models/psr/SyncRun";
import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Pipeline Engine (US-3.1 — Slice A minimal)
//
// Pure interpreter: reads the pipeline config and executes steps in order.
// No domain names are hardcoded here — all source/collection/field names come
// from the admin-supplied config.
//
// Slice A capabilities:
//   ✅ Paginate root source (page / offset / cursor / none)
//   ✅ applyLookup (single-fetch, bounded concurrency — bulk is Slice B US-3.2)
//   ✅ applyFilter (safe expression evaluator — restricted subset)
//   ✅ applyMap    (safe expression evaluator + allowlisted functions)
//   ✅ applyRename
//   ✅ selectColumns + project to output
//   ✅ Dry-run mode (in-memory, no upsert)
//   ✅ Full-run mode (bulk upsert via bulkWrite)
//   ⏳ Incremental / watermark — Slice B (US-3.3)
//   ⏳ BullMQ queue          — Slice B (US-3.5)
// ---------------------------------------------------------------------------

// ─── Secret resolver ─────────────────────────────────────────────────────────

function resolveSecret(ref?: string): string {
  if (!ref) return "";
  if (ref.startsWith("env:")) return process.env[ref.slice(4)] || "";
  return "";
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function buildHeaders(source: IPsrSource): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const auth = source.auth;
  if (auth?.extraHeaders) {
    for (const [k, v] of Object.entries(auth.extraHeaders))
      headers[k] = String(v);
  }
  switch (auth?.type) {
    case "apikey":
      headers[auth.headerName || "X-API-Key"] = resolveSecret(auth.secretRef);
      break;
    case "bearer":
      headers["Authorization"] = `Bearer ${resolveSecret(auth.secretRef)}`;
      break;
  }
  return headers;
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce((acc: unknown, part) => {
    if (Array.isArray(acc)) return (acc as any[])[0]?.[part];
    return (acc as any)?.[part];
  }, obj);
}

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur) || typeof cur[parts[i]] !== "object") {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// ─── Paginating fetcher ───────────────────────────────────────────────────────

const PAGE_TIMEOUT_MS = 30_000;

async function* paginateSource(
  source: IPsrSource,
  pageLimit?: number, // optional: stop after this many pages (for dry-run)
): AsyncGenerator<any[]> {
  const url = `${source.baseUrl.replace(/\/$/, "")}${source.path ? "/" + source.path.replace(/^\//, "") : ""}`;
  const headers = buildHeaders(source);
  const pg = source.pagination;

  let page = 1;
  let offset = 0;
  let cursor: string | null = null;
  let pagesFetched = 0;

  while (true) {
    if (pageLimit !== undefined && pagesFetched >= pageLimit) break;

    const params: Record<string, unknown> = {};
    if (pg.type === "page" && pg.pageParam) {
      params[pg.pageParam] = page;
      if (pg.pageSizeParam) params[pg.pageSizeParam] = pg.pageSize || 100;
    } else if (pg.type === "offset" && pg.offsetParam) {
      params[pg.offsetParam] = offset;
      if (pg.pageSizeParam) params[pg.pageSizeParam] = pg.pageSize || 100;
    } else if (pg.type === "cursor" && pg.cursorParam && cursor !== null) {
      params[pg.cursorParam] = cursor;
    }
    // Inject watermark for incremental/CDC mode (US-3.3)
    if ((pg as any)._watermarkValue && pg.modifiedSinceParam) {
      params[pg.modifiedSinceParam] = (pg as any)._watermarkValue;
    }

    const config: AxiosRequestConfig = {
      method: source.method || "GET",
      url,
      headers,
      params,
      timeout: PAGE_TIMEOUT_MS,
    };

    if (source.auth?.type === "basic") {
      config.auth = {
        username: source.auth.username || "",
        password: resolveSecret(source.auth.secretRef),
      };
    }

    if (source.method === "POST" && source.requestBody) {
      try {
        config.data = JSON.parse(source.requestBody);
      } catch {
        config.data = source.requestBody;
      }
    }

    const response = await psrHttpRequest(
      source.key,
      config,
      source.rateLimit || {},
    );
    const rows: any[] = (() => {
      const extracted = source.responsePath
        ? getByPath(response.data, source.responsePath)
        : response.data;
      if (Array.isArray(extracted)) return extracted;
      if (extracted && typeof extracted === "object") return [extracted];
      return [];
    })();

    if (rows.length === 0) break;
    yield rows;
    pagesFetched++;

    // Determine if there's a next page
    if (pg.type === "page") {
      if (pg.totalPath) {
        const total = Number(getByPath(response.data, pg.totalPath) ?? 0);
        const pageSize = pg.pageSize || 100;
        if (page * pageSize >= total) break;
      } else {
        if (rows.length < (pg.pageSize || 100)) break;
      }
      page++;
    } else if (pg.type === "offset") {
      const pageSize = pg.pageSize || 100;
      offset += rows.length;
      if (rows.length < pageSize) break;
    } else if (pg.type === "cursor") {
      const nextCursor = pg.nextCursorPath
        ? String(getByPath(response.data, pg.nextCursorPath) ?? "")
        : "";
      if (!nextCursor) break;
      cursor = nextCursor;
    } else {
      break; // "none" — single response
    }
  }
}

// ─── Safe expression evaluator ───────────────────────────────────────────────
// Supports: field refs, string/number/bool/null literals, comparisons,
// and/or/not, `in`, and allowlisted string functions.
// IMPORTANT: Uses a custom recursive-descent evaluator — NOT eval/Function.

type ExprValue = string | number | boolean | null | undefined;
type RowContext = Record<string, unknown>;

const ALLOWED_FUNCTIONS: Record<string, (...args: ExprValue[]) => ExprValue> = {
  lower: (s) => (typeof s === "string" ? s.toLowerCase() : s),
  upper: (s) => (typeof s === "string" ? s.toUpperCase() : s),
  trim: (s) => (typeof s === "string" ? s.trim() : s),
  concat: (...args) => args.map((a) => String(a ?? "")).join(""),
  coalesce: (...args) =>
    args.find((a) => a !== null && a !== undefined) ?? null,
  substr: (s, start, len) =>
    typeof s === "string"
      ? s.slice(
          Number(start ?? 0),
          Number(start ?? 0) + Number(len ?? s.length),
        )
      : s,
  replace: (s, from, to) =>
    typeof s === "string"
      ? s.split(String(from ?? "")).join(String(to ?? ""))
      : s,
  toString: (v: ExprValue) => (v === null || v === undefined ? "" : String(v)),
};

function evalExpr(expr: string, row: RowContext): ExprValue {
  const trimmed = expr.trim();

  // null / bool literals
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);

  // String literal (single or double quoted)
  if (/^"[^"]*"$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^'[^']*'$/.test(trimmed)) return trimmed.slice(1, -1);

  // and / or (binary, split on keyword not inside parens)
  for (const op of ["and", "or"]) {
    const idx = findTopLevelKeyword(trimmed, op);
    if (idx !== -1) {
      const left = evalExpr(trimmed.slice(0, idx), row);
      const right = evalExpr(trimmed.slice(idx + op.length), row);
      return op === "and"
        ? Boolean(left) && Boolean(right)
        : Boolean(left) || Boolean(right);
    }
  }

  // not (unary)
  if (/^not\s+/.test(trimmed)) {
    return !evalExpr(trimmed.replace(/^not\s+/, ""), row);
  }

  // Comparison operators (two-char first, then one-char)
  for (const op of ["==", "!=", ">=", "<=", ">", "<"]) {
    const idx = findTopLevelOperator(trimmed, op);
    if (idx !== -1) {
      const left = evalExpr(trimmed.slice(0, idx), row);
      const right = evalExpr(trimmed.slice(idx + op.length), row);
      switch (op) {
        case "==":
          return left == right; // intentional loose
        case "!=":
          return left != right;
        case ">=":
          return Number(left) >= Number(right);
        case "<=":
          return Number(left) <= Number(right);
        case ">":
          return Number(left) > Number(right);
        case "<":
          return Number(left) < Number(right);
      }
    }
  }

  // `in` operator: field in [v1, v2, ...]
  const inMatch = /^(.+?)\s+in\s+\[(.+)]$/.exec(trimmed);
  if (inMatch) {
    const fieldVal = evalExpr(inMatch[1].trim(), row);
    const items = inMatch[2].split(",").map((s) => evalExpr(s.trim(), row));
    return items.includes(fieldVal);
  }

  // Function call: name(arg1, arg2, ...)
  const fnMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)?\)$/.exec(trimmed);
  if (fnMatch) {
    const fn = ALLOWED_FUNCTIONS[fnMatch[1]];
    if (!fn) throw new Error(`Unknown function: ${fnMatch[1]}`);
    const args = splitArgs(fnMatch[2] || "").map((a) =>
      evalExpr(a.trim(), row),
    );
    return fn(...args);
  }

  // Parenthesised expression
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return evalExpr(trimmed.slice(1, -1), row);
  }

  // Field reference (dot-notation)
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(trimmed)) {
    return getByPath(row, trimmed) as ExprValue;
  }

  throw new Error(`Cannot evaluate expression segment: "${trimmed}"`);
}

function findTopLevelKeyword(expr: string, kw: string): number {
  let depth = 0;
  const kwRegex = new RegExp(`\\b${kw}\\b`);
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") depth--;
    else if (depth === 0) {
      const sub = expr.slice(i);
      const m = kwRegex.exec(sub);
      if (m && m.index === 0) return i;
    }
  }
  return -1;
}

function findTopLevelOperator(expr: string, op: string): number {
  let depth = 0;
  for (let i = 0; i < expr.length - op.length + 1; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") depth--;
    else if (depth === 0 && expr.slice(i, i + op.length) === op) return i;
  }
  return -1;
}

function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of argsStr) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// ─── Step executors ──────────────────────────────────────────────────────────

async function applyLookup(
  rows: any[],
  step: ILookupStep,
  sources: IPsrSource[],
  concurrency = 10,
): Promise<any[]> {
  const source = sources.find((s) => s.key === step.source);
  if (!source) throw new Error(`Lookup: source key "${step.source}" not found`);

  const uniqueKeys = [
    ...new Set(rows.map((r) => getByPath(r, step.matchLeft)).filter(Boolean)),
  ];
  const cache = new Map<unknown, any[]>();

  // Slice A: single-fetch with bounded concurrency
  // Slice B will add bulk-fetch path
  const batchSize = concurrency;
  for (let i = 0; i < uniqueKeys.length; i += batchSize) {
    const batch = uniqueKeys.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (key) => {
        if (cache.has(key)) return;
        try {
          const url = `${source.baseUrl.replace(/\/$/, "")}${source.path ? "/" + source.path.replace(/^\//, "") : ""}`;
          const headers = buildHeaders(source);
          const params: Record<string, unknown> = {};

          // Try to inject the key as a path param or query param
          const interpolatedUrl = url.includes(`:${step.matchRight}`)
            ? url.replace(
                `:${step.matchRight}`,
                encodeURIComponent(String(key)),
              )
            : url;

          if (interpolatedUrl === url) {
            params[step.matchRight] = key;
          }

          const resp = await psrHttpRequest(
            source.key,
            {
              method: source.method || "GET",
              url: interpolatedUrl,
              headers,
              params: Object.keys(params).length ? params : undefined,
              timeout: PAGE_TIMEOUT_MS,
            },
            source.rateLimit || {},
          );

          const extracted = source.responsePath
            ? getByPath(resp.data, source.responsePath)
            : resp.data;
          cache.set(
            key,
            Array.isArray(extracted) ? extracted : extracted ? [extracted] : [],
          );
        } catch {
          cache.set(key, []);
        }
      }),
    );
  }

  const result: any[] = [];
  for (const row of rows) {
    const leftVal = getByPath(row, step.matchLeft);
    const matched = cache.get(leftVal) || [];

    if (step.cardinality === "one") {
      const right = matched[0] || null;
      const merged: any = { ...row };
      if (right) {
        for (const field of step.pick) {
          setByPath(merged, field, getByPath(right, field));
        }
      }
      if (step.embedAs) merged[step.embedAs] = right ? [right] : [];
      result.push(merged);
    } else {
      // cardinality === "many"
      if (step.embedAs) {
        result.push({ ...row, [step.embedAs]: matched });
      } else {
        // Fan-out: one output row per matched right row
        if (matched.length === 0) {
          result.push({ ...row });
        } else {
          for (const right of matched) {
            const merged: any = { ...row };
            for (const field of step.pick) {
              setByPath(merged, field, getByPath(right, field));
            }
            result.push(merged);
          }
        }
      }
    }
  }
  return result;
}

function applyFilter(rows: any[], step: IFilterStep): any[] {
  return rows.filter((row) => {
    try {
      return Boolean(evalExpr(step.condition, row));
    } catch {
      return false;
    }
  });
}

function applyMap(rows: any[], step: IMapStep): any[] {
  return rows.map((row) => {
    const out = { ...row };
    for (const [outputField, expression] of Object.entries(step.set)) {
      try {
        setByPath(out, outputField, evalExpr(expression, row));
      } catch (e: any) {
        const policy = step.onError || "null";
        if (policy === "fail-run") throw e;
        if (policy === "null") setByPath(out, outputField, null);
        // "skip" — leave field absent
      }
    }
    return out;
  });
}

function applyRename(rows: any[], step: IRenameStep): any[] {
  return rows.map((row) => {
    const out: any = {};
    for (const [k, v] of Object.entries(row)) {
      const newKey = step.map[k] || k;
      out[newKey] = v;
    }
    return out;
  });
}

async function applyStep(
  rows: any[],
  step: IPsrStep,
  sources: IPsrSource[],
): Promise<{ rows: any[]; log: Omit<IStepLog, "stepIndex"> }> {
  const start = Date.now();
  const rowsIn = rows.length;
  let rowsOut = 0;
  let errors = 0;
  let errorSample: string | undefined;

  try {
    switch (step.op) {
      case "root":
        rowsOut = rowsIn;
        return {
          rows,
          log: {
            op: step.op,
            rowsIn,
            rowsOut,
            durationMs: Date.now() - start,
            errors: 0,
          },
        };
      case "lookup":
        rows = await applyLookup(rows, step as ILookupStep, sources);
        break;
      case "filter":
        rows = applyFilter(rows, step as IFilterStep);
        break;
      case "map":
        rows = applyMap(rows, step as IMapStep);
        break;
      case "rename":
        rows = applyRename(rows, step as IRenameStep);
        break;
    }
    rowsOut = rows.length;
  } catch (e: any) {
    errors++;
    errorSample = String(e?.message || e).slice(0, 200);
    rowsOut = rows.length;
  }

  return {
    rows,
    log: {
      op: step.op,
      rowsIn,
      rowsOut,
      durationMs: Date.now() - start,
      errors,
      errorSample,
    },
  };
}

function selectColumns(row: any, cfg: IPipelineConfig["output"]): any {
  if (!cfg.columns?.length) return row;
  const out: any = {};
  for (const col of cfg.columns) {
    const val = getByPath(row, col.field);
    setByPath(out, col.as || col.field, val);
  }
  return out;
}

// ─── Stable hash for change-detection (US-3.4) ───────────────────────────────

import { createHash } from "crypto";
function contentHash(obj: any): string {
  return createHash("sha256")
    .update(JSON.stringify(obj, Object.keys(obj).sort()))
    .digest("hex")
    .slice(0, 16);
}

// ─── Bulk upsert ─────────────────────────────────────────────────────────────

async function bulkUpsert(
  targetCollection: string,
  docs: any[],
  keyField: string,
  db: mongoose.Connection,
): Promise<{ upserted: number; skipped: number }> {
  if (!docs.length) return { upserted: 0, skipped: 0 };
  const col = db.collection(targetCollection);

  const ops: any[] = [];
  for (const doc of docs) {
    const hash = contentHash(doc);
    ops.push({
      updateOne: {
        filter: { [keyField]: doc[keyField] },
        update: {
          $set: {
            ...doc,
            "_source.hash": hash,
            "_source.syncedAt": new Date(),
          },
          $setOnInsert: { "_source.firstSyncedAt": new Date() },
        },
        upsert: true,
      },
    });
  }

  const result = await col.bulkWrite(ops, { ordered: false });
  return {
    upserted: (result.upsertedCount || 0) + (result.modifiedCount || 0),
    skipped:
      docs.length - (result.upsertedCount || 0) - (result.modifiedCount || 0),
  };
}

// ─── Index reconciliation ─────────────────────────────────────────────────────

async function ensureIndexes(
  targetCollection: string,
  searchIndexes: IPipelineConfig["output"]["searchIndexes"],
  db: mongoose.Connection,
): Promise<void> {
  if (!searchIndexes?.length) return;
  const col = db.collection(targetCollection);
  for (const si of searchIndexes) {
    try {
      if (si.type === "text") {
        await col.createIndex({ [si.field]: "text" }, { background: true });
      } else {
        await col.createIndex({ [si.field]: 1 }, { background: true });
      }
    } catch {
      // Index may already exist — safe to ignore
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RunOptions {
  mode: "full" | "incremental" | "dry-run";
  dryRunLimit?: number; // default 25
  triggeredBy?: "scheduler" | "manual" | "api";
  /** Called after each page completes — used by BullMQ worker for progress reporting */
  onPageComplete?: (pageNumber: number) => Promise<void>;
}

// ─── Watermark helpers (US-3.3) ───────────────────────────────────────────────

/** Read last successful watermark for this pipeline from the run log. */
async function getLastWatermark(
  pipelineId: string,
): Promise<string | undefined> {
  const last = await SyncRun.findOne({
    pipelineId,
    mode: { $in: ["incremental", "full"] },
    status: { $in: ["success", "partial"] },
    watermarkOut: { $exists: true, $ne: "" },
  })
    .sort({ startedAt: -1 })
    .select("watermarkOut")
    .lean();
  return (last as any)?.watermarkOut;
}

/** Inject a modified-since watermark into the source's pagination params. */
function injectWatermark(
  source: IPsrSource,
  watermark: string,
): Partial<IPsrSource> {
  const pg = source.pagination;
  if (!pg.modifiedSinceParam) return {}; // source doesn't support CDC
  return {
    pagination: {
      ...pg,
      // We pass the watermark via a custom field; paginateSource reads it below
      _watermarkValue: watermark,
    } as any,
  };
}

/**
 * Execute a pipeline config. Writes results to Mongo unless mode === "dry-run".
 * Returns the SyncRun document id.
 */
export async function runPipeline(
  pipelineId: string,
  options: RunOptions,
): Promise<string> {
  const cfg = await PipelineConfig.findById(pipelineId).lean();
  if (!cfg) throw new Error(`Pipeline not found: ${pipelineId}`);
  if (!cfg.isRunnable)
    throw new Error(
      "Pipeline is not yet runnable (missing root step or keyField).",
    );

  const db = mongoose.connection;
  const mode = options.mode;
  const dryRunLimit = options.dryRunLimit ?? 25;

  // Resolve watermark for incremental mode (US-3.3)
  const watermarkIn =
    mode === "incremental" ? await getLastWatermark(pipelineId) : undefined;

  // Create run record
  const run = await SyncRun.create({
    pipelineId: cfg._id,
    pipelineName: cfg.name,
    targetCollection: cfg.targetCollection,
    mode,
    status: "running",
    startedAt: new Date(),
    triggeredBy: options.triggeredBy || "manual",
    watermarkIn,
  });

  const counts: ISyncRunCounts = {
    read: 0,
    upserted: 0,
    skipped: 0,
    errors: 0,
  };
  const stepLogs: IStepLog[] = [];
  const dryRunDocs: any[] = [];
  let latestWatermark: string | undefined;
  let pageNumber = 0;

  try {
    const rootStep = cfg.steps.find((s: any) => s.op === "root") as any;
    if (!rootStep) throw new Error("Pipeline has no root step.");
    let rootSource = cfg.sources.find((s) => s.key === rootStep.source);
    if (!rootSource)
      throw new Error(`Root source "${rootStep.source}" not found.`);

    // Inject watermark for incremental runs (US-3.3)
    if (
      mode === "incremental" &&
      watermarkIn &&
      rootSource.pagination.modifiedSinceParam
    ) {
      rootSource = {
        ...rootSource,
        ...injectWatermark(rootSource, watermarkIn),
      };
    } else if (mode === "incremental" && rootSource.fullOnly) {
      throw new Error(
        `Source "${rootSource.key}" is marked fullOnly — cannot run incremental mode.`,
      );
    }

    // Determine page limit for dry-run
    const pageLimit =
      mode === "dry-run"
        ? Math.ceil(dryRunLimit / (rootSource.pagination.pageSize || 100)) + 1
        : undefined;

    for await (const page of paginateSource(rootSource, pageLimit)) {
      pageNumber++;
      counts.read += page.length;
      let rows = page;

      // Track watermark from the modifiedSinceField on root rows (US-3.3)
      if (rootSource.pagination.modifiedSinceField) {
        const field = rootSource.pagination.modifiedSinceField;
        for (const row of rows) {
          const val = String(getByPath(row, field) ?? "");
          if (val && (!latestWatermark || val > latestWatermark)) {
            latestWatermark = val;
          }
        }
      }

      // Apply each step in order (skip "root" — already paginated)
      for (let i = 0; i < cfg.steps.length; i++) {
        const step = cfg.steps[i] as IPsrStep;
        if (step.op === "root") continue;
        const { rows: nextRows, log } = await applyStep(
          rows,
          step,
          cfg.sources,
        );
        stepLogs.push({ stepIndex: i, ...log });
        counts.errors += log.errors;
        rows = nextRows;
      }

      const projected = rows.map((r) => selectColumns(r, cfg.output));

      if (mode === "dry-run") {
        dryRunDocs.push(...projected);
        if (dryRunDocs.length >= dryRunLimit) break;
      } else {
        const { upserted, skipped } = await bulkUpsert(
          cfg.targetCollection,
          projected,
          cfg.output.keyField,
          db,
        );
        counts.upserted += upserted;
        counts.skipped += skipped;
      }

      // Notify worker of page completion for BullMQ progress (US-3.5)
      if (options.onPageComplete) {
        await options.onPageComplete(pageNumber).catch(() => {});
      }
    }

    if (mode !== "dry-run") {
      await ensureIndexes(cfg.targetCollection, cfg.output.searchIndexes, db);
      await PipelineConfig.findByIdAndUpdate(pipelineId, {
        lastSyncedAt: new Date(),
        lastSyncedCount: counts.upserted,
      });
    }

    await SyncRun.findByIdAndUpdate(run._id, {
      status: counts.errors > 0 ? "partial" : "success",
      completedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
      counts,
      stepLogs,
      watermarkOut: latestWatermark,
      dryRunSample:
        mode === "dry-run" ? dryRunDocs.slice(0, dryRunLimit) : undefined,
    });

    return String(run._id);
  } catch (err: any) {
    await SyncRun.findByIdAndUpdate(run._id, {
      status: "failed",
      completedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
      counts,
      stepLogs,
      errorSummary: String(err?.message || err).slice(0, 500),
    });
    throw err;
  }
}
