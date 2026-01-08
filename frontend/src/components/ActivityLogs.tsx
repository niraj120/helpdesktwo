import React, { useState, useEffect } from 'react';
import DashboardLayout from './DashboardLayout';
import { API_CONFIG } from '../config/constants';

interface ActivityLog {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  userName: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId?: string;
  entityName?: string;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  project?: {
    _id: string;
    name: string;
    code: string;
  };
  projectName?: string;
  role?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface ActivityLogsProps {
  wrapWithLayout?: boolean;
}

const ActivityLogs: React.FC<ActivityLogsProps> = ({ wrapWithLayout = true }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  
  // Filters
  const [filters, setFilters] = useState({
    action: '',
    entity: '',
    search: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchActivityLogs();
  }, [page, filters]);

  const fetchActivityLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      // Get projectId if in project portal context
      const projectContextStr = localStorage.getItem('projectContext');
      const projectId = projectContextStr ? JSON.parse(projectContextStr).projectId : null;
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.entity && { entity: filters.entity }),
        ...(filters.search && { search: filters.search }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
        ...(projectId && { projectId: projectId })
      });

      const response = await fetch(`${API_CONFIG.API_URL}/activity-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.data);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filtering
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDisplayText = (text: string) => {
    if (!text) return text;
    return text.replace(/ticket/gi, 'query').replace(/Ticket/g, 'Query');
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      'create': '#10b981',
      'update': '#3b82f6',
      'edit': '#3b82f6',
      'delete': '#ef4444'
    };
    return colors[action] || '#6b7280';
  };

  const totalPages = Math.ceil(total / limit);

  const loadingContent = (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <div>Loading activity logs...</div>
    </div>
  );

  if (loading && logs.length === 0) {
    if (wrapWithLayout) {
      return <DashboardLayout>{loadingContent}</DashboardLayout>;
    }
    return loadingContent;
  }

  const mainContent = (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 600 }}>
            Activity Logs
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            Track all CRUD operations: create, update, edit, and delete actions across the system
          </p>
        </div>

        {/* Filters */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
                Search
              </label>
              <input
                type="text"
                placeholder="User, entity, description..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
                Action
              </label>
              <select
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="">All Actions</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="edit">Edit</option>
                <option value="delete">Delete</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
                Entity
              </label>
              <input
                type="text"
                placeholder="query, user, project..."
                value={filters.entity}
                onChange={(e) => handleFilterChange('entity', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
                Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500 }}>
                End Date
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
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
                onClick={() => {
                  setFilters({ action: '', entity: '', search: '', startDate: '', endDate: '' });
                  setPage(1);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
              Total Logs
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: '#1f2937' }}>
              {total.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Logs Table */}
        {logs.length === 0 ? (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '60px 20px',
            textAlign: 'center',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600 }}>
              No Activity Logs Found
            </h3>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
              {filters.search || filters.action || filters.entity ? 'Try adjusting your filters' : 'Activity logs will appear here as users perform actions'}
            </p>
          </div>
        ) : (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden'
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f9fafb' }}>
                  <tr>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      TIMESTAMP
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      USER
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      ACTION
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      ENTITY
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      DESCRIPTION
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      IP ADDRESS
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6b7280',
                      borderBottom: '1px solid #e5e7eb'
                    }}>
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, index) => (
                    <tr
                      key={log._id}
                      style={{
                        backgroundColor: index % 2 === 0 ? 'white' : '#f9fafb',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#f9fafb'}
                    >
                      <td style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {formatDate(log.timestamp)}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <div style={{ fontWeight: 500, color: '#1f2937' }}>
                          {log.userName}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {log.userEmail}
                        </div>
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: `${getActionColor(log.action)}20`,
                          color: getActionColor(log.action),
                          textTransform: 'uppercase'
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <div style={{ fontWeight: 500, color: '#1f2937' }}>
                          {formatDisplayText(log.entity)}
                        </div>
                        {log.entityName && (
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {log.entityName}
                          </div>
                        )}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        color: '#6b7280',
                        borderBottom: '1px solid #e5e7eb',
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {log.description ? formatDisplayText(log.description) : '-'}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        fontSize: '13px',
                        color: '#6b7280',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        {log.ipAddress ?? '-'}
                      </td>
                      <td style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <button
                          onClick={() => setSelectedLog(log)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#ede9fe',
                            color: '#7c3aed',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
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

            {/* Pagination */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} logs
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: page === 1 ? '#f3f4f6' : 'white',
                    color: page === 1 ? '#9ca3af' : '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: page === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Previous
                </button>
                <div style={{ padding: '6px 12px', fontSize: '14px', color: '#374151' }}>
                  Page {page} of {totalPages}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: page === totalPages ? '#f3f4f6' : 'white',
                    color: page === totalPages ? '#9ca3af' : '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: page === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {selectedLog && (
          <div
            style={{
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
              padding: '20px'
            }}
            onClick={() => setSelectedLog(null)}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '32px',
                maxWidth: '700px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600 }}>
                Activity Log Details
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                    Timestamp
                  </div>
                  <div style={{ fontSize: '14px', color: '#1f2937' }}>
                    {formatDate(selectedLog.timestamp)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                    User
                  </div>
                  <div style={{ fontSize: '14px', color: '#1f2937' }}>
                    {selectedLog.userName} ({selectedLog.userEmail})
                  </div>
                  {selectedLog.role && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      Role: {selectedLog.role}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                    Action
                  </div>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: `${getActionColor(selectedLog.action)}20`,
                    color: getActionColor(selectedLog.action),
                    textTransform: 'uppercase',
                    display: 'inline-block'
                  }}>
                    {selectedLog.action}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                    Entity
                  </div>
                  <div style={{ fontSize: '14px', color: '#1f2937' }}>
                    {formatDisplayText(selectedLog.entity)}
                    {selectedLog.entityId && <span style={{ color: '#6b7280' }}> (ID: {selectedLog.entityId})</span>}
                  </div>
                  {selectedLog.entityName && (
                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                      {selectedLog.entityName}
                    </div>
                  )}
                </div>

                {selectedLog.description && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                      Description
                    </div>
                    <div style={{ fontSize: '14px', color: '#1f2937' }}>
                      {formatDisplayText(selectedLog.description)}
                    </div>
                  </div>
                )}

                {selectedLog.changes && selectedLog.changes.length > 0 && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: 500 }}>
                      Changes Made
                    </div>
                    <div style={{
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      padding: '12px',
                      border: '1px solid #e5e7eb'
                    }}>
                      {selectedLog.changes.map((change, idx) => (
                        <div key={idx} style={{ marginBottom: idx < selectedLog.changes!.length - 1 ? '12px' : 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937', marginBottom: '4px' }}>
                            {change.field}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}>
                            <span style={{ color: '#ef4444' }}>
                              {JSON.stringify(change.oldValue)}
                            </span>
                            <span style={{ color: '#6b7280' }}>→</span>
                            <span style={{ color: '#10b981' }}>
                              {JSON.stringify(change.newValue)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                      IP Address
                    </div>
                    <div style={{ fontSize: '14px', color: '#1f2937' }}>
                      {selectedLog.ipAddress || 'N/A'}
                    </div>
                  </div>

                  {selectedLog.projectName && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                        Project
                      </div>
                      <div style={{ fontSize: '14px', color: '#1f2937' }}>
                        {selectedLog.projectName}
                      </div>
                    </div>
                  )}
                </div>

                {selectedLog.userAgent && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                      User Agent
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      backgroundColor: '#f9fafb',
                      padding: '8px',
                      borderRadius: '4px',
                      wordBreak: 'break-all'
                    }}>
                      {selectedLog.userAgent}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '24px', textAlign: 'right' }}>
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#7c3aed',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );

  if (wrapWithLayout) {
    return <DashboardLayout>{mainContent}</DashboardLayout>;
  }

  return mainContent;
};

export default ActivityLogs;
