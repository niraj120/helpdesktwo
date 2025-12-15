import { useState, useEffect, useRef } from 'react';
import DashboardLayout from './DashboardLayout';
import AddProjectForm from './AddProjectForm';
import { usePermissions } from '../hooks/usePermissions';
import { API_CONFIG } from '../config/constants';

interface Project {
  _id: string;
  projectId?: string;
  name: string;
  code: string;
  status: string;
  isActive: boolean;
  users?: number;
  branding?: {
    logo?: string;
    favicon?: string;
    headerText?: string;
    footerText?: string;
    domainUrl?: string;
    customUrlPath?: string;
    colorTheme?: {
      primary?: string;
      secondary?: string;
    };
  };
  address?: any;
  contactInfo?: any;
  primaryContact?: any;
  modules?: any;
  settings?: any;
  configuration?: any;
  createdAt: string;
  updatedAt?: string;
}

const ProjectManagement = () => {
  const { hasPermission } = usePermissions();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Prevent duplicate API calls in React StrictMode (development)
  const hasFetchedProjects = useRef(false);

  useEffect(() => {
    // Only fetch once, even in StrictMode
    if (!hasFetchedProjects.current) {
      hasFetchedProjects.current = true;
      fetchProjects();
    }
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/projects`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setProjects(data.data.projects || []);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetails = async (projectId: string) => {
    try {
      setLoadingProject(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/projects/${projectId}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        console.log('Fetched project details:', data.data.project);
        setSelectedProject(data.data.project);
        setShowAddForm(true);
      } else {
        console.error('Failed to fetch project details:', data.message);
      }
    } catch (error) {
      console.error('Error fetching project details:', error);
    } finally {
      setLoadingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    try {
      setDeleting(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/projects/${projectToDelete._id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      
      if (data.success) {
        // Remove deleted project from list
        setProjects(projects.filter(p => p._id !== projectToDelete._id));
        setShowDeleteConfirm(false);
        setProjectToDelete(null);
        alert('Project deleted successfully!');
      } else {
        alert(data.message || 'Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('An error occurred while deleting the project');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '2rem' }}>
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>
              Projects
            </h2>
            {hasPermission('PROJECT_CREATE') && (
              <button
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#2563EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedProject(null);
                  setShowAddForm(true);
                }}
              >
                Add Project
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>
              No projects found. Click "Add Project" to create one.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#6B7280' }}>
                    Project ID
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#6B7280' }}>
                    Name
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#6B7280' }}>
                    Code
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#6B7280' }}>
                    Users
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#6B7280' }}>
                    Status
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#6B7280' }}>
                    Created
                  </th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#6B7280' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project._id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6B7280' }}>
                      {project.projectId || 'N/A'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>
                      {project.name}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6B7280' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#F3F4F6',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '0.8125rem'
                      }}>
                        {project.code}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6B7280' }}>
                      {project.users || 0}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        background: project.isActive ? '#DCFCE7' : '#FEE2E2',
                        color: project.isActive ? '#047857' : '#DC2626'
                      }}>
                        {project.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6B7280' }}>
                      {new Date(project.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {hasPermission('PROJECT_EDIT') && (
                        <button
                          onClick={() => fetchProjectDetails(project._id)}
                          disabled={loadingProject}
                          style={{
                            padding: '0.5rem 1rem',
                            background: loadingProject ? '#E5E7EB' : '#F3F4F6',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.875rem',
                            cursor: loadingProject ? 'not-allowed' : 'pointer',
                            marginRight: '0.5rem'
                          }}
                        >
                          {loadingProject ? 'Loading...' : 'Edit'}
                        </button>
                      )}
                      {hasPermission('PROJECT_DELETE') && (
                        <button
                          onClick={() => {
                            setProjectToDelete(project);
                            setShowDeleteConfirm(true);
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#FEE2E2',
                            color: '#DC2626',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#FECACA'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#FEE2E2'}
                        >
                          Delete
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

      {/* Add/Edit Project Form Modal */}
      {showAddForm && (
        <AddProjectForm
          project={selectedProject}
          onClose={() => {
            setShowAddForm(false);
            setSelectedProject(null);
          }}
          onSave={() => {
            setShowAddForm(false);
            setSelectedProject(null);
            fetchProjects(); // Refresh the projects list
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && projectToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden'
          }}>
            {/* Icon and Title */}
            <div style={{ padding: '24px 24px 20px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 style={{
                margin: '0 0 8px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#111827'
              }}>
                Delete Project?
              </h3>
              <p style={{
                margin: '0',
                fontSize: '14px',
                color: '#6b7280',
                lineHeight: '1.5'
              }}>
                Are you sure you want to delete <strong>{projectToDelete.name}</strong>? This action cannot be undone and will permanently remove all project data including users, tickets, and configurations.
              </p>
            </div>

            {/* Actions */}
            <div style={{
              padding: '16px 24px 24px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setProjectToDelete(null);
                }}
                disabled={deleting}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: deleting ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!deleting) e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={deleting}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: deleting ? '#9ca3af' : '#ef4444',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '100px'
                }}
                onMouseEnter={(e) => {
                  if (!deleting) e.currentTarget.style.backgroundColor = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  if (!deleting) e.currentTarget.style.backgroundColor = '#ef4444';
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default ProjectManagement;
