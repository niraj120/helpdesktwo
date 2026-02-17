import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import axios from 'axios';
// import { usePermissions } from '../hooks/usePermissions'; // Commented out - not used
import { API_CONFIG } from '../config/constants';
import { useProjectContext } from '../contexts/ProjectContext';
import { useBranding } from '../contexts/BrandingContext';

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
    centerId?: string | {
      _id: string;
      centerName: string;
      city?: string;
      state?: string;
    };
    centerName?: string;
  };
  createdAt: string;
}

interface Agent {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: {
    name: string;
    code: string;
    isAgent?: boolean;
  };
  projects?: any[];
  centers?: {
    _id: string;
    centerName: string;
  }[];
}

interface Project {
  _id: string;
  name: string;
  code: string;
}

const TicketAssignment: React.FC<TicketAssignmentProps> = ({ wrapWithLayout = true }) => {
  // const { hasPermission } = usePermissions(); // Commented out - not used
  const { viewMode, currentProjectId, userProjects } = useProjectContext();
  const { branding: brandingProject } = useBranding();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAssignment, setFilterAssignment] = useState<string>('all'); // all, assigned, unassigned
  const [filterCounselor, setFilterCounselor] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTickets, setTotalTickets] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    checkUserRole();
  }, []);

  // Fetch tickets when viewMode or currentProjectId changes
  useEffect(() => {
    fetchTickets(1); // Reset to page 1 when context changes
  }, [viewMode, currentProjectId]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchProjects();
    }
  }, [isSuperAdmin]);

  // Separate effect for fetching agents - re-fetch when viewMode or project changes
  useEffect(() => {
    console.log('🔄 Agent fetch trigger:', {
      viewMode,
      currentProjectId,
      hasBrandingProject: !!brandingProject,
      projectId: brandingProject?.projectId,
      projectName: brandingProject?.name
    });
    
    // Fetch agents whenever viewMode or project changes
    fetchAgents();
  }, [viewMode, currentProjectId, brandingProject?.projectId]);

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

  const fetchTickets = async (page: number = currentPage) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      console.log('📊 [FETCH_TICKETS] viewMode from context:', viewMode);
      console.log('📊 [FETCH_TICKETS] currentProjectId from context:', currentProjectId);
      console.log('📊 [FETCH_TICKETS] localStorage viewMode:', localStorage.getItem('viewMode'));
      
      // Build URL with projectId parameter based on viewMode
      let url = `${API_CONFIG.API_URL}/tickets`;
      const params: any = {
        viewMode: viewMode, // Always send viewMode to backend
        page: page,
        limit: pageSize,
        forAssignment: 'true', // HIERARCHY FILTER: Only show tickets from self + subordinates
      };
      
      if (viewMode === 'single' && currentProjectId) {
        params.projectId = currentProjectId;
        console.log('📊 Fetching tickets for single project:', currentProjectId);
      } else if (viewMode === 'unified') {
        console.log('📊 Fetching tickets for all projects (unified mode)');
        // Don't pass projectId - backend will return tickets from all user's projects
      }
      
      console.log('📊 [FETCH_TICKETS] Final params being sent:', params);
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      console.log('📋 Full API Response:', response.data);

      if (response.data.success && response.data.data) {
        // API returns {tickets: [], pagination: {}} structure
        const ticketsData = response.data.data.tickets || response.data.data;
        const pagination = response.data.data.pagination;
        
        console.log('📋 Fetched tickets for assignment:', Array.isArray(ticketsData) ? ticketsData.length : 0);
        console.log('📋 Pagination info:', pagination);
        
        setTickets(Array.isArray(ticketsData) ? ticketsData : []);
        
        // Update pagination state
        if (pagination) {
          setCurrentPage(pagination.page || page);
          setTotalPages(pagination.totalPages || 1);
          setTotalTickets(pagination.total || ticketsData.length);
        } else {
          setTotalTickets(ticketsData.length);
          setTotalPages(1);
        }
      } else {
        console.warn('⚠️ No ticket data returned from API');
        setTickets([]);
        setTotalTickets(0);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setTickets([]);
      setTotalTickets(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      const url = `${API_CONFIG.API_URL}/tickets/assignable-agents`;
      const params: any = {
        viewMode: viewMode, // Always send viewMode to backend
      };
      
      // In single project mode, pass projectId to get agents for that specific project
      // In unified mode, don't pass projectId to get agents from ALL user's projects
      if (viewMode === 'single' && currentProjectId) {
        params.projectId = currentProjectId;
        console.log('🔍 Fetching agents for single project:', currentProjectId);
      } else if (viewMode === 'unified') {
        console.log('🔍 Fetching agents for all projects (unified mode)');
        // Don't pass projectId - backend will return agents from all user's projects
      }
      
      console.log('📡 API Request:', { url, params, viewMode });
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      
      if (response.data.success) {
        console.log('📋 Loaded assignable agents:', {
          totalAgents: response.data.data.length,
          agents: response.data.data.map((a: any) => `${a.firstName} ${a.lastName} (${a.role?.name || 'No Role'}) [${a.role?.code || 'NO_CODE'}]`)
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
      
      alert(`Successfully assigned ${selectedTickets.length} query(ies)`);
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
      ticket.ticketNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
    
    // Filter by assignment status
    const matchesAssignment = 
      filterAssignment === 'all' ||
      (filterAssignment === 'assigned' && ticket.assignedTo) ||
      (filterAssignment === 'unassigned' && !ticket.assignedTo);
    
    // Filter by counselor
    const matchesCounselor = 
      filterCounselor === 'all' ||
      ticket.assignedTo?._id === filterCounselor;
    
    return matchesStatus && matchesSearch && matchesProject && matchesAssignment && matchesCounselor;
  });

  const getStatusColor = (status: string | number) => {
    const colors: Record<string, string> = {
      'open': '#3B82F6',
      'in-progress': '#F59E0B',
      'resolved': '#10B981',
      'closed': '#6B7280',
      'pending': '#EF4444',
    };
    const statusStr = String(status).toLowerCase();
    return colors[statusStr] || '#6B7280';
  };

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

  const getPriorityColor = (priority: string | number) => {
    const colors: Record<string, string> = {
      'low': '#10B981',
      'medium': '#F59E0B',
      'high': '#EF4444',
      'critical': '#DC2626',
    };
    const priorityStr = String(priority).toLowerCase();
    return colors[priorityStr] || '#6B7280';
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
        <ModuleHeader
          title="Query Assignment"
          subtitle="Select queries and assign them to agents"
        />

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
                  {projects && projects.length > 0 && projects.map(project => (
                    <option key={project._id} value={project._id}>
                      {project.name} ({project.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                Select Counselor
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
                <option value="">-- Choose a counselor --</option>
                {agents && agents.length > 0 && agents.map(agent => {
                  const centerNames = agent.centers?.map(c => c.centerName).join(', ');
                  const displayText = centerNames 
                    ? `${agent.firstName} ${agent.lastName} (${agent.role?.name || ''}) - ${centerNames}`
                    : `${agent.firstName} ${agent.lastName} ${agent.role?.name ? `(${agent.role.name})` : ''}`;
                  return (
                    <option key={agent._id} value={agent._id}>
                      {displayText}
                    </option>
                  );
                })}
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
              {assigning ? 'Assigning...' : `Assign ${selectedTickets.length} Query(ies)`}
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
                placeholder="Search by query number, subject, or email..."
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
            
            {/* Status Filter */}
            <div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  minWidth: '120px',
                }}
              >
                <option value="all">All Status</option>
                <option value="1">Open</option>
                <option value="2">In Progress</option>
                <option value="3">On Hold</option>
                <option value="4">Resolved</option>
                <option value="5">Closed</option>
              </select>
            </div>

            {/* Assignment Filter */}
            <div>
              <select
                value={filterAssignment}
                onChange={(e) => setFilterAssignment(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  minWidth: '140px',
                }}
              >
                <option value="all">All Queries</option>
                <option value="unassigned">Unassigned</option>
                <option value="assigned">Assigned</option>
              </select>
            </div>

            {/* Counselor Filter */}
            <div>
              <select
                value={filterCounselor}
                onChange={(e) => setFilterCounselor(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  minWidth: '180px',
                }}
              >
                <option value="all">All Counselors</option>
                {agents && agents.length > 0 && agents.map(agent => {
                  const centerNames = agent.centers?.map(c => c.centerName).join(', ');
                  const displayText = centerNames 
                    ? `${agent.firstName} ${agent.lastName} - ${centerNames}`
                    : `${agent.firstName} ${agent.lastName}`;
                  return (
                    <option key={agent._id} value={agent._id}>
                      {displayText}
                    </option>
                  );
                })}
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
                  Currently Assigned
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Requester
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {!filteredTickets || filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
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
                      {(() => {
                        const centerId = ticket.metadata?.centerId;
                        if (!centerId || centerId === 'online') return 'Online';
                        if (typeof centerId === 'object') {
                          return centerId.centerName + (centerId.city ? `, ${centerId.city}` : '');
                        }
                        return ticket.metadata?.centerName || 'Online';
                      })()}
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
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: getStatusColor(ticket.status) + '20',
                        color: getStatusColor(ticket.status),
                      }}>
                        {getStatusName(ticket.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination and Summary */}
        <div style={{ 
          marginTop: '16px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          fontSize: '14px', 
          color: '#6B7280' 
        }}>
          {/* Pagination Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => fetchTickets(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: currentPage <= 1 ? '#F3F4F6' : 'white',
                color: currentPage <= 1 ? '#9CA3AF' : '#374151',
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                fontSize: '13px',
              }}
            >
              ← Previous
            </button>
            
            <span style={{ padding: '0 12px' }}>
              Page {currentPage} of {totalPages}
            </span>
            
            <button
              onClick={() => fetchTickets(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: currentPage >= totalPages ? '#F3F4F6' : 'white',
                color: currentPage >= totalPages ? '#9CA3AF' : '#374151',
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                fontSize: '13px',
              }}
            >
              Next →
            </button>
          </div>

          {/* Summary */}
          <div>
            Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalTickets)} of {totalTickets} tickets
            {selectedTickets.length > 0 && ` • ${selectedTickets.length} selected`}
          </div>
        </div>
      </div>
  );

  return wrapWithLayout ? <DashboardLayout>{content}</DashboardLayout> : content;
};

export default TicketAssignment;
