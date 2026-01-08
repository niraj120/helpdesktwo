# Student Workflow - Visual Flow Diagram

## Overview Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     AGENT STUDENT WORKFLOW SYSTEM                        │
│                      Complete End-to-End Process                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 1: SEARCH STUDENT                                                  │
└─────────────────────────────────────────────────────────────────────────┘

Agent Opens Student Workflow
           │
           ▼
   ┌───────────────────┐
   │  Select Search    │
   │  Type:            │
   │  ○ All            │
   │  ○ Name           │
   │  ○ Phone          │
   │  ○ Unique ID      │
   └─────────┬─────────┘
             │
             ▼
   ┌───────────────────┐
   │  Enter Search     │
   │  Query:           │
   │  [____________]   │
   │  [Search Student] │
   └─────────┬─────────┘
             │
             ▼
   ┌─────────────────────────────┐
   │   API CALL                  │
   │   GET /api/users/           │
   │   search-students?          │
   │   query=XXX&                │
   │   searchType=YYY&           │
   │   projectId=ZZZ             │
   └──────────┬──────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
FOUND                NOT FOUND
    │                   │
    │                   │
    │                   ▼
    │         ┌──────────────────────┐
    │         │  Red Box:            │
    │         │  "No students found" │
    │         │                      │
    │         │  [Register New       │
    │         │   Student]           │
    │         └──────────┬───────────┘
    │                    │
    │                    ▼
    │         ┌────────────────────────────────────┐
    │         │  STEP 2: REGISTER NEW STUDENT      │
    │         └────────────────────────────────────┘
    │                    │
    │                    ▼
    │         ┌───────────────────────┐
    │         │  Registration Form:   │
    │         │  ┌──────────────────┐ │
    │         │  │ First Name *     │ │
    │         │  │ Last Name *      │ │
    │         │  │ Email *          │ │
    │         │  │ Phone *          │ │
    │         │  │ Unique ID *      │ │
    │         │  │ ...optional...   │ │
    │         │  │                  │ │
    │         │  │ [Register]       │ │
    │         │  └──────────────────┘ │
    │         └──────────┬────────────┘
    │                    │
    │                    ▼
    │         ┌─────────────────────────┐
    │         │  API CALL               │
    │         │  POST /api/users/       │
    │         │  register-student       │
    │         │  Body: {formData}       │
    │         └──────────┬──────────────┘
    │                    │
    │                    ▼
    │         ┌─────────────────────────┐
    │         │  ✅ Student Registered  │
    │         │  New Student ID: XXX    │
    │         └──────────┬──────────────┘
    │                    │
    ▼                    ▼
┌───────────────────────────────────────────┐
│  Green Box: Student Selected              │
│  ┌─────────────────────────────────────┐  │
│  │ ✓ Name: John Smith                 │  │
│  │   Email: john@example.com           │  │
│  │   Phone: 9876543210                 │  │
│  │   ID: STU2024001                    │  │
│  │                                     │  │
│  │   [Select Student]                  │  │
│  └─────────────────────────────────────┘  │
└──────────────────┬────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  STEP 3: CREATE TICKET                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
   ┌───────────────────────────────┐
   │  Student Info Card (Auto)     │
   │  ┌─────────────────────────┐  │
   │  │ 📝 Selected Student:    │  │
   │  │ Name: John Smith        │  │
   │  │ Email: john@example.com │  │
   │  │ Phone: 9876543210       │  │
   │  └─────────────────────────┘  │
   └──────────────┬────────────────┘
                  │
                  ▼
   ┌──────────────────────────────┐
   │  Ticket Form:                │
   │  ┌────────────────────────┐  │
   │  │ Title *               │  │
   │  │ Category * [dropdown] │  │
   │  │ Priority * [dropdown] │  │
   │  │ Description *         │  │
   │  │ [Text area]           │  │
   │  │                       │  │
   │  │ Attachments (opt)     │  │
   │  │ [Choose files]        │  │
   │  │                       │  │
   │  │ Options:              │  │
   │  │ □ Mark as Resolved    │  │
   │  │ □ Escalate           │  │
   │  │                       │  │
   │  │ [Create Ticket]       │  │
   │  └────────────────────────┘  │
   └──────────────┬───────────────┘
                  │
                  ▼
   ┌─────────────────────────────────┐
   │  API CALL                       │
   │  POST /api/tickets/             │
   │  offline-submission             │
   │  FormData: {                    │
   │    studentId: auto-populated,   │
   │    title, category, priority,   │
   │    description, files...        │
   │  }                              │
   └──────────────┬──────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────┐
   │  ✅ SUCCESS                      │
   │  Ticket #TKT-2024-001 Created   │
   │                                 │
   │  [Create Another Ticket]        │
   │  [Back to Search]               │
   └──────────────┬──────────────────┘
                  │
                  ▼
        Workflow Resets to Step 1
```

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                               │
└─────────────────────────────────────────────────────────────────────┘

AgentStudentWorkflow Component
    │
    ├── State Management
    │   ├── workflowStep: 'search' | 'register' | 'ticket'
    │   ├── searchType: 'name' | 'phone' | 'uniqueId' | 'all'
    │   ├── searchQuery: string
    │   ├── searchResults: Student[]
    │   ├── selectedStudent: Student | null
    │   ├── studentForm: Record<string, any>
    │   └── ticketForm: Record<string, any>
    │
    ├── Functions
    │   ├── handleSearchStudent()
    │   ├── selectStudent()
    │   ├── handleRegisterStudent()
    │   └── handleCreateTicket()
    │
    └── UI Components
        ├── Search Form
        ├── Registration Form
        ├── Ticket Form
        └── Progress Indicator

                    │
                    │ HTTP Requests (Axios)
                    ▼

┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND LAYER                                │
└─────────────────────────────────────────────────────────────────────┘

Express.js Server
    │
    ├── Routes (/api/users)
    │   ├── GET /search-students
    │   ├── POST /register-student
    │   └── POST /tickets/offline-submission
    │
    ├── Controllers
    │   ├── searchStudents()
    │   │   ├── Parse query params
    │   │   ├── Build MongoDB filter
    │   │   ├── Execute search query
    │   │   └── Return results
    │   │
    │   ├── registerStudent()
    │   │   ├── Validate input
    │   │   ├── Check duplicates
    │   │   ├── Create user document
    │   │   └── Return student data
    │   │
    │   └── createOfflineTicket()
    │       ├── Validate student exists
    │       ├── Process file uploads
    │       ├── Create ticket document
    │       └── Return ticket number
    │
    └── Middleware
        ├── Authentication (JWT)
        ├── Project Authorization
        ├── Input Sanitization
        └── File Upload (Multer)

                    │
                    │ MongoDB Queries
                    ▼

┌─────────────────────────────────────────────────────────────────────┐
│                         DATABASE LAYER                               │
└─────────────────────────────────────────────────────────────────────┘

MongoDB Collections
    │
    ├── users
    │   ├── Indexes:
    │   │   ├── { firstName: 1 }
    │   │   ├── { lastName: 1 }
    │   │   ├── { phone: 1 }
    │   │   ├── { uniqueId: 1 }
    │   │   ├── { email: 1 }
    │   │   └── { projectId: 1 }
    │   └── Documents:
    │       {
    │         _id, firstName, lastName, email,
    │         phone, uniqueId, projectId, role,
    │         createdAt, updatedAt
    │       }
    │
    ├── tickets
    │   ├── Indexes:
    │   │   ├── { studentId: 1 }
    │   │   ├── { projectId: 1 }
    │   │   ├── { ticketNumber: 1 }
    │   │   └── { createdAt: -1 }
    │   └── Documents:
    │       {
    │         _id, ticketNumber, studentId,
    │         projectId, title, category, priority,
    │         description, status, attachments,
    │         createdBy, createdAt, updatedAt
    │       }
    │
    └── offlineSettings
        └── Documents:
            {
              projectId, registrationFields[],
              ticketFields[], allowMarkResolved,
              allowEscalate, autoAssign
            }
```

---

## Component Hierarchy

```
AgentStudentWorkflow
├── Props
│   └── projectId: string
│
├── Hooks
│   ├── useState (10 state variables)
│   ├── useEffect (3 effects)
│   │   ├── Fetch offline settings
│   │   ├── Fetch agents
│   │   └── Fetch categories
│   └── Custom Functions (7)
│
├── Conditional Rendering
│   ├── if (settingsLoading)
│   │   └── Loading Spinner
│   │
│   ├── if (!offlineSettings)
│   │   └── Not Configured Message
│   │
│   └── switch (workflowStep)
│       ├── case 'search'
│       │   └── SearchForm Component
│       │
│       ├── case 'register'
│       │   └── RegistrationForm Component
│       │
│       └── case 'ticket'
│           └── TicketForm Component
│
└── Helper Functions
    └── renderDynamicField()
        ├── text input
        ├── email input
        ├── phone input
        ├── textarea
        ├── dropdown
        ├── category dropdown
        ├── date input
        └── file upload
```

---

## State Transition Diagram

```
                  ┌─────────────────┐
                  │  Component      │
                  │  Mount          │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Fetch Settings │
                  │  (useEffect)    │
                  └────────┬────────┘
                           │
                           ▼
    ┌──────────────────────────────────────────┐
    │  STEP 1: SEARCH                          │
    │  workflowStep = 'search'                 │
    └──────────────┬───────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    Student Found      Student Not Found
         │                   │
         │                   ▼
         │         ┌────────────────────────┐
         │         │  Click "Register"      │
         │         │  setWorkflowStep(      │
         │         │    'register'          │
         │         │  )                     │
         │         └─────────┬──────────────┘
         │                   │
         │                   ▼
         │         ┌────────────────────────┐
         │         │  STEP 2: REGISTER      │
         │         │  workflowStep =        │
         │         │    'register'          │
         │         └─────────┬──────────────┘
         │                   │
         │                   ▼
         │         ┌────────────────────────┐
         │         │  Submit Registration   │
         │         │  - API Call            │
         │         │  - setSelectedStudent  │
         │         │  - setWorkflowStep(    │
         │         │      'ticket'          │
         │         │    )                   │
         │         └─────────┬──────────────┘
         │                   │
         ▼                   ▼
    ┌────────────────────────────────────────┐
    │  STEP 3: TICKET                        │
    │  workflowStep = 'ticket'               │
    │  selectedStudent = { ...data }         │
    │  ticketForm.studentId = student._id    │
    └──────────────┬─────────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  Submit Ticket      │
         │  - API Call         │
         │  - Show Success     │
         │  - setTimeout(() => │
         │      Reset Workflow │
         │    )                │
         └─────────┬───────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  RESET TO STEP 1    │
         │  workflowStep =     │
         │    'search'         │
         │  Clear all states   │
         └─────────────────────┘
```

---

## API Call Sequence

```
┌─────────┐                    ┌─────────┐                    ┌──────────┐
│ BROWSER │                    │ BACKEND │                    │ DATABASE │
└────┬────┘                    └────┬────┘                    └────┬─────┘
     │                              │                              │
     │  1. Search Student           │                              │
     │──────────────────────────────>│                              │
     │  GET /api/users/              │  Query users collection     │
     │  search-students?             │─────────────────────────────>│
     │  query=John&type=name         │                              │
     │                              │<─────────────────────────────│
     │<──────────────────────────────│  Return matching users       │
     │  { users: [{ id, name... }] } │                              │
     │                              │                              │
     │                              │                              │
     │  2. Register Student         │                              │
     │  (if not found)              │                              │
     │──────────────────────────────>│                              │
     │  POST /api/users/             │  Check for duplicates       │
     │  register-student             │─────────────────────────────>│
     │  Body: { firstName, ... }     │                              │
     │                              │<─────────────────────────────│
     │                              │  No duplicates               │
     │                              │                              │
     │                              │  Insert new user             │
     │                              │─────────────────────────────>│
     │                              │                              │
     │                              │<─────────────────────────────│
     │<──────────────────────────────│  User created                │
     │  { userId: XXX, ... }         │                              │
     │                              │                              │
     │                              │                              │
     │  3. Create Ticket            │                              │
     │──────────────────────────────>│                              │
     │  POST /api/tickets/           │  Verify student exists      │
     │  offline-submission           │─────────────────────────────>│
     │  FormData: {                  │                              │
     │    studentId, title,          │<─────────────────────────────│
     │    category, files...         │  Student found               │
     │  }                            │                              │
     │                              │  Save files to disk          │
     │                              │  (/uploads/...)              │
     │                              │                              │
     │                              │  Insert ticket document      │
     │                              │─────────────────────────────>│
     │                              │                              │
     │                              │<─────────────────────────────│
     │<──────────────────────────────│  Ticket created              │
     │  { ticketNumber: TKT-001 }    │                              │
     │                              │                              │
     └──────────────────────────────┴──────────────────────────────┘
```

---

## Error Handling Flow

```
┌────────────────────────────────────────────────────────┐
│  User Action                                            │
└──────────────┬─────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────┐
│  Try-Catch Block                                        │
│  try {                                                  │
│    const response = await axios.get/post(...)           │
│    // Success path                                      │
│  } catch (error) {                                      │
│    // Error path                                        │
│  }                                                      │
└──────────────┬─────────────────────────────────────────┘
               │
     ┌─────────┴─────────┐
     │                   │
  SUCCESS             ERROR
     │                   │
     ▼                   ▼
┌─────────────┐    ┌──────────────────────┐
│ Update UI   │    │ Check Error Type     │
│ Show Success│    └──────────┬───────────┘
│ Message     │               │
│ Transition  │     ┌─────────┴────────┐
│ Next Step   │     │                  │
└─────────────┘  Network           API
                 Error              Error
                    │                  │
                    ▼                  ▼
         ┌───────────────────┐  ┌───────────────────┐
         │ "Network error,   │  │ error.response    │
         │  please check     │  │   .data.message   │
         │  connection"      │  │                   │
         └────────┬──────────┘  └────────┬──────────┘
                  │                      │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌────────────────────┐
                  │  Display Error     │
                  │  Message to User   │
                  │  (Red Alert Box)   │
                  └────────────────────┘
```

---

**Version**: 1.0  
**Last Updated**: November 18, 2025  
**Status**: Production Ready
