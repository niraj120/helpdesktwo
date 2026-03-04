# SAC Helpdesk — System Architecture

> Generated: March 2, 2026 | Branch: `dev` | Production: `helpdesk.hubblehox.ai`

---

## Architecture Diagram

```mermaid
graph TB
    subgraph CLIENTS["👥 Clients / Browsers"]
        A1[🧑‍💼 Admin / Super Admin]
        A2[🎯 Agent / Counselor / DNO]
        A3[🎓 Student / Applicant]
        A4[📱 Project Portal User]
    end

    subgraph NGINX["🌐 Nginx Reverse Proxy — helpdesk.hubblehox.ai"]
        N[Nginx\nPort 80 / 443 · SSL Termination\nStatic File Serving · /api/* Proxy]
    end

    subgraph FRONTEND["⚛️ Frontend — React 18 + Vite + TypeScript"]
        direction TB
        FE_CORE["React Router v6 · Lazy-loaded SPA\nTailwind CSS + shadcn/ui · i18n (en/mr/hi)"]

        subgraph FE_PORTALS["Portals"]
            P1[🏠 Admin Dashboard · Port :3001]
            P2[🎓 Student Portal · /mhcet/submit-ticket]
            P3[🔗 Project Portal · /:customUrlPath/login]
        end

        subgraph FE_MODULES["Feature Modules"]
            M1[🎫 Ticket Management]
            M2[📚 Knowledge Base]
            M3[📊 Dashboards]
            M4[👥 Team & User Mgmt]
            M5[🏢 Assets & Centers]
            M6[📧 Email Config]
            M7[⚙️ SLA / Escalation Config]
            M8[📋 Reports]
            M9[📝 FAQ & Feedback]
            M10[🔧 Form Builder]
        end

        subgraph FE_INFRA["Frontend Infrastructure"]
            FI1[Axios REST Client · Bearer Token]
            FI2[Socket.IO Client · Real-time]
            FI3[Context API · Auth / Project State]
        end
    end

    subgraph BACKEND["🖥️ Backend — Node.js + Express + TypeScript · Port :3003"]
        direction TB

        subgraph MW["Middleware Chain"]
            direction LR
            MW1[Helmet] --> MW2[CORS] --> MW3[JWT Auth] --> MW4[RBAC Check] --> MW5[Project Scope] --> MW6[Perf Monitor]
        end

        subgraph AUTH_ROUTES["Auth Routes"]
            AR1[/api/auth · Admin JWT]
            AR2[/api/student-auth · OTP Login]
            AR3[/api/project-auth · Agent JWT]
        end

        subgraph API_ROUTES["Core API Routes"]
            R1[/api/tickets]
            R2[/api/kb/*]
            R3[/api/users · /api/roles · /api/permissions]
            R4[/api/dashboard]
            R5[/api/sla-rules · /api/escalation-*]
            R6[/api/email-config · /api/email-logs]
            R7[/api/assets · /api/centers]
            R8[/api/activity-logs · /api/access-logs]
            R9[/api/feedback-forms · /api/faq]
            R10[/api/projects · /api/categories · /api/statuses]
            R11[/api/otp · /api/whatsapp · /api/sms]
        end

        subgraph BG_SERVICES["Background Services"]
            BS1[📬 Email Polling · IMAP Monitor]
            BS2[⚙️ Email Processing Worker]
            BS3[⏫ Auto Escalation Scheduler]
            BS4[🔑 KB GCS URL Refresh]
            BS5[🔄 Job Queue]
            BS6[📡 Connection Monitor]
            BS7[📊 DB Monitoring]
        end

        SOCK["🔌 Socket.IO Server\nRooms: ticket-{id} · project-config-{id}\nEvents: ticket-updated · hierarchy-config-updated"]
    end

    subgraph DB["🗄️ MongoDB — Mongoose ODM"]
        direction LR
        DB1[(Tickets · Comments · Attachments)]
        DB2[(Users · Roles · Permissions)]
        DB3[(KBArticles · KBTables · KBCategories)]
        DB4[(Projects · Categories · Statuses)]
        DB5[(SLA Rules · Escalation · Calendar)]
        DB6[(Email / SMS / WhatsApp Logs)]
        DB7[(Assets · Centers · AuditLog)]
        DB8[(Feedback · Forms · FAQ)]
    end

    subgraph EXTERNAL["☁️ External Services"]
        EXT1[☁️ Google Cloud Storage · GCS v4 Signed URLs]
        EXT2[📧 Email Server · IMAP + SMTP]
        EXT3[📱 SMS Gateway · OTP / Notifications]
        EXT4[💬 WhatsApp API]
        EXT5[🏢 HRMS · PeopleStrong · User Sync]
        EXT6[🔐 OTP Service · Field Verification]
    end

    subgraph CICD["🚀 CI/CD & Hosting"]
        CI1[Bitbucket Pipelines · bitbucket-pipelines.yml]
        CI2[GitHub Mirror · niraj120/Helpdesk_latest]
        CI3[PM2 · ecosystem.config.js]
    end

    A1 & A2 --> N
    A3 --> N
    A4 --> N
    N -->|Static Assets| FRONTEND
    N -->|/api/* Proxy| BACKEND
    FE_PORTALS --> FE_MODULES
    FE_MODULES --> FE_INFRA
    FI1 -->|REST| BACKEND
    FI2 -->|WebSocket| SOCK
    BACKEND --> DB
    BACKEND --> EXT1
    BS1 --> EXT2
    BS2 --> EXT2
    BACKEND --> EXT3
    BACKEND --> EXT4
    BACKEND --> EXT5
    BACKEND --> EXT6
    CI1 --> N
    CI3 --> BACKEND
```

---

## 1. Infrastructure Layer

| Component           | Details                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| **Hosting**         | Linux server, production domain `helpdesk.hubblehox.ai`                                       |
| **Reverse Proxy**   | Nginx — SSL termination (port 443), serves frontend static files, proxies `/api/*` to backend |
| **Process Manager** | PM2 (`ecosystem.config.js`) — auto-restart, clustering                                        |
| **CI/CD**           | Bitbucket Pipelines (`bitbucket-pipelines.yml`) — automated deploy on push                    |
| **Source Control**  | Bitbucket (primary) + GitHub mirror (`niraj120/Helpdesk_latest`)                              |

---

## 2. Frontend

| Property      | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| **Framework** | React 18 + Vite + TypeScript                                   |
| **Routing**   | React Router v6 (lazy-loaded routes, code-split)               |
| **Styling**   | Tailwind CSS + shadcn/ui component library                     |
| **i18n**      | react-i18next — English, Marathi, Hindi                        |
| **Real-time** | Socket.IO client                                               |
| **HTTP**      | Axios with Bearer token interceptors                           |
| **State**     | React Context API (AuthContext, ProjectContext)                |
| **Build**     | Vite — optimized bundle, lazy imports reduce initial load ~68% |

### 2.1 Portals

| Portal              | URL / Path              | Users                                                        |
| ------------------- | ----------------------- | ------------------------------------------------------------ |
| **Admin Dashboard** | `/` (port 3001 in dev)  | Admin, Super Admin                                           |
| **Agent Dashboard** | `/dashboard`            | Agent, Counselor, DNO, Hub Coordinator                       |
| **Student Portal**  | `/mhcet/submit-ticket`  | Students / Applicants (unauthenticated or OTP-authenticated) |
| **Project Portal**  | `/:customUrlPath/login` | Per-project agents                                           |

### 2.2 Feature Modules (Frontend)

| Module                   | Key Pages / Components                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ticket Management**    | ViewTickets, MyTickets, AgentTicketDetail, TicketAssignment, Merge, Export                                                                      |
| **Knowledge Base**       | KBArticleManagementPage, KBTableManagementPage, KBLevelManagementPage, KBViewerPage, ArticleDetailView, ContentViewerModal (PDF), KBTableViewer |
| **Dashboards**           | AgentDashboard, ProjectDashboard, SLA charts, Hierarchy dashboard                                                                               |
| **RBAC & Users**         | UserManagement, RBACSetup, TeamManagement, RoleManagement                                                                                       |
| **Assets & Centers**     | AssetManagement, CenterAssetMappingAccordion, MyAssets, FindCenterPage                                                                          |
| **Email & Integrations** | EmailConfigPage, EmailToTicketConfiguration, IntegrationsManagement                                                                             |
| **SLA / Escalation**     | SLARulesPage (tabbed: SLA Rules, Escalation Matrix, Working Calendar)                                                                           |
| **Reports**              | ReportsPage, TicketListReport, EmployeeReport, AssetReport                                                                                      |
| **FAQ & Feedback**       | FAQManagement, FAQViewer, FeedbackFormManagement, FeedbackResponses                                                                             |
| **Form Builder**         | Dynamic field builder for ticket forms                                                                                                          |
| **Offline Module**       | OfflineModuleSettings, OfflineModuleConfigPage                                                                                                  |
| **Audit & Logs**         | ActivityLogs, AccessLogs, EmailLogsPage, WebhookFailureLogs, DBMonitoringDashboard                                                              |

---

## 3. Backend

| Property         | Value                               |
| ---------------- | ----------------------------------- |
| **Runtime**      | Node.js + TypeScript (compiled)     |
| **Framework**    | Express.js                          |
| **Port**         | 3003                                |
| **Real-time**    | Socket.IO server                    |
| **Auth**         | JWT (access token + refresh)        |
| **File Uploads** | Multer → Google Cloud Storage (GCS) |
| **ORM**          | Mongoose (MongoDB ODM)              |

### 3.1 Middleware Chain (applied per request)

```
Helmet (security headers)
  → CORS (allowedOrigins from .env)
    → JWT Auth (verify Bearer token)
      → RBAC Check (role + permission matrix)
        → Project Scope (isolate data per project)
          → Performance Monitor + Query Profiler
            → Controller
```

### 3.2 Authentication Flows

| Flow                | Route                                         | Mechanism                               |
| ------------------- | --------------------------------------------- | --------------------------------------- |
| Admin / Staff login | `POST /api/auth/login`                        | Email + Password → JWT                  |
| Student login       | `POST /api/student-auth/login`                | Mobile OTP or Student ID → JWT          |
| Project Agent login | `POST /api/auth/project/:customUrlPath/login` | Email + Password → JWT (project-scoped) |
| Password Reset      | `POST /api/auth/forgot-password`              | Email link                              |
| EULA Acceptance     | `POST /api/auth/eula/accept`                  | Tracked per user                        |

### 3.3 Core API Route Groups

| Route Prefix             | Controller                                                       | Description                                                        |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/api/tickets`           | `ticketController`                                               | Full ticket CRUD, assignment, merge, comments, attachments, export |
| `/api/kb/*`              | `kbPublicController`, `kbTableController`, `kbArticleController` | Knowledge Base articles, tables, levels, categories, public viewer |
| `/api/users`             | `userController`                                                 | User CRUD, role assignment, hierarchy                              |
| `/api/roles`             | `roleController`                                                 | Role management                                                    |
| `/api/permissions`       | `permissionController`                                           | Permission matrix RBAC                                             |
| `/api/dashboard`         | `dashboardController`                                            | Metrics, SLA stats, ticket counts                                  |
| `/api/sla-rules`         | sla-module                                                       | SLA rule configuration                                             |
| `/api/escalation-*`      | escalation-matrix                                                | Escalation policy and matrix                                       |
| `/api/priorities`        | `priorityController`                                             | Priority levels                                                    |
| `/api/working-calendars` | `workingCalendarController`                                      | Business hours config                                              |
| `/api/projects`          | `projectController`                                              | Multi-project setup                                                |
| `/api/categories`        | `categoryController`                                             | Ticket category hierarchy                                          |
| `/api/hierarchy-config`  | `hierarchyConfigController`                                      | Org hierarchy config                                               |
| `/api/statuses`          | `statusController`                                               | Ticket status workflow                                             |
| `/api/email-config`      | `emailConfigController`                                          | IMAP/SMTP setup                                                    |
| `/api/email-logs`        | `emailLogController`                                             | Email audit logs                                                   |
| `/api/assets`            | `assetController`                                                | Asset management                                                   |
| `/api/centers`           | `centerController`                                               | Center/location management                                         |
| `/api/asset-categories`  | `assetCategoryController`                                        | Asset category tree                                                |
| `/api/activity-logs`     | `activityLogController`                                          | Action audit trail                                                 |
| `/api/access-logs`       | `accessLogController`                                            | Login/access audit                                                 |
| `/api/feedback-forms`    | `feedbackFormController`                                         | Dynamic feedback forms                                             |
| `/api/faq`               | `faqController`                                                  | FAQ management                                                     |
| `/api/otp`               | `otpController`                                                  | OTP generation/verification                                        |
| `/api/whatsapp`          | `whatsappConfigController`                                       | WhatsApp integration                                               |
| `/api/sms`               | `smsConfigController`                                            | SMS gateway config                                                 |
| `/api/master`            | `masterDataController`                                           | Countries, States, Cities                                          |
| `/api/upload`            | upload routes                                                    | File upload to GCS                                                 |
| `/api/notifications`     | `notificationController`                                         | In-app notifications                                               |
| `/api/approvals`         | `approvalController`                                             | Approval workflows                                                 |
| `/api/dpdp`              | dpdp routes                                                      | DPDP compliance                                                    |

### 3.4 Background Services

| Service                     | File                                        | Function                                          |
| --------------------------- | ------------------------------------------- | ------------------------------------------------- |
| **Email Polling**           | `emailPollingService.ts`                    | IMAP polling — converts inbound emails to tickets |
| **Email Processing Worker** | `emailProcessingWorker.ts`                  | Processes email queue, sends replies              |
| **Auto Escalation**         | `autoEscalationService.ts`                  | Scheduler — auto-escalates breached SLA tickets   |
| **KB Scheduler**            | `kbSchedulerService.ts`                     | Refreshes expiring GCS v4 signed URLs for KB PDFs |
| **Job Queue**               | `jobQueue.ts` + `jobProcessors.ts`          | Async background job processing                   |
| **Connection Monitor**      | `connectionMonitorScheduler.ts`             | Monitors DB/service connections                   |
| **DB Monitoring**           | `dbMonitoringService.ts`                    | MongoDB performance stats                         |
| **SLA Service**             | `slaService.ts` + `slaHelperService.ts`     | SLA calculation engine                            |
| **Email Queue**             | `emailQueueService.ts`                      | Outbound email queuing                            |
| **HRMS Sync**               | `hrmsService.ts` + `peopleStrongService.ts` | PeopleStrong user sync                            |
| **Feedback Trigger**        | `feedbackTriggerService.ts`                 | Auto-sends feedback requests on ticket close      |

### 3.5 Socket.IO (Real-time)

| Room                         | Event                      | Trigger                                |
| ---------------------------- | -------------------------- | -------------------------------------- |
| `ticket-{ticketId}`          | `ticket-updated`           | Any ticket field/status/comment change |
| `project-config-{projectId}` | `hierarchy-config-updated` | Hierarchy config changes               |
| `project-config-{projectId}` | `category-tree-updated`    | Category tree changes                  |

---

## 4. Database (MongoDB)

### Collections / Models

| Model                                      | Description                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `Ticket`                                   | Core — ticket with fields, status, priority, assignee, SLA timestamps                     |
| `User`                                     | Staff + student users, role assignments, reporting manager                                |
| `Role`                                     | Role definitions (Admin, Agent, Counselor, DNO, State CET Cell, Hub Coordinator, Student) |
| `Permission`                               | Granular permission flags per role                                                        |
| `Project`                                  | Multi-project isolation (e.g., MHCET, NEET, etc.)                                         |
| `Category`                                 | Hierarchical ticket categories (Level 1 → Level N)                                        |
| `HierarchyConfig`                          | Category-to-role routing configuration                                                    |
| `Status`                                   | Configurable ticket status workflow                                                       |
| `KBArticle`                                | Knowledge Base articles with visibility (all/public/internal/role_based)                  |
| `KBTable`                                  | Tabular KB content with GCS-hosted files                                                  |
| `KBCategory` / `KBSubcategory` / `KBLevel` | KB taxonomy                                                                               |
| `KnowledgeBaseArticle`                     | Legacy KB article model                                                                   |
| `SLARule` (sla-module)                     | SLA rules per priority/category                                                           |
| `EscalationPolicy` (sla-module)            | Escalation tiers                                                                          |
| `EscalationMatrix`                         | Role-based escalation chain                                                               |
| `WorkingCalendar`                          | Business hours/holidays                                                                   |
| `Priority`                                 | Ticket priority levels                                                                    |
| `EmailConfig`                              | IMAP/SMTP connection settings per project                                                 |
| `EmailLog`                                 | Email send/receive audit                                                                  |
| `EmailProcessingQueue`                     | Inbound email queue                                                                       |
| `Asset`                                    | Physical/digital asset tracking                                                           |
| `AssetCategory`                            | Asset taxonomy                                                                            |
| `Center`                                   | Physical center/location                                                                  |
| `CenterAssetMapping`                       | Asset ↔ Center assignment                                                                 |
| `ActivityLog`                              | Full audit trail of user actions                                                          |
| `AccessLog`                                | Login/logout/access events                                                                |
| `Notification`                             | In-app notifications                                                                      |
| `FeedbackForm`                             | Dynamic feedback form schema                                                              |
| `FeedbackResponse`                         | Submitted feedback data                                                                   |
| `FAQ`                                      | FAQ entries                                                                               |
| `MasterData`                               | Countries, States, Cities                                                                 |
| `ApprovalWorkflow` / `ApprovalCategory`    | Approval request workflows                                                                |
| `WhatsAppConfig` / `WhatsAppLog`           | WhatsApp integration                                                                      |
| `SMSConfig` / `SMSLog`                     | SMS integration                                                                           |
| `UserDashboardConfig`                      | Per-user dashboard widget preferences                                                     |
| `SystemSettings`                           | Global system config                                                                      |
| `EulaAcceptance`                           | EULA acceptance tracking                                                                  |
| `Job`                                      | Background job records                                                                    |

---

## 5. External Services

| Service                        | Integration                                      | Purpose                                                       |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| **Google Cloud Storage (GCS)** | `gcsService.ts`                                  | PDF and file storage; v4 signed URLs with auto-refresh        |
| **Email Server (IMAP/SMTP)**   | `emailPollingService.ts`, `emailQueueService.ts` | Inbound: email → ticket; Outbound: ticket reply notifications |
| **SMS Gateway**                | `smsService.ts`                                  | OTP delivery, ticket notifications                            |
| **WhatsApp API**               | `whatsappConfigController.ts`                    | Ticket communication via WhatsApp                             |
| **PeopleStrong HRMS**          | `peopleStrongService.ts`, `hrmsService.ts`       | Employee/user data sync                                       |
| **OTP Service**                | `otpController.ts`                               | Field-level OTP verification (e.g., mobile number)            |

---

## 6. RBAC (Role-Based Access Control)

### Known Roles

| Role                             | Access Level                                  |
| -------------------------------- | --------------------------------------------- |
| **Super Admin**                  | Full system access across all projects        |
| **Admin**                        | Project-level admin                           |
| **State CET Cell**               | State-level oversight                         |
| **District Nodal Officer (DNO)** | District-level ticket management              |
| **Hub Coordinator**              | Hub-level coordination                        |
| **Counselor**                    | Front-line ticket handling                    |
| **Agent**                        | Ticket handling                               |
| **Student**                      | Submit & track own tickets via Student Portal |

### KB Visibility Rules

| Visibility Value | Who Can See                                          |
| ---------------- | ---------------------------------------------------- |
| `all`            | Everyone (all authenticated + public)                |
| `public`         | Public portal (unauthenticated) + Student role only  |
| `internal`       | Internal staff only (not students, not public)       |
| `role_based`     | Only users whose role is in `visibleToRoles[]` array |

---

## 7. Key Technical Decisions

| Decision               | Rationale                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **GCS v4 Signed URLs** | Uses `X-Goog-Algorithm=GOOG4-RSA-SHA256` format; expiry = `X-Goog-Date` + `X-Goog-Expires` seconds |
| **Lazy loading**       | All page components lazy-loaded → ~68% initial bundle reduction (~2.5MB → ~800KB)                  |
| **Project isolation**  | All queries scoped to `projectId` via `projectScope` middleware                                    |
| **Multi-auth flows**   | Separate JWT issuers for Admin, Student (OTP), and Project Agent                                   |
| **Socket.IO rooms**    | Per-ticket and per-project-config rooms for granular real-time updates                             |
| **Email queue**        | Decoupled email polling → queue → processor for reliability                                        |
| **Rate limiting**      | Deliberately disabled (commented out) to prevent 429 errors in current deployment                  |
| **CORS**               | Origin whitelist from `.env` (`ALLOWED_ORIGINS_LOCAL` / `ALLOWED_ORIGINS_PRODUCTION`)              |

---

## 8. Development vs Production

| Aspect       | Development             | Production                      |
| ------------ | ----------------------- | ------------------------------- |
| Frontend URL | `http://localhost:3001` | `https://helpdesk.hubblehox.ai` |
| Backend Port | `3003`                  | `3003` (Nginx proxied)          |
| MongoDB      | Local / Atlas           | MongoDB Atlas                   |
| File Storage | GCS (same bucket)       | GCS                             |
| Logging      | Morgan `dev` format     | Silent (Morgan disabled)        |
| ENV Config   | `ALLOWED_ORIGINS_LOCAL` | `ALLOWED_ORIGINS_PRODUCTION`    |

---

_Last updated: March 2, 2026_
