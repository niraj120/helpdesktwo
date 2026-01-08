# SUPER ADMIN RBAC COMPLETE SCREEN MAPPING
## SAC Helpdesk Portal - All Permissions Mapped to UI Components

### 📊 **DASHBOARD MODULE**
**Route**: `/dashboard` | **Permission Group**: DASHBOARD

| Permission Code | Screen/Component | UI Elements | Notes |
|----------------|------------------|-------------|-------|
| `DASHBOARD_VIEW` | Dashboard Home | - Main dashboard layout<br>- Navigation menu access<br>- Welcome panels | Base access permission |
| `DASHBOARD_VIEW_ANALYTICS` | Dashboard Analytics | - Ticket metrics cards<br>- Performance graphs<br>- Statistical charts<br>- KPI indicators<br>- Trend analysis widgets | Analytics widgets visibility |
| `DASHBOARD_EXPORT` | Dashboard Export | - Export button<br>- Download reports option<br>- PDF/Excel generation | Export functionality |

---

### 🎫 **TICKETS MODULE**  
**Route**: `/tickets` | **Permission Group**: TICKETS

#### **Main Tickets Screen**
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `TICKET_VIEW_ALL` | - Tickets list table<br>- All tickets visibility<br>- Global ticket search | View All button, Search across all tickets |
| `TICKET_VIEW_OWN` | - My tickets filter<br>- Assigned tickets view | My Tickets tab, Assigned to Me filter |
| `TICKET_CREATE` | - Create New Ticket button<br>- Ticket creation form<br>- Quick create widget | **+ Create Ticket** button, **New** button |
| `TICKET_EXPORT` | - Export tickets button<br>- Bulk export options | **Export** button, **Download CSV/Excel** |

#### **Individual Ticket Detail Screen** (`/tickets/:id`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `TICKET_EDIT` | - Edit ticket form<br>- Editable fields | **Edit** button, **Save Changes** button |
| `TICKET_DELETE` | - Delete ticket option | **Delete** button (with confirmation) |
| `TICKET_ASSIGN` | - Assign to dropdown<br>- Agent selection<br>- Assignment history | **Assign** button, **Change Assignee** dropdown |
| `TICKET_CHANGE_STATUS` | - Status dropdown<br>- Status change buttons<br>- Workflow actions | **Open/In Progress/Resolved/Closed** buttons |
| `TICKET_CHANGE_PRIORITY` | - Priority selector<br>- Priority badges | **Low/Medium/High/Critical** options |
| `TICKET_ADD_COMMENT` | - Comment text area<br>- Reply section | **Add Comment** button, **Reply** button |
| `TICKET_EDIT_COMMENT` | - Edit comment option<br>- Comment modification | **Edit** icon on comments |
| `TICKET_DELETE_COMMENT` | - Delete comment option | **Delete** icon on comments |
| `TICKET_ADD_ATTACHMENT` | - File upload area<br>- Drag-drop zone<br>- Attachment list | **Attach File** button, **Browse** button |
| `TICKET_DELETE_ATTACHMENT` | - Remove attachment option | **Remove** icon on attachments |
| `TICKET_MERGE` | - Merge tickets option<br>- Ticket selection for merge | **Merge** button, **Select Tickets** modal |
| `TICKET_BULK_UPDATE` | - Bulk actions toolbar<br>- Multi-select checkboxes | **Bulk Actions** dropdown, **Select All** checkbox |

---

### ⚙️ **TICKET CONFIGURATION MODULE**
**Route**: `/admin/tickets` | **Permission Group**: TICKET_CONFIG

#### **Categories Management** (`/admin/tickets/categories`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `TICKET_CONFIG_VIEW` | - Categories list view | Base access to configuration |
| `TICKET_CONFIG_MANAGE_CATEGORIES` | - Categories CRUD interface<br>- Category form<br>- Category list table | **+ Add Category**, **Edit**, **Delete**, **Save**, **Cancel** |

#### **Statuses Management** (`/admin/tickets/statuses`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `TICKET_CONFIG_MANAGE_STATUSES` | - Status management interface<br>- Status workflow designer<br>- Color coding options | **+ Add Status**, **Edit**, **Delete**, **Configure Workflow** |

#### **Priorities Management** (`/admin/tickets/priorities`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `TICKET_CONFIG_MANAGE_PRIORITIES` | - Priority levels interface<br>- SLA time configuration<br>- Priority matrix | **+ Add Priority**, **Edit**, **Delete**, **Set SLA Time** |

#### **Types Management** (`/admin/tickets/types`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `TICKET_CONFIG_MANAGE_TYPES` | - Ticket types interface<br>- Type categorization<br>- Custom fields setup | **+ Add Type**, **Edit**, **Delete**, **Configure Fields** |

#### **Templates Management** (`/admin/tickets/templates`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `TICKET_CONFIG_MANAGE_TEMPLATES` | - Template builder<br>- Template library<br>- Preview functionality | **+ Create Template**, **Edit**, **Delete**, **Preview**, **Clone** |

---

### 👥 **USER MANAGEMENT MODULE**
**Route**: `/users` | **Permission Group**: USER

#### **Users List Screen** (`/users`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `USER_VIEW_ALL` | - Users table<br>- User search and filter<br>- User profiles | View access to user list |
| `USER_CREATE` | - Create user form<br>- User registration | **+ Add User** button, **Create** button |
| `USER_IMPORT` | - Bulk import interface<br>- CSV upload<br>- Import wizard | **Import Users** button, **Upload CSV**, **Import** |

#### **Individual User Detail** (`/users/:id`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `USER_EDIT` | - User profile edit form<br>- Personal details<br>- Contact information | **Edit** button, **Save Changes**, **Cancel** |
| `USER_DELETE` | - Delete user option<br>- Confirmation dialog | **Delete User** button (with confirmation) |
| `USER_TOGGLE_STATUS` | - Active/Inactive toggle<br>- Status indicator | **Activate/Deactivate** toggle button |
| `USER_ASSIGN_ROLE` | - Role assignment dropdown<br>- Permission preview | **Change Role** dropdown, **Assign** button |
| `USER_RESET_PASSWORD` | - Password reset option<br>- New password generation | **Reset Password** button, **Generate New Password** |
| `USER_MANAGE_GROUPS` | - User groups interface<br>- Group membership<br>- Access control | **Manage Groups** button, **Add to Group**, **Remove from Group** |

---

### 🔐 **RBAC SETUP MODULE**
**Route**: `/admin/rbac` | **Permission Group**: RBAC

#### **Roles Management** (`/admin/rbac/roles`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `RBAC_VIEW_ROLES` | - Roles list table<br>- Role details view | Access to roles section |
| `RBAC_CREATE_ROLE` | - Create role form<br>- Role configuration | **+ Create Role** button, **Save** button |
| `RBAC_EDIT_ROLE` | - Edit role interface<br>- Role modification form | **Edit** button, **Update** button |
| `RBAC_DELETE_ROLE` | - Delete role option<br>- Dependencies check | **Delete** button (with safety checks) |

#### **Permissions Management** (`/admin/rbac/permissions`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `RBAC_VIEW_PERMISSIONS` | - Permissions tree view<br>- Permission categories<br>- Permission details | View permissions hierarchy |
| `RBAC_ASSIGN_PERMISSIONS` | - Permission checkboxes<br>- Bulk assignment<br>- Permission matrix | **Select All**, **Assign**, **Bulk Edit** checkboxes |

---

### 🏢 **PROJECT MANAGEMENT MODULE**
**Route**: `/admin/projects` | **Permission Group**: PROJECT

#### **Projects List** (`/admin/projects`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `PROJECT_VIEW_ALL` | - Projects table<br>- Project cards<br>- Status indicators | View access to all projects |
| `PROJECT_CREATE` | - Create project wizard<br>- Project setup form | **+ Create Project** button, **Next**, **Create** |

#### **Individual Project** (`/admin/projects/:id`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `PROJECT_EDIT` | - Project settings form<br>- Configuration panels | **Edit** button, **Save Settings** |
| `PROJECT_DELETE` | - Delete project option<br>- Data retention settings | **Delete Project** button (with confirmation) |
| `PROJECT_TOGGLE_STATUS` | - Active/Inactive toggle<br>- Status management | **Activate/Deactivate** button |
| `PROJECT_MANAGE_SETTINGS` | - Settings tabs<br>- Configuration options<br>- Feature toggles | **Settings** tab, **Configure** buttons |
| `PROJECT_MANAGE_BRANDING` | - Logo upload<br>- Color scheme<br>- Theme customization | **Upload Logo**, **Color Picker**, **Apply Theme** |
| `PROJECT_MANAGE_URL` | - URL configuration<br>- Domain settings<br>- SSL setup | **Configure URL**, **Set Domain**, **SSL Settings** |
| `PROJECT_ASSIGN_USERS` | - User assignment interface<br>- Role mapping<br>- Access control | **Assign Users**, **Set Roles**, **Manage Access** |

---

### 📚 **KNOWLEDGE BASE MODULE**
**Route**: `/knowledge-base` | **Permission Group**: KB

#### **Knowledge Base Home** (`/knowledge-base`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `KB_VIEW` | - Articles list<br>- Search functionality<br>- Category navigation | Base access to KB |
| `KB_CREATE` | - Create article form<br>- Rich text editor<br>- Content builder | **+ Create Article** button, **Write** button |
| `KB_EXPORT` | - Export articles option<br>- Bulk download | **Export** button, **Download All** |

#### **Article Detail** (`/knowledge-base/:id`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `KB_EDIT` | - Edit article form<br>- Content modification<br>- Metadata editing | **Edit** button, **Save Changes** |
| `KB_DELETE` | - Delete article option | **Delete** button (with confirmation) |
| `KB_PUBLISH` | - Publish article button<br>- Publication settings | **Publish** button, **Make Public** |
| `KB_UNPUBLISH` | - Unpublish option<br>- Draft conversion | **Unpublish** button, **Move to Draft** |
| `KB_APPROVE` | - Approval workflow<br>- Review interface | **Approve** button, **Request Changes**, **Reject** |

#### **Categories Management** (`/knowledge-base/categories`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `KB_MANAGE_CATEGORIES` | - Category tree view<br>- Category CRUD<br>- Hierarchy management | **+ Add Category**, **Edit**, **Delete**, **Reorganize** |

---

### 🔍 **AUDIT LOGS MODULE**
**Route**: `/admin/audit` | **Permission Group**: AUDIT

#### **Activity Logs** (`/admin/audit/activity`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `AUDIT_VIEW_ACTIVITY` | - Activity logs table<br>- User action timeline<br>- Search and filter | View activity history |
| `AUDIT_EXPORT` | - Export logs button<br>- Date range selection | **Export Logs**, **Download Report** |

#### **Access Logs** (`/admin/audit/access`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `AUDIT_VIEW_ACCESS` | - Login history<br>- Session tracking<br>- Security events | View access patterns |

#### **Email Management** (`/admin/audit/emails`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `AUDIT_VIEW_BLOCKED_EMAILS` | - Blocked emails list<br>- Email status tracking | View blocked email list |
| `AUDIT_MANAGE_BLOCKED_EMAILS` | - Block/Unblock interface<br>- Email filtering rules | **Block Email**, **Unblock**, **Add Filter** |
| `AUDIT_VIEW_EMAIL_FAILURES` | - Failed email logs<br>- Delivery status<br>- Error tracking | View email delivery issues |

#### **Integration Logs** (`/admin/audit/integrations`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `AUDIT_VIEW_INTEGRATION_FAILURES` | - Integration error logs<br>- API failure tracking | View integration issues |
| `AUDIT_VIEW_WEBHOOK_FAILURES` | - Webhook delivery logs<br>- Retry mechanisms | View webhook failures |
| `AUDIT_VIEW_CHAT_WEBHOOK_FAILURES` | - Chat integration logs<br>- Message delivery status | View chat integration issues |

---

### 📊 **REPORTS MODULE**
**Route**: `/reports` | **Permission Group**: REPORT

#### **Reports Dashboard** (`/reports`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `REPORT_VIEW_TICKETS` | - Ticket analytics<br>- Volume trends<br>- Resolution metrics | View ticket reports |
| `REPORT_VIEW_AGENT_PERFORMANCE` | - Agent metrics<br>- Performance scorecards<br>- Productivity analysis | View agent performance |
| `REPORT_VIEW_CSAT` | - Customer satisfaction scores<br>- Feedback analysis<br>- Rating trends | View satisfaction reports |
| `REPORT_VIEW_SLA` | - SLA compliance metrics<br>- Breach analysis<br>- Performance indicators | View SLA reports |
| `REPORT_EXPORT` | - Export functionality<br>- Format selection<br>- Scheduled exports | **Export Report**, **Schedule**, **Download** |
| `REPORT_CREATE_CUSTOM` | - Report builder<br>- Custom queries<br>- Visualization tools | **+ Create Report**, **Build Query**, **Save** |
| `REPORT_SCHEDULE` | - Automated scheduling<br>- Email delivery<br>- Recurring reports | **Schedule Report**, **Set Frequency**, **Configure Recipients** |

---

### ⚡ **SLA & ESCALATION MODULE**
**Route**: `/admin/sla` | **Permission Group**: SLA

#### **SLA Policies** (`/admin/sla/policies`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `SLA_VIEW` | - SLA policies list<br>- Policy details<br>- Compliance tracking | View SLA configurations |
| `SLA_CREATE` | - Create SLA form<br>- Policy wizard<br>- Time configuration | **+ Create SLA**, **Add Policy**, **Save** |
| `SLA_EDIT` | - Edit SLA interface<br>- Policy modification | **Edit** button, **Update Policy** |
| `SLA_DELETE` | - Delete SLA option<br>- Impact assessment | **Delete** button (with impact warning) |

#### **Escalation Rules** (`/admin/sla/escalations`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `SLA_MANAGE_ESCALATIONS` | - Escalation matrix<br>- Rule builder<br>- Notification setup | **+ Add Rule**, **Configure Escalation**, **Set Notifications** |

#### **Business Hours** (`/admin/sla/business-hours`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `SLA_MANAGE_BUSINESS_HOURS` | - Calendar interface<br>- Holiday management<br>- Working hours setup | **Set Hours**, **Add Holiday**, **Configure Calendar** |

---

### 📋 **APPROVAL PROCESS MODULE**
**Route**: `/admin/approvals` | **Permission Group**: APPROVAL

#### **Approval Workflows** (`/admin/approvals/workflows`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `APPROVAL_WORKFLOWS_VIEW` | - Workflows list<br>- Process visualization | View approval processes |
| `APPROVAL_WORKFLOWS_CREATE` | - Workflow builder<br>- Process designer<br>- Step configuration | **+ Create Workflow**, **Add Step**, **Save Process** |
| `APPROVAL_WORKFLOWS_EDIT` | - Edit workflow interface<br>- Process modification | **Edit Workflow**, **Modify Steps** |
| `APPROVAL_WORKFLOWS_DELETE` | - Delete workflow option<br>- Active process check | **Delete Workflow** (with active check) |

#### **Approval Queue** (`/approvals`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `APPROVAL_TICKETS_APPROVE_REJECT` | - Pending approvals<br>- Approval interface<br>- Decision tracking | **Approve**, **Reject**, **Request Info** |
| `APPROVAL_HISTORY_VIEW` | - Approval history<br>- Decision timeline<br>- Audit trail | View approval decisions |

---

### 🔗 **INTEGRATIONS MODULE**
**Route**: `/admin/integrations` | **Permission Group**: INTEGRATION

#### **Integrations Dashboard** (`/admin/integrations`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `INTEGRATION_VIEW` | - Integrations overview<br>- Connection status<br>- Health monitoring | View integration status |

#### **Email Integration** (`/admin/integrations/email`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `INTEGRATION_MANAGE_EMAIL` | - Email configuration<br>- SMTP settings<br>- Template management | **Configure Email**, **Test Connection**, **Save Settings** |

#### **SMS Integration** (`/admin/integrations/sms`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `INTEGRATION_MANAGE_SMS` | - SMS provider setup<br>- Message templates<br>- Delivery settings | **Configure SMS**, **Test SMS**, **Save Configuration** |

#### **Webhooks** (`/admin/integrations/webhooks`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `INTEGRATION_MANAGE_WEBHOOKS` | - Webhook endpoints<br>- Event configuration<br>- Testing interface | **+ Add Webhook**, **Test Webhook**, **Configure Events** |

#### **API Management** (`/admin/integrations/api`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `INTEGRATION_MANAGE_API` | - API key management<br>- Access tokens<br>- Rate limiting | **Generate API Key**, **Revoke Token**, **Set Limits** |

#### **Third-Party Apps** (`/admin/integrations/apps`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `INTEGRATION_MANAGE_APPS` | - Connected applications<br>- OAuth management<br>- App permissions | **Connect App**, **Disconnect**, **Manage Permissions** |

---

### 🗄️ **MASTER DATA MODULE**
**Route**: `/admin/master-data` | **Permission Group**: MASTER_DATA

#### **Master Data Dashboard** (`/admin/master-data`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `MASTER_DATA_VIEW` | - Master data overview<br>- Data categories<br>- Statistics | View master data access |

#### **Categories** (`/admin/master-data/categories`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `MASTER_DATA_MANAGE_CATEGORIES` | - Category hierarchy<br>- Category CRUD<br>- Subcategory management | **+ Add Category**, **Edit**, **Delete**, **Add Subcategory** |

#### **Priorities** (`/admin/master-data/priorities`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `MASTER_DATA_MANAGE_PRIORITIES` | - Priority levels<br>- Color coding<br>- SLA mapping | **+ Add Priority**, **Edit**, **Delete**, **Set Colors** |

#### **Statuses** (`/admin/master-data/statuses`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `MASTER_DATA_MANAGE_STATUSES` | - Status workflow<br>- State transitions<br>- Business rules | **+ Add Status**, **Edit**, **Delete**, **Configure Workflow** |

#### **Departments** (`/admin/master-data/departments`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `MASTER_DATA_MANAGE_DEPARTMENTS` | - Department hierarchy<br>- Organizational structure<br>- Manager assignment | **+ Add Department**, **Edit**, **Delete**, **Assign Manager** |

#### **Locations** (`/admin/master-data/locations`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `MASTER_DATA_MANAGE_LOCATIONS` | - Office locations<br>- Geographic mapping<br>- Contact details | **+ Add Location**, **Edit**, **Delete**, **Set Coordinates** |

---

### 🏪 **OFFLINE MODULE**
**Route**: `/offline` | **Permission Group**: OFFLINE

#### **Offline Dashboard** (`/offline`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `OFFLINE_MODULE_ACCESS` | - Offline module interface<br>- Walk-in support dashboard | Base access to offline module |

#### **Student Registration** (`/offline/students`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `OFFLINE_STUDENT_REGISTER` | - Student registration form<br>- Quick registration<br>- Document upload | **+ Register Student**, **Quick Register**, **Save** |
| `OFFLINE_STUDENT_VIEW` | - Student records<br>- Search functionality<br>- Student profiles | View student information |
| `OFFLINE_STUDENT_EDIT` | - Edit student details<br>- Update information | **Edit Student**, **Update Details** |

#### **Offline Tickets** (`/offline/tickets`)
| Permission Code | UI Elements | Buttons/Actions |
|----------------|-------------|-----------------|
| `OFFLINE_TICKET_CREATE` | - Create ticket for student<br>- Quick ticket form<br>- Category selection | **+ Create Ticket**, **Quick Create** |
| `OFFLINE_TICKET_RESOLVE` | - Mark resolved immediately<br>- Resolution notes<br>- Instant closure | **Mark Resolved**, **Close Ticket** |
| `OFFLINE_TICKET_ESCALATE` | - Escalate during creation<br>- Priority assignment<br>- Immediate escalation | **Escalate Now**, **High Priority** |

---

## 🎯 **NAVIGATION & ACCESS CONTROL**

### **Main Navigation Menu**
| Permission Required | Menu Item | Submenu Items |
|-------------------|-----------|---------------|
| `DASHBOARD_VIEW` | Dashboard | Analytics, Reports |
| `TICKET_VIEW_ALL` or `TICKET_VIEW_OWN` | Tickets | All Tickets, My Tickets, Create |
| `KB_VIEW` | Knowledge Base | Articles, Categories |
| `USER_VIEW_ALL` | Users | All Users, Create User |
| `PROJECT_VIEW_ALL` | Projects | All Projects, Settings |
| `RBAC_VIEW_ROLES` | RBAC | Roles, Permissions |
| `OFFLINE_MODULE_ACCESS` | Offline Support | Students, Tickets |
| `REPORT_VIEW_TICKETS` | Reports | Analytics, Custom Reports |
| `AUDIT_VIEW_ACTIVITY` | Audit | Activity, Access, Email |

### **Admin Panel Access**
| Route | Required Permission | Purpose |
|-------|-------------------|---------|
| `/admin` | Any admin permission | Admin panel home |
| `/admin/users` | `USER_VIEW_ALL` | User management |
| `/admin/projects` | `PROJECT_VIEW_ALL` | Project administration |
| `/admin/rbac` | `RBAC_VIEW_ROLES` | Role & permission management |
| `/admin/tickets` | `TICKET_CONFIG_VIEW` | Ticket configuration |
| `/admin/sla` | `SLA_VIEW` | SLA management |
| `/admin/integrations` | `INTEGRATION_VIEW` | Integration settings |
| `/admin/audit` | `AUDIT_VIEW_ACTIVITY` | Audit logs |
| `/admin/master-data` | `MASTER_DATA_VIEW` | Master data management |

---

## 🔒 **PERMISSION INHERITANCE & DEPENDENCIES**

### **Hierarchical Permissions**
- `PROJECT_VIEW_ALL` → Enables access to all project-specific features
- `TICKET_VIEW_ALL` → Overrides `TICKET_VIEW_OWN` restrictions  
- `USER_VIEW_ALL` → Enables user management across all projects
- `RBAC_VIEW_ROLES` → Required for any RBAC operations

### **Action Dependencies**
- **Edit** permissions generally require corresponding **View** permissions
- **Delete** permissions require both **View** and **Edit** permissions
- **Create** permissions require **View** permission for the module
- **Export** permissions require corresponding **View** permissions

### **Critical Safety Permissions**
- `USER_DELETE` - Cannot delete Super Admin users (hardcoded protection)
- `RBAC_DELETE_ROLE` - Cannot delete roles with active users
- `PROJECT_DELETE` - Cannot delete projects with active tickets
- `TICKET_DELETE` - May require additional confirmation for closed tickets

---

**Total Mapped**: **105 permissions** across **15 modules** with **200+ UI elements** and **300+ buttons/actions**

This comprehensive mapping ensures every Super Admin permission has a corresponding UI element and clear access control implementation.