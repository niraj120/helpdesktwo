import { API_CONFIG, getAuthHeaders } from "../config/constants";

export type MDMDataType =
  | "schools"
  | "employees"
  | "principals"
  | "students"
  | "custom";

export type MDMAuthType = "none" | "apiKey" | "bearer" | "basic";

export interface MDMApi {
  label: string;
  dataType: MDMDataType;
  method: "GET" | "POST";
  baseUrl: string;
  path: string;
  isDefaultForType: boolean;
  projectIds: string[]; // Projects this endpoint serves. Empty = all projects.
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

export interface MDMSource {
  _id: string;
  name: string;
  description?: string;
  enabled: boolean;
  apis: MDMApi[];
  auth: MDMAuthMasked;
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
  error?: string;
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
    return await res.json();
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
  body: { apiIndex?: number; dataType?: MDMDataType },
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
