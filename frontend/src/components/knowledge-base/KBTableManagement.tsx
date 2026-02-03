import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, Eye, Table as TableIcon, List, RefreshCw } from 'lucide-react';
import { API_CONFIG } from '../../config/constants';
import KBTableForm from './KBTableForm';
import KBTableDataEditor from './KBTableDataEditor';

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
  status: 'active' | 'inactive';
  dataSource?: 'manual' | 'articles';
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
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/tables`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { 
            projectId,
            includeRows: 'false' // Don't load row data for list view (performance optimization)
          },
        }
      );
      // Handle both old format (array) and new paginated format
      const tablesData = Array.isArray(response.data.data) 
        ? response.data.data 
        : response.data.data || [];
      setTables(tablesData);
    } catch (error: any) {
      console.error('Failed to fetch KB tables:', error);
      alert(error.response?.data?.message || 'Failed to fetch tables');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tableId: string) => {
    if (!window.confirm('Are you sure you want to delete this table? All data will be lost.')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(
        `${API_CONFIG.API_URL}/kb/tables/${tableId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchTables();
    } catch (error: any) {
      console.error('Failed to delete table:', error);
      alert(error.response?.data?.message || 'Failed to delete table');
    }
  };

  const handlePopulateFromArticles = async (tableId: string) => {
    if (!window.confirm('This will replace all existing data in the table with data from KB Articles. Continue?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_CONFIG.API_URL}/kb/tables/${tableId}/populate-from-articles`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(response.data.message || 'Table populated successfully');
      fetchTables();
    } catch (error: any) {
      console.error('Failed to populate table:', error);
      alert(error.response?.data?.message || 'Failed to populate table from articles');
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

  if (loading) {
    return <div className="text-center py-8">Loading tables...</div>;
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Knowledge Base Tables</h2>
          <p className="text-gray-600 mt-1">Create and manage dynamic tables with custom columns</p>
        </div>
        <button
          onClick={() => {
            setEditingTable(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Create Table
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        {tables.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No tables found. Create your first table to get started.
          </div>
        ) : (
          <div className="divide-y">
            {tables.map((table) => (
              <div key={table._id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <TableIcon size={24} className="text-blue-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{table.tableName}</h3>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              table.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {table.status}
                          </span>
                          {table.levelId && (
                            <span className="text-sm text-gray-600">
                              {table.levelId.levelIcon} {table.levelId.levelName}
                            </span>
                          )}
                        </div>
                        {table.description && (
                          <p className="text-sm text-gray-600 mt-1">{table.description}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span>{table.columns.length} columns</span>
                          <span>{table.rows?.length || 0} rows</span>
                          {table.dataSource === 'articles' && (
                            <span className="text-blue-600 font-medium">📊 Auto-populated</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {table.dataSource === 'articles' && (
                      <button
                        onClick={() => handlePopulateFromArticles(table._id)}
                        className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                        title="Refresh data from articles"
                      >
                        <RefreshCw size={18} />
                        Populate
                      </button>
                    )}
                    <button
                      onClick={() => handleEditData(table)}
                      className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      title="Edit Data"
                    >
                      <List size={18} />
                      {table.dataSource === 'articles' ? 'View Data' : 'Manage Data'}
                    </button>
                    <button
                      onClick={() => handleEditStructure(table)}
                      className="p-2 hover:bg-gray-200 rounded"
                      title="Edit Structure"
                    >
                      <Edit2 size={18} className="text-blue-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(table._id)}
                      className="p-2 hover:bg-gray-200 rounded"
                      title="Delete"
                    >
                      <Trash2 size={18} className="text-red-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
