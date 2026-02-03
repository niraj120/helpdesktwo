/**
 * In-Memory Cache Utility
 * 
 * A lightweight, zero-dependency caching layer for frequently accessed data.
 * No Redis or external services required - runs entirely in Node.js memory.
 * 
 * Features:
 * - TTL (Time To Live) support
 * - Automatic cleanup of expired entries
 * - Cache invalidation by key or pattern
 * - Statistics tracking
 * - Memory-efficient with configurable max size
 * 
 * Usage:
 *   import { cache, CACHE_KEYS, CACHE_TTL } from '../utils/cache';
 *   
 *   // Get with auto-fetch if not cached
 *   const data = await cache.getOrFetch(CACHE_KEYS.PROJECT_BRANDING('mhcet'), async () => {
 *     return await Project.findOne({ customUrlPath: 'mhcet' });
 *   }, CACHE_TTL.LONG);
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats: CacheStats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 };
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Set a value in cache with TTL (in seconds)
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000),
      createdAt: Date.now(),
    });
    this.stats.sets++;
  }

  /**
   * Get value from cache or fetch and cache if not present
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    const cached = this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    
    // Only cache if value is not null/undefined
    if (value !== null && value !== undefined) {
      this.set(key, value, ttlSeconds);
    }
    
    return value;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Delete all keys matching a pattern (prefix)
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.deletes += count;
    return count;
  }

  /**
   * Delete all keys matching a pattern (contains)
   */
  deleteByPattern(pattern: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.deletes += count;
    return count;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    console.log('🗑️ [CACHE] Cleared all entries');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { size: number; hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : '0.00';
    
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get remaining TTL for a key (in seconds)
   */
  getTTL(key: string): number | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const remaining = Math.max(0, entry.expiresAt - Date.now()) / 1000;
    return Math.round(remaining);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 [CACHE] Cleaned ${cleaned} expired entries. Size: ${this.cache.size}`);
    }
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    const entriesToEvict = Math.ceil(this.maxSize * 0.1); // Evict 10%
    
    const sortedEntries = [...this.cache.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    
    for (let i = 0; i < entriesToEvict && i < sortedEntries.length; i++) {
      this.cache.delete(sortedEntries[i][0]);
      this.stats.evictions++;
    }
    
    console.log(`🗑️ [CACHE] Evicted ${entriesToEvict} oldest entries`);
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// =============================================================================
// Cache Instance (Singleton)
// =============================================================================
export const cache = new MemoryCache(10000);

// =============================================================================
// Cache Keys - Centralized key management
// =============================================================================
export const CACHE_KEYS = {
  // Project-related
  PROJECT_BRANDING: (urlPath: string) => `project:branding:${urlPath}`,
  PROJECT_BY_ID: (id: string) => `project:id:${id}`,
  PROJECT_SETTINGS: (id: string) => `project:settings:${id}`,
  PROJECT_LIST: 'project:list:all',
  PROJECT_ACTIVE: 'project:list:active',

  // User-related
  USER_BY_ID: (id: string) => `user:id:${id}`,
  USER_PERMISSIONS: (id: string) => `user:permissions:${id}`,
  USER_ROLE: (id: string) => `user:role:${id}`,

  // Role-related
  ROLE_BY_ID: (id: string) => `role:id:${id}`,
  ROLE_LIST: 'role:list:all',
  ROLE_ACTIVE: 'role:list:active',
  ROLE_PERMISSIONS: (id: string) => `role:permissions:${id}`,

  // Dropdown/Master data
  CATEGORIES_BY_PROJECT: (projectId: string) => `categories:project:${projectId}`,
  CATEGORIES_ALL: 'categories:all',
  STATUSES_ALL: 'statuses:all',
  STATUSES_BY_PROJECT: (projectId: string) => `statuses:project:${projectId}`,
  PRIORITIES_ALL: 'priorities:all',
  PRIORITIES_BY_PROJECT: (projectId: string) => `priorities:project:${projectId}`,

  // Center-related
  CENTERS_BY_PROJECT: (projectId: string) => `centers:project:${projectId}`,
  CENTER_BY_ID: (id: string) => `center:id:${id}`,

  // Agent-related
  AGENTS_BY_PROJECT: (projectId: string) => `agents:project:${projectId}`,
  AGENTS_BY_ROLE: (roleId: string) => `agents:role:${roleId}`,

  // System settings
  SYSTEM_SETTINGS: 'system:settings:all',
  SYSTEM_SETTING: (key: string) => `system:setting:${key}`,

  // SLA Rules
  SLA_RULES_BY_PROJECT: (projectId: string) => `sla:rules:${projectId}`,

  // KB Articles
  KB_LEVELS_BY_PROJECT: (projectId: string) => `kb:levels:${projectId}`,
  KB_CATEGORIES_BY_PROJECT: (projectId: string) => `kb:categories:${projectId}`,

  // Ticket settings
  TICKET_SETTINGS_BY_PROJECT: (projectId: string) => `ticket:settings:${projectId}`,
};

// =============================================================================
// Cache TTL Values (in seconds)
// =============================================================================
export const CACHE_TTL = {
  // Very short - for frequently changing data
  VERY_SHORT: 30,           // 30 seconds
  
  // Short - for moderately changing data
  SHORT: 60,                // 1 minute
  
  // Medium - for occasionally changing data
  MEDIUM: 300,              // 5 minutes
  
  // Long - for rarely changing data (settings, master data)
  LONG: 900,                // 15 minutes
  
  // Very long - for almost static data
  VERY_LONG: 3600,          // 1 hour
  
  // Session - for per-session data
  SESSION: 1800,            // 30 minutes
};

// =============================================================================
// Cache Invalidation Helpers
// =============================================================================
export const invalidateCache = {
  /**
   * Invalidate all project-related cache for a specific project
   */
  project: (projectId: string) => {
    cache.deleteByPattern(`project:${projectId}`);
    cache.delete(CACHE_KEYS.PROJECT_LIST);
    cache.delete(CACHE_KEYS.PROJECT_ACTIVE);
    console.log(`🔄 [CACHE] Invalidated project cache: ${projectId}`);
  },

  /**
   * Invalidate project branding cache
   */
  projectBranding: (urlPath: string) => {
    cache.delete(CACHE_KEYS.PROJECT_BRANDING(urlPath));
    console.log(`🔄 [CACHE] Invalidated branding cache: ${urlPath}`);
  },

  /**
   * Invalidate all user-related cache for a specific user
   */
  user: (userId: string) => {
    cache.deleteByPattern(`user:${userId}`);
    console.log(`🔄 [CACHE] Invalidated user cache: ${userId}`);
  },

  /**
   * Invalidate role-related cache
   */
  role: (roleId?: string) => {
    if (roleId) {
      cache.deleteByPattern(`role:${roleId}`);
    }
    cache.delete(CACHE_KEYS.ROLE_LIST);
    cache.delete(CACHE_KEYS.ROLE_ACTIVE);
    console.log(`🔄 [CACHE] Invalidated role cache${roleId ? `: ${roleId}` : ''}`);
  },

  /**
   * Invalidate category cache
   */
  categories: (projectId?: string) => {
    if (projectId) {
      cache.delete(CACHE_KEYS.CATEGORIES_BY_PROJECT(projectId));
    }
    cache.delete(CACHE_KEYS.CATEGORIES_ALL);
    console.log(`🔄 [CACHE] Invalidated categories cache`);
  },

  /**
   * Invalidate status cache
   */
  statuses: (projectId?: string) => {
    if (projectId) {
      cache.delete(CACHE_KEYS.STATUSES_BY_PROJECT(projectId));
    }
    cache.delete(CACHE_KEYS.STATUSES_ALL);
    console.log(`🔄 [CACHE] Invalidated statuses cache`);
  },

  /**
   * Invalidate priority cache
   */
  priorities: (projectId?: string) => {
    if (projectId) {
      cache.delete(CACHE_KEYS.PRIORITIES_BY_PROJECT(projectId));
    }
    cache.delete(CACHE_KEYS.PRIORITIES_ALL);
    console.log(`🔄 [CACHE] Invalidated priorities cache`);
  },

  /**
   * Invalidate center cache
   */
  centers: (projectId?: string) => {
    if (projectId) {
      cache.delete(CACHE_KEYS.CENTERS_BY_PROJECT(projectId));
    }
    cache.deleteByPrefix('centers:');
    console.log(`🔄 [CACHE] Invalidated centers cache`);
  },

  /**
   * Invalidate agents cache
   */
  agents: (projectId?: string) => {
    if (projectId) {
      cache.delete(CACHE_KEYS.AGENTS_BY_PROJECT(projectId));
    }
    cache.deleteByPrefix('agents:');
    console.log(`🔄 [CACHE] Invalidated agents cache`);
  },

  /**
   * Invalidate all master data cache
   */
  masterData: () => {
    cache.deleteByPrefix('categories:');
    cache.deleteByPrefix('statuses:');
    cache.deleteByPrefix('priorities:');
    console.log(`🔄 [CACHE] Invalidated all master data cache`);
  },

  /**
   * Invalidate all cache (use sparingly)
   */
  all: () => {
    cache.clear();
    console.log(`🔄 [CACHE] Invalidated ALL cache`);
  },
};

// =============================================================================
// Debug Helper
// =============================================================================
export const getCacheDebugInfo = () => {
  const stats = cache.getStats();
  return {
    ...stats,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
    timestamp: new Date().toISOString(),
  };
};

export default cache;
