import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '../../components/DashboardLayout';
import { usePermissions } from '../../hooks/usePermissions';
import { API_CONFIG } from '../../config/constants';

type ApprovalCategory = {
  _id: string;
  key: string;
  name: string;
  description?: string;
  module: string;
  category: string;
};

type LevelForm = {
  tempId: string;
  role: string; // Changed from roles array to single role
  approverType: 'role' | 'designation' | 'region';
};

const API_BASE = `${API_CONFIG.API_URL}`;

const createEmptyLevel = (index: number): LevelForm => ({
  tempId: `level-${Date.now()}-${index}`,
  role: '',
  approverType: 'role',
});

const ApprovalWorkflows: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [masters, setMasters] = useState<{ categories: ApprovalCategory[] }>({
    categories: [],
  });
  const [roleOptions, setRoleOptions] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<any>(null);
  const [viewingWorkflow, setViewingWorkflow] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    approvalLogic: 'sequential',
    autoApprove: false,
  });
  const [levels, setLevels] = useState<LevelForm[]>([]);
  const [showHierarchy, setShowHierarchy] = useState(false);

  console.log('ApprovalWorkflows Component Mounted');

  // Fetch functions
  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE}/projects`, {
        headers: { Authorization: token ? `Bearer ${token}` : undefined },
      });
      console.log('Full projects response:', response.data);
      
      // The response structure is: {success: true, data: {projects: [], pagination: {}}}
      let projectsList = [];
      if (response.data?.data?.projects) {
        projectsList = response.data.data.projects;
      } else if (Array.isArray(response.data?.data)) {
        projectsList = response.data.data;
      } else if (Array.isArray(response.data)) {
        projectsList = response.data;
      }
      
      console.log('Projects loaded:', projectsList);
      console.log('Projects count:', projectsList.length);
      setProjects(projectsList);
      
      setLoading(false);
      
      // Also load masters since super admin doesn't need project-specific categories
      await fetchMasters();
    } catch (error) {
      console.error('Error fetching projects', error);
      setProjects([]); // Set empty array on error
      setLoading(false);
    }
  };

  const fetchWorkflows = async (projId: string) => {
    try {
      const response = await axios.get(`${API_BASE}/approvals/project/${projId}`);
      setWorkflows(response.data?.data || []);
    } catch (error) {
      console.error('Error fetching workflows', error);
    }
  };

  const fetchMasters = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE}/approval-masters`, {
        headers: { Authorization: token ? `Bearer ${token}` : undefined },
      });
      console.log('Approval Masters Response:', response.data);
      const mastersData = response.data?.data || { categories: [] };
      console.log('Categories Count:', mastersData.categories?.length);
      setMasters(mastersData);
    } catch (error) {
      console.error('Error fetching approval masters', error);
    }
  };

  const fetchProjectRoles = async (projId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE}/roles`, {
        headers: { Authorization: token ? `Bearer ${token}` : undefined },
        params: { projectId: projId },
      });
      const roles = response.data?.data || [];
      console.log('Roles Response:', roles);
      setRoleOptions(roles);
    } catch (error) {
      console.error('Failed to load project roles', error);
    }
  };

  useEffect(() => {
    console.log('First useEffect - checking authentication');
    
    // Check if user is super admin FIRST
    const token = localStorage.getItem('authToken');
    console.log('Token exists:', !!token);
    
    if (token) {
      try {
        const parts = token.split('.');
        console.log('Token parts:', parts.length);
        
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          console.log('Decoded token payload:', payload);
          console.log('User role from token:', payload.role);
          
          // Check permissions instead of role code
          // Users with PROJECT_VIEW_ALL permission can see all projects
          if (payload.permissions && Array.isArray(payload.permissions)) {
            const hasProjectViewAll = payload.permissions.includes('PROJECT_VIEW_ALL');
            if (hasProjectViewAll) {
              console.log('✓ User has PROJECT_VIEW_ALL permission - loading all projects');
              fetchProjects();
              return;
            } else {
              console.log('× User does not have PROJECT_VIEW_ALL permission');
            }
          }
        } else {
          console.error('Invalid token format - expected 3 parts, got:', parts.length);
        }
      } catch (error) {
        console.error('Failed to decode token:', error);
      }
    } else {
      console.warn('No token found in localStorage');
    }
    
    // For non-super admin users, check projectContext
    console.log('Checking projectContext for regular user...');
    const projectContext = localStorage.getItem('projectContext');
    console.log('projectContext from localStorage:', projectContext);
    
    if (!projectContext) {
      console.warn('No projectContext found in localStorage');
      setLoading(false);
      return;
    }
    
    try {
      const parsed = JSON.parse(projectContext);
      console.log('Parsed projectContext:', parsed);
      if (parsed?.projectId) {
        console.log('Setting projectId:', parsed.projectId);
        setProjectId(parsed.projectId);
      } else {
        console.warn('No projectId in parsed context');
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to parse project context', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('Second useEffect - projectId changed:', projectId);
    if (!projectId) return;
    const loadData = async () => {
      console.log('Loading data for projectId:', projectId);
      setLoading(true);
      try {
        await Promise.all([fetchWorkflows(projectId), fetchMasters(), fetchProjectRoles(projectId)]);
        console.log('All data loaded successfully');
      } catch (error) {
        console.error('Failed to load approval workspace', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId]);

  const resetFormState = () => {
    setForm({ name: '', description: '', categoryId: '', approvalLogic: 'sequential', autoApprove: false });
    setLevels([]);
    setShowHierarchy(false);
    setCategorySearch('');
    setShowCategoryDropdown(false);
  };

  const handleOpenModal = () => {
    resetFormState();
    setEditingWorkflow(null);
    setModalOpen(true);
  };

  const handleEditWorkflow = (workflow: any) => {
    setEditingWorkflow(workflow);
    setForm({
      name: workflow.name || '',
      description: workflow.description || '',
      categoryId: workflow.categoryId?._id || workflow.categoryId || '',
      approvalLogic: workflow.approvalLogic || 'sequential',
      autoApprove: workflow.autoApprove || false,
    });
    
    // Set category search to the category name
    const categoryName = typeof workflow.categoryId === 'object' ? workflow.categoryId.name : '';
    setCategorySearch(categoryName);
    
    // Convert workflow levels to LevelForm format
    const workflowLevels = (workflow.levels || []).map((level: any, index: number) => ({
      tempId: `level-${Date.now()}-${index}`,
      role: Array.isArray(level.roles) && level.roles.length > 0 
        ? (typeof level.roles[0] === 'object' ? level.roles[0]._id : level.roles[0])
        : '',
      approverType: 'role' as const,
    }));
    
    setLevels(workflowLevels);
    setShowHierarchy(workflowLevels.length > 0);
    setModalOpen(true);
  };

  const handleViewWorkflow = (workflow: any) => {
    setViewingWorkflow(workflow);
    setViewModalOpen(true);
  };

  const handleLevelRoleChange = (tempId: string, value: string) => {
    setLevels((prev) => prev.map((level) => (level.tempId === tempId ? { ...level, role: value } : level)));
  };

  const handleAddLevel = () => {
    if (!showHierarchy) {
      setShowHierarchy(true);
    }
    setLevels((prev) => [...prev, createEmptyLevel(prev.length + 1)]);
  };

  const handleRemoveLevel = (tempId: string) => {
    setLevels((prev) => (prev.length === 1 ? prev : prev.filter((level) => level.tempId !== tempId)));
  };

  const filteredWorkflows = useMemo(() => {
    if (!searchText.trim()) return workflows;
    const term = searchText.toLowerCase();
    return workflows.filter((workflow) => {
      const name = workflow.name?.toLowerCase() || '';
      const categoryName = typeof workflow.categoryId === 'object' ? workflow.categoryId?.name?.toLowerCase() : '';
      const requestTypeName = typeof workflow.requestTypeId === 'object' ? workflow.requestTypeId?.name?.toLowerCase() : '';
      return name.includes(term) || categoryName?.includes(term) || requestTypeName?.includes(term);
    });
  }, [workflows, searchText]);

  const handleCreate = async () => {
    if (!projectId) {
      alert('Project context missing');
      return;
    }
    if (!form.name.trim()) {
      alert('Workflow name is required');
      return;
    }
    if (!form.categoryId) {
      alert('Please select a category');
      return;
    }
    if (levels.some((level) => !level.role)) {
      alert('Each approval level needs a role');
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('authToken');
      
      const payload = {
        projectId,
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        categoryId: form.categoryId,
        approvalLogic: form.approvalLogic,
        autoApprove: form.autoApprove,
        levels: levels.map((level, index) => ({
          level: index + 1,
          roles: [level.role],
          approvers: [],
        })),
      };
      
      if (editingWorkflow) {
        // Update existing workflow
        await axios.put(
          `${API_BASE}/approvals/${editingWorkflow._id}`,
          payload,
          {
            headers: { Authorization: token ? `Bearer ${token}` : undefined },
          }
        );
        alert('Workflow updated successfully');
      } else {
        // Create new workflow
        await axios.post(
          `${API_BASE}/approvals`,
          payload,
          {
            headers: { Authorization: token ? `Bearer ${token}` : undefined },
          }
        );
        alert('Workflow created successfully');
      }
      
      setModalOpen(false);
      await fetchWorkflows(projectId);
    } catch (error) {
      console.error('Create/Update workflow error', error);
      alert(editingWorkflow ? 'Failed to update workflow' : 'Failed to create workflow');
    } finally {
      setSaving(false);
    }
  };

  const resolveCategoryName = (workflow: any) => {
    if (!workflow?.categoryId) return '—';
    if (typeof workflow.categoryId === 'object') return workflow.categoryId.name || '—';
    const fallback = masters.categories.find((c) => c._id === workflow.categoryId);
    return fallback?.name || '—';
  };

  const renderBadge = (label: string, tone: 'green' | 'red' | 'blue' | 'gray' | 'purple') => {
    const styles = {
      green: { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' },
      red: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' },
      blue: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' },
      purple: { background: '#EDE9FE', color: '#5B21B6', border: '1px solid #DDD6FE' },
      gray: { background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' },
    }[tone];
    
    return (
      <span
        style={{
          display: 'inline-flex',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          ...styles,
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div style={{ 
        padding: '32px 24px', 
        maxWidth: '1440px', 
        margin: '0 auto',
        background: '#F9FAFB',
        minHeight: '100vh',
        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
      }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ 
            margin: '0 0 8px 0',
            fontSize: '28px', 
            fontWeight: 700, 
            color: '#111827',
            letterSpacing: '-0.02em',
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}>
            Approval Process
          </h1>
          <p style={{ 
            margin: 0,
            fontSize: '14px', 
            color: '#6B7280',
            fontWeight: 400,
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}>
            Define multi-level approvals for high-impact changes
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ fontSize: '14px', color: '#6B7280' }}>Loading approval workflows...</div>
          </div>
        ) : projects.length === 0 ? (
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '48px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <h2 style={{ 
              fontSize: '24px', 
              fontWeight: 600, 
              color: '#111827', 
              marginBottom: '12px' 
            }}>No Projects Found</h2>
            <p style={{ 
              fontSize: '14px', 
              color: '#6B7280', 
              marginBottom: '24px' 
            }}>
              Create a project first to manage approval workflows.
            </p>
          </div>
        ) : (
          <>
        {/* Project Selector - Show for users with PROJECT_VIEW_ALL permission */}
        {hasPermission('PROJECT_VIEW_ALL') && (
          <div style={{ 
            marginBottom: '24px',
            padding: '16px',
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '18px' }}>🏢</span>
              <label style={{ 
                fontSize: '14px', 
                fontWeight: 600,
                color: '#0C4A6E',
              }}>Select Project to Manage Approval Workflows</label>
            </div>
            <p style={{
              fontSize: '13px',
              color: '#0369A1',
              marginBottom: '12px',
              margin: '0 0 12px 0',
            }}>
              Choose which project's approval process you want to configure
            </p>
            <select
              value={projectId || ''}
              onChange={(e) => {
                const selectedId = e.target.value;
                setProjectId(selectedId);
                console.log('Project changed to:', selectedId);
              }}
              style={{
                width: '100%',
                maxWidth: '500px',
                padding: '10px 14px',
                fontSize: '14px',
                border: '2px solid #0EA5E9',
                borderRadius: '6px',
                background: 'white',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                fontWeight: 500,
                color: '#111827',
              }}
            >
              <option value="" disabled>-- Select a Project --</option>
              {Array.isArray(projects) && projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Show content only if project is selected */}
        {!projectId && hasPermission('PROJECT_VIEW_ALL') ? (
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '48px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginTop: '24px',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👆</div>
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#111827', 
              marginBottom: '8px' 
            }}>Select a Project</h3>
            <p style={{ 
              fontSize: '14px', 
              color: '#6B7280',
            }}>
              Please select a project from the dropdown above to manage its approval workflows
            </p>
          </div>
        ) : (
          <>
        {/* Actions Bar */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '24px', 
          gap: '16px', 
          flexWrap: 'wrap' 
        }}>
          <div style={{ display: 'flex', gap: '12px', flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 280px', minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Search users..."
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  fontSize: '14px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#111827',
                  outline: 'none',
                  transition: 'all 0.2s',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}
                onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
              />
              <svg
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '16px',
                  height: '16px',
                  color: '#9CA3AF',
                  pointerEvents: 'none',
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={handleOpenModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                fontSize: '14px',
                fontWeight: 600,
                color: 'white',
                background: '#2563EB',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#1D4ED8'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#2563EB'}
            >
              <span style={{ fontSize: '18px', lineHeight: '1' }}>+</span>
              Create User
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ 
            padding: '80px 40px', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '400px',
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
          }}>
            <div style={{ 
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                border: '3px solid #E5E7EB',
                borderTop: '3px solid #2563EB',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}></div>
              <p style={{ 
                color: '#6B7280', 
                fontSize: '14px',
                margin: 0,
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                Loading workflows...
              </p>
            </div>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div style={{ 
            padding: '80px 40px', 
            textAlign: 'center', 
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
          }}>
            <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
              No workflows match your filters yet.
            </p>
          </div>
        ) : (
          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            border: '1px solid #E5E7EB',
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                <thead>
                  <tr style={{ 
                    background: 'white',
                    borderBottom: '1px solid #E5E7EB',
                  }}>
                    <th style={{ 
                      padding: '12px 16px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      color: '#6B7280',
                      textAlign: 'left',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>Workflow Name</th>
                    <th style={{ 
                      padding: '12px 16px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      color: '#6B7280',
                      textAlign: 'left',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>Category</th>
                    <th style={{ 
                      padding: '12px 16px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      color: '#6B7280',
                      textAlign: 'left',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>Approval Flow</th>
                    <th style={{ 
                      padding: '12px 16px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      color: '#6B7280',
                      textAlign: 'left',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>Auto-Approval</th>
                    <th style={{ 
                      padding: '12px 16px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      color: '#6B7280',
                      textAlign: 'left',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>Status</th>
                    <th style={{ 
                      padding: '12px 16px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      color: '#6B7280',
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkflows.map((workflow, index) => (
                    <tr 
                      key={workflow._id} 
                      style={{ 
                        borderBottom: index < filteredWorkflows.length - 1 ? '1px solid #F3F4F6' : 'none',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ 
                          fontWeight: 600, 
                          fontSize: '14px', 
                          color: '#111827',
                          marginBottom: '2px',
                        }}>{workflow.name}</div>
                        {workflow.description && (
                          <div style={{ 
                            fontSize: '13px', 
                            color: '#6B7280',
                          }}>{workflow.description}</div>
                        )}
                      </td>
                      <td style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: '#374151',
                      }}>{resolveCategoryName(workflow)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ 
                          fontSize: '13px', 
                          color: '#374151',
                          marginBottom: '4px',
                        }}>
                          {workflow.approvalLogic === 'parallel' ? 'Parallel' : 'Sequential'} • {(workflow.levels || []).length || 0} levels
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {workflow.autoApprove ? renderBadge('Enabled', 'green') : renderBadge('Disabled', 'gray')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <label style={{ 
                          position: 'relative', 
                          display: 'inline-block', 
                          width: '44px', 
                          height: '24px',
                          cursor: 'pointer',
                        }}>
                          <input 
                            type="checkbox" 
                            checked={workflow.status === 'active'}
                            readOnly
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: workflow.status === 'active' ? '#10B981' : '#D1D5DB',
                            borderRadius: '12px',
                            transition: 'background-color 0.2s',
                          }}>
                            <span style={{
                              position: 'absolute',
                              content: '""',
                              height: '18px',
                              width: '18px',
                              left: workflow.status === 'active' ? '23px' : '3px',
                              bottom: '3px',
                              background: 'white',
                              borderRadius: '50%',
                              transition: 'left 0.2s',
                            }}></span>
                          </span>
                        </label>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleEditWorkflow(workflow)}
                            style={{
                              padding: '6px 8px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              color: '#6B7280',
                              fontSize: '16px',
                              lineHeight: 1,
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#F3F4F6';
                              e.currentTarget.style.color = '#2563EB';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = '#6B7280';
                            }}
                            title="Edit"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleViewWorkflow(workflow)}
                            style={{
                              padding: '6px 8px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              color: '#6B7280',
                              fontSize: '16px',
                              lineHeight: 1,
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#F3F4F6';
                              e.currentTarget.style.color = '#2563EB';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = '#6B7280';
                            }}
                            title="View"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Are you sure you want to delete "${workflow.name}"?`)) {
                                try {
                                  const token = localStorage.getItem('authToken');
                                  await axios.delete(`${API_BASE}/approvals/${workflow._id}`, {
                                    headers: { Authorization: token ? `Bearer ${token}` : undefined },
                                  });
                                  alert('Workflow deleted successfully');
                                  if (projectId) {
                                    await fetchWorkflows(projectId);
                                  }
                                } catch (error) {
                                  console.error('Delete error:', error);
                                  alert('Failed to delete workflow');
                                }
                              }
                            }}
                            style={{
                              padding: '6px 8px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              color: '#6B7280',
                              fontSize: '16px',
                              lineHeight: 1,
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#FEE2E2';
                              e.currentTarget.style.color = '#DC2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = '#6B7280';
                            }}
                            title="Delete"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {modalOpen && (
          <div style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(0, 0, 0, 0.5)', 
            display: 'flex', 
            alignItems: 'flex-start', 
            justifyContent: 'center', 
            overflowY: 'auto', 
            padding: '40px 16px', 
            zIndex: 1000,
          }}>
            <div style={{ 
              background: '#fff', 
              borderRadius: '8px', 
              width: '100%', 
              maxWidth: '720px', 
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}>
              {/* Modal Header */}
              <div style={{ 
                padding: '20px 24px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
              }}>
                <div>
                  <h3 style={{ 
                    margin: '0 0 4px 0',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#111827',
                  }}>{editingWorkflow ? 'Edit Approval Workflow' : 'Add New Approval Workflow'}</h3>
                  <p style={{ 
                    margin: 0,
                    fontSize: '13px',
                    color: '#6B7280',
                  }}>Define multi-level approvals driven by roles</p>
                </div>
                <button 
                  onClick={() => setModalOpen(false)} 
                  style={{ 
                    border: 'none', 
                    background: 'transparent', 
                    fontSize: '24px', 
                    color: '#6B7280',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    lineHeight: 1,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#F3F4F6';
                    e.currentTarget.style.color = '#111827';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#6B7280';
                  }}
                >×</button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'grid', gap: '20px' }}>
                  {/* Form Fields */}
                  <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    <div>
                      <label style={{ 
                        display: 'block',
                        fontSize: '13px', 
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: '6px',
                      }}>Workflow Name *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="e.g., SLA Modification"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          fontSize: '14px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          outline: 'none',
                          transition: 'border-color 0.2s',
                          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                        onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block',
                        fontSize: '13px', 
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: '6px',
                      }}>Category *</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={categorySearch}
                          onChange={(e) => {
                            setCategorySearch(e.target.value);
                            setShowCategoryDropdown(true);
                          }}
                          onFocus={() => setShowCategoryDropdown(true)}
                          placeholder="Search categories..."
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            fontSize: '14px',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            background: 'white',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#D1D5DB';
                            setTimeout(() => setShowCategoryDropdown(false), 200);
                          }}
                        />
                        {showCategoryDropdown && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            maxHeight: '250px',
                            overflowY: 'auto',
                            background: 'white',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            marginTop: '4px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            zIndex: 1000,
                          }}>
                            {masters.categories
                              .filter(category => 
                                category.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
                                category.module?.toLowerCase().includes(categorySearch.toLowerCase())
                              )
                              .map((category) => (
                                <div
                                  key={category._id}
                                  onClick={() => {
                                    setForm((prev) => ({ ...prev, categoryId: category._id }));
                                    setCategorySearch(category.name);
                                    setShowCategoryDropdown(false);
                                  }}
                                  style={{
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #F3F4F6',
                                    fontSize: '14px',
                                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#F3F4F6';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'white';
                                  }}
                                >
                                  <div style={{ fontWeight: 500, color: '#111827' }}>{category.name}</div>
                                  {category.module && (
                                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                                      {category.module}
                                    </div>
                                  )}
                                </div>
                              ))}
                            {masters.categories.filter(category => 
                              category.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
                              category.module?.toLowerCase().includes(categorySearch.toLowerCase())
                            ).length === 0 && (
                              <div style={{ padding: '12px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                                No categories found
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block',
                        fontSize: '13px', 
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: '6px',
                      }}>Approval Logic</label>
                      <select
                        value={form.approvalLogic}
                        onChange={(event) => setForm((prev) => ({ ...prev, approvalLogic: event.target.value }))}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          fontSize: '14px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          background: 'white',
                          outline: 'none',
                          transition: 'border-color 0.2s',
                          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                        onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
                      >
                        <option value="sequential">Sequential</option>
                        <option value="parallel">Parallel</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ 
                      display: 'block',
                      fontSize: '13px', 
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '6px',
                    }}>Description</label>
                    <textarea
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Describe when this workflow applies"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        fontSize: '14px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        outline: 'none',
                        resize: 'vertical',
                        transition: 'border-color 0.2s',
                        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                      onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
                    />
                  </div>

                  <div>
                    <label style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px', 
                      fontWeight: 600,
                      color: '#374151',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={form.autoApprove}
                        onChange={(event) => setForm((prev) => ({ ...prev, autoApprove: event.target.checked }))}
                        style={{
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer',
                        }}
                      />
                      Enable Auto-Approval
                    </label>
                  </div>

                  <div style={{ 
                    border: '1px solid #E5E7EB', 
                    borderRadius: '6px', 
                    padding: '16px',
                    background: '#F9FAFB',
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      marginBottom: showHierarchy ? '16px' : '0',
                    }}>
                      <div>
                        <h4 style={{ 
                          margin: '0 0 4px 0',
                          fontSize: '15px',
                          fontWeight: 600,
                          color: '#111827',
                        }}>Approval Hierarchy ({form.approvalLogic === 'sequential' ? 'Sequential' : 'Parallel'})</h4>
                        <p style={{ 
                          margin: 0,
                          fontSize: '13px',
                          color: '#6B7280',
                        }}>Assign approvers to each level</p>
                      </div>
                      <button 
                        onClick={handleAddLevel}
                        style={{
                          padding: '6px 12px',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#2563EB',
                          background: 'white',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F3F4F6';
                          e.currentTarget.style.borderColor = '#2563EB';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'white';
                          e.currentTarget.style.borderColor = '#D1D5DB';
                        }}
                      >
                        + Add Level
                      </button>
                    </div>

                    {showHierarchy && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {levels.map((level, index) => (
                          <div 
                            key={level.tempId} 
                            style={{ 
                              border: '1px solid #D1D5DB', 
                              borderRadius: '6px', 
                              padding: '12px',
                              background: 'white',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              marginBottom: '12px',
                            }}>
                              <strong style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>Level {index + 1}</strong>
                              <button 
                                onClick={() => handleRemoveLevel(level.tempId)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  color: '#6B7280',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = '#DC2626';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = '#6B7280';
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                                  <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                                </svg>
                              </button>
                            </div>

                            <div>
                              <label style={{ 
                                display: 'block',
                                fontSize: '13px', 
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px',
                              }}>Role</label>
                              <select
                                value={level.role}
                                onChange={(event) => {
                                  handleLevelRoleChange(level.tempId, event.target.value);
                                }}
                                style={{ 
                                  width: '100%', 
                                  padding: '9px 12px', 
                                  fontSize: '14px',
                                  borderRadius: '6px', 
                                  border: '1px solid #D1D5DB',
                                  background: 'white',
                                  outline: 'none',
                                  transition: 'border-color 0.2s',
                                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                                onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
                              >
                                <option value="">Select role</option>
                                {roleOptions.map((role) => (
                                  <option key={role._id} value={role._id}>
                                    {role.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ 
                padding: '16px 24px',
                borderTop: '1px solid #E5E7EB',
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '12px',
              }}>
                <button 
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '9px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#374151',
                    background: 'white',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F3F4F6'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreate} 
                  disabled={saving}
                  style={{
                    padding: '9px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'white',
                    background: saving ? '#9CA3AF' : '#2563EB',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) e.currentTarget.style.background = '#1D4ED8';
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) e.currentTarget.style.background = '#2563EB';
                  }}
                >
                  {saving ? (editingWorkflow ? 'Updating…' : 'Creating…') : (editingWorkflow ? 'Update Workflow' : 'Create Workflow')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Workflow Modal */}
        {viewModalOpen && viewingWorkflow && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px',
            }}
            onClick={() => setViewModalOpen(false)}
          >
            <div
              style={{
                background: 'white',
                borderRadius: '12px',
                maxWidth: '700px',
                width: '100%',
                maxHeight: '85vh',
                overflow: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{
                padding: '24px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 600,
                  color: '#111827',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}>
                  View Approval Workflow
                </h3>
                <button
                  onClick={() => setViewModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#6B7280',
                    padding: '0',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: '24px' }}>
                {/* Workflow Name */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '8px',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    Workflow Name
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    background: '#F9FAFB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#111827',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {viewingWorkflow.name}
                  </div>
                </div>

                {/* Description */}
                {viewingWorkflow.description && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '8px',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}>
                      Description
                    </label>
                    <div style={{
                      padding: '10px 12px',
                      background: '#F9FAFB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#111827',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}>
                      {viewingWorkflow.description}
                    </div>
                  </div>
                )}

                {/* Category */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '8px',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    Category
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    background: '#F9FAFB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#111827',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {viewingWorkflow.categoryId?.name || 'N/A'}
                    {viewingWorkflow.categoryId?.module && (
                      <span style={{ color: '#6B7280', marginLeft: '8px' }}>
                        ({viewingWorkflow.categoryId.module})
                      </span>
                    )}
                  </div>
                </div>

                {/* Approval Logic */}
                <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '8px',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}>
                      Approval Logic
                    </label>
                    <div style={{
                      padding: '10px 12px',
                      background: '#F9FAFB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#111827',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                      textTransform: 'capitalize',
                    }}>
                      {viewingWorkflow.approvalLogic}
                    </div>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '8px',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}>
                      Status
                    </label>
                    <div style={{
                      padding: '10px 12px',
                      background: '#F9FAFB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: viewingWorkflow.status === 'active' ? '#DCFCE7' : '#FEE2E2',
                        color: viewingWorkflow.status === 'active' ? '#166534' : '#991B1B',
                      }}>
                        {viewingWorkflow.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Approval Hierarchy */}
                {viewingWorkflow.levels && viewingWorkflow.levels.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '12px',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}>
                      Approval Hierarchy ({viewingWorkflow.levels.length} Level{viewingWorkflow.levels.length !== 1 ? 's' : ''})
                    </label>
                    <div style={{
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}>
                      {viewingWorkflow.levels.map((level: any, index: number) => (
                        <div
                          key={index}
                          style={{
                            padding: '16px',
                            background: index % 2 === 0 ? '#F9FAFB' : 'white',
                            borderBottom: index < viewingWorkflow.levels.length - 1 ? '1px solid #E5E7EB' : 'none',
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            marginBottom: '8px',
                          }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: '#2563EB',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '13px',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}>
                              {index + 1}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#111827',
                                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                              }}>
                                Level {index + 1}
                              </div>
                            </div>
                          </div>
                          <div style={{
                            marginLeft: '40px',
                            fontSize: '14px',
                            color: '#374151',
                            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}>
                            <div style={{ marginBottom: '4px' }}>
                              <span style={{ fontWeight: 500 }}>Role:</span>{' '}
                              {Array.isArray(level.roles) && level.roles.length > 0
                                ? level.roles.map((r: any) => typeof r === 'object' ? r.name : r).join(', ')
                                : 'Not specified'}
                            </div>
                            <div>
                              <span style={{ fontWeight: 500 }}>Type:</span>{' '}
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                background: '#E0E7FF',
                                color: '#3730A3',
                                textTransform: 'capitalize',
                              }}>
                                {level.approverType || 'role'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Auto Approve */}
                {viewingWorkflow.autoApprove && (
                  <div style={{
                    padding: '12px 16px',
                    background: '#FEF3C7',
                    border: '1px solid #FCD34D',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#92400E',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    <strong>Auto-approval enabled:</strong> Requests will be automatically approved if no action is taken.
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid #E5E7EB',
                display: 'flex',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => setViewModalOpen(false)}
                  style={{
                    padding: '9px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'white',
                    background: '#2563EB',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#1D4ED8'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#2563EB'}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
          </>
        )}
        </>
        )}

        {/* Spinner Animation */}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </DashboardLayout>
  );
};

export default ApprovalWorkflows;
