import { ReactNode } from 'react';
import {
  MdDashboard,
  MdFolder,
  MdSettings,
  MdSecurity,
  MdPeople,
  MdConfirmationNumber,
  MdCheckCircle,
  MdSchedule,
  MdBook,
  MdIntegrationInstructions,
  MdBarChart,
  MdFactCheck,
  MdHistory,
  MdLogin,
  MdBlock,
  MdMailOutline,
  MdSyncProblem,
  MdWebhook,
  MdChat,
  MdLabel,
  MdPriorityHigh,
  MdCategory,
  MdStyle,
} from 'react-icons/md';
import { PERMISSIONS, PERMISSION_MODULES } from '../constants/permissions';

export interface MenuItem {
  path?: string;
  icon: ReactNode;
  label: string;
  labelHi?: string;
  labelMr?: string;
  permission?: string | string[]; // Single permission or array for OR logic
  requireAll?: boolean; // If true with array, requires ALL permissions (AND logic)
  modulePrefix?: string; // Alternative: check if user has any permission with this prefix
  subItems?: MenuItem[];
  isProjectRoute?: boolean; // If true, this route is for project portal only
  isSuperAdminOnly?: boolean; // Legacy support - will use permission instead
  excludeForRoles?: string[]; // Array of role codes to exclude this menu item from
}

/**
 * Complete menu configuration with permission requirements
 * This is the single source of truth for all menu items
 */
export const menuConfig: MenuItem[] = [
  // Dashboard - Visible to all authenticated users
  {
    path: '/dashboard',
    icon: <MdDashboard />,
    label: 'Dashboard',
    labelHi: 'डैशबोर्ड',
    labelMr: 'डॅशबोर्ड',
    // No permission required - everyone can see dashboard
  },

  // Project Management - Super Admin only
  {
    path: '/projects',
    icon: <MdFolder />,
    label: 'Project Management',
    labelHi: 'प्रोजेक्ट प्रबंधन',
    labelMr: 'प्रकल्प व्यवस्थापन',
    modulePrefix: PERMISSION_MODULES.PROJECT,
  },

  // Master Data - Super Admin only
  {
    path: '/master-data',
    icon: <MdSettings />,
    label: 'Master Data',
    labelHi: 'मास्टर डेटा',
    labelMr: 'मास्टर डेटा',
    permission: PERMISSIONS.MASTER_DATA_VIEW,
  },

  // RBAC Setup - Super Admin only
  {
    path: '/rbac',
    icon: <MdSecurity />,
    label: 'RBAC Setup',
    labelHi: 'RBAC सेटअप',
    labelMr: 'RBAC सेटअप',
    modulePrefix: PERMISSION_MODULES.RBAC,
  },

  // User Management - Managers and Super Admin
  {
    path: '/users',
    icon: <MdPeople />,
    label: 'User Management',
    labelHi: 'उपयोगकर्ता प्रबंधन',
    labelMr: 'वापरकर्ता व्यवस्थापन',
    modulePrefix: PERMISSION_MODULES.USER,
  },

  // Queries - For Center Managers and Agents
  {
    icon: <MdConfirmationNumber />,
    label: 'Queries',
    labelHi: 'टिकट',
    labelMr: 'तिकीटे',
    permission: [
      PERMISSIONS.TICKET_VIEW_ALL,
      PERMISSIONS.TICKET_VIEW_OWN,
      PERMISSIONS.TICKET_ASSIGN,
      PERMISSIONS.TICKET_CREATE,
    ],
    subItems: [
      {
        path: '/tickets/view',
        icon: <MdConfirmationNumber />,
        label: 'View Queries',
        labelHi: 'टिकट देखें',
        labelMr: 'तिकीटे पहा',
        permission: PERMISSIONS.TICKET_VIEW_ALL,
      },
      {
        path: '/tickets/my-tickets',
        icon: <MdPeople />,
        label: 'My Queries',
        labelHi: 'मेरे टिकट',
        labelMr: 'माझी तिकीटे',
        permission: PERMISSIONS.TICKET_VIEW_OWN,
        excludeForRoles: ['SUPER_ADMIN'], // Super Admin doesn't need this submenu
      },
      {
        path: '/tickets/assign',
        icon: <MdPeople />,
        label: 'Assign Queries',
        labelHi: 'टिकट असाइन करें',
        labelMr: 'तिकीटे नियुक्त करा',
        permission: PERMISSIONS.TICKET_ASSIGN,
      },
    ],
  },

  // Query Configuration - Super Admin only
  {
    path: '/ticket-config',
    icon: <MdSettings />,
    label: 'Query Configuration',
    labelHi: 'टिकट कॉन्फ़िगरेशन',
    labelMr: 'तिकीट कॉन्फिगरेशन',
    permission: [
      PERMISSIONS.TICKET_CONFIG_VIEW,
      PERMISSIONS.TICKET_CONFIG_MANAGE_CATEGORIES,
      PERMISSIONS.TICKET_CONFIG_MANAGE_STATUSES,
      PERMISSIONS.TICKET_CONFIG_MANAGE_PRIORITIES,
    ],
  },

  // Offline Module Setup - Super Admin and Managers
  {
    path: '/offline-module',
    icon: <MdSettings />,
    label: 'Offline Module Setup',
    labelHi: 'ऑफ़लाइन मॉड्यूल सेटअप',
    labelMr: 'ऑफलाइन मॉड्यूल सेटअप',
    modulePrefix: PERMISSION_MODULES.OFFLINE,
  },

  // Approval Process - HIDDEN: Module not ready
  // {
  //   path: '/approvals',
  //   icon: <MdCheckCircle />,
  //   label: 'Approval Process',
  //   labelHi: 'अनुमोदन प्रक्रिया',
  //   labelMr: 'मंजूरी प्रक्रिया',
  //   modulePrefix: PERMISSION_MODULES.APPROVAL,
  // },

  // SLA & Escalation - Super Admin only
  {
    path: '/sla',
    icon: <MdSchedule />,
    label: 'SLA & Escalation',
    labelHi: 'SLA और एस्केलेशन',
    labelMr: 'SLA आणि वाढीव प्रक्रिया',
    modulePrefix: PERMISSION_MODULES.SLA,
  },

  // Knowledge Base - Managers, Agents, Super Admin
  {
    path: '/knowledge-base',
    icon: <MdBook />,
    label: 'Knowledge Base',
    labelHi: 'ज्ञान आधार',
    labelMr: 'ज्ञान आधार',
    permission: [PERMISSIONS.KB_VIEW, PERMISSIONS.KB_CREATE, PERMISSIONS.KB_EDIT],
  },

  // Integrations - Super Admin only
  {
    icon: <MdIntegrationInstructions />,
    label: 'Integrations',
    labelHi: 'एकीकरण',
    labelMr: 'इंटिग्रेशन',
    modulePrefix: PERMISSION_MODULES.INTEGRATION,
    subItems: [
      {
        path: '/email-config',
        icon: <MdMailOutline />,
        label: 'Email Configuration',
        labelHi: 'ईमेल विन्यास',
        labelMr: 'ईमेल कॉन्फिगरेशन',
        permission: 'PROJECT_MANAGE_SETTINGS',
      },
    ],
  },

  // Reports - Managers and Super Admin
  {
    path: '/reports',
    icon: <MdBarChart />,
    label: 'Reports',
    labelHi: 'रिपोर्ट',
    labelMr: 'अहवाल',
    modulePrefix: PERMISSION_MODULES.REPORT,
  },

  // Audit Logs - Super Admin and Managers with submenu
  {
    icon: <MdFactCheck />,
    label: 'Audit Logs',
    labelHi: 'ऑडिट लॉग',
    labelMr: 'ऑडिट लॉग',
    permission: [PERMISSIONS.AUDIT_VIEW_ACTIVITY, PERMISSIONS.AUDIT_VIEW_ACCESS],
    subItems: [
      {
        path: '/audit/activity-logs',
        icon: <MdHistory />,
        label: 'Activity Logs',
        labelHi: 'गतिविधि लॉग',
        labelMr: 'अॅक्टिव्हिटी लॉग',
        permission: PERMISSIONS.AUDIT_VIEW_ACTIVITY,
      },
      {
        path: '/audit/access-logs',
        icon: <MdLogin />,
        label: 'Access Logs',
        labelHi: 'एक्सेस लॉग',
        labelMr: 'अॅक्सेस लॉग',
        permission: PERMISSIONS.AUDIT_VIEW_ACCESS,
      },
      {
        path: '/audit/email-logs',
        icon: <MdMailOutline />,
        label: 'Email Logs',
        labelHi: 'ईमेल लॉग',
        labelMr: 'ईमेल लॉग',
        permission: PERMISSIONS.AUDIT_VIEW_ACTIVITY,
      },
      // HIDDEN: Integration failure logs sub-menu - not ready
      // {
      //   path: '/audit/integration-failure-logs',
      //   icon: <MdSyncProblem />,
      //   label: 'Integration Failure Logs',
      //   labelHi: 'एकीकरण विफलता लॉग',
      //   labelMr: 'इंटिग्रेशन फेल्युअर लॉग',
      //   permission: PERMISSIONS.AUDIT_VIEW_INTEGRATION_FAILURES,
      // },
      // HIDDEN: Webhook failure logs sub-menu - not ready
      // {
      //   path: '/audit/webhook-failure-logs',
      //   icon: <MdWebhook />,
      //   label: 'Webhook Failure Logs',
      //   labelHi: 'वेबहुक विफलता लॉग',
      //   labelMr: 'वेबहुक फेल्युअर लॉग',
      //   permission: PERMISSIONS.AUDIT_VIEW_WEBHOOK_FAILURES,
      // },
      // HIDDEN: Chat webhook failure sub-menu - not ready
      // {
      //   path: '/audit/chat-webhook-failure',
      //   icon: <MdChat />,
      //   label: 'Chat Webhook Failure',
      //   labelHi: 'चैट वेबहुक विफलता',
      //   labelMr: 'चॅट वेबहुक फेल्युअर',
      //   permission: PERMISSIONS.AUDIT_VIEW_CHAT_WEBHOOK_FAILURES,
      // },
    ],
  },
];

/**
 * Project Portal Menu Configuration
 * These items are for project-specific portals (agents, managers)
 */
export const projectPortalMenuConfig: MenuItem[] = [
  {
    path: 'dashboard', // Relative path, will be prefixed with /:customUrlPath/portal/
    icon: <MdDashboard />,
    label: 'Dashboard',
    labelHi: 'डैशबोर्ड',
    labelMr: 'डॅशबोर्ड',
    permission: PERMISSIONS.DASHBOARD_VIEW, // Now permission-based, not hardcoded
    isProjectRoute: true,
  },
  {
    icon: <MdConfirmationNumber />,
    label: 'Queries',
    labelHi: 'टिकट',
    labelMr: 'तिकीटे',
    permission: [
      PERMISSIONS.TICKET_ASSIGN,
      PERMISSIONS.TICKET_CREATE,
      PERMISSIONS.TICKET_VIEW_OWN,
    ],
    isProjectRoute: true,
    subItems: [
      {
        path: 'tickets/my-tickets',
        icon: <MdConfirmationNumber />,
        label: 'My Queries',
        labelHi: 'मेरे टिकट',
        labelMr: 'माझी तिकीटे',
        permission: PERMISSIONS.TICKET_VIEW_OWN,
        isProjectRoute: true,
      },
      {
        path: 'tickets/assign',
        icon: <MdPeople />,
        label: 'Assign Queries',
        labelHi: 'टिकट असाइन करें',
        labelMr: 'तिकीटे नियुक्त करा',
        permission: PERMISSIONS.TICKET_ASSIGN,
        isProjectRoute: true,
      },
      {
        path: 'tickets/create',
        icon: <MdConfirmationNumber />,
        label: 'Create Query',
        labelHi: 'टिकट बनाएं',
        labelMr: 'तिकीट तयार करा',
        permission: PERMISSIONS.TICKET_CREATE,
        isProjectRoute: true,
      },
    ],
  },
  {
    path: 'knowledge-base',
    icon: <MdBook />,
    label: 'Knowledge Base',
    labelHi: 'ज्ञान आधार',
    labelMr: 'ज्ञान आधार',
    permission: PERMISSIONS.KB_VIEW, // Only need view permission to access KB
    isProjectRoute: true,
  },
  {
    path: 'offline',
    icon: <MdSettings />,
    label: 'Offline Support',
    labelHi: 'ऑफ़लाइन सहायता',
    labelMr: 'ऑफलाइन सहाय्य',
    permission: PERMISSIONS.OFFLINE_MODULE_ACCESS, // Specific permission instead of module prefix
    isProjectRoute: true,
  },
  {
    path: 'users',
    icon: <MdPeople />,
    label: 'User Management',
    labelHi: 'उपयोगकर्ता प्रबंधन',
    labelMr: 'वापरकर्ता व्यवस्थापन',
    modulePrefix: PERMISSION_MODULES.USER,
    isProjectRoute: true,
  },
  {
    icon: <MdFactCheck />,
    label: 'Audit Logs',
    labelHi: 'ऑडिट लॉग',
    labelMr: 'ऑडिट लॉग',
    permission: [PERMISSIONS.AUDIT_VIEW_ACTIVITY, PERMISSIONS.AUDIT_VIEW_ACCESS],
    isProjectRoute: true,
    subItems: [
      {
        path: 'audit/activity-logs',
        icon: <MdHistory />,
        label: 'Activity Logs',
        labelHi: 'गतिविधि लॉग',
        labelMr: 'अॅक्टिव्हिटी लॉग',
        permission: PERMISSIONS.AUDIT_VIEW_ACTIVITY,
        isProjectRoute: true,
      },
      {
        path: 'audit/access-logs',
        icon: <MdLogin />,
        label: 'Access Logs',
        labelHi: 'एक्सेस लॉग',
        labelMr: 'अॅक्सेस लॉग',
        permission: PERMISSIONS.AUDIT_VIEW_ACCESS,
        isProjectRoute: true,
      },
    ],
  },
];

/**
 * Helper function to check if user has permission for a menu item
 */
export const hasMenuItemPermission = (
  item: MenuItem,
  userPermissions: string[]
): boolean => {
  // Enhanced debug logging for ALL menu items
  console.log(`🔍 Checking permission for "${item.label}":`, {
    itemPermission: item.permission,
    modulePrefix: item.modulePrefix,
    userPermissions: userPermissions,
    hasSubItems: !!item.subItems,
    path: item.path
  });
  
  // No permission requirement = visible to all
  if (!item.permission && !item.modulePrefix) {
    console.log(`✅ "${item.label}" - No permission required, visible to all`);
    return true;
  }

  // Check module prefix (has any permission starting with prefix)
  if (item.modulePrefix) {
    return userPermissions.some((perm) => perm.startsWith(item.modulePrefix!));
  }

  // Check specific permission(s)
  if (item.permission) {
    // Array of permissions (OR logic by default)
    if (Array.isArray(item.permission)) {
      if (item.requireAll) {
        // AND logic - user needs ALL permissions
        return item.permission.every((perm) => userPermissions.includes(perm));
      } else {
        // OR logic - user needs ANY one permission
        return item.permission.some((perm) => userPermissions.includes(perm));
      }
    }
    // Single permission
    return userPermissions.includes(item.permission);
  }

  return false;
};

/**
 * Filter menu items based on user permissions
 */
export const getFilteredMenuItems = (
  menuItems: MenuItem[],
  userPermissions: string[]
): MenuItem[] => {
  console.log('🎯 getFilteredMenuItems called with permissions:', userPermissions);
  
  // Get user role from localStorage to check role-based exclusions
  const userRole = localStorage.getItem('userRole') || '';
  console.log('👤 User role:', userRole);
  
  return menuItems
    .map((item) => {
      // Check if this item should be excluded for this role
      if (item.excludeForRoles && item.excludeForRoles.includes(userRole)) {
        console.log(`❌ "${item.label}" - Excluded for role: ${userRole}`);
        return null;
      }
      
      // Check if user has permission for this item
      if (!hasMenuItemPermission(item, userPermissions)) {
        console.log(`❌ "${item.label}" - Permission check FAILED`);
        return null;
      }

      // If item has subItems, filter them too
      if (item.subItems) {
        console.log(`📂 "${item.label}" has ${item.subItems.length} subItems, filtering...`);
        const filteredSubItems = item.subItems.filter((subItem) => {
          // Check role-based exclusion for subitems
          if (subItem.excludeForRoles && subItem.excludeForRoles.includes(userRole)) {
            console.log(`   ❌ SubItem: "${subItem.label}" - Excluded for role: ${userRole}`);
            return false;
          }
          
          const hasPerm = hasMenuItemPermission(subItem, userPermissions);
          console.log(`   ${hasPerm ? '✅' : '❌'} SubItem: "${subItem.label}"`);
          return hasPerm;
        });

        console.log(`📂 "${item.label}" - Filtered subItems: ${filteredSubItems.length}/${item.subItems.length}`);
        
        // Only show parent if at least one sub-item is visible
        if (filteredSubItems.length === 0) {
          console.log(`❌ "${item.label}" - No visible subItems, hiding parent`);
          return null;
        }

        return {
          ...item,
          subItems: filteredSubItems,
        };
      }

      console.log(`✅ "${item.label}" - Visible (no subItems)`);
      return item;
    })
    .filter((item): item is MenuItem => item !== null);
};
