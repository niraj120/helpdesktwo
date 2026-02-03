# API Query Parameters Documentation

This document describes all available query parameters for list API endpoints.

## Common Parameters

All list endpoints support these pagination parameters:

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | number | 1 | - | Page number (1-indexed) |
| `limit` | number | varies | 100 | Items per page |
| `sortBy` | string | createdAt | - | Field to sort by (see endpoint-specific options) |
| `sortOrder` | string | desc | - | Sort order: `asc` or `desc` |

---

## Ticket Endpoints

### GET /api/tickets/my-tickets

Get tickets for the logged-in user.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `projectId` | ObjectId | `64abc123...` | Filter by project |
| `status` | number[] | `1,2,3` | Filter by status codes (comma-separated) |
| `priority` | string[] | `high,critical` | Filter by priority (comma-separated) |
| `search` | string | `login issue` | Search in ticketNumber, subject |
| `categoryId` | ObjectId | `64abc123...` | Filter by category |
| `createdAfter` | ISO date | `2024-01-01` | Tickets created after this date |
| `createdBefore` | ISO date | `2024-12-31` | Tickets created before this date |
| `sortBy` | string | `createdAt` | Options: `createdAt`, `updatedAt`, `priority`, `status`, `ticketNumber` |

**Status Codes:**
- 1 = Open
- 2 = In Progress
- 3 = On Hold
- 4 = Resolved
- 5 = Closed

**Priority Values:**
- `low`
- `medium`
- `high`
- `critical`

---

### GET /api/tickets/all (View All Tickets)

Get all tickets (admin/supervisor view).

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `status` | number[] | `1,2` | Filter by status codes |
| `priority` | string[] | `high` | Filter by priority |
| `search` | string | `TKT-001` | Search in ticketNumber, subject |
| `projectIds` | ObjectId[] | `id1,id2` | Filter by multiple projects (unified mode) |
| `categoryId` | ObjectId | `64abc123...` | Filter by category |
| `assignedTo` | ObjectId | `64abc123...` | Filter by assigned agent (or `unassigned`) |
| `submissionSource` | string | `online` | Filter by source: `online`, `offline`, `email`, `whatsapp` |
| `centerId` | string | `64abc123...` | Filter by center (or `online`) |
| `createdAfter` | ISO date | `2024-01-01` | Date range start |
| `createdBefore` | ISO date | `2024-12-31` | Date range end |
| `sortBy` | string | `priority` | Options: `createdAt`, `updatedAt`, `priority`, `status`, `ticketNumber`, `slaDeadline` |

---

### GET /api/tickets/assigned

Get tickets assigned to the current agent.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `projectId` | ObjectId | `64abc123...` | Filter by project |
| `status` | number[] | `1,2` | Filter by status codes |
| `priority` | string[] | `high` | Filter by priority |
| `search` | string | `issue` | Search in ticketNumber, subject |
| `categoryId` | ObjectId | `64abc123...` | Filter by category |
| `createdAfter` | ISO date | `2024-01-01` | Date range start |
| `createdBefore` | ISO date | `2024-12-31` | Date range end |
| `sortBy` | string | `createdAt` | Options: `createdAt`, `updatedAt`, `priority`, `status`, `ticketNumber` |

---

## User Endpoints

### GET /api/users

Get all users (admin view).

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `search` | string | `john` | Search in firstName, lastName, email, employeeCode, mobile |
| `role` | ObjectId | `64abc123...` | Filter by role ID |
| `isActive` | boolean | `true` | Filter by active status |
| `project` | ObjectId | `64abc123...` | Filter by assigned project |
| `department` | string | `Engineering` | Filter by department (partial match) |
| `centers` | ObjectId[] | `id1,id2` | Filter by assigned centers |
| `createdAfter` | ISO date | `2024-01-01` | Date range start |
| `createdBefore` | ISO date | `2024-12-31` | Date range end |
| `sortBy` | string | `lastName` | Options: `createdAt`, `firstName`, `lastName`, `email`, `lastLogin` |

---

## Knowledge Base Endpoints

### GET /api/kb/articles

Get KB articles (admin view).

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `projectId` | ObjectId | `64abc123...` | Filter by project (or `all` for super admin) |
| `levelId` | ObjectId | `64abc123...` | Filter by KB level |
| `status` | string | `active` | Filter by status: `active`, `draft`, `archived` |
| `search` | string | `password` | Search in title, excerpt, tags |
| `tags` | string[] | `faq,guide` | Filter by tags (comma-separated) |
| `author` | ObjectId | `64abc123...` | Filter by author ID |
| `isFeatured` | boolean | `true` | Filter featured articles |
| `publishedAfter` | ISO date | `2024-01-01` | Published after this date |
| `publishedBefore` | ISO date | `2024-12-31` | Published before this date |
| `sortBy` | string | `viewCount` | Options: `createdAt`, `publishedAt`, `viewCount`, `title`, `displayOrder` |

---

## Project Endpoints

### GET /api/projects

Get all projects.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `search` | string | `helpdesk` | Search in name, code, projectId |
| `status` | string | `active` | Filter by status: `active`, `inactive`, `archived` |
| `createdAfter` | ISO date | `2024-01-01` | Date range start |
| `createdBefore` | ISO date | `2024-12-31` | Date range end |
| `sortBy` | string | `name` | Options: `createdAt`, `name`, `code`, `status` |

---

## Center Endpoints

### GET /api/centers

Get all centers.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `projectId` | ObjectId | `64abc123...` | Filter by project |
| `search` | string | `mumbai` | Search in centerName, city, state |
| `sortBy` | string | `centerName` | Options: `centerName`, `city`, `state`, `createdAt` |

---

## Asset Endpoints

### GET /api/assets

Get all assets.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `projectId` | ObjectId | **Required** | Filter by project |
| `includeInactive` | boolean | `true` | Include inactive assets |
| `search` | string | `printer` | Search in name, description, category |
| `sortBy` | string | `name` | Options: `name`, `createdAt`, `category` |

---

## Log Endpoints

### GET /api/access-logs

Get access logs.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `userId` | ObjectId | `64abc123...` | Filter by user |
| `action` | string | `login` | Filter by action type |
| `success` | boolean | `true` | Filter by success status |
| `startDate` | ISO date | `2024-01-01` | Date range start |
| `endDate` | ISO date | `2024-12-31` | Date range end |
| `search` | string | `john` | Search in userName, userEmail, projectName, ipAddress |

### GET /api/activity-logs

Get activity logs.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `userId` | ObjectId | `64abc123...` | Filter by user |
| `action` | string | `create` | Filter by action: `create`, `update`, `delete` |
| `entityType` | string | `ticket` | Filter by entity type |
| `projectId` | ObjectId | `64abc123...` | Filter by project |
| `startDate` | ISO date | `2024-01-01` | Date range start |
| `endDate` | ISO date | `2024-12-31` | Date range end |
| `search` | string | `ticket` | Search in userName, userEmail, entityName, description |

### GET /api/email-logs

Get email logs.

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `status` | string | `sent` | Filter by status: `sent`, `failed`, `blocked`, `simulated` |
| `type` | string | `ticket_created` | Filter by email type |
| `recipient` | string | `user@example.com` | Filter by recipient email |
| `projectId` | ObjectId | `64abc123...` | Filter by project |
| `startDate` | ISO date | `2024-01-01` | Date range start |
| `endDate` | ISO date | `2024-12-31` | Date range end |

---

## Query Examples

### Get high priority open tickets from last week
```
GET /api/tickets/all?status=1&priority=high,critical&createdAfter=2024-01-20&sortBy=priority&sortOrder=desc
```

### Search users in Engineering department
```
GET /api/users?department=Engineering&isActive=true&sortBy=lastName&sortOrder=asc
```

### Get featured KB articles
```
GET /api/kb/articles?isFeatured=true&status=active&sortBy=viewCount&sortOrder=desc
```

### Get unassigned tickets
```
GET /api/tickets/all?assignedTo=unassigned&status=1,2
```

---

## Response Format

All list endpoints return responses in this format:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Input Validation

All query parameters are validated and sanitized:

1. **ObjectId**: Validated for proper MongoDB ObjectId format
2. **Numbers**: Parsed as integers with min/max enforcement
3. **Booleans**: Accept `true`/`false` or `1`/`0`
4. **Dates**: Parsed as ISO 8601 dates, invalid dates are ignored
5. **Search strings**: Sanitized to prevent regex injection attacks
6. **Enums**: Validated against allowed values, invalid values ignored

Invalid filter values are silently ignored to maintain backward compatibility.
