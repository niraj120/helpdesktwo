# SAC Helpdesk Portal Notes

## 1. MHCET Extension Center - Prod SAC

### Brief about the platform

The MHCET Extension Center support portal is deployed on the dedicated Prod SAC environment for project-level helpdesk operations. The portal enables applicants and center staff to raise, track, manage, and resolve queries through a controlled web-based support system. It provides role-based access, SLA tracking, knowledge support, notifications, dashboards, feedback, and an offline module for center operations.

The implementation is scoped specifically to the MHCET Extension Center. Project users work only with MHCET center data, while platform-wide administration, tenant provisioning, global master setup, and infrastructure-level configuration remain provider-managed. Logged query intake for this project is through the web portal; email and SMS are used for notifications, and WhatsApp chatbot support is used for brochure-based first response and query deflection.

### Module-wise Feature Document

#### 1. Project Portal and User Access

- Provides a dedicated project portal for the MHCET Extension Center on Prod SAC.
- Allows staff and authorized users to log in with assigned credentials.
- Provides role-based access so each user sees only the functions and records permitted to their role.
- Supports secure logout, session control, and forgot-password/password-reset flow through registered email.
- Maintains project-level isolation so MHCET data is not visible across other projects or tenants.

#### 2. Applicant Query Management

- Enables applicants/requesters to raise queries through the MHCET web portal.
- Captures query subject, description, category, priority, and supporting attachments.
- Generates a unique ticket/query number on submission.
- Provides a structured status lifecycle from Open to In Progress, Resolved, Closed, and Re-open where applicable.
- Supports applicant-visible replies and internal staff notes.
- Allows applicants to track query status and receive updates through configured notification channels.

#### 3. Staff Query Handling

- Enables support executives and agents to view, work on, and update assigned queries.
- Allows center managers to oversee all project queries and reassign or transfer work where required.
- Provides search, filter, and sorting options by status, category, priority, agent, and date.
- Supports document attachment viewing and query history for operational continuity.
- Maintains accountability through traceable updates such as status change, assignment, reassignment, and resolution.

#### 4. SLA and Escalation Management

- Applies response and resolution SLA targets based on configured priority/category rules.
- Shows SLA indicators for within-SLA, at-risk, and breached queries.
- Supports automatic escalation when SLA thresholds are breached.
- Allows manual escalation by authorized agents or managers.
- Supports working-calendar awareness for SLA computation, including working hours and holidays as configured.

#### 5. Knowledge Base and FAQ

- Provides a searchable knowledge base and FAQ section for self-help.
- Allows authorized center staff to create and update knowledge articles.
- Surfaces relevant articles during query submission to reduce repeat queries.
- Supports operational knowledge sharing for both applicants and support teams.

#### 6. Email, SMS, and WhatsApp Communication

- Sends email notifications on key query events such as creation, assignment, response, and resolution.
- Sends SMS notifications to applicants for important updates such as query logged and resolved.
- Provides WhatsApp chatbot support for brochure-based instant answers.
- Supports 24x7 automated chatbot response for routine/repeated MHCET queries.
- Guides users to the web portal when the chatbot cannot answer or when a query must be formally logged.
- Allows brochure/knowledge content powering the chatbot to be updated when MHCET information changes.

#### 7. Offline Module

- Supports field/operational activities configured for the MHCET Extension Center.
- Captures staff attendance for extension-center personnel.
- Allows data capture when connectivity is limited and synchronizes records once online.
- Reflects offline-captured records and attendance in dashboards/reports.
- Provides role-based access to offline module functions within the project.

#### 8. Dashboards and Reports

- Provides an operational dashboard showing totals by status, pending queries, resolved queries, SLA compliance, and query volume.
- Supports agent/team performance views such as handled queries and resolution rate.
- Allows filtering by date range, category, status, and agent.
- Supports report exports in CSV/Excel format for offline analysis.
- Ensures dashboard and report data remains scoped to the MHCET Extension Center.

#### 9. Feedback and Service Quality

- Captures applicant feedback/rating after query resolution.
- Makes feedback available in service-quality reports.
- Helps the center monitor resolution experience and identify recurring service gaps.

#### 10. MHCET Scope Notes

- Service Requests (ISR/PSR) are not used by the MHCET Extension Center delivery.
- Platform/super-admin configuration, tenant onboarding, server configuration, and global master data setup are outside MHCET project scope.
- MHCET logged queries are received through Web/Portal only; WhatsApp is for automated assistance, and email/SMS are for notifications.

---

## 2. Overall SAC Helpdesk Portal

### Brief about the platform

The SAC Helpdesk Portal is a multi-project support and service management platform built to manage helpdesk operations across multiple projects/portals. It provides a centralized backend with project-specific branding, access control, ticket workflows, knowledge management, SLA/escalation, communication integrations, reports, dashboards, offline operations, feedback, and configurable service request flows.

The platform is designed for multi-tenant/project use. Each project can have its own custom URL path, branding, users, roles, ticket categories, forms, workflows, communication settings, dashboards, and operational modules. Access is controlled through RBAC and granular permissions so that users see only the project data and functions assigned to them.

### Module-wise Feature Document

#### 1. Multi-Project Portal Management

- Supports creation and management of multiple projects/portals from a centralized system.
- Allows each project to have its own name, code, description, custom URL path, status, and branding.
- Supports project-specific logos, colors, login pages, and portal experience.
- Provides project-wise configuration for modules such as tickets, knowledge base, reports, assets, communication, user management, offline operations, and service requests.
- Maintains project-level data separation and controlled visibility.

#### 2. Authentication and Access Control

- Supports user login through configured authentication flows.
- Provides JWT-based secure session handling.
- Supports OTP-based verification where configured.
- Includes forgot-password and reset-password flows.
- Uses role-based access control with granular permissions.
- Allows project-specific role assignment, permission validation, and route protection.
- Supports separate user experiences for admins, agents, project portal users, students/applicants, and viewers.

#### 3. User, Role, and Permission Management

- Allows administrators to create, update, deactivate, and manage users.
- Supports assignment of users to projects and roles.
- Provides configurable roles with permission-based access to modules and actions.
- Allows project managers to manage users within granted limits.
- Supports view-only, create, update, assign, report, and administrative permission patterns.
- Enables permission-driven navigation so users see only relevant menu items.

#### 4. Ticket and Query Management

- Provides full ticket lifecycle management for requests, complaints, enquiries, and operational issues.
- Supports ticket creation through configured channels and forms.
- Captures subject, description, category, priority, requester details, attachments, comments, and internal notes.
- Supports assignment, reassignment, status updates, escalation, closure, reopening, and audit history.
- Provides filtering, search, sorting, bulk views, and project-scoped ticket lists.
- Supports applicant/requester tracking and staff-side operational handling.

#### 5. Category, Form, and Master Configuration

- Supports hierarchical categories and sub-categories for ticket routing and reporting.
- Allows project-wise category mapping and configuration.
- Provides dynamic form builder support for configurable fields.
- Supports conditional fields, required rules, dropdowns, text fields, file inputs, and project-specific form layouts.
- Supports master data setup for geographic, ticket, status, SLA, escalation, and operational configuration.
- Provides MDM source configuration for external master data APIs where required.

#### 6. SLA, Escalation, and Workflow Rules

- Supports SLA rules for response and resolution tracking.
- Provides escalation matrix configuration.
- Allows auto-escalation based on breach or due conditions.
- Supports working hours, holiday calendars, and business calendar handling.
- Provides SLA visibility in dashboards and ticket views.
- Supports assignment workflows and configurable routing logic where enabled.

#### 7. Knowledge Base and FAQ

- Provides a central knowledge base with project-wise visibility.
- Supports article creation, categorization, publishing, and search.
- Allows FAQ management for applicant and staff self-service.
- Supports article suggestions during query submission to reduce repeated issues.
- Provides knowledge content management for operational teams and public/project portals.

#### 8. Communication and Notification Management

- Supports email notification configuration and event-based email updates.
- Provides SMS integration for OTP and applicant notifications where configured.
- Supports WhatsApp integration for automated responses and user communication where enabled.
- Includes in-app notifications for staff assignments and ticket updates.
- Provides notification logs, email logs, polling configuration, and failure tracking.
- Supports project-wise communication settings and channel-specific behavior.

#### 9. Email Intake and Automation

- Supports email polling and processing for configured project mailboxes.
- Converts or triages incoming emails based on project settings.
- Tracks email activity, processing errors, and conversion history.
- Allows manual or automated handling depending on project workflow.
- Supports source mailbox configuration and assignment rules.

#### 10. ISR/PSR Service Request Module

- Provides configurable service request flows for projects that require ISR/PSR operations.
- Supports PSR (Parent Service Request) flows such as parent lookup, student selection, category selection, dynamic forms, and walk-in/manual request creation.
- Supports ISR (Internal Service Request) flows for internal departments such as IT, HR, Finance, Facilities, Procurement, and Operations.
- Allows PSR and ISR forms to be dynamic and project-configurable.
- Supports linking ISR records to parent PSR or normal tickets where enabled.
- Provides permission-based tabs such as all requests, assigned to me, raised by me, and own requests.
- Supports project-wise lookup source selection from MDM API, MongoDB database, or auto fallback.

#### 11. IVR and Call Intake

- Supports IVR/call-intake configuration for projects that use telephony integration.
- Allows call and missed-call details to be received, listed, categorized, and converted into PSR/ISR records where enabled.
- Supports Smartflo/TATA-style integration intent and configurable project-level behavior.
- Provides a controlled workflow for staff to review call records before conversion when triage mode is enabled.

#### 12. Offline Center Module

- Supports offline/field operations for projects with center-based activities.
- Allows attendance capture and operational records to be collected with limited connectivity.
- Synchronizes offline records back to the portal when online.
- Provides role-based access to offline module features.
- Reflects offline activity in dashboards and reports where configured.

#### 13. Reports, Dashboards, and Analytics

- Provides operational dashboards for tickets, status, volume, SLA, performance, and trends.
- Supports configurable reports for project operations and management review.
- Allows date range, project, category, status, agent, and channel filters.
- Supports export of report data for offline analysis.
- Provides graphical dashboard widgets and project-level analytics.

#### 14. Feedback and Surveys

- Supports feedback forms and response capture.
- Allows feedback collection after ticket or service request resolution.
- Provides feedback reports for service-quality monitoring.
- Helps identify recurring issues and improvement areas.

#### 15. Asset and Center Management

- Supports asset management where enabled for a project.
- Allows asset records, center mapping, and operational asset tracking.
- Supports center-related configuration and reporting.
- Provides project-wise controls so asset functionality is available only where required.

#### 16. Audit, Logs, and Security Monitoring

- Maintains audit logs for important user and system actions.
- Supports activity logs and access logs for traceability.
- Tracks key events such as ticket updates, assignments, status changes, and configuration changes.
- Supports database and system monitoring utilities.
- Provides security-oriented controls such as rate limiting, route protection, input validation, and encrypted credential handling.

#### 17. Overall Platform Outcome

- Provides a single configurable support platform for multiple projects.
- Reduces manual query handling by standardizing workflows and communication.
- Improves transparency through dashboards, reports, notifications, and audit trails.
- Supports project-specific operations without requiring separate systems for each client/project.
- Allows advanced modules such as ISR/PSR, IVR, MDM lookup, offline operations, assets, and email automation to be enabled only where required.

