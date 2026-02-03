import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Plus, Trash2, MoveUp, MoveDown } from 'lucide-react';
import { API_CONFIG } from '../../config/constants';

interface Column {
  columnName: string;
  columnType: 'text' | 'number' | 'date' | 'url' | 'file';
  isRequired: boolean;
  order: number;
  articleFieldMapping?: string[];
}

interface KBTableFormProps {
  projectId: string;
  table?: any;
  onClose: () => void;
  onSuccess: () => void;
}

const KBTableForm: React.FC<KBTableFormProps> = ({ projectId, table, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    tableName: '',
    description: '',
    levelIds: [] as string[],
    dataSource: 'manual' as 'manual' | 'articles',
    autoPopulateFromArticles: false,
    displayStyle: 'table' as 'table' | 'tiles',
    status: 'active' as 'active' | 'inactive',
    showSerialNumber: true,
    isSearchable: true,
    isPaginated: true,
  });
  const [columns, setColumns] = useState<Column[]>([
    { columnName: '', columnType: 'text', isRequired: false, order: 1 }
  ]);
  const [levels, setLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializedTableId, setInitializedTableId] = useState<string | null>(null);

  useEffect(() => {
    fetchLevels();
  }, [projectId]);

  useEffect(() => {
    const tableId = table?._id || null;
    if (table && initializedTableId !== tableId) {
      setFormData({
        tableName: table.tableName,
        description: table.description || '',
        levelIds: table.levelIds?.map((l: any) => l._id || l) || [],
        dataSource: table.dataSource || 'manual',
        autoPopulateFromArticles: table.autoPopulateFromArticles || false,
        displayStyle: table.displayStyle || 'table',
        status: table.status,
        showSerialNumber: table.showSerialNumber,
        isSearchable: table.isSearchable,
        isPaginated: table.isPaginated,
      });
      setColumns(table.columns || []);
      setInitializedTableId(tableId);
    }
  }, [table, initializedTableId]);

  const fetchLevels = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/levels`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { projectId, status: 'active' },
        }
      );
      setLevels(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch levels:', error);
    }
  };

  const handleAddColumn = () => {
    setColumns([...columns, {
      columnName: '',
      columnType: 'text',
      isRequired: false,
      order: columns.length + 1,
      articleFieldMapping: [],
    }]);
  };

  const handleRemoveColumn = (index: number) => {
    const newColumns = columns.filter((_, i) => i !== index);
    setColumns(newColumns.map((col, i) => ({ ...col, order: i + 1 })));
  };

  const handleColumnChange = (index: number, field: string, value: any) => {
    const newColumns = [...columns];
    (newColumns[index] as any)[field] = value;
    setColumns(newColumns);
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === columns.length - 1)
    ) {
      return;
    }

    const newColumns = [...columns];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newColumns[index], newColumns[targetIndex]] = [newColumns[targetIndex], newColumns[index]];
    setColumns(newColumns.map((col, i) => ({ ...col, order: i + 1 })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.tableName.trim()) {
      alert('Table name is required');
      return;
    }

    if (columns.length === 0 || columns.some(col => !col.columnName.trim())) {
      alert('Please add at least one column with a name');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const payload = {
        ...formData,
        projectId,
        columns: columns.map((col, index) => ({
          ...col,
          order: index + 1
        })),
      };

      console.log('📤 Sending table payload:', payload);
      console.log('📊 Display Style:', payload.displayStyle);

      if (table) {
        await axios.put(
          `${API_CONFIG.API_URL}/kb/tables/${table._id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${API_CONFIG.API_URL}/kb/tables`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      onSuccess();
    } catch (error: any) {
      console.error('Failed to save table:', error);
      alert(error.response?.data?.message || 'Failed to save table');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl m-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">
            {table ? 'Edit Table Structure' : 'Create New Table'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Basic Info */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Table Name *</label>
            <input
              type="text"
              value={formData.tableName}
              onChange={(e) => setFormData({ ...formData, tableName: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
              rows={2}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              KB Levels (Optional) - Select multiple
            </label>
            <div className="border rounded px-3 py-2 bg-white max-h-48 overflow-y-auto">
              <label className="flex items-center gap-2 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.levelIds.length === 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFormData({ ...formData, levelIds: [] });
                    }
                  }}
                  className="rounded"
                />
                <span className="text-gray-600">-- No Level / All Levels --</span>
              </label>
              {levels.map((level) => (
                <label
                  key={level._id}
                  className="flex items-center gap-2 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={formData.levelIds.includes(level._id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          levelIds: [...formData.levelIds, level._id],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          levelIds: formData.levelIds.filter((id) => id !== level._id),
                        });
                      }
                    }}
                    className="rounded"
                  />
                  <span>
                    {level.levelIcon} {level.levelName}
                  </span>
                </label>
              ))}
            </div>
            {formData.levelIds.length > 0 && (
              <p className="text-xs text-blue-600 mt-1">
                Selected: {formData.levelIds.length} level(s)
              </p>
            )}
          </div>

          {/* Data Source */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Data Source *</label>
            <select
              value={formData.dataSource}
              onChange={(e) => {
                const newDataSource = e.target.value as 'manual' | 'articles';
                setFormData({ ...formData, dataSource: newDataSource });
              }}
              className="w-full border rounded px-3 py-2"
            >
              <option value="manual">Manual Entry</option>
              <option value="articles">Auto-populate from KB Articles</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {formData.dataSource === 'articles' 
                ? 'Table data will be automatically populated from KB Articles based on field mappings'
                : 'Table data will be entered manually'}
            </p>
          </div>

          {/* Display Style */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Display Style *</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                formData.displayStyle === 'table' 
                  ? 'border-blue-600 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}>
                <input
                  type="radio"
                  value="table"
                  checked={formData.displayStyle === 'table'}
                  onChange={(e) => setFormData({ ...formData, displayStyle: e.target.value as 'table' | 'tiles' })}
                  className="sr-only"
                />
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="font-medium">Table View</span>
                <span className="text-xs text-gray-500 text-center">Traditional table with rows and columns</span>
              </label>
              <label className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                formData.displayStyle === 'tiles' 
                  ? 'border-blue-600 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}>
                <input
                  type="radio"
                  value="tiles"
                  checked={formData.displayStyle === 'tiles'}
                  onChange={(e) => setFormData({ ...formData, displayStyle: e.target.value as 'table' | 'tiles' })}
                  className="sr-only"
                />
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                <span className="font-medium">Tile View</span>
                <span className="text-xs text-gray-500 text-center">Cards displayed directly under levels</span>
              </label>
            </div>
          </div>

          {/* Columns */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Columns *</label>
              <button
                type="button"
                onClick={handleAddColumn}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
              >
                <Plus size={16} />
                Add Column
              </button>
            </div>

            <div className="space-y-2">
              {columns.map((column, index) => (
                <div key={index} className="flex gap-2 items-start p-3 border rounded bg-gray-50">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 'up')}
                      disabled={index === 0}
                      className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                    >
                      <MoveUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(index, 'down')}
                      disabled={index === columns.length - 1}
                      className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                    >
                      <MoveDown size={16} />
                    </button>
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Column Name"
                        value={column.columnName}
                        onChange={(e) => handleColumnChange(index, 'columnName', e.target.value)}
                        className="border rounded px-2 py-1"
                        required
                      />
                      <select
                        value={column.columnType}
                        onChange={(e) => handleColumnChange(index, 'columnType', e.target.value)}
                        className="border rounded px-2 py-1"
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="url">URL/Link</option>
                        <option value="file">File</option>
                      </select>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={column.isRequired}
                          onChange={(e) => handleColumnChange(index, 'isRequired', e.target.checked)}
                        />
                        <span className="text-sm">Required</span>
                      </label>
                    </div>

                    {/* Article Field Mapping - Always visible */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Map to Article Fields (Optional) - Select multiple
                      </label>
                      <div className="border rounded px-2 py-2 bg-white max-h-40 overflow-y-auto text-sm">
                        {[
                          { value: 'documentName', label: '📄 Document Name' },
                          { value: 'documentType', label: '📋 Document Type' },
                          { value: 'description', label: '📝 Description' },
                          { value: 'author', label: '✍️ Author' },
                          { value: 'publishedDate', label: '📅 Published Date' },
                          { value: 'viewsCount', label: '👁️ Views Count' },
                          { value: 'status', label: '🔘 Status' },
                          { value: 'tags', label: '🏷️ Tags' },
                          { value: 'pdfUrl', label: '📎 PDF URL' },
                          { value: 'externalUrl', label: '🔗 External URL' },
                          { value: 'isFeatured', label: '⭐ Is Featured' },
                          { value: 'showNewTag', label: '🆕 Show New Tag' },
                          { value: 'articleId', label: '🆔 Article ID' },
                          { value: 'articleLink', label: '🔗 Article Link' },
                        ].map((field) => (
                          <label key={field.value} className="flex items-center gap-2 py-1 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(column.articleFieldMapping || []).includes(field.value)}
                              onChange={(e) => {
                                const currentMappings = column.articleFieldMapping || [];
                                const newMappings = e.target.checked
                                  ? [...currentMappings, field.value]
                                  : currentMappings.filter(m => m !== field.value);
                                handleColumnChange(index, 'articleFieldMapping', newMappings);
                              }}
                              className="rounded"
                            />
                            <span>{field.label}</span>
                          </label>
                        ))}
                      </div>
                      {(column.articleFieldMapping || []).length > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                          Will show first available: {(column.articleFieldMapping || []).join(' → ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveColumn(index)}
                    className="p-1 hover:bg-red-100 rounded"
                  >
                    <Trash2 size={16} className="text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="mb-4 grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.showSerialNumber}
                onChange={(e) => setFormData({ ...formData, showSerialNumber: e.target.checked })}
              />
              <span className="text-sm">Show Serial Number</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isSearchable}
                onChange={(e) => setFormData({ ...formData, isSearchable: e.target.checked })}
              />
              <span className="text-sm">Enable Search</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isPaginated}
                onChange={(e) => setFormData({ ...formData, isPaginated: e.target.checked })}
              />
              <span className="text-sm">Enable Pagination</span>
            </label>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : table ? 'Update Table' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KBTableForm;
