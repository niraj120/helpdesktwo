import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import { API_CONFIG } from '../config/constants';
import { MdGridOn, MdDescription, MdRefresh } from 'react-icons/md';
// XLSX is now dynamically imported in exportToExcel() to reduce bundle size (~500KB)

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: {
    _id: string;
    name: string;
    code: string;
  };
  joiningDate?: string;
  department?: string;
  designation?: string;
  employeeCode?: string;
  projects?: Array<{
    _id: string;
    name: string;
    code: string;
  }>;
  centers?: Array<{
    _id: string;
    centerName: string;
  }>;
  createdAt: string;
}

interface ManpowerReportProps {
  projectId?: string;
  wrapWithLayout?: boolean;
}

const ManpowerReport: React.FC<ManpowerReportProps> = ({ projectId, wrapWithLayout = true }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCenter, setSelectedCenter] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');

  useEffect(() => {
    fetchUsers();
  }, [projectId]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('authToken');
      if (!token) {
        setError('No authentication token found');
        setLoading(false);
        return;
      }

      // Build query params
      const params = new URLSearchParams({
        limit: '1000', // Get all users
        page: '1'
      });

      if (projectId) {
        params.append('project', projectId);
      }

      console.log('Fetching users from:', `${API_CONFIG.BASE_URL}/api/users?${params.toString()}`);
      
      const response = await axios.get(`${API_CONFIG.BASE_URL}/api/users?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('API Response:', response.data);

      if (response.data.success) {
        console.log('Users received:', response.data.data?.length || 0);
        setUsers(response.data.data || []);
      } else {
        console.log('API returned success=false');
        setUsers([]);
      }
    } catch (error: any) {
      console.error('Error loading users:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      // Just log the error but still try to show any data we have
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const getProjectNames = (user: User): string => {
    if (user.projects && user.projects.length > 0) {
      return user.projects.map(p => p.name).join(', ');
    }
    return 'N/A';
  };

  // Get center names for a user
  const getCenterNames = (user: User): string => {
    if (user.centers && user.centers.length > 0) {
      return user.centers.map(c => c.centerName).join(', ');
    }
    return 'Not Assigned';
  };

  // Get unique centers from all users
  const getUniqueCenters = (): string[] => {
    const centerSet = new Set<string>();
    users.forEach(user => {
      if (user.centers && user.centers.length > 0) {
        user.centers.forEach(center => {
          centerSet.add(center.centerName);
        });
      }
    });
    return Array.from(centerSet).sort();
  };

  // Get unique roles from users
  const getUniqueRoles = (): string[] => {
    const roles = users.map(user => user.role?.name).filter(Boolean) as string[];
    return Array.from(new Set(roles)).sort();
  };

  // Filter users based on selected filters
  const filteredUsers = users.filter(user => {
    // Exclude students - they are not manpower
    if (user.role?.name?.toLowerCase().includes('student')) {
      return false;
    }
    if (selectedRole && user.role?.name !== selectedRole) {
      return false;
    }
    return true;
  });

  const exportToExcel = async () => {
    setExporting(true);
    try {
      // Dynamic import - XLSX (~500KB) only loads when user clicks export
      const XLSX = await import('xlsx');
      
      const exportData = filteredUsers.map(user => ({
        'Name': `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        'Email': user.email,
        'Role': user.role?.name || 'N/A',
        'Designation': user.designation || 'N/A',
        'Date of Joining': user.joiningDate 
          ? new Date(user.joiningDate).toLocaleDateString() 
          : new Date(user.createdAt).toLocaleDateString()
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Manpower');
      XLSX.writeFile(wb, `Manpower_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Error exporting:', error);
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      const headers = ['Name', 'Email', 'Role', 'Designation', 'Date of Joining'];
      const csvData = filteredUsers.map(user => [
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        user.email,
        user.role?.name || 'N/A',
        user.designation || 'N/A',
        user.joiningDate 
          ? new Date(user.joiningDate).toLocaleDateString() 
          : new Date(user.createdAt).toLocaleDateString()
      ]);

      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Manpower_Report_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting:', error);
    } finally {
      setExporting(false);
    }
  };

  const content = (
    <div style={{ padding: wrapWithLayout ? '0' : '24px' }}>
      <ModuleHeader
        title="Manpower Report"
        subtitle="View and export staff and agent data"
      />
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '24px' }}>
        <button
          onClick={fetchUsers}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            background: loading ? '#9ca3af' : 'white',
            color: loading ? 'white' : '#374151',
            border: '2px solid #E5E7EB',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <MdRefresh size={18} />
          Refresh
        </button>
        <button
          onClick={exportToExcel}
          disabled={exporting || filteredUsers.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            background: (exporting || filteredUsers.length === 0) ? '#9ca3af' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: (exporting || filteredUsers.length === 0) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: (exporting || filteredUsers.length === 0) ? 'none' : '0 4px 15px rgba(16, 185, 129, 0.4)'
          }}
          onMouseEnter={(e) => {
            if (!exporting && filteredUsers.length > 0) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!exporting && filteredUsers.length > 0) {
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
          disabled={exporting || filteredUsers.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: filteredUsers.length === 0 ? 'not-allowed' : 'pointer',
            opacity: filteredUsers.length === 0 ? 0.5 : 1,
          }}
        >
          <MdDescription size={18} />
          CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        {/* Role Filter */}
        <div style={{ flex: '1', minWidth: '200px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '4px', 
            fontSize: '14px', 
            fontWeight: '500', 
            color: '#374151' 
          }}>
            Role
          </label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="">All</option>
            {getUniqueRoles().map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>

        {/* Clear Filters Button */}
        {selectedRole && (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={() => {
                setSelectedCenter('');
                setSelectedRole('');
              }}
              style={{
                padding: '8px 16px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Clear Filters
            </button>
          </div>
        )}
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
            Loading users...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            {error ? error : (users.length === 0 ? 'No users found' : 'No users match the selected filters')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Name
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Email
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Role
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Date of Joining
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <tr 
                    key={user._id}
                    style={{ 
                      borderBottom: '1px solid #e5e7eb',
                      background: index % 2 === 0 ? 'white' : '#f9fafb'
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
                      {user.firstName || user.lastName 
                        ? `${user.firstName || ''} ${user.lastName || ''}`.trim() 
                        : user.email}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {user.email}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                      <span style={{
                        padding: '4px 8px',
                        background: '#e0e7ff',
                        color: '#3730a3',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {user.role?.name || 'N/A'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {user.joiningDate 
                        ? new Date(user.joiningDate).toLocaleDateString() 
                        : new Date(user.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && users.length > 0 && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: '#f9fafb',
          borderRadius: '6px',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          Showing {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
          {selectedRole && ' (filtered)'}
        </div>
      )}
    </div>
  );

  return content;
};

export default ManpowerReport;
