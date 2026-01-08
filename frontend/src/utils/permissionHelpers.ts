/**
 * Permission Utility Functions
 * Provides helper functions for permission management and checks
 */

/**
 * Store permissions in localStorage after login
 * @param permissions Array of permission codes
 */
export const storePermissions = (permissions: string[]): void => {
  try {
    localStorage.setItem('userPermissions', JSON.stringify(permissions));
  } catch (error) {
    console.error('Error storing permissions:', error);
  }
};

/**
 * Get permissions from localStorage or JWT token
 * @returns Array of permission codes
 */
export const getPermissions = (): string[] => {
  try {
    // First try stored permissions
    const storedPermissions = localStorage.getItem('userPermissions');
    if (storedPermissions) {
      return JSON.parse(storedPermissions);
    }

    // Fallback to JWT token
    const token = localStorage.getItem('authToken');
    if (!token) return [];

    const parts = token.split('.');
    if (parts.length !== 3) return [];

    const payload = JSON.parse(atob(parts[1]));
    const permissions = payload.role?.permissions || [];
    
    // Cache for next time
    storePermissions(permissions);
    
    return permissions;
  } catch (error) {
    console.error('Error getting permissions:', error);
    return [];
  }
};

/**
 * Clear permissions from localStorage (on logout)
 */
export const clearPermissions = (): void => {
  try {
    localStorage.removeItem('userPermissions');
  } catch (error) {
    console.error('Error clearing permissions:', error);
  }
};

/**
 * Check if user has a specific permission
 * @param permission Permission code to check
 * @returns true if user has the permission
 */
export const hasPermission = (permission: string): boolean => {
  const permissions = getPermissions();
  return permissions.includes(permission);
};

/**
 * Check if user has ANY of the specified permissions (OR logic)
 * @param permissionList Array of permission codes
 * @returns true if user has at least one permission
 */
export const hasAnyPermission = (permissionList: string[]): boolean => {
  const permissions = getPermissions();
  return permissionList.some((permission) => permissions.includes(permission));
};

/**
 * Check if user has ALL of the specified permissions (AND logic)
 * @param permissionList Array of permission codes
 * @returns true if user has all permissions
 */
export const hasAllPermissions = (permissionList: string[]): boolean => {
  const permissions = getPermissions();
  return permissionList.every((permission) => permissions.includes(permission));
};

/**
 * Check if user has any permission starting with the given prefix
 * @param modulePrefix Module prefix (e.g., 'TICKET_', 'USER_')
 * @returns true if user has any permission with that prefix
 */
export const hasModuleAccess = (modulePrefix: string): boolean => {
  const permissions = getPermissions();
  return permissions.some((permission) => permission.startsWith(modulePrefix));
};

/**
 * Extract and store permissions from JWT token
 * Call this after successful login
 * @param token JWT token string
 * @returns Array of permissions or null if extraction failed
 */
export const extractPermissionsFromToken = (token: string): string[] | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    const permissions = payload.role?.permissions || [];
    
    // Store for future use
    storePermissions(permissions);
    
    return permissions;
  } catch (error) {
    console.error('Error extracting permissions from token:', error);
    return null;
  }
};

/**
 * Check if permissions are loaded
 * @returns true if permissions are available
 */
export const hasPermissionsLoaded = (): boolean => {
  const permissions = getPermissions();
  return permissions.length > 0;
};

/**
 * Get user role information from token
 * @returns Role object with code, name, and permissions
 */
export const getUserRole = (): { code: string; name: string; permissions: string[] } | null => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return payload.role || null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
};

/**
 * Check if user is Super Admin
 * This is a convenience method that checks for key super admin permissions
 * @returns true if user has super admin permissions
 */
export const isSuperAdmin = (): boolean => {
  return hasAllPermissions([
    'RBAC_VIEW_ROLES',
    'RBAC_CREATE_ROLE',
    'PROJECT_VIEW_ALL',
    'PROJECT_CREATE',
  ]);
};

/**
 * Get module access map for the current user
 * @returns Object with module access flags
 */
export const getModuleAccess = (): Record<string, boolean> => {
  const permissions = getPermissions();
  
  return {
    dashboard: true, // Everyone has dashboard access
    tickets: permissions.some(p => p.startsWith('TICKET_')),
    users: permissions.some(p => p.startsWith('USER_')),
    projects: permissions.some(p => p.startsWith('PROJECT_')),
    rbac: permissions.some(p => p.startsWith('RBAC_')),
    knowledgeBase: permissions.some(p => p.startsWith('KB_')),
    audit: permissions.some(p => p.startsWith('AUDIT_')),
    offline: permissions.some(p => p.startsWith('OFFLINE_')),
    reports: permissions.some(p => p.startsWith('REPORT_')),
    approvals: permissions.some(p => p.startsWith('APPROVAL_')),
    sla: permissions.some(p => p.startsWith('SLA_')),
    automation: permissions.some(p => p.startsWith('AUTOMATION_')),
    integrations: permissions.some(p => p.startsWith('INTEGRATION_')),
    masterData: permissions.some(p => p.startsWith('MASTER_DATA_')),
  };
};

/**
 * Validate permissions array
 * @param permissions Array of permission codes to validate
 * @returns true if all are valid permission codes
 */
export const validatePermissions = (permissions: string[]): boolean => {
  if (!Array.isArray(permissions)) return false;
  return permissions.every(p => typeof p === 'string' && p.length > 0);
};

/**
 * Format permissions for display
 * @param permissionCode Permission code (e.g., 'USER_CREATE')
 * @returns Formatted string (e.g., 'User Create')
 */
export const formatPermissionName = (permissionCode: string): string => {
  return permissionCode
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Group permissions by module prefix
 * @param permissions Array of permission codes
 * @returns Object with permissions grouped by module
 */
export const groupPermissionsByModule = (permissions: string[]): Record<string, string[]> => {
  const grouped: Record<string, string[]> = {};
  
  permissions.forEach(permission => {
    const module = permission.split('_')[0];
    if (!grouped[module]) {
      grouped[module] = [];
    }
    grouped[module].push(permission);
  });
  
  return grouped;
};

export default {
  storePermissions,
  getPermissions,
  clearPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasModuleAccess,
  extractPermissionsFromToken,
  hasPermissionsLoaded,
  getUserRole,
  isSuperAdmin,
  getModuleAccess,
  validatePermissions,
  formatPermissionName,
  groupPermissionsByModule,
};
