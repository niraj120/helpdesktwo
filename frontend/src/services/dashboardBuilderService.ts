/**
 * Dashboard Builder Service
 *
 * API calls for the admin dashboard template builder.
 */

import { API_CONFIG } from "../config/constants";

const BASE = `${API_CONFIG.API_URL}/v1`;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  const body = await res.json();
  return (body.data ?? body) as T;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface WidgetDefinitionItem {
  _id: string;
  widgetKey: string;
  module: string;
  displayName: string;
  description?: string;
  supportedVisualisations: string[];
  defaultVisualisation: string;
  scopeLevels: string[];
  cacheTtlSeconds: number;
  defaultConfig?: Record<string, any>;
  isActive: boolean;
}

export interface TemplateWidgetSlot {
  widgetDefinitionId: string;
  widgetKey: string;
  displayName: string;
  visualisationType: string;
  gridColumn: number;
  gridRow: number;
  gridWidth: number;
  gridHeight: number;
  displayOrder: number;
  config?: Record<string, any>;
  sectionId?: string | null;
}

export interface DashboardSectionSlot {
  _id?: string;
  name: string;
  order: number;
}

export interface DashboardTemplateDetail {
  _id: string;
  name: string;
  description?: string;
  targetRoles?: string[];
  targetScope: "tenant" | "centre" | "user";
  status: "draft" | "published";
  sections?: DashboardSectionSlot[];
  widgets: TemplateWidgetSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplatePayload {
  name: string;
  description?: string;
  targetRoles?: string[];
  targetScope?: "tenant" | "centre" | "user";
  status?: "draft" | "published";
  widgets?: TemplateWidgetSlot[];
}

// ── API Functions ─────────────────────────────────────────────────────────────

export async function fetchAllWidgetDefinitions(): Promise<
  WidgetDefinitionItem[]
> {
  const res = await fetch(`${BASE}/admin/dashboards/widget-definitions`, {
    headers: authHeaders(),
  });
  return handleResponse<WidgetDefinitionItem[]>(res);
}

export async function listTemplates(): Promise<DashboardTemplateDetail[]> {
  const res = await fetch(`${BASE}/admin/dashboards`, {
    headers: authHeaders(),
  });
  return handleResponse<DashboardTemplateDetail[]>(res);
}

export async function fetchTemplate(
  id: string,
): Promise<DashboardTemplateDetail> {
  const res = await fetch(`${BASE}/admin/dashboards/${id}`, {
    headers: authHeaders(),
  });
  return handleResponse<DashboardTemplateDetail>(res);
}

export async function createTemplate(
  data: CreateTemplatePayload,
): Promise<DashboardTemplateDetail> {
  const res = await fetch(`${BASE}/admin/dashboards`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<DashboardTemplateDetail>(res);
}

export async function updateTemplate(
  id: string,
  data: Partial<CreateTemplatePayload>,
): Promise<DashboardTemplateDetail> {
  const res = await fetch(`${BASE}/admin/dashboards/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<DashboardTemplateDetail>(res);
}

export async function publishTemplate(
  id: string,
): Promise<DashboardTemplateDetail> {
  const res = await fetch(`${BASE}/admin/dashboards/${id}/publish`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse<DashboardTemplateDetail>(res);
}

export async function duplicateTemplate(id: string): Promise<{ _id: string }> {
  const res = await fetch(`${BASE}/admin/dashboards/${id}/duplicate`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleResponse<{ _id: string }>(res);
}

/**
 * Download the template as a JSON file in the browser.
 */
export async function exportTemplate(id: string, name: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/dashboards/${id}/export`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dashboard-${name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Upload a JSON bundle and create a new template.
 */
export async function importTemplate(file: File): Promise<{
  _id: string;
  name: string;
  widgetsImported: number;
  widgetsSkipped: string[];
}> {
  const text = await file.text();
  let bundle: unknown;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file");
  }
  const res = await fetch(`${BASE}/admin/dashboards/import`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(bundle),
  });
  return handleResponse(res);
}

// ── Personal Dashboard API ────────────────────────────────────────────────────

export interface PersonalDashboardWidget {
  widgetDefinitionId: string;
  widgetKey: string;
  displayName: string;
  visualisationType: string;
  gridColumn: number;
  gridRow: number;
  gridWidth: number;
  gridHeight: number;
  displayOrder: number;
  config?: Record<string, any>;
}

export interface PersonalDashboard {
  _id: string;
  name: string;
  description?: string;
  colourLabel?: string;
  globalDateRangeDays: number;
  allowUserDateOverride: boolean;
  widgets: PersonalDashboardWidget[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonalDashboardPayload {
  name: string;
  description?: string;
  colourLabel?: string;
  globalDateRangeDays?: number;
  allowUserDateOverride?: boolean;
  widgets?: PersonalDashboardWidget[];
  isDefault?: boolean;
}

export async function listPersonalDashboards(): Promise<PersonalDashboard[]> {
  const res = await fetch(`${BASE}/me/personal-dashboards`, {
    headers: authHeaders(),
  });
  return handleResponse<PersonalDashboard[]>(res);
}

export async function getPersonalDashboard(
  id: string,
): Promise<PersonalDashboard> {
  // Use the list endpoint and filter (no single-get endpoint exists)
  const all = await listPersonalDashboards();
  const found = all.find((d) => d._id === id);
  if (!found) throw new Error("Personal dashboard not found");
  return found;
}

export async function createPersonalDashboard(
  data: CreatePersonalDashboardPayload,
): Promise<PersonalDashboard> {
  const res = await fetch(`${BASE}/me/personal-dashboards`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<PersonalDashboard>(res);
}

export async function updatePersonalDashboard(
  id: string,
  data: Partial<CreatePersonalDashboardPayload>,
): Promise<PersonalDashboard> {
  const res = await fetch(`${BASE}/me/personal-dashboards/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<PersonalDashboard>(res);
}

export async function deletePersonalDashboard(id: string): Promise<void> {
  const res = await fetch(`${BASE}/me/personal-dashboards/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
}

export async function setDefaultPersonalDashboard(id: string): Promise<void> {
  const res = await fetch(`${BASE}/me/personal-dashboards/${id}/set-default`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
}
