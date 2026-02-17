import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import ModuleHeader from '../components/ModuleHeader';
import { API_CONFIG } from '../config/constants';
import AddEscalationMatrixModal from '../components/AddEscalationMatrixModal';
import {
  getAllEscalationMatrices,
  createEscalationMatrix,
  updateEscalationMatrix,
  deleteEscalationMatrix,
  toggleEscalationMatrixStatus,
} from '../services/escalationMatrixService';
import type {
  EscalationMatrix,
  EscalationLevel,
  EscalationMode,
  EscalationMatrixFormData,
  EscalationLevelFormData,
  SlaUnit,
} from '../types/escalationMatrix';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUpIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

interface Role {
  _id: string;
  name: string;
  code: string;
}

interface Project {
  _id: string;
  name: string;
  code?: string;
}

/**
 * EscalationMatrixConfigPage
 * Super Admin page for managing escalation matrices
 */
const EscalationMatrixConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const [matrices, setMatrices] = useState<EscalationMatrix[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMatrix, setEditingMatrix] = useState<EscalationMatrix | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchMatrices();
  }, []);

  const fetchMatrices = async () => {
    try {
      setLoading(true);
      const response = await getAllEscalationMatrices();
      if (response.success && response.data) {
        setMatrices(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching matrices:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };



  const openCreateModal = () => {
    setEditingMatrix(null);
    setShowModal(true);
  };

  const openEditModal = (matrix: EscalationMatrix) => {
    setEditingMatrix(matrix);
    setShowModal(true);
  };

  const handleModalSave = async (formData: any) => {
    try {
      setError(null);
      let response;
      
      if (editingMatrix?._id) {
        console.log('📤 [ConfigPage] Updating matrix with ID:', editingMatrix._id);
        response = await updateEscalationMatrix(editingMatrix._id, formData);
      } else {
        console.log('📤 [ConfigPage] Creating new matrix');
        response = await createEscalationMatrix(formData);
      }

      if (response.success) {
        setShowModal(false);
        fetchMatrices();
      } else {
        setError(response.message || 'Failed to save matrix');
        throw new Error(response.message || 'Failed to save matrix');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const handleDelete = async (matrix: EscalationMatrix) => {
    if (!matrix._id) return;
    
    if (!confirm(`Are you sure you want to delete "${matrix.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await deleteEscalationMatrix(matrix._id);
      if (response.success) {
        fetchMatrices();
      } else {
        setError(response.message || 'Failed to delete matrix');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (matrix: EscalationMatrix) => {
    if (!matrix._id) return;

    try {
      const response = await toggleEscalationMatrixStatus(matrix._id);
      if (response.success) {
        fetchMatrices();
      } else {
        setError(response.message || 'Failed to toggle status');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };



  return (
    <DashboardLayout>
      <div className="p-6">
        <ModuleHeader
          title="Priority & Escalation Management"
          subtitle="Define priority levels with SLA response and resolution times"
        />

        {/* Tab Navigation - Consistent with SLARulesPage */}
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
            Priority
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
          <button
            onClick={() => navigate('/working-calendars')}
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
            Working Calendar
          </button>
        </div>

        {/* Header Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={fetchMatrices}
              className="flex items-center px-3 py-2 text-gray-600 hover:text-gray-900"
              title="Refresh"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <PlusIcon className="w-5 h-5 mr-2" />
            Create Matrix
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}

        {/* Matrices List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : matrices.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <ArrowsRightLeftIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Escalation Matrices</h3>
            <p className="text-gray-500 mb-4">Create your first escalation matrix to get started.</p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Create Matrix
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Matrix Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Levels
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {matrices.map((matrix) => (
                  <React.Fragment key={matrix._id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <button
                            onClick={() => matrix._id && toggleRowExpansion(matrix._id)}
                            className="mr-2 text-gray-400 hover:text-gray-600"
                          >
                            {matrix._id && expandedRows.has(matrix._id) ? (
                              <ChevronUpIcon className="w-5 h-5" />
                            ) : (
                              <ChevronDownIcon className="w-5 h-5" />
                            )}
                          </button>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{matrix.name}</div>
                            {matrix.description && (
                              <div className="text-sm text-gray-500">{matrix.description}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            matrix.escalationMode === 'SEQUENTIAL'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {matrix.escalationMode === 'SEQUENTIAL' ? (
                            <>
                              <ArrowUpIcon className="w-3 h-3 mr-1" />
                              Sequential
                            </>
                          ) : (
                            <>
                              <ArrowsRightLeftIcon className="w-3 h-3 mr-1" />
                              Random
                            </>
                          )}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                          {matrix.autoEscalate && <span className="mr-2 text-amber-600">Auto ✓</span>}
                          {matrix.escalationMode === 'RANDOM' && matrix.allowSkipLevel && <span className="mr-2">Skip ✓</span>}
                          {matrix.allowBackward && <span>Back ✓</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{matrix.levels.length} levels</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(matrix)}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            matrix.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {matrix.isActive ? (
                            <>
                              <CheckCircleIcon className="w-3 h-3 mr-1" />
                              Active
                            </>
                          ) : (
                            <>
                              <XCircleIcon className="w-3 h-3 mr-1" />
                              Inactive
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => openEditModal(matrix)}
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(matrix)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                    {/* Expanded Row - Level Details */}
                    {matrix._id && expandedRows.has(matrix._id) && (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 bg-gray-50">
                          <div className="ml-8">
                            <h4 className="text-sm font-medium text-gray-900 mb-3">Escalation Levels</h4>
                            <div className="space-y-2">
                              {matrix.levels
                                .sort((a, b) => a.levelNumber - b.levelNumber)
                                .map((level, idx) => (
                                  <div
                                    key={level._id || idx}
                                    className="flex items-center bg-white p-3 rounded-lg border"
                                  >
                                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium">
                                      {level.levelNumber}
                                    </div>
                                    <div className="ml-4 flex-grow">
                                      <div className="text-sm font-medium text-gray-900">
                                        {level.levelName}
                                      </div>
                                      <div className="text-sm text-gray-500">
                                        Role: {typeof level.roleId === 'object' ? (level.roleId as any).name : 'Unknown'}
                                        {' | '}
                                        SLA: {level.slaHours}{(level as any).slaUnit === 'mins' ? 'm' : (level as any).slaUnit === 'days' ? 'd' : 'h'}
                                      </div>
                                    </div>
                                    <div
                                      className={`text-xs px-2 py-1 rounded ${
                                        level.isActive
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-gray-100 text-gray-500'
                                      }`}
                                    >
                                      {level.isActive ? 'Active' : 'Inactive'}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal - Enhanced with Priority Configuration */}
      <AddEscalationMatrixModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleModalSave}
        initialData={editingMatrix}
        mode={editingMatrix ? 'edit' : 'create'}
      />
    </DashboardLayout>
  );
};

export default EscalationMatrixConfigPage;
