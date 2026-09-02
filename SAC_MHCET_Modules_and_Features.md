# SAC Maharashtra CET — Modules & Features

**Project:** MH CET Extension Centres (MH CET उपकेंद्र)
**A business summary of what this helpdesk does for the SAC MH CET portal.**

This is the live helpdesk for MH CET Extension Centres, running on the SAC platform. The list below covers only what is switched on for this project. Interface is available in **English, Hindi, and Marathi**.

---

## Live modules

### 1. Query (Ticket) Management
The core desk — every candidate/parent/centre query is logged, tracked, and resolved.
- Log queries with subject, description, category, priority, attachments, and requester details
- Auto-generated query numbers and full status tracking
- Master list with search, filters (status, priority, category, district/centre, date), and live updates
- "My Queries" view for each agent
- **Automatic round-robin assignment** of queries to agents
- Assign / reassign / transfer between agents, with reason capture
- Merge duplicate queries; customer replies vs. internal notes; file attachments; drafts
- Bulk export of queries

### 2. Walk-in / Offline Intake
For candidates who visit an extension centre in person.
- Agents register walk-in candidates using a configurable registration form
- Raise a query on the candidate's behalf
- Online submission form also available for self-service

### 3. Categories & Classification
- Multi-level query categories and sub-categories (Category → Sub-category → Topic → Course → Department, up to deeper levels)
- Custom statuses and priorities
- District / centre / hierarchy fields on each query
- Category-based auto-assignment rules

### 4. Knowledge Base
Self-help content library for agents and candidates.
- Organised articles with a rich editor, published for viewing
- Category hierarchy and structured reference tables
- Public candidate-facing KB with "was this helpful?" satisfaction feedback
- Popular / related / recent articles, tags, and share options

### 5. FAQ
- Managed FAQ entries, shown to candidates in the portal

### 6. Reports
- Build, save, run, and export reports (including PDF)
- Assign reports to users; per-role report permissions and data-point access
- Scheduled report delivery by email

### 7. Dashboards & Analytics
- Operational overview: query counts, workload, status breakdowns, trends, KPI tiles, and charts
- Role-assigned dashboards with global date-range and scope filters
- Usage analytics

### 8. Notifications & Communication
- In-app notification inbox with unread-alert bell
- Per-user notification preferences and admin notification settings
- Email communication on queries (two-way threads)

### 9. User Management
- Create, edit, and deactivate staff/agent accounts
- Assign roles, projects, centres, and reporting managers
- Bulk import of users; reporting hierarchy

### 10. Roles & Permissions
- Roles (super admin, manager, agent, counsellor, district/centre roles, student, etc.)
- Granular permissions per role; every screen and action gated by permission

### 11. Candidate Self-Service Portal
Branded site where candidates get help without an agent.
- Branded landing page (MH CET logo, colours, welcome/announcement text)
- Submit a query via the category form with attachments
- Browse Knowledge Base and FAQ
- Find the nearest extension centre
- Language toggle (English / Hindi / Marathi)
- Candidate login to track submitted queries and view responses

### 12. Audit & Access Logs
- Activity logs — who did what and when, with a readable before-and-after view of changes
- Automatic, system-wide capture of every change (no gaps)
- Access logs (login/logout history); email logs
- Older records archived to cloud storage on a schedule, still searchable on demand
- Personal data masked in the audit trail

### 13. Security & Access
- Form-based login (single sign-on and social login are off for this project)
- Password policy, session controls
- Terms/EULA acceptance
- Admin impersonation (with a visible banner) for support

---

## Being rolled out for this project

Built and targeted at MH CET, currently being enabled:

- **Telephony / Call Handling (TATA SmartFlo)** — incoming calls captured in a Call Triage Inbox (caller details, recording, digits pressed, answering agent); registered callers auto-identified; missed calls auto-assigned by round-robin on the IVR option pressed among on-duty agents; answered calls routed to the agent who picked up; support for **multiple phone lines (DIDs)** each mapped to dedicated agents; **click-to-call** for agents to call candidates back.
- **Service Requests (PSR / ISR)** — structured, form-driven requests beyond a simple query, with per-channel intake forms and routing.

---

## Not enabled for this project

For clarity, these platform capabilities exist but are **off** for MH CET:

- SLA timers & escalation (currently disabled)
- Asset Management
- Approvals & Workflows
- WhatsApp widget (available, currently off)
- Attendance and HR/master-data sync
- Single Sign-On (SSO)

---

*Reflects the current MH CET Extension Centres configuration. Settings are adjustable per project by administrators.*
