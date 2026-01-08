import React, { useState, useEffect } from 'react';
import { MdSave, MdRefresh, MdWarning, MdCheckCircle } from 'react-icons/md';
import { API_CONFIG } from '../config/constants';
import DashboardLayout from './DashboardLayout';

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

const MyAssets: React.FC = () => {
  const [assets, setAssets] = useState<AssetUsage[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({
    totalAssigned: 0,
    assetUsed: 0,
    assetNotUsed: 0,
    workingAsset: 0,
    notWorkingAsset: 0,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Check if user is Super Admin
    const userStr = localStorage.getItem('user');
    let isSuperAdminUser = false;
    
    console.log('=== MyAssets Debug ===');
    console.log('userStr:', userStr);
    
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        console.log('Parsed user:', user);
        const roleCode = user.role?.code || user.roleCode;
        console.log('Role code:', roleCode);
        isSuperAdminUser = roleCode === 'SUPER_ADMIN';
        console.log('Is Super Admin:', isSuperAdminUser);
      } catch (error) {
        console.error('Failed to parse user data:', error);
      }
    }
    
    setIsSuperAdmin(isSuperAdminUser);

    // For non-Super Admin, auto-select project from projectContext
    if (!isSuperAdminUser) {
      const projectContext = localStorage.getItem('projectContext');
      console.log('Project context:', projectContext);
      if (projectContext) {
        try {
          const context = JSON.parse(projectContext);
          console.log('Parsed context:', context);
          if (context.projectId) {
            console.log('Auto-selecting project:', context.projectId);
            setSelectedProject(context.projectId);
          }
        } catch (error) {
          console.error('Failed to parse projectContext:', error);
        }
      }
    }

    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchMyAssets();
    }
  }, [selectedProject]);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/projects`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      
      let projectsData = [];
      if (data.success && data.data && Array.isArray(data.data.projects)) {
        projectsData = data.data.projects;
      } else if (data.success && Array.isArray(data.data)) {
        projectsData = data.data;
      } else if (Array.isArray(data.projects)) {
        projectsData = data.projects;
      }
      
      const activeProjects = projectsData.filter((p: any) => p.isActive !== false);
      setProjects(activeProjects);
      if (activeProjects.length > 0 && !selectedProject) {
        setSelectedProject(activeProjects[0]._id);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const fetchMyAssets = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/center-assets?projectId=${selectedProject}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      
      // Add next audit date (3 months from last update)
      const assetsWithAudit = (data.data || []).map((asset: any) => {
        const lastUpdate = new Date(asset.updatedAt);
        const nextAudit = new Date(lastUpdate);
        nextAudit.setMonth(nextAudit.getMonth() + 3);
        
        return {
          ...asset,
          nextAuditDate: nextAudit.toISOString(),
        };
      });
      
      setAssets(assetsWithAudit);
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
      totalAssigned: asset.totalAssigned,
      assetUsed: asset.assetUsed,
      assetNotUsed: asset.assetNotUsed,
      workingAsset: asset.workingAsset,
      notWorkingAsset: asset.notWorkingAsset,
    });
  };

  const handleSave = async (assetId: string) => {
    // Validation
    if (editData.assetUsed + editData.assetNotUsed !== editData.totalAssigned) {
      showMessage('error', 'Used + Not Used must equal Total Assigned');
      return;
    }
    if (editData.workingAsset + editData.notWorkingAsset !== editData.assetUsed) {
      showMessage('error', 'Working + Not Working must equal Used');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/center-assets/${assetId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(editData),
      });

      const data = await response.json();
      
      if (data.success) {
        showMessage('success', 'Asset updated successfully');
        setEditingId(null);
        fetchMyAssets(); // Refresh data
      } else {
        showMessage('error', data.message || 'Failed to update asset');
      }
    } catch (error) {
      console.error('Failed to update asset:', error);
      showMessage('error', 'Failed to update asset');
    } finally {
      setLoading(false);
    }
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

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Assets</h1>
          <p className="mt-2 text-sm text-gray-600">
            Update and manage your assigned assets. Next audit is scheduled 3 months from last update.
          </p>
        </div>

        {/* Project Selector - Only for Super Admin */}
        {isSuperAdmin && (
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
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedProject && (
          <>
            {/* Action Buttons */}
            <div className="mb-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing assets for selected project
              </div>
              <button
                onClick={fetchMyAssets}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <MdRefresh className="h-5 w-5" />
                Refresh
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
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Asset</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Total Assigned</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Working</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Not Working</th>
                      <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Next Audit</th>
                      <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {loading && !assets.length ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                          Loading assets...
                        </td>
                      </tr>
                    ) : assets.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                          No assets assigned yet.
                        </td>
                      </tr>
                    ) : (
                      assets.map((asset) => {
                        const isEditing = editingId === asset._id;
                        const daysUntilAudit = getDaysUntilAudit(asset.nextAuditDate);
                        const auditStatus = getAuditStatus(daysUntilAudit);

                        return (
                          <tr key={asset._id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">{asset.centerId.centerName}</div>
                              <div className="text-sm text-gray-500">{asset.centerId.city}</div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">{asset.assetId.name}</div>
                              <div className="text-sm text-gray-500">{asset.assetId.category || '-'}</div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editData.totalAssigned}
                                  onChange={(e) => setEditData({ ...editData, totalAssigned: parseInt(e.target.value) || 0 })}
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm"
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
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm"
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
                                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                                />
                              ) : (
                                <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                                  {asset.notWorkingAsset}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <div className="flex flex-col items-center">
                                {auditStatus === 'urgent' ? (
                                  <>
                                    <MdWarning className="h-5 w-5 text-red-600" />
                                    <span className="mt-1 text-xs font-semibold text-red-600">
                                      Overdue by {Math.abs(daysUntilAudit)} days
                                    </span>
                                  </>
                                ) : auditStatus === 'warning' ? (
                                  <>
                                    <MdWarning className="h-5 w-5 text-yellow-600" />
                                    <span className="mt-1 text-xs font-semibold text-yellow-600">
                                      {daysUntilAudit} days left
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <MdCheckCircle className="h-5 w-5 text-green-600" />
                                    <span className="mt-1 text-xs text-gray-600">
                                      {daysUntilAudit} days
                                    </span>
                                  </>
                                )}
                                <span className="mt-1 text-xs text-gray-500">
                                  {new Date(asset.nextAuditDate).toLocaleDateString()}
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-center">
                              {isEditing ? (
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => handleSave(asset._id)}
                                    disabled={loading}
                                    className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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

            {/* Legend */}
            <div className="mt-4 rounded-lg bg-white p-4 shadow">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Audit Status Legend:</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <MdCheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-gray-600">On Track (30+ days remaining)</span>
                </div>
                <div className="flex items-center gap-2">
                  <MdWarning className="h-5 w-5 text-yellow-600" />
                  <span className="text-gray-600">Warning (1-30 days remaining)</span>
                </div>
                <div className="flex items-center gap-2">
                  <MdWarning className="h-5 w-5 text-red-600" />
                  <span className="text-gray-600">Urgent (Overdue)</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MyAssets;
