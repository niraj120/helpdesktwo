# VMK Portal — Modules & Features

**A business summary of the modules used on the VMK portal.**

Runs on the SAC multi-tenant platform. Interface available in **English, Hindi, and Marathi**. The modules below are the ones in use for VMK.

---

### 1. Dashboard
At-a-glance operational insight.
- Overview of query counts, workload, status breakdowns, trends, KPI tiles, and charts
- Role-assigned dashboards with a global date range and scope filter
- Personal dashboards and a drag-and-drop dashboard builder
- Usage analytics

### 2. Project Management
Set up and administer the portal/tenant.
- Configure project branding (logo, colours, header/footer, custom URL, domain)
- Set address, contact info, and which modules are enabled
- Activate/deactivate the project

### 3. Master Data Setup
Central reference lists that power dropdowns across the system.
- Maintain categories, statuses, priorities, states/districts, centres, and other lookups
- Add, edit, delete, reorder, and activate/deactivate entries; bulk upload

### 4. Roles & Permissions (RBAC)
Control who can see and do what.
- Create system and custom roles
- Assign granular permissions per role, grouped by module
- Copy/duplicate roles; master vs. project-scoped roles; every action gated by permission

### 5. User Management
Manage staff/agent accounts.
- Create, edit, and deactivate users
- Assign roles, projects, centres, and reporting managers
- Bulk import; reporting hierarchy / org chart

### 6. Offline Module (Walk-in Intake)
For people who visit a centre in person.
- Agents register walk-in visitors using a configurable registration form
- Raise a query on the visitor's behalf
- Configure centre details (address, hours, contact, map location)
- Auto-generated query numbers and status tracking
- **Find nearest centre (student side, Google Maps)** — students/visitors locate the closest centre to them on a map, with distance, address, contact, and working hours (powered by the Google Maps API)

### 7. Knowledge Base
Self-help content library.
- Rich articles organised in a category hierarchy, published for viewing
- Structured reference tables; PDF uploads
- Public-facing viewer with "was this helpful?" feedback

### 8. FAQ
- Managed FAQ entries shown to end-users in the portal

### 9. Integrations
Connect the portal to external systems and channels.
- Email-to-ticket (inbound mail auto-creates queries) and email account configuration
- Public API and API keys for external systems
- (Additional connectors available on the platform as needed)

### 10. Audit
Full accountability trail.
- Activity logs — who did what and when, with a readable before-and-after view of changes
- Automatic, system-wide capture of every change
- Access logs (login/logout); email logs
- Older records archived to cloud storage on a schedule, still searchable
- Personal data masked in the trail

### 11. Asset Management
Track equipment/assets across centres and staff.
- Master asset catalogue and categories
- Allocate assets to centres
- "My Assets" — users view assets assigned to them

### 12. Attendance Management
Staff attendance tracking.
- Browse attendance records and summarised reports
- Sync attendance from biometric devices (with sync logs)
- Per-project configuration and scheduled automatic sync
- Bulk operations and saved reports with alerts

### 13. Feedback
Measure satisfaction.
- Build custom feedback forms (drag-and-drop)
- Automatic survey triggers (e.g., on query closure) and email delivery
- Public feedback page; view responses with charts

### 14. Notifications
Keep users informed.
- Personal notification inbox with an unread-alert bell
- Admin notification settings and per-user preferences
- Browser web-push notifications

### 15. Reports
Operational and management reporting.
- Build, save, run, and export reports (including PDF)
- Assign reports to users; per-role report permissions and data-point access
- Scheduled report delivery by email; threshold alerts

### 16. SLA & Escalation
Guarantee timely handling and auto-escalate when needed.
- Define SLA targets (response and resolution time) by priority/category
- Live SLA countdown timers; monitor at-risk and breached SLAs
- Multi-level escalation matrix (tiered chains by role/hierarchy)
- Automatic escalation on breach; working calendar so timers count business hours only

---

## Foundation (underpins the above)

- **Query (Ticket) Management** — the core desk behind the Offline Module: queries are logged, categorised, auto-assigned, tracked through their status lifecycle, replied to, and closed. (Included here for completeness; it is the backbone the modules above sit on.)
- **Access & Security** — login, password policy, terms acceptance, and permission-gated screens.
- **Multi-language** interface and real-time updates throughout.

---

*Reflects the modules used on the VMK portal. Settings are configurable per project by administrators.*
