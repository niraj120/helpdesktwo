# RBAC Permission UI Implementation Plan

## Current Status
- **Total Permissions**: 128
- **Implemented**: 16 (13%)
- **Missing**: 112 (87%)

## Priority Levels
- **P0 (Critical)**: Core functionality that users expect immediately
- **P1 (High)**: Important features for daily operations
- **P2 (Medium)**: Advanced features
- **P3 (Low)**: Nice-to-have features

---

## Phase 1: Core Ticket Management (P0) - Week 1

### Tickets Module - Complete Implementation
**Status**: Partially done (10/16 permissions)

#### Already Implemented ✅
1. TICKET_VIEW_ALL - Ticket list view
2. TICKET_VIEW_OWN - Filtered ticket view
3. TICKET_CREATE - Create button
4. TICKET_EDIT - Edit action
5. TICKET_DELETE - Delete action
6. TICKET_ASSIGN - Assign modal
7. TICKET_BULK_UPDATE - Bulk toolbar
8. TICKET_CHANGE_STATUS - Status dropdown
9. TICKET_CHANGE_PRIORITY - Priority dropdown

#### Need to Implement ❌
1. **TICKET_ADD_COMMENT** - Comment section in ticket detail view
2. **TICKET_ADD_ATTACHMENT** - File upload in ticket detail
3. **TICKET_DELETE_ATTACHMENT** - Delete attachment button
4. **TICKET_EDIT_COMMENT** - Edit own comments
5. **TICKET_DELETE_COMMENT** - Delete comments
6. **TICKET_EXPORT** - Export to CSV/Excel button
7. **TICKET_MERGE** - Merge tickets modal

**Files to Create/Update**:
- `TicketDetailView.tsx` - Full ticket detail with comments, attachments
- `TicketCommentSection.tsx` - Comment list + add/edit/delete
- `TicketAttachmentSection.tsx` - Attachment upload/delete
- `TicketMergeModal.tsx` - Select tickets to merge
- `TicketExportModal.tsx` - Export options (CSV/Excel, filters)

---

## Phase 2: Dashboard & Analytics (P0) - Week 1

### Dashboard Module
**Status**: Basic view only (1/3 permissions)

#### Need to Implement ❌
1. **DASHBOARD_VIEW** - ✅ Already done (basic)
2. **DASHBOARD_VIEW_ANALYTICS** - Charts, graphs, metrics
3. **DASHBOARD_EXPORT** - Export dashboard data

**Files to Create/Update**:
- Update `DashboardModule.tsx`:
  - Add ticket statistics cards
  - Add charts (tickets by status, priority, category)
  - Add agent performance metrics
  - Add SLA compliance widgets
  - Add export button

**Backend APIs Needed**:
- `GET /api/dashboard/statistics` - Overall stats
- `GET /api/dashboard/tickets-by-status` - Chart data
- `GET /api/dashboard/agent-performance` - Agent metrics
- `GET /api/dashboard/sla-compliance` - SLA data
- `POST /api/dashboard/export` - Export data

---

## Phase 3: Knowledge Base (P1) - Week 2

### Knowledge Base Module
**Status**: Placeholder only (2/9 permissions)

#### Need to Implement ❌
1. **KB_VIEW** - ✅ Basic view exists
2. **KB_CREATE** - ✅ Button exists, need form
3. **KB_EDIT** - Edit article form
4. **KB_DELETE** - Delete confirmation
5. **KB_PUBLISH** - Publish/unpublish toggle
6. **KB_UNPUBLISH** - Same as publish
7. **KB_APPROVE** - Approval workflow
8. **KB_MANAGE_CATEGORIES** - Category management
9. **KB_EXPORT** - Export articles

**Files to Create**:
- `KnowledgeBaseList.tsx` - Article list with search/filter
- `ArticleEditor.tsx` - Rich text editor for articles
- `ArticleDetailView.tsx` - Read article view
- `ArticleCategoryManager.tsx` - Manage categories
- `ArticleApprovalQueue.tsx` - Approval workflow

**Backend APIs Needed**:
- `GET /api/kb/articles` - List articles
- `POST /api/kb/articles` - Create article
- `PUT /api/kb/articles/:id` - Update article
- `DELETE /api/kb/articles/:id` - Delete article
- `POST /api/kb/articles/:id/publish` - Publish
- `GET /api/kb/categories` - List categories
- `POST /api/kb/categories` - Create category

---

## Phase 4: User Management (P1) - Week 2

### User Management Module
**Status**: Placeholder only (1/9 permissions)

#### Need to Implement ❌
1. **USER_VIEW_ALL** - ✅ Basic view exists
2. **USER_CREATE** - Create user form
3. **USER_EDIT** - Edit user form
4. **USER_DELETE** - Delete confirmation
5. **USER_ASSIGN_ROLE** - Role assignment dropdown
6. **USER_RESET_PASSWORD** - Reset password button/modal
7. **USER_TOGGLE_STATUS** - Activate/deactivate toggle
8. **USER_IMPORT** - Bulk import CSV
9. **USER_MANAGE_GROUPS** - Group management

**Files to Create**:
- `UserList.tsx` - User table with actions
- `UserForm.tsx` - Create/edit user form
- `UserDetailView.tsx` - User profile view
- `UserGroupManager.tsx` - Manage user groups
- `UserImportModal.tsx` - CSV import

**Backend APIs Needed**:
- `GET /api/users` - List users (already exists)
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/:id/reset-password` - Reset password
- `POST /api/users/import` - Bulk import

---

## Phase 5: Project Management (P1) - Week 3

### Project Management Module
**Status**: Placeholder only (1/9 permissions)

#### Need to Implement ❌
1. **PROJECT_VIEW_ALL** - ✅ Basic view exists
2. **PROJECT_CREATE** - Create project form
3. **PROJECT_EDIT** - Edit project form
4. **PROJECT_DELETE** - Delete confirmation
5. **PROJECT_ASSIGN_USERS** - Assign users/roles
6. **PROJECT_MANAGE_BRANDING** - Branding customization
7. **PROJECT_MANAGE_URL** - Custom URL configuration
8. **PROJECT_MANAGE_SETTINGS** - Project settings
9. **PROJECT_TOGGLE_STATUS** - Activate/deactivate

**Files to Create**:
- `ProjectList.tsx` - Project cards/table
- `ProjectForm.tsx` - Create/edit project
- `ProjectBrandingEditor.tsx` - Logo, colors, theme
- `ProjectSettingsPanel.tsx` - All project settings
- `ProjectUserAssignment.tsx` - Assign users to project

---

## Phase 6: RBAC Setup (P1) - Week 3

### RBAC Module
**Status**: Placeholder only (1/6 permissions)

#### Need to Implement ❌
1. **RBAC_VIEW_ROLES** - ✅ Basic view exists
2. **RBAC_CREATE_ROLE** - Create role form
3. **RBAC_EDIT_ROLE** - Edit role form
4. **RBAC_DELETE_ROLE** - Delete confirmation
5. **RBAC_ASSIGN_PERMISSIONS** - Permission assignment UI
6. **RBAC_VIEW_PERMISSIONS** - View all permissions

**Files to Create**:
- `RoleList.tsx` - Role table with actions
- `RoleForm.tsx` - Create/edit role
- `PermissionSelector.tsx` - Checkbox tree for permissions
- `PermissionList.tsx` - View all available permissions

---

## Phase 7: Master Data Management (P1) - Week 4

### Master Data Module
**Status**: Placeholder only (1/6 permissions)

#### Need to Implement ❌
1. **MASTER_DATA_VIEW** - ✅ Basic view exists
2. **MASTER_DATA_MANAGE_CATEGORIES** - Category CRUD
3. **MASTER_DATA_MANAGE_STATUSES** - Status CRUD
4. **MASTER_DATA_MANAGE_PRIORITIES** - Priority CRUD
5. **MASTER_DATA_MANAGE_DEPARTMENTS** - Department CRUD
6. **MASTER_DATA_MANAGE_LOCATIONS** - Location CRUD

**Files to Create**:
- `MasterDataTabs.tsx` - Tabbed interface
- `CategoryManager.tsx` - Manage categories
- `StatusManager.tsx` - Manage statuses
- `PriorityManager.tsx` - Manage priorities
- `DepartmentManager.tsx` - Manage departments
- `LocationManager.tsx` - Manage locations

---

## Phase 8: SLA & Automation (P2) - Week 5

### SLA Module (0/6 permissions)
1. SLA_VIEW - View SLA policies
2. SLA_CREATE - Create SLA
3. SLA_EDIT - Edit SLA
4. SLA_DELETE - Delete SLA
5. SLA_MANAGE_BUSINESS_HOURS - Business hours config
6. SLA_MANAGE_ESCALATIONS - Escalation rules

### Automation Module (0/6 permissions)
1. AUTOMATION_VIEW - View automations
2. AUTOMATION_MANAGE_AUTO_ASSIGN - Auto-assign rules
3. AUTOMATION_MANAGE_CREATE_TRIGGERS - Create triggers
4. AUTOMATION_MANAGE_UPDATE_TRIGGERS - Update triggers
5. AUTOMATION_MANAGE_TIME_TRIGGERS - Time-based triggers
6. AUTOMATION_TOGGLE - Enable/disable

---

## Phase 9: Advanced Features (P2) - Week 6

### Form Builder (0/6 permissions)
### Approval Process (0/5 permissions)
### Workflow Management (0/5 permissions)
### Fields & Forms (0/7 permissions)

---

## Phase 10: Reporting & Analytics (P2) - Week 7

### Reports Module (0/7 permissions)
1. REPORT_VIEW_TICKETS - Ticket reports
2. REPORT_VIEW_AGENT_PERFORMANCE - Agent metrics
3. REPORT_VIEW_SLA - SLA compliance
4. REPORT_VIEW_CSAT - Customer satisfaction
5. REPORT_CREATE_CUSTOM - Custom reports
6. REPORT_EXPORT - Export reports
7. REPORT_SCHEDULE - Scheduled reports

---

## Phase 11: Integrations & Audit (P3) - Week 8

### Integrations (0/6 permissions)
### Audit Logs (0/9 permissions)

---

## Phase 12: Offline Module & Ticket Config (P3) - Week 9

### Offline Module (0/7 permissions)
### Ticket Configuration (0/6 permissions)

---

## Implementation Strategy

### Week 1 Priority (Start Now)
1. ✅ Fix Shubhangi's login issue (logout/login for fresh JWT)
2. ✅ Complete TicketsModule (7 missing features)
3. ✅ Complete DashboardModule (analytics + export)

### Development Approach
1. **Module-based development**: Complete one module at a time
2. **Backend-first**: Ensure all APIs exist before building UI
3. **Permission-gated**: Every UI element checks permissions
4. **Reusable components**: Build shared components (tables, forms, modals)
5. **Consistent UX**: Use same design patterns across modules

### Shared Components to Build
- `DataTable.tsx` - Reusable table with sort, filter, pagination
- `Form.tsx` - Dynamic form builder
- `Modal.tsx` - Consistent modal dialogs
- `ConfirmDialog.tsx` - Delete confirmations
- `PermissionGate.tsx` - Wrapper to show/hide based on permissions
- `ExportButton.tsx` - Reusable export functionality

### Testing Strategy
1. Test each permission individually
2. Test permission combinations
3. Test role-based access
4. Test multi-project scenarios

---

## Immediate Next Steps

1. **Fix Shubhangi's issue** - Logout/login to get Tickets module
2. **Create shared components** - DataTable, Modal, Form
3. **Complete TicketsModule** - Add missing 7 features
4. **Build DashboardModule** - Analytics and charts
5. **Continue with KB, Users, Projects** - One module per day

---

## Estimated Timeline

- **Phase 1-2** (Tickets + Dashboard): 1 week
- **Phase 3-4** (KB + Users): 1 week
- **Phase 5-6** (Projects + RBAC): 1 week
- **Phase 7** (Master Data): 1 week
- **Phase 8-12** (Advanced features): 5 weeks

**Total: 9 weeks for complete implementation**

---

## Success Metrics

- All 128 permissions have corresponding UI
- Each module has full CRUD operations
- Permission checks on every action
- Consistent UX across all modules
- Comprehensive testing
