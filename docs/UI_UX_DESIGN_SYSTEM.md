# SAC Helpdesk — UI/UX Design System

> **Purpose**: Define reusable visual patterns, design tokens, and component guidelines so every module follows a consistent look and feel.  
> **Last updated**: May 2026  
> **Rule**: Style changes only — all existing features, logic, hooks, socket.io, permissions, and data must remain unchanged.

---

## 1. Design Tokens

Apply these values consistently across all pages. Use inline `style` props (we use inline styles, not Tailwind classes in this project).

### Colors

```
/* Page & Surface */
--page-bg:       #F8F9FC          /* outer page background */
--card-bg:       #FFFFFF          /* card / table background */
--border:        #E4E7EC          /* card borders, dividers */
--bg2:           #F9FAFB          /* table row hover, input bg, section bg */

/* Typography */
--txt-primary:   #101828          /* headings, bold values */
--txt-secondary: #344054          /* body text, table cells */
--txt-muted:     #667085          /* labels, placeholders, meta text */

/* Brand Accent */
--accent:        #7F56D9          /* primary CTA, accent highlights */
--accent-light:  #F4F3FF          /* accent badge background */

/* Status — Open */
--open-bg:       #EFF8FF
--open-color:    #175CD3

/* Status — In Progress */
--inprogress-bg: #FFF4ED
--inprogress-color: #B93815

/* Status — Pending */
--pending-bg:    #FFFAEB
--pending-color: #B54708

/* Status — Resolved */
--resolved-bg:   #ECFDF3
--resolved-color: #027A48

/* Status — Closed */
--closed-bg:     #F2F4F7
--closed-color:  #344054

/* Priority */
--priority-low-bg:      #ECFDF3   --priority-low-color:    #027A48
--priority-medium-bg:   #FFFAEB   --priority-medium-color: #B54708
--priority-high-bg:     #FFF1F3   --priority-high-color:   #C01048
--priority-critical-bg: #F4F3FF   --priority-critical-color: #5925DC

/* Feedback */
--success:       #027A48
--warning:       #F59E0B
--error:         #DC2626
--info:          #175CD3

/* Highlight (unread / new reply) */
--highlight-bg:  #FFFBEB
--highlight-border: #F59E0B
```

### Spacing & Shape

```
--radius-card:   10px             /* cards, table wrapper, modals */
--radius-badge:  20px             /* status/priority pills */
--radius-btn:    8px              /* buttons */
--radius-input:  8px              /* inputs, selects */
--radius-sm:     6px              /* small chips */

--shadow-sm:     0 1px 3px rgba(0,0,0,.06)    /* cards */
--shadow-md:     0 4px 16px rgba(0,0,0,.10)   /* dropdowns, menus */
--shadow-lg:     0 8px 32px rgba(0,0,0,.20)   /* modals, floating bars */
--shadow-modal:  0 20px 60px rgba(0,0,0,.30)  /* full modals */
```

### Typography

```
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
--text-xs:    11px
--text-sm:    12px
--text-base:  13px
--text-md:    14px
--text-lg:    16px
--text-xl:    18px
--text-2xl:   22px
--text-3xl:   28px
```

---

## 2. Reusable Component Patterns

### 2.1 Stats Cards Row

Used at the top of listing pages to show summary counts.

```tsx
// Pattern — 4 stat cards in a flex row
<div
  style={{
    display: "flex",
    gap: "16px",
    marginBottom: "20px",
    flexWrap: "wrap",
  }}
>
  {[
    {
      label: "Total",
      value: stats.total,
      color: "#7F56D9",
      bg: "#F4F3FF",
      icon: "🎫",
    },
    {
      label: "Open",
      value: stats.open,
      color: "#175CD3",
      bg: "#EFF8FF",
      icon: "📬",
    },
    {
      label: "Pending",
      value: stats.pending,
      color: "#B54708",
      bg: "#FFFAEB",
      icon: "⏳",
    },
    {
      label: "Closed",
      value: stats.closed,
      color: "#027A48",
      bg: "#ECFDF3",
      icon: "✅",
    },
  ].map((stat) => (
    <div
      key={stat.label}
      style={{
        flex: "1 1 180px",
        background: "white",
        borderRadius: "10px",
        padding: "20px 24px",
        border: "1px solid #E4E7EC",
        boxShadow: "0 1px 3px rgba(0,0,0,.06)",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: stat.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "20px",
          flexShrink: 0,
        }}
      >
        {stat.icon}
      </div>
      <div>
        <div
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#101828",
            lineHeight: 1.2,
          }}
        >
          {stat.value.toLocaleString()}
        </div>
        <div style={{ fontSize: "13px", color: "#667085", marginTop: "2px" }}>
          {stat.label}
        </div>
      </div>
    </div>
  ))}
</div>
```

**Modules using this**: UserManagement ✅, ViewTickets ✅, MyTickets (planned), TicketAssignment (planned)

---

### 2.2 Filter Bar / Toolbar Card

Compact horizontal filter strip inside a white card.

```
Structure:
  [search input] [select dropdown] [select dropdown] ... [date range] [flex-1 spacer] [Export btn] [Clear btn]

Card style:
  background: white, borderRadius: 12px, padding: "12px 16px",
  boxShadow: 0 1px 4px rgba(0,0,0,.06), border: 1px solid #F3F4F6

Input style (search):
  paddingLeft: 32px (for icon), border: 1px solid #E5E7EB, borderRadius: 8px,
  background: #F9FAFB, fontSize: 14px

Select style (normal):
  padding: "9px 10px 9px 10px", paddingRight: 28px (for chevron icon),
  border: 1px solid #E5E7EB, borderRadius: 8px, background: #F9FAFB

Select style (active filter):
  border: 1.5px solid #3B82F6, background: #EFF6FF, color: #1D4ED8, fontWeight: 500

Clear button (shown only when a filter is active):
  border: 1px solid #E5E7EB, borderRadius: 8px, background: white, color: #6B7280
  hover: background: #FEF2F2, color: #DC2626, borderColor: #FCA5A5
```

**Modules using this**: UserManagement ✅, ViewTickets ✅

---

### 2.3 Data Table Card

Replaces older card-list layouts. All listing pages should use this pattern.

```
Wrapper: white card, borderRadius: 10px, border: 1px solid #E4E7EC,
         boxShadow: 0 1px 3px rgba(0,0,0,.06), overflow: hidden

<thead> row:
  background: #F9FAFB, borderBottom: 1px solid #E4E7EC
  <th> style: padding: "12px 16px", fontSize: 12px, fontWeight: 600,
              color: #667085, textTransform: uppercase, letterSpacing: 0.5px

<tbody> <tr> normal:
  background: white, borderBottom: 1px solid #F2F4F7, cursor: pointer
  hover: background: #F9FAFB
  borderLeft: 3px solid transparent (preserves left-border width)

<tbody> <tr> highlighted (unread / new reply):
  background: #FFFBEB, borderLeft: 3px solid #F59E0B
  hover: background: #FFF7E0

<tbody> <tr> selected:
  background: #EFF6FF, border: none (checkbox column handles it)

Action column (last col, textAlign: right):
  "•••" button → shows dropdown menu (position: absolute, right: 0)
  Dropdown: white card, border: 1px solid #E4E7EC, borderRadius: 8px,
            boxShadow: 0 4px 16px rgba(0,0,0,.12), zIndex: 100
  Menu items: padding: "9px 16px", hover bg: #F9FAFB (or #FEF2F2 for destructive)
```

**Modules using this**: UserManagement ✅, ViewTickets ✅

---

### 2.4 Priority Badge

```tsx
const priorityMap: Record<string, { bg: string; color: string }> = {
  low: { bg: "#ECFDF3", color: "#027A48" },
  medium: { bg: "#FFFAEB", color: "#B54708" },
  high: { bg: "#FFF1F3", color: "#C01048" },
  critical: { bg: "#F4F3FF", color: "#5925DC" },
  urgent: { bg: "#F4F3FF", color: "#5925DC" },
};
const { bg, color } = priorityMap[priority?.toLowerCase()] || {
  bg: "#F2F4F7",
  color: "#344054",
};

<span
  style={{
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 600,
    background: bg,
    color,
    textTransform: "capitalize",
    whiteSpace: "nowrap",
  }}
>
  {priority}
</span>;
```

---

### 2.5 Status Badge

For ticket statuses with custom project colors or fallback system colors:

```tsx
<span
  style={{
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 600,
    background: (statusColor || getStatusColor(status)) + "20",
    color: statusColor || getStatusColor(status),
    whiteSpace: "nowrap",
  }}
>
  {statusName || getStatusDisplayName(status)}
</span>
```

Fallback color map:

```
open: #3B82F6, in-progress: #F59E0B, resolved: #10B981, closed: #6B7280, pending: #EF4444
```

---

### 2.6 SLA Pill

Already implemented. Color logic in `getSlaPill()` helper (ViewTickets.tsx, MyTickets.tsx).

```
>50% remaining: green  (#15803d bg:#f0fdf4)
25–50%:         amber  (#b45309 bg:#fffbeb)
<25%:           red    (#dc2626 bg:#fef2f2)
PAUSED:         gray   (#374151 bg:#f3f4f6)
BREACHED:       red
MET (closed):   green
```

Display:

```tsx
<span
  title={pill.tooltip}
  style={{
    padding: "3px 8px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
    color: pill.color,
    background: pill.bg,
    border: `1px solid ${pill.color}30`,
    whiteSpace: "nowrap",
  }}
>
  ⏱ {pill.label}
</span>
```

---

### 2.7 Floating Bulk Action Bar

Replaces inline bulk-action headers. Appears at bottom-center of screen when ≥1 row is selected.

```tsx
{
  selectedIds.size > 0 && (
    <div
      style={{
        position: "fixed",
        bottom: "28px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1E293B",
        color: "white",
        borderRadius: "12px",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,.3)",
        zIndex: 200,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontWeight: 600, fontSize: "14px" }}>
        {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
      </span>
      <div
        style={{
          width: "1px",
          height: "20px",
          background: "rgba(255,255,255,.2)",
        }}
      />
      {/* action buttons */}
      <button
        style={
          {
            /* ghost white */
          }
        }
      >
        Action A
      </button>
      <button
        style={
          {
            /* destructive */
          }
        }
      >
        Delete
      </button>
      <button
        onClick={() => setSelectedIds(new Set())}
        style={
          {
            /* clear */
          }
        }
      >
        ✕ Clear
      </button>
    </div>
  );
}
```

**Modules using this**: UserManagement ✅, ViewTickets ✅

---

### 2.8 Confirm / Delete Modal

Centered overlay modal for destructive confirmations.

```
Overlay: position fixed, inset 0, background rgba(0,0,0,.5), zIndex: 1000, flex center
Card: background white, borderRadius: 16px, padding: 28px, maxWidth: 420px,
      boxShadow: 0 20px 60px rgba(0,0,0,.3)
Icon circle (destructive): width/height 44px, borderRadius 50%, bg #FEF2F2, icon color #DC2626
Buttons: Cancel (outlined) + Confirm (filled red)
```

---

### 2.9 Pagination Bar

```tsx
<div
  style={{
    marginTop: "16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "14px",
    color: "#6B7280",
  }}
>
  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <button
      disabled={page <= 1}
      style={{
        padding: "6px 12px",
        borderRadius: "6px",
        border: "1px solid #D1D5DB",
        background: page <= 1 ? "#F3F4F6" : "white",
        color: page <= 1 ? "#9CA3AF" : "#374151",
        cursor: page <= 1 ? "not-allowed" : "pointer",
      }}
    >
      ← Previous
    </button>
    <span style={{ padding: "0 12px" }}>
      Page {page} of {totalPages}
    </span>
    <button
      disabled={page >= totalPages}
      style={
        {
          /* same as above, mirrored */
        }
      }
    >
      Next →
    </button>
  </div>
  <div>
    Showing {start}–{end} of {total} items
  </div>
</div>
```

---

## 3. Module Implementation Log

### 3.1 UserManagement (`frontend/src/components/UserManagement.tsx`)

**Status**: ✅ Complete  
**Date**: May 2026

**Before**: Dense inline layout with basic table, no stats, basic selects.  
**After**:

- Stats cards row (Total / Active / Inactive / Projects)
- Hierarchical filter dropdowns (Project → Role → Status/Center) with Select All sentinel
- Clear All button with data refresh on clear
- Table hidden on mobile → card list on `width ≤ 768px`
- Edit/Create User modal: gradient header, section cards, 2-column form grid (→ 1 col on mobile)
- Mobile/tablet responsive: `useEffect` + `window.innerWidth` breakpoints
- Floating bulk area: not used (single-item actions only)

**Key design decisions**:

- Select All uses sentinel value `"__select_all__"` in arrays, toggled with length check
- `hasFetchedInitialData` ref + `filterChangeRef` ref pattern to prevent duplicate fetches on mount
- Multi-select filter state: `filterProjects[]`, `filterRoles[]`, `filterStatuses[]`, `filterCenters[]`
- CSV params sent to backend: `role=id1,id2`, `isActive=true,false`, etc.

---

### 3.2 ViewTickets (`frontend/src/pages/ViewTickets.tsx`)

**Status**: ✅ Complete  
**Date**: May 2026

**Before**: Card-list layout (one card per ticket), inline bulk action bar.  
**After**:

- Stats cards row (Total / Open / Pending / Closed) — fetched via 4 parallel `limit=1` API calls
- Filter bar card — same logic, visual polish aligned with design tokens
- **Data table** — replaces card grid:
  - Columns: [✓] | Ticket # | Subject | Requested By | Assignee | Priority | Status | SLA | Created | Action
  - Row highlighting preserved: `#FFFBEB` bg + `3px solid #F59E0B` left border for `hasNewReply`
  - Priority badges: colored pills (Low=green, Medium=amber, High=red, Critical=purple)
  - Status badges: `statusColor` from project or fallback system colors
  - SLA pill: preserved from `getSlaPill()` — green/amber/red/gray real-time countdown
  - Action column: `•••` button → dropdown (View / Merge / Delete)
  - `openActionMenuId` state + `document.addEventListener("click")` outside-click handler
- **Floating bulk action bar** (`position: fixed; bottom: 28px`) replaces inline bar
- All existing features preserved: socket.io, bulk merge/delete, export modal, merge modal, SLA countdown refresh

**Key design decisions**:

- `openActionMenuId: string | null` — only one menu open at a time
- `fetchStats()` uses 4 parallel `limit=1` API calls — no backend changes, lightweight
- Row `onClick` → navigate; checkbox `onClick` uses `stopPropagation()`
- Amber highlight: `isHighlighted = ticket.hasNewReply && !isSelected` (selected overrides highlight)

---

### 3.3 MyTickets (`frontend/src/pages/MyTickets.tsx`)

**Status**: 🔜 Planned  
**Scope**: Same table transformation as ViewTickets. Stats cards (Total / Open / Pending / Closed for current agent). Floating bulk bar. Same design tokens.

---

### 3.4 TicketAssignment (`frontend/src/pages/TicketAssignment.tsx`)

**Status**: 🔜 Planned  
**Scope**: Table layout (simpler — no SLA, no merge). Stats card (Total Unassigned). Floating assignment bar.

---

## 4. Naming & File Conventions

| Concern               | Rule                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| Inline styles         | Use `style={{ }}` objects. No Tailwind classes.                                    |
| Component state       | Local `useState` — no global state for UI toggles                                  |
| Fetch on mount        | Use `useRef` guard to prevent React.StrictMode double-fetch                        |
| Filter change refetch | `filterChangeRef` pattern — skip first mount, trigger on every filter state change |
| Permission checks     | `checkPermission("PERMISSION_CODE")` from localStorage                             |
| Responsive            | Runtime `window.innerWidth` + `useEffect` → `isMobile` / `isTablet` state          |
| Icon library          | `@heroicons/react/24/outline`                                                      |
| Notifications         | `react-hot-toast` — `toast.success()`, `toast.error()`                             |

---

## 5. What NOT to Change

These must be preserved when applying visual updates:

- All `useSocket` hooks and room subscriptions
- `getSlaPill()` logic and color thresholds
- `hasNewReply` highlight logic
- All permission checks (`canExport`, `canMerge`, `canDelete`, `hasViewAll`)
- All API calls, params, and error handling
- All modal components (`TicketExportModal`, `TicketMergeModal`)
- Bulk delete/merge confirmation dialogs
- `useDeferredValue` search debounce
- Pagination fetch functions and `filterChangeRef` guard
- `initialProjectId` portal-lock behavior
