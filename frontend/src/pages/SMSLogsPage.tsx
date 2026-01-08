import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import axios from 'axios';
import API_BASE_URL from '../config/api';

interface SMSLog {
  _id: string;
  projectId?: {
    _id: string;
    name: string;
    code: string;
  };
  projectName?: string;
  recipient: string;
  message: string;
  type: string;
  status: 'sent' | 'failed' | 'blocked' | 'simulated';
  error?: string;
  metadata?: any;
  provider?: string;
  sentAt: string;
}

interface Statistics {
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  simulated: number;
}

const SMSLogsPage = () => {
  const [logs, setLogs] = useState<SMSLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics>({
    total: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    simulated: 0
  });
  const [filters, setFilters] = useState({
    status: '',
    type: '',
    recipient: '',
    page: 1,
    limit: 50
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1
  });
  const [selectedLog, setSelectedLog] = useState<SMSLog | null>(null);

  useEffect(() => {
    fetchSMSLogs();
  }, [filters]);

  const fetchSMSLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const params = new URLSearchParams();
      
      if (filters.status) params.append('status', filters.status);
      if (filters.type) params.append('type', filters.type);
      if (filters.recipient) params.append('recipient', filters.recipient);
      params.append('page', filters.page.toString());
      params.append('limit', filters.limit.toString());

      const response = await axios.get(`${API_BASE_URL}/sms-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setLogs(response.data.data.logs || []);
        setPagination(response.data.data.pagination || {
          page: 1,
          limit: 50,
          total: 0,
          pages: 1
        });
        setStatistics(response.data.data.statistics || {
          total: 0,
          sent: 0,
          failed: 0,
          blocked: 0,
          simulated: 0
        });
      }
    } catch (error) {
      console.error('Error fetching SMS logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return '#10b981';
      case 'failed': return '#ef4444';
      case 'blocked': return '#f59e0b';
      case 'simulated': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusBadge = (status: string) => {
    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        background: `${getStatusColor(status)}20`,
        color: getStatusColor(status)
      }}>
        {status.toUpperCase()}
      </span>
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '24px' }}>
        {/* Header */}
        <ModuleHeader 
          title="SMS Logs"
          subtitle="View all SMS activity and troubleshoot delivery issues"
        />

        {/* Statistics Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total SMS</div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#111827' }}>{statistics?.total || 0}</div>
          </div>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            borderLeft: '4px solid #10b981'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Sent</div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>{statistics?.sent || 0}</div>
          </div>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            borderLeft: '4px solid #ef4444'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Failed</div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#ef4444' }}>{statistics?.failed || 0}</div>
          </div>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            borderLeft: '4px solid #f59e0b'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Blocked</div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>{statistics?.blocked || 0}</div>
          </div>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            borderLeft: '4px solid #6b7280'
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Simulated</div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#6b7280' }}>{statistics?.simulated || 0}</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '24px'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="">All</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="blocked">Blocked</option>
                <option value="simulated">Simulated</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Type
              </label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="">All Types</option>
                <option value="otp">OTP</option>
                <option value="ticket_notification">Ticket Notification</option>
                <option value="alert">Alert</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Recipient
              </label>
              <input
                type="text"
                placeholder="Search by phone number..."
                value={filters.recipient}
                onChange={(e) => setFilters({ ...filters, recipient: e.target.value, page: 1 })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={() => setFilters({ status: '', type: '', recipient: '', page: 1, limit: 50 })}
                style={{
                  padding: '8px 16px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div style={{
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
              Loading SMS logs...
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
              No SMS logs found
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>DATE</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>RECIPIENT</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>MESSAGE</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>TYPE</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>STATUS</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>PROJECT</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                        {formatDate(log.sentAt)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                        {log.recipient}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.message}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                        <span style={{ textTransform: 'capitalize' }}>{log.type.replace(/_/g, ' ')}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                        {getStatusBadge(log.status)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                        {log.projectName || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                        <button
                          onClick={() => setSelectedLog(log)}
                          style={{
                            padding: '4px 12px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && logs.length > 0 && (
            <div style={{
              padding: '16px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={pagination.page === 1}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: pagination.page === 1 ? '#f3f4f6' : 'white',
                    cursor: pagination.page === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Previous
                </button>
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: pagination.page >= pagination.pages ? '#f3f4f6' : 'white',
                    cursor: pagination.page >= pagination.pages ? 'not-allowed' : 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedLog && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }} onClick={() => setSelectedLog(null)}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: '24px'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600' }}>SMS Details</h2>
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>Status</label>
                {getStatusBadge(selectedLog.status)}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>Recipient</label>
                <div style={{ fontSize: '14px' }}>{selectedLog.recipient}</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>Message</label>
                <div style={{ 
                  fontSize: '14px',
                  background: '#f9fafb',
                  padding: '12px',
                  borderRadius: '6px',
                  whiteSpace: 'pre-wrap'
                }}>{selectedLog.message}</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>Type</label>
                <div style={{ fontSize: '14px', textTransform: 'capitalize' }}>{selectedLog.type.replace(/_/g, ' ')}</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>Sent At</label>
                <div style={{ fontSize: '14px' }}>{formatDate(selectedLog.sentAt)}</div>
              </div>

              {selectedLog.provider && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>Provider</label>
                  <div style={{ fontSize: '14px' }}>{selectedLog.provider}</div>
                </div>
              )}

              {selectedLog.error && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>Error</label>
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#ef4444',
                    background: '#fee2e2',
                    padding: '12px',
                    borderRadius: '6px'
                  }}>{selectedLog.error}</div>
                </div>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px' }}>Metadata</label>
                  <pre style={{ 
                    fontSize: '12px',
                    background: '#f9fafb',
                    padding: '12px',
                    borderRadius: '6px',
                    overflow: 'auto'
                  }}>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SMSLogsPage;
