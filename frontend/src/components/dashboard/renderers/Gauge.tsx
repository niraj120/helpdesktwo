/**
 * Gauge Renderer
 * Semicircular gauge for percentage KPIs (SLA compliance, attendance rate, etc.)
 */

import React from "react";

interface GaugeProps {
  data: Record<string, any>;
  onDrillThrough?: (filters?: Record<string, any>) => void;
}

function gaugeColor(pct: number): { stroke: string; bg: string; text: string } {
  if (pct >= 75) return { stroke: "#10b981", bg: "#ECFDF3", text: "#027A48" };
  if (pct >= 50) return { stroke: "#f59e0b", bg: "#FFFBEB", text: "#B45309" };
  return { stroke: "#ef4444", bg: "#FEF2F2", text: "#DC2626" };
}

export default function Gauge({ data, onDrillThrough }: GaugeProps) {
  const rawValue = data?.value ?? data?.rate ?? data?.percent ?? 0;
  const pct = Math.min(100, Math.max(0, Number(rawValue) || 0));
  const label = data?.label ?? data?.title ?? "";
  const subtitle = data?.subtitle ?? data?.description ?? "";
  const trend = data?.trend;

  const colors = gaugeColor(pct);

  // SVG arc math for semicircle (half circle from left to right, bottom cut off)
  // radius 45, center 50,50, arc from 180° to 0°
  const radius = 42;
  const cx = 50;
  const cy = 52;
  const circumference = Math.PI * radius; // half circle circumference
  const offset = circumference * (1 - pct / 100);

  // Arc path: start at left (-x), go counterclockwise over top to right (+x)
  const startX = cx - radius;
  const startY = cy;
  const endX = cx + radius;
  const endY = cy;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flex: 1,
        cursor: onDrillThrough ? "pointer" : "default",
        gap: 4,
      }}
      onClick={() => onDrillThrough?.()}
    >
      {/* SVG Gauge */}
      <div style={{ position: "relative", width: 120, height: 72 }}>
        <svg
          viewBox="0 0 100 60"
          style={{ width: "100%", height: "100%", overflow: "visible" }}
        >
          {/* Background arc */}
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`}
            fill="none"
            stroke="#E4E7EC"
            strokeWidth="9"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${offset}`}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        {/* Center value */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: colors.text,
              lineHeight: 1,
            }}
          >
            {pct.toFixed(1)}
            <span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}>
              %
            </span>
          </div>
        </div>
      </div>

      {/* Label */}
      {label && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#374151",
            textAlign: "center",
            marginTop: 2,
          }}
        >
          {label}
        </div>
      )}

      {/* Subtitle or trend */}
      {subtitle && (
        <div
          style={{
            fontSize: 11,
            color: "#9ca3af",
            textAlign: "center",
          }}
        >
          {subtitle}
        </div>
      )}

      {trend && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color:
              trend.direction === "up"
                ? "#10b981"
                : trend.direction === "down"
                  ? "#ef4444"
                  : "#9ca3af",
          }}
        >
          {trend.direction === "up"
            ? "▲"
            : trend.direction === "down"
              ? "▼"
              : "—"}
          {trend.deltaPercent != null && `${trend.deltaPercent}% vs prev`}
        </div>
      )}

      {/* Colour legend */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 4,
          fontSize: 10,
          color: "#9ca3af",
        }}
      >
        <span style={{ color: "#ef4444" }}>● &lt;50</span>
        <span style={{ color: "#f59e0b" }}>● 50–75</span>
        <span style={{ color: "#10b981" }}>● ≥75</span>
      </div>
    </div>
  );
}
