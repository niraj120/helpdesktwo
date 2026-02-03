# Multi-Tenant Components - Quick Reference

## 🎯 Quick Import Guide

```tsx
// Context
import { useProjectContext } from '../contexts/ProjectContext';

// Components
import { HeaderProjectSwitcher } from '../components/HeaderProjectSwitcher';
import { ViewModeToggle } from '../components/ViewModeToggle';
import { ProjectBadge, ProjectBadgeList } from '../components/ProjectBadge';
```

---

## 📦 ProjectContext API

### State
```tsx
const {
  currentProjectId,      // string | null - Active project
  viewMode,              // 'single' | 'unified'
  userProjects,          // Project[] - All accessible projects
  recentProjects,        // string[] - Last 5 accessed
  favoriteProjects,      // string[] - Starred projects
} = useProjectContext();
```

### Functions
```tsx
const {
  switchProject,         // (projectId: string) => void
  toggleFavorite,        // (projectId: string) => void
  setViewMode,          // (mode: 'single' | 'unified') => void
  getCurrentProject,     // () => Project | undefined
  isProjectAccessible,   // (projectId: string) => boolean
  addRecentProject,     // (projectId: string) => void
} = useProjectContext();
```

---

## 🎨 ProjectBadge Component

### Props
```tsx
<ProjectBadge
  projectId="123"                    // Required
  size="small | medium | large"     // Default: medium
  variant="full | initials"         // Default: initials
  showLogo={false}                  // Default: false
  interactive={false}               // Default: false
  onClick={() => {}}                // Optional
  style={{}}                        // Optional
  className=""                      // Optional
/>
```

### Common Patterns

**Ticket List Item (Unified View)**:
```tsx
{viewMode === 'unified' && (
  <ProjectBadge projectId={ticket.projectId} size="small" />
)}
```

**Search Result**:
```tsx
<ProjectBadge 
  projectId={result.projectId} 
  size="small"
  style={{ marginRight: '8px' }}
/>
```

**Notification**:
```tsx
<ProjectBadge 
  projectId={notification.projectId} 
  size="small"
  style={{ float: 'right' }}
/>
```

**Breadcrumb (Interactive)**:
```tsx
<ProjectBadge 
  projectId={project.id}
  interactive={true}
  onClick={() => navigate(`/${project.customUrlPath}/portal/dashboard`)}
/>
```

---

## 📋 ProjectBadgeList Component

### Props
```tsx
<ProjectBadgeList
  projectIds={['id1', 'id2', 'id3']}  // Required
  maxVisible={3}                      // Default: 3
  size="small"                        // Default: small
  variant="initials"                  // Default: initials
  showLogos={false}                   // Default: false
/>
```

### Example
```tsx
// User with 5 projects, show first 3 + "+2"
<ProjectBadgeList 
  projectIds={user.projectIds}
  maxVisible={3}
  size="small"
/>
// Output: [SH] [NP] [AD] +2
```

---

## 🔄 ViewModeToggle Component

### Usage
```tsx
// Already integrated in DashboardLayout header
// No props needed, automatically shows when user has 2+ projects
<ViewModeToggle />
```

### Listen to Changes
```tsx
useEffect(() => {
  const handleModeChange = (event: CustomEvent) => {
    const mode = event.detail.viewMode; // 'single' or 'unified'
    
    if (mode === 'unified') {
      fetchAllProjectsData();
    } else {
      fetchCurrentProjectData();
    }
  };
  
  window.addEventListener('viewModeChanged', handleModeChange);
  return () => window.removeEventListener('viewModeChanged', handleModeChange);
}, []);
```

### Check Current Mode
```tsx
const { viewMode } = useProjectContext();

if (viewMode === 'unified') {
  // Show project badges, aggregated data
} else {
  // Show single project data
}
```

---

## 🎯 Common Use Cases

### 1. Ticket List (Conditional Badge)
```tsx
function TicketCard({ ticket }) {
  const { viewMode } = useProjectContext();
  
  return (
    <div className="ticket-card">
      {viewMode === 'unified' && (
        <ProjectBadge projectId={ticket.projectId} size="small" />
      )}
      <h3>{ticket.title}</h3>
      <p>{ticket.description}</p>
    </div>
  );
}
```

### 2. Data Fetching Based on Mode
```tsx
function Dashboard() {
  const { viewMode, currentProjectId } = useProjectContext();
  const [data, setData] = useState([]);
  
  useEffect(() => {
    const fetchData = async () => {
      if (viewMode === 'unified') {
        const response = await fetch('/api/tickets?viewMode=unified');
        setData(await response.json());
      } else {
        const response = await fetch(`/api/tickets?projectId=${currentProjectId}`);
        setData(await response.json());
      }
    };
    fetchData();
  }, [viewMode, currentProjectId]);
  
  return <TicketList tickets={data} />;
}
```

### 3. Project Switcher
```tsx
function QuickSwitcher() {
  const { userProjects, switchProject, currentProjectId } = useProjectContext();
  
  return (
    <select 
      value={currentProjectId || ''} 
      onChange={(e) => switchProject(e.target.value)}
    >
      {userProjects.map(project => (
        <option key={project._id} value={project._id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
```

### 4. Favorites Management
```tsx
function ProjectCard({ project }) {
  const { favoriteProjects, toggleFavorite } = useProjectContext();
  const isFavorite = favoriteProjects.includes(project._id);
  
  return (
    <div>
      <h3>{project.name}</h3>
      <button onClick={() => toggleFavorite(project._id)}>
        {isFavorite ? '⭐ Starred' : '☆ Star'}
      </button>
    </div>
  );
}
```

### 5. Project Access Check
```tsx
function ProjectSettings({ projectId }) {
  const { isProjectAccessible } = useProjectContext();
  
  if (!isProjectAccessible(projectId)) {
    return <div>Access Denied</div>;
  }
  
  return <div>Project Settings...</div>;
}
```

---

## 🎨 Badge Customization

### Size Comparison
```tsx
<ProjectBadge projectId="123" size="small" />   // 10px font
<ProjectBadge projectId="123" size="medium" />  // 11px font (default)
<ProjectBadge projectId="123" size="large" />   // 12px font
```

### Variant Comparison
```tsx
<ProjectBadge projectId="123" variant="initials" />  // "SH"
<ProjectBadge projectId="123" variant="full" />      // "SAC Helpdesk"
```

### With Logo
```tsx
<ProjectBadge 
  projectId="123" 
  variant="full"
  showLogo={true}
  size="large"
/>
// Output: [📷 Logo] SAC Helpdesk
```

### Custom Styling
```tsx
<ProjectBadge 
  projectId="123"
  style={{
    marginLeft: '8px',
    verticalAlign: 'middle',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  }}
  className="custom-badge"
/>
```

---

## 🔍 Debugging Tips

### Check Project Context
```tsx
const context = useProjectContext();
console.log('Current Project:', context.currentProjectId);
console.log('View Mode:', context.viewMode);
console.log('All Projects:', context.userProjects);
console.log('Favorites:', context.favoriteProjects);
console.log('Recent:', context.recentProjects);
```

### Check localStorage
```javascript
// Browser DevTools Console
console.log('Project Context:', localStorage.getItem('projectContext'));
console.log('View Mode:', localStorage.getItem('viewMode'));
console.log('Favorites:', localStorage.getItem('favoriteProjects'));
console.log('Recent:', localStorage.getItem('recentProjects'));
```

### Test Badge Colors
```tsx
// See what color a project ID generates
import { ProjectBadge } from '../components/ProjectBadge';

<ProjectBadge projectId="test-id-123" variant="full" />
// Will show consistent color based on hash of ID
```

---

## 🌐 Multi-Language Keys

### ViewModeToggle
```json
{
  "viewMode": {
    "label": "View mode",
    "single": "Single Project",
    "unified": "All Projects",
    "singleProject": "Single project view",
    "allProjects": "All projects view"
  }
}
```

**Hindi**:
```json
{
  "viewMode": {
    "label": "देखने का तरीका",
    "single": "एकल परियोजना",
    "unified": "सभी परियोजनाएं"
  }
}
```

**Marathi**:
```json
{
  "viewMode": {
    "label": "पाहण्याची पद्धत",
    "single": "एकच प्रकल्प",
    "unified": "सर्व प्रकल्प"
  }
}
```

---

## 📊 Component Decision Tree

```
User has multiple projects?
├─ YES → Show ViewModeToggle + HeaderProjectSwitcher
│   └─ User selects view mode
│       ├─ Single → Show current project only
│       │   └─ No project badges needed
│       └─ Unified → Show all projects
│           └─ Add ProjectBadge to each item
└─ NO → Hide ViewModeToggle
    └─ Only show HeaderProjectSwitcher (for consistency)
```

---

## ⚡ Performance Tips

1. **Conditional Rendering**: Only render badges when needed
   ```tsx
   {viewMode === 'unified' && <ProjectBadge projectId={id} />}
   ```

2. **Memoization**: Memoize expensive calculations
   ```tsx
   const currentProject = useMemo(() => getCurrentProject(), [currentProjectId]);
   ```

3. **Event Listeners**: Always clean up
   ```tsx
   useEffect(() => {
     const handler = () => { /* ... */ };
     window.addEventListener('viewModeChanged', handler);
     return () => window.removeEventListener('viewModeChanged', handler);
   }, []);
   ```

4. **Logo Loading**: Only load logos when showLogo=true
   ```tsx
   <ProjectBadge projectId={id} showLogo={viewMode === 'unified'} />
   ```

---

## 🐛 Common Issues & Solutions

### Issue: Badge shows "??"
**Cause**: Project not found in userProjects array  
**Solution**: Verify user has access to that project
```tsx
const { isProjectAccessible } = useProjectContext();
if (isProjectAccessible(projectId)) {
  <ProjectBadge projectId={projectId} />
}
```

### Issue: ViewModeToggle not showing
**Cause**: User has only 1 project  
**Solution**: Component automatically hides for single-project users (expected behavior)

### Issue: Mode changes not reflecting
**Cause**: Not listening to viewModeChanged event  
**Solution**: Add event listener or check viewMode from context
```tsx
const { viewMode } = useProjectContext();
// OR
useEffect(() => {
  window.addEventListener('viewModeChanged', handler);
}, []);
```

### Issue: Favorites not persisting
**Cause**: localStorage blocked or disabled  
**Solution**: Check browser settings, verify localStorage API available
```tsx
if (typeof window !== 'undefined' && window.localStorage) {
  // localStorage available
}
```

---

## 📚 Documentation Links

- **Full Implementation**: [UNIFIED_PROJECT_PORTAL_IMPLEMENTATION.md](./UNIFIED_PROJECT_PORTAL_IMPLEMENTATION.md)
- **Phase 2 Details**: [PHASE_2_PROJECT_SWITCHER_IMPLEMENTATION.md](./PHASE_2_PROJECT_SWITCHER_IMPLEMENTATION.md)
- **ViewMode & Badges**: [PHASE_2_VIEWMODE_AND_BADGES.md](./PHASE_2_VIEWMODE_AND_BADGES.md)
- **Quick Start**: [PROJECT_SWITCHER_QUICK_START.md](./PROJECT_SWITCHER_QUICK_START.md)

---

**Last Updated**: January 22, 2026  
**Version**: 1.1.0
