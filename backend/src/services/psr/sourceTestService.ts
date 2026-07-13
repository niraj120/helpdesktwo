import axios, { AxiosRequestConfig } from "axios";
import { IPsrSource } from "../../models/psr/PipelineConfig";

// ---------------------------------------------------------------------------
// Source Test Service (US-1.3)
//
// Stateless — accepts a source config object, makes one test HTTP request,
// returns: HTTP status, up to 5 sample rows (PII-masked), and a flat list
// of discovered column paths (nested, dot-notated).
//
// This endpoint is intentionally NOT async-queued; it runs inline with a
// 10-second timeout so the admin UI receives feedback immediately.
// ---------------------------------------------------------------------------

const TEST_TIMEOUT_MS = 30_000; // 30s — some MDM APIs are slow on first call

// Fields whose values should be masked in preview output (case-insensitive match)
const PII_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /auth/i,
  /credential/i,
  /ssn/i,
  /aadhaar/i,
  /pan\b/i,
];

function isSensitiveKey(key: string): boolean {
  return PII_FIELD_PATTERNS.some((re) => re.test(key));
}

/** Recursively walk a JSON value and mask sensitive leaf values. */
function maskSensitive(value: unknown, key = ""): unknown {
  if (value === null || value === undefined) return value;
  if (isSensitiveKey(key)) return "***";
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = maskSensitive(v, k);
    }
    return result;
  }
  return value;
}

/**
 * Recursively collect all leaf-level dot-notation paths from a JSON object.
 * Arrays are traversed via their first element only.
 * Depth capped at 8 to avoid runaway expansion.
 */
function flattenKeys(
  obj: unknown,
  prefix = "",
  depth = 0,
  collected: Set<string> = new Set(),
): string[] {
  if (depth > 8 || obj === null || obj === undefined) return [];
  if (typeof obj !== "object") {
    if (prefix) collected.add(prefix);
    return [];
  }
  if (Array.isArray(obj)) {
    if (obj.length > 0) flattenKeys(obj[0], prefix, depth + 1, collected);
    return [];
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      flattenKeys(v, path, depth + 1, collected);
    } else if (Array.isArray(v)) {
      collected.add(path); // record the array field itself
      if (v.length > 0) flattenKeys(v[0], path, depth + 1, collected);
    } else {
      collected.add(path);
    }
  }
  return Array.from(collected).sort();
}

/** Resolve a dot-notation path into a nested object. Returns undefined if not found. */
function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce((acc: unknown, part) => {
    if (Array.isArray(acc)) return (acc as any[])[0]?.[part];
    return (acc as any)?.[part];
  }, obj);
}

/** Build the request config for a source (no raw secrets — secretRef resolved via env). */
function buildAxiosConfig(source: IPsrSource): AxiosRequestConfig {
  const headers: Record<string, string> = { Accept: "application/json" };

  // Resolve secret reference at runtime
  const resolveRef = (ref?: string): string => {
    if (!ref) return "";
    if (ref.startsWith("env:")) {
      return process.env[ref.slice(4)] || "";
    }
    if (ref.startsWith("vault:")) {
      return ""; // vault support — Slice D (US-5.3)
    }
    // Test-time raw value: if the user pastes a token directly in the
    // Secret Reference field while testing, use it as-is.
    // Production sources should always use env:/vault: references.
    return ref;
  };

  const auth = source.auth;
  if (auth?.extraHeaders) {
    for (const [k, v] of Object.entries(auth.extraHeaders)) {
      if (k) headers[k] = String(v);
    }
  }

  let basicAuth: { username: string; password: string } | undefined;

  switch (auth?.type) {
    case "apikey": {
      const key = resolveRef(auth.secretRef);
      if (key) headers[auth.headerName || "X-API-Key"] = key;
      break;
    }
    case "bearer": {
      const token = resolveRef(auth.secretRef);
      if (token) headers["Authorization"] = `Bearer ${token}`;
      break;
    }
    case "basic": {
      basicAuth = {
        username: auth.username || "",
        password: resolveRef(auth.secretRef),
      };
      break;
    }
  }

  const url = `${source.baseUrl.replace(/\/$/, "")}${source.path ? "/" + source.path.replace(/^\//, "") : ""}`;

  const config: AxiosRequestConfig = {
    method: source.method || "GET",
    url,
    headers,
    timeout: TEST_TIMEOUT_MS,
  };
  if (basicAuth) config.auth = basicAuth;
  if (source.method === "POST" && source.requestBody) {
    try {
      config.data = JSON.parse(source.requestBody);
    } catch {
      config.data = source.requestBody;
    }
  }

  // Only fetch the first page in test mode
  const pg = source.pagination;
  if (pg?.type === "page" && pg.pageParam) {
    config.params = {
      ...(config.params || {}),
      [pg.pageParam]: 1,
      ...(pg.pageSizeParam ? { [pg.pageSizeParam]: pg.pageSize || 5 } : {}),
    };
  } else if (pg?.type === "offset" && pg.offsetParam) {
    config.params = {
      ...(config.params || {}),
      [pg.offsetParam]: 0,
      ...(pg.pageSizeParam ? { [pg.pageSizeParam]: pg.pageSize || 5 } : {}),
    };
  }

  return config;
}

export interface TestSourceResult {
  success: boolean;
  httpStatus?: number;
  sample: unknown[]; // max 5, PII-masked
  columns: string[]; // discovered column paths
  totalCount?: number;
  error?: string;
}

/**
 * Test a source config and auto-discover columns.
 * Accepts the raw source config object (not yet persisted to DB).
 */
export async function testSource(
  source: IPsrSource,
): Promise<TestSourceResult> {
  let httpStatus: number | undefined;
  try {
    const config = buildAxiosConfig(source);
    const response = await axios(config);
    httpStatus = response.status;

    const rawBody = response.data;
    const rows: unknown[] = (() => {
      const extracted = source.responsePath
        ? getByPath(rawBody, source.responsePath)
        : rawBody;
      if (Array.isArray(extracted)) return extracted;
      if (extracted && typeof extracted === "object") return [extracted];
      return [];
    })();

    const sample = rows.slice(0, 5).map((r) => maskSensitive(r)) as unknown[];
    const columns = rows.length > 0 ? flattenKeys(rows[0]) : [];

    return { success: true, httpStatus, sample, columns };
  } catch (err: any) {
    const status = err?.response?.status || httpStatus;
    const isTimeout = err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "");
    const isNetworkErr = err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND";
    const errorBody = isTimeout
      ? "Request timed out (30s). The API is slow or unreachable — check the URL and try again."
      : isNetworkErr
      ? "Could not reach the server — check the URL and your network."
      : err?.response?.data
      ? JSON.stringify(err.response.data).slice(0, 300)
      : err?.message || "Unknown error";

    return {
      success: false,
      httpStatus: status,
      sample: [],
      columns: [],
      error: status ? `HTTP ${status}: ${errorBody}` : errorBody,
    };
  }
}
