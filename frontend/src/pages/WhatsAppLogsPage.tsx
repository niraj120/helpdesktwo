import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import ModuleHeader from '../components/ModuleHeader';
import {
    ChatBubbleLeftRightIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    FunnelIcon,
    ArrowPathIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';

interface WhatsAppLog {
    _id: string;
    projectId?: string;
    projectName?: string;
    recipient: string;
    templateName: string;
    templateLanguage?: string;
    status: 'sent' | 'delivered' | 'read' | 'failed' | 'blocked' | 'simulated';
    error?: string;
    whatsappMessageId?: string;
    triggerType?: string;
    triggerName?: string;
    metadata?: Record<string, any>;
    sentAt: string;
    deliveredAt?: string;
    readAt?: string;
}

interface Pagination {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
}

interface Statistics {
    totalMessages: number;
    statusBreakdown: Record<string, number>;
    triggerBreakdown: { _id: string; count: number; sent: number; failed: number }[];
    dailyStats: { _id: string; total: number; sent: number; failed: number }[];
}

const WhatsAppLogsPage: React.FC = () => {
    const [logs, setLogs] = useState<WhatsAppLog[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [statistics, setStatistics] = useState<Statistics | null>(null);
    const [loading, setLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedLog, setSelectedLog] = useState<WhatsAppLog | null>(null);

    // Filter state
    const [filters, setFilters] = useState({
        status: '',
        templateName: '',
        recipient: '',
        startDate: '',
        endDate: '',
        page: 1,
        limit: 20,
    });

    useEffect(() => {
        fetchLogs();
        fetchStatistics();
    }, [filters.page, filters.status]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('authToken');

            const params = new URLSearchParams();
            params.append('page', filters.page.toString());
            params.append('limit', filters.limit.toString());
            if (filters.status) params.append('status', filters.status);
            if (filters.templateName) params.append('templateName', filters.templateName);
            if (filters.recipient) params.append('recipient', filters.recipient);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);

            const response = await axios.get(`${API_BASE_URL}/whatsapp-logs?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setLogs(response.data.data);
            setPagination(response.data.pagination);
        } catch (error: any) {
            console.error('Error fetching WhatsApp logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStatistics = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const response = await axios.get(`${API_BASE_URL}/whatsapp-logs/statistics`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setStatistics(response.data.data);
        } catch (error: any) {
            console.error('Error fetching statistics:', error);
        }
    };

    const applyFilters = () => {
        setFilters({ ...filters, page: 1 });
        fetchLogs();
    };

    const clearFilters = () => {
        setFilters({
            status: '',
            templateName: '',
            recipient: '',
            startDate: '',
            endDate: '',
            page: 1,
            limit: 20,
        });
        fetchLogs();
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'sent':
                return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
            case 'delivered':
                return <CheckCircleIcon className="h-5 w-5 text-blue-500" />;
            case 'read':
                return <CheckCircleIcon className="h-5 w-5 text-purple-500" />;
            case 'failed':
                return <XCircleIcon className="h-5 w-5 text-red-500" />;
            case 'blocked':
                return <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />;
            case 'simulated':
                return <ClockIcon className="h-5 w-5 text-gray-400" />;
            default:
                return <ClockIcon className="h-5 w-5 text-gray-400" />;
        }
    };

    const getStatusBadgeColor = (status: string) => {
        switch (status) {
            case 'sent':
                return 'bg-green-100 text-green-800';
            case 'delivered':
                return 'bg-blue-100 text-blue-800';
            case 'read':
                return 'bg-purple-100 text-purple-800';
            case 'failed':
                return 'bg-red-100 text-red-800';
            case 'blocked':
                return 'bg-orange-100 text-orange-800';
            case 'simulated':
                return 'bg-gray-100 text-gray-600';
            default:
                return 'bg-gray-100 text-gray-600';
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

    const formatPhoneNumber = (phone: string) => {
        if (!phone) return 'N/A';
        // Format as +XX XXXXX XXXXX
        const digits = phone.replace(/\D/g, '');
        if (digits.length > 10) {
            return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
        }
        return phone;
    };

    return (
        <div className="p-6 space-y-6">
            <ModuleHeader
                title="WhatsApp Logs"
                subtitle="View all WhatsApp message logs and delivery status"
            />

            {/* Statistics Cards */}
            {statistics && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-gray-500">Total</div>
                        <div className="text-2xl font-bold text-gray-900">{statistics.totalMessages}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-green-600">Sent</div>
                        <div className="text-2xl font-bold text-green-600">{statistics.statusBreakdown.sent || 0}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-blue-600">Delivered</div>
                        <div className="text-2xl font-bold text-blue-600">{statistics.statusBreakdown.delivered || 0}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-purple-600">Read</div>
                        <div className="text-2xl font-bold text-purple-600">{statistics.statusBreakdown.read || 0}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-red-600">Failed</div>
                        <div className="text-2xl font-bold text-red-600">{statistics.statusBreakdown.failed || 0}</div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-sm text-gray-500">Simulated</div>
                        <div className="text-2xl font-bold text-gray-500">{statistics.statusBreakdown.simulated || 0}</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-lg shadow">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                    >
                        <FunnelIcon className="h-5 w-5" />
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </button>
                    <button
                        onClick={() => { fetchLogs(); fetchStatistics(); }}
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                    >
                        <ArrowPathIcon className="h-5 w-5" />
                        Refresh
                    </button>
                </div>

                {showFilters && (
                    <div className="p-4 border-b border-gray-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Status</label>
                                <select
                                    value={filters.status}
                                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-green-500 focus:border-green-500"
                                >
                                    <option value="">All Statuses</option>
                                    <option value="sent">Sent</option>
                                    <option value="delivered">Delivered</option>
                                    <option value="read">Read</option>
                                    <option value="failed">Failed</option>
                                    <option value="blocked">Blocked</option>
                                    <option value="simulated">Simulated</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Template Name</label>
                                <input
                                    type="text"
                                    value={filters.templateName}
                                    onChange={(e) => setFilters({ ...filters, templateName: e.target.value })}
                                    placeholder="Search template..."
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-green-500 focus:border-green-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Recipient</label>
                                <input
                                    type="text"
                                    value={filters.recipient}
                                    onChange={(e) => setFilters({ ...filters, recipient: e.target.value })}
                                    placeholder="Phone number..."
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-green-500 focus:border-green-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={filters.startDate}
                                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-green-500 focus:border-green-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={filters.endDate}
                                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-green-500 focus:border-green-500"
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button
                                onClick={applyFilters}
                                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                            >
                                Apply Filters
                            </button>
                            <button
                                onClick={clearFilters}
                                className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                )}

                {/* Logs Table */}
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            No WhatsApp logs found
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trigger</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {logs.map((log) => (
                                    <tr key={log._id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(log.status)}`}>
                                                {getStatusIcon(log.status)}
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="text-sm text-gray-900">{formatPhoneNumber(log.recipient)}</span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="text-sm text-gray-900 font-mono">{log.templateName}</span>
                                            <span className="ml-1 text-xs text-gray-500">({log.templateLanguage || 'en'})</span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="text-sm text-gray-500">{log.triggerName || log.triggerType || 'N/A'}</span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="text-sm text-gray-500">{formatDate(log.sentAt)}</span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="text-sm text-blue-600 hover:underline"
                                            >
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                            Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to{' '}
                            {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
                            {pagination.totalItems} logs
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                                disabled={pagination.currentPage === 1}
                                className="p-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                                <ChevronLeftIcon className="h-5 w-5" />
                            </button>
                            <span className="text-sm text-gray-700">
                                Page {pagination.currentPage} of {pagination.totalPages}
                            </span>
                            <button
                                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                                disabled={pagination.currentPage === pagination.totalPages}
                                className="p-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                                <ChevronRightIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Log Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">Message Details</h2>
                            <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-500">Status</label>
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-sm mt-1 ${getStatusBadgeColor(selectedLog.status)}`}>
                                        {getStatusIcon(selectedLog.status)}
                                        {selectedLog.status}
                                    </span>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Recipient</label>
                                    <span className="text-sm text-gray-900 mt-1">{formatPhoneNumber(selectedLog.recipient)}</span>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Template Name</label>
                                    <span className="text-sm text-gray-900 font-mono mt-1">{selectedLog.templateName}</span>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Language</label>
                                    <span className="text-sm text-gray-900 mt-1">{selectedLog.templateLanguage || 'en'}</span>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Trigger</label>
                                    <span className="text-sm text-gray-900 mt-1">{selectedLog.triggerName || selectedLog.triggerType || 'N/A'}</span>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Project</label>
                                    <span className="text-sm text-gray-900 mt-1">{selectedLog.projectName || selectedLog.projectId || 'N/A'}</span>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500">Sent At</label>
                                    <span className="text-sm text-gray-900 mt-1">{formatDate(selectedLog.sentAt)}</span>
                                </div>
                                {selectedLog.whatsappMessageId && (
                                    <div>
                                        <label className="block text-xs text-gray-500">WhatsApp Message ID (WAMID)</label>
                                        <span className="text-sm text-gray-900 font-mono mt-1 break-all">{selectedLog.whatsappMessageId}</span>
                                    </div>
                                )}
                            </div>

                            {selectedLog.error && (
                                <div className="bg-red-50 rounded-lg p-4">
                                    <label className="block text-xs text-red-600 font-medium">Error</label>
                                    <span className="text-sm text-red-700 mt-1">{selectedLog.error}</span>
                                </div>
                            )}

                            {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                                <div>
                                    <label className="block text-xs text-gray-500 mb-2">Metadata</label>
                                    <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto">
                                        {JSON.stringify(selectedLog.metadata, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppLogsPage;
