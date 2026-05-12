# Notification Module — Sprint Plan & Task Breakdown

**Module:** In-App Notification System  
**Phase:** 1 (In-App notifications + Admin settings + User preferences)  
**Date:** May 2026  
**Reference:** `docs/NOTIFICATION_MODULE_USER_STORIES.md`, `docs/UI_UX_DESIGN_SYSTEM.md`

> **Implementation notes:**
>
> - Use **Socket.IO** (already in place) for real-time — NOT SSE (no Redis needed for single-instance)
> - MongoDB + Mongoose (no SQL — all "tables" are Mongoose collections)
> - Backend port: 3003 | Frontend port: 3001
> - Permission codes: `NOTIFICATION_MANAGE`, `NOTIFICATION_VIEW_SETTINGS`, `NOTIFICATION_PERSONAL_PREFERENCES`
> - All UI uses **inline styles** matching design tokens — no Tailwind classes

---

## Sprint 1 — Foundation (Database + RBAC)

### DB-001 — Add `notifications` category to Permission schema

**File:** `backend/src/models/Permission.ts`  
**Type:** Schema change  
**Stories:** US-001

Add `"notifications"` to the `category` enum in `IPermission` and `permissionSchema`.

```typescript
// Add to category enum array:
"notifications";
```

---

### DB-002 — Notification Mongoose Model

**File:** `backend/src/models/Notification.ts` (new file — replaces simple version)  
**Type:** New model  
**Stories:** US-003

```typescript
interface INotification {
  recipientUserId: ObjectId; // FK → User
  triggeredByUserId?: ObjectId; // User whose action caused it (for self-exclude)
  projectId?: ObjectId; // FK → Project (nullable for system-wide)
  triggerType: string; // enum of 13 trigger keys
  entityType: "ticket" | "kb_article" | "comment";
  entityId: ObjectId; // The ticket/article ID
  title: string; // Pre-rendered template string
  body?: string; // Optional detail
  deepLinkUrl: string; // Frontend route
  isRead: boolean; // default false
  readAt?: Date;
  createdAt: Date;
}

// Indexes:
// { recipientUserId: 1, isRead: 1 }
// { recipientUserId: 1, createdAt: -1 }
// { recipientUserId: 1, triggerType: 1, entityId: 1, createdAt: -1 } // dedup
// { createdAt: -1 }
```

---

### DB-003 — NotificationSetting Mongoose Model

**File:** `backend/src/models/NotificationSetting.ts` (new file)  
**Type:** New model  
**Stories:** US-004

```typescript
interface INotificationSetting {
  projectId?: ObjectId; // null = global default
  triggerType: string; // enum trigger key
  roleId: ObjectId; // FK → Role
  isEnabled: boolean; // master on/off
  channels: {
    inApp: boolean;
    email: boolean;
  };
  updatedBy: ObjectId; // FK → User (last admin to change)
  updatedAt: Date;
}

// Unique sparse index: { projectId: 1, triggerType: 1, roleId: 1 }
```

---

### DB-004 — UserNotificationPreference Mongoose Model

**File:** `backend/src/models/UserNotificationPreference.ts` (new file)  
**Type:** New model  
**Stories:** US-005

```typescript
interface IUserNotificationPreference {
  userId: ObjectId; // FK → User
  triggerType: string;
  inAppEnabled: boolean; // default true
  emailEnabled: boolean; // default true
  updatedAt: Date;
}

// Unique index: { userId: 1, triggerType: 1 }
```

---

### DB-005 — Migration: Seed 3 Notification Permissions

**File:** `backend/src/utils/seedRolesPermissions.ts`  
**Type:** Data seeding  
**Stories:** US-001, US-002

Add three permission objects to `helpDeskPermissions` array:

```typescript
{
  module: "Notifications",
  name: "Manage Notification Settings",
  code: "NOTIFICATION_MANAGE",
  description: "Can configure notification rules for projects and roles",
  category: "notifications",
},
{
  module: "Notifications",
  name: "View Notification Settings",
  code: "NOTIFICATION_VIEW_SETTINGS",
  description: "Can view notification settings (read-only)",
  category: "notifications",
},
{
  module: "Notifications",
  name: "Manage Personal Notification Preferences",
  code: "NOTIFICATION_PERSONAL_PREFERENCES",
  description: "Can manage own notification delivery preferences",
  category: "notifications",
},
```

Also seed default `NotificationSetting` global defaults for all 13 trigger types × all system roles (Agent, Project Admin, End User) with `isEnabled: true, channels: { inApp: true, email: false }`.

---

### DB-006 — Migration: Seed Default Global Notification Settings

**File:** `backend/src/utils/seedNotificationSettings.ts` (new file)  
**Type:** Seeding utility  
**Stories:** US-004

Default global settings per trigger:

| Trigger                 | Roles to notify (default)                  |
| ----------------------- | ------------------------------------------ |
| `ticket_created`        | Project Admin, Agent                       |
| `ticket_assigned_to_me` | Agent (direct assignment — not role-based) |
| `ticket_reply_added`    | Agent (assignee), End User (creator)       |
| `ticket_status_changed` | Agent, End User                            |
| `ticket_mentioned`      | Any role (if mentioned)                    |
| `ticket_closed`         | End User, Agent                            |
| `ticket_escalated`      | Project Admin, Agent                       |
| `kb_article_published`  | All roles with KB access                   |
| `kb_article_updated`    | All roles with KB access                   |
| `kb_article_archived`   | Project Admin, Agent                       |
| `sla_breach_warning`    | Agent, Project Admin                       |
| `sla_breached`          | Agent, Project Admin                       |

Called from `seedRolesAndPermissions()` in `server.ts`.

---

## Sprint 2 — Backend: Engine + APIs

### BE-001 — Add Notification Permissions to Frontend Constants

**Files:**

- `frontend/src/constants/permissions.ts`
- `frontend/src/utils/permissionMapping.ts`

**Type:** Config update  
**Stories:** US-001, US-002

Add to `PERMISSIONS` object:

```typescript
NOTIFICATION_MANAGE: "NOTIFICATION_MANAGE",
NOTIFICATION_VIEW_SETTINGS: "NOTIFICATION_VIEW_SETTINGS",
NOTIFICATION_PERSONAL_PREFERENCES: "NOTIFICATION_PERSONAL_PREFERENCES",
```

Add `NOTIFICATION: "NOTIFICATION_"` to `PERMISSION_MODULES`.

Add entries to `permissionUIMapping` for the three new permissions.

---

### BE-002 — Notification Engine Service

**File:** `backend/src/services/notificationEngine.ts` (new file)  
**Type:** New service  
**Stories:** US-006 → US-015

Core function signature:

```typescript
export async function fireNotification(event: {
  triggerType: TriggerType;
  entityType: "ticket" | "kb_article" | "comment";
  entityId: ObjectId;
  projectId?: ObjectId;
  triggeredByUserId: ObjectId;
  recipientOverride?: ObjectId[]; // for direct-assign (ticket_assigned_to_me)
  templateVars: Record<string, string>; // for title template rendering
}): Promise<void>;
```

Internal steps:

1. Load `NotificationSetting` for `(projectId, triggerType)` → fall back to `projectId = null`
2. If `recipientOverride` provided: use that list instead of role-based lookup
3. Else: find all Users where `role._id` is in the enabled-roles list and `projects` includes `projectId`
4. Filter out `triggeredByUserId`
5. Load `UserNotificationPreference` for each recipient — filter out opted-out
6. Dedup: query `Notification.findOne({ recipientUserId, triggerType, entityId, createdAt: { $gte: dedup60s } })`
7. Bulk `Notification.insertMany(records)`
8. Emit Socket.IO `notification:new` event for each recipient: `io.to("user-{id}").emit("notification:new", notif)`
9. Render title using `renderTemplate(template, vars)` helper

Template renderer:

```typescript
function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
```

Title templates as a constant map for all 13 triggers.

---

### BE-003 — Wire Engine into Ticket Controller

**File:** `backend/src/controllers/ticketController.ts`  
**Type:** Integration  
**Stories:** US-006 → US-013

After successful DB writes, call `fireNotification()` (non-blocking — `fireNotification(...).catch(console.error)`) for:

- `createTicket` → `ticket_created`
- `updateTicket` (assignedTo changed) → `ticket_assigned_to_me` with `recipientOverride: [newAssignee]`
- `createTicket / addComment` (new reply/comment) → `ticket_reply_added`
- `updateTicket` (status changed) → `ticket_status_changed`
- `closeTicket` / status → closed → `ticket_closed`

---

### BE-004 — Wire Engine into Other Controllers

**Files:**

- `backend/src/services/autoEscalationService.ts` → `sla_breach_warning`, `sla_breached`
- `backend/src/controllers/kbArticleController.ts` → `kb_article_published`, `kb_article_updated`, `kb_article_archived`

**Type:** Integration  
**Stories:** US-012, US-013, US-014

Same pattern: call `fireNotification(...).catch(console.error)` after the triggering DB operation.

---

### BE-005 — Notification REST API Controller + Routes

**Files:**

- `backend/src/controllers/notificationController.ts` (extend existing)
- `backend/src/routes/notificationRoutes.ts` (new or extend)
- `backend/src/server.ts` (register route)

**Type:** New API  
**Stories:** US-016 → US-019

Endpoints:

```
GET    /api/notifications              → getMyNotifications(req)
GET    /api/notifications/unread-count → getUnreadCount(req)
PATCH  /api/notifications/:id/read     → markOneRead(req)
POST   /api/notifications/read-all     → markAllRead(req)
```

All require `auth` middleware. All scope queries to `recipientUserId = req.user._id`.

`getMyNotifications` query params:

- `?unread=true` → `isRead: false`
- `?entityType=ticket` → filters by entityType
- `?page=1&limit=20`

Response shape:

```typescript
{
  success: true,
  data: {
    items: INotification[],
    total: number,
    totalUnread: number,
    page: number,
    totalPages: number,
  }
}
```

---

### BE-006 — Admin Notification Settings Controller + Routes

**Files:**

- `backend/src/controllers/notificationSettingsController.ts` (new file)
- `backend/src/routes/notificationSettingsRoutes.ts` (new file)
- `backend/src/server.ts` (register route)

**Type:** New API  
**Stories:** US-020 → US-022

Endpoints:

```
GET    /api/admin/notification-settings              → getSettings (NOTIFICATION_VIEW_SETTINGS)
PUT    /api/admin/notification-settings              → upsertSetting (NOTIFICATION_MANAGE)
DELETE /api/admin/notification-settings?projectId=  → resetToDefaults (NOTIFICATION_MANAGE)
```

`upsertSetting` must:

- Validate Project Admin can only modify their own projects
- Call `logActivity(...)` for audit trail
- Return the saved/updated document

---

### BE-007 — User Preferences Controller + Routes

**Files:**

- `backend/src/controllers/userNotificationPrefController.ts` (new file)
- Register under `/api/me/notification-preferences`

**Type:** New API  
**Stories:** US-023, US-024

```
GET  /api/me/notification-preferences              → getMyPreferences (auth)
PUT  /api/me/notification-preferences/:triggerType → updateMyPreference (NOTIFICATION_PERSONAL_PREFERENCES)
```

`updateMyPreference` must validate the trigger type is in the allowed enum before saving.

---

### BE-008 — Socket.IO Notification Room & Event

**File:** `backend/src/socket/socketHandlers.ts` (extend)  
**Type:** Integration  
**Stories:** US-025

Ensure users join their personal notification room on connection:

```typescript
socket.join(`user-${userId}`);
```

This is likely already done for existing notifications — verify and confirm the room name pattern matches `notificationEngine.ts`.

Emit shape for `notification:new`:

```typescript
{
  _id: string,
  triggerType: string,
  title: string,
  deepLinkUrl: string,
  entityType: string,
  projectId?: string,
  createdAt: string,
  isRead: false,
}
```

---

## Sprint 3 — Frontend: Bell Icon + Dropdown

### FE-001 — Add Notification Permissions to Frontend Constants & Menu

**Files:**

- `frontend/src/constants/permissions.ts` ← add 3 codes
- `frontend/src/config/menuConfig.tsx` ← add "Notifications" menu item + "Notification Settings" admin item

**Type:** Config  
**Stories:** US-001, US-031

Menu additions:

```typescript
// In main menuConfig (visible to all authenticated users):
{
  path: '/notifications',
  icon: <BellIcon />,
  label: 'Notifications',
  // no permission = visible to all
}

// In admin section (gated):
{
  path: '/admin/notification-settings',
  icon: <AdjustmentsHorizontalIcon />,
  label: 'Notification Settings',
  permission: 'NOTIFICATION_MANAGE',
}
```

---

### FE-002 — `useNotifications` Hook

**File:** `frontend/src/hooks/useNotifications.ts` (new file)  
**Type:** New hook  
**Stories:** US-019, US-025, US-026

```typescript
interface UseNotificationsReturn {
  unreadCount: number;
  notifications: INotification[]; // last 20, for dropdown
  loading: boolean;
  markOneRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refetch: () => void;
}
```

Implementation:

- On mount: `GET /api/notifications/unread-count` → set `unreadCount`
- Socket.IO listener: `socket.on("notification:new", (notif) => { setUnreadCount(c => c+1); setNotifications(prev => [notif, ...prev].slice(0,20)); })`
- Polling fallback: `setInterval(() => { if (!socket.connected) refetchCount(); }, 30000)`
- `markOneRead`: `PATCH /api/notifications/:id/read` → update local state
- `markAllRead`: `POST /api/notifications/read-all` → set unreadCount to 0

---

### FE-003 — Notification Type Icon Helper

**File:** `frontend/src/utils/notificationIcons.tsx` (new file)  
**Type:** Utility  
**Stories:** US-029

```typescript
export function getNotificationIcon(triggerType: string): {
  icon: JSX.Element;
  color: string;
  bg: string;
};
```

Returns a Heroicons component + colour per the mapping from US-029.

---

### FE-004 — Relative Timestamp Helper

**File:** `frontend/src/utils/relativeTime.ts` (new or extend existing)  
**Type:** Utility  
**Stories:** US-028

```typescript
export function relativeTime(date: string | Date): string;
// Returns: "Just now", "3 min ago", "2 hours ago", "Yesterday", "May 10"
```

---

### FE-005 — Bell Icon Component

**File:** `frontend/src/components/notifications/NotificationBell.tsx` (new file)  
**Type:** New component  
**Stories:** US-027, US-028

Design spec (inline styles):

```
Bell button: position relative, padding 8px, borderRadius 8px
  hover: background #F4F3FF

Badge: position absolute, top -4px, right -4px
  background: #DC2626, color: white
  borderRadius: 20px, fontSize: 10px, fontWeight: 700
  padding: "1px 5px", minWidth: 18px, textAlign: center
  border: 2px solid white (cut-out effect)
  Hidden when count === 0

aria-label: `Notifications, ${unreadCount} unread`
```

---

### FE-006 — Notification Dropdown Panel Component

**File:** `frontend/src/components/notifications/NotificationDropdown.tsx` (new file)  
**Type:** New component  
**Stories:** US-028, US-029

Design spec (inline styles):

```
Panel wrapper:
  position: absolute, top: calc(100% + 8px), right: 0
  width: 380px, maxHeight: 520px
  background: white, borderRadius: 10px
  border: 1px solid #E4E7EC
  boxShadow: 0 4px 16px rgba(0,0,0,.10)
  zIndex: 300, overflow: hidden
  display: flex, flexDirection: column

Panel header:
  padding: "14px 16px", borderBottom: 1px solid #E4E7EC
  display flex, justifyContent space-between, alignItems center
  title: "Notifications", fontSize 14px, fontWeight 700, color #101828
  badge: unread count pill in #F4F3FF / #7F56D9

Notification list:
  overflowY: auto, flex: 1

Notification row:
  padding: "12px 16px", borderBottom: 1px solid #F2F4F7
  display: flex, gap: 12px, cursor: pointer
  background: unread ? #FFFBEB : white
  borderLeft: unread ? "3px solid #F59E0B" : "3px solid transparent"
  hover: background #F9FAFB

  Icon circle: width 36px, height 36px, borderRadius 50%
               background: triggerColor + "20", color: triggerColor
               display flex, alignItems center, justifyContent center

  Content:
    title: fontSize 13px, fontWeight: unread ? 600 : 400, color #101828
    meta: fontSize 11px, color #667085, marginTop 2px
          (project name · relative time)
    Unread dot: 8px circle, background #7F56D9 (shown when unread)
                Also use filled vs hollow shape for non-colour indicator

Panel footer:
  padding: "10px 16px", borderTop: 1px solid #E4E7EC
  display flex, justifyContent space-between, alignItems center
  "Mark all as read" button: color #7F56D9, fontSize 12px, fontWeight 600
  "View all" link → /notifications: color #667085, fontSize 12px
```

Close on outside click: `useEffect(() => { document.addEventListener('mousedown', handler) }, [])`

---

### FE-007 — Wire Bell + Dropdown into DashboardLayout

**File:** `frontend/src/components/DashboardLayout.tsx`  
**Type:** Integration  
**Stories:** US-027

- Import `NotificationBell` component
- Place in top nav bar, right of search / left of user avatar
- Pass `unreadCount` and `onOpen` from `useNotifications` hook instance here
- `useNotifications` hook instantiated at layout level and passed to both bell and dropdown

---

## Sprint 4 — Frontend: Notifications Page

### FE-008 — Full Notifications Page

**File:** `frontend/src/pages/NotificationsPage.tsx` (new file)  
**Type:** New page  
**Stories:** US-030

Layout (all inline styles per design system):

```
Page wrapper: background #F8F9FC, minHeight 100vh, padding "24px 28px"

Header card:
  background white, borderRadius 10px, padding "20px 24px"
  border 1px solid #E4E7EC, boxShadow 0 1px 3px rgba(0,0,0,.06)
  Left: title "Notifications" (fontSize 22px, fontWeight 700, color #101828)
        subtitle "Your recent updates and alerts" (fontSize 13px, color #667085)
  Right: "Mark all as read" button (accent outlined)

Stats row: 4 stat cards (Total / Unread / Tickets / KB Articles)
  — follows design system 2.1 Stats Cards Row pattern

Filter bar (tab chips):
  All | Unread | Tickets | KB Articles
  Active chip: background #F4F3FF, color #7F56D9, border 1.5px solid #7F56D9
  Inactive chip: background white, color #667085, border 1px solid #E4E7EC

Data table card:
  Columns: [Icon+Color] | Title | Project | Time | Status | (row click = action)
  Unread rows: background #FFFBEB, borderLeft 3px solid #F59E0B
  Read rows: white, borderLeft 3px solid transparent
  Row onClick: mark read + navigate to deepLinkUrl

Empty state:
  Centered illustration placeholder, text "No notifications yet"
  or "You're all caught up!" when filter is Unread and count is 0

Pagination bar: standard design-system 2.9 pattern, 20/page
```

---

### FE-009 — Register Notifications Route

**File:** `frontend/src/App.tsx`  
**Type:** Route registration  
**Stories:** US-030

```typescript
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));

// In <Routes>:
<Route path="/notifications" element={
  <ProtectedRoute>
    <NotificationsPage />
  </ProtectedRoute>
} />
```

---

## Sprint 5 — Frontend: Admin Settings Page

### FE-010 — Admin Notification Settings Page

**File:** `frontend/src/pages/NotificationSettingsPage.tsx` (new file)  
**Type:** New page  
**Stories:** US-031, US-032, US-033

Layout:

```
Page wrapper: background #F8F9FC, padding "24px 28px"

Header card:
  Title: "Notification Settings"
  Subtitle: "Configure which events trigger notifications per project and role"
  Permission gate: usePermissions().hasPermission("NOTIFICATION_MANAGE")
  If no permission → <NoAccess /> component

Project selector row:
  Label: "Configure for:"
  <select> or tab list: [Global Defaults] [Project A 🔵] [Project B] ...
  "Customised" badge: pill #7F56D9 bg #F4F3FF for projects with overrides
  "Using defaults" badge: pill #667085 bg #F2F4F7 for non-overridden

  "Reset to Global Defaults" button (shown only when project has overrides):
    outlined red, onClick → DELETE /api/admin/notification-settings?projectId=

Settings matrix card:
  background white, borderRadius 10px, border 1px solid #E4E7EC
  Horizontal scroll on small screens

  <table>
    <thead>
      <tr>
        <th>Event</th>
        <th>[Role A] <toggle to bulk-toggle column></th>
        <th>[Role B] ...</th>
      </tr>
    </thead>
    <tbody grouped by section>
      Section header rows: "Ticket Events", "KB Events", "System Events"
        background: #F9FAFB, fontSize 11px, fontWeight 600, color #667085
        UPPERCASE, colSpan full

      Trigger rows:
        <td> trigger label + description (fontSize 12px)</td>
        Row header has a row-master-toggle to bulk-toggle all roles for this trigger

        <td> per role cell:
          Master toggle (is_enabled):
            styled checkbox/toggle switch
            When OFF: sub-toggles greyed, pointer-events none

          Sub-toggles row (smaller):
            [In-App •] [Email •]  (email = Phase 2, greyed)
            fontSize 10px, color #667085

          Save indicator:
            On successful PUT: green ✓ flash (1.5s fade)
            On error: red ✗ flash + tooltip
        </td>
      </tr>
    </tbody>
  </table>
```

Auto-save logic:

- `handleToggle(projectId, triggerType, roleId, field, value)` → immediately calls `PUT /api/admin/notification-settings`
- Uses local optimistic state update, reverts on API error
- Debounce 300ms to avoid rapid double-clicks

---

### FE-011 — Register Admin Settings Route

**File:** `frontend/src/App.tsx`  
**Type:** Route registration  
**Stories:** US-031

```typescript
const NotificationSettingsPage = lazy(() => import("./pages/NotificationSettingsPage"));

<Route path="/admin/notification-settings" element={
  <ProtectedRoute requiredPermission="NOTIFICATION_MANAGE">
    <NotificationSettingsPage />
  </ProtectedRoute>
} />
```

---

## Sprint 6 — Frontend: User Preferences Page

### FE-012 — User Notification Preferences Page

**File:** `frontend/src/pages/ProfileNotificationsPage.tsx` (new file)  
**Type:** New page  
**Stories:** US-034

Layout:

```
Page wrapper: background #F8F9FC, padding "24px 28px"

Header card:
  Title: "Notification Preferences"
  Subtitle: "Control which types of notifications you receive"

Preferences card:
  background white, borderRadius 10px, border 1px solid #E4E7EC

  For each of 13 trigger types, a row:
    Left: icon circle + trigger label + description
    Right: In-App toggle (enabled/disabled by admin + user preference)

  If admin has trigger disabled for user's role:
    Row: opacity 0.5, toggle disabled, pointer-events none
    Tooltip: "Managed by your administrator"

  If admin-enabled:
    Toggle ON/OFF → PUT /api/me/notification-preferences/:triggerType
    Immediate visual feedback with react-hot-toast

  Section groups: "Ticket Events" / "KB Events" / "System Events"
    Separator rows with section label (same as settings matrix)

  Email column: shown but greyed out with "Phase 2" chip
```

---

### FE-013 — Register User Preferences Route

**File:** `frontend/src/App.tsx`  
**Type:** Route registration  
**Stories:** US-034

```typescript
const ProfileNotificationsPage = lazy(() => import("./pages/ProfileNotificationsPage"));

<Route path="/profile/notifications" element={
  <ProtectedRoute>
    <ProfileNotificationsPage />
  </ProtectedRoute>
} />
```

Also add "Notification Preferences" link in the user profile dropdown menu.

---

## Sprint 7 — Deep Link Navigation

### FE-014 — Deep Link Navigation Handler

**File:** `frontend/src/utils/notificationNavigation.ts` (new file)  
**Type:** Utility  
**Stories:** US-035, US-036

```typescript
export function navigateToDeepLink(
  deepLinkUrl: string,
  navigate: NavigateFunction,
): void {
  // Parse the URL, use navigate() for internal routes
  // Handle #reply-:id anchor separately
  const [path, hash] = deepLinkUrl.split("#");
  navigate(path, { replace: false });
  if (hash) {
    // After navigation, scroll to element
    setTimeout(() => {
      const el = document.getElementById(hash);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 500);
  }
}
```

---

### FE-015 — Reply Anchor Scroll in AgentTicketDetail

**File:** `frontend/src/pages/AgentTicketDetail.tsx`  
**Type:** Integration  
**Stories:** US-035

On mount, check `window.location.hash` for `#reply-{replyId}` pattern.  
If found, wait for comments to load, then `document.getElementById("reply-{id}")?.scrollIntoView({ behavior: 'smooth' })`.  
Ensure each comment/reply element has `id="reply-{commentId}"`.

---

## Trigger Key Constants

**File:** `backend/src/constants/notificationTriggers.ts` (new shared file)  
Also: `frontend/src/constants/notificationTriggers.ts`

```typescript
export const TRIGGER_TYPES = {
  TICKET_CREATED: "ticket_created",
  TICKET_ASSIGNED_TO_ME: "ticket_assigned_to_me",
  TICKET_REPLY_ADDED: "ticket_reply_added",
  TICKET_STATUS_CHANGED: "ticket_status_changed",
  TICKET_MENTIONED: "ticket_mentioned",
  TICKET_CLOSED: "ticket_closed",
  TICKET_ESCALATED: "ticket_escalated",
  KB_ARTICLE_PUBLISHED: "kb_article_published",
  KB_ARTICLE_UPDATED: "kb_article_updated",
  KB_ARTICLE_ARCHIVED: "kb_article_archived",
  SLA_BREACH_WARNING: "sla_breach_warning",
  SLA_BREACHED: "sla_breached",
} as const;

export const TITLE_TEMPLATES: Record<string, string> = {
  ticket_created: "New ticket submitted: {{subject}}",
  ticket_assigned_to_me: "Ticket #{{number}} was assigned to you",
  ticket_reply_added: "{{agentName}} replied to Ticket #{{number}}",
  ticket_status_changed: "Ticket #{{number}} is now {{newStatus}}",
  ticket_mentioned: "{{userName}} mentioned you in Ticket #{{number}}",
  ticket_closed: "Ticket #{{number}} has been closed",
  ticket_escalated: "Ticket #{{number}} has been escalated",
  kb_article_published: "New article: {{articleTitle}}",
  kb_article_updated: "Updated: {{articleTitle}}",
  kb_article_archived: "Article archived: {{articleTitle}}",
  sla_breach_warning: "Ticket #{{number}} SLA is due in {{timeRemaining}}",
  sla_breached: "Ticket #{{number}} has breached its SLA",
};
```

---

## Full Task List (Ordered by Dependency)

### Database Tasks

| Task   | File                                          | Story  | Dependency |
| ------ | --------------------------------------------- | ------ | ---------- |
| DB-001 | Permission.ts — add "notifications" category  | US-001 | None       |
| DB-002 | Notification.ts — new model + indexes         | US-003 | None       |
| DB-003 | NotificationSetting.ts — new model            | US-004 | None       |
| DB-004 | UserNotificationPreference.ts — new model     | US-005 | None       |
| DB-005 | seedRolesPermissions.ts — add 3 permissions   | US-001 | DB-001     |
| DB-006 | seedNotificationSettings.ts — global defaults | US-004 | DB-003     |

### Backend Tasks

| Task   | File                                             | Story      | Dependency             |
| ------ | ------------------------------------------------ | ---------- | ---------------------- |
| BE-001 | permissions.ts (frontend) — add 3 codes          | US-001     | None                   |
| BE-002 | notificationEngine.ts — core service             | US-006–015 | DB-002, DB-003, DB-004 |
| BE-003 | ticketController.ts — wire engine                | US-006–010 | BE-002                 |
| BE-004 | kbArticleController.ts, autoEscalationService.ts | US-012–014 | BE-002                 |
| BE-005 | notificationController.ts — REST API             | US-016–019 | DB-002                 |
| BE-006 | notificationSettingsController.ts — admin API    | US-020–022 | DB-003                 |
| BE-007 | userNotificationPrefController.ts — prefs API    | US-023–024 | DB-004                 |
| BE-008 | socketHandlers.ts — verify room join             | US-025     | BE-002                 |

### Frontend Tasks

| Task   | File                                         | Story          | Dependency             |
| ------ | -------------------------------------------- | -------------- | ---------------------- |
| FE-001 | menuConfig.tsx + permissions.ts              | US-001, US-031 | BE-001                 |
| FE-002 | useNotifications.ts — hook                   | US-019, US-025 | BE-005, BE-008         |
| FE-003 | notificationIcons.tsx — icon map             | US-029         | None                   |
| FE-004 | relativeTime.ts — utility                    | US-028         | None                   |
| FE-005 | NotificationBell.tsx — bell + badge          | US-027         | FE-002                 |
| FE-006 | NotificationDropdown.tsx — panel             | US-028, US-029 | FE-002, FE-003, FE-004 |
| FE-007 | DashboardLayout.tsx — wire bell              | US-027         | FE-005, FE-006         |
| FE-008 | NotificationsPage.tsx — full page            | US-030         | FE-002, FE-003, FE-004 |
| FE-009 | App.tsx — /notifications route               | US-030         | FE-008                 |
| FE-010 | NotificationSettingsPage.tsx — admin matrix  | US-031–033     | BE-006, FE-001         |
| FE-011 | App.tsx — /admin/notification-settings route | US-031         | FE-010                 |
| FE-012 | ProfileNotificationsPage.tsx — prefs         | US-034         | BE-007                 |
| FE-013 | App.tsx — /profile/notifications route       | US-034         | FE-012                 |
| FE-014 | notificationNavigation.ts — deep link util   | US-035, US-036 | None                   |
| FE-015 | AgentTicketDetail.tsx — reply anchor scroll  | US-035         | FE-014                 |

---

## File Creation Summary

### New Backend Files

```
backend/src/models/NotificationSetting.ts
backend/src/models/UserNotificationPreference.ts
backend/src/constants/notificationTriggers.ts
backend/src/services/notificationEngine.ts
backend/src/controllers/notificationSettingsController.ts
backend/src/controllers/userNotificationPrefController.ts
backend/src/routes/notificationSettingsRoutes.ts
backend/src/utils/seedNotificationSettings.ts
```

### Modified Backend Files

```
backend/src/models/Notification.ts          (extend existing)
backend/src/models/Permission.ts            (add category enum value)
backend/src/utils/seedRolesPermissions.ts   (add 3 permissions)
backend/src/controllers/ticketController.ts (wire engine calls)
backend/src/controllers/kbArticleController.ts (wire engine)
backend/src/services/autoEscalationService.ts  (wire engine)
backend/src/routes/notificationRoutes.ts    (add new endpoints)
backend/src/socket/socketHandlers.ts        (verify user room)
backend/src/server.ts                       (register new routes)
```

### New Frontend Files

```
frontend/src/hooks/useNotifications.ts
frontend/src/utils/notificationIcons.tsx
frontend/src/utils/notificationNavigation.ts
frontend/src/utils/relativeTime.ts
frontend/src/constants/notificationTriggers.ts
frontend/src/components/notifications/NotificationBell.tsx
frontend/src/components/notifications/NotificationDropdown.tsx
frontend/src/pages/NotificationsPage.tsx
frontend/src/pages/NotificationSettingsPage.tsx
frontend/src/pages/ProfileNotificationsPage.tsx
```

### Modified Frontend Files

```
frontend/src/constants/permissions.ts       (add 3 codes)
frontend/src/utils/permissionMapping.ts     (add 3 entries)
frontend/src/config/menuConfig.tsx          (add menu items)
frontend/src/components/DashboardLayout.tsx (wire bell icon)
frontend/src/pages/AgentTicketDetail.tsx    (reply anchor scroll)
frontend/src/App.tsx                        (3 new routes)
```

---

## Sprint Schedule

| Sprint    | Focus                              | Tasks           | Est. Days    |
| --------- | ---------------------------------- | --------------- | ------------ |
| 1         | Foundation — DB models + RBAC seed | DB-001 → DB-006 | 2 days       |
| 2         | Backend engine + all APIs          | BE-001 → BE-008 | 4 days       |
| 3         | Bell icon + dropdown (core UI)     | FE-001 → FE-007 | 3 days       |
| 4         | Full notifications page            | FE-008, FE-009  | 2 days       |
| 5         | Admin settings matrix page         | FE-010, FE-011  | 3 days       |
| 6         | User preferences page + deep links | FE-012 → FE-015 | 2 days       |
| **Total** |                                    |                 | **~16 days** |

---

## Design System Reference (UI Tokens to Use)

All new pages and components must follow [docs/UI_UX_DESIGN_SYSTEM.md](./UI_UX_DESIGN_SYSTEM.md).

Key tokens for this module:

| Element              | Token                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Page background      | `#F8F9FC`                                                                                          |
| Card background      | `white`, `borderRadius: 10px`, `border: 1px solid #E4E7EC`, `boxShadow: 0 1px 3px rgba(0,0,0,.06)` |
| Primary heading      | `fontSize: 22px, fontWeight: 700, color: #101828`                                                  |
| Section heading      | `fontSize: 16px, fontWeight: 600, color: #344054`                                                  |
| Muted label          | `fontSize: 13px, color: #667085`                                                                   |
| Accent (primary CTA) | `#7F56D9` / `#F4F3FF`                                                                              |
| Unread highlight     | `background: #FFFBEB`, `borderLeft: 3px solid #F59E0B`                                             |
| Notification badge   | `background: #DC2626`                                                                              |
| Success              | `#027A48`                                                                                          |
| Error                | `#DC2626`                                                                                          |
| Dropdown shadow      | `boxShadow: 0 4px 16px rgba(0,0,0,.10)`                                                            |
| Icon library         | `@heroicons/react/24/outline`                                                                      |
| Toast notifications  | `react-hot-toast`                                                                                  |
