import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { API_CONFIG } from '../config/constants';
import {
  FiRefreshCw,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiX,
} from 'react-icons/fi';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';

interface APILog {
  _id: string;
  projectId?: string;
  projectName?: string;
  apiType: string;
  endpoint: string;
  method: string;
  requestHeaders?: Record<string, any>;
  requestBody?: Record<string, any>;
  responseStatus?: number;
  responseBody?: Record<string, any>;
  error?: string;
  status: 'success' | 'failed' | 'timeout' | 'retrying';
  metadata?: Record<string, any>;
  attempt: number;
  executionTime?: number;
  sentAt: string;
  createdAt: string;
  updatedAt: string;
}

interface Statistics {
  total: number;
  byStatus: Record<string, number>;
  byType: Array<{
    _id: string;
    count: number;
    failures: number;
  }>;
  dailyTrends: Array<{
    _id: string;
    total: number;
    success: number;
    failed: number;
  }>;
}

const WebhookFailureLogs: React.FC = () => {
  const [logs, setLogs] = useState<APILog[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<APILog | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [endpointFilter, setEndpointFilter] = useState<string>('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  const { hasPermission } = usePermissions();

  useEffect(() => {
    fetchLogs();
    fetchStatistics();
  }, [page, statusFilter, typeFilter, endpointFilter]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('apiType', typeFilter);
      if (endpointFilter) params.append('endpoint', endpointFilter);

      const response = await fetch(
        `${API_CONFIG.API_URL.replace('/api', '')}/api-logs?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch API logs');
      }

      const data = await response.json();
      setLogs(data.logs);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error('Error fetching API logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const token = localStorage.getItem('token');

      const response = await fetch(
        `${API_CONFIG.API_URL.replace('/api', '')}/api-logs/statistics`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch statistics');
      }

      const data = await response.json();
      setStatistics(data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const handleRefresh = () => {
    setPage(1);
    fetchLogs();
    fetchStatistics();
  };

  const handleViewDetails = (log: APILog) => {
    setSelectedLog(log);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setSelectedLog(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <FiCheckCircle className="text-green-500" />;
      case 'failed':
        return <FiAlertCircle className="text-red-500" />;
      case 'timeout':
        return <FiClock className="text-yellow-500" />;
      case 'retrying':
        return <FiRefreshCw className="text-blue-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-semibold';
    switch (status) {
      case 'success':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'failed':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'timeout':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'retrying':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!hasPermission(PERMISSIONS.AUDIT_VIEW_WEBHOOK_FAILURES) && 
      !hasPermission(PERMISSIONS.AUDIT_VIEW_INTEGRATION_FAILURES)) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-red-600">
            You don't have permission to view API failure logs.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Webhook & API Failure Logs
          </h1>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <FiRefreshCw />
            Refresh
          </button>
        </div>

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">Total API Calls</h3>
              <p className="text-2xl font-bold text-gray-900">{statistics.total}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-green-600">Successful</h3>
              <p className="text-2xl font-bold text-green-700">
                {statistics.byStatus.success || 0}
              </p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-red-600">Failed</h3>
              <p className="text-2xl font-bold text-red-700">
                {statistics.byStatus.failed || 0}
              </p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-yellow-600">Timeout</h3>
              <p className="text-2xl font-bold text-yellow-700">
                {statistics.byStatus.timeout || 0}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="timeout">Timeout</option>
                <option value="retrying">Retrying</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="webhook">Webhook</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="payment">Payment</option>
                <option value="hrms">HRMS</option>
                <option value="erp">ERP</option>
                <option value="chat">Chat</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Endpoint
              </label>
              <input
                type="text"
                value={endpointFilter}
                onChange={(e) => {
                  setEndpointFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter by endpoint..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    API Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Endpoint
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Response Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Execution Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                      No API logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(log.sentAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium uppercase">
                          {log.apiType}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-xs truncate" title={log.endpoint}>
                          {log.endpoint}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                          {log.method}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          <span className={getStatusBadge(log.status)}>
                            {log.status.toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.responseStatus || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.executionTime ? `${log.executionTime}ms` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.projectName || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleViewDetails(log)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Page <span className="font-medium">{page}</span> of{' '}
                    <span className="font-medium">{totalPages}</span>
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {showDetailModal && selectedLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">API Call Details</h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <FiX size={24} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Date & Time</label>
                    <p className="mt-1 text-sm text-gray-900">{formatDate(selectedLog.sentAt)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">API Type</label>
                    <p className="mt-1">
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm font-medium uppercase">
                        {selectedLog.apiType}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Method</label>
                    <p className="mt-1">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-mono">
                        {selectedLog.method}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <p className="mt-1">
                      <span className={getStatusBadge(selectedLog.status)}>
                        {selectedLog.status.toUpperCase()}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Response Status</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.responseStatus || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Execution Time</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {selectedLog.executionTime ? `${selectedLog.executionTime}ms` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Attempt</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.attempt}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Project</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.projectName || 'N/A'}</p>
                  </div>
                </div>

                {/* Endpoint */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Endpoint</label>
                  <p className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 p-2 rounded break-all">
                    {selectedLog.endpoint}
                  </p>
                </div>

                {/* Error Message */}
                {selectedLog.error && (
                  <div>
                    <label className="block text-sm font-medium text-red-700">Error Message</label>
                    <p className="mt-1 text-sm text-red-900 bg-red-50 p-3 rounded">
                      {selectedLog.error}
                    </p>
                  </div>
                )}

                {/* Request Headers */}
                {selectedLog.requestHeaders && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Request Headers
                    </label>
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                      {JSON.stringify(selectedLog.requestHeaders, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Request Body */}
                {selectedLog.requestBody && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Request Body
                    </label>
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                      {JSON.stringify(selectedLog.requestBody, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Response Body */}
                {selectedLog.responseBody && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Response Body
                    </label>
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                      {JSON.stringify(selectedLog.responseBody, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Metadata */}
                {selectedLog.metadata && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Metadata
                    </label>
                    <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default WebhookFailureLogs;
