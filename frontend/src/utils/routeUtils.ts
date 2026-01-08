import { menuConfig, MenuItem } from '../config/menuConfig';

/**
 * Get the first accessible route for a user based on their permissions
 * This is used to redirect users to their default page after login
 */
export const getDefaultRoute = (userPermissions: string[]): string => {
  // Default fallback if no permissions match
  const defaultRoute = '/dashboard';
  
  if (!userPermissions || userPermissions.length === 0) {
    return defaultRoute;
  }

  // Helper function to check if user has permission
  const hasPermission = (permission: string | string[] | undefined, requireAll?: boolean): boolean => {
    if (!permission) return true; // No permission required means accessible to all
    
    if (typeof permission === 'string') {
      return userPermissions.includes(permission);
    }
    
    // Array of permissions
    if (requireAll) {
      // AND logic - user must have ALL permissions
      return permission.every(p => userPermissions.includes(p));
    } else {
      // OR logic - user needs at least ONE permission
      return permission.some(p => userPermissions.includes(p));
    }
  };

  // Helper function to check module prefix
  const hasModulePermission = (modulePrefix: string | undefined): boolean => {
    if (!modulePrefix) return false;
    return userPermissions.some(p => p.startsWith(modulePrefix));
  };

  // Function to find first accessible route recursively
  const findFirstAccessibleRoute = (items: MenuItem[]): string | null => {
    for (const item of items) {
      // Skip items without paths
      if (!item.path && !item.subItems) continue;
      
      // Check if user has access to this item
      const hasAccess = item.permission 
        ? hasPermission(item.permission, item.requireAll)
        : item.modulePrefix
        ? hasModulePermission(item.modulePrefix)
        : true; // No permission = accessible to all
      
      if (hasAccess) {
        // If item has a direct path, return it
        if (item.path) {
          return item.path;
        }
        
        // If item has subItems, check those
        if (item.subItems) {
          const subRoute = findFirstAccessibleRoute(item.subItems);
          if (subRoute) return subRoute;
        }
      }
    }
    
    return null;
  };

  // Try to find first accessible route from menu config
  const firstRoute = findFirstAccessibleRoute(menuConfig);
  
  return firstRoute || defaultRoute;
};

/**
 * Check if user has any dashboard permission
 */
export const canAccessDashboard = (userPermissions: string[]): boolean => {
  // Dashboard is accessible if user has any dashboard-related permission
  // or if they have general access (no specific permission required in menu config)
  return true; // For now, dashboard is accessible to all authenticated users
};
