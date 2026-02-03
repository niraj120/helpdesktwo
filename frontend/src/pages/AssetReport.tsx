import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import { API_CONFIG } from '../config/constants';
import { MdGridOn, MdDescription, MdRefresh } from 'react-icons/md';
// XLSX is now dynamically imported in exportToExcel() to reduce bundle size (~500KB)

interface AssetUsage {
  _id: string;
  assetId: {
    _id: string;
    name: string;
    category: string;
    unit: string;
  };
  centerId: {
    _id: string;
    centerName: string;
    city: string;
  };
  projectId: {
    _id: string;
    name: string;
  };
  totalAssigned: number;
  assetUsed: number;
  assetNotUsed: number;
  workingAsset: number;
  notWorkingAsset: number;
  lastUpdatedBy: {
    _id: string;
    name: string;
  };
  updatedAt: string;
}

// Static demo data - matches MyAssetsStatic
const DEMO_ASSETS: AssetUsage[] = [
  {
    _id: '1',
    assetId: { _id: 'a1', name: 'AC', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'CET उपकेंद्र - Amravati', city: 'Amravati' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 5,
    assetUsed: 4,
    assetNotUsed: 1,
    workingAsset: 3,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u1', name: 'Niraj Mishra' },
    updatedAt: '2024-10-15T10:30:00Z',
  },
  {
    _id: '2',
    assetId: { _id: 'a2', name: 'Projector', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'CET उपकेंद्र - Amravati', city: 'Amravati' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 3,
    assetUsed: 3,
    assetNotUsed: 0,
    workingAsset: 2,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u1', name: 'Niraj Mishra' },
    updatedAt: '2024-09-10T14:20:00Z',
  },
  {
    _id: '3',
    assetId: { _id: 'a3', name: 'Chairs', category: 'Furniture', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'CET उपकेंद्र - Amravati', city: 'Amravati' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 50,
    assetUsed: 45,
    assetNotUsed: 5,
    workingAsset: 42,
    notWorkingAsset: 3,
    lastUpdatedBy: { _id: 'u1', name: 'Niraj Mishra' },
    updatedAt: '2024-11-01T09:00:00Z',
  },
  {
    _id: '4',
    assetId: { _id: 'a4', name: 'Tables', category: 'Furniture', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'CET उपकेंद्र - Amravati', city: 'Amravati' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 25,
    assetUsed: 24,
    assetNotUsed: 1,
    workingAsset: 23,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u1', name: 'Niraj Mishra' },
    updatedAt: '2024-10-20T11:15:00Z',
  },
  {
    _id: '5',
    assetId: { _id: 'a5', name: 'Computers', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'CET उपकेंद्र - Amravati', city: 'Amravati' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 10,
    assetUsed: 9,
    assetNotUsed: 1,
    workingAsset: 8,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u1', name: 'Niraj Mishra' },
    updatedAt: '2024-11-05T16:45:00Z',
  },
  // Kolhapur Center
  {
    _id: '6',
    assetId: { _id: 'a1', name: 'AC', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c2', centerName: 'CET उपकेंद्र - Kolhapur', city: 'Kolhapur' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 8,
    assetUsed: 7,
    assetNotUsed: 1,
    workingAsset: 6,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u2', name: 'Rahul Patil' },
    updatedAt: '2024-10-18T09:30:00Z',
  },
  {
    _id: '7',
    assetId: { _id: 'a2', name: 'Projector', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c2', centerName: 'CET उपकेंद्र - Kolhapur', city: 'Kolhapur' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 4,
    assetUsed: 4,
    assetNotUsed: 0,
    workingAsset: 3,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u2', name: 'Rahul Patil' },
    updatedAt: '2024-09-25T13:15:00Z',
  },
  {
    _id: '8',
    assetId: { _id: 'a3', name: 'Chairs', category: 'Furniture', unit: 'units' },
    centerId: { _id: 'c2', centerName: 'CET उपकेंद्र - Kolhapur', city: 'Kolhapur' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 60,
    assetUsed: 58,
    assetNotUsed: 2,
    workingAsset: 55,
    notWorkingAsset: 3,
    lastUpdatedBy: { _id: 'u2', name: 'Rahul Patil' },
    updatedAt: '2024-11-08T10:20:00Z',
  },
  {
    _id: '9',
    assetId: { _id: 'a4', name: 'Tables', category: 'Furniture', unit: 'units' },
    centerId: { _id: 'c2', centerName: 'CET उपकेंद्र - Kolhapur', city: 'Kolhapur' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 30,
    assetUsed: 28,
    assetNotUsed: 2,
    workingAsset: 27,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u2', name: 'Rahul Patil' },
    updatedAt: '2024-10-28T15:40:00Z',
  },
  {
    _id: '10',
    assetId: { _id: 'a5', name: 'Computers', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c2', centerName: 'CET उपकेंद्र - Kolhapur', city: 'Kolhapur' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 12,
    assetUsed: 11,
    assetNotUsed: 1,
    workingAsset: 10,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u2', name: 'Rahul Patil' },
    updatedAt: '2024-11-10T14:25:00Z',
  },
  // Mumbai Suburban Center
  {
    _id: '11',
    assetId: { _id: 'a1', name: 'AC', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c3', centerName: 'CET उपकेंद्र - Mumbai Suburban', city: 'Mumbai Suburban' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 10,
    assetUsed: 9,
    assetNotUsed: 1,
    workingAsset: 8,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u3', name: 'Priya Sharma' },
    updatedAt: '2024-10-22T11:45:00Z',
  },
  {
    _id: '12',
    assetId: { _id: 'a2', name: 'Projector', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c3', centerName: 'CET उपकेंद्र - Mumbai Suburban', city: 'Mumbai Suburban' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 5,
    assetUsed: 5,
    assetNotUsed: 0,
    workingAsset: 4,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u3', name: 'Priya Sharma' },
    updatedAt: '2024-09-30T16:10:00Z',
  },
  {
    _id: '13',
    assetId: { _id: 'a3', name: 'Chairs', category: 'Furniture', unit: 'units' },
    centerId: { _id: 'c3', centerName: 'CET उपकेंद्र - Mumbai Suburban', city: 'Mumbai Suburban' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 75,
    assetUsed: 70,
    assetNotUsed: 5,
    workingAsset: 68,
    notWorkingAsset: 2,
    lastUpdatedBy: { _id: 'u3', name: 'Priya Sharma' },
    updatedAt: '2024-11-12T08:30:00Z',
  },
  {
    _id: '14',
    assetId: { _id: 'a4', name: 'Tables', category: 'Furniture', unit: 'units' },
    centerId: { _id: 'c3', centerName: 'CET उपकेंद्र - Mumbai Suburban', city: 'Mumbai Suburban' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 35,
    assetUsed: 33,
    assetNotUsed: 2,
    workingAsset: 32,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u3', name: 'Priya Sharma' },
    updatedAt: '2024-10-25T12:55:00Z',
  },
  {
    _id: '15',
    assetId: { _id: 'a5', name: 'Computers', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c3', centerName: 'CET उपकेंद्र - Mumbai Suburban', city: 'Mumbai Suburban' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 15,
    assetUsed: 14,
    assetNotUsed: 1,
    workingAsset: 13,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u3', name: 'Priya Sharma' },
    updatedAt: '2024-11-15T10:00:00Z',
  },
];

interface AssetReportProps {
  projectId?: string;
  wrapWithLayout?: boolean;
}

const AssetReport: React.FC<AssetReportProps> = ({ projectId, wrapWithLayout = true }) => {
  const [assets, setAssets] = useState<AssetUsage[]>(DEMO_ASSETS);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // For now, just use static demo data
    // In future, can add API call: fetchAssets();
    setAssets(DEMO_ASSETS);
  }, [projectId]);

  const exportToExcel = async () => {
    setExporting(true);
    try {
      // Dynamic import - XLSX (~500KB) only loads when user clicks export
      const XLSX = await import('xlsx');
      
      const exportData = assets.map(asset => ({
        'Asset Name': asset.assetId.name,
        'Category': asset.assetId.category,
        'Center': asset.centerId.centerName,
        'City': asset.centerId.city,
        'Total Assigned': asset.totalAssigned,
        'Asset Used': asset.assetUsed,
        'Asset Not Used': asset.assetNotUsed,
        'Working Asset': asset.workingAsset,
        'Not Working Asset': asset.notWorkingAsset,
        'Last Updated': new Date(asset.updatedAt).toLocaleDateString(),
        'Last Updated By': asset.lastUpdatedBy.name
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Assets');
      XLSX.writeFile(wb, `Asset_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Error exporting:', error);
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      const headers = ['Asset Name', 'Category', 'Center', 'City', 'Total Assigned', 'Asset Used', 'Asset Not Used', 'Working Asset', 'Not Working Asset', 'Last Updated', 'Last Updated By'];
      const csvData = assets.map(asset => [
        asset.assetId.name,
        asset.assetId.category,
        asset.centerId.centerName,
        asset.centerId.city,
        asset.totalAssigned,
        asset.assetUsed,
        asset.assetNotUsed,
        asset.workingAsset,
        asset.notWorkingAsset,
        new Date(asset.updatedAt).toLocaleDateString(),
        asset.lastUpdatedBy.name
      ]);

      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Asset_Report_${new Date().toISOString().split('T')[0]}.csv`;
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
        title="Total Asset Report"
        subtitle="View and export asset usage data across centers"
      />
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '24px' }}>
        <button
          onClick={() => setAssets(DEMO_ASSETS)}
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
          disabled={exporting || assets.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 20px',
            background: (exporting || assets.length === 0) ? '#9ca3af' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: (exporting || assets.length === 0) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: (exporting || assets.length === 0) ? 'none' : '0 4px 15px rgba(16, 185, 129, 0.4)'
          }}
          onMouseEnter={(e) => {
            if (!exporting && assets.length > 0) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!exporting && assets.length > 0) {
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
          disabled={exporting || assets.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: assets.length === 0 ? 'not-allowed' : 'pointer',
            opacity: assets.length === 0 ? 0.5 : 1,
          }}
        >
          <MdDescription size={18} />
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
            Loading assets...
          </div>
        ) : assets.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            No assets found
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Asset Name
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Category
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Center
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Total Assigned
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Asset Used
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Working
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Not Working
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset, index) => (
                  <tr 
                    key={asset._id}
                    style={{ 
                      borderBottom: '1px solid #e5e7eb',
                      background: index % 2 === 0 ? 'white' : '#f9fafb'
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
                      {asset.assetId.name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      <span style={{
                        padding: '4px 8px',
                        background: asset.assetId.category === 'Electronics' ? '#dbeafe' : '#fef3c7',
                        color: asset.assetId.category === 'Electronics' ? '#1e40af' : '#92400e',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {asset.assetId.category}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      <div>{asset.centerId.centerName}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{asset.centerId.city}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', textAlign: 'center', fontWeight: '600' }}>
                      {asset.totalAssigned}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827', textAlign: 'center', fontWeight: '600' }}>
                      {asset.assetUsed}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        background: '#d1fae5',
                        color: '#065f46',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {asset.workingAsset}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        background: '#fee2e2',
                        color: '#991b1b',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {asset.notWorkingAsset}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                      <div>{new Date(asset.updatedAt).toLocaleDateString()}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>by {asset.lastUpdatedBy.name}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && assets.length > 0 && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: '#f9fafb',
          borderRadius: '6px',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          Showing {assets.length} asset{assets.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );

  return content;
};

export default AssetReport;
