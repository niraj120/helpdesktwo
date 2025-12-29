# SAC Helpdesk Portal - Complete Feature List by Permission

**Version:** 2.0  
**Last Updated:** December 23, 2025  
**Status:** Comprehensive Master Reference  

---

## Table of Contents

1. [Dashboard Features](#1-dashboard-features)
2. [Project Management Features](#2-project-management-features)
3. [Master Data Features](#3-master-data-features)
4. [RBAC Setup Features](#4-rbac-setup-features)
5. [User Management Features](#5-user-management-features)
6. [Ticket Management Features](#6-ticket-management-features)
7. [Ticket Configuration Features](#7-ticket-configuration-features)
8. [Knowledge Base Features](#8-knowledge-base-features)
9. [FAQ Features](#9-faq-features)
10. [Offline Module Features](#10-offline-module-features)
11. [Student Features](#11-student-features)
12. [Fields & Forms Features](#12-fields--forms-features)
13. [Ticket Automation Features](#13-ticket-automation-features)
14. [Approval Process Features](#14-approval-process-features)
15. [SLA & Escalation Features](#15-sla--escalation-features)
16. [Email Configuration Features](#16-email-configuration-features)
17. [Feedback Features](#17-feedback-features)
18. [Integration Features](#18-integration-features)
19. [Reports & Analytics Features](#19-reports--analytics-features)
20. [Audit & Logging Features](#20-audit--logging-features)
21. [Asset Management Features](#21-asset-management-features)
22. [Authentication Features](#22-authentication-features)

---

## 1. Dashboard Features

### **Permission:** `DASHBOARD_VIEW`
#### Features:
- ✅ Access dashboard homepage
- ✅ View system overview statistics
- ✅ View ticket summary cards (Total, Open, In Progress, Resolved, Closed)
- ✅ View recent activity feed
- ✅ Quick navigation menu
- ✅ Welcome message with user info
- ✅ Role-based module visibility

### **Permission:** `DASHBOARD_VIEW_ANALYTICS`
#### Features:
- ✅ View ticket trend charts
- ✅ View agent performance metrics
- ✅ View category-wise ticket distribution
- ✅ View priority-wise ticket breakdown
- ✅ View SLA compliance metrics
- ✅ View response time analytics
- ✅ View resolution time analytics
- ✅ Real-time statistics updates

### **Permission:** `DASHBOARD_EXPORT`
#### Features:
- ✅ Export dashboard data to CSV
- ✅ Export dashboard data to Excel
- ✅ Export dashboard data to PDF
- ✅ Schedule automated dashboard exports
- ✅ Email dashboard reports

---

## 2. Project Management Features

### **Permission:** `PROJECT_VIEW_ALL`
#### Features:
- ✅ View all projects list
- ✅ View project details (name, code, URL, status)
- ✅ View project branding (logo, colors)
- ✅ View project statistics (tickets, users, categories)
- ✅ Search projects by name/code
- ✅ Filter projects by status (Active/Inactive)
- ✅ View project creation date
- ✅ View project custom URL path

### **Permission:** `PROJECT_CREATE`
#### Features:
- ✅ Create new project/portal
- ✅ Set project name and code
- ✅ Configure custom URL path (e.g., /sac/portal)
- ✅ Upload project logo
- ✅ Set default status (Active/Inactive)
- ✅ Add project description
- ✅ Configure ticket submission mode (Online/Offline/Both)

### **Permission:** `PROJECT_EDIT`
#### Features:
- ✅ Edit project name and description
- ✅ Update project code
- ✅ Change project logo
- ✅ Update custom URL path
- ✅ Modify ticket submission mode
- ✅ Update project settings

### **Permission:** `PROJECT_DELETE`
#### Features:
- ✅ Delete projects
- ✅ Confirmation dialog before deletion
- ✅ Cascade deletion warning (tickets, users, categories)
- ✅ Archive projects instead of hard delete (optional)

### **Permission:** `PROJECT_TOGGLE_STATUS`
#### Features:
- ✅ Activate projects
- ✅ Deactivate projects
- ✅ Bulk activate/deactivate projects
- ✅ Status change confirmation

### **Permission:** `PROJECT_MANAGE_SETTINGS`
#### Features:
- ✅ Configure project ticket settings
- ✅ Enable/disable ticket features
- ✅ Configure offline module settings
- ✅ Set registration form fields
- ✅ Configure notification preferences
- ✅ Manage email triggers
- ✅ Set business hours
- ✅ Configure auto-assignment rules

### **Permission:** `PROJECT_MANAGE_BRANDING`
#### Features:
- ✅ Upload/change project logo
- ✅ Set primary brand color
- ✅ Set secondary brand color
- ✅ Set accent color
- ✅ Set background color
- ✅ Live preview of branding changes
- ✅ Reset to default branding

### **Permission:** `PROJECT_MANAGE_URL`
#### Features:
- ✅ Configure custom URL path
- ✅ URL availability check
- ✅ URL format validation
- ✅ Update URL redirects
- ✅ Manage domain mapping

### **Permission:** `PROJECT_ASSIGN_USERS`
#### Features:
- ✅ Assign users to projects
- ✅ Bulk user assignment
- ✅ Remove users from projects
- ✅ View assigned users list
- ✅ Search and filter assignable users
- ✅ Set user roles within project

---

## 3. Master Data Features

### **Permission:** `MASTER_DATA_VIEW`
#### Features:
- ✅ View all master data categories
- ✅ View countries list
- ✅ View states list
- ✅ View cities list
- ✅ View departments list
- ✅ View ticket categories
- ✅ View ticket priorities
- ✅ View ticket statuses
- ✅ Search master data
- ✅ Filter by category

### **Permission:** `MASTER_DATA_MANAGE`
#### Features:
- ✅ Full CRUD access to all master data
- ✅ Create new master data entries
- ✅ Edit existing entries
- ✅ Delete entries
- ✅ Bulk import master data
- ✅ Bulk export master data

### **Permission:** `MASTER_DATA_CREATE`
#### Features:
- ✅ Create new master data entries
- ✅ Add custom fields to master data
- ✅ Set active/inactive status
- ✅ Define display order

### **Permission:** `MASTER_DATA_EDIT`
#### Features:
- ✅ Edit master data entries
- ✅ Update field values
- ✅ Change status (Active/Inactive)
- ✅ Modify display order
- ✅ Add/remove relationships

### **Permission:** `MASTER_DATA_DELETE`
#### Features:
- ✅ Delete master data entries
- ✅ Soft delete (archive)
- ✅ Hard delete (permanent)
- ✅ Dependency check before deletion
- ✅ Bulk delete

### **Permission:** `MASTER_DATA_MANAGE_CATEGORIES`
#### Features:
- ✅ Create ticket categories
- ✅ Edit ticket categories
- ✅ Delete ticket categories
- ✅ Create subcategories
- ✅ Set category hierarchy
- ✅ Assign categories to projects
- ✅ Set category colors/icons
- ✅ Reorder categories
- ✅ Category-subcategory mapping

### **Permission:** `MASTER_DATA_MANAGE_PRIORITIES`
#### Features:
- ✅ Create priority levels (Low, Medium, High, Critical)
- ✅ Edit priority definitions
- ✅ Delete priorities
- ✅ Set priority colors
- ✅ Define SLA for each priority
- ✅ Set default priority
- ✅ Reorder priority display

### **Permission:** `MASTER_DATA_MANAGE_STATUSES`
#### Features:
- ✅ Create ticket statuses (Open, In Progress, Resolved, Closed)
- ✅ Edit status definitions
- ✅ Delete statuses
- ✅ Set status colors
- ✅ Define status types (Open, In-Progress, Resolved, Closed)
- ✅ Set default status
- ✅ Configure status transitions
- ✅ Reorder status display

### **Permission:** `MASTER_DATA_MANAGE_COUNTRIES`
#### Features:
- ✅ Add new countries
- ✅ Edit country details (name, code, phone prefix)
- ✅ Delete countries
- ✅ Set active/inactive status
- ✅ Import countries from CSV

### **Permission:** `MASTER_DATA_MANAGE_STATES`
#### Features:
- ✅ Add new states/provinces
- ✅ Edit state details
- ✅ Assign states to countries
- ✅ Delete states
- ✅ Set active/inactive status
- ✅ Import states from CSV

### **Permission:** `MASTER_DATA_MANAGE_CITIES`
#### Features:
- ✅ Add new cities
- ✅ Edit city details
- ✅ Assign cities to states
- ✅ Delete cities
- ✅ Set active/inactive status
- ✅ Import cities from CSV
- ✅ Cascading dropdowns (Country → State → City)

### **Permission:** `MASTER_DATA_MANAGE_DEPARTMENTS`
#### Features:
- ✅ Create departments
- ✅ Edit department details
- ✅ Delete departments
- ✅ Assign departments to projects
- ✅ Set department hierarchy

### **Permission:** `MASTER_DATA_MANAGE_LOCATIONS`
#### Features:
- ✅ Manage office locations
- ✅ Add new locations
- ✅ Edit location details (address, coordinates)
- ✅ Delete locations
- ✅ Map locations to projects

---

## 4. RBAC Setup Features

### **Permission:** `RBAC_VIEW_ROLES`
#### Features:
- ✅ View all roles list
- ✅ View role details (name, code, description)
- ✅ View assigned permissions per role
- ✅ View user count per role
- ✅ Filter roles by type (System, Custom)
- ✅ Search roles by name/code
- ✅ View master roles list

### **Permission:** `RBAC_CREATE_ROLE`
#### Features:
- ✅ Create new custom roles
- ✅ Set role name and code
- ✅ Add role description
- ✅ Select role type (Super Admin, Manager, Agent, Student, Custom)
- ✅ Assign permissions to role
- ✅ Set project-specific roles
- ✅ Clone roles from master templates
- ✅ Copy permissions from existing role

### **Permission:** `RBAC_EDIT_ROLE`
#### Features:
- ✅ Edit role details
- ✅ Update role name and description
- ✅ Add/remove permissions
- ✅ Change role type
- ✅ Update project assignments
- ✅ Modify role status

### **Permission:** `RBAC_DELETE_ROLE`
#### Features:
- ✅ Delete custom roles
- ✅ Prevent deletion of system roles (Super Admin, Student)
- ✅ User reassignment before deletion
- ✅ Confirmation dialog
- ✅ Cascade check (users with this role)

### **Permission:** `RBAC_ASSIGN_PERMISSIONS`
#### Features:
- ✅ Assign permissions to roles
- ✅ Bulk permission assignment
- ✅ Remove permissions from roles
- ✅ View permissions by category
- ✅ Search permissions
- ✅ Filter permissions by module
- ✅ Permission dependency validation

### **Permission:** `RBAC_VIEW_PERMISSIONS`
#### Features:
- ✅ View all permissions list
- ✅ View permissions grouped by category
- ✅ View permission details (name, code, description, module)
- ✅ Search permissions
- ✅ Filter by category
- ✅ View roles assigned to each permission

---

## 5. User Management Features

### **Permission:** `USER_VIEW_ALL`
#### Features:
- ✅ View all users list (staff + students)
- ✅ View user details (name, email, phone, role, projects)
- ✅ View employee code, HRMS ID
- ✅ View department and designation
- ✅ View joining date
- ✅ View reporting manager
- ✅ Search users by name/email/employee code
- ✅ Filter by role
- ✅ Filter by status (Active/Inactive)
- ✅ Filter by project
- ✅ View user creation date

### **Permission:** `USER_CREATE`
#### Features:
- ✅ Create new staff user manually
- ✅ Set first name and last name
- ✅ Set email (unique)
- ✅ Set password
- ✅ Set mobile number
- ✅ Set employee code
- ✅ Assign role
- ✅ Assign to projects
- ✅ Set department
- ✅ Set designation
- ✅ Set joining date
- ✅ Assign reporting manager
- ✅ Set HRMS ID
- ✅ Set active/inactive status
- ✅ Email welcome notification

### **Permission:** `USER_EDIT`
#### Features:
- ✅ Edit user details
- ✅ Update name, email, phone
- ✅ Change role
- ✅ Update project assignments
- ✅ Modify department/designation
- ✅ Change reporting manager
- ✅ Update employee code
- ✅ Update HRMS ID
- ✅ Update joining date

### **Permission:** `USER_DELETE`
#### Features:
- ✅ Delete user accounts
- ✅ Soft delete (deactivate)
- ✅ Hard delete (permanent)
- ✅ Reassign tickets before deletion
- ✅ Confirmation dialog
- ✅ Bulk delete users

### **Permission:** `USER_TOGGLE_STATUS`
#### Features:
- ✅ Activate users
- ✅ Deactivate users
- ✅ Suspend users temporarily
- ✅ Bulk status toggle
- ✅ Status change notification

### **Permission:** `USER_ASSIGN_ROLE`
#### Features:
- ✅ Assign role to user
- ✅ Change user role
- ✅ Multiple role assignment
- ✅ Role change audit log
- ✅ Permission refresh after role change

### **Permission:** `USER_RESET_PASSWORD`
#### Features:
- ✅ Reset user password
- ✅ Generate temporary password
- ✅ Send reset password email
- ✅ Force password change on next login
- ✅ Bulk password reset

### **Permission:** `USER_IMPORT`
#### Features:
- ✅ Bulk import users from CSV/Excel
- ✅ HRMS integration - fetch users from PeopleStrong API
- ✅ HRMS search by name/email/employee code
- ✅ Bulk import from HRMS (select multiple employees)
- ✅ Validate import data
- ✅ Preview before import
- ✅ Import error reporting
- ✅ Duplicate detection
- ✅ Auto-assign roles during import

---

## 6. Ticket Management Features

### **Permission:** `TICKET_VIEW_ALL`
#### Features:
- ✅ View all tickets across all projects
- ✅ View ticket details (ID, subject, description, status, priority, category)
- ✅ View ticket timeline
- ✅ View student information
- ✅ View assigned agent
- ✅ View ticket comments/responses
- ✅ View ticket attachments
- ✅ View SLA status
- ✅ View custom fields
- ✅ Search tickets by ID/subject/student
- ✅ Filter by status
- ✅ Filter by priority
- ✅ Filter by category
- ✅ Filter by assigned agent
- ✅ Filter by date range
- ✅ Filter by project

### **Permission:** `TICKET_VIEW_OWN`
#### Features:
- ✅ View only tickets assigned to self
- ✅ View ticket details
- ✅ View ticket timeline
- ✅ Search own tickets
- ✅ Filter own tickets

### **Permission:** `TICKET_CREATE`
#### Features:
- ✅ Create new tickets
- ✅ Set ticket subject and description
- ✅ Select project
- ✅ Select category and subcategory
- ✅ Set priority
- ✅ Add student information (name, email, phone, unique ID)
- ✅ Upload attachments (images, documents, PDFs)
- ✅ Set custom fields
- ✅ Add tags
- ✅ Set source (Online, Offline, Email, Phone)
- ✅ Auto-generate unique ticket ID
- ✅ Email notification to student

### **Permission:** `TICKET_EDIT`
#### Features:
- ✅ Edit ticket details
- ✅ Update subject and description
- ✅ Change category/subcategory
- ✅ Update priority
- ✅ Modify student information
- ✅ Update custom fields
- ✅ Add/remove tags
- ✅ Edit ticket metadata
- ✅ Version history tracking

### **Permission:** `TICKET_DELETE`
#### Features:
- ✅ Delete tickets
- ✅ Soft delete (archive)
- ✅ Hard delete (permanent)
- ✅ Bulk delete tickets
- ✅ Delete confirmation
- ✅ Audit log entry

### **Permission:** `TICKET_ASSIGN`
#### Features:
- ✅ Assign tickets to agents
- ✅ Reassign tickets
- ✅ Bulk ticket assignment
- ✅ Auto-assignment based on rules
- ✅ Assignment notification
- ✅ View assignable agents list
- ✅ Filter agents by project/role
- ✅ Assignment history

### **Permission:** `TICKET_CHANGE_STATUS`
#### Features:
- ✅ Change ticket status (Open → In Progress → Resolved → Closed)
- ✅ Add status change comment
- ✅ Status change notification
- ✅ Status transition validation
- ✅ Bulk status update
- ✅ Status change history

### **Permission:** `TICKET_CHANGE_PRIORITY`
#### Features:
- ✅ Change ticket priority (Low, Medium, High, Critical)
- ✅ Add priority change reason
- ✅ Priority change notification
- ✅ Bulk priority update
- ✅ Priority escalation rules

### **Permission:** `TICKET_ADD_COMMENT`
#### Features:
- ✅ Add public comments (visible to student)
- ✅ Add internal notes (staff only)
- ✅ Rich text formatting
- ✅ Attach files to comments
- ✅ Mention users (@username)
- ✅ Comment notification
- ✅ Comment timestamps

### **Permission:** `TICKET_EDIT_COMMENT`
#### Features:
- ✅ Edit own comments
- ✅ Edit others' comments (admin)
- ✅ Edit history tracking
- ✅ Edit timestamp shown

### **Permission:** `TICKET_DELETE_COMMENT`
#### Features:
- ✅ Delete own comments
- ✅ Delete others' comments (admin)
- ✅ Delete confirmation
- ✅ Audit log entry

### **Permission:** `TICKET_ADD_ATTACHMENT`
#### Features:
- ✅ Upload files to tickets
- ✅ Support multiple file formats (images, PDF, Word, Excel)
- ✅ File size validation (max 10MB)
- ✅ Multiple file upload
- ✅ Attachment preview
- ✅ Download attachments

### **Permission:** `TICKET_DELETE_ATTACHMENT`
#### Features:
- ✅ Delete ticket attachments
- ✅ Delete confirmation
- ✅ Permanent file removal

### **Permission:** `TICKET_MERGE`
#### Features:
- ✅ Merge duplicate tickets
- ✅ Select primary ticket
- ✅ Combine comments from merged tickets
- ✅ Merge attachments
- ✅ Merge history tracking
- ✅ Notification to students

### **Permission:** `TICKET_BULK_UPDATE`
#### Features:
- ✅ Bulk assign tickets
- ✅ Bulk status change
- ✅ Bulk priority change
- ✅ Bulk category change
- ✅ Bulk tag addition
- ✅ Select by filters or tags
- ✅ Preview before bulk update
- ✅ Bulk update confirmation

### **Permission:** `TICKET_EXPORT`
#### Features:
- ✅ Export tickets to CSV
- ✅ Export tickets to Excel
- ✅ Export filtered tickets
- ✅ Export selected columns
- ✅ Export with attachments (ZIP)
- ✅ Scheduled exports

### **Permission:** `View Own Tickets` (Legacy)
#### Features:
- ✅ Same as TICKET_VIEW_OWN (backward compatibility)

### **Permission:** `Change Ticket Status` (Legacy)
#### Features:
- ✅ Same as TICKET_CHANGE_STATUS (backward compatibility)

---

## 7. Ticket Configuration Features

### **Permission:** `TICKET_CONFIG_VIEW`
#### Features:
- ✅ View ticket configuration settings
- ✅ View categories configuration
- ✅ View statuses configuration
- ✅ View priorities configuration
- ✅ View ticket types configuration
- ✅ View form templates

### **Permission:** `TICKET_CONFIG_MANAGE_CATEGORIES`
#### Features:
- ✅ Same as MASTER_DATA_MANAGE_CATEGORIES
- ✅ Alternative permission for category management

### **Permission:** `TICKET_CONFIG_MANAGE_STATUSES`
#### Features:
- ✅ Same as MASTER_DATA_MANAGE_STATUSES
- ✅ Alternative permission for status management
- ✅ Reorder statuses

### **Permission:** `TICKET_CONFIG_MANAGE_PRIORITIES`
#### Features:
- ✅ Same as MASTER_DATA_MANAGE_PRIORITIES
- ✅ Alternative permission for priority management

### **Permission:** `TICKET_CONFIG_MANAGE_TYPES`
#### Features:
- ✅ Create ticket types (Incident, Service Request, Problem, Change)
- ✅ Edit ticket types
- ✅ Delete ticket types
- ✅ Assign types to projects

### **Permission:** `TICKET_CONFIG_MANAGE_TEMPLATES`
#### Features:
- ✅ Create ticket templates
- ✅ Edit templates
- ✅ Delete templates
- ✅ Set default templates
- ✅ Template variables
- ✅ Apply template to tickets

---

## 8. Knowledge Base Features

### **Permission:** `KB_VIEW`
#### Features:
- ✅ View knowledge base articles
- ✅ Search articles by keywords
- ✅ Filter by category
- ✅ Filter by tags
- ✅ View article content (rich text)
- ✅ View related articles
- ✅ View article attachments
- ✅ Public access (no authentication required)
- ✅ Project-specific KB articles

### **Permission:** `KB_CREATE`
#### Features:
- ✅ Create new KB articles
- ✅ Set article title
- ✅ Write article content (rich text editor)
- ✅ Add article summary/excerpt
- ✅ Select category and subcategory
- ✅ Add tags
- ✅ Upload attachments/images
- ✅ Set article status (Draft, Published)
- ✅ Set project association
- ✅ SEO meta tags
- ✅ Assign author

### **Permission:** `KB_EDIT`
#### Features:
- ✅ Edit article content
- ✅ Update title and summary
- ✅ Change category/tags
- ✅ Add/remove attachments
- ✅ Version control (track changes)
- ✅ Update publication status

### **Permission:** `KB_DELETE`
#### Features:
- ✅ Delete KB articles
- ✅ Soft delete (unpublish)
- ✅ Hard delete (permanent)
- ✅ Delete confirmation
- ✅ Bulk delete

### **Permission:** `KB_PUBLISH`
#### Features:
- ✅ Publish draft articles
- ✅ Set publish date
- ✅ Schedule publishing
- ✅ Publish notification

### **Permission:** `KB_UNPUBLISH`
#### Features:
- ✅ Unpublish live articles
- ✅ Convert to draft
- ✅ Unpublish reason comment

### **Permission:** `KB_MANAGE_CATEGORIES`
#### Features:
- ✅ Create KB categories
- ✅ Edit KB categories
- ✅ Delete KB categories
- ✅ Create subcategories
- ✅ Category hierarchy
- ✅ Reorder categories
- ✅ Assign categories to projects

### **Permission:** `KB_APPROVE`
#### Features:
- ✅ Approve articles for publication
- ✅ Review article content
- ✅ Request changes
- ✅ Reject articles
- ✅ Approval workflow

### **Permission:** `KB_EXPORT`
#### Features:
- ✅ Export articles to PDF
- ✅ Export to Word
- ✅ Export entire KB
- ✅ Bulk export

---

## 9. FAQ Features

### **Permission:** `FAQ_VIEW`
#### Features:
- ✅ View FAQ list
- ✅ View FAQ details (question & answer)
- ✅ Search FAQs
- ✅ Filter by category
- ✅ View FAQ statistics (views, helpful votes)
- ✅ Public access

### **Permission:** `FAQ_CREATE`
#### Features:
- ✅ Create new FAQs
- ✅ Set question and answer
- ✅ Select FAQ category
- ✅ Add tags
- ✅ Set project association
- ✅ Set display order
- ✅ Rich text formatting

### **Permission:** `FAQ_EDIT`
#### Features:
- ✅ Edit FAQ question
- ✅ Edit FAQ answer
- ✅ Update category
- ✅ Modify tags
- ✅ Change display order
- ✅ Update status

### **Permission:** `FAQ_DELETE`
#### Features:
- ✅ Delete FAQs
- ✅ Delete confirmation
- ✅ Bulk delete

### **Permission:** `FAQ_MANAGE`
#### Features:
- ✅ Manage FAQ categories
- ✅ Create FAQ categories
- ✅ Edit FAQ categories
- ✅ Delete FAQ categories
- ✅ Reorder FAQs
- ✅ FAQ settings

---

## 10. Offline Module Features

### **Permission:** `OFFLINE_MODULE_ACCESS`
#### Features:
- ✅ Access offline module/student workflow section
- ✅ View offline dashboard
- ✅ Search students
- ✅ Access offline center settings
- ✅ View walk-in statistics
- ✅ Access country/state/city dropdowns

### **Permission:** `OFFLINE_STUDENT_REGISTER`
#### Features:
- ✅ Register students on their behalf (walk-in)
- ✅ Enter student name
- ✅ Enter student email
- ✅ Enter student phone
- ✅ Enter student unique ID (enrollment number, admission number)
- ✅ Select offline center
- ✅ Select project
- ✅ Generate student credentials
- ✅ Print registration confirmation
- ✅ Email credentials to student

### **Permission:** `OFFLINE_TICKET_CREATE`
#### Features:
- ✅ Create tickets on behalf of students
- ✅ Search for existing student
- ✅ Quick student registration during ticket creation
- ✅ Select category and priority
- ✅ Add ticket description
- ✅ Upload attachments
- ✅ Set source as "Offline"
- ✅ Mark as walk-in ticket
- ✅ Print ticket receipt

### **Permission:** `OFFLINE_TICKET_RESOLVE`
#### Features:
- ✅ Mark offline tickets as resolved immediately
- ✅ Add resolution notes
- ✅ Skip resolution workflow
- ✅ Print resolution confirmation

### **Permission:** `OFFLINE_TICKET_ESCALATE`
#### Features:
- ✅ Escalate offline tickets during creation
- ✅ Assign to senior staff
- ✅ Set escalation reason
- ✅ Escalation notification

### **Permission:** `OFFLINE_STUDENT_VIEW`
#### Features:
- ✅ View registered student records
- ✅ Search students by name/email/phone/unique ID
- ✅ View student details
- ✅ View student ticket history
- ✅ View offline center association

### **Permission:** `OFFLINE_STUDENT_EDIT`
#### Features:
- ✅ Edit student information
- ✅ Update name, email, phone
- ✅ Change offline center
- ✅ Update unique ID
- ✅ Reset student password

---

## 11. Student Features

### **Permission:** `TICKET_VIEW_OWN` (Student Context)
#### Features:
- ✅ Student portal access
- ✅ View own tickets list
- ✅ View ticket details
- ✅ View ticket status
- ✅ View ticket timeline
- ✅ View agent responses
- ✅ Track ticket progress

### **Permission:** `TICKET_CREATE` (Student Context)
#### Features:
- ✅ Submit new support tickets online
- ✅ Fill ticket form (subject, description, category)
- ✅ Upload attachments
- ✅ Receive ticket confirmation email
- ✅ Get unique ticket ID

### **Permission:** `TICKET_ADD_COMMENT` (Student Context)
#### Features:
- ✅ Reply to agent responses
- ✅ Add follow-up comments
- ✅ Upload additional attachments in comments

### **Permission:** `TICKET_ADD_ATTACHMENT` (Student Context)
#### Features:
- ✅ Upload files to tickets
- ✅ Add screenshots
- ✅ Attach documents

---

## 12. Fields & Forms Features

### **Permission:** `FIELDS_VIEW_TICKET_FIELDS`
#### Features:
- ✅ View custom ticket field configurations
- ✅ View field types (text, dropdown, checkbox, date, etc.)
- ✅ View field validation rules
- ✅ View field dependencies

### **Permission:** `FIELDS_MANAGE_TICKET_FIELDS`
#### Features:
- ✅ Create custom ticket fields
- ✅ Edit ticket fields
- ✅ Delete ticket fields
- ✅ Set field types
- ✅ Configure field options (for dropdowns)
- ✅ Set validation rules
- ✅ Set required/optional
- ✅ Reorder fields

### **Permission:** `FIELDS_MANAGE_TICKET_FORMS`
#### Features:
- ✅ Customize ticket submission forms
- ✅ Add/remove fields from forms
- ✅ Set form layout
- ✅ Configure conditional fields
- ✅ Create form templates
- ✅ Project-specific forms

### **Permission:** `FIELDS_MANAGE_ACTIVITY_FIELDS`
#### Features:
- ✅ Create custom activity fields
- ✅ Configure activity tracking
- ✅ Set field types for activities

### **Permission:** `FIELDS_MANAGE_USER_FIELDS`
#### Features:
- ✅ Create custom user profile fields
- ✅ Configure employee information fields
- ✅ Set field visibility

### **Permission:** `FIELDS_MANAGE_CONTACT_FIELDS`
#### Features:
- ✅ Create custom contact fields
- ✅ Configure student information fields
- ✅ Set contact field types

### **Permission:** `FIELDS_MANAGE_DEPENDENCIES`
#### Features:
- ✅ Configure field dependencies
- ✅ Set conditional logic (if X then show Y)
- ✅ Create field validation chains
- ✅ Dependency rules

### **Permission:** `FORM_VIEW`
#### Features:
- ✅ View all forms list
- ✅ View form structure
- ✅ View form versions
- ✅ View form assignment

### **Permission:** `FORM_CREATE`
#### Features:
- ✅ Create new forms
- ✅ Form builder interface
- ✅ Drag-and-drop field arrangement
- ✅ Set form name and description

### **Permission:** `FORM_EDIT`
#### Features:
- ✅ Edit form structure
- ✅ Add/remove fields
- ✅ Update field properties
- ✅ Create new form versions
- ✅ Version comparison

### **Permission:** `FORM_DELETE`
#### Features:
- ✅ Delete forms
- ✅ Delete form versions
- ✅ Archive forms

### **Permission:** `FORM_ASSIGN_CONTEXT`
#### Features:
- ✅ Assign forms to roles
- ✅ Assign forms to projects
- ✅ Assign forms to categories
- ✅ Assign forms to pages
- ✅ Context-based form display

### **Permission:** `FORM_VIEW_AUDIT_LOGS`
#### Features:
- ✅ View form change history
- ✅ View who modified forms
- ✅ View version history
- ✅ Compare versions

---

## 13. Ticket Automation Features

### **Permission:** `AUTOMATION_VIEW`
#### Features:
- ✅ View automation rules list
- ✅ View rule details
- ✅ View rule conditions and actions
- ✅ View rule execution history
- ✅ View automation statistics

### **Permission:** `AUTOMATION_MANAGE_AUTO_ASSIGN`
#### Features:
- ✅ Configure auto-assignment rules
- ✅ Round-robin assignment
- ✅ Load-balanced assignment
- ✅ Skill-based assignment
- ✅ Category-based assignment
- ✅ Priority-based assignment

### **Permission:** `AUTOMATION_MANAGE_CREATE_TRIGGERS`
#### Features:
- ✅ Create triggers for new tickets
- ✅ Auto-assign on creation
- ✅ Auto-set priority based on keywords
- ✅ Auto-categorize tickets
- ✅ Send notifications on creation
- ✅ Apply tags automatically

### **Permission:** `AUTOMATION_MANAGE_UPDATE_TRIGGERS`
#### Features:
- ✅ Create triggers for ticket updates
- ✅ Auto-escalate on status change
- ✅ Send notifications on updates
- ✅ Auto-assign when status changes
- ✅ Update related tickets

### **Permission:** `AUTOMATION_MANAGE_TIME_TRIGGERS`
#### Features:
- ✅ Create time-based automation
- ✅ Auto-close tickets after X days in resolved status
- ✅ Auto-escalate if no response
- ✅ Send reminder emails
- ✅ SLA breach alerts
- ✅ Schedule-based actions

### **Permission:** `AUTOMATION_TOGGLE`
#### Features:
- ✅ Enable automation rules
- ✅ Disable automation rules
- ✅ Pause automation temporarily
- ✅ Bulk enable/disable

---

## 14. Approval Process Features

### **Permission:** `APPROVAL_WORKFLOWS_VIEW`
#### Features:
- ✅ View approval workflow configurations
- ✅ View workflow steps
- ✅ View approval hierarchy
- ✅ View workflow status
- ✅ View approval history

### **Permission:** `APPROVAL_WORKFLOWS_CREATE`
#### Features:
- ✅ Create new approval workflows
- ✅ Define approval steps
- ✅ Set approvers (users/roles)
- ✅ Configure approval conditions
- ✅ Set workflow triggers
- ✅ Multi-level approvals

### **Permission:** `APPROVAL_WORKFLOWS_EDIT`
#### Features:
- ✅ Edit workflow steps
- ✅ Update approvers
- ✅ Modify conditions
- ✅ Change workflow order

### **Permission:** `APPROVAL_WORKFLOWS_DELETE`
#### Features:
- ✅ Delete approval workflows
- ✅ Archive workflows
- ✅ Delete confirmation

### **Permission:** `APPROVAL_TICKETS_APPROVE_REJECT`
#### Features:
- ✅ View approval inbox
- ✅ Approve tickets
- ✅ Reject tickets
- ✅ Request more information
- ✅ Add approval comments
- ✅ Delegate approval
- ✅ Bulk approve/reject

### **Permission:** `APPROVAL_HISTORY_VIEW`
#### Features:
- ✅ View approval history
- ✅ View approval timeline
- ✅ View approver comments
- ✅ View approval decisions
- ✅ Export approval audit trail

---

## 15. SLA & Escalation Features

### **Permission:** `SLA_VIEW`
#### Features:
- ✅ View SLA policies list
- ✅ View SLA details (response time, resolution time)
- ✅ View SLA targets by priority
- ✅ View SLA breach statistics
- ✅ View tickets breaching SLA

### **Permission:** `SLA_CREATE`
#### Features:
- ✅ Create new SLA policies
- ✅ Set SLA name and description
- ✅ Define response time targets (by priority)
- ✅ Define resolution time targets (by priority)
- ✅ Assign SLA to projects
- ✅ Set business hours

### **Permission:** `SLA_EDIT`
#### Features:
- ✅ Edit SLA policies
- ✅ Update time targets
- ✅ Modify business hours
- ✅ Change project assignments

### **Permission:** `SLA_DELETE`
#### Features:
- ✅ Delete SLA policies
- ✅ Archive policies
- ✅ Delete confirmation

### **Permission:** `SLA_MANAGE_ESCALATIONS`
#### Features:
- ✅ Configure escalation rules
- ✅ Set escalation levels (L1, L2, L3)
- ✅ Define escalation triggers
- ✅ Set escalation time intervals
- ✅ Assign escalation recipients
- ✅ Escalation notification templates

### **Permission:** `SLA_MANAGE_BUSINESS_HOURS`
#### Features:
- ✅ Configure business hours (9 AM - 5 PM, etc.)
- ✅ Set working days
- ✅ Add holidays
- ✅ Configure time zones
- ✅ Multiple business hour schedules

---

## 16. Email Configuration Features

### **Permission:** `EMAIL_CONFIG_VIEW`
#### Features:
- ✅ View email configuration
- ✅ View SMTP settings
- ✅ View email triggers
- ✅ View email templates
- ✅ View email logs

### **Permission:** `EMAIL_CONFIG_EDIT`
#### Features:
- ✅ Configure SMTP settings (host, port, username, password)
- ✅ Set sender email address
- ✅ Set sender name
- ✅ Configure TLS/SSL
- ✅ Set email reply-to address

### **Permission:** `EMAIL_CONFIG_TEST`
#### Features:
- ✅ Send test emails
- ✅ Verify SMTP connection
- ✅ Test email delivery
- ✅ View test results

### **Permission:** `EMAIL_TRIGGER_MANAGE`
#### Features:
- ✅ Manage email triggers (ticket created, assigned, resolved, etc.)
- ✅ Enable/disable email triggers
- ✅ Configure email templates
- ✅ Set email recipients
- ✅ Use template variables
- ✅ HTML email templates

### **Permission:** `EMAIL_CONFIG_MANAGE` (Alternative)
#### Features:
- ✅ Full email configuration management
- ✅ All EMAIL_CONFIG_* permissions combined

---

## 17. Feedback Features

### **Permission:** `FEEDBACK_FORM_CREATE`
#### Features:
- ✅ Create feedback forms
- ✅ Add form fields (rating, text, multiple choice)
- ✅ Set form title and description
- ✅ Configure form settings
- ✅ Assign form to projects

### **Permission:** `FEEDBACK_FORM_EDIT`
#### Features:
- ✅ Edit feedback form structure
- ✅ Update form fields
- ✅ Modify form settings
- ✅ Change project assignments

### **Permission:** `FEEDBACK_FORM_DELETE`
#### Features:
- ✅ Delete feedback forms
- ✅ Archive forms
- ✅ Delete confirmation

### **Permission:** `FEEDBACK_VIEW`
#### Features:
- ✅ View feedback responses
- ✅ View response details
- ✅ View ratings and comments
- ✅ Search feedback
- ✅ Filter by date, project, rating
- ✅ View feedback statistics
- ✅ Sentiment analysis

### **Permission:** `FEEDBACK_EXPORT`
#### Features:
- ✅ Export feedback to CSV
- ✅ Export to Excel
- ✅ Export with filters
- ✅ Scheduled exports

---

## 18. Integration Features

### **Permission:** `INTEGRATION_VIEW`
#### Features:
- ✅ View integration configurations
- ✅ View enabled integrations
- ✅ View integration status
- ✅ View connection logs

### **Permission:** `INTEGRATION_MANAGE_EMAIL`
#### Features:
- ✅ Configure email-to-ticket
- ✅ Set email monitoring
- ✅ Configure email parsing rules
- ✅ Set auto-reply templates

### **Permission:** `INTEGRATION_MANAGE_SMS`
#### Features:
- ✅ Configure SMS gateway
- ✅ Set SMS templates
- ✅ Configure SMS notifications
- ✅ SMS credits management

### **Permission:** `INTEGRATION_MANAGE_WEBHOOKS`
#### Features:
- ✅ Create webhooks
- ✅ Configure webhook URLs
- ✅ Set webhook triggers
- ✅ Test webhooks
- ✅ View webhook logs
- ✅ Retry failed webhooks

### **Permission:** `INTEGRATION_MANAGE_API`
#### Features:
- ✅ Generate API tokens
- ✅ Manage API keys
- ✅ Configure API rate limits
- ✅ View API usage statistics
- ✅ API documentation access

### **Permission:** `INTEGRATION_MANAGE_APPS`
#### Features:
- ✅ Connect third-party apps
- ✅ Configure app settings
- ✅ Manage app permissions
- ✅ Disconnect apps

---

## 19. Reports & Analytics Features

### **Permission:** `REPORT_VIEW_TICKETS`
#### Features:
- ✅ View ticket analytics dashboard
- ✅ Ticket volume trends
- ✅ Category-wise distribution
- ✅ Priority-wise breakdown
- ✅ Status-wise statistics
- ✅ Average resolution time
- ✅ First response time metrics
- ✅ Ticket source analysis

### **Permission:** `REPORT_VIEW_AGENT_PERFORMANCE`
#### Features:
- ✅ View agent performance metrics
- ✅ Tickets resolved per agent
- ✅ Average resolution time per agent
- ✅ Agent workload distribution
- ✅ Response time metrics
- ✅ Customer satisfaction scores per agent
- ✅ Agent productivity trends

### **Permission:** `REPORT_VIEW_CSAT`
#### Features:
- ✅ View customer satisfaction scores
- ✅ CSAT trends over time
- ✅ Feedback ratings
- ✅ Sentiment analysis
- ✅ Category-wise satisfaction
- ✅ Agent-wise satisfaction

### **Permission:** `REPORT_VIEW_SLA`
#### Features:
- ✅ View SLA compliance reports
- ✅ SLA breach statistics
- ✅ Response SLA metrics
- ✅ Resolution SLA metrics
- ✅ Priority-wise SLA performance
- ✅ Project-wise SLA statistics

### **Permission:** `REPORT_EXPORT`
#### Features:
- ✅ Export reports to CSV
- ✅ Export to Excel
- ✅ Export to PDF
- ✅ Export with charts
- ✅ Batch export

### **Permission:** `REPORT_CREATE_CUSTOM`
#### Features:
- ✅ Create custom report templates
- ✅ Select metrics and dimensions
- ✅ Configure filters
- ✅ Add charts and visualizations
- ✅ Save report templates
- ✅ Share report templates

### **Permission:** `REPORT_SCHEDULE`
#### Features:
- ✅ Schedule automated reports
- ✅ Set report frequency (daily, weekly, monthly)
- ✅ Configure email recipients
- ✅ Set report format
- ✅ Manage scheduled reports

---

## 20. Audit & Logging Features

### **Permission:** `AUDIT_VIEW_ACTIVITY`
#### Features:
- ✅ View user activity logs
- ✅ View login/logout events
- ✅ View ticket activities (create, update, assign, resolve)
- ✅ View user management activities
- ✅ View configuration changes
- ✅ Search activity logs
- ✅ Filter by user, date, action type
- ✅ View IP addresses
- ✅ View user agents (browser info)

### **Permission:** `AUDIT_VIEW_ACCESS`
#### Features:
- ✅ View access logs
- ✅ View login attempts (success/failed)
- ✅ View session duration
- ✅ View logout events
- ✅ View access statistics
- ✅ Failed login analysis
- ✅ Filter by user, project, date

### **Permission:** `AUDIT_VIEW_BLOCKED_EMAILS`
#### Features:
- ✅ View blocked email recipients list
- ✅ View block reason
- ✅ View block date
- ✅ Search blocked emails

### **Permission:** `AUDIT_MANAGE_BLOCKED_EMAILS`
#### Features:
- ✅ Block email recipients
- ✅ Unblock email recipients
- ✅ Add block reason/notes
- ✅ Bulk block/unblock

### **Permission:** `AUDIT_VIEW_EMAIL_FAILURES`
#### Features:
- ✅ View email delivery failure logs
- ✅ View failure reasons
- ✅ View bounce notifications
- ✅ View SMTP errors
- ✅ Retry failed emails

### **Permission:** `AUDIT_VIEW_INTEGRATION_FAILURES`
#### Features:
- ✅ View integration failure logs
- ✅ View API call failures
- ✅ View connection errors
- ✅ View error details

### **Permission:** `AUDIT_VIEW_WEBHOOK_FAILURES`
#### Features:
- ✅ View webhook failure logs
- ✅ View webhook response codes
- ✅ View webhook payloads
- ✅ Retry failed webhooks

### **Permission:** `AUDIT_VIEW_CHAT_WEBHOOK_FAILURES`
#### Features:
- ✅ View chat webhook failures
- ✅ View chat integration errors

### **Permission:** `AUDIT_EXPORT`
#### Features:
- ✅ Export activity logs
- ✅ Export access logs
- ✅ Export audit trails
- ✅ Compliance reports
- ✅ Scheduled audit exports

---

## 21. Asset Management Features

### **Permission:** `ASSET_VIEW`
#### Features:
- ✅ View master asset list
- ✅ View asset details (category, description, specifications)
- ✅ View asset categories
- ✅ Search assets
- ✅ Filter by category

### **Permission:** `ASSET_CREATE`
#### Features:
- ✅ Create new assets in master list
- ✅ Set asset name
- ✅ Select asset category (AC, Projector, Chairs, Computers, etc.)
- ✅ Add asset description
- ✅ Add specifications
- ✅ Upload asset image
- ✅ Bulk asset creation

### **Permission:** `ASSET_EDIT`
#### Features:
- ✅ Edit asset details
- ✅ Update asset name
- ✅ Change category
- ✅ Modify description
- ✅ Update specifications
- ✅ Change asset image

### **Permission:** `ASSET_DELETE`
#### Features:
- ✅ Delete assets from master list
- ✅ Delete confirmation
- ✅ Check for center mappings before deletion
- ✅ Bulk delete

### **Permission:** `ASSET_MANAGE`
#### Features:
- ✅ Manage asset mappings to centers
- ✅ Update asset counts (total, working, not working)
- ✅ View asset mapping statistics
- ✅ Asset condition tracking
- ✅ Upload asset photos (at center level)
- ✅ Delete asset photos
- ✅ Validation (working + notWorking = total)

### **Permission:** `ASSET_MAP_TO_CENTER`
#### Features:
- ✅ Map assets to offline centers
- ✅ Bulk asset mapping
- ✅ Set quantities per center
- ✅ Update mappings

### **Permission:** `ASSET_UPLOAD_PHOTOS`
#### Features:
- ✅ Upload photos for center-specific assets
- ✅ Multiple photo upload
- ✅ Photo preview
- ✅ Delete photos

### **Permission:** `ASSET_VIEW_STATS`
#### Features:
- ✅ View asset statistics
- ✅ Total assets per center
- ✅ Working vs not-working breakdown
- ✅ Category-wise statistics
- ✅ Asset utilization reports

---

## 22. Authentication Features

### Public Features (No Permission Required):
#### Features:
- ✅ Super Admin login (`/login`)
- ✅ Project portal login (`/:customUrlPath/portal/login`)
- ✅ Student portal login (`/:customUrlPath/student/login`)
- ✅ Forgot password (staff)
- ✅ Forgot password (student)
- ✅ OTP verification (email/mobile)
- ✅ Password reset
- ✅ 2FA verification (if enabled)
- ✅ Student first-time registration
  - Check if email exists
  - Send OTP
  - Verify OTP
  - Set password
  - Complete registration
- ✅ Project branding retrieval (public endpoint)
- ✅ Logout

### Authenticated Features:
#### Features:
- ✅ Get current user details (`/auth/me`)
- ✅ Refresh permissions
- ✅ Session management
- ✅ JWT token validation
- ✅ Password change
- ✅ Profile update

---

## Summary Statistics

### Total Modules: 22
### Total Permissions: 150+
### Total Features: 500+

### Permission Categories:
- **Dashboard:** 3 permissions
- **Project Management:** 9 permissions
- **Master Data:** 13 permissions
- **RBAC Setup:** 6 permissions
- **User Management:** 8 permissions
- **Tickets:** 17 permissions
- **Ticket Configuration:** 6 permissions
- **Knowledge Base:** 9 permissions
- **FAQ:** 5 permissions
- **Offline Module:** 7 permissions
- **Fields & Forms:** 12 permissions
- **Ticket Automation:** 6 permissions
- **Approval Process:** 6 permissions
- **SLA & Escalation:** 6 permissions
- **Email Configuration:** 4 permissions
- **Feedback:** 5 permissions
- **Integrations:** 6 permissions
- **Reports & Analytics:** 7 permissions
- **Audit & Logging:** 9 permissions
- **Asset Management:** 8 permissions

---

## Feature Implementation Status

### ✅ Fully Implemented (Production Ready):
- Dashboard features
- Project management
- Master data management (countries, states, cities, categories, priorities, statuses)
- RBAC system (roles, permissions)
- User management (manual creation, HRMS integration, bulk import)
- Ticket management (CRUD, assignment, status change, comments, attachments)
- Knowledge base (articles, categories)
- FAQ management
- Offline module (student registration, offline ticket creation, centers management)
- Student portal (registration with OTP, ticket submission, view tickets)
- Authentication (staff login, student login, forgot password, OTP verification)
- Activity logs
- Access logs
- Email configuration
- Asset management
- SLA policies
- Feedback forms
- Project branding

### 🔨 Partial Implementation:
- Ticket automation (basic rules implemented)
- Approval workflows (structure ready, UI in progress)
- Custom fields (framework ready, UI pending)
- Form builder (database structure ready)
- Reports (basic statistics available, advanced reports pending)
- Integrations (email ready, webhooks pending)

### 📋 Planned (Not Yet Started):
- SMS integration
- Advanced automation rules (time-based triggers)
- Custom report builder
- Third-party app marketplace
- Chat integration
- Advanced analytics dashboard

---

**Document Prepared By:** Development Team  
**Last Review Date:** December 23, 2025  
**Next Review:** As new features are added
