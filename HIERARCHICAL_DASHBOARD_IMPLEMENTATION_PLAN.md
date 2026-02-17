# Hierarchical Dashboard Implementation Plan

## Executive Summary
Implementing permission-based hierarchical dashboard views using user-to-user mapping (NOT role-based hierarchy). Zero breaking changes to existing functionality.

## Current State Analysis

### Existing Dashboard Logic (ticketController.ts - getDashboardStats)
```
Current Flow:
1. User authenticated → Get userId
2. Fetch user with role and permissions
3. Check permissions:
   - TICKET_VIEW_ALL → See all tickets in assigned projects/centers
   - TICKET_VIEW_OWN → See only tickets assigned to them
   - Neither → See only tickets they created
4. Apply project and center filters
5. Return aggregated stats + recent activity
```

### Existing Permission System
- Model: `Permission` (code, name, description, category, module)
- Model: `Role` (name, code, permissions[])  
- Middleware: `checkPermission()` - validates permission codes
- Current codes: `TICKET_VIEW_ALL`, `TICKET_VIEW_OWN`, `DASHBOARD_VIEW`

### Key Insight
✅ System ALREADY follows permission-based logic (not role-name checking)
❌ Missing: Team/hierarchy view permissions and user-to-user mapping

---

## Implementation Phases

### PHASE 1: Database Schema (Non-Breaking) ✓ SAFE

#### 1.1 Create `user_reporting_hierarchy` Table
```sql
CREATE TABLE user_reporting_hierarchy (
  _id ObjectId PRIMARY KEY,
  supervisor_user_id ObjectId REQUIRED INDEX,
  reportee_user_id ObjectId REQUIRED INDEX,
  project_id ObjectId INDEX,
  tenant_id ObjectId INDEX,
  hierarchy_level INT DEFAULT 1,
  relationship_type ENUM('direct_report', 'matrix', 'dotted_line') DEFAULT 'direct_report',
  is_active BOOLEAN DEFAULT TRUE,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  metadata JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  CONSTRAINT no_self_reporting CHECK (supervisor_user_id != reportee_user_id),
  UNIQUE INDEX idx_active_reportee (reportee_user_id, project_id, is_active) WHERE is_active = TRUE
)

INDEXES:
- idx_supervisor (supervisor_user_id, project_id, is_active)
- idx_reportee (reportee_user_id, project_id, is_active)
- idx_project (project_id, is_active)
```

#### 1.2 Create `user_dashboard_config` Table
```sql
CREATE TABLE user_dashboard_config (
  _id ObjectId PRIMARY KEY,
  user_id ObjectId REQUIRED UNIQUE INDEX,
  project_id ObjectId INDEX,
  default_view_mode ENUM('self', 'team', 'hierarchy', 'all') DEFAULT 'self',
  show_aggregated_counts BOOLEAN DEFAULT TRUE,
  show_individual_breakdown BOOLEAN DEFAULT FALSE,
  include_indirect_reportees BOOLEAN DEFAULT FALSE,
  max_hierarchy_depth INT DEFAULT -1,
  custom_filters JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

---

### PHASE 2: Add New Permissions ✓ SAFE

Add to `permissions` collection:

```json
[
  {
    "code": "DASHBOARD_VIEW_OWN",
    "name": "View Own Dashboard",
    "category": "dashboard",
    "module": "Dashboard",
    "description": "View own tickets dashboard"
  },
  {
    "code": "DASHBOARD_VIEW_TEAM",
    "name": "View Team Dashboard",  
    "category": "dashboard",
    "module": "Dashboard",
    "description": "View direct team members' dashboard aggregated"
  },
  {
    "code": "DASHBOARD_VIEW_HIERARCHY",
    "name": "View Full Hierarchy Dashboard",
    "category": "dashboard",
    "module": "Dashboard",
    "description": "View multi-level team hierarchy dashboard"
  },
  {
    "code": "DASHBOARD_VIEW_TEAM_BREAKDOWN",
    "name": "View Team Breakdown",
    "category": "dashboard",
    "module": "Dashboard",
    "description": "View individual team member breakdown"
  },
  {
    "code": "HIERARCHY_MANAGE_TEAM",
    "name": "Manage Team Hierarchy",
    "category": "rbac-setup",
    "module": "Team Management",
    "description": "Create and manage user reporting relationships"
  },
  {
    "code": "HIERARCHY_VIEW_TEAM",
    "name": "View Team Structure",
    "category": "rbac-setup",
    "module": "Team Management",
    "description": "View team reporting structure"
  }
]
```

---

### PHASE 3: Backend - Hierarchy Management ✓ NEW FEATURE

#### 3.1 Create Model: `UserReportingHierarchy.ts`
```typescript
export interface IUserReportingHierarchy extends Document {
  supervisorUserId: mongoose.Types.ObjectId;
  reporteeUserId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  hierarchyLevel: number;
  relationshipType: 'direct_report' | 'matrix' | 'dotted_line';
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  metadata?: any;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
}
```

#### 3.2 Create Controller: `hierarchyController.ts`

**Key Functions:**
```typescript
// 1. Create hierarchy mapping
export const createHierarchyMapping = async (req, res) => {
  // Validate users exist
  // Check circular dependency (CRITICAL!)
  // Deactivate old mapping
  // Create new mapping
  // Audit log
}

// 2. Get user's reportees
export const getUserReportees = async (req, res) => {
  // Direct reports only OR
  // Multi-level (recursive CTE)
}

// 3. Get user's supervisor chain
export const getUserSupervisors = async (req, res) => {
  // Get reporting chain up to top
}

// 4. Check circular dependency
const checkCircularDependency = async (supervisorId, reporteeId, projectId) => {
  // Use recursive query to check if supervisorId
  // reports (directly/indirectly) to reporteeId
}

// 5. Deactivate mapping
export const deactivateHierarchyMapping = async (req, res) => {
  // Set isActive = false
}
```

#### 3.3 Add Routes: `routes/hierarchy.ts`
```typescript
router.post('/hierarchy/mapping', 
  authMiddleware, 
  checkPermission('HIERARCHY_MANAGE_TEAM'), 
  createHierarchyMapping
);

router.get('/hierarchy/reportees/:userId',
  authMiddleware,
  checkPermission('HIERARCHY_VIEW_TEAM'),
  getUserReportees
);

// ... other routes
```

---

### PHASE 4: Enhanced Dashboard Logic ✓ BACKWARD COMPATIBLE

#### 4.1 Modify `getDashboardStats` Function

**NEW LOGIC (Keep existing code intact, add new paths):**

```typescript
export const getDashboardStats = async (req, res) => {
  const userId = (req as any).user?.userId;
  const { projectId, viewMode } = req.query; // Add viewMode param
  
  // EXISTING: Fetch user with permissions
  const user = await User.findById(userId)
    .populate({ path: 'role', populate: { path: 'permissions' }})
    .populate('centers')
    .populate('projects');
  
  // EXISTING: Extract permission codes
  const permissionCodes = (user.role as any)?.permissions.map(p => p.code);
  
  // NEW: Determine available view modes based on permissions
  const availableViewModes = [];
  if (permissionCodes.includes('DASHBOARD_VIEW_OWN')) {
    availableViewModes.push('self');
  }
  if (permissionCodes.includes('DASHBOARD_VIEW_TEAM')) {
    availableViewModes.push('team');
  }
  if (permissionCodes.includes('DASHBOARD_VIEW_HIERARCHY')) {
    availableViewModes.push('hierarchy');
  }
  if (permissionCodes.includes('TICKET_VIEW_ALL')) {
    availableViewModes.push('all');
  }
  
  // NEW: Get user's dashboard config (default view mode)
  const dashboardConfig = await UserDashboardConfig.findOne({ userId, isActive: true });
  const defaultViewMode = dashboardConfig?.defaultViewMode || 'self';
  
  // NEW: Determine actual view mode (param > config > default)
  const actualViewMode = viewMode || defaultViewMode || 'self';
  
  // Validate user has permission for requested view mode
  if (!availableViewModes.includes(actualViewMode)) {
    return res.status(403).json({
      success: false,
      message: `You don't have permission for ${actualViewMode} view`
    });
  }
  
  // NEW: Build user list based on view mode
  let targetUserIds: string[] = [];
  
  switch (actualViewMode) {
    case 'self':
      targetUserIds = [userId];
      break;
      
    case 'team':
      // Get direct reportees
      const directReportees = await UserReportingHierarchy.find({
        supervisorUserId: userId,
        projectId: projectId || { $exists: true },
        isActive: true,
        hierarchyLevel: 1
      }).select('reporteeUserId');
      
      targetUserIds = [
        userId,
        ...directReportees.map(r => r.reporteeUserId.toString())
      ];
      break;
      
    case 'hierarchy':
      // Get all reportees (recursive)
      const allReportees = await getReporteesRecursive(
        userId, 
        projectId,
        dashboardConfig?.maxHierarchyDepth || -1
      );
      
      targetUserIds = [userId, ...allReportees];
      break;
      
    case 'all':
      // No user filter (existing TICKET_VIEW_ALL logic)
      targetUserIds = null;
      break;
  }
  
  // EXISTING: Build query with project/center filters
  let query: any = {};
  
  // Apply project filter
  if (projectId) {
    query['metadata.projectId'] = new mongoose.Types.ObjectId(projectId);
  } else if (!isSuperAdmin) {
    query['metadata.projectId'] = { $in: userProjectIds };
  }
  
  // NEW: Apply user filter based on view mode
  if (targetUserIds !== null) {
    query.assignedTo = { $in: targetUserIds };
  }
  
  // Apply center filters (existing logic)
  // ... existing center filter code ...
  
  // EXISTING: Fetch aggregated stats
  const statsResult = await Ticket.aggregate([...]);
  
  // NEW: Fetch individual breakdown (if permission exists)
  let breakdown = null;
  if (permissionCodes.includes('DASHBOARD_VIEW_TEAM_BREAKDOWN') && 
      targetUserIds && targetUserIds.length > 1) {
    breakdown = await Ticket.aggregate([
      { $match: { ...query } },
      {
        $group: {
          _id: { assignedTo: '$assignedTo', status: '$status' },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id.assignedTo',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $lookup: {
          from: 'roles',
          localField: 'user.role',
          foreignField: '_id',
          as: 'role'
        }
      },
      {
        $project: {
          userId: '$_id.assignedTo',
          userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          roleName: { $arrayElemAt: ['$role.name', 0] },
          status: '$_id.status',
          count: 1
        }
      }
    ]);
  }
  
  // Return enhanced response
  return res.json({
    success: true,
    viewMode: actualViewMode,
    availableViewModes,
    stats: {
      // ... existing stats ...
    },
    breakdown, // NEW
    recentActivity: [...] // EXISTING
  });
}

// NEW: Helper function for recursive reportees
async function getReporteesRecursive(
  supervisorId: string, 
  projectId?: string,
  maxDepth: number = -1
): Promise<string[]> {
  const result = await UserReportingHierarchy.aggregate([
    {
      $match: {
        supervisorUserId: new mongoose.Types.ObjectId(supervisorId),
        isActive: true,
        ...(projectId && { projectId: new mongoose.Types.ObjectId(projectId) })
      }
    },
    {
      $graphLookup: {
        from: 'userreportinghierarchies',
        startWith: '$reporteeUserId',
        connectFromField: 'reporteeUserId',
        connectToField: 'supervisorUserId',
        as: 'hierarchy',
        maxDepth: maxDepth > 0 ? maxDepth - 1 : 99,
        restrictSearchWithMatch: { isActive: true }
      }
    },
    {
      $project: {
        allReportees: {
          $concatArrays: [
            ['$reporteeUserId'],
            '$hierarchy.reporteeUserId'
          ]
        }
      }
    },
    {
      $unwind: '$allReportees'
    },
    {
      $group: {
        _id: null,
        reportees: { $addToSet: '$allReportees' }
      }
    }
  ]);
  
  return result[0]?.reportees.map(id => id.toString()) || [];
}
```

---

### PHASE 5: Frontend - Dashboard Enhancement

#### 5.1 Add View Mode Selector Component

**File: `frontend/src/components/dashboard/ViewModeSelector.tsx`**

```typescript
interface ViewModeSelectorProps {
  currentMode: string;
  availableModes: string[];
  onChange: (mode: string) => void;
}

export const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  currentMode,
  availableModes,
  onChange
}) => {
  const modeLabels = {
    self: 'My Tickets',
    team: 'Team View',
    hierarchy: 'Full Hierarchy',
    all: 'All Tickets'
  };
  
  if (availableModes.length <= 1) {
    return null; // Don't show selector if only one option
  }
  
  return (
    <div className="view-mode-selector">
      {availableModes.map(mode => (
        <button
          key={mode}
          className={currentMode === mode ? 'active' : ''}
          onClick={() => onChange(mode)}
        >
          {modeLabels[mode]}
        </button>
      ))}
    </div>
  );
};
```

#### 5.2 Add Team Breakdown Table Component

**File: `frontend/src/components/dashboard/TeamBreakdown.tsx`**

```typescript
interface TeamMember {
  userId: string;
  userName: string;
  roleName: string;
  status: string;
  count: number;
}

interface TeamBreakdownProps {
  breakdown: TeamMember[];
}

export const TeamBreakdown: React.FC<TeamBreakdownProps> = ({ breakdown }) => {
  // Group by user, aggregate across statuses
  const userStats = breakdown.reduce((acc, item) => {
    if (!acc[item.userId]) {
      acc[item.userId] = {
        userName: item.userName,
        roleName: item.roleName,
        statuses: {}
      };
    }
    acc[item.userId].statuses[item.status] = item.count;
    return acc;
  }, {});
  
  return (
    <div className="team-breakdown">
      <h3>Team Member Breakdown</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Open</th>
            <th>In Progress</th>
            <th>Resolved</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(userStats).map(([userId, stats]) => (
            <tr key={userId}>
              <td>{stats.userName}</td>
              <td>{stats.roleName}</td>
              <td>{stats.statuses.open || 0}</td>
              <td>{stats.statuses.in_progress || 0}</td>
              <td>{stats.statuses.resolved || 0}</td>
              <td>{Object.values(stats.statuses).reduce((sum, v) => sum + v, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

#### 5.3 Enhance Dashboard.tsx

```typescript
import { ViewModeSelector } from '../components/dashboard/ViewModeSelector';
import { TeamBreakdown } from '../components/dashboard/TeamBreakdown';

const Dashboard = () => {
  const [viewMode, setViewMode] = useState('self');
  const [availableViewModes, setAvailableViewModes] = useState(['self']);
  const [teamBreakdown, setTeamBreakdown] = useState(null);
  
  const fetchDashboardStats = async () => {
    const url = `${API_CONFIG.API_URL}/tickets/dashboard-stats?projectId=${projectId}&viewMode=${viewMode}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
    const data = await response.json();
    
    setTicketStats(data.stats);
    setAvailableViewModes(data.availableViewModes);
    setViewMode(data.viewMode);
    setTeamBreakdown(data.breakdown);
  };
  
  return (
    <DashboardLayout>
      <ModuleHeader title="Dashboard" subtitle="Overview of your work" />
      
      <ViewModeSelector
        currentMode={viewMode}
        availableModes={availableViewModes}
        onChange={(mode) => {
          setViewMode(mode);
          fetchDashboardStats(); // Re-fetch with new mode
        }}
      />
      
      {/* Existing stats cards */}
      <div className="stats-cards">...</div>
      
      {/* NEW: Team breakdown (if available) */}
      {teamBreakdown && <TeamBreakdown breakdown={teamBreakdown} />}
      
      {/* Existing recent activity */}
      <div className="recent-activity">...</div>
    </DashboardLayout>
  );
};
```

---

### PHASE 6: Admin UI - Team Management

#### 6.1 Create Team Management Page

**File: `frontend/src/pages/TeamManagement.tsx`**

```typescript
const TeamManagement = () => {
  const [supervisors, setSupervisors] = useState([]);
  const [users, setUsers] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [selectedReportees, setSelectedReportees] = useState([]);
  
  const createMapping = async () => {
    for (const reporteeId of selectedReportees) {
      await fetch(`${API_CONFIG.API_URL}/hierarchy/mapping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          supervisorUserId: selectedSupervisor,
          reporteeUserId: reporteeId,
          projectId: currentProjectId
        })
      });
    }
    fetchMappings(); // Refresh
  };
  
  return (
    <DashboardLayout>
      <h2>Team Hierarchy Management</h2>
      
      <div className="mapping-form">
        <label>Supervisor:</label>
        <select value={selectedSupervisor} onChange={e => setSelectedSupervisor(e.target.value)}>
          <option value="">Select Supervisor</option>
          {supervisors.map(user => (
            <option key={user._id} value={user._id}>
              {user.firstName} {user.lastName} ({user.role.name})
            </option>
          ))}
        </select>
        
        <label>Reportees:</label>
        <MultiSelect
          options={users.filter(u => u._id !== selectedSupervisor)}
          value={selectedReportees}
          onChange={setSelectedReportees}
        />
        
        <button onClick={createMapping}>Create Mapping</button>
      </div>
      
      <div className="current-mappings">
        <h3>Current Mappings</h3>
        <table>
          <thead>
            <tr>
              <th>Supervisor</th>
              <th>Reportee</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map(mapping => (
              <tr key={mapping._id}>
                <td>{mapping.supervisor.firstName} ({mapping.supervisor.role.name})</td>
                <td>{mapping.reportee.firstName} ({mapping.reportee.role.name})</td>
                <td>{new Date(mapping.createdAt).toLocaleDateString()}</td>
                <td>
                  <button onClick={() => deactivateMapping(mapping._id)}>Deactivate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
};
```

---

## Testing Plan

### Test Scenario 1: Agent (No Team Permission)
- User: Agent role with only `DASHBOARD_VIEW_OWN`
- Expected: Dashboard shows only "My Tickets", no view selector
- Existing behavior maintained ✓

### Test Scenario 2: Manager with Team Permission
- User: Manager with `DASHBOARD_VIEW_TEAM`
- Setup: Create mapping Manager → 3 Agents
- Expected: View selector shows "My Tickets" and "Team View"
- Team view shows aggregated stats of manager + 3 agents

### Test Scenario 3: Senior Manager with Hierarchy
- User: Senior Manager with `DASHBOARD_VIEW_HIERARCHY`
- Setup: Senior Mgr → 2 Managers → 5 Agents each
- Expected: View selector includes "Full Hierarchy"
- Hierarchy view shows all 11 people's tickets aggregated

### Test Scenario 4: Role name independence
- Setup: Two roles "Project Hub" and "District Officer" both with `DASHBOARD_VIEW_TEAM`
- Expected: Both see team dashboard, logic works identically
- No hardcoded role name checks ✓

### Test Scenario 5: Circular Dependency Prevention
- Attempt: User A → User B → User C → User A
- Expected: System rejects with clear error message
- Database constraint prevents save

### Test Scenario 6: Permission Revocation
- Setup: Manager has team view, sees 10 people
- Action: Admin revokes `DASHBOARD_VIEW_TEAM` permission
- Expected: Manager now sees only own tickets, graceful degradation

### Test Scenario 7: Zero Breaking Changes
- User: Existing agent WITHOUT new permissions
- Expected: Dashboard works EXACTLY as before
- No new tables or permissions affect existing users

---

## Migration Steps

### Step 1: Database Migration
```bash
npm run migrate:hierarchy-tables
```

### Step 2: Add Permissions (Manual via Admin UI)
```
1. Login as Super Admin
2. Navigate to "Permissions" page
3. Add 6 new permissions (codes listed in Phase 2)
4. Save
```

### Step 3: Assign Permissions to Roles
```
1. Super Admin → Select role (e.g., "Project Manager")
2. Assign permissions:
   - DASHBOARD_VIEW_TEAM
   - DASHBOARD_VIEW_TEAM_BREAKDOWN
3. Save
```

### Step 4: Deploy Backend Code
```bash
cd backend
npm run build
pm2 restart backend
```

### Step 5: Deploy Frontend Code
```bash
cd frontend
npm run build
# Deploy build folder
```

### Step 6: Create Team Mappings (Manual via Team Management UI)
```
1. Login as user with HIERARCHY_MANAGE_TEAM permission
2. Navigate to "Team Management" page
3. Select Supervisor and Reportees
4. Create mappings
```

---

## Rollback Plan

If issues occur:
1. New tables are unused by existing code - no impact
2. New permissions are opt-in - no impact on users without them
3. Dashboard API changes are backward compatible (viewMode param optional)
4. Frontend changes show selector only if multiple view modes available
5. To fully rollback: Remove new permissions from all roles

---

## Performance Considerations

1. **Recursive Query Optimization**
   - Use $graphLookup with maxDepth limit
   - Add indexes on supervisor_user_id and reportee_user_id
   - Cache hierarchy structure (Redis) for frequently accessed users

2. **Dashboard Query Optimization**
   - Existing aggregation pipeline already optimized
   - New user filter adds minimal overhead (indexed assignedTo field)
   - Breakdown query runs only if permission exists

3. **Circular Dependency Check**
   - Runs only on mapping creation (not read operations)
   - Uses index-backed query
   - Limit recursion depth (e.g., max 10 levels)

---

## Success Criteria

✅ Agents see only own tickets (existing behavior preserved)
✅ Managers see team dashboard (new feature)
✅ Senior managers see hierarchy dashboard (new feature)
✅ All logic is permission-based (no role name checks)
✅ Zero breaking changes to existing functionality
✅ Circular dependencies prevented at database level
✅ Performance impact < 100ms for team queries
✅ Works across all projects/tenants without hardcoding

---

## Next Steps

1. Review and approve this plan
2. Create database migration scripts
3. Implement Phase by Phase
4. Test each phase before proceeding
5. Deploy to staging environment
6. User acceptance testing
7. Production deployment

