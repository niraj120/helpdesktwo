import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import { API_CONFIG } from '../config/constants';
import { MdRefresh } from 'react-icons/md';
// XLSX is now dynamically imported in exportToExcel() to reduce bundle size (~500KB)

interface Employee {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  mobile: string;
  centersMapped: string;
  isActive: boolean;
  status: string;
  role: string;
}

interface EmployeeReportProps {
  wrapWithLayout?: boolean;
}

const EmployeeReport: React.FC<EmployeeReportProps> = ({ wrapWithLayout = true }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_CONFIG.API_URL}/users/report`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmployees(response.data.data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const exportToExcel = async () => {
    setExporting(true);
    try {
      // Dynamic import - XLSX (~500KB) only loads when user clicks export
      const XLSX = await import('xlsx');
      
      const exportData = employees.map(emp => ({
        'Employee ID': emp.employeeCode,
        'Name': emp.fullName,
        'Email': emp.email,
        'Contact Number': emp.mobile,
        'Centers Mapped': emp.centersMapped,
        'Status': emp.status,
        'Role': emp.role
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Employees');
      XLSX.writeFile(wb, `Employee_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Error exporting:', error);
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      const headers = ['Employee ID', 'Name', 'Email', 'Contact Number', 'Centers Mapped', 'Status', 'Role'];
      const csvData = employees.map(emp => [
        emp.employeeCode,
        emp.fullName,
        emp.email,
        emp.mobile,
        emp.centersMapped,
        emp.status,
        emp.role
      ]);

      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Employee_Report_${new Date().toISOString().split('T')[0]}.csv`;
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
        title="Employee Report"
        subtitle="View and export employee data"
      />
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '24px' }}>
        <button
          onClick={fetchEmployees}
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
          disabled={loading || exporting || employees.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            background: loading || exporting || employees.length === 0 ? '#9ca3af' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: loading || exporting || employees.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Excel
        </button>
        <button
          onClick={exportToCSV}
          disabled={loading || exporting || employees.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            background: loading || exporting || employees.length === 0 ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: loading || exporting || employees.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          CSV
        </button>
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
            Loading employees...
          </div>
        ) : employees.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            No employees found
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Employee ID
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Name
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Email
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Contact Number
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Centers Mapped
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Status
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, index) => (
                  <tr 
                    key={employee._id}
                    style={{ 
                      borderBottom: '1px solid #e5e7eb',
                      background: index % 2 === 0 ? 'white' : '#f9fafb'
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
                      {employee.employeeCode}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
                      {employee.fullName}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {employee.email}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {employee.mobile}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {employee.centersMapped}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        background: employee.isActive ? '#d1fae5' : '#fee2e2',
                        color: employee.isActive ? '#065f46' : '#991b1b',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {employee.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      <span style={{
                        padding: '4px 8px',
                        background: '#dbeafe',
                        color: '#1e40af',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {employee.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && employees.length > 0 && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: '#f9fafb',
          borderRadius: '6px',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          Showing {employees.length} employee{employees.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );

  return wrapWithLayout ? (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  ) : content;
};

export default EmployeeReport;
