import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import axios from 'axios';
import { usePermissions } from '../hooks/usePermissions';
import { API_CONFIG } from '../config/constants';

interface TicketAssignmentProps {
  wrapWithLayout?: boolean;
}

interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category?: string;
  assignedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  metadata?: {
    studentName?: string;
    studentEmail?: string;
    projectId?: {
      _id: string;
      name: string;
      code: string;
    } | string;
  };
  createdAt: string;
}

interface Agent {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: {
    name: string;
    code: string;
    isAgent?: boolean;
  };
  projects?: any[];
}

interface Project {
  _id: string;
  name: string;
  code: string;
}

const TicketAssignment: React.FC<TicketAssignmentProps> = ({ wrapWithLayout = true }) => {
  const { hasPermission } = usePermissions();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    checkUserRole();
    fetchTickets();
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchProjects();
    }
    // Fetch agents after role is determined
    fetchAgents();
  }, [isSuperAdmin]);

  const checkUserRole = () => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const roleCode = user.role?.code || user.roleCode;
      setIsSuperAdmin(roleCode === 'SUPER_ADMIN');
    }
  };

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        setProjects(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('authToken');
      // Use /api/tickets endpoint which shows ALL tickets for Super Admin, project-specific for others
      const response = await axios.get(`${API_CONFIG.API_URL}/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        console.log('📋 Fetched tickets for assignment:', response.data.data.length);
        setTickets(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      // Use the assignable-agents endpoint
      const response = await axios.get(`${API_CONFIG.API_URL}/tickets/assignable-agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.data.success) {
        console.log('📋 Loaded assignable agents:', {
          totalAgents: response.data.data.length,
          agents: response.data.data.map((a: any) => `${a.firstName} ${a.lastName} (${a.role?.name})`)
        });
        setAgents(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching assignable agents:', error);
      setAgents([]);
    }
  };

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTickets(prev => 
      prev.includes(ticketId) 
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const filteredTicketIds = filteredTickets.map(t => t._id);
      setSelectedTickets(filteredTicketIds);
    } else {
      setSelectedTickets([]);
    }
  };

  const handleAssignTickets = async () => {
    if (!selectedAgent || selectedTickets.length === 0) {
      alert('Please select tickets and an agent');
      return;
    }

    setAssigning(true);
    try {
      const token = localStorage.getItem('authToken');
      
      // Assign tickets one by one
      const promises = selectedTickets.map(ticketId => 
        axios.put(
          `${API_CONFIG.API_URL}/tickets/${ticketId}/assign`,
          { agentId: selectedAgent },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );

      await Promise.all(promises);
      
      alert(`Successfully assigned ${selectedTickets.length} ticket(s)`);
      setSelectedTickets([]);
      setSelectedAgent('');
      fetchTickets(); // Refresh ticket list
    } catch (error: any) {
      console.error('Error assigning tickets:', error);
      alert(error.response?.data?.message || 'Failed to assign tickets');
    } finally {
      setAssigning(false);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    const matchesSearch = 
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.metadata?.studentEmail?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // For Super Admin, filter by selected project
    let matchesProject = true;
    if (isSuperAdmin && selectedProject !== 'all') {
      const ticketProjectId = typeof ticket.metadata?.projectId === 'object' 
        ? ticket.metadata?.projectId?._id 
        : ticket.metadata?.projectId;
      matchesProject = ticketProjectId === selectedProject;
    }
    
    return matchesStatus && matchesSearch && matchesProject;
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

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      'low': '#10B981',
      'medium': '#F59E0B',
      'high': '#EF4444',
      'critical': '#DC2626',
    };
    return colors[priority?.toLowerCase()] || '#6B7280';
  };

  if (loading) {
    const loadingContent = (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <p>Loading tickets...</p>
      </div>
    );
    return wrapWithLayout ? <DashboardLayout>{loadingContent}</DashboardLayout> : loadingContent;
  }

  const content = (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            Ticket Assignment
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>
            Select tickets and assign them to agents
          </p>
        </div>

        {/* Assignment Panel */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Project Filter (Super Admin only) */}
            {isSuperAdmin && (
              <div style={{ flex: 1, minWidth: '250px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                  Filter by Project
                </label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  <option value="all">All Projects</option>
                  {projects.map(project => (
                    <option key={project._id} value={project._id}>
                      {project.name} ({project.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                Select Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              >
                <option value="">-- Choose an agent --</option>
                {agents.map(agent => (
                  <option key={agent._id} value={agent._id}>
                    {agent.firstName} {agent.lastName} ({agent.role.name})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAssignTickets}
              disabled={!selectedAgent || selectedTickets.length === 0 || assigning}
              style={{
                padding: '10px 24px',
                background: selectedAgent && selectedTickets.length > 0 ? '#2563EB' : '#9CA3AF',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: selectedAgent && selectedTickets.length > 0 ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              {assigning ? 'Assigning...' : `Assign ${selectedTickets.length} Ticket(s)`}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Search by ticket number, subject, or email..."
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
          </div>
        </div>

        {/* Tickets Table */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <tr>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                  <input
                    type="checkbox"
                    checked={selectedTickets.length === filteredTickets.length && filteredTickets.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Ticket #
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Subject
                </th>
                {isSuperAdmin && (
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                    Project
                  </th>
                )}
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Priority
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Currently Assigned
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Requester
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
                    No tickets found
                  </td>
                </tr>
              ) : (
                filteredTickets.map(ticket => (
                  <tr
                    key={ticket._id}
                    style={{
                      borderBottom: '1px solid #F3F4F6',
                      background: selectedTickets.includes(ticket._id) ? '#F0F9FF' : 'white',
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <input
                        type="checkbox"
                        checked={selectedTickets.includes(ticket._id)}
                        onChange={() => handleSelectTicket(ticket._id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 600, color: '#2563EB' }}>
                      #{ticket.ticketNumber}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                      {ticket.subject || 'No subject'}
                    </td>
                    {isSuperAdmin && (
                      <td style={{ padding: '12px 16px' }}>
                        {ticket.metadata?.projectId && typeof ticket.metadata.projectId === 'object' ? (
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            background: '#EEF2FF',
                            color: '#4F46E5',
                          }}>
                            {ticket.metadata.projectId.name}
                          </span>
                        ) : (
                          <span style={{ color: '#9CA3AF', fontSize: '14px' }}>-</span>
                        )}
                      </td>
                    )}
                    <td style={{ padding: '12px 16px' }}>
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
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: getPriorityColor(ticket.priority) + '20',
                        color: getPriorityColor(ticket.priority),
                      }}>
                        {ticket.priority || 'N/A'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280' }}>
                      {ticket.assignedTo 
                        ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
                        : 'Unassigned'
                      }
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6B7280' }}>
                      {ticket.metadata?.studentName || ticket.metadata?.studentEmail || 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div style={{ marginTop: '16px', textAlign: 'right', fontSize: '14px', color: '#6B7280' }}>
          Showing {filteredTickets.length} of {tickets.length} tickets
          {selectedTickets.length > 0 && ` • ${selectedTickets.length} selected`}
        </div>
      </div>
  );

  return wrapWithLayout ? <DashboardLayout>{content}</DashboardLayout> : content;
};

export default TicketAssignment;
