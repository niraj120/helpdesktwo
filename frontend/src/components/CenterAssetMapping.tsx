import React, { useState, useEffect } from 'react';
import { MdAdd, MdEdit, MdDelete, MdPhotoCamera, MdRefresh, MdSave, MdClose } from 'react-icons/md';
import { API_CONFIG } from '../config/constants';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';
import DashboardLayout from './DashboardLayout';

interface Asset {
  _id: string;
  name: string;
  category?: string;
  predefinedCount: number;
  unit?: string;
}

interface Project {
  _id: string;
  projectName: string;
  name: string;
  isActive: boolean;
  configuration?: {
    ticketSubmissionSettings?: {
      offlineCenters?: Array<{
        _id?: string;
        centerName: string;
        address: string;
        city: string;
        state: string;
        pincode?: string;
        phone?: string;
        email?: string;
      }>;
    };
  };
}

interface Center {
  _id: string;
  centerName: string;
  projectId: string;
  projectName: string;
  address: string;
  city: string;
  state: string;
}

interface CenterAssetMapping {
  _id: string;
  projectId: {
    _id: string;
    projectName: string;
  };
  assetId: {
    _id: string;
    name: string;
    category?: string;
    unit?: string;
  };
  totalAssigned: number;
  assetUsed: number;
  assetNotUsed: number;
  workingAsset: number;
  notWorkingAsset: number;
  photos: Array<{
    filename: string;
    path: string;
    mimetype: string;
    size: number;
    uploadedAt: string;
  }>;
  lastUpdatedBy: {
    _id: string;
    name: string;
  };
  updatedAt: string;
}

interface MappingStats {
  totalMappings: number;
  totalAssigned: number;
  totalUsed: number;
  totalNotUsed: number;
  totalWorking: number;
  totalNotWorking: number;
}

const CenterAssetMapping: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [mappings, setMappings] = useState<CenterAssetMapping[]>([]);
  const [stats, setStats] = useState<MappingStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Bulk mapping dialog
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [selectedCenters, setSelectedCenters] = useState<string[]>([]);
  const [applyToAllCenters, setApplyToAllCenters] = useState(false);

  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingMapping, setEditingMapping] = useState<CenterAssetMapping | null>(null);
  const [editFormData, setEditFormData] = useState({
    totalAssigned: 0,
    assetUsed: 0,
    assetNotUsed: 0,
    workingAsset: 0,
  });

  // Photo dialog
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [photoMapping, setPhotoMapping] = useState<CenterAssetMapping | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canManage = hasPermission(PERMISSIONS.ASSET_MANAGE);
  const canMapToCenter = hasPermission(PERMISSIONS.ASSET_MAP_TO_CENTER);
  const canUploadPhotos = hasPermission(PERMISSIONS.ASSET_UPLOAD_PHOTOS);
  const canViewStats = hasPermission(PERMISSIONS.ASSET_VIEW_STATS);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchAssets();
      fetchCenters();
      fetchMappings();
      if (canViewStats) {
        fetchStats();
      }
    }
  }, [selectedProject]);

  const fetchAssets = async () => {
    if (!selectedProject) return;
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/assets?projectId=${selectedProject}&isActive=true`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      setAssets(data.data || []);
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    }
  };

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

  const fetchCenters = async () => {
    if (!selectedProject) return;
    
    try {
      const token = localStorage.getItem('authToken');
      const centersResponse = await fetch(`${API_CONFIG.API_URL}/centers?projectId=${selectedProject}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const centersData = await centersResponse.json();
      
      if (centersData.success && Array.isArray(centersData.data)) {
        const mappedCenters = centersData.data.map((center: any) => ({
          _id: center._id,
          centerName: center.centerName,
          projectId: center.projectId._id || center.projectId,
          projectName: center.projectId.name || center.projectId.projectName || 'Unknown Project',
          address: center.address,
          city: center.city,
          state: center.state,
        }));
        setCenters(mappedCenters);
      }
    } catch (error) {
      console.error('Failed to fetch centers:', error);
    }
  };

  const fetchMappings = async () => {
    if (!selectedProject) return;
    
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/center-assets?projectId=${selectedProject}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      setMappings(data.data || []);
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to fetch mappings');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!selectedProject) return;
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/center-assets/stats/summary?projectId=${selectedProject}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json();
      setStats(data.data || null);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleBulkMap = async () => {
    if (selectedAssets.length === 0) {
      showMessage('error', 'Please select at least one asset');
      return;
    }
    if (!applyToAllCenters && selectedCenters.length === 0) {
      showMessage('error', 'Please select at least one center or check "Apply to All Centers"');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/center-assets/bulk-map`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          assetIds: selectedAssets,
          centerIds: applyToAllCenters ? [] : selectedCenters,
          applyToAllCenters,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to map assets');
      }

      showMessage('success', 'Assets mapped successfully');
      setShowBulkDialog(false);
      setSelectedAssets([]);
      setSelectedCenters([]);
      setApplyToAllCenters(false);
      fetchMappings();
      if (canViewStats) fetchStats();
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to map assets');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (mapping: CenterAssetMapping) => {
    setEditingMapping(mapping);
    setEditFormData({
      totalAssigned: mapping.totalAssigned,
      assetUsed: mapping.assetUsed,
      assetNotUsed: mapping.assetNotUsed,
      workingAsset: mapping.workingAsset,
    });
    setShowEditDialog(true);
  };

  const handleUpdateMapping = async () => {
    if (!editingMapping) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/center-assets/${editingMapping._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(editFormData),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update mapping');
      }

      showMessage('success', 'Mapping updated successfully');
      setShowEditDialog(false);
      fetchMappings();
      if (canViewStats) fetchStats();
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to update mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/center-assets/${mappingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete mapping');
      }

      showMessage('success', 'Mapping deleted successfully');
      fetchMappings();
      if (canViewStats) fetchStats();
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to delete mapping');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPhotoDialog = (mapping: CenterAssetMapping) => {
    setPhotoMapping(mapping);
    setSelectedFiles(null);
    setShowPhotoDialog(true);
  };

  const handleUploadPhotos = async () => {
    if (!photoMapping || !selectedFiles || selectedFiles.length === 0) {
      showMessage('error', 'Please select photos to upload');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      for (let i = 0; i < selectedFiles.length; i++) {
        formData.append('photos', selectedFiles[i]);
      }

      const response = await fetch(`${API_CONFIG.API_URL}/center-assets/${photoMapping._id}/photos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to upload photos');
      }

      showMessage('success', 'Photos uploaded successfully');
      setShowPhotoDialog(false);
      fetchMappings();
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to upload photos');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePhoto = async (mappingId: string, photoIndex: number) => {
    if (!confirm('Are you sure you want to delete this photo?')) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/center-assets/${mappingId}/photos/${photoIndex}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete photo');
      }

      showMessage('success', 'Photo deleted successfully');
      fetchMappings();
      
      // Update photoMapping if dialog is open
      if (photoMapping && photoMapping._id === mappingId) {
        const updatedMapping = mappings.find(m => m._id === mappingId);
        if (updatedMapping) {
          setPhotoMapping(updatedMapping);
        }
      }
    } catch (error: any) {
      showMessage('error', error.message || 'Failed to delete photo');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const calculateNotWorking = (used: number, working: number) => {
    return Math.max(0, used - working);
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssets(prev => 
      prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId]
    );
  };

  const toggleCenterSelection = (centerId: string) => {
    setSelectedCenters(prev => 
      prev.includes(centerId) ? prev.filter(id => id !== centerId) : [...prev, centerId]
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Center Asset Management</h1>
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
            {projects.map((project) => (
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
                Showing assets and centers for selected project
              </div>
              <div className="flex gap-3">
            <button
              onClick={fetchMappings}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <MdRefresh className="h-5 w-5" />
              Refresh
            </button>
            {canMapToCenter && (
              <button
                onClick={() => setShowBulkDialog(true)}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <MdAdd className="h-5 w-5" />
                Map Assets
              </button>
            )}
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <div className={`mb-4 rounded-lg p-4 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Statistics Cards */}
        {canViewStats && stats && (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm font-medium text-gray-500">Total Mappings</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.totalMappings}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm font-medium text-gray-500">Total Assigned</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.totalAssigned}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm font-medium text-gray-500">Used</p>
              <p className="mt-1 text-2xl font-semibold text-blue-600">{stats.totalUsed}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm font-medium text-gray-500">Not Used</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.totalNotUsed}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm font-medium text-gray-500">Working</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">{stats.totalWorking}</p>
            </div>
            <div className="rounded-lg bg-white p-4 shadow">
              <p className="text-sm font-medium text-gray-500">Not Working</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{stats.totalNotWorking}</p>
            </div>
          </div>
        )}

        {/* Mappings Table */}
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
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Photos</th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading && !mappings.length ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-4 text-center text-sm text-gray-500">
                      Loading mappings...
                    </td>
                  </tr>
                ) : mappings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-4 text-center text-sm text-gray-500">
                      No asset mappings found. {canMapToCenter && 'Click "Map Assets" to get started.'}
                    </td>
                  </tr>
                ) : (
                  mappings.map((mapping) => (
                    <tr key={mapping._id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {mapping.projectId.projectName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{mapping.assetId.name}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{mapping.assetId.category || '-'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">{mapping.totalAssigned}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">{mapping.assetUsed}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">{mapping.assetNotUsed}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                          {mapping.workingAsset}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                          {mapping.notWorkingAsset}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <button
                          onClick={() => canUploadPhotos && handleOpenPhotoDialog(mapping)}
                          disabled={!canUploadPhotos}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200 disabled:opacity-50"
                        >
                          <MdPhotoCamera className="h-4 w-4" />
                          {mapping.photos?.length || 0}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          {canManage && (
                            <button
                              onClick={() => handleOpenEdit(mapping)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit"
                            >
                              <MdEdit className="h-5 w-5" />
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => handleDeleteMapping(mapping._id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                            >
                              <MdDelete className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bulk Mapping Dialog */}
        {showBulkDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-gray-900">Map Assets to Centers</h2>
              </div>
              
              <div className="max-h-[70vh] overflow-y-auto p-6">
                <div className="space-y-6">
                  {/* Asset Selection */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Select Assets <span className="text-red-500">*</span>
                    </label>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-300 p-2">
                      {assets.map((asset) => (
                        <label key={asset._id} className="flex cursor-pointer items-center gap-2 p-2 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedAssets.includes(asset._id)}
                            onChange={() => toggleAssetSelection(asset._id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-900">
                            {asset.name} ({asset.predefinedCount} {asset.unit})
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Apply to All Centers Checkbox */}
                  <div>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={applyToAllCenters}
                        onChange={(e) => {
                          setApplyToAllCenters(e.target.checked);
                          if (e.target.checked) {
                            setSelectedCenters([]);
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-900">Apply to All Centers</span>
                    </label>
                  </div>

                  {/* Center Selection */}
                  {!applyToAllCenters && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Select Centers <span className="text-red-500">*</span>
                      </label>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-300 p-2">
                        {centers.length === 0 ? (
                          <p className="p-2 text-sm text-gray-500">No centers found. Please add centers to your projects first.</p>
                        ) : (
                          centers.map((center) => (
                            <label key={center._id} className="flex cursor-pointer items-center gap-2 p-2 hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={selectedCenters.includes(center._id)}
                                onChange={() => toggleCenterSelection(center._id)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-900">{center.centerName}</span>
                                <span className="ml-2 text-xs text-gray-500">({center.projectName} - {center.city}, {center.state})</span>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Info Alert */}
                  <div className="rounded-lg bg-blue-50 p-4">
                    <p className="text-sm text-blue-800">
                      Selected assets will be mapped with their predefined count as the initial "Total Assigned" value.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 px-6 py-4">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowBulkDialog(false)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkMap}
                    disabled={loading}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Map Assets
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Mapping Dialog */}
        {showEditDialog && editingMapping && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-gray-900">Edit Asset Mapping</h2>
              </div>
              
              <div className="p-6">
                <div className="mb-4 space-y-2">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Center:</span> {editingMapping.projectId.projectName}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Asset:</span> {editingMapping.assetId.name}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Total Assigned</label>
                    <input
                      type="number"
                      value={editFormData.totalAssigned}
                      onChange={(e) => setEditFormData({ ...editFormData, totalAssigned: parseInt(e.target.value) || 0 })}
                      min="0"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Asset Used</label>
                    <input
                      type="number"
                      value={editFormData.assetUsed}
                      onChange={(e) => setEditFormData({ ...editFormData, assetUsed: parseInt(e.target.value) || 0 })}
                      min="0"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Asset Not Used</label>
                    <input
                      type="number"
                      value={editFormData.assetNotUsed}
                      onChange={(e) => setEditFormData({ ...editFormData, assetNotUsed: parseInt(e.target.value) || 0 })}
                      min="0"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Working Asset</label>
                    <input
                      type="number"
                      value={editFormData.workingAsset}
                      onChange={(e) => setEditFormData({ ...editFormData, workingAsset: parseInt(e.target.value) || 0 })}
                      min="0"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="rounded-lg bg-blue-50 p-4">
                    <p className="text-sm text-blue-800">
                      Not Working Asset will be auto-calculated: <span className="font-semibold">{calculateNotWorking(editFormData.assetUsed, editFormData.workingAsset)}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 px-6 py-4">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowEditDialog(false)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateMapping}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <MdSave className="h-5 w-5" />
                    Update
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Photo Upload Dialog */}
        {showPhotoDialog && photoMapping && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Manage Photos - {photoMapping.assetId.name} ({photoMapping.projectId.projectName})
                </h2>
              </div>
              
              <div className="max-h-[70vh] overflow-y-auto p-6">
                {/* Existing Photos */}
                {photoMapping.photos && photoMapping.photos.length > 0 && (
                  <div className="mb-6">
                    <h3 className="mb-3 text-sm font-medium text-gray-700">
                      Existing Photos ({photoMapping.photos.length}/10)
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      {photoMapping.photos.map((photo, index) => (
                        <div key={index} className="group relative">
                          <img
                            src={`${API_CONFIG.API_URL}/${photo.path}`}
                            alt={photo.filename}
                            className="h-40 w-full rounded-lg object-cover"
                          />
                          <button
                            onClick={() => handleDeletePhoto(photoMapping._id, index)}
                            className="absolute right-2 top-2 rounded-full bg-red-600 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            title="Delete photo"
                          >
                            <MdDelete className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload New Photos */}
                <div>
                  <h3 className="mb-3 text-sm font-medium text-gray-700">Upload New Photos (Max 10, 10MB each)</h3>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => setSelectedFiles(e.target.files)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {selectedFiles && selectedFiles.length > 0 && (
                    <p className="mt-2 text-sm text-gray-600">{selectedFiles.length} file(s) selected</p>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 px-6 py-4">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowPhotoDialog(false)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                  {selectedFiles && selectedFiles.length > 0 && (
                    <button
                      onClick={handleUploadPhotos}
                      disabled={loading}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <MdPhotoCamera className="h-5 w-5" />
                      Upload Photos
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CenterAssetMapping;
