# Multi-Tenant Project-Scoped Role Implementation Guide

## Overview
This system supports **multi-tenant architecture** where:
- ✅ A role can be mapped to multiple projects
- ✅ A user has ONE role but can access multiple projects
- ✅ SubAdmins can manage specific projects (not all)
- ✅ Super Admin has access to all projects

## Architecture

### Database Schema

**User Model:**
```typescript
{
  email: string,
  role: ObjectId,              // Single role reference
  projects: ObjectId[],        // Array of projects user can access
  centers: ObjectId[],         // Array of centers user can access
  // ... other fields
}
```

**Role Model:**
```typescript
{
  name: string,
  code: string,
  type: 'system' | 'custom',
  projects: ObjectId[],        // Array of projects this role is scoped to
  permissions: ObjectId[],     // Array of permissions
  // ... other fields
}
```

## Implementation Steps

### Step 1: Create SubAdmin Role for Specific Projects

```javascript
// Example: Create a SubAdmin role for 5 specific projects
const projectIds = [
  '507f1f77bcf86cd799439011',  // Project 1
  '507f1f77bcf86cd799439012',  // Project 2
  '507f1f77bcf86cd799439013',  // Project 3
  '507f1f77bcf86cd799439014',  // Project 4
  '507f1f77bcf86cd799439015',  // Project 5
];

const subAdminRole = await Role.create({
  name: 'Regional SubAdmin',
  code: 'REGIONAL_SUBADMIN',
  type: 'custom',
  projects: projectIds,  // Scope this role to 5 projects
  permissions: [
    // Add required permissions
    permissionIds.USER_VIEW,
    permissionIds.USER_CREATE,
    permissionIds.USER_EDIT,
    permissionIds.CENTER_VIEW,
    permissionIds.CENTER_MANAGE,
    permissionIds.ASSET_MANAGE,
    permissionIds.QUERY_VIEW,
    permissionIds.QUERY_MANAGE,
    // ... etc
  ],
  isActive: true,
});
```

### Step 2: Assign User to SubAdmin Role and Projects

```javascript
// Create/Update user with SubAdmin role
const subAdmin = await User.create({
  email: 'subadmin@example.com',
  firstName: 'Regional',
  lastName: 'Manager',
  role: subAdminRole._id,         // Assign the SubAdmin role
  projects: projectIds,            // Assign same 5 projects to user
  isActive: true,
  // ... other fields
});
```

### Step 3: Protect Routes with Project Scope

**Option A: Middleware-based (Recommended)**

```typescript
import { requireProjectAccess } from '../middleware/projectScope';

// Protect route - checks projectId from params/query/body
router.get(
  '/centers',
  authMiddleware,
  requireProjectAccess(),  // Validates project access
  checkPermission('CENTER_VIEW'),
  getCenters
);

// Custom field name
router.get(
  '/reports/:reportProjectId',
  authMiddleware,
  requireProjectAccess('reportProjectId'),
  getReport
);
```

**Option B: Manual check in controller**

```typescript
import { canAccessProject } from '../middleware/projectScope';

export const getCenters = async (req: AuthRequest, res: Response) => {
  const { projectId } = req.query;
  const userId = req.user?.userId;

  // Manual project access check
  const hasAccess = await canAccessProject(userId, projectId);
  if (!hasAccess) {
    return res.status(403).json({
      success: false,
      message: 'You do not have access to this project'
    });
  }

  // Continue with logic...
};
```

### Step 4: Filter Data by User's Projects

```typescript
import { getUserAccessibleProjects } from '../middleware/projectScope';

export const listAllCenters = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  
  // Get projects user can access
  const accessibleProjects = await getUserAccessibleProjects(userId);
  
  let query: any = {};
  
  if (accessibleProjects.length > 0) {
    // SubAdmin - filter by accessible projects
    query.projectId = { $in: accessibleProjects };
  }
  // If empty array returned = Super Admin = no filter needed
  
  const centers = await Center.find(query);
  
  return res.json({ success: true, data: centers });
};
```

## Usage Examples

### Example 1: Regional Manager (5 Projects)

```javascript
// 1. Create role scoped to 5 projects
const regionalRole = await Role.create({
  name: 'Regional Manager',
  code: 'REGIONAL_MANAGER',
  projects: [project1, project2, project3, project4, project5],
  permissions: [/* relevant permissions */],
});

// 2. Create user
const manager = await User.create({
  email: 'manager@region1.com',
  role: regionalRole._id,
  projects: [project1, project2, project3, project4, project5],
});

// Result: Manager can only access data from these 5 projects
```

### Example 2: State Coordinator (All Projects in State)

```javascript
// Get all projects in Maharashtra
const maharashtraProjects = await Project.find({ state: 'Maharashtra' });
const projectIds = maharashtraProjects.map(p => p._id);

const stateRole = await Role.create({
  name: 'Maharashtra State Coordinator',
  code: 'MH_STATE_COORDINATOR',
  projects: projectIds,  // All projects in Maharashtra
  permissions: [/* relevant permissions */],
});

const coordinator = await User.create({
  email: 'coordinator@maharashtra.gov.in',
  role: stateRole._id,
  projects: projectIds,
});
```

### Example 3: Route Protection

```typescript
// routes/centers.ts
router.get(
  '/',
  authMiddleware,
  requireProjectAccess(),  // Auto-checks projectId parameter
  checkPermission('CENTER_VIEW'),
  getCenters
);

// When SubAdmin calls: GET /api/centers?projectId=507f1f77bcf86cd799439011
// ✅ Allowed if project in their scope
// ❌ Forbidden if project not in their scope
```

## API Usage

### Creating SubAdmin via API

```http
POST /api/roles
Authorization: Bearer <SUPER_ADMIN_TOKEN>
Content-Type: application/json

{
  "name": "Regional SubAdmin",
  "code": "REGIONAL_SUBADMIN",
  "type": "custom",
  "projects": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013",
    "507f1f77bcf86cd799439014",
    "507f1f77bcf86cd799439015"
  ],
  "permissions": ["USER_VIEW", "USER_CREATE", "CENTER_VIEW", ...]
}
```

### Assigning User to SubAdmin Role

```http
POST /api/users
Authorization: Bearer <SUPER_ADMIN_TOKEN>
Content-Type: application/json

{
  "email": "subadmin@example.com",
  "firstName": "Regional",
  "lastName": "Manager",
  "role": "6789abcd1234567890abcdef",  // SubAdmin role ID
  "projects": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013",
    "507f1f77bcf86cd799439014",
    "507f1f77bcf86cd799439015"
  ],
  "password": "SecurePassword123!",
  "isActive": true
}
```

## Frontend Implementation

### Fetch User's Projects

```typescript
// Get current user's accessible projects
const fetchUserProjects = async () => {
  const response = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  
  const projects = data.user.projects;
  // Use for dropdown/filter
};
```

### Project Selector Component

```tsx
const ProjectSelector = () => {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState('');
  
  useEffect(() => {
    // Fetch only projects accessible to current user
    fetchAccessibleProjects().then(setProjects);
  }, []);
  
  return (
    <select value={selected} onChange={e => setSelected(e.target.value)}>
      <option value="">Select Project</option>
      {projects.map(p => (
        <option key={p._id} value={p._id}>{p.name}</option>
      ))}
    </select>
  );
};
```

## Key Constraints

1. **One Role Per User**: Each user has exactly ONE role
2. **Multiple Projects Per Role**: A role can be scoped to multiple projects
3. **Multiple Projects Per User**: A user can access multiple projects
4. **Access Logic**: User has access to project if:
   - User's `projects` array contains the project ID, OR
   - User's role's `projects` array contains the project ID, OR
   - User is Super Admin (access all)

## Migration Script

If you need to migrate existing users/roles:

```javascript
// migrate-to-project-scope.js
const migrateToProjectScope = async () => {
  const Role = mongoose.model('Role');
  
  // Find all roles with old projectId field
  const roles = await Role.find({ projectId: { $exists: true } });
  
  for (const role of roles) {
    if (role.projectId && !role.projects?.length) {
      // Migrate: Move projectId to projects array
      role.projects = [role.projectId];
      await role.save();
      console.log(`Migrated role ${role.name}`);
    }
  }
  
  console.log('Migration complete!');
};
```

## Testing

```javascript
// Test project scope
describe('Project Scope Middleware', () => {
  it('should allow SubAdmin to access their projects', async () => {
    const res = await request(app)
      .get('/api/centers?projectId=507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${subAdminToken}`);
    
    expect(res.status).toBe(200);
  });
  
  it('should deny SubAdmin access to other projects', async () => {
    const res = await request(app)
      .get('/api/centers?projectId=999999999999999999999999')
      .set('Authorization', `Bearer ${subAdminToken}`);
    
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('do not have access');
  });
});
```

## Summary

✅ **What's Implemented:**
- Multi-tenant project scoping
- Role can be assigned to multiple projects
- User has single role but can access multiple projects
- Middleware to protect routes
- Helper functions for manual checks

✅ **Use Cases Supported:**
- Regional managers managing 5 projects
- State coordinators managing all projects in a state
- District officers managing projects in their district
- Super Admin managing everything

✅ **Security:**
- Automatic project scope validation
- Deny access by default
- Super Admin bypass for administration
