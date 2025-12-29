# SAC Helpdesk Portal - Technical Documentation
## Complete Working Implementation Guide

**Version:** 2.0 (Production Ready)  
**Last Updated:** December 23, 2025  
**Status:** ✅ All Features Tested & Working  
**Environment:** Development & Production

---

## 📋 Table of Contents

### Core System
1. [System Overview](#1-system-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Project Structure](#3-project-structure)

### Authentication & Users
4. [Authentication System](#4-authentication-system)
5. [User Management](#5-user-management)
6. [HRMS Integration](#6-hrms-integration)
7. [RBAC & Permissions](#7-rbac--permissions)

### Student Features
8. [Student Portal](#8-student-portal)
9. [Student Registration Flow](#9-student-registration-flow)
10. [Offline Module](#10-offline-module)

### Query Management
11. [Query/Ticket System](#11-queryticket-system)
12. [Query Assignment](#12-query-assignment)
13. [File Attachments](#13-file-attachments)

### Master Data & Configuration
14. [Master Data Management](#14-master-data-management)
15. [Project Configuration](#15-project-configuration)
16. [Email Notifications](#16-email-notifications)

### Deployment & Operations
17. [API Reference](#17-api-reference)
18. [Database Schema](#18-database-schema)
19. [Deployment Guide](#19-deployment-guide)
20. [Troubleshooting](#20-troubleshooting)

---

---

## 1. System Overview

**SAC Helpdesk Portal** is a multi-tenant query/ticket management system for educational institutions with comprehensive student support features.

### ✅ Working Features (Confirmed)

**Core Functionality:**
- ✅ Multi-project support with custom branding (logo, colors, custom URLs)
- ✅ Role-based access control (RBAC) with 150+ granular permissions
- ✅ Query/Ticket management with assignment workflows
- ✅ Online & Offline student registration modes
- ✅ Agent-assisted student workflow
- ✅ File attachments (tickets & responses)
- ✅ Multi-language support (English, Hindi, Marathi)
- ✅ Activity logging and audit trails

**User Management:**
- ✅ Manual user creation with 10+ fields
- ✅ HRMS integration (PeopleStrong) - Mock implementation
- ✅ Bulk user import from HRMS with search
- ✅ Employee Code, Department, Designation tracking
- ✅ Reporting Manager hierarchy

**Student Features:**
- ✅ Student portal with project-specific branding
- ✅ Online query submission with custom forms
- ✅ OTP-based first-time password setup
- ✅ Agent-assisted walk-in registration
- ✅ Student search (Name/Email/Phone/UniqueID)
- ✅ Offline center locator with map integration

**Offline Module:**
- ✅ Offline center management (CRUD)
- ✅ Country → State → City cascading dropdowns
- ✅ Dynamic registration form configuration
- ✅ Walk-in ticket creation
- ✅ Notification settings

### 🏗️ Architecture Highlights

```
┌─────────────────────────────────────────────────────────┐
│           Frontend (React + TypeScript + Vite)          │
│  Port: 5173 (dev) | 3001 (prod)                        │
│  - Super Admin Portal                                   │
│  - Project Portal (Agents/Counselors)                  │
│  - Student Portal (per project)                        │
└─────────────────────────────────────────────────────────┘
                         ↓ REST API
┌─────────────────────────────────────────────────────────┐
│          Backend (Node.js + Express + TypeScript)       │
│  Port: 3003                                            │
│  - JWT Authentication                                   │
│  - Permission-based Authorization                       │
│  - File Upload (Multer)                                │
│  - HRMS Integration Service                            │
└─────────────────────────────────────────────────────────┘
                         ↓ Mongoose ODM
┌─────────────────────────────────────────────────────────┐
│                  MongoDB Database                       │
│  Collections: users, roles, projects, tickets,         │
│  categories, countries, states, cities,                │
│  offlinecenters, activitylogs, etc.                    │
└─────────────────────────────────────────────────────────┘
```

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Super Admin  │  │Project Portal│  │ Student      │     │
│  │   Portal     │  │  (Agents)    │  │  Portal      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Frontend (React + Vite)                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React Router │ Axios │ i18next │ React Icons      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTP/REST API
┌─────────────────────────────────────────────────────────────┐
│                Backend (Node.js + Express)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Authentication │ Authorization │ Business Logic    │  │
│  │  JWT Tokens    │ Permissions   │ Controllers       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database (MongoDB)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Users │ Roles │ Permissions │ Tickets │ Projects   │  │
│  │ SLA   │ Logs  │ Categories  │ Statuses│ KB Articles│  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Folder Structure

```
SAC Helpdesk/
├── backend/
│   ├── src/
│   │   ├── controllers/        # Business logic
│   │   ├── models/             # Mongoose schemas
│   │   ├── routes/             # API endpoints
│   │   ├── middleware/         # Auth, permissions, validation
│   │   ├── utils/              # Helper functions, seeders
│   │   └── server.ts           # Entry point
│   ├── dist/                   # Compiled TypeScript
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Route-based pages
│   │   ├── utils/              # Helper functions
│   │   ├── i18n/               # Translations
│   │   └── App.tsx             # Main app component
│   └── package.json
└── docs/                       # Documentation
```

---

## Technology Stack

### Backend
- **Runtime:** Node.js v18+
- **Framework:** Express.js v4.18
- **Language:** TypeScript v5.0
- **Database:** MongoDB v6.0
- **ODM:** Mongoose v7.0
- **Authentication:** JWT (jsonwebtoken v9.0)
- **Password Hashing:** bcryptjs v2.4
- **Validation:** express-validator
- **CORS:** cors v2.8
- **Environment:** dotenv v16.0

### Frontend
- **Framework:** React v18.2
- **Build Tool:** Vite v4.5
- **Language:** TypeScript v5.0
- **Routing:** React Router v6.18
- **HTTP Client:** Axios v1.6
- **Icons:** React Icons v4.11
- **Internationalization:** i18next, react-i18next
- **State Management:** React Hooks (useState, useEffect, useContext)

### Development Tools
- **Backend Dev Server:** nodemon + ts-node
- **Code Quality:** ESLint, Prettier
- **Version Control:** Git + Bitbucket

---

## Database Schema

### Core Collections

#### 1. Users Collection
```javascript
{
  _id: ObjectId,
  firstName: String,
  lastName: String,
  email: String (unique, indexed),
  password: String (hashed),
  mobile: String,
  employeeCode: String,
  hrmsId: Number,
  role: ObjectId (ref: 'Role'),
  department: String,
  designation: String,
  joiningDate: Date,
  reportingManager: ObjectId (ref: 'User'),
  projects: [ObjectId] (ref: 'Project'),
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### 2. Roles Collection
```javascript
{
  _id: ObjectId,
  name: String,
  code: String (unique, indexed),
  description: String,
  type: String ('system' | 'custom'),
  permissions: [ObjectId] (ref: 'Permission'),
  projects: [ObjectId] (ref: 'Project'),
  isMaster: Boolean,
  masterRoleId: ObjectId (ref: 'Role'),
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### 3. Permissions Collection
```javascript
{
  _id: ObjectId,
  module: String,
  name: String,
  code: String (unique, indexed),
  description: String,
  category: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### 4. Projects Collection
```javascript
{
  _id: ObjectId,
  name: String,
  code: String (unique),
  customUrlPath: String (unique, indexed),
  description: String,
  branding: {
    logo: String (URL),
    colorTheme: {
      primary: String,
      secondary: String,
      accent: String,
      background: String
    }
  },
  ticketSubmissionMode: String ('online' | 'offline' | 'both'),
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### 5. Tickets Collection
```javascript
{
  _id: ObjectId,
  ticketId: String (auto-generated, indexed),
  projectId: ObjectId (ref: 'Project'),
  studentId: String,
  studentName: String,
  studentEmail: String,
  studentMobile: String,
  category: ObjectId (ref: 'Category'),
  subcategory: ObjectId (ref: 'Subcategory'),
  priority: String ('Low' | 'Medium' | 'High' | 'Critical'),
  status: ObjectId (ref: 'Status'),
  subject: String,
  description: String,
  assignedTo: ObjectId (ref: 'User'),
  assignedBy: ObjectId (ref: 'User'),
  createdBy: ObjectId (ref: 'User'),
  source: String ('online' | 'offline' | 'email' | 'phone'),
  attachments: [{
    filename: String,
    url: String,
    uploadedAt: Date,
    uploadedBy: ObjectId
  }],
  comments: [{
    text: String,
    createdBy: ObjectId (ref: 'User'),
    createdAt: Date,
    isInternal: Boolean
  }],
  sla: {
    responseTime: Number,
    resolutionTime: Number,
    responseDeadline: Date,
    resolutionDeadline: Date,
    isResponseBreached: Boolean,
    isResolutionBreached: Boolean
  },
  tags: [String],
  customFields: Schema.Types.Mixed,
  resolvedAt: Date,
  closedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### 6. Categories Collection
```javascript
{
  _id: ObjectId,
  name: String,
  code: String,
  description: String,
  projectId: ObjectId (ref: 'Project'),
  parentCategory: ObjectId (ref: 'Category'),
  isActive: Boolean,
  order: Number,
  createdAt: Date,
  updatedAt: Date
}
```

#### 7. Statuses Collection
```javascript
{
  _id: ObjectId,
  name: String,
  code: String,
  type: String ('open' | 'in-progress' | 'resolved' | 'closed'),
  color: String,
  order: Number,
  isDefault: Boolean,
  projectId: ObjectId (ref: 'Project'),
  createdAt: Date,
  updatedAt: Date
}
```

#### 8. SLA Rules Collection
```javascript
{
  _id: ObjectId,
  name: String,
  projectId: ObjectId (ref: 'Project'),
  priority: String ('Low' | 'Medium' | 'High' | 'Critical'),
  responseTime: Number (minutes),
  resolutionTime: Number (minutes),
  escalationRules: [{
    level: Number,
    triggerAfter: Number (minutes),
    escalateTo: ObjectId (ref: 'User' | 'Role')
  }],
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### 9. Knowledge Base Articles Collection
```javascript
{
  _id: ObjectId,
  title: String,
  content: String,
  category: ObjectId (ref: 'Category'),
  tags: [String],
  projectId: ObjectId (ref: 'Project'),
  author: ObjectId (ref: 'User'),
  isPublished: Boolean,
  viewCount: Number,
  helpfulCount: Number,
  attachments: [String],
  createdAt: Date,
  updatedAt: Date
}
```

#### 10. Activity Logs Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: 'User'),
  action: String,
  entityType: String,
  entityId: ObjectId,
  description: String,
  metadata: Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  createdAt: Date
}
```

#### 11. Access Logs Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: 'User'),
  email: String,
  loginTime: Date,
  logoutTime: Date,
  ipAddress: String,
  userAgent: String,
  sessionDuration: Number (seconds),
  loginStatus: String ('success' | 'failed'),
  failureReason: String,
  projectId: ObjectId (ref: 'Project')
}
```

### Database Indexes

```javascript
// Users
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ employeeCode: 1 })
db.users.createIndex({ role: 1 })
db.users.createIndex({ isActive: 1 })

// Tickets
db.tickets.createIndex({ ticketId: 1 }, { unique: true })
db.tickets.createIndex({ projectId: 1, createdAt: -1 })
db.tickets.createIndex({ assignedTo: 1, status: 1 })
db.tickets.createIndex({ studentEmail: 1 })
db.tickets.createIndex({ 'sla.resolutionDeadline': 1 })

// Projects
db.projects.createIndex({ customUrlPath: 1 }, { unique: true })
db.projects.createIndex({ code: 1 }, { unique: true })

// Roles & Permissions
db.roles.createIndex({ code: 1 }, { unique: true })
db.permissions.createIndex({ code: 1 }, { unique: true })
```

---

## Authentication & Authorization

### Authentication Flow

1. **Login Request**
   - User submits credentials (email + password)
   - Server validates credentials
   - Password verified using bcrypt
   - JWT token generated with payload:
     ```javascript
     {
       userId: user._id,
       email: user.email,
       role: {
         code: role.code,
         name: role.name,
         permissions: ['PERMISSION_CODE_1', 'PERMISSION_CODE_2']
       }
     }
     ```

2. **Token Storage**
   - Token stored in `localStorage` as `authToken`
   - Included in all subsequent API requests via Authorization header

3. **Token Verification**
   - Middleware validates JWT on protected routes
   - Extracts user information from token
   - Attaches to `req.user` for downstream use

### Authorization (RBAC)

#### Permission System

**Permission Format:** `MODULE_ACTION`

**Examples:**
- `USER_VIEW_ALL` - View all users
- `TICKET_CREATE` - Create tickets
- `RBAC_EDIT_ROLE` - Edit roles

**Permission Categories:**
- **RBAC:** Role and permission management
- **USER:** User management
- **PROJECT:** Project configuration
- **TICKET:** Ticket operations
- **KNOWLEDGE_BASE:** KB article management
- **AUDIT:** View logs
- **OFFLINE:** Offline/student workflow
- **SLA:** SLA rule management
- **AUTOMATION:** Workflow automation
- **REPORT:** Reporting and analytics

#### Permission Middleware

```typescript
// Single permission check
checkPermission('USER_VIEW_ALL')

// Multiple permissions (OR logic - user needs ANY one)
checkPermission(['RBAC_VIEW_ROLES', 'USER_VIEW_ALL', 'USER_CREATE'])
```

#### Role Types

1. **Super Admin**
   - Full system access
   - Permissions: All RBAC, USER, PROJECT, TICKET, KB, AUDIT, etc.
   - Can manage roles, users, projects

2. **Manager** (Center Manager, Support Manager)
   - Permissions: USER_*, TICKET_*, KNOWLEDGE_BASE_*, AUDIT_*
   - Can manage users and tickets within assigned projects

3. **Agent** (Helpdesk Agent)
   - Permissions: TICKET_*, KNOWLEDGE_BASE_VIEW, OFFLINE_*, STUDENT_*
   - Can handle tickets and student support

4. **Student**
   - Permissions: TICKET_VIEW_OWN, TICKET_CREATE, STUDENT_*
   - Can only create and view their own tickets

### Module Access Determination

Module access is **permission-driven** (not role-based):

```typescript
const moduleAccess = {
  dashboard: true, // Everyone
  tickets: hasPermission('TICKET_*'),
  knowledgeBase: hasPermission('KNOWLEDGE_BASE_*'),
  users: hasPermission('USER_*'),
  audit: hasPermission('AUDIT_*'),
  offline: hasPermission('OFFLINE_*') || hasPermission('STUDENT_*')
};
```

---

## API Documentation

### Base URL
- **Development:** `http://localhost:3003/api`
- **Production:** `https://your-domain.com/api`

### Authentication APIs

#### POST `/auth/login`
**Super Admin Login**

Request:
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "user": {
      "id": "...",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": {
        "name": "Super Admin",
        "code": "SUPER_ADMIN"
      }
    }
  }
}
```

#### POST `/auth/project/:customUrlPath/login`
**Project Portal Login (Agents, Managers)**

Request:
```json
{
  "email": "agent@example.com",
  "password": "password123"
}
```

Response: Same as super admin login

#### GET `/auth/me`
**Get Current User**

Headers:
```
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": {
      "name": "Agent",
      "code": "AGENT",
      "permissions": ["TICKET_VIEW_ALL", "TICKET_CREATE", ...]
    },
    "projects": [...],
    "isActive": true
  }
}
```

### User Management APIs

#### GET `/users`
**Get All Users**

Permission: `USER_VIEW_ALL`

Query Parameters:
- `search` - Search by name/email
- `role` - Filter by role ID
- `isActive` - Filter by status (true/false)

Response:
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "role": { "name": "Agent", "code": "AGENT" },
      "isActive": true,
      "projects": [...],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### POST `/users`
**Create User**

Permission: `USER_CREATE`

Request:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "password123",
  "mobile": "1234567890",
  "role": "role_id",
  "projects": ["project_id_1", "project_id_2"],
  "department": "IT",
  "designation": "Support Engineer"
}
```

#### PUT `/users/:id`
**Update User**

Permission: `USER_EDIT`

#### DELETE `/users/:id`
**Delete User**

Permission: `USER_DELETE`

#### PATCH `/users/:id/toggle-status`
**Toggle User Status**

Permission: `USER_TOGGLE_STATUS`

### Role Management APIs

#### GET `/roles`
**Get All Roles**

Permission: `RBAC_VIEW_ROLES` | `USER_VIEW_ALL` | `USER_CREATE`

#### POST `/roles`
**Create Role**

Permission: `RBAC_CREATE_ROLE`

Request:
```json
{
  "name": "Support Manager",
  "code": "SUPPORT_MANAGER",
  "description": "Manages support team",
  "permissions": ["perm_id_1", "perm_id_2"],
  "projects": ["project_id_1"],
  "isMaster": false
}
```

#### POST `/roles/:id/clone`
**Clone Role from Master**

Permission: `RBAC_CREATE_ROLE`

### Ticket APIs

#### GET `/tickets`
**Get All Tickets**

Permission: `TICKET_VIEW_ALL` | `TICKET_VIEW_OWN`

Query Parameters:
- `projectId` - Filter by project
- `status` - Filter by status
- `priority` - Filter by priority
- `assignedTo` - Filter by assigned user
- `search` - Search in subject/description

#### POST `/tickets`
**Create Ticket**

Permission: `TICKET_CREATE`

Request:
```json
{
  "projectId": "...",
  "subject": "Unable to login",
  "description": "Detailed description",
  "category": "category_id",
  "priority": "High",
  "studentEmail": "student@example.com",
  "studentName": "Student Name",
  "source": "online",
  "customFields": {}
}
```

#### PUT `/tickets/:id`
**Update Ticket**

Permission: `TICKET_EDIT`

#### POST `/tickets/:id/assign`
**Assign Ticket**

Permission: `TICKET_ASSIGN`

Request:
```json
{
  "assignedTo": "user_id"
}
```

#### POST `/tickets/:id/comments`
**Add Comment**

Permission: `TICKET_ADD_COMMENT`

### Project APIs

#### GET `/projects`
**Get All Projects**

Permission: `PROJECT_VIEW_ALL`

#### POST `/projects`
**Create Project**

Permission: `PROJECT_CREATE`

Request:
```json
{
  "name": "Student Assist Center",
  "code": "SAC",
  "customUrlPath": "studentassistcenter",
  "description": "Student support portal",
  "branding": {
    "logo": "https://...",
    "colorTheme": {
      "primary": "#3b82f6",
      "secondary": "#1e40af",
      "accent": "#f59e0b",
      "background": "#ffffff"
    }
  },
  "ticketSubmissionMode": "both"
}
```

#### GET `/projects/branding/:customUrlPath`
**Get Project Branding**

Public endpoint (no authentication required)

### Knowledge Base APIs

#### GET `/knowledge-base`
**Get KB Articles**

Permission: `KNOWLEDGE_BASE_VIEW`

#### POST `/knowledge-base`
**Create KB Article**

Permission: `KNOWLEDGE_BASE_CREATE`

#### PUT `/knowledge-base/:id`
**Update KB Article**

Permission: `KNOWLEDGE_BASE_EDIT`

### Audit & Logging APIs

#### GET `/logs/activity`
**Get Activity Logs**

Permission: `AUDIT_VIEW_ACTIVITY`

#### GET `/logs/access`
**Get Access Logs**

Permission: `AUDIT_VIEW_ACCESS`

---

## Frontend Components

### Page Components

#### 1. SuperAdminPortal
**Path:** `/`

Main dashboard for super administrators.

**Features:**
- System overview statistics
- Recent activity feed
- Quick actions

#### 2. ProjectPortalLogin
**Path:** `/:customUrlPath/portal/login`

Login page for project-specific users (agents, managers).

**Features:**
- Project-branded login form
- Dynamic color theming
- Remember me functionality

#### 3. ProjectPortalDashboard
**Path:** `/:customUrlPath/portal/*`

Main container for project portal with nested routes.

**Routes:**
- `/dashboard` - Dashboard overview
- `/tickets` - Ticket management
- `/knowledge-base` - KB articles
- `/users` - User management
- `/audit` - Audit logs
- `/offline` - Student workflow

**Features:**
- Dynamic module access based on permissions
- Project branding application
- Nested routing with DashboardLayout

#### 4. RBACSetup
**Path:** `/rbac`

Role and permission management interface.

**Features:**
- Create/edit/delete roles
- Permission management with categorization
- Role type filtering (Super Admin, Manager, Agent, Student)
- Clone roles from master templates
- Project-specific role mapping

#### 5. UserManagement
**Path:** `/users`

User management interface.

**Features:**
- CRUD operations on users
- Role assignment
- Project mapping
- HRMS integration for bulk import
- Status toggle (activate/deactivate)
- Password reset

#### 6. AgentStudentWorkflow
**Path:** `/:customUrlPath/portal/offline`

Offline ticket submission and student support workflow.

**Features:**
- Bulk ticket creation from offline submissions
- Excel/CSV upload
- Student data management

### Reusable Components

#### DashboardLayout
Main layout wrapper with sidebar navigation.

**Props:**
- `logoutRedirectPath` - Where to redirect after logout
- `children` - Page content

**Features:**
- Responsive sidebar
- Module-based menu filtering
- Language switcher
- User profile menu

#### ActivityLogs
Activity log viewer component.

#### AccessLogs
Access log viewer component.

#### KnowledgeBaseViewer
KB article browser and reader.

---

## Role-Based Access Control (RBAC)

### Permission Matrix

| Module | Super Admin | Manager | Agent | Student |
|--------|-------------|---------|-------|---------|
| RBAC Management | ✅ | ❌ | ❌ | ❌ |
| User Management | ✅ | ✅ | ❌ | ❌ |
| Project Config | ✅ | ❌ | ❌ | ❌ |
| View All Tickets | ✅ | ✅ | ✅ | ❌ |
| Create Tickets | ✅ | ✅ | ✅ | ✅ |
| Assign Tickets | ✅ | ✅ | ❌ | ❌ |
| Edit Tickets | ✅ | ✅ | ✅ | ❌ |
| Delete Tickets | ✅ | ✅ | ❌ | ❌ |
| View KB Articles | ✅ | ✅ | ✅ | ✅ |
| Create KB Articles | ✅ | ✅ | ❌ | ❌ |
| View Audit Logs | ✅ | ✅ | ❌ | ❌ |
| Offline Workflow | ✅ | ✅ | ✅ | ❌ |
| SLA Management | ✅ | ❌ | ❌ | ❌ |

### Role Type Filtering

When creating roles in RBAC Setup, permissions are filtered based on role type:

**Super Admin Type:**
- Shows: RBAC, USER, PROJECT, TICKET, KB, AUDIT, OFFLINE, STUDENT, FIELDS, SLA, AUTOMATION, REPORT

**Manager Type:**
- Shows: USER, TICKET, KB, AUDIT, OFFLINE, STUDENT, REPORT

**Agent Type:**
- Shows: TICKET, KB, OFFLINE, STUDENT

**Student Type:**
- Shows: TICKET (limited), OFFLINE, STUDENT

**Custom Type:**
- Shows: All permissions (for flexibility)

---

## Project Portal System

### Multi-Tenancy Architecture

Each project has:
- **Unique Custom URL Path:** `/projectname/portal`
- **Independent Branding:** Logo, colors, theme
- **Isolated Users:** Agents/managers assigned to specific projects
- **Separate Ticket Pools:** Tickets belong to projects
- **Custom Categories:** Per-project ticket categories

### Project Branding

#### Color Theming
```javascript
{
  primary: '#3b82f6',    // Main brand color
  secondary: '#1e40af',  // Secondary actions
  accent: '#f59e0b',     // Highlights
  background: '#ffffff'  // Page background
}
```

CSS variables applied dynamically:
```css
--primary-main
--primary-dark
--accent-main
--primary-light
```

#### Logo Display
- Shown in login page
- Used in sidebar navigation
- Displayed in email templates

### Ticket Submission Modes

1. **Online Only**
   - Students submit tickets via web form
   - Real-time validation
   - Immediate ticket creation

2. **Offline Only**
   - Agents upload bulk submissions
   - Excel/CSV import
   - Batch processing

3. **Both (Hybrid)**
   - Supports both submission methods
   - Configurable per project

---

## Deployment Guide

### Prerequisites

- Node.js v18+
- MongoDB v6.0+
- npm or yarn
- Git

### Backend Deployment

1. **Clone Repository**
```bash
git clone https://bitbucket.org/your-workspace/sac-helpdesk.git
cd SAC Helpdesk/backend
```

2. **Install Dependencies**
```bash
npm install
```

3. **Configure Environment**
Create `.env` file:
```env
PORT=3003
MONGODB_URI=mongodb://localhost:27017/sac_helpdesk
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=production
CORS_ORIGIN=http://localhost:3001
```

4. **Build TypeScript**
```bash
npm run build
```

5. **Seed Initial Data**
```bash
node dist/utils/seedRolesPermissions.js
```

6. **Start Production Server**
```bash
npm start
```

Or use PM2:
```bash
pm2 start ecosystem.config.js
```

### Frontend Deployment

1. **Navigate to Frontend**
```bash
cd ../frontend
```

2. **Install Dependencies**
```bash
npm install
```

3. **Configure Environment**
Create `.env.production`:
```env
VITE_API_URL=https://api.yourdomain.com
```

4. **Build for Production**
```bash
npm run build
```

5. **Serve Static Files**

Using nginx:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/frontend/dist;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Database Setup

1. **Install MongoDB**
```bash
# Ubuntu/Debian
sudo apt-get install mongodb-org

# Start service
sudo systemctl start mongod
sudo systemctl enable mongod
```

2. **Create Database User**
```javascript
use admin
db.createUser({
  user: "sac_admin",
  pwd: "secure_password",
  roles: [{ role: "readWrite", db: "sac_helpdesk" }]
})
```

3. **Update Connection String**
```env
MONGODB_URI=mongodb://sac_admin:secure_password@localhost:27017/sac_helpdesk
```

### Security Considerations

1. **Change Default JWT Secret**
   - Use strong, random secret
   - Keep secret in environment variables

2. **Enable HTTPS**
   - Use SSL certificates (Let's Encrypt)
   - Force HTTPS redirect

3. **Configure CORS**
   - Whitelist only trusted origins
   - Avoid using `*` in production

4. **Rate Limiting**
   - Implement rate limiting on login endpoints
   - Prevent brute force attacks

5. **Input Validation**
   - Validate all user inputs
   - Sanitize data before database operations

6. **Password Policy**
   - Enforce strong passwords
   - Minimum 8 characters, mixed case, numbers

---

## Environment Configuration

### Backend .env Variables

```env
# Server Configuration
PORT=3003
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/sac_helpdesk

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3001

# Email (Optional - for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=SAC Helpdesk <noreply@yourdomain.com>

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# SLA Monitoring
SLA_CHECK_INTERVAL=300000

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

### Frontend .env Variables

```env
# API Configuration
VITE_API_URL=http://localhost:3003

# Application
VITE_APP_NAME=SAC Helpdesk
VITE_APP_VERSION=1.0.0

# Features
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=true
```

---

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

### Pagination Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

---

## Performance Optimization

### Database Optimization
- Proper indexing on frequently queried fields
- Use projection to fetch only required fields
- Implement pagination for large datasets
- Use aggregation pipelines for complex queries

### Frontend Optimization
- Code splitting with React.lazy()
- Memoization of expensive components
- Debouncing search inputs
- Virtual scrolling for large lists
- Image lazy loading

### Caching Strategy
- Cache static assets (CSS, JS, images)
- Browser caching for API responses
- Redis for session management (optional)

---

## Monitoring & Logging

### Backend Logging
- Application logs: `logs/app.log`
- Error logs: `logs/error.log`
- Access logs: MongoDB AccessLogs collection

### Monitoring Metrics
- API response times
- Database query performance
- Error rates
- User activity patterns
- SLA breach counts

### Tools
- PM2 for process management
- MongoDB Compass for database monitoring
- New Relic / DataDog (optional)

---

## Troubleshooting

### Common Issues

**1. Port Already in Use**
```bash
# Find process using port 3003
netstat -ano | findstr :3003
# Kill process
taskkill /PID <process_id> /F
```

**2. MongoDB Connection Failed**
- Check MongoDB service is running
- Verify connection string
- Check network/firewall settings

**3. JWT Token Invalid**
- Clear browser localStorage
- Check JWT_SECRET matches
- Verify token expiration

**4. CORS Errors**
- Update CORS_ORIGIN in backend .env
- Check API URL in frontend .env
- Verify request headers

**5. Permission Denied Errors**
- Verify user has required permissions
- Check role-permission mapping
- Re-login to refresh token

---

## Version History

### v1.0.0 (Current)
- Multi-tenant project portal system
- Dynamic RBAC with granular permissions
- Ticket management with SLA tracking
- Knowledge base system
- Offline/student workflow
- Activity and access logging
- Multi-language support (EN, HI, MR)
- Custom project branding

---

## Contact & Support

For technical support or questions, contact:
- **Development Team:** dev-team@sac.gov.in
- **Documentation:** https://bitbucket.org/your-workspace/sac-helpdesk/wiki
- **Bitbucket Repository:** https://bitbucket.org/your-workspace/sac-helpdesk
- **Git Branch:** `dev` (development), `main` (production)

---

**Last Updated:** November 20, 2025
