import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import { AddEscalationMatrixModal } from '../components/AddEscalationMatrixModal';
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
    changePriority?: 'Urgent' | 'High' | 'Normal' | 'Low';
    addWatchers?: string[];
    changeStatus?: string;
  };
}

interface EscalationPolicy {
  _id?: string;
  policyId: string;
  name: string;
  description?: string;
  levels: EscalationLevel[];
  isActive: boolean;
  projectId?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const EscalationMatrixPage: React.FC = () => {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<EscalationPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMatrix, setEditingMatrix] = useState<any>(null);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      console.log('Fetching escalation policies with token:', token ? 'Token exists' : 'No token');
      
      const response = await fetch(`${API_CONFIG.API_URL}/escalation-policies`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      console.log('Escalation policies response status:', response.status);
      console.log('Response ok:', response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log('Escalation policies data received:', data);
        if (data.success && data.data) {
          setPolicies(data.data);
          console.log('Escalation policies set:', data.data.length, 'policies');
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to fetch escalation policies:', response.status, errorData);
      }
    } catch (error) {
      console.error('Error fetching escalation policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePolicy = async (policy: EscalationPolicy) => {
    if (confirm(`Are you sure you want to delete "${policy.name}"?`)) {
      try {
        const token = localStorage.getItem('authToken');
        const policyId = policy._id || policy.policyId;
        const response = await fetch(`${API_CONFIG.API_URL}/escalation-policies/${policyId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          alert('Escalation policy deleted successfully!');
          fetchPolicies();
        } else {
          alert('Failed to delete policy');
        }
      } catch (error) {
        console.error('Error deleting policy:', error);
        alert('Error deleting policy');
      }
    }
  };

  const handleToggleStatus = async (policy: EscalationPolicy) => {
    try {
      const token = localStorage.getItem('authToken');
      const policyId = policy._id || policy.policyId;
      const response = await fetch(`${API_CONFIG.API_URL}/escalation-policies/${policyId}/toggle-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        fetchPolicies();
      } else {
        alert('Failed to toggle policy status');
      }
    } catch (error) {
      console.error('Error toggling policy status:', error);
      alert('Error toggling policy status');
    }
  };

  const handleSaveMatrix = async (matrixData: any) => {
    try {
      const token = localStorage.getItem('authToken');
      
      // Convert projectId (singular) to projectIds (plural array) for API
      const projectIdsArray = matrixData.projectId 
        ? [matrixData.projectId] 
        : (matrixData.projectIds || []);
      
      const apiData = {
        name: matrixData.name,
        description: matrixData.description || '',
        levels: matrixData.levels,
        isActive: matrixData.isActive !== undefined ? matrixData.isActive : true,
        projectIds: projectIdsArray,
        slaRuleIds: matrixData.slaRuleIds || [],
        createdBy: 'Admin', // TODO: Get from authenticated user
      };

      console.log('📤 Sending escalation policy data:', apiData);
      console.log('  Project ID from form:', matrixData.projectId);
      console.log('  Project IDs array:', projectIdsArray);

      const isEdit = editingMatrix && editingMatrix._id;
      const url = isEdit 
        ? `${API_CONFIG.API_URL}/escalation-policies/${editingMatrix._id}`
        : `${API_CONFIG.API_URL}/escalation-policies`;
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(apiData),
      });

      if (response.ok) {
        alert(`Escalation policy ${isEdit ? 'updated' : 'created'} successfully!`);
        setShowCreateModal(false);
        setEditingMatrix(null);
        fetchPolicies();
      } else {
        const error = await response.json().catch(() => ({ message: 'Failed to save' }));
        alert(`Failed to ${isEdit ? 'update' : 'create'} escalation policy: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving escalation policy:', error);
      alert('Error saving escalation policy');
    }
  };

  const formatTime = (time: { value: number; unit: string }) => {
    return `${time.value} ${time.unit}`;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div>Loading escalation policies...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header with Tab Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
            SLA & Escalation Management
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
            onClick={() => navigate('/sla')}
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
            SLA Rules
          </button>
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
            Escalation Matrix
          </button>
        </div>

        <ModuleHeader 
          title="Escalation Matrix"
          subtitle="Configure escalation policies for SLA breaches"
        />

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}>
          <div></div>
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
            Add Escalation Policy
          </button>
        </div>

        {/* Create Escalation Matrix Modal */}
        <AddEscalationMatrixModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditingMatrix(null);
          }}
          onSave={handleSaveMatrix}
          initialData={editingMatrix}
          mode={editingMatrix ? 'edit' : 'create'}
        />

        {/* Escalation Policies */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {policies.map((policy) => (
            <div
              key={policy._id || policy.policyId}
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
              }}
            >
              {/* Policy Header */}
              <div style={{
                padding: '24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                    {policy.name}
                  </h3>
                  {policy.description && (
                    <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                      {policy.description}
                    </p>
                  )}
                  {/* Mapped Projects */}
                  {(policy as any).projectIds && Array.isArray((policy as any).projectIds) && (policy as any).projectIds.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Projects:</span>
                      {(policy as any).projectIds.slice(0, 3).map((projectId: any) => (
                        <span
                          key={typeof projectId === 'object' ? projectId._id : projectId}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            background: '#dbeafe',
                            color: '#1e40af',
                            fontWeight: 500,
                          }}
                        >
                          {typeof projectId === 'object' && projectId.name ? projectId.name : 'Project'}
                        </span>
                      ))}
                      {(policy as any).projectIds.length > 3 && (
                        <span style={{ fontSize: '11px', color: '#6b7280' }}>
                          +{(policy as any).projectIds.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setEditingMatrix(policy);
                      setShowCreateModal(true);
                    }}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #7c3aed',
                      borderRadius: '6px',
                      backgroundColor: 'transparent',
                      color: '#7c3aed',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(policy)}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: policy.isActive ? '#dcfce7' : '#f3f4f6',
                      color: policy.isActive ? '#166534' : '#6b7280',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {policy.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => handleDeletePolicy(policy)}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #dc2626',
                      borderRadius: '6px',
                      backgroundColor: 'transparent',
                      color: '#dc2626',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Escalation Levels */}
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {policy.levels.map((level) => (
                    <div
                      key={level.level}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '16px',
                        background: '#f9fafb',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      {/* Level Badge */}
                      <div style={{
                        minWidth: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: '#f97316',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        fontWeight: 600,
                        marginRight: '16px',
                      }}>
                        L{level.level}
                      </div>

                      {/* Level Details */}
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                            Escalate After
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 500 }}>
                            ⏱️ {formatTime(level.escalateAfter)}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                            Escalate To
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 500 }}>
                            👤 {level.escalateTo.targetName}
                            <span style={{
                              marginLeft: '8px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              background: '#dbeafe',
                              color: '#1e40af',
                            }}>
                              {level.escalateTo.type}
                            </span>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                            Notification Method
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 500, display: 'flex', gap: '4px' }}>
                            {level.notifyMethod.map(method => (
                              <span
                                key={method}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  background: '#fef3c7',
                                  color: '#92400e',
                                }}
                              >
                                {method}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      {level.actions && (
                        <div style={{
                          marginLeft: '16px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: '#dcfce7',
                          fontSize: '12px',
                          color: '#166534',
                        }}>
                          {level.actions.changePriority && (
                            <div>↗️ Priority → {level.actions.changePriority}</div>
                          )}
                          {level.actions.changeStatus && (
                            <div>🔄 Status → {level.actions.changeStatus}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {policies.length === 0 && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '60px 20px',
            textAlign: 'center',
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔔</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
              No Escalation Policies Found
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
              Create escalation policies to automatically escalate tickets on SLA breach
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
              Create Escalation Policy
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EscalationMatrixPage;
