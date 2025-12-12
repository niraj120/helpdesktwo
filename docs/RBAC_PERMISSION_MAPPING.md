# RBAC Permission Mapping - API Routes

This document maps every API endpoint to its required permission(s).

## Authentication & Authorization

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/auth/login` | POST | Public | Super admin login |
| `/api/auth/me` | GET | Authenticated | Get current user info |
| `/api/auth/logout` | POST | Authenticated | Logout user |
| `/api/auth/project/:customUrlPath/login` | POST | Public | Project portal login |

## User Management

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/users` | GET | `USER_VIEW_ALL` | Get all users |
| `/api/users` | POST | `USER_CREATE` | Create new user |
| `/api/users/:id` | GET | `USER_VIEW_ALL` | Get user by ID |
| `/api/users/:id` | PUT | `USER_EDIT` | Update user |
| `/api/users/:id` | DELETE | `USER_DELETE` | Delete user |
| `/api/users/:id/toggle-status` | PATCH | `USER_TOGGLE_STATUS` | Activate/deactivate user |
| `/api/users/:id/reset-password` | POST | `USER_RESET_PASSWORD` | Reset user password |
| `/api/users/:id/permissions` | GET | `USER_VIEW_ALL` | Get user permissions |
| `/api/users/search` | GET | `USER_VIEW_ALL` | Search users by email |
| `/api/users/search-students` | GET | `OFFLINE_STUDENT_VIEW` | Search student records |
| `/api/users/escalation-agents` | GET | `TICKET_ASSIGN` | Get agents for escalation |
| `/api/users/register-student` | POST | `OFFLINE_STUDENT_REGISTER` | Register student |
| `/api/users/hrms/search` | GET | `USER_CREATE` | Search HRMS employees |
| `/api/users/hrms/validate/:employeeCode` | GET | `USER_CREATE` | Validate employee code |

## Role Management (RBAC)

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/roles` | GET | `RBAC_VIEW_ROLES` OR `USER_VIEW_ALL` OR `USER_CREATE` | Get all roles |
| `/api/roles` | POST | `RBAC_CREATE_ROLE` | Create new role |
| `/api/roles/:id` | GET | `RBAC_VIEW_ROLES` | Get role by ID |
| `/api/roles/:id` | PUT | `RBAC_EDIT_ROLE` | Update role |
| `/api/roles/:id` | DELETE | `RBAC_DELETE_ROLE` | Delete role |
| `/api/roles/:id/clone` | POST | `RBAC_CREATE_ROLE` | Clone role from master |
| `/api/roles/master/list` | GET | `RBAC_VIEW_ROLES` | Get master roles |

## Permission Management

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/permissions` | GET | `RBAC_VIEW_PERMISSIONS` | Get all permissions |
| `/api/permissions/grouped` | GET | `RBAC_VIEW_PERMISSIONS` | Get permissions grouped by category |
| `/api/permissions/:id` | GET | `RBAC_VIEW_PERMISSIONS` | Get permission by ID |

## Project Management

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/projects` | GET | `PROJECT_VIEW_ALL` | Get all projects |
| `/api/projects` | POST | `PROJECT_CREATE` | Create new project |
| `/api/projects/:id` | GET | `PROJECT_VIEW_ALL` | Get project by ID |
| `/api/projects/:id` | PUT | `PROJECT_EDIT` | Update project |
| `/api/projects/:id` | DELETE | `PROJECT_DELETE` | Delete project |
| `/api/projects/:id/toggle-status` | PATCH | `PROJECT_TOGGLE_STATUS` | Toggle project status |
| `/api/projects/:id/modules` | PATCH | `PROJECT_MANAGE_SETTINGS` | Update project modules |
| `/api/projects/stats` | GET | `PROJECT_VIEW_ALL` | Get project statistics |
| `/api/projects/branding/:urlPath` | GET | Public | Get project branding (public for login page) |
| `/api/projects/:projectId/ticket-settings` | GET | `PROJECT_VIEW_ALL` | Get ticket settings |
| `/api/projects/:id/offline-settings` | GET | `PROJECT_VIEW_ALL` OR `OFFLINE_MODULE_ACCESS` | Get offline settings |
| `/api/projects/:id/offline-settings` | PUT | `PROJECT_MANAGE_SETTINGS` | Update offline settings |

## Ticket Management

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/tickets/submit` | POST | Public | Submit ticket from student portal |
| `/api/tickets/offline-submission` | POST | `OFFLINE_TICKET_CREATE` | Create offline ticket |
| `/api/tickets/my-tickets` | GET | `TICKET_VIEW_OWN` | Get student's own tickets |
| `/api/tickets/agent/assigned` | GET | `TICKET_VIEW_ALL` | Get tickets assigned to agent |
| `/api/tickets/dashboard-stats` | GET | `TICKET_VIEW_ALL` OR `DASHBOARD_VIEW` | Get dashboard statistics |
| `/api/tickets/tags` | GET | `TICKET_VIEW_ALL` | Get all tags |
| `/api/tickets/bulk-update` | POST | `TICKET_BULK_UPDATE` | Bulk update tickets by tags |
| `/api/tickets/:id` | GET | `TICKET_VIEW_ALL` OR `TICKET_VIEW_OWN` | Get ticket by ID |
| `/api/tickets/:id/reply` | POST | `TICKET_ADD_COMMENT` | Add reply to ticket |
| `/api/tickets/:id/close` | PATCH | `TICKET_CHANGE_STATUS` | Close ticket |
| `/api/tickets/:id/status` | PATCH | `TICKET_CHANGE_STATUS` | Update ticket status |
| `/api/tickets/:id/category` | PATCH | `TICKET_EDIT` | Update ticket category |
| `/api/tickets/:id/priority` | PATCH | `TICKET_CHANGE_PRIORITY` | Update ticket priority |
| `/api/tickets/:id/tags` | POST | `TICKET_EDIT` | Add tag to ticket |
| `/api/tickets/:id/tags/:tag` | DELETE | `TICKET_EDIT` | Remove tag from ticket |
| `/api/tickets/:id/notes` | POST | `TICKET_ADD_COMMENT` | Add internal note |
| `/api/tickets/:id/escalate` | POST | `TICKET_ASSIGN` | Escalate ticket |
| `/api/tickets/export` | POST | `TICKET_EXPORT` | Export tickets |
| `/api/tickets/:id/attachments` | POST | `TICKET_ADD_ATTACHMENT` | Upload attachment |
| `/api/tickets/:id/attachments/:attachmentId/download` | GET | `TICKET_VIEW_ALL` OR `TICKET_VIEW_OWN` | Download attachment |
| `/api/tickets/:id/attachments/:attachmentId` | DELETE | `TICKET_DELETE_ATTACHMENT` | Delete attachment |
| `/api/tickets/:id/comments` | GET | `TICKET_VIEW_ALL` OR `TICKET_VIEW_OWN` | Get ticket comments |
| `/api/tickets/:id/comments` | POST | `TICKET_ADD_COMMENT` | Add comment |
| `/api/tickets/:id/comments/:commentId` | PUT | `TICKET_EDIT_COMMENT` | Update comment |
| `/api/tickets/:id/comments/:commentId` | DELETE | `TICKET_DELETE_COMMENT` | Delete comment |
| `/api/tickets/:id/merge` | POST | `TICKET_MERGE` | Merge tickets |

## Category Management

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/categories/project/:projectId` | GET | `TICKET_VIEW_ALL` OR `MASTER_DATA_VIEW` | Get categories by project |
| `/api/categories/project/:projectId` | POST | `MASTER_DATA_MANAGE_CATEGORIES` OR `TICKET_CONFIG_MANAGE_CATEGORIES` | Create category |
| `/api/categories/:categoryId` | GET | `MASTER_DATA_VIEW` | Get category by ID |
| `/api/categories/:categoryId` | PUT | `MASTER_DATA_MANAGE_CATEGORIES` OR `TICKET_CONFIG_MANAGE_CATEGORIES` | Update category |
| `/api/categories/:categoryId` | DELETE | `MASTER_DATA_MANAGE_CATEGORIES` OR `TICKET_CONFIG_MANAGE_CATEGORIES` | Delete category |

## Status Management

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/statuses/project/:projectId` | GET | `TICKET_VIEW_ALL` OR `MASTER_DATA_VIEW` | Get statuses by project |
| `/api/statuses/project/:projectId` | POST | `MASTER_DATA_MANAGE_STATUSES` OR `TICKET_CONFIG_MANAGE_STATUSES` | Create status |
| `/api/statuses/:statusId` | GET | `MASTER_DATA_VIEW` | Get status by ID |
| `/api/statuses/:statusId` | PUT | `MASTER_DATA_MANAGE_STATUSES` OR `TICKET_CONFIG_MANAGE_STATUSES` | Update status |
| `/api/statuses/:statusId` | DELETE | `MASTER_DATA_MANAGE_STATUSES` OR `TICKET_CONFIG_MANAGE_STATUSES` | Delete status |
| `/api/statuses/project/:projectId/reorder` | PUT | `MASTER_DATA_MANAGE_STATUSES` OR `TICKET_CONFIG_MANAGE_STATUSES` | Reorder statuses |

## Knowledge Base

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/knowledge-base/project/:projectId` | GET | Public (with optional auth) | Get KB articles by project |
| `/api/knowledge-base/project/:projectId/categories` | GET | Public (with optional auth) | Get KB categories |
| `/api/knowledge-base/:id` | GET | Public (with optional auth) | Get KB article by ID |
| `/api/knowledge-base/:id/feedback` | POST | Public | Submit article feedback |
| `/api/knowledge-base` | POST | `KB_CREATE` | Create KB article |
| `/api/knowledge-base/:id` | PUT | `KB_EDIT` | Update KB article |
| `/api/knowledge-base/:id` | DELETE | `KB_DELETE` | Delete KB article |

## Offline Module

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/offline/submissions` | GET | `OFFLINE_MODULE_ACCESS` | Get offline submissions |
| `/api/offline/register-and-ticket` | POST | `OFFLINE_STUDENT_REGISTER` AND `OFFLINE_TICKET_CREATE` | Register student and create ticket |
| `/api/offline/bulk-tickets` | POST | `OFFLINE_TICKET_CREATE` | Create bulk offline tickets |
| `/api/offline/students` | GET | `OFFLINE_STUDENT_VIEW` | Get registered students |
| `/api/offline/students/:id` | PUT | `OFFLINE_STUDENT_EDIT` | Update student record |

## Approval Workflows

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/approvals/pending` | GET | `APPROVAL_TICKETS_APPROVE_REJECT` | Get pending approvals |
| `/api/approvals/project/:projectId` | GET | `APPROVAL_WORKFLOWS_VIEW` | Get workflows by project |
| `/api/approvals/:id/approve` | POST | `APPROVAL_TICKETS_APPROVE_REJECT` | Approve ticket |
| `/api/approvals` | GET | `APPROVAL_WORKFLOWS_VIEW` | Get all workflows |
| `/api/approvals` | POST | `APPROVAL_WORKFLOWS_CREATE` | Create workflow |
| `/api/approvals/:id` | GET | `APPROVAL_WORKFLOWS_VIEW` | Get workflow by ID |
| `/api/approvals/:id/toggle-status` | PUT | `APPROVAL_WORKFLOWS_EDIT` | Toggle workflow status |
| `/api/approvals/:id` | PUT | `APPROVAL_WORKFLOWS_EDIT` | Update workflow |
| `/api/approvals/:id/delete` | DELETE | `APPROVAL_WORKFLOWS_DELETE` | Delete workflow |

## Audit Logs

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/access-logs` | GET | `AUDIT_VIEW_ACCESS` | Get all access logs |
| `/api/access-logs/stats` | GET | `AUDIT_VIEW_ACCESS` | Get access statistics |
| `/api/access-logs/export` | GET | `AUDIT_EXPORT` | Export access logs |
| `/api/access-logs/:id` | GET | `AUDIT_VIEW_ACCESS` | Get access log by ID |
| `/api/activity-logs` | GET | `AUDIT_VIEW_ACTIVITY` | Get all activity logs |
| `/api/activity-logs/stats` | GET | `AUDIT_VIEW_ACTIVITY` | Get activity statistics |
| `/api/activity-logs/export` | GET | `AUDIT_EXPORT` | Export activity logs |
| `/api/activity-logs/:id` | GET | `AUDIT_VIEW_ACTIVITY` | Get activity log by ID |

## Dashboard

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/dashboard/stats` | GET | `DASHBOARD_VIEW` | Get dashboard statistics |
| `/api/dashboard/export` | POST | `DASHBOARD_EXPORT` | Export dashboard data |

## Master Data

| Endpoint | Method | Permission Required | Description |
|----------|--------|-------------------|-------------|
| `/api/master-data` | GET | `MASTER_DATA_VIEW` | Get all master data |
| `/api/master-data/category/:category` | GET | `MASTER_DATA_VIEW` | Get master data by category |
| `/api/master-data` | POST | `MASTER_DATA_MANAGE_CATEGORIES` | Create master data |
| `/api/master-data/:id` | PUT | `MASTER_DATA_MANAGE_CATEGORIES` | Update master data |
| `/api/master-data/:id` | DELETE | `MASTER_DATA_MANAGE_CATEGORIES` | Delete master data |
| `/api/master-data/countries` | GET | Public | Get countries |
| `/api/master-data/states` | GET | Public | Get states |
| `/api/master-data/cities` | GET | Public | Get cities |

## Notes

- **Public endpoints**: Do not require authentication or permissions
- **Authenticated endpoints**: Require valid JWT token but no specific permission
- **Permission-protected endpoints**: Require valid JWT token AND specific permission(s)
- **OR logic**: User needs ANY ONE of the listed permissions
- **AND logic**: User needs ALL listed permissions (rare cases)
- Permission codes are checked via `checkPermission()` middleware
- JWT tokens include `role.permissions` array with permission codes as strings
- Frontend should check permissions before rendering UI elements (buttons, forms, menus)
