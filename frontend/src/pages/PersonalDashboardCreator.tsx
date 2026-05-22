/**
 * PersonalDashboardCreator — Phase 3
 *
 * Simplified 3-panel dashboard builder for end-users to create their
 * own personal dashboards.
 *
 * Routes: /my-dashboards/new  |  /my-dashboards/:id/edit
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactGridLayout, { Layout, LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAllWidgetDefinitions,
  createPersonalDashboard,
  updatePersonalDashboard,
  getPersonalDashboard,
  setDefaultPersonalDashboard,
  WidgetDefinitionItem,
  PersonalDashboardWidget,
} from "../services/dashboardBuilderService";
import {
  MdArrowBack,
  MdStar,
  MdStarOutline,
  MdClose,
  MdAdd,
  MdDragIndicator,
} from "react-icons/md";
import DashboardLayout from "../components/DashboardLayout";

interface CanvasWidget {
  id: string;
  widgetDefinitionId: string;
  widgetKey: string;
  displayName: string;
  visualisationType: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, any>;
}

const COLOUR_OPTIONS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Green", value: "#22c55e" },
  { label: "Orange", value: "#f97316" },
  { label: "Pink", value: "#ec4899" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Red", value: "#ef4444" },
  { label: "Gray", value: "#6b7280" },
];

const MODULE_LABELS: Record<string, string> = {
  tickets: "Tickets",
  users: "Users",
  attendance: "Attendance",
  kb: "Knowledge Base",
};

export default function PersonalDashboardCreator() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [dashName, setDashName] = useState("My Dashboard");
  const [description, setDescription] = useState("");
  const [colourLabel, setColourLabel] = useState("#3b82f6");
  const [dateRangeDays, setDateRangeDays] = useState(30);
  const [isDefault, setIsDefault] = useState(false);
  const [widgets, setWidgets] = useState<CanvasWidget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(id ?? null);
  const [search, setSearch] = useState("");
  const [canvasWidth, setCanvasWidth] = useState(700);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Resize observer for canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 100) setCanvasWidth(w);
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  // Widget definitions
  const { data: definitions = [] } = useQuery({
    queryKey: ["widgetDefinitions"],
    queryFn: fetchAllWidgetDefinitions,
    staleTime: 5 * 60 * 1000,
  });

  // Load existing dashboard if editing
  useQuery({
    queryKey: ["personalDashboard", id],
    queryFn: () => getPersonalDashboard(id!),
    enabled: !!id,
    onSuccess: (data: any) => {
      setDashName(data.name);
      setDescription(data.description ?? "");
      setColourLabel(data.colourLabel ?? "#3b82f6");
      setDateRangeDays(data.globalDateRangeDays ?? 30);
      setIsDefault(data.isDefault ?? false);
      setWidgets(
        (data.widgets ?? []).map((w: any, i: number) => ({
          id: `w_${i}_${w.widgetKey}`,
          widgetDefinitionId: w.widgetDefinitionId,
          widgetKey: w.widgetKey,
          displayName: w.displayName,
          visualisationType: w.visualisationType,
          x: w.gridColumn ?? 0,
          y: w.gridRow ?? 0,
          w: w.gridWidth ?? 4,
          h: w.gridHeight ?? 2,
          config: w.config ?? {},
        })),
      );
    },
  });

  // Filtered widget definitions
  const filteredDefs = definitions.filter(
    (d) =>
      d.isActive &&
      (search === "" ||
        d.displayName.toLowerCase().includes(search.toLowerCase()) ||
        d.widgetKey.toLowerCase().includes(search.toLowerCase())),
  );

  // Group by module
  const groupedDefs = filteredDefs.reduce<
    Record<string, WidgetDefinitionItem[]>
  >((acc, d) => {
    const m = d.module ?? "other";
    (acc[m] = acc[m] ?? []).push(d);
    return acc;
  }, {});

  const selectedWidget = selectedId
    ? (widgets.find((w) => w.id === selectedId) ?? null)
    : null;

  function addWidget(def: WidgetDefinitionItem) {
    const newW: CanvasWidget = {
      id: `w_${Date.now()}_${def.widgetKey}`,
      widgetDefinitionId: def._id,
      widgetKey: def.widgetKey,
      displayName: def.displayName,
      visualisationType: def.defaultVisualisation,
      x: 0,
      y: Infinity,
      w: 4,
      h: 2,
      config: { ...(def.defaultConfig ?? {}) },
    };
    setWidgets((prev) => [...prev, newW]);
    setSelectedId(newW.id);
  }

  function removeWidget(wid: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== wid));
    if (selectedId === wid) setSelectedId(null);
  }

  function updateSelectedField(field: string, value: any) {
    if (!selectedId) return;
    setWidgets((prev) =>
      prev.map((w) => (w.id === selectedId ? { ...w, [field]: value } : w)),
    );
  }

  const handleLayoutChange = useCallback((layout: LayoutItem[]) => {
    setWidgets((prev) =>
      prev.map((w) => {
        const l = layout.find((li) => li.i === w.id);
        if (!l) return w;
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      }),
    );
  }, []);

  function buildPayload() {
    return {
      name: dashName.trim() || "My Dashboard",
      description: description.trim() || undefined,
      colourLabel,
      globalDateRangeDays: dateRangeDays,
      allowUserDateOverride: true,
      isDefault,
      widgets: widgets.map((w, i) => ({
        widgetDefinitionId: w.widgetDefinitionId,
        widgetKey: w.widgetKey,
        displayName: w.displayName,
        visualisationType: w.visualisationType,
        gridColumn: w.x,
        gridRow: w.y,
        gridWidth: w.w,
        gridHeight: w.h,
        displayOrder: i,
        config: w.config,
      })) as PersonalDashboardWidget[],
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = buildPayload();
      if (savedId) {
        await updatePersonalDashboard(savedId, payload);
      } else {
        const created = await createPersonalDashboard(payload);
        setSavedId(created._id);
        navigate(`/my-dashboards/${created._id}/edit`, { replace: true });
      }
      qc.invalidateQueries(["personalDashboards"]);
    } catch (e: any) {
      alert(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault() {
    if (!savedId) {
      alert("Save first before setting as default.");
      return;
    }
    try {
      await setDefaultPersonalDashboard(savedId);
      setIsDefault(true);
      qc.invalidateQueries(["personalDashboards"]);
    } catch (e: any) {
      alert(e.message ?? "Failed to set default");
    }
  }

  const gridLayout: LayoutItem[] = widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
  }));

  return (
    <DashboardLayout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "#f8fafc",
          fontFamily: "inherit",
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "#fff",
            borderBottom: "1px solid #e2e8f0",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => navigate("/my-dashboards")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 14,
              padding: "4px 6px",
              borderRadius: 4,
            }}
          >
            <MdArrowBack size={18} /> Back
          </button>
          <input
            value={dashName}
            onChange={(e) => setDashName(e.target.value)}
            placeholder="Dashboard name"
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 15,
              fontWeight: 600,
              flex: 1,
              minWidth: 160,
              maxWidth: 280,
            }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 13,
              flex: 1,
              minWidth: 120,
              maxWidth: 240,
            }}
          />
          {/* Colour picker */}
          <div style={{ display: "flex", gap: 4 }}>
            {COLOUR_OPTIONS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => setColourLabel(c.value)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: c.value,
                  border:
                    colourLabel === c.value
                      ? "2px solid #1e293b"
                      : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
          {/* Date range */}
          <select
            value={dateRangeDays}
            onChange={(e) => setDateRangeDays(Number(e.target.value))}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 13,
              color: "#374151",
            }}
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
          <button
            onClick={handleSetDefault}
            title={
              isDefault ? "This is your default dashboard" : "Set as default"
            }
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: isDefault ? "#f59e0b" : "#94a3b8",
              padding: "4px 6px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            {isDefault ? <MdStar size={20} /> : <MdStarOutline size={20} />}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 18px",
              fontWeight: 600,
              fontSize: 13,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left panel: widget library */}
          <div
            style={{
              width: 220,
              flexShrink: 0,
              overflowY: "auto",
              background: "#fff",
              borderRight: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "10px 12px 6px",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                Widgets
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                style={{
                  width: "100%",
                  border: "1px solid #e2e8f0",
                  borderRadius: 5,
                  padding: "4px 8px",
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {Object.entries(groupedDefs).map(([module, defs]) => (
                <div key={module}>
                  <div
                    style={{
                      padding: "4px 12px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {MODULE_LABELS[module] ?? module}
                  </div>
                  {defs.map((def) => (
                    <div
                      key={def._id}
                      onClick={() => addWidget(def)}
                      style={{
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        color: "#374151",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        borderRadius: 4,
                        margin: "0 4px",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#f8fafc")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <MdAdd
                        size={14}
                        color="#94a3b8"
                        style={{ flexShrink: 0 }}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {def.displayName}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {filteredDefs.length === 0 && (
                <div
                  style={{
                    padding: 16,
                    fontSize: 12,
                    color: "#94a3b8",
                    textAlign: "center",
                  }}
                >
                  No widgets found
                </div>
              )}
            </div>
          </div>

          {/* Center: canvas */}
          <div
            ref={canvasRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              background: "#f8fafc",
            }}
          >
            {widgets.length === 0 ? (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: 8,
                  color: "#94a3b8",
                }}
              >
                <MdAdd size={40} />
                <div style={{ fontSize: 14 }}>
                  Click a widget in the left panel to add it to your dashboard
                </div>
              </div>
            ) : (
              <ReactGridLayout
                layout={gridLayout}
                cols={12}
                rowHeight={80}
                width={canvasWidth}
                draggableHandle=".widget-drag-handle"
                onLayoutChange={handleLayoutChange}
                style={{ minHeight: 200 }}
              >
                {widgets.map((w) => (
                  <div
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    style={{
                      background: selectedId === w.id ? "#eff6ff" : "#fff",
                      border: `2px solid ${selectedId === w.id ? "#3b82f6" : "#e2e8f0"}`,
                      borderRadius: 8,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      className="widget-drag-handle"
                      style={{
                        padding: "4px 8px",
                        background: selectedId === w.id ? "#dbeafe" : "#f8fafc",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        borderBottom: "1px solid #e2e8f0",
                        cursor: "grab",
                      }}
                    >
                      <MdDragIndicator size={14} color="#94a3b8" />
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#374151",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {w.displayName}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "#94a3b8",
                          background: "#f1f5f9",
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        {w.visualisationType}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWidget(w.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 2,
                          color: "#94a3b8",
                          display: "flex",
                          borderRadius: 3,
                        }}
                      >
                        <MdClose size={14} />
                      </button>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 8,
                        fontSize: 11,
                        color: "#94a3b8",
                      }}
                    >
                      {w.widgetKey}
                    </div>
                  </div>
                ))}
              </ReactGridLayout>
            )}
          </div>

          {/* Right panel: config */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              borderLeft: "1px solid #e2e8f0",
              background: "#fff",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "12px 14px 8px",
                borderBottom: "1px solid #f1f5f9",
                fontWeight: 700,
                fontSize: 12,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Widget Config
            </div>
            {!selectedWidget ? (
              <div
                style={{
                  padding: 20,
                  fontSize: 12,
                  color: "#94a3b8",
                  textAlign: "center",
                }}
              >
                Select a widget to configure it
              </div>
            ) : (
              <div
                style={{
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  Display Title
                  <input
                    value={selectedWidget.displayName}
                    onChange={(e) =>
                      updateSelectedField("displayName", e.target.value)
                    }
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 5,
                      padding: "4px 8px",
                      fontSize: 12,
                    }}
                  />
                </label>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  Visualisation
                  <select
                    value={selectedWidget.visualisationType}
                    onChange={(e) =>
                      updateSelectedField("visualisationType", e.target.value)
                    }
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 5,
                      padding: "4px 8px",
                      fontSize: 12,
                    }}
                  >
                    {(
                      definitions.find(
                        (d) => d._id === selectedWidget.widgetDefinitionId,
                      )?.supportedVisualisations ?? [
                        selectedWidget.visualisationType,
                      ]
                    ).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      flex: 1,
                    }}
                  >
                    Width (cols)
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={selectedWidget.w}
                      onChange={(e) =>
                        updateSelectedField("w", Number(e.target.value))
                      }
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 5,
                        padding: "4px 8px",
                        fontSize: 12,
                      }}
                    />
                  </label>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      flex: 1,
                    }}
                  >
                    Height (rows)
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={selectedWidget.h}
                      onChange={(e) =>
                        updateSelectedField("h", Number(e.target.value))
                      }
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 5,
                        padding: "4px 8px",
                        fontSize: 12,
                      }}
                    />
                  </label>
                </div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  Date Range (days)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={
                      selectedWidget.config?.dateRangeDays ?? dateRangeDays
                    }
                    onChange={(e) =>
                      updateSelectedField("config", {
                        ...selectedWidget.config,
                        dateRangeDays: Number(e.target.value),
                      })
                    }
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 5,
                      padding: "4px 8px",
                      fontSize: 12,
                    }}
                    placeholder={String(dateRangeDays)}
                  />
                </label>
                <button
                  onClick={() => removeWidget(selectedWidget.id)}
                  style={{
                    background: "#fef2f2",
                    color: "#ef4444",
                    border: "1px solid #fecaca",
                    borderRadius: 5,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  Remove Widget
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
