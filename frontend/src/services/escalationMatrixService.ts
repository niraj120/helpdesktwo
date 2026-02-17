/**
 * Escalation Matrix API Service
 * Handles all API calls related to the Escalation Matrix system
 */

import { API_CONFIG } from '../config/constants';
import type {
  EscalationMatrix,
  EscalationMatrixFormData,
  AllowedEscalationLevel,
  EscalateTicketRequest,
  EscalateTicketResponse,
  ApiResponse,
  EscalationLevelUser,
} from '../types/escalationMatrix';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

/**
 * Get all escalation matrices
 */
export const getAllEscalationMatrices = async (
  params?: { projectId?: string; isActive?: boolean }
): Promise<ApiResponse<EscalationMatrix[]>> => {
  try {
    const queryParams = new URLSearchParams();
    if (params?.projectId) queryParams.append('projectId', params.projectId);
    if (params?.isActive !== undefined) queryParams.append('isActive', String(params.isActive));
    
    const url = `${API_CONFIG.API_URL}/escalation-matrix${queryParams.toString() ? `?${queryParams}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error fetching escalation matrices:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Get single escalation matrix by ID
 */
export const getEscalationMatrixById = async (id: string): Promise<ApiResponse<EscalationMatrix>> => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/escalation-matrix/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error fetching escalation matrix:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Create new escalation matrix
 */
export const createEscalationMatrix = async (
  data: EscalationMatrixFormData
): Promise<ApiResponse<EscalationMatrix>> => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/escalation-matrix`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error creating escalation matrix:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Update escalation matrix
 */
export const updateEscalationMatrix = async (
  id: string,
  data: Partial<EscalationMatrixFormData>
): Promise<ApiResponse<EscalationMatrix>> => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/escalation-matrix/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error updating escalation matrix:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Delete escalation matrix
 */
export const deleteEscalationMatrix = async (id: string): Promise<ApiResponse<void>> => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/escalation-matrix/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error deleting escalation matrix:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Toggle escalation matrix status
 */
export const toggleEscalationMatrixStatus = async (id: string): Promise<ApiResponse<EscalationMatrix>> => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/escalation-matrix/${id}/toggle-status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error toggling escalation matrix status:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Get users for a specific escalation level
 */
export const getUsersForLevel = async (
  matrixId: string,
  levelId: string,
  projectId?: string
): Promise<ApiResponse<EscalationLevelUser[]>> => {
  try {
    const queryParams = projectId ? `?projectId=${projectId}` : '';
    const response = await fetch(
      `${API_CONFIG.API_URL}/escalation-matrix/${matrixId}/levels/${levelId}/users${queryParams}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );
    
    return await response.json();
  } catch (error: any) {
    console.error('Error fetching users for level:', error);
    return { success: false, message: error.message };
  }
};

// ============================================================
// Ticket-related Escalation APIs
// ============================================================

/**
 * Get allowed escalation levels for a ticket
 */
export const getAllowedEscalations = async (
  ticketId: string
): Promise<ApiResponse<AllowedEscalationLevel[]>> => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/tickets/${ticketId}/allowed-escalations`, {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error fetching allowed escalations:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Escalate ticket using matrix rules
 */
export const escalateTicketWithMatrix = async (
  ticketId: string,
  request: EscalateTicketRequest
): Promise<EscalateTicketResponse> => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/tickets/${ticketId}/matrix-escalate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(request),
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error escalating ticket:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Assign escalation matrix to a ticket
 */
export const assignMatrixToTicket = async (
  ticketId: string,
  matrixId: string,
  startAtLevel?: number
): Promise<ApiResponse<void>> => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/tickets/${ticketId}/assign-matrix`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ matrixId, startAtLevel }),
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('Error assigning matrix to ticket:', error);
    return { success: false, message: error.message };
  }
};

export default {
  getAllEscalationMatrices,
  getEscalationMatrixById,
  createEscalationMatrix,
  updateEscalationMatrix,
  deleteEscalationMatrix,
  toggleEscalationMatrixStatus,
  getUsersForLevel,
  getAllowedEscalations,
  escalateTicketWithMatrix,
  assignMatrixToTicket,
};
