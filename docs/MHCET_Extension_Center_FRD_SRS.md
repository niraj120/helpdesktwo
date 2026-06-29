# Functional Requirements Document (FRD) & Software Requirements Specification (SRS)

**Project:** MHCET Extension Center — Support & Service Portal
**Environment:** Prod SAC (dedicated production server)
**Prepared by:** Business Analysis Team
**Document type:** FRD + SRS (combined)
**Audience:** Client stakeholders, project operations team, QA/UAT
**Version:** 1.2 (Draft for client review)

---

## 1. Introduction

### 1.1 Purpose
This document defines the functional and non-functional requirements of the MHCET Extension Center portal delivered on the dedicated Prod SAC server. It is the handover reference between the delivery team and the client for operations, UAT, and sign-off.

### 1.2 Scope
The portal enables the MHCET Extension Center to receive, manage, and resolve queries from applicants and staff, with SLA tracking, knowledge support, multi-channel communication, reporting, and feedback. Scope is limited to **project-level operations**. Platform-wide configuration and administration are managed by the service provider and are **out of scope**.

### 1.3 Intended audience
Center operations managers, support executives/agents, reporting users, and client project owners.

### 1.4 Definitions
| Term | Meaning |
|---|---|
| Query / Ticket | A logged request, complaint, or enquiry tracked to resolution |
| SLA | Service Level Agreement — target response/resolution time |
| Escalation | Automatic/manual hand-off when SLA is at risk or breached |
| KB | Knowledge Base — self-help articles and FAQs |
| Chatbot | WhatsApp automated assistant answering from the MHCET brochure/knowledge content |
| Center Manager | Project administrator for the MHCET Extension Center |
| Agent / Executive | Staff member who handles queries |
| Applicant / Requester | End user raising a query |

### 1.5 Out of scope (excluded)
- Platform/super-admin administration, project provisioning, tenant onboarding.
- Global master data, global role/permission catalog setup, server/infrastructure configuration.
- Cross-project / multi-tenant administration.
- **Service Requests (ISR/PSR) module — not used by MHCET.**

---

## 2. Project Overview

The MHCET Extension Center portal is a web-based support and service management system hosted on the **Prod SAC** server, configured exclusively for the MHCET Extension Center. Applicants raise and track queries through the **web portal**, while routine questions are also handled automatically by a **WhatsApp chatbot** driven by the MHCET information brochure. Staff manage and resolve queries with SLA enforcement, knowledge support, and management reporting — all confined to this center's data.

**Key outcomes**
- Single web window for applicant and staff queries.
- 24×7 automated first response via WhatsApp chatbot (brochure-based).
- Timely resolution via SLA and escalation.
- Reduced repeat queries via Knowledge Base + chatbot deflection.
- Visibility through dashboards and reports.
- Auditable, secure handling of center data.

---

## 3. User Roles (Project Level)

| Role | Description | Core capabilities |
|---|---|---|
| **Center Manager** | Project owner/administrator | Manage center users, oversee all queries, assign/reassign, configure center-level settings within granted limits, view all reports |
| **Support Agent / Executive** | Day-to-day query handler | View assigned queries, respond, update status, escalate, use KB |
| **Reporting / Viewer** *(optional)* | Read-only oversight | View dashboards and reports, no edit |
| **Applicant / Requester** | External end user | Raise queries via web portal, track status, receive updates (email/SMS), interact with WhatsApp chatbot, give feedback, browse KB |

> Roles and permissions are assigned within the center by the Center Manager from the permission set granted to this project. The global permission framework is provider-managed and out of scope.

---

## 4. Functional Requirements (FRD)

### 4.1 Authentication & Access
- **FR-AUTH-01** Users log in to the MHCET center portal with credentials.
- **FR-AUTH-02** Forgot-password / password reset via registered email.
- **FR-AUTH-03** Role-based access — users see only the functions and data permitted to their role.
- **FR-AUTH-04** Session security with automatic timeout and secure logout.
- **FR-AUTH-05** Applicants access a center-branded web portal to raise and track queries.

### 4.2 Query / Ticket Management (core)
- **FR-QRY-01** Raise a query with subject, description, category, priority, and attachments.
- **FR-QRY-02** Auto-generate a unique ticket number on submission.
- **FR-QRY-03** Intake channel: **Web / Portal** (single channel for logged queries).
- **FR-QRY-04** Categorize queries by configurable categories/sub-categories relevant to MHCET.
- **FR-QRY-05** Assign/auto-route queries to the appropriate agent or queue.
- **FR-QRY-06** Reassign / transfer a query between agents.
- **FR-QRY-07** Status lifecycle (Open → In Progress → Resolved → Closed; Re-open supported).
- **FR-QRY-08** Threaded comments/replies; internal notes vs. applicant-visible responses.
- **FR-QRY-09** Attach and view supporting documents.
- **FR-QRY-10** Search, filter, and sort queries by status, category, priority, agent, date.
- **FR-QRY-11** Applicant can track query status and receive updates.

### 4.3 SLA & Escalation
- **FR-SLA-01** Apply response and resolution SLA targets by priority/category.
- **FR-SLA-02** Visual indicators for within-SLA, at-risk, and breached queries.
- **FR-SLA-03** Auto-escalate on SLA breach to a defined escalation level.
- **FR-SLA-04** Manual escalation by agents/managers.
- **FR-SLA-05** Working-calendar awareness (working hours/holidays) for SLA computation.

### 4.4 Knowledge Base & FAQ
- **FR-KB-01** Browse/search KB articles and FAQs for self-help.
- **FR-KB-02** Center staff create/update KB articles within their permission.
- **FR-KB-03** Surface relevant articles during query submission to deflect repeat queries.

### 4.5 Communication
**Email**
- **FR-COM-01** Email notifications on key events (creation, assignment, response, resolution).

**SMS**
- **FR-COM-02** SMS notifications to applicants on key events (e.g., query logged, resolved).

**WhatsApp Chatbot (brochure-driven)**
- **FR-COM-03** Applicants interact with a WhatsApp chatbot for instant answers.
- **FR-COM-04** Chatbot answers are generated from the **MHCET information brochure / knowledge content**.
- **FR-COM-05** Chatbot is available 24×7 and handles routine/repeat questions automatically (deflection).
- **FR-COM-06** When the chatbot cannot answer, it guides the applicant to the web portal to log a query.
- **FR-COM-07** Brochure/knowledge content powering the chatbot is updatable when the brochure changes.

**In-app**
- **FR-COM-08** In-app notifications for staff on assignments and updates.

### 4.6 Feedback
- **FR-FB-01** Capture applicant feedback/rating on resolution.
- **FR-FB-02** Feedback visible in reports for service-quality monitoring.

### 4.7 Dashboards & Reports (project-scoped)
- **FR-RPT-01** Operational dashboard — totals by status, pending, resolved, SLA compliance, query volume.
- **FR-RPT-02** Agent/team performance view (queries handled, resolution rate).
- **FR-RPT-03** Filter reports by date range, category, status, agent.
- **FR-RPT-04** Export reports (CSV/Excel) for offline analysis.

### 4.8 Center User Management (within project)
- **FR-USR-01** Center Manager adds/edits/deactivates center users.
- **FR-USR-02** Assign center roles to users from the permitted role set.

### 4.9 Offline Module
- **FR-OFF-01** Support center field/operational activities through the offline module configured for MHCET.
- **FR-OFF-02** Capture staff attendance for extension-center personnel.
- **FR-OFF-03** Record/capture data when connectivity is limited and **synchronize** it to the portal once online.
- **FR-OFF-04** Offline-captured records and attendance are reflected in dashboards/reports.
- **FR-OFF-05** Role-based access to offline module functions within the center.

> **Note:** The Service Requests (ISR/PSR) module is **not used** by the MHCET Extension Center and is excluded from this delivery.

---

## 5. Software Requirements Specification (SRS)

### 5.1 Non-Functional Requirements
| ID | Category | Requirement |
|---|---|---|
| **NFR-PERF-01** | Performance | Standard pages load within ~3s under normal load; listing pages paginated for large datasets. |
| **NFR-SCAL-01** | Scalability | Supports the center's concurrent users and growing query volume on Prod SAC. |
| **NFR-AVL-01** | Availability | Target uptime ≥ 99% during business hours; planned maintenance communicated in advance. WhatsApp chatbot available 24×7. |
| **NFR-SEC-01** | Security | Role-based access control; data isolated to the MHCET project; no cross-project visibility. |
| **NFR-SEC-02** | Security | Encrypted transport (HTTPS); secure credential storage; session timeout. |
| **NFR-SEC-03** | Audit | Key actions (status changes, assignments) traceable for accountability. |
| **NFR-USE-01** | Usability | Modern, responsive UI usable on desktop and tablet; consistent navigation. |
| **NFR-COMP-01** | Compatibility | Works on current versions of major browsers (Chrome, Edge, Firefox). |
| **NFR-DATA-01** | Data | Regular backups of center data; defined retention per agreement. |
| **NFR-LOC-01** | Localization | Trilingual UI — **English, Hindi, Marathi** — developed for MHCET; user-selectable language toggle. |
| **NFR-ACC-01** | Accessibility | Reasonable accessibility (contrast, labels, keyboard navigation). |

### 5.2 Data & Privacy
- All data scoped to the MHCET Extension Center project on Prod SAC; not shared with other projects/tenants.
- Applicant personal data handled per the applicable data-protection agreement.

### 5.3 Integrations
- **Email gateway** — event notifications (mandatory).
- **SMS gateway** — applicant notifications (mandatory).
- **WhatsApp Business API + chatbot** — automated brochure-based responses (mandatory).
- *Provider-managed integration configuration is out of scope of this handover.*

### 5.4 Assumptions
- A1 — Categories, priorities, SLA targets, and escalation levels are set per MHCET's operational policy during configuration.
- A2 — User roles and counts provided by the client at onboarding.
- A3 — Brochure content for the chatbot is supplied and maintained by the client; updates re-published on request.

### 5.5 Constraints
- Functionality limited to permissions granted to the MHCET project; platform-level changes require the service provider.
- Hosted on the dedicated Prod SAC server.
- Logged queries are intake via Web/Portal only; WhatsApp is for automated chatbot responses and SMS/email for notifications.

### 5.6 Acceptance Criteria (UAT high-level)
- [ ] Users log in by role and see only permitted data/functions.
- [ ] Applicant can raise, track, and receive updates (email + SMS) on a web-portal query.
- [ ] WhatsApp chatbot answers brochure-based questions and routes unanswered ones to the portal.
- [ ] Query routes/assigns, moves through full status lifecycle, supports comments and attachments.
- [ ] SLA indicators and escalation behave per configured targets.
- [ ] KB/FAQ searchable and usable.
- [ ] Email and SMS notifications delivered on key events.
- [ ] Feedback captured and reflected in reports.
- [ ] Dashboards/reports show correct center-scoped figures and export successfully.
- [ ] Offline module captures attendance/field data and syncs correctly when back online.
- [ ] UI switches correctly between English, Hindi, and Marathi.
- [ ] All data confined to the MHCET center; no cross-project access.

---

## 6. Document Control
| Field | Value |
|---|---|
| Project | MHCET Extension Center |
| Server | Prod SAC |
| Version | 1.2 (Draft for client review) |
| Status | For confirmation |
| Channels | Web/Portal (queries); Email + SMS (notifications); WhatsApp chatbot (brochure-based) |
| Languages | English, Hindi, Marathi |
