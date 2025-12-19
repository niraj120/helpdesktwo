import React, { useState } from 'react';
import { MdSave, MdRefresh, MdWarning, MdCheckCircle } from 'react-icons/md';

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
    centerId: { _id: 'c1', centerName: 'MHCET - Goregaon', city: 'Mumbai' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 5,
    assetUsed: 4,
    assetNotUsed: 1,
    workingAsset: 3,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u1', name: 'Sameer Hapani' },
    updatedAt: '2024-10-15T10:30:00Z',
    nextAuditDate: '2025-01-15T10:30:00Z',
  },
  {
    _id: '2',
    assetId: { _id: 'a2', name: 'Projector', category: 'Electronics', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'MHCET - Goregaon', city: 'Mumbai' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 3,
    assetUsed: 3,
    assetNotUsed: 0,
    workingAsset: 2,
    notWorkingAsset: 1,
    lastUpdatedBy: { _id: 'u1', name: 'Sameer Hapani' },
    updatedAt: '2024-09-10T14:20:00Z',
    nextAuditDate: '2024-12-10T14:20:00Z',
  },
  {
    _id: '3',
    assetId: { _id: 'a3', name: 'Chairs', category: 'Furniture', unit: 'units' },
    centerId: { _id: 'c1', centerName: 'MHCET - Goregaon', city: 'Mumbai' },
    projectId: { _id: '1', name: 'MH CET Extension Centres' },
    totalAssigned: 50,
    assetUsed: 45,
    assetNotUsed: 5,
    workingAsset: 42,
    notWorkingAsset: 3,
    lastUpdatedBy: { _id: 'u1', name: 'Sameer Hapani' },
    updatedAt: '2024-11-01T09:00:00Z',
    nextAuditDate: '2025-02-01T09:00:00Z',
  },
];

const MyAssetsStatic: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<string>('1');
  const [assets, setAssets] = useState<AssetUsage[]>(DEMO_ASSETS);
  const [editingId, setEditingId] = useState<string | null>(null);
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

    showMessage('success', 'Asset updated successfully (Demo Mode)');
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

  const filteredAssets = assets.filter(asset => asset.projectId._id === selectedProject);

  return (
      <div className="p-6">
        {/* Demo Banner */}
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-blue-800">Static Demo Mode</h3>
              <p className="mt-1 text-sm text-blue-700">
                This is a static demo with sample data. Changes are saved locally and will reset on page refresh.
                <br />
                <strong>Purpose:</strong> Update asset counts, track working/non-working items, and monitor audit schedules.
              </p>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Assets</h1>
          <p className="mt-2 text-sm text-gray-600">
            Update and manage your assigned assets. Next audit is scheduled 3 months from last update.
          </p>
        </div>

        {/* Project Selector */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Select Project <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:w-1/2"
          >
            <option value="">Choose a project...</option>
            {DEMO_PROJECTS.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {selectedProject && (
          <>
            {/* Action Buttons */}
            <div className="mb-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {filteredAssets.length} assets for selected project (Demo Data)
              </div>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <MdRefresh className="h-5 w-5" />
                Reset Demo
              </button>
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
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Used</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Not Used</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Working</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Not Working</th>
                      <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Last Updated</th>
                      <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Audit Status</th>
                      <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredAssets.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-6 py-4 text-center text-sm text-gray-500">
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
                                  onChange={(e) => setEditData({ ...editData, totalAssigned: parseInt(e.target.value) || 0 })}
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                                  value={editData.assetUsed}
                                  onChange={(e) => setEditData({ ...editData, assetUsed: parseInt(e.target.value) || 0 })}
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="text-sm text-gray-900">{asset.assetUsed}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editData.assetNotUsed}
                                  onChange={(e) => setEditData({ ...editData, assetNotUsed: parseInt(e.target.value) || 0 })}
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="text-sm text-gray-900">{asset.assetNotUsed}</span>
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
                            <td className="whitespace-nowrap px-6 py-4">
                              <div className="flex flex-col items-center">
                                {auditStatus === 'urgent' ? (
                                  <>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                                      <MdWarning className="h-4 w-4" />
                                      Overdue
                                    </span>
                                    <span className="mt-1 text-xs text-red-600">
                                      {Math.abs(daysUntilAudit)} days ago
                                    </span>
                                  </>
                                ) : auditStatus === 'warning' ? (
                                  <>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                                      <MdWarning className="h-4 w-4" />
                                      Due Soon
                                    </span>
                                    <span className="mt-1 text-xs text-yellow-600">
                                      {daysUntilAudit} days left
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                                      <MdCheckCircle className="h-4 w-4" />
                                      On Track
                                    </span>
                                    <span className="mt-1 text-xs text-gray-600">
                                      {daysUntilAudit} days
                                    </span>
                                  </>
                                )}
                                <span className="mt-1 text-xs text-gray-500">
                                  Next: {new Date(asset.nextAuditDate).toLocaleDateString()}
                                </span>
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
                                <button
                                  onClick={() => handleEdit(asset)}
                                  className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                                >
                                  Update
                                </button>
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

            {/* Audit Timeline Summary */}
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-3">
                  <MdCheckCircle className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold text-green-900">
                      {filteredAssets.filter(a => getAuditStatus(getDaysUntilAudit(a.nextAuditDate)) === 'ok').length}
                    </div>
                    <div className="text-sm text-green-700">On Track (30+ days)</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
                <div className="flex items-center gap-3">
                  <MdWarning className="h-8 w-8 text-yellow-600" />
                  <div>
                    <div className="text-2xl font-bold text-yellow-900">
                      {filteredAssets.filter(a => getAuditStatus(getDaysUntilAudit(a.nextAuditDate)) === 'warning').length}
                    </div>
                    <div className="text-sm text-yellow-700">Due Soon (1-30 days)</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <div className="flex items-center gap-3">
                  <MdWarning className="h-8 w-8 text-red-600" />
                  <div>
                    <div className="text-2xl font-bold text-red-900">
                      {filteredAssets.filter(a => getAuditStatus(getDaysUntilAudit(a.nextAuditDate)) === 'urgent').length}
                    </div>
                    <div className="text-sm text-red-700">Overdue</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Timeline Info */}
            <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <MdCheckCircle className="h-5 w-5" />
                Audit Schedule & Timeline
              </h3>
              <div className="space-y-2 text-sm text-blue-800">
                <p>• <strong>Audit Frequency:</strong> Every 3 months from last update</p>
                <p>• <strong>Next Audit Deadline:</strong> Automatically calculated when you save changes</p>
                <p>• <strong>Status Indicators:</strong></p>
                <div className="ml-6 space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-green-800 font-medium">On Track</span>
                    <span>30+ days until audit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-800 font-medium">Due Soon</span>
                    <span>1-30 days until audit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-red-800 font-medium">Overdue</span>
                    <span>Audit deadline passed</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <h3 className="text-sm font-semibold text-yellow-800 mb-2">How to Use:</h3>
              <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                <li>Click <strong>"Update"</strong> on any row to edit asset counts</li>
                <li>Enter values ensuring: <strong>Used + Not Used = Total Assigned</strong></li>
                <li>Enter values ensuring: <strong>Working + Not Working = Used</strong></li>
                <li>Click <strong>"Save"</strong> to apply changes or <strong>"Cancel"</strong> to discard</li>
                <li>Audit date automatically updates to 3 months from save date</li>
                <li>Monitor audit status: 🟢 On Track, 🟡 Warning (30 days), 🔴 Overdue</li>
              </ul>
            </div>
          </>
        )}
      </div>
  );
};

export default MyAssetsStatic;
