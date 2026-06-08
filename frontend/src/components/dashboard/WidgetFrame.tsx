/**
 * WidgetFrame
 *
 * Generic container for a dashboard widget.
 * Handles loading, error, and empty states.
 * Renders appropriate renderer based on visualisationType.
 * Supports drill-through via onDrillThrough callback.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchWidgetData,
  WidgetDataParams,
  WidgetDataResult,
} from "../../services/dashboardEngineService";
import KpiTile from "./renderers/KpiTile";
import StatusDonut from "./renderers/StatusDonut";
import ProgressBar from "./renderers/ProgressBar";
import CentreBarChart from "./renderers/CentreBarChart";
import GenericBarChart from "./renderers/GenericBarChart";
import TrendLineChart from "./renderers/TrendLineChart";
import AgentWorkloadChart from "./renderers/AgentWorkloadChart";
import Gauge from "./renderers/Gauge";
import Sparkline from "./renderers/Sparkline";
import TableRenderer from "./renderers/TableRenderer";
import { trackUsageEvent } from "../../services/dashboardEngineService";

// ─── CSV Export Utility ───────────────────────────────────────────────────────
function exportWidgetCsv(
  widgetKey: string,
  title: string | null | undefined,
  rawData: Record<string, any>,
): void {
  let rows: Record<string, any>[] = [];
  if (Array.isArray(rawData)) {
    rows = rawData;
  } else if (rawData && typeof rawData === "object") {
    // Flatten single-value KPI tiles to one row
    rows = [rawData];
  }
  if (!rows.length) return;

  const headers = Array.from(new Set(rows.flatMap(Object.keys)));
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(","),
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${widgetKey}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Drill-through: widgetKey → (filters) → url
const drillThroughMap: Record<string, (f: Record<string, any>) => string> = {
  ticket_open_count: () => "/tickets/view?status=open",
  ticket_closed_count: () => "/tickets/view?status=closed",
  ticket_by_status: (f) => `/tickets/view?status=${f.status ?? ""}`,
  ticket_sla_compliance: () => "/tickets/view?sla=breached",
  ticket_assignee_workload: (f) =>
    `/tickets/view?assignedTo=${f.agentId ?? ""}`,
  my_assigned_tickets: () => "/tickets/my-tickets",
  user_active_count: () => "/users?status=active",
  user_inactive_count: () => "/users?status=inactive",
  user_by_role: (f) => `/users?roleId=${f.roleId ?? ""}`,
  centre_ideal_vs_active: (f) => `/admin/centres/${f.centreId ?? ""}`,
  attendance_today_rate: (f) => `/attendance?centreId=${f.centreId ?? ""}`,
  // Phase 5 — ticket extra KPIs
  ticket_inprogress_count: () => "/tickets/view?group=inprogress",
  ticket_resolved_count: () => "/tickets/view?group=resolved",
  ticket_onhold_count: () => "/tickets/view?group=onhold",
  ticket_recent_list: () => "/tickets/view",
  ticket_escalation_count: () => "/tickets/view?escalated=true",
  ticket_escalated_this_period: () => "/tickets/view?escalated=true",
  // Phase 5 — user KPIs
  user_total_count: () => "/users",
  user_new_registrations: () => "/users?sort=createdAt",
  user_never_logged_in: () => "/users?filter=never_logged_in",
  // KB
  kb_total_articles: () => "/knowledge-base",
  kb_published_count: () => "/knowledge-base?status=published",
  kb_draft_count: () => "/knowledge-base?status=draft",
};

// ─── Widget accent colours & icons (for KPI tiles) ─────────────────────────

function getWidgetAccent(key: string): { bg: string; color: string } {
  const k = key.toLowerCase();
  if (
    k.includes("breach") ||
    k.includes("escalat") ||
    k.includes("overdue") ||
    k.includes("critical")
  )
    return { bg: "#FFEBE6", color: "#BF2600" };
  if (k.includes("open") || k.includes("inprogress") || k.includes("total"))
    return { bg: "#DEEBFF", color: "#0052CC" };
  if (k.includes("sla") || k.includes("compliance"))
    return { bg: "#EDF2F9", color: "#4C5E7D" };
  if (k.includes("resolution") || k.includes("rate") || k.includes("bolt"))
    return { bg: "#EBECF0", color: "#172B4D" };
  if (
    k.includes("avg") ||
    k.includes("response") ||
    k.includes("time") ||
    k.includes("hour")
  )
    return { bg: "#DEEBFF", color: "#0052CC" };
  if (
    k.includes("resolved") ||
    k.includes("closed") ||
    k.includes("user") ||
    k.includes("agent")
  )
    return { bg: "#E3FCEF", color: "#006644" };
  return { bg: "#F4F5F7", color: "#44546F" };
}

function WidgetIcon({
  widgetKey,
  color,
}: {
  widgetKey: string;
  color: string;
}) {
  const k = widgetKey.toLowerCase();
  if (k.includes("open") || k.includes("ticket") || k.includes("total"))
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    );
  if (
    k.includes("sla") ||
    k.includes("compliance") ||
    k.includes("resolved") ||
    k.includes("closed")
  )
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    );
  if (k.includes("breach") || k.includes("escalat") || k.includes("overdue"))
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  if (
    k.includes("avg") ||
    k.includes("response") ||
    k.includes("time") ||
    k.includes("hour")
  )
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  if (k.includes("resolution") || k.includes("rate"))
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    );
  if (k.includes("user") || k.includes("agent"))
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="12" y1="8" x2="12" y2="16" />
    </svg>
  );
}

export interface WidgetFrameProps {
  widgetKey: string;
  title?: string | null;
  visualisationType: string;
  dateRangeDays: number;
  config?: Record<string, any>;
  onCollapseChange?: (widgetKey: string, collapsed: boolean) => void;
  defaultCollapsed?: boolean;
  autoRefreshSeconds?: number; // 0 = disabled
  allowExport?: boolean;
  /** Dashboard-level CTX overrides: maps "@ctx.KEY" → resolved value */
  ctxOverrides?: Record<string, any>;
}

/** Replace @ctx.* placeholders in filters with dashboard-level override values */
function applyCtxOverrides(
  filters: Record<string, any> | undefined,
  overrides: Record<string, any>,
): Record<string, any> | undefined {
  if (!filters || Object.keys(overrides).length === 0) return filters;
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (
      typeof v === "string" &&
      v.startsWith("@ctx.") &&
      overrides[v] !== undefined
    ) {
      result[k] = overrides[v];
    } else {
      result[k] = v;
    }
  }
  return result;
}

export default function WidgetFrame({
  widgetKey,
  title,
  visualisationType,
  dateRangeDays,
  config = {},
  onCollapseChange,
  defaultCollapsed = false,
  autoRefreshSeconds = 0,
  allowExport = false,
  ctxOverrides = {},
}: WidgetFrameProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hovered, setHovered] = useState(false);

  // Temporarily hidden: View-detail (drill-through), Export/Download and
  // Collapse actions — these don't yet return correct data. Flip back to true
  // to re-enable. (Refresh is kept.)
  const SHOW_WIDGET_TOOLBAR_ACTIONS = false;

  const handleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    onCollapseChange?.(widgetKey, next);
  };

  const resolvedFilters = applyCtxOverrides(config.filters, ctxOverrides);

  const params: WidgetDataParams = {
    dateRangeDays,
    visualisationType,
    filters: resolvedFilters,
    targetMode: config.targetMode,
    scopeMode: config.scopeMode,
    targetCount: config.targetCount ? Number(config.targetCount) : undefined,
    excludeRoleIds:
      Array.isArray(config.excludeRoleIds) && config.excludeRoleIds.length > 0
        ? (config.excludeRoleIds as string[])
        : undefined,
  };

  const { data, isLoading, isError, error, dataUpdatedAt, refetch } =
    useQuery<WidgetDataResult>(
      [
        "widget",
        widgetKey,
        dateRangeDays,
        JSON.stringify(config),
        JSON.stringify(ctxOverrides),
      ],
      () => fetchWidgetData(widgetKey, params),
      {
        staleTime: 60_000,
        retry: 1,
        enabled: !collapsed,
        refetchInterval:
          autoRefreshSeconds > 0 && !collapsed
            ? autoRefreshSeconds * 1000
            : false,
        onSuccess: () => {
          // Track widget_view event (fire-and-forget)
          trackUsageEvent({ eventType: "widget_view", widgetKey }).catch(
            () => {},
          );
        },
      },
    );

  const handleDrillThrough = (filters: Record<string, any> = {}) => {
    const drillFn = drillThroughMap[widgetKey];
    if (drillFn) {
      navigate(drillFn(filters));
    }
  };

  const hasDrillThrough = Boolean(drillThroughMap[widgetKey]);
  const is403 = isError && (error as any)?.status === 403;

  const isKpi = visualisationType === "kpi_tile";
  const kpiRawData = data?.data;
  const accent = getWidgetAccent(widgetKey);
  const trendBetter = kpiRawData?.trendDirection === "higher_is_better";
  const trendDir = kpiRawData?.trend?.direction as string | undefined;
  const trendDp = kpiRawData?.trend?.deltaPercent as number | undefined;
  const trendIsGood =
    trendDir === "up" ? trendBetter : trendDir === "down" ? !trendBetter : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        borderRadius: 16,
        boxShadow: hovered
          ? "0 8px 24px rgba(16,24,40,0.12)"
          : "0 1px 3px rgba(16,24,40,0.07), 0 1px 2px rgba(16,24,40,0.05)",
        transition: "box-shadow 0.25s ease",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: collapsed ? "auto" : 120,
        position: "relative",
        overflow: "hidden",
        border: "1px solid #DFE1E6",
      }}
    >
      {/* KPI accent row: icon + trend badge */}
      {isKpi && !collapsed && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 16px 0",
          }}
        >
          <div
            style={{
              background: accent.bg,
              borderRadius: 10,
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <WidgetIcon widgetKey={widgetKey} color={accent.color} />
          </div>
          {trendDir && trendDir !== "flat" && trendDp !== undefined && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: 6,
                background: trendIsGood ? "#E3FCEF" : "#FFEBE6",
                color: trendIsGood ? "#006644" : "#BF2600",
                letterSpacing: "0.02em",
              }}
            >
              {trendDir === "up" ? "+" : "−"}
              {Math.abs(trendDp)}%
            </span>
          )}
        </div>
      )}
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: isKpi ? "6px 16px 0" : "14px 16px",
          borderBottom: collapsed || isKpi ? "none" : "1px solid #f1f5f9",
          gap: 8,
        }}
      >
        {title ? (
          <div
            style={{
              fontSize: isKpi ? 13 : 11,
              fontWeight: isKpi ? 500 : 600,
              color: isKpi ? "#44546F" : "#7A869A",
              textTransform: isKpi ? "none" : "uppercase",
              letterSpacing: isKpi ? "normal" : "0.05em",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}
        <div
          style={{
            display: "flex",
            gap: 4,
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {SHOW_WIDGET_TOOLBAR_ACTIONS &&
            hasDrillThrough &&
            data &&
            !isLoading &&
            !collapsed && (
            <button
              title="View detail"
              onClick={() => handleDrillThrough()}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 5px",
                fontSize: 13,
                color: "#9ca3af",
                lineHeight: 1,
              }}
              aria-label="Drill through to detail"
            >
              ↗
            </button>
          )}
          {SHOW_WIDGET_TOOLBAR_ACTIONS &&
            allowExport &&
            data &&
            !isLoading &&
            !collapsed && (
            <button
              title="Export as CSV"
              onClick={() => exportWidgetCsv(widgetKey, title, data.data)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 5px",
                fontSize: 12,
                color: "#9ca3af",
                lineHeight: 1,
              }}
              aria-label="Export widget data as CSV"
            >
              ⬇
            </button>
          )}
          {!collapsed && (
            <button
              title="Refresh"
              onClick={() => refetch()}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 5px",
                fontSize: 13,
                color: "#9ca3af",
                lineHeight: 1,
              }}
              aria-label="Refresh widget"
            >
              ↻
            </button>
          )}
          {SHOW_WIDGET_TOOLBAR_ACTIONS && (
            <button
              title={collapsed ? "Expand widget" : "Collapse widget"}
              onClick={handleCollapse}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 5px",
                fontSize: 13,
                color: "#9ca3af",
                lineHeight: 1,
                transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
              aria-label={collapsed ? "Expand widget" : "Collapse widget"}
            >
              ⌄
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div
          style={{
            padding: isKpi ? "4px 16px 18px" : "12px 16px 14px",
            flex: 1,
            // minHeight:0 lets inner scroll areas (bar lists, donut legend) size
            // to the card and scroll within it instead of overflowing/being
            // chopped by the card's overflow:hidden.
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {isLoading && (
            <WidgetSkeleton visualisationType={visualisationType} />
          )}

          {isError && is403 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "16px 0",
              }}
            >
              <span style={{ fontSize: 18 }}>🔒</span>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                You do not have access to this data
              </span>
            </div>
          )}

          {isError && !is403 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "16px 0",
              }}
            >
              <span
                style={{ fontSize: 12, color: "#ef4444", textAlign: "center" }}
              >
                {(error as Error)?.message === "Failed to fetch" ||
                (error as any)?.status >= 500
                  ? "Could not load this widget"
                  : ((error as Error)?.message ?? "Failed to load widget")}
              </span>
              <button
                onClick={() => refetch()}
                style={{
                  fontSize: 11,
                  color: "#3b82f6",
                  background: "none",
                  border: "1px solid #bfdbfe",
                  borderRadius: 4,
                  padding: "3px 10px",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {data && !isLoading && isEmpty(data.data) && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "16px 0",
              }}
            >
              <span style={{ fontSize: 18 }}>
                {data.data?.noDataReason === "no_capacity_config" ? "⚙️" : "📭"}
              </span>
              <span
                style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}
              >
                {data.data?.noDataReason === "no_capacity_config"
                  ? "Centre capacity not configured. Set idealCount on centres or configure target count."
                  : widgetKey === "user_required_vs_onboarded" ||
                      widgetKey === "user_onboarding_completion_rate"
                    ? "No target set. Open widget config and enter Required User Count."
                    : "No data for the selected period"}
              </span>
            </div>
          )}

          {data && !isLoading && !isEmpty(data.data) && (
            <WidgetRenderer
              visualisationType={visualisationType}
              widgetKey={widgetKey}
              data={data.data}
              metadata={data.metadata}
              cached={data.cached}
              onDrillThrough={handleDrillThrough}
            />
          )}

          {dataUpdatedAt > 0 && (
            <div
              style={{
                fontSize: 10,
                color: "#d1d5db",
                textAlign: "right",
                marginTop: "auto",
                paddingTop: 4,
              }}
            >
              Updated{" "}
              {new Date(dataUpdatedAt).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Renderer Dispatch ────────────────────────────────────────────────────────

interface RendererProps {
  visualisationType: string;
  widgetKey: string;
  data: Record<string, any>;
  metadata: WidgetDataResult["metadata"];
  cached: boolean;
  onDrillThrough: (filters?: Record<string, any>) => void;
}

function WidgetRenderer({
  visualisationType,
  widgetKey,
  data,
  onDrillThrough,
}: RendererProps) {
  // For user_required_vs_onboarded, only progress_bar and kpi_tile make
  // sense (data has {current, required, gap, percentFilled}, not a series).
  // If an incompatible type was saved, fall back to progress_bar.
  const effectiveVis =
    widgetKey === "user_required_vs_onboarded" &&
    visualisationType !== "progress_bar" &&
    visualisationType !== "kpi_tile"
      ? "progress_bar"
      : visualisationType;

  switch (effectiveVis) {
    case "kpi_tile":
      return (
        <KpiTile
          widgetKey={widgetKey}
          data={data}
          onDrillThrough={onDrillThrough}
        />
      );
    case "donut_chart":
      // ticket_by_status returns {segments:[]} which StatusDonut already handles
      return (
        <StatusDonut
          data={data}
          onDrillThrough={onDrillThrough}
          visualisationType="donut_chart"
        />
      );
    case "pie_chart":
      // pie_chart uses the same segment-based data as donut_chart
      return (
        <StatusDonut
          data={data}
          onDrillThrough={onDrillThrough}
          visualisationType="pie_chart"
        />
      );
    case "progress_bar":
      return <ProgressBar data={data} />;
    case "bar_chart":
      // widget-specific bar charts
      if (widgetKey === "ticket_assignee_workload") {
        return <AgentWorkloadChart data={data as any} />;
      }
      // Use GenericBarChart for items/rows shapes (ht_by_* handlers, Phase 5, KB, Activity)
      if (
        data &&
        (Array.isArray((data as any).items) ||
          Array.isArray((data as any).rows))
      ) {
        return <GenericBarChart data={data} onDrillThrough={onDrillThrough} />;
      }
      // Legacy centre_ideal_vs_active shape
      return <CentreBarChart data={data} />;
    case "line_chart":
      return <TrendLineChart data={data as any} />;
    case "gauge":
      return <Gauge data={data} onDrillThrough={onDrillThrough} />;
    case "sparkline":
      return <Sparkline data={data} onDrillThrough={onDrillThrough} />;
    case "table":
      return <TableRenderer data={data} onDrillThrough={onDrillThrough} />;
    default:
      return (
        <KpiTile
          widgetKey={widgetKey}
          data={data}
          onDrillThrough={onDrillThrough}
        />
      );
  }
}

// ─── Skeleton (US-014) ───────────────────────────────────────────────────────

function WidgetSkeleton({ visualisationType }: { visualisationType: string }) {
  const pulse: React.CSSProperties = {
    background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
    backgroundSize: "200% 100%",
    animation: "skeletonPulse 1.4s ease infinite",
    borderRadius: 6,
  };
  if (visualisationType === "kpi_tile") {
    return (
      <>
        <style>{`@keyframes skeletonPulse { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
        <div style={{ ...pulse, height: 42, width: "50%" }} />
        <div style={{ ...pulse, height: 14, width: "70%", marginTop: 6 }} />
        <div style={{ ...pulse, height: 10, width: "40%", marginTop: 4 }} />
      </>
    );
  }
  if (visualisationType === "donut_chart") {
    return (
      <>
        <style>{`@keyframes skeletonPulse { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
        <div
          style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}
        >
          <div
            style={{ ...pulse, width: 100, height: 100, borderRadius: "50%" }}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            marginTop: 12,
          }}
        >
          {[60, 45, 55, 40].map((w, i) => (
            <div key={i} style={{ ...pulse, height: 10, width: w }} />
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <style>{`@keyframes skeletonPulse { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          height: 80,
          paddingTop: 8,
        }}
      >
        {[45, 65, 35, 75, 55, 80, 40, 70].map((h, i) => (
          <div key={i} style={{ ...pulse, flex: 1, height: `${h}%` }} />
        ))}
      </div>
      <div style={{ ...pulse, height: 10, width: "80%", marginTop: 6 }} />
    </>
  );
}

// ─── Empty state helper ──────────────────────────────────────────────────────

function isEmpty(d: Record<string, any>): boolean {
  if (!d || Object.keys(d).length === 0) return true;
  if ("value" in d && d.value == null) return true;
  if (Array.isArray(d.items) && d.items.length === 0) return true;
  if (Array.isArray(d.data) && d.data.length === 0) return true;
  return false;
}
