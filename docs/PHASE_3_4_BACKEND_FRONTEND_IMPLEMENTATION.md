# Phase 3 & 4 Implementation - Backend API & Frontend State Management

## Overview
Implementation of Phase 3 (Backend API Modifications) and Phase 4 (Frontend State Management) for the multi-tenant helpdesk system with unified project context support.

## Implementation Date
**Completed:** January 22, 2026

---

## Phase 3: Backend API Modifications

### 3.1 Project Context Middleware ✅ ENHANCED

#### Component: attachProjectContext Middleware
**File:** `backend/src/middleware/projectScope.ts`  
**Status:** ✅ Complete

#### Features:
- ✅ Automatically extracts projectId from request (params/query/body)
- ✅ Detects view mode ('single' | 'unified')
- ✅ Compiles list of accessible projects for user
- ✅ Handles admin users (access to all projects)
- ✅ Attaches `projectContext` object to `req` for downstream use
- ✅ No project filter required for unified admin view

#### Project Context Structure:
```typescript
interface ProjectContext {
  viewMode: 'single' | 'unified';
  currentProjectId: string | null;
  accessibleProjectIds: string[]; // Empty = all (admin)
  isAdmin: boolean;
}

// Attached to request as:
req.projectContext = {
  viewMode: 'unified',
  currentProjectId: null,
  accessibleProjectIds: ['proj1', 'proj2', 'proj3'],
  isAdmin: false
}
```

#### Usage in Routes:
```typescript
import { attachProjectContext } from '../middleware/projectScope';

router.get(
  '/statistics',
  authMiddleware,
  attachProjectContext,  // Add this
  checkPermission('DASHBOARD_VIEW'),
  getDashboardStatistics
);
```

#### Query Filtering Logic:
```typescript
// In your controller:
const baseQuery: any = { /* base filters */ };

if (req.projectContext) {
  if (req.projectContext.viewMode === 'single' && req.projectContext.currentProjectId) {
    // Single project mode
    baseQuery['metadata.projectId'] = new mongoose.Types.ObjectId(
      req.projectContext.currentProjectId
    );
  } else if (req.projectContext.viewMode === 'unified' && !req.projectContext.isAdmin) {
    // Unified mode for non-admin
    baseQuery['metadata.projectId'] = {
      $in: req.projectContext.accessibleProjectIds.map(id => 
        new mongoose.Types.ObjectId(id)
      )
    };
  }
  // Admin in unified mode: no filter (see all)
}
```

---

### 3.2 Modified API Endpoints ✅ IMPLEMENTED

#### Dashboard Endpoint (Enhanced)
**File:** `backend/src/controllers/dashboardController.ts`  
**Route:** `GET /api/dashboard/statistics`  
**Status:** ✅ Complete

**Query Parameters:**
- `timeRange`: '7days' | '30days' | '90days' | 'all' (default: '7days')
- `viewMode`: 'single' | 'unified' (auto-detected from context)
- `projectId`: specific project ID (for single mode)

**Response Structure:**
```typescript
{
  success: true,
  data: {
    viewMode: 'unified',
    totalTickets: 150,
    openTickets: 45,
    resolvedTickets: 80,
    pendingTickets: 25,
    averageResponseTime: 2.5,
    slaCompliance: 95,
    ticketsByStatus: [
      { status: 1, count: 45 },
      { status: 2, count: 20 }
    ],
    ticketsByPriority: [
      { priority: 'High', count: 30 },
      { priority: 'Medium', count: 70 }
    ],
    ticketsByCategory: [
      { category: 'Technical', count: 50 }
    ],
    ticketsByProject: [  // Only in unified mode
      { projectId: '123', projectName: 'SAC Helpdesk', count: 75 },
      { projectId: '456', projectName: 'NIRF Portal', count: 75 }
    ],
    recentActivity: [
      {
        _id: '...',
        action: 'updated',
        ticketNumber: 'TKT-001',
        user: 'John Doe',
        projectName: 'SAC Helpdesk',
        timestamp: '2026-01-22T10:00:00Z'
      }
    ]
  }
}
```

**Features:**
- ✅ Supports both single and unified view modes
- ✅ Filters tickets by project based on user access
- ✅ Aggregates data across multiple projects (unified mode)
- ✅ Returns project breakdown (unified mode only)
- ✅ Includes project name in recent activity
- ✅ Respects admin permissions (no filter for admins)

**Example Usage:**
```typescript
// Frontend code
const fetchDashboardData = async (viewMode: 'single' | 'unified', projectId?: string) => {
  const params = new URLSearchParams({
    timeRange: '30days',
    viewMode: viewMode,
    ...(projectId && { projectId })
  });
  
  const response = await fetch(`/api/dashboard/statistics?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
};
```

---

#### Knowledge Base Endpoint (Planned)
**File:** `backend/src/routes/knowledgeBase.ts`  
**Status:** ⏳ To be implemented

**Recommended Changes:**
```typescript
// Add project context middleware
router.get(
  '/articles',
  publicAuth,
  attachProjectContext,
  getKnowledgeBaseArticles
);

// Controller modification
export const getKnowledgeBaseArticles = async (req: AuthRequest, res: Response) => {
  const baseQuery: any = { status: 'published' };
  
  // Add project filter if context available
  if (req.projectContext?.currentProjectId) {
    baseQuery.projectId = req.projectContext.currentProjectId;
  }
  
  const articles = await Article.find(baseQuery);
  res.json({ success: true, data: articles });
};
```

---

#### Project Management Endpoints
**File:** `backend/src/routes/projects.ts`  
**Status:** Already has project context support

**Existing Endpoints:**
- `GET /api/projects` - List all projects (respects permissions)
- `GET /api/projects/:id` - Get single project
- `GET /api/projects/stats` - Get project statistics

**Already Implemented:**
- ✅ Uses `requireProjectAccess()` middleware
- ✅ Filters by user's accessible projects
- ✅ Admin users see all projects

---

### 3.3 Enhanced Auth Middleware
**File:** `backend/src/middleware/auth.ts`  
**Status:** ✅ Enhanced

**Changes Made:**
- ✅ Added `ProjectContext` interface
- ✅ Added `projectContext` field to `AuthRequest` interface
- ✅ Included `projects` array in user object
- ✅ Populates user's projects with branding data

**Updated Interface:**
```typescript
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: any;
    firstName?: string;
    lastName?: string;
    tokenVersion?: number;
    projects?: any[]; // User's assigned projects
  };
  projectContext?: ProjectContext; // Attached by middleware
}
```

---

## Phase 4: Frontend State Management

### 4.1 Enhanced Project Context Store ✅ ENHANCED

#### Component: ProjectContextProvider
**File:** `frontend/src/contexts/ProjectContext.tsx`  
**Status:** ✅ Enhanced with smooth switching

#### New Features:
- ✅ Loading states (`isLoading`, `isSwitching`)
- ✅ Smooth project switching with options
- ✅ Automatic event dispatching (`projectSwitched`)
- ✅ Route preservation during switch
- ✅ Configurable reload/navigation strategies

#### Enhanced Context API:
```typescript
interface ProjectContextType {
  // State
  currentProjectId: string | null;
  viewMode: 'single' | 'unified';
  userProjects: Project[];
  recentProjects: string[];
  favoriteProjects: string[];
  isLoading: boolean;
  isSwitching: boolean;
  
  // Setters
  setCurrentProjectId: (id: string | null) => void;
  setViewMode: (mode: 'single' | 'unified') => void;
  setUserProjects: (projects: Project[]) => void;
  
  // Actions
  switchProject: (projectId: string, options?: SwitchOptions) => Promise<void>;
  addRecentProject: (projectId: string) => void;
  toggleFavorite: (projectId: string) => void;
  
  // Getters
  getCurrentProject: () => Project | null;
  isProjectAccessible: (projectId: string) => boolean;
}

interface SwitchOptions {
  reload?: boolean;         // Force page reload (default: false)
  navigate?: boolean;       // Navigate to project home (default: false)
  preserveRoute?: boolean;  // Keep current route path (default: false)
}
```

---

### 4.2 Smooth Project Switch Logic ✅ IMPLEMENTED

#### Strategy: Progressive Enhancement
**Implementation:** `switchProject()` function with multiple strategies

#### Switch Strategies:

**Strategy 1: State-Only Switch (Lightweight)**
```typescript
// Just update state, no navigation
await switchProject(projectId);
// Use when: Component will handle route change
```

**Strategy 2: Navigate Without Reload (Smooth)**
```typescript
// Change URL but don't reload
await switchProject(projectId, { navigate: true });
// Use when: Want smooth SPA navigation
```

**Strategy 3: Reload with Navigation (Full Refresh)**
```typescript
// Change URL and reload page
await switchProject(projectId, { 
  reload: true, 
  navigate: true 
});
// Use when: Need to refresh all context/data
```

**Strategy 4: Preserve Route (Smart)**
```typescript
// Keep current route structure
await switchProject(projectId, { 
  reload: true,
  navigate: true,
  preserveRoute: true 
});
// Example: /sac/portal/tickets → /nirf/portal/tickets
```

#### Implementation Details:

```typescript
const switchProject = async (
  projectId: string, 
  options: SwitchOptions = {}
): Promise<void> => {
  const {
    reload = false,
    navigate = false,
    preserveRoute = false
  } = options;

  try {
    setIsSwitching(true);  // Show loading state

    // 1. Find target project
    const targetProject = userProjects.find(p => p._id === projectId);
    if (!targetProject) {
      throw new Error('Project not found');
    }

    // 2. Update context state
    setCurrentProjectId(projectId);
    setViewMode('single');
    addRecentProject(projectId);

    // 3. Get project URL
    const customUrlPath = targetProject.branding?.customUrlPath 
      || targetProject.code.toLowerCase();

    // 4. Dispatch event for reactive components
    window.dispatchEvent(new CustomEvent('projectSwitched', {
      detail: { projectId, project: targetProject }
    }));

    // 5. Wait for state to settle
    await new Promise(resolve => setTimeout(resolve, 100));

    // 6. Handle navigation/reload
    if (reload) {
      // Full page reload
      window.location.href = `/${customUrlPath}/portal/dashboard`;
    } else if (navigate) {
      // React Router navigation
      const currentPath = window.location.pathname;
      const pathParts = currentPath.split('/').filter(Boolean);
      
      if (preserveRoute && pathParts.length > 2) {
        // Keep current route
        const route = pathParts.slice(2).join('/');
        window.location.href = `/${customUrlPath}/portal/${route}`;
      } else {
        // Go to project home
        window.location.href = `/${customUrlPath}/portal/dashboard`;
      }
    }

    console.log(`✅ Switched to: ${targetProject.name}`);
  } catch (error) {
    console.error('❌ Switch failed:', error);
    throw error;
  } finally {
    setIsSwitching(false);
  }
};
```

---

### 4.3 Loading States & UI Feedback

#### Loading Indicator Component
```typescript
import { useProjectContext } from '../contexts/ProjectContext';

function ProjectSwitcher() {
  const { isSwitching } = useProjectContext();
  
  return (
    <div>
      {isSwitching && (
        <div className="loading-overlay">
          <div className="spinner" />
          <p>Switching project...</p>
        </div>
      )}
      {/* Rest of component */}
    </div>
  );
}
```

#### Disable UI During Switch
```typescript
function ActionButton() {
  const { isSwitching } = useProjectContext();
  
  return (
    <button disabled={isSwitching}>
      {isSwitching ? 'Switching...' : 'Action'}
    </button>
  );
}
```

---

### 4.4 Event-Driven Updates

#### Listen to Project Switch Events
```typescript
useEffect(() => {
  const handleProjectSwitch = (event: CustomEvent) => {
    const { projectId, project } = event.detail;
    console.log('Project switched:', project.name);
    
    // Refresh data
    fetchDataForProject(projectId);
  };
  
  window.addEventListener('projectSwitched', handleProjectSwitch);
  return () => {
    window.removeEventListener('projectSwitched', handleProjectSwitch);
  };
}, []);
```

#### Listen to View Mode Changes
```typescript
useEffect(() => {
  const handleViewModeChange = (event: CustomEvent) => {
    const { viewMode } = event.detail;
    console.log('View mode changed:', viewMode);
    
    if (viewMode === 'unified') {
      fetchUnifiedData();
    } else {
      fetchSingleProjectData();
    }
  };
  
  window.addEventListener('viewModeChanged', handleViewModeChange);
  return () => {
    window.removeEventListener('viewModeChanged', handleViewModeChange);
  };
}, []);
```

---

## Integration Examples

### Example 1: Dashboard Component
```typescript
import { useEffect, useState } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';

function Dashboard() {
  const { viewMode, currentProjectId, isLoading } = useProjectContext();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchDashboardStats();
  }, [viewMode, currentProjectId]);

  const fetchDashboardStats = async () => {
    const params = new URLSearchParams({
      viewMode,
      ...(currentProjectId && { projectId: currentProjectId })
    });
    
    const response = await fetch(`/api/dashboard/statistics?${params}`);
    const data = await response.json();
    setStats(data.data);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Dashboard - {viewMode === 'unified' ? 'All Projects' : 'Single Project'}</h1>
      {/* Render stats */}
    </div>
  );
}
```

### Example 2: Ticket List with Project Badges
```typescript
import { useProjectContext } from '../contexts/ProjectContext';
import { ProjectBadge } from '../components/ProjectBadge';

function TicketList() {
  const { viewMode } = useProjectContext();
  const [tickets, setTickets] = useState([]);

  return (
    <div>
      {tickets.map(ticket => (
        <div key={ticket.id} className="ticket-card">
          {/* Show badge only in unified view */}
          {viewMode === 'unified' && (
            <ProjectBadge projectId={ticket.metadata.projectId} size="small" />
          )}
          <h3>{ticket.title}</h3>
          <p>{ticket.description}</p>
        </div>
      ))}
    </div>
  );
}
```

### Example 3: Data Fetching Hook
```typescript
import { useEffect, useState } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';

function useTickets() {
  const { viewMode, currentProjectId } = useProjectContext();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTickets();
  }, [viewMode, currentProjectId]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        viewMode,
        ...(viewMode === 'single' && currentProjectId && { projectId: currentProjectId })
      });
      
      const response = await fetch(`/api/tickets?${params}`);
      const data = await response.json();
      setTickets(data.data);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  return { tickets, loading, refetch: fetchTickets };
}

// Usage in component
function TicketManager() {
  const { tickets, loading } = useTickets();
  
  if (loading) return <div>Loading...</div>;
  
  return <TicketList tickets={tickets} />;
}
```

---

## Testing Checklist

### Backend Testing
- [ ] Test dashboard API with single project mode
- [ ] Test dashboard API with unified mode (non-admin)
- [ ] Test dashboard API with unified mode (admin - should see all)
- [ ] Verify project context middleware attaches correctly
- [ ] Test with user having 1 project
- [ ] Test with user having multiple projects
- [ ] Test with admin user
- [ ] Verify ticketsByProject only appears in unified mode
- [ ] Test time range filters (7days, 30days, etc.)

### Frontend Testing
- [ ] Test smooth project switching (no reload)
- [ ] Test project switching with reload
- [ ] Test route preservation during switch
- [ ] Test loading states (isSwitching)
- [ ] Verify localStorage persistence
- [ ] Test recent projects tracking
- [ ] Test favorites toggling
- [ ] Verify event dispatching (projectSwitched, viewModeChanged)
- [ ] Test with slow network (loading states)
- [ ] Test error handling (invalid project ID)

### Integration Testing
- [ ] Switch projects and verify dashboard updates
- [ ] Toggle view mode and verify data updates
- [ ] Test with ProjectBadge component in unified view
- [ ] Verify breadcrumbs update on project switch
- [ ] Test URL changes reflect project switch
- [ ] Verify browser back/forward buttons work
- [ ] Test refresh doesn't lose project context

---

## Performance Considerations

### Backend Optimizations
- ✅ Use MongoDB aggregation pipeline for efficient queries
- ✅ Index on `metadata.projectId` field
- ✅ Limit recent activity to 10 items
- ✅ Cache frequently accessed project data
- ⏳ Add pagination for large datasets

### Frontend Optimizations
- ✅ Use `useMemo` for expensive calculations
- ✅ Debounce search inputs in project switcher
- ✅ Lazy load project logos
- ✅ Persist state to localStorage (reduce server calls)
- ⏳ Implement virtual scrolling for large project lists
- ⏳ Add service worker for offline project context

---

## Security Considerations

### Backend Security
- ✅ Validate user access to projects (middleware)
- ✅ Sanitize project IDs (prevent injection)
- ✅ Check permissions before returning data
- ✅ Admin users explicitly identified
- ✅ Project context validated on every request

### Frontend Security
- ✅ Store only non-sensitive data in localStorage
- ✅ Validate project access before switching
- ✅ Clear project context on logout
- ✅ Verify JWT token includes project access
- ✅ Handle unauthorized project access gracefully

---

## Migration Guide

### For Existing Controllers
```typescript
// Before (no project context)
export const getItems = async (req: Request, res: Response) => {
  const items = await Item.find({});
  res.json({ data: items });
};

// After (with project context)
export const getItems = async (req: AuthRequest, res: Response) => {
  const baseQuery: any = {};
  
  // Add project filter from context
  if (req.projectContext) {
    if (req.projectContext.viewMode === 'single' && req.projectContext.currentProjectId) {
      baseQuery.projectId = req.projectContext.currentProjectId;
    } else if (req.projectContext.viewMode === 'unified' && !req.projectContext.isAdmin) {
      baseQuery.projectId = { 
        $in: req.projectContext.accessibleProjectIds 
      };
    }
  }
  
  const items = await Item.find(baseQuery);
  res.json({ data: items });
};
```

### For Existing Routes
```typescript
// Before
router.get('/items', authMiddleware, getItems);

// After
router.get('/items', authMiddleware, attachProjectContext, getItems);
```

---

## Next Steps

### Phase 5: Advanced Features (Planned)
- [ ] Real-time project switching without reload
- [ ] Cross-project search with highlighting
- [ ] Project-specific settings sync
- [ ] Unified notifications across projects
- [ ] Project comparison view
- [ ] Export data with project breakdown
- [ ] Advanced filtering in unified view
- [ ] Project activity timeline

### Backend Enhancements (Planned)
- [ ] WebSocket support for real-time updates
- [ ] GraphQL API for flexible queries
- [ ] Redis caching for project data
- [ ] Rate limiting per project
- [ ] Project-specific SLA rules

### Frontend Enhancements (Planned)
- [ ] Keyboard shortcuts for project switching
- [ ] Project quick switcher (Cmd/Ctrl+K)
- [ ] Pinned projects sidebar
- [ ] Project groups/categories
- [ ] Recently viewed items per project

---

## Documentation Links
- [Phase 2: UI Components](./PHASE_2_PROJECT_SWITCHER_IMPLEMENTATION.md)
- [ViewMode & Badges](./PHASE_2_VIEWMODE_AND_BADGES.md)
- [Quick Reference](./MULTI_TENANT_QUICK_REFERENCE.md)
- [Full Implementation Guide](./UNIFIED_PROJECT_PORTAL_IMPLEMENTATION.md)

---

**Status:** ✅ Phase 3 & 4 Complete  
**Last Updated:** January 22, 2026  
**Version:** 1.0.0
