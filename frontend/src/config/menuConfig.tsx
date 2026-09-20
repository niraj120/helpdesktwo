import { ReactNode } from "react";
import {
  MdDashboard,
  MdFolder,
  MdSettings,
  MdSecurity,
  MdPeople,
  MdPerson,
  MdConfirmationNumber,
  MdCheckCircle,
  MdSchedule,
  MdBook,
  MdQuestionAnswer,
  MdIntegrationInstructions,
  MdPhoneInTalk,
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
  MdArticle,
  MdVisibility,
  MdTableChart,
  MdFingerprint,
  MdMonitorHeart,
  MdStorage,
  MdInsights,
  MdVpnKey,
  MdNotifications,
  MdCalendarToday,
} from "react-icons/md";
import { PERMISSIONS, PERMISSION_MODULES } from "../constants/permissions";

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
  // Dashboard Module - all dashboard sub-pages grouped under one parent
  {
    icon: <MdDashboard />,
    label: "Dashboard",
    labelHi: "डैशबोर्ड",
    labelMr: "डॅशबोर्ड",
    // No permission required - sub-items control individual visibility
    subItems: [
      {
        path: "/dashboard",
        icon: <MdDashboard />,
        label: "Overview",
        labelHi: "अवलोकन",
        labelMr: "आढावा",
        // No permission required - everyone can see dashboard
      },
      {
        path: "/dashboard-engine",
        icon: <MdInsights />,
        label: "My Dashboards",
        labelHi: "मेरे डैशबोर्ड",
        labelMr: "माझे डॅशबोर्ड",
        // No permission required - assignment controls visibility
      },
      {
        path: "/my-dashboards",
        icon: <MdInsights />,
        label: "Personal Dashboards",
        labelHi: "व्यक्तिगत डैशबोर्ड",
        labelMr: "वैयक्तिक डॅशबोर्ड",
        // No permission required - available to all users
      },
      {
        path: "/admin/dashboards",
        icon: <MdTableChart />,
        label: "Manage Templates",
        labelHi: "टेम्पलेट प्रबंधन",
        labelMr: "टेम्पलेट व्यवस्थापन",
        permission: "dashboard.manage",
      },
      {
        path: "/admin/dashboard-builder",
        icon: <MdTableChart />,
        label: "Dashboard Builder",
        labelHi: "डैशबोर्ड बिल्डर",
        labelMr: "डॅशबोर्ड बिल्डर",
        permission: "dashboard.manage",
      },
      {
        path: "/admin/dashboard-usage",
        icon: <MdTableChart />,
        label: "Usage Analytics",
        labelHi: "उपयोग विश्लेषण",
        labelMr: "वापर विश्लेषण",
        permission: "dashboard.manage",
      },
      {
        path: "/admin/targets",
        icon: <MdTableChart />,
        label: "Target Management",
        labelHi: "लक्ष्य प्रबंधन",
        labelMr: "लक्ष्य व्यवस्थापन",
        permission: "dashboard.manage",
      },
    ],
  },

  // Project Management - Super Admin only
  {
    path: "/projects",
    icon: <MdFolder />,
    label: "Project Management",
    labelHi: "प्रोजेक्ट प्रबंधन",
    labelMr: "प्रकल्प व्यवस्थापन",
    modulePrefix: PERMISSION_MODULES.PROJECT,
  },

  // Master Data - Super Admin only
  {
    path: "/master-data",
    icon: <MdSettings />,
    label: "Master Data",
    labelHi: "मास्टर डेटा",
    labelMr: "मास्टर डेटा",
    permission: PERMISSIONS.MASTER_DATA_VIEW,
  },

  // RBAC Setup - Super Admin only
  {
    path: "/rbac",
    icon: <MdSecurity />,
    label: "RBAC Setup",
    labelHi: "RBAC सेटअप",
    labelMr: "RBAC सेटअप",
    modulePrefix: PERMISSION_MODULES.RBAC,
  },

  // User Management - Managers and Super Admin
  {
    path: "/users",
    icon: <MdPeople />,
    label: "User Management",
    labelHi: "उपयोगकर्ता प्रबंधन",
    labelMr: "वापरकर्ता व्यवस्थापन",
    modulePrefix: PERMISSION_MODULES.USER,
  },

  // Queries - For Center Managers and Agents
  {
    icon: <MdConfirmationNumber />,
    label: "Queries",
    labelHi: "टिकट",
    labelMr: "तिकीटे",
    permission: [
      PERMISSIONS.TICKET_VIEW_ALL,
      PERMISSIONS.TICKET_VIEW_OWN,
      PERMISSIONS.TICKET_ASSIGN,
      PERMISSIONS.TICKET_CREATE,
    ],
    subItems: [
      {
        path: "/tickets/view",
        icon: <MdConfirmationNumber />,
        label: "View Queries",
        labelHi: "टिकट देखें",
        labelMr: "तिकीटे पहा",
        permission: PERMISSIONS.TICKET_VIEW_ALL,
      },
      {
        path: "/tickets/my-tickets",
        icon: <MdPeople />,
        label: "My Queries",
        labelHi: "मेरे टिकट",
        labelMr: "माझी तिकीटे",
        permission: PERMISSIONS.TICKET_VIEW_OWN,
        excludeForRoles: ["SUPER_ADMIN"], // Super Admin doesn't need this submenu
      },
      {
        path: "/tickets/assign",
        icon: <MdPeople />,
        label: "Assign Queries",
        labelHi: "टिकट असाइन करें",
        labelMr: "तिकीटे नियुक्त करा",
        permission: PERMISSIONS.TICKET_ASSIGN,
      },
    ],
  },

  // Service Requests (PSR/ISR) — one hub for all channels
  {
    path: "/service-requests",
    icon: <MdConfirmationNumber />,
    label: "Service Requests",
    labelHi: "सेवा अनुरोध",
    labelMr: "सेवा विनंती",
    permission: [
      PERMISSIONS.SR_ACCESS,
      PERMISSIONS.EMAIL_TRIAGE_ACCESS,
      PERMISSIONS.IVR_TRIAGE_ACCESS,
    ],
  },

  // Service Request Settings — one place to configure everything
  {
    path: "/sr-settings",
    icon: <MdSettings />,
    label: "SR Settings",
    labelHi: "एसआर सेटिंग्स",
    labelMr: "एसआर सेटिंग्ज",
    permission: [
      PERMISSIONS.SR_CONFIG_MANAGE,
      PERMISSIONS.USER_ASSIGN_ROLE,
      PERMISSIONS.USER_IMPORT,
    ],
  },

  // Meeting rooms — booking calendar, then its setup
  {
    path: "/meeting-rooms",
    icon: <MdCalendarToday />,
    label: "Meeting Rooms",
    labelHi: "मीटिंग रूम",
    labelMr: "मीटिंग रूम",
    permission: [
      PERMISSIONS.MEETING_ROOM_VIEW_CALENDAR,
      PERMISSIONS.MEETING_ROOM_BOOK,
    ],
  },
  {
    path: "/meeting-room-settings",
    icon: <MdSettings />,
    label: "Meeting Room Settings",
    labelHi: "मीटिंग रूम सेटिंग्स",
    labelMr: "मीटिंग रूम सेटिंग्ज",
    permission: [
      PERMISSIONS.MEETING_ROOM_MANAGE_ROOMS,
      PERMISSIONS.MEETING_ROOM_MANAGE_MASTERS,
      PERMISSIONS.MEETING_ROOM_MANAGE_DEVICE,
    ],
  },

  // IVR Agent Management — digit mapping, round-robin, leaves
  {
    path: "/ivr-agents",
    icon: <MdConfirmationNumber />,
    label: "IVR Agents",
    labelHi: "आईवीआर एजेंट",
    labelMr: "आयव्हीआर एजंट",
    permission: PERMISSIONS.IVR_AGENT_MANAGE,
  },

  // Query Configuration - Super Admin only
  {
    path: "/ticket-config",
    icon: <MdSettings />,
    label: "Query Configuration",
    labelHi: "टिकट कॉन्फ़िगरेशन",
    labelMr: "तिकीट कॉन्फिगरेशन",
    permission: [
      PERMISSIONS.TICKET_CONFIG_VIEW,
      PERMISSIONS.TICKET_CONFIG_MANAGE_CATEGORIES,
      PERMISSIONS.TICKET_CONFIG_MANAGE_STATUSES,
      PERMISSIONS.TICKET_CONFIG_MANAGE_PRIORITIES,
      PERMISSIONS.TICKET_CONFIG_MANAGE_TABLE_COLUMNS,
    ],
  },

  // Offline Module Setup - Super Admin and Managers
  {
    path: "/offline-module",
    icon: <MdSettings />,
    label: "Offline Module Setup",
    labelHi: "ऑफ़लाइन मॉड्यूल सेटअप",
    labelMr: "ऑफलाइन मॉड्यूल सेटअप",
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
    path: "/sla",
    icon: <MdSchedule />,
    label: "SLA & Escalation",
    labelHi: "SLA और एस्केलेशन",
    labelMr: "SLA आणि वाढीव प्रक्रिया",
    modulePrefix: PERMISSION_MODULES.SLA,
  },

  // Knowledge Base - Modular system with levels, articles, and tables
  {
    icon: <MdBook />,
    label: "Knowledge Base",
    labelHi: "ज्ञान आधार",
    labelMr: "ज्ञान आधार",
    permission: [
      PERMISSIONS.KB_VIEW_CONTENT,
      PERMISSIONS.KB_MANAGE,
      PERMISSIONS.KB_MANAGE_LEVELS,
      PERMISSIONS.KB_MANAGE_ARTICLES,
      PERMISSIONS.KB_MANAGE_TABLES,
    ],
    subItems: [
      {
        path: "/kb-new/levels",
        icon: <MdCategory />,
        label: "Manage Levels",
        labelHi: "स्तर प्रबंधित करें",
        labelMr: "स्तर व्यवस्थापित करा",
        permission: [PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_LEVELS],
      },
      {
        path: "/kb-new/articles",
        icon: <MdArticle />,
        label: "Manage Articles",
        labelHi: "लेख प्रबंधित करें",
        labelMr: "लेख व्यवस्थापित करा",
        permission: [PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_ARTICLES],
      },
      {
        path: "/kb-new/tables",
        icon: <MdTableChart />,
        label: "Manage Tables",
        labelHi: "तालिका प्रबंधित करें",
        labelMr: "तक्ते व्यवस्थापित करा",
        permission: [PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_TABLES],
      },
      {
        path: "/kb-new/viewer",
        icon: <MdVisibility />,
        label: "View KB",
        labelHi: "KB देखें",
        labelMr: "KB पहा",
        permission: [
          PERMISSIONS.KB_VIEW_CONTENT,
          PERMISSIONS.KB_MANAGE,
          PERMISSIONS.KB_MANAGE_LEVELS,
          PERMISSIONS.KB_MANAGE_ARTICLES,
          PERMISSIONS.KB_MANAGE_TABLES,
        ],
      },
    ],
  },

  // FAQ - All users (view), Admins (manage)
  {
    path: "/faq",
    icon: <MdQuestionAnswer />,
    label: "FAQ",
    labelHi: "अक्सर पूछे जाने वाले प्रश्न",
    labelMr: "वारंवार विचारले जाणारे प्रश्न",
    permission: [
      PERMISSIONS.FAQ_VIEW,
      PERMISSIONS.FAQ_CREATE,
      PERMISSIONS.FAQ_MANAGE,
    ],
  },

  // Feedback Module - Super Admin, Project Admin
  {
    icon: <MdChat />,
    label: "Feedback",
    labelHi: "फीडबैक",
    labelMr: "अभिप्राय",
    modulePrefix: PERMISSION_MODULES.FEEDBACK,
    subItems: [
      {
        path: "/feedback/forms",
        icon: <MdFactCheck />,
        label: "Manage Forms",
        labelHi: "फॉर्म प्रबंधन",
        labelMr: "फॉर्म व्यवस्थापन",
        permission: [
          PERMISSIONS.FEEDBACK_FORM_CREATE,
          PERMISSIONS.FEEDBACK_FORM_EDIT,
        ],
      },
      {
        path: "/feedback/responses",
        icon: <MdBarChart />,
        label: "View Responses",
        labelHi: "प्रतिक्रियाएं देखें",
        labelMr: "प्रतिसाद पहा",
        permission: PERMISSIONS.FEEDBACK_VIEW,
      },
    ],
  },

  // Asset Management - Super Admin, CET State Cell only
  {
    icon: <MdFactCheck />,
    label: "Asset Management",
    labelHi: "संपत्ति प्रबंधन",
    labelMr: "मालमत्ता व्यवस्थापन",
    modulePrefix: PERMISSION_MODULES.ASSET,
    excludeForRoles: [
      "STUDENT",
      "COUNSELOR_L1",
      "CET_STATE_CELL",
      "AGENT",
      "SUPPORT_ADMIN",
      "ACCOUNT_OWNER",
    ],
    subItems: [
      {
        path: "/assets",
        icon: <MdCategory />,
        label: "Master Assets",
        labelHi: "मास्टर संपत्ति",
        labelMr: "मास्टर मालमत्ता",
        permission: PERMISSIONS.ASSET_VIEW,
      },
      {
        path: "/center-assets",
        icon: <MdFolder />,
        label: "Center Assets",
        labelHi: "केंद्र संपत्ति",
        labelMr: "केंद्र मालमत्ता",
        permission: PERMISSIONS.ASSET_MANAGE,
      },
      {
        path: "/my-assets",
        icon: <MdPerson />,
        label: "My Assets",
        labelHi: "मेरी संपत्ति",
        labelMr: "माझी मालमत्ता",
        permission: PERMISSIONS.ASSET_MANAGE,
      },
    ],
  },

  // Integrations - Super Admin only
  {
    icon: <MdIntegrationInstructions />,
    label: "Integrations",
    labelHi: "एकीकरण",
    labelMr: "इंटिग्रेशन",
    modulePrefix: PERMISSION_MODULES.INTEGRATION,
    subItems: [
      {
        path: "/integrations/psr-builder",
        icon: <MdStorage />,
        label: "PSR Builder",
        labelHi: "PSR बिल्डर",
        labelMr: "PSR बिल्डर",
        permission: PERMISSIONS.MDM_VIEW,
      },
      {
        path: "/email-config",
        icon: <MdMailOutline />,
        label: "Email Configuration",
        labelHi: "ईमेल विन्यास",
        labelMr: "ईमेल कॉन्फिगरेशन",
        permission: "PROJECT_MANAGE_SETTINGS",
      },
      {
        path: "/integrations/email-to-ticket",
        icon: <MdMailOutline />,
        label: "Email-to-Ticket",
        labelHi: "ईमेल-टू-टिकट",
        labelMr: "ईमेल-टू-टिकट",
        permission: "EMAIL_CONFIG_VIEW",
      },
      {
        path: "/integrations/public-api-keys",
        icon: <MdVpnKey />,
        label: "Public API Keys",
        labelHi: "सार्वजनिक API कुंजी",
        labelMr: "सार्वजनिक API की",
        permission: "PROJECT_MANAGE_SETTINGS",
      },
      {
        path: "/integrations/whatsapp-widget",
        icon: <MdChat />,
        label: "WhatsApp Widget",
        labelHi: "व्हाट्सएप विजेट",
        labelMr: "व्हाट्सअ‍ॅप विजेट",
        permission: "PROJECT_MANAGE_SETTINGS",
      },
      {
        path: "/integrations/tata-voice",
        icon: <MdPhoneInTalk />,
        label: "TATA Voice (Click-to-Call)",
        labelHi: "टाटा वॉइस (क्लिक-टू-कॉल)",
        labelMr: "टाटा व्हॉइस (क्लिक-टू-कॉल)",
        permission: "PROJECT_MANAGE_SETTINGS",
      },
    ],
  },

  // Reports - Managers and Super Admin
  {
    path: "/reports",
    icon: <MdBarChart />,
    label: "Reports",
    labelHi: "रिपोर्ट",
    labelMr: "अहवाल",
    modulePrefix: PERMISSION_MODULES.REPORT,
  },

  // Notifications
  {
    icon: <MdNotifications />,
    label: "Notifications",
    labelHi: "सूचनाएं",
    labelMr: "सूचना",
    permission: [
      PERMISSIONS.NOTIFICATION_VIEW_SETTINGS,
      PERMISSIONS.NOTIFICATION_MANAGE,
      PERMISSIONS.NOTIFICATION_PERSONAL_PREFERENCES,
    ],
    subItems: [
      {
        path: "/notifications",
        icon: <MdNotifications />,
        label: "My Notifications",
        labelHi: "मेरी सूचनाएं",
        labelMr: "माझ्या सूचना",
        // No specific permission - all authenticated users
      },
      {
        path: "/admin/notification-settings",
        icon: <MdSettings />,
        label: "Notification Settings",
        labelHi: "सूचना सेटिंग",
        labelMr: "सूचना सेटिंग",
        permission: PERMISSIONS.NOTIFICATION_VIEW_SETTINGS,
      },
      {
        path: "/profile/notifications",
        icon: <MdPerson />,
        label: "My Preferences",
        labelHi: "मेरी प्राथमिकताएं",
        labelMr: "माझ्या प्राधान्यता",
        permission: PERMISSIONS.NOTIFICATION_PERSONAL_PREFERENCES,
      },
    ],
  },

  // Audit Logs - Super Admin and Managers with submenu
  {
    icon: <MdFactCheck />,
    label: "Audit Logs",
    labelHi: "ऑडिट लॉग",
    labelMr: "ऑडिट लॉग",
    permission: [
      PERMISSIONS.AUDIT_VIEW_ACTIVITY,
      PERMISSIONS.AUDIT_VIEW_ACCESS,
    ],
    subItems: [
      {
        path: "/audit/activity-logs",
        icon: <MdHistory />,
        label: "Activity Logs",
        labelHi: "गतिविधि लॉग",
        labelMr: "अॅक्टिव्हिटी लॉग",
        permission: PERMISSIONS.AUDIT_VIEW_ACTIVITY,
      },
      {
        path: "/audit/access-logs",
        icon: <MdLogin />,
        label: "Access Logs",
        labelHi: "एक्सेस लॉग",
        labelMr: "अॅक्सेस लॉग",
        permission: PERMISSIONS.AUDIT_VIEW_ACCESS,
      },
      {
        path: "/audit/email-logs",
        icon: <MdMailOutline />,
        label: "Email Logs",
        labelHi: "ईमेल लॉग",
        labelMr: "ईमेल लॉग",
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

  // Attendance Module
  {
    icon: <MdFingerprint />,
    label: "Attendance",
    labelHi: "उपस्थिति",
    labelMr: "उपस्थिती",
    permission: [
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_REPORT_VIEW,
      PERMISSIONS.ATTENDANCE_SYNC,
      PERMISSIONS.ATTENDANCE_CONFIG,
    ],
    subItems: [
      {
        path: "/attendance/records",
        icon: <MdFactCheck />,
        label: "View Records",
        labelHi: "रिकॉर्ड देखें",
        labelMr: "रेकॉर्ड पहा",
        permission: PERMISSIONS.ATTENDANCE_VIEW,
      },
      {
        path: "/attendance/report",
        icon: <MdInsights />,
        label: "Attendance Report",
        labelHi: "उपस्थिति रिपोर्ट",
        labelMr: "उपस्थिती अहवाल",
        permission: PERMISSIONS.ATTENDANCE_REPORT_VIEW,
      },
      {
        path: "/attendance/employees",
        icon: <MdPeople />,
        label: "Biometric Sync",
        labelHi: "बायोमेट्रिक सिंक",
        labelMr: "बायोमेट्रिक सिंक",
        permission: PERMISSIONS.ATTENDANCE_SYNC,
      },
      {
        path: "/attendance/config",
        icon: <MdSettings />,
        label: "Configuration",
        labelHi: "कॉन्फ़िगरेशन",
        labelMr: "कॉन्फिगरेशन",
        permission: PERMISSIONS.ATTENDANCE_CONFIG,
      },
    ],
  },

  // System Monitoring - Super Admin only
  {
    icon: <MdMonitorHeart />,
    label: "System Monitoring",
    labelHi: "सिस्टम मॉनिटरिंग",
    labelMr: "सिस्टम मॉनिटरिंग",
    modulePrefix: PERMISSION_MODULES.AUDIT, // Reusing AUDIT module for now - Super Admin only
    subItems: [
      {
        path: "/system/db-monitoring",
        icon: <MdStorage />,
        label: "Database Monitoring",
        labelHi: "डेटाबेस मॉनिटरिंग",
        labelMr: "डेटाबेस मॉनिटरिंग",
        permission: PERMISSIONS.AUDIT_VIEW_ACTIVITY, // Super Admin permission
      },
    ],
  },
];

/**
 * Project Portal Menu Configuration
 * These items are for project-specific portals (agents, managers)
 */
export const projectPortalMenuConfig: MenuItem[] = [
  {
    path: "dashboard", // Relative path, will be prefixed with /:customUrlPath/portal/
    icon: <MdDashboard />,
    label: "Dashboard",
    labelHi: "डैशबोर्ड",
    labelMr: "डॅशबोर्ड",
    permission: PERMISSIONS.DASHBOARD_VIEW, // Now permission-based, not hardcoded
    isProjectRoute: true,
  },
  {
    icon: <MdConfirmationNumber />,
    label: "Queries",
    labelHi: "टिकट",
    labelMr: "तिकीटे",
    permission: [
      PERMISSIONS.TICKET_ASSIGN,
      PERMISSIONS.TICKET_CREATE,
      PERMISSIONS.TICKET_VIEW_OWN,
      PERMISSIONS.TICKET_VIEW_ALL,
    ],
    isProjectRoute: true,
    subItems: [
      {
        path: "tickets/view",
        icon: <MdConfirmationNumber />,
        label: "View Queries",
        labelHi: "सभी टिकट देखें",
        labelMr: "सर्व तिकीटे पहा",
        permission: PERMISSIONS.TICKET_VIEW_ALL,
        isProjectRoute: true,
      },
      {
        path: "tickets/my-tickets",
        icon: <MdConfirmationNumber />,
        label: "My Queries",
        labelHi: "मेरे टिकट",
        labelMr: "माझी तिकीटे",
        permission: PERMISSIONS.TICKET_VIEW_OWN,
        isProjectRoute: true,
      },
      {
        path: "tickets/assign",
        icon: <MdPeople />,
        label: "Assign Queries",
        labelHi: "टिकट असाइन करें",
        labelMr: "तिकीटे नियुक्त करा",
        permission: PERMISSIONS.TICKET_ASSIGN,
        isProjectRoute: true,
      },
      {
        path: "tickets/create",
        icon: <MdConfirmationNumber />,
        label: "Create Query",
        labelHi: "टिकट बनाएं",
        labelMr: "तिकीट तयार करा",
        permission: PERMISSIONS.TICKET_CREATE,
        isProjectRoute: true,
      },
    ],
  },
  {
    path: "faq",
    icon: <MdQuestionAnswer />,
    label: "FAQ",
    labelHi: "अक्सर पूछे जाने वाले प्रश्न",
    labelMr: "वारंवार विचारले जाणारे प्रश्न",
    permission: PERMISSIONS.FAQ_VIEW, // All users can view FAQs
    isProjectRoute: true,
  },
  {
    path: "offline",
    icon: <MdSettings />,
    label: "Offline Support",
    labelHi: "ऑफ़लाइन सहायता",
    labelMr: "ऑफलाइन सहाय्य",
    permission: PERMISSIONS.OFFLINE_MODULE_ACCESS, // Specific permission instead of module prefix
    isProjectRoute: true,
  },
  {
    path: "service-requests",
    icon: <MdConfirmationNumber />,
    label: "Service Requests",
    labelHi: "Service Requests",
    labelMr: "Service Requests",
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
    isProjectRoute: true,
  },
  {
    path: "meeting-rooms",
    icon: <MdCalendarToday />,
    label: "Meeting Rooms",
    labelHi: "मीटिंग रूम",
    labelMr: "मीटिंग रूम",
    permission: [
      PERMISSIONS.MEETING_ROOM_VIEW_CALENDAR,
      PERMISSIONS.MEETING_ROOM_BOOK,
    ],
    isProjectRoute: true,
  },
  {
    path: "meeting-room-settings",
    icon: <MdSettings />,
    label: "Meeting Room Settings",
    labelHi: "मीटिंग रूम सेटिंग्स",
    labelMr: "मीटिंग रूम सेटिंग्ज",
    permission: [
      PERMISSIONS.MEETING_ROOM_MANAGE_ROOMS,
      PERMISSIONS.MEETING_ROOM_MANAGE_MASTERS,
      PERMISSIONS.MEETING_ROOM_MANAGE_DEVICE,
    ],
    isProjectRoute: true,
  },
  {
    path: "sr-settings",
    icon: <MdSettings />,
    label: "SR Settings",
    labelHi: "एसआर सेटिंग्स",
    labelMr: "एसआर सेटिंग्ज",
    permission: [
      PERMISSIONS.SR_CONFIG_MANAGE,
      PERMISSIONS.USER_ASSIGN_ROLE,
      PERMISSIONS.USER_IMPORT,
    ],
    isProjectRoute: true,
  },
  {
    path: "ivr-agents",
    icon: <MdConfirmationNumber />,
    label: "IVR Agents",
    labelHi: "आईवीआर एजेंट",
    labelMr: "आयव्हीआर एजंट",
    permission: PERMISSIONS.IVR_AGENT_MANAGE,
    isProjectRoute: true,
  },
  {
    path: "my-assets",
    icon: <MdPerson />,
    label: "My Assets",
    labelHi: "मेरी संपत्ति",
    labelMr: "माझी मालमत्ता",
    permission: PERMISSIONS.MY_ASSETS_VIEW,
    isProjectRoute: true,
  },
  {
    path: "users",
    icon: <MdPeople />,
    label: "User Management",
    labelHi: "उपयोगकर्ता प्रबंधन",
    labelMr: "वापरकर्ता व्यवस्थापन",
    modulePrefix: PERMISSION_MODULES.USER,
    isProjectRoute: true,
  },
  {
    icon: <MdBook />,
    label: "Knowledge Base",
    labelHi: "नॉलेज बेस",
    labelMr: "नॉलेज बेस",
    permission: [
      PERMISSIONS.KB_VIEW_CONTENT,
      PERMISSIONS.KB_MANAGE,
      PERMISSIONS.KB_MANAGE_LEVELS,
      PERMISSIONS.KB_MANAGE_ARTICLES,
      PERMISSIONS.KB_MANAGE_TABLES,
    ],
    isProjectRoute: true,
    subItems: [
      {
        path: "kb-new/levels",
        icon: <MdCategory />,
        label: "Manage Levels",
        labelHi: "स्तर प्रबंधित करें",
        labelMr: "स्तर व्यवस्थापित करा",
        permission: [PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_LEVELS],
        isProjectRoute: true,
      },
      {
        path: "kb-new/articles",
        icon: <MdArticle />,
        label: "Manage Articles",
        labelHi: "लेख प्रबंधित करें",
        labelMr: "लेख व्यवस्थापित करा",
        permission: [PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_ARTICLES],
        isProjectRoute: true,
      },
      {
        path: "kb-new/tables",
        icon: <MdTableChart />,
        label: "Manage Tables",
        labelHi: "तालिका प्रबंधित करें",
        labelMr: "तक्ते व्यवस्थापित करा",
        permission: [PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_TABLES],
        isProjectRoute: true,
      },
      {
        path: "kb-new/viewer",
        icon: <MdVisibility />,
        label: "View KB",
        labelHi: "KB देखें",
        labelMr: "KB पहा",
        permission: [
          PERMISSIONS.KB_VIEW_CONTENT,
          PERMISSIONS.KB_MANAGE,
          PERMISSIONS.KB_MANAGE_LEVELS,
          PERMISSIONS.KB_MANAGE_ARTICLES,
          PERMISSIONS.KB_MANAGE_TABLES,
        ],
        isProjectRoute: true,
      },
    ],
  },
  {
    path: "reports",
    icon: <MdBarChart />,
    label: "Reports",
    labelHi: "रिपोर्ट",
    labelMr: "अहवाल",
    permission: PERMISSIONS.REPORT_VIEW_TICKETS,
    isProjectRoute: true,
  },
  {
    icon: <MdFingerprint />,
    label: "Attendance",
    labelHi: "उपस्थिति",
    labelMr: "उपस्थिती",
    permission: [
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_REPORT_VIEW,
      PERMISSIONS.ATTENDANCE_SYNC,
      PERMISSIONS.ATTENDANCE_CONFIG,
    ],
    isProjectRoute: true,
    subItems: [
      {
        path: "attendance/report",
        icon: <MdBarChart />,
        label: "View Attendance",
        labelHi: "उपस्थिति रिपोर्ट",
        labelMr: "उपस्थिती अहवाल",
        permission: PERMISSIONS.ATTENDANCE_REPORT_VIEW,
        isProjectRoute: true,
      },
      {
        path: "attendance/records",
        icon: <MdFactCheck />,
        label: "View Records",
        labelHi: "रिकॉर्ड देखें",
        labelMr: "रेकॉर्ड पहा",
        permission: PERMISSIONS.ATTENDANCE_VIEW,
        isProjectRoute: true,
      },
      {
        path: "attendance/employees",
        icon: <MdPeople />,
        label: "Biometric Sync",
        labelHi: "बायोमेट्रिक सिंक",
        labelMr: "बायोमेट्रिक सिंक",
        permission: PERMISSIONS.ATTENDANCE_SYNC,
        isProjectRoute: true,
      },
      {
        path: "attendance/config",
        icon: <MdSettings />,
        label: "Configuration",
        labelHi: "कॉन्फ़िगरेशन",
        labelMr: "कॉन्फिगरेशन",
        permission: PERMISSIONS.ATTENDANCE_CONFIG,
        isProjectRoute: true,
      },
    ],
  },
  {
    icon: <MdFactCheck />,
    label: "Audit Logs",
    labelHi: "ऑडिट लॉग",
    labelMr: "ऑडिट लॉग",
    permission: [
      PERMISSIONS.AUDIT_VIEW_ACTIVITY,
      PERMISSIONS.AUDIT_VIEW_ACCESS,
    ],
    isProjectRoute: true,
    subItems: [
      {
        path: "audit/activity-logs",
        icon: <MdHistory />,
        label: "Activity Logs",
        labelHi: "गतिविधि लॉग",
        labelMr: "अॅक्टिव्हिटी लॉग",
        permission: PERMISSIONS.AUDIT_VIEW_ACTIVITY,
        isProjectRoute: true,
      },
      {
        path: "audit/access-logs",
        icon: <MdLogin />,
        label: "Access Logs",
        labelHi: "एक्सेस लॉग",
        labelMr: "अॅक्सेस लॉग",
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
  userPermissions: string[],
): boolean => {
  // Super Admin bypass — read role code from JWT (reliable source)
  // localStorage.userRole stores display name ("Super Admin"), NOT the code ("SUPER_ADMIN")
  try {
    const token = localStorage.getItem("authToken");
    if (token) {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.role?.code === "SUPER_ADMIN") return true;
      }
    }
  } catch {
    /* ignore */
  }

  // No permission requirement = visible to all
  if (!item.permission && !item.modulePrefix) {
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
  userPermissions: string[],
): MenuItem[] => {
  // Get user role code from localStorage - with robust fallback
  let userRole = localStorage.getItem("userRole") || "";

  // If userRole doesn't look like a code (no underscore or all lowercase), try to get it from user object
  if (
    !userRole ||
    !userRole.includes("_") ||
    userRole !== userRole.toUpperCase()
  ) {
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        const extractedRole = user.role?.code || user.roleCode;
        if (extractedRole) {
          userRole = extractedRole;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return menuItems
    .map((item) => {
      // Check if this item should be excluded for this role
      if (item.excludeForRoles && item.excludeForRoles.includes(userRole)) {
        return null;
      }

      // Check if user has permission for this item
      if (!hasMenuItemPermission(item, userPermissions)) {
        return null;
      }

      // If item has subItems, filter them too
      if (item.subItems) {
        const filteredSubItems = item.subItems.filter((subItem) => {
          // Check role-based exclusion for subitems
          if (
            subItem.excludeForRoles &&
            subItem.excludeForRoles.includes(userRole)
          ) {
            return false;
          }
          return hasMenuItemPermission(subItem, userPermissions);
        });

        // Only show parent if at least one sub-item is visible
        if (filteredSubItems.length === 0) {
          return null;
        }

        return {
          ...item,
          subItems: filteredSubItems,
        };
      }

      return item;
    })
    .filter((item): item is MenuItem => item !== null);
};
