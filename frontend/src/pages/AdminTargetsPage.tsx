/**
 * AdminTargetsPage — Phase 5 (US-051)
 *
 * Route: /admin/targets (permission: dashboard.manage)
 *
 * Shows all projects with their user enrollment targets.
 * Supports inline editing of the "Required" target value.
 * Gap / % Filled columns are colour-coded.
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import API_CONFIG from "../config/api";
import DashboardLayout from "../components/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectTarget {
  _id: string;
  projectCode: string;
  projectName: string;
  userTarget?: {
    required: number | null;
    requiredUpdatedBy?: { name: string; email: string } | null;
    requiredUpdatedAt?: string | null;
  };
  currentUserCount?: number;
}

interface ProjectTargetRow extends ProjectTarget {
  editingRequired: boolean;
  draftRequired: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function fetchProjectTargets(): Promise<ProjectTarget[]> {
  const res = await fetch(
    `${API_CONFIG.API_URL}/projects?includeUserCount=true&limit=100`,
    {
      headers: authHeaders(),
    },
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.message ?? "Failed to load projects");
  return Array.isArray(json.data) ? json.data : (json.data?.projects ?? []);
}

async function updateRequired(
  projectId: string,
  required: number | null,
): Promise<void> {
  const res = await fetch(
    `${API_CONFIG.API_URL}/projects/${projectId}/user-target`,
    {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ required }),
    },
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.message ?? "Failed to save target");
}

// ─── Gap colour helper ────────────────────────────────────────────────────────

function gapColour(pct: number | null): string {
  if (pct === null) return "#9ca3af";
  if (pct > 20) return "#ef4444"; // red  — >20% gap
  if (pct > 5) return "#f59e0b"; // amber — 5–20%
  return "#10b981"; // green — <5%
}

// ─── AdminTargetsPage ─────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AdminTargetsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ProjectTargetRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    isLoading,
    isError,
    error: fetchError,
  } = useQuery<ProjectTarget[]>(["adminProjectTargets"], fetchProjectTargets, {
    staleTime: 60_000,
    onSuccess: (data) => {
      setRows(
        data.map((p) => ({
          ...p,
          editingRequired: false,
          draftRequired:
            p.userTarget?.required != null ? String(p.userTarget.required) : "",
        })),
      );
    },
  });

  const mutation = useMutation({
    mutationFn: ({ id, required }: { id: string; required: number | null }) =>
      updateRequired(id, required),
    onSuccess: () => {
      queryClient.invalidateQueries(["adminProjectTargets"]);
      setError(null);
    },
    onError: (err: any) => setError(err.message ?? "Save failed"),
  });

  const startEdit = (idx: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, editingRequired: true } : r)),
    );
  };

  const cancelEdit = (idx: number) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              editingRequired: false,
              draftRequired:
                r.userTarget?.required != null
                  ? String(r.userTarget.required)
                  : "",
            }
          : r,
      ),
    );
  };

  const saveEdit = (idx: number) => {
    const row = rows[idx];
    const val = row.draftRequired.trim();
    const required = val === "" ? null : Number(val);
    if (val !== "" && (isNaN(required as number) || (required as number) < 0)) {
      setError("Required must be a non-negative number or empty (to clear)");
      return;
    }
    mutation.mutate({ id: row._id, required });
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, editingRequired: false } : r)),
    );
  };

  // Pagination
  const paginated = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#101828",
              margin: 0,
            }}
          >
            Target Management
          </h1>
          <p style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>
            Set enrollment targets per project. Gap is relative to current
            active user count.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 16px",
              background: "#FEF3F2",
              border: "1px solid #FECDCA",
              borderRadius: 8,
              color: "#B42318",
              fontSize: 13,
            }}
          >
            {error}{" "}
            <button
              onClick={() => setError(null)}
              style={{
                background: "none",
                border: "none",
                color: "#B42318",
                cursor: "pointer",
                fontWeight: 600,
                marginLeft: 8,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {isLoading && (
          <div style={{ color: "#667085", fontSize: 13 }}>
            Loading projects…
          </div>
        )}
        {isError && (
          <div style={{ color: "#F04438", fontSize: 13 }}>
            {(fetchError as Error)?.message ?? "Failed to load projects"}
          </div>
        )}

        {!isLoading && !isError && (
          <>
            <div
              style={{
                overflowX: "auto",
                borderRadius: 10,
                border: "1px solid #E4E7EC",
                boxShadow: "0 1px 3px rgba(0,0,0,.06)",
                background: "#fff",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#F9FAFB",
                      borderBottom: "1px solid #E4E7EC",
                    }}
                  >
                    {[
                      "Project",
                      "Code",
                      "Required",
                      "Current",
                      "Gap",
                      "% Filled",
                      "Last Updated By",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "#667085",
                          whiteSpace: "nowrap",
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          padding: "24px 14px",
                          color: "#667085",
                          textAlign: "center",
                        }}
                      >
                        No projects found.
                      </td>
                    </tr>
                  )}
                  {paginated.map((row, idx) => {
                    const globalIdx = (page - 1) * PAGE_SIZE + idx;
                    const required = row.userTarget?.required ?? null;
                    const current = row.currentUserCount ?? null;
                    const gap =
                      required != null && current != null
                        ? required - current
                        : null;
                    const pctFilled =
                      required != null && required > 0 && current != null
                        ? Math.min(100, Math.round((current / required) * 100))
                        : null;
                    const gapPct =
                      gap != null && required != null && required > 0
                        ? Math.round((gap / required) * 100)
                        : null;

                    return (
                      <tr
                        key={row._id}
                        style={{
                          borderBottom: "1px solid #F2F4F7",
                          background: globalIdx % 2 === 0 ? "#fff" : "#FAFAFA",
                        }}
                      >
                        {/* Project name */}
                        <td
                          style={{
                            padding: "10px 14px",
                            fontWeight: 500,
                            color: "#101828",
                          }}
                        >
                          {row.projectName}
                        </td>
                        {/* Project code */}
                        <td
                          style={{
                            padding: "10px 14px",
                            color: "#667085",
                            fontFamily: "monospace",
                          }}
                        >
                          {row.projectCode}
                        </td>
                        {/* Required (inline edit) */}
                        <td style={{ padding: "10px 14px" }}>
                          {row.editingRequired ? (
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                alignItems: "center",
                              }}
                            >
                              <input
                                type="number"
                                min={0}
                                value={row.draftRequired}
                                onChange={(e) =>
                                  setRows((prev) =>
                                    prev.map((r, i) =>
                                      i === globalIdx
                                        ? {
                                            ...r,
                                            draftRequired: e.target.value,
                                          }
                                        : r,
                                    ),
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit(globalIdx);
                                  if (e.key === "Escape") cancelEdit(globalIdx);
                                }}
                                autoFocus
                                style={{
                                  width: 80,
                                  border: "1px solid #6366f1",
                                  borderRadius: 4,
                                  padding: "4px 8px",
                                  fontSize: 13,
                                  outline: "none",
                                }}
                              />
                              <button
                                onClick={() => saveEdit(globalIdx)}
                                style={{
                                  fontSize: 11,
                                  color: "#10b981",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontWeight: 700,
                                }}
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => cancelEdit(globalIdx)}
                                style={{
                                  fontSize: 11,
                                  color: "#9ca3af",
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  color:
                                    required == null ? "#667085" : "#101828",
                                }}
                              >
                                {required == null
                                  ? "—"
                                  : required.toLocaleString()}
                              </span>
                              <button
                                onClick={() => startEdit(globalIdx)}
                                title={
                                  required == null
                                    ? "Set target"
                                    : "Edit target"
                                }
                                style={{
                                  fontSize: 11,
                                  color: "#6366f1",
                                  background: "none",
                                  border: "1px solid #c7d2fe",
                                  borderRadius: 4,
                                  padding: "2px 8px",
                                  cursor: "pointer",
                                }}
                              >
                                {required == null ? "+ Set" : "Edit"}
                              </button>
                            </div>
                          )}
                        </td>
                        {/* Current */}
                        <td
                          style={{
                            padding: "10px 14px",
                            color: current == null ? "#667085" : "#101828",
                          }}
                        >
                          {current == null ? "—" : current.toLocaleString()}
                        </td>
                        {/* Gap */}
                        <td
                          style={{
                            padding: "10px 14px",
                            fontWeight: 600,
                            color:
                              gap == null
                                ? "#667085"
                                : gap > 0
                                  ? "#F04438"
                                  : "#12B76A",
                          }}
                        >
                          {gap == null
                            ? "—"
                            : gap > 0
                              ? `+${gap.toLocaleString()}`
                              : gap.toLocaleString()}
                        </td>
                        {/* % Filled */}
                        <td style={{ padding: "10px 14px", minWidth: 120 }}>
                          {pctFilled == null ? (
                            <span style={{ color: "#667085" }}>—</span>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  height: 6,
                                  background: "#f3f4f6",
                                  borderRadius: 3,
                                  overflow: "hidden",
                                  minWidth: 60,
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pctFilled}%`,
                                    height: "100%",
                                    background: gapColour(gapPct),
                                    borderRadius: 3,
                                    transition: "width 0.3s",
                                  }}
                                />
                              </div>
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#667085",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {pctFilled}%
                              </span>
                            </div>
                          )}
                        </td>
                        {/* Last updated by */}
                        <td
                          style={{
                            padding: "10px 14px",
                            color: "#667085",
                            fontSize: 12,
                          }}
                        >
                          {row.userTarget?.requiredUpdatedBy?.name ?? "—"}
                          {row.userTarget?.requiredUpdatedAt && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "#98A2B3",
                                marginTop: 2,
                              }}
                            >
                              {new Date(
                                row.userTarget.requiredUpdatedAt,
                              ).toLocaleDateString("en-IN")}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  style={{
                    padding: "6px 16px",
                    fontSize: 13,
                    border: "1px solid #D0D5DD",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: page === 1 ? "not-allowed" : "pointer",
                    color: page === 1 ? "#98A2B3" : "#344054",
                  }}
                >
                  ← Prev
                </button>
                <span
                  style={{
                    fontSize: 13,
                    color: "#667085",
                    alignSelf: "center",
                  }}
                >
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    padding: "6px 16px",
                    fontSize: 13,
                    border: "1px solid #D0D5DD",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: page === totalPages ? "not-allowed" : "pointer",
                    color: page === totalPages ? "#98A2B3" : "#344054",
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
