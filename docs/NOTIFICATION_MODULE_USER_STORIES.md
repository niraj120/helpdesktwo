# Notification Module — User Stories

**Module:** In-App Notification System  
**Version:** 1.0  
**Date:** May 2026  
**Status:** Ready for Development

> **Platform Context:**
>
> - Backend: Express + TypeScript + Mongoose + MongoDB (port 3003)
> - Frontend: React + TypeScript + Vite (port 3001)
> - Real-time: Socket.IO already in place (`io.to("user-{userId}").emit(...)`)
> - Auth: JWT in `localStorage.authToken`, permissions in `localStorage.userPermissions`
> - RBAC: `checkPermission("CODE")` middleware on backend, `hasPermission("CODE")` on frontend
> - No Redis in current stack — Socket.IO handles cross-room broadcast within single instance

---

## Actor Definitions

| Actor              | Role Code                                                 | Description                                                           |
| ------------------ | --------------------------------------------------------- | --------------------------------------------------------------------- |
| Super Admin        | `SUPER_ADMIN`                                             | Full access across all projects; configures global notification rules |
| Project Admin      | Any role with `notification.manage` scoped to own project | Configures notifications within assigned projects                     |
| Agent              | Any role with `TICKET_VIEW_OWN` or `TICKET_VIEW_ALL`      | Works tickets; receives work-related notifications                    |
| End User / Student | `STUDENT` or any portal login                             | Submits tickets; receives own-ticket notifications                    |

---

## Epic 1 — RBAC & Permission Foundation

### US-001 — New Permission Registration

**As a** system administrator  
**I want** three new permission codes added to the RBAC system  
**So that** notification settings can be gated behind proper access controls

**Acceptance Criteria:**

- `NOTIFICATION_MANAGE` — Can create, update, delete notification settings (project & global)
- `NOTIFICATION_VIEW_SETTINGS` — Can view notification settings read-only
- `NOTIFICATION_PERSONAL_PREFERENCES` — Can manage own delivery preferences
- All three appear in the "Notifications" category in the RBAC permissions list
- Can be assigned to any custom role via the existing Role Management UI (RBACSetup page)
- Default seeding: Super Admin gets all three; Agent and Student get `NOTIFICATION_PERSONAL_PREFERENCES`

**Tasks:** DB-001, BE-001, FE-001

---

### US-002 — Permission Visibility in Role Management

**As a** Super Admin  
**I want** the three notification permissions to appear under a "Notifications" group in the RBAC Setup page  
**So that** I can assign them to custom roles just like any other permission

**Acceptance Criteria:**

- RBAC Setup UI groups permissions by `category`
- A "Notifications" group appears with the three permission codes
- Toggling them on/off for a role saves correctly and is reflected in JWT on next login

**Tasks:** BE-001, FE-001

---

## Epic 2 — Database Models

### US-003 — Notification Storage

**As the** system  
**I want** every notification delivered to a user persisted in MongoDB  
**So that** users can retrieve their notification history even if they were offline

**Acceptance Criteria:**

- `Notification` Mongoose collection (replaces/extends the existing basic one)
- Fields: `recipientUserId`, `triggeredByUserId`, `projectId`, `triggerType`, `entityType`, `entityId`, `title`, `body`, `deepLinkUrl`, `isRead`, `readAt`, `createdAt`
- Indexes on `(recipientUserId, isRead)`, `(recipientUserId, createdAt DESC)`, `(recipientUserId, triggerType, entityId, createdAt)` for dedup
- Max TTL: no auto-delete (notifications persist indefinitely until manually cleared)

**Tasks:** DB-002

---

### US-004 — Notification Settings Storage

**As a** Super Admin  
**I want** notification rules stored per project per role per trigger  
**So that** the engine knows who to notify for each event

**Acceptance Criteria:**

- `NotificationSetting` collection
- Fields: `projectId` (null = global default), `triggerType`, `roleId`, `isEnabled`, `channels: { inApp: Boolean, email: Boolean }`, `updatedBy`, `updatedAt`
- Unique index on `(projectId, triggerType, roleId)` with sparse support for null projectId
- Lookup precedence: project-specific row first → fall back to `projectId = null` global default

**Tasks:** DB-003

---

### US-005 — User Preferences Storage

**As a** user  
**I want** my personal notification opt-out choices persisted  
**So that** I don't receive notification types I've disabled even if admin has them enabled

**Acceptance Criteria:**

- `UserNotificationPreference` collection
- Fields: `userId`, `triggerType`, `inAppEnabled`, `emailEnabled`, `updatedAt`
- Unique index on `(userId, triggerType)`

**Tasks:** DB-004

---

## Epic 3 — Notification Engine (Backend)

### US-006 — Rule Evaluation on Ticket Created

**As an** Agent / Project Admin  
**I want** to receive an in-app notification when a new ticket is created in my project  
**So that** I am aware of incoming work immediately

**Acceptance Criteria:**

- When `ticketController.createTicket` succeeds, notification engine is called with `trigger_type = ticket_created`
- Engine queries `NotificationSetting` for `(projectId, ticket_created)` — falls back to global if no project row
- Engine resolves all users whose role is in the enabled-roles list for that project
- Initiator (person who created the ticket) is excluded
- Users who opted out of `ticket_created` in-app notifications are excluded
- Dedup: skip if same `(recipientUserId, ticket_created, ticketId)` within 60 seconds
- Notification records inserted for remaining recipients
- Real-time Socket.IO `notification` event emitted to `user-{userId}` room for each recipient

**Tasks:** BE-003, BE-004

---

### US-007 — Rule Evaluation on Ticket Assigned

**As an** Agent  
**I want** to receive a notification when a ticket is assigned to me  
**So that** I know I have new work to pick up

**Acceptance Criteria:**

- Trigger: `ticket_assigned_to_me` fires when `assignedTo` field changes on a ticket
- Only the newly assigned agent receives this notification (not role-based fan-out)
- Title template: "Ticket #{{number}} was assigned to you"
- Deep link: `/projects/:projectId/tickets/:ticketId`

**Tasks:** BE-003, BE-004

---

### US-008 — Rule Evaluation on Ticket Reply

**As an** End User and Agent  
**I want** to receive a notification when a new reply is added to my ticket  
**So that** I can see the latest response

**Acceptance Criteria:**

- Trigger: `ticket_reply_added` fires on new comment/reply creation
- Recipients: ticket assignee (Agent) + ticket creator (End User) — not the reply author
- Title template: "{{agent_name}} replied to Ticket #{{number}}"
- Deep link includes `#reply-:replyId` anchor

**Tasks:** BE-003, BE-004

---

### US-009 — Rule Evaluation on Status Change

**As an** End User  
**I want** to receive a notification when my ticket status changes  
**So that** I know my issue is being worked on or resolved

**Acceptance Criteria:**

- Trigger: `ticket_status_changed`
- Recipients: ticket assignee + ticket creator (respecting role-based settings)
- Title template: "Ticket #{{number}} is now {{new_status}}"
- Deep link: `/projects/:projectId/tickets/:ticketId`

**Tasks:** BE-003, BE-004

---

### US-010 — Rule Evaluation on Ticket Closed

**As an** End User  
**I want** a notification when my ticket is closed  
**So that** I know my issue has been resolved

**Acceptance Criteria:**

- Trigger: `ticket_closed`
- Recipients: End User (ticket creator) + assigned Agent
- Title: "Ticket #{{number}} has been closed"

**Tasks:** BE-003, BE-004

---

### US-011 — Rule Evaluation on Ticket Escalated

**As a** Project Admin  
**I want** to be notified when a ticket is escalated  
**So that** I can monitor SLA compliance

**Acceptance Criteria:**

- Trigger: `ticket_escalated`
- Recipients: Project Admin role + ticket assignee (per project settings)
- Title: "Ticket #{{number}} has been escalated"

**Tasks:** BE-003, BE-004

---

### US-012 — SLA Breach Warning Notification

**As an** Agent  
**I want** a warning notification before a ticket breaches its SLA  
**So that** I can respond before the deadline

**Acceptance Criteria:**

- Trigger: `sla_breach_warning` fired by the existing `autoEscalationService` at the warning threshold
- Recipients: ticket assignee + Project Admin role
- Title: "Ticket #{{number}} SLA is due in {{time_remaining}}"

**Tasks:** BE-003, BE-004

---

### US-013 — SLA Breached Notification

**As a** Project Admin  
**I want** a notification when a ticket has breached its SLA  
**So that** I can take corrective action

**Acceptance Criteria:**

- Trigger: `sla_breached` fired by `autoEscalationService`
- Title: "Ticket #{{number}} has breached its SLA"

**Tasks:** BE-003, BE-004

---

### US-014 — KB Article Published Notification

**As an** Agent  
**I want** to be notified when a new KB article is published  
**So that** I can reference it when helping customers

**Acceptance Criteria:**

- Trigger: `kb_article_published` fires from `kbArticleController` on status → published
- Recipients: all roles with KB access (per project setting)
- Title: "New article: {{article_title}}"
- Deep link: `/kb/:articleId`

**Tasks:** BE-003, BE-004

---

### US-015 — Deduplication and Self-Exclusion

**As the** system  
**I want** notifications to be deduplicated and not sent to the action initiator  
**So that** users don't receive redundant or self-generated noise

**Acceptance Criteria:**

- No notification created if the `triggeredByUserId === recipientUserId`
- No notification created if same `(recipientUserId, triggerType, entityId)` exists in the last 60 seconds
- Dedup check uses `(recipientUserId, triggerType, entityId, createdAt)` index

**Tasks:** BE-004

---

## Epic 4 — Notification REST API

### US-016 — Fetch My Notifications

**As a** logged-in user  
**I want** to retrieve my notification list via API  
**So that** the frontend can render the bell dropdown and full notifications page

**Acceptance Criteria:**

- `GET /api/notifications` — authenticated, returns paginated list for current user
- Supports `?unread=true`, `?entityType=ticket|kb_article`, `?page=`, `?limit=`
- Returns `{ items, totalUnread, total, page, totalPages }`
- Items sorted by `createdAt DESC`
- Only returns own notifications (tenant-scoped)

**Tasks:** BE-005

---

### US-017 — Mark Single Notification Read

**As a** logged-in user  
**I want** to mark a notification as read when I click it  
**So that** the unread badge decrements

**Acceptance Criteria:**

- `PATCH /api/notifications/:id/read` — authenticated
- Sets `isRead = true`, `readAt = now`
- Returns 404 if notification doesn't belong to current user
- Cannot mark another user's notification

**Tasks:** BE-005

---

### US-018 — Mark All Notifications Read

**As a** logged-in user  
**I want** to mark all my notifications as read at once  
**So that** I can clear the badge without clicking each one

**Acceptance Criteria:**

- `POST /api/notifications/read-all` — authenticated
- Updates all `isRead = false` records for the current user
- Returns count of records updated

**Tasks:** BE-005

---

### US-019 — Get Unread Count

**As a** logged-in user  
**I want** the bell badge to show my current unread count  
**So that** I know at a glance how many notifications are waiting

**Acceptance Criteria:**

- `GET /api/notifications/unread-count` — authenticated
- Returns `{ count: N }` — fast query on `(recipientUserId, isRead)` index
- Responds within 100ms

**Tasks:** BE-005

---

## Epic 5 — Admin Notification Settings API

### US-020 — View Notification Settings

**As a** Super Admin or Project Admin  
**I want** to view the current notification configuration for a project  
**So that** I can understand what is enabled

**Acceptance Criteria:**

- `GET /api/admin/notification-settings?projectId=&roleId=` — requires `NOTIFICATION_VIEW_SETTINGS`
- Returns all settings matching the filter, including global defaults where no project override exists
- Project Admins only see settings for their own projects (403 for others)

**Tasks:** BE-006

---

### US-021 — Upsert Notification Setting

**As a** Super Admin  
**I want** to enable or disable a trigger for a specific role and project  
**So that** I can control who gets notified for what

**Acceptance Criteria:**

- `PUT /api/admin/notification-settings` — requires `NOTIFICATION_MANAGE`
- Body: `{ projectId, triggerType, roleId, isEnabled, channels: { inApp, email } }`
- Creates or updates row by unique key `(projectId, triggerType, roleId)`
- `projectId = null` sets a global default
- Auto-saves: no explicit save button in frontend; fires on each toggle
- Records change in audit log: entity_type `notification_setting`, before/after states
- Project Admins receive 403 if `projectId` is not in their assigned projects

**Tasks:** BE-006

---

### US-022 — Reset Project to Global Defaults

**As a** Super Admin  
**I want** to remove all project-specific overrides for a project  
**So that** it falls back to the global default rules

**Acceptance Criteria:**

- `DELETE /api/admin/notification-settings?projectId=` — requires `NOTIFICATION_MANAGE`
- Deletes all rows where `projectId` matches the given ID
- Returns count of deleted rows

**Tasks:** BE-006

---

## Epic 6 — User Preferences API

### US-023 — View My Notification Preferences

**As a** logged-in user  
**I want** to see which notification types I've personalised  
**So that** I can review my opt-out choices

**Acceptance Criteria:**

- `GET /api/me/notification-preferences` — authenticated
- Returns all `UserNotificationPreference` records for current user
- Missing records imply `inAppEnabled: true, emailEnabled: true` (defaults)

**Tasks:** BE-007

---

### US-024 — Update My Notification Preference

**As a** logged-in user  
**I want** to opt out of specific notification types  
**So that** I don't receive irrelevant notifications

**Acceptance Criteria:**

- `PUT /api/me/notification-preferences/:triggerType` — requires `NOTIFICATION_PERSONAL_PREFERENCES`
- Body: `{ inAppEnabled, emailEnabled }`
- Upserts by `(userId, triggerType)`
- Cannot set `inAppEnabled: true` for a trigger the admin has disabled for the user's role

**Tasks:** BE-007

---

## Epic 7 — Real-Time Delivery (Socket.IO)

### US-025 — Real-Time Bell Badge Update

**As a** logged-in user  
**I want** the bell badge to update instantly when I receive a new notification  
**So that** I don't have to refresh the page

**Acceptance Criteria:**

- Backend emits `notification:new` event on Socket.IO room `user-{recipientUserId}` after inserting notification
- Frontend `useNotifications` hook listens on the existing Socket.IO connection
- Unread count increments by 1 in real-time
- Badge visually pulses / animates when a new notification arrives

**Tasks:** BE-008, FE-006

---

### US-026 — Polling Fallback

**As a** logged-in user on a flaky connection  
**I want** the frontend to poll for new notifications if the socket is disconnected  
**So that** I don't miss notifications when the real-time connection drops

**Acceptance Criteria:**

- If socket is disconnected, frontend polls `GET /api/notifications/unread-count` every 30 seconds
- On reconnect, frontend re-fetches the latest notifications since last received timestamp
- Gap-fill handled by polling `GET /api/notifications?after=<lastTimestamp>`

**Tasks:** FE-006

---

## Epic 8 — Bell Icon & Dropdown Panel (Frontend)

### US-027 — Bell Icon in Top Navigation

**As a** logged-in user  
**I want** to see a bell icon in the top nav bar  
**So that** I always know how many unread notifications I have

**Acceptance Criteria:**

- Bell icon appears in `DashboardLayout` top nav for ALL authenticated users (no permission gate)
- Badge shows unread count; hidden when count = 0
- Badge caps at `99+` for counts > 99
- Badge has `aria-label="Notifications, N unread"` for accessibility
- Bell icon matches design system: accent color `#7F56D9`, badge `#DC2626`
- Uses `@heroicons/react/24/outline` `BellIcon`

**Tasks:** FE-007

---

### US-028 — Notification Dropdown Panel

**As a** logged-in user  
**I want** to click the bell icon and see my recent notifications in a dropdown  
**So that** I can quickly scan and act on notifications without navigating away

**Acceptance Criteria:**

- Clicking bell opens a dropdown panel anchored below the icon
- Panel shows 20 most recent notifications, newest first
- Each row shows:
  - Trigger-type icon (colour-coded per section 9.1 of PRD)
  - Short title text (populated template)
  - Relative timestamp ("3 min ago", "Yesterday")
  - Unread dot indicator (colour + shape, not colour alone)
  - Project context chip (project name)
- Clicking a notification: marks as read → closes dropdown → navigates to `deepLinkUrl`
- Footer row: "Mark all as read" button + "View all" link → `/notifications`
- Clicking outside closes the dropdown
- Panel styled using design system tokens: white bg, `border: 1px solid #E4E7EC`, `boxShadow: 0 4px 16px rgba(0,0,0,.10)`, `borderRadius: 10px`
- Keyboard: Tab to navigate, Enter to open, Escape to close

**Tasks:** FE-007, FE-008

---

### US-029 — Trigger-Type Icons in Dropdown

**As a** user  
**I want** each notification type to have a distinct icon and colour  
**So that** I can visually scan the type of notification without reading the title

**Acceptance Criteria:**
The following icon + colour mapping must be implemented:

| Trigger                 | Icon                    | Colour             |
| ----------------------- | ----------------------- | ------------------ |
| `ticket_assigned_to_me` | UserCircleIcon + check  | `#175CD3` (blue)   |
| `ticket_reply_added`    | ChatBubbleIcon          | `#0E9384` (teal)   |
| `ticket_status_changed` | ArrowPathIcon           | `#667085` (grey)   |
| `ticket_mentioned`      | `@` text                | `#7F56D9` (purple) |
| `ticket_closed`         | CheckCircleIcon         | `#027A48` (green)  |
| `ticket_escalated`      | ArrowUpCircleIcon       | `#B54708` (orange) |
| `ticket_created`        | TicketIcon              | `#175CD3` (blue)   |
| `kb_article_published`  | BookOpenIcon            | `#B54708` (amber)  |
| `kb_article_updated`    | PencilSquareIcon        | `#B54708` (amber)  |
| `kb_article_archived`   | ArchiveBoxIcon          | `#667085` (grey)   |
| `sla_breach_warning`    | ClockIcon               | `#B54708` (orange) |
| `sla_breached`          | ExclamationTriangleIcon | `#DC2626` (red)    |

**Tasks:** FE-008

---

## Epic 9 — Full Notifications Page (Frontend)

### US-030 — Notifications Page

**As a** logged-in user  
**I want** a dedicated `/notifications` page showing all my notifications  
**So that** I can browse my full history and act on older items

**Acceptance Criteria:**

- Route: `/notifications` accessible to all authenticated users
- Page header card: title "Notifications", stats row (Total / Unread / Tickets / KB)
- Filter bar: All | Unread | Tickets | KB Articles (tab/chip style)
- Data table per design system: columns — Icon | Title | Project | Time | Status | Action
- Unread rows highlighted: `background: #FFFBEB`, `borderLeft: 3px solid #F59E0B`
- Read rows: standard white background
- Clicking a row: mark as read + navigate to deep link
- "Mark all as read" button in header
- Pagination: 20 per page, standard pagination bar from design system
- Empty state: illustrated placeholder "No notifications yet" or "All caught up!"
- Menu item "Notifications" added to sidebar with `BellIcon`, visible to all authenticated users

**Tasks:** FE-009, FE-010

---

## Epic 10 — Admin Notification Settings Page (Frontend)

### US-031 — Notification Settings Page Access

**As a** Super Admin  
**I want** a settings page at `/admin/notification-settings`  
**So that** I can configure which triggers are active per project and role

**Acceptance Criteria:**

- Menu item "Notification Settings" under admin area — gated behind `NOTIFICATION_MANAGE` permission
- Navigating directly to URL without permission shows 403/NoAccess component
- Page not visible in sidebar to users without `NOTIFICATION_MANAGE`

**Tasks:** FE-011

---

### US-032 — Project Selector and Global Defaults Tab

**As a** Super Admin  
**I want** to switch between projects and a "Global Defaults" tab  
**So that** I can configure both global baselines and project-specific overrides

**Acceptance Criteria:**

- Project selector: styled `<select>` or tab row — lists all projects + "Global Defaults" option
- Projects with custom overrides show a "Customised" badge (`#7F56D9` accent pill)
- Projects using global defaults show "Using defaults" muted pill
- Switching project/tab loads that project's settings (or global defaults)

**Tasks:** FE-011

---

### US-033 — Trigger × Role Settings Matrix

**As a** Super Admin  
**I want** to see a matrix of trigger types (rows) × roles (columns) with toggle cells  
**So that** I can configure all notification rules in one view

**Acceptance Criteria:**

- Rows: 13 trigger types grouped into "Ticket Events", "KB Events", "System Events"
- Columns: each role in the selected project
- Each cell: master toggle (Is Enabled) + two sub-toggles (In-App, Email)
- Disabling the master toggle greys out and disables In-App + Email sub-toggles
- Column header: toggle to bulk-enable/disable ALL triggers for that role
- Row header: toggle to bulk-enable/disable that trigger for ALL roles
- Auto-save: each toggle change triggers `PUT /api/admin/notification-settings` immediately
- Visual save indicator: checkmark flash on cell after successful save; error flash on failure
- "Reset to Global Defaults" button per project (appears only when project has overrides)

**Tasks:** FE-011, FE-012

---

## Epic 11 — User Preferences Page (Frontend)

### US-034 — User Notification Preferences Page

**As a** logged-in user  
**I want** a preferences section in my profile at `/profile/notifications`  
**So that** I can control which notification types I receive

**Acceptance Criteria:**

- Route: `/profile/notifications` (within profile settings section)
- Lists all 13 trigger types
- For each trigger: shows whether admin has it enabled for the user's role
- If admin-disabled: row is greyed out, toggles non-interactive, tooltip "Managed by your administrator"
- If admin-enabled: user can toggle In-App on/off independently per trigger
- (Email toggles shown as Phase 2 placeholders, greyed out with "Email — Phase 2" label)
- Saves immediately on toggle with `PUT /api/me/notification-preferences/:triggerType`
- Requires `NOTIFICATION_PERSONAL_PREFERENCES` permission (all authenticated users have this by default)

**Tasks:** FE-013

---

## Epic 12 — Deep Link Navigation

### US-035 — Ticket Deep Link Navigation

**As a** user  
**I want** clicking a ticket notification to take me directly to that ticket  
**So that** I don't have to search for it manually

**Acceptance Criteria:**

- Notification `deepLinkUrl` for ticket triggers: `/projects/:projectId/tickets/:ticketId`
- For reply-based triggers: `/projects/:projectId/tickets/:ticketId#reply-:replyId`
- Frontend router navigates via `useNavigate()` (not `window.location.href`)
- Ticket detail page auto-scrolls to the reply anchor on load when `#reply-:replyId` is present

**Tasks:** FE-014, FE-015

---

### US-036 — KB Article Deep Link Navigation

**As a** user  
**I want** clicking a KB notification to take me directly to that article  
**So that** I can read the new or updated content

**Acceptance Criteria:**

- `deepLinkUrl` for `kb_article_published` / `kb_article_updated`: `/kb/:articleId`
- `deepLinkUrl` for `kb_article_archived`: `/admin/kb/articles` (article list for admin)
- Frontend navigates using existing KB routing

**Tasks:** FE-014

---

## Non-Functional User Stories

### US-037 — Notification System Performance

**As a** system  
**I want** notification queries to be fast  
**So that** the bell badge and dropdown don't slow down the app

**Acceptance Criteria:**

- Unread count API responds within 100ms (uses compound index)
- Dropdown loads 20 notifications within 300ms
- All notification indexes created at migration time

### US-038 — Security and Tenant Isolation

**As the** platform  
**I want** strict tenant and user isolation on all notification data  
**So that** users in one project never see notifications from another project they don't belong to

**Acceptance Criteria:**

- Every notification query includes `recipientUserId` = current user (no cross-user reads)
- Admin settings queries scoped by authenticated user's project access
- 403 returned for any attempt to access another project's settings

---

## Story Map Summary

| Epic                       | Stories                | Phase   |
| -------------------------- | ---------------------- | ------- |
| 1. RBAC Foundation         | US-001, US-002         | Phase 1 |
| 2. Database Models         | US-003, US-004, US-005 | Phase 1 |
| 3. Notification Engine     | US-006 → US-015        | Phase 1 |
| 4. Notification REST API   | US-016 → US-019        | Phase 1 |
| 5. Admin Settings API      | US-020 → US-022        | Phase 1 |
| 6. User Preferences API    | US-023, US-024         | Phase 1 |
| 7. Real-Time Delivery      | US-025, US-026         | Phase 1 |
| 8. Bell Icon + Dropdown    | US-027, US-028, US-029 | Phase 1 |
| 9. Full Notifications Page | US-030                 | Phase 1 |
| 10. Admin Settings Page    | US-031, US-032, US-033 | Phase 1 |
| 11. User Preferences Page  | US-034                 | Phase 1 |
| 12. Deep Links             | US-035, US-036         | Phase 1 |
| NFR                        | US-037, US-038         | Phase 1 |
