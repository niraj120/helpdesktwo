import { API_CONFIG, getAuthHeaders } from "../config/constants";

// ---------------------------------------------------------------------------
// PSR Pipeline Service
// All API calls for the new PSR configurable pipeline system.
// Base: /api/psr
// ---------------------------------------------------------------------------

const BASE = `${API_CONFIG.API_URL}/psr`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PsrAuthType = "none" | "bearer" | "apikey" | "basic";
export type BulkLookupStyle = "query-csv" | "body-array" | "repeat-param";
export type PaginationType = "page" | "offset" | "cursor" | "none";
export type SearchIndexType = "text" | "plain";
export type StepOp = "root" | "lookup" | "filter" | "map" | "rename";

export interface PsrAuth {
  type: PsrAuthType;
  secretRef?: string; // "env:NAME" | "vault:path" — never a raw value
  headerName?: string;
  username?: string;
  extraHeaders?: Record<string, string>;
}

export interface PsrPagination {
  type: PaginationType;
  pageParam?: string;
  pageSizeParam?: string;
  pageSize?: number;
  offsetParam?: string;
  totalPath?: string;
  nextCursorPath?: string;
  cursorParam?: string;
  modifiedSinceParam?: string;
  modifiedSinceField?: string;
}

export interface BulkLookup {
  supported: boolean;
  param?: string;
  style?: BulkLookupStyle;
  maxIds?: number;
}

export interface PsrSource {
  key: string;
  name: string;
  method: "GET" | "POST";
  baseUrl: string;
  path?: string;
  requestBody?: string;
  auth: PsrAuth;
  pagination: PsrPagination;
  responsePath: string;
  primaryKey: string;
  bulkLookup: BulkLookup;
  discoveredColumns: string[];
  fullOnly?: boolean;
}

export interface RootStep {
  op: "root";
  source: string;
}
export interface LookupStep {
  op: "lookup";
  source: string;
  matchLeft: string;
  matchRight: string;
  pick: string[];
  embedAs?: string;
  cardinality: "one" | "many";
  keyPairs?: { leftKey: string; rightKey: string }[];
}
export interface FilterStep {
  op: "filter";
  condition: string;
}
export interface MapStep {
  op: "map";
  set: Record<string, string>;
  onError?: "skip" | "null" | "fail-run";
}
export interface RenameStep {
  op: "rename";
  map: Record<string, string>;
}

export type PsrStep = RootStep | LookupStep | FilterStep | MapStep | RenameStep;

export interface OutputColumn {
  field: string;
  as?: string;
}
export interface SearchIndex {
  field: string;
  type: SearchIndexType;
}

export interface PsrOutput {
  keyField: string;
  columns: OutputColumn[];
  searchIndexes: SearchIndex[];
}

export interface PsrSchedule {
  enabled: boolean;
  incrementalEveryMinutes?: number;
  fullCron?: string;
  mode: "incremental" | "full";
}

export interface Pipeline {
  _id: string;
  name: string;
  targetCollection: string;
  sources: PsrSource[];
  steps: PsrStep[];
  output: PsrOutput;
  schedule: PsrSchedule;
  enabled: boolean;
  isRunnable: boolean;
  lastSyncedAt?: string;
  lastSyncedCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StepLog {
  stepIndex: number;
  op: string;
  rowsIn: number;
  rowsOut: number;
  durationMs: number;
  errors: number;
  errorSample?: string;
}

export interface SyncRun {
  _id: string;
  pipelineId: string;
  pipelineName: string;
  targetCollection: string;
  mode: "incremental" | "full" | "dry-run";
  status: "pending" | "running" | "success" | "failed" | "partial";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  watermarkIn?: string;
  watermarkOut?: string;
  counts: { read: number; upserted: number; skipped: number; errors: number };
  stepLogs: StepLog[];
  errorSummary?: string;
  dryRunSample?: any[];
  triggeredBy: "scheduler" | "manual" | "api";
}

export interface TestSourceResult {
  success: boolean;
  httpStatus?: number;
  sample: unknown[];
  columns: string[];
  error?: string;
}

export interface SearchResult {
  results: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Generic fetch helper ────────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) },
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || `HTTP ${res.status}` };
    }
    return { success: true, data: json.data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

// ─── Pipeline CRUD ───────────────────────────────────────────────────────────

export const listPipelines = () => apiFetch<Pipeline[]>(`${BASE}/pipelines`);

export const getPipeline = (id: string) =>
  apiFetch<Pipeline>(`${BASE}/pipelines/${id}`);

export const createPipeline = (data: {
  name: string;
  targetCollection: string;
}) =>
  apiFetch<Pipeline>(`${BASE}/pipelines`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updatePipeline = (id: string, data: Partial<Pipeline>) =>
  apiFetch<Pipeline>(`${BASE}/pipelines/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deletePipeline = (id: string) =>
  apiFetch<{ deleted: boolean; id: string }>(`${BASE}/pipelines/${id}`, {
    method: "DELETE",
  });

export const clonePipeline = (
  id: string,
  data: { name: string; targetCollection: string },
) =>
  apiFetch<Pipeline>(`${BASE}/pipelines/${id}/clone`, {
    method: "POST",
    body: JSON.stringify(data),
  });

// ─── Source test & discover ──────────────────────────────────────────────────

export const testSource = (source: Partial<PsrSource>) =>
  apiFetch<TestSourceResult>(`${BASE}/sources/test`, {
    method: "POST",
    body: JSON.stringify({ source }),
  });

// ─── Dry run ─────────────────────────────────────────────────────────────────

export const dryRunPipeline = (id: string, limit = 25) =>
  apiFetch<SyncRun>(`${BASE}/pipelines/${id}/dry-run?limit=${limit}`, {
    method: "POST",
  });

// ─── Manual run ──────────────────────────────────────────────────────────────

export const triggerRun = (id: string, mode: "full" | "incremental" = "full") =>
  apiFetch<{ runId: string; status: string }>(
    `${BASE}/pipelines/${id}/run?mode=${mode}`,
    {
      method: "POST",
    },
  );

// ─── Run history ─────────────────────────────────────────────────────────────

export const listRuns = (pipelineId: string, limit = 20) =>
  apiFetch<SyncRun[]>(`${BASE}/pipelines/${pipelineId}/runs?limit=${limit}`);

export const getRun = (runId: string) =>
  apiFetch<SyncRun>(`${BASE}/runs/${runId}`);

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchPipeline = (
  pipelineId: string,
  q: string,
  opts: { limit?: number; offset?: number } = {},
) => {
  const params = new URLSearchParams({
    pipeline: pipelineId,
    q,
    limit: String(opts.limit ?? 25),
    offset: String(opts.offset ?? 0),
  });
  return apiFetch<SearchResult>(`${BASE}/search?${params}`);
};
