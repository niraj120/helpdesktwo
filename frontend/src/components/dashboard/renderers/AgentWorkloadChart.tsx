/**
 * AgentWorkloadChart renderer
 *
 * Renders ticket_assignee_workload data — horizontal bar chart per agent.
 * Uses recharts BarChart.
 */

import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface WorkloadRow {
  agentId: string;
  agentName: string;
  count: number;
}

interface AgentWorkloadChartProps {
  data: { rows: WorkloadRow[] };
}

const BAR_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#f97316",
];

export default function AgentWorkloadChart({ data }: AgentWorkloadChartProps) {
  const { rows = [] } = data;
  const [showTable, setShowTable] = useState(false);

  if (rows.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 160,
          color: "#9ca3af",
          fontSize: 13,
        }}
      >
        No open tickets assigned
      </div>
    );
  }

  // Truncate agent names
  const formatted = rows.map((r) => ({
    ...r,
    label:
      r.agentName.length > 14 ? r.agentName.slice(0, 13) + "…" : r.agentName,
  }));

  return (
    <div
      style={{
        width: "100%",
        height: Math.max(160, formatted.length * 28 + 40),
        maxHeight: 280,
      }}
      role="region"
      aria-label="Agent workload chart"
    >
      <div
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 2 }}
      >
        <button
          onClick={() => setShowTable((t) => !t)}
          aria-label={showTable ? "Show chart" : "View as table"}
          style={{
            background: "none",
            border: "1px solid #e5e7eb",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 10,
            cursor: "pointer",
            color: "#6b7280",
          }}
        >
          {showTable ? "Chart" : "Table"}
        </button>
      </div>
      {showTable ? (
        <div
          role="region"
          aria-label="Agent workload data table"
          style={{ overflowY: "auto", maxHeight: "calc(100% - 28px)" }}
        >
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "3px 6px",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#6b7280",
                  }}
                >
                  Agent
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "3px 6px",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#6b7280",
                  }}
                >
                  Open Tickets
                </th>
              </tr>
            </thead>
            <tbody>
              {formatted.map((row) => (
                <tr key={row.agentId}>
                  <td style={{ padding: "2px 6px", color: "#374151" }}>
                    {row.agentName}
                  </td>
                  <td
                    style={{
                      padding: "2px 6px",
                      textAlign: "right",
                      color: "#374151",
                      fontWeight: 600,
                    }}
                  >
                    {row.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={formatted}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 4, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f0f0f0"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 10, fill: "#374151" }}
              tickLine={false}
              axisLine={false}
              width={90}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
              }}
              formatter={(value: any) => [value, "Open tickets"]}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {formatted.map((_: any, idx: number) => (
                <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
