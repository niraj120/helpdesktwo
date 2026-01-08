# Multi-Tenancy Architecture - SAC Helpdesk

## Overview
The SAC Helpdesk system implements a comprehensive multi-tenancy architecture where everything is organized under **Projects** as the top-level tenant. Each project can operate in different modes with conditional center mapping based on the project type.

## Architecture Hierarchy

```
┌─────────────────────────────────────┐
│           ORGANIZATION              │
│         (Implicit Level)            │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│           PROJECT (Tenant)           │
│   - Online Projects                  │
│   - Offline Projects                 │
│   - Hybrid Projects (Both)           │
└──────────────┬───────────────────────┘
               │
               ├────────────┬──────────────────┐
               │            │                  │
               ▼            ▼                  ▼
         ┌─────────┐  ┌──────────┐      ┌────────────┐
         │ ONLINE  │  │ OFFLINE  │      │   HYBRID   │
         │  MODE   │  │   MODE   │      │    MODE    │
         └─────────┘  └────┬─────┘      └─────┬──────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   CENTERS   │     │   CENTERS   │
                    │  (Required) │     │  (Required) │
                    └─────────────┘     └─────────────┘
```

## Project Types & Modes

### 1. **Online Projects**
- **Description**: Projects that operate entirely online (web-based helpdesk)
- **Center Mapping**: NOT REQUIRED
- **Use Cases**:
  - General helpdesk systems
  - Remote support portals
  - Virtual customer service
  - SaaS applications
- **Features**:
  - Tickets submitted via web portal
  - No physical location dependency
  - Users not tied to specific centers
  - Asset management (optional, not center-specific)

### 2. **Offline Projects**
- **Description**: Projects with physical centers/locations
- **Center Mapping**: MANDATORY
- **Use Cases**:
  - Educational institutions with multiple campuses
  - Service centers across cities
  - Regional support offices
  - Physical examination centers
- **Features**:
  - All tickets must have center association
  - Students/users registered at specific centers
  - Assets mapped to centers
  - Center-specific agents and managers
  - Location-based reporting

### 3. **Hybrid Projects (Both)**
- **Description**: Projects supporting both online and offline operations
- **Center Mapping**: CONDITIONAL (required for offline operations only)
- **Use Cases**:
  - Organizations with physical centers + remote support
  - Educational projects with online and offline submission modes
  - Multi-channel support systems
- **Features**:
  - Online tickets: No center mapping
  - Offline tickets: Center mapping required
  - Flexible user assignment
  - Mixed reporting capabilities

## Data Models

### Project Model
```typescript
interface IProject {
  projectId: string; // Unique ID (e.g., P001)
  name: string;
  code: string;
  
  // Project Type Configuration
  ticketSubmissionSettings?: {
    mode: 'online' | 'offline' | 'both';
    enableOnlineForm: boolean;
    enableOfflineCenter: boolean;
  };
  
  // Offline-specific settings
  offlineModuleSettings?: {
    registrationFields: Field[];
    ticketFields: Field[];
    requireCenterMapping: boolean;
  };
  
  isActive: boolean;
}
```

### Center Model
```typescript
interface ICenter {
  _id: ObjectId;
  projectId: ObjectId; // Reference to Project
  centerName: string;
  address: string;
  city: string;
  state: string;
  pincode?: string;
  phone?: string;
  email?: string;
  workingHours?: string;
  latitude?: number;
  longitude?: number;
  features?: string[]; // [WiFi, AC, Parking, etc.]
  mapLink?: string;
  googleMapLink?: string;
  contacts?: Contact[];
  isActive: boolean;
  createdBy: ObjectId;
  updatedBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface Contact {
  name: string;
  role: string;
  mobile: string;
  email: string;
}
```

## Center Mapping Implementation

### Modules with Center Mapping

#### 1. **Tickets**
- **Online Mode**: No center field
- **Offline Mode**: 
  ```typescript
  interface Ticket {
    centerId?: ObjectId; // Required for offline
    projectId: ObjectId; // Always required
    // ... other fields
  }
  ```

#### 2. **Student/User Registration** (Offline Only)
```typescript
interface OfflineStudent {
  projectId: ObjectId;
  centerId: ObjectId; // REQUIRED
  personalInfo: {
    fullName: string;
    mobile: string;
    email?: string;
  };
  registeredAt: Date;
}
```

#### 3. **Assets**
```typescript
interface CenterAssetMapping {
  projectId: ObjectId;
  centerId: ObjectId; // REQUIRED for offline
  assetId: ObjectId;
  totalAssigned: number;
  workingAsset: number;
  notWorkingAsset: number;
}
```

#### 4. **Reports & Analytics**
- Filter by center for offline projects
- Show center-wise statistics
- Center comparison reports

#### 5. **User Assignment**
- Agents can be assigned to specific centers
- Center managers oversee specific locations
- Center-based permissions

## Offline Configuration Module

### Purpose
Centralized management of centers for offline/hybrid projects.

### Features
1. **Center CRUD Operations**
   - Create new centers
   - Edit center details
   - Soft delete (deactivate) centers
   - Bulk operations

2. **Center Details**
   - Basic Info: Name, Address, City, State, Pincode
   - Contact: Phone, Email, Working Hours
   - Location: Latitude, Longitude, Google Maps Link
   - Features: Amenities available (WiFi, AC, Parking, etc.)
   - Contacts: Multiple contact persons with roles

3. **Center Filtering**
   - Search by name/city/state
   - Filter by city
   - Filter by state
   - Filter by active/inactive status

4. **Center Reusability**
   - Centers stored in centralized `centers` collection
   - Referenced across all modules via `centerId`
   - Single source of truth
   - Easy updates reflect everywhere

### Access Control
- **Permission**: `OFFLINE_MODULE_ACCESS`
- **Roles**: Super Admin, Project Managers
- **Menu**: Sidebar under "Offline Centers"

## API Endpoints

### Centers Management
```typescript
// Get all centers (with optional project filter)
GET /api/centers?projectId={projectId}

// Get single center
GET /api/centers/:id

// Create center (requires OFFLINE_MODULE_ACCESS)
POST /api/centers
Body: {
  projectId: string,
  centerName: string,
  address: string,
  city: string,
  state: string,
  // ... other fields
}

// Update center (requires OFFLINE_MODULE_ACCESS)
PUT /api/centers/:id
Body: { ...centerFields }

// Delete center (soft delete, requires OFFLINE_MODULE_ACCESS)
DELETE /api/centers/:id
```

### Project-Specific Endpoints
```typescript
// Get centers for a project
GET /api/projects/:projectId/centers

// Get offline settings
GET /api/projects/:projectId/offline-settings
```

## Frontend Components

### 1. **OfflineCenterManagement** (Created)
- **Path**: `/offline-centers`
- **File**: `frontend/src/pages/OfflineCenterManagement.tsx`
- **Features**:
  - Project selector dropdown
  - Center cards with full details
  - Add/Edit/Delete modals
  - Search and filter functionality
  - Contact person management
  - Google Maps integration
  - Active/Inactive status toggle

### 2. **Center Selector Component** (To Create)
```typescript
// Reusable component for center selection
<CenterSelector
  projectId={projectId}
  value={selectedCenterId}
  onChange={(centerId) => setSelectedCenterId(centerId)}
  required={isOfflineProject}
/>
```

### 3. **Conditional Center Fields**
```typescript
// In ticket forms, student registration, etc.
{project.mode === 'offline' || project.mode === 'both' ? (
  <div className="form-field">
    <label>Center *</label>
    <CenterSelector projectId={projectId} required />
  </div>
) : null}
```

## Database Indexes

### Centers Collection
```javascript
// Compound index for project + centerName uniqueness
db.centers.createIndex({ projectId: 1, centerName: 1 }, { unique: true });

// Index for active centers lookup
db.centers.createIndex({ projectId: 1, isActive: 1 });

// Geo-spatial index for location-based queries
db.centers.createIndex({ location: "2dsphere" });

// City and state for filtering
db.centers.createIndex({ city: 1 });
db.centers.createIndex({ state: 1 });
```

## Best Practices

### 1. **Always Check Project Mode**
```typescript
// Before enforcing center requirement
const project = await Project.findById(projectId);
const requiresCenter = project.ticketSubmissionSettings?.mode !== 'online';

if (requiresCenter && !centerId) {
  throw new Error('Center is required for this project');
}
```

### 2. **Validate Center Belongs to Project**
```typescript
const center = await Center.findOne({ 
  _id: centerId, 
  projectId: projectId,
  isActive: true 
});

if (!center) {
  throw new Error('Invalid center for this project');
}
```

### 3. **Use Virtual Populations**
```typescript
// Automatically populate center details
TicketSchema.virtual('centerDetails', {
  ref: 'Center',
  localField: 'centerId',
  foreignField: '_id',
  justOne: true
});
```

### 4. **Conditional Queries**
```typescript
// Filter tickets by center for offline projects
const query: any = { projectId };

if (projectMode === 'offline' && centerId) {
  query.centerId = centerId;
}

const tickets = await Ticket.find(query);
```

## Migration Strategy

### Existing Projects
1. Identify project types (online/offline/both)
2. Set `ticketSubmissionSettings.mode` accordingly
3. For offline projects:
   - Import existing centers to `centers` collection
   - Update ticket records with center references
   - Migrate asset mappings
   - Update user assignments

### New Projects
1. Set project mode during creation
2. For offline/hybrid:
   - Create centers first
   - Enable center selection in forms
   - Configure center-based permissions

## Reporting & Analytics

### Center-wise Reports
- Tickets per center
- Resolution time by center
- Agent performance by center
- Asset status by center
- Student registrations by center

### Cross-Center Analysis
- Compare center performance
- Identify high-performing centers
- Resource allocation optimization
- Load distribution

## Security Considerations

### 1. **Center-based Access Control**
```typescript
// Agent can only view tickets from assigned centers
const agentCenters = await getUserAssignedCenters(userId);
const tickets = await Ticket.find({
  projectId,
  centerId: { $in: agentCenters }
});
```

### 2. **Data Isolation**
- Centers are project-scoped
- No cross-project center access
- Soft delete instead of hard delete
- Audit logs for center modifications

### 3. **Validation**
- Center must belong to project
- Center must be active for new records
- Prevent orphaned center references

## Future Enhancements

1. **Center Hierarchy**
   - Regional centers → Sub-centers
   - Parent-child relationships
   - Cascading permissions

2. **Center Capacity Management**
   - Maximum tickets per center
   - Agent capacity tracking
   - Load balancing

3. **Center Analytics Dashboard**
   - Real-time center performance
   - Heatmaps and visualizations
   - Predictive analytics

4. **Multi-Center Operations**
   - Ticket transfer between centers
   - Cross-center collaboration
   - Shared resources

## Conclusion

The multi-tenancy architecture with conditional center mapping provides:
- **Flexibility**: Support online, offline, and hybrid operations
- **Scalability**: Easily add new centers and projects
- **Maintainability**: Centralized center management
- **Efficiency**: Reusable centers across modules
- **Security**: Project-scoped data isolation

This architecture ensures the system can handle diverse use cases while maintaining data integrity and operational efficiency.
