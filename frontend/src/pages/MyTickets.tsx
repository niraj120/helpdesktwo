import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import API_BASE_URL from '../config/api';
import { TicketExportModal } from '../components/tickets/TicketExportModal';
import { TicketMergeModal } from '../components/tickets/TicketMergeModal';
import { ArrowDownTrayIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';

interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category?: {
    name: string;
  };
  assignedTo?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  metadata?: {
    projectId?: {
      name: string;
      code: string;
    };
    studentEmail?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface MyTicketsProps {
  wrapWithLayout?: boolean;
}

const MyTickets: React.FC<MyTicketsProps> = ({ wrapWithLayout = true }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Helper function to check permissions from localStorage
  const checkPermission = (permission: string): boolean => {
    const userPermissionsStr = localStorage.getItem('userPermissions');
    if (!userPermissionsStr) return false;
    try {
      const userPermissions = JSON.parse(userPermissionsStr);
      return Array.isArray(userPermissions) && userPermissions.includes(permission);
    } catch {
      return false;
    }
  };
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const canExport = checkPermission('TICKET_EXPORT');
  const canMerge = checkPermission('TICKET_MERGE');

  useEffect(() => {
    fetchMyTickets();
  }, []);

  const fetchMyTickets = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/tickets/my-tickets`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        setTickets(response.data.data);
      } else {
        // Hide 404 and "Not Found" errors from UI
        if (response.data.error && !response.data.error.includes('Not Found')) {
          setError(response.data.error || 'Failed to load tickets');
        }
      }
    } catch (err: any) {
      console.error('Error fetching my tickets:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('authToken');
        navigate('/login');
      } else if (err.response?.status === 403) {
        setError('You do not have permission to view tickets. Please contact your administrator.');
      } else if (err.response?.status === 404) {
        // Hide 404 errors from UI, just log them
        console.log('Tickets endpoint not found (404)');
      } else {
        setError(err.response?.data?.error || 'Failed to load tickets');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'open': '#3B82F6',
      'in progress': '#F59E0B',
      'resolved': '#10B981',
      'closed': '#6B7280',
      'pending': '#EF4444',
    };
    return colors[status.toLowerCase()] || '#6B7280';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      'low': '#10B981',
      'normal': '#F59E0B',
      'medium': '#F59E0B',
      'high': '#EF4444',
      'critical': '#DC2626',
    };
    return colors[priority.toLowerCase()] || '#6B7280';
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus = statusFilter === 'all' || ticket.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesPriority = priorityFilter === 'all' || ticket.priority.toLowerCase() === priorityFilter.toLowerCase();
    const matchesSearch = 
      ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ticket.description && ticket.description.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const handleTicketClick = (ticketId: string) => {
    // Check if we're in a student context (URL contains /student/)
    if (location.pathname.includes('/student/')) {
      const pathParts = location.pathname.split('/');
      const customUrlPath = pathParts[1]; // e.g., "studentassistcenters"
      navigate(`/${customUrlPath}/student/ticket/${ticketId}`);
      return;
    }
    
    // Check if we're in a project portal context (agent/staff)
    const projectContext = localStorage.getItem('projectContext');
    if (projectContext) {
      try {
        const { customUrlPath } = JSON.parse(projectContext);
        if (customUrlPath) {
          navigate(`/${customUrlPath}/portal/tickets/${ticketId}`);
          return;
        }
      } catch (e) {
        console.error('Error parsing project context:', e);
      }
    }
    
    // Fallback to regular route
    navigate(`/tickets/${ticketId}`);
  };

  if (loading) {
    const loadingContent = (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p>Loading your tickets...</p>
      </div>
    );
    return wrapWithLayout ? (
      <DashboardLayout>
        {loadingContent}
      </DashboardLayout>
    ) : (
      loadingContent
    );
  }

  const content = (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            My Queries
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>
            View and manage queries assigned to you or created by you
          </p>
        </div>

        {error && !error.includes('Not Found') && (
          <div style={{
            background: '#FEE2E2',
            border: '1px solid #EF4444',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '24px',
            color: '#991B1B'
          }}>
            {error}
          </div>
        )}

        {/* Filters */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: canExport ? '16px' : '0' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Search Queries
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by query number or subject"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in progress">In Progress</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                Priority
              </label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white',
                }}
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          {canExport && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowExportModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#047857'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#059669'}
              >
                <ArrowDownTrayIcon style={{ width: '16px', height: '16px' }} />
                Export
              </button>
            </div>
          )}
        </div>

        {/* Tickets Table */}
        {filteredTickets.length === 0 ? (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '40px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center',
          }}>
            <p style={{ color: '#6B7280', fontSize: '16px' }}>
              {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all'
                ? 'No queries found matching your filters'
                : 'You have no queries yet'}
            </p>
          </div>
        ) : (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Query #
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Subject
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Priority
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Category
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Project
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Assigned To
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Created
                    </th>
                    {canMerge && (
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket._id}
                      style={{
                        borderBottom: '1px solid #E5E7EB',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#F9FAFB';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td 
                        onClick={() => handleTicketClick(ticket._id)}
                        style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: 500, cursor: 'pointer' }}
                      >
                        {ticket.ticketNumber}
                      </td>
                      <td 
                        onClick={() => handleTicketClick(ticket._id)}
                        style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', maxWidth: '300px', cursor: 'pointer' }}
                      >
                        <div style={{ 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap' 
                        }}>
                          {ticket.subject}
                        </div>
                      </td>
                      <td onClick={() => handleTicketClick(ticket._id)} style={{ padding: '12px 16px', cursor: 'pointer' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'white',
                          backgroundColor: getStatusColor(ticket.status),
                        }}>
                          {ticket.status}
                        </span>
                      </td>
                      <td onClick={() => handleTicketClick(ticket._id)} style={{ padding: '12px 16px', cursor: 'pointer' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'white',
                          backgroundColor: getPriorityColor(ticket.priority),
                        }}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td onClick={() => handleTicketClick(ticket._id)} style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>
                        {ticket.category?.name || 'N/A'}
                      </td>
                      <td onClick={() => handleTicketClick(ticket._id)} style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>
                        {ticket.metadata?.projectId
                          ? `${ticket.metadata.projectId.name} (${ticket.metadata.projectId.code})`
                          : 'N/A'}
                      </td>
                      <td onClick={() => handleTicketClick(ticket._id)} style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>
                        {ticket.assignedTo
                          ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
                          : 'Unassigned'}
                      </td>
                      <td onClick={() => handleTicketClick(ticket._id)} style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280', cursor: 'pointer' }}>
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </td>
                      {canMerge && (
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicket(ticket);
                              setShowMergeModal(true);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 12px',
                              background: '#3B82F6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#2563EB'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#3B82F6'}
                            title="Merge this ticket with others"
                          >
                            <ArrowsPointingInIcon style={{ width: '14px', height: '14px' }} />
                            Merge
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: '16px' }}>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>
            Showing {filteredTickets.length} of {tickets.length} quer{tickets.length === 1 ? 'y' : 'ies'}
          </p>
        </div>

        {/* Export Modal */}
        {showExportModal && (
          <TicketExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            filters={{ status: statusFilter, priority: priorityFilter }}
          />
        )}

        {/* Merge Modal */}
        {showMergeModal && selectedTicket && (
          <TicketMergeModal
            isOpen={showMergeModal}
            onClose={() => {
              setShowMergeModal(false);
              setSelectedTicket(null);
            }}
            primaryTicket={selectedTicket}
            onMergeComplete={() => {
              fetchMyTickets();
              setShowMergeModal(false);
              setSelectedTicket(null);
            }}
          />
        )}
    </div>
  );

  // Conditionally wrap with DashboardLayout
  return wrapWithLayout ? (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  ) : (
    content
  );
};

export default MyTickets;
