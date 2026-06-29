/**
 * MyPersonalDashboardsPage — Phase 4
 *
 * Lists all personal dashboards for the current user.
 * Allows creating, editing, deleting, and setting a default.
 *
 * Route: /my-dashboards
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "../components/DashboardLayout";
import {
  listPersonalDashboards,
  deletePersonalDashboard,
  setDefaultPersonalDashboard,
  PersonalDashboard,
} from "../services/dashboardBuilderService";
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdStar,
  MdStarOutline,
  MdDashboard,
} from "react-icons/md";

const COLOUR_LABELS: Record<string, string> = {
  "#3b82f6": "Blue",
  "#8b5cf6": "Purple",
  "#22c55e": "Green",
  "#f97316": "Orange",
  "#ec4899": "Pink",
  "#14b8a6": "Teal",
  "#ef4444": "Red",
  "#6b7280": "Gray",
};

export default function MyPersonalDashboardsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const {
    data: dashboards = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PersonalDashboard[]>({
    queryKey: ["personalDashboards"],
    queryFn: listPersonalDashboards,
    staleTime: 60_000,
  });

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await deletePersonalDashboard(id);
      qc.invalidateQueries(["personalDashboards"]);
    } catch (e: any) {
      alert(e.message ?? "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    setSettingDefault(id);
    try {
      await setDefaultPersonalDashboard(id);
      qc.invalidateQueries(["personalDashboards"]);
    } catch (e: any) {
      alert(e.message ?? "Failed to set default");
    } finally {
      setSettingDefault(null);
    }
  };

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
                letterSpacing: "-0.02em",
                color: "#0f172a",
                margin: 0,
              }}
            >
              My Dashboards
            </h1>
            <p style={{ fontSize: 13, color: "#667085", margin: "4px 0 0" }}>
              Create and manage your personal dashboards
            </p>
          </div>
          <button
            onClick={() => navigate("/my-dashboards/new")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(160deg, #4f46e5, #4338ca)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(67,56,202,.35)",
            }}
          >
            <MdAdd size={18} />
            New Dashboard
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "60px 0",
              color: "#667085",
              fontSize: 14,
            }}
          >
            Loading dashboards…
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
                color: "#4f46e5",
                background: "none",
                border: "1px solid #4f46e5",
                borderRadius: 8,
                padding: "6px 16px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && dashboards.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 280,
              gap: 12,
              background: "#fff",
              borderRadius: 16,
              border: "2px dashed #e2e8f0",
              boxShadow: "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
            }}
          >
            <MdDashboard size={48} color="#D0D5DD" />
            <div style={{ fontSize: 16, fontWeight: 600, color: "#344054" }}>
              No personal dashboards yet
            </div>
            <div style={{ fontSize: 13, color: "#667085" }}>
              Create your first dashboard to get started
            </div>
            <button
              onClick={() => navigate("/my-dashboards/new")}
              style={{
                marginTop: 4,
                background: "linear-gradient(160deg, #4f46e5, #4338ca)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(67,56,202,.35)",
              }}
            >
              Create Dashboard
            </button>
          </div>
        )}

        {/* Dashboard cards */}
        {!isLoading && !isError && dashboards.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 16,
            }}
          >
            {dashboards.map((dash) => (
              <DashboardCard
                key={dash._id}
                dash={dash}
                deleting={deleting === dash._id}
                settingDefault={settingDefault === dash._id}
                onEdit={() => navigate(`/my-dashboards/${dash._id}/edit`)}
                onDelete={() => handleDelete(dash._id, dash.name)}
                onSetDefault={() => handleSetDefault(dash._id)}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Dashboard Card ───────────────────────────────────────────────────────────

interface CardProps {
  dash: PersonalDashboard;
  deleting: boolean;
  settingDefault: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}

function DashboardCard({
  dash,
  deleting,
  settingDefault,
  onEdit,
  onDelete,
  onSetDefault,
}: CardProps) {
  const colour = dash.colourLabel ?? "#3b82f6";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Colour strip */}
      <div style={{ height: 5, background: colour }} />

      {/* Body */}
      <div style={{ padding: "16px 18px 12px", flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#101828",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {dash.name}
            </div>
            {dash.description && (
              <div
                style={{
                  fontSize: 12,
                  color: "#667085",
                  marginTop: 3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {dash.description}
              </div>
            )}
          </div>
          {dash.isDefault && (
            <span
              title="Default dashboard"
              style={{
                flexShrink: 0,
                background: "#fef3c7",
                color: "#d97706",
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Default
            </span>
          )}
        </div>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 12,
            fontSize: 12,
            color: "#667085",
          }}
        >
          <span>
            {dash.widgets?.length ?? 0} widget
            {(dash.widgets?.length ?? 0) !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span>{dash.globalDateRangeDays}d window</span>
          {dash.colourLabel && COLOUR_LABELS[dash.colourLabel] && (
            <>
              <span>·</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: dash.colourLabel,
                    display: "inline-block",
                  }}
                />
                {COLOUR_LABELS[dash.colourLabel]}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid #f1f5f9",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <button
          onClick={onEdit}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            background: "linear-gradient(160deg, #4f46e5, #4338ca)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(67,56,202,.35)",
          }}
        >
          <MdEdit size={14} /> Edit
        </button>
        <button
          onClick={onSetDefault}
          disabled={dash.isDefault || settingDefault}
          title={dash.isDefault ? "Already default" : "Set as default"}
          style={{
            background: "none",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            padding: "6px 9px",
            cursor: dash.isDefault || settingDefault ? "default" : "pointer",
            color: dash.isDefault ? "#f59e0b" : "#667085",
            display: "flex",
            alignItems: "center",
            opacity: settingDefault ? 0.5 : 1,
          }}
        >
          {dash.isDefault ? <MdStar size={16} /> : <MdStarOutline size={16} />}
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          title="Delete"
          style={{
            background: "none",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "6px 9px",
            cursor: deleting ? "not-allowed" : "pointer",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            opacity: deleting ? 0.5 : 1,
          }}
        >
          <MdDelete size={16} />
        </button>
      </div>
    </div>
  );
}
