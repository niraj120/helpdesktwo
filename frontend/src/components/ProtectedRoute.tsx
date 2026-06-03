import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { usePermissions } from "../hooks/usePermissions";

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: string | string[]; // Single permission or array for OR logic
  requireAll?: boolean; // If true with array, requires ALL permissions (AND logic)
  modulePrefix?: string; // Alternative: check if user has any permission with this prefix
  redirectTo?: string; // Optional custom redirect path (defaults to /no-access)
  requireAuth?: boolean; // If true, only requires authentication (no specific permission)
  excludeForRoles?: string[]; // Array of role codes that should NOT access this route
}

/**
 * ProtectedRoute Component
 *
 * Wraps routes to ensure users have required permissions before accessing.
 * If permission check fails, redirects to /no-access page.
 *
 * @example
 * // Single permission required
 * <ProtectedRoute permission="USER_VIEW_ALL">
 *   <UserManagement />
 * </ProtectedRoute>
 *
 * @example
 * // Multiple permissions (OR logic - user needs ANY one)
 * <ProtectedRoute permission={['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN']}>
 *   <TicketList />
 * </ProtectedRoute>
 *
 * @example
 * // Multiple permissions (AND logic - user needs ALL)
 * <ProtectedRoute permission={['ADMIN_ACCESS', 'SETTINGS_ADVANCED']} requireAll={true}>
 *   <AdvancedSettings />
 * </ProtectedRoute>
 *
 * @example
 * // Module-level access (user needs ANY permission starting with prefix)
 * <ProtectedRoute modulePrefix="TICKET_">
 *   <TicketDashboard />
 * </ProtectedRoute>
 *
 * @example
 * // Just require authentication (no specific permission)
 * <ProtectedRoute requireAuth={true}>
 *   <Dashboard />
 * </ProtectedRoute>
 */
export const ProtectedRoute = ({
  children,
  permission,
  requireAll = false,
  modulePrefix,
  redirectTo = "/no-access",
  requireAuth = false,
  excludeForRoles = [],
}: ProtectedRouteProps) => {
  const location = useLocation();
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasModuleAccess,
    getAllPermissions,
  } = usePermissions();

  // Check if user is authenticated
  const authToken = localStorage.getItem("authToken");
  const userPermissions = getAllPermissions();

  // If not authenticated, redirect to login
  if (!authToken) {
    // On portal routes, redirect to the portal's own login page
    const portalMatch = location.pathname.match(
      /^\/([a-z0-9_-]+)\/portal(?:\/|$)/i,
    );
    if (portalMatch) {
      return (
        <Navigate
          to={`/${portalMatch[1]}/portal/login`}
          state={{ from: location }}
          replace
        />
      );
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role exclusion
  if (excludeForRoles.length > 0) {
    let userRole = localStorage.getItem("userRole") || "";

    // Try to get role code from user object if not a proper code
    if (
      !userRole ||
      !userRole.includes("_") ||
      userRole !== userRole.toUpperCase()
    ) {
      try {
        const userStr = localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          userRole = user.role?.code || user.roleCode || userRole;
        }
      } catch (e) {
        console.warn("Failed to parse user object");
      }
    }

    if (excludeForRoles.includes(userRole)) {
      console.log(
        `🚫 Access denied - Role ${userRole} is excluded from this route`,
      );
      return (
        <Navigate
          to={redirectTo}
          state={{ from: location, excludedRole: userRole }}
          replace
        />
      );
    }
  }

  // If only authentication is required (no specific permission check)
  if (requireAuth && !permission && !modulePrefix) {
    return <>{children}</>;
  }

  // Check module prefix (user has ANY permission starting with prefix)
  if (modulePrefix) {
    if (hasModuleAccess(modulePrefix)) {
      return <>{children}</>;
    }
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location, missingPermission: modulePrefix }}
        replace
      />
    );
  }

  // Check specific permission(s)
  if (permission) {
    // Array of permissions
    if (Array.isArray(permission)) {
      if (requireAll) {
        // AND logic - user needs ALL permissions
        if (hasAllPermissions(permission)) {
          return <>{children}</>;
        }
        return (
          <Navigate
            to={redirectTo}
            state={{
              from: location,
              missingPermissions: permission,
              requireAll: true,
            }}
            replace
          />
        );
      } else {
        // OR logic - user needs ANY one permission
        if (hasAnyPermission(permission)) {
          return <>{children}</>;
        }
        return (
          <Navigate
            to={redirectTo}
            state={{
              from: location,
              missingPermissions: permission,
              requireAll: false,
            }}
            replace
          />
        );
      }
    }

    // Single permission
    if (hasPermission(permission)) {
      return <>{children}</>;
    }
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location, missingPermission: permission }}
        replace
      />
    );
  }

  // No permission requirement - just show the page (authenticated users only)
  return <>{children}</>;
};

/**
 * Higher-Order Component version of ProtectedRoute
 *
 * @example
 * const ProtectedUserManagement = withProtectedRoute(UserManagement, {
 *   permission: 'USER_VIEW_ALL'
 * });
 *
 * <Route path="/users" element={<ProtectedUserManagement />} />
 */
export const withProtectedRoute = (
  Component: React.ComponentType<any>,
  options: Omit<ProtectedRouteProps, "children">,
) => {
  return (props: any) => (
    <ProtectedRoute {...options}>
      <Component {...props} />
    </ProtectedRoute>
  );
};

export default ProtectedRoute;
