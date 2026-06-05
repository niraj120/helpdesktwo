import React, { useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { Modal } from '../shared/Modal';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface TicketExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Active filters from the page — passed directly to the export query */
  filters?: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    projectId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  };
  /** Human-readable labels for each active filter (displayed as read-only chips) */
  filterLabels?: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    project?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  };
  /** Total tickets matching the current page filters — shown as "X tickets will be exported" */
  ticketCount?: number;
  /** Configured table columns (key + label) so the export matches the on-screen table */
  columns?: { key: string; label: string }[];
}

export const TicketExportModal: React.FC<TicketExportModalProps> = ({
  isOpen,
  onClose,
  filters = {},
  filterLabels = {},
  ticketCount,
  columns,
}) => {
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('csv');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_BASE_URL}/tickets/export`,
        { format: exportFormat, filters, columns },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          responseType: 'blob',
        }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `tickets_export_${new Date().toISOString().split('T')[0]}.${exportFormat === 'csv' ? 'csv' : 'xlsx'}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (err: any) {
      setError('Failed to export tickets. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Build read-only filter chips from labels (fall back to raw filter value if no label)
  const activeChips: { label: string; value: string }[] = [];
  if (filterLabels.status || filters.status)
    activeChips.push({ label: 'Status', value: filterLabels.status || filters.status! });
  if (filterLabels.priority || filters.priority)
    activeChips.push({ label: 'Priority', value: filterLabels.priority || filters.priority! });
  if (filterLabels.assignedTo || filters.assignedTo)
    activeChips.push({ label: 'Assigned To', value: filterLabels.assignedTo || filters.assignedTo! });
  if (filterLabels.project || filters.projectId)
    activeChips.push({ label: 'Project', value: filterLabels.project || filters.projectId! });
  if (filterLabels.dateFrom || filters.dateFrom)
    activeChips.push({ label: 'From', value: filterLabels.dateFrom || filters.dateFrom! });
  if (filterLabels.dateTo || filters.dateTo)
    activeChips.push({ label: 'To', value: filterLabels.dateTo || filters.dateTo! });
  if (filterLabels.search || filters.search)
    activeChips.push({ label: 'Search', value: filterLabels.search || filters.search! });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Tickets"
      size="sm"
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}

        {/* Ticket count */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
          <p className="text-3xl font-bold text-blue-700">{ticketCount ?? '—'}</p>
          <p className="text-sm text-blue-600 mt-1">
            {ticketCount === 1 ? 'ticket' : 'tickets'} will be exported
          </p>
        </div>

        {/* Active filter chips (read-only) */}
        {activeChips.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Active Filters
            </p>
            <div className="flex flex-wrap gap-2">
              {activeChips.map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs"
                >
                  <span className="text-gray-400">{chip.label}:</span>
                  <span className="font-medium">{chip.value}</span>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center">
            No filters active — all tickets will be exported.
          </p>
        )}

        <hr className="border-gray-200" />

        {/* Export format */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Export Format</p>
          <div className="flex gap-6">
            {(['csv', 'excel'] as const).map((fmt) => (
              <label key={fmt} className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value={fmt}
                  checked={exportFormat === fmt}
                  onChange={() => setExportFormat(fmt)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  {fmt === 'csv' ? 'CSV' : 'Excel (XLSX)'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Use the filters on the page to narrow the results before exporting.
        </p>
      </div>
    </Modal>
  );
};

export default TicketExportModal;
