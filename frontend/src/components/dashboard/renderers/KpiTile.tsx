/**
 * KPI Tile Renderer
 * Displays a numeric KPI value with trend direction and delta.
 */

import React from "react";

interface KpiTileProps {
  widgetKey: string;
  data: Record<string, any>;
  onDrillThrough?: (filters?: Record<string, any>) => void;
}

const TREND_COLORS = {
  up: "#ef4444",
  down: "#22c55e",
  flat: "#9ca3af",
};

const TREND_SYMBOLS = { up: "▲", down: "▼", flat: "—" };

export default function KpiTile({ data, onDrillThrough }: KpiTileProps) {
  const value = data?.value ?? null;
  const direction: "up" | "down" | "flat" = data?.trend?.direction ?? "flat";
  const delta = data?.trend?.delta;
  const deltaPercent = data?.trend?.deltaPercent;
  const trendDirection: "lower_is_better" | "higher_is_better" =
    data?.trendDirection ?? "lower_is_better";

  // For "lower is better" widgets (e.g., open tickets), up is bad → red; down is good → green
  // For "higher is better" widgets (e.g., SLA rate), up is good → green; down is bad → red
  let trendColor = TREND_COLORS.flat;
  if (direction !== "flat") {
    if (trendDirection === "lower_is_better") {
      trendColor = direction === "up" ? "#ef4444" : "#22c55e";
    } else {
      trendColor = direction === "up" ? "#22c55e" : "#ef4444";
    }
  }

  if (value === null && data?.noData) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          No data available
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        flex: 1,
        cursor: onDrillThrough ? "pointer" : "default",
      }}
      onClick={() => onDrillThrough?.()}
    >
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          fontSize: 38,
          fontWeight: 800,
          color: "#172B4D",
          lineHeight: 1.15,
          letterSpacing: "-0.5px",
        }}
      >
        {value !== null ? value.toLocaleString() : "—"}
        {typeof value === "number" && data?.unit === "percent" && (
          <span style={{ fontSize: 22, fontWeight: 600, color: "#44546F", marginLeft: 2 }}>
            %
          </span>
        )}
        {typeof value === "number" && data?.unit === "hours" && (
          <span style={{ fontSize: 18, fontWeight: 500, color: "#44546F", marginLeft: 4 }}>
            hrs
          </span>
        )}
      </div>

      {delta !== undefined && direction !== "flat" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, marginTop: 2 }}>
          <span style={{ color: trendColor, fontWeight: 600 }}>
            {TREND_SYMBOLS[direction]}{" "}
            {delta > 0 ? "+" : ""}
            {delta}
            {deltaPercent !== undefined && ` (${deltaPercent > 0 ? "+" : ""}${deltaPercent}%)`}
          </span>
          <span style={{ color: "#7A869A" }}>vs last period</span>
        </div>
      )}
    </div>
  );
}
