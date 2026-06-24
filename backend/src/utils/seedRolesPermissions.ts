// Define all permissions for the helpdesk portal - Organized by Sidebar Navigation
interface HelpDeskPermission {
  module: string;
  name: string;
  code: string;
  description: string;
  category: string;
  [key: string]: any;
}

export const helpDeskPermissions: HelpDeskPermission[] = [
  // =====================================================
  // DASHBOARD CATEGORY
  // =====================================================
  {
    module: "Dashboard",
    name: "View Dashboard",
    code: "DASHBOARD_VIEW",
    description: "Can access and view dashboard",
    category: "dashboard",
  },
  {
    module: "Dashboard",
    name: "View Analytics",
    code: "DASHBOARD_VIEW_ANALYTICS",
    description: "Can view dashboard analytics and metrics",
    category: "dashboard",
  },
  {
    module: "Dashboard",
    name: "Export Dashboard Data",
    code: "DASHBOARD_EXPORT",
    description: "Can export dashboard data and reports",
    category: "dashboard",
  },
  // =====================================================
  // HIERARCHICAL DASHBOARD PERMISSIONS
  // =====================================================
  {
    module: "Dashboard",
    name: "View Own Dashboard",
    code: "DASHBOARD_VIEW_OWN",
    description: "Can view own tickets on the dashboard",
    category: "dashboard",
  },
  {
    module: "Dashboard",
    name: "View Team Dashboard",
    code: "DASHBOARD_VIEW_TEAM",
    description: "Can view direct team members' tickets on the dashboard",
    category: "dashboard",
  },
  {
    module: "Dashboard",
    name: "View Full Hierarchy Dashboard",
    code: "DASHBOARD_VIEW_HIERARCHY",
    description: "Can view multi-level team hierarchy on the dashboard",
    category: "dashboard",
  },
  {
    module: "Dashboard",
    name: "View Team Breakdown",
    code: "DASHBOARD_VIEW_TEAM_BREAKDOWN",
    description:
      "Can see individual team member ticket breakdown on the dashboard",
    category: "dashboard",
  },
  {
    module: "Dashboard",
    name: "View All Tickets Dashboard",
    code: "DASHBOARD_VIEW_ALL",
    description: "Can view all tickets globally on the dashboard",
    category: "dashboard",
  },
  {
    module: "Team Management",
    name: "Manage Team Hierarchy",
    code: "HIERARCHY_MANAGE_TEAM",
    description: "Can create and manage user reporting relationships",
    category: "rbac-setup",
  },
  {
    module: "Team Management",
    name: "View Team Structure",
    code: "HIERARCHY_VIEW_TEAM",
    description: "Can view the team reporting structure",
    category: "rbac-setup",
  },
  // =====================================================
  // PROJECT MANAGEMENT CATEGORY
  // =====================================================
  {
    module: "Project Management",
    name: "View All Projects",
    code: "PROJECT_VIEW_ALL",
    description: "Can view all projects/portals",
    category: "project-management",
  },
  {
    module: "Project Management",
    name: "Create Project",
    code: "PROJECT_CREATE",
    description: "Can create new projects/portals",
    category: "project-management",
  },
  {
    module: "Project Management",
    name: "Edit Project",
    code: "PROJECT_EDIT",
    description: "Can edit project settings and details",
    category: "project-management",
  },
  {
    module: "Project Management",
    name: "Delete Project",
    code: "PROJECT_DELETE",
    description: "Can delete projects",
    category: "project-management",
  },
  {
    module: "Project Management",
    name: "Activate/Deactivate Project",
    code: "PROJECT_TOGGLE_STATUS",
    description: "Can activate or deactivate projects",
    category: "project-management",
  },
  {
    module: "Project Management",
    name: "Manage Project Settings",
    code: "PROJECT_MANAGE_SETTINGS",
    description: "Can manage project configuration and settings",
    category: "project-management",
  },
  {
    module: "Project Management",
    name: "Manage Project Branding",
    code: "PROJECT_MANAGE_BRANDING",
    description: "Can customize project branding (logo, colors, theme)",
    category: "project-management",
  },
  {
    module: "Project Management",
    name: "Manage Project URL",
    code: "PROJECT_MANAGE_URL",
    description: "Can configure custom URL for project portal",
    category: "project-management",
  },
  {
    module: "Project Management",
    name: "Assign Users to Project",
    code: "PROJECT_ASSIGN_USERS",
    description: "Can assign users and roles to projects",
    category: "project-management",
  },
  // =====================================================
  // MASTER DATA CATEGORY
  // =====================================================
  {
    module: "Master Data",
    name: "View Master Data",
    code: "MASTER_DATA_VIEW",
    description: "Can view master data configurations",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Master Setup",
    code: "MASTER_DATA_MANAGE",
    description: "Full access to create, edit, and delete all master data",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Create Master Data",
    code: "MASTER_DATA_CREATE",
    description: "Can create new master data entries",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Edit Master Data",
    code: "MASTER_DATA_EDIT",
    description: "Can edit existing master data entries",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Delete Master Data",
    code: "MASTER_DATA_DELETE",
    description: "Can delete master data entries",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Ticket Categories",
    code: "MASTER_DATA_MANAGE_CATEGORIES",
    description: "Can create and manage ticket categories",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Ticket Priorities",
    code: "MASTER_DATA_MANAGE_PRIORITIES",
    description: "Can create and manage priority levels",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Ticket Statuses",
    code: "MASTER_DATA_MANAGE_STATUSES",
    description: "Can create and manage ticket statuses",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Countries",
    code: "MASTER_DATA_MANAGE_COUNTRIES",
    description: "Can create and manage countries",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage States",
    code: "MASTER_DATA_MANAGE_STATES",
    description: "Can create and manage states",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Cities",
    code: "MASTER_DATA_MANAGE_CITIES",
    description: "Can create and manage cities",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Asset Categories",
    code: "MASTER_DATA_MANAGE_ASSET_CATEGORIES",
    description: "Can create and manage asset categories",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Departments",
    code: "MASTER_DATA_MANAGE_DEPARTMENTS",
    description: "Can create and manage departments",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage Locations",
    code: "MASTER_DATA_MANAGE_LOCATIONS",
    description: "Can create and manage office locations",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "View MDM Sources",
    code: "MDM_VIEW",
    description: "Can view MDM (Master Data Management) source configurations and test endpoints",
    category: "master-data",
  },
  {
    module: "Master Data",
    name: "Manage MDM Sources",
    code: "MDM_MANAGE",
    description: "Can create, edit, and delete MDM (Master Data Management) source configurations",
    category: "master-data",
  },
  // =====================================================
  // RBAC SETUP CATEGORY
  // =====================================================
  {
    module: "RBAC Setup",
    name: "View Roles",
    code: "RBAC_VIEW_ROLES",
    description: "Can view roles and their permissions",
    category: "rbac-setup",
  },
  {
    module: "RBAC Setup",
    name: "Create Roles",
    code: "RBAC_CREATE_ROLE",
    description: "Can create new roles",
    category: "rbac-setup",
  },
  {
    module: "RBAC Setup",
    name: "Edit Roles",
    code: "RBAC_EDIT_ROLE",
    description: "Can edit role details and permissions",
    category: "rbac-setup",
  },
  {
    module: "RBAC Setup",
    name: "Delete Roles",
    code: "RBAC_DELETE_ROLE",
    description: "Can delete custom roles",
    category: "rbac-setup",
  },
  {
    module: "RBAC Setup",
    name: "Assign Permissions",
    code: "RBAC_ASSIGN_PERMISSIONS",
    description: "Can assign permissions to roles",
    category: "rbac-setup",
  },
  {
    module: "RBAC Setup",
    name: "View Permissions",
    code: "RBAC_VIEW_PERMISSIONS",
    description: "Can view all available permissions",
    category: "rbac-setup",
  },
  // =====================================================
  // USER MANAGEMENT CATEGORY
  // =====================================================
  {
    module: "User Management",
    name: "View All Users",
    code: "USER_VIEW_ALL",
    description: "Can view all users (agents and customers)",
    category: "user-management",
  },
  {
    module: "User Management",
    name: "Create User",
    code: "USER_CREATE",
    description: "Can create new user accounts",
    category: "user-management",
  },
  {
    module: "User Management",
    name: "Edit User",
    code: "USER_EDIT",
    description: "Can edit user details",
    category: "user-management",
  },
  {
    module: "User Management",
    name: "Delete User",
    code: "USER_DELETE",
    description: "Can delete user accounts",
    category: "user-management",
  },
  {
    module: "User Management",
    name: "Activate/Deactivate User",
    code: "USER_TOGGLE_STATUS",
    description: "Can activate or deactivate user accounts",
    category: "user-management",
  },
  {
    module: "User Management",
    name: "Assign Role",
    code: "USER_ASSIGN_ROLE",
    description: "Can assign roles to users",
    category: "user-management",
  },
  {
    module: "User Management",
    name: "Reset User Password",
    code: "USER_RESET_PASSWORD",
    description: "Can reset user passwords",
    category: "user-management",
  },
  {
    module: "User Management",
    name: "Import Users",
    code: "USER_IMPORT",
    description: "Can import users in bulk",
    category: "user-management",
  },
  // =====================================================
  // FIELDS & FORMS CATEGORY
  // =====================================================
  {
    module: "Fields & Forms",
    name: "View Ticket Fields",
    code: "FIELDS_VIEW_TICKET_FIELDS",
    description: "Can view ticket field configurations",
    category: "fields-forms",
  },
  {
    module: "Fields & Forms",
    name: "Manage Ticket Fields",
    code: "FIELDS_MANAGE_TICKET_FIELDS",
    description: "Can create and manage custom ticket fields",
    category: "fields-forms",
  },
  {
    module: "Fields & Forms",
    name: "Manage Ticket Forms",
    code: "FIELDS_MANAGE_TICKET_FORMS",
    description: "Can customize ticket submission forms",
    category: "fields-forms",
  },
  {
    module: "Fields & Forms",
    name: "Manage Activity Fields",
    code: "FIELDS_MANAGE_ACTIVITY_FIELDS",
    description: "Can create and manage activity fields",
    category: "fields-forms",
  },
  {
    module: "Fields & Forms",
    name: "Manage User Fields",
    code: "FIELDS_MANAGE_USER_FIELDS",
    description: "Can create and manage custom user fields",
    category: "fields-forms",
  },
  {
    module: "Fields & Forms",
    name: "Manage Contact Fields",
    code: "FIELDS_MANAGE_CONTACT_FIELDS",
    description: "Can create and manage contact group fields",
    category: "fields-forms",
  },
  {
    module: "Fields & Forms",
    name: "Manage Field Dependencies",
    code: "FIELDS_MANAGE_DEPENDENCIES",
    description: "Can configure field dependencies and conditional logic",
    category: "fields-forms",
  },
  // =====================================================
  // TICKET AUTOMATION CATEGORY
  // =====================================================
  {
    module: "Ticket Automation",
    name: "View Automations",
    code: "AUTOMATION_VIEW",
    description: "Can view automation rules",
    category: "ticket-automation",
  },
  {
    module: "Ticket Automation",
    name: "Manage Auto Assignments",
    code: "AUTOMATION_MANAGE_AUTO_ASSIGN",
    description: "Can configure automatic ticket assignment rules",
    category: "ticket-automation",
  },
  {
    module: "Ticket Automation",
    name: "Manage Create Ticket Triggers",
    code: "AUTOMATION_MANAGE_CREATE_TRIGGERS",
    description: "Can create triggers that run when tickets are created",
    category: "ticket-automation",
  },
  {
    module: "Ticket Automation",
    name: "Manage Update Ticket Triggers",
    code: "AUTOMATION_MANAGE_UPDATE_TRIGGERS",
    description: "Can create triggers that run when tickets are updated",
    category: "ticket-automation",
  },
  {
    module: "Ticket Automation",
    name: "Manage Time Triggers",
    code: "AUTOMATION_MANAGE_TIME_TRIGGERS",
    description: "Can create time-based automation triggers",
    category: "ticket-automation",
  },
  {
    module: "Ticket Automation",
    name: "Enable/Disable Automations",
    code: "AUTOMATION_TOGGLE",
    description: "Can enable or disable automation rules",
    category: "ticket-automation",
  },
  // =====================================================
  // APPROVAL PROCESS CATEGORY
  // =====================================================
  // Approval Setup (Admin Interface)
  {
    module: "Approval Process",
    name: "View Approval Workflows",
    code: "APPROVAL_WORKFLOWS_VIEW",
    description: "Can view approval workflow configurations",
    category: "approval-process",
  },
  {
    module: "Approval Process",
    name: "Create Approval Workflows",
    code: "APPROVAL_WORKFLOWS_CREATE",
    description: "Can create new approval workflows",
    category: "approval-process",
  },
  {
    module: "Approval Process",
    name: "Edit Approval Workflows",
    code: "APPROVAL_WORKFLOWS_EDIT",
    description: "Can edit existing approval workflows",
    category: "approval-process",
  },
  {
    module: "Approval Process",
    name: "Delete Approval Workflows",
    code: "APPROVAL_WORKFLOWS_DELETE",
    description: "Can delete approval workflows",
    category: "approval-process",
  },
  // Approval Inbox (Approver Interface)
  {
    module: "Approval Process",
    name: "Approve/Reject Tickets",
    code: "APPROVAL_TICKETS_APPROVE_REJECT",
    description: "Can approve or reject tickets in approval inbox",
    category: "approval-process",
  },
  {
    module: "Approval Process",
    name: "View Approval History",
    code: "APPROVAL_HISTORY_VIEW",
    description: "Can view approval history and audit trail",
    category: "approval-process",
  },
  // =====================================================
  // SLA & ESCALATION CATEGORY
  // =====================================================
  {
    module: "SLA & Escalation",
    name: "View SLA Policies",
    code: "SLA_VIEW",
    description: "Can view SLA policies",
    category: "sla-escalation",
  },
  {
    module: "SLA & Escalation",
    name: "Create SLA Policies",
    code: "SLA_CREATE",
    description: "Can create SLA policies",
    category: "sla-escalation",
  },
  {
    module: "SLA & Escalation",
    name: "Edit SLA Policies",
    code: "SLA_EDIT",
    description: "Can edit SLA policies",
    category: "sla-escalation",
  },
  {
    module: "SLA & Escalation",
    name: "Delete SLA Policies",
    code: "SLA_DELETE",
    description: "Can delete SLA policies",
    category: "sla-escalation",
  },
  {
    module: "SLA & Escalation",
    name: "Manage Escalation Rules",
    code: "SLA_MANAGE_ESCALATIONS",
    description: "Can configure escalation rules and notifications",
    category: "sla-escalation",
  },
  {
    module: "SLA & Escalation",
    name: "Manage Business Hours",
    code: "SLA_MANAGE_BUSINESS_HOURS",
    description: "Can configure business hours and holidays",
    category: "sla-escalation",
  },
  // =====================================================
  // ESCALATION MATRIX CATEGORY
  // =====================================================
  {
    module: "Escalation Matrix",
    name: "View Escalation Matrix",
    code: "ESCALATION_MATRIX_VIEW",
    description: "Can view escalation matrix configurations",
    category: "sla-escalation",
  },
  {
    module: "Escalation Matrix",
    name: "Manage Escalation Matrix",
    code: "ESCALATION_MATRIX_MANAGE",
    description:
      "Can create, edit, and delete escalation matrix configurations",
    category: "sla-escalation",
  },
  // =====================================================
  // TICKET CONFIGURATION CATEGORY
  // =====================================================
  {
    module: "Ticket Configuration",
    name: "View Ticket Configuration",
    code: "TICKET_CONFIG_VIEW",
    description: "Can view ticket configuration settings",
    category: "ticket-configuration",
  },
  {
    module: "Ticket Configuration",
    name: "Manage Categories",
    code: "TICKET_CONFIG_MANAGE_CATEGORIES",
    description: "Can create, edit, and delete ticket categories",
    category: "ticket-configuration",
  },
  {
    module: "Ticket Configuration",
    name: "Manage Statuses",
    code: "TICKET_CONFIG_MANAGE_STATUSES",
    description: "Can create, edit, and delete ticket statuses",
    category: "ticket-configuration",
  },
  {
    module: "Ticket Configuration",
    name: "Manage Priorities",
    code: "TICKET_CONFIG_MANAGE_PRIORITIES",
    description: "Can create, edit, and delete ticket priorities",
    category: "ticket-configuration",
  },
  {
    module: "Ticket Configuration",
    name: "Manage Types",
    code: "TICKET_CONFIG_MANAGE_TYPES",
    description: "Can create, edit, and delete ticket types",
    category: "ticket-configuration",
  },
  {
    module: "Ticket Configuration",
    name: "Manage Templates",
    code: "TICKET_CONFIG_MANAGE_TEMPLATES",
    description: "Can create and manage ticket templates",
    category: "ticket-configuration",
  },
  {
    module: "Ticket Configuration",
    name: "Manage Table Columns",
    code: "TICKET_CONFIG_MANAGE_TABLE_COLUMNS",
    description: "Can configure query table columns by project",
    category: "ticket-configuration",
  },
  // =====================================================
  // SERVICE REQUEST CATEGORY (PSR / ISR) — Phase 0 foundation
  // =====================================================
  {
    module: "Service Request",
    name: "Create Parent Service Request",
    code: "SR_PSR_CREATE",
    description: "Can raise a Parent Service Request (PSR)",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Receive Parent Service Request",
    code: "SR_PSR_RECEIVE",
    description: "Eligible to be assigned PSRs (forms the PSR assignment pool)",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Create Internal Service Request",
    code: "SR_ISR_CREATE",
    description: "Can raise an Internal Service Request (ISR)",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Receive Internal Service Request",
    code: "SR_ISR_RECEIVE",
    description: "Eligible to be assigned ISRs (forms the ISR assignment pool)",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Reassign Service Request",
    code: "SR_REASSIGN",
    description: "Can reassign an SR to another department/sub-category/user",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Delegate Service Request",
    code: "SR_DELEGATE",
    description:
      "Can delegate an SR to another employee (e.g. PSL, when assignee is on leave/left)",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Close Service Request",
    code: "SR_CLOSE",
    description: "Can close/resolve an SR (closure access)",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Re-open Service Request",
    code: "SR_REOPEN",
    description: "Can re-open a closed SR on behalf of the parent",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Display Remarks to Parent",
    code: "SR_DISPLAY_TO_PARENT",
    description: "Can mark SR remarks/follow-ups as visible to the parent",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Manage Service Request Config",
    code: "SR_CONFIG_MANAGE",
    description:
      "Can manage SR module configuration (channels, forms, assignment/TAT matrix)",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Access Email Triage Inbox",
    code: "EMAIL_TRIAGE_ACCESS",
    description: "Can view and read the email triage inbox",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Convert Email (Triage)",
    code: "EMAIL_TRIAGE_CONVERT",
    description: "Can convert a triaged email into a PSR/ISR/lead",
    category: "service-request",
  },
  {
    module: "Service Request",
    name: "Respond to Email (Triage)",
    code: "EMAIL_TRIAGE_RESPOND",
    description: "Can reply to an email from the triage inbox",
    category: "service-request",
  },
  // =====================================================
  // KNOWLEDGE BASE CATEGORY - Legacy System (DEPRECATED)
  // =====================================================
  {
    module: "Knowledge Base",
    name: "View Knowledge Base (Legacy)",
    code: "KB_VIEW",
    description: "Can view knowledge base articles (legacy system)",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  {
    module: "Knowledge Base",
    name: "Create Articles (Legacy)",
    code: "KB_CREATE",
    description: "Can create new knowledge base articles (legacy system)",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  {
    module: "Knowledge Base",
    name: "Edit Articles (Legacy)",
    code: "KB_EDIT",
    description: "Can edit existing knowledge base articles (legacy system)",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  {
    module: "Knowledge Base",
    name: "Delete Articles (Legacy)",
    code: "KB_DELETE",
    description: "Can delete knowledge base articles (legacy system)",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  {
    module: "Knowledge Base",
    name: "Publish Articles",
    code: "KB_PUBLISH",
    description: "Can publish knowledge base articles",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  {
    module: "Knowledge Base",
    name: "Unpublish Articles",
    code: "KB_UNPUBLISH",
    description: "Can unpublish knowledge base articles",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  {
    module: "Knowledge Base",
    name: "Manage Categories (Legacy)",
    code: "KB_MANAGE_CATEGORIES",
    description: "Can create and manage KB categories (legacy system)",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  {
    module: "Knowledge Base",
    name: "Approve Articles",
    code: "KB_APPROVE",
    description: "Can approve KB articles for publishing",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  {
    module: "Knowledge Base",
    name: "Export Articles",
    code: "KB_EXPORT",
    description: "Can export knowledge base articles",
    category: "knowledge-base",
    isActive: false, // ⛔ DEPRECATED - Use new KB system
  },
  // =====================================================
  // KNOWLEDGE BASE - NEW MODULAR SYSTEM
  // =====================================================
  {
    module: "Knowledge Base (New)",
    name: "Manage KB System",
    code: "KB_MANAGE",
    description:
      "Full administrative access to the new KB system (levels, articles, tables)",
    category: "knowledge-base",
  },
  {
    module: "Knowledge Base (New)",
    name: "Manage KB Levels",
    code: "KB_MANAGE_LEVELS",
    description:
      "Can create, edit, and delete KB levels/categories in the new modular system",
    category: "knowledge-base",
  },
  {
    module: "Knowledge Base (New)",
    name: "Manage KB Articles",
    code: "KB_MANAGE_ARTICLES",
    description:
      "Can create, edit, and delete KB articles in the new modular system",
    category: "knowledge-base",
  },
  {
    module: "Knowledge Base (New)",
    name: "Manage KB Tables",
    code: "KB_MANAGE_TABLES",
    description:
      "Can create, edit, and delete KB tables in the new modular system",
    category: "knowledge-base",
  },
  {
    module: "Knowledge Base (New)",
    name: "View KB Content",
    code: "KB_VIEW_CONTENT",
    description:
      "Can view KB content (levels, articles, tables) in the new modular system",
    category: "knowledge-base",
  },
  // =====================================================
  // FAQ CATEGORY
  // =====================================================
  {
    module: "FAQ",
    name: "View FAQs",
    code: "FAQ_VIEW",
    description: "Can view FAQ articles",
    category: "faq",
  },
  {
    module: "FAQ",
    name: "Create FAQs",
    code: "FAQ_CREATE",
    description: "Can create new FAQ articles",
    category: "faq",
  },
  {
    module: "FAQ",
    name: "Edit FAQs",
    code: "FAQ_EDIT",
    description: "Can edit existing FAQ articles",
    category: "faq",
  },
  {
    module: "FAQ",
    name: "Delete FAQs",
    code: "FAQ_DELETE",
    description: "Can delete FAQ articles",
    category: "faq",
  },
  {
    module: "FAQ",
    name: "Manage FAQs",
    code: "FAQ_MANAGE",
    description: "Can manage FAQ settings and categories",
    category: "faq",
  },
  // =====================================================
  // FEEDBACK MODULE CATEGORY
  // =====================================================
  {
    module: "Feedback",
    name: "Create Feedback Forms",
    code: "FEEDBACK_FORM_CREATE",
    description: "Can create new feedback forms",
    category: "feedback",
  },
  {
    module: "Feedback",
    name: "Edit Feedback Forms",
    code: "FEEDBACK_FORM_EDIT",
    description: "Can edit existing feedback forms",
    category: "feedback",
  },
  {
    module: "Feedback",
    name: "Delete Feedback Forms",
    code: "FEEDBACK_FORM_DELETE",
    description: "Can delete feedback forms",
    category: "feedback",
  },
  {
    module: "Feedback",
    name: "View Feedback Responses",
    code: "FEEDBACK_VIEW",
    description: "Can view submitted feedback responses",
    category: "feedback",
  },
  {
    module: "Feedback",
    name: "Export Feedback",
    code: "FEEDBACK_EXPORT",
    description: "Can export feedback responses",
    category: "feedback",
  },
  // =====================================================
  // NOTIFICATIONS CATEGORY
  // =====================================================
  {
    module: "Notifications",
    name: "Manage Notification Settings",
    code: "NOTIFICATION_MANAGE",
    description: "Can configure notification rules for projects and roles",
    category: "notifications",
  },
  {
    module: "Notifications",
    name: "View Notification Settings",
    code: "NOTIFICATION_VIEW_SETTINGS",
    description: "Can view notification settings (read-only)",
    category: "notifications",
  },
  {
    module: "Notifications",
    name: "Manage Personal Notification Preferences",
    code: "NOTIFICATION_PERSONAL_PREFERENCES",
    description: "Can manage own notification delivery preferences",
    category: "notifications",
  },
  // =====================================================
  // INTEGRATIONS CATEGORY
  // =====================================================
  {
    module: "Integrations",
    name: "View Integrations",
    code: "INTEGRATION_VIEW",
    description: "Can view integration configurations",
    category: "integrations",
  },
  {
    module: "Integrations",
    name: "Manage Email Integration",
    code: "INTEGRATION_MANAGE_EMAIL",
    description: "Can configure email integration settings",
    category: "integrations",
  },
  {
    module: "Integrations",
    name: "Manage SMS Integration",
    code: "INTEGRATION_MANAGE_SMS",
    description: "Can configure SMS integration settings",
    category: "integrations",
  },
  {
    module: "Integrations",
    name: "Manage Webhooks",
    code: "INTEGRATION_MANAGE_WEBHOOKS",
    description: "Can configure webhooks",
    category: "integrations",
  },
  {
    module: "Integrations",
    name: "Manage API Access",
    code: "INTEGRATION_MANAGE_API",
    description: "Can configure API access and tokens",
    category: "integrations",
  },
  {
    module: "Integrations",
    name: "Manage Third-Party Apps",
    code: "INTEGRATION_MANAGE_APPS",
    description: "Can connect and manage third-party applications",
    category: "integrations",
  },
  {
    module: "Email Configuration",
    name: "View Email Configuration",
    code: "EMAIL_CONFIG_VIEW",
    description: "Can view email configuration settings",
    category: "integrations",
  },
  {
    module: "Email Configuration",
    name: "Edit Email Configuration",
    code: "EMAIL_CONFIG_EDIT",
    description: "Can edit email SMTP settings and configurations",
    category: "integrations",
  },
  {
    module: "Email Configuration",
    name: "Test Email Configuration",
    code: "EMAIL_CONFIG_TEST",
    description: "Can send test emails to verify configuration",
    category: "integrations",
  },
  {
    module: "Email Configuration",
    name: "Manage Email Triggers",
    code: "EMAIL_TRIGGER_MANAGE",
    description: "Can manage email triggers and templates",
    category: "integrations",
  },
  // =====================================================
  // REPORTS CATEGORY
  // =====================================================
  {
    module: "Reports",
    name: "View Ticket Reports",
    code: "REPORT_VIEW_TICKETS",
    description: "Can view ticket analytics and reports",
    category: "reports",
  },
  {
    module: "Reports",
    name: "View Agent Performance Reports",
    code: "REPORT_VIEW_AGENT_PERFORMANCE",
    description: "Can view agent performance metrics",
    category: "reports",
  },
  {
    module: "Reports",
    name: "View Customer Satisfaction Reports",
    code: "REPORT_VIEW_CSAT",
    description: "Can view customer satisfaction scores",
    category: "reports",
  },
  {
    module: "Reports",
    name: "View SLA Reports",
    code: "REPORT_VIEW_SLA",
    description: "Can view SLA compliance reports",
    category: "reports",
  },
  {
    module: "Reports",
    name: "Export Reports",
    code: "REPORT_EXPORT",
    description: "Can export reports to various formats",
    category: "reports",
  },
  {
    module: "Reports",
    name: "Create Custom Reports",
    code: "REPORT_CREATE_CUSTOM",
    description: "Can create custom report templates",
    category: "reports",
  },
  {
    module: "Reports",
    name: "Schedule Reports",
    code: "REPORT_SCHEDULE",
    description: "Can schedule automated report generation",
    category: "reports",
  },
  {
    module: "Reports",
    name: "Assign Reports",
    code: "REPORT_ASSIGN",
    description: "Can assign saved reports to users and roles",
    category: "reports",
  },
  {
    module: "Reports",
    name: "Delete Reports",
    code: "REPORT_DELETE",
    description: "Can permanently delete saved reports",
    category: "reports",
  },
  {
    module: "Reports",
    name: "Manage Report Permissions",
    code: "REPORT_PERMISSIONS_MANAGE",
    description: "Can configure role-level report module access matrix",
    category: "reports",
  },
  {
    module: "Reports",
    name: "Manage Report Data Points",
    code: "REPORT_DATA_POINTS_MANAGE",
    description: "Can configure per-role data point visibility",
    category: "reports",
  },
  // =====================================================
  // AUDIT LOGS CATEGORY
  // =====================================================
  {
    module: "Audit Logs",
    name: "View Activity Logs",
    code: "AUDIT_VIEW_ACTIVITY",
    description: "Can view user activity logs",
    category: "audit-logs",
  },
  {
    module: "Audit Logs",
    name: "View Access Logs",
    code: "AUDIT_VIEW_ACCESS",
    description: "Can view system access logs",
    category: "audit-logs",
  },
  {
    module: "Audit Logs",
    name: "View Blocked Email Recipients",
    code: "AUDIT_VIEW_BLOCKED_EMAILS",
    description: "Can view blocked email recipient list",
    category: "audit-logs",
  },
  {
    module: "Audit Logs",
    name: "Manage Blocked Email Recipients",
    code: "AUDIT_MANAGE_BLOCKED_EMAILS",
    description: "Can block/unblock email recipients",
    category: "audit-logs",
  },
  {
    module: "Audit Logs",
    name: "View Email Failure Logs",
    code: "AUDIT_VIEW_EMAIL_FAILURES",
    description: "Can view email delivery failure logs",
    category: "audit-logs",
  },
  {
    module: "Audit Logs",
    name: "View Integration Failure Logs",
    code: "AUDIT_VIEW_INTEGRATION_FAILURES",
    description: "Can view integration failure logs",
    category: "audit-logs",
  },
  {
    module: "Audit Logs",
    name: "View Webhook Failure Logs",
    code: "AUDIT_VIEW_WEBHOOK_FAILURES",
    description: "Can view webhook failure logs",
    category: "audit-logs",
  },
  {
    module: "Audit Logs",
    name: "View Chat Webhook Failures",
    code: "AUDIT_VIEW_CHAT_WEBHOOK_FAILURES",
    description: "Can view chat webhook failure logs",
    category: "audit-logs",
  },
  {
    module: "Audit Logs",
    name: "Export Audit Logs",
    code: "AUDIT_EXPORT",
    description: "Can export audit logs for compliance",
    category: "audit-logs",
  },
  // =====================================================
  // ATTENDANCE MODULE CATEGORY
  // =====================================================
  {
    module: "Attendance",
    name: "View Attendance Records",
    code: "ATTENDANCE_VIEW",
    description: "Can view raw attendance records (own or team based on role)",
    category: "attendance",
  },
  {
    module: "Attendance",
    name: "View Attendance Reports",
    code: "ATTENDANCE_REPORT_VIEW",
    description:
      "Can access the Attendance Report page and run assigned reports",
    category: "attendance",
  },
  {
    module: "Attendance",
    name: "Sync Biometric",
    code: "ATTENDANCE_SYNC",
    description:
      "Can register employees in AFT biometric system and trigger syncs",
    category: "attendance",
  },
  {
    module: "Attendance",
    name: "Configure Attendance",
    code: "ATTENDANCE_CONFIG",
    description:
      "Can configure AFT API credentials, sync schedule, field permissions",
    category: "attendance",
  },
  {
    module: "Attendance",
    name: "Export Attendance",
    code: "ATTENDANCE_EXPORT",
    description: "Can export attendance records as Excel or PDF",
    category: "attendance",
  },
  // =====================================================
  // TICKETS CATEGORY (Core Ticket Operations)
  // =====================================================
  {
    module: "Tickets",
    name: "View All Tickets",
    code: "TICKET_VIEW_ALL",
    description: "Can view all tickets in the system without restrictions",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "View Own Tickets",
    code: "TICKET_VIEW_OWN",
    description: "Can view only tickets assigned to self",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Modify Any Ticket",
    code: "TICKET_MODIFY_ANY",
    description:
      "Can act on (comment, reply, change status/priority/category, escalate, add/remove attachments, edit) ANY ticket regardless of assignee. Without it, agents can only modify tickets assigned to them.",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Create Ticket",
    code: "TICKET_CREATE",
    description: "Can create new tickets",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Edit Ticket",
    code: "TICKET_EDIT",
    description: "Can edit ticket details",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Delete Ticket",
    code: "TICKET_DELETE",
    description: "Can delete tickets",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Assign Ticket",
    code: "TICKET_ASSIGN",
    description: "Can assign tickets to agents",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Reassign Ticket",
    code: "TICKET_REASSIGN",
    description: "Can reassign tickets from one agent to another",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Change Ticket Status",
    code: "TICKET_CHANGE_STATUS",
    description:
      "Can change ticket status (open, in-progress, resolved, closed)",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Change Ticket Priority",
    code: "TICKET_CHANGE_PRIORITY",
    description: "Can change ticket priority level",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Change Ticket Category",
    code: "TICKET_CHANGE_CATEGORY",
    description:
      "Can change the category, subcategory, and topic of a ticket after creation",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Add Ticket Comments",
    code: "TICKET_ADD_COMMENT",
    description: "Can add comments/replies to tickets",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Edit Ticket Comments",
    code: "TICKET_EDIT_COMMENT",
    description: "Can edit ticket comments",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Delete Ticket Comments",
    code: "TICKET_DELETE_COMMENT",
    description: "Can delete ticket comments",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Add Ticket Attachments",
    code: "TICKET_ADD_ATTACHMENT",
    description: "Can upload attachments to tickets",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Delete Ticket Attachments",
    code: "TICKET_DELETE_ATTACHMENT",
    description: "Can delete ticket attachments",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Escalate Ticket",
    code: "TICKET_ESCALATE",
    description: "Can manually escalate tickets to higher level support",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Merge Tickets",
    code: "TICKET_MERGE",
    description: "Can merge multiple tickets into one",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Bulk Update Tickets",
    code: "TICKET_BULK_UPDATE",
    description: "Can perform bulk operations on tickets",
    category: "tickets",
  },
  {
    module: "Tickets",
    name: "Export Tickets",
    code: "TICKET_EXPORT",
    description: "Can export tickets to CSV/Excel",
    category: "tickets",
  },
  // =====================================================
  // OFFLINE MODULE CATEGORY (Student Registration & Offline Ticket Creation)
  // =====================================================
  {
    module: "Offline Module",
    name: "Access Offline Module",
    code: "OFFLINE_MODULE_ACCESS",
    description: "Can access offline module for walk-in student support",
    category: "offline-module",
  },
  {
    module: "Offline Module",
    name: "Register Student",
    code: "OFFLINE_STUDENT_REGISTER",
    description: "Can register students on their behalf when they walk in",
    category: "offline-module",
  },
  {
    module: "Offline Module",
    name: "Create Offline Ticket",
    code: "OFFLINE_TICKET_CREATE",
    description: "Can create tickets on behalf of students during walk-in",
    category: "offline-module",
  },
  {
    module: "Offline Module",
    name: "Mark Ticket Resolved",
    code: "OFFLINE_TICKET_RESOLVE",
    description: "Can mark offline tickets as resolved immediately",
    category: "offline-module",
  },
  {
    module: "Offline Module",
    name: "Escalate at Creation",
    code: "OFFLINE_TICKET_ESCALATE",
    description: "Can escalate offline tickets during creation",
    category: "offline-module",
  },
  {
    module: "Offline Module",
    name: "View Student Records",
    code: "OFFLINE_STUDENT_VIEW",
    description: "Can view registered student information",
    category: "offline-module",
  },
  {
    module: "Offline Module",
    name: "Edit Student Records",
    code: "OFFLINE_STUDENT_EDIT",
    description:
      "Can edit student information registered through offline module",
    category: "offline-module",
  },
  // =====================================================
  // FORM BUILDER CATEGORY
  // =====================================================
  {
    module: "Form Builder",
    name: "View Forms",
    code: "FORM_VIEW",
    description: "Can view all forms and their versions",
    category: "fields-forms",
  },
  {
    module: "Form Builder",
    name: "Create Form",
    code: "FORM_CREATE",
    description: "Can create new forms",
    category: "fields-forms",
  },
  {
    module: "Form Builder",
    name: "Edit Form",
    code: "FORM_EDIT",
    description: "Can edit forms and add new versions",
    category: "fields-forms",
  },
  {
    module: "Form Builder",
    name: "Delete Form",
    code: "FORM_DELETE",
    description: "Can delete forms",
    category: "fields-forms",
  },
  {
    module: "Form Builder",
    name: "Assign Form Context",
    code: "FORM_ASSIGN_CONTEXT",
    description: "Can map forms to roles, products, categories, or pages",
    category: "fields-forms",
  },
  {
    module: "Form Builder",
    name: "View Form Audit Logs",
    code: "FORM_VIEW_AUDIT_LOGS",
    description: "Can view audit logs for form changes",
    category: "fields-forms",
  },
  // =====================================================
  // ASSET MANAGEMENT CATEGORY
  // =====================================================
  {
    module: "Asset Management",
    name: "View Assets",
    code: "ASSET_VIEW",
    description: "Can view master asset list and details",
    category: "asset-management",
  },
  {
    module: "Asset Management",
    name: "Create Asset",
    code: "ASSET_CREATE",
    description: "Can create new assets in master list",
    category: "asset-management",
  },
  {
    module: "Asset Management",
    name: "Edit Asset",
    code: "ASSET_EDIT",
    description: "Can edit existing assets in master list",
    category: "asset-management",
  },
  {
    module: "Asset Management",
    name: "Delete Asset",
    code: "ASSET_DELETE",
    description: "Can delete assets from master list",
    category: "asset-management",
  },
  {
    module: "Asset Management",
    name: "Manage Center Assets",
    code: "ASSET_MANAGE",
    description: "Can manage asset mappings and update counts for centers",
    category: "asset-management",
  },
  {
    module: "Asset Management",
    name: "Map Assets to Centers",
    code: "ASSET_MAP_TO_CENTER",
    description: "Can map assets to centers in bulk",
    category: "asset-management",
  },
  {
    module: "Asset Management",
    name: "Upload Asset Photos",
    code: "ASSET_UPLOAD_PHOTOS",
    description: "Can upload and manage photos for center assets",
    category: "asset-management",
  },
  {
    module: "Asset Management",
    name: "View Asset Statistics",
    code: "ASSET_VIEW_STATS",
    description: "Can view asset statistics and summary reports",
    category: "asset-management",
  },
  {
    module: "Asset Management",
    name: "View My Assets",
    code: "MY_ASSETS_VIEW",
    description: "Can view and manage assets assigned to their center",
    category: "asset-management",
  },
  {
    module: "User Management",
    name: "Login As User (Impersonate)",
    code: "IMPERSONATE_USER",
    description:
      "Can log in as another user for support troubleshooting. Token-based and fully audited (DPDP compliant). Cannot impersonate exempt accounts.",
    category: "user-management",
  },
  {
    module: "User Management",
    name: "Exempt From Impersonation",
    code: "IMPERSONATION_EXEMPT",
    description:
      "Accounts with a role holding this permission can NEVER be impersonated. Assign to Super Admin / Sub Admin and other privileged roles.",
    category: "user-management",
  },
];

// Default roles for the helpdesk portal (must be after helpDeskPermissions)
const defaultRoles = [
  {
    module: "Super Admin",
    name: "Super Admin",
    code: "SUPER_ADMIN",
    description:
      "Has complete access to all features and settings across all projects",
    type: "system",
    permissions: helpDeskPermissions.map((p) => p.code),
  },
  {
    module: "Account Owner",
    name: "Account Owner",
    code: "ACCOUNT_OWNER",
    description: "Has access to all features except system-level settings",
    type: "custom",
    permissions: [
      "TICKET_VIEW_ALL",
      "TICKET_MODIFY_ANY",
      "TICKET_CREATE",
      "TICKET_EDIT",
      "TICKET_DELETE",
      "TICKET_ASSIGN",
      "TICKET_CHANGE_STATUS",
      "TICKET_CHANGE_PRIORITY",
      "TICKET_CHANGE_CATEGORY",
      "TICKET_ADD_COMMENT",
      "TICKET_EDIT_COMMENT",
      "TICKET_DELETE_COMMENT",
      "TICKET_ADD_ATTACHMENT",
      "TICKET_DELETE_ATTACHMENT",
      "TICKET_ESCALATE",
      "TICKET_MERGE",
      "TICKET_BULK_UPDATE",
      "TICKET_EXPORT",
      "USER_VIEW_ALL",
      "USER_CREATE",
      "USER_EDIT",
      "USER_DELETE",
      "USER_TOGGLE_STATUS",
      "USER_ASSIGN_ROLE",
      "USER_RESET_PASSWORD",
      "USER_IMPORT",
      "PROJECT_VIEW_ALL",
      "PROJECT_EDIT",
      "PROJECT_TOGGLE_STATUS",
      "PROJECT_MANAGE_SETTINGS",
      "REPORT_VIEW_TICKETS",
      "REPORT_VIEW_AGENT_PERFORMANCE",
      "REPORT_VIEW_CSAT",
      "REPORT_VIEW_SLA",
      "REPORT_EXPORT",
      "REPORT_CREATE_CUSTOM",
      "REPORT_SCHEDULE",
      "REPORT_ASSIGN",
      "REPORT_DELETE",
      "REPORT_PERMISSIONS_MANAGE",
      "REPORT_DATA_POINTS_MANAGE",
      "FORM_VIEW",
      "FORM_CREATE",
      "FORM_EDIT",
      "FORM_DELETE",
      "FORM_ASSIGN_CONTEXT",
      "FORM_VIEW_AUDIT_LOGS",
      "EMAIL_CONFIG_VIEW",
      "EMAIL_CONFIG_EDIT",
      "EMAIL_CONFIG_TEST",
      "EMAIL_TRIGGER_MANAGE",
    ],
  },
  {
    module: "Support Administrator",
    name: "Support Administrator",
    code: "SUPPORT_ADMIN",
    description: "Manages support operations and settings",
    type: "custom",
    permissions: [
      "TICKET_VIEW_ALL",
      "TICKET_MODIFY_ANY",
      "TICKET_CREATE",
      "TICKET_EDIT",
      "TICKET_ASSIGN",
      "TICKET_ESCALATE",
      "TICKET_CHANGE_STATUS",
      "TICKET_CHANGE_PRIORITY",
      "TICKET_CHANGE_CATEGORY",
      "TICKET_ADD_COMMENT",
      "TICKET_EDIT_COMMENT",
      "TICKET_ADD_ATTACHMENT",
      "TICKET_MERGE",
      "TICKET_BULK_UPDATE",
      "TICKET_EXPORT",
      "USER_VIEW_ALL",
      "USER_CREATE",
      "USER_EDIT",
      "USER_TOGGLE_STATUS",
      "USER_ASSIGN_ROLE",
      "USER_IMPORT",
      "REPORT_VIEW_TICKETS",
      "REPORT_VIEW_AGENT_PERFORMANCE",
      "REPORT_VIEW_CSAT",
      "REPORT_VIEW_SLA",
      "REPORT_EXPORT",
      "REPORT_CREATE_CUSTOM",
      "REPORT_ASSIGN",
      "REPORT_DELETE",
      "REPORT_PERMISSIONS_MANAGE",
      "REPORT_DATA_POINTS_MANAGE",
      "FORM_VIEW",
      "FORM_CREATE",
      "FORM_EDIT",
      "FORM_DELETE",
      "FORM_ASSIGN_CONTEXT",
      "FORM_VIEW_AUDIT_LOGS",
      "EMAIL_CONFIG_VIEW",
      "EMAIL_CONFIG_EDIT",
      "EMAIL_CONFIG_TEST",
      "EMAIL_TRIGGER_MANAGE",
      "ATTENDANCE_VIEW",
      "ATTENDANCE_SYNC",
      "ATTENDANCE_CONFIG",
      "ATTENDANCE_EXPORT",
    ],
  },
  {
    module: "Support Manager",
    name: "Support Manager",
    code: "SUPPORT_MANAGER",
    description: "Manages team and ticket operations",
    type: "custom",
    permissions: [
      "TICKET_VIEW_ALL",
      "TICKET_MODIFY_ANY",
      "TICKET_CREATE",
      "TICKET_EDIT",
      "TICKET_ASSIGN",
      "TICKET_ESCALATE",
      "TICKET_CHANGE_STATUS",
      "TICKET_CHANGE_PRIORITY",
      "TICKET_CHANGE_CATEGORY",
      "TICKET_ADD_COMMENT",
      "TICKET_ADD_ATTACHMENT",
      "TICKET_MERGE",
      "TICKET_BULK_UPDATE",
      "TICKET_EXPORT",
      "USER_VIEW_ALL",
      "REPORT_VIEW_TICKETS",
      "REPORT_VIEW_AGENT_PERFORMANCE",
      "REPORT_VIEW_CSAT",
      "REPORT_VIEW_SLA",
      "REPORT_EXPORT",
      "REPORT_CREATE_CUSTOM",
      "REPORT_ASSIGN",
      "FORM_VIEW",
      "FORM_CREATE",
      "FORM_EDIT",
      "FORM_DELETE",
      "FORM_ASSIGN_CONTEXT",
      "FORM_VIEW_AUDIT_LOGS",
      "ATTENDANCE_VIEW",
      "ATTENDANCE_REPORT_VIEW",
      "ATTENDANCE_EXPORT",
    ],
  },
  {
    module: "Agent",
    name: "Agent",
    code: "AGENT",
    description:
      "Handles day-to-day ticket support and offline student registration",
    type: "custom",
    permissions: [
      "TICKET_VIEW_OWN",
      "TICKET_CREATE",
      "TICKET_EDIT",
      "TICKET_CHANGE_STATUS",
      "TICKET_ADD_COMMENT",
      "TICKET_ADD_ATTACHMENT",
      "OFFLINE_MODULE_ACCESS",
      "OFFLINE_STUDENT_REGISTER",
      "OFFLINE_TICKET_CREATE",
      "OFFLINE_TICKET_RESOLVE",
      "OFFLINE_TICKET_ESCALATE",
      "OFFLINE_STUDENT_VIEW",
      "OFFLINE_STUDENT_EDIT",
      "ATTENDANCE_VIEW",
      "ATTENDANCE_REPORT_VIEW",
    ],
  },
  {
    module: "Student",
    name: "Student",
    code: "STUDENT",
    description:
      "Student user with access to view and manage their own tickets",
    type: "system",
    permissions: [
      "TICKET_VIEW_OWN",
      "TICKET_CREATE",
      "TICKET_ADD_COMMENT",
      "TICKET_ADD_ATTACHMENT",
    ],
  },
];

import { Permission } from "../models/Permission";
import { Role } from "../models/Role";
import mongoose from "mongoose";

export async function seedRolesAndPermissions() {
  try {
    // Check if roles already exist
    const existingRolesCount = await Role.countDocuments();
    const existingPermissionsCount = await Permission.countDocuments();

    // =====================================================
    // COMPREHENSIVE PERMISSION SYNCHRONIZATION
    // =====================================================
    if (existingRolesCount > 0 && existingPermissionsCount > 0) {
      console.log("🔄 SYNCING PERMISSIONS WITH DATABASE...");
      console.log(`   - ${existingRolesCount} roles found`);
      console.log(`   - ${existingPermissionsCount} permissions found\n`);

      // Step 1: Get all existing permissions from database
      const existingPermissions = await Permission.find(
        {},
        "code isActive",
      ).lean();
      const existingPermissionCodes = existingPermissions.map((p) => p.code);
      const existingPermMap = new Map(
        existingPermissions.map((p) => [p.code, p]),
      );

      // Step 2: Categorize permissions from seed file
      const seedPermissionCodes = helpDeskPermissions.map((p) => p.code);
      const newPermissions = helpDeskPermissions.filter(
        (p) => !existingPermissionCodes.includes(p.code),
      );
      const updatedPermissions = helpDeskPermissions.filter((p) =>
        existingPermissionCodes.includes(p.code),
      );

      // Step 3: UPDATE existing permissions (sync name, description, isActive, etc.)
      console.log("📝 Updating existing permissions...");
      let updateCount = 0;
      for (const seedPerm of updatedPermissions) {
        const dbPerm = existingPermMap.get(seedPerm.code);

        // Update permission with all fields from seed file
        const result = await Permission.updateOne(
          { code: seedPerm.code },
          {
            $set: {
              name: seedPerm.name,
              description: seedPerm.description,
              module: seedPerm.module,
              category: seedPerm.category,
              isActive:
                seedPerm.isActive !== undefined ? seedPerm.isActive : true,
              updatedAt: new Date(),
            },
          },
        );

        if (result.modifiedCount > 0) {
          updateCount++;
          const statusChange =
            dbPerm?.isActive !== (seedPerm.isActive !== false)
              ? seedPerm.isActive === false
                ? " → ⛔ DEACTIVATED"
                : " → ✅ ACTIVATED"
              : "";
          console.log(`   ✓ ${seedPerm.code}${statusChange}`);
        }
      }

      if (updateCount > 0) {
        console.log(`✅ Updated ${updateCount} existing permissions\n`);
      } else {
        console.log(`✓ All existing permissions are up to date\n`);
      }

      // Step 4: INSERT new permissions
      if (newPermissions.length > 0) {
        console.log(`🆕 Adding ${newPermissions.length} new permission(s)...`);
        const insertedPermissions = await Permission.insertMany(newPermissions);
        console.log(`✅ Inserted new permissions:`);
        insertedPermissions.forEach((p) =>
          console.log(`   + ${p.code} - ${p.name}`),
        );

        // Step 5: AUTO-ASSIGN new permissions to Super Admin
        // IMPORTANT: Must add to BOTH RolePermission junction table AND Role.permissions array
        // JWT generation reads from Role.permissions via populate, so both must be in sync!
        const RolePermission = mongoose.model("RolePermission");
        const superAdminRole = await Role.findOne({ code: "SUPER_ADMIN" });

        if (superAdminRole) {
          console.log("\n🔑 Auto-assigning new permissions to Super Admin...");
          let assignedToJunctionTable = 0;
          let assignedToRoleArray = 0;

          // Get current permissions in role.permissions array as strings for comparison
          const currentRolePermissions = (superAdminRole.permissions || []).map(
            (p: any) => p.toString(),
          );

          for (const perm of insertedPermissions) {
            const permIdStr = perm._id.toString();

            // 1. Add to RolePermission junction table (if not exists)
            const existsInJunction = await RolePermission.findOne({
              roleId: superAdminRole._id,
              permissionId: perm._id,
            });

            if (!existsInJunction) {
              await RolePermission.create({
                roleId: superAdminRole._id,
                permissionId: perm._id,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              assignedToJunctionTable++;
            }

            // 2. Add to Role.permissions array (if not exists)
            // THIS IS CRITICAL - JWT generation reads from this array!
            if (!currentRolePermissions.includes(permIdStr)) {
              superAdminRole.permissions.push(perm._id);
              assignedToRoleArray++;
            }
          }

          // Save the role if any permissions were added to the array
          if (assignedToRoleArray > 0) {
            await superAdminRole.save();
            console.log(
              `✅ Added ${assignedToRoleArray} permissions to Role.permissions array`,
            );
          }

          if (assignedToJunctionTable > 0) {
            console.log(
              `✅ Added ${assignedToJunctionTable} permissions to RolePermissions junction table`,
            );
          }

          // Verify final counts
          const finalJunctionCount = await RolePermission.countDocuments({
            roleId: superAdminRole._id,
          });
          const updatedRole = await Role.findOne({ code: "SUPER_ADMIN" });
          const finalRoleArrayCount = updatedRole?.permissions?.length || 0;

          console.log(`📊 Super Admin permissions:`);
          console.log(
            `   - Role.permissions array: ${finalRoleArrayCount} (used by JWT)`,
          );
          console.log(`   - RolePermissions table: ${finalJunctionCount}`);
        }

        console.log("");
      } else {
        console.log("✓ No new permissions to add\n");
      }

      // Step 6: Summary
      const totalActivePermissions = await Permission.countDocuments({
        isActive: true,
      });
      const totalInactivePermissions = await Permission.countDocuments({
        isActive: false,
      });
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 PERMISSION SYNC SUMMARY:");
      console.log(`   Total Permissions: ${existingPermissionsCount}`);
      console.log(`   Active: ${totalActivePermissions}`);
      console.log(`   Inactive: ${totalInactivePermissions}`);
      console.log(`   Updated: ${updateCount}`);
      console.log(`   Added: ${newPermissions.length}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      // Step 7: RECONCILE Super Admin to ALL permissions (idempotent, runs every startup).
      // The "new permissions" block above only assigns perms inserted in THIS run, so any
      // permission that ever landed in the DB without being assigned (a past partial/failed
      // run, or perms predating that logic) would be skipped forever. This guarantees Super
      // Admin always ends up with EVERY permission in the DB. Additive only — never removes.
      try {
        const RolePermissionModel = mongoose.model("RolePermission");
        const superAdmin = await Role.findOne({ code: "SUPER_ADMIN" });
        if (superAdmin) {
          const allPerms = await Permission.find({}, "_id").lean();
          const have = new Set(
            (superAdmin.permissions || []).map((p: any) => p.toString()),
          );
          const missing = allPerms
            .map((p: any) => p._id)
            .filter((id: any) => !have.has(id.toString()));

          if (missing.length > 0) {
            // 1. Role.permissions array (read by JWT generation)
            superAdmin.permissions.push(...(missing as any[]));
            await superAdmin.save();

            // 2. RolePermission junction table (kept in sync with the array)
            await RolePermissionModel.bulkWrite(
              missing.map((id: any) => ({
                updateOne: {
                  filter: { roleId: superAdmin._id, permissionId: id },
                  update: {
                    $setOnInsert: {
                      roleId: superAdmin._id,
                      permissionId: id,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                  },
                  upsert: true,
                },
              })),
            );

            // 3. Invalidate Super Admin sessions so the new permissions take effect
            //    on the next request (token carries a tokenVersion).
            const { User } = await import("../models/User");
            await User.updateMany(
              { role: superAdmin._id },
              { $inc: { tokenVersion: 1 } },
            );

            console.log(
              `🔑 Reconciled Super Admin: granted ${missing.length} missing permission(s) — now has all ${allPerms.length}.`,
            );
          } else {
            console.log(
              `✓ Super Admin already has all ${allPerms.length} permissions.`,
            );
          }
        }
      } catch (reconcileErr) {
        console.error(
          "⚠️ Failed to reconcile Super Admin permissions:",
          reconcileErr,
        );
      }

      return;
    }

    // =====================================================
    // INITIAL SEEDING (First Time Setup)
    // =====================================================
    console.log("🌱 Seeding permissions...");
    // Clear existing permissions
    await Permission.deleteMany({});
    // Insert all permissions
    const insertedPermissions =
      await Permission.insertMany(helpDeskPermissions);
    console.log(`✅ Inserted ${insertedPermissions.length} permissions`);
    // Create a map of permission codes to IDs
    const permissionMap = new Map();
    insertedPermissions.forEach((perm) => {
      permissionMap.set(perm.code, perm._id);
    });
    console.log("🌱 Seeding default roles...");
    // Insert default roles with permission references
    const rolesToInsert = defaultRoles.map((role) => ({
      ...role,
      permissions: role.permissions
        .map((code) => permissionMap.get(code))
        .filter(Boolean),
    }));
    const insertedRoles = await Role.insertMany(rolesToInsert);
    console.log(`✅ Inserted ${insertedRoles.length} default roles`);
    console.log("✨ Roles and permissions seeded successfully!");
    return {
      permissions: insertedPermissions,
      roles: insertedRoles,
    };
  } catch (error) {
    console.error("❌ Error seeding roles and permissions:", error);
    throw error;
  }
}
