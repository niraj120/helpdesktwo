# Project Switcher - Quick Start Guide

## What's New? 🎉

You now have a **beautiful header-based project switcher** that allows users mapped to multiple projects to seamlessly switch between them!

## Key Features

✨ **Header Dropdown** - Appears in the top-right corner of the dashboard  
⭐ **Favorites** - Star your frequently-used projects  
🕒 **Recent Projects** - Quick access to last 5 accessed projects  
🔍 **Search** - Filter projects by name (appears when 3+ projects)  
🌐 **Unified View** - View aggregated data from all projects  
🎨 **Project Branding** - Each project shows its logo and brand color  
🌍 **Multi-Language** - Works in English, Hindi, and Marathi

## How It Works

### For Users with Multiple Projects:

1. **Login** → Backend returns all accessible projects
2. **Select Project** → Choose initial project from selector
3. **Switch Projects** → Click dropdown in header to switch anytime
4. **Star Favorites** → Click star icon to mark frequently-used projects
5. **Search** → Type to filter projects (when you have 3+ projects)

### For Users with Single Project:

- Auto-navigates to your project portal
- No switcher needed

## Components Created

### 1. ProjectContext (`frontend/src/contexts/ProjectContext.tsx`)
**Purpose:** Manages project state globally

**What it tracks:**
- Current project ID
- View mode (single or unified)
- User's accessible projects
- Recent projects (last 5)
- Favorite projects

**Key functions:**
```typescript
const {
  currentProjectId,
  viewMode,
  userProjects,
  switchProject,
  toggleFavorite,
  getCurrentProject,
  isProjectAccessible
} = useProjectContext();
```

### 2. HeaderProjectSwitcher (`frontend/src/components/HeaderProjectSwitcher.tsx`)
**Purpose:** Beautiful dropdown UI for switching projects

**Features:**
- Trigger button shows current project
- Dropdown with sections:
  - Unified View option
  - Favorites (starred projects)
  - Recent (last 5 accessed)
  - All Projects (alphabetically sorted)
- Search bar (when 3+ projects)
- Project icons (logo or generated gradient)
- Current project indicator (colored dot)
- Star toggle for favorites

## Integration Points

### 1. Application Root (`main.tsx`)
```typescript
<BrandingProvider>
  <ProjectContextProvider>  {/* Added */}
    <App />
  </ProjectContextProvider>
</BrandingProvider>
```

### 2. Dashboard Layout (`DashboardLayout.tsx`)
```typescript
<header style={{ /* header styles */ }}>
  <HeaderProjectSwitcher />  {/* Added */}
</header>
```

## localStorage Keys

The following keys are stored in browser localStorage:

| Key | Description | Example |
|-----|-------------|---------|
| `projectContext` | Current project info | `{"projectId":"123","customUrlPath":"sac"}` |
| `viewMode` | Display mode | `"single"` or `"unified"` |
| `recentProjects` | Last 5 accessed | `["123","456","789"]` |
| `favoriteProjects` | Starred projects | `["123","456"]` |

## URL Structure

### Project Portal URLs:
```
/{customUrlPath}/portal/dashboard
/{customUrlPath}/portal/tickets
/{customUrlPath}/portal/assets
```

**Example:**
```
/sac/portal/dashboard  → SAC Project Dashboard
/nirf/portal/tickets   → NIRF Project Tickets
```

### Unified View URLs:
```
/dashboard  → Unified Dashboard (all projects)
```

## Testing the Implementation

### Step 1: Check Context Provider
```typescript
// In any component inside App:
import { useProjectContext } from '../contexts/ProjectContext';

const MyComponent = () => {
  const { userProjects, currentProjectId } = useProjectContext();
  console.log('Current Project:', currentProjectId);
  console.log('All Projects:', userProjects);
  return <div>...</div>;
};
```

### Step 2: Check localStorage
```javascript
// Open Browser DevTools > Console
localStorage.getItem('projectContext');
localStorage.getItem('recentProjects');
localStorage.getItem('favoriteProjects');
```

### Step 3: Test Dropdown
1. Login with a user that has multiple projects
2. Look for dropdown in top-right corner of dashboard
3. Click to open dropdown
4. Try:
   - Searching for projects (if 3+)
   - Starring a project
   - Switching to another project
   - Viewing unified dashboard

### Step 4: Test Project Switching
1. Select a project from dropdown
2. URL should change to `/{customUrlPath}/portal/...`
3. Page should reload
4. New project should be active

## Troubleshooting

### Problem: Dropdown not showing
**Solution:**
- Verify user is logged in
- Check localStorage for `projectContext`
- Verify user has multiple projects in token
- Check browser console for errors

### Problem: Projects not loading
**Solution:**
- Check network tab for API calls
- Verify JWT token contains `projectIds` array
- Check user document in database has `projects` array

### Problem: Favorites not persisting
**Solution:**
- Verify localStorage is enabled in browser
- Check for browser privacy settings blocking localStorage
- Clear localStorage and try again

### Problem: Search not working
**Solution:**
- Verify you have 3+ projects (search only appears then)
- Check `searchQuery` state in React DevTools
- Verify project names are strings

## Multi-Language Support

The component supports 3 languages:

| Language | Code | Display Name |
|----------|------|--------------|
| English | `en` | View All Projects |
| Hindi | `hi` | सभी परियोजनाएं देखें |
| Marathi | `mr` | सर्व प्रकल्प पहा |

**To add more languages:**
1. Add translations to `frontend/src/locales/{language}/translation.json`
2. Component will automatically pick them up via `useTranslation()`

## Next Steps (Optional Enhancements)

### Phase 3: Backend APIs
- [ ] Create unified login endpoint
- [ ] Create project selector API
- [ ] Create unified dashboard APIs

### Phase 4: Enhanced UI
- [ ] Add project descriptions in dropdown
- [ ] Add project member count
- [ ] Add last accessed timestamp
- [ ] Add project settings quick link

### Phase 5: Advanced Features
- [ ] Cross-device sync for favorites
- [ ] Project groups/categories
- [ ] Keyboard shortcuts (Cmd/Ctrl+K)
- [ ] Project search history
- [ ] Project analytics

## Code Examples

### Using ProjectContext in Your Components

```typescript
import { useProjectContext } from '../contexts/ProjectContext';

const MyComponent = () => {
  const {
    currentProjectId,
    userProjects,
    switchProject,
    toggleFavorite,
    getCurrentProject
  } = useProjectContext();

  const currentProject = getCurrentProject();

  const handleSwitch = (projectId: string) => {
    switchProject(projectId);
    // Component will re-render with new currentProjectId
  };

  const handleFavorite = (projectId: string) => {
    toggleFavorite(projectId);
    // favoriteProjects array will update
  };

  return (
    <div>
      <h1>Current Project: {currentProject?.name}</h1>
      <p>Total Projects: {userProjects.length}</p>
    </div>
  );
};
```

### Checking Project Access

```typescript
import { useProjectContext } from '../contexts/ProjectContext';

const ProjectSettings = () => {
  const { isProjectAccessible } = useProjectContext();
  const projectId = '507f1f77bcf86cd799439011';

  if (!isProjectAccessible(projectId)) {
    return <div>You don't have access to this project</div>;
  }

  return <div>Project Settings...</div>;
};
```

### Getting Project Branding

```typescript
import { useProjectContext } from '../contexts/ProjectContext';

const ProjectHeader = () => {
  const { getCurrentProject } = useProjectContext();
  const project = getCurrentProject();

  if (!project) return null;

  return (
    <div style={{ 
      backgroundColor: project.branding?.colorTheme?.primary || '#667eea' 
    }}>
      {project.branding?.logo && (
        <img src={project.branding.logo} alt={project.name} />
      )}
      <h1>{project.name}</h1>
    </div>
  );
};
```

## API Integration (Future)

### Expected User Object Format:
```typescript
{
  _id: "user123",
  name: "John Doe",
  email: "john@example.com",
  projects: [
    {
      _id: "project1",
      name: "SAC Helpdesk",
      customUrlPath: "sac",
      branding: {
        logo: "https://example.com/sac-logo.png",
        colorTheme: {
          primary: "#1e40af",
          secondary: "#3b82f6"
        }
      }
    },
    {
      _id: "project2",
      name: "NIRF Portal",
      customUrlPath: "nirf",
      branding: {
        logo: "https://example.com/nirf-logo.png",
        colorTheme: {
          primary: "#059669",
          secondary: "#10b981"
        }
      }
    }
  ]
}
```

### Expected JWT Token Payload:
```typescript
{
  userId: "user123",
  email: "john@example.com",
  projectIds: ["project1", "project2"],
  role: "Admin",
  iat: 1704067200,
  exp: 1735689600
}
```

## Support

For questions or issues:
1. Check browser console for errors
2. Check localStorage for correct values
3. Verify user has `projects` array in database
4. Check JWT token has `projectIds` array
5. Review [Full Implementation Guide](./PHASE_2_PROJECT_SWITCHER_IMPLEMENTATION.md)

## Summary

✅ **ProjectContext** - Manages project state globally  
✅ **HeaderProjectSwitcher** - Beautiful dropdown UI  
✅ **Integration** - Added to main.tsx and DashboardLayout  
✅ **Features** - Favorites, recent, search, unified view  
✅ **Multi-Language** - EN/HI/MR support  
✅ **Persistence** - localStorage for preferences  

🎉 **Ready to use!** Start testing with users who have multiple projects.

---

**Implementation Date:** January 2025  
**Status:** ✅ Complete and Ready for Testing
