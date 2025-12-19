import React, { useState, useEffect } from 'react';
import { MdSave, MdInfo, MdAdd, MdEdit, MdDelete, MdDragIndicator } from 'react-icons/md';
import DashboardLayout from './DashboardLayout';
import { useParams } from 'react-router-dom';
import { API_CONFIG } from '../config/constants';

interface TicketStatus {
  _id?: string;
  name: string;
  code: string;
  color: string;
  isDefault: boolean;
  isClosed: boolean;
  displayOrder: number;
}

interface TicketCategory {
  _id?: string;
  name: string;
  code: string;
  description?: string;
  icon?: string;
  color?: string;
  defaultPriority?: string;
  order?: number;
  isActive?: boolean;
}

interface TicketNumberingConfig {
  format: string; // e.g., "TICK-{YYYY}-{####}"
  prefix: string;
  startingNumber: number;
  separator: string;
  includeYear: boolean;
  includeMonth: boolean;
  resetFrequency: 'never' | 'yearly' | 'monthly';
}

const TicketSettings: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState('numbering');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [projectName, setProjectName] = useState('');

  // Ticket Numbering State
  const [numbering, setNumbering] = useState<TicketNumberingConfig>({
    format: 'TICK-{YYYY}-{####}',
    prefix: 'TICK',
    startingNumber: 1,
    separator: '-',
    includeYear: true,
    includeMonth: false,
    resetFrequency: 'yearly',
  });

  // Statuses State
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [editingStatus, setEditingStatus] = useState<TicketStatus | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // Categories State - fetched from Category master
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TicketCategory | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Priority options for ticket types - fetched from Priority master
  interface Priority {
    _id: string;
    name: string;
    code: string;
    color?: string;
  }
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loadingPriorities, setLoadingPriorities] = useState(false);

  // Load project-specific ticket configuration
  useEffect(() => {
    loadProjectConfig();
    if (projectId) {
      loadStatuses();
      loadPriorities();
      loadCategories();
    }
  }, [projectId]);

  const loadStatuses = async () => {
    if (!projectId) return;
    
    setLoadingStatuses(true);
    try {
      const token = localStorage.getItem('authToken');
      const cacheBuster = `?t=${Date.now()}`;
      const response = await fetch(`${API_CONFIG.API_URL}/statuses/project/${projectId}${cacheBuster}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Status API Response:', data);
        if (data.success && data.data) {
          console.log('✅ Setting statuses:', data.data.length, 'items');
          setStatuses(data.data);
        } else {
          console.error('❌ API returned success=false or no data:', data);
        }
      } else {
        console.error('❌ API response not OK:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error loading statuses:', error);
    } finally {
      setLoadingStatuses(false);
    }
  };

  const loadPriorities = async () => {
    if (!projectId) return;
    setLoadingPriorities(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/priorities?projectId=${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Priority API Response:', data);
        if (data.success && data.data) {
          console.log('✅ Setting priorities:', data.data.length, 'items');
          setPriorities(data.data);
        } else {
          console.error('❌ Priority API returned success=false or no data:', data);
        }
      } else {
        console.error('❌ Priority API response not OK:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error loading priorities:', error);
    } finally {
      setLoadingPriorities(false);
    }
  };

  const loadCategories = async () => {
    if (!projectId) return;
    setLoadingCategories(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/categories/project/${projectId}?includeInactive=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Category API Response:', data);
        if (data.success && data.data) {
          console.log('✅ Setting categories:', data.data.length, 'items');
          setCategories(data.data);
        } else {
          console.error('❌ Category API returned success=false or no data:', data);
        }
      } else {
        console.error('❌ Category API response not OK:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error loading categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadProjectConfig = async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const cacheBuster = `?t=${Date.now()}`;
      const response = await fetch(`${API_CONFIG.API_URL}/projects/${projectId}/ticket-settings${cacheBuster}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setProjectName(data.projectName || '');
        
        if (data.ticketConfig) {
          if (data.ticketConfig.numbering) setNumbering(data.ticketConfig.numbering);
          // Categories are now loaded from Category API, not project config
        }
      }
    } catch (error) {
      console.error('Error loading project config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!projectId) {
      alert('Project ID is required');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/projects/${projectId}/ticket-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          numbering,
          statuses,
          // Categories are now saved via Category API, not project config
        }),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save ticket configuration');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'numbering', label: 'Ticket Numbering', labelMr: 'तिकीट क्रमांकन' },
    { id: 'statuses', label: 'Ticket Statuses', labelMr: 'तिकीट स्टेटस' },
    { id: 'categories', label: 'Ticket Categories', labelMr: 'तिकीट श्रेणी' },
  ];

  const generatePreview = () => {
    let preview = numbering.prefix;
    if (numbering.separator) preview += numbering.separator;
    if (numbering.includeYear) preview += '2025';
    if (numbering.includeMonth) {
      if (numbering.includeYear) preview += numbering.separator;
      preview += '11';
    }
    preview += numbering.separator + '0001';
    return preview;
  };

  // Status CRUD operations
  const handleAddStatus = () => {
    setEditingStatus({ 
      _id: `temp_${Date.now()}`, 
      name: '', 
      code: '', 
      color: '#3b82f6', 
      isDefault: false, 
      isClosed: false, 
      displayOrder: statuses.length + 1 
    });
    setShowStatusModal(true);
  };

  const handleEditStatus = (status: TicketStatus) => {
    setEditingStatus(status);
    setShowStatusModal(true);
  };

  const handleSaveStatus = async () => {
    if (!editingStatus || !projectId) return;
    
    // Validate required fields
    if (!editingStatus.name || !editingStatus.code) {
      alert('Name and code are required');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      
      // Determine if this is an update or create
      const isUpdate = editingStatus._id && !editingStatus._id.startsWith('temp_');
      const url = isUpdate
        ? `${API_CONFIG.API_URL}/statuses/${editingStatus._id}`
        : `${API_CONFIG.API_URL}/statuses/project/${projectId}`;
      
      const method = isUpdate ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editingStatus.name,
          code: editingStatus.code.toUpperCase(),
          color: editingStatus.color,
          isDefault: editingStatus.isDefault,
          isClosed: editingStatus.isClosed,
          displayOrder: editingStatus.displayOrder
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Reload statuses from server
        await loadStatuses();
        setShowStatusModal(false);
        setEditingStatus(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert(data.message || 'Failed to save status');
      }
    } catch (error) {
      console.error('Error saving status:', error);
      alert('Failed to save status');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStatus = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this status?')) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${API_CONFIG.API_URL}/statuses/${id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      const data = await response.json();
      
      if (data.success) {
        // Reload statuses from server
        await loadStatuses();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert(data.message || 'Failed to delete status');
      }
    } catch (error) {
      console.error('Error deleting status:', error);
      alert('Failed to delete status');
    } finally {
      setLoading(false);
    }
  };

  // Category CRUD operations
  const handleAddCategory = () => {
    setEditingCategory({ 
      _id: '', 
      name: '', 
      code: '', 
      description: '', 
      color: '#3b82f6',
      icon: '',
      defaultPriority: '',
      order: categories.length,
      isActive: true
    });
    setShowCategoryModal(true);
  };

  const handleEditCategory = (category: TicketCategory) => {
    setEditingCategory({ ...category });
    setShowCategoryModal(true);
  };

  // Helper function to generate code from name
  const generateCodeFromName = (name: string): string => {
    return name
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_'); // Replace spaces with underscores
  };

  const handleSaveCategory = async () => {
    if (!editingCategory || !projectId) return;

    // Validate required fields
    if (!editingCategory.name) {
      alert('Name is required');
      return;
    }

    // Auto-generate code from name if not provided or if it's a new category
    const isNew = !editingCategory._id || editingCategory._id === '';
    const code = isNew ? generateCodeFromName(editingCategory.name) : editingCategory.code;

    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      
      const url = isNew 
        ? `${API_CONFIG.API_URL}/categories/project/${projectId}`
        : `${API_CONFIG.API_URL}/categories/${editingCategory._id}`;
      
      const response = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: editingCategory.name,
          code: code,
          description: editingCategory.description,
          color: editingCategory.color,
          icon: editingCategory.icon,
          defaultPriority: editingCategory.defaultPriority,
          order: editingCategory.order,
          isActive: editingCategory.isActive,
        }),
      });

      if (response.ok) {
        await loadCategories(); // Reload from API
        setShowCategoryModal(false);
        setEditingCategory(null);
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'Failed to save category');
      }
    } catch (error) {
      console.error('Error saving category:', error);
      alert('Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/categories/${categoryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        await loadCategories();
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'Failed to delete category');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '32px' 
        }}>
          <div>
            <h1 style={{ 
              fontSize: '28px', 
              fontWeight: '600', 
              color: 'var(--text-primary)',
              marginBottom: '8px' 
            }}>
              Ticket Configuration {projectName && `- ${projectName}`}
            </h1>
            <p style={{ 
              fontSize: '14px', 
              color: 'var(--text-secondary)' 
            }}>
              Configure ticket numbering, statuses, priorities, categories, and types for this project
            </p>
            <p style={{ 
              fontSize: '12px', 
              color: 'var(--text-secondary)',
              marginTop: '4px',
              fontStyle: 'italic'
            }}>
              Note: Assignment rules, notifications, and SLA settings are configured in Project Management and SLA/Escalation pages
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleSave}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                background: saved ? '#10b981' : 'var(--primary-main)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                color: 'white',
              }}
            >
              <MdSave /> {saved ? 'Saved!' : loading ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '60% 38%', gap: '24px' }}>
          {/* Left Column - Configuration */}
          <div>
            {/* Tabs */}
            <div style={{ 
              display: 'flex', 
              gap: '8px', 
              borderBottom: '2px solid var(--border-subtle)',
              marginBottom: '24px',
              overflowX: 'auto',
              paddingBottom: '0'
            }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '12px 20px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '3px solid var(--primary-main)' : '3px solid transparent',
                    fontSize: '14px',
                    fontWeight: activeTab === tab.id ? '600' : '500',
                    color: activeTab === tab.id ? 'var(--primary-main)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

        {/* Tab Content */}
        <div style={{ 
          background: 'white', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: '12px',
          padding: '32px' 
        }}>
          {/* Ticket Numbering Tab */}
          {activeTab === 'numbering' && (
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>
                Ticket Numbering Configuration
              </h2>
              
              <div style={{ display: 'grid', gap: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                      Prefix
                    </label>
                    <input
                      type="text"
                      value={numbering.prefix}
                      onChange={(e) => setNumbering({ ...numbering, prefix: e.target.value })}
                      placeholder="e.g., TICK, REQ, INC"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                      Starting Number
                    </label>
                    <input
                      type="number"
                      value={numbering.startingNumber}
                      onChange={(e) => setNumbering({ ...numbering, startingNumber: parseInt(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Separator
                  </label>
                  <input
                    type="text"
                    value={numbering.separator}
                    onChange={(e) => setNumbering({ ...numbering, separator: e.target.value })}
                    placeholder="e.g., -, _, /"
                    maxLength={1}
                    style={{
                      width: '200px',
                      padding: '10px 12px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={numbering.includeYear}
                      onChange={(e) => setNumbering({ ...numbering, includeYear: e.target.checked })}
                    />
                    Include Year
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={numbering.includeMonth}
                      onChange={(e) => setNumbering({ ...numbering, includeMonth: e.target.checked })}
                    />
                    Include Month
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Reset Frequency
                  </label>
                  <select
                    value={numbering.resetFrequency}
                    onChange={(e) => setNumbering({ ...numbering, resetFrequency: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  >
                    <option value="never">Never (Continuous)</option>
                    <option value="yearly">Reset Yearly</option>
                    <option value="monthly">Reset Monthly</option>
                  </select>
                </div>

                <div style={{ 
                  background: '#dbeafe', 
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  gap: '12px'
                }}>
                  <MdInfo style={{ color: '#3b82f6', fontSize: '20px', flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#1e40af' }}>Preview:</strong>
                    <p style={{ color: '#1e40af', marginTop: '4px', fontSize: '18px', fontWeight: '600' }}>
                      {generatePreview()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ticket Statuses Tab */}
          {activeTab === 'statuses' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600' }}>
                  Ticket Statuses
                </h2>
                <button
                  onClick={handleAddStatus}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    background: 'var(--primary-main)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  <MdAdd /> Add Status
                </button>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {loadingStatuses && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Loading statuses...
                  </div>
                )}
                {!loadingStatuses && statuses.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No statuses found. Click "Add Status" to create one.
                  </div>
                )}
                {!loadingStatuses && statuses.map((status) => (
                  <div
                    key={status._id || status.code}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '16px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      background: 'white',
                    }}
                  >
                    <MdDragIndicator style={{ color: 'var(--text-secondary)', cursor: 'grab' }} />
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '4px',
                        background: status.color,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{status.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Code: {status.code}
                        {status.isDefault && ' • Default'}
                        {status.isClosed && ' • Closes Ticket'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleEditStatus(status)}
                      style={{
                        padding: '8px 12px',
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <MdEdit /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteStatus(status._id || status.code)}
                      style={{
                        padding: '8px 12px',
                        background: 'transparent',
                        border: '1px solid #ef4444',
                        borderRadius: '6px',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <MdDelete /> Delete
                    </button>
                  </div>
                ))}
              </div>

              {/* Status Modal */}
              {showStatusModal && editingStatus && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                }}>
                  <div style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    width: '500px',
                    maxWidth: '90%',
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                      {editingStatus._id ? 'Edit Status' : 'Add Status'}
                    </h3>

                    <div style={{ display: 'grid', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Name</label>
                        <input
                          type="text"
                          value={editingStatus.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            // Auto-generate code from name
                            const code = name
                              .toUpperCase()
                              .replace(/[^A-Z0-9\s]/g, '') // Remove special characters
                              .replace(/\s+/g, '_')         // Replace spaces with underscores
                              .substring(0, 50);             // Limit length
                            setEditingStatus({ ...editingStatus, name, code });
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                          Code <span style={{ color: '#6b7280', fontSize: '12px' }}>(Auto-generated)</span>
                        </label>
                        <input
                          type="text"
                          value={editingStatus.code}
                          readOnly
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            backgroundColor: '#f9fafb',
                            color: '#6b7280',
                            cursor: 'not-allowed',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Color</label>
                        <input
                          type="color"
                          value={editingStatus.color}
                          onChange={(e) => setEditingStatus({ ...editingStatus, color: e.target.value })}
                          style={{
                            width: '100%',
                            height: '50px',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                          }}
                        />
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={editingStatus.isDefault}
                          onChange={(e) => setEditingStatus({ ...editingStatus, isDefault: e.target.checked })}
                        />
                        Set as Default Status
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={editingStatus.isClosed}
                          onChange={(e) => setEditingStatus({ ...editingStatus, isClosed: e.target.checked })}
                        />
                        This Status Closes Tickets
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          setShowStatusModal(false);
                          setEditingStatus(null);
                        }}
                        style={{
                          padding: '10px 20px',
                          background: 'transparent',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveStatus}
                        style={{
                          padding: '10px 20px',
                          background: 'var(--primary-main)',
                          border: 'none',
                          borderRadius: '8px',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ticket Categories Tab */}
          {activeTab === 'categories' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600' }}>
                  Ticket Categories
                </h2>
                <button
                  onClick={handleAddCategory}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    background: 'var(--primary-main)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  <MdAdd /> Add Category
                </button>
              </div>

              {loadingCategories ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Loading categories...
                </div>
              ) : categories.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No categories configured yet. Click "Add Category" to create one.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {categories.map((category) => (
                    <div
                      key={category._id || category.code}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '20px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        background: 'white',
                        opacity: category.isActive === false ? 0.6 : 1,
                      }}
                    >
                      {category.color && (
                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: category.color,
                          flexShrink: 0,
                        }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                          {category.name}
                          {category.isActive === false && (
                            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6b7280' }}>(Inactive)</span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          {category.description || 'No description'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Code: {category.code}
                          {category.defaultPriority && ` • Default Priority: ${category.defaultPriority}`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleEditCategory(category)}
                        style={{
                          padding: '8px 12px',
                          background: 'transparent',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <MdEdit /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category._id!)}
                        style={{
                          padding: '8px 12px',
                          background: 'transparent',
                          border: '1px solid #ef4444',
                          borderRadius: '6px',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <MdDelete /> Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Category Modal */}
              {showCategoryModal && editingCategory && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                }}>
                  <div style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '24px',
                    width: '500px',
                    maxWidth: '90%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                  }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                      {editingCategory._id ? 'Edit Category' : 'Add Category'}
                    </h3>

                    <div style={{ display: 'grid', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Name *</label>
                        <input
                          type="text"
                          value={editingCategory.name}
                          onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            outline: 'none',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Color</label>
                        <input
                          type="color"
                          value={editingCategory.color || '#3b82f6'}
                          onChange={(e) => setEditingCategory({ ...editingCategory, color: e.target.value })}
                          style={{
                            width: '100%',
                            height: '40px',
                            padding: '4px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            cursor: 'pointer',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Icon (optional)</label>
                        <input
                          type="text"
                          value={editingCategory.icon || ''}
                          onChange={(e) => setEditingCategory({ ...editingCategory, icon: e.target.value })}
                          placeholder="e.g., MdBugReport, MdHelp, MdQuestionAnswer"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            outline: 'none',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Description</label>
                        <textarea
                          value={editingCategory.description || ''}
                          onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                          rows={3}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            fontFamily: 'inherit',
                            outline: 'none',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Default Priority</label>
                        <select
                          value={editingCategory.defaultPriority || ''}
                          onChange={(e) => setEditingCategory({ ...editingCategory, defaultPriority: e.target.value })}
                          disabled={loadingPriorities}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            outline: 'none',
                            backgroundColor: 'white',
                          }}
                        >
                          <option value="">No default</option>
                          {loadingPriorities ? (
                            <option disabled>Loading priorities...</option>
                          ) : priorities.length > 0 ? (
                            priorities.map(p => (
                              <option key={p._id} value={p.code}>{p.name}</option>
                            ))
                          ) : (
                            <option disabled>No priorities found for this project</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' }}>
                          <input
                            type="checkbox"
                            checked={editingCategory.isActive !== false}
                            onChange={(e) => setEditingCategory({ ...editingCategory, isActive: e.target.checked })}
                          />
                          Active
                        </label>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          setShowCategoryModal(false);
                          setEditingCategory(null);
                        }}
                        style={{
                          padding: '10px 20px',
                          background: 'transparent',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveCategory}
                        disabled={loading}
                        style={{
                          padding: '10px 20px',
                          background: 'var(--primary-main)',
                          border: 'none',
                          borderRadius: '8px',
                          color: 'white',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading ? 0.7 : 1,
                        }}
                      >
                        {loading ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
          </div>

          {/* Right Column - Preview Panel */}
          <div>
            <div style={{ position: 'sticky', top: '24px' }}>
              <div style={{ 
                background: 'white', 
                border: '1px solid var(--border-subtle)', 
                borderRadius: '12px',
                padding: '24px'
              }}>
                <h3 style={{ 
                  fontSize: '18px', 
                  fontWeight: '600', 
                  color: 'var(--text-primary)',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <MdInfo style={{ color: 'var(--primary-main)' }} />
                  Configuration Summary
                </h3>

                {activeTab === 'numbering' && (
                  <div>
                    <h4 style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: 'var(--text-secondary)',
                      marginBottom: '12px'
                    }}>
                      Preview Format
                    </h4>
                    <div style={{
                      background: '#f3f4f6',
                      padding: '16px',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '16px',
                      fontWeight: '600',
                      textAlign: 'center',
                      color: 'var(--primary-main)',
                      marginBottom: '16px'
                    }}>
                      {generatePreview()}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <p><strong>Format:</strong> {numbering.format}</p>
                      <p><strong>Prefix:</strong> {numbering.prefix || 'None'}</p>
                      <p><strong>Starting Number:</strong> {numbering.startingNumber}</p>
                      <p><strong>Reset:</strong> {numbering.resetFrequency}</p>
                    </div>
                  </div>
                )}

                {activeTab === 'statuses' && (
                  <div>
                    <h4 style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: 'var(--text-secondary)',
                      marginBottom: '12px'
                    }}>
                      Configured Statuses
                    </h4>
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>#</th>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Name</th>
                            <th style={{ padding: '8px', textAlign: 'center', fontWeight: '600' }}>Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statuses.sort((a, b) => a.displayOrder - b.displayOrder).map((status, index) => (
                            <tr key={status._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px' }}>{index + 1}</td>
                              <td style={{ padding: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    background: status.color,
                                    display: 'inline-block'
                                  }}></span>
                                  {status.name}
                                </div>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                {status.isDefault && <span style={{ color: '#10b981' }}>✓ Default</span>}
                                {status.isClosed && <span style={{ color: '#6b7280' }}>Closed</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {statuses.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>
                          No statuses configured yet
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'categories' && (
                  <div>
                    <h4 style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: 'var(--text-secondary)',
                      marginBottom: '12px'
                    }}>
                      Configured Categories
                    </h4>
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>#</th>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Name</th>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Priority</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categories.map((category, index) => (
                            <tr key={category._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px' }}>{index + 1}</td>
                              <td style={{ padding: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {category.color && (
                                    <span style={{
                                      width: '10px',
                                      height: '10px',
                                      borderRadius: '50%',
                                      background: category.color,
                                      display: 'inline-block'
                                    }}></span>
                                  )}
                                  <div>
                                    <div style={{ fontWeight: '500' }}>{category.name}</div>
                                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{category.description || ''}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '8px' }}>
                                {(() => {
                                  const priority = priorities.find(p => p.code === category.defaultPriority);
                                  const bgColor = priority?.color ? `${priority.color}20` : '#dbeafe';
                                  const textColor = priority?.color || '#1e40af';
                                  return (
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: '500',
                                      background: bgColor,
                                      color: textColor
                                    }}>
                                      {priority?.name || category.defaultPriority || 'Not set'}
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {categories.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>
                          No categories configured yet
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TicketSettings;
