/**
 * JobProgressToast Component
 * ==========================
 * A floating toast notification for tracking job progress.
 * Shows a minimized progress indicator in the corner of the screen.
 */

import React, { memo, useState, useCallback } from 'react';
import { useJobProgress, JobStatus } from '../../hooks/useJobProgress';

interface JobProgressToastProps {
  jobId: string | null;
  title: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  onDismiss?: () => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

const positionClasses = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
};

const statusIcons: Record<JobStatus, React.ReactNode> = {
  pending: (
    <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  processing: (
    <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
  completed: (
    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  failed: (
    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  cancelled: (
    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
};

const JobProgressToast: React.FC<JobProgressToastProps> = memo(({
  jobId,
  title,
  onComplete,
  onError,
  onDismiss,
  position = 'bottom-right',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const { status, progress, error, isComplete, isFailed, retry } = useJobProgress(jobId, {
    onComplete: (result) => {
      onComplete?.(result);
      // Auto-dismiss after 5 seconds on success
      setTimeout(() => {
        setIsDismissed(true);
        onDismiss?.();
      }, 5000);
    },
    onError,
  });

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  const handleRetry = useCallback(async () => {
    await retry();
    setIsDismissed(false);
  }, [retry]);

  if (!jobId || isDismissed) return null;

  const statusIcon = status ? statusIcons[status] : statusIcons.pending;

  return (
    <div className={`fixed ${positionClasses[position]} z-50 transition-all duration-300`}>
      <div
        className={`bg-white rounded-lg shadow-xl border transition-all duration-300 cursor-pointer ${
          isExpanded ? 'w-80' : 'w-64'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Compact Header */}
        <div className="flex items-center gap-3 p-3">
          {statusIcon}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
            {!isExpanded && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      status === 'failed' ? 'bg-red-500' :
                      status === 'completed' ? 'bg-green-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-8">{Math.round(progress)}%</span>
              </div>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-3 pb-3 border-t pt-3">
            {/* Full Progress Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>
                  {status === 'pending' && 'Waiting in queue...'}
                  {status === 'processing' && 'Processing...'}
                  {status === 'completed' && 'Completed!'}
                  {status === 'failed' && 'Failed'}
                  {status === 'cancelled' && 'Cancelled'}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    status === 'failed' ? 'bg-red-500' :
                    status === 'completed' ? 'bg-green-500' :
                    'bg-blue-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              {isFailed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry();
                  }}
                  className="px-3 py-1 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
                >
                  Retry
                </button>
              )}
              {isComplete && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Done
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

JobProgressToast.displayName = 'JobProgressToast';

export default JobProgressToast;
