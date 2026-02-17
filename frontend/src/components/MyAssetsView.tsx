import React, { useState, useEffect } from 'react';
import { MdEdit, MdSave, MdClose, MdHistory, MdCheckCircle } from 'react-icons/md';
import { API_CONFIG } from '../config/constants';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';
import DashboardLayout from './DashboardLayout';
import ModuleHeader from './ModuleHeader';

interface Asset {
  _id: string;
  name: string;
  category?: any;
  unit?: string;
  predefinedCount?: number;
  icon?: string;
}

interface AssetMapping {
  _id: string;
  centerName: string;
  projectId: {
    _id: string;
    name: string;
    projectName: string;
  };
  assetId: Asset;
  totalAssigned: number;
  workingAsset: number;
  notWorkingAsset: number;
  remark?: string;
  assetUsed: number;
  assetNotUsed: number;
  lastAuditDate?: Date;
  nextAuditDate?: Date;
  auditSubmitted?: boolean;
  canEdit?: boolean;
  lastUpdatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  lastAuditSubmittedAt?: string;
  lastAuditSubmittedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface AuditLog {
  _id: string;
  userId: {
    firstName: string;
    lastName: string;
    email: string;
  };
  assetId: {
    name: string;
  };
  changeType: 'working_asset' | 'not_working_asset' | 'both';
  previousValues: {
    workingAsset: number;
    notWorkingAsset: number;
  };
  newValues: {
    workingAsset: number;
    notWorkingAsset: number;
  };
  changedAt: Date;
  remarks?: string;
}

const MyAssetsView: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [assets, setAssets] = useState<AssetMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ workingAsset: number; notWorkingAsset: number; remark: string }>({
    workingAsset: 0,
    notWorkingAsset: 0,
    remark: '',
  });
  const [expandedRemarkId, setExpandedRemarkId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [assetToSubmit, setAssetToSubmit] = useState<string | null>(null);

  const canView = hasPermission(PERMISSIONS.MY_ASSETS_VIEW);

  // Update timer every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (canView) {
      fetchMyAssets();
    }
  }, [canView]);

  const fetchMyAssets = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/my-assets`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        setAssets(data.data || []);
      } else {
        showMessage('error', data.message || 'Failed to fetch assets');
      }
    } catch (error) {
      console.error('Error fetching assets:', error);
      showMessage('error', 'Failed to fetch assets');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async (mappingId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/my-assets/${mappingId}/audit-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        setAuditLogs(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    }
  };

  const startEdit = (asset: AssetMapping) => {
    setEditingId(asset._id);
    setEditValues({
      workingAsset: asset.workingAsset,
      notWorkingAsset: asset.notWorkingAsset,
      remark: asset.remark || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({ workingAsset: 0, notWorkingAsset: 0, remark: '' });
  };

  const handleWorkingChange = (value: number, totalAssigned: number) => {
    const newWorking = Math.max(0, Math.min(value, totalAssigned));
    const newNotWorking = totalAssigned - newWorking;
    setEditValues({
      ...editValues,
      workingAsset: newWorking,
      notWorkingAsset: newNotWorking,
    });
  };

  const handleNotWorkingChange = (value: number, totalAssigned: number) => {
    const newNotWorking = Math.max(0, Math.min(value, totalAssigned));
    const newWorking = totalAssigned - newNotWorking;
    setEditValues({
      ...editValues,
      workingAsset: newWorking,
      notWorkingAsset: newNotWorking,
    });
  };

  const saveEdit = async (mappingId: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/my-assets/${mappingId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          workingAsset: editValues.workingAsset,
          remarks: editValues.remark,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showMessage('success', 'Asset counts updated successfully');
        fetchMyAssets();
        setEditingId(null);
        // Refresh audit logs if this asset is selected
        if (selectedAssetId === mappingId) {
          fetchAuditLogs(mappingId);
        }
      } else {
        showMessage('error', data.message || 'Failed to update asset counts');
      }
    } catch (error) {
      console.error('Error updating asset:', error);
      showMessage('error', 'Failed to update asset counts');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAudit = (mappingId: string) => {
    setAssetToSubmit(mappingId);
    setShowSubmitConfirm(true);
  };

  const confirmSubmitAudit = async () => {
    if (!assetToSubmit) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/my-assets/${assetToSubmit}/submit-audit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        showMessage('success', 'Audit submitted successfully. You can edit again on next audit date.');
        fetchMyAssets();
        setShowSubmitConfirm(false);
        setAssetToSubmit(null);
      } else {
        showMessage('error', data.message || 'Failed to submit audit');
      }
    } catch (error) {
      console.error('Error submitting audit:', error);
      showMessage('error', 'Failed to submit audit');
    } finally {
      setLoading(false);
    }
  };

  const cancelSubmitAudit = () => {
    setShowSubmitConfirm(false);
    setAssetToSubmit(null);
  };

  const toggleAuditLogs = (mappingId: string) => {
    if (selectedAssetId === mappingId) {
      setSelectedAssetId(null);
      setAuditLogs([]);
    } else {
      setSelectedAssetId(mappingId);
      fetchAuditLogs(mappingId);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), type === 'error' ? 8000 : 5000);
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAuditCountdown = (nextAuditDate?: Date) => {
    if (!nextAuditDate) {
      return {
        text: 'Not scheduled',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        daysRemaining: null,
      };
    }

    const auditDate = new Date(nextAuditDate);
    const now = currentTime;
    const diffMs = auditDate.getTime() - now.getTime();

    if (diffMs <= 0) {
      return {
        text: 'Overdue',
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        daysRemaining: 0,
      };
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let text = 'Next audit in ';
    if (days > 0) text += `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0 && days < 7) text += ` ${hours} hour${hours > 1 ? 's' : ''}`;
    if (days === 0 && minutes > 0) text += ` ${minutes} minute${minutes > 1 ? 's' : ''}`;

    let color = 'text-green-700';
    let bgColor = 'bg-green-100';

    if (days < 3) {
      color = 'text-red-700';
      bgColor = 'bg-red-100';
    } else if (days < 7) {
      color = 'text-yellow-700';
      bgColor = 'bg-yellow-100';
    }

    return { text, color, bgColor, daysRemaining: days };
  };

  if (!canView) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-600">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast Notification */}
      {message && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            minWidth: '400px',
            maxWidth: '90vw',
          }}
        >
          <div
            className={`rounded-xl shadow-2xl p-5 border-2 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-900 border-green-500'
                : 'bg-red-50 text-red-900 border-red-500'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {message.type === 'success' ? (
                  <MdCheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white text-xl font-bold">
                    !
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-1">
                  {message.type === 'success' ? 'Success' : 'Error'}
                </p>
                <p className="text-sm leading-relaxed">{message.text}</p>
              </div>
              <button
                onClick={() => setMessage(null)}
                className={`flex-shrink-0 rounded-lg p-1 hover:bg-white/50 transition-colors ${
                  message.type === 'success' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-full">
        <ModuleHeader
          title="My Assets"
          subtitle="View and manage assets assigned to your center"
        />

        {loading && assets.length === 0 ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-600">Loading assets...</div>
          </div>
        ) : assets.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="text-gray-600">No assets assigned to your center yet.</p>
          </div>
        ) : (
          <>
            {/* Assets Table */}
            <div className="overflow-hidden rounded-lg bg-white shadow mb-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Asset Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Center
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        Total Assigned
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        Working
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        Not Working
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 min-w-[200px]">
                        Remark
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Last Audit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Next Audit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Updated By
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {assets.map((asset) => {
                      const isEditing = editingId === asset._id;
                      const categoryName = asset.assetId.category
                        ? typeof asset.assetId.category === 'object'
                          ? (asset.assetId.category as any).name
                          : asset.assetId.category
                        : '';

                      return (
                        <React.Fragment key={asset._id}>
                          <tr className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex items-center gap-2">
                                {asset.assetId.icon && <span className="text-xl">{asset.assetId.icon}</span>}
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{asset.assetId.name}</div>
                                  {categoryName && (
                                    <div className="text-xs text-gray-500">{categoryName}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                              {asset.centerName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-center">
                              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
                                {asset.totalAssigned} {asset.assetId.unit || 'units'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={asset.totalAssigned}
                                  value={editValues.workingAsset}
                                  onChange={(e) =>
                                    handleWorkingChange(parseInt(e.target.value) || 0, asset.totalAssigned)
                                  }
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-center text-sm"
                                />
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                                  {asset.workingAsset}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center">
                                  <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
                                    {editValues.notWorkingAsset}
                                  </span>
                                  <span className="ml-2 text-xs text-gray-500">(auto-calculated)</span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-800">
                                  {asset.notWorkingAsset}
                                </span>
                              )}
                            </td>
                            {/* Remark Column */}
                            <td className="px-4 py-3 text-sm text-gray-700 min-w-[200px] max-w-[300px]">
                              {isEditing ? (
                                <textarea
                                  value={editValues.remark}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({ ...prev, remark: e.target.value }))
                                  }
                                  placeholder="Add remark..."
                                  rows={2}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm resize-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                                />
                              ) : asset.remark ? (
                                <div className="relative group">
                                  {asset.remark.length > 50 ? (
                                    <>
                                      {expandedRemarkId === asset._id ? (
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
                                        <div className="flex items-start gap-1">
                                          <span className="line-clamp-2 break-words">
                                            {asset.remark.substring(0, 50)}...
                                          </span>
                                          <button
                                            onClick={() => setExpandedRemarkId(asset._id)}
                                            className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                                          >
                                            More
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="break-words">{asset.remark}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">-</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                              {formatDate(asset.lastAuditDate)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              {asset.canEdit ? (
                                <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-green-700 bg-green-100 animate-pulse">
                                  🔴 Audit is Live
                                </span>
                              ) : (
                                (() => {
                                  const countdown = getAuditCountdown(asset.nextAuditDate);
                                  return (
                                    <span
                                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${countdown.color} ${countdown.bgColor}`}
                                    >
                                      {countdown.text}
                                    </span>
                                  );
                                })()
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                              {(asset.lastAuditSubmittedBy || asset.lastUpdatedBy)
                                ? `${(asset.lastAuditSubmittedBy || asset.lastUpdatedBy)!.firstName} ${(asset.lastAuditSubmittedBy || asset.lastUpdatedBy)!.lastName}`
                                : '-'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => saveEdit(asset._id)}
                                      disabled={loading}
                                      className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                    >
                                      <MdSave className="h-4 w-4" />
                                      Save
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="inline-flex items-center gap-1 rounded bg-gray-600 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                                    >
                                      <MdClose className="h-4 w-4" />
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {asset.canEdit && (
                                      <>
                                        <button
                                          onClick={() => startEdit(asset)}
                                          className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                        >
                                          <MdEdit className="h-4 w-4" />
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleSubmitAudit(asset._id)}
                                          disabled={loading}
                                          className="inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                                        >
                                          <MdCheckCircle className="h-4 w-4" />
                                          Submit Audit
                                        </button>
                                      </>
                                    )}
                                    {!asset.canEdit && asset.auditSubmitted && (
                                      <span className="text-xs text-gray-500 italic">
                                        Audit submitted. Next edit on {formatDate(asset.nextAuditDate)}
                                      </span>
                                    )}
                                    {!asset.canEdit && !asset.auditSubmitted && asset.nextAuditDate && (
                                      <span className="text-xs text-gray-500 italic">
                                        Edit available on {formatDate(asset.nextAuditDate)}
                                      </span>
                                    )}
                                    <button
                                      onClick={() => toggleAuditLogs(asset._id)}
                                      className={`inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium text-white ${
                                        selectedAssetId === asset._id
                                          ? 'bg-purple-700 hover:bg-purple-800'
                                          : 'bg-purple-600 hover:bg-purple-700'
                                      }`}
                                    >
                                      <MdHistory className="h-4 w-4" />
                                      History
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Audit Logs Row */}
                          {selectedAssetId === asset._id && (
                            <tr>
                              <td colSpan={8} className="bg-gray-50 px-4 py-3">
                                <div className="rounded-lg bg-white p-4 shadow-inner">
                                  <h4 className="mb-3 text-sm font-semibold text-gray-900">
                                    Audit History for {asset.assetId.name}
                                  </h4>
                                  {auditLogs.length === 0 ? (
                                    <p className="text-sm text-gray-500">No audit history available.</p>
                                  ) : (
                                    <div className="space-y-3">
                                      {auditLogs.map((log) => (
                                        <div
                                          key={log._id}
                                          className="rounded border border-gray-200 bg-gray-50 p-3"
                                        >
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                              <div className="text-sm font-medium text-gray-900">
                                                {log.userId.firstName} {log.userId.lastName}
                                                <span className="ml-2 text-xs text-gray-500">
                                                  ({log.userId.email})
                                                </span>
                                              </div>
                                              <div className="mt-1 text-sm text-gray-600">
                                                <span className="font-medium">Previous:</span> Working:{' '}
                                                {log.previousValues.workingAsset}, Not Working:{' '}
                                                {log.previousValues.notWorkingAsset}
                                                <span className="mx-2">→</span>
                                                <span className="font-medium">New:</span> Working:{' '}
                                                {log.newValues.workingAsset}, Not Working:{' '}
                                                {log.newValues.notWorkingAsset}
                                              </div>
                                              {log.remarks && (
                                                <div className="mt-1 text-xs text-gray-500">
                                                  <span className="font-medium">Remarks:</span> {log.remarks}
                                                </div>
                                              )}
                                            </div>
                                            <div className="ml-4 flex-shrink-0 text-xs text-gray-500">
                                              {formatDate(log.changedAt)}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                  )}
                </div>
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    })}
  </tbody>
</table>
</div>
</div>

{/* Submit Audit Confirmation Modal */}
{showSubmitConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
    <div className="max-w-md rounded-lg bg-white p-6 shadow-xl">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Confirm Audit Submission
      </h3>
      <p className="mb-6 text-sm text-gray-600">
        Are you sure you want to submit? Post that you can't make any changes until the next audit date.
      </p>
      <div className="flex justify-end gap-3">
        <button
          onClick={cancelSubmitAudit}
          className="rounded bg-gray-500 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
        >
          No, Continue Editing
        </button>
        <button
          onClick={confirmSubmitAudit}
          disabled={loading}
          className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          Yes, Submit Audit
        </button>
      </div>
    </div>
  </div>
)}
</>
)}
</div>
</>
);
};

export default MyAssetsView;
