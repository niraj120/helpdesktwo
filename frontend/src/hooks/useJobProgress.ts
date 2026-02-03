/**
 * useJobProgress Hook
 * ====================
 * React hook for polling and tracking job progress.
 * 
 * Usage:
 * const { status, progress, result, error, isComplete } = useJobProgress(jobId);
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface JobProgressState {
  status: JobStatus | null;
  progress: number;
  result: any;
  error: string | null;
  isLoading: boolean;
  isComplete: boolean;
  isFailed: boolean;
}

interface UseJobProgressOptions {
  /** Polling interval in ms (default: 1000) */
  pollingInterval?: number;
  /** Stop polling when job completes (default: true) */
  stopOnComplete?: boolean;
  /** Callback when job completes */
  onComplete?: (result: any) => void;
  /** Callback when job fails */
  onError?: (error: string) => void;
  /** Callback for progress updates */
  onProgress?: (progress: number) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003/api';

export function useJobProgress(
  jobId: string | null,
  options: UseJobProgressOptions = {}
): JobProgressState & { refetch: () => Promise<void>; cancel: () => Promise<boolean>; retry: () => Promise<boolean> } {
  const {
    pollingInterval = 1000,
    stopOnComplete = true,
    onComplete,
    onError,
    onProgress,
  } = options;

  const [state, setState] = useState<JobProgressState>({
    status: null,
    progress: 0,
    result: null,
    error: null,
    isLoading: false,
    isComplete: false,
    isFailed: false,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousProgress = useRef<number>(0);

  const fetchProgress = useCallback(async () => {
    if (!jobId) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/progress`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch job progress');
      }

      const data = await response.json();
      
      if (data.success) {
        const { status, progress, error } = data.data;
        
        // Trigger progress callback if progress changed
        if (progress !== previousProgress.current && onProgress) {
          onProgress(progress);
        }
        previousProgress.current = progress;

        const isComplete = status === 'completed';
        const isFailed = status === 'failed';

        setState(prev => ({
          ...prev,
          status,
          progress,
          error,
          isComplete,
          isFailed,
          isLoading: false,
        }));

        // If job is complete, fetch full result
        if (isComplete) {
          const resultResponse = await fetch(`${API_BASE_URL}/jobs/${jobId}/result`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (resultResponse.ok) {
            const resultData = await resultResponse.json();
            setState(prev => ({ ...prev, result: resultData.data }));
            onComplete?.(resultData.data);
          }
        }

        // If job failed, trigger error callback
        if (isFailed && onError) {
          onError(error || 'Job failed');
        }

        // Stop polling if complete or failed
        if ((isComplete || isFailed) && stopOnComplete && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: err.message,
        isLoading: false,
      }));
    }
  }, [jobId, onComplete, onError, onProgress, stopOnComplete]);

  // Start polling when jobId changes
  useEffect(() => {
    if (!jobId) {
      setState({
        status: null,
        progress: 0,
        result: null,
        error: null,
        isLoading: false,
        isComplete: false,
        isFailed: false,
      });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));
    fetchProgress();

    intervalRef.current = setInterval(fetchProgress, pollingInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, pollingInterval, fetchProgress]);

  const cancel = useCallback(async (): Promise<boolean> => {
    if (!jobId) return false;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setState(prev => ({ ...prev, status: 'cancelled', isComplete: true }));
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [jobId]);

  const retry = useCallback(async (): Promise<boolean> => {
    if (!jobId) return false;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setState(prev => ({
          ...prev,
          status: 'pending',
          progress: 0,
          error: null,
          isComplete: false,
          isFailed: false,
          isLoading: true,
        }));
        
        // Restart polling
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        intervalRef.current = setInterval(fetchProgress, pollingInterval);
        
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [jobId, fetchProgress, pollingInterval]);

  return {
    ...state,
    refetch: fetchProgress,
    cancel,
    retry,
  };
}

export default useJobProgress;
