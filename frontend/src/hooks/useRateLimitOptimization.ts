import { useRef, useCallback, useState } from 'react';

/**
 * Custom hook for debouncing API calls to prevent rate limiting
 * 
 * Usage:
 * ```tsx
 * const debouncedRefresh = useDebounce(fetchData, 1000);
 * 
 * const handleDelete = async (id: string) => {
 *   // Optimistic update
 *   setItems(items => items.filter(item => item.id !== id));
 *   
 *   // Delete in background
 *   await api.delete(id);
 *   
 *   // Debounced refresh (waits 1s, cancels previous calls)
 *   debouncedRefresh();
 * };
 * ```
 */
export const useDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 500
) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedCallback = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { debouncedCallback, cancel };
};

/**
 * Request queue to prevent too many simultaneous API calls
 * 
 * Usage:
 * ```tsx
 * const queue = useRequestQueue({ maxConcurrent: 3, delay: 200 });
 * 
 * // Queues requests instead of firing all at once
 * const results = await Promise.all(
 *   ids.map(id => queue.add(() => api.delete(id)))
 * );
 * ```
 */
export const useRequestQueue = (options: {
  maxConcurrent?: number;
  delay?: number;
} = {}) => {
  const { maxConcurrent = 5, delay = 100 } = options;
  const [pending, setPending] = useState(0);
  const queueRef = useRef<Array<() => Promise<any>>>([]);
  const activeRef = useRef(0);

  const processQueue = useCallback(async () => {
    if (activeRef.current >= maxConcurrent || queueRef.current.length === 0) {
      return;
    }

    const request = queueRef.current.shift();
    if (!request) return;

    activeRef.current++;
    setPending(queueRef.current.length);

    try {
      await request();
    } finally {
      activeRef.current--;
      setPending(queueRef.current.length);
      
      // Small delay between requests
      if (delay > 0 && queueRef.current.length > 0) {
        setTimeout(processQueue, delay);
      } else {
        processQueue();
      }
    }
  }, [maxConcurrent, delay]);

  const add = useCallback(<T,>(request: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      queueRef.current.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      setPending(queueRef.current.length);
      processQueue();
    });
  }, [processQueue]);

  return { add, pending };
};

/**
 * Custom hook for optimistic UI updates with error rollback
 * 
 * Usage:
 * ```tsx
 * const { optimisticUpdate } = useOptimisticUpdate();
 * 
 * const handleDelete = async (id: string) => {
 *   await optimisticUpdate({
 *     optimisticFn: () => setItems(items => items.filter(item => item.id !== id)),
 *     apiFn: () => api.delete(id),
 *     rollbackFn: () => fetchData(), // Refresh on error
 *   });
 * };
 * ```
 */
export const useOptimisticUpdate = () => {
  const optimisticUpdate = async <T = void>({
    optimisticFn,
    apiFn,
    rollbackFn,
    onSuccess,
    onError,
  }: {
    optimisticFn: () => void;
    apiFn: () => Promise<T>;
    rollbackFn?: () => void;
    onSuccess?: (result: T) => void;
    onError?: (error: any) => void;
  }) => {
    // Apply optimistic update immediately
    optimisticFn();

    try {
      // Execute API call in background
      const result = await apiFn();
      
      // Success callback
      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (error) {
      // Rollback on error
      if (rollbackFn) {
        rollbackFn();
      }

      // Error callback
      if (onError) {
        onError(error);
      } else {
        console.error('Optimistic update failed:', error);
      }

      throw error;
    }
  };

  return { optimisticUpdate };
};

/**
 * Custom hook combining debouncing and optimistic updates for delete operations
 * 
 * Best practice for preventing rate limiting on bulk operations
 * 
 * Usage:
 * ```tsx
 * const { handleOptimisticDelete } = useDebouncedDelete({
 *   items,
 *   setItems,
 *   deleteApiFn: (id) => axios.delete(`/api/items/${id}`),
 *   refreshFn: fetchData,
 *   delay: 1000,
 * });
 * 
 * <button onClick={() => handleOptimisticDelete(item.id)}>Delete</button>
 * ```
 */
export const useDebouncedDelete = <T extends { _id: string } | { id: string }>({
  items,
  setItems,
  deleteApiFn,
  refreshFn,
  delay = 1000,
  confirmMessage = 'Are you sure you want to delete this item?',
}: {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  deleteApiFn: (id: string) => Promise<any>;
  refreshFn: () => void | Promise<void>;
  delay?: number;
  confirmMessage?: string;
}) => {
  const { debouncedCallback } = useDebounce(refreshFn, delay);
  const { optimisticUpdate } = useOptimisticUpdate();

  const handleOptimisticDelete = useCallback(async (id: string) => {
    if (confirmMessage && !confirm(confirmMessage)) {
      return;
    }

    await optimisticUpdate({
      optimisticFn: () => {
        setItems(prevItems => 
          prevItems.filter(item => {
            const itemId = '_id' in item ? item._id : item.id;
            return itemId !== id;
          })
        );
      },
      apiFn: () => deleteApiFn(id),
      rollbackFn: () => refreshFn(),
      onSuccess: () => {
        // Debounced refresh to avoid rate limiting
        debouncedCallback();
      },
      onError: (error: any) => {
        alert(error.response?.data?.error || 'Failed to delete item');
      },
    });
  }, [items, setItems, deleteApiFn, refreshFn, debouncedCallback, confirmMessage, optimisticUpdate]);

  return { handleOptimisticDelete };
};
