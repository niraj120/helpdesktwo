import { Response } from "express";
import mongoose from "mongoose";
import axios from "axios";
import { AuthRequest } from "../../middleware/auth";
import PsrMaster, { IPsrMaster } from "../../models/psr/PsrMaster";
import PsrTable from "../../models/psr/PsrTable";
import { testSource as runTestSource } from "../../services/psr/sourceTestService";
import { IPsrSource } from "../../models/psr/PipelineConfig";

// ---------------------------------------------------------------------------
// PSR Builder Controller
// Simple layer that powers the "Add Master / Build Table" two-tab UI.
// No pipeline / join / cardinality jargon exposed.
// ---------------------------------------------------------------------------

function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ success: true, data });
}
function fail(res: Response, message: string, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function masterToTestSource(m: IPsrMaster): Partial<IPsrSource> {
  const urlObj = (() => {
    try { const u = new URL(m.url); return { baseUrl: u.origin, path: u.pathname + u.search }; }
    catch { return { baseUrl: m.url, path: "" }; }
  })();
  return {
    key: "m",
    name: m.name,
    method: m.method,
    baseUrl: urlObj.baseUrl,
    path: urlObj.path,
    auth: {
      type: (m.auth.type === "apikey" ? "apikey" : m.auth.type) as any,
      secretRef: m.auth.secretRef,
      headerName: m.auth.headerName,
      username: m.auth.username,
      extraHeaders: m.headers || {},
    },
    pagination: { type: "none" },
    responsePath: m.responsePath || "",
    primaryKey: m.primaryKey || "id",
    bulkLookup: { supported: false },
    discoveredColumns: [],
  } as any;
}

function resolveSecret(ref?: string): string {
  if (!ref) return "";
  if (ref.startsWith("env:")) return process.env[ref.slice(4)] || "";
  return ref; // raw value for test-time
}

function buildAxiosHeaders(m: IPsrMaster): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", ...(m.headers || {}) };
  switch (m.auth.type) {
    case "bearer": h["Authorization"] = `Bearer ${resolveSecret(m.auth.secretRef)}`; break;
    case "apikey": h[m.auth.headerName || "X-API-Key"] = resolveSecret(m.auth.secretRef); break;
  }
  return h;
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce((acc: any, part) => acc?.[part], obj);
}

/**
 * Resolve a field path against an individual row.
 * When `responsePath` was empty and the API was auto-detected (e.g. Strapi),
 * users may have saved column paths like "data.attributes.name" but the actual
 * row is { id:1, attributes:{...} }. We strip the leading "data." so both
 * old (no responsePath) and new column paths work.
 */
function resolveField(row: any, path: string): unknown {
  // Try as-is first
  const direct = getByPath(row, path);
  if (direct !== undefined && direct !== null) return direct;
  // Strip leading "data." (columns discovered before auto-extract was added)
  if (path.startsWith("data.")) {
    return getByPath(row, path.slice(5));
  }
  return undefined;
}

/**
 * Smart row extractor: uses responsePath if set, otherwise auto-detects
 * common API wrapper patterns (Strapi data array, etc.).
 * Returns an array of individual records.
 */
function extractRows(responseData: any, responsePath?: string): any[] {
  if (responsePath) {
    const val = getByPath(responseData, responsePath);
    return Array.isArray(val) ? val : val ? [val] : [];
  }
  // Auto-detect: Strapi / common wrappers — { data: [...], meta: {...} }
  if (responseData && typeof responseData === "object" && Array.isArray(responseData.data)) {
    return responseData.data;
  }
  // { results: [...] }, { items: [...] }, { records: [...] }
  for (const key of ["results", "items", "records", "list", "rows"]) {
    if (Array.isArray(responseData?.[key])) return responseData[key];
  }
  // Direct array
  if (Array.isArray(responseData)) return responseData;
  // Single object — wrap
  return responseData ? [responseData] : [];
}

// Fetch up to `limit` rows from a master API (sample, single request).
// Auto-adds a large page size for Strapi-like APIs so preview fetches
// enough records for joins (Strapi default is only 25/page).
async function fetchSample(m: IPsrMaster, limit = 20): Promise<any[]> {
  try {
    // Auto page-size injection: if no pagination config and no responsePath
    // (likely Strapi / REST with default small page), request a large page.
    const params: Record<string, unknown> = {};
    if (!m.pagination?.pageParam && !m.responsePath) {
      params["pagination[pageSize]"] = Math.min(limit, 1000);
    } else if (!m.pagination?.pageParam && m.responsePath) {
      // Has responsePath but no pagination config — try generic large limit
      params["limit"] = Math.min(limit, 1000);
      params["pageSize"] = Math.min(limit, 1000);
    }

    const res = await axios({
      method: m.method,
      url: m.url,
      headers: buildAxiosHeaders(m),
      params: Object.keys(params).length ? params : undefined,
      timeout: 30_000,
      ...(m.auth.type === "basic" ? { auth: { username: m.auth.username || "", password: resolveSecret(m.auth.secretRef) } } : {}),
    });
    return extractRows(res.data, m.responsePath).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Fetch ALL rows from a master API, paginating if configured.
 * When no pagination config is set, auto-paginates Strapi APIs using
 * pagination[page] + pagination[pageSize] until the full dataset is loaded.
 * Used by background fill (full sync).
 */
async function fetchAll(m: IPsrMaster): Promise<any[]> {
  const pg = m.pagination;

  // If explicit pagination config is set, use it
  if (pg?.pageParam) {
    const allRows: any[] = [];
    const pageSize = pg.pageSize || 100;
    let page = 1;
    let total: number | null = null;
    while (true) {
      const params: Record<string, unknown> = {
        [pg.pageParam]: page,
        ...(pg.sizeParam ? { [pg.sizeParam]: pageSize } : {}),
      };
      try {
        const res = await axios({ method: m.method, url: m.url, headers: buildAxiosHeaders(m), params, timeout: 30_000, ...(m.auth.type === "basic" ? { auth: { username: m.auth.username || "", password: resolveSecret(m.auth.secretRef) } } : {}) });
        const rows = extractRows(res.data, m.responsePath);
        allRows.push(...rows);
        if (pg.totalPath && total === null) total = Number(getByPath(res.data, pg.totalPath) ?? 0) || null;
        if (rows.length < pageSize) break;
        if (total !== null && allRows.length >= total) break;
        if (allRows.length >= 50_000) break;
        page++;
      } catch { break; }
    }
    return allRows;
  }

  // No pagination config — auto-paginate using Strapi convention
  // pagination[page] + pagination[pageSize] + meta.pagination.total/pageCount
  const pageSize = 1000;         // request 1000 per page (Strapi may cap lower, but we use meta.pageCount to loop)
  const allRows: any[] = [];
  let page = 1;
  while (true) {
    try {
      const res = await axios({
        method: m.method,
        url: m.url,
        headers: buildAxiosHeaders(m),
        params: { "pagination[page]": page, "pagination[pageSize]": pageSize },
        timeout: 30_000,
        ...(m.auth.type === "basic" ? { auth: { username: m.auth.username || "", password: resolveSecret(m.auth.secretRef) } } : {}),
      });
      const rows = extractRows(res.data, m.responsePath);
      allRows.push(...rows);

      if (rows.length === 0) break;                    // empty page → done

      // Strapi always returns meta.pagination — use it to decide if there are more pages
      const metaPg = (res.data?.meta?.pagination) as { total?: number; pageCount?: number } | undefined;
      const total     = metaPg?.total     ? Number(metaPg.total)     : 0;
      const pageCount = metaPg?.pageCount ? Number(metaPg.pageCount) : 0;

      if (total > 0 && allRows.length >= total) break;   // fetched everything
      if (pageCount > 0 && page >= pageCount) break;     // no more pages

      // Fallback: if API honoured our pageSize and returned less than requested → last page
      if (rows.length < pageSize && !metaPg) break;

      if (allRows.length >= 500_000) break;              // hard safety cap
      page++;
    } catch {
      // If Strapi pagination params aren't supported, fall back to single fetch
      if (allRows.length === 0) return fetchSample(m, 10_000);
      break;
    }
  }
  return allRows;
}

// ─── Masters CRUD ─────────────────────────────────────────────────────────────

export async function listMasters(req: AuthRequest, res: Response): Promise<void> {
  try {
    const masters = await PsrMaster.find().sort({ createdAt: -1 }).lean();
    // Strip raw secrets from response
    const safe = masters.map((m: any) => ({ ...m, auth: { ...m.auth, secretRef: m.auth?.secretRef?.startsWith("env:") ? m.auth.secretRef : m.auth?.secretRef ? "••••••" : undefined } }));
    ok(res, safe);
  } catch (e: any) { fail(res, e.message, 500); }
}

export async function getMaster(req: AuthRequest, res: Response): Promise<void> {
  try {
    const m = await PsrMaster.findById(req.params.id).lean();
    if (!m) { fail(res, "Master not found", 404); return; }
    const safe: any = { ...m, auth: { ...(m as any).auth, secretRef: (m as any).auth?.secretRef?.startsWith("env:") ? (m as any).auth.secretRef : (m as any).auth?.secretRef ? "••••••" : undefined } };
    ok(res, safe);
  } catch (e: any) { fail(res, e.message, 500); }
}

export async function createMaster(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, url, method, auth, headers, responsePath, primaryKey } = req.body;
    if (!name?.trim()) { fail(res, "Master name is required"); return; }
    if (!url?.trim()) { fail(res, "API URL is required"); return; }
    const existing = await PsrMaster.findOne({ name: name.trim() });
    if (existing) { fail(res, `A master named "${name.trim()}" already exists`); return; }
    const master = await PsrMaster.create({ name: name.trim(), url: url.trim(), method: method || "GET", auth: auth || { type: "none" }, headers: headers || {}, responsePath, primaryKey });
    ok(res, master, 201);
  } catch (e: any) { fail(res, e.message, 500); }
}

export async function updateMaster(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, url, method, auth, headers, responsePath, primaryKey, discoveredColumns } = req.body;
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (url !== undefined) update.url = url;
    if (method !== undefined) update.method = method;
    if (auth !== undefined) update.auth = auth;
    if (headers !== undefined) update.headers = headers;
    if (responsePath !== undefined) update.responsePath = responsePath;
    if (primaryKey !== undefined) update.primaryKey = primaryKey;
    if (discoveredColumns !== undefined) update.discoveredColumns = discoveredColumns;
    const m = await PsrMaster.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!m) { fail(res, "Master not found", 404); return; }
    ok(res, m);
  } catch (e: any) { fail(res, e.message, 500); }
}

export async function deleteMaster(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    // Check if used in any table
    const used = await PsrTable.findOne({ masterIds: new mongoose.Types.ObjectId(id) });
    if (used) { fail(res, `This master is used in table "${used.name}". Remove it from the table first.`); return; }
    await PsrMaster.findByIdAndDelete(id);
    ok(res, { deleted: true });
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Test master (US-3) ───────────────────────────────────────────────────────

export async function testMaster(req: AuthRequest, res: Response): Promise<void> {
  try {
    const source = req.body?.master ?? req.body;
    if (!source?.url) { fail(res, "url is required"); return; }
    // Build a compatible source shape for the existing test service
    const sourceShape = masterToTestSource(source as any);
    const result = await runTestSource(sourceShape as any);
    ok(res, result, 200);
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Load keys (Tab 2 — US-5) ─────────────────────────────────────────────────

export async function loadKeys(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { masterIds } = req.body;
    if (!Array.isArray(masterIds) || masterIds.length === 0) { fail(res, "masterIds array is required"); return; }

    const results: Record<string, { columns: string[]; error?: string }> = {};
    await Promise.all(
      masterIds.map(async (id: string) => {
        try {
          const m = await PsrMaster.findById(id);
          if (!m) { results[id] = { columns: [], error: "Master not found" }; return; }
          const sourceShape = masterToTestSource(m);
          const testResult = await runTestSource(sourceShape as any);
          if (testResult.success && testResult.columns.length) {
            // Save discovered columns back to the master
            await PsrMaster.findByIdAndUpdate(id, { discoveredColumns: testResult.columns });
            results[id] = { columns: testResult.columns };
          } else {
            results[id] = { columns: m.discoveredColumns || [], error: testResult.error || "No columns found" };
          }
        } catch (e: any) {
          results[id] = { columns: [], error: e.message };
        }
      })
    );
    ok(res, results);
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Preview (Tab 2 — US-7) ───────────────────────────────────────────────────

export async function previewTable(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { masterIds, links, columns } = req.body;
    if (!Array.isArray(masterIds) || masterIds.length === 0) { fail(res, "masterIds required"); return; }
    if (!Array.isArray(columns) || columns.length === 0) { ok(res, { rows: [], headers: [] }); return; }

    const masters = await PsrMaster.find({ _id: { $in: masterIds } });
    const masterMap = new Map(masters.map((m) => [String(m._id), m]));

    // Fetch sample rows from each master
    const sampleMap = new Map<string, any[]>();
    await Promise.all(
      masterIds.map(async (id: string) => {
        const m = masterMap.get(id);
        sampleMap.set(id, m ? await fetchSample(m, 25) : []);
      })
    );

    // Build joined rows
    const rootId = masterIds[0];
    let rows: Array<Record<string, any>> = (sampleMap.get(rootId) || []).map((r) => ({ [`__${rootId}`]: r }));

    for (const link of (links || [])) {
      const { leftMasterId: lid, leftColumn: lc, rightMasterId: rid, rightColumn: rc } = link;
      const rightRows = sampleMap.get(rid) || [];
      // Build index on right side
      const rightIndex = new Map<string, any[]>();
      for (const rr of rightRows) {
        const key = String(resolveField(rr, rc) ?? "");
        if (key) { rightIndex.set(key, [...(rightIndex.get(key) || []), rr]); }
      }
      const next: Array<Record<string, any>> = [];
      for (const row of rows) {
        const leftRecord = row[`__${lid}`];
        const leftVal = String(resolveField(leftRecord, lc) ?? "");
        const matched = rightIndex.get(leftVal) || [];
        if (matched.length === 0) {
          next.push({ ...row, [`__${rid}`]: null });
        } else {
          for (const rm of matched) {
            next.push({ ...row, [`__${rid}`]: rm });
          }
        }
      }
      rows = next;
    }

    // Project selected columns
    const headers = columns.map((c: any) => c.as);
    const projected = rows.slice(0, 10).map((row) => {
      const out: Record<string, any> = {};
      for (const col of columns) {
        const masterRecord = row[`__${col.masterId}`];
        out[col.as] = masterRecord ? getByPath(masterRecord, col.field) : null;
      }
      return out;
    });

    ok(res, { rows: projected, headers });
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Tables CRUD (US-8) ───────────────────────────────────────────────────────

export async function listTables(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tables = await PsrTable.find().sort({ createdAt: -1 }).populate("masterIds", "name").lean();
    ok(res, tables);
  } catch (e: any) { fail(res, e.message, 500); }
}

export async function saveTable(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, masterIds, links, columns, keyColumn, id, syncSchedule } = req.body;
    if (!name?.trim()) { fail(res, "Table name is required"); return; }
    if (!masterIds?.length) { fail(res, "Select at least one master"); return; }
    if (!columns?.length) { fail(res, "Tick at least one column"); return; }

    const col = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
    const targetCollection = `psr_tbl_${col}`;

    const data = {
      name: name.trim(),
      masterIds: masterIds.map((i: string) => new mongoose.Types.ObjectId(i)),
      links: links || [],
      columns: columns || [],
      keyColumn,
      targetCollection,
      status: "empty" as const,
      syncSchedule: syncSchedule ?? { enabled: false, intervalMinutes: 0 },
    };

    let table;
    if (id) {
      table = await PsrTable.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    } else {
      table = await PsrTable.create(data);
    }
    if (!table) { fail(res, "Table not found", 404); return; }

    // Kick off background fill (fire-and-forget)
    triggerTableRefreshInternal(String(table._id)).catch(() => {});

    ok(res, table, id ? 200 : 201);
  } catch (e: any) { fail(res, e.message, 500); }
}

export async function deleteTable(req: AuthRequest, res: Response): Promise<void> {
  try {
    await PsrTable.findByIdAndDelete(req.params.id);
    ok(res, { deleted: true });
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Refresh table (US-9) ─────────────────────────────────────────────────────

export async function refreshTable(req: AuthRequest, res: Response): Promise<void> {
  try {
    const table = await PsrTable.findById(req.params.id);
    if (!table) { fail(res, "Table not found", 404); return; }
    // ?full=1 forces a full re-sync (resets watermark)
    const forceFull = req.query.full === "1" || req.query.full === "true";
    if (forceFull) {
      await PsrTable.findByIdAndUpdate(req.params.id, { syncMode: "full", lastSyncWatermark: undefined });
    }
    // Kick off async fill
    triggerTableRefreshInternal(req.params.id).catch(() => {});
    await PsrTable.findByIdAndUpdate(req.params.id, { status: "refreshing" });
    ok(res, { status: "refreshing", mode: forceFull ? "full" : table.syncMode }, 202);
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Background fill (internal) ──────────────────────────────────────────────

export async function triggerTableRefreshInternalExport(tableId: string): Promise<void> {
  return triggerTableRefreshInternal(tableId);
}

async function triggerTableRefreshInternal(tableId: string): Promise<void> {
  const db = mongoose.connection;
  try {
    const table = await PsrTable.findById(tableId);
    if (!table) return;

    const isIncremental = table.syncMode === "incremental" && !!table.lastSyncWatermark;
    const watermark = table.lastSyncWatermark;
    const mode = isIncremental ? "incremental" : "full";

    await PsrTable.findByIdAndUpdate(tableId, { status: "refreshing" });

    const masters = await PsrMaster.find({ _id: { $in: table.masterIds } });
    const masterMap = new Map(masters.map((m) => [String(m._id), m]));
    const rootId = String(table.masterIds[0]);
    const rootMaster = masterMap.get(rootId);
    if (!rootMaster) throw new Error("Root master not found");

    console.log(`[PSR Sync] Table "${table.name}" — mode: ${mode}${isIncremental ? ` (since ${watermark?.toISOString()})` : ""}`);

    // ── Fetch root master rows ────────────────────────────────────────────────
    let rootRows: any[];
    if (isIncremental && watermark) {
      // Incremental: only records updated since the last watermark
      rootRows = await fetchIncrementalRows(rootMaster, watermark);
      console.log(`[PSR Sync] Root "${rootMaster.name}" — ${rootRows.length} changed rows since last sync`);
    } else {
      // Full sync: fetch everything
      rootRows = await fetchAll(rootMaster);
      console.log(`[PSR Sync] Root "${rootMaster.name}" — ${rootRows.length} rows (full)`);
    }

    // ── Build lookup index for secondary masters (always full) ────────────────
    const secondaryDataMap = new Map<string, any[]>();
    for (const link of table.links) {
      const rid = link.rightMasterId;
      if (!secondaryDataMap.has(rid)) {
        const m = masterMap.get(rid);
        if (m) {
          const rows = await fetchAll(m);
          secondaryDataMap.set(rid, rows);
          console.log(`[PSR Sync] Secondary "${m.name}" — ${rows.length} rows`);
        }
      }
    }

    // ── Join root rows with secondary masters ─────────────────────────────────
    let rows: Array<Record<string, any>> = rootRows.map((r) => ({ [`__${rootId}`]: r }));

    for (const link of table.links) {
      const { leftMasterId: lid, leftColumn: lc, rightMasterId: rid, rightColumn: rc } = link;
      const rightRows = secondaryDataMap.get(rid) || [];
      const rightIndex = new Map<string, any[]>();
      for (const rr of rightRows) {
        const key = String(resolveField(rr, rc) ?? "");
        if (key && key !== "undefined") rightIndex.set(key, [...(rightIndex.get(key) || []), rr]);
      }
      const next: Array<Record<string, any>> = [];
      for (const row of rows) {
        const leftRecord = row[`__${lid}`];
        const leftVal = String(resolveField(leftRecord, lc) ?? "");
        const matched = rightIndex.get(leftVal);
        if (!matched?.length) next.push({ ...row, [`__${rid}`]: null });
        else for (const rm of matched) next.push({ ...row, [`__${rid}`]: rm });
      }
      rows = next;
    }
    console.log(`[PSR Sync] After joins: ${rows.length} combined rows`);

    // ── Project and write to MongoDB ──────────────────────────────────────────
    const col = db.collection(table.targetCollection);
    const keyCol = table.keyColumn;

    if (!isIncremental) {
      // Full sync: drop and rebuild
      await col.deleteMany({}).catch(() => {});
    }

    // Track new watermark = max updatedAt from root rows
    let newWatermark: Date | undefined;
    for (const r of rootRows) {
      const ts = r.attributes?.updatedAt || r.updatedAt || r.updated_at;
      if (ts) {
        const d = new Date(ts);
        if (!newWatermark || d > newWatermark) newWatermark = d;
      }
    }

    // Build upsert ops (always upsert — works for both full and incremental)
    const ops: any[] = [];
    for (const row of rows) {
      const doc: Record<string, any> = {};
      for (const c of table.columns) {
        const rec = row[`__${c.masterId}`];
        doc[c.as] = rec ? resolveField(rec, c.field) : null;
      }
      // Always store the root record's id as _key for upsert
      const rootRecord = row[`__${rootId}`];
      const keyVal = keyCol
        ? (doc[keyCol] ?? resolveField(rootRecord, keyCol))
        : rootRecord?.id ?? rootRecord?.attributes?.id;

      if (keyVal !== undefined && keyVal !== null) {
        ops.push({
          updateOne: {
            filter: { _key: String(keyVal) },
            update: { $set: { ...doc, _key: String(keyVal), _syncedAt: new Date() } },
            upsert: true,
          },
        });
      } else {
        ops.push({ insertOne: { document: { ...doc, _syncedAt: new Date() } } });
      }
    }

    if (ops.length > 0) {
      const BATCH = 1000;
      for (let i = 0; i < ops.length; i += BATCH) {
        await col.bulkWrite(ops.slice(i, i + BATCH), { ordered: false }).catch(() => {});
      }
    }

    // Ensure search indexes
    for (const c of table.columns.filter((c) => c.searchable)) {
      await col.createIndex({ [c.as]: 1 }, { background: true }).catch(() => {});
    }
    // Always index _key for fast upsert lookups
    await col.createIndex({ _key: 1 }, { unique: false, background: true }).catch(() => {});

    const finalCount = await col.countDocuments().catch(() => ops.length);

    await PsrTable.findByIdAndUpdate(tableId, {
      status: "idle",
      syncMode: "incremental",       // Switch to incremental after first successful full sync
      lastSyncWatermark: newWatermark ?? new Date(),
      lastRefreshedAt: new Date(),
      rowCount: finalCount,
      errorMessage: undefined,
    });

    console.log(`[PSR Sync] ✅ Done — ${finalCount} total rows in MongoDB collection "${table.targetCollection}"`);
  } catch (err: any) {
    await PsrTable.findByIdAndUpdate(tableId, {
      status: "error",
      errorMessage: String(err?.message || err).slice(0, 300),
    }).catch(() => {});
    console.error(`[PSR Sync] ❌ Error:`, (err as Error).message);
  }
}

/**
 * Fetch only records that changed since `since` date.
 * Uses Strapi `filters[updatedAt][$gt]` convention.
 */
async function fetchIncrementalRows(m: IPsrMaster, since: Date): Promise<any[]> {
  const sinceStr = since.toISOString();
  const allRows: any[] = [];
  const pageSize = 1000;
  let page = 1;

  while (true) {
    try {
      const res = await axios({
        method: m.method,
        url: m.url,
        headers: buildAxiosHeaders(m),
        params: {
          "pagination[page]": page,
          "pagination[pageSize]": pageSize,
          "filters[updatedAt][$gt]": sinceStr,
          "sort": "updatedAt:asc",
        },
        timeout: 30_000,
        ...(m.auth.type === "basic" ? { auth: { username: m.auth.username || "", password: resolveSecret(m.auth.secretRef) } } : {}),
      });
      const rows = extractRows(res.data, m.responsePath);
      allRows.push(...rows);
      const total = Number(getByPath(res.data, "meta.pagination.total") ?? 0);
      if (rows.length < pageSize || (total > 0 && allRows.length >= total)) break;
      if (allRows.length >= 100_000) break;
      page++;
    } catch {
      // Incremental filter not supported — fall back to full
      if (allRows.length === 0) return fetchAll(m);
      break;
    }
  }
  return allRows;
}

// ─── Run Preview (diagnostic — top 20 rows, fast) ────────────────────────────

export async function runPreviewTable(req: AuthRequest, res: Response): Promise<void> {
  try {
    const table = await PsrTable.findById(req.params.id);
    if (!table) { fail(res, "Table not found", 404); return; }

    const masters = await PsrMaster.find({ _id: { $in: table.masterIds } });
    const masterMap = new Map(masters.map((m) => [String(m._id), m]));

    const rootId = String(table.masterIds[0]);
    const rootMaster = masterMap.get(rootId);
    if (!rootMaster) { fail(res, "Root master not found", 404); return; }

    const diagnostics: Record<string, any> = {};

    // Fetch 20 root rows only (fast)
    const rootRows = await fetchSample(rootMaster, 20);
    diagnostics[rootMaster.name] = {
      fetched: rootRows.length,
      sampleKeys: rootRows.length > 0 ? Object.keys(rootRows[0]).slice(0, 10) : [],
      sampleFirstRow: rootRows[0],
    };

    if (rootRows.length === 0) {
      ok(res, { rows: [], diagnostics, warning: `Root master "${rootMaster.name}" returned 0 rows — check URL, auth, and responsePath.` });
      return;
    }

    // Build row set from root
    let rows: Array<Record<string, any>> = rootRows.map((r) => ({ [`__${rootId}`]: r }));

    // For each link, fetch secondary master and join
    for (const link of table.links) {
      const { leftMasterId: lid, leftColumn: lc, rightMasterId: rid, rightColumn: rc } = link;
      const rightMaster = masterMap.get(rid);
      if (!rightMaster) continue;

      // Fetch all from secondary (needed for lookup)
      // For preview, use fetchAll to get the complete dataset for accurate joins
      const rightRows = await fetchAll(rightMaster);
      diagnostics[rightMaster.name] = {
        fetched: rightRows.length,
        sampleKeys: rightRows.length > 0 ? Object.keys(rightRows[0]).slice(0, 10) : [],
        joinColumn: rc,
        sampleJoinValues: rightRows.slice(0, 5).map((r) => resolveField(r, rc)),
      };

      // Sample left values
      const leftSampleVals = rows.slice(0, 5).map((row) => {
        const leftRecord = row[`__${lid}`];
        return resolveField(leftRecord, lc);
      });
      diagnostics[`link: ${masterMap.get(lid)?.name ?? lid} → ${rightMaster.name}`] = {
        leftColumn: lc,
        rightColumn: rc,
        sampleLeftValues: leftSampleVals,
      };

      const rightIndex = new Map<string, any[]>();
      for (const rr of rightRows) {
        const key = String(resolveField(rr, rc) ?? "");
        if (key && key !== "undefined" && key !== "null") {
          rightIndex.set(key, [...(rightIndex.get(key) || []), rr]);
        }
      }

      let matchCount = 0;
      const next: Array<Record<string, any>> = [];
      for (const row of rows) {
        const leftRecord = row[`__${lid}`];
        const leftVal = String(resolveField(leftRecord, lc) ?? "");
        const matched = rightIndex.get(leftVal);
        if (!matched?.length) {
          next.push({ ...row, [`__${rid}`]: null });
        } else {
          matchCount++;
          for (const rm of matched.slice(0, 3)) { // max 3 children per parent
            next.push({ ...row, [`__${rid}`]: rm });
          }
        }
      }
      diagnostics[`link: ${masterMap.get(lid)?.name ?? lid} → ${rightMaster.name}`].matchCount = matchCount;
      diagnostics[`link: ${masterMap.get(lid)?.name ?? lid} → ${rightMaster.name}`].rightIndexSize = rightIndex.size;
      rows = next;
    }

    // Project columns
    const projected = rows.slice(0, 20).map((row) => {
      const out: Record<string, any> = {};
      for (const c of table.columns) {
        const rec = row[`__${c.masterId}`];
        out[c.as] = rec ? resolveField(rec, c.field) : null;
      }
      return out;
    });

    ok(res, {
      rows: projected,
      headers: table.columns.map((c) => c.as),
      totalJoinedRows: rows.length,
      diagnostics,
    });
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Get single table (for edit) ─────────────────────────────────────────────

export async function getTable(req: AuthRequest, res: Response): Promise<void> {
  try {
    const table = await PsrTable.findById(req.params.id).populate("masterIds", "name").lean();
    if (!table) { fail(res, "Table not found", 404); return; }
    ok(res, table);
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Update schedule ──────────────────────────────────────────────────────────

export async function updateSchedule(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { enabled, intervalMinutes } = req.body;
    const table = await PsrTable.findByIdAndUpdate(
      req.params.id,
      { syncSchedule: { enabled: !!enabled, intervalMinutes: Number(intervalMinutes) || 0 } },
      { new: true },
    );
    if (!table) { fail(res, "Table not found", 404); return; }
    ok(res, table);
  } catch (e: any) { fail(res, e.message, 500); }
}

// ─── Agent search (US-10) ─────────────────────────────────────────────────────

export async function searchTable(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { tableId, q } = req.query;
    const limit = Math.min(Number(req.query.limit ?? 25), 500); // 500 allows full parent+children in one call
    if (!tableId) { fail(res, "tableId is required"); return; }

    const table = await PsrTable.findById(tableId).lean();
    if (!table) { fail(res, "Table not found", 404); return; }

    const db = mongoose.connection;
    const col = db.collection(table.targetCollection);
    const query = typeof q === "string" ? q.trim() : "";
    const searchFields = table.columns.filter((c) => c.searchable).map((c) => c.as);

    let mongoQuery: Record<string, unknown> = {};
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (searchFields.length) {
        // Pass the RegExp object directly — avoids driver-version quirks with {$regex:re}
        const re = new RegExp(escaped, "i");
        mongoQuery = { $or: searchFields.map((f) => ({ [f]: re })) };
      } else {
        // No searchable columns configured — do a full-collection scan across every
        // string-valued field so the form still works before columns are tuned.
        const sample = await col.findOne({});
        if (sample) {
          const re = new RegExp(escaped, "i");
          const allKeys = Object.keys(sample).filter(k => k !== "_id" && k !== "_key" && k !== "_syncedAt");
          if (allKeys.length) mongoQuery = { $or: allKeys.map(k => ({ [k]: re })) };
        }
      }
    }

    const [results, total, collectionTotal] = await Promise.all([
      col.find(mongoQuery, { projection: { _id: 0, _key: 0 } }).limit(limit).toArray(),
      col.countDocuments(mongoQuery),
      col.countDocuments({}),  // total docs regardless of filter — tells frontend if table is empty
    ]);

    ok(res, { results, total, searchFields, collectionTotal });
  } catch (e: any) { fail(res, e.message, 500); }
}
