import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import { MdSearch, MdRefresh, MdPictureAsPdf, MdTableChart, MdGridOn } from 'react-icons/md';

interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  title: string;
  status: string;
  statusName?: string;
  priority: string;
  resolutionTime?: string;
  slaStatus?: string;
  category?: string | {
    _id: string;
    name: string;
  };
  assignedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  metadata?: {
    projectId?: {
      _id: string;
      name: string;
      code: string;
    };
    centerId?: string | {
      _id: string;
      centerName: string;
      city?: string;
      state?: string;
    };
    centerName?: string;
    studentName?: string;
    studentEmail?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface Project {
  _id: string;
  name: string;
  code: string;
  projectId: string;
}

interface Category {
  _id: string;
  name: string;
  code?: string;
}

interface Status {
  _id: string;
  name: string;
  code: string;
  color?: string;
}

interface Center {
  _id: string;
  centerName: string;
  city?: string;
  state?: string;
}

interface TicketListReportProps {
  projectId?: string;
  wrapWithLayout?: boolean;
}

// Helper function to convert status code to name
const getStatusName = (status: string | number): string => {
  const statusMap: Record<string | number, string> = {
    1: 'Open',
    2: 'In Progress',
    3: 'On Hold',
    4: 'Resolved',
    5: 'Closed',
    'open': 'Open',
    'in-progress': 'In Progress',
    'on-hold': 'On Hold',
    'resolved': 'Resolved',
    'closed': 'Closed',
  };
  return statusMap[status] || statusMap[String(status)] || String(status);
};

// Helper function to get status color
const getStatusColor = (status: string | number): { bg: string; text: string } => {
  const statusNum = typeof status === 'number' ? status : parseInt(status);
  switch (statusNum) {
    case 1: return { bg: '#fef3c7', text: '#92400e' }; // Open - Yellow
    case 2: return { bg: '#dbeafe', text: '#1e40af' }; // In Progress - Blue
    case 3: return { bg: '#fce7f3', text: '#9d174d' }; // On Hold - Pink
    case 4: return { bg: '#d1fae5', text: '#065f46' }; // Resolved - Green
    case 5: return { bg: '#e5e7eb', text: '#374151' }; // Closed - Gray
    default: return { bg: '#dbeafe', text: '#1e40af' };
  }
};

const TicketListReport: React.FC<TicketListReportProps> = ({ projectId, wrapWithLayout = true }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  
  // Filter states
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  
  const [selectedProject, setSelectedProject] = useState(projectId || '');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCenter, setSelectedCenter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // Only fetch projects if no projectId is provided (super admin view)
    if (!projectId) {
      fetchProjects();
    } else {
      // If projectId is provided, immediately fetch categories and statuses
      fetchCategories(projectId);
      fetchStatuses(projectId);
    }
  }, [projectId]);

  useEffect(() => {
    if (selectedProject) {
      fetchCategories(selectedProject);
      fetchStatuses(selectedProject);
      fetchCenters(selectedProject);
    } else if (!projectId) {
      // If no project selected and not embedded, clear dependent filters
      setCategories([]);
      setStatuses([]);
      setCenters([]);
    }
  }, [selectedProject, projectId]);

  useEffect(() => {
    // Check if user is Super Admin - they don't need project selection
    const userStr = localStorage.getItem('user');
    const userRole = localStorage.getItem('userRole');
    
    // Check both user object role and userRole string for super admin
    let isSuperAdmin = false;
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        const roleCode = user.role?.code || user.role;
        const roleName = user.role?.name || user.role;
        isSuperAdmin = roleCode === 'SUPER_ADMIN' || roleName === 'Super Admin';
      } catch (e) {
        console.error('Error parsing user from localStorage:', e);
      }
    }
    // Fallback: check userRole string
    if (!isSuperAdmin && userRole) {
      isSuperAdmin = userRole === 'Super Admin' || userRole === 'SUPER_ADMIN';
    }
    
    // For super admins, clear project restrictions
    if (isSuperAdmin && !projectId) {
      console.log('📊 Super Admin detected - clearing project restrictions');
      setSelectedProject(''); // Clear project selection for "All Projects" view
    }
    
    // Fetch tickets if:
    // 1. Super Admin (no project selection needed), OR
    // 2. A project is selected, OR
    // 3. projectId prop is provided (embedded in project view)
    if (isSuperAdmin || selectedProject || projectId) {
      console.log('📊 TicketListReport: Fetching tickets...', { isSuperAdmin, selectedProject, projectId, userRole });
      fetchTickets();
    } else {
      console.log('⏸️ TicketListReport: Waiting for project selection...');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]); // Refetch when project changes (including initial load with empty project)

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/projects?limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        // Projects are in response.data.data.projects
        const projectsList = response.data.data?.projects || response.data.data || [];
        if (Array.isArray(projectsList)) {
          setProjects(projectsList);
        } else {
          setProjects([]);
        }
      } else if (Array.isArray(response.data)) {
        setProjects(response.data);
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      setProjects([]);
    }
  };

  const fetchCategories = async (projectId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.BASE_URL}/api/categories/project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success && Array.isArray(response.data.data)) {
        setCategories(response.data.data);
      } else if (Array.isArray(response.data)) {
        setCategories(response.data);
      } else {
        setCategories([]);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      setCategories([]);
    }
  };

  const fetchStatuses = async (projectId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const cacheBuster = `?t=${Date.now()}`;
      const response = await axios.get(`${API_CONFIG.BASE_URL}/api/statuses/project/${projectId}${cacheBuster}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success && Array.isArray(response.data.data)) {
        setStatuses(response.data.data);
      } else if (Array.isArray(response.data)) {
        setStatuses(response.data);
      } else {
        setStatuses([]);
      }
    } catch (error) {
      console.error('Error fetching statuses:', error);
      setStatuses([]);
    }
  };

  const fetchCenters = async (projectId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/centers?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success && Array.isArray(response.data.data)) {
        setCenters(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching centers:', error);
      setCenters([]);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      // Check if user is Super Admin
      const userStr = localStorage.getItem('user');
      const userRole = localStorage.getItem('userRole');
      let isSuperAdmin = false;
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          const roleCode = user.role?.code || user.role;
          const roleName = user.role?.name || user.role;
          isSuperAdmin = roleCode === 'SUPER_ADMIN' || roleName === 'Super Admin';
        } catch (e) {
          // Fallback to userRole
        }
      }
      if (!isSuperAdmin && userRole) {
        isSuperAdmin = userRole === 'Super Admin' || userRole === 'SUPER_ADMIN';
      }
      
      // Build query parameters
      const params = new URLSearchParams({
        page: '1',
        limit: '1000', // Get all tickets, filter client-side
      });
      
      // For super admins, NEVER add projectId filter  unless explicitly selected
      // This ensures they see all tickets across all projects
      if (!isSuperAdmin && selectedProject) {
        params.append('projectId', selectedProject);
        console.log('📊 Adding project filter:', selectedProject);
      } else if (isSuperAdmin && selectedProject) {
        // Super admin with specific project selected
        params.append('projectId', selectedProject);
        console.log('📊 Super Admin with project filter:', selectedProject);
      } else if (isSuperAdmin) {
        console.log('📊 Super Admin - fetching ALL tickets (no project filter)');
      }

      const response = await axios.get(`${API_CONFIG.API_URL}/tickets?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('📊 API Response:', response.data);

      if (response.data.success && response.data.data?.tickets && Array.isArray(response.data.data.tickets)) {
        setTickets(response.data.data.tickets);
        setTotal(response.data.data.pagination?.total || response.data.data.tickets.length);
        console.log('✅ Tickets set:', response.data.data.tickets.length);
      } else if (Array.isArray(response.data.data)) {
        // Fallback for old response format
        setTickets(response.data.data);
        setTotal(response.data.length);
      } else if (Array.isArray(response.data)) {
        setTickets(response.data);
        setTotal(response.data.length);
      } else {
        setTickets([]);
        setTotal(0);
        console.warn('⚠️ Unexpected response structure');
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback(() => {
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setSelectedProject('');
    setSelectedCategory('');
    setSelectedStatus('');
    setSelectedCenter('');
    setSearchQuery('');
    setPage(1);
  }, []);

  // Get filtered tickets for display - memoized for performance
  const displayTickets = useMemo(() => {
    return tickets.filter(ticket => {
      // Filter by category (category is stored as string name)
      if (selectedCategory) {
        const category = categories.find(c => c._id === selectedCategory);
        const ticketCategory = typeof ticket.category === 'string' ? ticket.category : ticket.category?.name;
        if (category && ticketCategory?.toLowerCase() !== category.name?.toLowerCase()) {
          return false;
        }
      }
      
      // Filter by status (status is stored as string code like 'open', 'closed')
      // Compare case-insensitively since ticket.status might be 'open' and status.code might be 'OPEN'
      if (selectedStatus) {
        if (ticket.status?.toLowerCase() !== selectedStatus.toLowerCase()) {
          return false;
        }
      }
      
      // Filter by center
      if (selectedCenter) {
        const ticketCenterId = typeof ticket.metadata?.centerId === 'object' 
          ? ticket.metadata?.centerId?._id 
          : ticket.metadata?.centerId;
        if (selectedCenter === 'online') {
          if (ticketCenterId && ticketCenterId !== 'online') {
            return false;
          }
        } else {
          if (ticketCenterId !== selectedCenter) {
            return false;
          }
        }
      }
      
      // Filter by search query (ticket number)
      if (searchQuery) {
        if (!ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
      }
      
      return true;
    });
  }, [tickets, selectedCategory, selectedStatus, selectedCenter, searchQuery, categories]);

  // Export data memoized to avoid recomputation
  const exportData = useMemo(() => {
    return displayTickets.map(ticket => {
      const centerId = ticket.metadata?.centerId;
      const centerName = !centerId || centerId === 'online'
        ? 'Online'
        : (typeof centerId === 'object' ? centerId.centerName : ticket.metadata?.centerName || 'N/A');
      
      return {
        'Query Number': ticket.ticketNumber,
        'Student Name': ticket.metadata?.studentName || 'N/A',
        'Subject': ticket.subject || ticket.title || 'N/A',
        'Category': typeof ticket.category === 'string' ? ticket.category : (ticket.category?.name || 'N/A'),
        'Priority': ticket.priority?.toUpperCase() || 'N/A',
        'Center': centerName,
        'Resolution Time': ticket.resolutionTime || '-',
        'SLA Status': ticket.slaStatus || 'N/A',
        'Status': getStatusName(ticket.status),
        'Assigned To': ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : 'Unassigned',
        'Created Date': new Date(ticket.createdAt).toLocaleDateString('en-IN'),
      };
    });
  }, [displayTickets]);

  const exportToPDF = async () => {
    setExporting(true);
    try {
      const jsPDFModule = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const jsPDF = jsPDFModule.default;
      const autoTable = autoTableModule.default;
      
      const doc = new jsPDF('landscape');
      
      // Title
      doc.setFontSize(18);
      doc.text('Query List Report', 14, 20);
      
      // Subtitle with filters
      doc.setFontSize(10);
      let filterText = 'Filters: ';
      if (selectedProject) {
        const project = projects.find(p => p._id === selectedProject);
        filterText += `Project: ${project?.name || 'All'}, `;
      }
      if (selectedStatus) filterText += `Status: ${selectedStatus}, `;
      if (selectedCategory) {
        const category = categories.find(c => c._id === selectedCategory);
        filterText += `Category: ${category?.name || 'All'}, `;
      }
      if (filterText === 'Filters: ') filterText += 'None';
      doc.text(filterText, 14, 28);
      doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 14, 34);

      // Table - use memoized exportData
      const tableData = exportData.map(row => [
        row['Query Number'],
        row['Student Name'],
        row['Subject'],
        row['Category'],
        row['Priority'],
        row['Center'],
        row['Resolution Time'],
        row['SLA Status'],
        row['Status'],
        row['Assigned To'],
      ]);

      autoTable(doc, {
        head: [['Query #', 'Student Name', 'Subject', 'Category', 'Priority', 'Center', 'Resolution Time', 'SLA Status', 'Status', 'Assigned To']],
        body: tableData,
        startY: 40,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          0: { cellWidth: 22 }, // Query #
          1: { cellWidth: 25 }, // Student Name
          2: { cellWidth: 30 }, // Subject
          3: { cellWidth: 35 }, // Category
          4: { cellWidth: 18 }, // Priority
          5: { cellWidth: 25 }, // Center
          6: { cellWidth: 22 }, // Resolution Time
          7: { cellWidth: 20 }, // SLA Status
          8: { cellWidth: 18 }, // Status
          9: { cellWidth: 25 }, // Assigned To
        },
      });

      doc.save(`ticket-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Error exporting to PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const XLSXModule = await import('xlsx');
      // Use memoized exportData
      const ws = XLSXModule.utils.json_to_sheet(exportData);
      const wb = XLSXModule.utils.book_new();
      XLSXModule.utils.book_append_sheet(wb, ws, 'Ticket Report');
      
      // Auto-size columns
      const colWidths = Object.keys(exportData[0] || {}).map(key => ({ wch: Math.max(key.length + 2, 15) }));
      ws['!cols'] = colWidths;
      
      XLSXModule.writeFile(wb, `ticket-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Error exporting to Excel. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const XLSXModule = await import('xlsx');
      // Use memoized exportData
      const ws = XLSXModule.utils.json_to_sheet(exportData);
      const csv = XLSXModule.utils.sheet_to_csv(ws);
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ticket-report-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      alert('Error exporting to CSV. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const content = (
    <div style={{ padding: '24px' }}>
      <ModuleHeader
        title="Query List Report"
        subtitle="View and export query data with filters"
      />
      
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={exportToPDF}
            disabled={exporting || displayTickets.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              background: (exporting || displayTickets.length === 0) ? '#9ca3af' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: (exporting || displayTickets.length === 0) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: (exporting || displayTickets.length === 0) ? 'none' : '0 4px 15px rgba(239, 68, 68, 0.4)'
            }}
            onMouseEnter={(e) => {
              if (!exporting && displayTickets.length > 0) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!exporting && displayTickets.length > 0) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(239, 68, 68, 0.4)';
              }
            }}
          >
            <MdPictureAsPdf size={18} />
            PDF
          </button>
          <button
            onClick={exportToExcel}
            disabled={exporting || displayTickets.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              background: (exporting || displayTickets.length === 0) ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: (exporting || displayTickets.length === 0) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: (exporting || displayTickets.length === 0) ? 'none' : '0 4px 15px rgba(16, 185, 129, 0.4)'
            }}
            onMouseEnter={(e) => {
              if (!exporting && displayTickets.length > 0) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!exporting && displayTickets.length > 0) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.4)';
              }
            }}
          >
            <MdGridOn size={18} />
            Excel
          </button>
          <button
            onClick={exportToCSV}
            disabled={exporting || displayTickets.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: displayTickets.length === 0 ? 'not-allowed' : 'pointer',
              opacity: displayTickets.length === 0 ? 0.5 : 1,
            }}
          >
            <MdTableChart size={18} />
            CSV
          </button>
        </div>

      {/* Filters */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {/* Project Filter - Only show if no projectId prop provided */}
          {!projectId && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="">All Projects</option>
                {projects.map(project => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category Filter */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={!selectedProject && !projectId}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                background: (!selectedProject && !projectId) ? '#f3f4f6' : 'white',
              }}
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={!selectedProject}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                background: !selectedProject ? '#f3f4f6' : 'white',
              }}
            >
              <option value="">All</option>
              {statuses.map(status => (
                <option key={status._id} value={status.code}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>

          {/* Center Filter */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Center
            </label>
            <select
              value={selectedCenter}
              onChange={(e) => setSelectedCenter(e.target.value)}
              disabled={!selectedProject}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                background: !selectedProject ? '#f3f4f6' : 'white',
              }}
            >
              <option value="">All Centers</option>
              <option value="online">Online</option>
              {centers.map(center => (
                <option key={center._id} value={center._id}>
                  {center.centerName}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Search by Query #
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter query number..."
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              <button
                onClick={handleSearch}
                style={{
                  padding: '8px 12px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                <MdSearch size={18} />
              </button>
              <button
                onClick={handleReset}
                style={{
                  padding: '8px 12px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                <MdRefresh size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
        Showing {displayTickets.length} of {tickets.length} queries
        {(selectedCategory || selectedStatus || selectedCenter || searchQuery) && ' (filtered)'}
      </div>

      {/* Table */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            Loading queries...
          </div>
        ) : displayTickets.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            No queries found matching the criteria
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Query #
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Student Name
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px', minWidth: '120px', maxWidth: '150px' }}>
                    Subject
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px', minWidth: '120px', maxWidth: '150px' }}>
                    Category
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Priority
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Center
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Resolution Time
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    SLA Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Assigned To
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayTickets.map((ticket, index) => (
                  <tr
                    key={ticket._id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      background: index % 2 === 0 ? 'white' : '#f9fafb',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#3b82f6', fontWeight: '500' }}>
                      {ticket.ticketNumber}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                      {ticket.metadata?.studentName || 'N/A'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ticket.subject || ticket.title || 'N/A'}>
                      {ticket.subject || ticket.title || 'N/A'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={typeof ticket.category === 'string' ? ticket.category : (ticket.category?.name || 'N/A')}>
                      {typeof ticket.category === 'string' ? ticket.category : (ticket.category?.name || 'N/A')}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: ticket.priority?.toLowerCase() === 'high' || ticket.priority?.toLowerCase() === 'critical' ? '#fee2e2' : ticket.priority?.toLowerCase() === 'medium' ? '#fef3c7' : '#dbeafe',
                        color: ticket.priority?.toLowerCase() === 'high' || ticket.priority?.toLowerCase() === 'critical' ? '#991b1b' : ticket.priority?.toLowerCase() === 'medium' ? '#92400e' : '#1e40af',
                      }}>
                        {ticket.priority?.toUpperCase() || 'N/A'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                      {!ticket.metadata?.centerId || ticket.metadata?.centerId === 'online'
                        ? 'Online'
                        : (typeof ticket.metadata?.centerId === 'object'
                          ? ticket.metadata?.centerId?.centerName
                          : ticket.metadata?.centerName || 'Online')
                      }
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                      {ticket.resolutionTime || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      {ticket.slaStatus === 'Within SLA' ? (
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          background: '#d1fae5',
                          color: '#065f46',
                          fontWeight: '600',
                        }}>
                          Within SLA
                        </span>
                      ) : ticket.slaStatus === 'Outside SLA' ? (
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          background: '#fee2e2',
                          color: '#991b1b',
                          fontWeight: '600',
                        }}>
                          Outside SLA
                        </span>
                      ) : ticket.slaStatus === 'Pending' ? (
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          background: '#fef3c7',
                          color: '#92400e',
                          fontWeight: '600',
                        }}>
                          Pending
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>N/A</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        background: getStatusColor(ticket.status).bg,
                        color: getStatusColor(ticket.status).text,
                      }}>
                        {getStatusName(ticket.status)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                      {ticket.assignedTo
                        ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
                        : <span style={{ color: '#9ca3af' }}>Unassigned</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            padding: '16px',
            borderTop: '1px solid #e5e7eb',
          }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: page === 1 ? '#f3f4f6' : 'white',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            <span style={{ color: '#374151' }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: page === totalPages ? '#f3f4f6' : 'white',
                cursor: page === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return wrapWithLayout ? <DashboardLayout>{content}</DashboardLayout> : content;
};

export default TicketListReport;
