/**
 * Maps RBAC Permission Codes to UI Features
 * This ensures every backend permission has a corresponding frontend interface
 */

export interface UIFeature {
  code: string; // Permission code from backend
  name: string; // Display name
  category: string; // Category for grouping
  module: string; // Which module this belongs to
  component?: string; // Component that implements this feature
  route?: string; // Route path if applicable
  description: string; // What this permission allows
  requiresUI: boolean; // Whether this permission needs a UI interface
  uiType: 'page' | 'button' | 'modal' | 'section' | 'menu' | 'action'; // Type of UI element
  status: 'implemented' | 'partial' | 'missing'; // Implementation status
}

export const permissionUIMapping: UIFeature[] = [
  // ================== DASHBOARD ==================
  {
    code: 'DASHBOARD_VIEW',
    name: 'View Dashboard',
    category: 'Dashboard',
    module: 'dashboard',
    component: 'DashboardModule',
    route: '/dashboard',
    description: 'Access to dashboard overview',
    requiresUI: true,
    uiType: 'page',
    status: 'implemented'
  },
  {
    code: 'DASHBOARD_VIEW_ANALYTICS',
    name: 'View Analytics',
    category: 'Dashboard',
    module: 'dashboard',
    description: 'View detailed analytics and charts on dashboard',
    requiresUI: true,
    uiType: 'section',
    status: 'implemented'
  },
  {
    code: 'DASHBOARD_EXPORT',
    name: 'Export Dashboard Data',
    category: 'Dashboard',
    module: 'dashboard',
    description: 'Export dashboard data and reports',
    requiresUI: true,
    uiType: 'button',
    status: 'partial' // Button exists but needs proper implementation
  },

  // ================== TICKETS ==================
  {
    code: 'TICKET_VIEW_ALL',
    name: 'View All Queries',
    category: 'Tickets',
    module: 'tickets',
    component: 'TicketsModule',
    route: '/tickets/all',
    description: 'View all queries across the system',
    requiresUI: true,
    uiType: 'page',
    status: 'implemented'
  },
  {
    code: 'TICKET_VIEW_OWN',
    name: 'View Own Tickets',
    category: 'Tickets',
    module: 'tickets',
    route: '/tickets/my-tickets',
    description: 'View tickets assigned to current user',
    requiresUI: true,
    uiType: 'page',
    status: 'implemented'
  },
  {
    code: 'TICKET_CREATE',
    name: 'Create Ticket',
    category: 'Tickets',
    module: 'tickets',
    description: 'Create new tickets',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },
  {
    code: 'TICKET_EDIT',
    name: 'Edit Ticket',
    category: 'Tickets',
    module: 'tickets',
    description: 'Edit existing tickets',
    requiresUI: true,
    uiType: 'action',
    status: 'implemented'
  },
  {
    code: 'TICKET_DELETE',
    name: 'Delete Ticket',
    category: 'Tickets',
    module: 'tickets',
    description: 'Delete tickets',
    requiresUI: true,
    uiType: 'button',
    status: 'partial'
  },
  {
    code: 'TICKET_ASSIGN',
    name: 'Assign Ticket',
    category: 'Tickets',
    module: 'tickets',
    component: 'AssignTicketModal',
    description: 'Assign tickets to agents - NEEDS UI: Dropdown to select agent + Bulk assign interface',
    requiresUI: true,
    uiType: 'modal',
    status: 'missing' // ⚠️ MISSING: Should have dropdown + bulk assign interface
  },
  {
    code: 'TICKET_CHANGE_STATUS',
    name: 'Change Ticket Status',
    category: 'Tickets',
    module: 'tickets',
    description: 'Change status of tickets',
    requiresUI: true,
    uiType: 'action',
    status: 'implemented'
  },
  {
    code: 'TICKET_CHANGE_PRIORITY',
    name: 'Change Ticket Priority',
    category: 'Tickets',
    module: 'tickets',
    description: 'Change priority of tickets',
    requiresUI: true,
    uiType: 'action',
    status: 'partial'
  },
  {
    code: 'TICKET_ADD_COMMENT',
    name: 'Add Comment',
    category: 'Tickets',
    module: 'tickets',
    description: 'Add comments to tickets',
    requiresUI: true,
    uiType: 'section',
    status: 'implemented'
  },
  {
    code: 'TICKET_EDIT_COMMENT',
    name: 'Edit Comment',
    category: 'Tickets',
    module: 'tickets',
    description: 'Edit existing comments',
    requiresUI: true,
    uiType: 'button',
    status: 'missing'
  },
  {
    code: 'TICKET_DELETE_COMMENT',
    name: 'Delete Comment',
    category: 'Tickets',
    module: 'tickets',
    description: 'Delete comments',
    requiresUI: true,
    uiType: 'button',
    status: 'missing'
  },
  {
    code: 'TICKET_ADD_ATTACHMENT',
    name: 'Add Attachment',
    category: 'Tickets',
    module: 'tickets',
    description: 'Upload attachments to tickets',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },
  {
    code: 'TICKET_DELETE_ATTACHMENT',
    name: 'Delete Attachment',
    category: 'Tickets',
    module: 'tickets',
    description: 'Delete attachments',
    requiresUI: true,
    uiType: 'button',
    status: 'missing'
  },
  {
    code: 'TICKET_MERGE',
    name: 'Merge Tickets',
    category: 'Tickets',
    module: 'tickets',
    component: 'MergeTicketsModal',
    description: 'Merge multiple tickets - NEEDS UI: Modal to select tickets + preview merge',
    requiresUI: true,
    uiType: 'modal',
    status: 'missing' // ⚠️ MISSING: Should have ticket selection + merge preview
  },
  {
    code: 'TICKET_BULK_UPDATE',
    name: 'Bulk Update',
    category: 'Tickets',
    module: 'tickets',
    component: 'BulkUpdateModal',
    description: 'Update multiple tickets at once - NEEDS UI: Checkbox selection + bulk action dropdown',
    requiresUI: true,
    uiType: 'modal',
    status: 'missing' // ⚠️ MISSING: Should have checkbox selection + bulk actions
  },
  {
    code: 'TICKET_EXPORT',
    name: 'Export Tickets',
    category: 'Tickets',
    module: 'tickets',
    description: 'Export ticket data',
    requiresUI: true,
    uiType: 'button',
    status: 'missing'
  },

  // ================== USER MANAGEMENT ==================
  {
    code: 'USER_VIEW_ALL',
    name: 'View All Users',
    category: 'Users',
    module: 'users',
    component: 'UserManagementModule',
    route: '/users',
    description: 'View all users in the system',
    requiresUI: true,
    uiType: 'page',
    status: 'implemented'
  },
  {
    code: 'USER_CREATE',
    name: 'Create User',
    category: 'Users',
    module: 'users',
    description: 'Create new users',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },
  {
    code: 'USER_EDIT',
    name: 'Edit User',
    category: 'Users',
    module: 'users',
    description: 'Edit user details',
    requiresUI: true,
    uiType: 'action',
    status: 'implemented'
  },
  {
    code: 'USER_DELETE',
    name: 'Delete User',
    category: 'Users',
    module: 'users',
    description: 'Delete users',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },
  {
    code: 'USER_TOGGLE_STATUS',
    name: 'Toggle User Status',
    category: 'Users',
    module: 'users',
    description: 'Activate/deactivate users',
    requiresUI: true,
    uiType: 'button',
    status: 'partial'
  },
  {
    code: 'USER_ASSIGN_ROLE',
    name: 'Assign Role',
    category: 'Users',
    module: 'users',
    description: 'Assign roles to users',
    requiresUI: true,
    uiType: 'action',
    status: 'implemented'
  },
  {
    code: 'USER_RESET_PASSWORD',
    name: 'Reset Password',
    category: 'Users',
    module: 'users',
    description: 'Reset user passwords',
    requiresUI: true,
    uiType: 'button',
    status: 'missing'
  },
  {
    code: 'USER_MANAGE_GROUPS',
    name: 'Manage Groups',
    category: 'Users',
    module: 'users',
    component: 'GroupManagementModule',
    description: 'Manage user groups - NEEDS UI: Group creation + assignment interface',
    requiresUI: true,
    uiType: 'page',
    status: 'missing' // ⚠️ MISSING: Entire group management module
  },

  // ================== RBAC ==================
  {
    code: 'RBAC_VIEW_ROLES',
    name: 'View Roles',
    category: 'RBAC',
    module: 'rbac',
    component: 'RBACModule',
    route: '/rbac/roles',
    description: 'View all roles',
    requiresUI: true,
    uiType: 'page',
    status: 'implemented'
  },
  {
    code: 'RBAC_CREATE_ROLE',
    name: 'Create Role',
    category: 'RBAC',
    module: 'rbac',
    description: 'Create new roles',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },
  {
    code: 'RBAC_EDIT_ROLE',
    name: 'Edit Role',
    category: 'RBAC',
    module: 'rbac',
    description: 'Edit role details and permissions',
    requiresUI: true,
    uiType: 'action',
    status: 'implemented'
  },
  {
    code: 'RBAC_DELETE_ROLE',
    name: 'Delete Role',
    category: 'RBAC',
    module: 'rbac',
    description: 'Delete roles',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },
  {
    code: 'RBAC_ASSIGN_PERMISSIONS',
    name: 'Assign Permissions',
    category: 'RBAC',
    module: 'rbac',
    description: 'Assign permissions to roles',
    requiresUI: true,
    uiType: 'section',
    status: 'implemented'
  },

  // ================== PROJECTS ==================
  {
    code: 'PROJECT_VIEW_ALL',
    name: 'View All Projects',
    category: 'Projects',
    module: 'projects',
    component: 'ProjectsModule',
    route: '/projects',
    description: 'View all projects',
    requiresUI: true,
    uiType: 'page',
    status: 'implemented'
  },
  {
    code: 'PROJECT_CREATE',
    name: 'Create Project',
    category: 'Projects',
    module: 'projects',
    description: 'Create new projects',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },
  {
    code: 'PROJECT_EDIT',
    name: 'Edit Project',
    category: 'Projects',
    module: 'projects',
    description: 'Edit project details',
    requiresUI: true,
    uiType: 'action',
    status: 'implemented'
  },
  {
    code: 'PROJECT_DELETE',
    name: 'Delete Project',
    category: 'Projects',
    module: 'projects',
    description: 'Delete projects',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },

  // ================== REPORTS ==================
  {
    code: 'REPORT_VIEW_TICKETS',
    name: 'View Ticket Reports',
    category: 'Reports',
    module: 'reports',
    component: 'TicketReportsModule',
    route: '/reports/tickets',
    description: 'View ticket analytics and reports',
    requiresUI: true,
    uiType: 'page',
    status: 'missing' // ⚠️ MISSING: Entire reports module
  },
  {
    code: 'REPORT_VIEW_AGENT_PERFORMANCE',
    name: 'View Agent Performance',
    category: 'Reports',
    module: 'reports',
    route: '/reports/agent-performance',
    description: 'View agent performance metrics',
    requiresUI: true,
    uiType: 'page',
    status: 'missing'
  },
  {
    code: 'REPORT_EXPORT',
    name: 'Export Reports',
    category: 'Reports',
    module: 'reports',
    description: 'Export report data',
    requiresUI: true,
    uiType: 'button',
    status: 'missing'
  },

  // ================== OFFLINE MODULE ==================
  {
    code: 'OFFLINE_MODULE_ACCESS',
    name: 'Access Offline Module',
    category: 'Offline',
    module: 'offline',
    component: 'OfflineModule',
    route: '/offline',
    description: 'Access offline student registration module',
    requiresUI: true,
    uiType: 'page',
    status: 'implemented'
  },
  {
    code: 'OFFLINE_STUDENT_REGISTER',
    name: 'Register Student',
    category: 'Offline',
    module: 'offline',
    description: 'Register students offline',
    requiresUI: true,
    uiType: 'button',
    status: 'implemented'
  },
];

/**
 * Get permissions by status
 */
export function getPermissionsByStatus(status: 'implemented' | 'partial' | 'missing'): UIFeature[] {
  return permissionUIMapping.filter(p => p.status === status);
}

/**
 * Get permissions by module
 */
export function getPermissionsByModule(module: string): UIFeature[] {
  return permissionUIMapping.filter(p => p.module === module);
}

/**
 * Check if a permission code exists and what its UI status is
 */
export function getPermissionStatus(code: string): UIFeature | undefined {
  return permissionUIMapping.find(p => p.code === code);
}

/**
 * Get missing UI features that need to be implemented
 */
export function getMissingUIFeatures(): UIFeature[] {
  return getPermissionsByStatus('missing');
}

/**
 * Get partial UI features that need completion
 */
export function getPartialUIFeatures(): UIFeature[] {
  return getPermissionsByStatus('partial');
}

/**
 * Generate implementation report
 */
export function generateImplementationReport() {
  const total = permissionUIMapping.length;
  const implemented = getPermissionsByStatus('implemented').length;
  const partial = getPermissionsByStatus('partial').length;
  const missing = getPermissionsByStatus('missing').length;

  return {
    total,
    implemented,
    partial,
    missing,
    completionPercentage: Math.round((implemented / total) * 100),
    missingFeatures: getMissingUIFeatures(),
    partialFeatures: getPartialUIFeatures()
  };
}
