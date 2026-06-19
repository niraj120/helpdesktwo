import React, { useState, useEffect, useRef } from 'react';
import { MdHistory, MdEdit, MdSend, MdRefresh, MdClose } from 'react-icons/md';
import { API_CONFIG } from '../config/constants';
import DashboardLayout from './DashboardLayout';

interface AssetUsage {
  _id: string;
  assetId: {
    _id: string;
    name: string;
    category: {
      _id: string;
      name: string;
    } | string;
    unit: string;
  };
  centerName?: string;
  centerId?: string;
  totalAssigned: number;
  workingAsset: number;
  notWorkingAsset: number;
  lastUpdatedBy?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  updatedAt: string;
  lastAuditDate?: string;
  nextAuditDate?: string;
  auditFrequencyMonths?: number;
  auditSubmitted?: boolean;
  canEdit?: boolean;
  remark?: string;
  lastAuditSubmittedAt?: string;
  lastAuditSubmittedBy?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

interface EditData {
  workingAsset: number;
  notWorkingAsset: number;
  remark: string;
}

interface AuditLog {
  _id: string;
  userId: {
    firstName: string;
    lastName: string;
    email: string;
  };
  changeType: string;
  previousValues: {
    workingAsset: number;
    notWorkingAsset: number;
  };
  newValues: {
    workingAsset: number;
    notWorkingAsset: number;
  };
  changedAt: string;
  remarks?: string;
}

interface MyAssetsProps {
  wrapWithLayout?: boolean;
}

const MyAssets: React.FC<MyAssetsProps> = ({ wrapWithLayout = true }) => {
  const [assets, setAssets] = useState<AssetUsage[]>([]);
  const [assetLinkButtons, setAssetLinkButtons] = useState<
    Array<{ label: string; url: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({
    workingAsset: 0,
    notWorkingAsset: 0,
    remark: '',
  });
  const [expandedRemarkId, setExpandedRemarkId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedAssetLogs, setSelectedAssetLogs] = useState<AuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [assetToSubmit, setAssetToSubmit] = useState<{ id: string; centerId?: string } | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    // Prevent duplicate calls in React 18 Strict Mode
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchMyAssets();
    }
  }, []);

  const fetchMyAssets = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_CONFIG.API_URL}/my-assets`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.success) {
        setAssets(data.data || []);
        setAssetLinkButtons(
          Array.isArray(data.assetLinkButtons) ? data.assetLinkButtons : [],
        );
      } else {
        showMessage('error', data.message || 'Failed to load assets');
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
      showMessage('error', 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (asset: AssetUsage) => {
    setEditingId(asset._id);
    setEditData({
      workingAsset: asset.workingAsset,
      notWorkingAsset: asset.notWorkingAsset,
      remark: asset.remark || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditData({ workingAsset: 0, notWorkingAsset: 0, remark: '' });
  };

  const handleSave = async (assetId: string, totalAssigned: number, centerId?: string) => {
    // Validation
    if (editData.workingAsset + editData.notWorkingAsset !== totalAssigned) {
      showMessage('error', `Working + Not Working must equal Total Assigned (${totalAssigned})`);
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/my-assets/${assetId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          workingAsset: editData.workingAsset,
          notWorkingAsset: editData.notWorkingAsset,
          remarks: editData.remark,
          centerId, // Pass centerId for center-specific updates
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        showMessage('success', 'Asset counts updated successfully');
        setEditingId(null);
        fetchMyAssets();
      } else {
        showMessage('error', data.message || 'Failed to update asset');
      }
    } catch (error) {
      console.error('Failed to save:', error);
      showMessage('error', 'Failed to update asset');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAudit = (assetId: string, centerId?: string) => {
    setAssetToSubmit({ id: assetId, centerId });
    setShowSubmitConfirm(true);
  };

  const confirmSubmitAudit = async () => {
    if (!assetToSubmit) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/my-assets/${assetToSubmit.id}/submit-audit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          centerId: assetToSubmit.centerId, // Pass centerId for center-specific submissions
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        showMessage('success', 'Audit submitted successfully. Changes locked until next audit date.');
        setShowSubmitConfirm(false);
        setAssetToSubmit(null);
        setEditingId(null);
        fetchMyAssets();
      } else {
        showMessage('error', data.message || 'Failed to submit audit');
      }
    } catch (error) {
      console.error('Failed to submit audit:', error);
      showMessage('error', 'Failed to submit audit');
    } finally {
      setLoading(false);
    }
  };

  const handleViewHistory = async (assetId: string) => {
    try {
      setHistoryLoading(true);
      setShowHistoryModal(true);
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_CONFIG.API_URL}/my-assets/${assetId}/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.success) {
        setSelectedAssetLogs(data.data || []);
      } else {
        showMessage('error', 'Failed to load history');
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
      showMessage('error', 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const getCategoryName = (category: any) => {
    return typeof category === 'object' ? category.name : category || '-';
  };

  const getUpdatedByName = (lastUpdatedBy?: any) => {
    if (!lastUpdatedBy) return '-';
    if (lastUpdatedBy.firstName && lastUpdatedBy.lastName) {
      return `${lastUpdatedBy.firstName} ${lastUpdatedBy.lastName}`;
    }
    return lastUpdatedBy.email || '-';
  };

  // Derive summary stats for the header cards (only valid asset rows).
  const validAssets = assets.filter((a) => a.assetId != null);
  const statCards = [
    {
      label: 'Total Assets',
      value: validAssets.length,
      color: '#4f46e5',
    },
    {
      label: 'Total Assigned',
      value: validAssets.reduce((s, a) => s + (a.totalAssigned || 0), 0),
      color: '#2563eb',
    },
    {
      label: 'Working',
      value: validAssets.reduce((s, a) => s + (a.workingAsset || 0), 0),
      color: '#16a34a',
    },
    {
      label: 'Not Working',
      value: validAssets.reduce((s, a) => s + (a.notWorkingAsset || 0), 0),
      color: '#dc2626',
    },
    {
      label: 'Pending Audit',
      value: validAssets.filter((a) => a.canEdit && !a.auditSubmitted).length,
      color: '#d97706',
    },
  ];

  const content = (
    <div
      style={{
        padding: '24px 20px 32px',
        maxWidth: '1380px',
        margin: '0 auto',
        background: '#f6f8fc',
        minHeight: '100vh',
        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header card */}
      <div
        style={{
          background: '#ffffff',
          padding: '22px 24px',
          borderRadius: '14px',
          marginBottom: '16px',
          border: '1px solid #e7ebf3',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 6px 0',
              fontSize: '24px',
              fontWeight: 700,
              color: '#111827',
              letterSpacing: '-0.01em',
            }}
          >
            My Assets
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
            Update and manage your assigned assets. Next audit is scheduled
            based on audit frequency.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Custom link buttons configured per project on the Asset Management page */}
          {assetLinkButtons.map((b, i) => (
            <a
              key={`${b.label}-${i}`}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <span>🔗</span>
              {b.label}
            </a>
          ))}
          <button
            onClick={fetchMyAssets}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <MdRefresh className="h-5 w-5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {statCards.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: '#ffffff',
              border: '1px solid #e7ebf3',
              borderRadius: '12px',
              padding: '14px 16px',
              boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#6b7280',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '6px',
              }}
            >
              {stat.label}
            </div>
            <div
              style={{ fontSize: '24px', fontWeight: 700, color: stat.color }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Message Alert */}
      {message && (
        <div className={`mb-4 rounded-lg p-4 ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <div className="flex items-center justify-between">
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-current hover:opacity-70">
              <MdClose className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Assets Table — horizontal scroll stays inside this box */}
      <div
        style={{
          background: 'white',
          borderRadius: '10px',
          border: '1px solid #E4E7EC',
          boxShadow: '0 1px 3px rgba(0,0,0,.06)',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <table
          className="divide-y divide-gray-200"
          style={{ width: '100%', minWidth: '1100px' }}
        >
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Asset Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Center</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">Total Assigned</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">Working</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">Not Working</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 min-w-[200px]">Remark</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">Last Updated</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">Next Audit</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading && !assets.length ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-500">
                    Loading assets...
                  </td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-500">
                    No assets assigned yet.
                  </td>
                </tr>
              ) : (
                assets.filter((asset) => asset.assetId != null).map((asset) => {
                  const isEditing = editingId === asset._id;
                  const categoryName = getCategoryName(asset.assetId?.category);
                  // Show audit submission user if available, otherwise show last updated user
                  const updatedBy = getUpdatedByName(asset.lastAuditSubmittedBy || asset.lastUpdatedBy);
                  // Show audit submission date if available, otherwise show general updated date
                  const lastUpdatedDate = asset.lastAuditSubmittedAt || asset.updatedAt;

                  return (
                    <tr key={asset._id} className="hover:bg-gray-50">
                      {/* Asset Name */}
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">{asset.assetId?.name || 'Unknown Asset'}</div>
                        <div className="text-xs text-gray-500">{categoryName}</div>
                      </td>

                      {/* Center */}
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="text-sm text-gray-900">{asset.centerName || 'Unknown Center'}</div>
                      </td>

                      {/* Total Assigned */}
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
                          {asset.totalAssigned}
                        </span>
                      </td>

                      {/* Working */}
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            max={asset.totalAssigned}
                            value={editData.workingAsset}
                            onChange={(e) => {
                              const working = parseInt(e.target.value) || 0;
                              setEditData(prev => ({ 
                                ...prev,
                                workingAsset: working, 
                                notWorkingAsset: asset.totalAssigned - working 
                              }));
                            }}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none"
                          />
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                            {asset.workingAsset}
                          </span>
                        )}
                      </td>

                      {/* Not Working */}
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
                          {isEditing ? editData.notWorkingAsset : asset.notWorkingAsset}
                        </span>
                      </td>

                      {/* Remark */}
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-[300px]">
                        {isEditing ? (
                          <textarea
                            value={editData.remark}
                            onChange={(e) => setEditData(prev => ({ ...prev, remark: e.target.value }))}
                            rows={2}
                            placeholder="Add remark..."
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm resize-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                          />
                        ) : asset.remark ? (
                          asset.remark.length > 50 ? (
                            expandedRemarkId === asset._id ? (
                              <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                                <p className="whitespace-pre-wrap break-words text-sm">{asset.remark}</p>
                                <button
                                  onClick={() => setExpandedRemarkId(null)}
                                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  Show less
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <span className="line-clamp-2 break-words">{asset.remark.substring(0, 50)}...</span>
                                <button
                                  onClick={() => setExpandedRemarkId(asset._id)}
                                  className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                                >
                                  More
                                </button>
                              </div>
                            )
                          ) : (
                            <span className="break-words">{asset.remark}</span>
                          )
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>

                      {/* Last Updated */}
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <div className="text-sm text-gray-900">{formatDate(lastUpdatedDate)}</div>
                        <div className="text-xs text-gray-500">by {updatedBy}</div>
                      </td>

                      {/* Next Audit */}
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        {asset.nextAuditDate ? (
                          <div className="text-sm font-medium text-gray-900">{formatDate(asset.nextAuditDate)}</div>
                        ) : asset.lastAuditDate ? (
                          // First audit not yet submitted - show first audit date
                          <div>
                            <div className="text-sm font-medium text-green-600">{formatDate(asset.lastAuditDate)}</div>
                            <div className="text-xs text-gray-500">First Audit</div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Not scheduled</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {/* Edit Button - Only show if canEdit and not currently editing */}
                          {asset.canEdit && !isEditing && (
                            <button
                              onClick={() => handleEdit(asset)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 flex items-center gap-1"
                            >
                              <MdEdit className="h-4 w-4" />
                              Edit
                            </button>
                          )}

                          {/* Save/Cancel - Show when editing */}
                          {isEditing && (
                            <>
                              <button
                                onClick={() => handleSave(asset._id, asset.totalAssigned, asset.centerId)}
                                disabled={loading}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="rounded-lg bg-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {/* Submit Button - Only show if canEdit and not submitted */}
                          {asset.canEdit && !asset.auditSubmitted && !isEditing && (
                            <button
                              onClick={() => handleSubmitAudit(asset._id, asset.centerId)}
                              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 flex items-center gap-1"
                            >
                              <MdSend className="h-4 w-4" />
                              Submit
                            </button>
                          )}

                          {/* History Button - Always visible */}
                          <button
                            onClick={() => handleViewHistory(asset._id)}
                            className="rounded-lg bg-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 flex items-center gap-1"
                          >
                            <MdHistory className="h-4 w-4" />
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </div>

      {/* Audit Status Legend */}
      <div className="mt-4 rounded-lg bg-blue-50 p-4 border border-blue-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Note:</h3>
        <ul className="text-xs text-gray-700 space-y-1">
          <li>• <strong>Edit</strong> and <strong>Submit</strong> buttons appear only on/after the audit date</li>
          <li>• You can edit multiple times before submitting</li>
          <li>• Once submitted, no changes can be made until the next audit date</li>
          <li>• <strong>History</strong> shows all previous updates with timestamps</li>
        </ul>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Audit Submission</h2>
            <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <p className="text-sm text-yellow-800">
                ⚠️ <strong>Warning:</strong> Once you submit this audit, you will not be able to make any changes until the next audit date. Are you sure you want to continue?
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowSubmitConfirm(false);
                  setAssetToSubmit(null);
                }}
                className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmSubmitAudit}
                disabled={loading}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                Yes, Submit Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Audit History</h2>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedAssetLogs([]);
                }}
                className="rounded-lg p-2 hover:bg-gray-100"
              >
                <MdClose className="h-6 w-6 text-gray-600" />
              </button>
            </div>

            {historyLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading history...</div>
            ) : selectedAssetLogs.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No history available</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Updated By</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Updated On</th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Previous Working</th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">New Working</th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Previous Not Working</th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">New Not Working</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {selectedAssetLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <div className="font-medium text-gray-900">
                            {log.userId.firstName} {log.userId.lastName}
                          </div>
                          <div className="text-xs text-gray-500">{log.userId.email}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                          {formatDate(log.changedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500">
                          {log.previousValues.workingAsset}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center">
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                            {log.newValues.workingAsset}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500">
                          {log.previousValues.notWorkingAsset}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center">
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                            {log.newValues.notWorkingAsset}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return wrapWithLayout ? <DashboardLayout>{content}</DashboardLayout> : content;
};

export default MyAssets;
