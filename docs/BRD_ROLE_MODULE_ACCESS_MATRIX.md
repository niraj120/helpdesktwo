# Business Requirements Document (BRD)
## Role vs Module Access Matrix

**Project Name:** SAC Helpdesk System  
**Document Version:** 1.0  
**Date:** December 16, 2025  
**Prepared By:** Development Team

---

## Table of Contents
1. [Overview](#overview)
2. [Role Definitions](#role-definitions)
3. [Module Descriptions](#module-descriptions)
4. [Role vs Module Access Matrix](#role-vs-module-access-matrix)
5. [Detailed Role Responsibilities](#detailed-role-responsibilities)
6. [Access Control Rules](#access-control-rules)

---

## 1. Overview

This document defines the role-based access control (RBAC) structure for the SAC Helpdesk System. It outlines two primary user roles (Super Admin and Student), their responsibilities, and their access permissions across various system modules.

### Purpose
- Define clear role boundaries and responsibilities
- Establish module access permissions for each role
- Ensure secure and appropriate access to system features
- Provide a reference for development and testing teams

---

## 2. Role Definitions

### 2.1 Super Admin
**Role Code:** `SUPER_ADMIN`  
**Role Type:** Internal Administrative User  
**Hierarchy Level:** Highest

**Description:**  
Super Admin has complete control over the entire helpdesk system across all projects/portals. This role is responsible for system configuration, user management, and overall system administration.

**Key Characteristics:**
- Full system access across all modules
- Can create, modify, and delete any data
- Manages system configuration and settings
- Has access to all projects/portals
- Can assign and manage other user roles
- Responsible for system security and compliance

---

### 2.2 Student
**Role Code:** `STUDENT`  
**Role Type:** External End User  
**Hierarchy Level:** Base User

**Description:**  
Student is the primary end-user role who accesses the helpdesk system to submit support tickets, search knowledge base articles, and track their ticket status.

**Key Characteristics:**
- Limited access focused on self-service
- Can only view/manage their own tickets
- Read-only access to knowledge base
- Cannot access administrative features
- Portal-specific access (single project assignment)
- Mobile-friendly interface optimized for student use

---

## 3. Module Descriptions

### 3.1 Tickets Module
**Purpose:** Core ticketing system for support request management

**Features:**
- Ticket creation and submission
- Ticket status tracking
- Ticket assignment and routing
- Priority and category management
- Comment and internal note functionality
- Attachment support
- Ticket lifecycle management
- SLA tracking and escalation

---

### 3.2 Knowledge Base Module
**Purpose:** Self-service information repository

**Features:**
- Article creation and publishing
- Category and tag management
- Article search and filtering
- Article version control
- Article analytics (views, feedback)
- Rich text content support
- Related articles suggestions
- Article approval workflow

---

### 3.3 Reports Module
**Purpose:** Analytics and reporting capabilities

**Features:**
- Ticket statistics and trends
- Performance metrics and KPIs
- Custom report generation
- Data export (CSV, Excel, PDF)
- Dashboard visualizations
- SLA compliance reports
- User activity reports
- Agent performance reports

---

### 3.4 Communication Module
**Purpose:** Multi-channel communication management

**Features:**
- Email notifications
- In-app messaging
- Announcement broadcasting
- Template management
- Communication history tracking
- Scheduled communications
- SMS integration (optional)
- Push notifications

---

### 3.5 Analytics Module
**Purpose:** Advanced data analysis and insights

**Features:**
- Real-time dashboard metrics
- Trend analysis
- Predictive analytics
- Customer satisfaction scoring
- Response time analysis
- Resolution rate tracking
- Channel performance metrics
- Custom metric creation

---

### 3.6 User Management Module
**Purpose:** User account and access control

**Features:**
- User account creation/editing
- Role assignment and management
- Permission configuration
- User status management (active/inactive)
- Password reset functionality
- User profile management
- Bulk user operations
- User import/export

---

### 3.7 Workflows Module
**Purpose:** Automated business process management

**Features:**
- Workflow rule creation
- Trigger and condition configuration
- Action automation (assignment, notification, escalation)
- Workflow testing and debugging
- Workflow templates
- Conditional logic support
- Multi-step workflow chains
- Workflow performance tracking

---

### 3.8 Approvals Module
**Purpose:** Multi-level approval process management

**Features:**
- Approval request creation
- Multi-stage approval chains
- Approval delegation
- Approval history tracking
- Conditional approval routing
- Escalation rules
- Approval notifications
- Approval analytics

---

### 3.9 Notifications Module
**Purpose:** System notification management

**Features:**
- Notification rule configuration
- Channel selection (email, SMS, in-app)
- Template customization
- Notification scheduling
- User preference management
- Notification history
- Delivery status tracking
- Notification testing

---

### 3.10 Assets Module
**Purpose:** IT asset and resource management

**Features:**
- Asset inventory tracking
- Asset assignment to users
- Asset lifecycle management
- Maintenance scheduling
- Asset depreciation tracking
- Asset categorization
- Asset reporting
- QR code/barcode support

---

## 4. Role vs Module Access Matrix

| Module | Super Admin | Student | Description |
|--------|-------------|---------|-------------|
| **Tickets** | Full Access | Limited Access | Super Admin: Create, view, edit, delete, assign all tickets<br>Student: Create and view only their own tickets |
| **Knowledge Base** | Full Access | Read-Only | Super Admin: Create, edit, publish, delete articles<br>Student: Search and read published articles only |
| **Reports** | Full Access | No Access | Super Admin: Generate, view, export all reports<br>Student: Cannot access reporting module |
| **Communication** | Full Access | Limited Access | Super Admin: Send announcements, configure templates<br>Student: Receive notifications and view announcements |
| **Analytics** | Full Access | No Access | Super Admin: View all analytics and dashboards<br>Student: Cannot access analytics |
| **User Management** | Full Access | No Access | Super Admin: Manage all users, roles, permissions<br>Student: Cannot access user management |
| **Workflows** | Full Access | No Access | Super Admin: Create, edit, delete workflows<br>Student: Subject to workflows but cannot manage |
| **Approvals** | Full Access | Limited Access | Super Admin: Configure approval chains, approve/reject<br>Student: Submit for approval, view approval status |
| **Notifications** | Full Access | Limited Access | Super Admin: Configure notification rules and templates<br>Student: Manage personal notification preferences only |
| **Assets** | Full Access | Read-Only | Super Admin: Full asset management capabilities<br>Student: View assets assigned to them only |

---

## 5. Detailed Role Responsibilities

### 5.1 Super Admin Responsibilities

#### System Configuration
- Configure project/portal settings
- Manage branding and customization
- Set up authentication methods (SSO, OAuth, etc.)
- Configure security policies and password rules
- Manage system integrations (HRMS, payment gateways, etc.)
- Set up email templates and communication channels
- Configure SLA policies and escalation rules

#### User & Access Management
- Create and manage user accounts
- Assign and modify user roles
- Configure role-based permissions
- Manage user authentication methods
- Reset user passwords and unlock accounts
- Deactivate or reactivate user accounts
- Bulk user import/export operations
- Manage offline center agent registrations

#### Content Management
- Create and publish knowledge base articles
- Organize articles into categories and folders
- Manage article tags and metadata
- Review and approve article submissions
- Archive outdated content
- Manage related articles and search optimization

#### Ticket Management
- View all tickets across the system
- Assign tickets to agents or teams
- Escalate tickets as needed
- Override ticket priorities and categories
- Close or reopen tickets
- Merge duplicate tickets
- Add internal notes and comments
- Configure ticket workflows

#### Reporting & Analytics
- Generate system-wide reports
- Analyze ticket trends and patterns
- Monitor agent performance metrics
- Track SLA compliance
- Export data for external analysis
- Create custom dashboards
- Schedule automated reports
- Monitor system health and usage

#### Workflow & Automation
- Create automated ticket routing rules
- Set up escalation workflows
- Configure auto-responses and canned replies
- Manage approval workflows
- Create notification rules
- Set up business hours and holidays
- Configure satisfaction surveys

#### Compliance & Security
- Monitor system access logs
- Review security audit trails
- Ensure data privacy compliance
- Manage data retention policies
- Configure IP whitelisting
- Monitor suspicious activities
- Manage backup and disaster recovery

---

### 5.2 Student Responsibilities

#### Self-Service Support
- Submit support tickets through online form or offline centers
- Provide accurate information in ticket submission
- Attach relevant documents/screenshots to tickets
- Track status of submitted tickets
- Respond to agent queries in tickets
- Close resolved tickets after verification

#### Knowledge Base Usage
- Search knowledge base for solutions
- Read help articles and FAQs
- Provide feedback on article usefulness
- Follow documented procedures and guidelines
- Check knowledge base before creating tickets

#### Account Management
- Maintain accurate profile information
- Keep contact details updated
- Set personal notification preferences
- Accept terms and conditions (EULA)
- Report account issues or security concerns

#### Communication
- Respond promptly to agent messages
- Provide additional information when requested
- Acknowledge ticket resolutions
- Maintain professional communication
- Report spam or inappropriate content

#### Compliance
- Follow system usage policies
- Maintain confidentiality of credentials
- Report suspicious activities
- Comply with institutional guidelines
- Use system for legitimate support needs only

---

## 6. Access Control Rules

### 6.1 Super Admin Access Rules

**Authentication:**
- Multi-factor authentication (MFA) mandatory
- Strong password policy enforced
- Session timeout: 30 minutes of inactivity
- Concurrent session limit: 3 devices
- IP whitelist option available

**Data Access:**
- Full read/write access to all data
- Can access deleted/archived data
- Can view all user activity logs
- Can export sensitive data
- Can modify system configurations

**Action Permissions:**
- All CREATE operations
- All READ operations
- All UPDATE operations
- All DELETE operations
- All EXECUTE operations
- Can override system restrictions

**Restrictions:**
- Cannot delete their own admin account
- Cannot remove last Super Admin from system
- Audit logs for all critical actions
- Deletion of critical data requires confirmation

---

### 6.2 Student Access Rules

**Authentication:**
- Email/mobile OTP authentication
- Password authentication (optional)
- Social login (if enabled)
- Session timeout: 60 minutes of inactivity
- Concurrent session limit: 2 devices

**Data Access:**
- Can only access their own tickets
- Can only view their own profile
- Read-only access to knowledge base
- Can view public announcements
- Cannot access other users' data

**Action Permissions:**
- CREATE: Own tickets only
- READ: Own tickets, published KB articles, own profile
- UPDATE: Own profile, own open tickets (comments only)
- DELETE: Cannot delete any data
- EXECUTE: Submit tickets, search KB, update preferences

**Restrictions:**
- Cannot access admin panel
- Cannot view system configurations
- Cannot access reports or analytics
- Cannot manage other users
- Cannot modify ticket assignments
- Cannot access internal ticket notes
- Cannot view agent-only content
- Rate limiting on ticket creation (e.g., max 10 per day)

---

## 7. Permission Hierarchy

```
SUPER_ADMIN (Level 0)
└── Full System Access
    ├── All Modules
    ├── All Projects/Portals
    ├── All User Data
    ├── System Configuration
    └── Audit Logs

STUDENT (Level 5)
└── Limited End-User Access
    ├── Tickets (Own Only)
    ├── Knowledge Base (Read)
    ├── Profile (Own Only)
    ├── Notifications (Personal)
    └── Public Announcements
```

---

## 8. Module Access Details

### 8.1 Tickets Module Access

| Action | Super Admin | Student |
|--------|-------------|---------|
| Create Ticket | ✅ All Projects | ✅ Own Project Only |
| View Ticket | ✅ All Tickets | ✅ Own Tickets Only |
| Edit Ticket | ✅ All Fields | ❌ No Direct Edit |
| Add Comment | ✅ Yes (Public/Internal) | ✅ Public Only |
| Attach Files | ✅ Yes | ✅ Yes (Size Limited) |
| Change Status | ✅ Yes | ❌ No |
| Assign Ticket | ✅ Yes | ❌ No |
| Change Priority | ✅ Yes | ❌ No |
| Merge Tickets | ✅ Yes | ❌ No |
| Delete Ticket | ✅ Yes | ❌ No |
| Export Tickets | ✅ Yes | ❌ No |
| Bulk Operations | ✅ Yes | ❌ No |

---

### 8.2 Knowledge Base Module Access

| Action | Super Admin | Student |
|--------|-------------|---------|
| Create Article | ✅ Yes | ❌ No |
| Edit Article | ✅ All Articles | ❌ No |
| Delete Article | ✅ Yes | ❌ No |
| Publish Article | ✅ Yes | ❌ No |
| View Article | ✅ All (Draft/Published) | ✅ Published Only |
| Search Articles | ✅ Yes | ✅ Yes |
| Create Category | ✅ Yes | ❌ No |
| Manage Tags | ✅ Yes | ❌ No |
| Article Analytics | ✅ Yes | ❌ No |
| Version History | ✅ View/Restore | ❌ No |
| Rate Article | ✅ Yes | ✅ Yes |
| Comment on Article | ✅ Yes | ✅ Yes (If Enabled) |

---

### 8.3 User Management Module Access

| Action | Super Admin | Student |
|--------|-------------|---------|
| Create User | ✅ Yes | ❌ No |
| View Users | ✅ All Users | ❌ No |
| Edit User | ✅ All Users | ⚠️ Own Profile Only |
| Delete User | ✅ Yes | ❌ No |
| Assign Role | ✅ Yes | ❌ No |
| Reset Password | ✅ All Users | ⚠️ Own Password |
| Activate/Deactivate | ✅ Yes | ❌ No |
| Bulk Import | ✅ Yes | ❌ No |
| View Permissions | ✅ Yes | ❌ No |
| Manage Projects | ✅ Yes | ❌ No |

---

## 9. Data Visibility Rules

### 9.1 Super Admin Data Visibility
- **Tickets:** All tickets across all projects
- **Users:** All user accounts and profiles
- **Knowledge Base:** All articles (published, draft, archived)
- **Reports:** All system reports and analytics
- **Logs:** Complete audit and activity logs
- **Settings:** All system and project configurations
- **Projects:** All projects/portals in the system

### 9.2 Student Data Visibility
- **Tickets:** Only their own submitted tickets
- **Users:** Own profile only (name, email, phone)
- **Knowledge Base:** Published articles only
- **Reports:** No access
- **Logs:** No access
- **Settings:** Own notification preferences only
- **Projects:** Only assigned project/portal

---

## 10. Special Scenarios

### 10.1 Ticket Lifecycle for Student

**Creation:**
1. Student creates ticket via online form or offline center
2. System auto-assigns ticket ID
3. Student receives confirmation notification
4. Ticket enters queue for assignment

**Tracking:**
1. Student can view ticket status in real-time
2. Student receives notifications on status changes
3. Student can add comments/replies
4. Student can upload additional attachments

**Resolution:**
1. Agent marks ticket as resolved
2. Student receives resolution notification
3. Student reviews resolution
4. Student can provide satisfaction rating
5. Student can reopen if not satisfied (within 7 days)

---

### 10.2 Knowledge Base Access for Student

**Search:**
1. Student enters search query
2. System returns relevant published articles
3. Search results ranked by relevance
4. Student can filter by category

**Reading:**
1. Student clicks article to view full content
2. Article view count incremented
3. Related articles suggested
4. Student can print or share article

**Feedback:**
1. Student can rate article (helpful/not helpful)
2. Student can provide comments (if enabled)
3. Feedback tracked for article improvement

---

## 11. Security Considerations

### 11.1 Super Admin Security
- Mandatory MFA for all Super Admin accounts
- All actions logged in audit trail
- Privileged access reviews quarterly
- Separate Super Admin accounts (no shared accounts)
- IP restriction options available
- Session recording for critical operations
- Cannot bypass approval workflows

### 11.2 Student Security
- OTP-based authentication available
- Password complexity requirements
- Account lockout after failed login attempts
- CAPTCHA on ticket submission to prevent spam
- Rate limiting on API calls
- Secure file upload with virus scanning
- Personal data privacy controls

---

## 12. Compliance Requirements

### 12.1 Data Protection
- **Super Admin:** Responsible for GDPR/data privacy compliance
- **Student:** Right to access, modify, delete personal data
- **Data Retention:** Configurable retention policies
- **Data Export:** Students can export their data

### 12.2 Audit Trail
- All Super Admin actions logged with timestamp and IP
- Ticket creation and modifications tracked
- User login/logout activities recorded
- Data access logs maintained
- Logs retained for minimum 1 year

---

## 13. Future Role Considerations

While this BRD focuses on Super Admin and Student roles, the system architecture supports additional roles such as:

- **Agent:** Front-line support staff handling tickets
- **Supervisor:** Team lead managing agents
- **Manager:** Department head with reporting access
- **Guest:** Limited public knowledge base access

These roles can be added as the system evolves.

---

## 14. Approval & Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | | | |
| Technical Lead | | | |
| Security Officer | | | |
| Business Analyst | | | |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | December 16, 2025 | Development Team | Initial BRD creation |

---

## Appendix A: Role vs Module Quick Reference

```
┌─────────────────┬──────────────┬─────────┐
│ Module          │ Super Admin  │ Student │
├─────────────────┼──────────────┼─────────┤
│ Tickets         │ Full         │ Limited │
│ Knowledge Base  │ Full         │ Read    │
│ Reports         │ Full         │ None    │
│ Communication   │ Full         │ Limited │
│ Analytics       │ Full         │ None    │
│ User Management │ Full         │ None    │
│ Workflows       │ Full         │ None    │
│ Approvals       │ Full         │ Limited │
│ Notifications   │ Full         │ Limited │
│ Assets          │ Full         │ Read    │
└─────────────────┴──────────────┴─────────┘
```

---

**Document Status:** ✅ Approved for Implementation  
**Next Review Date:** March 16, 2026  
**Contact:** development@sachelpdesk.com
