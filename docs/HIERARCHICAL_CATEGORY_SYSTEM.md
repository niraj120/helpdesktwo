# Hierarchical Category System

## Overview

This document describes the implementation of a multi-level (1-4 levels) hierarchical category system for the SAC Helpdesk application. Each project can configure its own category hierarchy with custom level names and mandatory settings.

## Features

- **Configurable Levels**: Projects can have 1-4 category levels
- **Custom Level Names**: Each level can have a custom name (e.g., "Course", "Category", "Subcategory", "Topic")
- **Cascading Selection**: Selecting a level 1 item filters level 2 options, and so on
- **Per-Project Configuration**: Each project maintains its own hierarchy settings
- **Backward Compatible**: Works alongside existing single-level category system
- **Real-time Updates**: WebSocket events notify clients when config changes

## Database Models

### HierarchyConfig (New)

Located at: `backend/src/models/HierarchyConfig.ts`

```typescript
{
  projectId: ObjectId,      // Project this config belongs to
  levelCount: 1-4,          // Number of active levels
  levels: [{
    levelNumber: 1-4,
    displayName: string,    // Custom name for this level
    isMandatory: boolean,   // Level 1 is always mandatory
    isActive: boolean
  }],
  visibilitySettings: {
    showInOnlineForm: number[],   // Which levels to show in online form
    showInOfflineForm: number[],  // Which levels to show in offline form
    showInTicketDisplay: number[], // Which levels to show when viewing ticket
    showInFilters: number[]        // Which levels to use as filters
  }
}
```

### Category Model (Extended)

New fields added to `backend/src/models/Category.ts`:

```typescript
{
  level: 1-4,                    // Hierarchy level (default: 1)
  parentId: ObjectId | null,     // Parent category reference
  path: string,                  // Full path string (e.g., "Engineering > Software > Web")
  hierarchyPath: ObjectId[]      // Array of ancestor IDs for efficient queries
}
```

### Ticket Model (Extended)

New field added to `backend/src/models/Ticket.ts`:

```typescript
{
  categoryHierarchy: {
    level1: ObjectId,            // Level 1 category
    level2: ObjectId | null,     // Level 2 category (optional)
    level3: ObjectId | null,     // Level 3 category (optional)
    level4: ObjectId | null,     // Level 4 category (optional)
    displayPath: string          // Human-readable path (e.g., "MHT-CET > Technical > Login Issues")
  }
}
```

## API Endpoints

All endpoints are at `/api/hierarchy-config`

### Configuration

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/:projectId` | Get hierarchy config for project | Public |
| POST | `/:projectId` | Create/update hierarchy config | Protected |

### Category Tree

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/:projectId/tree` | Get full category tree | Public |
| GET | `/:projectId/children/:parentId` | Get children of category | Public |
| GET | `/:projectId/level/:levelNumber` | Get categories at level (with optional parent filter) | Public |

### Category Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/:projectId/categories` | Create new category | Protected |
| PUT | `/categories/:categoryId` | Update category | Protected |
| DELETE | `/categories/:categoryId` | Delete category (soft/hard) | Protected |

## Frontend Components

### HierarchyCategorySelector

Located at: `frontend/src/components/HierarchyCategorySelector.tsx`

A reusable cascading dropdown component for selecting hierarchical categories.

**Props:**
```typescript
{
  projectId: string,              // Project ID
  value: CategoryHierarchyValue,  // Current selection
  onChange: (value) => void,      // Selection change handler
  mode: 'online' | 'offline' | 'display' | 'filter',  // Visibility mode
  disabled: boolean,              // Disable selection
  showValidation: boolean,        // Show validation errors
  compact: boolean                // Use horizontal layout
}
```

**Usage:**
```tsx
<HierarchyCategorySelector
  projectId={projectId}
  value={categoryHierarchy}
  onChange={setCategoryHierarchy}
  mode="online"
  showValidation={true}
/>
```

### HierarchyConfigManager

Located at: `frontend/src/components/HierarchyConfigManager.tsx`

Admin component for configuring hierarchy levels and managing category items.

**Features:**
- Set number of levels (1-4)
- Customize level names
- Set which levels are mandatory
- Tree view for managing categories
- Add/edit/delete categories at any level

### useHierarchyConfig Hook

```typescript
const { config, loading, error, refresh } = useHierarchyConfig(projectId, refreshInterval?);
```

Returns the hierarchy configuration for a project with optional polling for real-time updates.

### CategoryHierarchyDisplay

A component to display the category hierarchy path:

```tsx
<CategoryHierarchyDisplay 
  value={ticket.categoryHierarchy} 
  separator=" > " 
/>
```

## Integration Points

### Updated Pages

1. **TicketSettings.tsx** - New "Category Hierarchy" tab added
2. **AgentOfflineModule.tsx** - Category field uses HierarchyCategorySelector when multi-level configured
3. **AuthenticatedStudentSubmitTicket.tsx** - Category dropdown uses HierarchyCategorySelector
4. **AgentTicketDetail.tsx** - Shows/edits category hierarchy in ticket sidebar

### Ticket Submission

When submitting a ticket:
1. Frontend includes `categoryHierarchy` object with selected levels
2. Backend stores both `categoryHierarchy` and legacy `category` field
3. `displayPath` is computed and stored for display purposes

### WebSocket Events

When hierarchy config or categories change, these events are emitted:

- `hierarchy-config-updated` - Config was saved
- `category-tree-updated` - Category was created/updated/deleted

## How to Use

### For Super Admins

1. Go to Project Settings > Ticket Settings
2. Click "Category Hierarchy" tab
3. Select number of levels (1-4)
4. Name each level (e.g., "Course", "Module", "Topic")
5. Check "Required" for mandatory levels (Level 1 is always required)
6. Click "Save Configuration"
7. Add category items using the tree view below

### For Agents/Students

1. When creating a ticket, select from cascading dropdowns
2. Each selection filters the next level's options
3. Only mandatory levels need to be filled

## Migration Notes

- Existing categories remain as Level 1 items
- New categories can be added at any level
- `category` field in tickets is maintained for backward compatibility
- No data migration required - existing tickets continue to work

## Future Enhancements

1. WebSocket integration in frontend for live updates
2. Drag-and-drop reordering of categories
3. Bulk import of categories via CSV
4. Category analytics and usage reports
