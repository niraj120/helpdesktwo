import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  priority?: string;
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
    studentName?: string;
    centerId?: string | {
      _id: string;
      centerName: string;
      city?: string;
      state?: string;
    };
    centerName?: string;
    createdByName?: string;
    submissionType?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface MyTicketsProps {
  wrapWithLayout?: boolean;
}

const MyTickets: React.FC<MyTicketsProps> = ({ wrapWithLayout = true }) => {
  console.log('🎯 MyTickets component rendering, wrapWithLayout:', wrapWithLayout);
  
  const navigate = useNavigate();
  const location = useLocation();
  
  console.log('🎯 Hooks initialized, location:', location.pathname);
  
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
  
  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedTickets = useRef(false);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [statuses, setStatuses] = useState<Array<{code: number, name: string}>>([]);
  const [priorities, setPriorities] = useState<Array<{code: string, name: string}>>([]);

  console.log('🎯 State initialized');

  const canExport = checkPermission('TICKET_EXPORT');
  const canMerge = checkPermission('TICKET_MERGE');

  console.log('🎯 Permissions checked, canExport:', canExport, 'canMerge:', canMerge);

  const fetchMasterData = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const projectContext = localStorage.getItem('projectContext');
      if (!projectContext) return;

      const { projectId } = JSON.parse(projectContext);

      // Fetch statuses using existing API: /api/statuses/project/:projectId
      const statusResponse = await axios.get(`${API_BASE_URL}/statuses/project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (statusResponse.data.success && Array.isArray(statusResponse.data.data)) {
        setStatuses(statusResponse.data.data.map((s: any) => ({ code: s.code, name: s.name })));
      }

      // Fetch priorities from SLA rules (use SLA rule names as priorities)
      const slaResponse = await axios.get(`${API_BASE_URL}/sla-rules?projectId=${projectId}&isActive=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (slaResponse.data.success && Array.isArray(slaResponse.data.data)) {
        // Use SLA rule names as priorities (e.g., "Low", "Medium", "High")
        const priorityList = slaResponse.data.data.map((sla: any) => ({ 
          code: sla.name.toLowerCase(), 
          name: sla.name 
        }));
        setPriorities(priorityList);
      }
    } catch (err) {
      console.error('Error fetching master data:', err);
    }
  }, []);

  const fetchMyTickets = useCallback(async () => {
    console.log('🎯 fetchMyTickets called');
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/tickets/my-tickets`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        // Ensure tickets is an array and filter out any invalid entries
        const ticketsData = Array.isArray(response.data.data) ? response.data.data : [];
        console.log('🎯 Sample ticket data:', ticketsData[0]);
        console.log('🏢 Center data check:', ticketsData[0]?.metadata?.centerId);
        setTickets(ticketsData.filter((ticket: any) => ticket && ticket._id));
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
  }, [navigate]);

  console.log('🎯 useCallback defined');

  useEffect(() => {
    console.log('🎯 useEffect running, hasFetchedTickets.current:', hasFetchedTickets.current);
    // Always fetch on mount, reset ref on unmount
    if (!hasFetchedTickets.current) {
      hasFetchedTickets.current = true;
      console.log('🎯 Calling fetchMyTickets from useEffect');
      fetchMasterData();
      fetchMyTickets();
    }
    
    // Reset ref on unmount so fresh fetch happens on remount
    return () => {
      console.log('🎯 Component unmounting, resetting ref');
      hasFetchedTickets.current = false;
    };
  }, [fetchMyTickets, fetchMasterData]);

  console.log('🎯 About to define helper functions');

  const getStatusName = (status: string | number) => {
    const statusCode = typeof status === 'number' ? status : Number(status);
    const statusNames: Record<number, string> = {
      1: 'Open',
      2: 'In Progress',
      3: 'On Hold',
      4: 'Resolved',
      5: 'Closed',
    };
    return statusNames[statusCode] || `Status ${statusCode}`;
  };

  const getStatusColor = (status: string | number) => {
    // Handle numeric status codes: 1=open, 2=in-progress, 3=on-hold, 4=resolved, 5=closed
    const statusCode = typeof status === 'number' ? status : Number(status);
    const colors: Record<number, string> = {
      1: '#3B82F6',  // open
      2: '#F59E0B',  // in-progress
      3: '#EF4444',  // on-hold
      4: '#10B981',  // resolved
      5: '#6B7280',  // closed
    };
    return colors[statusCode] || '#6B7280';
  };

  const getPriorityColor = (priority?: string) => {
    const colors: Record<string, string> = {
      'low': '#10B981',
      'normal': '#F59E0B',
      'medium': '#F59E0B',
      'high': '#EF4444',
      'critical': '#DC2626',
    };
    return priority ? (colors[priority.toLowerCase()] || '#6B7280') : '#6B7280';
  };

  console.log('🎯 About to filter tickets, tickets.length:', tickets.length);
  
  const filteredTickets = tickets.filter((ticket) => {
    try {
      // Status is now numeric: compare as numbers or convert filter to number
      const ticketStatus = typeof ticket.status === 'number' ? ticket.status : Number(ticket.status);
      const filterStatus = statusFilter === 'all' ? 'all' : Number(statusFilter);
      const matchesStatus = statusFilter === 'all' || ticketStatus === filterStatus;
      const matchesPriority = priorityFilter === 'all' || (ticket.priority && ticket.priority.toLowerCase() === priorityFilter.toLowerCase());
      const matchesSearch = 
        (ticket.ticketNumber && ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ticket.subject && ticket.subject.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ticket.description && ticket.description.toLowerCase().includes(searchTerm.toLowerCase()));
      
      return matchesStatus && matchesPriority && matchesSearch;
    } catch (err) {
      console.error('🎯 Error filtering ticket:', ticket, err);
      return false;
    }
  });
  
  console.log('🎯 Filtered tickets, filteredTickets.length:', filteredTickets.length);

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

  console.log('🎯 About to check loading state, loading:', loading);

  if (loading) {
    console.log('🎯 Rendering loading state');
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

  console.log('🎯 Not loading, rendering main content, tickets.length:', tickets.length);

  console.log('🎯 About to create content JSX');

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
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
                <option value="all">All</option>
                {statuses.map((status) => (
                  <option key={status.code} value={status.code}>
                    {status.name}
                  </option>
                ))}
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
                <option value="all">All</option>
                {priorities.map((priority) => (
                  <option key={priority.code} value={priority.code}>
                    {priority.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
              No queries found
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
                      Priority
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Center
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Created By
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Assigned To
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket._id}
                      onClick={() => handleTicketClick(ticket._id)}
                      style={{
                        borderBottom: '1px solid #E5E7EB',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#F9FAFB';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: 500 }}>
                        {ticket.ticketNumber}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', maxWidth: '300px' }}>
                        <div style={{ 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap' 
                        }}>
                          {ticket.subject}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'white',
                          backgroundColor: getPriorityColor(ticket.priority),
                        }}>
                          {ticket.priority || 'N/A'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280' }}>
                        {!ticket.metadata?.centerId || ticket.metadata?.centerId === 'online'
                          ? 'Online' 
                          : (typeof ticket.metadata?.centerId === 'object'
                            ? ticket.metadata.centerId.centerName
                            : ticket.metadata?.centerName || 'Online')
                        }
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280' }}>
                        {ticket.metadata?.createdByName || ticket.metadata?.studentName || 'N/A'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280' }}>
                        {ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : 'Unassigned'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'white',
                          backgroundColor: getStatusColor(ticket.status),
                        }}>
                          {getStatusName(ticket.status)}
                        </span>
                      </td>
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
    </div>
  );

  console.log('🎯 Content JSX created successfully');

  // Conditionally wrap with DashboardLayout
  try {
    console.log('🎯 About to return, wrapWithLayout:', wrapWithLayout);
    return wrapWithLayout ? (
      <DashboardLayout>
        {content}
      </DashboardLayout>
    ) : (
      content
    );
  } catch (err) {
    console.error('🎯 Error in return:', err);
    return <div>Error rendering: {String(err)}</div>;
  }
};

export default MyTickets;
