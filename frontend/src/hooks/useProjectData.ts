import { useState, useEffect } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';

/**
 * Custom hook for fetching data based on view mode
 * Automatically handles single/unified view switching
 * 
 * @param endpoint - API endpoint (e.g., '/api/tickets')
 * @param options - Fetch options
 * @returns { data, loading, error, refetch }
 */

interface FetchOptions {
  params?: Record<string, any>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  dependencies?: any[]; // Re-fetch when these change
}

interface FetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useProjectData<T = any>(
  endpoint: string,
  options: FetchOptions = {}
): FetchResult<T> {
  const { viewMode, currentProjectId } = useProjectContext();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    params = {},
    method = 'GET',
    body,
    dependencies = []
  } = options;

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Build query parameters
      const queryParams = new URLSearchParams({
        viewMode,
        ...(viewMode === 'single' && currentProjectId && { projectId: currentProjectId }),
        ...params
      });

      const url = `${endpoint}?${queryParams}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        ...(body && { body: JSON.stringify(body) })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result.data || result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error(`Error fetching from ${endpoint}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [viewMode, currentProjectId, ...dependencies]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook specifically for fetching tickets
 * Includes pagination and filtering support
 */
interface TicketsOptions {
  page?: number;
  limit?: number;
  status?: number | number[];
  priority?: string | string[];
  projectIds?: string[]; // Filter by specific projects in unified mode
  search?: string;
}

export function useTickets(options: TicketsOptions = {}) {
  const { viewMode, currentProjectId } = useProjectContext();
  
  return useProjectData('/api/tickets', {
    params: {
      page: options.page || 1,
      limit: options.limit || 20,
      ...(options.status && { status: Array.isArray(options.status) ? options.status.join(',') : options.status }),
      ...(options.priority && { priority: Array.isArray(options.priority) ? options.priority.join(',') : options.priority }),
      ...(options.projectIds && viewMode === 'unified' && { projectIds: options.projectIds.join(',') }),
      ...(options.search && { search: options.search })
    },
    dependencies: [
      options.page,
      options.limit,
      options.status,
      options.priority,
      options.projectIds,
      options.search
    ]
  });
}

/**
 * Hook for fetching dashboard statistics
 */
interface DashboardOptions {
  timeRange?: '7days' | '30days' | '90days' | 'all';
}

export function useDashboardStats(options: DashboardOptions = {}) {
  return useProjectData('/api/dashboard/statistics', {
    params: {
      timeRange: options.timeRange || '7days'
    },
    dependencies: [options.timeRange]
  });
}

/**
 * Hook for fetching knowledge base articles
 */
interface KBOptions {
  category?: string;
  search?: string;
  featured?: boolean;
}

export function useKnowledgeBase(options: KBOptions = {}) {
  const { viewMode, currentProjectId } = useProjectContext();
  
  // Knowledge base is always project-specific
  // In unified mode, require projectId to be set
  const shouldFetch = viewMode === 'single' || currentProjectId;

  return useProjectData('/api/knowledge-base/articles', {
    params: {
      ...(options.category && { category: options.category }),
      ...(options.search && { search: options.search }),
      ...(options.featured && { featured: true })
    },
    dependencies: [options.category, options.search, options.featured]
  });
}

/**
 * Hook for creating/updating data with project context
 */
interface MutationOptions<T> {
  method: 'POST' | 'PUT' | 'DELETE';
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export function useProjectMutation<T = any>(
  endpoint: string
) {
  const { currentProjectId } = useProjectContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (
    data: any,
    options: MutationOptions<T>
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Include projectId in body if available
      const body = {
        ...data,
        ...(currentProjectId && { projectId: currentProjectId })
      };

      const response = await fetch(endpoint, {
        method: options.method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const responseData = result.data || result;

      options.onSuccess?.(responseData);
      return responseData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      options.onError?.(errorMessage);
      console.error(`Error mutating ${endpoint}:`, err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { mutate, loading, error };
}

/**
 * Hook to listen to project/view mode changes
 */
export function useProjectListener(callback: (event: CustomEvent) => void) {
  useEffect(() => {
    const handleProjectSwitch = (e: Event) => {
      callback(e as CustomEvent);
    };

    window.addEventListener('projectSwitched', handleProjectSwitch);
    window.addEventListener('viewModeChanged', handleProjectSwitch);

    return () => {
      window.removeEventListener('projectSwitched', handleProjectSwitch);
      window.removeEventListener('viewModeChanged', handleProjectSwitch);
    };
  }, [callback]);
}
