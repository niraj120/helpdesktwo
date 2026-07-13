import { API_CONFIG, getAuthHeaders } from "../config/constants";

/**
 * MDMDataType is now a free-text string — no hardcoded domain names.
 * Legacy values: "schools" | "employees" | "principals" | "students" | "parents" | "children" | "custom"
 */
export type MDMDataType = string;

export type MDMAuthType = "none" | "apiKey" | "bearer" | "basic";

export interface MDMApi {
  label: string;
  dataType: MDMDataType;
  method: "GET" | "POST";
  baseUrl: string;
  path: string;
  requestBody?: string;
  isDefaultForType: boolean;
  projectIds: string[]; // Projects this endpoint serves. Empty = all projects.
}

export interface MDMDatasetPagination {
  type: "page" | "offset" | "cursor" | "none";
  pageParam: string;
  limitParam: string;
  pageSize: number;
  nextCursorPath?: string;
  cursorParam?: string;
}

export interface MDMCacheDatasetConfig {
  key: string;
  label: string;
  sourceId?: string;
  apiIndex: number;
  enabled: boolean;
  uniqueKeyField: string;
  displayField?: string;
  searchFields: string[];
  storedFields: string[];
  /** Dot-notation path to the records array in the API response. E.g. "data.results" */
  responsePath?: string;
  /** Pagination config for APIs that paginate */
  pagination?: MDMDatasetPagination;
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
}


export interface MDMCacheJoinConfig {
  key: string;
  label: string;
  enabled: boolean;
  outputType: "parent_with_children" | "flat_join";
  parentDatasetKey: string;
  mappingDatasetKey: string;
  studentDatasetKey: string;
  parentKeyField: string;
  mappingParentKeyField: string;
  mappingStudentKeyField: string;
  studentKeyField: string;
  parentStoredFields: string[];
  childStoredFields: string[];
  datasets?: Array<{ datasetKey: string; label: string }>;
  joinSteps?: Array<{
    leftDatasetKey: string;
    rightDatasetKey: string;
    leftKey: string;
    rightKey: string;
    keyPairs?: Array<{ leftKey: string; rightKey: string }>;
  }>;
  outputFields?: string[];
  searchFields?: string[];
  valueField?: string;
}

export interface MDMCacheConfig {
  enabled: boolean;
  datasets: MDMCacheDatasetConfig[];
  joins: MDMCacheJoinConfig[];
}

export interface MDMAuthMasked {
  type: MDMAuthType;
  username: string;
  headerName: string;
  extraHeaders: Record<string, string>;
  hasApiKey: boolean;
  hasToken: boolean;
  hasPassword: boolean;
  // Write-only fields (sent to server, never returned)
  apiKey?: string;
  token?: string;
  password?: string;
}

export interface MDMUserSyncConfig {
  enabled: boolean;
  cron: string;
  statusField?: string;
  activeValues?: string[];
  updateProfile?: boolean;
}

export interface MDMSource {
  _id: string;
  name: string;
  description?: string;
  enabled: boolean;
  apis: MDMApi[];
  auth: MDMAuthMasked;
  cache?: MDMCacheConfig;
  userSync?: MDMUserSyncConfig;
  connectionStatus: "connected" | "error" | "untested";
  lastConnectionTest?: string;
  lastConnectionError?: string;
  failedAttempts?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MDMTestResult {
  success: boolean;
  status?: number;
  count?: number;
  sampleData?: unknown;
  responseBody?: unknown;
  error?: string;
}

export interface MDMSyncJob {
  _id: string;
  sourceId: string;
  datasetKey?: string;
  joinKey?: string;
  type: "dataset_sync" | "join_rebuild";
  status: "queued" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt?: string;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
  sampleErrors: string[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const BASE = `${API_CONFIG.API_URL}/mdm`;

const request = async <T>(
  url: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> => {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) },
      credentials: "include",
    });
    const text = await res.text();
    let payload: Partial<ApiResponse<T>> = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { success: false, error: text || "Invalid server response" };
    }
    if (!res.ok || payload.success === false) {
      return {
        success: false,
        error:
          payload.error ||
          payload.message ||
          `Request failed with status ${res.status}`,
        message: payload.message,
      };
    }
    return { success: true, ...payload } as ApiResponse<T>;
  } catch (error: any) {
    return { success: false, error: error?.message || "Request failed" };
  }
};

export const listMDMSources = () => request<MDMSource[]>(BASE);

export const createMDMSource = (payload: Partial<MDMSource>) =>
  request<MDMSource>(BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateMDMSource = (id: string, payload: Partial<MDMSource>) =>
  request<MDMSource>(`${BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteMDMSource = (id: string) =>
  request<null>(`${BASE}/${id}`, { method: "DELETE" });

export const testMDMSource = (
  id: string,
  body: { apiIndex?: number; dataType?: MDMDataType; sampleLimit?: number },
) =>
  request<MDMTestResult>(`${BASE}/${id}/test`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const testMDMCredentials = (body: {
  api: Partial<MDMApi>;
  auth: Partial<MDMAuthMasked>;
}) =>
  request<MDMTestResult>(`${BASE}/test-credentials`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateMDMCacheConfig = (id: string, cache: MDMCacheConfig) =>
  request<MDMSource>(`${BASE}/${id}/cache-config`, {
    method: "PUT",
    body: JSON.stringify({ cache }),
  });

export const syncMDMDatasetNow = (id: string, datasetKey: string) =>
  request<MDMSyncJob>(
    `${BASE}/${id}/cache/datasets/${encodeURIComponent(datasetKey)}/sync`,
    { method: "POST" },
  );

export const rebuildMDMJoinNow = (id: string, joinKey: string) =>
  request<MDMSyncJob>(
    `${BASE}/${id}/cache/joins/${encodeURIComponent(joinKey)}/rebuild`,
    { method: "POST" },
  );

export const listMDMSyncJobs = (id: string) =>
  request<MDMSyncJob[]>(`${BASE}/${id}/cache/jobs`);

export const testMDMCacheLookup = (
  id: string,
  params: { q: string; projectId?: string; joinKey?: string; limit?: number },
) => {
  const query = new URLSearchParams();
  query.set("q", params.q || "");
  if (params.projectId) query.set("projectId", params.projectId);
  if (params.joinKey) query.set("joinKey", params.joinKey);
  if (params.limit) query.set("limit", String(params.limit));
  return request<any>(`${BASE}/${id}/cache/test-lookup?${query.toString()}`);
};

// ─── PSR Production Search ───────────────────────────────────────────────────

const PSR_BASE = `${API_CONFIG.API_URL}/service-requests`;

export interface PsrSearchParams {
  q: string;
  projectId: string;
  sourceId?: string;
  joinKey?: string;
  limit?: number;
}

export interface PsrSearchResult {
  success: boolean;
  source?: { id: string; name: string } | null;
  data: any[];
  error?: string;
}

export interface PsrSourceOption {
  id: string;
  name: string;
  description: string;
  joins: Array<{ key: string; label: string }>;
}

/** Search the cached parent directory for the PSR create-ticket form. */
export const psrSearch = (params: PsrSearchParams): Promise<PsrSearchResult> => {
  const query = new URLSearchParams();
  query.set("q", params.q || "");
  query.set("projectId", params.projectId);
  if (params.sourceId) query.set("sourceId", params.sourceId);
  if (params.joinKey) query.set("joinKey", params.joinKey);
  if (params.limit) query.set("limit", String(params.limit));
  return request<any>(`${PSR_BASE}/psr/search?${query.toString()}`) as Promise<PsrSearchResult>;
};

/** Get available MDM sources for the PSR config panel source dropdown. */
export const getPsrSources = (): Promise<{ success: boolean; data: PsrSourceOption[] }> =>
  request<PsrSourceOption[]>(`${PSR_BASE}/psr/sources`) as Promise<{ success: boolean; data: PsrSourceOption[] }>;
