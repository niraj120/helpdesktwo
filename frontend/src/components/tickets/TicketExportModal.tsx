import React, { useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { Modal } from '../shared/Modal';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface TicketExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters?: {
    status?: string;
    priority?: string;
    category?: string;
    assignedTo?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}

export const TicketExportModal: React.FC<TicketExportModalProps> = ({
  isOpen,
  onClose,
  filters,
}) => {
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('csv');
  const [includeComments, setIncludeComments] = useState(false);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_BASE_URL}/tickets/export`,
        {
          format: exportFormat,
          includeComments,
          includeAttachments,
          filters: filters || {},
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          responseType: 'blob',
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.${exportFormat === 'csv' ? 'csv' : 'xlsx'}`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err: any) {
      console.error('Error exporting tickets:', err);
      setError('Failed to export tickets. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Tickets"
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            disabled={exporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Export Format */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Export Format
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="csv"
                checked={exportFormat === 'csv'}
                onChange={(e) => setExportFormat(e.target.value as 'csv')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                CSV (Comma Separated Values)
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="excel"
                checked={exportFormat === 'excel'}
                onChange={(e) => setExportFormat(e.target.value as 'excel')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                Excel (XLSX)
              </span>
            </label>
          </div>
        </div>

        {/* Include Options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Include Additional Data
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={includeComments}
                onChange={(e) => setIncludeComments(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                Include Comments
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                Include Attachment Information
              </span>
            </label>
          </div>
        </div>

        {/* Applied Filters */}
        {filters && Object.keys(filters).length > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-1">
              Active Filters:
            </p>
            <div className="text-sm text-blue-700 space-y-1">
              {filters.status && <p>• Status: {filters.status}</p>}
              {filters.priority && <p>• Priority: {filters.priority}</p>}
              {filters.category && <p>• Category: {filters.category}</p>}
              {filters.assignedTo && <p>• Assigned To: {filters.assignedTo}</p>}
              {filters.dateFrom && <p>• From: {filters.dateFrom}</p>}
              {filters.dateTo && <p>• To: {filters.dateTo}</p>}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500">
          The export will include all tickets matching the current filters. This may take a few moments for large datasets.
        </p>
      </div>
    </Modal>
  );
};

export default TicketExportModal;
