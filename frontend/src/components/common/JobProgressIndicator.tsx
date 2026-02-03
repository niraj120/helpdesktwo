/**
 * JobProgressIndicator Component
 * ==============================
 * A reusable component for displaying background job progress.
 * 
 * Features:
 * - Real-time progress bar
 * - Status indicator
 * - Error display with retry option
 * - Cancel button for pending jobs
 * - Download button for completed exports
 */

import React, { memo, useCallback } from 'react';
import { useJobProgress, JobStatus } from '../../hooks/useJobProgress';

interface JobProgressIndicatorProps {
  /** The job ID to track */
  jobId: string | null;
  /** Title to display above the progress bar */
  title?: string;
  /** Show the cancel button */
  showCancel?: boolean;
  /** Show the retry button on failure */
  showRetry?: boolean;
  /** Show download link for export jobs */
  showDownload?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when job completes */
  onComplete?: (result: any) => void;
  /** Callback when job fails */
  onError?: (error: string) => void;
  /** Callback to close/dismiss the indicator */
  onClose?: () => void;
}

const statusColors: Record<JobStatus, string> = {
  pending: 'bg-yellow-500',
  processing: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-500',
};

const statusLabels: Record<JobStatus, string> = {
  pending: 'Waiting...',
  processing: 'Processing...',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const JobProgressIndicator: React.FC<JobProgressIndicatorProps> = memo(({
  jobId,
  title = 'Processing...',
  showCancel = true,
  showRetry = true,
  showDownload = true,
  className = '',
  onComplete,
  onError,
  onClose,
}) => {
  const {
    status,
    progress,
    result,
    error,
    isComplete,
    isFailed,
    cancel,
    retry,
  } = useJobProgress(jobId, {
    onComplete,
    onError,
  });

  const handleCancel = useCallback(async () => {
    const cancelled = await cancel();
    if (cancelled) {
      onClose?.();
    }
  }, [cancel, onClose]);

  const handleRetry = useCallback(async () => {
    await retry();
  }, [retry]);

  const handleDownload = useCallback(() => {
    if (!result?.data || !jobId) return;
    
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003/api';
    const token = localStorage.getItem('token');
    
    // Create a link to download
    const link = document.createElement('a');
    link.href = `${API_BASE_URL}/jobs/${jobId}/download`;
    link.download = result.filename || 'export.xlsx';
    
    // Add auth header via fetch
    fetch(`${API_BASE_URL}/jobs/${jobId}/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
  }, [result, jobId]);

  if (!jobId) return null;

  const statusColor = status ? statusColors[status] : 'bg-gray-300';
  const statusLabel = status ? statusLabels[status] : 'Unknown';

  return (
    <div className={`bg-white rounded-lg shadow-lg p-4 border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColor} ${status === 'processing' ? 'animate-pulse' : ''}`} />
          <h4 className="font-medium text-gray-900">{title}</h4>
        </div>
        {onClose && (isComplete || isFailed) && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative pt-1 mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">{statusLabel}</span>
          <span className="text-xs font-semibold text-gray-700">{Math.round(progress)}%</span>
        </div>
        <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
          <div
            style={{ width: `${progress}%` }}
            className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-300 ${statusColor}`}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Result Summary */}
      {isComplete && result && (
        <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          {result.totalRecords !== undefined && (
            <span>Processed {result.totalRecords} records</span>
          )}
          {result.sent !== undefined && (
            <span>Sent: {result.sent} / Failed: {result.failed || 0}</span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        {/* Cancel Button */}
        {showCancel && status === 'pending' && (
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}

        {/* Retry Button */}
        {showRetry && isFailed && (
          <button
            onClick={handleRetry}
            className="px-3 py-1 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
          >
            Retry
          </button>
        )}

        {/* Download Button */}
        {showDownload && isComplete && result?.data && (
          <button
            onClick={handleDownload}
            className="px-3 py-1 text-sm text-white bg-green-500 hover:bg-green-600 rounded transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        )}
      </div>
    </div>
  );
});

JobProgressIndicator.displayName = 'JobProgressIndicator';

export default JobProgressIndicator;
