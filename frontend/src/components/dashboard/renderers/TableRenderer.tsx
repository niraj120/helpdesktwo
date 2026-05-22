/**
 * Table Renderer
 * Generic data table for widgets that return columnar data.
 */

import React, { useState } from "react";

interface TableProps {
  data: Record<string, any>;
  onDrillThrough?: (filters?: Record<string, any>) => void;
}

export default function TableRenderer({ data, onDrillThrough }: TableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Support two data shapes:
  // 1. { columns: string[], rows: Record<string,any>[] }
  // 2. { segments: Array<{status,count,percent}> } — ticket_by_status fallback
  // 3. { items: any[] } — generic array
  // 4. { tickets: any[] } — my_assigned_tickets
  // 5. { events: any[] } — activity_feed / login events
  // 6. { rows: any[] } (without columns) — kb_by_category, user_by_department, etc.

  let columns: string[] = [];
  let rows: Record<string, any>[] = [];

  if (data?.columns && Array.isArray(data.columns)) {
    columns = data.columns;
    rows = Array.isArray(data.rows) ? data.rows : [];
  } else if (Array.isArray(data?.segments)) {
    columns = ["Status", "Count", "%"];
    rows = data.segments.map((s: any) => ({
      Status: s.status,
      Count: s.count,
      "%": `${s.percent}%`,
    }));
  } else if (Array.isArray(data?.items)) {
    const sample = data.items[0] ?? {};
    columns = Object.keys(sample);
    rows = data.items;
  } else if (Array.isArray(data?.tickets)) {
    // my_assigned_tickets
    const sample = data.tickets[0] ?? {};
    columns = Object.keys(sample);
    rows = data.tickets;
  } else if (Array.isArray(data?.events)) {
    // activity_feed, login_failure_count table mode
    const sample = data.events[0] ?? {};
    columns = Object.keys(sample);
    rows = data.events;
  } else if (Array.isArray(data?.rows)) {
    // kb_by_category, user_by_department, ticket_recent_list, kb_top_viewed, etc.
    const sample = data.rows[0] ?? {};
    columns = Object.keys(sample);
    rows = data.rows;
  } else if (Array.isArray(data?.agents)) {
    // ticket_assignee_workload
    const sample = data.agents[0] ?? {};
    columns = Object.keys(sample);
    rows = data.agents;
  } else {
    // Try to render any plain object as a 2-col key/value table
    columns = ["Field", "Value"];
    rows = Object.entries(data ?? {}).map(([k, v]) => ({
      Field: k,
      Value: typeof v === "object" ? JSON.stringify(v) : String(v),
    }));
  }

  // Sorting
  const sorted = [...rows].sort((a, b) => {
    if (!sortCol) return 0;
    const va = a[sortCol] ?? "";
    const vb = b[sortCol] ?? "";
    const n = typeof va === "number" && typeof vb === "number";
    if (n) return sortDir === "asc" ? va - vb : vb - va;
    return sortDir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  if (sorted.length === 0) {
    return <span style={{ fontSize: 13, color: "#9ca3af" }}>No data</span>;
  }

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        cursor: onDrillThrough ? "default" : "default",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr
            style={{
              background: "#F9FAFB",
              borderBottom: "1px solid #E4E7EC",
            }}
          >
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                style={{
                  padding: "8px 10px",
                  textAlign: "left",
                  fontWeight: 600,
                  color: "#667085",
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                  fontSize: 11,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}
              >
                {col}
                {sortCol === col && (
                  <span style={{ marginLeft: 4 }}>
                    {sortDir === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr
              key={ri}
              style={{
                borderBottom: "1px solid #F2F4F7",
                background: ri % 2 === 0 ? "#fff" : "#FAFAFA",
              }}
              onClick={() =>
                onDrillThrough &&
                onDrillThrough(
                  Object.fromEntries(
                    columns.map((c) => [c.toLowerCase(), row[c]]),
                  ),
                )
              }
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#F0F4FF")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background =
                  ri % 2 === 0 ? "#fff" : "#FAFAFA")
              }
            >
              {columns.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: "8px 10px",
                    color: "#344054",
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={String(row[col] ?? "")}
                >
                  {String(row[col] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
