import { API_CONFIG, getAuthHeaders } from "../config/constants";

const BASE = `${API_CONFIG.API_URL}/psr-builder`;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Master {
  _id: string;
  name: string;
  url: string;
  method: "GET" | "POST";
  auth: { type: string; secretRef?: string; headerName?: string; username?: string };
  headers: Record<string, string>;
  responsePath?: string;
  primaryKey?: string;
  discoveredColumns: string[];
  lastTestedAt?: string;
  lastTestOk?: boolean;
}

export interface TableLink {
  leftMasterId: string;
  leftColumn: string;
  rightMasterId: string;
  rightColumn: string;
}

export interface TableColumn {
  masterId: string;
  field: string;
  as: string;
  searchable: boolean;
}

export interface PsrTable {
  _id: string;
  name: string;
  masterIds: Array<string | Master>;
  links: TableLink[];
  columns: TableColumn[];
  keyColumn?: string;
  targetCollection: string;
  status: "idle" | "refreshing" | "error" | "empty";
  syncSchedule: { enabled: boolean; intervalMinutes: number };
  syncMode: "full" | "incremental";
  lastSyncWatermark?: string;
  lastRefreshedAt?: string;
  rowCount?: number;
  errorMessage?: string;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

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
    if (!json.success) return { success: false, error: json.error || `HTTP ${res.status}` };
    return { success: true, data: json.data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

// ─── Masters ─────────────────────────────────────────────────────────────────

export const listMasters = () => apiFetch<Master[]>(`${BASE}/masters`);

export const createMaster = (data: Partial<Master>) =>
  apiFetch<Master>(`${BASE}/masters`, { method: "POST", body: JSON.stringify(data) });

export const updateMaster = (id: string, data: Partial<Master>) =>
  apiFetch<Master>(`${BASE}/masters/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteMaster = (id: string) =>
  apiFetch<{ deleted: boolean }>(`${BASE}/masters/${id}`, { method: "DELETE" });

export const testMaster = (master: Partial<Master>) =>
  apiFetch<{ success: boolean; httpStatus?: number; sample: unknown[]; columns: string[]; error?: string }>(
    `${BASE}/masters/test`,
    { method: "POST", body: JSON.stringify({ master }) },
  );

export const loadKeys = (masterIds: string[]) =>
  apiFetch<Record<string, { columns: string[]; error?: string }>>(
    `${BASE}/masters/load-keys`,
    { method: "POST", body: JSON.stringify({ masterIds }) },
  );

// ─── Tables ──────────────────────────────────────────────────────────────────

export const listTables = () => apiFetch<PsrTable[]>(`${BASE}/tables`);

export const getTable = (id: string) => apiFetch<PsrTable>(`${BASE}/tables/${id}`);

export const saveTable = (data: {
  id?: string;
  name: string;
  masterIds: string[];
  links: TableLink[];
  columns: TableColumn[];
  keyColumn?: string;
  syncSchedule?: { enabled: boolean; intervalMinutes: number };
}) =>
  apiFetch<PsrTable>(`${BASE}/tables`, { method: "POST", body: JSON.stringify(data) });

export const deleteTable = (id: string) =>
  apiFetch<{ deleted: boolean }>(`${BASE}/tables/${id}`, { method: "DELETE" });

export const previewTable = (data: {
  masterIds: string[];
  links: TableLink[];
  columns: TableColumn[];
}) =>
  apiFetch<{ rows: Record<string, unknown>[]; headers: string[] }>(
    `${BASE}/tables/preview`,
    { method: "POST", body: JSON.stringify(data) },
  );

export const refreshTable = (id: string, full = false) =>
  apiFetch<{ status: string; mode?: string }>(`${BASE}/tables/${id}/refresh${full ? "?full=1" : ""}`, { method: "POST" });

export const runTablePreview = (id: string) =>
  apiFetch<{
    rows: Record<string, unknown>[];
    headers: string[];
    totalJoinedRows: number;
    diagnostics: Record<string, any>;
    warning?: string;
  }>(`${BASE}/tables/${id}/run-preview`);

export const updateTableSchedule = (id: string, schedule: { enabled: boolean; intervalMinutes: number }) =>
  apiFetch<PsrTable>(`${BASE}/tables/${id}/schedule`, { method: "PUT", body: JSON.stringify(schedule) });

// ─── Agent search ─────────────────────────────────────────────────────────────

export const searchPsrTable = (tableId: string, q: string, limit = 25) => {
  const params = new URLSearchParams({ tableId, q, limit: String(limit) });
  return apiFetch<{ results: Record<string, unknown>[]; total: number; searchFields: string[]; collectionTotal?: number }>(
    `${BASE}/search?${params}`,
  );
};
