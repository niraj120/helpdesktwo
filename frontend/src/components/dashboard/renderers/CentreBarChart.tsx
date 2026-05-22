/** Centre Bar Chart Renderer — for centre_ideal_vs_active */

import React from "react";

interface CentreRow {
  centreId: string;
  centreName: string;
  ideal: number | null;
  active: number;
  gap: number | null;
}

interface CentreBarChartProps {
  data: { rows?: CentreRow[] };
}

export default function CentreBarChart({ data }: CentreBarChartProps) {
  const rows = data?.rows ?? [];

  if (rows.length === 0) {
    return (
      <span style={{ fontSize: 13, color: "#9ca3af" }}>No centre data</span>
    );
  }

  const maxCount = Math.max(
    ...rows.map((r) => Math.max(r.ideal ?? 0, r.active)),
    1,
  );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
        maxHeight: 260,
      }}
    >
      {rows.map((row) => {
        const activePct = (row.active / maxCount) * 100;
        const idealPct = row.ideal ? (row.ideal / maxCount) * 100 : null;

        return (
          <div
            key={String(row.centreId)}
            style={{ display: "flex", flexDirection: "column", gap: 3 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>
                {row.centreName}
              </span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                {row.active}
                {row.ideal != null ? ` / ${row.ideal}` : ""}
              </span>
            </div>
            {/* Active bar */}
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: "#e5e7eb",
                position: "relative",
              }}
            >
              {/* Ideal marker */}
              {idealPct !== null && (
                <div
                  style={{
                    position: "absolute",
                    left: `${idealPct}%`,
                    top: -2,
                    bottom: -2,
                    width: 2,
                    background: "#f59e0b",
                    borderRadius: 1,
                    zIndex: 1,
                  }}
                />
              )}
              <div
                style={{
                  width: `${activePct}%`,
                  height: "100%",
                  background: "#3b82f6",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#3b82f6",
            }}
          />
          <span style={{ fontSize: 11, color: "#6b7280" }}>Active</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#f59e0b",
            }}
          />
          <span style={{ fontSize: 11, color: "#6b7280" }}>Ideal (marker)</span>
        </div>
      </div>
    </div>
  );
}
