/**
 * geoCache — lightweight in-memory cache for Google geocode and distance results.
 * No Redis required. TTLs match PRD spec (geocode: 30d, distances: 24h, centres: 1h).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Unix ms
}

class InMemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix (e.g. "distances:projectId:") */
  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

export const geoCache = new InMemoryCache();

export const TTL = {
  GEOCODE: 30 * 24 * 60 * 60 * 1000, // 30 days
  DISTANCES: 24 * 60 * 60 * 1000, // 24 hours
  CENTRES: 60 * 60 * 1000, // 1 hour
};
