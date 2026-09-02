# SAC Helpdesk — Modules & Features

**A business overview of everything the platform can do.**

SAC Helpdesk is a **multi-tenant support platform** — one system that runs many separate helpdesks (one per institution / business unit, called a "project"), each with its own branding, settings, forms, and teams. Almost everything is **configurable by administrators** rather than fixed in code, and the interface is available in **English, Hindi, and Marathi**.

This document lists every module and the features under it, in plain language.

---

## 1. Query (Ticket) Management — the core helpdesk

The central desk where every student, parent, or staff query, complaint, or request is logged, tracked, and resolved.

- Log new queries with subject, description, category, priority, attachments, and requester details
- Auto-generated query numbers and full status lifecycle tracking
- **View Queries** — master list with search, filters (status, priority, category, centre, date range), sorting, and live real-time updates
- **My Queries** — each agent's own assigned queries
- **Assign / reassign / transfer** queries between agents and teams, with reassignment rules, reason capture, limits, and optional cross-project moves
- **Merge** duplicate queries into one
- Add customer-facing replies and internal notes (kept separate)
- Two-way email conversation on a query (inbound replies attach to the thread; email boilerplate is automatically cleaned up)
- Attach and manage files/documents on any query
- Save unfinished queries as drafts
- Bulk export of queries for offline analysis
- Configurable query forms, fields, and visible columns per project

---

## 2. Service Requests (PSR / ISR) — structured, form-driven requests

A dedicated workspace for service requests that go beyond a simple query — Prospect Service Requests (parent/student) and Internal Service Requests (procurement, HR, admin, etc.).

- Unified hub listing all requests across every channel (portal, email, phone, walk-in)
- Create requests through configurable intake forms, different per channel
- Request-specific numbering, statuses, and turnaround-time (TAT) tracking
- Rules engine for routing and behaviour; duplicate-request detection
- Committed-date reminders for work in progress
- **Parent/Student Record lookup** — search existing parent/student records while handling a request
- Full request lifecycle view with status progress and linked internal-request panel
- Public (no login required) service-request submission

### Service Request Settings (per project)
- Turn PSR/ISR on or off; build per-channel intake forms field by field
- **Import from an external API** — paste a CRM/API call, auto-test it, discover its fields, and auto-create matching form fields
- Configure routing/assignment rules and SLA overrides per source (portal, email, phone, walk-in)
- Manage notification rules and the layout of the request detail screen
- Role-mapping rules, channel classification, and clusters

---

## 3. Telephony & Call Handling (TATA SmartFlo / IVR)

Captures incoming phone calls and lets agents call customers back — integrated with the TATA voice platform.

- **Call Triage Inbox** — every incoming call appears with caller name/number, school, call type (answered/missed), duration, voice-note and recording playback, digits dialled, and which agent answered
- Automatically identify whether the caller is a **registered parent** (looked up against records) and populate their name/school
- Classify callers (prospective / existing / left parent, vendor, job, junk, other) and convert a call into a service request
- **Missed calls** are auto-assigned to available agents by **round-robin**, based on the IVR option pressed (1 / 2 / 3 / other), only among agents who are IVR-enabled and on duty that day
- **Answered calls** are automatically routed to the agent who picked up, so the call lands in their queue with matching agent identity on both systems
- **Multiple phone numbers (DIDs)** — register many DID lines, each mapped to its dedicated agent(s); calls are attributed to the right agent by the line they came in on
- **IVR agent management** — map agents to menu options, set availability, round-robin rotation, active/inactive status, and record agent leave dates
- **Click-to-Call** — agents call a customer back directly from the helpdesk; the customer sees a common company caller ID
- Per-project TATA voice credentials and settings

---

## 4. Email-to-Ticket & Email Communication

Turns inbound emails into queries automatically and manages all outbound email.

- Continuously fetches inbound email and auto-creates queries from it
- **Email Triage Inbox** — read incoming emails with attachments (auto-refreshing), then convert to a query/request or reply directly, tracking the action taken on each
- Per-project and global email account configuration, with on/off toggles and live connection testing
- Two-way email threads on queries; email activity tracking
- Blocked-recipient handling and inbound webhook support (SendGrid and generic)

---

## 5. SLA & Escalation Management

Guarantees queries are handled within promised timeframes and escalates automatically when they are not.

- Define SLA targets (response time and resolution time) by priority and category, in minutes/hours/days
- Live SLA countdown timers on each query; monitor at-risk and breached SLAs
- **Multi-level Escalation Matrix** — build tiered escalation chains by role/hierarchy: define levels, target roles, timing, and escalation mode; add, edit, reorder, and toggle levels
- Automatic escalation when an SLA is breached or approaching breach, with escalation policies for who is notified/assigned at each step
- Category-level escalation configuration
- **Working Calendar** — set business hours and holidays so SLA timers only count working time

---

## 6. Classification & Assignment (Query Configuration)

The routing backbone that decides how queries are categorised and who handles them.

- Manage query categories and sub-categories (hierarchical, multi-level)
- Manage priorities and custom statuses (with colours, defaults, "closed" flags)
- Category-based auto-assignment rules to route queries to the right team/agent
- Category-to-SLA and category-to-escalation mapping
- Automatic assignment engine with configurable reassignment rules
- Configure per project which categories, statuses, priorities, and columns agents see

---

## 7. Knowledge Base

A structured library of help content for agents and end-users.

- Build the category hierarchy/levels that organise content
- Create and edit rich articles with a full editor; publish for viewing
- Structured KB data tables (reference data) with editable rows
- Upload PDFs as content
- Read-only viewer to browse and search articles and tables
- Public/student-facing KB portal (readable without login)

---

## 8. FAQ

Quick answers to common questions.

- Create and manage FAQ entries (admins)
- Public/student FAQ viewer in the portals

---

## 9. Feedback & Satisfaction

Measures customer/student satisfaction after resolution.

- **Form Builder** — design custom feedback forms with drag-and-drop fields
- Automatic feedback triggers (send a survey when a query is closed) and delivery via email
- Public feedback page for respondents to submit without logging in
- **View Responses** with charts/analytics; satisfaction scores feed the dashboards

---

## 10. Leads Management

Captures and follows up on prospective-student enquiries.

- Create and manage leads; capture leads from calls and other channels
- Track lead status (new, in follow-up, converted, closed, lost) with student name/grade/enquiry number
- Sync leads to an external CRM, with sync status (pending / synced / failed / not required) and external CRM reference

---

## 11. Dashboards

Visual, at-a-glance operational insight.

- **Overview** — headline stats: query counts, workload, status breakdowns, trends, KPI tiles, and charts
- **My Dashboards** — role-assigned dashboards as tabs/sections of widgets, with a global date range and scope filter applied across all widgets at once
- **Personal Dashboards** — build and keep your own private dashboards
- **Dashboard Builder** — drag-and-drop, resizable canvas; pick chart types visually; create custom ratio/formula metrics; choose count/percentage display; set per-widget filters and alert thresholds; publish, duplicate, and import/export templates
- **Manage Templates** — curate the library of dashboards assigned to roles
- Large widget catalogue: SLA/escalation, agent performance, centre operations, footfall, KB, activity, satisfaction, assets, service requests, attendance, and more
- **Target Management** — set numeric goals that dashboards measure against
- Dashboard threshold **alerts** and **scheduled dashboard reports** (auto-emailed snapshots)

---

## 12. Reports & Report Builder

Build, run, save, schedule, and share operational reports.

- **Report Builder** — pick data points (from queries, users, assets, audit data), apply filters, choose sort order, and run
- **Saved Reports** — save definitions; see last-run time, row count, and assignments; re-run and export (including PDF)
- **Assign Reports** to specific users; **My Reports** for reports assigned to you
- **Role Permissions** — per-role rights to view, create, export, schedule, assign, or delete reports
- **Data Points** — control which data fields each role may include
- Scheduled report delivery via email and threshold alerts
- Footfall / manpower reporting; attendance-specific reports

---

## 13. Analytics & Usage Tracking

- Usage analytics — how dashboards and features are actually used
- Agent-performance and centre-operations analytics via widgets
- Performance monitoring

---

## 14. Notifications & Messaging

Multi-channel alerts and outbound messaging.

- **My Notifications** — personal inbox plus an app-wide unread-alert bell
- **Notification Settings** — admins configure system-wide rules and templates
- **My Preferences** — each user chooses which notifications they receive and how
- Browser **web-push** notifications
- **SMS** sending and configuration (with logs)
- **WhatsApp** messaging and configuration (with logs)

---

## 15. User Management

Manage all staff/agent accounts.

- Create, edit, and deactivate users; assign roles, projects, centres, and reporting managers
- Bulk import users
- Reporting hierarchy / org-chart configuration
- User profiles, signature images, and consent acknowledgements

---

## 16. Roles & Permissions (RBAC)

Controls who can see and do what across the whole system.

- Create system and custom roles (super admin, manager, agent, student, custom)
- Assign granular permissions per role, grouped by module
- Search permissions; copy/duplicate roles; mark favourites; attach a role document
- Master roles vs. project-scoped roles; role-mapping rules to auto-assign roles by attributes
- Permission checks enforced on every screen and action

---

## 17. Projects (Multi-Tenancy)

Run many isolated helpdesks on one platform.

- Create, edit, activate/deactivate, and delete projects (tenants)
- Per-project branding: logo, favicon, header/footer, custom URL path, domain, colours
- Per-project address, contact info, modules enabled, forms, submission modes, and offline settings
- Centres and clusters organised under projects
- Header **project switcher** to change the active project

---

## 18. Master Data & External Sync (MDM)

Central reference lists and syncing with external master systems.

- Maintain lookup lists: countries, states, cities, companies, industries, organisations, departments, centres, priorities, and more
- Add, edit, delete, reorder, and activate/deactivate entries; bulk upload
- Connect external master-data sources with field mapping
- Scheduled data sync and caching from external systems
- **Auto-provision and update staff** from HR/master systems (HRMS / PeopleStrong integration)

---

## 19. Attendance

Staff attendance tracking via biometric/HR feeds.

- Browse attendance records and view summarised attendance reports
- Sync attendance from biometric devices (with sync logs)
- Per-project attendance configuration and scheduled automatic sync
- Bulk attendance operations and saved attendance reports with alerts

---

## 20. Asset Management

Track equipment/assets across centres and staff.

- **Master Assets** — maintain the catalogue of asset types and categories
- **Centre Assets** — allocate assets to specific centres
- **My Assets** — users view assets assigned to them

---

## 21. Audit, Activity & Access Logs

A full accountability trail for traceability and compliance.

- **Activity Logs** — who did what and when (create/edit/delete), with a readable before-and-after view of what changed
- Automatic, system-wide capture of changes across every module (no manual logging gaps)
- **Access Logs** — login/logout and access history
- **Email / SMS / WhatsApp logs** and error logs
- **Archiving to cloud storage** — older audit records are moved to Google Cloud Storage on a configurable schedule to keep the live system fast, and remain searchable on demand (retention period and on/off are set from the screen)
- Sensitive personal data is masked in the audit trail

---

## 22. Data Privacy (DPDP / Consent)

Support for India's DPDP data-protection requirements.

- Capture and track user **consent**
- Record every access to personal data
- Handle **deletion / right-to-erasure** requests (data-subject rights)
- Consent acknowledgements embedded in user management and the portals

---

## 23. Integrations

Connect the helpdesk to external systems and channels.

- **Email-to-Ticket** — inbound mailboxes that auto-create queries, with live connection status
- **Email Configuration** — project email accounts/mailboxes
- **WhatsApp Widget** — a floating WhatsApp chat button with configurable number, message, position, and visibility rules
- **TATA Voice (Click-to-Call)** — outbound calling credentials and settings per project
- **Public API & API Keys** — a versioned public API for external systems; generate, copy, rotate, and revoke keys; usage view, docs, and code samples
- **PSR Builder** — connect an external data source by pasting an API call, discover its fields, and build reference tables that sync on a schedule
- **PSR Pipelines** — compose multi-step data pipelines (sources, lookups, transforms), dry-run/trigger runs, and view run logs
- **Single Sign-On (SSO)** — Keycloak login integration

---

## 24. Self-Service Portal (Students & Parents)

A branded self-service website where students/parents get help without an agent.

- Branded landing page per project (logo, colours, welcome/footer text)
- Submit a query through a category form with conditional fields and attachments
- Browse the Knowledge Base and FAQ
- Find the nearest offline centre on a map (address, phone, hours)
- Language toggle, WhatsApp chat button, SSO login, consent and announcement messaging
- **Student login / dashboard** — track submitted queries and view responses
- **Parent Service Request portal** — submit and track service requests

---

## 25. Offline / Walk-in Module

For physical centres where visitors don't use self-service.

- Build the offline registration form field by field
- Configure centre details (address, hours, contact, map location)
- Agents register walk-in students/visitors and raise queries on their behalf
- Choose per project whether intake is online, offline, or both

---

## 26. Search

- Universal search across queries, Knowledge Base articles, and users — permission-aware and scoped to the current project

---

## 27. Access & Security

- Standard agent/admin login, per-project agent login, and student login
- Single Sign-On (Keycloak) and OTP verification for identity
- Terms/EULA acceptance capture and enforcement
- **Impersonation** — admins can act as another user (with a visible banner), for support and troubleshooting
- Every screen and action gated by role permissions; a clear "No Access" page when unauthorised

---

## 28. Platform & Automation (behind the scenes)

Capabilities that keep the system running and current without user action.

- **Real-time updates** — live changes pushed to the screen instantly
- Multi-language interface (English / Hindi / Marathi)
- Continuous automation: inbound-email processing, SLA-based auto-escalation, service-request reminders, audit archiving, attendance sync, master-data sync, staff sync, data-pipeline runs, dashboard pre-calculation, and scheduled report/alert delivery
- System health monitoring, database monitoring, background job processing, and cache management

---

## Modules in progress (not yet live)

For completeness, a few areas exist in the system but are **not yet switched on** for users:

- **Approvals & Workflows** — multi-step approval routing (built, currently hidden pending rollout)
- Some advanced audit sub-logs (integration/webhook failure logs) are built but not yet exposed

---

*This document reflects the current state of the platform. Almost every capability above is configurable per project by administrators.*
