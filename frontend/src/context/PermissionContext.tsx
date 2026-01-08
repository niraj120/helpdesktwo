import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PermissionContextType {
  permissions: string[];
  setPermissions: (permissions: string[]) => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  hasModuleAccess: (modulePrefix: string) => boolean;
  clearPermissions: () => void;
  isLoading: boolean;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

interface PermissionProviderProps {
  children: ReactNode;
}

/**
 * PermissionProvider - Global permission state management
 * Wraps the entire application to provide permission context
 */
export const PermissionProvider: React.FC<PermissionProviderProps> = ({ children }) => {
  const [permissions, setPermissionsState] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load permissions from localStorage on mount
  useEffect(() => {
    const loadPermissions = () => {
      try {
        // Try to get permissions from localStorage
        const storedPermissions = localStorage.getItem('userPermissions');
        if (storedPermissions) {
          setPermissionsState(JSON.parse(storedPermissions));
        } else {
          // Fallback: try to extract from JWT token
          const token = localStorage.getItem('authToken');
          if (token) {
            const parts = token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              const perms = payload.role?.permissions || [];
              setPermissionsState(perms);
              // Store for faster access next time
              localStorage.setItem('userPermissions', JSON.stringify(perms));
            }
          }
        }
      } catch (error) {
        console.error('Error loading permissions:', error);
        setPermissionsState([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadPermissions();
  }, []);

  /**
   * Set permissions and persist to localStorage
   */
  const setPermissions = (newPermissions: string[]) => {
    setPermissionsState(newPermissions);
    localStorage.setItem('userPermissions', JSON.stringify(newPermissions));
  };

  /**
   * Check if user has a specific permission
   */
  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  /**
   * Check if user has ANY of the specified permissions (OR logic)
   */
  const hasAnyPermission = (permissionList: string[]): boolean => {
    return permissionList.some((permission) => permissions.includes(permission));
  };

  /**
   * Check if user has ALL of the specified permissions (AND logic)
   */
  const hasAllPermissions = (permissionList: string[]): boolean => {
    return permissionList.every((permission) => permissions.includes(permission));
  };

  /**
   * Check if user has any permission starting with the given prefix
   */
  const hasModuleAccess = (modulePrefix: string): boolean => {
    return permissions.some((permission) => permission.startsWith(modulePrefix));
  };

  /**
   * Clear all permissions (on logout)
   */
  const clearPermissions = () => {
    setPermissionsState([]);
    localStorage.removeItem('userPermissions');
  };

  const value: PermissionContextType = {
    permissions,
    setPermissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasModuleAccess,
    clearPermissions,
    isLoading,
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

/**
 * usePermissionContext - Hook to access permission context
 * Use this instead of usePermissions when you want global state
 */
export const usePermissionContext = (): PermissionContextType => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermissionContext must be used within a PermissionProvider');
  }
  return context;
};

export default PermissionProvider;
