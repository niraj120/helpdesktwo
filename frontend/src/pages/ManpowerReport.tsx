import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import { MdGridOn, MdDescription, MdRefresh } from 'react-icons/md';
import * as XLSX from 'xlsx';

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
  createdAt: string;
}

interface ManpowerReportProps {
  projectId?: string;
  wrapWithLayout?: boolean;
}

// Static demo users data
const DEMO_USERS: User[] = [
  {
    _id: '1',
    firstName: 'Anmol',
    lastName: 'Sharma',
    email: 'anmol.sharma@mhcet.edu.in',
    role: {
      _id: 'r1',
      name: 'CET State cell',
      code: 'CET_STATE_CELL'
    },
    department: 'Administration',
    designation: 'State Coordinator',
    joiningDate: '2024-01-15',
    employeeCode: 'MH001',
    projects: [],
    createdAt: '2024-01-15T00:00:00.000Z'
  },
  {
    _id: '2',
    firstName: 'Priya',
    lastName: 'Patil',
    email: 'priya.patil@mhcet.edu.in',
    role: {
      _id: 'r2',
      name: 'Center Manager',
      code: 'CENTER_MANAGER'
    },
    department: 'Operations',
    designation: 'Center Manager',
    joiningDate: '2024-02-10',
    employeeCode: 'MH002',
    projects: [],
    createdAt: '2024-02-10T00:00:00.000Z'
  },
  {
    _id: '3',
    firstName: 'Rahul',
    lastName: 'Deshmukh',
    email: 'rahul.deshmukh@mhcet.edu.in',
    role: {
      _id: 'r3',
      name: 'Support Staff',
      code: 'SUPPORT_STAFF'
    },
    department: 'Technical Support',
    designation: 'IT Support Executive',
    joiningDate: '2024-03-05',
    employeeCode: 'MH003',
    projects: [],
    createdAt: '2024-03-05T00:00:00.000Z'
  },
  {
    _id: '4',
    firstName: 'Sneha',
    lastName: 'Kulkarni',
    email: 'sneha.kulkarni@mhcet.edu.in',
    role: {
      _id: 'r4',
      name: 'Agent',
      code: 'AGENT'
    },
    department: 'Student Services',
    designation: 'Student Support Agent',
    joiningDate: '2024-04-20',
    employeeCode: 'MH004',
    projects: [],
    createdAt: '2024-04-20T00:00:00.000Z'
  },
  {
    _id: '5',
    firstName: 'Amit',
    lastName: 'Joshi',
    email: 'amit.joshi@mhcet.edu.in',
    role: {
      _id: 'r5',
      name: 'Center Manager',
      code: 'CENTER_MANAGER'
    },
    department: 'Operations',
    designation: 'Senior Center Manager',
    joiningDate: '2023-11-10',
    employeeCode: 'MH005',
    projects: [],
    createdAt: '2023-11-10T00:00:00.000Z'
  },
  {
    _id: '6',
    firstName: 'Kavita',
    lastName: 'Rane',
    email: 'kavita.rane@mhcet.edu.in',
    role: {
      _id: 'r6',
      name: 'Support Staff',
      code: 'SUPPORT_STAFF'
    },
    department: 'Administration',
    designation: 'Admin Executive',
    joiningDate: '2024-05-15',
    employeeCode: 'MH006',
    projects: [],
    createdAt: '2024-05-15T00:00:00.000Z'
  }
];

const ManpowerReport: React.FC<ManpowerReportProps> = ({ projectId, wrapWithLayout = true }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [projectId]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Simulate loading delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Use static demo data
      setUsers(DEMO_USERS);
    } catch (error: any) {
      console.error('Error loading users:', error);
      setError('Failed to load users. Please try again.');
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

  // Static center names to assign randomly
  const CENTERS = [
    'CET उपकेंद्र - Amravati',
    'CET उपकेंद्र - Kolhapur',
    'CET उपकेंद्र - Mumbai Suburban'
  ];

  const getRandomCenter = (userId: string): string => {
    // Use userId to get consistent center for same user
    const index = userId.charCodeAt(userId.length - 1) % CENTERS.length;
    return CENTERS[index];
  };

  const exportToExcel = () => {
    setExporting(true);
    try {
      const exportData = users.map(user => ({
        'Name': `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        'Email': user.email,
        'Role': user.role?.name || 'N/A',
        'Department': user.department || 'N/A',
        'Designation': user.designation || 'N/A',
        'Date of Joining': user.joiningDate 
          ? new Date(user.joiningDate).toLocaleDateString() 
          : new Date(user.createdAt).toLocaleDateString(),
        'Center Mapped': getRandomCenter(user._id)
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
      const headers = ['Name', 'Email', 'Role', 'Department', 'Designation', 'Date of Joining', 'Center Mapped'];
      const csvData = users.map(user => [
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        user.email,
        user.role?.name || 'N/A',
        user.department || 'N/A',
        user.designation || 'N/A',
        user.joiningDate 
          ? new Date(user.joiningDate).toLocaleDateString() 
          : new Date(user.createdAt).toLocaleDateString(),
        getRandomCenter(user._id)
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
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>
            Manpower Report
          </h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={fetchUsers}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              <MdRefresh size={18} />
              Refresh
            </button>
            <button
              onClick={exportToExcel}
              disabled={exporting || users.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: users.length === 0 ? 'not-allowed' : 'pointer',
                opacity: users.length === 0 ? 0.5 : 1,
              }}
            >
              <MdGridOn size={18} />
              Excel
            </button>
            <button
              onClick={exportToCSV}
              disabled={exporting || users.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: users.length === 0 ? 'not-allowed' : 'pointer',
                opacity: users.length === 0 ? 0.5 : 1,
              }}
            >
              <MdDescription size={18} />
              CSV
            </button>
          </div>
        </div>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
          {projectId 
            ? 'View and export user manpower data for this project' 
            : 'View and export user manpower data'}
        </p>
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
        ) : error ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ color: '#dc2626', fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
              Permission Required
            </div>
            <div style={{ color: '#6b7280', fontSize: '14px' }}>
              {error}
            </div>
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            No users found
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
                    Department
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Date of Joining
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Center Mapped
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
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
                      {user.department || 'N/A'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {user.joiningDate 
                        ? new Date(user.joiningDate).toLocaleDateString() 
                        : new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {getRandomCenter(user._id)}
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
          Showing {users.length} user{users.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );

  return content;
};

export default ManpowerReport;
