import { useRef, useCallback, useEffect } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
  maxSize?: number; // Maximum cache entries (default: 50)
}

/**
 * Cache API responses to prevent duplicate requests
 * 
 * Usage:
 * ```tsx
 * const cache = useApiCache<ProjectData[]>({ ttl: 300000 }); // 5 min
 * 
 * const fetchProjects = async () => {
 *   const cached = cache.get('projects');
 *   if (cached) return cached;
 *   
 *   const data = await api.get('/projects');
 *   cache.set('projects', data);
 *   return data;
 * };
 * ```
 */
export const useApiCache = <T = any>(options: CacheOptions = {}) => {
  const { ttl = 300000, maxSize = 50 } = options; // 5 min default
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());
  const keysRef = useRef<string[]>([]);

  const get = useCallback((key: string): T | null => {
    const entry = cacheRef.current.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > ttl;
    if (isExpired) {
      cacheRef.current.delete(key);
      keysRef.current = keysRef.current.filter(k => k !== key);
      return null;
    }

    return entry.data;
  }, [ttl]);

  const set = useCallback((key: string, data: T) => {
    // Evict oldest entry if cache is full
    if (cacheRef.current.size >= maxSize && !cacheRef.current.has(key)) {
      const oldestKey = keysRef.current.shift();
      if (oldestKey) {
        cacheRef.current.delete(oldestKey);
      }
    }

    cacheRef.current.set(key, {
      data,
      timestamp: Date.now()
    });

    if (!keysRef.current.includes(key)) {
      keysRef.current.push(key);
    }
  }, [maxSize]);

  const invalidate = useCallback((key?: string) => {
    if (key) {
      cacheRef.current.delete(key);
      keysRef.current = keysRef.current.filter(k => k !== key);
    } else {
      cacheRef.current.clear();
      keysRef.current = [];
    }
  }, []);

  const has = useCallback((key: string): boolean => {
    return cacheRef.current.has(key) && get(key) !== null;
  }, [get]);

  return { get, set, invalidate, has };
};

/**
 * Prevent duplicate simultaneous requests for the same resource
 * 
 * Usage:
 * ```tsx
 * const dedup = useRequestDeduplication();
 * 
 * const fetchProjects = () => {
 *   return dedup.dedupe('projects', () => api.get('/projects'));
 * };
 * 
 * // Multiple calls will only trigger ONE API request
 * await Promise.all([
 *   fetchProjects(),
 *   fetchProjects(),
 *   fetchProjects()
 * ]); // Only 1 request made
 * ```
 */
export const useRequestDeduplication = () => {
  const pendingRef = useRef<Map<string, Promise<any>>>(new Map());

  const dedupe = useCallback(<T,>(
    key: string,
    request: () => Promise<T>
  ): Promise<T> => {
    const existing = pendingRef.current.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = request()
      .finally(() => {
        pendingRef.current.delete(key);
      });

    pendingRef.current.set(key, promise);
    return promise;
  }, []);

  return { dedupe };
};

/**
 * Debounced search with caching
 * 
 * Usage:
 * ```tsx
 * const search = useDebouncedSearch(
 *   async (query) => api.get(`/search?q=${query}`),
 *   { delay: 300, cache: true }
 * );
 * 
 * <input onChange={(e) => search.execute(e.target.value)} />
 * {search.loading && <Spinner />}
 * {search.results && <Results data={search.results} />}
 * ```
 */
export const useDebouncedSearch = <T,>(
  searchFn: (query: string) => Promise<T>,
  options: { delay?: number; cache?: boolean } = {}
) => {
  const { delay = 300, cache: enableCache = true } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cacheRef = useRef<Map<string, T>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (query: string): Promise<T | null> => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Empty query
    if (!query.trim()) {
      return null;
    }

    // Check cache
    if (enableCache && cacheRef.current.has(query)) {
      return cacheRef.current.get(query)!;
    }

    // Debounce
    return new Promise((resolve) => {
      timeoutRef.current = setTimeout(async () => {
        abortControllerRef.current = new AbortController();
        
        try {
          const result = await searchFn(query);
          if (enableCache) {
            cacheRef.current.set(query, result);
          }
          resolve(result);
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            console.error('Search error:', error);
          }
          resolve(null);
        }
      }, delay);
    });
  }, [searchFn, delay, enableCache]);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return { execute, clearCache };
};
