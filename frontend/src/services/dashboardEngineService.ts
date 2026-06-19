/**
 * Dashboard Engine API Service
 */

import { API_CONFIG } from "../config/constants";

const BASE = API_CONFIG.API_URL;

function getHeaders() {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, headers: getHeaders() });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message ?? `HTTP ${res.status}`);
  }
  return json;
}

// ─── My Dashboards (tab manifest) ────────────────────────────────────────────

export interface WidgetConfig {
  filters?: Record<string, any>;
  targetMode?: "project_total" | "monthly";
  thresholds?: any;
  [key: string]: any;
}

export interface DashboardWidgetItem {
  _id: string;
  widgetKey: string;
  title?: string | null;
  visualisationType: string;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  displayOrder: number;
  config: WidgetConfig;
  sectionId?: string | null;
}

export interface DashboardSection {
  _id: string;
  name: string;
  order: number;
}

export interface DashboardTab {
  tabIndex: number;
  tabOrder: number;
  isDefault: boolean;
  dashboardTemplateId: string;
  name: string;
  globalDateRangeDays: number;
  allowUserDateOverride: boolean;
  autoRefreshSeconds: number; // 0 = disabled
  allowWidgetExport: boolean;
  scopeOverride: any;
  sections: DashboardSection[];
  widgets: DashboardWidgetItem[];
}

export async function fetchMyDashboards(): Promise<DashboardTab[]> {
  const res = await apiFetch<{ success: boolean; data: DashboardTab[] }>(
    `${BASE}/v1/me/dashboards`,
  );
  return res.data ?? [];
}

export async function updateMyPreference(
  templateId: string,
  payload: { dateRangeDays?: number; scopeOverride?: any },
): Promise<void> {
  await apiFetch(`${BASE}/v1/me/dashboards/${templateId}/preference`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// ─── Widget Data ──────────────────────────────────────────────────────────────

export interface WidgetDataParams {
  dateRangeDays?: number;
  /** Custom range bounds (used when dateRangeDays === -3). ISO date strings (YYYY-MM-DD). */
  customStart?: string | null;
  customEnd?: string | null;
  /** Dashboard-level "All time" floor (used when dateRangeDays === 0). ISO date string. */
  allTimeStart?: string | null;
  visualisationType?: string;
  filters?: Record<string, any>;
  scopeMode?: string;
  targetMode?: "project_total" | "monthly";
  targetCount?: number;
  /** Role IDs to exclude from all user-count widgets */
  excludeRoleIds?: string[];
}

export interface WidgetDataResult {
  widgetKey: string;
  visualisationType: string;
  data: Record<string, any>;
  metadata: {
    dateRangeStart: string;
    dateRangeEnd: string;
    lastUpdated: string;
  };
  cached: boolean;
}

export async function fetchWidgetData(
  widgetKey: string,
  params: WidgetDataParams = {},
): Promise<WidgetDataResult> {
  const qs = new URLSearchParams();
  if (params.dateRangeDays !== undefined)
    qs.set("dateRangeDays", String(params.dateRangeDays));
  if (params.customStart) qs.set("customStart", params.customStart);
  if (params.customEnd) qs.set("customEnd", params.customEnd);
  if (params.allTimeStart) qs.set("allTimeStart", params.allTimeStart);
  if (params.visualisationType)
    qs.set("visualisationType", params.visualisationType);
  if (params.filters) qs.set("filters", JSON.stringify(params.filters));
  if (params.scopeMode) qs.set("scopeMode", params.scopeMode);
  if (params.targetMode) qs.set("targetMode", params.targetMode);
  if (params.targetCount && params.targetCount > 0)
    qs.set("targetCount", String(params.targetCount));
  if (params.excludeRoleIds && params.excludeRoleIds.length > 0)
    qs.set("excludeRoleIds", params.excludeRoleIds.join(","));

  const res = await apiFetch<{ success: boolean } & WidgetDataResult>(
    `${BASE}/v1/widgets/${widgetKey}/data?${qs.toString()}`,
  );
  return res;
}

// ─── Usage Event Tracking ─────────────────────────────────────────────────────

export interface UsageEventPayload {
  eventType: "dashboard_view" | "widget_view" | "widget_interact";
  dashboardTemplateId?: string;
  widgetKey?: string;
  metadata?: Record<string, any>;
}

export async function trackUsageEvent(
  payload: UsageEventPayload,
): Promise<void> {
  await apiFetch(`${BASE}/v1/usage/track`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
