/**
 * Email Connection Status Component (Task 8.2)
 * Displays and manages SMTP connection health
 */

import React, { useState } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';

interface ConnectionStatusProps {
  configId: string;
  status: 'connected' | 'disconnected' | 'error' | 'untested';
  lastConnectionTest?: Date;
  lastConnectionError?: string;
  failedAttempts?: number;
  nextRetryAt?: Date;
  onStatusChange?: () => void;
}

const EmailConnectionStatus: React.FC<ConnectionStatusProps> = ({
  configId,
  status,
  lastConnectionTest,
  lastConnectionError,
  failedAttempts = 0,
  nextRetryAt,
  onStatusChange
}) => {
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Debug: Log configId when component mounts or configId changes
  React.useEffect(() => {
    console.log('🔧 EmailConnectionStatus mounted/updated');
    console.log('   configId:', configId);
    console.log('   configId type:', typeof configId);
    console.log('   status:', status);
  }, [configId, status]);

  // Status badge styling
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-200',
          icon: '✓',
          label: 'Connected'
        };
      case 'disconnected':
        return {
          bg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-200',
          icon: '✗',
          label: 'Disconnected'
        };
      case 'error':
        return {
          bg: 'bg-yellow-100',
          text: 'text-yellow-800',
          border: 'border-yellow-200',
          icon: '⚠',
          label: 'Error'
        };
      case 'untested':
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          border: 'border-gray-200',
          icon: '?',
          label: 'Untested'
        };
    }
  };

  const statusConfig = getStatusConfig();

  // Calculate time until next retry
  const getRetryCountdown = () => {
    if (!nextRetryAt) return null;
    
    const now = new Date().getTime();
    const retryTime = new Date(nextRetryAt).getTime();
    const diffMs = retryTime - now;
    
    if (diffMs <= 0) return 'Ready to retry';
    
    const minutes = Math.ceil(diffMs / 60000);
    if (minutes < 60) return `Retry in ${minutes}m`;
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `Retry in ${hours}h ${remainingMinutes}m`;
  };

  // Test connection manually
  const handleTestConnection = async () => {
    console.log('🧪 EmailConnectionStatus: Testing connection...');
    console.log('   configId:', configId);
    console.log('   configId type:', typeof configId);
    console.log('   URL:', `${API_CONFIG.API_URL}/email-configs/${configId}/test`);
    
    setTesting(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_CONFIG.API_URL}/email-configs/${configId}/test`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.success) {
        alert('✅ Connection test successful!');
      } else {
        alert(`❌ Connection test failed: ${response.data.error}`);
      }
      
      onStatusChange?.();
    } catch (error: any) {
      const message = error.response?.data?.error || error.message;
      alert(`❌ Connection test failed: ${message}`);
    } finally {
      setTesting(false);
    }
  };

  // Reset retry counter
  const handleReset = async () => {
    if (!confirm('Reset connection status? This will clear error history and allow immediate retry.')) {
      return;
    }

    setResetting(true);
    try {
      const token = localStorage.getItem('authToken');
      await axios.patch(
        `${API_CONFIG.API_URL}/email-configs/${configId}/reset`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      alert('✅ Connection status reset successfully');
      onStatusChange?.();
    } catch (error: any) {
      const message = error.response?.data?.error || error.message;
      alert(`❌ Failed to reset: ${message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
        >
          <span className="mr-1">{statusConfig.icon}</span>
          {statusConfig.label}
        </span>

        {failedAttempts > 0 && (
          <span className="text-xs text-gray-600">
            ({failedAttempts} failed attempt{failedAttempts > 1 ? 's' : ''})
          </span>
        )}
      </div>

      {/* Connection Details */}
      <div className="text-xs text-gray-600 space-y-1">
        {lastConnectionTest && (
          <div>
            Last tested: {new Date(lastConnectionTest).toLocaleString()}
          </div>
        )}

        {lastConnectionError && status !== 'connected' && (
          <div className="text-red-600 bg-red-50 p-2 rounded border border-red-100">
            <strong>Error:</strong> {lastConnectionError}
          </div>
        )}

        {nextRetryAt && status !== 'connected' && (
          <div className="text-yellow-700 bg-yellow-50 p-2 rounded border border-yellow-100">
            {getRetryCountdown()}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>

        {(status === 'disconnected' || status === 'error') && failedAttempts > 0 && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetting ? 'Resetting...' : 'Reset Status'}
          </button>
        )}
      </div>
    </div>
  );
};

export default EmailConnectionStatus;
