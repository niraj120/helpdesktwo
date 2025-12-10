import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { API_CONFIG } from '../config/constants';

interface Priority {
  _id?: string;
  name: string;
  code?: string;
  color?: string;
  order?: number;
  description?: string;
  responseTime: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  resolutionTime: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  isActive: boolean;
  isDefault?: boolean;
  projectId?: string;
  projectIds?: Array<{
    _id: string;
    name: string;
    code: string;
  }>;
  project?: {
    _id: string;
    name: string;
    code: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

// Keep SLARule alias for backward compatibility
type SLARule = Priority;

const SLARulesPage: React.FC = () => {
  const navigate = useNavigate();
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPriority, setEditingPriority] = useState<Priority | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    color: '#6b7280',
    order: 0,
    description: '',
    responseTimeValue: '',
    responseTimeUnit: 'minutes' as 'minutes' | 'hours' | 'days',
    resolutionTimeValue: '',
    resolutionTimeUnit: 'hours' as 'minutes' | 'hours' | 'days',
    isActive: true,
    isDefault: false,
    projectIds: [] as string[],
  });

  useEffect(() => {
    fetchPriorities();
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/projects`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && Array.isArray(data.data.projects)) {
          setProjects(data.data.projects);
        } else if (data.success && Array.isArray(data.data)) {
          setProjects(data.data);
        } else if (Array.isArray(data)) {
          setProjects(data);
        } else {
          setProjects([]);
        }
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      setProjects([]);
    }
  };

  const fetchPriorities = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      console.log('Fetching priorities with token:', token ? 'Token exists' : 'No token');
      
      const response = await fetch(`${API_CONFIG.API_URL}/sla-rules`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log('Priorities data received:', data);
        if (data.success && data.data) {
          setPriorities(data.data);
          console.log('Priorities set:', data.data.length, 'priorities');
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to fetch priorities:', response.status, errorData);
      }
    } catch (error) {
      console.error('Error fetching priorities:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePriority = async (priority: Priority) => {
    if (confirm(`Are you sure you want to delete "${priority.name}"?`)) {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_CONFIG.API_URL}/sla-rules/${priority._id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          alert('Priority deleted successfully!');
          fetchPriorities();
        } else {
          const errorData = await response.json().catch(() => ({ message: 'Failed to delete' }));
          alert(`Failed to delete priority: ${errorData.message}`);
        }
      } catch (error) {
        console.error('Error deleting priority:', error);
        alert('Error deleting priority');
      }
    }
  };

  const handleToggleStatus = async (priority: Priority) => {
    try {
      const token = localStorage.getItem('authToken');
      // Toggle isActive and update
      const response = await fetch(`${API_CONFIG.API_URL}/sla-rules/${priority._id}/toggle-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ ...priority, isActive: !priority.isActive }),
      });

      if (response.ok) {
        fetchPriorities();
      } else {
        alert('Failed to toggle priority status');
      }
    } catch (error) {
      console.error('Error toggling priority status:', error);
      alert('Error toggling priority status');
    }
  };

  const handleSavePriority = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('authToken');
      
      const priorityData = {
        name: formData.name,
        code: formData.code || formData.name.toUpperCase().replace(/\s+/g, '_'),
        color: formData.color,
        order: formData.order,
        description: formData.description,
        responseTime: {
          value: parseInt(formData.responseTimeValue),
          unit: formData.responseTimeUnit,
        },
        resolutionTime: {
          value: parseInt(formData.resolutionTimeValue),
          unit: formData.resolutionTimeUnit,
        },
        isActive: formData.isActive,
        isDefault: formData.isDefault,
        projectIds: formData.projectIds.length > 0 ? formData.projectIds : [],
      };

      const isEditing = editingPriority !== null;
      const url = isEditing 
        ? `${API_CONFIG.API_URL}/sla-rules/${editingPriority._id}`
        : `${API_CONFIG.API_URL}/sla-rules`;
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(priorityData),
      });

      if (response.ok) {
        alert(`Priority ${isEditing ? 'updated' : 'created'} successfully!`);
        setShowCreateModal(false);
        setEditingPriority(null);
        // Reset form
        setFormData({
          name: '',
          code: '',
          color: '#6b7280',
          order: 0,
          description: '',
          responseTimeValue: '',
          responseTimeUnit: 'minutes',
          resolutionTimeValue: '',
          resolutionTimeUnit: 'hours',
          isActive: true,
          isDefault: false,
          projectIds: [],
        });
        fetchPriorities();
      } else {
        const errorData = await response.json().catch(() => ({ message: `Failed to ${isEditing ? 'update' : 'create'}` }));
        alert(`Failed to ${isEditing ? 'update' : 'create'} priority: ${errorData.message}`);
      }
    } catch (error) {
      console.error(`Error ${editingPriority ? 'updating' : 'creating'} priority:`, error);
      alert(`Error ${editingPriority ? 'updating' : 'creating'} priority`);
    }
  };

  const handleEditPriority = (priority: Priority) => {
    setEditingPriority(priority);

    // Extract project IDs from projectIds array
    const extractedProjectIds = priority.projectIds && Array.isArray(priority.projectIds)
      ? priority.projectIds.map(p => typeof p === 'string' ? p : p._id)
      : priority.projectId ? [priority.projectId] : [];

    setFormData({
      name: priority.name,
      code: priority.code || '',
      color: priority.color || '#6b7280',
      order: priority.order || 0,
      description: priority.description || '',
      responseTimeValue: priority.responseTime?.value?.toString() || '',
      responseTimeUnit: priority.responseTime?.unit || 'minutes',
      resolutionTimeValue: priority.resolutionTime?.value?.toString() || '',
      resolutionTimeUnit: priority.resolutionTime.unit,
      isActive: priority.isActive,
      isDefault: priority.isDefault || false,
      projectIds: extractedProjectIds,
    });
    setShowCreateModal(true);
  };

  const formatTime = (time: { value: number; unit: string }) => {
    return `${time.value} ${time.unit}`;
  };

  // Get color from priority or use default based on name
  const getPriorityColor = (priority: Priority | string) => {
    if (typeof priority === 'object' && priority.color) {
      return priority.color;
    }
    const name = typeof priority === 'string' ? priority : priority.name;
    const colors: Record<string, string> = {
      'Critical': '#dc2626',
      'Urgent': '#ea580c',
      'High': '#f97316',
      'Normal': '#0891b2',
      'Low': '#059669',
    };
    return colors[name] || '#6b7280';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div>Loading SLA rules...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
            Priority & Escalation Management
          </h1>
        </div>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '4px', 
          marginBottom: '24px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <button
            className="btn btn-text"
            style={{
              borderBottom: '3px solid #7c3aed',
              color: '#7c3aed',
              marginBottom: '-2px',
              textTransform: 'none',
              borderRadius: 0,
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Priority
          </button>
          <button
            onClick={() => navigate('/escalation-matrix')}
            className="btn btn-text"
            style={{
              borderBottom: '3px solid transparent',
              color: '#6b7280',
              marginBottom: '-2px',
              textTransform: 'none',
              borderRadius: 0,
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Escalation Matrix
          </button>
        </div>

        {/* Description and Action Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            Define priority levels with SLA response and resolution times
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span>+</span>
            Add Priority
          </button>
        </div>

        {/* Priority List */}
        {priorities.length === 0 ? (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '60px 20px',
            textAlign: 'center',
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
              No Priorities Found
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
              Create your first priority to define response and resolution times
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Create Priority
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {priorities.map((priority) => (
              <div
                key={priority._id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  padding: '24px',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                        {priority.name}
                      </h3>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: `${getPriorityColor(priority)}15`,
                          color: getPriorityColor(priority),
                        }}
                      >
                        {priority.name}
                      </span>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: priority.isActive ? '#dcfce7' : '#fee2e2',
                          color: priority.isActive ? '#166534' : '#991b1b',
                        }}
                      >
                        {priority.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {priority.description && (
                      <p style={{ margin: '0 0 12px 0', color: '#6b7280', fontSize: '14px' }}>
                        {priority.description}
                      </p>
                    )}
                    {(priority.projectIds && priority.projectIds.length > 0) && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
                            {priority.projectIds.length > 1 ? 'Projects:' : 'Project:'}
                          </span>
                          {priority.projectIds.map((proj) => (
                            <span
                              key={proj._id}
                              style={{
                                padding: '2px 8px',
                                backgroundColor: '#ede9fe',
                                color: '#7c3aed',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 500,
                              }}
                            >
                              {proj.code || proj.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleEditPriority(priority)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleStatus(priority)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: priority.isActive ? '#fef3c7' : '#dcfce7',
                        color: priority.isActive ? '#92400e' : '#166534',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      {priority.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeletePriority(priority)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                  <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                      Response Time
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
                      {priority.responseTime ? formatTime(priority.responseTime) : 'Not set'}
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 500 }}>
                      Resolution Time
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
                      {priority.resolutionTime ? formatTime(priority.resolutionTime) : 'Not set'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal - Placeholder */}
        {showCreateModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px',
            }}
            onClick={() => setShowCreateModal(false)}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '32px',
                maxWidth: '600px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600 }}>
                {editingPriority ? 'Edit Priority' : 'Create Priority'}
              </h2>
              
              <form onSubmit={handleSavePriority}>
                {/* Name - This IS the Priority Name */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                    Priority Name <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Critical, High, Normal, Low"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this priority level"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>

                {/* Color and Order - Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  {/* Color */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                      Color
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        style={{
                          width: '48px',
                          height: '40px',
                          padding: '2px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      />
                      <input
                        type="text"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        placeholder="#6b7280"
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Order */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                      Display Order
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.order}
                      onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      Lower numbers appear first
                    </div>
                  </div>
                </div>

                {/* Response Time */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                    Response Time <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.responseTimeValue}
                      onChange={(e) => setFormData({ ...formData, responseTimeValue: e.target.value })}
                      placeholder="e.g., 15"
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                    <select
                      value={formData.responseTimeUnit}
                      onChange={(e) => setFormData({ ...formData, responseTimeUnit: e.target.value as any })}
                      style={{
                        width: '120px',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                </div>

                {/* Resolution Time */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                    Resolution Time <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.resolutionTimeValue}
                      onChange={(e) => setFormData({ ...formData, resolutionTimeValue: e.target.value })}
                      placeholder="e.g., 2"
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                    <select
                      value={formData.resolutionTimeUnit}
                      onChange={(e) => setFormData({ ...formData, resolutionTimeUnit: e.target.value as any })}
                      style={{
                        width: '120px',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                </div>

                {/* Project Mapping */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                    Projects <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6b7280' }}>
                    Select projects where this SLA rule will be applied
                  </p>
                  <div style={{ 
                    border: '1px solid #d1d5db', 
                    borderRadius: '6px', 
                    padding: '12px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    backgroundColor: '#f9fafb',
                  }}>
                    {projects.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                        No projects available
                      </p>
                    ) : (
                      projects.map((project) => (
                        <label
                          key={project._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <input
                            type="checkbox"
                            checked={formData.projectIds.includes(project._id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  projectIds: [...formData.projectIds, project._id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  projectIds: formData.projectIds.filter(id => id !== project._id),
                                });
                              }
                            }}
                            style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '13px', color: '#374151' }}>
                            {project.name} {project.code ? <span style={{ color: '#6b7280' }}>({project.code})</span> : ''}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Active Status */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                      Active (priority will be available immediately)
                    </span>
                  </label>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingPriority(null);
                      setFormData({
                        name: '',
                        code: '',
                        color: '#6b7280',
                        order: 0,
                        description: '',
                        responseTimeValue: '',
                        responseTimeUnit: 'minutes',
                        resolutionTimeValue: '',
                        resolutionTimeUnit: 'hours',
                        isActive: true,
                        isDefault: false,
                        projectId: '',
                      });
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#7c3aed',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {editingPriority ? 'Update Priority' : 'Create Priority'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SLARulesPage;
