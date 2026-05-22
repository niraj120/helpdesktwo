/** Progress Bar Renderer — for user_required_vs_onboarded */

import React from "react";

interface ProgressBarProps {
  data: {
    current?: number;
    required?: number | null;
    gap?: number | null;
    percentFilled?: number | null;
  };
}

export default function ProgressBar({ data }: ProgressBarProps) {
  const { current = 0, required, gap, percentFilled } = data;

  if (required === null || required === undefined) {
    return (
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div style={{ fontSize: 32, fontWeight: 700, color: "#111827" }}>
          {current.toLocaleString()}
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          No target set. Open Dashboard Builder → click ⚙ on this widget → enter Required User Count.
        </div>
      </div>
    );
  }

  const pct = Math.min(100, percentFilled ?? 0);
  const barColor = pct >= 100 ? "#22c55e" : pct >= 70 ? "#f59e0b" : "#3b82f6";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Numbers row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div>
          <span style={{ fontSize: 32, fontWeight: 700, color: "#111827" }}>
            {current.toLocaleString()}
          </span>
          <span style={{ fontSize: 14, color: "#6b7280", marginLeft: 4 }}>
            / {required.toLocaleString()} required
          </span>
        </div>
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: barColor,
          }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar track */}
      <div
        style={{
          height: 10,
          borderRadius: 5,
          background: "#e5e7eb",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: barColor,
            borderRadius: 5,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {gap !== null && gap !== undefined && gap > 0 && (
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {gap.toLocaleString()} more users needed
        </div>
      )}
    </div>
  );
}
