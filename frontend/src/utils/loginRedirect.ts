import { PERMISSIONS } from '../constants/permissions';

interface MenuRoute {
  path: string;
  permission?: string | string[];
  modulePrefix?: string;
}

// Define the menu routes in order of priority for project portal
export const AGENT_MENU_ROUTES: MenuRoute[] = [
  {
    path: 'users',
    modulePrefix: 'USER_'
  },
  {
    path: 'tickets/my-tickets',
    permission: PERMISSIONS.TICKET_VIEW_OWN
  },
  {
    path: 'tickets/assign',
    permission: PERMISSIONS.TICKET_ASSIGN
  },
  {
    path: 'tickets',
    permission: [PERMISSIONS.TICKET_VIEW_ALL, PERMISSIONS.TICKET_CREATE]
  },
  {
    path: 'service-requests',
    permission: [
      PERMISSIONS.SR_ACCESS,
      PERMISSIONS.SR_DISPLAY_TO_PARENT,
      PERMISSIONS.SR_CONFIG_MANAGE,
      PERMISSIONS.SR_ASSIGN_EMAILS,
      PERMISSIONS.SR_OFFLINE_ENTRY,
      PERMISSIONS.EMAIL_TRIAGE_ACCESS,
      PERMISSIONS.EMAIL_TRIAGE_CONVERT,
      PERMISSIONS.EMAIL_TRIAGE_RESPOND,
      PERMISSIONS.IVR_TRIAGE_ACCESS,
      PERMISSIONS.IVR_TRIAGE_CONVERT,
    ],
  },
  {
    path: 'offline',
    permission: PERMISSIONS.OFFLINE_MODULE_ACCESS
  },
  {
    path: 'knowledge-base',
    permission: [PERMISSIONS.KB_VIEW_CONTENT, PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_LEVELS, PERMISSIONS.KB_MANAGE_ARTICLES, PERMISSIONS.KB_MANAGE_TABLES]
  },
  {
    path: 'dashboard',
    // Dashboard is last priority - accessible to all
  },
  {
    path: 'audit',
    modulePrefix: 'AUDIT_'
  }
];

/**
 * Determines the first available route an agent can access based on their permissions
 * @param permissions Array of user permission codes
 * @returns The path of the first accessible route
 */
export const getFirstAvailableRoute = (permissions: string[] | any[]): string => {
  if (!permissions || permissions.length === 0) {
    return 'dashboard'; // Fallback
  }

  // Extract permission codes if permissions are objects
  const permissionCodes = permissions.map(p => 
    typeof p === 'string' ? p : (p.code || p)
  ).filter(Boolean);

  console.log('🔍 Finding route for permissions:', permissionCodes);

  for (const route of AGENT_MENU_ROUTES) {
    // Check specific permission
    if (route.permission) {
      if (Array.isArray(route.permission)) {
        // OR logic - user needs any one permission
        if (route.permission.some(perm => permissionCodes.includes(perm))) {
          console.log(`✅ Route '${route.path}' accessible via permission match`);
          return route.path;
        }
      } else {
        // Single permission
        if (permissionCodes.includes(route.permission)) {
          console.log(`✅ Route '${route.path}' accessible via permission match`);
          return route.path;
        }
      }
    }
    
    // Check module prefix (has any permission starting with prefix)
    if (route.modulePrefix) {
      if (permissionCodes.some(perm => perm.startsWith(route.modulePrefix!))) {
        console.log(`✅ Route '${route.path}' accessible via module prefix '${route.modulePrefix}'`);
        return route.path;
      }
    }
    
    // Route with no permission requirement is accessible to all
    if (!route.permission && !route.modulePrefix) {
      console.log(`✅ Route '${route.path}' accessible (no permission required)`);
      return route.path;
    }
  }

  // If no routes are available, return dashboard as default
  console.log('⚠️ No matching routes, defaulting to dashboard');
  return 'dashboard';
};

/**
 * Gets user permissions from localStorage and determines first route
 * @returns The path to redirect to after login
 */
export const getLoginRedirectPath = (): string => {
  try {
    const storedPermissions = localStorage.getItem('userPermissions');
    if (storedPermissions) {
      const permissions = JSON.parse(storedPermissions);
      return getFirstAvailableRoute(permissions);
    }
  } catch (error) {
    console.error('Error getting permissions for redirect:', error);
  }
  
  return 'tickets'; // Default fallback
};
