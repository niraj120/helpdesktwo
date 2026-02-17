import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import { API_CONFIG } from '../config/constants';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../constants/permissions';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  UserGroupIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

interface User {
  _id: string;
  email: string;
  fullName?: string;
  role?: {
    name: string;
  };
}

interface Project {
  _id: string;
  name: string;
}

interface HierarchyMapping {
  _id: string;
  supervisorUserId: {
    _id: string;
    email: string;
    fullName?: string;
  };
  reporteeUserId: {
    _id: string;
    email: string;
    fullName?: string;
  };
  projectId?: {
    _id: string;
    name: string;
  };
  relationshipType: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
}

/**
 * TeamManagement Page
 * 
 * Admin interface for managing user reporting hierarchies
 * Allows creating supervisor → reportee relationships
 * Requires HIERARCHY_MANAGE_TEAM permission
 */
const TeamManagement = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mappings, setMappings] = useState<HierarchyMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    supervisorUserId: '',
    reporteeUserId: '',
    projectId: '',
    relationshipType: 'direct_report',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Check permission
    if (!hasPermission(PERMISSIONS.HIERARCHY_MANAGE_TEAM)) {
      navigate('/dashboard');
      return;
    }

    fetchData();
  }, [hasPermission, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');

      const [usersRes, projectsRes, mappingsRes] = await Promise.all([
        fetch(`${API_CONFIG.API_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_CONFIG.API_URL}/projects`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_CONFIG.API_URL}/hierarchy/mappings`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users || usersData);
      }

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects || projectsData);
      }

      if (mappingsRes.ok) {
        const mappingsData = await mappingsRes.json();
        setMappings(mappingsData.mappings || mappingsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.supervisorUserId || !formData.reporteeUserId) {
      setError('Please select both supervisor and reportee');
      return;
    }

    if (formData.supervisorUserId === formData.reporteeUserId) {
      setError('Supervisor and reportee cannot be the same person');
      return;
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem('authToken');

      const payload: any = {
        supervisorUserId: formData.supervisorUserId,
        reporteeUserId: formData.reporteeUserId,
        relationshipType: formData.relationshipType,
      };

      if (formData.projectId) {
        payload.projectId = formData.projectId;
      }

      const response = await fetch(`${API_CONFIG.API_URL}/hierarchy/mapping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Hierarchy mapping created successfully!');
        setFormData({
          supervisorUserId: '',
          reporteeUserId: '',
          projectId: '',
          relationshipType: 'direct_report',
        });
        setShowForm(false);
        fetchData(); // Refresh mappings list
      } else {
        setError(data.message || 'Failed to create mapping. Please try again.');
      }
    } catch (error) {
      console.error('Error creating mapping:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (mappingId: string) => {
    if (!confirm('Are you sure you want to deactivate this mapping?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${API_CONFIG.API_URL}/hierarchy/mapping/${mappingId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        setSuccess('Mapping deactivated successfully');
        fetchData();
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to deactivate mapping');
      }
    } catch (error) {
      console.error('Error deactivating mapping:', error);
      setError('An error occurred while deactivating the mapping');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ padding: '20px' }}>
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading team management...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: '20px' }}>
        <div className="flex justify-between items-center mb-6">
          <ModuleHeader
            title="Team Management"
            subtitle="Manage user reporting hierarchies"
          />
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showForm ? (
              <>
                <XCircleIcon className="h-5 w-5" />
                Cancel
              </>
            ) : (
              <>
                <PlusIcon className="h-5 w-5" />
                Add Mapping
              </>
            )}
          </button>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        {/* Create Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <UserGroupIcon className="h-5 w-5 text-blue-600" />
              Create Hierarchy Mapping
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Supervisor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Supervisor (Manager)
                  </label>
                  <select
                    value={formData.supervisorUserId}
                    onChange={(e) =>
                      setFormData({ ...formData, supervisorUserId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select Supervisor</option>
                    {users.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.fullName || user.email} ({user.role?.name || 'No Role'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reportee */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reportee (Team Member)
                  </label>
                  <select
                    value={formData.reporteeUserId}
                    onChange={(e) =>
                      setFormData({ ...formData, reporteeUserId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select Reportee</option>
                    {users
                      .filter((u) => u._id !== formData.supervisorUserId)
                      .map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.fullName || user.email} ({user.role?.name || 'No Role'})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Project (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project (Optional)
                  </label>
                  <select
                    value={formData.projectId}
                    onChange={(e) =>
                      setFormData({ ...formData, projectId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Projects (Global)</option>
                    {projects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Relationship Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Relationship Type
                  </label>
                  <select
                    value={formData.relationshipType}
                    onChange={(e) =>
                      setFormData({ ...formData, relationshipType: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="direct_report">Direct Report</option>
                    <option value="matrix">Matrix</option>
                    <option value="dotted_line">Dotted Line</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-5 w-5" />
                    Create Mapping
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Mappings Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">
              Current Hierarchy Mappings ({mappings.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            {mappings.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <UserGroupIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No hierarchy mappings found</p>
                <p className="text-sm mt-1">Click "Add Mapping" to create one</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Supervisor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Reportee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mappings.map((mapping) => (
                    <tr key={mapping._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {mapping.supervisorUserId.fullName ||
                            mapping.supervisorUserId.email}
                        </div>
                        <div className="text-sm text-gray-500">
                          {mapping.supervisorUserId.email}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {mapping.reporteeUserId.fullName ||
                            mapping.reporteeUserId.email}
                        </div>
                        <div className="text-sm text-gray-500">
                          {mapping.reporteeUserId.email}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {mapping.projectId?.name || 'All Projects'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {mapping.relationshipType.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {mapping.isActive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {mapping.isActive && (
                          <button
                            onClick={() => handleDeactivate(mapping._id)}
                            className="text-red-600 hover:text-red-900 flex items-center gap-1"
                          >
                            <TrashIcon className="h-4 w-4" />
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TeamManagement;
