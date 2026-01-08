import React, { useState } from 'react';
import { MdSave, MdRefresh, MdWarning, MdCheckCircle, MdHistory } from 'react-icons/md';

interface AuditHistoryEntry {
  _id: string;
  updatedBy: string;
  updatedAt: string;
  previousValues: {
    workingAsset: number;
    notWorkingAsset: number;
  };
  newValues: {
    workingAsset: number;
    notWorkingAsset: number;
  };
}

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
  nextAuditDate: string;
}

interface EditData {
  totalAssigned: number;
  assetUsed: number;
  assetNotUsed: number;
  workingAsset: number;
  notWorkingAsset: number;
}

// Static demo data - Only MHCET Goregaon center
const DEMO_PROJECTS = [
  { _id: '1', name: 'MH CET Extension Centres', isActive: true },
];

const DEMO_ASSETS: AssetUsage[] = [
  {
    _id: '1',
    assetId: { _id: 'a1', name: 'AC', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'CET उपकेंद्र - Amravati', city: 'Amravati' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 4,
    assetUsed: 4,
    assetNotUsed: 0,
    workingAsset: 3,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u1', name: 'Niraj Mishra' },
    updatedAt: '2024-10-15T10:30:00Z',
    nextAuditDate: '2025-01-15T10:30:00Z',
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
    nextAuditDate: '2024-12-10T14:20:00Z',
  },
  {
    _id: '3',
    assetId: { _id: 'a3', name: 'Chairs', category: 'Furniture', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'CET उपकेंद्र - Amravati', city: 'Amravati' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 45,
    assetUsed: 45,
    assetNotUsed: 0,
    workingAsset: 42,
    notWorkingAsset: 3,
    lastUpdatedBy: { _id: 'u1', name: 'Niraj Mishra' },
    updatedAt: '2024-11-01T09:00:00Z',
    nextAuditDate: '2025-02-01T09:00:00Z',
  },
];

// Static audit history data
const AUDIT_HISTORY: { [key: string]: AuditHistoryEntry[] } = {
  '1': [ // AC
    {
      _id: 'h1',
      updatedBy: 'Devesh Mishra',
      updatedAt: '2024-12-26T10:30:00Z',
      previousValues: { workingAsset: 2, notWorkingAsset: 2 },
      newValues: { workingAsset: 3, notWorkingAsset: 1 },
    },
    {
      _id: 'h2',
      updatedBy: 'Devesh Mishra',
      updatedAt: '2024-10-15T10:30:00Z',
      previousValues: { workingAsset: 1, notWorkingAsset: 3 },
      newValues: { workingAsset: 2, notWorkingAsset: 2 },
    },
  ],
  '2': [ // Projector
    {
      _id: 'h3',
      updatedBy: 'Devesh Mishra',
      updatedAt: '2024-09-10T14:20:00Z',
      previousValues: { workingAsset: 1, notWorkingAsset: 2 },
      newValues: { workingAsset: 2, notWorkingAsset: 1 },
    },
  ],
  '3': [ // Chairs
    {
      _id: 'h4',
      updatedBy: 'Devesh Mishra',
      updatedAt: '2024-11-01T09:00:00Z',
      previousValues: { workingAsset: 40, notWorkingAsset: 5 },
      newValues: { workingAsset: 42, notWorkingAsset: 3 },
    },
  ],
};

const MyAssetsStatic: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<string>('1');
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [assets, setAssets] = useState<AssetUsage[]>(DEMO_ASSETS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAuditHistory, setShowAuditHistory] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({
    totalAssigned: 0,
    assetUsed: 0,
    assetNotUsed: 0,
    workingAsset: 0,
    notWorkingAsset: 0,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleEdit = (asset: AssetUsage) => {
    setEditingId(asset._id);
    setEditData({
      totalAssigned: asset.totalAssigned,
      assetUsed: asset.assetUsed,
      assetNotUsed: asset.assetNotUsed,
      workingAsset: asset.workingAsset,
      notWorkingAsset: asset.notWorkingAsset,
    });
  };

  const handleSave = (assetId: string) => {
    // Validation
    if (editData.assetUsed + editData.assetNotUsed !== editData.totalAssigned) {
      showMessage('error', 'Used + Not Used must equal Total Assigned');
      return;
    }
    if (editData.workingAsset + editData.notWorkingAsset !== editData.assetUsed) {
      showMessage('error', 'Working + Not Working must equal Used');
      return;
    }

    // Update the asset in the local state
    setAssets(prevAssets =>
      prevAssets.map(asset =>
        asset._id === assetId
          ? {
              ...asset,
              ...editData,
              updatedAt: new Date().toISOString(),
              nextAuditDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 3 months from now
            }
          : asset
      )
    );

    showMessage('success', 'Asset updated successfully');
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({
      totalAssigned: 0,
      assetUsed: 0,
      assetNotUsed: 0,
      workingAsset: 0,
      notWorkingAsset: 0,
    });
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const getDaysUntilAudit = (nextAuditDate: string): number => {
    const today = new Date();
    const audit = new Date(nextAuditDate);
    const diffTime = audit.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getAuditStatus = (daysUntil: number): 'urgent' | 'warning' | 'ok' => {
    if (daysUntil < 0) return 'urgent';
    if (daysUntil <= 30) return 'warning';
    return 'ok';
  };

  const filteredAssets = assets.filter(asset => {
    const matchesProject = asset.projectId._id === selectedProject;
    const matchesAsset = assetFilter === 'all' || asset.assetId._id === assetFilter;
    return matchesProject && matchesAsset;
  });

  // Get unique assets for filter dropdown
  const uniqueAssets = Array.from(
    new Map(assets.map(asset => [asset.assetId._id, asset.assetId])).values()
  );

  return (
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Assets</h1>
          <p className="mt-2 text-sm text-gray-600">
            Update and manage your assigned assets. Next audit is scheduled 3 months from last update.
          </p>
        </div>

        {selectedProject && (
          <>
            {/* Action Buttons */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <label htmlFor="assetFilter" className="block text-sm font-medium text-gray-700 mb-1">
                    Asset Filter
                  </label>
                  <select
                    id="assetFilter"
                    value={assetFilter}
                    onChange={(e) => setAssetFilter(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All</option>
                    {uniqueAssets.map((asset) => (
                      <option key={asset._id} value={asset._id}>
                        {asset.name} ({asset.category})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Showing {filteredAssets.length} assets
              </div>
            </div>

            {/* Message Alert */}
            {message && (
              <div className={`mb-4 rounded-lg p-4 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {message.text}
              </div>
            )}

            {/* Assets Table */}
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Center</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Asset Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Total Assigned</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Working</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Not Working</th>
                      <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Last Updated</th>
                      <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredAssets.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                          No assets found for this project.
                        </td>
                      </tr>
                    ) : (
                      filteredAssets.map((asset) => {
                        const isEditing = editingId === asset._id;
                        const daysUntilAudit = getDaysUntilAudit(asset.nextAuditDate);
                        const auditStatus = getAuditStatus(daysUntilAudit);

                        return (
                          <tr key={asset._id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                              {asset.centerId.centerName}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                              {asset.assetId.name}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                              {asset.assetId.category || '-'}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editData.totalAssigned}
                                  readOnly
                                  disabled
                                  className="w-20 rounded border border-gray-300 bg-gray-100 px-2 py-1 text-right text-sm text-gray-500 cursor-not-allowed"
                                />
                              ) : (
                                <span className="text-sm text-gray-900">{asset.totalAssigned}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editData.workingAsset}
                                  onChange={(e) => setEditData({ ...editData, workingAsset: parseInt(e.target.value) || 0 })}
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                                  {asset.workingAsset}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editData.notWorkingAsset}
                                  onChange={(e) => setEditData({ ...editData, notWorkingAsset: parseInt(e.target.value) || 0 })}
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                                  {asset.notWorkingAsset}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-center">
                              <div className="text-sm text-gray-900">
                                {new Date(asset.updatedAt).toLocaleDateString()}
                              </div>
                              <div className="text-xs text-gray-500">
                                by {asset.lastUpdatedBy.name}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-center">
                              {isEditing ? (
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => handleSave(asset._id)}
                                    className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                  >
                                    <MdSave className="h-4 w-4" />
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancel}
                                    className="rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => handleEdit(asset)}
                                    className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                                  >
                                    Update
                                  </button>
                                  <button
                                    onClick={() => setShowAuditHistory(asset._id)}
                                    className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm font-medium"
                                    title="View Audit History"
                                  >
                                    <MdHistory className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Audit History Modal */}
        {showAuditHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">Audit History</h3>
                <button
                  onClick={() => setShowAuditHistory(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto max-h-[calc(80vh-120px)] px-6 py-4">
                {AUDIT_HISTORY[showAuditHistory] && AUDIT_HISTORY[showAuditHistory].length > 0 ? (
                  <div className="space-y-4">
                    {AUDIT_HISTORY[showAuditHistory]
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .map((entry, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="bg-blue-100 rounded-full p-2">
                                <MdHistory className="h-5 w-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{entry.updatedBy}</p>
                                <p className="text-sm text-gray-500">
                                  {new Date(entry.updatedAt).toLocaleString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div className="bg-white rounded p-3 border border-gray-200">
                              <p className="text-xs font-semibold text-gray-600 mb-2">Working Assets</p>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">
                                  {entry.previousValues.workingAsset}
                                </span>
                                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="text-sm font-semibold text-green-600">
                                  {entry.newValues.workingAsset}
                                </span>
                              </div>
                            </div>

                            <div className="bg-white rounded p-3 border border-gray-200">
                              <p className="text-xs font-semibold text-gray-600 mb-2">Not Working Assets</p>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">
                                  {entry.previousValues.notWorkingAsset}
                                </span>
                                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="text-sm font-semibold text-red-600">
                                  {entry.newValues.notWorkingAsset}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No audit history available for this asset.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  );
};

export default MyAssetsStatic;
