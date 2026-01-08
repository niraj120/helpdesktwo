# Permission-Based Menu System Migration Guide

## Overview

The DashboardLayout sidebar has been refactored from a **module-access-based system** to a **permission-based system**. This eliminates hardcoded role checks and makes the UI completely dynamic based on user permissions.

## What Changed

### Before (Module Access Based)
```typescript
// OLD APPROACH - localStorage moduleAccess
const moduleAccessStr = localStorage.getItem('moduleAccess');
const moduleAccess = JSON.parse(moduleAccessStr);

if (moduleAccess.tickets) {
  // Show tickets menu
}
if (moduleAccess.users) {
  // Show users menu
}
```

**Problems:**
- Required backend to set `moduleAccess` object
- Intermediate abstraction layer (not direct)
- Hardcoded boolean flags for each module
- Adding new modules required code changes in multiple places

### After (Permission Based)
```typescript
// NEW APPROACH - Direct permission checks
const { permissions } = usePermissions();
const menuItems = getFilteredMenuItems(menuConfig, permissions);

// Menu config with permission requirements
{
  path: '/tickets',
  label: 'Tickets',
  modulePrefix: 'TICKET_', // Shows if user has ANY permission starting with TICKET_
}
```

**Benefits:**
- ✅ Direct permission checking (no intermediate layer)
- ✅ Centralized menu configuration
- ✅ Dynamic menu based on actual permissions
- ✅ No hardcoded role checks
- ✅ Easy to add new menu items

## File Structure

### New Files Created

1. **`frontend/src/config/menuConfig.tsx`** - Complete menu configuration
   - `menuConfig` - Super admin menu items (full system)
   - `projectPortalMenuConfig` - Project portal menu items (agents/managers)
   - `hasMenuItemPermission()` - Helper to check permissions
   - `getFilteredMenuItems()` - Filter menu based on permissions

2. **`frontend/PERMISSION_BASED_MENU_MIGRATION.md`** - This documentation

### Modified Files

1. **`frontend/src/components/DashboardLayout.tsx`**
   - Added `usePermissions()` hook
   - Removed old `moduleAccess` logic
   - Imported menu config from centralized file
   - Uses `getFilteredMenuItems()` to dynamically filter menu
   - Updated logout to clear permissions

## Menu Configuration Structure

### MenuItem Interface

```typescript
interface MenuItem {
  path?: string;                  // Route path (optional for parent items with subItems)
  icon: ReactNode;                // React icon component
  label: string;                  // English label
  labelHi?: string;               // Hindi label (optional)
  labelMr?: string;               // Marathi label (optional)
  permission?: string | string[]; // Required permission(s)
  requireAll?: boolean;           // If true with array, requires ALL permissions (AND logic)
  modulePrefix?: string;          // Alternative: check if user has any permission with this prefix
  subItems?: MenuItem[];          // Nested menu items
  isProjectRoute?: boolean;       // If true, this route is for project portal only
}
```

### Permission Check Logic

Three ways to define permission requirements:

#### 1. Module Prefix (Recommended for modules)
```typescript
{
  path: '/users',
  label: 'User Management',
  modulePrefix: 'USER_', // User has ANY permission starting with USER_
}
```
Shows menu if user has **any** of: `USER_VIEW_ALL`, `USER_CREATE`, `USER_EDIT`, `USER_DELETE`, etc.

#### 2. Single Permission
```typescript
{
  path: '/master-data',
  label: 'Master Data',
  permission: 'MASTER_DATA_VIEW',
}
```
Shows menu only if user has exactly `MASTER_DATA_VIEW`.

#### 3. Multiple Permissions (OR Logic by default)
```typescript
{
  path: '/knowledge-base',
  label: 'Knowledge Base',
  permission: ['KB_VIEW', 'KB_CREATE', 'KB_EDIT'], // User needs ANY one
}
```
Shows menu if user has **any one** of the listed permissions.

#### 4. Multiple Permissions (AND Logic)
```typescript
{
  path: '/advanced-settings',
  label: 'Advanced Settings',
  permission: ['SETTINGS_VIEW', 'SETTINGS_ADVANCED'],
  requireAll: true, // User needs ALL permissions
}
```
Shows menu only if user has **all** listed permissions.

#### 5. No Permission (Public/Dashboard)
```typescript
{
  path: '/dashboard',
  label: 'Dashboard',
  // No permission field = visible to all authenticated users
}
```

## Current Menu Configuration

### Super Admin Menu (Main System)

| Menu Item | Permission Requirement | Notes |
|-----------|------------------------|-------|
| Dashboard | None | Visible to all authenticated users |
| Project Management | `PROJECT_*` (module prefix) | Any project permission |
| Master Data | `MASTER_DATA_VIEW` | Specific permission |
| RBAC Setup | `RBAC_*` (module prefix) | Any RBAC permission |
| User Management | `USER_*` (module prefix) | Any user permission |
| Ticket Configuration | `TICKET_CONFIG_VIEW` or category/status/priority manage | OR logic |
| Offline Module Setup | `OFFLINE_*` (module prefix) | Any offline permission |
| Approval Process | `APPROVAL_*` (module prefix) | Any approval permission |
| SLA & Escalation | `SLA_*` (module prefix) | Any SLA permission |
| Knowledge Base | `KB_VIEW` or `KB_CREATE` or `KB_EDIT` | OR logic |
| Integrations | `INTEGRATION_*` (module prefix) | Any integration permission |
| Reports | `REPORT_*` (module prefix) | Any report permission |
| **Audit Logs** (parent) | `AUDIT_VIEW_ACTIVITY` or `AUDIT_VIEW_ACCESS` | OR logic |
| └─ Activity Logs | `AUDIT_VIEW_ACTIVITY` | Specific permission |
| └─ Access Logs | `AUDIT_VIEW_ACCESS` | Specific permission |
| └─ Blocked Emails | `AUDIT_VIEW_BLOCKED_EMAILS` | Specific permission |
| └─ Email Failures | `AUDIT_VIEW_EMAIL_FAILURES` | Specific permission |
| └─ Integration Failures | `AUDIT_VIEW_INTEGRATION_FAILURES` | Specific permission |
| └─ Webhook Failures | `AUDIT_VIEW_WEBHOOK_FAILURES` | Specific permission |
| └─ Chat Webhook Failures | `AUDIT_VIEW_CHAT_WEBHOOK_FAILURES` | Specific permission |

### Project Portal Menu (Agents/Managers)

| Menu Item | Permission Requirement | Path Pattern |
|-----------|------------------------|--------------|
| Dashboard | None | `/{customUrlPath}/portal/dashboard` |
| Tickets | `TICKET_*` (module prefix) | `/{customUrlPath}/portal/tickets` |
| Knowledge Base | `KB_VIEW` or `KB_CREATE` | `/{customUrlPath}/portal/knowledge-base` |
| Offline Support | `OFFLINE_*` (module prefix) | `/{customUrlPath}/portal/offline` |
| User Management | `USER_*` (module prefix) | `/{customUrlPath}/portal/users` |
| Audit Logs | `AUDIT_VIEW_ACTIVITY` or `AUDIT_VIEW_ACCESS` | `/{customUrlPath}/portal/audit` |

## Usage Examples

### Adding a New Menu Item

```typescript
// In frontend/src/config/menuConfig.tsx

export const menuConfig: MenuItem[] = [
  // ... existing items
  
  // Add new menu item
  {
    path: '/analytics',
    icon: <MdAnalytics />,
    label: 'Analytics',
    labelHi: 'विश्लेषण',
    labelMr: 'विश्लेषण',
    modulePrefix: 'ANALYTICS_', // User needs any ANALYTICS_* permission
  },
];
```

That's it! No other code changes needed. The menu will automatically show/hide based on permissions.

### Adding a Submenu

```typescript
{
  icon: <MdSettings />,
  label: 'System Settings',
  permission: 'SETTINGS_VIEW', // Parent requires this permission
  subItems: [
    {
      path: '/settings/general',
      icon: <MdSettingsApplications />,
      label: 'General Settings',
      permission: 'SETTINGS_GENERAL',
    },
    {
      path: '/settings/email',
      icon: <MdEmail />,
      label: 'Email Configuration',
      permission: 'SETTINGS_EMAIL',
    },
  ],
}
```

Submenu behavior:
- Parent item shows only if user has at least one visible sub-item
- Each sub-item has its own permission requirement
- User sees only the sub-items they have permission for

### Creating Custom Permission Checks

For complex scenarios, you can use the `usePermissions` hook directly:

```typescript
import { usePermissions } from '../hooks/usePermissions';

function MyComponent() {
  const { hasPermission, hasAnyPermission, hasModuleAccess } = usePermissions();
  
  // Single permission check
  if (hasPermission('USER_DELETE')) {
    // Show delete button
  }
  
  // Multiple permissions (OR logic)
  if (hasAnyPermission(['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN'])) {
    // Show tickets section
  }
  
  // Module-level check
  if (hasModuleAccess('AUDIT_')) {
    // Show audit features
  }
}
```

## Migration Checklist

For migrating from old `moduleAccess` system to new permission-based system:

### Backend Changes
- [ ] ✅ Ensure JWT tokens include `role.permissions` array
- [ ] ✅ Backend APIs protected with `checkPermission` middleware
- [ ] Remove `moduleAccess` from login response (no longer needed)

### Frontend Changes
- [ ] ✅ Created `menuConfig.tsx` with complete menu structure
- [ ] ✅ Updated `DashboardLayout.tsx` to use `usePermissions()`
- [ ] ✅ Removed `moduleAccess` localStorage dependency
- [ ] Update login components to use `PermissionContext`
- [ ] Remove hardcoded role checks from other components

### Testing
- [ ] Test with Super Admin (should see all menus)
- [ ] Test with Manager (should see user/ticket/report menus)
- [ ] Test with Agent (should see tickets/KB menus)
- [ ] Test with Student (should see only own tickets)
- [ ] Verify submenu filtering works correctly
- [ ] Verify project portal menu filtering

## Best Practices

### 1. Use Module Prefix for Feature Groups
```typescript
// ✅ GOOD - Module prefix for related features
{
  path: '/tickets',
  label: 'Tickets',
  modulePrefix: 'TICKET_',
}
```

### 2. Use Specific Permission for Critical Actions
```typescript
// ✅ GOOD - Specific permission for sensitive action
{
  path: '/system-backup',
  label: 'System Backup',
  permission: 'SYSTEM_BACKUP_MANAGE',
}
```

### 3. Use OR Logic for Multiple Access Paths
```typescript
// ✅ GOOD - OR logic when multiple roles can access
{
  path: '/reports',
  label: 'Reports',
  permission: ['REPORT_VIEW_ALL', 'REPORT_VIEW_OWN'],
}
```

### 4. Consistent Permission Naming
```typescript
// ✅ GOOD - Follow MODULE_ACTION pattern
'TICKET_CREATE'
'TICKET_EDIT'
'TICKET_DELETE'
'TICKET_VIEW_ALL'
'TICKET_VIEW_OWN'
```

### 5. Add Translations for All Languages
```typescript
// ✅ GOOD - Support all languages
{
  path: '/users',
  label: 'User Management',
  labelHi: 'उपयोगकर्ता प्रबंधन',
  labelMr: 'वापरकर्ता व्यवस्थापन',
}
```

## Troubleshooting

### Menu Item Not Showing

**Check:**
1. User has required permission in JWT token
   ```javascript
   // In browser console
   const token = localStorage.getItem('authToken');
   const payload = JSON.parse(atob(token.split('.')[1]));
   console.log('Permissions:', payload.role.permissions);
   ```

2. Permission matches menu config exactly
   ```typescript
   // Check menuConfig.tsx
   permission: 'TICKET_VIEW_ALL', // Must match exact permission code
   ```

3. Module prefix is correct
   ```typescript
   modulePrefix: 'TICKET_', // Will match TICKET_VIEW_ALL, TICKET_CREATE, etc.
   ```

### Submenu Not Showing

**Check:**
1. At least one sub-item has matching permission
2. Parent item permission is not blocking access
3. Sub-item paths are correct

### Project Portal Menu Issues

**Check:**
1. `projectContext` exists in localStorage
2. `customUrlPath` is correctly extracted
3. Paths are properly constructed with portal prefix

## Performance Considerations

### Permission Caching
The `usePermissions` hook uses `useMemo` to cache permission checks:
```typescript
const permissions = useMemo(() => {
  return extractPermissionsFromToken();
}, [/* dependencies */]);
```

### Menu Filtering
Menu filtering happens once per render:
```typescript
const menuItems = getFilteredMenuItems(menuConfig, permissions);
```

### Optimization Tips
- Keep menu config static (don't regenerate on every render)
- Use module prefixes instead of listing all permissions
- Minimize submenu depth (max 2 levels recommended)

## Security Notes

### ⚠️ Important Security Considerations

1. **Frontend checks are for UX only**
   - Menu visibility is cosmetic
   - Backend APIs MUST validate permissions
   - Never rely on frontend for security

2. **Permission checks should match backend**
   - Use same permission codes in frontend and backend
   - Keep `permissions.ts` constants in sync with backend

3. **JWT token expiration**
   - Permissions are extracted from JWT
   - Expired tokens should redirect to login
   - Refresh token mechanism should update permissions

4. **Permission updates**
   - Changing user permissions requires re-login
   - Or implement permission refresh mechanism
   - Clear permissions on logout

## Future Enhancements

### Planned Features
- [ ] Real-time permission updates (WebSocket)
- [ ] Permission caching with TTL
- [ ] Menu item badges (e.g., notification counts)
- [ ] Menu search/filter functionality
- [ ] Customizable menu order per role
- [ ] Menu analytics (track usage patterns)

### API Integration
```typescript
// Future: Load menu config from backend
useEffect(() => {
  const fetchMenuConfig = async () => {
    const response = await api.get('/api/menu-config');
    setMenuItems(response.data);
  };
  fetchMenuConfig();
}, []);
```

## Support

For issues or questions:
1. Check this documentation
2. Review `FRONTEND_RBAC_GUIDE.md`
3. Review `RBAC_REFACTORING_SUMMARY.md`
4. Check browser console for permission errors
5. Verify backend API returns correct permissions

---

**Last Updated:** December 2024  
**Version:** 2.0 (Permission-Based System)  
**Previous Version:** 1.0 (Module-Access-Based System - Deprecated)
