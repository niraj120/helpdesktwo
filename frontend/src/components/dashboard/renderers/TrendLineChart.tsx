/**
 * TrendLineChart renderer
 *
 * Renders ticket_trend_over_time data — created vs closed per day.
 * Uses recharts LineChart.
 */

import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TrendPoint {
  date: string;
  created: number;
  closed: number;
}

interface TrendLineChartProps {
  data: { series: TrendPoint[] };
}

export default function TrendLineChart({ data }: TrendLineChartProps) {
  const { series = [] } = data;
  const [showTable, setShowTable] = useState(false);

  if (series.length === 0) {
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
        No data available
      </div>
    );
  }

  // Format date label: "Jan 15"
  const formatted = series.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div
      style={{ width: "100%", height: 180 }}
      role="region"
      aria-label="Ticket trend over time chart"
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
          aria-label="Ticket trend data table"
          style={{ overflowY: "auto", maxHeight: 145 }}
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
                  Date
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "3px 6px",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#3b82f6",
                  }}
                >
                  Created
                </th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "3px 6px",
                    borderBottom: "1px solid #e5e7eb",
                    color: "#22c55e",
                  }}
                >
                  Closed
                </th>
              </tr>
            </thead>
            <tbody>
              {formatted.map((row) => (
                <tr key={row.date}>
                  <td style={{ padding: "2px 6px", color: "#374151" }}>
                    {row.label}
                  </td>
                  <td
                    style={{
                      padding: "2px 6px",
                      textAlign: "right",
                      color: "#374151",
                    }}
                  >
                    {row.created}
                  </td>
                  <td
                    style={{
                      padding: "2px 6px",
                      textAlign: "right",
                      color: "#374151",
                    }}
                  >
                    {row.closed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={formatted}
            margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#7A869A" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#7A869A" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #DFE1E6",
                boxShadow: "0 4px 12px rgba(16,24,40,0.10)",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
            />
            <Line
              type="monotone"
              dataKey="created"
              name="Created"
              stroke="#0052CC"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={true}
            />
            <Line
              type="monotone"
              dataKey="closed"
              name="Closed"
              stroke="#00875A"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={true}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
