import React, { useState, useMemo, useEffect } from 'react';
import ModuleHeader from '../components/ModuleHeader';
import TicketListReport from './TicketListReport';
import AssetReport from './AssetReport';
import EmployeeReport from './EmployeeReport';
import { MdAssessment, MdInventory, MdPeople } from 'react-icons/md';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';

type ReportType = 'query' | 'asset' | 'employee';

const ReportsPage: React.FC = () => {
  const { hasPermission } = usePermissions();
  
  // Filter report options based on user permissions
  const reportOptions = useMemo(() => {
    const allOptions = [
      { 
        value: 'query' as ReportType, 
        label: 'Query List Report', 
        icon: <MdAssessment />,
        permission: PERMISSIONS.REPORT_VIEW_QUERY
      },
      { 
        value: 'asset' as ReportType, 
        label: 'Asset Report', 
        icon: <MdInventory />,
        permission: PERMISSIONS.REPORT_VIEW_ASSET
      },
      { 
        value: 'employee' as ReportType, 
        label: 'Employee Report', 
        icon: <MdPeople />,
        permission: PERMISSIONS.REPORT_VIEW_EMPLOYEE
      },
    ];
    
    return allOptions.filter(option => hasPermission(option.permission));
  }, [hasPermission]);

  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);

  // Set initial report to first available option
  useEffect(() => {
    if (reportOptions.length > 0 && !selectedReport) {
      setSelectedReport(reportOptions[0].value);
    }
  }, [reportOptions, selectedReport]);

  // If no reports are available, show message
  if (reportOptions.length === 0) {
    return (
      <div style={{ padding: '24px' }}>
        <ModuleHeader
          title="Reports"
          subtitle="View and export various reports"
        />
        <div style={{ 
          padding: '48px', 
          textAlign: 'center', 
          background: '#f9fafb', 
          borderRadius: '8px',
          marginTop: '24px'
        }}>
          <p style={{ fontSize: '16px', color: '#6b7280' }}>
            You don't have permission to view any reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
        <ModuleHeader
          title="Reports"
          subtitle="View and export various reports"
        />

        {/* Report Type Selector */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '14px', 
            fontWeight: '600', 
            color: '#374151', 
            marginBottom: '8px' 
          }}>
            Select Report Type
          </label>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={selectedReport || ''}
              onChange={(e) => setSelectedReport(e.target.value as ReportType)}
              style={{
                width: '300px',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#111827',
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {reportOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {/* Visual indicator of selected report */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: '#eff6ff',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#1e40af',
              fontWeight: '600',
            }}>
              {reportOptions.find(opt => opt.value === selectedReport)?.icon}
              <span>{reportOptions.find(opt => opt.value === selectedReport)?.label}</span>
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div style={{ marginTop: '32px' }}>
          {selectedReport === 'query' && <TicketListReport wrapWithLayout={false} />}
          {selectedReport === 'asset' && <AssetReport wrapWithLayout={false} />}
          {selectedReport === 'employee' && <EmployeeReport wrapWithLayout={false} />}
        </div>
    </div>
  );
};

export default ReportsPage;