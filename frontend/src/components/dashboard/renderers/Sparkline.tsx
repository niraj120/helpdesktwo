/**
 * Sparkline Renderer
 * Tiny inline line chart showing a value trend over time.
 */

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  ReferenceLine,
} from "recharts";

interface SparklineProps {
  data: Record<string, any>;
  onDrillThrough?: (filters?: Record<string, any>) => void;
}

export default function Sparkline({ data, onDrillThrough }: SparklineProps) {
  const points: Array<{ date: string; value: number }> =
    data?.points ?? data?.trend ?? [];
  const current: number = data?.value ?? data?.current ?? 0;
  const delta: number | undefined = data?.trend?.delta ?? data?.delta;
  const deltaPercent: number | undefined =
    data?.trend?.deltaPercent ?? data?.deltaPercent;
  const direction: "up" | "down" | "flat" =
    data?.trend?.direction ?? data?.direction ?? "flat";
  const trendDirection: "lower_is_better" | "higher_is_better" =
    data?.trendDirection ?? "lower_is_better";

  const trendColor =
    direction === "flat"
      ? "#9ca3af"
      : direction === "up"
        ? trendDirection === "lower_is_better"
          ? "#ef4444"
          : "#10b981"
        : trendDirection === "lower_is_better"
          ? "#10b981"
          : "#ef4444";

  const lineColor =
    points.length === 0
      ? "#9ca3af"
      : (() => {
          const first = points[0]?.value ?? 0;
          const last = points[points.length - 1]?.value ?? 0;
          if (last > first)
            return trendDirection === "lower_is_better" ? "#ef4444" : "#10b981";
          if (last < first)
            return trendDirection === "lower_is_better" ? "#10b981" : "#ef4444";
          return "#9ca3af";
        })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        gap: 4,
        cursor: onDrillThrough ? "pointer" : "default",
      }}
      onClick={() => onDrillThrough?.()}
    >
      {/* KPI value */}
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          color: "#111827",
          lineHeight: 1.1,
        }}
      >
        {current !== null && current !== undefined
          ? current.toLocaleString()
          : "—"}
      </div>

      {/* Delta */}
      {(delta !== undefined || deltaPercent !== undefined) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: trendColor,
            fontWeight: 600,
          }}
        >
          {direction === "up" ? "▲" : direction === "down" ? "▼" : "—"}
          {deltaPercent != null && `${Math.abs(deltaPercent)}% `}
          {delta != null && `(${delta > 0 ? "+" : ""}${delta})`}
          <span style={{ fontWeight: 400, color: "#9ca3af" }}>
            vs prev period
          </span>
        </div>
      )}

      {/* Sparkline chart */}
      {points.length >= 2 && (
        <div style={{ flex: 1, minHeight: 50, marginTop: 6 }}>
          <ResponsiveContainer width="100%" height={52}>
            <LineChart
              data={points}
              margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
            >
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  background: "#1e293b",
                  border: "none",
                  borderRadius: 6,
                  color: "#fff",
                  padding: "4px 8px",
                }}
                labelStyle={{ color: "#94a3b8", fontSize: 10 }}
                formatter={(val: any) => [val != null ? Number(val).toLocaleString() : "", "Value"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: lineColor }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {points.length < 2 && (
        <div
          style={{
            fontSize: 11,
            color: "#d1d5db",
            textAlign: "right",
            marginTop: "auto",
          }}
        >
          {points.length === 0 ? "No trend data" : "Need ≥2 points for chart"}
        </div>
      )}
    </div>
  );
}
