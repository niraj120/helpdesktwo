import { useMemo } from 'react';

/**
 * Custom hook to check user permissions
 * Reads permissions from localStorage (userPermissions or JWT token)
 * 
 * For global state management, use usePermissionContext from context/PermissionContext
 */
export const usePermissions = () => {
  const permissions = useMemo(() => {
    try {
      // First try to get from stored permissions
      const storedPermissions = localStorage.getItem('userPermissions');
      if (storedPermissions) {
        const parsed = JSON.parse(storedPermissions);
        console.log('📋 Using stored permissions:', parsed);
        return parsed;
      }

      // Fallback to JWT token
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('⚠️ No authToken found in localStorage');
        return [];
      }

      // Decode JWT token (simple base64 decode of payload)
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.warn('⚠️ Invalid JWT token format');
        return [];
      }

      const payload = JSON.parse(atob(parts[1]));
      console.log('🔍 JWT Payload:', payload);
      console.log('🔍 Role from JWT:', payload.role);
      console.log('🔍 Permissions from role.permissions:', payload.role?.permissions);
      console.log('🔍 Permissions from root permissions:', payload.permissions);
      
      // Try role.permissions first, then fallback to root level permissions
      const perms = payload.role?.permissions || payload.permissions || [];
      
      // Cache for next time
      localStorage.setItem('userPermissions', JSON.stringify(perms));
      
      console.log('✅ Extracted permissions:', perms);
      return perms;
    } catch (error) {
      console.error('❌ Error parsing permissions from token:', error);
      return [];
    }
  }, []);

  /**
   * Check if user has a specific permission
   * @param permission Permission code to check (e.g., 'USER_CREATE')
   * @returns true if user has the permission
   */
  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  /**
   * Check if user has ANY of the specified permissions (OR logic)
   * @param permissionList Array of permission codes
   * @returns true if user has at least one of the permissions
   */
  const hasAnyPermission = (permissionList: string[]): boolean => {
    return permissionList.some((permission) => permissions.includes(permission));
  };

  /**
   * Check if user has ALL of the specified permissions (AND logic)
   * @param permissionList Array of permission codes
   * @returns true if user has all permissions
   */
  const hasAllPermissions = (permissionList: string[]): boolean => {
    return permissionList.every((permission) => permissions.includes(permission));
  };

  /**
   * Check if user has permission for a specific module based on permission prefix
   * @param modulePrefix Module prefix (e.g., 'TICKET_', 'USER_', 'PROJECT_')
   * @returns true if user has any permission starting with the prefix
   */
  const hasModuleAccess = (modulePrefix: string): boolean => {
    return permissions.some((permission: string) => permission.startsWith(modulePrefix));
  };

  /**
   * Get all permissions for the current user
   * @returns Array of permission codes
   */
  const getAllPermissions = (): string[] => {
    return permissions;
  };

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasModuleAccess,
    getAllPermissions,
  };
};

/**
 * Component wrapper that conditionally renders children based on permission
 * Usage: <ProtectedComponent permission="USER_CREATE">...</ProtectedComponent>
 */
interface ProtectedComponentProps {
  permission?: string;
  permissions?: string[]; // For OR logic - show if user has ANY of these
  requireAll?: boolean; // If true with permissions array, requires ALL permissions (AND logic)
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const ProtectedComponent: React.FC<ProtectedComponentProps> = ({
  permission,
  permissions: permissionList,
  requireAll = false,
  children,
  fallback = null,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissionList && permissionList.length > 0) {
    hasAccess = requireAll
      ? hasAllPermissions(permissionList)
      : hasAnyPermission(permissionList);
  }

  return <>{hasAccess ? children : fallback}</>;
};

/**
 * Higher-order component to protect routes based on permissions
 * Usage: export default withPermission(MyComponent, 'USER_VIEW_ALL');
 */
export const withPermission = (
  Component: React.ComponentType<any>,
  requiredPermission: string | string[],
  requireAll = false
) => {
  return (props: any) => {
    const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

    let hasAccess = false;

    if (typeof requiredPermission === 'string') {
      hasAccess = hasPermission(requiredPermission);
    } else if (Array.isArray(requiredPermission)) {
      hasAccess = requireAll
        ? hasAllPermissions(requiredPermission)
        : hasAnyPermission(requiredPermission);
    }

    if (!hasAccess) {
      return (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <h2>Access Denied</h2>
          <p>You don't have permission to access this page.</p>
        </div>
      );
    }

    return <Component {...props} />;
  };
};

export default usePermissions;
