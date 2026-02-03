# Unified Multi-Tenant Project Portal - Implementation Guide

## Overview

Transform the current multi-tenant helpdesk into a unified portal where users can:
- **Single Sign-On**: Login once and access all assigned projects
- **Project Switching**: Toggle between projects without re-authentication
- **Unified View**: See aggregated data from all projects or focus on one
- **Security**: Maintain clean data separation between projects

---

## Phase 1: Authentication & Project Context Management

### 1.1 Unified Login System ✅ (Partially Complete)

#### Current State:
- ✅ Multi-project support in User model (`projects: ObjectId[]`)
- ✅ Login fetches user data with projects array
- ✅ Token-based authentication
- ⚠️ Multiple login URLs (main login, project-specific login)
- ⚠️ No project selector after login

#### Implementation Tasks:

##### **Task 1.1.1: Create Unified Login Endpoint**

**File**: `backend/src/routes/auth.ts`

```typescript
// Add new unified login endpoint
router.post('/unified-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Authenticate user
    const user = await User.findOne({ email }).populate([
      { path: 'role', populate: { path: 'permissions' } },
      { path: 'projects', select: 'name code portalUrl logo status' },
      { path: 'centers', select: 'centerName city state' }
    ]);
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    // Generate token with project access
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        projectIds: user.projects.map(p => p._id), // Store accessible project IDs
        tokenVersion: user.tokenVersion || 0
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return user data with all projects
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          projects: user.projects, // Full project objects
          centers: user.centers,
          hasMultipleProjects: user.projects.length > 1
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

##### **Task 1.1.2: Create Project Selector Component**

**File**: `frontend/src/components/ProjectSelector.tsx` (NEW)

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdBusiness, MdStar, MdStarBorder, MdHistory } from 'react-icons/md';

interface Project {
  _id: string;
  name: string;
  code: string;
  portalUrl?: string;
  logo?: string;
  status: string;
}

interface ProjectSelectorProps {
  projects: Project[];
  onProjectSelect: (projectId: string) => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({ 
  projects, 
  onProjectSelect 
}) => {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Load favorites and recent from localStorage
    const savedFavorites = localStorage.getItem('favoriteProjects');
    const savedRecent = localStorage.getItem('recentProjects');
    
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
    if (savedRecent) setRecentProjects(JSON.parse(savedRecent));
  }, []);

  const toggleFavorite = (projectId: string) => {
    const newFavorites = favorites.includes(projectId)
      ? favorites.filter(id => id !== projectId)
      : [...favorites, projectId];
    
    setFavorites(newFavorites);
    localStorage.setItem('favoriteProjects', JSON.stringify(newFavorites));
  };

  const handleProjectSelect = (projectId: string) => {
    // Update recent projects
    const newRecent = [projectId, ...recentProjects.filter(id => id !== projectId)]
      .slice(0, 5); // Keep last 5
    setRecentProjects(newRecent);
    localStorage.setItem('recentProjects', JSON.stringify(newRecent));
    
    onProjectSelect(projectId);
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: favorites first, then recent, then alphabetical
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const aFav = favorites.includes(a._id);
    const bFav = favorites.includes(b._id);
    const aRecent = recentProjects.includes(a._id);
    const bRecent = recentProjects.includes(b._id);
    
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    if (aRecent && !bRecent) return -1;
    if (!aRecent && bRecent) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        maxWidth: '900px',
        width: '100%',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: '700',
          marginBottom: '12px',
          color: '#1f2937'
        }}>
          Select Your Project
        </h1>
        <p style={{
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '32px'
        }}>
          You have access to {projects.length} project{projects.length !== 1 ? 's' : ''}
        </p>

        {/* Search Bar */}
        <input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            marginBottom: '24px',
            outline: 'none'
          }}
          onFocus={(e) => e.target.style.borderColor = '#667eea'}
          onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
        />

        {/* View All Projects Option */}
        <div
          onClick={() => {
            localStorage.setItem('viewMode', 'unified');
            navigate('/dashboard');
          }}
          style={{
            padding: '20px',
            border: '2px dashed #667eea',
            borderRadius: '12px',
            marginBottom: '24px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f3f4f6';
            e.currentTarget.style.borderColor = '#764ba2';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = '#667eea';
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🌐</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#667eea' }}>
            View All Projects (Unified View)
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
            See aggregated data from all your projects
          </div>
        </div>

        {/* Project Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {sortedProjects.map(project => (
            <div
              key={project._id}
              onClick={() => handleProjectSelect(project._id)}
              style={{
                padding: '20px',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Favorite Star */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(project._id);
                }}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '20px',
                  color: favorites.includes(project._id) ? '#fbbf24' : '#d1d5db'
                }}
              >
                {favorites.includes(project._id) ? <MdStar /> : <MdStarBorder />}
              </button>

              {/* Recent Badge */}
              {recentProjects.includes(project._id) && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  fontSize: '11px',
                  background: '#dbeafe',
                  color: '#1e40af',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <MdHistory size={12} /> Recent
                </div>
              )}

              {/* Project Logo */}
              {project.logo ? (
                <img 
                  src={project.logo} 
                  alt={project.name}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    objectFit: 'contain'
                  }}
                />
              ) : (
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                  color: 'white',
                  fontSize: '24px',
                  fontWeight: '700'
                }}>
                  {project.name.charAt(0)}
                </div>
              )}

              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#1f2937',
                marginBottom: '4px'
              }}>
                {project.name}
              </h3>
              <p style={{
                fontSize: '13px',
                color: '#6b7280',
                marginBottom: '8px'
              }}>
                {project.code}
              </p>
              <div style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '600',
                background: project.status === 'active' ? '#d1fae5' : '#fee2e2',
                color: project.status === 'active' ? '#065f46' : '#991b1b'
              }}>
                {project.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

##### **Task 1.1.3: Modify Main Login Component**

**File**: `frontend/src/components/Login.tsx`

Add after successful login (around line 256):

```typescript
// After storing auth data, check if user has multiple projects
const user = result.data.user;

if (user.projects && user.projects.length > 1) {
  // Show project selector
  navigate('/select-project', { 
    state: { projects: user.projects } 
  });
} else if (user.projects && user.projects.length === 1) {
  // Auto-select single project
  const project = user.projects[0];
  localStorage.setItem('projectContext', JSON.stringify({
    projectId: project._id,
    customUrlPath: project.portalUrl || project.code.toLowerCase()
  }));
  localStorage.setItem('viewMode', 'single');
  navigate(`/${project.portalUrl || project.code.toLowerCase()}/portal/dashboard`);
} else {
  // No project assignment - go to main dashboard
  localStorage.setItem('viewMode', 'unified');
  navigate('/dashboard');
}
```

---

### 1.2 Project Context Storage ✅ (Partially Complete)

#### Current State:
- ✅ ProjectSwitcher component created
- ✅ localStorage used for `projectContext`
- ⚠️ No viewMode tracking
- ⚠️ No recent/favorite projects
- ⚠️ No unified view implementation

#### Implementation Tasks:

##### **Task 1.2.1: Create Project Context Manager**

**File**: `frontend/src/contexts/ProjectContext.tsx` (NEW)

```typescript
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { API_CONFIG } from '../config/constants';

interface Project {
  _id: string;
  name: string;
  code: string;
  portalUrl?: string;
  logo?: string;
  status: string;
}

interface ProjectContextType {
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  viewMode: 'single' | 'unified';
  setViewMode: (mode: 'single' | 'unified') => void;
  userProjects: Project[];
  setUserProjects: (projects: Project[]) => void;
  recentProjects: string[];
  addRecentProject: (projectId: string) => void;
  favoriteProjects: string[];
  toggleFavorite: (projectId: string) => void;
  switchProject: (projectId: string) => void;
  getCurrentProject: () => Project | null;
  isProjectAccessible: (projectId: string) => boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    const context = localStorage.getItem('projectContext');
    return context ? JSON.parse(context).projectId : null;
  });

  const [viewMode, setViewMode] = useState<'single' | 'unified'>(() => {
    return (localStorage.getItem('viewMode') as 'single' | 'unified') || 'single';
  });

  const [userProjects, setUserProjects] = useState<Project[]>(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.projects || [];
    }
    return [];
  });

  const [recentProjects, setRecentProjects] = useState<string[]>(() => {
    const recent = localStorage.getItem('recentProjects');
    return recent ? JSON.parse(recent) : [];
  });

  const [favoriteProjects, setFavoriteProjects] = useState<string[]>(() => {
    const favorites = localStorage.getItem('favoriteProjects');
    return favorites ? JSON.parse(favorites) : [];
  });

  // Persist viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  // Persist currentProjectId to localStorage
  useEffect(() => {
    if (currentProjectId) {
      const project = userProjects.find(p => p._id === currentProjectId);
      if (project) {
        localStorage.setItem('projectContext', JSON.stringify({
          projectId: currentProjectId,
          customUrlPath: project.portalUrl || project.code.toLowerCase()
        }));
      }
    }
  }, [currentProjectId, userProjects]);

  const addRecentProject = (projectId: string) => {
    const newRecent = [projectId, ...recentProjects.filter(id => id !== projectId)]
      .slice(0, 5); // Keep last 5
    setRecentProjects(newRecent);
    localStorage.setItem('recentProjects', JSON.stringify(newRecent));
  };

  const toggleFavorite = (projectId: string) => {
    const newFavorites = favoriteProjects.includes(projectId)
      ? favoriteProjects.filter(id => id !== projectId)
      : [...favoriteProjects, projectId];
    setFavoriteProjects(newFavorites);
    localStorage.setItem('favoriteProjects', JSON.stringify(newFavorites));
  };

  const switchProject = (projectId: string) => {
    setCurrentProjectId(projectId);
    setViewMode('single');
    addRecentProject(projectId);
  };

  const getCurrentProject = (): Project | null => {
    return userProjects.find(p => p._id === currentProjectId) || null;
  };

  const isProjectAccessible = (projectId: string): boolean => {
    return userProjects.some(p => p._id === projectId);
  };

  return (
    <ProjectContext.Provider value={{
      currentProjectId,
      setCurrentProjectId,
      viewMode,
      setViewMode,
      userProjects,
      setUserProjects,
      recentProjects,
      addRecentProject,
      favoriteProjects,
      toggleFavorite,
      switchProject,
      getCurrentProject,
      isProjectAccessible
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within ProjectContextProvider');
  }
  return context;
};
```

##### **Task 1.2.2: Create Project Access Middleware**

**File**: `backend/src/middleware/projectAccess.ts` (Already created as `projectScope.ts`)

✅ Already implemented in Phase 0!

File exists: `backend/src/middleware/projectScope.ts`

Functions available:
- `requireProjectAccess(projectIdField?: string)`
- `canAccessProject(userId, projectId)`
- `getUserAccessibleProjects(userId)`

##### **Task 1.2.3: Update App.tsx to Include Context Provider**

**File**: `frontend/src/App.tsx`

Wrap the app with ProjectContextProvider:

```typescript
import { ProjectContextProvider } from './contexts/ProjectContext';

function App() {
  return (
    <Router>
      <PermissionProvider>
        <BrandingProvider>
          <ProjectContextProvider>
            {/* Existing routes */}
          </ProjectContextProvider>
        </BrandingProvider>
      </PermissionProvider>
    </Router>
  );
}
```

##### **Task 1.2.4: Add Project Selector Route**

**File**: `frontend/src/App.tsx`

Add route:

```typescript
import { ProjectSelector } from './components/ProjectSelector';

// In routes section:
<Route 
  path="/select-project" 
  element={<ProjectSelector 
    projects={/* from location.state */} 
    onProjectSelect={(projectId) => {
      // Handle project selection
      const project = projects.find(p => p._id === projectId);
      localStorage.setItem('projectContext', JSON.stringify({
        projectId: project._id,
        customUrlPath: project.portalUrl || project.code.toLowerCase()
      }));
      navigate(`/${project.portalUrl || project.code.toLowerCase()}/portal/dashboard`);
    }}
  />} 
/>
```

---

## Implementation Checklist - Phase 1

### Backend Tasks:
- [ ] Create `/api/auth/unified-login` endpoint
- [ ] Add project validation in existing auth endpoints
- [ ] Add `projectIds` to JWT token payload
- [x] Implement project access middleware (already done in `projectScope.ts`)
- [ ] Test token validation with multiple projects

### Frontend Tasks:
- [ ] Create `ProjectSelector.tsx` component
- [ ] Create `ProjectContext.tsx` context provider
- [ ] Update `Login.tsx` to handle multiple projects
- [ ] Update `App.tsx` to wrap with ProjectContextProvider
- [ ] Add `/select-project` route
- [x] Update `ProjectSwitcher.tsx` to use ProjectContext
- [ ] Implement favorites persistence
- [ ] Implement recent projects tracking

### Testing Tasks:
- [ ] Test login with single project (auto-redirect)
- [ ] Test login with multiple projects (show selector)
- [ ] Test login with no projects (main dashboard)
- [ ] Test project switching without logout
- [ ] Test favorite/unfavorite functionality
- [ ] Test recent projects list
- [ ] Verify token contains correct project IDs
- [ ] Test project access validation on API calls

---

## Database Schema Verification

### ✅ User Model (Complete)
**File**: `backend/src/models/User.ts`

```typescript
interface IUser {
  // Authentication
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  
  // Multi-Project Assignment
  projects?: ObjectId[];  // ✅ Array of project IDs user can access
  role: ObjectId;         // ✅ Single role per user
  centers?: ObjectId[];   // ✅ Centers for offline module
  
  // HRMS Integration
  hrmsId?: number;
  employeeCode?: string;
  department?: string;
  designation?: string;
  reportingManager?: ObjectId;
  
  // Status & Security
  isActive: boolean;
  lastLogin?: Date;
  tokenVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

**✅ No changes needed** - User model already supports multiple projects.

---

### ✅ Role Model (Complete)
**File**: `backend/src/models/Role.ts`

```typescript
interface IRole {
  name: string;
  code: string;
  description?: string;
  type: 'system' | 'custom';
  
  // Multi-Project Mapping
  projects?: ObjectId[];       // ✅ Role can be scoped to multiple projects
  permissions: ObjectId[];     // ✅ Permissions array
  
  // Agent Configuration
  isAgent: boolean;            // ✅ Flag for auto-assignment pool
  agentCount: number;
  
  // Status
  isActive: boolean;
  isMaster: boolean;
  masterRoleId?: ObjectId;
  
  createdAt: Date;
  updatedAt: Date;
}
```

**✅ No changes needed** - Role model supports multi-project mapping.

---

### ✅ Project Model (Complete - Rich Branding Support)
**File**: `backend/src/models/Project.ts`

```typescript
interface IProject {
  // Basic Info
  projectId: string;  // e.g., P001, P002
  name: string;
  code: string;       // Short code
  description?: string;
  
  // Branding Configuration ✅ (Perfect for UI!)
  branding?: {
    logo?: string;                    // ✅ Project logo URL
    colorTheme?: {
      primary?: string;               // ✅ Primary color for badges
      secondary?: string;
      accent?: string;
      background?: string;
    };
    headerText?: string;
    browserTitle?: string;
    footerText?: string;
    domainUrl?: string;
    favicon?: string;
    customUrlPath?: string;           // ✅ URL path (e.g., 'hubblehox')
  };
  
  // Module Configuration
  modules?: {
    tickets?: boolean;
    knowledgeBase?: boolean;
    reports?: boolean;
    assets?: boolean;
    userManagement?: boolean;
    // ... more modules
  };
  
  // Contact & Location
  address?: {
    city?: string;
    state?: string;
    country?: string;
  };
  contactInfo?: {
    phone?: string;
    email?: string;
  };
  region?: string;
  
  // Settings
  settings?: {
    defaultLanguage?: string;
    timezone?: string;
  };
  
  // Configuration
  configuration?: {
    maxUsers?: number;
    ticketNumberSettings?: { ... };
    ticketAssignmentSettings?: { ... };
  };
  
  // Status
  status: 'active' | 'inactive' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}
```

**✅ Perfect for Project Switcher!** The branding object has:
- `logo` - for project icon
- `colorTheme.primary` - for color indicator
- `customUrlPath` - for routing
- All metadata needed for rich UI

---

### 📊 Database Schema Summary

| Model | Field | Type | Purpose | Status |
|-------|-------|------|---------|--------|
| **User** | `projects` | `ObjectId[]` | Multi-project access | ✅ Ready |
| **User** | `role` | `ObjectId` | Single role per user | ✅ Ready |
| **Role** | `projects` | `ObjectId[]` | Project-scoped roles | ✅ Ready |
| **Role** | `permissions` | `ObjectId[]` | Permission mapping | ✅ Ready |
| **Project** | `branding.logo` | `string` | Project icon | ✅ Ready |
| **Project** | `branding.colorTheme` | `object` | Color indicators | ✅ Ready |
| **Project** | `branding.customUrlPath` | `string` | URL routing | ✅ Ready |
| **Project** | `status` | `string` | Active/Inactive | ✅ Ready |

**🎉 No database migrations needed!** All required fields already exist.

---

### 🆕 Optional: User Preferences Collection (Future Enhancement)

For storing user-specific preferences (favorites, recent projects, view mode):

```typescript
// backend/src/models/UserPreferences.ts (Optional - can use localStorage for now)
interface IUserPreferences {
  userId: ObjectId;
  favoriteProjects: ObjectId[];      // Starred projects
  recentProjects: ObjectId[];        // Last 5 accessed
  defaultViewMode: 'single' | 'unified';
  defaultProjectId?: ObjectId;       // Auto-select on login
  projectOrder?: ObjectId[];         // Custom project sorting
  
  createdAt: Date;
  updatedAt: Date;
}
```

**💡 Decision**: Start with `localStorage` for preferences (no database needed). Add UserPreferences model later if syncing across devices is required.

---

## Security Considerations

1. **Token Validation**
   - JWT must include `projectIds` array
   - Each API call validates if requested projectId is in user's accessible projects
   - Use `requireProjectAccess()` middleware on all project-scoped routes

2. **Session Management**
   - Store project context in localStorage (client-side)
   - Store project access list in JWT (server validates)
   - Clear project context on logout

3. **Data Isolation**
   - All queries must filter by `projectId`
   - Use `getUserAccessibleProjects()` for multi-project data aggregation
   - Never expose data from projects user doesn't have access to

---

## Next Steps (Phase 2 - Not Yet Implemented)

- Unified Dashboard showing aggregated metrics from all projects
- Project-specific data filtering in existing components
- Cross-project search functionality
- Project-wise ticket statistics
- Admin panel for managing user-project assignments

---

## Phase 2: UI Components Development

### 2.1 Header-Based Project Switcher Component 🎯

#### Requirements:
- **Location**: Fixed in top navigation header (next to user profile)
- **Dropdown trigger**: Current project name + icon
- **Search**: Filter projects by name/code
- **Sections**: Favorites → Recent → All Projects
- **Special Option**: "View All Projects" (unified mode)
- **Visual Indicators**: Project logo, color badge, role display
- **Responsive**: Works on desktop and mobile

#### Implementation:

##### **File**: `frontend/src/components/HeaderProjectSwitcher.tsx` (NEW)

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  MdBusiness, 
  MdExpandMore, 
  MdStar, 
  MdStarBorder, 
  MdHistory,
  MdSearch,
  MdViewModule,
  MdClose
} from 'react-icons/md';
import { useProjectContext } from '../contexts/ProjectContext';

interface Project {
  _id: string;
  name: string;
  code: string;
  branding?: {
    logo?: string;
    colorTheme?: {
      primary?: string;
    };
    customUrlPath?: string;
  };
  status: string;
}

export const HeaderProjectSwitcher: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentProjectId,
    viewMode,
    userProjects,
    recentProjects,
    favoriteProjects,
    toggleFavorite,
    switchProject,
    setViewMode,
    getCurrentProject
  } = useProjectContext();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get current project and user role
  const currentProject = getCurrentProject();
  const userRoleName = localStorage.getItem('userRoleName') || 'User';

  // Helper for translations
  const getText = (en: string, hi: string, mr: string): string => {
    if (i18n.language === 'hi') return hi;
    if (i18n.language === 'mr') return mr;
    return en;
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter projects by search
  const filteredProjects = userProjects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Organize projects into sections
  const favoriteProjectsList = filteredProjects.filter(p => favoriteProjects.includes(p._id));
  const recentProjectsList = filteredProjects.filter(p => 
    recentProjects.includes(p._id) && !favoriteProjects.includes(p._id)
  );
  const otherProjectsList = filteredProjects.filter(p => 
    !favoriteProjects.includes(p._id) && !recentProjects.includes(p._id)
  );

  const handleProjectSelect = (projectId: string) => {
    const project = userProjects.find(p => p._id === projectId);
    if (!project) return;

    switchProject(projectId);
    setIsOpen(false);
    setSearchQuery('');

    // Navigate to project portal
    const urlPath = project.branding?.customUrlPath || project.code.toLowerCase();
    const currentPath = location.pathname;
    const isInPortal = currentPath.includes('/portal/');
    
    if (isInPortal) {
      const routeAfterPortal = currentPath.split('/portal/')[1] || 'dashboard';
      navigate(`/${urlPath}/portal/${routeAfterPortal}`);
    } else {
      navigate(`/${urlPath}/portal/dashboard`);
    }
  };

  const handleUnifiedView = () => {
    setViewMode('unified');
    setIsOpen(false);
    setSearchQuery('');
    navigate('/dashboard');
  };

  // Don't render if user has no projects
  if (userProjects.length === 0) return null;

  // Render project item
  const renderProjectItem = (project: Project, showStar: boolean = true) => {
    const isFavorite = favoriteProjects.includes(project._id);
    const isRecent = recentProjects.includes(project._id);
    const isCurrent = currentProjectId === project._id;
    const primaryColor = project.branding?.colorTheme?.primary || '#667eea';

    return (
      <div
        key={project._id}
        onClick={() => handleProjectSelect(project._id)}
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
          borderRadius: '8px',
          backgroundColor: isCurrent ? '#f3f4f6' : 'transparent',
          position: 'relative',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => {
          if (!isCurrent) e.currentTarget.style.backgroundColor = '#f9fafb';
        }}
        onMouseLeave={(e) => {
          if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {/* Project Logo/Icon */}
        {project.branding?.logo ? (
          <img
            src={project.branding.logo}
            alt={project.name}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              objectFit: 'contain',
              flexShrink: 0
            }}
          />
        ) : (
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '16px',
              fontWeight: '700',
              flexShrink: 0
            }}
          >
            {project.name.charAt(0)}
          </div>
        )}

        {/* Project Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {project.name}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>{project.code}</span>
            {isRecent && !isFavorite && (
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '8px',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                fontWeight: '600'
              }}>
                {getText('Recent', 'हाल का', 'अलीकडील')}
              </span>
            )}
          </div>
        </div>

        {/* Favorite Star */}
        {showStar && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(project._id);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: isFavorite ? '#fbbf24' : '#d1d5db',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center'
            }}
            title={isFavorite 
              ? getText('Remove from favorites', 'पसंदीदा से हटाएं', 'आवडीतून काढा')
              : getText('Add to favorites', 'पसंदीदा में जोड़ें', 'आवडीमध्ये जोडा')
            }
          >
            {isFavorite ? <MdStar /> : <MdStarBorder />}
          </button>
        )}

        {/* Current indicator */}
        {isCurrent && (
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: primaryColor,
              flexShrink: 0
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          color: '#1f2937',
          transition: 'all 0.2s',
          outline: 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#d1d5db';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#e5e7eb';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Current Project Icon */}
        {viewMode === 'unified' ? (
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            <MdViewModule size={18} />
          </div>
        ) : currentProject?.branding?.logo ? (
          <img
            src={currentProject.branding.logo}
            alt={currentProject.name}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              objectFit: 'contain'
            }}
          />
        ) : (
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: `linear-gradient(135deg, ${currentProject?.branding?.colorTheme?.primary || '#667eea'} 0%, ${currentProject?.branding?.colorTheme?.primary || '#667eea'}dd 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '14px',
            fontWeight: '700'
          }}>
            {currentProject?.name.charAt(0) || 'P'}
          </div>
        )}

        {/* Project Name & Role */}
        <div style={{ textAlign: 'left' }}>
          <div style={{ 
            fontSize: '13px', 
            fontWeight: '600',
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {viewMode === 'unified' 
              ? getText('All Projects', 'सभी प्रकल्प', 'सर्व प्रकल्प')
              : currentProject?.name || getText('Select Project', 'प्रकल्प निवडा', 'प्रकल्प निवडा')
            }
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            {userRoleName}
          </div>
        </div>

        <MdExpandMore 
          size={20} 
          style={{ 
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
          }} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '380px',
            maxHeight: '600px',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#1f2937',
                margin: 0
              }}>
                {getText('Switch Project', 'प्रकल्प बदलें', 'प्रकल्प बदला')}
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#6b7280',
                  display: 'flex'
                }}
              >
                <MdClose size={20} />
              </button>
            </div>

            {/* Search Bar */}
            {userProjects.length > 3 && (
              <div style={{ position: 'relative' }}>
                <MdSearch
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af'
                  }}
                />
                <input
                  type="text"
                  placeholder={getText('Search projects...', 'प्रकल्प खोजें...', 'प्रकल्प शोधा...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
            )}
          </div>

          {/* Project List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px'
          }}>
            {/* Unified View Option */}
            {userProjects.length > 1 && (
              <>
                <div
                  onClick={handleUnifiedView}
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    border: '2px dashed #667eea',
                    marginBottom: '12px',
                    backgroundColor: viewMode === 'unified' ? '#f3f4f6' : 'transparent',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (viewMode !== 'unified') e.currentTarget.style.backgroundColor = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    if (viewMode !== 'unified') e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '20px'
                  }}>
                    <MdViewModule />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#667eea' }}>
                      {getText('View All Projects', 'सभी प्रकल्प देखें', 'सर्व प्रकल्प पहा')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {getText('Unified dashboard', 'एकीकृत डैशबोर्ड', 'एकत्रित डॅशबोर्ड')}
                    </div>
                  </div>
                  {viewMode === 'unified' && (
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#667eea'
                    }} />
                  )}
                </div>
                <div style={{
                  height: '1px',
                  background: '#e5e7eb',
                  margin: '8px 0'
                }} />
              </>
            )}

            {/* Favorites Section */}
            {favoriteProjectsList.length > 0 && (
              <>
                <div style={{
                  padding: '8px 16px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <MdStar size={14} color="#fbbf24" />
                  {getText('Favorites', 'पसंदीदा', 'आवडीचे')}
                </div>
                {favoriteProjectsList.map(project => renderProjectItem(project))}
                <div style={{
                  height: '1px',
                  background: '#e5e7eb',
                  margin: '8px 0'
                }} />
              </>
            )}

            {/* Recent Section */}
            {recentProjectsList.length > 0 && (
              <>
                <div style={{
                  padding: '8px 16px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <MdHistory size={14} />
                  {getText('Recent', 'हाल का', 'अलीकडील')}
                </div>
                {recentProjectsList.map(project => renderProjectItem(project))}
                <div style={{
                  height: '1px',
                  background: '#e5e7eb',
                  margin: '8px 0'
                }} />
              </>
            )}

            {/* All Projects Section */}
            {otherProjectsList.length > 0 && (
              <>
                <div style={{
                  padding: '8px 16px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {getText('All Projects', 'सभी प्रकल्प', 'सर्व प्रकल्प')}
                </div>
                {otherProjectsList.map(project => renderProjectItem(project))}
              </>
            )}

            {/* No Results */}
            {filteredProjects.length === 0 && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '13px'
              }}>
                {getText('No projects found', 'कोई प्रकल्प नहीं मिला', 'प्रकल्प सापडले नाहीत')}
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            fontSize: '12px',
            color: '#6b7280',
            textAlign: 'center'
          }}>
            {getText(
              `${userProjects.length} project${userProjects.length !== 1 ? 's' : ''} accessible`,
              `${userProjects.length} प्रकल्प उपलब्ध`,
              `${userProjects.length} प्रकल्प उपलब्ध`
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```

##### **Integration with DashboardLayout Header**

**File**: `frontend/src/components/DashboardLayout.tsx`

Add the HeaderProjectSwitcher to the header (around line 250-300):

```typescript
import { HeaderProjectSwitcher } from './HeaderProjectSwitcher';

// In the header section (around where user profile/logout button is):
<header style={{
  height: '64px',
  background: 'white',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 24px',
  position: 'sticky',
  top: 0,
  zIndex: 10
}}>
  {/* Left: Breadcrumbs or page title */}
  <div>...</div>
  
  {/* Right: Project Switcher, Notifications, User Menu */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
    {/* Project Switcher */}
    <HeaderProjectSwitcher />
    
    {/* Notifications Icon */}
    <button>🔔</button>
    
    {/* User Profile Dropdown */}
    <button>👤 {userName}</button>
  </div>
</header>
```

---

### 2.2 Enhanced Sidebar Project Switcher (Keep for Mobile)

The existing sidebar ProjectSwitcher can remain as a **secondary option** for mobile users or collapsed sidebar view. Update it to sync with HeaderProjectSwitcher via ProjectContext.

---

## Implementation Checklist - Phase 2.1

### Component Tasks:
- [ ] Create `HeaderProjectSwitcher.tsx` component
- [ ] Integrate into `DashboardLayout.tsx` header
- [ ] Ensure ProjectContext is used for state management
- [ ] Add search functionality
- [ ] Implement favorites toggle
- [ ] Implement recent projects tracking
- [ ] Add unified view option

### UI/UX Tasks:
- [ ] Project logos display correctly
- [ ] Color themes used for badges/indicators
- [ ] Smooth dropdown animations
- [ ] Click outside to close
- [ ] Keyboard navigation (ESC to close)
- [ ] Responsive design (mobile-friendly)
- [ ] Loading states for project list
- [ ] Empty states for no projects

### Testing Tasks:
- [ ] Test with 1 project (should still show switcher)
- [ ] Test with 5+ projects (search functionality)
- [ ] Test favorites persist across sessions
- [ ] Test recent projects update correctly
- [ ] Test switching between projects
- [ ] Test unified view mode
- [ ] Test with projects that have no logo
- [ ] Test with projects that have custom colors

---

### 2.2 View Mode Toggle Component ✅ (COMPLETE - Jan 22, 2026)

#### Status: IMPLEMENTED

**Component**: `frontend/src/components/ViewModeToggle.tsx`

#### Features Delivered:
- ✅ Toggle button with two modes: "Single Project" ⇄ "All Projects"
- ✅ Visual icons (MdViewDay for single, MdViewModule for unified)
- ✅ Updates `viewMode` in ProjectContext
- ✅ Dispatches custom event `viewModeChanged` for reactive components
- ✅ Only shows when user has 2+ projects
- ✅ Multi-language support (EN/HI/MR)
- ✅ Smooth animations and hover effects
- ✅ Accessible (ARIA labels, keyboard navigation)
- ✅ Integrated into DashboardLayout header

#### Usage:
```tsx
import { ViewModeToggle } from '../components/ViewModeToggle';

// Automatically shows in header (already integrated)
// Listen to mode changes:
useEffect(() => {
  const handleViewModeChange = (event: CustomEvent) => {
    if (event.detail.viewMode === 'unified') {
      fetchUnifiedData();
    } else {
      fetchSingleProjectData();
    }
  };
  window.addEventListener('viewModeChanged', handleViewModeChange);
  return () => window.removeEventListener('viewModeChanged', handleViewModeChange);
}, []);
```

**Documentation**: See [PHASE_2_VIEWMODE_AND_BADGES.md](./PHASE_2_VIEWMODE_AND_BADGES.md)

---

### 2.3 Project Indicator Badges Component ✅ (COMPLETE - Jan 22, 2026)

#### Status: IMPLEMENTED

**Component**: `frontend/src/components/ProjectBadge.tsx`

#### Features Delivered:
- ✅ Visual badge with project branding colors
- ✅ Shows full name or initials (configurable)
- ✅ Three sizes: small, medium, large
- ✅ Optional project logo display
- ✅ Hover tooltip with full project name
- ✅ Auto-generated consistent color if no branding
- ✅ Smart text color (black/white) based on brightness
- ✅ Interactive mode with hover effects
- ✅ ProjectBadgeList for multiple badges with overflow handling

#### Usage Examples:

**Basic Badge (Ticket List)**:
```tsx
import { ProjectBadge } from '../components/ProjectBadge';
import { useProjectContext } from '../contexts/ProjectContext';

function TicketList({ tickets }) {
  const { viewMode } = useProjectContext();
  
  return (
    <div>
      {tickets.map(ticket => (
        <div key={ticket.id}>
          {viewMode === 'unified' && (
            <ProjectBadge projectId={ticket.projectId} size="small" />
          )}
          <h3>{ticket.title}</h3>
        </div>
      ))}
    </div>
  );
}
```

**Badge List (User Projects)**:
```tsx
import { ProjectBadgeList } from '../components/ProjectBadge';

function UserProfile({ user }) {
  return (
    <div>
      <h2>{user.name}</h2>
      <ProjectBadgeList 
        projectIds={user.projectIds}
        maxVisible={3}
        size="small"
      />
    </div>
  );
}
```

**Use Cases**:
- ✅ Ticket list items (unified view)
- ✅ Search results
- ✅ Notifications
- ✅ Breadcrumbs
- ✅ Activity logs
- ✅ User profiles

**Documentation**: See [PHASE_2_VIEWMODE_AND_BADGES.md](./PHASE_2_VIEWMODE_AND_BADGES.md)

---

## Testing Tasks:
- [ ] Test with 1 project (should still show switcher)

**For existing users:**
1. Run migration script to ensure all users have `projects` array populated
2. Existing single-project users: auto-assign to their current project
3. Multi-project users: manually assign via admin panel or bulk script

**Migration Script** (to be created):
```javascript
// backend/scripts/migrate-user-projects.js
// Populate projects array for users who don't have it set
```

---

## Developer Notes

- **Current Implementation**: ProjectSwitcher component exists, showing dropdown in sidebar
- **Gap**: No project selector screen after login for multi-project users
- **Gap**: No unified view mode (all projects aggregated)
- **Gap**: No favorites/recent tracking UI (ProjectSwitcher has logic but not visible)
- **Recommendation**: Implement ProjectSelector component first for best UX

