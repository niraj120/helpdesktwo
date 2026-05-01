import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowsRightLeftIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import {
  getAllowedEscalations,
  escalateTicketWithMatrix,
} from '../services/escalationMatrixService';
import type { AllowedEscalationLevel } from '../types/escalationMatrix';

interface EscalationMatrixCardProps {
  ticketId: string;
  currentLevelNumber?: number;
  matrixName?: string;
  onEscalationComplete?: () => void;
  permissions: string[];
  projectSlug?: string; // For navigation after escalation
}

/**
 * EscalationMatrixCard Component
 * 
 * Displays escalation options based on the escalation matrix assigned to the ticket.
 * Uses level-based routing instead of role-based routing.
 * 
 * Features:
 * - Fetches allowed escalation levels dynamically
 * - Shows Sequential/Random mode behavior
 * - Validates escalation on backend before executing
 */
const EscalationMatrixCard: React.FC<EscalationMatrixCardProps> = ({
  ticketId,
  currentLevelNumber = 0,
  matrixName,
  onEscalationComplete,
  permissions,
  projectSlug,
}) => {
  const navigate = useNavigate();
  const [allowedLevels, setAllowedLevels] = useState<AllowedEscalationLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchSucceeded, setFetchSucceeded] = useState(false); // true only when API returned success
  const [isEscalating, setIsEscalating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(''); // For selecting specific user when multiple available
  const [escalationReason, setEscalationReason] = useState('');

  // Get the selected level's users for user dropdown
  const selectedLevel = allowedLevels.find(l => l.levelId === selectedLevelId);
  const hasMultipleUsers = selectedLevel?.users && selectedLevel.users.length > 1;

  // Check if user has escalation permission
  const hasEscalatePermission = permissions.includes('TICKET_ESCALATE');

  useEffect(() => {
    if (ticketId && hasEscalatePermission) {
      fetchAllowedLevels();
    }
  }, [ticketId, hasEscalatePermission]);

  const fetchAllowedLevels = async () => {
    try {
      setLoading(true);
      setError(null);
      setFetchSucceeded(false);
      
      const response = await getAllowedEscalations(ticketId);
      
      if (response.success && response.data) {
        setAllowedLevels(response.data);
        setFetchSucceeded(true);
      } else {
        // API returned success:false — show the error message instead of 'highest level'
        setAllowedLevels([]);
        setFetchSucceeded(false);
        if (response.message) {
          setError(response.message);
        }
      }
    } catch (err: any) {
      console.error('Error fetching allowed escalations:', err);
      setError(err.message);
      setFetchSucceeded(false);
    } finally {
      setLoading(false);
    }
  };;

  const handleEscalate = async () => {
    if (!selectedLevelId || !escalationReason.trim()) {
      setError('Please select a level and provide a reason');
      return;
    }
    
    // Validate user selection when multiple users are available
    if (hasMultipleUsers && !selectedUserId) {
      setError('Please select a user to assign the ticket to');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await escalateTicketWithMatrix(ticketId, {
        targetLevelId: selectedLevelId,
        reason: escalationReason,
        targetUserId: selectedUserId || undefined, // Include selected user if available
      });

      if (response.success) {
        setSuccess(response.message || 'Ticket escalated successfully');
        setIsEscalating(false);
        setSelectedLevelId('');
        setSelectedUserId('');
        setEscalationReason('');
        
        // Notify parent component
        if (onEscalationComplete) {
          onEscalationComplete();
        }

        // Navigate back to My Queries after a short delay (ticket is now assigned to someone else)
        setTimeout(() => {
          if (projectSlug) {
            navigate(`/${projectSlug}/portal/tickets/my-tickets`);
          } else {
            // Fallback: go back
            navigate(-1);
          }
        }, 1500);
      } else {
        setError(response.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelEscalation = () => {
    setIsEscalating(false);
    setSelectedLevelId('');
    setSelectedUserId('');
    setEscalationReason('');
    setError(null);
  };

  // Don't render if user doesn't have permission
  if (!hasEscalatePermission) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Escalate Query</h3>
        {/* Matrix name badge hidden as per user request */}
      </div>

      {/* Current Level Display */}
      {currentLevelNumber > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-medium">
              {currentLevelNumber}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-blue-900">Current Escalation Level</p>
              <p className="text-xs text-blue-700">Level {currentLevelNumber}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <CheckCircleIcon className="w-5 h-5 text-green-500 mr-2" />
          <span className="text-sm text-green-700">{success}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
        </div>
      ) : isEscalating ? (
        <div className="space-y-4">
          {/* Level Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Escalate To ({allowedLevels.length} level{allowedLevels.length !== 1 ? 's' : ''} available)
            </label>
            {allowedLevels.length === 0 ? (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500 flex items-center">
                  <InformationCircleIcon className="w-5 h-5 mr-2" />
                  No escalation levels available. This ticket may be at the highest level or no matrix is assigned.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {allowedLevels.map((level) => (
                  <label
                    key={level.levelId}
                    className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedLevelId === level.levelId
                        ? level.isDeEscalation 
                          ? 'border-amber-500 bg-amber-50' 
                          : 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="escalationLevel"
                      value={level.levelId}
                      checked={selectedLevelId === level.levelId}
                      onChange={(e) => {
                        setSelectedLevelId(e.target.value);
                        // Auto-select user if only one available, or clear if multiple
                        const selectedLvl = allowedLevels.find(l => l.levelId === e.target.value);
                        if (selectedLvl?.users?.length === 1) {
                          setSelectedUserId(selectedLvl.users[0]._id);
                        } else if (selectedLvl?.previousHandlerId) {
                          // For de-escalation, auto-select previous handler
                          setSelectedUserId(selectedLvl.previousHandlerId);
                        } else {
                          setSelectedUserId('');
                        }
                      }}
                      className="sr-only"
                    />
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                      level.isDeEscalation 
                        ? 'bg-amber-100 text-amber-600' 
                        : 'bg-indigo-100 text-indigo-600'
                    }`}>
                      {level.levelNumber}
                    </div>
                    <div className="ml-3 flex-grow">
                      <p className="text-sm font-medium text-gray-900">
                        {level.levelName}
                        {level.isDeEscalation && (
                          <span className="ml-2 text-xs text-amber-600 font-normal">(Return to previous handler)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {level.previousHandlerName ? (
                          // For de-escalation, show only the previous handler
                          <span className="mr-2">{level.previousHandlerName} - {level.roleName}</span>
                        ) : level.userNames && level.userNames.length > 0 ? (
                          <span className="mr-2">{level.userNames.join(', ')} - {level.roleName}</span>
                        ) : (
                          level.roleName && <span className="mr-2">Role: {level.roleName}</span>
                        )}
                        <span>SLA: {level.slaHours}{level.slaUnit === 'mins' ? 'm' : level.slaUnit === 'days' ? 'd' : 'h'}</span>
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 ${
                        selectedLevelId === level.levelId
                          ? level.isDeEscalation
                            ? 'border-amber-500 bg-amber-500'
                            : 'border-indigo-500 bg-indigo-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedLevelId === level.levelId && (
                        <CheckCircleIcon className="w-full h-full text-white" />
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* User Selection - Show when level has multiple users */}
          {selectedLevel && hasMultipleUsers && !selectedLevel.isDeEscalation && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign To ({selectedLevel.users?.length || 0} users available) *
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">-- Select a user --</option>
                {selectedLevel.users?.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Escalation Reason */}
          {allowedLevels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Escalation *
              </label>
              <textarea
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Explain why this query needs escalation..."
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-2">
            {allowedLevels.length > 0 && (
              <button
                onClick={handleEscalate}
                disabled={!selectedLevelId || !escalationReason.trim() || submitting}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ExclamationTriangleIcon className="h-5 w-5" />
                <span>{submitting ? 'Escalating...' : 'Escalate'}</span>
              </button>
            )}
            <button
              onClick={cancelEscalation}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {allowedLevels.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <InformationCircleIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">
                {fetchSucceeded
                  ? currentLevelNumber > 0
                    ? 'This ticket is at the highest escalation level.'
                    : 'No escalation matrix is assigned to this ticket.'
                  : 'Unable to load escalation options. Please refresh and try again.'}
              </p>
            </div>
          ) : (
            <button
              onClick={() => setIsEscalating(true)}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
            >
              <ArrowUpIcon className="h-5 w-5" />
              <span>Escalate This Query</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EscalationMatrixCard;
