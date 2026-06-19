/**
 * DashboardEnginePage
 *
 * Main page for the custom dashboard engine (Phase 1–4).
 * Resolves tabs for the current user from /api/v1/me/dashboards,
 * renders each tab with its widget grid.
 *
 * Phase 4 additions:
 *  - GlobalFilterBar: date range + scope override propagated to all widgets
 *  - Usage event tracking on tab view
 *  - Link to personal dashboards
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  fetchMyDashboards,
  DashboardTab,
  DashboardSection,
  DashboardWidgetItem,
} from "../services/dashboardEngineService";
import WidgetFrame from "../components/dashboard/WidgetFrame";
import { MdAdd, MdRefresh } from "react-icons/md";
import { API_CONFIG } from "../config/constants";
import DashboardLayout from "../components/DashboardLayout";
import { usePermissions } from "../hooks/usePermissions";
import { useProjectContext } from "../contexts/ProjectContext";
import { useCenters, useCurrentUser } from "../hooks/useQueryHooks";

interface DashboardEnginePageProps {
  wrapWithLayout?: boolean;
}

export default function DashboardEnginePage({
  wrapWithLayout = true,
}: DashboardEnginePageProps = {}) {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canManageDashboard = hasPermission("dashboard.manage");
  const { viewMode, currentProjectId, userProjects } = useProjectContext();
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  // Default to "All time" (0) on load instead of Last 30 days.
  // Sentinels: 0=All time, -1=Today, -2=Yesterday, -3=Custom range, N>0=last N days.
  const [dateRangeDays, setDateRangeDays] = useState(0);
  // Custom range bounds (used when dateRangeDays === -3). ISO date strings (YYYY-MM-DD).
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  // Phase 4: global scope filter
  const [scopeMode, setScopeMode] = useState<
    "all" | "project" | "centre" | "user"
  >("all");
  const sessionId = useRef(Math.random().toString(36).slice(2)).current;

  // CTX override filters
  const [selectedCentreIds, setSelectedCentreIds] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const {
    data: tabs = [],
    isLoading,
    isError,
    error,
  } = useQuery<DashboardTab[]>(["myDashboards"], fetchMyDashboards, {
    staleTime: 0, // Always refetch on navigation so updated widget configs (targetCount, excludeRoleIds) are picked up immediately
    retry: 1,
  });

  const activeTab = tabs[activeTabIndex] ?? null;

  // ── CTX override support ─────────────────────────────────────────────────

  // Detect which @ctx.* variables are actually used across all widgets
  const usedCtxVars = useMemo(() => {
    const vars = new Set<string>();
    tabs.forEach((tab) =>
      tab.widgets.forEach((w) =>
        Object.values(w.config?.filters ?? {}).forEach((v) => {
          if (typeof v === "string" && v.startsWith("@ctx.")) vars.add(v);
        }),
      ),
    );
    return vars;
  }, [tabs]);

  const showCentreFilter = usedCtxVars.has("@ctx.centreId");
  const showUserFilter = usedCtxVars.has("@ctx.userId") && canManageDashboard;

  // Current user — needed to scope centre options to user's assigned centers
  const { data: currentUser } = useCurrentUser();

  // Fetch all centre options for the current project when @ctx.centreId is in use
  const { data: allCentreOptions = [] } = useCenters(
    showCentreFilter ? (currentProjectId ?? undefined) : undefined,
  );

  // Filter to only centres this user is mapped to (if they have any assigned);
  // admins/managers with no center restrictions see all project centres.
  const userCentreIds = currentUser?.centers ?? [];
  const centreOptions =
    userCentreIds.length > 0
      ? allCentreOptions.filter((c) =>
          userCentreIds.some((id) => String(id) === String(c._id)),
        )
      : allCentreOptions;

  // Only show the dropdown when the user has access to 2+ centres.
  // If they have exactly 1 centre the data is auto-scoped (see ctxOverrides).
  const showCentreDropdown = showCentreFilter && centreOptions.length > 1;

  // Fetch project users when @ctx.userId is in use and user is an admin/manager
  const { data: projectUsers = [] } = useQuery<
    Array<{ _id: string; firstName: string; lastName: string; email: string }>
  >(
    ["projectUsers", currentProjectId],
    async () => {
      if (!currentProjectId) return [];
      const token = localStorage.getItem("authToken") ?? "";
      const res = await axios.get(
        `${API_CONFIG.API_URL}/users?projectId=${currentProjectId}&limit=200`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return res.data?.data?.users ?? res.data?.data ?? [];
    },
    {
      enabled: showUserFilter && !!currentProjectId,
      staleTime: 5 * 60 * 1000,
    },
  );

  // Build the final overrides map passed to every WidgetFrame
  const ctxOverrides = useMemo(() => {
    const overrides: Record<string, any> = {};

    if (showCentreFilter) {
      if (selectedCentreIds.length === 1) {
        // Explicit single selection from the dropdown
        overrides["@ctx.centreId"] = selectedCentreIds[0];
      } else if (selectedCentreIds.length > 1) {
        // Multiple selected from the dropdown
        overrides["@ctx.centreId"] = { $in: selectedCentreIds };
      } else if (centreOptions.length === 1) {
        // User has exactly one mapped centre — auto-scope without showing dropdown
        overrides["@ctx.centreId"] = centreOptions[0]._id;
      } else if (centreOptions.length > 1 && userCentreIds.length > 0) {
        // User has multiple mapped centres and selected "All" — scope to all of them
        overrides["@ctx.centreId"] = { $in: centreOptions.map((c) => c._id) };
      }
      // If centreOptions is empty or user has no restriction, no override (backend uses its own scoping)
    }

    if (selectedUserId) {
      overrides["@ctx.userId"] = selectedUserId;
    }
    return overrides;
  }, [
    showCentreFilter,
    selectedCentreIds,
    centreOptions,
    userCentreIds,
    selectedUserId,
  ]);

  // Phase 4: Track dashboard_view usage event fire-and-forget
  const trackView = useCallback(
    (templateId: string) => {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      fetch(`${API_CONFIG.API_URL}/v1/usage/track`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventType: "dashboard_view",
          dashboardTemplateId: templateId,
          sessionId,
        }),
      }).catch(() => {});
    },
    [sessionId],
  );

  useEffect(() => {
    if (activeTab?.dashboardTemplateId) {
      trackView(activeTab.dashboardTemplateId);
    }
  }, [activeTab?.dashboardTemplateId, trackView]);

  // ─── Loading / error ─────────────────────────────────────────────────────

  const wrap = (children: React.ReactNode) =>
    wrapWithLayout ? (
      <DashboardLayout>{children}</DashboardLayout>
    ) : (
      <>{children}</>
    );

  if (isLoading) {
    return wrap(
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
        }}
      >
        <span style={{ fontSize: 14, color: "#667085" }}>
          Loading dashboards…
        </span>
      </div>,
    );
  }

  if (isError) {
    return wrap(
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
        }}
      >
        <span style={{ fontSize: 14, color: "#F04438" }}>
          {(error as Error)?.message ?? "Failed to load dashboards"}
        </span>
      </div>,
    );
  }

  if (tabs.length === 0) {
    return null; // caller shows fallback
  }

  const effectiveDateRange = activeTab?.allowUserDateOverride
    ? dateRangeDays
    : (activeTab?.globalDateRangeDays ?? 0);

  return wrap(
    <div
      style={{
        padding: "24px 28px",
        background: "#F4F5F7",
        minHeight: "100vh",
      }}
    >
      {/* Page header */}
      <div
        style={{
          background: "#ffffff",
          padding: "22px 24px",
          borderRadius: "14px",
          marginBottom: "16px",
          border: "1px solid #e7ebf3",
          boxShadow: "0 4px 18px rgba(15, 23, 42, 0.05)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 6px 0",
              fontSize: 24,
              fontWeight: 700,
              color: "#111827",
              letterSpacing: "-0.01em",
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}
          >
            {viewMode === "unified"
              ? "Dashboard - All Projects"
              : (() => {
                  const p = userProjects.find(
                    (x) => x._id === currentProjectId,
                  );
                  return p ? `Dashboard - ${p.name}` : "Dashboard";
                })()}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#6b7280",
              fontWeight: 400,
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}
          >
            Your assigned dashboards
          </p>
        </div>

        {/* Phase 4: Global filter bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {/* Centre multi-select — only shown when user has 2+ mapped centres */}
          {showCentreDropdown && (
            <CentreMultiSelect
              centres={centreOptions}
              selectedIds={selectedCentreIds}
              onChange={setSelectedCentreIds}
            />
          )}

          {/* Agent / User dropdown — admin/manager only, when @ctx.userId is used */}
          {showUserFilter && projectUsers.length > 0 && (
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{
                fontSize: 13,
                padding: "6px 12px",
                border: "1px solid #DFE1E6",
                borderRadius: 6,
                color: "#172B4D",
                background: "#fff",
                cursor: "pointer",
                outline: "none",
                fontWeight: 500,
              }}
            >
              <option value="">All Agents</option>
              {projectUsers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          )}

          {/* Scope override — admin only */}
          {canManageDashboard && (
            <select
              value={scopeMode}
              onChange={(e) => setScopeMode(e.target.value as any)}
              style={{
                fontSize: 13,
                padding: "6px 12px",
                border: "1px solid #DFE1E6",
                borderRadius: 6,
                color: "#172B4D",
                background: "#fff",
                cursor: "pointer",
                outline: "none",
                fontWeight: 500,
              }}
            >
              <option value="all">All Scope</option>
              <option value="project">My Project</option>
              <option value="centre">My Centre</option>
              <option value="user">Only Me</option>
            </select>
          )}

          {/* Date range selector — always visible */}
          <select
            value={dateRangeDays}
            onChange={(e) => setDateRangeDays(Number(e.target.value))}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              border: "1px solid #DFE1E6",
              borderRadius: 6,
              color: "#172B4D",
              background: "#fff",
              cursor: "pointer",
              outline: "none",
              fontWeight: 500,
            }}
          >
            <option value={0}>All time</option>
            <option value={-1}>Today</option>
            <option value={-2}>Yesterday</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={-3}>Custom range</option>
          </select>

          {/* Custom range date pickers — only when "Custom range" is selected */}
          {dateRangeDays === -3 && (
            <>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  border: "1px solid #DFE1E6",
                  borderRadius: 6,
                  color: "#172B4D",
                  background: "#fff",
                }}
                aria-label="From date"
              />
              <span style={{ color: "#6B778C", fontSize: 13 }}>to</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "6px 10px",
                  border: "1px solid #DFE1E6",
                  borderRadius: 6,
                  color: "#172B4D",
                  background: "#fff",
                }}
                aria-label="To date"
              />
            </>
          )}

          {/* Personal dashboards link — admin only */}
          {canManageDashboard && (
            <button
              onClick={() => navigate("/my-dashboards")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#0052CC",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <MdAdd size={15} /> My Dashboards
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      {tabs.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            background: "#fff",
            borderRadius: 10,
            padding: "4px",
            width: "fit-content",
            border: "1px solid #DFE1E6",
          }}
        >
          {tabs.map((tab, idx) => (
            <button
              key={tab.dashboardTemplateId}
              onClick={() => setActiveTabIndex(idx)}
              style={{
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: activeTabIndex === idx ? 700 : 500,
                color: activeTabIndex === idx ? "#0052CC" : "#44546F",
                background: activeTabIndex === idx ? "#DEEBFF" : "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {tab.name}
            </button>
          ))}
        </div>
      )}

      {/* Widget grid */}
      {activeTab && (
        <WidgetGrid
          tab={activeTab}
          dateRangeDays={effectiveDateRange}
          customStart={effectiveDateRange === -3 ? customStart : null}
          customEnd={effectiveDateRange === -3 ? customEnd : null}
          allTimeStart={(activeTab as any)?.allTimeStartDate ?? null}
          scopeMode={scopeMode}
          ctxOverrides={ctxOverrides}
        />
      )}
    </div>,
  );
}

// ─── Widget Grid ──────────────────────────────────────────────────────────────

interface WidgetGridProps {
  tab: DashboardTab;
  dateRangeDays: number;
  customStart?: string | null;
  customEnd?: string | null;
  allTimeStart?: string | null;
  scopeMode: "all" | "project" | "centre" | "user";
  ctxOverrides: Record<string, any>;
}

function WidgetGrid({
  tab,
  dateRangeDays,
  customStart,
  customEnd,
  allTimeStart,
  scopeMode,
  ctxOverrides,
}: WidgetGridProps) {
  const { widgets, sections = [] } = tab;

  // Phase 5 (US-017): Local collapse state — initialised from preference data
  const [collapsedWidgets, setCollapsedWidgets] = useState<
    Record<string, boolean>
  >(() => {
    const init: Record<string, boolean> = {};
    for (const w of widgets) {
      if ((w as any).isCollapsed) init[w.widgetKey] = true;
    }
    return init;
  });

  // Persist collapse state to backend (fire-and-forget)
  const handleCollapseChange = useCallback(
    (widgetKey: string, isCollapsed: boolean) => {
      setCollapsedWidgets((prev) => ({ ...prev, [widgetKey]: isCollapsed }));
      const widget = widgets.find((w) => w.widgetKey === widgetKey);
      if (!widget) return;
      const token = localStorage.getItem("authToken");
      if (!token) return;
      fetch(
        `${API_CONFIG.API_URL}/v1/me/dashboards/${tab.dashboardTemplateId}/preference`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ widgetId: (widget as any)._id, isCollapsed }),
        },
      ).catch(() => {});
    },
    [widgets, tab.dashboardTemplateId],
  );

  // Phase 4: mobile responsive - use window width to collapse to 1 column
  const [cols, setCols] = useState(12);
  useEffect(() => {
    function update() {
      if (window.innerWidth < 640) setCols(1);
      else if (window.innerWidth < 1024) setCols(6);
      else setCols(12);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (widgets.length === 0) {
    return (
      <div
        style={{
          color: "#9ca3af",
          fontSize: 13,
          padding: "40px 0",
          textAlign: "center",
        }}
      >
        This dashboard has no widgets configured.
      </div>
    );
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderWidgetCard = (widget: DashboardWidgetItem) => {
    const spanCols = cols === 1 ? 1 : Math.min(widget.gridWidth ?? 4, cols);
    return (
      <div
        key={widget._id}
        style={{
          gridColumn: `span ${spanCols}`,
          gridRow: `span ${widget.gridHeight ?? 2}`,
        }}
      >
        <WidgetFrame
          widgetKey={widget.widgetKey}
          title={widget.title ?? undefined}
          visualisationType={widget.visualisationType ?? "kpi_tile"}
          dateRangeDays={dateRangeDays}
          customStart={customStart}
          customEnd={customEnd}
          allTimeStart={allTimeStart}
          config={{ ...(widget.config ?? {}), scopeMode }}
          defaultCollapsed={collapsedWidgets[widget.widgetKey] ?? false}
          onCollapseChange={handleCollapseChange}
          autoRefreshSeconds={tab.autoRefreshSeconds ?? 0}
          allowExport={tab.allowWidgetExport ?? false}
          ctxOverrides={ctxOverrides}
        />
      </div>
    );
  };

  const gridWrap = (children: React.ReactNode) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: "90px",
        gap: 16,
        alignItems: "stretch",
      }}
    >
      {children}
    </div>
  );

  const sortedWidgets = widgets
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // If no sections defined, render flat grid (backward compatible)
  if (sections.length === 0) {
    return gridWrap(sortedWidgets.map(renderWidgetCard));
  }

  // Sectioned render: group widgets by sectionId
  const bySection: Record<string, DashboardWidgetItem[]> = {};
  const unsectioned: DashboardWidgetItem[] = [];
  for (const w of sortedWidgets) {
    if (w.sectionId) {
      (bySection[w.sectionId] ??= []).push(w);
    } else {
      unsectioned.push(w);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {sections.map((sec: DashboardSection) => {
        // sectionId may be stored as MongoDB _id OR as the section name (legacy)
        const secWidgets = bySection[sec._id] ?? bySection[sec.name] ?? [];
        return (
          <div key={sec._id}>
            {/* Section header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#172B4D",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}
              >
                {sec.name}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: "#DFE1E6",
                }}
              />
            </div>
            {secWidgets.length > 0 ? (
              gridWrap(secWidgets.map(renderWidgetCard))
            ) : (
              <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>
                No widgets in this section.
              </div>
            )}
          </div>
        );
      })}
      {/* Unsectioned widgets at bottom */}
      {unsectioned.length > 0 && (
        <div>
          {sections.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#44546F",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Other
              </span>
              <div style={{ flex: 1, height: 1, background: "#DFE1E6" }} />
            </div>
          )}
          {gridWrap(unsectioned.map(renderWidgetCard))}
        </div>
      )}
    </div>
  );
}

// ─── CentreMultiSelect ────────────────────────────────────────────────────────

interface CentreOption {
  _id: string;
  name: string;
  code?: string;
}

function CentreMultiSelect({
  centres,
  selectedIds,
  onChange,
}: {
  centres: CentreOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const label =
    selectedIds.length === 0
      ? "All Centres"
      : selectedIds.length === 1
        ? (centres.find((c) => c._id === selectedIds[0])?.name ?? "1 Centre")
        : `${selectedIds.length} Centres`;

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 13,
          padding: "6px 12px",
          border: `1px solid ${selectedIds.length > 0 ? "#0052CC" : "#DFE1E6"}`,
          borderRadius: 6,
          color: selectedIds.length > 0 ? "#0052CC" : "#172B4D",
          background: selectedIds.length > 0 ? "#DEEBFF" : "#fff",
          cursor: "pointer",
          outline: "none",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {label}
        <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "#fff",
            border: "1px solid #DFE1E6",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
            zIndex: 200,
            minWidth: 200,
            maxHeight: 260,
            overflowY: "auto",
            padding: "6px 0",
          }}
        >
          {/* All option */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 14px",
              cursor: "pointer",
              fontSize: 13,
              color: "#172B4D",
              fontWeight: selectedIds.length === 0 ? 600 : 400,
              background: selectedIds.length === 0 ? "#F4F5F7" : "transparent",
            }}
          >
            <input
              type="checkbox"
              checked={selectedIds.length === 0}
              onChange={() => onChange([])}
              style={{ accentColor: "#0052CC" }}
            />
            All Centres
          </label>

          {/* Divider */}
          <div style={{ height: 1, background: "#F4F5F7", margin: "4px 0" }} />

          {/* Individual centres */}
          {centres.map((c) => {
            const checked = selectedIds.includes(c._id);
            return (
              <label
                key={c._id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#172B4D",
                  fontWeight: checked ? 600 : 400,
                  background: checked ? "#EAF2FF" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c._id)}
                  style={{ accentColor: "#0052CC" }}
                />
                {c.name}
                {c.code && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      marginLeft: "auto",
                    }}
                  >
                    {c.code}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
