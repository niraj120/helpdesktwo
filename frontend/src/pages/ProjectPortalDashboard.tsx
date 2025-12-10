import { useEffect, useState } from 'react';
import { useNavigate, useParams, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import ProtectedRoute from '../components/ProtectedRoute';
import { PERMISSIONS } from '../constants/permissions';

// Import existing super admin components
import ActivityLogs from '../components/ActivityLogs';
import AccessLogs from '../components/AccessLogs';
import KnowledgeBaseViewer from '../components/KnowledgeBaseViewer';
import AgentOfflineModule from './AgentOfflineModule';
import AgentStudentWorkflow from './AgentStudentWorkflow';
import UserManagement from '../components/UserManagement';
import RedirectToFirstRoute from '../components/RedirectToFirstRoute';
import EmailConfigPage from './EmailConfigPage';
import ProjectDashboard from './ProjectDashboard';

// Import ticket-related pages
import ViewTickets from './ViewTickets';
import MyTickets from './MyTickets';
import TicketAssignment from './TicketAssignment';
import AgentTicketDetail from './AgentTicketDetail';
import { API_CONFIG } from '../config/constants';

interface ProjectBranding {
  projectId: string;
  name: string;
  code: string;
  branding?: {
    logo?: string | null;
    colorTheme?: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
    };
  };
  ticketSubmissionMode?: 'online' | 'offline' | 'both';
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: {
    name: string;
    code: string;
    permissions?: string[];
  };
}

// User Management - renders without its own DashboardLayout (already wrapped by parent)
const ProjectUserManagement = () => {
  return <UserManagement wrapWithLayout={false} />;
};

// Simple Dashboard component for agents
const AgentDashboardContent = () => {
  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '8px' }}>Dashboard</h1>
      <p style={{ color: '#6b7280', marginBottom: '32px' }}>Overview of your work</p>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '24px',
        marginBottom: '32px'
      }}>
        {/* Stats cards */}
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Total Tickets</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#111827' }}>0</div>
        </div>
        
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Pending</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>0</div>
        </div>
        
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Resolved</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>0</div>
        </div>
      </div>

      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Recent Activity</h2>
        <p style={{ color: '#6b7280' }}>No recent activity</p>
      </div>
    </div>
  );
};

// Tickets component for agents
interface AgentTicketsContentProps {
  projectBranding?: ProjectBranding | null;
  user?: User | null;
}

const AgentTicketsContent = ({ projectBranding, user }: AgentTicketsContentProps) => {
  const { customUrlPath } = useParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkReply, setBulkReply] = useState('');
  const [showBulkReplyModal, setShowBulkReplyModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const [ticketNumberSearch, setTicketNumberSearch] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allStatuses, setAllStatuses] = useState<Array<{ name: string; value: string }>>([]);
  const [ticketTab, setTicketTab] = useState<'online' | 'offline'>('online');

  // Update default tab based on project submission mode
  useEffect(() => {
    if (projectBranding?.ticketSubmissionMode) {
      const mode = projectBranding.ticketSubmissionMode;
      // If only offline mode is available, default to offline tab
      if (mode === 'offline') {
        setTicketTab('offline');
      }
      // For 'online' or 'both', keep 'online' as default
    }
  }, [projectBranding?.ticketSubmissionMode]);

  useEffect(() => {
    // Get project context
    const projectContext = localStorage.getItem('projectContext');
    if (projectContext) {
      const context = JSON.parse(projectContext);
      setProjectId(context.projectId);
    }
  }, []);

  useEffect(() => {
    if (projectId && user) {
      // Fetch data for all logged-in users (not just agents)
      // Users without ticket permissions won't see the tickets page anyway
      fetchTickets();
      fetchTags();
      fetchCategories();
      fetchStatuses();
    }
  }, [projectId, user]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/agent/assigned`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { projectId },
        }
      );
      setTickets(response.data.data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/tickets/tags`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { projectId }
        }
      );
      setAllTags(response.data.data || []);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/categories/project/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setAllCategories(response.data.data?.map((cat: any) => cat.name) || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchStatuses = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/statuses/project/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      // Prefer machine-readable `code` when available, fallback to normalized name
      const mapped = response.data.data?.map((status: any) => ({
        name: status.name,
        value: (status.code ? String(status.code) : String(status.name)).toLowerCase()
      })) || [];
      setAllStatuses(mapped);
    } catch (error) {
      console.error('Error fetching statuses:', error);
    }
  };

  const handleSelectTicket = (ticketId: string) => {
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    setSelectedTickets(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const handleSelectAll = () => {
    if (selectedTickets.size === filteredTickets.length) {
      setSelectedTickets(new Set());
      setShowBulkActions(false);
    } else {
      setSelectedTickets(new Set(filteredTickets.map(t => t._id)));
      setShowBulkActions(true);
    }
  };

  const handleBulkStatusChange = async () => {
    if (!bulkStatus || selectedTickets.size === 0) return;
    
    try {
      const token = localStorage.getItem('authToken');
      for (const ticketId of Array.from(selectedTickets)) {
        await axios.patch(
          `${API_CONFIG.API_URL}/tickets/${ticketId}/status`,
          { status: bulkStatus },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      alert(`Successfully updated ${selectedTickets.size} tickets to ${bulkStatus}`);
      setSelectedTickets(new Set());
      setShowBulkActions(false);
      setBulkStatus('');
      fetchTickets();
    } catch (error) {
      console.error('Error updating tickets:', error);
      alert('Failed to update some tickets');
    }
  };

  const handleBulkReplySubmit = async () => {
    if (!bulkReply || selectedTickets.size === 0) return;
    
    try {
      const token = localStorage.getItem('authToken');
      for (const ticketId of Array.from(selectedTickets)) {
        await axios.post(
          `${API_CONFIG.API_URL}/tickets/${ticketId}/reply`,
          { message: bulkReply },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      alert(`Successfully sent reply to ${selectedTickets.size} tickets`);
      setSelectedTickets(new Set());
      setShowBulkActions(false);
      setBulkReply('');
      setShowBulkReplyModal(false);
      fetchTickets();
    } catch (error) {
      console.error('Error sending replies:', error);
      alert('Failed to send replies to some tickets');
    }
  };

  const handleBulkClose = async () => {
    if (selectedTickets.size === 0) return;
    
    if (!confirm(`Are you sure you want to close ${selectedTickets.size} tickets?`)) return;
    
    try {
      const token = localStorage.getItem('authToken');
      for (const ticketId of Array.from(selectedTickets)) {
        await axios.patch(
          `${API_CONFIG.API_URL}/tickets/${ticketId}/status`,
          { status: 'closed' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      alert(`Successfully closed ${selectedTickets.size} tickets`);
      setSelectedTickets(new Set());
      setShowBulkActions(false);
      fetchTickets();
    } catch (error) {
      console.error('Error closing tickets:', error);
      alert('Failed to close some tickets');
    }
  };

  const filteredTickets = tickets.filter((ticket) => {
    // Filter by online/offline tab
    const ticketSource = ticket.submissionSource || 'online';
    if (ticketSource !== ticketTab) return false;

    // DON'T exclude resolved and closed tickets from the list - show all tickets
    // They are only excluded from the count

    // Filter by status dropdown
    if (filterStatus.length > 0) {
      const ticketStatusLower = String(ticket.status || '').toLowerCase();
      const normalizedFilters = filterStatus.map(f => String(f).toLowerCase());
      if (!normalizedFilters.includes(ticketStatusLower)) return false;
    }
    
    
    // Filter by category
    if (filterCategory.length > 0 && !filterCategory.includes(ticket.category)) {
      return false;
    }

    // Filter by ticket number
    if (ticketNumberSearch.trim()) {
      const search = ticketNumberSearch.trim().toLowerCase();
      const ticketNum = String(ticket.ticketNumber || '').toLowerCase();
      if (!ticketNum.includes(search)) return false;
    }
    
    // Filter by tag search term
    if (tagSearchTerm.trim()) {
      const hasMatchingTag = ticket.tags?.some((tag: string) => 
        tag.toLowerCase().includes(tagSearchTerm.toLowerCase())
      );
      if (!hasMatchingTag) return false;
    }
    
    return true;
  });

  const getTicketCountsByTab = () => {
    return {
      online: tickets.filter(t => {
        const source = t.submissionSource || 'online';
        const status = String(t.status || '').toLowerCase();
        return source === 'online' && status !== 'resolved' && status !== 'closed';
      }).length,
      offline: tickets.filter(t => {
        const source = t.submissionSource || 'online';
        const status = String(t.status || '').toLowerCase();
        return source === 'offline' && status !== 'resolved' && status !== 'closed';
      }).length,
    };
  };

  // Determine which tabs to show based on project configuration
  const submissionMode = projectBranding?.ticketSubmissionMode || 'both';
  const showOnlineTab = submissionMode === 'online' || submissionMode === 'both';
  const showOfflineTab = submissionMode === 'offline' || submissionMode === 'both';

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'open': 'background: #fef3c7; color: #92400e; borderColor: #fbbf24',
      'in-progress': 'background: #dbeafe; color: #1e40af; borderColor: #3b82f6',
      'pending': 'background: #fce7f3; color: #9f1239; borderColor: #ec4899',
      'resolved': 'background: #d1fae5; color: #065f46; borderColor: #10b981',
      'closed': 'background: #e5e7eb; color: #374151; borderColor: #6b7280',
    };
    return colors[status.toLowerCase()] || colors.open;
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      'critical': 'background: #fee2e2; color: #991b1b',
      'urgent': 'background: #fed7aa; color: #9a3412',
      'high': 'background: #fef3c7; color: #92400e',
      'medium': 'background: #dbeafe; color: #1e40af',
      'low': 'background: #e5e7eb; color: #374151',
    };
    return colors[priority.toLowerCase()] || colors.medium;
  };

  const clearAllFilters = () => {
    setFilterStatus([]);
    setFilterCategory([]);
    setTagSearchTerm('');
    setTicketNumberSearch('');
  };

  const hasActiveFilters = filterStatus.length > 0 || filterCategory.length > 0 || tagSearchTerm.trim() || ticketNumberSearch.trim();

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '8px' }}>My Tickets</h1>
        <p style={{ color: '#6b7280', marginBottom: '32px' }}>Tickets assigned to you</p>
        <div style={{
          background: 'white',
          padding: '48px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }} />
          <p style={{ color: '#6b7280', marginTop: '16px' }}>Loading tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '24px' }}>My Tickets</h1>

      {/* Filters Section */}
      {/* Online/Offline Tabs */}
      <div style={{
        background: 'white',
        padding: '8px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {showOnlineTab && (
            <button
              onClick={() => setTicketTab('online')}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: 'none',
                background: ticketTab === 'online' ? '#3b82f6' : 'transparent',
                color: ticketTab === 'online' ? 'white' : '#6b7280',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Online Tickets ({getTicketCountsByTab().online})
            </button>
          )}
          {showOfflineTab && (
            <button
              onClick={() => setTicketTab('offline')}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: 'none',
                background: ticketTab === 'offline' ? '#3b82f6' : 'transparent',
                color: ticketTab === 'offline' ? 'white' : '#6b7280',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Offline Tickets ({getTicketCountsByTab().offline})
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Filter Row */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* Status Dropdown */}
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
              Status
            </label>
            <select
              value={filterStatus[0] || ''}
              onChange={(e) => setFilterStatus(e.target.value ? [e.target.value] : [])}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                cursor: 'pointer',
                background: 'white'
              }}
            >
              <option value=""></option>
              {allStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Dropdown */}
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
              category
            </label>
            <select
              value={filterCategory[0] || ''}
              onChange={(e) => setFilterCategory(e.target.value ? [e.target.value] : [])}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                cursor: 'pointer',
                background: 'white'
              }}
            >
              <option value=""></option>
              {allCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          {/* Ticket Number Input */}
          <div style={{ flex: '0 0 160px', minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
              Ticket #
            </label>
            <input
              type="text"
              value={ticketNumberSearch}
              onChange={(e) => setTicketNumberSearch(e.target.value)}
              placeholder="Search #"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px'
              }}
            />
          </div>

          {/* Tag Input/Dropdown */}
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
              Tag
            </label>
            <input
              type="text"
              value={tagSearchTerm}
              onChange={(e) => setTagSearchTerm(e.target.value)}
              placeholder="Search"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px'
              }}
            />
          </div>

          {/* Filter Button */}
          <div>
            <button
              style={{
                padding: '10px 32px',
                borderRadius: '6px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Filter Button
            </button>
          </div>
        </div>

        {/* Clear Filters Link */}
        {hasActiveFilters && (
          <div style={{ marginTop: '16px' }}>
            <button
              onClick={clearAllFilters}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: '1px solid #ef4444',
                background: 'white',
                color: '#ef4444',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Results Summary */}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          {filteredTickets.length === 0 ? 'No tickets found' : `Showing ${filteredTickets.length} of ${tickets.length} ticket(s)`}
        </p>
      </div>

        {/* Bulk Actions Bar */}
        {showBulkActions && (
          <div style={{
            background: '#3b82f6',
            color: 'white',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontWeight: '500' }}>
              {selectedTickets.size} ticket(s) selected
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0,0,0,0.08)',
                  fontSize: '14px',
                  cursor: 'pointer',
                  background: 'white',
                  color: '#111827',
                  minWidth: '160px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                }}
              >
                  <option value="">Change Status...</option>
                  {allStatuses.map((s) => (
                    <option key={s.value} style={{ color: '#111827', background: 'white' }} value={s.value}>
                      {s.name}
                    </option>
                  ))}
              </select>
              {bulkStatus && (
                <button
                  onClick={handleBulkStatusChange}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
              )}
              <button
                onClick={() => setShowBulkReplyModal(true)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'white',
                  color: '#3b82f6',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Reply to All
              </button>
              <button
                onClick={handleBulkClose}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#ef4444',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Close All
              </button>
              <button
                onClick={() => {
                  setSelectedTickets(new Set());
                  setShowBulkActions(false);
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: '1px solid white',
                  background: 'transparent',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      {/* Select All Checkbox */}
      {filteredTickets.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selectedTickets.size === filteredTickets.length && filteredTickets.length > 0}
              onChange={handleSelectAll}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Select All ({filteredTickets.length})
            </span>
          </label>
        </div>
      )}

      {/* Bulk Reply Modal */}
      {showBulkReplyModal && (
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
        }}>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
              Reply to {selectedTickets.size} Tickets
            </h2>
            <textarea
              value={bulkReply}
              onChange={(e) => setBulkReply(e.target.value)}
              placeholder="Type your reply message..."
              rows={6}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                marginBottom: '16px',
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowBulkReplyModal(false);
                  setBulkReply('');
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: 'white',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReplySubmit}
                disabled={!bulkReply.trim()}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: bulkReply.trim() ? '#3b82f6' : '#d1d5db',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: bulkReply.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Send Reply
              </button>
            </div>
          </div>
        </div>
      )}
      
      {filteredTickets.length === 0 ? (
        <div style={{
          background: 'white',
          padding: '48px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          textAlign: 'center'
        }}>
          <svg style={{ width: '64px', height: '64px', color: '#d1d5db', margin: '0 auto' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p style={{ color: '#6b7280', marginTop: '16px' }}>
            {hasActiveFilters ? 'No tickets match the selected filters' : 'No tickets assigned yet'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredTickets.map((ticket) => (
            <div
              key={ticket._id}
              style={{
                background: 'white',
                padding: '20px',
                borderRadius: '12px',
                border: selectedTickets.has(ticket._id) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="checkbox"
                  checked={selectedTickets.has(ticket._id)}
                  onChange={() => handleSelectTicket(ticket._id)}
                  style={{ width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0, marginTop: '4px' }}
                />
                <div 
                  onClick={() => navigate(`/${customUrlPath}/portal/ticket/${ticket._id}`)}
                  style={{ flex: 1, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '14px', color: '#6b7280' }}>
                          #{ticket.ticketNumber}
                        </span>
                        <span style={{ 
                          padding: '4px 12px', 
                          borderRadius: '9999px', 
                          fontSize: '12px', 
                          fontWeight: '500',
                          border: '1px solid',
                          ...(() => {
                            const style = getStatusColor(ticket.status);
                            return Object.fromEntries(style.split('; ').map(s => s.split(': ')));
                          })()
                        }}>
                          {ticket.status}
                        </span>
                        <span style={{ 
                          padding: '4px 12px', 
                          borderRadius: '9999px', 
                          fontSize: '12px', 
                          fontWeight: '500',
                          ...(() => {
                            const style = getPriorityColor(ticket.priority);
                            return Object.fromEntries(style.split('; ').map(s => s.split(': ')));
                          })()
                        }}>
                          {ticket.priority}
                        </span>
                        {ticket.tags?.map((tag: string) => (
                          <span key={tag} style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            background: '#f3f4f6',
                            color: '#374151'
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                        {ticket.title || ticket.subject || 'No subject'}
                      </h3>
                      <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.5' }}>
                        {ticket.description ? 
                          (ticket.description.length > 150 ? 
                            ticket.description.substring(0, 150) + '...' : 
                            ticket.description) 
                          : 'No description'}
                      </p>
                    </div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '16px', 
                    fontSize: '13px', 
                    color: '#6b7280',
                    paddingTop: '12px',
                    borderTop: '1px solid #f3f4f6',
                    flexWrap: 'wrap'
                  }}>
                    {ticket.category && (
                      <span>📂 {ticket.category}</span>
                    )}
                    {ticket.createdBy && (
                      <span>👤 {ticket.createdBy.firstName} {ticket.createdBy.lastName}</span>
                    )}
                    {ticket.metadata?.studentEmail && (
                      <span>✉️ {ticket.metadata.studentEmail}</span>
                    )}
                    <span>🕒 {new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectPortalDashboard = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      navigate(`/${customUrlPath}/portal/login`);
      return;
    }

    initializePortal(token);
  }, [customUrlPath, navigate]);

  const initializePortal = async (token: string) => {
    try {
      // Get user data
      const userResponse = await axios.get(`${API_CONFIG.API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = userResponse.data.data;

      // Route protection will handle access control based on permissions
      setUser(userData);

      // Get project branding
      const brandingResponse = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`
      );
      const brandingData = brandingResponse.data.success 
        ? brandingResponse.data.data 
        : brandingResponse.data;
      
      setProjectBranding(brandingData);

      // Apply project theme
      if (brandingData?.branding?.colorTheme) {
        const root = document.documentElement;
        const primaryColor = brandingData.branding.colorTheme.primary;
        
        root.style.setProperty('--primary-main', primaryColor);
        root.style.setProperty('--primary-dark', brandingData.branding.colorTheme.secondary);
        root.style.setProperty('--accent-main', brandingData.branding.colorTheme.accent);
        
        // Create a lighter version of primary color for hover states
        // Convert hex to RGB and add alpha for light variant
        const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          } : null;
        };
        
        const rgb = hexToRgb(primaryColor);
        if (rgb) {
          // Create light version with 15% opacity over white
          root.style.setProperty('--primary-light', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
        }
      }

      // Set module access based on permissions (dynamic, not hardcoded)
      const moduleAccess = getModuleAccessFromPermissions(userData.role.permissions || []);
      localStorage.setItem('moduleAccess', JSON.stringify(moduleAccess));
      localStorage.setItem('userName', userData.name || `${userData.firstName} ${userData.lastName}`);
      
      // Store project context
      localStorage.setItem('projectContext', JSON.stringify({
        projectId: brandingData.projectId,
        projectName: brandingData.name,
        customUrlPath: customUrlPath
      }));

      setLoading(false);
    } catch (error) {
      console.error('Error initializing portal:', error);
      localStorage.removeItem('authToken');
      navigate(`/${customUrlPath}/portal/login`);
    }
  };

  const getModuleAccessFromPermissions = (permissions: string[]) => {
    // Dynamically determine module access based on actual permissions
    // No hardcoded roles - works with ANY role name!
    
    const hasDashboardPermission = permissions.some(p => p.startsWith('DASHBOARD_'));
    const hasTicketPermission = permissions.some(p => p.startsWith('TICKET_'));
    const hasKnowledgeBasePermission = permissions.some(p => p.startsWith('KB_')); // Fixed: KB_ not KNOWLEDGE_BASE_
    const hasUserPermission = permissions.some(p => p.startsWith('USER_'));
    const hasAuditPermission = permissions.some(p => p.startsWith('AUDIT_'));
    const hasOfflinePermission = permissions.some(p => p.startsWith('OFFLINE_') || p.startsWith('STUDENT_'));

    return {
      dashboard: hasDashboardPermission, // Now permission-based, not hardcoded
      tickets: hasTicketPermission,
      knowledgeBase: hasKnowledgeBasePermission,
      users: hasUserPermission,
      audit: hasAuditPermission,
      offline: hasOfflinePermission,
      all: permissions.length > 20 // Heuristic for super admin (has many permissions)
    };
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        background: '#f9fafb'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e5e7eb',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  return (
    <DashboardLayout logoutRedirectPath={`/${customUrlPath}/portal/login`}>
      <Routes>
        <Route path="/dashboard" element={<ProjectDashboard wrapWithLayout={false} />} />
        
        {/* Ticket Routes */}
        <Route path="/tickets/view" element={
          <ProtectedRoute permission={[PERMISSIONS.TICKET_VIEW_ALL, PERMISSIONS.TICKET_VIEW_OWN]}>
            <ViewTickets />
          </ProtectedRoute>
        } />
        <Route path="/tickets/my-tickets" element={
          <ProtectedRoute permission={[PERMISSIONS.TICKET_VIEW_OWN, PERMISSIONS.TICKET_VIEW_ALL]}>
            <MyTickets wrapWithLayout={false} />
          </ProtectedRoute>
        } />
        <Route path="/tickets/assign" element={
          <ProtectedRoute permission={PERMISSIONS.TICKET_ASSIGN}>
            <TicketAssignment wrapWithLayout={false} />
          </ProtectedRoute>
        } />
        <Route path="/tickets/:id" element={
          <ProtectedRoute permission={[PERMISSIONS.TICKET_VIEW_OWN, PERMISSIONS.TICKET_VIEW_ALL]}>
            <AgentTicketDetail wrapWithLayout={false} />
          </ProtectedRoute>
        } />
        <Route path="/tickets" element={<AgentTicketsContent projectBranding={projectBranding} user={user} />} />
        
        <Route path="/knowledge-base" element={
          <ProtectedRoute permission={PERMISSIONS.KB_VIEW}>
            <KnowledgeBaseViewer />
          </ProtectedRoute>
        } />
        {/* NEW: Student Workflow replaces old Offline Module */}
        <Route path="/offline" element={<AgentStudentWorkflow projectId={projectBranding?.projectId || ''} />} />
        <Route path="/student-workflow" element={<AgentStudentWorkflow projectId={projectBranding?.projectId || ''} />} />
        <Route path="/users" element={<ProjectUserManagement />} />
        <Route path="/audit/activity-logs" element={<ActivityLogs wrapWithLayout={false} />} />
        <Route path="/audit/access-logs" element={<AccessLogs wrapWithLayout={false} />} />
        
        {/* Email Configuration */}
        <Route path="/email-config" element={
          <ProtectedRoute permission={PERMISSIONS.EMAIL_CONFIG_VIEW}>
            <EmailConfigPage />
          </ProtectedRoute>
        } />
        
        <Route path="/" element={
          user ? (
            <RedirectToFirstRoute permissions={user.role?.permissions || []} />
          ) : (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              minHeight: '200px',
              fontSize: '16px',
              color: '#6B7280'
            }}>
              Loading user data...
            </div>
          )
        } />
      </Routes>
    </DashboardLayout>
  );
};

export default ProjectPortalDashboard;
