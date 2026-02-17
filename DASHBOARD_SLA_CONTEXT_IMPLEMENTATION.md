# Dashboard SLA Context Implementation

## Overview
Implemented contextual SLA display in dashboards based on view mode:
- **My Ticket Dashboard (self view)**: Shows **role-level SLA** (resets on escalation)
- **Team/Hierarchy Dashboard**: Shows **ticket-level SLA** (overall from creation, never resets)

## Implementation Details

### Backend Changes

#### File: `backend/src/controllers/ticketController.ts`

**Function: `getDashboardStats`** (lines ~3190-3235)

Added logic to select appropriate SLA field based on view mode:

```typescript
// ===== SLA FIELD SELECTION BASED ON VIEW MODE =====
// For 'self' view (My Ticket Dashboard): Use role-level SLA (resets on escalation)
// For 'team'/'hierarchy' views: Use ticket-level SLA (overall from creation)
const useRoleLevelSLA = appliedViewMode === 'self';
const slaBreachedField = useRoleLevelSLA ? 'roleLevelSLA.breachedAt' : 'ticketLevelSLA.breachedAt';
console.log(`📊 [DASHBOARD] Using ${useRoleLevelSLA ? 'ROLE-LEVEL' : 'TICKET-LEVEL'} SLA for viewMode: ${appliedViewMode}`);
```

**Modified aggregation queries** to use the appropriate SLA field:

**Closed/Resolved SLA Stats:**
```typescript
closedSLA: [
  { $match: { status: { $in: [4, 5] } } },
  {
    $group: {
      _id: {
        $cond: {
          if: { $ifNull: [useRoleLevelSLA ? '$roleLevelSLA.breachedAt' : '$ticketLevelSLA.breachedAt', null] },
          then: true,
          else: false
        }
      },
      count: { $sum: 1 }
    }
  }
]
```

**Pending SLA Stats:**
```typescript
pendingSLA: [
  { $match: { status: { $in: [1, 2, 3] } } },
  {
    $group: {
      _id: {
        $cond: {
          if: { $ifNull: [useRoleLevelSLA ? '$roleLevelSLA.breachedAt' : '$ticketLevelSLA.breachedAt', null] },
          then: true,
          else: false
        }
      },
      count: { $sum: 1 }
    }
  }
]
```

### View Modes

The dashboard already supports four view modes through the `viewMode` query parameter:

1. **`self`** (My Ticket Dashboard)
   - Shows only user's own tickets
   - **Uses role-level SLA** - relevant for individual agents
   - Timer resets when ticket is escalated
   - Shows time remaining at current escalation level

2. **`team`** (Team Dashboard)
   - Shows direct reportees' tickets
   - **Uses ticket-level SLA** - relevant for team management
   - Timer never resets
   - Shows overall time since ticket creation

3. **`hierarchy`** (Full Hierarchy Dashboard)
   - Shows all reportees recursively
   - **Uses ticket-level SLA** - relevant for organization-wide view
   - Timer never resets
   - Shows overall time since ticket creation

4. **`all`** (All Tickets Dashboard - Super Admin only)
   - Shows all tickets across all projects
   - **Uses ticket-level SLA**
   - For highest-level oversight

### SLA Breach Calculation

**Role-Level SLA (for `self` view):**
- Breach determined by: `roleLevelSLA.breachedAt !== null`
- Relevant for: Agents working on tickets at their current escalation level
- Purpose: Track if agent met their assigned level's response time

**Ticket-Level SLA (for `team`/`hierarchy`/`all` views):**
- Breach determined by: `ticketLevelSLA.breachedAt !== null`
- Relevant for: Managers and supervisors monitoring overall ticket health
- Purpose: Track if ticket was resolved within priority's resolution time

### Dashboard Stats Response

The stats endpoint returns:
```json
{
  "success": true,
  "viewMode": "self|team|hierarchy|all",
  "total": 150,
  "pending": 45,
  "resolved": 90,
  "closed": 15,
  "withinSLA": 120,
  "outsideSLA": 30,
  "pendingWithinSLA": 35,
  "pendingOutsideSLA": 10,
  "recentActivity": [...],
  "teamBreakdown": [...]
}
```

**Important:** The `withinSLA` and `outsideSLA` counts now reflect the appropriate SLA field based on view mode.

## Frontend Integration

### Dashboard Component
**File:** `frontend/src/pages/Dashboard.tsx`

The dashboard fetches stats with the current view mode:
```typescript
const params = new URLSearchParams();
if (projectId) params.append('projectId', projectId);
params.append('viewMode', currentViewMode);

const url = `${API_CONFIG.API_URL}/tickets/dashboard-stats?${params.toString()}`;
```

### View Mode Selector
Users can switch between view modes using the `ViewModeSelector` component.

The appropriate SLA field is automatically used based on selection:
- Select "My Tickets" → Role-level SLA
- Select "My Team" or "My Hierarchy" → Ticket-level SLA

## Benefits

### For Agents (My Ticket Dashboard - self view)
- See their **current level's remaining time**
- Understand how much time they have before current level escalates
- Focus on immediate responsiveness at their level
- **More actionable** - shows time relevant to their work

### For Managers (Team/Hierarchy Dashboard)
- See **overall ticket age** and health
- Monitor if tickets are being resolved within SLA
- Identify tickets that have been open too long overall
- **Strategic view** - understand system-wide performance

### For Organization (Hierarchy/All Dashboard)
- Track overall SLA compliance
- See which tickets are oldest
- Understand true customer wait times
- **Executive reporting** - accurate metrics for leadership

## Technical Considerations

### Performance
- Single aggregation query per dashboard load
- No additional database queries needed
- Uses indexes on `roleLevelSLA.breachedAt` and `ticketLevelSLA.breachedAt`

### Backward Compatibility
- Existing tickets without dual SLA fields return null
- Falls back gracefully (counts as "within SLA")
- Migration script available to backfill existing tickets

### Data Consistency
- Both SLA fields updated simultaneously by backend
- SLA calculations use same working calendar
- Validation ensures data integrity

## Testing Checklist

### My Ticket Dashboard (self view)
- [ ] Shows only user's assigned tickets
- [ ] SLA breach count uses `roleLevelSLA.breachedAt`
- [ ] Escalated tickets show fresh timer for new role
- [ ] Stats reflect role-level breaches accurately

### Team Dashboard
- [ ] Shows direct reportees' tickets
- [ ] SLA breach count uses `ticketLevelSLA.breachedAt`
- [ ] Reflects overall ticket age
- [ ] Stats reflect ticket-level breaches accurately

### Hierarchy Dashboard
- [ ] Shows all reportees' tickets recursively
- [ ] SLA breach count uses `ticketLevelSLA.breachedAt`
- [ ] Works across multiple hierarchy levels
- [ ] Stats reflect ticket-level breaches accurately

### View Mode Switching
- [ ] Switching between views updates stats correctly
- [ ] SLA counts change appropriately
- [ ] No stale data displayed
- [ ] Performance remains fast

## Migration Guide

### Existing Tickets
Run this script to backfill SLA fields on existing tickets:

```javascript
// backend/scripts/migrations/backfill-ticket-sla-fields.js
const mongoose = require('mongoose');
const Ticket = require('../../src/models/Ticket');
const slaService = require('../../src/services/slaService');

async function backfillSLAFields() {
  const tickets = await Ticket.find({
    $or: [
      { ticketLevelSLA: { $exists: false } },
      { roleLevelSLA: { $exists: false } }
    ]
  }).populate('priority').populate('project');

  for (const ticket of tickets) {
    // Calculate ticket-level SLA
    if (ticket.priority && ticket.project) {
      const ticketSLA = await slaService.calculateTicketLevelSLA(
        ticket.createdAt,
        ticket.priority,
        ticket.project,
        ticket.workingCalendarId
      );
      ticket.ticketLevelSLA = ticketSLA;
    }

    // Calculate role-level SLA
    if (ticket.currentEscalationLevel) {
      const roleSLA = await slaService.calculateRoleLevelSLA(
        ticket.escalationStartedAt || ticket.createdAt,
        ticket.escalationMatrix,
        ticket.currentEscalationLevel,
        ticket.priority,
        ticket.workingCalendarId
      );
      ticket.roleLevelSLA = roleSLA;
    }

    await ticket.save();
  }

  console.log(`✅ Backfilled SLA fields for ${tickets.length} tickets`);
}

backfillSLAFields().catch(console.error);
```

## API Documentation

### GET /api/tickets/dashboard-stats

**Query Parameters:**
- `viewMode` (optional): `self | team | hierarchy | all` - Defaults to user's saved preference
- `projectId` (optional): Filter by specific project

**Response:**
```json
{
  "success": true,
  "viewMode": "self",
  "total": 45,
  "pending": 12,
  "resolved": 30,
  "closed": 3,
  "withinSLA": 40,
  "outsideSLA": 5,
  "pendingWithinSLA": 10,
  "pendingOutsideSLA": 2,
  "recentActivity": [...],
  "teamBreakdown": [...]
}
```

**SLA Calculation Logic:**
- `viewMode === 'self'`: Uses `roleLevelSLA.breachedAt`
- `viewMode === 'team|hierarchy|all'`: Uses `ticketLevelSLA.breachedAt`

## Configuration

No additional configuration required. The system automatically:
1. Detects view mode from query parameter
2. Selects appropriate SLA field
3. Calculates stats using correct field
4. Returns contextually relevant metrics

## Conclusion

This implementation ensures that agents and managers see the most relevant SLA information for their context:
- **Agents** see actionable, current-level SLA timers
- **Managers** see strategic, overall ticket health metrics

The system maintains both views simultaneously, providing comprehensive SLA tracking across the organization.
