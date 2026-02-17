import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, Download, ExternalLink, Calendar, X, Search } from 'lucide-react';
import { API_CONFIG } from '../../config/constants';
import ContentViewerModal from './ContentViewerModal';

interface TableColumn {
  columnName: string;
  columnType: 'text' | 'number' | 'date' | 'url' | 'file';
  isRequired: boolean;
  order: number;
  articleFieldMapping?: string;
}

interface TableRow {
  _id: string;
  rowData: { [key: string]: any };
  order: number;
}

interface KBTableData {
  _id: string;
  tableName: string;
  description?: string;
  displayStyle?: 'table' | 'tiles';
  columns: TableColumn[];
  rows: TableRow[];
  showSerialNumber: boolean;
  isSearchable: boolean;
  isPaginated: boolean;
}

interface KBTableViewerProps {
  tableId: string;
  levelId?: string; // Optional: filter table data by specific level
  onClose?: () => void;
  showHeader?: boolean;
  autoPopulate?: boolean;
}

const KBTableViewer: React.FC<KBTableViewerProps> = ({ 
  tableId, 
  levelId,
  onClose, 
  showHeader = true, 
  autoPopulate = true 
}) => {
  const [table, setTable] = useState<KBTableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingArticleId, setViewingArticleId] = useState<string | null>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchTable();
  }, [tableId, levelId]);

  const fetchTable = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      // Build query params - include levelId if provided to filter articles
      const params: Record<string, string> = {};
      if (levelId) {
        params.levelId = levelId;
      }
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/tables/public/${tableId}`,
        { headers, params }
      );
      // Set default displayStyle for backward compatibility
      const tableData = response.data.data;
      if (!tableData.displayStyle) {
        tableData.displayStyle = 'table';
      }
      setTable(tableData);
      
      // Auto-populate table from articles if enabled and no rows exist
      if (autoPopulate && (!response.data.data.rows || response.data.data.rows.length === 0)) {
        await populateFromArticles(tableId, token || '');
        // Refetch after population
        const updatedResponse = await axios.get(
          `${API_CONFIG.API_URL}/kb/tables/public/${tableId}`,
          { headers, params }
        );
        // Set default displayStyle for backward compatibility
        const updatedTableData = updatedResponse.data.data;
        if (!updatedTableData.displayStyle) {
          updatedTableData.displayStyle = 'table';
        }
        setTable(updatedTableData);
      }
    } catch (error) {
      console.error('Failed to fetch table:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const populateFromArticles = async (id: string, token: string) => {
    try {
      await axios.post(
        `${API_CONFIG.API_URL}/kb/tables/${id}/populate-from-articles`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Failed to populate table:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading table...</div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Table not found</p>
      </div>
    );
  }

  // Filter rows based on search query
  const filteredRows = table.isSearchable && searchQuery
    ? table.rows.filter(row =>
        Object.values(row.rowData).some(value =>
          String(value).toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : table.rows;

  // Pagination
  const totalPages = table.isPaginated ? Math.ceil(filteredRows.length / itemsPerPage) : 1;
  const paginatedRows = table.isPaginated
    ? filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : filteredRows;

  const sortedColumns = [...table.columns].sort((a, b) => a.order - b.order);

  const renderCellContent = (column: TableColumn, value: any, row: TableRow) => {
    if (!value || value === 'N/A') {
      return <span className="text-gray-400 italic">N/A</span>;
    }

    // Handle showNewTag field - render as badge instead of text
    if (column.columnName.toLowerCase().includes('new') || column.articleFieldMapping?.includes('showNewTag') || value === 'Yes' || value === 'No' || value === true || value === false) {
      if (value === 'Yes' || value === true) {
        return (
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-md bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg animate-pulse">
            🔥 NEW
          </span>
        );
      } else if (value === 'No' || value === false) {
        return <span className="text-gray-400 text-xs">—</span>;
      }
    }

    // Auto-detect URLs even if column type is 'text'
    const isUrl = typeof value === 'string' && (
      value.startsWith('http://') || 
      value.startsWith('https://') || 
      value.startsWith('www.') ||
      value.startsWith('/kb')
    );

    // Special handling for columns named 'View', 'Download', 'Link', 'URL', etc.
    const isLinkColumn = column.columnName.toLowerCase().match(/view|download|link|url|open/);

    // If it's a URL or looks like a link column with a URL value, render as link
    if ((column.columnType === 'url' || isUrl || (isLinkColumn && isUrl)) && typeof value === 'string') {
      // Check if this is a KB article link (contains article ID)
      const isKBArticle = value.includes('/kb/') || row._id;
      const isExternalUrl = value.startsWith('http');
      
      if (isKBArticle && row._id) {
        // Open in modal for PDF/HTML content
        return (
          <button
            onClick={() => setViewingArticleId(row._id)}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
          >
            <ExternalLink size={16} />
            <span>{column.columnName.toLowerCase().includes('download') ? 'Download' : 'View'}</span>
          </button>
        );
      } else if (isExternalUrl) {
        // Open external URLs in new tab
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:text-green-800 flex items-center gap-1 hover:underline"
          >
            <ExternalLink size={16} />
            <span>External Link</span>
          </a>
        );
      } else {
        // Default link behavior
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
          >
            <ExternalLink size={16} />
            <span>{column.columnName.toLowerCase().includes('download') ? 'Download' : 'View'}</span>
          </a>
        );
      }
    }

    switch (column.columnType) {
      case 'file':
        return (
          <a
            href={value}
            download
            className="text-green-600 hover:text-green-800 flex items-center gap-1 hover:underline"
          >
            <Download size={16} />
            <span>Download</span>
          </a>
        );
      case 'date':
        return <span className="text-gray-900">{new Date(value).toLocaleDateString()}</span>;
      case 'number':
        return <span className="font-medium text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</span>;
      default:
        return <span className="text-gray-900">{value}</span>;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      {showHeader && (
        <div className="p-6 border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Table size={28} className="text-blue-600" />
                <h2 className="text-2xl font-bold">{table.tableName}</h2>
              </div>
              {table.description && (
                <p className="text-gray-600 mt-2">{table.description}</p>
              )}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            )}
          </div>

          {/* Search */}
          {table.isSearchable && (
            <div className="mt-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search table..."
                className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      )}
      
      {/* Search (when header is hidden) */}
      {!showHeader && table.isSearchable && (
        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Search size={20} className="text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search in table..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 bg-white shadow-sm"
            />
          </div>
        </div>
      )}

      {/* Table */}
      {table.displayStyle === 'tiles' ? (
        /* Tile View */
        <div className="p-8 bg-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedRows.length === 0 ? (
              <div className="col-span-full text-center py-16 text-gray-500">
                <div className="text-6xl mb-4">📋</div>
                <p className="text-lg">{searchQuery ? 'No results found' : 'No data available'}</p>
              </div>
            ) : (
              paginatedRows.map((row, index) => (
                <div
                  key={row._id}
                  className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-gray-200 hover:border-blue-400 hover:scale-105 transform"
                >
                  {/* Card Body */}
                  <div className="p-5 space-y-4">
                    {sortedColumns.map((column) => (
                      <div key={column.columnName} className="group">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            {column.columnName}
                            {column.isRequired && <span className="text-red-500">*</span>}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-gray-900 mt-1">
                          {renderCellContent(column, row.rowData[column.columnName], row)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
                {table.showSerialNumber && (
                  <th className="px-6 py-4 text-left text-sm font-bold border-r border-blue-500">
                    Sr.No
                  </th>
                )}
                {sortedColumns.map((column, idx) => (
                  <th
                    key={column.columnName}
                    className={`px-6 py-4 text-left text-sm font-bold ${idx < sortedColumns.length - 1 ? 'border-r border-blue-500' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {column.columnName}
                      {column.isRequired && <span className="text-red-300">*</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={sortedColumns.length + (table.showSerialNumber ? 1 : 0)}
                    className="px-6 py-16 text-center border-b border-gray-200"
                  >
                    <div className="text-gray-500">
                      <div className="text-5xl mb-3">📋</div>
                      <p className="text-lg">{searchQuery ? 'No results found' : 'No data available'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => (
                  <tr key={row._id} className="hover:bg-blue-50 transition-all duration-200 border-b border-gray-200 group">
                    {table.showSerialNumber && (
                      <td className="px-6 py-5 text-sm font-semibold text-gray-900 border-r border-gray-200">
                        <div className="flex items-center gap-2">
                          <span className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </span>
                        </div>
                      </td>
                    )}
                    {sortedColumns.map((column, idx) => (
                      <td key={column.columnName} className={`px-6 py-5 text-sm ${idx < sortedColumns.length - 1 ? 'border-r border-gray-200' : ''}`}>
                        {renderCellContent(column, row.rowData[column.columnName], row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {table.isPaginated && totalPages > 1 && (
        <div className="px-6 py-5 bg-gradient-to-r from-gray-50 to-blue-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700">
            Showing <span className="font-bold text-blue-600">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-bold text-blue-600">{Math.min(currentPage * itemsPerPage, filteredRows.length)}</span> of{' '}
            <span className="font-bold text-blue-600">{filteredRows.length}</span> entries
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-5 py-2.5 bg-white border-2 border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-gray-700 transition-all shadow-sm"
            >
              Previous
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-4 py-2.5 rounded-lg font-medium transition-all shadow-sm ${
                      currentPage === pageNum
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-110'
                        : 'bg-white border-2 border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-5 py-2.5 bg-white border-2 border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-gray-700 transition-all shadow-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-4 bg-gray-50 border-t text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <span>Total Rows: {table.rows.length}</span>
          <span>Columns: {table.columns.length}</span>
        </div>
      </div>

      {/* Content Viewer Modal */}
      {viewingArticleId && (
        <ContentViewerModal
          articleId={viewingArticleId}
          onClose={() => setViewingArticleId(null)}
        />
      )}
    </div>
  );
};

export default KBTableViewer;
