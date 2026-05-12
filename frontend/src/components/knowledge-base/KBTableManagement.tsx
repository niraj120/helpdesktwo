import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  Table as TableIcon,
  List,
  RefreshCw,
} from "lucide-react";
import { API_CONFIG } from "../../config/constants";
import KBTableForm from "./KBTableForm";
import KBTableDataEditor from "./KBTableDataEditor";

interface KBTable {
  _id: string;
  tableName: string;
  description?: string;
  columns: Array<{
    columnName: string;
    columnType: string;
    isRequired: boolean;
    order: number;
  }>;
  rows?: any[]; // Optional - not included when includeRows=false
  status: "active" | "inactive";
  dataSource?: "manual" | "articles";
  levelId?: {
    _id: string;
    levelName: string;
    levelIcon?: string;
  };
  createdAt: string;
}

interface KBTableManagementProps {
  projectId: string;
}

const KBTableManagement: React.FC<KBTableManagementProps> = ({ projectId }) => {
  const [tables, setTables] = useState<KBTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDataEditor, setShowDataEditor] = useState(false);
  const [editingTable, setEditingTable] = useState<KBTable | null>(null);
  const [selectedTable, setSelectedTable] = useState<KBTable | null>(null);

  useEffect(() => {
    fetchTables();
  }, [projectId]);

  const fetchTables = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/tables`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          projectId,
          includeRows: "false", // Don't load row data for list view (performance optimization)
        },
      });
      // Handle both old format (array) and new paginated format
      const tablesData = Array.isArray(response.data.data)
        ? response.data.data
        : response.data.data || [];
      setTables(tablesData);
    } catch (error: any) {
      console.error("Failed to fetch KB tables:", error);
      alert(error.response?.data?.message || "Failed to fetch tables");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tableId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this table? All data will be lost.",
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(`${API_CONFIG.API_URL}/kb/tables/${tableId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTables();
    } catch (error: any) {
      console.error("Failed to delete table:", error);
      alert(error.response?.data?.message || "Failed to delete table");
    }
  };

  const handlePopulateFromArticles = async (tableId: string) => {
    if (
      !window.confirm(
        "This will replace all existing data in the table with data from KB Articles. Continue?",
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.post(
        `${API_CONFIG.API_URL}/kb/tables/${tableId}/populate-from-articles`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      alert(response.data.message || "Table populated successfully");
      fetchTables();
    } catch (error: any) {
      console.error("Failed to populate table:", error);
      alert(
        error.response?.data?.message ||
          "Failed to populate table from articles",
      );
    }
  };

  const handleEditStructure = (table: KBTable) => {
    setEditingTable(table);
    setShowModal(true);
  };

  const handleEditData = (table: KBTable) => {
    setSelectedTable(table);
    setShowDataEditor(true);
  };

  const totalTables = tables.length;
  const activeTables = tables.filter((t) => t.status === "active").length;
  const autoPop = tables.filter((t) => t.dataSource === "articles").length;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "64px",
        }}
      >
        <div style={{ color: "#667085", fontSize: "14px" }}>
          Loading tables...
        </div>
      </div>
    );
  }

  if (showDataEditor && selectedTable) {
    return (
      <KBTableDataEditor
        tableId={selectedTable._id}
        onClose={() => {
          setShowDataEditor(false);
          setSelectedTable(null);
          fetchTables();
        }}
        onSave={() => {
          fetchTables();
        }}
      />
    );
  }

  return (
    <div
      style={{
        background: "#F8F9FC",
        minHeight: "100vh",
        padding: "24px 20px 32px",
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Page Header */}
      <div
        style={{
          background: "#ffffff",
          padding: "22px 24px",
          borderRadius: "14px",
          marginBottom: "16px",
          border: "1px solid #e7ebf3",
          boxShadow: "0 4px 18px rgba(15,23,42,.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 4px 0",
              fontSize: "22px",
              fontWeight: 700,
              color: "#101828",
              letterSpacing: "-0.01em",
            }}
          >
            📊 Knowledge Base Tables
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#667085" }}>
            Create and manage dynamic tables with custom columns
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTable(null);
            setShowModal(true);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#7F56D9",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={18} />
          Create Table
        </button>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        {[
          {
            label: "Total Tables",
            value: totalTables,
            bg: "#F4F3FF",
            icon: "📊",
          },
          { label: "Active", value: activeTables, bg: "#ECFDF3", icon: "✅" },
          {
            label: "Auto-populated",
            value: autoPop,
            bg: "#EFF8FF",
            icon: "🔄",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: "1 1 160px",
              background: "white",
              borderRadius: "10px",
              padding: "16px 20px",
              border: "1px solid #E4E7EC",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "50%",
                background: stat.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                flexShrink: 0,
              }}
            >
              {stat.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "#101828",
                  lineHeight: 1.2,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{ fontSize: "12px", color: "#667085", marginTop: "2px" }}
              >
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tables List */}
      <div
        style={{
          background: "white",
          borderRadius: "10px",
          border: "1px solid #E4E7EC",
          boxShadow: "0 1px 3px rgba(0,0,0,.06)",
          overflow: "hidden",
        }}
      >
        {/* Table Header Row */}
        <div
          style={{
            background: "#F9FAFB",
            borderBottom: "1px solid #E4E7EC",
            display: "grid",
            gridTemplateColumns: "2fr 100px 120px 80px 80px 200px",
            padding: "12px 16px",
            gap: "0",
          }}
        >
          {[
            "TABLE NAME",
            "STATUS",
            "DATA SOURCE",
            "COLUMNS",
            "ROWS",
            "ACTIONS",
          ].map((h, i) => (
            <div
              key={i}
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#667085",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {tables.length === 0 ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📊</div>
            <p style={{ color: "#667085", fontSize: "14px", margin: 0 }}>
              No tables found. Click <strong>Create Table</strong> to get
              started.
            </p>
          </div>
        ) : (
          tables.map((table) => (
            <div
              key={table._id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 100px 120px 80px 80px 200px",
                padding: "14px 16px",
                borderBottom: "1px solid #F2F4F7",
                alignItems: "center",
                background: "white",
                borderLeft: `3px solid ${table.status === "active" ? "#027A48" : "#E4E7EC"}`,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#F9FAFB")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              {/* Name + Description */}
              <div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <TableIcon
                    size={16}
                    style={{ color: "#7F56D9", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#101828",
                    }}
                  >
                    {table.tableName}
                  </span>
                </div>
                {table.description && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#667085",
                      marginTop: "2px",
                      paddingLeft: "24px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {table.description}
                  </div>
                )}
              </div>
              {/* Status badge */}
              <div>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background:
                      table.status === "active" ? "#ECFDF3" : "#F2F4F7",
                    color: table.status === "active" ? "#027A48" : "#344054",
                  }}
                >
                  {table.status}
                </span>
              </div>
              {/* Data source */}
              <div>
                {table.dataSource === "articles" ? (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "#EFF8FF",
                      color: "#175CD3",
                    }}
                  >
                    🔄 Auto
                  </span>
                ) : (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "#F2F4F7",
                      color: "#344054",
                    }}
                  >
                    Manual
                  </span>
                )}
              </div>
              {/* Columns */}
              <div
                style={{ fontSize: "13px", color: "#344054", fontWeight: 500 }}
              >
                {table.columns.length}
              </div>
              {/* Rows */}
              <div
                style={{ fontSize: "13px", color: "#344054", fontWeight: 500 }}
              >
                {table.rows?.length ?? "—"}
              </div>
              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                {table.dataSource === "articles" && (
                  <button
                    onClick={() => handlePopulateFromArticles(table._id)}
                    title="Refresh from articles"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "1px solid #BBF7D0",
                      background: "#F0FDF4",
                      color: "#15803D",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <RefreshCw size={13} />
                    Populate
                  </button>
                )}
                <button
                  onClick={() => handleEditData(table)}
                  title={
                    table.dataSource === "articles"
                      ? "View Data"
                      : "Manage Data"
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid #E4E7EC",
                    background: "white",
                    color: "#344054",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <List size={13} />
                  {table.dataSource === "articles" ? "View" : "Data"}
                </button>
                <button
                  onClick={() => handleEditStructure(table)}
                  title="Edit Structure"
                  style={{
                    padding: "5px 8px",
                    borderRadius: "6px",
                    border: "1px solid #E4E7EC",
                    background: "white",
                    color: "#7F56D9",
                    cursor: "pointer",
                  }}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(table._id)}
                  title="Delete"
                  style={{
                    padding: "5px 8px",
                    borderRadius: "6px",
                    border: "1px solid #FCA5A5",
                    background: "#FEF2F2",
                    color: "#DC2626",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}

        {tables.length > 0 && (
          <div
            style={{
              padding: "12px 16px",
              background: "#F9FAFB",
              borderTop: "1px solid #E4E7EC",
              fontSize: "13px",
              color: "#667085",
            }}
          >
            {totalTables} table{totalTables !== 1 ? "s" : ""} total
          </div>
        )}
      </div>

      {showModal && (
        <KBTableForm
          projectId={projectId}
          table={editingTable}
          onClose={() => {
            setShowModal(false);
            setEditingTable(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingTable(null);
            fetchTables();
          }}
        />
      )}
    </div>
  );
};

export default KBTableManagement;
