# ISR/PSR Ticket Support System — Comprehensive Documentation

> **Generated:** 2026-06-24 | **Verified:** Two-pass analysis complete  
> **Codebase:** `C:\Users\hvrut\Downloads\Hubble-Hox\ISR_PSR Ticket Support`  
> **Tech Stack:** React 18.3 + TypeScript 6.0 + Vite 6.3 + React Router 7.13 + shadcn/ui (Radix) + Tailwind CSS 4.1 + react-hook-form 7.55 + date-fns 3.6 + lucide-react 0.487 + recharts 2.15 + react-dnd 16.0 + sonner 2.0 + MUI 7.3  
> **Graph Stats:** 1,524 nodes | 14,773 edges | 176 files | 15 communities | 67 pages | 73 components | 8 services | 10 types | 28 utilities

---

## Table of Contents

1.  [System Overview & Architecture](#1-system-overview--architecture)
2.  [Core Entities: ISR, PSR, PSL, VSR](#2-core-entities-isr-psr-psl-vsr)
3.  [Data Models & Type System (Complete)](#3-data-models--type-system-complete)
4.  [App.tsx — Central State Hub](#4-apptsx--central-state-hub)
5.  [Parent Flow (Deep Analysis)](#5-parent-flow-deep-analysis)
6.  [PSL Flow (Deep Analysis)](#6-psl-flow-deep-analysis)
7.  [Agent/Admin Flow (Internal)](#7-agentadmin-flow-internal)
8.  [Services & Business Logic](#8-services--business-logic)
9.  [Components Library](#9-components-library)
10. [Utility Functions (Complete)](#10-utility-functions-complete)
11. [Configuration & Constants](#11-configuration--constants)
12. [Mock Data Ecosystem (Complete)](#12-mock-data-ecosystem-complete)
13. [Root Configuration & Entry Points](#13-root-configuration--entry-points)
14. [Sprint Roadmap](#14-sprint-roadmap)
15. [Test Files](#15-test-files)
16. [Complete Feature Checklist](#16-complete-feature-checklist)
17. [Complete File Inventory (Verified)](#17-complete-file-inventory-verified)
18. [Email & IVR Subsystems](#18-email--ivr-subsystems)
19. [VPMS / Vendor Subsystem](#19-vpms--vendor-subsystem)
20. [Knowledge Base Subsystem](#20-knowledge-base-subsystem)
21. [Task Manager Subsystem](#21-task-manager-subsystem)
22. [Room Booking Subsystem](#22-room-booking-subsystem)
23. [Key Statistics](#23-key-statistics)

---

## 1. System Overview & Architecture

### 1.1 What is ISR/PSR?

This is a **school helpdesk ticketing system** prototype with five primary entities:

| Entity | Meaning | Description |
|--------|---------|-------------|
| **ISR** | Internal Service Request | Internal operational tickets (Facilities, IT, HR, Finance, Operations). Created by agents, PSLs, or in bulk across schools. |
| **PSR** | Parent Service Request | Parent-facing tickets submitted by parents, contact persons, or created from IVR/email/walk-in channels. Has student/parent/SLA fields and can spawn child ISRs. |
| **PSL** | Parent Service Lead | The intermediary role that bridges parents and internal teams. Manages a roster of schools, handles PSR follow-ups, reviews/close tickets, converts IVR calls to PSRs. |
| **VSR** | Vendor Service Request | Vendor-facing tickets for outsourced services (maintenance, security, catering). Has cost approval workflow. |
| **SR** | Service Request | Generic service request for IVR/email conversions, CRM enquiries, vendor/job application inquiries. |

### 1.2 Hierarchical Relationship

```
┌─────────────────────────────────────────────────┐
│                    PSR (Parent)                  │
│    Created by: Parent / Contact Person           │
│    Channel: PORTAL / EMAIL / IVR / WALK_IN /     │
│             SMS / WHATSAPP / MANUAL              │
│    Has TAT (SLA), Student info, Parent info      │
├─────────────────────────────────────────────────┤
│                      PSL                         │
│     Bridges Parent ↔ Internal Teams             │
│     Manages PSR lifecycle, creates ISRs          │
│     Reviews & closes, escalates, transfers       │
├─────────────────────────────────────────────────┤
│               ISR (Child/Internal)               │
│    Linked to PSR via PSR_TO_ISR link            │
│   Category: Facilities, IT, HR, Finance, etc.   │
│   Can be created standalone or in bulk          │
└─────────────────────────────────────────────────┘

Additionally:
  IVR Call → Convert to PSR / SR / CRM
  Email   → Decision Wizard → Generate PSR / ISR / Respond
  VSR     → Vendor assignment → Cost approval → Complete
```

### 1.3 Codebase Architecture

```
src/app/
├── App.tsx                    ← Central state hub (3,421 lines)
├── main.tsx                   ← Entry point
├── pages/                     ← Route page components (67 pages)
│   └── components/            ← Page-level sub-components
│       └── psl-dashboard/SLAHealthCard.tsx
├── components/
│   ├── tickets/              ← 17 ticket-related components
│   ├── shared/               ← 3 shared UI components
│   ├── ui/                   ← 48 shadcn/ui components
│   ├── email/                ← 1 email component
│   ├── matrix/               ← 3 matrix components
│   ├── figma/                ← 1 figma component
│   └── users/                ← 2 user components
├── services/                 ← 8 business logic services
├── types/                    ← 10 TypeScript type files
├── utils/                    ← 28 utility & mock data files
├── constants/                ← 1 permissions file
└── config/                   ← 1 config file + test
```

### 1.4 Graph Communities (from code review graph)

| Community | Size | Cohesion | Description |
|-----------|------|----------|-------------|
| `pages-handle` | 731 | 0.051 | Main page components |
| `ui-menu` | 244 | 0.100 | UI primitives (shadcn) |
| `utils-assert` | 88 | 0.035 | Utilities |
| `app-handle` | 75 | 0.130 | App.tsx state management |
| `tickets-handle` | 63 | 0.029 | Ticket components |
| `services-service` | 60 | **0.459** | **Highest cohesion** — services |
| `types-notification` | 22 | 0.367 | Notification types |
| `email-handle` | 20 | 0.089 | Email pages |
| `shared-badge` | 18 | 0.062 | StatusBadge system |
| `matrix-handle` | 12 | 0.026 | Matrix components |
| `config-assert` | 7 | 0.021 | Config files |
| `figma-image` | 2 | 0 | Figma assets |
| `users-user` | 2 | 0.059 | User components |
| `psl-dashboard-slahealth` | 2 | 0 | PSL dashboard |
| `isr-psr-ticket-support-figma` | 2 | 0 | Figma support |

---

## 2. Core Entities: ISR, PSR, PSL, VSR

### 2.1 ISR (Internal Service Request)

**Type:** `ISRTicket extends BaseTicket` (`src/app/types/ticket.ts:79`)

```typescript
ISRTicket {
  type: 'ISR';
  category: ISRCategory;       // Facilities | IT Support | HR | Finance | Operations
  subcategory?: string;
  location?: string;
  department?: string;
  toolType?: 'UNIFORM' | 'FACILITIES' | 'ADMIN' | 'IT' | 'TRANSPORT' | 'LIBRARY' | 'OTHER';
}
```

**ISR Categories** (`src/app/constants/permissions.ts:21`):
Facilities | IT Support | Human Resources | Finance | Operations

**ISR Subcategories** (from `mockSchoolData.ts`):
- IT Support: Laptop/Desktop, CCTV/Biometric, Server/Infrastructure, Network/WiFi, Printer/Scanner, Software/App, ERP/SIS, LMS/Portal
- Facilities: Electrical, Plumbing, AC, Carpentry/Furniture, Painting/Waterproofing, Pest Control
- HR: Employee Grievance, Payroll, Leave, Recruitment, Training
- Finance: Fee Collection, Vendor Payment, TDS/Tax, Budget, Audit
- Transport: Vehicle Maintenance, Fuel, Driver, GPS Tracking, Route Planning
- Library: Book Issue, Book Purchase, Digital Library, Library Software
- Operations: Security, Housekeeping, Canteen, Events, General

**7 tool types:** UNIFORM | FACILITIES | ADMIN | IT | TRANSPORT | LIBRARY | OTHER

**Creation Modes:**
1. **Standalone** — Created by agents via `ISRPSRTicketForm` ISR tab
2. **Linked to PSR** — Created from PSR detail page via `LinkISRModal`
3. **Bulk (per-school)** — One ISR per selected school
4. **Bulk (per-recipient)** — One ISR per school-recipient pair
5. **Bulk Linked** — Created via `BulkLinkISRModal` from PSR detail
6. **Split** — Created when splitting a PSR into multiple ISRs
7. **From Email** — Generated via Email Decision Wizard
8. **CSV Bulk Import** — Via 5-step BulkImportPage wizard

### 2.2 PSR (Parent Service Request)

**Type:** `PSRTicket extends BaseTicket` (`src/app/types/ticket.ts:88`)

```typescript
PSRTicket {
  type: 'PSR';
  category: PSRCategory;      // Academic | Attendance | Behavior | General Inquiry |
                              // Transportation | IT Support | Facilities
  subcategory?: string;
  studentId?: string;
  studentName?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
}
```

**PSR Categories** (`src/app/constants/permissions.ts:29`):
Academic | Attendance | Behavior | General Inquiry | Transportation | IT Support | Facilities

**PSR Subcategories** (185 sub-subcategories across 11 departments via `mockPSRCategories.ts`):
11 Departments: Academics Operations, Administration, Finance, IT, Facilities, Transport, Security, Housekeeping, Canteen, HR, General Administration

**7 PSR Channels:** EMAIL | IVR | PORTAL | WALK_IN | SMS | WHATSAPP | MANUAL

### 2.3 PSL (Parent Service Lead)

**Role:** `'PSL'` in `UserRole` (`src/app/types/rbac.ts:1`)

**PSL Permissions** (9 permissions):
`view_dept_tickets`, `reassign_ticket`, `close_ticket`, `view_reports`,
`send_progress_update`, `escalate_ticket`, `create_isr`, `update_ticket_status`, `add_comments`

**PSL Roster** (`src/app/utils/mockPSLRoster.ts`):
| Name | Email | School | Active |
|------|-------|--------|--------|
| Ananya Sharma | ananya.s@school.edu | Springfield Elementary | Yes |
| Kavitha D | kavitha.d@school.edu | Oakwood High School | Yes |
| Ramesh Kumar | ramesh.k@school.edu | Springfield Elementary | No |
| Pooja Verma | pooja.v@school.edu | Oakwood High School | Yes |

### 2.4 VSR (Vendor Service Request)

**Type:** Defined in `mockVSRData.ts` (283 lines)

```typescript
VSRTicket {
  id, title, description, type: VSRTicketType;  // COMPLAINT | FEEDBACK | QUERY | REQUEST
  status: VSRStatus;  // SUBMITTED → IN_REVIEW → ASSIGNED → IN_PROGRESS → RESOLVED → COMPLETED
  priority, vendor, vendorCompany?, assignmentMode;  // VENDOR_ONLY | SUB_ONLY | ROUND_ROBIN
  costApproval?: CostApprovalEntry;  // With templates, amount, approval status
  attachments?, actionHistory?, createdAt, updatedAt, createdBy;
}
```

**15 mock VSR tickets** covering: AC repair, network issues, water coolers, pest control, cafeteria feedback, cleanliness, compliance, contracts, staff, equipment, cost approvals.

### 2.5 Ticket Status Lifecycle

**Statuses:**
```
OPEN → IN_PROGRESS → WIP → RESOLVED → CLOSED
             ↓                   ↓
         AWAITING_INFO      REOPENED → WIP (max 1) → RESOLVED
                                  ↓
                             ESCALATED
```

**VSR Status Pipeline:**
```
SUBMITTED → IN_REVIEW → ASSIGNED → IN_PROGRESS → RESOLVED → COMPLETED
```

**IVR Call Status Pipeline:**
```
NEW → ASSIGNED → PROCESSING → CONVERTED / SR_RAISED / CRM_ENQUIRY / JUNK → CLOSED
```

---

## 3. Data Models & Type System (Complete)

### 3.1 BaseTicket (47 fields) — `src/app/types/ticket.ts:3`

**Core Identity:** `id`, `type` (TicketType), `title`, `description`, `createdAt`, `updatedAt`, `createdBy`

**Assignment:** `assignedTo`, `assigneeEmails`

**Priority:** `priority` (LOW/MEDIUM/HIGH/URGENT), `scheduledDispatchDate`

**Read Status:** `readBy` (string[]), `readAt` (Record<string, Date>)

**Offline/RE Entry:** `createdByRE`, `offlineRequesterId/Name/Email/Phone/Role/Source`, `offlineRequesterVerified`, `createdOnBehalfBy`

**Reopen:** `reopenCount`, `reopenReason`

**Timeline:** `closedAt`, `slaPausedAt`, `slaPausedDuration`

**PSL/SPOC:** `pslEmail`, `pslName`, `clusterName`, `functionalSpocName`, `functionalSpocDept`

**Dissatisfied Call:** `dissatisfiedCallLogged`, `dissatisfiedCallNotes`, `dissatisfiedCallAt`, `dissatisfiedCallOutcome` (SATISFIED_AFTER_CALL | STILL_DISSATISFIED | REOPEN_ON_BEHALF | DOCUMENTED)

**Other:** `nextFollowUpDate`, `principalWIPSetAt`, `principalComment`, `schoolId`, `bulkBatchId`, `bulkRecipientRoles`, `recipientEmails`, `ccEmails`, `watcherEmails`

**PSR-Specific (lines 52-77):** `channel`, `schoolName`, `studentClass`, `tatDays`, `dueDate`, `tatBreached`, `tatBreachImminent`, `committedDate`, `wipAttempts`, `isReopenWIP`, `resolvedAt`, `resolvedBy`, `pendingParentClose`, `closedBy`, `linkedISRs[]`, `attachments[]`, `history[]`, `feedbackSatisfied`, `feedbackRating` (1-5), `feedbackComment`, `feedbackSubmittedAt`, `reopenSource` (PARENT|SYSTEM), `reopenedAt`, `principalAssigned`, `progressUpdates[]`

### 3.2 Ticket Linking System

**Link Types** (`src/app/types/linking.ts:5`):

| Link Type | Description |
|-----------|-------------|
| `PSR_TO_ISR` | PSR parent → ISR children |
| `ISR_TO_ISR` | ISR to ISR chain |
| `SPLIT` | Ticket split into sub-tickets |
| `PSR_TO_PSR` | PSR linked/merged to PSR |
| `DUPLICATE` | Marked as duplicate |
| `RELATED` | Generally related |

**Ticket Splitting** (lines 62-85):
- `TicketChain` with `splitMode`: `'parallel'` or `'sequential'`
- `TicketChainStep[]` — each with `status`: `'pending'` | `'active'` | `'completed'`
- Parallel: all active at once; Sequential: only current step active, auto-advances

**Bulk Operations** (lines 32-39): `BulkOperation` with operationType: CLOSE | REASSIGN | DELETE

### 3.3 Matrix Types — `src/app/types/matrix.ts` (45 lines)

```typescript
MatrixRule {
  id, ticketType: 'ISR'|'PSR', location?, category, subcategory?,
  assignee, cc?: string[], watchers?: string[],
  userGroups?: string[], priority?: number,
  active: boolean, createdAt, updatedAt, createdBy;
}

UserGroup {
  id, name, description?, members: string[],
  createdAt, updatedAt, createdBy;
}

MatrixLookupResult {
  assignee?: string, cc?: string[],
  rule?: MatrixRule, matched: boolean;
}

MatrixRuleFormData {
  ticketType, location?, category, subcategory?,
  assignee, cc?, watchers?, userGroups?,
  priority?, active?;
}
```

### 3.4 Bulk ISR Types — `src/app/types/bulkISR.ts` (60 lines)

```typescript
BulkISRGenerationMode = 'PER_SCHOOL' | 'PER_RECIPIENT';

BulkISRRecipientRole { id, label, description }
BulkISRTargetRecipient { roleId, roleLabel, name, email, schoolId, schoolName }

BulkISRRequest {
  title, description, category, subcategory?, location?, department?,
  toolType?, priority, scheduledDispatchDate?,
  schoolIds[], recipientRoleIds[], generationMode,
  offlineRequesterId/Name/Email/Phone/Role/Source?,
  offlineRequesterVerified?, createdByRE?, createdOnBehalfBy?,
  assigneeEmails?;
}

GeneratedBulkISRRow {
  isrData: TicketFormData, schoolName, schoolId,
  recipients: BulkISRTargetRecipient[], warnings[], errors[];
}

BulkISRValidationResult { valid, errors[], warnings[] }
```

### 3.5 RBAC System — `src/app/types/rbac.ts` (100 lines)

**User Roles:** `ADMIN` | `AGENT` | `DEPT_HEAD` | `VENDOR` | `PARENT` | `PSL` | `CONTACT_PERSON`

**Complete Permission Map:**

| Permission | ADMIN | AGENT | DEPT_HEAD | PSL | VENDOR | PARENT | CONTACT_PERSON |
|------------|:-----:|:-----:|:---------:|:---:|:------:|:------:|:--------------:|
| view_all_tickets | ✓ | — | — | — | — | — | — |
| create_ticket | ✓ | ✓ | ✓ | — | — | — | — |
| edit_ticket | ✓ | — | ✓ | — | — | — | — |
| delete_ticket | ✓ | — | — | — | — | — | — |
| manage_matrix | ✓ | — | — | — | — | — | — |
| manage_users | ✓ | — | — | — | — | — | — |
| manage_settings | ✓ | — | — | — | — | — | — |
| view_reports | ✓ | — | ✓ | ✓ | — | — | — |
| view_audit_logs | ✓ | — | — | — | — | — | — |
| view_assigned_tickets | — | ✓ | — | — | ✓ | — | — |
| view_dept_tickets | — | — | ✓ | ✓ | — | — | ✓ |
| view_own_tickets | — | — | — | — | — | ✓ | — |
| edit_own_tickets | — | ✓ | — | — | — | — | — |
| update_ticket_status | — | ✓ | — | ✓ | ✓ | — | — |
| close_ticket | — | — | ✓ | ✓ | — | — | — |
| reassign_ticket | — | — | ✓ | ✓ | — | — | — |
| send_progress_update | — | — | — | ✓ | — | — | — |
| escalate_ticket | — | — | — | ✓ | — | — | — |
| create_isr | — | — | — | ✓ | — | — | — |
| add_comments | — | — | — | ✓ | ✓ | — | — |
| create_psr | — | — | — | — | — | ✓ | ✓ |

**RBACService** class with methods: `hasPermission`, `canCreateISR`, `canCreateBulkISR`, `canCreatePSR`, `canCreateAnyTicket`, `canViewTicket`, `canEditTicket`

### 3.6 Notification System — `src/app/types/notification.ts` (121 lines)

**16 Notification Types:**
```
PSR_CREATED        PSR_ASSIGNED       PSR_STATUS_CHANGED
PSR_RESOLVED       PSR_REOPENED       PSR_CLOSED
ISR_CREATED        ISR_ASSIGNED       ISR_STATUS_CHANGED
ISR_RESOLVED       LINKED_ISR_CREATED LINKED_ISR_RESOLVED
ESCALATION_TRIGGERED  WIP_COMMITTED   PSL_UPDATE
```

**Channels:** EMAIL | SMS | IN_APP

**NotificationService** with 5 formatter methods: `formatPSRResolvedNotification`, `formatLinkedISRResolvedNotification`, `formatPSRCreatedNotification`, `formatPSLUpdateNotification`, `formatPSRClosedNotification`

**Parent Notification Types (11):** PSR_CREATED, PSR_WIP, PSR_RESOLVED, PSR_CLOSED, PSR_REOPENED, PSR_ESCALATED, PSR_AWAITING_INFO, PSL_MESSAGE, TAT_WARNING, FEEDBACK_REMINDER, AUTO_CLOSE_WARNING

### 3.7 Escalation System — `src/app/types/escalation.ts` (67 lines)

**4 Default Rules:**
| Priority | Threshold | Auto-Reassign | Escalate To |
|----------|-----------|:---:|-------------|
| URGENT | 24 hours | Yes | depthead@school.edu |
| HIGH | 72 hours | Yes | depthead@school.edu |
| MEDIUM | 168 hours (7d) | No | supervisor@school.edu |
| LOW | 336 hours (14d) | No | supervisor@school.edu |

### 3.8 WIP Configuration — `src/app/types/wip.ts` (40 lines)

```typescript
WIP_CONFIG = {
  maxAttempts: 3,              // Regular max WIP cycles
  maxAttemptsAfterReopen: 1,   // After parent reopens
}
```

Types: `WIPEntry`, `StatusChange`, `DelegationHistory`, `TicketHistory`

### 3.9 Audit System — `src/app/types/audit.ts` (51 lines)

Resource types: `TICKET` | `MATRIX_RULE` | `USER_GROUP` | `OOO_ASSIGNMENT` | `CONFIG` | `PROJECT` | `TICKETS`

### 3.10 Project Configuration — `src/app/types/linking.ts:41-60`

```typescript
ProjectConfig {
  projectName, maxWIPAttempts,
  linkedISRBehavior: 'AUTO_RESOLVE' | 'NOTIFY_ONLY',
  autoCloseInformationCategory, enableReadReceipts,
  dailyDigestTime,
  autoCloseUrgentHours/HighDays/MediumDays/LowDays,
  autoCloseWarningEnabled, autoCloseWarningHours,
  autoCloseSystemComment, autoCloseSystemCommentTemplate,
  autoCloseExemptAgents[]
}
```

### 3.11 Email Types — `src/app/utils/mockEmailData.ts` (1023 lines)

```typescript
EmailStatus = 'OPEN' | 'WIP' | 'CLOSED';
SenderCategory = 'EXISTING_PARENT' | 'LEFT_STUDENT' | 'PROSPECTIVE_PARENT' | 'OTHERS_EXTERNAL';
EmailPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
EmailBucketKey = 'total' | 'openWithinTAT' | 'openOutsideTAT' | 'wipWithinTAT' | 'wipOutsideTAT' | 'closedWithinTAT' | 'closedOutsideTAT' | 'resolvedUnsatisfied';

EmailRecord {
  id, from, to, subject, body, receivedAt,
  senderCategory, senderName, schoolName?, clusterName?, parentName?,
  status, priority, assignedTo?,
  tatHours, dueDate?, tatBreached?, tatBreachImminent?,
  attachments?: EmailAttachment[],
  conversion?: ConversionRecord, linkedTicketIds?,
  timeline?: EmailTimelineEntry[];
}
```

### 3.12 Email Decision Types — `src/app/utils/emailDecisionData.ts` (676 lines)

**16 Decision Actions:**
- EXISTING_PARENT: DUPLICATE_REQUEST, GENERATE_PSR, GENERATE_ISR, RESPONDED_OVER_EMAIL
- LEFT_STUDENT: same 4 as existing
- PROSPECTIVE_PARENT: NEW_ADMISSION_INQUIRY, NEW_ADMISSION_APPOINTMENT, NEW_ADMISSION_RECORD_SUBMISSION, NEW_ADMISSION_FOLLOW_UP, NEW_ADMISSION_ENQUIRY_CLARIFICATION, NEW_ADMISSION_CANCELLATION
- OTHERS_EXTERNAL: JOB_APPLICATION, VENDOR_BUSINESS_PARTNER, BUSINESS_PROPOSAL, INTERNAL_COMMUNICATION, SPAM, LEGAL

**Terminal Actions (close email):** RESPONDED_OVER_EMAIL, RESPONDED_VIA_EMAIL, SPAM, DUPLICATE_REQUEST, NEW_ADMISSION_CANCELLATION, JOB_APPLICATION, VENDOR_BUSINESS_PARTNER, BUSINESS_PROPOSAL, INTERNAL_COMMUNICATION, LEGAL

**Auto-Response Templates for:** SPAM, GENERATE_PSR, GENERATE_ISR, JOB_APPLICATION, LEGAL

**Auto-Forward Targets for:** JOB_APPLICATION (HR), LEGAL (legal@), VENDOR_BUSINESS_PARTNER (procurement@), BUSINESS_PROPOSAL (business-dev@)

**Email Escalation Config:** Working hours 08:30-17:30 Mon-Sat, L1=8h, L2=12h

### 3.13 IVR Types — `src/app/utils/mockIVRData.ts` (397 lines)

```typescript
IVRCallStatus = 'NEW' | 'ASSIGNED' | 'PROCESSING' | 'CONVERTED' |
               'SR_RAISED' | 'CRM_ENQUIRY' | 'JUNK' | 'CLOSED';

IVRCallRecord {
  id, callerPhone, callerName?, callDateTime, durationSeconds?,
  digitPressed?, agentAssigned?, schoolName?,
  status, convertedToTicketId?, srId?,
  recordingUrl?, transcription?,
  registeredUser?: { name, email, phone, children: StudentRecord[] },
  convertCategory?: string, followUps?: IVRFollowUp[];
}
```

23 mock IVR calls covering: fee queries, admission inquiries, transport issues, record requests, vendor calls, spam/telemarketing, answered/unanswered, converted-to-ticket.

### 3.14 VSR Types — `src/app/utils/mockVSRData.ts` (283 lines)

```typescript
VSRTicketType = 'COMPLAINT' | 'FEEDBACK' | 'QUERY' | 'REQUEST';
VSRStatus = 'SUBMITTED' | 'IN_REVIEW' | 'ASSIGNED' |
            'IN_PROGRESS' | 'RESOLVED' | 'COMPLETED';
AssignmentMode = 'VENDOR_ONLY' | 'SUB_ONLY' | 'ROUND_ROBIN';

VSRTicket {
  costApproval?: { template, amount, status, requestor, approver,
                   requestDate, approvalDate?, history[] };
  actionHistory?: { action, by, at, note? }[];
}
```

10 approval templates with max amounts and SLA days.

### 3.15 Task Types — `src/app/utils/mockTaskData.ts` (46 lines)

```typescript
TaskCategory = 'MAINTENANCE' | 'CLEANING' | 'INSPECTION' | 'EVENT' | 'ADMIN';
TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
TaskItem { id, title, description, category, status, assignee, createdBy,
           participants[], dueDate, createdAt, priority, attachments[]; }
```
15 mock tasks.

### 3.16 Room Booking Types — `src/app/utils/mockRoomBookingData.ts` (65 lines)

```typescript
Room { id, name, floor, capacity, building,
       roomType: 'CLASSROOM'|'LAB'|'AUDITORIUM'|'MEETING_ROOM'|'GYM'|'LIBRARY',
       facilities[], hasProjector, hasAC, active; }

Booking { id, roomId, title, bookedBy, date, startTime, endTime,
          participants[], recurring: 'NONE'|'DAILY'|'WEEKLY'|'MONTHLY',
          status: 'CONFIRMED'|'CANCELLED'|'COMPLETED', purpose, googleSync; }
```
10 rooms + 13 bookings with `getRoomAvailability()` function supporting recurring bookings.

### 3.17 User Management Types — `src/app/utils/mockUserData.ts` (69 lines)

```typescript
ManagementUser { id, name, email, employeeCode, role, designation,
                 projects[], centers[], status: 'Active'|'Inactive'; }
```
5 management users (Suresh Kumar, Priya Sharma, Rahul Verma, Anita Desai, Vikram Singh).

### 3.18 Requester Directory — `src/app/utils/requesterDirectory.ts` (104 lines)

```typescript
RequesterDirectoryEntry {
  id, name, email, phone, role,
  source: 'EMPLOYEE'|'PARENT'|'PRINCIPAL'|'DEPARTMENT'|'VENDOR',
  school?, department?;
}
```

Functions: `findRequesterByEmail(email)`, `searchRequesterDirectory(query, limit=8)` (fuzzy search across email/name/role/phone), `createRequesterOtp()` (random 6-digit), `verifyRequesterOtp(expected, actual)`.

---

## 4. App.tsx — Central State Hub

**File:** `src/app/App.tsx` (3,421 lines)  
**Graph Flow:** `App` — 203 nodes, criticality 0.7383 (highest in system)

### 4.1 State Management

All app state in `AppContent` (lines 128-361):

```typescript
// Tickets
tickets, setTickets           // Ticket[] (all ISR+PSR)
linkedTickets, setLinkedTickets // LinkedTicket[]
ticketChains, setTicketChains   // TicketChain[]
psrCategories, setPsrCategories // PSR categories
isrTickets, setIsrTickets       // Dedicated ISR list
oooAssignments, setOOOAssignments // OOOAssignment[]
projectConfig, setProjectConfig   // ProjectConfig

// Identity
currentUser, setCurrentUser              // Logged-in admin user
pslLoginUser, setPslLoginUser           // PSL login session
parentLoginUser, setParentLoginUser     // Parent login session
contactPersonLoginUser, setContactPersonLoginUser

// Notifications
notifications, setNotifications          // NotificationEvent[]
pslNotifications, setPslNotifications    // PSL demo notifications

// Audit & Reporting
auditLogs, setAuditLogs                 // AuditLog[]
escalationEvents, setEscalationEvents   // EscalationEvent[]
escalationRules, setEscalationRules     // EscalationRule[]

// Matrix & Routing
matrixRules, setMatrixRules            // MatrixRule[]

// IVR & Email
ivrCalls, setIvrCalls                 // IVRCallRecord[]
emails, setEmails                      // EmailRecord[]

// Other
userGroups, setUserGroups             // UserGroup[]
```

### 4.2 Route Structure (lines 2899-3294)

```
# Admin/Internal Routes
/admin/dashboard              → DashboardPage
/admin/tickets/:ticketId      → TicketDetailView → TicketDetailPage
/admin/tickets/create         → ISRPSRTicketForm (dialog)
/admin/psr                    → PSRDashboardPage
/admin/psr/create             → PSRCreatePage
/admin/psr/:psrId             → PSRTicketDetailPage
/admin/psr/list               → PSRTicketListPage
/admin/psr/matrix             → PSRMatrixRulesPage
/admin/psr/status-map         → PSRStatusMapPage
/admin/psr/categories         → PSRCategoryMasterPage
/admin/matrix/tickets         → CCMatrixPage
/admin/matrix/groups          → UserGroupsPage
/admin/matrix/users           → UserManagementPage
/admin/matrix/ooo             → OOOSettingsPage
/admin/matrix/escalation       → EscalationSettingsPage
/admin/matrix/escalation/monitor → EscalationMonitorPage
/admin/reports                → ReportsPage
/admin/bulk-import            → BulkImportPage
/admin/email/* (5 routes)     → EmailDashboard/Inbox/Detail/Escalation/Report/Repository
/admin/ivr/* (3 routes)       → IVRDashboard/CallList/CallDetail
/admin/knowledge              → KnowledgeBasePage
/admin/audit                  → AuditLogPage

# PSL Portal
/psl/login                    → PSLLoginPage
/psl/dashboard                → PSLDashboardPage
/psl/psrs                     → PSLPSRListPage (PSR view)
/psl/isrs                     → PSLPSRListPage (ISR view)
/psl/:psrId                   → PSLPSRDetailPage
/psl/:psrId/review-close      → PSLReviewClosePage
/psl/ivr                      → PSLIVRListPage
/psl/create-isr               → ISRPSRTicketForm
/psl/bulk-isrs                → BulkISRForm
/psl/follow-up                → PSLFollowUpPage
/psl/notifications            → NotificationsPage
/psl/settings                 → SettingsPage
/psl/reports                  → ReportsPage
/psl/knowledge                → KnowledgeBasePage

# Contact Person
/cp/login                     → ContactPersonLoginPage
/cp/dashboard                 → ContactPersonDashboardPage
/cp/psrs                      → ContactPersonPSRListPage
/cp/psrs/create               → ContactPersonCreatePSRPage

# Parent Portal
/parent/login                 → ParentLoginPage
/parent/dashboard             → ParentDashboardPage
/parent/create-psr            → ParentCreatePSRPage
/parent/simulate/ivr          → ParentSimulateIVRPage
/parent/simulate/email        → ParentSimulateEmailPage
/parent/tickets               → ParentPSRListPage
/parent/tickets/:psrId        → ParentPSRDetailPage
/parent/portal                → ParentPortalPage
/parent/notifications         → ParentNotificationsPage
```

### 4.3 Key Handlers

| Handler | Lines | Description |
|---------|-------|-------------|
| `handleCreateTicket` | 542-760 | Creates ISR/PSR with matrix lookup, OOO routing, TAT, audit, multi-target notifications |
| `handleBulkCreateISR` | 845-999 | Bulk ISR with OTP verification, email domain checks, matrix+OOO routing |
| `handleStatusChange` | 1061-1292 | Status transitions, ISR resolution gate, WIP history, auto-close, sequential chain advance |
| `handleLinkISR` | 1328-1456 | Creates ISR linked to parent PSR |
| `handleBulkLinkISR` | 1458-1624 | Bulk linked ISR creation |
| `handleLinkPSR` | 1626-1636 | Links PSR to PSR (duplicate/related) |
| `handleSplitTicket` | 1638-1744 | Splits ticket into parallel/sequential chain |
| `handleReopenPSR` | 1844-1911 | Reopens PSR with WIP limit checks |
| `handlePSLReopenOnBehalf` | 1844-1911 | PSL reopens on parent's behalf |
| `handleReassign` | 1913-1989 | Delegation with department/category reassign |
| `handlePSLTransfer` | 1991-2013 | PSL ownership transfer with OTP |
| `handlePSLProgressUpdate` | 2015-2020 | PSL sends update to parent |
| `handlePSLReviewClose` | 2022-2080 | PSL reviews and closes PSR |
| `handlePSLSendRework` | 2082-2106 | PSL sends ISR back for rework |
| `handleAddInternalNote` | 2119-2138 | Staff internal note |
| `handleLogCallOutcome` | 2140-2171 | Log dissatisfied call outcome |
| `handleRequestInfo` | 2173-2201 | Request info from parent (pauses SLA) |
| `handleParentClosePSR` | 2203-2267 | Parent acknowledges and closes |
| `handleAddParentComment` | 2269-2276 | Parent adds comment |
| `handleParentReopenPSR` | 2278-2283 | Parent reopens PSR |
| `handleConvertCallToTicket` | 762-792 | Converts IVR call to ticket |
| `handleMarkCallJunk` | 794-817 | Marks IVR call as junk |
| `handleSendCallToCRM` | 819-843 | Sends IVR call to CRM |
| `handleBulkClose` | 1746-1761 | Bulk close tickets |
| `handleBulkReassign` | 1763-1774 | Bulk reassign tickets |
| `handleEscalate` | 1776-1817 | Escalate ticket |
| `checkAutoEscalations` | 1819-1842 | Periodic auto-escalation check |
| `handleDecisionTicketCreate` | 1001-1059 | Creates ticket from email decision wizard |
| `handleSaveSettings` | 1776-1817 | Saves project settings |

### 4.4 Sidebar Navigation

Four sidebar variants: Admin (30+ items), PSL (12 items), Parent (4 items), Contact Person (3 items)

---

## 5. Parent Flow (Deep Analysis)

### 5.1 Parent Pages — Complete (8 pages + ParentPSRForm component)

| Page | Lines | Purpose |
|------|-------|---------|
| `ParentLoginPage.tsx` | 198 | Split-screen login with demo parent (Deepak Menon) |
| `ParentDashboardPage.tsx` | 280 | Welcome banner, stat cards, channel cards, branch locator |
| `ParentCreatePSRPage.tsx` | 62 | Creates PSR via PORTAL channel |
| `ParentPSRListPage.tsx` | 504 | Filterable PSR list with child selector, tab filters, date range |
| `ParentPSRDetailPage.tsx` | 1,359 | Full lifecycle: resolve→feedback→close/reopen, communication, ISR progress |
| `ParentPortalPage.tsx` | 305 | Legacy/view-only PSR list with reopen |
| `ParentNotificationsPage.tsx` | 612 | 12 notifications, 5 filter tabs, 3 channel filters |
| `ParentSimulateIVRPage.tsx` | 96 | Simulate phone call with ringing animation |
| `ParentSimulateEmailPage.tsx` | 148 | Simulate email to support@school.edu |

### 5.2 Parent Features
- Self-service PSR creation via Portal/IVR/Email
- Multi-child support (Sunita Mehta with 2 children)
- Ticket lifecycle: Active → Resolved (accept/close) → Reopened (one-time)
- Feedback: thumbs up/down + 1-5 stars + comment
- ISR progress visibility per linked ISR
- Communication thread with file uploads
- Notification center with read/unread/dismiss
- TAT awareness badges
- School branch locator

---

## 6. PSL Flow (Deep Analysis)

### 6.1 PSL Pages — Complete (7 pages)

| Page | Lines | Purpose |
|------|-------|---------|
| `PSLLoginPage.tsx` | 376 | Split-screen with 3 demo PSL accounts |
| `PSLDashboardPage.tsx` | 887 | Dual PSR/ISR views, SLA health, triage, batch review |
| `PSLPSRListPage.tsx` | 1,103 | 10-filter queue with bulk ops, CSV export, pagination |
| `PSLPSRDetailPage.tsx` | 1,890 | 5 tabs, SLA countdown, transfer wizard, merge detection |
| `PSLReviewClosePage.tsx` | 241 | ISR checklist + closure templates + rework |
| `PSLFollowUpPage.tsx` | 588 | Dissatisfied follow-up queue with call outcomes |
| `PSLIVRListPage.tsx` | 836 | IVR calls with audio, transcription, PSR/SR conversion |

### 6.2 PSL Features
- Dual PSR/ISR workspace dashboard
- SLA health monitoring with compliance %
- Since-last-visit triage (new PSRs, resolved ISRs, approaching breaches)
- 10-dimension filter queue: student, search, status, school, priority, agent, SLA, WIP date, date range, sort
- Bulk operations: close, reassign, WIP, link ISR
- PSL transfer: 4-step OTP-verified ownership transfer
- Progress updates to parent
- Review & close: ISR checklist with rework
- Call outcome logging: 4 options (satisfied, dissatisfied, reopen, document)
- IVR conversion: audio player, transcription, classification
- Internal notes, student activity, merge detection

---

## 7. Agent/Admin Flow (Internal)

### 7.1 Complete Page List (39 pages)

**PSR Pages (8):**
| Page | Lines | Purpose |
|------|-------|---------|
| `PSRCreatePage.tsx` | 881 | 6-step staff / 5-step parent PSR creation wizard |
| `PSRTicketDetailPage.tsx` | 2,304 | Full PSR lifecycle: 6 tabs, 9 modals |
| `PSRTicketListPage.tsx` | 428 | Filterable PSR list with 11 filters, 6 sortable columns |
| `PSRDashboardPage.tsx` | 387 | 12-bucket operational dashboard |
| `PSRCategoryMasterPage.tsx` | 706 | 185 subcategories, 11 departments, CSV import/export |
| `PSRMatrixRulesPage.tsx` | 616 | Assignment matrix: filter, detail panel, CSV import/export |
| `PSRStatusMapPage.tsx` | 333 | Visual status transition reference |

**Ticket Pages (3):**
| Page | Lines | Purpose |
|------|-------|---------|
| `TicketDetailPage.tsx` | 1,283 | General ISR+PSR detail with SLA countdown, linked tickets |
| `InboxPage.tsx` | 182 | Agent inbox (assignedTo filter) |
| `OutboxPage.tsx` | 185 | Requester outbox (createdBy filter) |
| `ViewTickets.tsx` | — | Simple ticket viewer |

**Admin Pages (11):**
| Page | Lines | Purpose |
|------|-------|---------|
| `DashboardPage.tsx` | 238 | Overview with ISR/PSR tabs, stat cards |
| `BulkImportPage.tsx` | 485 | 5-step CSV bulk import (upload→map→preview→validate→complete) |
| `ReportsPage.tsx` | 699 | 6-tab reports: Aging, Resolved, Unassigned, Feedback, IVR, VPMS |
| `DigestPreviewPage.tsx` | 217 | Daily digest generator with email preview |
| `KnowledgeBasePage.tsx` | 587 | Document management with upload/edit/delete/preview |
| `EscalationMonitorPage.tsx` | 175 | Escalation monitoring by priority |
| `EscalationSettingsPage.tsx` | 303 | Escalation rule CRUD |
| `MailboxRoutingPage.tsx` | 342 | Mailbox routing with keyword overrides, source channels |
| `UserManagementPage.tsx` | 283 | User CRUD with bulk select, transfer modal |
| `SettingsPage.tsx` | 273 | Project settings: TAT, auto-close, linked ISR behavior |
| `AuditLogPage.tsx` | — | Audit log viewer with filtering |

**Other Pages (9):**
| Page | Lines | Purpose |
|------|-------|---------|
| `UserGroupsPage.tsx` | — | User group management |
| `OOOSettingsPage.tsx` | — | Out-of-office assignments |
| `NotificationsPage.tsx` | — | In-app notifications |
| `CCMatrixPage.tsx` | — | CC matrix configuration |
| `AssignmentMatrixPage.tsx` | — | Assignment matrix overview |
| `PrincipalQueuePage.tsx` | — | Principal's ticket queue |
| `PrototypeNotesPage.tsx` | — | Prototype design notes |
| `TaskManagerPage.tsx` | — | Task management |
| `RoomBookingPage.tsx` | — | Room booking calendar |

**Vendor Pages (4):**
| `VendorPortalPage.tsx` | — | Vendor-facing portal |
| `VendorAssignmentPage.tsx` | — | Vendor assignment management |
| `VPMSCostApprovalPage.tsx` | — | Vendor cost approval |
| `VPMSDashboardPage.tsx` | — | Vendor performance dashboard |

**VSR Pages (3):**
| `VSRCreatePage.tsx` | — | VSR creation |
| `VSRTicketDetailPage.tsx` | — | VSR detail |
| `VSRTicketListPage.tsx` | — | VSR list |

### 7.2 PSR Creation Wizard Details

**6 Staff Steps:** Student lookup → Classify (Department→Category→Subcategory) → Details (description, contact mode) → Attachments → Preview (routing results) → Success

**5 Parent Steps:** Child selector → Classify → Details → Attachments → Success

**Route Types:** PSL Route | SPA Coordinator Route | Vertex/SSD Route

### 7.3 PSR Detail Page — 6 Tabs + 9 Modals

**6 Tabs:** Overview | Communication | History | Attachments | Linked | Audit

**9 Modals:** WIPModal, ResolveModal, ReassignModal, ISRReassignModal, EscalateModal, ReplyModal, SplitToISRsModal, ReopenBehalfModal, AskParentModal

### 7.4 PSR Dashboard — 12 Buckets

| Bucket | Label | Color |
|--------|-------|-------|
| total | Total SRs Raised | Gray |
| withinTAT | Within TAT | Emerald |
| dueForEscalation | Due for Escalation (≤24h) | Amber |
| outsideTAT | Outside TAT | Red |
| wipDueToday | WIP Due Today | Amber |
| wipOverdue | WIP Overdue | Red |
| wipFuture | WIP Future Date | Blue |
| reopenedByParent | Reopened by Parent | Orange |
| reopenedWIP | Reopened → WIP | Orange |
| resolvedPendingPSL | Resolved – Pending PSL | Purple |
| resolvedPendingParent | Resolved – Pending Parent | Violet |
| awaitingInfo | Awaiting Information | Slate |
| closed | Closed PSRs | Gray |

### 7.5 BulkImportPage — 5-Step Wizard

1. **Upload** — CSV file with drag target + download template
2. **Map** — Map CSV columns to ticket fields (auto-mapping by name match)
3. **Preview** — First 50 rows with valid/invalid icons
4. **Validate** — Per-row errors with field + message
5. **Complete** — Summary: total, imported, skipped, errors + import history

### 7.6 ReportsPage — 6 Tabs

1. **Aging Report** — 7+ day tickets, severity levels, CSV export
2. **Resolved Tickets** — Bulk close with select-all
3. **Unassigned** — Bulk reassign
4. **Feedback** — Satisfaction rate, avg rating, reopen rate, star distribution
5. **IVR Report** — Call counts, conversion rate, duration, status breakdown
6. **Vendor Performance (VPMS)** — VSR stats, type breakdown

### 7.7 MailboxRoutingPage

- 10 pre-configured mailboxes
- Keyword overrides (add/remove per mailbox)
- Source channel toggles: All/Web/Email/WhatsApp/IVR
- Acknowledgment template per mailbox
- School-based routing rules

### 7.8 UserManagementPage

- 5 mock users with Active/Inactive toggle
- Bulk selection with floating action bar
- Replace/Transfer Data modal, Delete button
- "Add from HRMS" and "Bulk Upload" buttons

### 7.9 SettingsPage

- General: Project Name, Max WIP Attempts (1-10), Daily Digest Time
- Ticket Behavior: Linked ISR Resolution (Notify Only vs Auto-Resolve), Auto-Close toggle, Read Receipts toggle
- Auto-Closure Thresholds: Urgent (hours), High/Medium/Low (days)
- Warning Notification: 24h warning toggle, warning hours
- System Comment: toggle + template with `{{tatDays}}` placeholder
- Agent Exemption: comma-separated exempt agent emails

---

## 8. Services & Business Logic (8 files, 730 lines total)

### 8.1 `linkedTicketService.ts` (116 lines)
- `createLink(parent, child, createdBy, notes?)` — Auto-infers type (PSR→ISR, ISR→ISR, SPLIT)
- `createTicketLink()` — Explicit type
- `handleISRResolution()` — AUTO_RESOLVE vs NOTIFY
- `getLinkedTickets()` — Returns `{ parents[], children[] }`
- `areAllLinkedISRsResolved()` — Returns counts + unresolved IDs

### 8.2 `matrixService.ts` (128 lines)
- `lookupAssignment(type, category, subcategory?, location?, rules)` — Weighted scoring (category=10, subcategory=5, location=3, priority=value)
- `findAndReplace()` — Bulk replace assignee
- `parseCSV()` — Import from CSV

### 8.3 `agingService.ts` (59 lines)
- `calculateAge(ticket)` — Hours/days → severity by priority-tiered thresholds
- `getAgedTickets(tickets, minDays=7)` — Filter + sort

### 8.4 `autoCloseService.ts` (124 lines)
- `shouldAutoClose()` — Info-category + TAT exceeded + read receipt
- `shouldWarn()` — Warning before auto-close
- `hasExceededTAT()` — Effective elapsed minus pause
- `markAsRead()` / `hasRead()` / `getReadReceipt()` — Read receipt tracking
- Default TAT: URGENT=24h, HIGH=3d, MEDIUM=7d, LOW=14d

### 8.5 `escalationService.ts` (108 lines)
- `shouldEscalate()` — Match rules by priority, escalate if hours ≥ threshold
- `createEscalationEvent()` — Build event with notification list
- `findTicketsToEscalate()` — Discover + deduplicate
- `getEscalationStats()` — Aggregate by priority

### 8.6 `digestService.ts` (112 lines)
- `generateDailyDigest()` — Filter by department, categorize, detect overdue/urgent/WIP
- `formatDigestEmail()` — Plain-text email with summary, action items, category breakdown

### 8.7 `ooService.ts` (45 lines)
- `getActiveBackup()` — Find active OOO backup
- `routeWithOOO()` — Route to backup or original with wasRerouted flag

### 8.8 `wipService.ts` (38 lines)
- `canSetWIP()` — Enforce limits (3 normal, 1 after reopen)
- `getWIPCount()` / `getCurrentWIP()` — Query WIP entries

---

## 9. Components Library

### 9.1 Ticket Components (17 files)

| Component | Lines | Purpose |
|-----------|-------|---------|
| `ISRPSRTicketForm.tsx` | 1,077 | Unified create-ticket form (ISR + PSR + Bulk tabs) with react-hook-form |
| `BulkISRForm.tsx` | 941 | Bulk ISR: PER_SCHOOL/PER_RECIPIENT modes, school selection, recipient roles, preview pane |
| `TicketCard.tsx` | 153 | Card with type/status/priority badges, RE entry info |
| `LinkISRModal.tsx` | 244 | Single ISR link with auto-generated title, context banner |
| `BulkLinkISRModal.tsx` | 39 | Thin wrapper for linked bulk ISR |
| `IVRToPSRModal.tsx` | 222 | 2-step: Select Student → Fill Form with pre-filled call context |
| `LinkTicketModal.tsx` | 187 | PSR_TO_PSR, DUPLICATE, RELATED linking |
| `ParentPSRForm.tsx` | — | Parent-specific PSR creation |
| `ContactPersonPSRForm.tsx` | — | Contact person PSR creation |
| `PsrFormStep.tsx` | 369 | Classification search combobox, priority selector, context banner |
| `SplitTicketModal.tsx` | — | Ticket splitting (parallel/sequential) |
| `ReassignModal.tsx` | — | Ticket reassignment |
| `ConvertSRModal.tsx` | — | SR to ticket conversion |
| `WIPStatusModal.tsx` | — | WIP date picker |
| `StatusHistory.tsx` | — | Status change timeline |
| `DelegationHistory.tsx` | — | Delegation events |
| `EscalationHistory.tsx` | — | Escalation events |
| `SRForm.tsx` | — | Service Request form |

### 9.2 Shared Components (3 files)
- `StatusBadge.tsx` (214 lines) — Unified badge system: StatusBadge, PriorityBadge, ChannelBadge, SourceBadge with 7 PSR source channel icons
- `SearchableSelect.tsx` (98 lines) — Searchable dropdown with clear, click-outside, auto-focus
- `NotificationBell.tsx` — Bell icon with unread count badge

### 9.3 Matrix Components (3 files)
- `MatrixRuleEditor.tsx` — Add/edit/copy matrix rules
- `MatrixImport.tsx` — CSV import with preview and validation
- `FindReplace.tsx` — Find-and-replace assignee across rules

### 9.4 Other Components
- `EmailDecisionWizard.tsx` — Multi-step email decision workflow
- `ImageWithFallback.tsx` — Image with fallback
- `UserSwitcher.tsx` — Role switcher for prototyping
- `UserTransferModal.tsx` — Bulk data transfer between users
- `SLAHealthCard.tsx` (79 lines) — PSL dashboard SLA health bar

### 9.5 UI Components (48 shadcn/ui)
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip + utils

---

## 10. Utility Functions (Complete — 28 files)

### 10.1 Core Utilities

| File | Lines | Key Exports |
|------|-------|-------------|
| `psl.ts` | 46 | `getPSLForSchool()`, `calculateISRProgress()`, `isReviewReady()`, `getParentPSR()` |
| `ticket.ts` | 33 | `hasUnreadUpdates()`, `formatStatus()`, `formatChannel()` |
| `bulkISR.ts` | 337 | `validateBulkISRRequest()`, `resolveBulkISRRecipients()`, `generateBulkISRRows()`, `summarizeBulkISRRows()`, 10 recipient roles |
| `priorityMatrix.ts` | 40 | `getAutoPriority()` — 11 category defaults + 12 subcategory overrides |
| `requesterDirectory.ts` | 104 | `findRequesterByEmail()`, `searchRequesterDirectory()`, `createRequesterOtp()`, `verifyRequesterOtp()` |
| `emailDecisionData.ts` | 676 | 16 decision actions, form configs, auto-response templates, auto-forward targets, escalation config |
| `knowledgeStore.ts` | 93 | Reactive singleton store: CRUD, view/download tracking, listeners |
| `useKnowledgeDocs.ts` | — | Knowledge doc hooks |

### 10.2 Mock Data Files

| File | Lines | Content |
|------|-------|---------|
| `mockPSRData.ts` | 1,196 | 27 PSR tickets, 12 bucket types, filter functions |
| `mockData.ts` | 427 | 14 tickets (7 ISR + 7 PSR), 2 link records |
| `mockParentData.ts` | 460 | Demo parent + 5 PSR + 6 ISR + 3 links |
| `mockPSLRoster.ts` | 43 | 4 PSL entries with school assignments |
| `mockPSRCategories.ts` | — | 185 subcategories across 11 departments |
| `mockSchoolData.ts` | 569 | Clusters, schools, departments, categories, students, parents, employees, vendors, email threads, 14 role personas, navigation map, 8 page templates |
| `mockStudentData.ts` | 234 | 10 students with parents, multi-child family, IVR phone mapping, `normalizePhone()`, `getChildrenByPhone()` |
| `mockVSRData.ts` | 283 | 15 VSR tickets, 5 vendor assignments, 10 approval templates |
| `mockIVRData.ts` | 397 | 23 IVR calls with follow-ups, transcriptions, bucket filters |
| `mockEmailData.ts` | 1,023 | 17 emails with decision system, escalation config, bucket filters |
| `mockLinkingData.ts` | 36 | OOO assignment, project config |
| `mockTaskData.ts` | 46 | 15 tasks, task buckets |
| `mockRoomBookingData.ts` | 65 | 10 rooms, 13 bookings, `getRoomAvailability()` |
| `mockCategoryTree.ts` | 49 | Flattened sub-subcategory tree for `searchSubSubcategories()` |
| `mockUserData.ts` | 69 | 5 management users |
| `mockMatrixData.ts` | — | Matrix rules mock data |
| `mockKnowledgeData.ts` | — | Knowledge base docs |
| `mockEmailData.ts` | 1,023 | Email records with timelines |
| `mockIVRData.ts` | 397 | IVR call records |
| `mockLinkingData.ts` | 36 | Linking + OOO + project config |
| `mockVSRData.ts` | 283 | Vendor service requests |
| `mockUserData.ts` | 69 | User management data |
| `mockTaskData.ts` | 46 | Task items |
| `mockRoomBookingData.ts` | 65 | Room booking data |
| `mockCategoryTree.ts` | 49 | Category tree |
| `ivrCategories.ts` | 25 | IVR-specific SR categories (Vendor, Job App, Others) |
| `emailDecisionData.ts` | 676 | Email decision tree system |

### 10.3 School Data Details (`mockSchoolData.ts` — 569 lines)

**5 Clusters:** Central Zone, North Zone, South Zone, East Zone, West Zone

**6 Schools:** Springfield Elementary, Oakwood High School, Maple Grove Academy, Riverdale Public School, Greenwood International, Valley View School — each with principal info, cluster, phone, address

**10 Departments:** IT, Facilities, HR, Finance, Transport, Library, Parent Services, Academic Admin, Security, Housekeeping — each with SPOC (name, email, phone, employee code)

**7 ISR Categories** with subcategories (see Section 2.1)

**6 PSR Categories** with subcategories:
- Academic: Exam Schedule, Report Card, Teacher Feedback, Subject Change, Curriculum Query, Homework Help, Extra Class
- Attendance: Leave Request, Absent Record, Late Entry, Early Departure
- Behavior: Bullying, Disciplinary, Counseling
- Fee & Finance: Fee Receipt, Online Payment, Fee Structure, Scholarship, Refund
- Transport: Bus Route, Bus Pass, Vehicle Complaint, Pickup/Drop Change
- General Inquiry: Admission, Transfer Certificate, Bonafide, Document Request, PTM, Canteen, Others

**8 Students:** with class, roll number, school, parent references

**7 Parents:** with contact info, linked students

**8 Employees:** with role, department, school, employee code

**4 Vendors:** with primary users, sub-users, categories served, contract dates, SLA hours:
- TechServe Solutions (IT, 10 sub-users)
- CleanMax Facilities (Housekeeping, 5 sub-users)
- SecureGuard Services (Security, 3 sub-users)
- EduTrans Logistics (Transport, 2 sub-users)

**4 Email Threads** for email dashboard

**14 Role Personas:** PARENT, RE, PSL, FUNCTIONAL_SPOC, PRINCIPAL, VICE_PRINCIPAL, SSD, VERTEX_USER, RO, SDO, PARENT_SERVICES_TEAM, VENDOR_PRIMARY, VENDOR_SUB, ADMIN — each with description, permissions, portal, contact channel, examples

**Navigation Map:** Core Operations, Configuration, Monitoring, Portals, Reference sections

**8 Page Templates:** Dashboard, List, Detail, Create Form, Action Modal, Report, Settings/Matrix, Audit/History — with `usedBy` and `keyElements`

### 10.4 Student Data Details (`mockStudentData.ts` — 234 lines)

**10 Students** with enrollment numbers, class/section, DOB, gender, school, parent records

**Multi-Child Parent:** Sunita Mehta with 2 children (Priya in Class XI, Rohan in Class IV)

**Staff Roles:** PSL, RE, Admin, Cluster Head

**IVR Phone Mapping:** `IVR_PHONE_TO_CHILDREN` maps phone numbers to arrays of StudentRecord for 7 parent scenarios

**Phone Normalization:** `normalizePhone()` strips non-digits, handles +91 and leading 0, returns last 10 digits

**Lookup Function:** `getChildrenByPhone(phone)` returns children for a given phone number

---

## 11. Configuration & Constants

### 11.1 `permissions.ts` (40 lines)
- `TICKET_TYPES` — ISR, PSR, ALL
- `TICKET_STATUSES` — 7 statuses
- `ISR_CATEGORIES` — 5 categories
- `PSR_CATEGORIES` — 7 categories
- Types: `TicketType`, `TicketStatus`, `ISRCategory`, `PSRCategory`

### 11.2 `isrFieldOptions.ts` (83 lines)
Generates field options by merging mock data with matrix rules:
- `isrCategoryOptions`, `getISRSubcategoryOptions(category)`
- `departmentOptions`, `schoolOptions`, `clusterOptions`
- `priorityOptions`, `toolTypeOptions`, `getLocationOptions(schoolId?)`

### 11.3 `ivrCategories.ts` (25 lines)
IVR-specific SR categories (NOT part of PSR category master):
- VENDOR: Vendor/Business → Procurement, priority MEDIUM
- JOB_APPLICATION: Career → HR Team, priority LOW
- OTHERS: General Inquiry → Administration Support, priority MEDIUM

---

## 12. Mock Data Ecosystem (Complete)

### Summary of All Mock Files

| # | File | Lines | Records | Purpose |
|---|------|-------|---------|---------|
| 1 | `mockPSRData.ts` | 1,196 | 27 PSR tickets | All PSR statuses, channels, buckets |
| 2 | `mockData.ts` | 427 | 14 tickets | Base ISR+PSR for admin dashboard |
| 3 | `mockParentData.ts` | 460 | 5 PSR + 6 ISR | Parent portal demo data |
| 4 | `mockPSLRoster.ts` | 43 | 4 PSLs | PSL-to-school assignment |
| 5 | `mockPSRCategories.ts` | — | 185 subcats | 11 departments |
| 6 | `mockSchoolData.ts` | 569 | Various | Schools, depts, categories, students, parents, employees, vendors, 14 personas, nav map, 8 templates |
| 7 | `mockStudentData.ts` | 234 | 10 students | With parents, IVR phone mapping |
| 8 | `mockVSRData.ts` | 283 | 15 VSR | Vendor tickets + 10 approval templates |
| 9 | `mockIVRData.ts` | 397 | 23 calls | IVR records with follow-ups |
| 10 | `mockEmailData.ts` | 1,023 | 17 emails | Email records with timelines |
| 11 | `mockLinkingData.ts` | 36 | 1 OOO + 1 config | OOO assignment + project config |
| 12 | `mockTaskData.ts` | 46 | 15 tasks | Task management |
| 13 | `mockRoomBookingData.ts` | 65 | 10 rooms + 13 bookings | Room booking |
| 14 | `mockCategoryTree.ts` | 49 | 185 nodes | Flattened search tree |
| 15 | `mockUserData.ts` | 69 | 5 users | User management |
| 16 | `mockMatrixData.ts` | — | — | Matrix rules |
| 17 | `mockKnowledgeData.ts` | — | — | Knowledge base docs |
| 18 | `mockEmailData.ts` | 1,023 | 17 emails | Email records |
| 19 | `emailDecisionData.ts` | 676 | 16 actions | Email decision tree |
| 20 | `requesterDirectory.ts` | 104 | Dynamic | Requester lookup |

---

## 13. Root Configuration & Entry Points

### 13.1 `package.json` (84 lines)
- **Name:** `@figma/my-make-file` (Figma plugin project)
- **Package manager:** pnpm with vite override
- **83 dependencies:** React 18.3, React Router 7.13, shadcn/ui (48 Radix packages), MUI 7.3, Tailwind 4.1, react-hook-form 7.55, date-fns 3.6, lucide-react 0.487, recharts 2.15, react-dnd 16.0, embla-carousel-react 8.6, sonner 2.0, next-themes 0.4, canvas-confetti 1.9, motion 12.23, vaul 1.1, cmdk 1.1, input-otp 1.4, react-slick 0.31, react-responsive-masonry 2.7, react-resizable-panels 2.1, class-variance-authority 0.7, clsx 2.1, tailwind-merge 3.2
- **9 devDependencies:** Vite 6.3, TypeScript 6.0, Tailwind 4.1, Playwright 1.60, agentation 3.0

### 13.2 `vite.config.ts` (36 lines)
- **Custom plugin:** `figmaAssetResolver()` — resolves `figma:asset/` imports to `src/assets/`
- **Plugins:** React, Tailwind, Figma asset resolver
- **Alias:** `@` → `./src`
- **Assets include:** `**/*.svg`, `**/*.csv`

### 13.3 `main.tsx` (7 lines)
```tsx
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
createRoot(document.getElementById("root")!).render(<App />);
```

### 13.4 `README.md`
Setup instructions for pnpm, Node.js 18+, fix-pnpm.cmd, troubleshooting

---

## 14. Sprint Roadmap

**File:** `src/imports/pasted_text/sprint-2-3-roadmap.md` (508 lines)

Covers Sprints 2-5 with backend/frontend task breakdowns and user stories:

| Sprint | Focus | Key Deliverables |
|--------|-------|-----------------|
| **2** | Assignment Matrix & Auto-Assignment | Matrix lookup, auto-assignment, user groups, CSV import, Find & Replace |
| **3** | Status Workflow & WIP Management | WIP with future dates, max attempts (3 normal, 1 after reopen), reopen logic, closure rights, change history, cron notifications |
| **4** | PSR↔ISR Linking & Bulk Operations | Linked ISRs, auto-update (NOTIFY/AUTO_RESOLVE), split, bulk close/reassign, OOO routing, schedule dispatch, aging service |
| **5** | Reports, Alerts, Audit & Polish | Dashboard aggregation, aging report, dept head alerts, daily digest cron, audit logs, vendor portal auth, auto-close, read receipts |

**Total estimated effort:** ~200 hours across all sprints

---

## 15. Test Files

4 test files found:

| File | Purpose |
|------|---------|
| `src/app/types/rbac.test.ts` | RBAC permission tests |
| `src/app/utils/requesterDirectory.test.ts` | Requester directory search tests |
| `src/app/utils/bulkISR.test.ts` | Bulk ISR validation/generation tests |
| `src/app/config/isrFieldOptions.test.ts` | ISR field options tests |

---

## 16. Complete Feature Checklist

### Core Ticketing
- [x] ISR creation (standalone, linked, bulk-per-school, bulk-per-recipient, bulk-linked, split, from-email, CSV import)
- [x] PSR creation (staff 6-step, parent self-service, contact person, IVR conversion, email conversion, walk-in)
- [x] 7 statuses lifecycle (OPEN → IN_PROGRESS → WIP → RESOLVED → CLOSED → REOPENED → ESCALATED)
- [x] VSR status pipeline (SUBMITTED → IN_REVIEW → ASSIGNED → IN_PROGRESS → RESOLVED → COMPLETED)
- [x] IVR status pipeline (NEW → ASSIGNED → PROCESSING → CONVERTED/SR/CRM/JUNK → CLOSED)
- [x] Ticket reopening (parent-initiated, one-time limit; PSL on behalf)
- [x] Ticket splitting (parallel + sequential with auto-advance)
- [x] Ticket linking (6 types: PSR_TO_ISR, ISR_TO_ISR, SPLIT, PSR_TO_PSR, DUPLICATE, RELATED)
- [x] Ticket merging (duplicate detection)
- [x] Offline/RE entry with OTP verification + requester directory lookup
- [x] CSV bulk import (5-step wizard)
- [x] CSV export (reports, matrix, categories)

### Assignment & Routing
- [x] Matrix-based auto-assignment (weighted scoring: category=10, subcategory=5, location=3)
- [x] Manual assignee override with email validation
- [x] Out-of-Office auto-routing to backup
- [x] CSV import/export for matrix rules
- [x] Find-and-replace assignee across rules
- [x] Priority auto-determination (11 category defaults + 12 subcategory overrides)
- [x] Priority manual override
- [x] Scheduled dispatch date
- [x] Mailbox routing with keyword overrides + source channel rules
- [x] User groups for CC/bulk assignment

### SLA & TAT
- [x] TAT calculation per priority
- [x] TAT breach detection
- [x] TAT breach imminent warning
- [x] SLA pause/resume (awaiting info from parent)
- [x] Real-time SLA countdown (1-second ticking timer)
- [x] Effective elapsed time (minus SLA pause duration)
- [x] TAT-based auto-close for information categories
- [x] Auto-close warning period (configurable hours)
- [x] Auto-close exemption for specific agents
- [x] Auto-close system comment with template
- [x] Working hours calendar for email escalation (Mon-Sat 08:30-17:30)

### WIP Management
- [x] WIP status with committed future date
- [x] WIP attempt tracking (max 3 normal, max 1 after reopen)
- [x] WIP due today/overdue detection
- [x] WIP rework flow (PSL sends ISR back with reason)
- [x] WIP date picker modal

### Escalation
- [x] 4 default escalation rules (URGENT:24h, HIGH:72h, MEDIUM:168h, LOW:336h)
- [x] Auto-escalation on SLA breach
- [x] Manual escalation
- [x] Escalation event tracking + history
- [x] Escalation monitoring dashboard (by priority)
- [x] Escalation rule CRUD
- [x] Auto-reassign on escalation
- [x] Dept head + notify list notifications
- [x] Email-specific escalation (L1=8h, L2=12h working hours)

### PSL Workspace
- [x] PSL login (email/password + 3 demo accounts)
- [x] Dual PSR/ISR dashboard with 6 stat cards per view
- [x] SLA health card with compliance %
- [x] Since-last-visit triage (new PSRs, resolved ISRs, approaching breaches)
- [x] Quick actions (Create ISR + Bulk ISRs)
- [x] Needs attention (breached table)
- [x] Parent reply expected monitoring
- [x] WIP ISR monitoring with days-in-WIP counter
- [x] Today/This Week summary
- [x] Batch review modal
- [x] 10-dimension filter queue with bulk operations
- [x] CSV export
- [x] 5-tab PSR detail with SLA countdown
- [x] Status control toggle (PSL vs Assignee)
- [x] 4-step PSL transfer with OTP
- [x] Progress updates to parent with templates
- [x] Review & close with ISR checklist + rework
- [x] Dissatisfied follow-up with 4 call outcomes
- [x] Reopen-on-behalf with principal routing
- [x] IVR conversion to PSR/SR with audio + transcription
- [x] Internal notes (staff-only)
- [x] Student activity history
- [x] Merge/duplicate detection
- [x] Sequential chain view
- [x] Keyboard shortcuts reference

### Parent Portal
- [x] Parent login (demo account)
- [x] Dashboard with welcome banner, stats, channel cards
- [x] PSR creation (portal channel)
- [x] Child selector (multi-child support)
- [x] PSR list with status tabs, search, category filter, date range, sort
- [x] PSR detail with lifecycle stepper
- [x] Resolution acknowledgment (close confirmed resolution)
- [x] One-time reopen with reason
- [x] Satisfaction feedback (thumbs + 5-star + comment)
- [x] Communication thread with file uploads
- [x] ISR progress visibility per linked ISR
- [x] Notification center (12 notifications, 5 filter tabs, 3 channel filters)
- [x] Dismissable notifications, mark-all-read
- [x] Action-required banner
- [x] TAT awareness badges
- [x] School branch locator
- [x] IVR simulation (phone call with ringing)
- [x] Email simulation
- [x] Legacy portal view

### Contact Person
- [x] Contact person login
- [x] Dashboard with stats
- [x] PSR creation
- [x] PSR list

### Notifications
- [x] 16 system notification types
- [x] Multi-channel delivery (EMAIL, SMS, IN_APP)
- [x] Notification on all major events (create, assign, status change, resolve, reopen, close, escalate, WIP, linked ISR, PSL update)
- [x] 11 parent-specific notification display types
- [x] Grouped by date (Today, Yesterday, older)
- [x] Mark-all-read, per-item tracking, dismissable

### Dashboard & Analytics
- [x] Admin overview dashboard (ISR/PSR tabs)
- [x] PSR operational dashboard (12 buckets)
- [x] PSL dashboard (dual view with 6 stat cards)
- [x] Parent dashboard (3 stat cards)
- [x] Status distribution bar charts
- [x] Channel breakdown with percentages
- [x] 6-tab reports page (Aging, Resolved, Unassigned, Feedback, IVR, VPMS)
- [x] Daily digest generator with email preview
- [x] Escalation monitoring dashboard

### Email System
- [x] Email inbox/dashboard/detail
- [x] Email with 17 realistic mock records
- [x] Email Decision Wizard with 16 actions
- [x] Sender categorization (4 types)
- [x] Email escalation (working hours, L1/L2 thresholds)
- [x] Auto-response templates for 5 actions
- [x] Auto-forward targets for 4 actions
- [x] Email-to-ticket conversion (PSR/ISR)
- [x] Email thread viewer and composer
- [x] Email report page

### IVR System
- [x] IVR call list/dashboard/detail
- [x] 23 mock IVR calls with transcriptions
- [x] Audio player for call recordings
- [x] IVR to PSR/SR conversion
- [x] IVR classification (Parent, CRM Lead, Vendor, Job Applicant, Junk, Others)
- [x] IVR status pipeline
- [x] IVR phone-to-children mapping (7 scenarios)
- [x] Phone normalization for Indian numbers
- [x] IVR follow-up tracking

### VPMS / Vendor System
- [x] VSR ticket creation, list, detail
- [x] Vendor portal
- [x] Vendor assignment management
- [x] Cost approval workflow (10 templates)
- [x] Vendor performance dashboard
- [x] 4 vendors with sub-users and categories

### Knowledge Base
- [x] Document management (CRUD)
- [x] Upload dialog with metadata
- [x] Preview dialog with stats
- [x] Edit and delete with confirmation
- [x] Category and scope filtering
- [x] View and download tracking
- [x] Search + sort (4 options)
- [x] Reactive singleton store with listeners

### Task Manager
- [x] 15 mock tasks (5 categories)
- [x] Task buckets (total, pending, inProgress, completed, overdue)

### Room Booking
- [x] 10 rooms (6 types) with facilities
- [x] 13 bookings with recurring support
- [x] Availability calculation for recurring bookings

### Additional Features
- [x] User management with bulk select + transfer
- [x] Role-based sidebar (4 variants)
- [x] User switcher for prototyping
- [x] Notification bell with count
- [x] Keyboard shortcuts
- [x] Pagination with configurable page size
- [x] URL search params sync
- [x] localStorage persistence
- [x] Searchable selects with autocomplete
- [x] Cascading selects (Department→Category→Subcategory)
- [x] Drag-and-drop file uploads
- [x] Status color-coding throughout
- [x] Real-time countdown timers
- [x] Toast notifications (sonner)
- [x] Breadcrumb navigation
- [x] Stepper components
- [x] Expandable rows
- [x] Tooltips and command palette (cmdk)
- [x] Dark/light theme (next-themes)
- [x] Carousel (embla)
- [x] Charts (recharts)
- [x] Form validation (react-hook-form)
- [x] Drag and drop (react-dnd)
- [x] Responsive masonry layout
- [x] Resizable panels
- [x] Image carousel (react-slick)
- [x] Confetti animation
- [x] OTP input component

---

## 17. Complete File Inventory (Verified)

### 17.1 Type Definitions (10 files)
```
src/app/types/ticket.ts           (135 lines) — BaseTicket, ISRTicket, PSRTicket, TicketFormData
src/app/types/rbac.ts             (100 lines) — UserRole, User, RBACService
src/app/types/rbac.test.ts        — RBAC tests
src/app/types/linking.ts          (85 lines)  — LinkedTicket, TicketSplit, OOOAssignment, ProjectConfig, TicketChain
src/app/types/notification.ts     (121 lines) — 16 NotificationTypes, NotificationService
src/app/types/wip.ts              (40 lines)  — WIPEntry, StatusChange, DelegationHistory, WIP_CONFIG
src/app/types/audit.ts            (51 lines)  — AuditLog, AuditService
src/app/types/escalation.ts       (67 lines)  — EscalationRule, EscalationEvent, 4 default rules
src/app/types/matrix.ts           (45 lines)  — MatrixRule, UserGroup, MatrixLookupResult
src/app/types/bulkISR.ts          (60 lines)  — BulkISR types
```

### 17.2 Services (8 files, 730 lines)
```
linkedTicketService.ts (116), matrixService.ts (128), agingService.ts (59),
autoCloseService.ts (124), escalationService.ts (108), digestService.ts (112),
ooService.ts (45), wipService.ts (38)
```

### 17.3 Pages (67 files)

**Admin/Internal (39 pages):**
```
DashboardPage, TicketDetailPage, ViewTickets, InboxPage, OutboxPage,
PSRCreatePage, PSRTicketDetailPage, PSRTicketListPage, PSRDashboardPage,
PSRCategoryMasterPage, PSRMatrixRulesPage, PSRStatusMapPage,
BulkImportPage, ReportsPage, DigestPreviewPage, KnowledgeBasePage,
EscalationMonitorPage, EscalationSettingsPage, MailboxRoutingPage,
UserManagementPage, UserGroupsPage, OOOSettingsPage, SettingsPage,
NotificationsPage, CCMatrixPage, AssignmentMatrixPage, PrincipalQueuePage,
PrototypeNotesPage, AuditLogPage, TaskManagerPage, RoomBookingPage,
VendorPortalPage, VendorAssignmentPage, VPMSCostApprovalPage, VPMSDashboardPage,
VSRCreatePage, VSRTicketDetailPage, VSRTicketListPage
```

**PSL (7 pages):**
```
PSLDashboardPage, PSLLoginPage, PSLPSRListPage, PSLPSRDetailPage,
PSLReviewClosePage, PSLFollowUpPage, PSLIVRListPage
```

**Parent (9 pages):**
```
ParentLoginPage, ParentDashboardPage, ParentCreatePSRPage,
ParentPSRListPage, ParentPSRDetailPage, ParentPortalPage,
ParentNotificationsPage, ParentSimulateIVRPage, ParentSimulateEmailPage
```

**Contact Person (3 pages):**
```
ContactPersonCreatePSRPage, ContactPersonPSRListPage, ContactPersonDashboardPage
```

**Email (6 pages):**
```
EmailDashboardPage, EmailDetailPage, EmailEscalationPage,
EmailInboxPage, EmailReportPage, EmailRepositoryPage
```

**IVR (3 pages):**
```
IVRDashboardPage, IVRCallListPage, IVRCallDetailPage
```

### 17.4 Components (73 files)
- **48** shadcn/ui components
- **17** ticket components
- **3** shared components
- **3** matrix components
- **2** user components
- **1** email component
- **1** figma component
- **1** PSL dashboard sub-component (`SLAHealthCard.tsx`)

### 17.5 Utilities (28 files)
All listed in Section 10.

### 17.6 Configuration & Entry (7 files)
```
src/app/App.tsx                        (3,421 lines)
src/app/main.tsx                       (7 lines)
src/app/constants/permissions.ts       (40 lines)
src/app/config/isrFieldOptions.ts      (83 lines)
src/app/config/isrFieldOptions.test.ts
vite.config.ts                         (36 lines)
package.json                           (84 lines)
```

### 17.7 Root Files (15 files)
```
README.md, .opencode.json, opencode.json, .mcp.json, pnpm-workspace.yaml,
pnpm-lock.yaml, ATTRIBUTIONS.md,
PSL_FIX_PLAN.md, PSL_ENHANCEMENT_PLAN.md, PSL_DASHBOARD_REDESIGN.md,
PSL_FLOW_IMPLEMENTATION_PLAN.md, PSR_LINK_FEATURE_PLAN.md,
psr-detail-snapshot.yml, ivr_conversion_flows.md,
task_plan.md, findings.md, progress.md,
VISUAL_CHANGES_SUMMARY.md, TABLE_STRUCTURE_IMPROVEMENTS.md,
ISR_PSR_COMPREHENSIVE_DOCUMENTATION.md (this file)
```

### 17.8 Sprint Docs (1 file)
```
src/imports/pasted_text/sprint-2-3-roadmap.md (508 lines)
```

### 17.9 Debug Files (2 files)
```
debug_pdf.js, debug_pdf_view.js
```

### 17.10 Docs (2 files)
```
docs/MCP-SETUP.md
ISR_PSR_COMPREHENSIVE_DOCUMENTATION.md
```

---

## 18. Email & IVR Subsystems

### 18.1 Email Flow
```
Email arrives → Categorized by sender (EXISTING_PARENT / LEFT_STUDENT /
               PROSPECTIVE_PARENT / OTHERS_EXTERNAL)
             → Decision Wizard (16 possible actions)
             → Generate PSR/ISR / Respond / Forward / Mark Spam
             → Track with escalation (L1=8h, L2=12h working hours)
```

**17 mock emails** covering all 4 sender categories with realistic bodies and timelines.

### 18.2 IVR Flow
```
Phone call received → Recorded with duration, digit pressed, transcription
                   → Classified (Parent/CRM Lead/Vendor/Job Applicant/Junk)
                   → Matched to registered students via phone lookup
                   → Converted to PSR or SR
                   → Follow-up tracking
```

**23 mock IVR calls** with transcriptions, follow-ups, and conversion tracking.

---

## 19. VPMS / Vendor Subsystem

### 19.1 VSR Flow
```
VSR Created (COMPLAINT/FEEDBACK/QUERY/REQUEST)
   → IN_REVIEW → ASSIGNED (VENDOR_ONLY/SUB_ONLY/ROUND_ROBIN)
   → IN_PROGRESS → RESOLVED → COMPLETED
   → Cost Approval (optional): template → request → approve/reject
```

**4 vendors:** TechServe Solutions (IT), CleanMax Facilities (Housekeeping), SecureGuard Services (Security), EduTrans Logistics (Transport)

**10 cost approval templates** with max amounts (₹500–₹50,000) and SLA days (1-7)

---

## 20. Knowledge Base Subsystem

**`knowledgeStore.ts`** — Reactive singleton store:
- `getAll()`, `getById(id)`
- `subscribe(listener)` → unsubscribe
- `recordView(id)` → increments viewCount
- `recordDownload(id)` → increments downloadCount
- `create(input)` → auto-generates ID (DOC-021, DOC-022...), auto-registers new categories
- `update(id, patch)` → partial merge
- `remove(id)` → filter out

**`KnowledgeBasePage.tsx`** (587 lines):
- 4 stat cards + filter/search/sort
- Document cards with type badge, scope badge, stats
- Upload/Preview/Edit/Delete dialogs
- Tracks views/downloads via store

---

## 21. Task Manager Subsystem

**`mockTaskData.ts`** — 15 tasks across 5 categories:
- MAINTENANCE: Fix leaking tap, Repair bench, HVAC maintenance, Replace tube lights, Install whiteboard
- CLEANING: Deep clean computer lab, Clean auditorium, Cafeteria deep cleaning
- INSPECTION: Fire extinguisher inspection, Sports equipment inventory
- EVENT: Annual Day stage setup, Plan sports day
- ADMIN: Update student contacts, PTM feedback compilation, Update website

Task buckets: total, pending, inProgress, completed, overdue

---

## 22. Room Booking Subsystem

**`mockRoomBookingData.ts`**:
- **10 rooms** across 6 types (CLASSROOM, LAB, AUDITORIUM, MEETING_ROOM, GYM, LIBRARY)
- **13 bookings** with 4 recurring types (NONE, DAILY, WEEKLY, MONTHLY)
- `getRoomAvailability(roomId, date)` — Handles recurring bookings with date matching logic

---

## 23. Key Statistics

| Metric | Value |
|--------|-------|
| Total source files | ~176 |
| Total pages | 67 |
| Total components | 73 (48 UI + 25 domain) |
| Total services | 8 (730 lines) |
| Total types | 10 files (600+ lines) |
| Total utilities | 28 files (~5,900 lines) |
| Largest file | `App.tsx` (3,421 lines) |
| Largest page | `PSRTicketDetailPage.tsx` (2,304 lines) |
| Largest mock | `mockPSRData.ts` (1,196 lines) |
| Largest utility | `mockEmailData.ts` (1,023 lines) |
| Total handlers in App.tsx | 28 |
| Graph nodes | 1,524 |
| Graph edges | 14,773 |
| Graph communities | 15 |
| Highest cohesion | `services-service` (0.459) |
| Test files | 4 |
| Route definitions | 47+ |
| Mock PSR tickets | 27 (across all statuses) |
| Mock ISR tickets | 12+ |
| Mock VSR tickets | 15 |
| Mock IVR calls | 23 |
| Mock emails | 17 |
| Mock students | 10 (across 2 files) |
| Mock PSLs | 4 |
| Mock employees | 13+ |
| Mock vendors | 4 (with 20+ sub-users) |
| Notification types | 16 system + 11 parent display |
| Email decision actions | 16 |
| PSR subcategories | 185 (across 11 departments) |
| Role personas | 14 |
| Room bookings | 13 (10 rooms) |
| Tasks | 15 |
| Escalation rules | 4 defaults |
| User management users | 5 |
| Sprint coverage | Sprints 2-5 (~200 hrs) |
| Dependencies | 74 (65 prod + 9 dev) |

---

*Document generated via two-pass deep codebase analysis: first pass covering all major flows and types, second pass verifying every file including all mock data, utility files, root configuration, sprint documentation, and remaining pages. Code review graph analysis used for community detection, flow analysis, and structural verification.*
