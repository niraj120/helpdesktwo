/**
 * GenericBarChart
 *
 * Horizontal bar chart that handles two data shapes:
 *   Shape A — { items: [{label, code, color, value, percent}], total? }
 *             (Phase 3 ht_* handlers: ticket_by_priority, ticket_by_category, etc.)
 *   Shape B — { rows: [{<labelField>, count, percent}], total? }
 *             (Phase 5/KB handlers: user_by_department, kb_by_category, etc.)
 */

import React, { useState, useEffect } from "react";

interface BarRow {
  label: string;
  value: number;
  percent: number;
  color?: string;
}

const DEFAULT_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6",
  "#a78bfa", "#10b981", "#f97316", "#ec4899", "#14b8a6",
];

function normalise(data: any): BarRow[] {
  // Shape A — items array
  if (Array.isArray(data?.items) && data.items.length > 0) {
    const total = data.items.reduce((s: number, it: any) => s + (it.value ?? 0), 0) || 1;
    return data.items.map((it: any) => ({
      label: String(it.label ?? it.code ?? ""),
      value: it.value ?? 0,
      percent: it.percent ?? Math.round(((it.value ?? 0) / total) * 1000) / 10,
      color: it.color,
    }));
  }

  // Shape B — rows array; auto-detect label field (first non-numeric key)
  if (Array.isArray(data?.rows) && data.rows.length > 0) {
    const sample = data.rows[0];
    const labelField =
      Object.keys(sample).find(
        (k) => k !== "count" && k !== "percent" && k !== "_id" && typeof sample[k] === "string"
      ) ?? Object.keys(sample)[0];
    const total = data.rows.reduce((s: number, r: any) => s + (r.count ?? 0), 0) || 1;
    return data.rows.map((r: any) => ({
      label: String(r[labelField] ?? ""),
      value: r.count ?? 0,
      percent: r.percent ?? Math.round(((r.count ?? 0) / total) * 1000) / 10,
      color: r.color,
    }));
  }

  return [];
}

interface GenericBarChartProps {
  data: any;
  onDrillThrough?: (filters?: Record<string, any>) => void;
}

export default function GenericBarChart({ data, onDrillThrough }: GenericBarChartProps) {
  const rows = normalise(data);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  if (rows.length === 0) {
    return <span style={{ fontSize: 13, color: "#9ca3af" }}>No data</span>;
  }

  const maxVal = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
        maxHeight: 300,
      }}
    >
      {rows.map((row, i) => {
        const barPct = (row.value / maxVal) * 100;
        const color = row.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length];
        return (
          <div
            key={row.label}
            onClick={() => onDrillThrough?.({ label: row.label })}
            style={{ cursor: onDrillThrough ? "pointer" : "default" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 5,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "#253858",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "70%",
                }}
                title={row.label}
              >
                {row.label}
              </span>
              <span style={{ fontSize: 11, color: "#44546F", flexShrink: 0, marginLeft: 6 }}>
                {row.value.toLocaleString()}
                {" "}
                <span style={{ color: "#7A869A" }}>({row.percent}%)</span>
              </span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 6,
                background: "#EDF2F9",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: mounted ? `${barPct}%` : "0%",
                  borderRadius: 6,
                  background: color,
                  transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
