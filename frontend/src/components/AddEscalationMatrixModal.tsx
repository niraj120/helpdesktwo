import React, { useState, useEffect } from 'react';
import { API_CONFIG } from '../config/constants';

interface EscalationLevel {
  level: number;
  escalateAfter: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
  escalateTo: {
    type: 'user' | 'group' | 'role';
    targetId: string;
    targetName: string;
  };
  notifyMethod: ('email' | 'sms' | 'push')[];
  emailTemplate?: string;
  actions?: {
    changePriority?: 'Critical' | 'Urgent' | 'High' | 'Normal' | 'Low';
    addWatchers?: string[];
    changeStatus?: string;
  };
}

interface AddEscalationMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  mode: 'create' | 'edit';
}

/**
 * AddEscalationMatrixModal Component
 * Modal for creating/editing escalation matrix configurations
 */
export const AddEscalationMatrixModal: React.FC<AddEscalationMatrixModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  mode
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    projectId: '',
    slaRuleIds: [] as string[],
  });

  const [levels, setLevels] = useState<EscalationLevel[]>([
    {
      level: 1,
      escalateAfter: { value: 30, unit: 'minutes' as const },
      escalateTo: { type: 'role' as const, targetId: '', targetName: '' },
      notifyMethod: ['email'] as ('email' | 'sms' | 'push')[],
    },
  ]);

  const [projects, setProjects] = useState<any[]>([]);
  const [slaRules, setSlaRules] = useState<any[]>([]);
  const [allSlaRules, setAllSlaRules] = useState<any[]>([]); // Store all SLA rules
  const [roles, setRoles] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      fetchSLARules();
      fetchRoles();
    }
  }, [isOpen]);

  // Filter SLA rules when project changes
  useEffect(() => {
    if (formData.projectId) {
      console.log('Filtering SLA rules for project:', formData.projectId);
      console.log('All SLA rules:', allSlaRules);
      
      const filtered = allSlaRules.filter(sla => {
        console.log('Checking SLA rule:', sla.name, 'projectIds:', sla.projectIds);
        
        if (!sla.projectIds || !Array.isArray(sla.projectIds)) {
          console.log('  - No projectIds array found');
          return false;
        }
        
        const hasMatch = sla.projectIds.some((pid: any) => {
          const pidString = typeof pid === 'object' ? (pid._id || pid.toString()) : pid.toString();
          const formProjectIdString = formData.projectId.toString();
          console.log(`  - Comparing: ${pidString} === ${formProjectIdString}`);
          return pidString === formProjectIdString;
        });
        
        console.log('  - Match:', hasMatch);
        return hasMatch;
      });
      
      setSlaRules(filtered);
      console.log(`✅ Filtered ${filtered.length} SLA rules for project ${formData.projectId}`);
    } else {
      setSlaRules([]);
    }
  }, [formData.projectId, allSlaRules]);

  useEffect(() => {
    if (initialData && mode === 'edit') {
      // Extract project ID
      let projectId = '';
      if (initialData.projectId) {
        projectId = typeof initialData.projectId === 'object' ? initialData.projectId._id : initialData.projectId;
      } else if (initialData.projectIds && initialData.projectIds.length > 0) {
        const firstProject = initialData.projectIds[0];
        projectId = typeof firstProject === 'object' ? firstProject._id : firstProject;
      }

      // Extract SLA rule IDs from populated or unpopulated slaRuleIds
      let slaRuleIdArray: string[] = [];
      if (initialData.slaRuleIds && Array.isArray(initialData.slaRuleIds)) {
        slaRuleIdArray = initialData.slaRuleIds.map((s: any) => 
          typeof s === 'object' && s._id ? s._id : s
        );
      }

      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        isActive: initialData.isActive !== undefined ? initialData.isActive : true,
        projectId: projectId,
        slaRuleIds: slaRuleIdArray,
      });
      if (initialData.levels) {
        setLevels(initialData.levels);
      }
    }
  }, [initialData, mode]);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/projects`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Projects API response:', data);
        if (data.success && data.data && Array.isArray(data.data.projects)) {
          setProjects(data.data.projects);
          console.log('Loaded projects:', data.data.projects.length);
        } else if (data.success && Array.isArray(data.data)) {
          setProjects(data.data);
        } else if (Array.isArray(data)) {
          setProjects(data);
        } else {
          setProjects([]);
        }
      } else {
        console.error('Failed to fetch projects:', response.status, response.statusText);
        setProjects([]);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      setProjects([]);
    }
  };

  const fetchSLARules = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/sla-rules`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        console.log('SLA Rules API response:', data);
        if (data.success && Array.isArray(data.data)) {
          setAllSlaRules(data.data);
          console.log('✅ Loaded all SLA rules:', data.data.length);
          console.log('📋 SLA rules details:');
          data.data.forEach((sla: any) => {
            const projectNames = sla.projectIds?.map((p: any) => 
              typeof p === 'object' ? `${p.name} (${p._id})` : p
            ).join(', ') || 'No projects';
            console.log(`  - ${sla.name} [${sla.priority || 'No priority'}] → Projects: ${projectNames}`);
          });
        } else if (Array.isArray(data)) {
          setAllSlaRules(data);
        } else {
          setAllSlaRules([]);
        }
      } else {
        console.error('Failed to fetch SLA rules:', response.status, response.statusText);
        setAllSlaRules([]);
      }
    } catch (error) {
      console.error('Error fetching SLA rules:', error);
      setAllSlaRules([]);
    }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('authToken');
      // Try master role list first, then fall back to other role endpoints
      const endpoints = [
        '/roles/master/list',
        '/rbac/roles',
        '/roles'
      ];

      let rolesResult: any[] = [];

      for (const ep of endpoints) {
        try {
          const res = await fetch(`${API_CONFIG.BASE_URL}/api${ep}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            credentials: 'include',
          });

            if (!res.ok) {
              console.log(`Endpoint ${ep} failed with status ${res.status}`);
              continue;
            }

            const payload = await res.json();

            // possible shapes: { success: true, data: [...] } or { data: { roles: [...] } } or [...]
            let list: any[] = [];
            if (payload) {
              if (Array.isArray(payload.data)) list = payload.data;
              else if (payload.data && Array.isArray(payload.data.roles)) list = payload.data.roles;
              else if (Array.isArray(payload)) list = payload;
            }

            console.log(`Roles from ${ep}:`, list.length, 'roles');
            if (list.length > 0) {
              rolesResult = list;
              break;
            }
        } catch (innerErr) {
          // try next endpoint
          console.error(`Error fetching from ${ep}:`, innerErr);
          continue;
        }
      }

      // Normalize role objects to {_id, name}
      const normalized = rolesResult.map(r => ({
        _id: r._id || r.id || r._id?.toString?.() || r.id?.toString?.(),
        name: r.name || r.title || r.displayName || r.code || '',
      })).filter(r => r._id && r.name);

      console.log('Normalized roles:', normalized.length);
      setRoles(normalized);
    } catch (error) {
      console.error('Error fetching roles:', error);
      setRoles([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setRoles(data.data);
        } else if (Array.isArray(data)) {
          setRoles(data);
        } else {
          setRoles([]);
        }
      } else {
        setRoles([]);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      setRoles([]);
    }
  };

  const handleAddLevel = () => {
    const newLevel: EscalationLevel = {
      level: levels.length + 1,
      escalateAfter: { value: 60, unit: 'minutes' },
      escalateTo: { type: 'role', targetId: '', targetName: '' },
      notifyMethod: ['email'],
    };
    setLevels([...levels, newLevel]);
  };

  const handleRemoveLevel = (index: number) => {
    if (levels.length > 1) {
      const updatedLevels = levels.filter((_, i) => i !== index);
      // Renumber levels
      updatedLevels.forEach((level, i) => {
        level.level = i + 1;
      });
      setLevels(updatedLevels);
    }
  };

  const handleLevelChange = (index: number, field: string, value: any) => {
    const updatedLevels = [...levels];
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      updatedLevels[index] = {
        ...updatedLevels[index],
        [parent]: {
          ...(updatedLevels[index] as any)[parent],
          [child]: value,
        },
      };
    } else {
      updatedLevels[index] = {
        ...updatedLevels[index],
        [field]: value,
      };
    }
    setLevels(updatedLevels);
  };

  const handleRoleChange = (index: number, roleId: string) => {
    const selectedRole = roles.find(r => r._id === roleId);
    if (selectedRole) {
      const updatedLevels = [...levels];
      updatedLevels[index] = {
        ...updatedLevels[index],
        escalateTo: {
          type: 'role',
          targetId: selectedRole._id,
          targetName: selectedRole.name,
        },
      };
      setLevels(updatedLevels);
    }
  };

  const handleNotifyMethodToggle = (index: number, method: 'email' | 'sms' | 'push') => {
    const updatedLevels = [...levels];
    const currentMethods = updatedLevels[index].notifyMethod;
    
    if (currentMethods.includes(method)) {
      updatedLevels[index].notifyMethod = currentMethods.filter(m => m !== method);
    } else {
      updatedLevels[index].notifyMethod = [...currentMethods, method];
    }
    
    setLevels(updatedLevels);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    if (!formData.name.trim()) {
      alert('Please enter a policy name');
      return;
    }

    if (!formData.projectId) {
      alert('Please select a project');
      return;
    }

    if (!formData.slaRuleIds || formData.slaRuleIds.length === 0) {
      alert('Please map at least one SLA rule to this escalation policy');
      return;
    }

    if (levels.length === 0) {
      alert('Please add at least one escalation level');
      return;
    }

    for (let i = 0; i < levels.length; i++) {
      if (!levels[i].escalateTo.targetName.trim()) {
        alert(`Please enter escalate to target for Level ${i + 1}`);
        return;
      }
      if (levels[i].notifyMethod.length === 0) {
        alert(`Please select at least one notification method for Level ${i + 1}`);
        return;
      }
    }

    const policyData = {
      ...formData,
      levels,
    };

    onSave(policyData);
  };

  const handleReset = () => {
    setFormData({
      name: '',
      description: '',
      isActive: true,
      projectId: '',
      slaRuleIds: [],
    });
    setLevels([
      {
        level: 1,
        escalateAfter: { value: 30, unit: 'minutes' },
        escalateTo: { type: 'role', targetId: '', targetName: '' },
        notifyMethod: ['email'],
      },
    ]);
  };

  if (!isOpen) return null;

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '0',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
            {mode === 'edit' ? 'Edit Escalation Policy' : 'Create Escalation Policy'}
          </h2>
          <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
            Configure escalation rules for SLA breaches
          </p>
        </div>

        {/* Form Content - Scrollable */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ 
            padding: '24px',
            overflowY: 'auto',
            flex: 1,
          }}>
            {/* Basic Information */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
                Basic Information
              </h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Policy Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Critical Issue Escalation"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this escalation policy"
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                  Active
                </label>
              </div>

              {/* Project Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Select Project <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6b7280' }}>
                  Choose the project for this escalation policy. SLA rules will be filtered based on your selection.
                </p>
                <select
                  required
                  value={formData.projectId}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      projectId: e.target.value,
                      slaRuleIds: [] // Reset SLA selection when project changes
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'white',
                  }}
                >
                  <option value="">-- Select a project --</option>
                  {projects.map((project) => (
                    <option key={project._id} value={project._id}>
                      {project.name} ({project.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* SLA Rules Mapping */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Map to SLA Rules <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6b7280' }}>
                  Select SLA rules that will trigger this escalation policy when breached
                </p>
                <div style={{ 
                  border: '1px solid #d1d5db', 
                  borderRadius: '6px', 
                  padding: '12px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  backgroundColor: '#f9fafb',
                }}>
                  {!formData.projectId ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#f59e0b', backgroundColor: '#fef3c7', padding: '12px', borderRadius: '4px' }}>
                      ⚠️ Please select a project first to see available SLA rules
                    </p>
                  ) : !Array.isArray(slaRules) || slaRules.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                      No SLA rules found for this project. Please create SLA rules for this project first.
                    </p>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#059669', fontWeight: 500 }}>
                        ✓ Found {slaRules.length} SLA rule{slaRules.length !== 1 ? 's' : ''} for this project
                      </p>
                      {slaRules.map((slaRule) => (
                      <label
                        key={slaRule._id}
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
                          checked={formData.slaRuleIds.includes(slaRule._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                slaRuleIds: [...formData.slaRuleIds, slaRule._id],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                slaRuleIds: formData.slaRuleIds.filter(id => id !== slaRule._id),
                              });
                            }
                          }}
                          style={{ marginRight: '8px', width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '13px', color: '#374151' }}>
                          {slaRule.name} 
                          {slaRule.priority && <span style={{ color: '#6b7280' }}> - {slaRule.priority} Priority</span>}
                          <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '8px' }}>
                            (Response: {slaRule.responseTime?.value}{slaRule.responseTime?.unit?.[0]}, 
                            Resolution: {slaRule.resolutionTime?.value}{slaRule.resolutionTime?.unit?.[0]})
                          </span>
                        </span>
                      </label>
                    ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Escalation Levels */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                  Escalation Levels
                </h3>
                <button
                  type="button"
                  onClick={handleAddLevel}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    color: '#374151',
                  }}
                >
                  + Add Level
                </button>
              </div>

              {levels.map((level, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#374151',
                    }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#f97316',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 600,
                      }}>
                        L{level.level}
                      </div>
                      Level {level.level}
                    </div>
                    {levels.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLevel(index)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#fee2e2',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#dc2626',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    {/* Escalate After */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                        Escalate After <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          required
                          min="1"
                          value={level.escalateAfter.value}
                          onChange={(e) => handleLevelChange(index, 'escalateAfter.value', parseInt(e.target.value))}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                          }}
                        />
                        <select
                          value={level.escalateAfter.unit}
                          onChange={(e) => handleLevelChange(index, 'escalateAfter.unit', e.target.value)}
                          style={{
                            width: '100px',
                            padding: '8px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                          }}
                        >
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      </div>
                    </div>

                    {/* Escalate To Type */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                        Escalate To Type
                      </label>
                      <select
                        value={level.escalateTo.type}
                        onChange={(e) => handleLevelChange(index, 'escalateTo.type', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '13px',
                        }}
                      >
                        <option value="user">User</option>
                        <option value="group">Group</option>
                        <option value="role">Role</option>
                      </select>
                    </div>
                  </div>

                  {/* Escalate To Target */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                      {level.escalateTo.type === 'user' ? 'User Name' : level.escalateTo.type === 'group' ? 'Group Name' : 'Role'} <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    {level.escalateTo.type === 'role' ? (
                      <select
                        required
                        value={level.escalateTo.targetId}
                        onChange={(e) => handleRoleChange(index, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '13px',
                        }}
                      >
                        <option value="">Select a role</option>
                        {roles.map((role) => (
                          <option key={role._id} value={role._id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={level.escalateTo.targetName}
                        onChange={(e) => handleLevelChange(index, 'escalateTo.targetName', e.target.value)}
                        placeholder={`Enter ${level.escalateTo.type} name`}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '13px',
                        }}
                      />
                    )}
                  </div>

                  {/* Notification Methods */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                      Notification Methods <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {(['email', 'sms', 'push'] as const).map(method => (
                        <label
                          key={method}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={level.notifyMethod.includes(method)}
                            onChange={() => handleNotifyMethodToggle(index, method)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          {method.charAt(0).toUpperCase() + method.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer - Fixed */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}>
            <button
              type="button"
              onClick={() => {
                onClose();
                handleReset();
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                backgroundColor: '#7c3aed',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: 'white',
              }}
            >
              {mode === 'edit' ? 'Update Policy' : 'Create Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEscalationMatrixModal;
