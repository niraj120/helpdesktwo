# Overall Helpdesk Portal

## Brief about the platform

The Helpdesk Portal is a centralized, multi-project support and service management platform designed to manage helpdesk operations across different client projects, departments, centers, and operational teams. The platform provides Super Admin control for global setup, project administrators for project-level operations, and role-based access for agents, managers, viewers, applicants, students, parents, or other configured users.

The portal supports end-to-end ticket and service management, including project creation, user and role management, dynamic forms, ticket lifecycle handling, SLA and escalation, knowledge base, FAQ, notifications, email/SMS/WhatsApp integrations, dashboards, reports, offline operations, asset tracking, feedback, and configurable ISR/PSR workflows where required.

The system is built as a configurable platform rather than a single-project application. Each project can have its own branding, URL path, users, roles, categories, forms, workflow rules, communication settings, dashboards, and enabled modules. Super Admin users manage the overall platform, while project-specific teams work only within the scope and permissions granted to them.

## Module-wise Feature Document

### 1. Super Admin and Platform Administration

- Provides Super Admin access for managing the complete helpdesk platform.
- Allows creation and management of multiple projects/portals from one centralized system.
- Supports global configuration of modules, permissions, roles, master data, project settings, and platform-level controls.
- Allows Super Admin to view and manage projects, users, roles, permissions, categories, SLA rules, escalation rules, dashboards, and integrations.
- Provides administrative visibility across the platform while maintaining project-level data separation for normal users.
- Enables platform governance through audit logs, access logs, activity tracking, and configuration control.

### 2. Multi-Project and Tenant Management

- Supports multiple projects/portals within the same helpdesk platform.
- Allows each project to have its own project name, code, description, status, custom URL path, and configuration.
- Supports project-specific branding such as logo, colors, favicon, portal title, and login experience.
- Allows project-wise enablement of modules such as tickets, knowledge base, reports, assets, offline module, service requests, communication, and user management.
- Maintains project-specific data visibility so users only access projects assigned to them.
- Supports custom project portals through project URL paths.

### 3. Authentication and Login Management

- Supports secure login for platform users and project users.
- Provides JWT-based authenticated sessions.
- Supports password reset and forgot-password flows.
- Supports OTP-based verification where configured.
- Provides separate access experiences for Super Admin, admin users, agents, project portal users, students/applicants, and other configured roles.
- Supports session timeout, secure logout, and permission-based route protection.
- Provides project-branded login pages for project-specific access.

### 4. Role-Based Access Control

- Provides granular role-based access control across the platform.
- Supports system roles and custom roles.
- Allows permissions to be grouped by module and assigned to roles.
- Enables permission-based navigation, page access, action buttons, reports, and configuration controls.
- Supports project-specific role assignment for users.
- Allows Super Admin or authorized admins to create, edit, clone, and manage roles.
- Protects critical platform functions behind specific permissions.

### 5. User Management

- Allows authorized users to create, edit, deactivate, and manage platform/project users.
- Supports user profile details such as name, email, mobile number, employee code, department, designation, reporting manager, role, project, and center mapping.
- Allows assignment of users to one or multiple projects based on operational requirement.
- Supports search and filtering by name, email, role, status, project, center, and other available attributes.
- Supports user activation/deactivation and account status management.
- Supports HRMS/MDM-based user import or lookup where configured.

### 6. Master Data Management

- Provides management of global and project-level master data.
- Supports country, state, city, center, category, sub-category, priority, status, asset category, and other operational master records.
- Supports hierarchical category and sub-category setup.
- Allows project-wise category mapping for ticket routing and reporting.
- Supports active/inactive status, display order, colors, icons, and validations where applicable.
- Provides MDM source configuration for external API-based master data lookup.
- Supports field mapping and source-specific data handling where integrations are enabled.

### 7. Project Configuration and Branding

- Allows each project to be configured independently.
- Supports project logo, color theme, portal title, custom URL path, and branding preview.
- Allows configuration of project modules, ticket settings, offline module, notification preferences, business hours, form fields, SLA behavior, and assignment rules.
- Supports project-specific ticket numbering and ticket submission modes.
- Allows project administrators to manage project settings within granted permissions.
- Ensures project configuration changes are reflected only within the relevant project scope.

### 8. Ticket Management

- Provides full ticket lifecycle management for enquiries, support requests, issues, complaints, and operational tasks.
- Supports ticket creation with subject, description, requester details, category, priority, attachments, and dynamic form fields.
- Generates unique ticket numbers based on configured rules.
- Supports ticket statuses such as Open, In Progress, Resolved, Closed, Re-open, and other configured statuses.
- Allows assignment, reassignment, transfer, escalation, and closure of tickets.
- Supports threaded comments, applicant-visible replies, internal notes, and attachment handling.
- Provides ticket search, filtering, sorting, pagination, and project-scoped listing.
- Maintains ticket history and audit trace for accountability.

### 9. Dynamic Forms and Field Configuration

- Provides configurable forms for ticket intake and service request flows.
- Supports text fields, dropdowns, text areas, checkboxes, radio buttons, file uploads, date fields, and other configurable field types.
- Supports conditional field visibility and required-field rules.
- Allows forms to be configured per project, channel, or ticket/service request type.
- Supports dynamic PSR/ISR form configuration where service request module is enabled.
- Reduces code dependency by allowing admins to change intake forms from configuration.

### 10. Category and Routing Configuration

- Supports hierarchical categories for ticket and service request classification.
- Allows multiple levels of category/sub-category configuration where required.
- Enables category-based routing, assignment, reporting, and SLA handling.
- Supports project-specific category visibility.
- Allows proactive help text or guidance to be shown based on selected category where configured.
- Supports routing matrix concepts for ISR/PSR or department-based workflows.

### 11. SLA and Escalation Management

- Supports response and resolution SLA rules.
- Allows SLA targets to be configured by priority, category, project, and operational policy.
- Provides visual SLA indicators for within-SLA, at-risk, and breached records.
- Supports automatic escalation when SLA is breached or nearing breach.
- Supports manual escalation by authorized users.
- Supports business hours, holidays, and working-calendar based SLA calculations.
- Provides SLA visibility in reports and dashboards.

### 12. Assignment and Workflow Management

- Supports manual and automated ticket assignment.
- Allows assignment to users, roles, teams, or queues depending on configuration.
- Supports reassignment and transfer between agents or teams.
- Supports condition-based assignment rules where enabled.
- Supports workflow controls for status movement, reopening, closure, and escalation.
- Provides permission-based action availability so users can only perform allowed workflow actions.

### 13. Knowledge Base and FAQ

- Provides a centralized knowledge base for self-help and support guidance.
- Supports project-wise article visibility.
- Allows article creation, editing, publishing, categorization, and search.
- Supports FAQ management for common queries.
- Can surface relevant knowledge articles during ticket submission to reduce repeated tickets.
- Supports operational knowledge sharing for applicants, agents, and project teams.

### 14. Communication and Notifications

- Supports email notifications for ticket creation, assignment, response, resolution, escalation, and other configured events.
- Supports SMS notifications for OTP and key ticket updates where configured.
- Supports WhatsApp integration or chatbot workflows where enabled.
- Provides in-app notifications for staff actions and updates.
- Supports browser push notification prompts where configured.
- Maintains notification logs and communication status tracking.
- Supports project-wise notification rules and templates where available.

### 15. Email Intake and Email Processing

- Supports project mailbox configuration.
- Supports email polling and email-to-ticket or email-to-service-request workflows where enabled.
- Allows incoming emails to be converted into tickets or triaged before conversion.
- Tracks email processing status, failures, logs, and conversion history.
- Supports assignment rules for emails based on mailbox, project, sender type, or configured rules.
- Provides visibility for email activity and manual follow-up where required.

### 16. WhatsApp and Chatbot Support

- Supports WhatsApp-based communication where configured for a project.
- Can provide automated brochure/knowledge-based answers through chatbot flows.
- Helps deflect routine and repeated questions.
- Guides users to the web portal or ticket submission flow when the chatbot cannot answer.
- Supports content updates when source knowledge or brochure content changes.

### 17. SMS and OTP Services

- Supports SMS notifications for key events.
- Supports OTP-based verification for selected workflows.
- Supports mobile/email verification where configured.
- Maintains SMS/OTP event handling as part of communication services.

### 18. ISR/PSR Service Request Module

- Supports Internal Service Request (ISR) and Parent Service Request (PSR) workflows for projects that require them.
- Allows PSR creation through parent lookup, student selection, category selection, dynamic fields, walk-in/manual entry, email, or IVR where enabled.
- Supports ISR creation for internal departments such as IT, HR, Finance, Facilities, Procurement, Operations, or other configured departments.
- Supports linking ISR records to PSR or normal tickets.
- Provides tabs such as total requests, assigned to me, raised by me, and my requests based on permissions.
- Supports permission-based update/view access for all requests, assigned requests, and own requests.
- Supports configurable PSR form blocks, labels, placeholders, required rules, and dynamic additional fields.
- Supports MDM/API or database-based lookup for parent/student data based on project configuration.

### 19. IVR and Call Intake

- Supports IVR/call intake for projects that require telephony integration.
- Allows received calls and missed calls to be listed for staff review.
- Supports categorization and conversion of call records into PSR/ISR where enabled.
- Supports Smartflo/TATA-style IVR integration configuration.
- Allows triage mode or direct creation mode depending on project configuration.
- Helps convert phone-based enquiries into trackable service records.

### 20. Offline Center Module

- Supports center/field operations where internet connectivity may be limited.
- Allows attendance capture for staff or field personnel.
- Supports offline data capture and later synchronization with the portal.
- Provides project-wise offline module configuration.
- Reflects offline records in dashboards and reports where enabled.
- Uses role-based access for offline functions.

### 21. Reports and Dashboards

- Provides operational dashboards for tickets, service requests, SLA, volume, status, performance, and trends.
- Supports project-level and platform-level reporting based on user permissions.
- Provides filters such as date range, project, category, status, priority, agent, team, and channel.
- Supports dashboard widgets, summary cards, trend charts, and performance views.
- Supports export to CSV/Excel and offline analysis.
- Helps managers monitor workload, SLA compliance, pending work, and service quality.

### 22. Feedback and Survey Management

- Supports feedback forms and rating capture.
- Allows feedback collection after ticket or service request resolution.
- Provides feedback reporting for service-quality monitoring.
- Helps identify gaps in support response, resolution quality, and user satisfaction.
- Supports configurable feedback forms where enabled.

### 23. Asset and Center Management

- Supports asset management for projects that require asset tracking.
- Allows asset categories, asset records, assignment, mapping, and center-level tracking.
- Supports center management and operational mapping.
- Provides project-wise asset visibility and reporting.
- Helps manage physical or operational assets linked to centers, users, or projects.

### 24. Audit Logs and Activity Tracking

- Maintains audit logs for critical actions.
- Tracks user activity, access events, configuration changes, ticket updates, assignments, and status changes.
- Supports accountability for administrative and operational actions.
- Provides access logs and activity logs for investigation and monitoring.
- Helps Super Admin and authorized users review system usage and operational history.

### 25. Integrations and External Services

- Supports integration with email servers for polling and notifications.
- Supports SMS gateways for OTP and notifications.
- Supports WhatsApp/Chatbot integrations where configured.
- Supports MDM and HRMS APIs for master/user/parent/student data lookup.
- Supports cloud storage for document and knowledge-base assets where configured.
- Supports project-wise integration settings so each project can use only the services required.

### 26. Security and Data Protection

- Uses role-based and permission-based access control.
- Supports project-scoped data access.
- Uses encrypted credential storage for sensitive integration secrets.
- Supports secure API access through authenticated routes.
- Provides rate limiting, input validation, secure headers, and session controls.
- Maintains logs for traceability and operational review.
- Supports data handling practices aligned with project and agreement requirements.

### 27. Platform Outcome

- Provides one configurable helpdesk platform for multiple projects and operational models.
- Allows Super Admin to manage the platform centrally while keeping project operations isolated.
- Reduces manual support handling through workflows, routing, notifications, knowledge base, and reports.
- Improves service visibility through dashboards, SLA tracking, audit logs, and reporting.
- Supports both standard ticketing and advanced service request operations where required.
- Allows each project to use only the modules and workflows relevant to its operations.

