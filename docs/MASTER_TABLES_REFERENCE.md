# Master Tables Reference - SAC Helpdesk Portal

This document lists all master tables that should be manageable from the frontend.

## 📋 Current Implementation Status

### ✅ IMPLEMENTED (Currently Manageable from Frontend)

#### 1. **Projects** (`projects`)
- **Route**: `/projects`
- **Component**: `ProjectManagement.tsx`
- **Fields**:
  - Project Name
  - Project Code
  - Custom URL Path
  - Description
  - Logo
  - Primary/Secondary Colors
  - Ticket Submission Mode (Online/Offline/Both)
  - Active Status
- **Features**: Create, Edit, Delete, View, Branding Configuration

#### 2. **Roles** (`roles`)
- **Route**: `/rbac`
- **Component**: `RBACSetup.tsx`
- **Fields**:
  - Role Name
  - Role Code
  - Description
  - Type (System/Custom)
  - Permissions (Array)
  - Projects (Array)
  - Is Master (Template Role)
  - Master Role ID
  - Active Status
- **Features**: Create, Edit, Delete, Clone, Mark as Master, Permission Management

#### 3. **Users** (`users`)
- **Route**: `/users`
- **Component**: `UserManagement.tsx`
- **Fields**:
  - Name
  - Email
  - Mobile
  - Role
  - Projects (Array)
  - Department
  - Active Status
  - EULA Accepted
- **Features**: Create, Edit, Delete, Reset Password, Assign Roles/Projects

#### 4. **Categories** (`categories`)
- **Route**: `/master-data` → Categories Tab
- **Component**: `MasterDataManagement.tsx`
- **Fields**:
  - Category Name
  - Description
  - Active Status
- **Features**: Create, Edit, Delete, Toggle Active

#### 5. **Sub-Categories** (`subcategories`)
- **Route**: `/master-data` → Sub-Categories Tab
- **Component**: `MasterDataManagement.tsx`
- **Fields**:
  - Sub-Category Name
  - Parent Category
  - Description
  - Active Status
- **Features**: Create, Edit, Delete, Category Association

#### 6. **Statuses** (`statuses`)
- **Route**: `/master-data` → Statuses Tab
- **Component**: `MasterDataManagement.tsx`
- **Fields**:
  - Status Name
  - Status Type (Open/In Progress/Resolved/Closed)
  - Color Code
  - Display Order
  - Active Status
- **Features**: Create, Edit, Delete, Reorder

#### 7. **Priorities** (`priorities`)
- **Route**: `/master-data` → Priorities Tab
- **Component**: `MasterDataManagement.tsx`
- **Fields**:
  - Priority Name
  - Priority Level (1-5)
  - Color Code
  - SLA Hours
  - Active Status
- **Features**: Create, Edit, Delete

#### 8. **SLA Rules** (`slarules`)
- **Route**: `/sla`
- **Component**: `SLARulesPage.tsx`
- **Fields**:
  - Rule Name
  - Priority
  - Response Time (Hours)
  - Resolution Time (Hours)
  - Business Hours Only
  - Active Status
- **Features**: Create, Edit, Delete, Toggle Active

#### 9. **Escalation Matrix** (`escalationmatrix`)
- **Route**: `/escalation-matrix`
- **Component**: `EscalationMatrixPage.tsx`
- **Fields**:
  - Project
  - Priority
  - Level (L1/L2/L3)
  - Escalation Time (Hours)
  - Escalate To (User/Role)
  - Active Status
- **Features**: Create, Edit, Delete, Multi-level Configuration

#### 10. **Knowledge Base Articles** (`kbarticles`)
- **Route**: `/knowledge-base`
- **Component**: `KnowledgeBaseManagement.tsx`
- **Fields**:
  - Title
  - Content
  - Category
  - Tags
  - Attachments
  - Published Status
  - Views Count
  - Helpful/Not Helpful Count
- **Features**: Create, Edit, Delete, Publish, Search, View Analytics

#### 11. **Approval Workflows** (`approvalworkflows`)
- **Route**: `/approvals`
- **Component**: `ApprovalWorkflows.tsx`
- **Fields**:
  - Workflow Name
  - Project
  - Trigger Condition
  - Approval Stages
  - Approvers (Users/Roles)
  - Auto-Approve After (Hours)
  - Active Status
- **Features**: Create, Edit, Delete, Multi-stage Configuration

#### 12. **Offline Centers** (`offlinecenters`)
- **Route**: `/offline-module/settings/:projectId`
- **Component**: `OfflineModuleSettings.tsx`
- **Fields**:
  - Center Name
  - Center Code
  - Location
  - Contact Person
  - Contact Number
  - Email
  - Capacity
  - Operating Hours
  - Active Status
- **Features**: Create, Edit, Delete, Assign to Projects

---

## 🚧 SHOULD BE IMPLEMENTED (Missing Master Tables)

### High Priority

#### 13. **Departments** (`departments`)
- **Suggested Route**: `/master-data` → Departments Tab
- **Fields**:
  - Department Name
  - Department Code
  - Head of Department
  - Parent Department
  - Description
  - Active Status
- **Use Case**: User categorization, routing rules, reporting
- **Status**: ⚠️ Currently hardcoded or manual entry

#### 14. **Locations/Branches** (`locations`)
- **Suggested Route**: `/master-data` → Locations Tab
- **Fields**:
  - Location Name
  - Location Code
  - Address
  - City
  - State
  - Pincode
  - Contact Number
  - Active Status
- **Use Case**: Ticket routing, offline center mapping
- **Status**: ⚠️ Not implemented

#### 15. **Tags** (`tags`)
- **Suggested Route**: `/master-data` → Tags Tab
- **Fields**:
  - Tag Name
  - Tag Color
  - Category
  - Auto-Apply Rules
  - Active Status
- **Use Case**: Ticket organization, search, filtering
- **Status**: ⚠️ Partial implementation (KB only)

#### 16. **Email Templates** (`emailtemplates`)
- **Suggested Route**: `/integrations` → Email Templates
- **Fields**:
  - Template Name
  - Template Code
  - Subject
  - Body (HTML)
  - Placeholders
  - Trigger Event
  - Active Status
- **Use Case**: Automated notifications, customization
- **Status**: ⚠️ Hardcoded in backend

#### 17. **Ticket Sources** (`ticketsources`)
- **Suggested Route**: `/master-data` → Sources Tab
- **Fields**:
  - Source Name
  - Source Type (Email/Portal/Phone/Chat/Walk-in)
  - Icon
  - Active Status
- **Use Case**: Track ticket origin, reporting
- **Status**: ⚠️ Some sources exist but not fully manageable

#### 18. **Closure Reasons** (`closurereasons`)
- **Suggested Route**: `/master-data` → Closure Reasons Tab
- **Fields**:
  - Reason Name
  - Reason Code
  - Category (Resolved/Duplicate/Invalid/Not Reproducible)
  - Require Comments
  - Active Status
- **Use Case**: Ticket closure analytics, quality control
- **Status**: ⚠️ Not implemented

### Medium Priority

#### 19. **Custom Fields Configuration** (`customfields`)
- **Suggested Route**: `/ticket-config` → Custom Fields
- **Fields**:
  - Field Name
  - Field Type (Text/Number/Date/Dropdown/Multi-select)
  - Default Value
  - Validation Rules
  - Required
  - Display Order
  - Project Specific
  - Active Status
- **Use Case**: Project-specific ticket fields
- **Status**: ⚠️ Not implemented

#### 20. **Business Hours** (`businesshours`)
- **Suggested Route**: `/master-data` → Business Hours
- **Fields**:
  - Day of Week
  - Start Time
  - End Time
  - Is Working Day
  - Holidays (Array)
- **Use Case**: SLA calculation, escalation timing
- **Status**: ⚠️ Hardcoded or default

#### 21. **Holidays** (`holidays`)
- **Suggested Route**: `/master-data` → Holidays
- **Fields**:
  - Holiday Name
  - Date
  - Type (National/Regional/Optional)
  - Location
  - Year
- **Use Case**: SLA calculation exclusions
- **Status**: ⚠️ Not implemented

#### 22. **Auto-Assignment Rules** (`autoassignmentrules`)
- **Suggested Route**: `/ticket-config` → Auto-Assignment
- **Fields**:
  - Rule Name
  - Conditions (Category/Priority/Project)
  - Assignment Type (Round Robin/Load Based/Skill Based)
  - Assign To (Users/Roles)
  - Active Status
- **Use Case**: Automatic ticket distribution
- **Status**: ⚠️ Basic implementation exists

#### 23. **Canned Responses** (`cannedresponses`)
- **Suggested Route**: `/knowledge-base` → Canned Responses
- **Fields**:
  - Response Title
  - Response Text
  - Category
  - Shortcuts/Keywords
  - Usage Count
  - Active Status
- **Use Case**: Quick agent replies
- **Status**: ⚠️ Not implemented

### Low Priority

#### 24. **Satisfaction Survey Questions** (`surveyquestions`)
- **Suggested Route**: `/ticket-config` → CSAT Survey
- **Fields**:
  - Question Text
  - Question Type (Rating/Multiple Choice/Text)
  - Options
  - Required
  - Display Order
  - Active Status
- **Use Case**: Customer feedback collection
- **Status**: ⚠️ Not implemented

#### 25. **Integration Credentials** (`integrations`)
- **Suggested Route**: `/integrations`
- **Fields**:
  - Integration Name
  - Integration Type (Email/SMS/HRMS/ERP)
  - API Credentials
  - Configuration JSON
  - Active Status
- **Use Case**: Third-party integrations
- **Status**: ⚠️ Not implemented (some hardcoded)

#### 26. **Report Templates** (`reporttemplates`)
- **Suggested Route**: `/reports` → Custom Reports
- **Fields**:
  - Template Name
  - Report Type
  - Columns
  - Filters
  - Group By
  - Chart Type
  - Schedule
  - Active Status
- **Use Case**: Custom reporting
- **Status**: ⚠️ Not implemented

#### 27. **Notification Rules** (`notificationrules`)
- **Suggested Route**: `/integrations` → Notifications
- **Fields**:
  - Rule Name
  - Trigger Event
  - Notification Channel (Email/SMS/In-App)
  - Recipients (Users/Roles)
  - Template
  - Active Status
- **Use Case**: Customizable notifications
- **Status**: ⚠️ Hardcoded

#### 28. **Blocked Email Recipients** (`blockedemails`)
- **Suggested Route**: `/audit/blocked-email-recipients`
- **Fields**:
  - Email Address
  - Reason
  - Blocked By
  - Blocked Date
  - Active Status
- **Use Case**: Email security
- **Status**: ⚠️ Commented in App.tsx (TODO)

---

## 📊 MASTER TABLES SUMMARY

### By Implementation Status

| Status | Count | Tables |
|--------|-------|--------|
| ✅ Implemented | 12 | Projects, Roles, Users, Categories, Sub-Categories, Statuses, Priorities, SLA Rules, Escalation Matrix, KB Articles, Approval Workflows, Offline Centers |
| ⚠️ High Priority | 6 | Departments, Locations, Tags, Email Templates, Ticket Sources, Closure Reasons |
| ⚠️ Medium Priority | 5 | Custom Fields, Business Hours, Holidays, Auto-Assignment Rules, Canned Responses |
| ⚠️ Low Priority | 5 | Survey Questions, Integrations, Report Templates, Notification Rules, Blocked Emails |
| **Total** | **28** | - |

### By Category

| Category | Tables | Status |
|----------|--------|--------|
| **Project Management** | Projects | ✅ Complete |
| **Access Control** | Roles, Users | ✅ Complete |
| **Ticket Configuration** | Categories, Sub-Categories, Statuses, Priorities, Sources, Custom Fields, Closure Reasons | 🔶 Partial (5/9) |
| **SLA & Escalation** | SLA Rules, Escalation Matrix, Business Hours, Holidays | 🔶 Partial (2/4) |
| **Knowledge Management** | KB Articles, Tags, Canned Responses | 🔶 Partial (1/3) |
| **Workflows** | Approval Workflows, Auto-Assignment Rules | 🔶 Partial (1/2) |
| **Offline Module** | Offline Centers, Locations | 🔶 Partial (1/2) |
| **Integrations** | Email Templates, Integration Credentials, Notification Rules | ❌ Not Implemented (0/3) |
| **Organization** | Departments, Locations | ❌ Not Implemented (0/2) |
| **Reporting** | Report Templates | ❌ Not Implemented (0/1) |
| **Audit** | Blocked Emails | ❌ Not Implemented (0/1) |
| **Feedback** | Survey Questions | ❌ Not Implemented (0/1) |

---

## 🎯 RECOMMENDED IMPLEMENTATION ROADMAP

### Phase 1: Core Master Data (Immediate - Sprint 1-2)
1. Departments
2. Locations/Branches
3. Tags
4. Ticket Sources
5. Closure Reasons

### Phase 2: Configuration & Rules (Sprint 3-4)
1. Email Templates
2. Custom Fields Configuration
3. Business Hours
4. Holidays
5. Auto-Assignment Rules

### Phase 3: Enhanced Features (Sprint 5-6)
1. Canned Responses
2. Notification Rules
3. Integration Credentials
4. Survey Questions

### Phase 4: Advanced Features (Sprint 7-8)
1. Report Templates
2. Blocked Email Recipients
3. Advanced Workflow Rules

---

## 🗄️ DATABASE SCHEMA NOTES

### Standard Fields for All Master Tables
Every master table should include:
```typescript
{
  _id: ObjectId,
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId, // Reference to User
  updatedBy: ObjectId, // Reference to User
  isActive: Boolean,
  isDeleted: Boolean, // Soft delete
}
```

### Multi-tenancy Support
Tables that need project-specific data:
```typescript
{
  projectId: ObjectId, // or projects: [ObjectId] for shared data
}
```

### Audit Trail
For sensitive master data:
```typescript
{
  auditLog: [{
    action: String, // 'create'|'update'|'delete'
    changedBy: ObjectId,
    changedAt: Date,
    changes: Object, // Field-level changes
  }]
}
```

---

## 🔗 RELATIONSHIPS

### Key Relationships Between Master Tables

```
Projects
  ├── Users (many-to-many)
  ├── Roles (many-to-many)
  ├── Categories
  ├── SLA Rules
  ├── Escalation Matrix
  ├── Approval Workflows
  ├── Offline Centers
  └── Custom Fields

Users
  ├── Roles (many-to-many)
  ├── Projects (many-to-many)
  ├── Department (many-to-one)
  └── Location (many-to-one)

Tickets
  ├── Project (many-to-one)
  ├── Category (many-to-one)
  ├── Sub-Category (many-to-one)
  ├── Status (many-to-one)
  ├── Priority (many-to-one)
  ├── Assigned To (many-to-one → User)
  ├── Tags (many-to-many)
  ├── Source (many-to-one)
  └── Closure Reason (many-to-one)
```

---

## 📝 NOTES

1. **Soft Delete**: All master tables should support soft delete (isDeleted flag) to maintain referential integrity
2. **Audit Trail**: Track who created/modified records for accountability
3. **Active Status**: Allow disabling records without deletion
4. **Search & Filter**: All listing pages should support search and filtering
5. **Export**: Provide CSV/Excel export for all master data
6. **Import**: Bulk import capability for initial setup
7. **Validation**: Backend validation for all master data operations
8. **Permissions**: Role-based access control for each master table

---

**Last Updated**: November 19, 2025  
**Status**: Living Document - Update as new requirements emerge
