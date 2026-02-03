# Phase 5: View-Specific Implementations

## Overview

Phase 5 implements the actual view-specific features for Single Project and Unified views. This includes specialized components for tickets lists, dashboards, and knowledge base access.

**Status**: ✅ Complete  
**Date**: January 22, 2026

---

## Table of Contents

1. [Single Project View (5.1)](#51-single-project-view)
2. [Unified View - Tickets (5.2)](#52-unified-view---tickets)
3. [Unified View - Dashboard (5.3)](#53-unified-view---dashboard)
4. [Knowledge Base Handling (5.4)](#54-knowledge-base-handling)
5. [Custom Hooks](#5-custom-hooks)
6. [Backend Enhancements](#6-backend-enhancements)
7. [Integration Guide](#7-integration-guide)
8. [Testing](#8-testing)

---

## 5.1 Single Project View

### Overview
When a user selects a specific project, all data is automatically filtered to show only that project's content.

### Features

✅ **Automatic Filtering**: All API calls include `projectId` parameter  
✅ **Project Badge in Header**: Clear indication of current project  
✅ **All Features Work**: Existing functionality remains unchanged  
✅ **Context Maintenance**: Project context persists across navigation

### Implementation

**Frontend**: Uses `currentProjectId` from ProjectContext
```typescript
const { currentProjectId, viewMode } = useProjectContext();

// All data hooks automatically filter by currentProjectId
const { data } = useTickets(); // Auto-filters if viewMode === 'single'
```

**Backend**: Receives `projectId` in query/body and filters accordingly
```typescript
if (projectContext.viewMode === 'single' && projectContext.currentProjectId) {
  query['metadata.projectId'] = new mongoose.Types.ObjectId(projectContext.currentProjectId);
}
```

### User Experience

1. User selects project from HeaderProjectSwitcher
2. `switchProject()` updates context and reloads/navigates
3. All subsequent API calls include project context
4. Data automatically scoped to selected project

---

## 5.2 Unified View - Tickets

### Component: `UnifiedTicketsList`

**Location**: `frontend/src/components/UnifiedTicketsList.tsx`  
**Lines**: 650+  
**Status**: ✅ Complete

### Features

#### 1. **Multi-Project Ticket Display**
Shows tickets from all accessible projects in a single list.

```typescript
// Each ticket includes project badge
<ProjectBadge 
  projectId={ticket.metadata?.projectId} 
  size="small" 
/>
```

#### 2. **Advanced Filtering**

**Project Filter** (Multi-Select):
```typescript
const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

// Filter by specific projects
projectIds: selectedProjects.length > 0 ? selectedProjects : undefined
```

**Status Filter**:
- Open
- In Progress
- On Hold
- Resolved
- Closed

**Priority Filter**:
- Low
- Medium
- High
- Critical

**Search**:
- Ticket number
- Title
- Description

#### 3. **Pagination**
```typescript
const { data } = useTickets({
  page,
  limit: 20,
  projectIds: selectedProjects,
  search: searchQuery,
  status: statusFilter,
  priority: priorityFilter
});
```

#### 4. **Click Navigation**
Maintains project context when clicking ticket:
```typescript
onClick={() => {
  // Opens ticket detail with project context
  window.location.href = `/tickets/${ticket._id}`;
}}
```

### API Integration

**Endpoint**: `GET /api/tickets`  
**Query Params**:
```typescript
{
  viewMode: 'unified',
  page: 1,
  limit: 20,
  projectIds: '123,456,789',  // Optional: filter specific projects
  status: '1,2',              // Optional: filter by status
  priority: 'High,Critical',  // Optional: filter by priority
  search: 'login issue'       // Optional: search query
}
```

**Response**:
```typescript
{
  success: true,
  data: {
    tickets: [
      {
        _id: '...',
        ticketNumber: 'TKT-001',
        title: '...',
        status: 1,
        priority: 'High',
        metadata: {
          projectId: {
            _id: '123',
            name: 'SAC Helpdesk',
            code: 'SAC',
            branding: { ... }
          }
        },
        createdAt: '...',
        // ... other fields
      }
    ],
    pagination: {
      total: 150,
      page: 1,
      limit: 20,
      totalPages: 8
    }
  }
}
```

### UI/UX Highlights

**Header**:
```typescript
<h1>All Tickets</h1>
<p>{totalTickets} tickets across {userProjects.length} projects</p>
```

**Filter Panel** (Toggleable):
- Search bar with icon
- Project chips (clickable)
- Status badges (color-coded)
- Priority badges (color-coded)
- Clear all filters button

**Ticket Card**:
- Project badge (top-left)
- Ticket number + status + priority badges
- Title and description preview
- Creation date
- Category and assignee
- Hover effects (shadow + border color)

---

## 5.3 Unified View - Dashboard

### Component: `UnifiedDashboard`

**Location**: `frontend/src/components/UnifiedDashboard.tsx`  
**Lines**: 500+  
**Status**: ✅ Complete

### Features

#### 1. **Combined Statistics** (Top Section)

Four KPI cards showing aggregated data across all projects:

```typescript
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
  <StatCard icon={MdConfirmationNumber} label="Total Tickets" value={stats.totalTickets} color="#667eea" />
  <StatCard icon={MdSchedule} label="Open Tickets" value={stats.openTickets} color="#3b82f6" />
  <StatCard icon={MdCheckCircle} label="Resolved Tickets" value={stats.resolvedTickets} color="#10b981" />
  <StatCard icon={MdTrendingUp} label="SLA Compliance" value={stats.slaCompliance + '%'} color="#10b981" />
</div>
```

#### 2. **Project Breakdown** (Middle Section)

Grid of project cards with individual statistics:

```typescript
{ticketsByProject.map(project => (
  <ProjectCard
    key={project.projectId}
    onClick={() => handleProjectClick(project.projectId)}
    project={{
      id: project.projectId,
      name: project.projectName,
      totalTickets: project.count,
      openTickets: project.openCount,
      resolvedTickets: project.resolvedCount,
      pendingTickets: project.pendingCount
    }}
  />
))}
```

**Each Card Shows**:
- Project badge with logo
- Total ticket count
- Open tickets (blue)
- Resolved tickets (green)
- Pending tickets (orange)
- "Click to view details" hint

**Click Behavior**:
```typescript
const handleProjectClick = async (projectId: string) => {
  await switchProject(projectId, {
    reload: true,
    navigate: true
  });
};
```
Switches to single project view for drill-down.

#### 3. **Comparative Charts** (Bottom Section)

**Status Distribution Bar Chart**:
```typescript
{stats.ticketsByStatus?.map(item => {
  const percentage = ((item.count / stats.totalTickets) * 100).toFixed(1);
  return (
    <div>
      <label>{statusInfo.label}: {item.count} ({percentage}%)</label>
      <ProgressBar width={percentage} color={statusInfo.color} />
    </div>
  );
})}
```

**Priority Distribution Bar Chart**:
Similar visualization for Low/Medium/High/Critical priorities.

#### 4. **Time Range Selector**
```typescript
<select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
  <option value="7days">Last 7 Days</option>
  <option value="30days">Last 30 Days</option>
  <option value="90days">Last 90 Days</option>
  <option value="all">All Time</option>
</select>
```

### API Integration

Uses the existing `GET /api/dashboard/statistics` endpoint enhanced in Phase 3:

**Request**:
```typescript
GET /api/dashboard/statistics?viewMode=unified&timeRange=30days
```

**Response**:
```typescript
{
  viewMode: 'unified',
  totalTickets: 250,
  openTickets: 75,
  resolvedTickets: 150,
  pendingTickets: 25,
  slaCompliance: 87,
  ticketsByProject: [
    {
      projectId: '123',
      projectName: 'SAC Helpdesk',
      count: 125,
      openCount: 40,
      resolvedCount: 75,
      pendingCount: 10
    },
    {
      projectId: '456',
      projectName: 'NIRF Portal',
      count: 125,
      openCount: 35,
      resolvedCount: 75,
      pendingCount: 15
    }
  ],
  ticketsByStatus: [
    { status: 1, count: 75 },
    { status: 2, count: 25 },
    { status: 4, count: 150 }
  ],
  ticketsByPriority: [
    { priority: 'Low', count: 50 },
    { priority: 'Medium', count: 100 },
    { priority: 'High', count: 75 },
    { priority: 'Critical', count: 25 }
  ]
}
```

---

## 5.4 Knowledge Base Handling

### Component: `KnowledgeBaseWithProjectSelector`

**Location**: `frontend/src/components/KnowledgeBaseWithProjectSelector.tsx`  
**Lines**: 600+  
**Status**: ✅ Complete

### Design Decision

**Knowledge Base is ALWAYS project-specific.**

**Rationale**:
- KB articles are inherently tied to project features
- Merging articles from multiple projects would be confusing
- Users need context about which project's KB they're viewing

### Single Mode Behavior

```typescript
if (viewMode === 'single') {
  // Show KB for currentProjectId directly
  return <KnowledgeBaseView projectId={currentProjectId} />;
}
```

**Features**:
- Project badge in header shows current project
- Full search and filter capabilities
- Featured articles highlighted
- Category filtering
- Tag-based navigation

### Unified Mode Behavior

**Step 1: Project Selector**
```typescript
if (viewMode === 'unified' && !selectedProjectForKB) {
  return (
    <ProjectSelectorScreen>
      <h1>Choose a Project</h1>
      {userProjects.map(project => (
        <ProjectButton
          key={project._id}
          onClick={() => setSelectedProjectForKB(project._id)}
        >
          <ProjectBadge projectId={project._id} />
          <ProjectName>{project.name}</ProjectName>
        </ProjectButton>
      ))}
    </ProjectSelectorScreen>
  );
}
```

**Step 2: Knowledge Base View**
```typescript
if (viewMode === 'unified' && selectedProjectForKB) {
  return (
    <>
      <BackButton onClick={() => setSelectedProjectForKB(null)}>
        ← Back to Projects
      </BackButton>
      <KnowledgeBaseView projectId={selectedProjectForKB} />
    </>
  );
}
```

### Features

#### 1. **Search**
```typescript
<input
  type="text"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  placeholder="Search articles..."
/>
```

#### 2. **Category Filter**
```typescript
<select value={selectedCategory} onChange={...}>
  <option value="">All Categories</option>
  {categories.map(cat => (
    <option key={cat} value={cat}>{cat}</option>
  ))}
</select>
```

#### 3. **Featured Filter**
```typescript
<button
  onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
  style={{
    backgroundColor: showFeaturedOnly ? '#667eea' : '#fff'
  }}
>
  <MdStar /> Featured Only
</button>
```

#### 4. **Article Cards**
- Featured badge (if applicable)
- Category badge
- Title and preview
- Tags
- Hover effects

### API Integration

**Endpoint**: `GET /api/knowledge-base/articles`

**Request** (Single Mode):
```typescript
GET /api/knowledge-base/articles?viewMode=single&projectId=123&search=login&category=authentication
```

**Request** (Unified Mode):
```typescript
GET /api/knowledge-base/articles?viewMode=single&projectId=456&featured=true
```
Note: Even in unified mode, we send a specific projectId after user selects it.

**Response**:
```typescript
{
  success: true,
  data: {
    articles: [
      {
        _id: '...',
        title: 'How to reset password',
        content: '...',
        category: 'Authentication',
        tags: ['password', 'reset', 'security'],
        featured: true,
        views: 1250,
        createdAt: '...'
      }
    ],
    categories: ['Authentication', 'Account', 'Technical', 'Billing']
  }
}
```

---

## 5. Custom Hooks

### `useProjectData`

**Location**: `frontend/src/hooks/useProjectData.ts`  
**Purpose**: Generic hook for fetching data with automatic view mode handling

```typescript
export function useProjectData<T = any>(
  endpoint: string,
  options: FetchOptions = {}
): FetchResult<T> {
  const { viewMode, currentProjectId } = useProjectContext();
  
  // Automatically includes viewMode and projectId in requests
  const queryParams = new URLSearchParams({
    viewMode,
    ...(viewMode === 'single' && currentProjectId && { projectId: currentProjectId }),
    ...params
  });
  
  // Handles fetching, loading, error states
  // Re-fetches when viewMode or currentProjectId changes
}
```

**Usage**:
```typescript
const { data, loading, error, refetch } = useProjectData('/api/tickets', {
  params: { status: '1,2' },
  dependencies: [status]
});
```

### `useTickets`

Specialized hook for tickets with pagination and filtering:

```typescript
export function useTickets(options: TicketsOptions = {}) {
  return useProjectData('/api/tickets', {
    params: {
      page: options.page || 1,
      limit: options.limit || 20,
      status: options.status,
      priority: options.priority,
      projectIds: options.projectIds,
      search: options.search
    },
    dependencies: [page, status, priority, projectIds, search]
  });
}
```

**Usage**:
```typescript
const { data, loading, error } = useTickets({
  page: 1,
  limit: 20,
  status: [1, 2],
  priority: ['High', 'Critical'],
  projectIds: ['123', '456'],
  search: 'login issue'
});
```

### `useDashboardStats`

Hook for dashboard statistics:

```typescript
export function useDashboardStats(options: DashboardOptions = {}) {
  return useProjectData('/api/dashboard/statistics', {
    params: {
      timeRange: options.timeRange || '7days'
    },
    dependencies: [options.timeRange]
  });
}
```

### `useKnowledgeBase`

Hook for KB articles (always requires projectId):

```typescript
export function useKnowledgeBase(options: KBOptions = {}) {
  const { viewMode, currentProjectId } = useProjectContext();
  
  // Only fetch if we have a projectId
  const shouldFetch = viewMode === 'single' || currentProjectId;
  
  return useProjectData('/api/knowledge-base/articles', {
    params: {
      category: options.category,
      search: options.search,
      featured: options.featured
    }
  });
}
```

### `useProjectMutation`

Hook for creating/updating data:

```typescript
export function useProjectMutation<T = any>(endpoint: string) {
  const { currentProjectId } = useProjectContext();
  
  const mutate = async (data: any, options: MutationOptions<T>) => {
    // Automatically includes projectId in request body
    const body = {
      ...data,
      ...(currentProjectId && { projectId: currentProjectId })
    };
    
    // Makes POST/PUT/DELETE request
    // Handles loading, error states
    // Calls onSuccess/onError callbacks
  };
  
  return { mutate, loading, error };
}
```

**Usage**:
```typescript
const { mutate, loading } = useProjectMutation('/api/tickets');

await mutate(
  { title: 'New ticket', priority: 'High' },
  {
    method: 'POST',
    onSuccess: (data) => console.log('Created:', data),
    onError: (error) => console.error('Error:', error)
  }
);
```

### `useProjectListener`

Hook to listen for project/view mode changes:

```typescript
export function useProjectListener(callback: (event: CustomEvent) => void) {
  useEffect(() => {
    window.addEventListener('projectSwitched', callback);
    window.addEventListener('viewModeChanged', callback);
    
    return () => {
      window.removeEventListener('projectSwitched', callback);
      window.removeEventListener('viewModeChanged', callback);
    };
  }, [callback]);
}
```

**Usage**:
```typescript
useProjectListener((event) => {
  console.log('Project changed:', event.detail.projectId);
  // Refetch data, update UI, etc.
});
```

---

## 6. Backend Enhancements

### Enhanced `getAllTickets` Controller

**Location**: `backend/src/controllers/ticketController.ts`

#### Changes Made:

1. **Project Context Support**
```typescript
const projectContext = (req as any).projectContext;

if (projectContext) {
  if (projectContext.viewMode === 'single' && projectContext.currentProjectId) {
    query['metadata.projectId'] = new mongoose.Types.ObjectId(projectContext.currentProjectId);
  } else if (projectContext.viewMode === 'unified' && !projectContext.isAdmin) {
    query['metadata.projectId'] = {
      $in: projectContext.accessibleProjectIds.map(id => new mongoose.Types.ObjectId(id))
    };
  }
}
```

2. **Pagination Support**
```typescript
const page = parseInt(req.query.page as string) || 1;
const limit = parseInt(req.query.limit as string) || 20;
const skip = (page - 1) * limit;

const totalTickets = await Ticket.countDocuments(query);

const tickets = await Ticket.find(query)
  .skip(skip)
  .limit(limit);
```

3. **Advanced Filtering**
```typescript
// Status filter
if (statusFilter && statusFilter.length > 0) {
  query.status = { $in: statusFilter };
}

// Priority filter
if (priorityFilter && priorityFilter.length > 0) {
  query.priority = { $in: priorityFilter };
}

// Search
if (searchQuery) {
  query.$or = [
    { ticketNumber: { $regex: searchQuery, $options: 'i' } },
    { title: { $regex: searchQuery, $options: 'i' } },
    { description: { $regex: searchQuery, $options: 'i' } }
  ];
}

// Project IDs filter (for unified view multi-select)
if (projectIdsFilter && projectIdsFilter.length > 0) {
  query['metadata.projectId'] = {
    $in: projectIdsFilter.map(id => new mongoose.Types.ObjectId(id))
  };
}
```

4. **Enhanced Response**
```typescript
return res.status(200).json({
  success: true,
  data: {
    tickets: ticketsWithProject,
    pagination: {
      total: totalTickets,
      page,
      limit,
      totalPages: Math.ceil(totalTickets / limit)
    }
  }
});
```

5. **Project Population**
```typescript
.populate('metadata.projectId', 'name code branding')
```
Ensures project details are included in response.

### Updated Routes

**Location**: `backend/src/routes/tickets.ts`

```typescript
import { attachProjectContext } from '../middleware/projectScope';

router.get(
  '/',
  authMiddleware,
  attachProjectContext,  // NEW
  checkPermission('TICKET_VIEW_ALL'),
  getAllTickets
);
```

---

## 7. Integration Guide

### Step 1: Import Components

```typescript
import { UnifiedTicketsList } from '@/components/UnifiedTicketsList';
import { UnifiedDashboard } from '@/components/UnifiedDashboard';
import { KnowledgeBaseWithProjectSelector } from '@/components/KnowledgeBaseWithProjectSelector';
```

### Step 2: Add Routes

```typescript
// In your router setup
<Route path="/tickets" element={<UnifiedTicketsList />} />
<Route path="/dashboard" element={<UnifiedDashboard />} />
<Route path="/knowledge-base" element={<KnowledgeBaseWithProjectSelector />} />
```

### Step 3: Update Navigation

**DashboardLayout.tsx**:
```typescript
import { useProjectContext } from '@/contexts/ProjectContext';

function DashboardLayout() {
  const { viewMode, currentProjectId } = useProjectContext();
  
  return (
    <>
      <HeaderProjectSwitcher /> {/* Already integrated */}
      <ViewModeToggle /> {/* Already integrated */}
      
      <nav>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/tickets">
          {viewMode === 'unified' ? 'All Tickets' : 'Tickets'}
        </NavLink>
        <NavLink to="/knowledge-base">Knowledge Base</NavLink>
      </nav>
      
      <Outlet />
    </>
  );
}
```

### Step 4: Custom Component Example

```typescript
import { useProjectData } from '@/hooks/useProjectData';

function CustomComponent() {
  const { data, loading, error } = useProjectData('/api/custom-endpoint', {
    params: { filter: 'value' }
  });
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      {data?.items?.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

---

## 8. Testing

### Manual Testing Checklist

#### Unified Tickets List
- [ ] Switch to unified mode
- [ ] Verify tickets from all projects appear
- [ ] Each ticket shows correct project badge
- [ ] Filter by specific projects (multi-select)
- [ ] Filter by status
- [ ] Filter by priority
- [ ] Search by ticket number, title, description
- [ ] Clear all filters
- [ ] Pagination works correctly
- [ ] Click ticket navigates to detail page
- [ ] Project context maintained on detail page

#### Unified Dashboard
- [ ] Switch to unified mode
- [ ] Top KPI cards show aggregated stats
- [ ] Project breakdown cards display correctly
- [ ] Each project card shows accurate counts
- [ ] Click project card switches to single view
- [ ] Status distribution chart renders correctly
- [ ] Priority distribution chart renders correctly
- [ ] Time range selector updates data
- [ ] Refresh button works

#### Knowledge Base
- [ ] **Single mode**: KB loads for current project
- [ ] **Unified mode**: Project selector appears
- [ ] Select project loads its KB
- [ ] Back button returns to project selector
- [ ] Search filters articles
- [ ] Category filter works
- [ ] Featured filter works
- [ ] Articles display correctly with badges

#### Custom Hooks
- [ ] `useProjectData` includes viewMode in requests
- [ ] `useProjectData` includes projectId in single mode
- [ ] `useTickets` pagination works
- [ ] `useTickets` filters work
- [ ] `useDashboardStats` timeRange works
- [ ] `useProjectMutation` includes projectId
- [ ] `useProjectListener` detects project switches

### Backend Testing

#### API Endpoints

**Test Tickets Endpoint**:
```bash
# Single mode
GET /api/tickets?viewMode=single&projectId=123&page=1&limit=20

# Unified mode (user with 2 projects)
GET /api/tickets?viewMode=unified&page=1&limit=20

# Unified mode with project filter
GET /api/tickets?viewMode=unified&projectIds=123,456&page=1

# With status filter
GET /api/tickets?viewMode=unified&status=1,2&page=1

# With search
GET /api/tickets?viewMode=unified&search=login&page=1
```

**Test Dashboard Endpoint**:
```bash
# Single mode
GET /api/dashboard/statistics?viewMode=single&projectId=123&timeRange=30days

# Unified mode
GET /api/dashboard/statistics?viewMode=unified&timeRange=30days
```

**Test KB Endpoint**:
```bash
# Always requires projectId
GET /api/knowledge-base/articles?projectId=123&category=authentication&search=password
```

#### Expected Behaviors

**Single Mode**:
- ✅ Data filtered to specific project
- ✅ Project ID in all responses
- ✅ No cross-project data leakage

**Unified Mode (Non-Admin)**:
- ✅ Data from accessible projects only
- ✅ No data from inaccessible projects
- ✅ Project badges show correct projects

**Unified Mode (Admin)**:
- ✅ See all projects
- ✅ Empty accessibleProjectIds indicates admin
- ✅ No filters applied to project scope

### Performance Testing

#### Metrics to Monitor

**Unified Tickets List**:
- Load time with 1000+ tickets
- Filter response time
- Pagination performance
- Search query speed

**Unified Dashboard**:
- Aggregation query time
- Chart rendering time
- Project breakdown calculation

**Knowledge Base**:
- Article search performance
- Category filtering speed
- Featured article queries

#### Optimization Strategies

1. **Add Indexes**:
```javascript
// In Ticket model
ticketSchema.index({ 'metadata.projectId': 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ priority: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ ticketNumber: 1 });
ticketSchema.index({ title: 'text', description: 'text' });
```

2. **Implement Caching**:
```typescript
// Cache dashboard stats for 5 minutes
const cacheKey = `dashboard:${viewMode}:${projectId}:${timeRange}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... fetch and cache
await redis.setex(cacheKey, 300, JSON.stringify(stats));
```

3. **Lazy Loading**:
```typescript
// Load project badges on demand
const { data: project } = useProjectData(`/api/projects/${projectId}`, {
  params: {},
  dependencies: []
});
```

---

## Summary

### Completed Features

✅ **Single Project View** (5.1)
- Automatic filtering by project
- All existing features work
- Context maintained across navigation

✅ **Unified Tickets List** (5.2)
- Multi-project display with badges
- Advanced filtering (project, status, priority)
- Search functionality
- Pagination
- Click navigation with context

✅ **Unified Dashboard** (5.3)
- Aggregated KPI cards
- Project breakdown cards
- Comparative charts (status, priority)
- Time range selector
- Drill-down to single project

✅ **Knowledge Base** (5.4)
- Project-specific approach
- Single mode: direct access
- Unified mode: project selector
- Full search and filtering
- Featured articles support

✅ **Custom Hooks**
- `useProjectData` - Generic data fetching
- `useTickets` - Tickets with pagination/filtering
- `useDashboardStats` - Dashboard statistics
- `useKnowledgeBase` - KB articles
- `useProjectMutation` - Create/update data
- `useProjectListener` - Event listening

✅ **Backend Enhancements**
- Enhanced `getAllTickets` controller
- Pagination support
- Advanced filtering
- Project population
- Updated routes with middleware

### Files Created/Modified

**New Files**:
1. `frontend/src/hooks/useProjectData.ts` - Custom hooks (250 lines)
2. `frontend/src/components/UnifiedTicketsList.tsx` - Unified tickets (650 lines)
3. `frontend/src/components/UnifiedDashboard.tsx` - Unified dashboard (500 lines)
4. `frontend/src/components/KnowledgeBaseWithProjectSelector.tsx` - KB with selector (600 lines)
5. `docs/PHASE_5_VIEW_SPECIFIC_IMPLEMENTATIONS.md` - This documentation (1200+ lines)

**Modified Files**:
1. `backend/src/controllers/ticketController.ts` - Enhanced getAllTickets
2. `backend/src/routes/tickets.ts` - Added attachProjectContext middleware

### Next Steps

**Phase 6: Polish & Performance** (Future):
- [ ] Add loading skeletons
- [ ] Implement virtual scrolling for large lists
- [ ] Add Redis caching
- [ ] Optimize database queries
- [ ] Add error boundaries
- [ ] Implement retry logic
- [ ] Add analytics tracking
- [ ] Create user onboarding tour

**Phase 7: Advanced Features** (Future):
- [ ] Real-time updates with WebSockets
- [ ] Advanced analytics dashboard
- [ ] Custom report builder
- [ ] Export to Excel/PDF
- [ ] Bulk actions UI
- [ ] Saved filters/views
- [ ] Dashboard customization
- [ ] Mobile responsive improvements

---

**End of Phase 5 Documentation**
