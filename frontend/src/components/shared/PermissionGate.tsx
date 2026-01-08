import React from 'react';

interface PermissionGateProps {
  permissions: string[]; // User's permission codes
  requires: string[]; // Required permissions (any match)
  requiresAll?: boolean; // If true, user must have ALL permissions
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * PermissionGate - Show/hide content based on user permissions
 * 
 * Usage:
 * <PermissionGate permissions={userPermissions} requires={['TICKET_CREATE']}>
 *   <button>Create Ticket</button>
 * </PermissionGate>
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  permissions,
  requires,
  requiresAll = false,
  children,
  fallback = null,
}) => {
  const hasPermission = requiresAll
    ? requires.every(req => permissions.includes(req))
    : requires.some(req => permissions.includes(req));

  return hasPermission ? <>{children}</> : <>{fallback}</>;
};

export default PermissionGate;
