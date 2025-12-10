import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import axios from 'axios';
import { TicketExportModal } from '../components/tickets/TicketExportModal';
import { TicketMergeModal } from '../components/tickets/TicketMergeModal';
import { ArrowDownTrayIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import { API_CONFIG } from '../config/constants';

interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  title: string;
  status: string;
  priority: string;
  category?: {
    name: string;
  };
  assignedTo?: {
    firstName: string;
    lastName: string;
  };
  metadata?: {
    projectId?: {
      name: string;
      code: string;
    };
    studentName?: string;
    studentEmail?: string;
  };
  createdAt: string;
}

const ViewTickets: React.FC = () => {
  const navigate = useNavigate();
  
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
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const canExport = checkPermission('TICKET_EXPORT');
  const canMerge = checkPermission('TICKET_MERGE');
  const hasViewAll = checkPermission('TICKET_VIEW_ALL');
  const userRole = localStorage.getItem('userRole') || '';

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        navigate('/login');
        return;
      }

      // Use /api/tickets endpoint which shows:
      // - ALL tickets for Super Admin
      // - Project-specific tickets for other roles with TICKET_VIEW_ALL
      const response = await axios.get(`${API_CONFIG.API_URL}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        setTickets(response.data.data);
      }
    } catch (error: any) {
      console.error('Error fetching tickets:', error);
      if (error.response?.status === 401) {
        localStorage.removeItem('authToken');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    const matchesSearch = 
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.metadata?.studentEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.metadata?.projectId?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'open': '#3B82F6',
      'in-progress': '#F59E0B',
      'resolved': '#10B981',
      'closed': '#6B7280',
      'pending': '#EF4444',
    };
    return colors[status.toLowerCase()] || '#6B7280';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <p>Loading tickets...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            {hasViewAll ? 'All Queries' : 'My Queries'}
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>
            {hasViewAll 
              ? 'View and manage all support queries across all projects' 
              : 'View and manage queries assigned to you'}
          </p>
        </div>

        {/* Filters */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            {canExport && (
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
            )}
          </div>
        </div>

        {/* Tickets Grid */}
        <div style={{ display: 'grid', gap: '16px' }}>
          {filteredTickets.length === 0 ? (
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '48px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}>
              <p style={{ color: '#6B7280' }}>No tickets found</p>
            </div>
          ) : (
            filteredTickets.map(ticket => (
              <div
                key={ticket._id}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/tickets/${ticket._id}`)}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#2563EB' }}>
                      #{ticket.ticketNumber}
                    </span>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: '4px 0' }}>
                      {ticket.subject || 'No subject'}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: getStatusColor(ticket.status) + '20',
                      color: getStatusColor(ticket.status),
                    }}>
                      {ticket.status}
                    </span>
                    {canMerge && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicket(ticket);
                          setShowMergeModal(true);
                        }}
                        style={{
                          display: 'flex',
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
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: '#6B7280', flexWrap: 'wrap' }}>
                  {ticket.metadata?.projectId && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Project:</span>{' '}
                      <span style={{
                        padding: '2px 8px',
                        background: '#EEF2FF',
                        color: '#4F46E5',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}>
                        {ticket.metadata.projectId.name}
                      </span>
                    </div>
                  )}
                  {ticket.assignedTo && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Assigned:</span>{' '}
                      {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                    </div>
                  )}
                  {ticket.metadata?.studentEmail && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Requester:</span>{' '}
                      {ticket.metadata.studentEmail}
                    </div>
                  )}
                  {ticket.priority && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Priority:</span>{' '}
                      <span style={{ textTransform: 'capitalize' }}>{ticket.priority}</span>
                    </div>
                  )}
                  {ticket.category && (
                    <div>
                      <span style={{ fontWeight: 600 }}>Category:</span>{' '}
                      {ticket.category.name}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: '16px', textAlign: 'right', fontSize: '14px', color: '#6B7280' }}>
          Showing {filteredTickets.length} of {tickets.length} tickets
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <TicketExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          filters={{ status: filterStatus }}
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
            fetchTickets();
            setShowMergeModal(false);
            setSelectedTicket(null);
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default ViewTickets;
