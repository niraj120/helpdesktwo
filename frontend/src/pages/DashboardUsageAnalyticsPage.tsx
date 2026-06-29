/**
 * DashboardUsageAnalyticsPage — Phase 4
 *
 * Admin page: shows summary stats for dashboard/widget usage.
 * Route: /admin/dashboard-usage   (requires dashboard.manage permission)
 *
 * API: GET /api/v1/admin/usage/dashboard-summary?days=30
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_CONFIG } from "../config/constants";
import DashboardLayout from "../components/DashboardLayout";

interface UsageSummary {
  period: { days: number; from: string; to: string };
  summary: {
    dashboardViews: number;
    widgetViews: number;
    uniqueActiveUsers: number;
  };
  topWidgets: { widgetKey: string; views: number }[];
  topDashboards: { templateId: string; name: string; views: number }[];
}

async function fetchUsageSummary(days: number): Promise<UsageSummary> {
  const token = localStorage.getItem("authToken");
  const res = await fetch(
    `${API_CONFIG.API_URL}/v1/admin/usage/dashboard-summary?days=${days}`,
    { headers: { Authorization: `Bearer ${token ?? ""}` } },
  );
  if (!res.ok)
    throw new Error((await res.json()).message ?? "Failed to fetch usage data");
  const json = await res.json();
  return json.data ?? json;
}

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
];

export default function DashboardUsageAnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading, isError, error, refetch } = useQuery<UsageSummary>({
    queryKey: ["dashboardUsageSummary", days],
    queryFn: () => fetchUsageSummary(days),
    staleTime: 2 * 60_000,
    keepPreviousData: true,
  });

  return (
    <DashboardLayout>
      <div
        style={{
          padding: "28px 32px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontFamily: '"DM Serif Display", Georgia, serif',
                fontWeight: 700,
                color: "#0f172a",
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              Dashboard Usage Analytics
            </h1>
            <p style={{ fontSize: 13, color: "#667085", margin: "4px 0 0" }}>
              {data
                ? `${data.period.from} — ${data.period.to}`
                : "Loading period…"}
            </p>
          </div>

          {/* Period selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: "#667085", fontWeight: 500 }}>
              Period:
            </label>
            <div style={{ display: "flex", gap: 4 }}>
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDays(opt.value)}
                  style={{
                    fontSize: 12,
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "1px solid",
                    borderColor: days === opt.value ? "#7F56D9" : "#D0D5DD",
                    background: days === opt.value ? "#F4F3FF" : "#fff",
                    color: days === opt.value ? "#7F56D9" : "#344054",
                    fontWeight: days === opt.value ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && !data && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "60px 0",
              color: "#667085",
              fontSize: 14,
            }}
          >
            Loading analytics…
          </div>
        )}

        {/* Error */}
        {isError && (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <p style={{ color: "#F04438", fontSize: 14 }}>
              {(error as Error)?.message ?? "Failed to load"}
            </p>
            <button
              onClick={() => refetch()}
              style={{
                marginTop: 8,
                fontSize: 13,
                color: "#7F56D9",
                background: "none",
                border: "1px solid #7F56D9",
                borderRadius: 8,
                padding: "6px 16px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Summary KPI cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 16,
                marginBottom: 28,
                opacity: isLoading ? 0.6 : 1,
                transition: "opacity 0.2s",
              }}
            >
              <KpiCard
                label="Dashboard Views"
                value={data.summary.dashboardViews}
                color="#7F56D9"
              />
              <KpiCard
                label="Widget Views"
                value={data.summary.widgetViews}
                color="#12B76A"
              />
              <KpiCard
                label="Unique Active Users"
                value={data.summary.uniqueActiveUsers}
                color="#F79009"
              />
            </div>

            {/* Two tables side by side */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
                gap: 20,
              }}
            >
              {/* Top widgets */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: "20px 22px",
                  boxShadow:
                    "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
                }}
              >
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#101828",
                    margin: "0 0 14px",
                  }}
                >
                  Top 10 Widgets
                </h2>
                {data.topWidgets.length === 0 ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: "#667085",
                      textAlign: "center",
                      padding: "20px 0",
                    }}
                  >
                    No data in period
                  </p>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            background: "#f8fafc",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          #
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            background: "#f8fafc",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          Widget Key
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "8px 10px",
                            background: "#f8fafc",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          Views
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topWidgets.map((w, i) => (
                        <tr
                          key={w.widgetKey}
                          style={{ borderBottom: "1px solid #F2F4F7" }}
                        >
                          <td style={{ padding: "8px 10px", color: "#667085" }}>
                            {i + 1}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              color: "#344054",
                              fontFamily: "monospace",
                              fontSize: 12,
                            }}
                          >
                            {w.widgetKey}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              color: "#101828",
                              fontWeight: 600,
                              textAlign: "right",
                            }}
                          >
                            {w.views.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Top dashboards */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: "20px 22px",
                  boxShadow:
                    "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
                }}
              >
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#101828",
                    margin: "0 0 14px",
                  }}
                >
                  Top 10 Dashboards
                </h2>
                {data.topDashboards.length === 0 ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: "#667085",
                      textAlign: "center",
                      padding: "20px 0",
                    }}
                  >
                    No data in period
                  </p>
                ) : (
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            background: "#f8fafc",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          #
                        </th>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            background: "#f8fafc",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          Dashboard
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "8px 10px",
                            background: "#f8fafc",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          Views
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topDashboards.map((d, i) => (
                        <tr
                          key={d.templateId}
                          style={{ borderBottom: "1px solid #F2F4F7" }}
                        >
                          <td style={{ padding: "8px 10px", color: "#667085" }}>
                            {i + 1}
                          </td>
                          <td style={{ padding: "8px 10px", color: "#344054" }}>
                            {d.name || d.templateId}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              color: "#101828",
                              fontWeight: 600,
                              textAlign: "right",
                            }}
                          >
                            {d.views.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: "18px 20px",
        borderTop: `4px solid ${color}`,
        boxShadow:
          "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "#667085",
          fontWeight: 500,
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#101828" }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
