# Sprint: Online Module Testing - User Stories

**Sprint Duration:** [To be defined]  
**Sprint Goal:** Test and validate all online portal functionality (excluding offline/walk-in features)  
**Date Created:** December 23, 2025

---

## Epic 1: Super Admin - System Setup & Project Creation

### US-1.1: Super Admin Login
**As a** super admin  
**I want to** login to the system  
**So that** I can configure projects and manage the entire helpdesk

**Acceptance Criteria:**
- Super admin can login with email/password
- Full system access is granted
- Dashboard shows system-wide statistics
- Navigation shows all modules
- Session management works correctly

**Test Scenarios:**
- Login with super admin credentials
- Verify full dashboard access
- Check all menu items visible
- Session timeout
- Logout functionality

---

### US-1.2: Create Project
**As a** super admin  
**I want to** create new projects  
**So that** different departments/initiatives can use the helpdesk

**Acceptance Criteria:**
- Create project form includes: Name, Code, Custom URL, Branding
- Custom URL validation (unique, alphanumeric)
- Branding: Logo, Primary Color, Secondary Color, Header Text, Browser Title
- Project appears in project list immediately
- Project portal accessible at custom URL (e.g., /mhcet)
- Default categories are auto-created

**Test Scenarios:**
- Create project with all fields
- Upload logo (PNG/JPG, max 2MB)
- Set custom colors using color picker
- Verify custom URL works (e.g., localhost:3001/mhcet)
- Check branding appears correctly on project portal
- Duplicate custom URL rejected

---

### US-1.3: Configure Project Branding
**As a** super admin  
**I want to** customize project branding  
**So that** each project has its own identity

**Acceptance Criteria:**
- Edit project branding settings
- Upload/change logo
- Customize colors (primary, secondary, accent)
- Set header text (project name displayed)
- Set browser title (tab title)
- Preview branding before saving
- Changes reflect immediately on project portal

**Test Scenarios:**
- Upload new logo
- Change primary color
- Update header text
- Set browser title
- Preview changes
- Verify changes on project portal

---

### US-1.4: Configure Project Categories
**As a** super admin/project admin  
**I want to** configure query categories for the project  
**So that** queries are properly classified

**Acceptance Criteria:**
- Add/Edit/Delete categories
- Category includes: Name, Description, Display Order, Active Status
- Categories appear in student submission form dropdown
- Cannot delete category with existing queries (soft delete only)
- Categories can be reordered via drag-drop or order number
- Inactive categories don't show in forms but remain for historical queries

**Test Scenarios:**
- Add new category (e.g., "Technical Support")
- Edit category name
- Reorder categories (drag-drop)
- Mark category as inactive
- Attempt to delete category with queries (should fail/soft delete)
- Verify categories in student dropdown

---

### US-1.5: Configure Priorities
**As a** super admin  
**I want to** configure priority levels  
**So that** urgent queries are handled first

**Acceptance Criteria:**
- Priority levels: Low, Medium, High, Critical
- Can customize priority names and colors
- Set priority order/weight
- Priorities appear in query forms
- SLA times can be set per priority (optional)
- Default priority can be set
- Cannot delete priority if queries exist with that priority

**Test Scenarios:**
- Add custom priority (e.g., "Urgent")
- Set SLA times (Response: 2 hours, Resolution: 24 hours)
- Change priority colors
- Set default priority to "Medium"
- Reorder priorities

---

### US-1.6: View System Dashboard
**As a** super admin  
**I want to** view system-wide statistics  
**So that** I can monitor overall helpdesk health

**Acceptance Criteria:**
- Dashboard shows: Total projects, Total users, Total queries, System uptime
- Project-wise query breakdown
- User growth trends
- Storage usage statistics
- Recent system activities
- Quick links to project management, user management

**Test Scenarios:**
- View system dashboard
- Verify all statistics are accurate
- Check project breakdown chart
- View recent activities
- Navigate via quick links

---

## Epic 2: User Management

### US-2.1: Create Admin User
**As a** super admin  
**I want to** create admin user accounts  
**So that** project administrators can manage their projects

**Acceptance Criteria:**
- Create user form includes: First Name, Last Name, Email, Mobile, Role, Employee Code, Department, Designation, Joining Date, Reporting Manager, HRMS ID, Projects
- Email validation (unique, valid format)
- Employee Code validation (unique, optional)
- Password auto-generated (random 10-character string)
- Role dropdown: Super Admin, Admin, Manager, Counselor, Senior Counselor
- Multi-project assignment via checkbox selection
- Reporting Manager dropdown shows active users
- HRMS Integration: Can sync employee data from PeopleStrong HRMS
- User appears in user list immediately
- All fields except First Name, Last Name, Email, and Role are optional

**Test Scenarios:**
- Create admin user with all fields
- Create user with only required fields (First Name, Last Name, Email, Role)
- Verify email uniqueness validation
- Verify employee code uniqueness validation
- Login with auto-generated password
- Duplicate email rejected
- Assign multiple projects via checkboxes
- Select reporting manager from dropdown
- Sync user from HRMS by employee code
- Search HRMS by designation/department

---

### US-2.2: Create Counselor Users
**As an** admin  
**I want to** create counselor user accounts  
**So that** staff can manage queries

**Acceptance Criteria:**
- Create counselor form includes: First Name, Last Name, Email, Mobile, Role, Employee Code, Department, Designation, Joining Date, Reporting Manager, HRMS ID, Projects
- Assign to specific projects via checkbox selection
- Set role (Counselor, Senior Counselor, etc.) which defines permissions
- Can sync from HRMS using employee code, designation, or department search
- Bulk import from HRMS: Search employees by name/code/designation/department
- Multi-select employees from HRMS list and assign role/projects in bulk
- Password auto-generated and stored securely
- Counselor appears in assignment dropdowns only for projects they are assigned to
- All fields except First Name, Last Name, Email, and Role are optional

**Test Scenarios:**
- Create counselor user manually with all fields
- Create counselor with only required fields
- Assign counselor to multiple projects
- Check counselor appears in assignment dropdown for assigned projects only
- Create senior counselor and verify different role
- Load employees from HRMS by searching "Counselor" designation
- Bulk select 5 employees from HRMS and assign Counselor role
- Verify all 5 users created with correct employee data
- Verify employee code uniqueness validation
- Select reporting manager for counselor

---

### US-2.3: Edit User
**As an** admin  
**I want to** edit existing user details  
**So that** I can update roles, permissions, or contact info

**Acceptance Criteria:**
- Edit user form pre-filled with current data
- Can change: Name, Email, Role, Status, Phone, Projects
- Cannot edit: User ID, Created Date
- Changes saved and reflected immediately
- User receives email if email/role changes
- Audit log captures changes

**Test Scenarios:**
- Edit user name
- Change user role
- Add/remove projects
- Update phone number
- Verify notification email

---

### US-2.4: Deactivate/Activate User
**As an** admin  
**I want to** deactivate user accounts  
**So that** former staff cannot access the system

**Acceptance Criteria:**
- "Deactivate" button on user detail page
- Confirmation dialog before deactivation
- Deactivated users cannot login
- Deactivated users' queries remain assigned (historical data)
- Can reactivate users
- Deactivation is logged in audit trail

**Test Scenarios:**
- Deactivate user account
- Attempt login with deactivated account (should fail)
- Reactivate user
- Verify queries remain intact
- Check audit log

---

### US-2.5: View All Users
**As an** admin  
**I want to** view all users in the system  
**So that** I can manage the team

**Acceptance Criteria:**
- User list shows: Name, Email, Role, Status, Projects, Last Login
- Filter by: Role, Status, Project
- Search by name or email
- Sort by columns
- Pagination for large lists
- Export to Excel

**Test Scenarios:**
- View all users
- Filter by role (Counselor)
- Search by email
- Sort by last login
- Export to Excel

---

## Epic 3: Student Portal - Registration & Query Management

### US-3.1: Student Registration
**As a** student  
**I want to** register on the project portal using my email  
**So that** I can submit and track my queries online

**Acceptance Criteria:**
- Student can access project portal via custom URL (e.g., /mhcet)
- Registration form includes: First Name, Last Name, Email, Phone, Password
- Email verification is sent after registration
- Student receives welcome email upon successful registration
- Duplicate email validation works correctly

**Test Scenarios:**
- Valid registration with all fields
- Duplicate email rejection
- Invalid email format validation
- Password strength validation
- Email verification flow

---

### US-3.2: Student Login
**As a** registered student  
**I want to** login to the portal securely  
**So that** I can access my queries and submit new ones

**Acceptance Criteria:**
- Student can login with email and password
- "Remember Me" functionality works
- Forgot Password flow is functional
- Session persists across page refreshes
- Logout clears session completely

**Test Scenarios:**
- Successful login with valid credentials
- Login failure with invalid credentials
- Forgot password email delivery
- Password reset functionality
- Session timeout handling

---

### US-1.3: Submit Query Online
**As a** logged-in student  
**I want to** submit a query through the online portal  
**So that** I can get help without visiting a center

**Acceptance Criteria:**
- Submit query form includes: Category, Subject, Description, Priority
- File attachments supported (max 5 files, PDF/JPG/PNG/DOC)
- Query number is generated automatically (e.g., TKT-2025-0001)
- Confirmation email sent after submission
- Query appears in "My Queries" dashboard immediately

**Test Scenarios:**
- Submit query with all required fields
- Submit query with file attachments
- Category dropdown loads correctly
- Priority selection works
- Query number generation is unique
- Email notification received

---

### US-1.4: View My Queries
**As a** student  
**I want to** view all my submitted queries  
**So that** I can track their status and responses

**Acceptance Criteria:**
- Dashboard shows list of all queries by the student
- Each query displays: Query Number, Subject, Status, Priority, Created Date
- Queries can be filtered by status (Open, In Progress, Resolved, Closed)
- Search by query number or subject works
- Click on query opens detail view

**Test Scenarios:**
- View empty dashboard (no queries)
- View dashboard with multiple queries
- Filter by status
- Search functionality
- Pagination for large query lists

---

### US-1.5: View Query Details & Responses
**As a** student  
**I want to** view full details of my query including counselor responses  
**So that** I can follow the conversation and get resolution

**Acceptance Criteria:**
- Query detail page shows: Full description, attachments, status, priority, assigned counselor
- All responses/comments are displayed chronologically
- Student can add new comments/responses
- Student can upload additional files in responses
- File downloads work correctly
- Email notification when counselor responds

**Test Scenarios:**
- View query with no responses
- View query with multiple responses
- Add comment to query
- Upload file in response
- Download attached files
- Receive email notifications

---

### US-1.6: Close Query
**As a** student  
**I want to** close my query when satisfied with the resolution  
**So that** the counselor knows the issue is resolved

**Acceptance Criteria:**
- "Mark as Resolved" button available on query detail page
- Confirmation dialog before closing
- Query status changes to "Closed"
- Closed queries cannot be reopened by student
- Email notification sent to counselor

**Test Scenarios:**
- Close an open query
- Verify cannot reopen closed query
- Email notification received by counselor

---

## Epic 2: Counselor Portal - Query Management

### US-2.1: Counselor Login
**As a** counselor/agent  
**I want to** login to the admin dashboard  
**So that** I can manage queries assigned to me

**Acceptance Criteria:**
- Counselor can login with email/password
- Dashboard shows relevant permissions based on role
- Navigation menu reflects accessible modules
- Session management works correctly

**Test Scenarios:**
- Login with counselor credentials
- Verify dashboard loads correctly
- Check role-based menu items
- Session timeout

---

### US-2.2: View Assigned Queries
**As a** counselor  
**I want to** see all queries assigned to me  
**So that** I can prioritize and work on them

**Acceptance Criteria:**
- Dashboard shows queries assigned to the counselor
- Queries are sorted by priority and creation date
- Filters available: Status, Priority, Category, Date Range
- Search by query number, student name, or subject
- Query count displayed

**Test Scenarios:**
- View queries with different statuses
- Apply multiple filters
- Search functionality
- Sort by different columns

---

### US-2.3: View Unassigned Queries
**As a** counselor  
**I want to** see unassigned queries  
**So that** I can pick up queries to work on

**Acceptance Criteria:**
- Separate tab/section for unassigned queries
- Counselor can assign query to themselves
- Only queries from projects they have access to are shown
- Real-time updates when queries are assigned

**Test Scenarios:**
- View unassigned queries list
- Self-assign a query
- Verify query moves to assigned list

---

### US-2.4: Respond to Queries
**As a** counselor  
**I want to** respond to student queries  
**So that** I can help resolve their issues

**Acceptance Criteria:**
- Reply/comment box available on query detail page
- Rich text editor for formatting responses
- File upload in responses (documents, screenshots)
- Student receives email notification when counselor responds
- Response is timestamped and shows counselor name

**Test Scenarios:**
- Add text response
- Add response with file attachment
- Format text (bold, italic, lists)
- Verify student email notification

---

### US-2.5: Update Query Status
**As a** counselor  
**I want to** update the status of queries  
**So that** students and managers can track progress

**Acceptance Criteria:**
- Status dropdown: Open, In Progress, Pending, Resolved, Closed
- Status change requires confirmation
- Status history is logged
- Student receives notification on status change
- Status changes are audited

**Test Scenarios:**
- Change status from Open to In Progress
- Change to Resolved
- Verify student notification
- Check audit log

---

### US-2.6: Escalate Queries
**As a** counselor  
**I want to** escalate complex queries to senior staff  
**So that** issues requiring higher expertise are handled properly

**Acceptance Criteria:**
- "Escalate" button available on query detail page
- Escalation form includes: Reason, Target Role/User
- Escalated queries appear in target user's dashboard
- Email notification sent to target user
- Escalation is logged in query history

**Test Scenarios:**
- Escalate query to manager
- Verify target user receives notification
- Check escalation appears in their dashboard
- Verify audit trail

---

### US-2.7: Mark Query as Resolved
**As a** counselor  
**I want to** mark queries as resolved  
**So that** completed queries are properly closed

**Acceptance Criteria:**
- "Mark as Resolved" button available
- Requires resolution comment/summary
- Student receives resolution notification
- Query status changes to "Resolved"
- Resolution can be reopened if student disagrees

**Test Scenarios:**
- Mark query as resolved with comment
- Verify student notification
- Check resolution summary is saved

---

## Epic 3: Manager/Admin - Query Assignment & Monitoring

### US-3.1: View All Queries Dashboard
**As a** manager  
**I want to** view all queries across the project  
**So that** I can monitor team performance and workload

**Acceptance Criteria:**
- Dashboard shows all queries (not just assigned to manager)
- Statistics: Total, Open, In Progress, Resolved, Closed
- Filter by: Counselor, Category, Status, Priority, Date Range
- Export to Excel functionality
- Real-time statistics

**Test Scenarios:**
- View full dashboard
- Apply filters
- Export to Excel
- Verify statistics accuracy

---

### US-3.2: Bulk Query Assignment
**As a** manager  
**I want to** assign multiple queries to counselors at once  
**So that** I can distribute workload efficiently

**Acceptance Criteria:**
- Select multiple queries via checkbox
- "Assign to Counselor" dropdown shows available counselors
- Bulk assignment confirms before executing
- All assigned queries show in counselor's dashboard
- Email notifications sent to counselors

**Test Scenarios:**
- Select 5 queries and bulk assign
- Verify all queries are assigned
- Check counselor notifications
- Verify queries appear in counselor dashboard

---

### US-3.3: Reassign Queries
**As a** manager  
**I want to** reassign queries between counselors  
**So that** I can balance workload or handle staff changes

**Acceptance Criteria:**
- "Reassign" option available on query detail page
- Select new counselor from dropdown
- Reassignment reason (optional)
- Both counselors receive notification
- Reassignment is logged in query history

**Test Scenarios:**
- Reassign query from one counselor to another
- Verify both parties notified
- Check audit log

---

### US-3.4: Generate Reports
**As a** manager  
**I want to** generate reports on query metrics  
**So that** I can analyze performance and trends

**Acceptance Criteria:**
- Reports include: Query volume, Resolution time, Counselor performance, Category breakdown
- Date range selection
- Export to PDF/Excel
- Visual charts (bar, pie, line graphs)
- Scheduled reports via email (optional)

**Test Scenarios:**
- Generate weekly report
- Generate monthly report
- Export to Excel
- Verify chart accuracy

---

## Epic 4: User Management

### US-4.1: Create User
**As an** admin  
**I want to** create new user accounts  
**So that** new staff can access the system

**Acceptance Criteria:**
- Create user form includes: First Name, Last Name, Email, Mobile, Role, Employee Code, Department, Designation, Joining Date, Reporting Manager, HRMS ID, Projects
- Email validation (unique, required)
- Employee Code validation (unique, optional)
- Password auto-generated (10-character random string)
- HRMS sync option: Can fetch employee data from PeopleStrong HRMS by employee code
- HRMS bulk import: Search and select multiple employees by name/code/designation/department
- Multi-project assignment via checkboxes
- Reporting Manager dropdown shows active users (excluding self when editing)
- Required fields: First Name, Last Name, Email, Role
- Optional fields: Mobile, Employee Code, Department, Designation, Joining Date, Reporting Manager, HRMS ID
- User appears in user list immediately after creation
- Form has "Create User" button disabled until all required fields filled

**Test Scenarios:**
- Create counselor user with all fields
- Create manager user with only required fields
- Create admin user and assign to multiple projects
- Verify email uniqueness validation
- Verify employee code uniqueness validation  
- Sync single user from HRMS using employee code
- Search HRMS by designation "Manager" and bulk import 3 users
- Assign reporting manager to user
- Verify auto-generated password works for login
- Duplicate email shows proper error message
- Duplicate employee code shows proper error message

---

### US-4.2: Edit User
**As an** admin  
**I want to** edit existing user details  
**So that** I can update roles, permissions, or contact info

**Acceptance Criteria:**
- Edit user form pre-filled with current data
- Can change: Name, Email, Role, Status, Projects
- Cannot edit: User ID, Created Date
- Changes are saved and reflected immediately
- User receives email if email/role changes

**Test Scenarios:**
- Edit user name
- Change user role
- Add/remove projects
- Deactivate user

---

### US-4.3: Deactivate/Activate User
**As an** admin  
**I want to** deactivate user accounts  
**So that** former staff cannot access the system

**Acceptance Criteria:**
- "Deactivate" button on user detail page
- Deactivated users cannot login
- Deactivated users' queries remain assigned
- Can reactivate users
- Deactivation is logged

**Test Scenarios:**
- Deactivate user account
- Attempt login with deactivated account
- Reactivate user
- Verify queries remain intact

---

## Epic 5: Project Management

### US-5.1: Create Project
**As a** super admin  
**I want to** create new projects  
**So that** different departments/initiatives can use the helpdesk

**Acceptance Criteria:**
- Create project form includes: Name, Code, Custom URL, Branding
- Custom URL validation (unique, alphanumeric)
- Branding: Logo, Colors, Header Text, Browser Title
- Project appears in project list
- Project portal accessible at custom URL

**Test Scenarios:**
- Create project with all fields
- Upload logo
- Set custom colors
- Verify custom URL works
- Check branding appears correctly

---

### US-5.2: Configure Categories
**As a** project admin  
**I want to** configure query categories  
**So that** queries are properly classified

**Acceptance Criteria:**
- Add/Edit/Delete categories
- Category includes: Name, Description, Display Order
- Categories appear in student submission form
- Cannot delete category with existing queries
- Categories can be reordered

**Test Scenarios:**
- Add new category
- Edit category name
- Reorder categories
- Attempt to delete category with queries
- Verify categories in dropdown

---

### US-5.3: Configure Priorities
**As a** project admin  
**I want to** configure priority levels  
**So that** urgent queries are handled first

**Acceptance Criteria:**
- Priority levels: Low, Medium, High, Critical
- Can customize priority names and colors
- Priorities appear in query forms
- SLA times can be set per priority
- Default priority can be set

**Test Scenarios:**
- Add custom priority
- Set SLA times
- Change priority colors
- Set default priority

---

## Epic 6: Knowledge Base (FAQ)

### US-6.1: Create KB Articles
**As a** admin/counselor  
**I want to** create knowledge base articles  
**So that** students can find answers without submitting queries

**Acceptance Criteria:**
- Article editor with rich text formatting
- Fields: Title, Content, Category, Tags, Status (Draft/Published)
- File attachments supported
- Preview before publishing
- Articles are searchable

**Test Scenarios:**
- Create draft article
- Add images to article
- Publish article
- Verify article appears in KB

---

### US-6.2: Search KB Articles
**As a** student  
**I want to** search the knowledge base  
**So that** I can find answers quickly without submitting a query

**Acceptance Criteria:**
- Search box on KB page
- Search by: Title, Content, Tags
- Results sorted by relevance
- Click article to view full content
- "Was this helpful?" feedback option

**Test Scenarios:**
- Search for article by title
- Search by keyword
- View article details
- Submit helpful/not helpful feedback

---

## Epic 7: Feedback System

### US-7.1: Create Feedback Form
**As a** admin  
**I want to** create custom feedback forms  
**So that** I can collect structured feedback from students

**Acceptance Criteria:**
- Form builder with drag-drop fields
- Field types: Text, Textarea, Dropdown, Radio, Checkbox, Rating
- Required/Optional field settings
- Form preview
- Multiple forms per project

**Test Scenarios:**
- Create simple feedback form
- Add rating fields
- Add conditional logic
- Preview form

---

### US-7.2: Submit Feedback
**As a** student  
**I want to** submit feedback  
**So that** I can share my experience

**Acceptance Criteria:**
- Feedback form accessible from student portal
- All field validations work
- Submission confirmation message
- Thank you email sent
- Feedback recorded in database

**Test Scenarios:**
- Submit feedback with all fields
- Validation for required fields
- Receive confirmation email

---

### US-7.3: View Feedback Responses
**As a** manager  
**I want to** view all feedback submissions  
**So that** I can analyze student satisfaction

**Acceptance Criteria:**
- List of all feedback submissions
- Filter by date, rating, form type
- Export to Excel
- View individual responses
- Analytics dashboard (average ratings, trends)

**Test Scenarios:**
- View feedback list
- Filter by date range
- Export to Excel
- View analytics

---

## Epic 8: Email Notifications

### US-8.1: Configure Email Settings
**As a** admin  
**I want to** configure email settings  
**So that** notifications are sent correctly

**Acceptance Criteria:**
- SMTP configuration: Host, Port, Username, Password
- Test email functionality
- Email templates customization
- Email signature
- Settings saved and encrypted

**Test Scenarios:**
- Configure SMTP settings
- Send test email
- Customize email template
- Verify emails are sent

---

### US-8.2: Email Notifications for Query Events
**As a** user  
**I want to** receive email notifications for important events  
**So that** I stay updated on query status

**Acceptance Criteria:**
- Notifications sent for: New query, New response, Status change, Assignment, Escalation
- Email includes: Query number, Subject, Action taken, Link to view
- Unsubscribe option
- Email delivery logs maintained

**Test Scenarios:**
- Verify new query notification
- Verify response notification
- Verify status change notification
- Check unsubscribe works

---

## Epic 9: Authentication & Security

### US-9.1: Password Policy Enforcement
**As a** security admin  
**I want to** enforce strong password policies  
**So that** user accounts are secure

**Acceptance Criteria:**
- Password requirements: Min 8 chars, uppercase, lowercase, number, special char
- Password strength indicator
- Password expiry (90 days)
- Cannot reuse last 5 passwords
- Account lockout after 5 failed attempts

**Test Scenarios:**
- Create weak password (rejected)
- Create strong password (accepted)
- Password expiry notification
- Account lockout after failed attempts

---

### US-9.2: Two-Factor Authentication (2FA)
**As a** user  
**I want to** enable 2FA on my account  
**So that** my account has extra security

**Acceptance Criteria:**
- 2FA setup via email OTP
- QR code for authenticator app (optional)
- Backup codes provided
- 2FA required at login
- Can disable 2FA with password confirmation

**Test Scenarios:**
- Enable 2FA
- Login with 2FA
- Use backup code
- Disable 2FA

---

## Epic 10: Role-Based Access Control (RBAC)

### US-10.1: Create Custom Roles
**As a** super admin  
**I want to** create custom roles  
**So that** I can define specific permission sets

**Acceptance Criteria:**
- Role creation form: Name, Description, Permissions
- Permission categories: Query Management, User Management, Project Settings, Reports, etc.
- Checkbox for each permission
- Role appears in user creation form
- Cannot delete role if users assigned

**Test Scenarios:**
- Create custom role
- Assign permissions
- Assign role to user
- Verify permissions work

---

### US-10.2: Permission Matrix
**As a** super admin  
**I want to** view permission matrix  
**So that** I can see what each role can do

**Acceptance Criteria:**
- Grid view: Roles vs Permissions
- Checkmarks show which role has which permission
- Quick edit mode to change permissions
- Export matrix to Excel
- Audit log for permission changes

**Test Scenarios:**
- View permission matrix
- Edit permissions inline
- Export matrix
- Check audit log

---

## Epic 11: Dashboard & Analytics

### US-11.1: Counselor Dashboard
**As a** counselor  
**I want to** see my performance metrics  
**So that** I can track my productivity

**Acceptance Criteria:**
- Widgets: Assigned queries, Resolved today, Pending, Average resolution time
- Charts: Queries by status, Queries by category
- Recent activity feed
- Quick actions: View assigned, View pending

**Test Scenarios:**
- View dashboard
- Verify widget counts
- Check charts load
- Click quick actions

---

### US-11.2: Manager Analytics Dashboard
**As a** manager  
**I want to** see team analytics  
**So that** I can monitor performance and trends

**Acceptance Criteria:**
- Team metrics: Total queries, Resolution rate, Average resolution time
- Counselor comparison chart
- Trend graphs (daily, weekly, monthly)
- SLA compliance percentage
- Export dashboard to PDF

**Test Scenarios:**
- View analytics dashboard
- Change date range
- Export to PDF
- Verify calculations

---

## Epic 12: SLA & Escalation

### US-12.1: Configure SLA Rules
**As a** admin  
**I want to** configure SLA (Service Level Agreement) rules  
**So that** queries are resolved within defined timeframes

**Acceptance Criteria:**
- SLA configuration per priority: Response time, Resolution time
- Business hours configuration
- Escalation rules if SLA breached
- SLA pause on holidays/weekends
- SLA timer visible on query

**Test Scenarios:**
- Configure SLA for High priority
- Verify SLA timer counts down
- Breach SLA and trigger escalation
- Pause SLA timer

---

### US-12.2: Auto-Escalation
**As a** system  
**I want to** auto-escalate queries when SLA is breached  
**So that** overdue queries get immediate attention

**Acceptance Criteria:**
- Escalation triggered when SLA breached
- Escalation notification to manager
- Query flagged as "SLA Breached"
- Escalation rules configurable per category
- Manual override available

**Test Scenarios:**
- Let query breach SLA
- Verify auto-escalation triggered
- Check manager notification
- View SLA breach report

---

## Testing Priorities

### P0 - Critical (Must Work)
- Student registration & login
- Submit query online
- View queries dashboard
- Counselor login
- Respond to queries
- Update query status

### P1 - High (Should Work)
- Query assignment
- Email notifications
- Search & filters
- User management
- Project configuration
- Knowledge base

### P2 - Medium (Nice to Have)
- Reports & analytics
- Feedback forms
- SLA management
- RBAC customization
- Export functionality

### P3 - Low (Future)
- Advanced analytics
- Custom dashboards
- API integrations
- Mobile responsiveness (deep testing)

---

## Test Data Requirements

### Users
- 1 Super Admin
- 2 Project Admins
- 5 Counselors/Agents
- 10 Students

### Projects
- 2 Active projects
- Different branding for each

### Queries
- 50 sample queries across different:
  - Statuses (Open, In Progress, Resolved, Closed)
  - Priorities (Low, Medium, High)
  - Categories (5 different categories)
  - With and without attachments

### Content
- 10 KB articles
- 2 Feedback forms
- 5 Categories configured

---

## Out of Scope (Offline Module - Not to be Tested)

❌ Offline center management
❌ Walk-in registration
❌ Offline ticket creation by agents
❌ Center asset management
❌ Offline module configuration
❌ Agent offline workflows

---

## Definition of Done

A user story is considered DONE when:
1. ✅ All acceptance criteria met
2. ✅ All test scenarios passed
3. ✅ No critical bugs
4. ✅ Responsive on desktop & mobile
5. ✅ Email notifications working
6. ✅ Audit logs captured
7. ✅ Documentation updated
8. ✅ UAT sign-off received

---

## Sprint Backlog Template

| ID | User Story | Story Points | Priority | Status |
|----|-----------|-------------|----------|---------|
| US-1.1 | Student Registration | 3 | P0 | To Do |
| US-1.2 | Student Login | 2 | P0 | To Do |
| US-1.3 | Submit Query Online | 5 | P0 | To Do |
| US-1.4 | View My Queries | 3 | P0 | To Do |
| US-1.5 | View Query Details | 3 | P0 | To Do |
| ... | ... | ... | ... | ... |

---

## Testing Environments

- **Dev:** http://localhost:3001 (local)
- **Staging:** https://staging.helpdesk.example.com
- **Production:** https://helpdesk.example.com

---

## Contact & Support

**Product Owner:** [Name]  
**Scrum Master:** [Name]  
**QA Lead:** [Name]  
**Dev Team:** [Names]

---

**Document Version:** 1.0  
**Last Updated:** December 23, 2025
