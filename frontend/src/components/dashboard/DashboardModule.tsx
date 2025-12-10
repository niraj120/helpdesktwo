import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import PermissionGate from '../shared/PermissionGate';
import { 
  ChartBarIcon,
  ArrowTrendingUpIcon,
  TicketIcon,
  ClockIcon,
  UserGroupIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  pendingTickets: number;
  averageResponseTime: number;
  slaCompliance: number;
  ticketsByStatus: { status: string; count: number }[];
  ticketsByPriority: { priority: string; count: number }[];
  ticketsByCategory: { category: string; count: number }[];
  recentActivity: {
    _id: string;
    action: string;
    ticketNumber: string;
    user: string;
    timestamp: string;
  }[];
}

interface DashboardModuleProps {
  user: {
    _id: string;
    name: string;
    role: {
      name: string;
      code: string;
    };
  } | null;
  permissions: string[];
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({ user, permissions }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('7days'); // 7days, 30days, 90days, all

  const canViewAnalytics = permissions.includes('DASHBOARD_VIEW_ANALYTICS');
  const canExport = permissions.includes('DASHBOARD_EXPORT');

  useEffect(() => {
    fetchDashboardStats();
  }, [timeRange]);

  const fetchDashboardStats = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_BASE_URL}/api/dashboard/statistics?timeRange=${timeRange}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      setError('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_BASE_URL}/api/dashboard/export`,
        { timeRange },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          responseType: 'blob',
        }
      );

      // Download file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `dashboard_${timeRange}_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error exporting dashboard:', err);
      alert('Failed to export dashboard data');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-600 mt-1">
            Welcome back, {user?.name}! Here's your overview.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>

          {/* Export Button */}
          <PermissionGate permissions={permissions} requires={['DASHBOARD_EXPORT']}>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
              Export
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Queries"
          value={stats?.totalTickets || 0}
          icon={<TicketIcon className="h-6 w-6" />}
          color="blue"
        />
        <StatCard
          title="Open Queries"
          value={stats?.openTickets || 0}
          icon={<ChartBarIcon className="h-6 w-6" />}
          color="yellow"
        />
        <StatCard
          title="Resolved"
          value={stats?.resolvedTickets || 0}
          icon={<ArrowTrendingUpIcon className="h-6 w-6" />}
          color="green"
        />
        <StatCard
          title="Pending"
          value={stats?.pendingTickets || 0}
          icon={<ClockIcon className="h-6 w-6" />}
          color="orange"
        />
      </div>

      {/* Analytics Section */}
      <PermissionGate permissions={permissions} requires={['DASHBOARD_VIEW_ANALYTICS']}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tickets by Status */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Tickets by Status
            </h3>
            <div className="space-y-3">
              {stats?.ticketsByStatus.map((item) => (
                <div key={item.status} className="flex items-center justify-between">
                  <span className="text-gray-700">{item.status}</span>
                  <div className="flex items-center space-x-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${(item.count / (stats.totalTickets || 1)) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-gray-900 font-medium w-12 text-right">
                      {item.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tickets by Priority */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Tickets by Priority
            </h3>
            <div className="space-y-3">
              {stats?.ticketsByPriority.map((item) => (
                <div key={item.priority} className="flex items-center justify-between">
                  <span className="text-gray-700">{item.priority}</span>
                  <div className="flex items-center space-x-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getPriorityColor(item.priority)}`}
                        style={{
                          width: `${(item.count / (stats.totalTickets || 1)) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-gray-900 font-medium w-12 text-right">
                      {item.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SLA Compliance */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              SLA Compliance
            </h3>
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="transform -rotate-90 w-32 h-32">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="#e5e7eb"
                    strokeWidth="8"
                    fill="none"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="#10b981"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 56}`}
                    strokeDashoffset={`${2 * Math.PI * 56 * (1 - (stats?.slaCompliance || 0) / 100)}`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">
                    {stats?.slaCompliance || 0}%
                  </span>
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-gray-600 mt-4">
              Average Response Time: {stats?.averageResponseTime || 0} hours
            </p>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {stats?.recentActivity.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No recent activity
                </p>
              ) : (
                stats?.recentActivity.map((activity) => (
                  <div
                    key={activity._id}
                    className="flex items-start space-x-3 text-sm"
                  >
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                    <div className="flex-1">
                      <p className="text-gray-900">
                        <span className="font-medium">{activity.user}</span>{' '}
                        {activity.action}{' '}
                        <span className="font-medium">{activity.ticketNumber}</span>
                      </p>
                      <p className="text-gray-500 text-xs">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </PermissionGate>

      {/* No Analytics Permission Message */}
      {!canViewAnalytics && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">
            You don't have permission to view detailed analytics.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Contact your administrator to request DASHBOARD_VIEW_ANALYTICS permission.
          </p>
        </div>
      )}
    </div>
  );
};

// Helper Components
const StatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'yellow' | 'green' | 'orange';
}> = ({ title, value, icon, color }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const getPriorityColor = (priority: string): string => {
  switch (priority.toLowerCase()) {
    case 'critical':
    case 'high':
      return 'bg-red-600';
    case 'medium':
      return 'bg-yellow-600';
    case 'low':
      return 'bg-green-600';
    default:
      return 'bg-blue-600';
  }
};

export default DashboardModule;
