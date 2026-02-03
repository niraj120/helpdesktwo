# Project Mapping Standardization

## Overview
Standardized project access control to use **ONLY role-to-project mapping**. This simplifies the authorization model by removing user-to-project direct mappings.

## Architecture Change

### Before (Dual Mapping System)
- Users could be mapped to projects **directly** via `user.projects`
- Users could also access projects via their **role** through `role.projects`
- Access checks evaluated: `user.projects` OR `role.projects`
- Redundant and harder to maintain

### After (Single Mapping System)
- Users access projects **ONLY** through their assigned role
- Single source of truth: `role.projects`
- Access checks evaluate: `role.projects` only
- Simpler, cleaner, and easier to maintain

## Benefits

1. **Simplified Administration**: Assign a role to a project once, all users with that role automatically get access
2. **Reduced Redundancy**: No need to maintain separate user-project mappings
3. **Easier Maintenance**: One place to manage project access (role-to-project)
4. **Consistent Authorization**: All access checks follow the same pattern
5. **Better Scalability**: Adding new users means assigning a role, not mapping individual projects

## Changes Made

### 1. Middleware - `projectScope.ts`

#### `attachProjectContext()`
**Before**: Combined user.projects and role.projects
```typescript
const userProjects = user.projects || [];
const roleProjects = fullRole?.projects || [];
const allProjectIds = [...userProjects.map(...), ...roleProjects.map(...)];
```

**After**: Uses only role.projects
```typescript
const roleProjects = fullRole?.projects || [];
const uniqueProjectIds = roleProjects.map((p: any) => p._id?.toString() || p.toString());
```

#### `requireProjectAccess()`
**Before**: Checked both user and role
```typescript
const userHasProject = userProjects.some(...);
const roleHasProject = roleProjects.some(...);
if (userHasProject || roleHasProject) { next(); }
```

**After**: Checks only role
```typescript
const roleHasProject = roleProjects.some(...);
if (roleHasProject) { next(); }
```

#### `hasProjectAccess()`
**Before**: Checked user direct access first, then role
```typescript
const hasDirectAccess = userProjects.some(...);
if (hasDirectAccess) return true;
// Then check role...
```

**After**: Checks only role
```typescript
const roleProjects = role.projects || [];
return roleProjects.some((p: any) => p.toString() === projectId);
```

#### `getUserAccessibleProjects()`
**Before**: Combined both sources
```typescript
userProjects.forEach(p => projectSet.add(p.toString()));
role.projects.forEach(p => projectSet.add(p.toString()));
```

**After**: Returns only role projects
```typescript
return role.projects.map((p: any) => p.toString());
```

---

### 2. Authentication - `authController.ts`

#### Login Authorization
**Before**: Checked `user.projects`
```typescript
const isAuthorized = user.projects?.some(
  (pid) => pid.toString() === projectId.toString()
);
```

**After**: Checks `role.projects`
```typescript
const userRole = await Role.findById(user.role._id).populate('projects');
const isAuthorized = userRole?.projects?.some(
  (pid: any) => pid.toString() === projectId.toString()
);
```

#### JWT Generation
**Before**: Used `user.projects` for project context
```typescript
if (user.projects && user.projects.length > 0) {
  const userProject = await Project.findById(user.projects[0]);
}
```

**After**: Uses `role.projects`
```typescript
if (userRole?.projects && userRole.projects.length > 0) {
  const roleProject = await Project.findById(userRole.projects[0]);
}
```

#### Response Payload
**Before**: Returned `user.projects`
```typescript
projects: user.projects
```

**After**: Returns `role.projects`
```typescript
projects: userRole?.projects || []
```

---

### 3. JWT Middleware - `auth.ts`

**Before**: Included `user.projects` in JWT payload
```typescript
projects: user.projects || []
```

**After**: Includes `role.projects`
```typescript
projects: user.role?.projects || []
```

---

### 4. Search Controller - `searchController.ts`

**Before**: Built project map from `user.projects`
```typescript
const userProjects = (userObj.projects as any[]) || [];
userProjects.forEach(project => {
  results.push({ projectId: project._id.toString(), ... });
});
```

**After**: Uses `role.projects`
```typescript
const roleProjects = ((userObj.role as any)?.projects as any[]) || [];
roleProjects.forEach(project => {
  results.push({ projectId: project._id.toString(), ... });
});
```

---

## Migration Notes

### Database Schema
The `User` model still has the `projects` field for backward compatibility, but it's **no longer used** in authorization logic. Consider:
1. Marking `user.projects` as deprecated in schema
2. Creating a migration script to clear existing `user.projects` data
3. Removing the field entirely in a future major version

### Frontend Updates
If frontend code references `user.projects`, update it to use `user.role.projects` instead.

### Testing Checklist
- ✅ Login with role-to-project mapping
- ✅ Project access middleware with role-based permissions
- ✅ Search functionality with role-based access control
- ✅ JWT token generation includes correct role projects
- ✅ Users with different roles accessing different projects
- ✅ Admin users still have access to all projects

---

## Example Workflow

### Scenario: Granting Project Access

**Before (Dual System)**:
1. Create/update role and map to projects
2. Also assign user directly to projects
3. Two places to manage, easy to get out of sync

**After (Single System)**:
1. Create/update role and map to projects
2. Assign role to user
3. User automatically inherits project access from role ✅

### Scenario: Removing Project Access

**Before**:
1. Remove project from role
2. Also remove project from all users
3. Manual, error-prone

**After**:
1. Remove project from role
2. All users with that role automatically lose access ✅
3. Automatic, consistent

---

## Error Messages

Updated error messages to reflect role-based access:

**Before**: "You do not have access to this project"
**After**: "Your role does not have access to this project"

This makes it clearer that access is role-based.

---

## Related Files Modified

1. `backend/src/middleware/projectScope.ts` - 4 functions updated
2. `backend/src/controllers/authController.ts` - 5 locations updated
3. `backend/src/middleware/auth.ts` - JWT payload updated
4. `backend/src/controllers/searchController.ts` - Project access logic updated

---

## Backward Compatibility

This change is **backward compatible** in the sense that:
- No database migrations are required immediately
- The `user.projects` field still exists (just not used)
- All role-to-project mappings work as before
- Existing JWT tokens will be regenerated on next login

However, any **direct user-to-project mappings** in the database are now **ignored**. If you had users directly mapped to projects (without role), they will lose that access until their role is mapped to those projects.

---

## Date
Implemented: 2024

## Status
✅ Complete - All changes applied and tested
