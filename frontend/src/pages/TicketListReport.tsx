import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
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

const TicketListReport: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  
  // Filter states
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchCategories(selectedProject);
      fetchStatuses(selectedProject);
    } else {
      setCategories([]);
      setStatuses([]);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]); // Only refetch when project changes, other filters are client-side

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
      const response = await axios.get(`${API_CONFIG.BASE_URL}/api/statuses/project/${projectId}`, {
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

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      // Only projectId filter works server-side, category/status/search are filtered client-side
      const params = new URLSearchParams({
        page: '1',
        limit: '1000', // Get all tickets, filter client-side
        ...(selectedProject && { projectId: selectedProject }),
      });

      const response = await axios.get(`${API_CONFIG.API_URL}/tickets?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success && Array.isArray(response.data.data)) {
        setTickets(response.data.data);
        setTotal(response.data.pagination?.total || response.data.data.length);
      } else if (Array.isArray(response.data)) {
        setTickets(response.data);
        setTotal(response.data.length);
      } else {
        setTickets([]);
        setTotal(0);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
  };

  const handleReset = () => {
    setSelectedProject('');
    setSelectedCategory('');
    setSelectedStatus('');
    setSearchQuery('');
    setPage(1);
  };

  // Get filtered tickets for display - apply client-side filtering
  const displayTickets = tickets.filter(ticket => {
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
    
    // Filter by search query (ticket number)
    if (searchQuery) {
      if (!ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
    }
    
    return true;
  });

  // Export functions
  const getExportData = () => {
    return displayTickets.map(ticket => ({
      'Ticket Number': ticket.ticketNumber,
      'Project': ticket.metadata?.projectId?.name || 'N/A',
      'Student Name': ticket.metadata?.studentName || 'N/A',
      'Subject': ticket.subject || ticket.title || 'N/A',
      'Category': typeof ticket.category === 'string' ? ticket.category : (ticket.category?.name || 'N/A'),
      'Status': ticket.statusName || ticket.status || 'N/A',
      'Assigned To': ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : 'Unassigned',
      'Created Date': new Date(ticket.createdAt).toLocaleDateString('en-IN'),
    }));
  };

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

      // Table
      const tableData = displayTickets.map(ticket => [
        ticket.ticketNumber,
        ticket.metadata?.projectId?.name || 'N/A',
        ticket.metadata?.studentName || 'N/A',
        typeof ticket.category === 'string' ? ticket.category : (ticket.category?.name || 'N/A'),
        ticket.statusName || ticket.status || 'N/A',
        ticket.assignedTo ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : 'Unassigned',
      ]);

      autoTable(doc, {
        head: [['Ticket #', 'Project', 'Student Name', 'Category', 'Status', 'Assigned To']],
        body: tableData,
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
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
      const data = getExportData();
      const ws = XLSXModule.utils.json_to_sheet(data);
      const wb = XLSXModule.utils.book_new();
      XLSXModule.utils.book_append_sheet(wb, ws, 'Ticket Report');
      
      // Auto-size columns
      const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length + 2, 15) }));
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
      const data = getExportData();
      const ws = XLSXModule.utils.json_to_sheet(data);
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
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
            Query List Report
          </h1>
          <p style={{ color: '#6b7280', marginTop: '4px' }}>
            View and export query data with filters
          </p>
        </div>
        
        {/* Export Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={exportToPDF}
            disabled={exporting || displayTickets.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: displayTickets.length === 0 ? 'not-allowed' : 'pointer',
              opacity: displayTickets.length === 0 ? 0.5 : 1,
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
              padding: '8px 16px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: displayTickets.length === 0 ? 'not-allowed' : 'pointer',
              opacity: displayTickets.length === 0 ? 0.5 : 1,
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
          {/* Project Filter */}
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

          {/* Category Filter */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
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
              <option value="">All Statuses</option>
              {statuses.map(status => (
                <option key={status._id} value={status.code}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Search by Ticket #
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter ticket number..."
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
        Showing {displayTickets.length} of {tickets.length} tickets
        {(selectedCategory || selectedStatus || searchQuery) && ' (filtered)'}
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
            Loading tickets...
          </div>
        ) : displayTickets.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            No tickets found matching the criteria
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Ticket #
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Project
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Student Name
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '14px' }}>
                    Category
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
                      {ticket.metadata?.projectId?.name || 'N/A'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                      {ticket.metadata?.studentName || 'N/A'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                      {typeof ticket.category === 'string' ? ticket.category : (ticket.category?.name || 'N/A')}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        background: '#dbeafe',
                        color: '#1e40af',
                      }}>
                        {ticket.statusName || ticket.status || 'N/A'}
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

  return <DashboardLayout>{content}</DashboardLayout>;
};

export default TicketListReport;
