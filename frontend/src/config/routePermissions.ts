/**
 * Route Permission Configuration
 *
 * This file defines the permission requirements for each route in the application.
 * Centralized configuration makes it easy to update permissions for routes.
 */

import { PERMISSIONS } from "../constants/permissions";

export interface RoutePermission {
  path: string;
  permission?: string | string[];
  requireAll?: boolean;
  modulePrefix?: string;
  requireAuth?: boolean; // If true, only requires authentication (no specific permission)
  description?: string;
}

/**
 * Super Admin Routes (Main System)
 */
export const superAdminRoutes: RoutePermission[] = [
  {
    path: "/dashboard",
    requireAuth: true,
    description: "Main dashboard - visible to all authenticated users",
  },
  {
    path: "/projects",
    modulePrefix: "PROJECT_",
    description: "Project management - requires any PROJECT_* permission",
  },
  {
    path: "/master-data",
    permission: "MASTER_DATA_VIEW",
    description: "Master data management - requires MASTER_DATA_VIEW",
  },
  {
    path: "/rbac",
    modulePrefix: "RBAC_",
    description: "RBAC setup - requires any RBAC_* permission",
  },
  {
    path: "/users",
    modulePrefix: "USER_",
    description: "User management - requires any USER_* permission",
  },
  {
    path: "/tickets/view",
    permission: ["TICKET_VIEW_ALL", "TICKET_VIEW_OWN"],
    description: "View tickets - requires TICKET_VIEW_ALL or TICKET_VIEW_OWN",
  },
  {
    path: "/tickets/assign",
    permission: "TICKET_ASSIGN",
    description: "Assign tickets - requires TICKET_ASSIGN permission",
  },
  {
    path: "/tickets/create",
    permission: "TICKET_CREATE",
    description: "Create ticket - requires TICKET_CREATE permission",
  },
  {
    path: "/ticket-config",
    permission: [
      "TICKET_CONFIG_VIEW",
      "TICKET_CONFIG_MANAGE_CATEGORIES",
      "TICKET_CONFIG_MANAGE_STATUSES",
      "TICKET_CONFIG_MANAGE_TABLE_COLUMNS",
    ],
    description: "Ticket configuration - requires any ticket config permission",
  },
  {
    path: "/ticket-config/settings/:projectId",
    permission: [
      "TICKET_CONFIG_VIEW",
      "TICKET_CONFIG_MANAGE_CATEGORIES",
      "TICKET_CONFIG_MANAGE_TABLE_COLUMNS",
    ],
    description:
      "Ticket settings for project - requires ticket config permissions",
  },
  {
    path: "/offline-module",
    modulePrefix: "OFFLINE_",
    description:
      "Offline module configuration - requires any OFFLINE_* permission",
  },
  {
    path: "/offline-module/settings/:projectId",
    modulePrefix: "OFFLINE_",
    description:
      "Offline module settings for project - requires OFFLINE_* permissions",
  },
  {
    path: "/sla",
    modulePrefix: "SLA_",
    description: "SLA rules - requires any SLA_* permission",
  },
  {
    path: "/approvals",
    modulePrefix: "APPROVAL_",
    description: "Approval workflows - requires any APPROVAL_* permission",
  },
  {
    path: "/escalation-matrix",
    permission: PERMISSIONS.SLA_MANAGE_ESCALATIONS,
    description: "Escalation matrix - requires SLA_MANAGE_ESCALATIONS",
  },
  {
    path: "/knowledge-base",
    permission: ["KB_VIEW", "KB_CREATE", "KB_EDIT", "KB_DELETE"],
    description: "Knowledge base management - requires any KB permission",
  },
  {
    path: "/kb/:articleId",
    permission: "KB_VIEW",
    description: "Knowledge base article view - requires KB_VIEW",
  },
  {
    path: "/audit/activity-logs",
    permission: "AUDIT_VIEW_ACTIVITY",
    description: "Activity logs - requires AUDIT_VIEW_ACTIVITY",
  },
  {
    path: "/audit/access-logs",
    permission: "AUDIT_VIEW_ACCESS",
    description: "Access logs - requires AUDIT_VIEW_ACCESS",
  },
  {
    path: "/audit/email-logs",
    permission: "EMAIL_CONFIG_VIEW",
    description: "Email logs - requires EMAIL_CONFIG_VIEW",
  },
];

/**
 * Project Portal Routes
 */
export const projectPortalRoutes: RoutePermission[] = [
  {
    path: "/:customUrlPath/portal/dashboard",
    requireAuth: true,
    description: "Project portal dashboard - requires authentication",
  },
  {
    path: "/:customUrlPath/portal/tickets",
    modulePrefix: "TICKET_",
    description: "Project tickets - requires any TICKET_* permission",
  },
  {
    path: "/:customUrlPath/portal/ticket/:id",
    permission: ["TICKET_VIEW_ALL", "TICKET_VIEW_OWN"],
    description: "Ticket detail - requires TICKET_VIEW_ALL or TICKET_VIEW_OWN",
  },
  {
    path: "/:customUrlPath/portal/knowledge-base",
    permission: ["KB_VIEW", "KB_CREATE"],
    description: "Project KB - requires KB_VIEW or KB_CREATE",
  },
  {
    path: "/:customUrlPath/portal/offline",
    modulePrefix: "OFFLINE_",
    description: "Project offline module - requires OFFLINE_* permissions",
  },
  {
    path: "/:customUrlPath/portal/users",
    modulePrefix: "USER_",
    description: "Project user management - requires USER_* permissions",
  },
  {
    path: "/:customUrlPath/portal/audit",
    permission: ["AUDIT_VIEW_ACTIVITY", "AUDIT_VIEW_ACCESS"],
    description: "Project audit logs - requires audit view permissions",
  },
];

/**
 * Student Portal Routes (No specific permissions - just authentication)
 */
export const studentRoutes: RoutePermission[] = [
  {
    path: "/:customUrlPath/student/dashboard",
    requireAuth: true,
    description: "Student dashboard - requires authentication only",
  },
  {
    path: "/:customUrlPath/student/ticket/:ticketId",
    requireAuth: true,
    description: "Student ticket detail - requires authentication only",
  },
  {
    path: "/:customUrlPath/submit-ticket",
    requireAuth: false, // Public - students can submit without login (KB is now integrated in this page)
    description: "Public ticket submission with integrated KB",
  },
];

/**
 * Public Routes (No authentication required)
 */
export const publicRoutes: string[] = [
  "/login",
  "/:customUrlPath",
  "/:customUrlPath/portal/login",
  "/:customUrlPath/forgot-password",
  "/:customUrlPath/eula",
  "/forgot-password",
  "/eula",
  "/no-access",
];

/**
 * Helper function to get permission config for a route
 */
export const getRoutePermission = (
  path: string,
): RoutePermission | undefined => {
  const allRoutes = [
    ...superAdminRoutes,
    ...projectPortalRoutes,
    ...studentRoutes,
  ];

  // Exact match
  let match = allRoutes.find((route) => route.path === path);
  if (match) return match;

  // Pattern match (for dynamic routes like :id)
  match = allRoutes.find((route) => {
    const pattern = route.path.replace(/:[^/]+/g, "[^/]+");
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(path);
  });

  return match;
};

/**
 * Check if a route is public (no authentication required)
 */
export const isPublicRoute = (path: string): boolean => {
  return publicRoutes.some((route) => {
    if (route.includes(":")) {
      const pattern = route.replace(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(path);
    }
    return route === path;
  });
};
