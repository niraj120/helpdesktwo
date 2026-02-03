import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../../config/constants';

interface Column {
  columnName: string;
  columnType: 'text' | 'number' | 'date' | 'url' | 'file';
  isRequired: boolean;
  order: number;
}

interface Row {
  _id: string;
  rowData: Record<string, any>;
  order: number;
}

interface Table {
  _id: string;
  tableName: string;
  columns: Column[];
  rows: Row[];
  showSerialNumber: boolean;
}

interface KBTableDataEditorProps {
  tableId: string;
  onClose: () => void;
  onSave: () => void;
}

const KBTableDataEditor: React.FC<KBTableDataEditorProps> = ({ tableId, onClose, onSave }) => {
  const [table, setTable] = useState<Table | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    fetchTableData();
  }, [tableId]);

  const fetchTableData = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/tables/${tableId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTable(response.data.data);
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load table data');
      setLoading(false);
    }
  };

  const handleAddRow = async () => {
    if (!table) return;

    // Validate required fields
    const missingFields = table.columns
      .filter(col => col.isRequired && !newRowData[col.columnName])
      .map(col => col.columnName);

    if (missingFields.length > 0) {
      setError(`Please fill required fields: ${missingFields.join(', ')}`);
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      await axios.post(
        `${API_CONFIG.API_URL}/kb/tables/${tableId}/rows`,
        { rowData: newRowData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewRowData({});
      setError('');
      fetchTableData();
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add row');
    }
  };

  const handleUpdateRow = async (rowId: string, rowData: Record<string, any>) => {
    if (!table) return;

    // Validate required fields
    const missingFields = table.columns
      .filter(col => col.isRequired && !rowData[col.columnName])
      .map(col => col.columnName);

    if (missingFields.length > 0) {
      setError(`Please fill required fields: ${missingFields.join(', ')}`);
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      await axios.put(
        `${API_CONFIG.API_URL}/kb/tables/${tableId}/rows/${rowId}`,
        { rowData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditingRowId(null);
      setError('');
      fetchTableData();
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update row');
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    if (!confirm('Are you sure you want to delete this row?')) return;

    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(`${API_CONFIG.API_URL}/kb/tables/${tableId}/rows/${rowId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTableData();
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete row');
    }
  };

  const renderInputField = (
    column: Column,
    value: any,
    onChange: (columnName: string, value: any) => void
  ) => {
    const inputStyle = {
      width: '100%',
      padding: '6px 10px',
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      fontSize: '14px',
    };

    switch (column.columnType) {
      case 'number':
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(column.columnName, parseFloat(e.target.value) || '')}
            style={inputStyle}
            required={column.isRequired}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(column.columnName, e.target.value)}
            style={inputStyle}
            required={column.isRequired}
          />
        );
      case 'url':
        return (
          <input
            type="url"
            value={value || ''}
            onChange={(e) => onChange(column.columnName, e.target.value)}
            style={inputStyle}
            placeholder="https://..."
            required={column.isRequired}
          />
        );
      case 'file':
        return (
          <input
            type="url"
            value={value || ''}
            onChange={(e) => onChange(column.columnName, e.target.value)}
            style={inputStyle}
            placeholder="File URL"
            required={column.isRequired}
          />
        );
      case 'text':
      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(column.columnName, e.target.value)}
            style={inputStyle}
            required={column.isRequired}
          />
        );
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '8px',
        }}>
          <p>Loading table data...</p>
        </div>
      </div>
    );
  }

  if (!table) {
    return null;
  }

  const sortedColumns = [...table.columns].sort((a, b) => a.order - b.order);
  const sortedRows = [...table.rows].sort((a, b) => a.order - b.order);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      overflow: 'auto',
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '30px',
        maxWidth: '1200px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>
            Manage Data: {table.tableName}
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '20px',
          }}>
            {error}
          </div>
        )}

        {/* Data Table */}
        <div style={{ overflowX: 'auto', marginBottom: '30px' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #e5e7eb',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                {table.showSerialNumber && (
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #e5e7eb',
                    fontWeight: 600,
                  }}>
                    Sr. No.
                  </th>
                )}
                {sortedColumns.map((col) => (
                  <th key={col.columnName} style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #e5e7eb',
                    fontWeight: 600,
                  }}>
                    {col.columnName}
                    {col.isRequired && <span style={{ color: '#dc2626' }}> *</span>}
                  </th>
                ))}
                <th style={{
                  padding: '12px',
                  textAlign: 'center',
                  borderBottom: '2px solid #e5e7eb',
                  fontWeight: 600,
                }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => (
                <tr key={row._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  {table.showSerialNumber && (
                    <td style={{ padding: '12px' }}>{index + 1}</td>
                  )}
                  {sortedColumns.map((col) => (
                    <td key={col.columnName} style={{ padding: '12px' }}>
                      {editingRowId === row._id ? (
                        renderInputField(col, row.rowData[col.columnName], (colName, value) => {
                          const updatedRow = sortedRows.find(r => r._id === row._id);
                          if (updatedRow) {
                            updatedRow.rowData[colName] = value;
                            setTable({ ...table, rows: sortedRows });
                          }
                        })
                      ) : (
                        <span>
                          {col.columnType === 'url' ? (
                            <a href={row.rowData[col.columnName]} target="_blank" rel="noopener noreferrer">
                              {row.rowData[col.columnName]}
                            </a>
                          ) : col.columnType === 'file' ? (
                            <a href={row.rowData[col.columnName]} target="_blank" rel="noopener noreferrer">
                              View File
                            </a>
                          ) : (
                            row.rowData[col.columnName] || '-'
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {editingRowId === row._id ? (
                      <>
                        <button
                          onClick={() => handleUpdateRow(row._id, row.rowData)}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginRight: '8px',
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingRowId(null);
                            fetchTableData();
                          }}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditingRowId(row._id)}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginRight: '8px',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRow(row._id)}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add New Row Form */}
        <div style={{
          padding: '20px',
          backgroundColor: '#f9fafb',
          borderRadius: '6px',
          border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Add New Row</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            {sortedColumns.map((col) => (
              <div key={col.columnName}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>
                  {col.columnName}
                  {col.isRequired && <span style={{ color: '#dc2626' }}> *</span>}
                </label>
                {renderInputField(col, newRowData[col.columnName], (colName, value) => {
                  setNewRowData({ ...newRowData, [colName]: value });
                })}
              </div>
            ))}
          </div>
          <button
            onClick={handleAddRow}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Add Row
          </button>
        </div>
      </div>
    </div>
  );
};

export default KBTableDataEditor;
