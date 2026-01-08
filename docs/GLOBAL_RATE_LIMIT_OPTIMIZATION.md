# Global Rate Limit Optimization - Complete Solution

## Problem Analysis

The 429 rate limiting errors occur across **ALL operations**, not just deletes:

### Root Causes
1. **Excessive fetchData() calls**: Every operation (create/update/delete) triggers immediate refresh
2. **No request caching**: Same data fetched multiple times
3. **Duplicate simultaneous requests**: Multiple components call same API
4. **Unoptimized search**: Every keystroke triggers API call
5. **Promise.all without delay**: Bulk operations fire all requests at once
6. **No request queuing**: Too many concurrent requests

---

## Solution Architecture

### 1. Request Debouncing (`useDebounce`)
**When to use**: After any operation that triggers refresh
```tsx
// BEFORE (Bad - 10 deletes = 50 API calls)
const handleDelete = async (id: string) => {
  await api.delete(id);
  fetchData(); // Called 10 times immediately
};

// AFTER (Good - 10 deletes = 11 API calls)
const debouncedRefresh = useDebounce(fetchData, 1000);

const handleDelete = async (id: string) => {
  setItems(items => items.filter(i => i.id !== id)); // Optimistic
  await api.delete(id);
  debouncedRefresh(); // Only calls fetchData once after 1s
};
```

### 2. Request Queue (`useRequestQueue`)
**When to use**: Bulk operations (delete/update multiple items)
```tsx
// BEFORE (Bad - 50 simultaneous requests)
await Promise.all(ids.map(id => api.delete(id)));

// AFTER (Good - Max 5 concurrent, 100ms delay between batches)
const queue = useRequestQueue({ maxConcurrent: 5, delay: 100 });
await Promise.all(ids.map(id => queue.add(() => api.delete(id))));
```

### 3. Response Caching (`useApiCache`)
**When to use**: Frequently accessed master data
```tsx
// BEFORE (Bad - Fetches projects on every page load)
const fetchProjects = async () => {
  const data = await api.get('/projects');
  setProjects(data);
};

// AFTER (Good - Uses cache for 5 minutes)
const cache = useApiCache<Project[]>({ ttl: 300000 });

const fetchProjects = async () => {
  const cached = cache.get('projects');
  if (cached) {
    setProjects(cached);
    return;
  }
  
  const data = await api.get('/projects');
  cache.set('projects', data);
  setProjects(data);
};

// Invalidate on create/update/delete
const handleCreate = async (project: Project) => {
  await api.post('/projects', project);
  cache.invalidate('projects');
  fetchProjects();
};
```

### 4. Request Deduplication (`useRequestDeduplication`)
**When to use**: Prevent duplicate simultaneous requests
```tsx
// BEFORE (Bad - 3 components mount, 3 identical API calls)
const Component1 = () => {
  useEffect(() => { fetchProjects(); }, []);
};
const Component2 = () => {
  useEffect(() => { fetchProjects(); }, []);
};
const Component3 = () => {
  useEffect(() => { fetchProjects(); }, []);
};

// AFTER (Good - Only 1 API call made)
const dedup = useRequestDeduplication();

const fetchProjects = () => {
  return dedup.dedupe('projects', () => api.get('/projects'));
};
```

### 5. Debounced Search (`useDebouncedSearch`)
**When to use**: Search inputs, filters
```tsx
// BEFORE (Bad - API call on every keystroke)
<input onChange={(e) => api.search(e.target.value)} />

// AFTER (Good - Waits 300ms after typing stops)
const search = useDebouncedSearch(
  (query) => api.get(`/search?q=${query}`),
  { delay: 300, cache: true }
);

<input onChange={(e) => search.execute(e.target.value)} />
```

---

## Implementation Priority

### Phase 1: Critical (Immediate - Day 1)
**Files with highest API call volume**

1. **RBACSetup.tsx** ✅ DONE
   - Delete roles: Debounced
   - Remaining: Add queue for bulk operations

2. **UserManagement.tsx** 🔴 HIGH PRIORITY
   - Bulk delete users (10+ API calls)
   - Search users (API call per keystroke)
   - Filter by role/status (immediate API calls)
   ```tsx
   import { useDebounce, useRequestQueue } from '@/hooks/useRateLimitOptimization';
   import { useApiCache, useDebouncedSearch } from '@/hooks/useApiCache';
   
   // Add debounced refresh
   const debouncedRefresh = useDebounce(fetchUsers, 1000);
   
   // Add request queue for bulk delete
   const queue = useRequestQueue({ maxConcurrent: 5, delay: 100 });
   
   const handleBulkDelete = async (ids: string[]) => {
     setUsers(users => users.filter(u => !ids.includes(u._id)));
     await Promise.all(ids.map(id => queue.add(() => api.delete(`/users/${id}`))));
     debouncedRefresh();
   };
   
   // Add debounced search
   const search = useDebouncedSearch(
     (query) => api.get(`/users?search=${query}`),
     { delay: 300, cache: true }
   );
   
   <SearchInput onChange={(e) => search.execute(e.target.value)} />
   ```

3. **MasterDataManagement.tsx** 🔴 HIGH PRIORITY
   - 5 master tables (countries, states, cities, roles, permissions)
   - Each has create/update/delete operations
   - ALL call fetchData() immediately
   ```tsx
   // Cache master data (rarely changes)
   const cache = useApiCache({ ttl: 600000 }); // 10 minutes
   const debouncedRefresh = useDebounce(fetchData, 1000);
   
   const fetchCountries = async () => {
     const cached = cache.get('countries');
     if (cached) {
       setCountries(cached);
       return;
     }
     const data = await api.get('/master/countries');
     cache.set('countries', data);
     setCountries(data);
   };
   
   const handleDeleteCountry = async (id: string) => {
     setCountries(countries => countries.filter(c => c._id !== id));
     await api.delete(`/master/countries/${id}`);
     cache.invalidate('countries');
     debouncedRefresh();
   };
   ```

### Phase 2: High (Week 1)

4. **TicketSettings.tsx**
   - Priority management (delete multiple)
   - Status management (delete multiple)
   - Same pattern: immediate fetchData() after each operation

5. **FAQManagement.tsx**
   - Bulk delete FAQs
   - Search FAQs
   - Filter by category

6. **StudentDashboard.tsx**
   - Multiple useEffect hooks calling APIs
   - Auto-refresh every 30s
   ```tsx
   // Reduce refresh frequency
   useEffect(() => {
     const interval = setInterval(fetchDashboard, 60000); // 30s → 60s
     return () => clearInterval(interval);
   }, []);
   
   // Add caching
   const cache = useApiCache({ ttl: 30000 }); // 30s cache
   ```

7. **StudentTicketDetail.tsx**
   - 3 fetchData calls
   - Add comments triggers refresh
   - Status update triggers refresh
   ```tsx
   const debouncedRefresh = useDebounce(fetchTicketData, 1000);
   
   const handleAddComment = async (comment: string) => {
     await api.post(`/tickets/${id}/comments`, { comment });
     debouncedRefresh(); // Instead of immediate fetchTicketData()
   };
   ```

### Phase 3: Medium (Week 2)

8. **ProjectManagement.tsx**
   - Create/update/delete projects
   - Search projects
   - Filter by status

9. **EscalationMatrix.tsx**
   - Create/update/delete escalations
   - Associate with projects

10. **SLAManagement.tsx**
    - Create/update/delete SLAs
    - Priority-based configuration

11. **ApprovalWorkflows.tsx**
    - Promise.all with 3 API calls
    - Add deduplication
    ```tsx
    const dedup = useRequestDeduplication();
    
    useEffect(() => {
      const fetchData = async () => {
        const [workflows, roles, projects] = await Promise.all([
          dedup.dedupe('workflows', () => api.get('/workflows')),
          dedup.dedupe('roles', () => api.get('/roles')),
          dedup.dedupe('projects', () => api.get('/projects'))
        ]);
      };
      fetchData();
    }, []);
    ```

### Phase 4: Low (Week 2-3)

12. **AddProjectForm.tsx**
    - Promise.all with 5 API calls
    - Cache dropdown data
    ```tsx
    const cache = useApiCache({ ttl: 600000 }); // 10 min
    
    useEffect(() => {
      const fetchDropdownData = async () => {
        const countries = cache.get('countries') || await api.get('/master/countries');
        cache.set('countries', countries);
        // Same for states, cities, users, roles
      };
    }, []);
    ```

13. **AttachmentManagement.tsx**
14. **CommentManagement.tsx**

---

## Code Examples by Operation Type

### A. DELETE Operations (16 locations)
```tsx
import { useDebounce, useRequestQueue } from '@/hooks/useRateLimitOptimization';

// Single delete
const debouncedRefresh = useDebounce(fetchData, 1000);

const handleDelete = async (id: string) => {
  setItems(items => items.filter(i => i.id !== id)); // Optimistic
  await api.delete(`/resource/${id}`);
  debouncedRefresh(); // Waits 1s
};

// Bulk delete (multiple selected)
const queue = useRequestQueue({ maxConcurrent: 5, delay: 100 });

const handleBulkDelete = async (ids: string[]) => {
  setItems(items => items.filter(i => !ids.includes(i.id))); // Optimistic
  await Promise.all(ids.map(id => queue.add(() => api.delete(`/resource/${id}`))));
  debouncedRefresh();
};
```

### B. CREATE/UPDATE Operations
```tsx
import { useDebounce } from '@/hooks/useRateLimitOptimization';
import { useApiCache } from '@/hooks/useApiCache';

const debouncedRefresh = useDebounce(fetchData, 500);
const cache = useApiCache();

const handleCreate = async (data: FormData) => {
  const newItem = await api.post('/resource', data);
  setItems(items => [...items, newItem]); // Optimistic
  cache.invalidate('resource'); // Clear cache
  debouncedRefresh();
};

const handleUpdate = async (id: string, data: FormData) => {
  const updated = await api.put(`/resource/${id}`, data);
  setItems(items => items.map(i => i.id === id ? updated : i)); // Optimistic
  cache.invalidate('resource');
  debouncedRefresh();
};
```

### C. SEARCH/FILTER Operations
```tsx
import { useDebouncedSearch } from '@/hooks/useApiCache';

const search = useDebouncedSearch(
  (query) => api.get(`/resource?search=${query}`),
  { delay: 300, cache: true }
);

// In component
<input 
  onChange={(e) => {
    const results = await search.execute(e.target.value);
    setItems(results);
  }} 
/>

// Filter dropdown (no caching, but debounced)
const debouncedFilter = useDebounce((value: string) => {
  fetchData({ filter: value });
}, 300);

<select onChange={(e) => debouncedFilter(e.target.value)}>
```

### D. DASHBOARD/AUTO-REFRESH
```tsx
import { useApiCache, useRequestDeduplication } from '@/hooks/useApiCache';

const cache = useApiCache({ ttl: 30000 }); // 30s
const dedup = useRequestDeduplication();

useEffect(() => {
  const fetchDashboard = async () => {
    // Try cache first
    const cached = cache.get('dashboard');
    if (cached) {
      setData(cached);
      return;
    }
    
    // Deduplicate if multiple components request
    const data = await dedup.dedupe('dashboard', () => api.get('/dashboard'));
    cache.set('dashboard', data);
    setData(data);
  };
  
  fetchDashboard();
  
  // Increase interval: 30s → 60s
  const interval = setInterval(fetchDashboard, 60000);
  return () => clearInterval(interval);
}, []);
```

### E. DROPDOWN/MASTER DATA (Frequently Accessed)
```tsx
import { useApiCache, useRequestDeduplication } from '@/hooks/useApiCache';

// Cache for 10 minutes (master data changes rarely)
const cache = useApiCache({ ttl: 600000 });
const dedup = useRequestDeduplication();

const fetchProjects = async () => {
  const cached = cache.get('projects');
  if (cached) return cached;
  
  const data = await dedup.dedupe('projects', () => api.get('/projects'));
  cache.set('projects', data);
  return data;
};

// Invalidate on mutation
const handleCreateProject = async (project: Project) => {
  await api.post('/projects', project);
  cache.invalidate('projects'); // Force refresh next time
  fetchProjects();
};
```

### F. PARALLEL API CALLS (Promise.all)
```tsx
import { useRequestDeduplication } from '@/hooks/useApiCache';

const dedup = useRequestDeduplication();

// Deduplicate parallel calls
useEffect(() => {
  const fetchData = async () => {
    const [roles, permissions, projects, users] = await Promise.all([
      dedup.dedupe('roles', () => api.get('/roles')),
      dedup.dedupe('permissions', () => api.get('/permissions')),
      dedup.dedupe('projects', () => api.get('/projects')),
      dedup.dedupe('users', () => api.get('/users'))
    ]);
  };
  fetchData();
}, []);
```

---

## Axios Interceptor (Global Solution)

Create a global interceptor to handle ALL requests:

```tsx
// src/utils/apiInterceptor.ts
import axios from 'axios';

const requestCache = new Map<string, Promise<any>>();
const responseCache = new Map<string, { data: any; timestamp: number }>();

// Deduplication interceptor
axios.interceptors.request.use((config) => {
  const key = `${config.method}:${config.url}`;
  
  // Check if identical request is already pending
  if (requestCache.has(key)) {
    config.signal = AbortSignal.timeout(0); // Abort duplicate
    return requestCache.get(key)!.then(() => config);
  }
  
  return config;
});

// Cache interceptor (GET only)
axios.interceptors.response.use(
  (response) => {
    const key = `${response.config.method}:${response.config.url}`;
    
    if (response.config.method === 'get') {
      responseCache.set(key, {
        data: response.data,
        timestamp: Date.now()
      });
      
      // Clear from pending
      requestCache.delete(key);
    }
    
    return response;
  },
  (error) => {
    const key = `${error.config?.method}:${error.config?.url}`;
    requestCache.delete(key);
    return Promise.reject(error);
  }
);
```

---

## Testing Checklist

### Before Deployment
- [ ] Test bulk delete (10+ items) - should see single fetchData call after 1s delay
- [ ] Test search input - should NOT call API on every keystroke
- [ ] Test filter dropdown - should debounce API calls
- [ ] Monitor browser network tab - check for duplicate requests
- [ ] Test dashboard refresh - should use cache, not call API every time

### After Deployment
- [ ] Monitor rate limit headers: `RateLimit-Remaining` should NOT drop below 100
- [ ] Check error logs for 429 errors - should be 0
- [ ] Test user operations: Create/Update/Delete projects, tickets, users
- [ ] Verify cache working: Navigate away and back, should load from cache
- [ ] Performance: Page load time should improve (fewer API calls)

---

## Performance Metrics

### Expected Improvements

| Operation | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Delete 10 roles | 50 API calls | 11 API calls | 78% |
| Search (10 keystrokes) | 10 API calls | 1-2 API calls | 80-90% |
| Dashboard load (3 tabs open) | 15 API calls | 5 API calls | 67% |
| Master data dropdown | 5 API calls | 1 API call (cached) | 80% |
| Bulk operations (20 items) | 100 API calls | 25 API calls | 75% |

**Overall Target**: 60-70% reduction in total API calls

---

## Rollout Plan

### Week 1
- Day 1-2: Implement Phase 1 (RBACSetup, UserManagement, MasterDataManagement)
- Day 3: Testing and bug fixes
- Day 4-5: Implement Phase 2 (TicketSettings, FAQManagement, StudentDashboard, StudentTicketDetail)

### Week 2
- Day 1-3: Implement Phase 3 (ProjectManagement, EscalationMatrix, SLAManagement, ApprovalWorkflows)
- Day 4-5: Implement Phase 4 (AddProjectForm, AttachmentManagement, CommentManagement)

### Week 3
- Day 1-2: Global axios interceptor
- Day 3-4: End-to-end testing
- Day 5: Production deployment and monitoring

---

## Monitoring

### Production Metrics to Track
1. **Rate Limit Usage**: Track `RateLimit-Remaining` header
2. **429 Error Rate**: Should be 0 after deployment
3. **Average API Calls per User Session**: Target <50 calls/session
4. **Cache Hit Rate**: Target >50% for master data
5. **Page Load Time**: Should decrease by 20-30%

### Logging
```tsx
// Add to axios interceptor
axios.interceptors.response.use((response) => {
  const remaining = response.headers['ratelimit-remaining'];
  if (remaining && parseInt(remaining) < 100) {
    console.warn(`Rate limit warning: ${remaining} requests remaining`);
  }
  return response;
});
```

---

## Summary

This complete solution addresses rate limiting across **ALL operations**:

✅ **Delete operations**: Debouncing + Optimistic updates
✅ **Create/Update operations**: Debounced refresh + Cache invalidation  
✅ **Search/Filter**: Debounced input + Caching
✅ **Dashboard/Auto-refresh**: Caching + Increased intervals
✅ **Dropdown/Master data**: Long-term caching (10 min)
✅ **Bulk operations**: Request queueing (max 5 concurrent)
✅ **Duplicate requests**: Deduplication at hook and interceptor level

**Next Steps**: Start with Phase 1 (UserManagement, MasterDataManagement) - highest impact.
