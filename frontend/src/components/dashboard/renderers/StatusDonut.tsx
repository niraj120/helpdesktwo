/** Status Donut / Pie Chart Renderer */

import React from "react";

// Exact-match colors for known ticket statuses
const STATUS_COLORS: Record<string, string> = {
  open: "#3b82f6",
  "in-progress": "#f59e0b",
  resolved: "#22c55e",
  closed: "#6b7280",
  pending: "#a78bfa",
  escalated: "#ef4444",
};

// Diverse indexed palette used when no explicit color is assigned
// (categories, roles, etc. — chosen to be visually distinct)
const PALETTE = [
  "#f28e2b", // orange
  "#4e79a7", // steel blue
  "#e15759", // red
  "#76b7b2", // teal
  "#59a14f", // green
  "#edc948", // yellow
  "#b07aa1", // purple
  "#ff9da7", // pink
  "#9c755f", // brown
  "#499894", // dark teal
  "#f1ce63", // light yellow
  "#d37295", // rose
  "#a0cbe8", // light blue
  "#ffbe7d", // peach
  "#8cd17d", // light green
];

// ── Data normalisation ────────────────────────────────────────────────────────
interface NormalisedSegment {
  status: string;
  count: number;
  percent: number;
  color: string; // always resolved — never undefined after normalise
}

function normaliseData(data: any): {
  segments: NormalisedSegment[];
  total: number;
} {
  let rawSegs: Array<{
    status: string;
    count: number;
    percent: number;
    color?: string;
  }> = [];

  if (Array.isArray(data?.items) && data.items.length > 0) {
    rawSegs = data.items.map((it: any) => ({
      status: String(it.label ?? it.code ?? ""),
      count: it.value ?? 0,
      percent: it.percent ?? 0,
      color: it.color ?? undefined,
    }));
  } else {
    rawSegs = (data?.segments ?? []).map((s: any) => ({
      // Phase 1 ticket_by_status: {code, name, color, count, percent}
      // Phase 2 user_by_role:     {roleId, roleName, count, percent}
      // Legacy shape:             {status, count, percent}
      status: String(
        s.name ?? s.roleName ?? s.label ?? s.status ?? s.code ?? "",
      ),
      count: s.count ?? s.value ?? 0,
      percent: s.percent ?? 0,
      color: s.color ?? undefined,
    }));
  }

  const total =
    data?.total ?? rawSegs.reduce((acc, s) => acc + s.count, 0);

  const segments: NormalisedSegment[] = rawSegs.map((s, idx) => {
    // Resolve color: explicit backend color → status keyword → indexed palette
    let color = s.color;
    if (!color) {
      const key = s.status.toLowerCase();
      color = STATUS_COLORS[key] ?? PALETTE[idx % PALETTE.length];
    }
    // Recompute percent from count when backend didn't supply it
    const percent =
      s.percent > 0
        ? s.percent
        : total > 0
          ? Math.round((s.count / total) * 1000) / 10
          : 0;
    return { status: s.status, count: s.count, percent, color };
  });

  return { segments, total };
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
function polarToXY(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Build the SVG path for one pie or donut slice. */
function slicePath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
): string {
  const sweep = endDeg - startDeg;
  if (sweep <= 0) return "";

  // Full circle — avoid degenerate arc (start === end)
  if (sweep >= 359.5) {
    const [ax, ay] = polarToXY(cx, cy, outerR, 0);
    const [bx, by] = polarToXY(cx, cy, outerR, 180);
    const outer = `M ${ax} ${ay} A ${outerR} ${outerR} 0 1 1 ${bx} ${by} A ${outerR} ${outerR} 0 1 1 ${ax} ${ay} Z`;
    if (innerR <= 0) return outer;
    const [iax, iay] = polarToXY(cx, cy, innerR, 0);
    const [ibx, iby] = polarToXY(cx, cy, innerR, 180);
    return (
      outer +
      ` M ${iax} ${iay} A ${innerR} ${innerR} 0 1 0 ${ibx} ${iby} A ${innerR} ${innerR} 0 1 0 ${iax} ${iay} Z`
    );
  }

  const la = sweep > 180 ? 1 : 0;
  const [ox1, oy1] = polarToXY(cx, cy, outerR, startDeg);
  const [ox2, oy2] = polarToXY(cx, cy, outerR, endDeg);

  if (innerR <= 0) {
    // Solid pie slice
    return `M ${cx} ${cy} L ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${la} 1 ${ox2} ${oy2} Z`;
  }

  // Donut ring slice
  const [ix1, iy1] = polarToXY(cx, cy, innerR, endDeg);
  const [ix2, iy2] = polarToXY(cx, cy, innerR, startDeg);
  return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${la} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${la} 0 ${ix2} ${iy2} Z`;
}

// ── Shared Chart + Legend layout ──────────────────────────────────────────────
function PieChart({
  segments,
  total,
  isDonut,
  onDrillThrough,
}: {
  segments: NormalisedSegment[];
  total: number;
  isDonut: boolean;
  onDrillThrough?: (filters?: Record<string, any>) => void;
}) {
  const SIZE = 150;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const outerR = SIZE / 2 - 6;
  const innerR = isDonut ? Math.round(outerR * 0.52) : 0;
  // Small gap between slices for visual separation
  const GAP = segments.length > 1 ? 1.2 : 0;

  let cursor = 0;
  const arcs = segments.map((seg) => {
    const deg = total > 0 ? (seg.count / total) * 360 : 0;
    const start = cursor + GAP / 2;
    const end = cursor + deg - GAP / 2;
    cursor += deg;
    return { seg, start, end };
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flex: 1,
        minWidth: 0,
        height: "100%",
      }}
    >
      {/* ── SVG chart ── */}
      <div style={{ flexShrink: 0, position: "relative" }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ display: "block", overflow: "visible" }}
        >
          {arcs.map(({ seg, start, end }) => (
            <path
              key={seg.status}
              d={slicePath(cx, cy, outerR, innerR, start, end)}
              fill={seg.color}
              stroke="#ffffff"
              strokeWidth={2}
              style={{
                cursor: onDrillThrough ? "pointer" : "default",
                transition: "opacity 0.15s",
              }}
              onClick={() => onDrillThrough?.({ status: seg.status })}
            />
          ))}

          {/* Donut centre label */}
          {isDonut && (
            <>
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dy="-0.2em"
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  fill: "#111827",
                  fontFamily: "inherit",
                }}
              >
                {total.toLocaleString()}
              </text>
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dy="1.1em"
                style={{
                  fontSize: 10,
                  fill: "#9ca3af",
                  fontFamily: "inherit",
                }}
              >
                total
              </text>
            </>
          )}
        </svg>

        {/* Pie total below the chart */}
        {!isDonut && (
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "#9ca3af",
              marginTop: 4,
            }}
          >
            {total.toLocaleString()} total
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflowY: "auto",
          maxHeight: SIZE + 20,
        }}
      >
        {segments.map((s) => (
          <div
            key={s.status}
            onClick={() => onDrillThrough?.({ status: s.status })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              cursor: onDrillThrough ? "pointer" : "default",
            }}
          >
            {/* Colored circle — matches reference image style */}
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: "#374151",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.status}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#6b7280",
                flexShrink: 0,
                marginLeft: 4,
              }}
            >
              {s.percent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface StatusDonutProps {
  data: any;
  onDrillThrough?: (filters?: Record<string, any>) => void;
  visualisationType?: string;
}

export default function StatusDonut({
  data,
  onDrillThrough,
  visualisationType = "donut_chart",
}: StatusDonutProps) {
  const { segments, total } = normaliseData(data);

  if (segments.length === 0) {
    return (
      <span style={{ fontSize: 13, color: "#9ca3af" }}>No data</span>
    );
  }

  if (
    visualisationType === "pie_chart" ||
    visualisationType === "donut_chart"
  ) {
    return (
      <PieChart
        segments={segments}
        total={total}
        isDonut={visualisationType === "donut_chart"}
        onDrillThrough={onDrillThrough}
      />
    );
  }

  // ── Fallback: plain legend list (kpi_tile-style) ──
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flex: 1 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {segments.map((s) => (
          <div
            key={s.status}
            onClick={() => onDrillThrough?.({ status: s.status })}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              cursor: onDrillThrough ? "pointer" : "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: "#374151" }}>
                {s.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                {s.count}
              </span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>
                ({s.percent}%)
              </span>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          minWidth: 60,
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>
          {total.toLocaleString()}
        </span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>total</span>
      </div>
    </div>
  );
}

