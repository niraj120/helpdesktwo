# KB System - Smart Project Dropdown & Student Viewer Implementation

## Overview
Implemented smart project selection and student-specific KB viewer without project dropdown, based on permissions and user context.

---

## Changes Implemented

### 1. **Smart Project Dropdown Logic**

#### Behavior:
- **Single Project**: Auto-select, hide dropdown
- **Multiple Projects**: Show dropdown for user selection

#### Files Updated:

**a) KBLevelManagementPage.tsx**
- Auto-selects project if user has only one
- Hides dropdown when `projects.length === 1`
- Stores selection in localStorage for persistence

```tsx
// Auto-select if only one project
if (projectsArray.length === 1 && !selectedProjectId) {
  const singleProjectId = projectsArray[0]._id;
  setSelectedProjectId(singleProjectId);
  localStorage.setItem('selectedProjectId', singleProjectId);
}

// Only show dropdown if multiple projects
{projects.length > 1 && (
  <div style={{ marginBottom: '20px' }}>
    <select>...</select>
  </div>
)}
```

**b) KBArticleManagementPage.tsx**
- Same smart dropdown logic
- Auto-select for single project
- Conditional rendering of project selector

**c) KBTableManagementPage.tsx**
- Smart dropdown with session caching
- Auto-select single project on both cache hit and fresh fetch
- Improved performance with 5-minute cache

**d) KBViewerPage.tsx**
- Smart dropdown for project portal users
- Auto-select for single project users
- Maintains read-only/edit mode based on permissions

---

### 2. **Student-Specific KB Viewer**

#### New Component: `StudentKBViewerPage.tsx`

**Purpose**: Dedicated KB viewer for students without project dropdown

**Features**:
- Gets project from URL path (`/:customUrlPath/kb`)
- No project dropdown shown
- Pure read-only mode (`showControls={false}`)
- Cleaner UI for student experience
- Error handling for invalid project URLs

**Implementation**:
```tsx
const StudentKBViewerPage: React.FC = () => {
  const { customUrlPath } = useParams();
  const [projectId, setProjectId] = useState<string>('');
  
  // Fetch project by URL path
  useEffect(() => {
    if (customUrlPath) {
      fetchProjectByUrl(customUrlPath);
    }
  }, [customUrlPath]);

  return (
    <div>
      {/* No project dropdown - direct viewer */}
      <KnowledgeBaseViewer 
        projectId={projectId} 
        showControls={false}  // Read-only for students
      />
    </div>
  );
};
```

**Route Updated in App.tsx**:
```tsx
<Route 
  path="/:customUrlPath/kb" 
  element={
    <ProtectedRoute requireAuth={true}>
      <StudentLayout>
        <StudentKBViewerPage />  {/* Changed from KBViewerPage */}
      </StudentLayout>
    </ProtectedRoute>
  } 
/>
```

---

### 3. **KB Link on Submit Ticket Page**

#### Feature: Help Banner with KB Link

Added a prominent KB link banner on the submit ticket page:

**Location**: `AuthenticatedStudentSubmitTicket.tsx`

**Visual Design**:
```tsx
<Link to={`/${branding.customUrlPath}/kb`}>
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-3">
      <BookOpenIcon className="w-6 h-6 text-blue-600" />
      <div>
        <h3>Need help?</h3>
        <p>Check our Knowledge Base for quick answers</p>
      </div>
    </div>
    <span>View KB →</span>
  </div>
</Link>
```

**Benefits**:
- Encourages self-service before ticket submission
- Reduces ticket volume
- Better user experience
- Links to student KB viewer (no dropdown)

---

## User Experience Flow

### For Sub-Admin (e.g., Ankit with multiple projects):

1. **Navigate to KB Menu** → Clicks "Knowledge Base" in sidebar
2. **Submenu Expands** → Shows 4 items based on permissions:
   - Manage Levels (if has `KB_MANAGE` + `KB_MANAGE_LEVELS`)
   - Manage Articles (if has `KB_MANAGE` + `KB_MANAGE_ARTICLES`)
   - Manage Tables (if has `KB_MANAGE` + `KB_MANAGE_TABLES`)
   - View KB (if has `KB_VIEW_CONTENT` or any manage permissions)
3. **Select Submenu** → Clicks "Manage Levels"
4. **Project Dropdown** → Sees project dropdown with all assigned projects
5. **Select Project** → Chooses MHCET project
6. **Manage Levels** → Can create/edit/delete levels for selected project

### For Sub-Admin (with single project):

1. **Navigate to KB Menu** → Clicks "Knowledge Base"
2. **Submenu Expands** → Shows available items based on permissions
3. **Select Submenu** → Clicks "Manage Articles"
4. **Auto-Selected Project** → Page loads directly with their single project
5. **No Dropdown** → Clean interface, project already selected
6. **Manage Articles** → Start working immediately

### For Students:

1. **Access Submit Ticket Page** → Sees KB help banner at top
2. **Click "View KB"** → Links to `/:customUrlPath/kb`
3. **Direct KB Viewer** → No project dropdown, no options to change
4. **Read-Only Content** → Can view articles, levels, tables
5. **Clean Experience** → Focused on consuming information

---

## Permission-Based Menu Visibility

The KB submenu intelligently shows/hides items based on user permissions:

| Permission | Visible Menu Items |
|-----------|-------------------|
| **KB_VIEW_CONTENT only** | • View KB |
| **KB_MANAGE + KB_MANAGE_LEVELS** | • Manage Levels<br>• View KB |
| **KB_MANAGE + KB_MANAGE_ARTICLES** | • Manage Articles<br>• View KB |
| **KB_MANAGE + KB_MANAGE_TABLES** | • Manage Tables<br>• View KB |
| **All KB permissions** | • Manage Levels<br>• Manage Articles<br>• Manage Tables<br>• View KB |

**Implementation**:
Each submenu item in `menuConfig.tsx` has its own permission array:

```tsx
subItems: [
  {
    path: 'kb-new/levels',
    label: 'Manage Levels',
    permission: [PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_LEVELS],
    isProjectRoute: true,
  },
  {
    path: 'kb-new/viewer',
    label: 'View KB',
    permission: [PERMISSIONS.KB_VIEW_CONTENT, ...],
    isProjectRoute: true,
  },
]
```

The menu system automatically filters items based on user's permissions.

---

## Technical Implementation Details

### Auto-Select Logic Flow:

```typescript
const fetchProjects = async () => {
  // 1. Fetch user's projects
  const projectsArray = await fetchFromAPI();
  setProjects(projectsArray);
  
  // 2. Check if single project
  if (projectsArray.length === 1 && !selectedProjectId) {
    const singleProjectId = projectsArray[0]._id;
    
    // 3. Auto-select
    setSelectedProjectId(singleProjectId);
    
    // 4. Persist for session
    localStorage.setItem('selectedProjectId', singleProjectId);
  }
};
```

### Conditional Dropdown Rendering:

```tsx
{/* Only show if multiple projects */}
{projects.length > 1 && (
  <div>
    <select value={selectedProjectId} onChange={handleProjectChange}>
      {projects.map(project => (
        <option key={project._id} value={project._id}>
          {project.name}
        </option>
      ))}
    </select>
  </div>
)}

{/* Content always renders if project selected */}
{selectedProjectId ? (
  <KBComponent projectId={selectedProjectId} />
) : (
  <SelectProjectPrompt />
)}
```

### Student KB Viewer - Project Resolution:

```typescript
// Student route: /:customUrlPath/kb
const fetchProjectByUrl = async (urlPath: string) => {
  const response = await fetch(
    `${API_CONFIG.API_URL}/project/by-url/${urlPath}`
  );
  const data = await response.json();
  
  if (data.success) {
    setProjectId(data.data._id);
  }
};
```

---

## Files Modified

### Updated:
1. ✅ `frontend/src/pages/KBLevelManagementPage.tsx` - Smart dropdown
2. ✅ `frontend/src/pages/KBArticleManagementPage.tsx` - Smart dropdown
3. ✅ `frontend/src/pages/KBTableManagementPage.tsx` - Smart dropdown + cache
4. ✅ `frontend/src/pages/KBViewerPage.tsx` - Smart dropdown
5. ✅ `frontend/src/pages/AuthenticatedStudentSubmitTicket.tsx` - KB link banner
6. ✅ `frontend/src/App.tsx` - Student KB route

### Created:
1. ✅ `frontend/src/pages/StudentKBViewerPage.tsx` - New student viewer

---

## Testing Checklist

### For Sub-Admin with Multiple Projects:
- [ ] KB submenu shows only items matching permissions
- [ ] Project dropdown visible on all KB pages
- [ ] Can switch between projects
- [ ] Selection persists across page navigation
- [ ] Each submenu loads correct page component

### For Sub-Admin with Single Project:
- [ ] KB submenu shows only items matching permissions
- [ ] Project dropdown hidden
- [ ] Pages load directly with auto-selected project
- [ ] No "Select Project" prompts
- [ ] All KB management functions work

### For Students:
- [ ] Submit ticket page shows KB help banner
- [ ] Clicking "View KB" opens KB viewer
- [ ] No project dropdown visible
- [ ] KB content loads based on URL project
- [ ] Read-only mode (no edit/create options)
- [ ] Clean, simple interface

### General:
- [ ] No console errors
- [ ] Navigation smooth between pages
- [ ] Permission checks working correctly
- [ ] localStorage persisting selections
- [ ] Session cache working (5-minute TTL)

---

## Expected Behavior Summary

| User Type | Projects | KB Access | Project Dropdown | Edit Rights |
|-----------|----------|-----------|-----------------|-------------|
| **Sub-Admin** | Multiple | Full/Limited by permission | ✅ Shown | Based on permissions |
| **Sub-Admin** | Single | Full/Limited by permission | ❌ Hidden (Auto-select) | Based on permissions |
| **Student** | N/A | View only | ❌ Never shown | ❌ Read-only |

---

## Benefits

### User Experience:
- ✅ Cleaner interface for single-project users
- ✅ No unnecessary dropdowns
- ✅ Faster access to KB management
- ✅ Reduced cognitive load
- ✅ Permission-appropriate menu items

### Performance:
- ✅ Auto-selection reduces clicks
- ✅ Session caching reduces API calls
- ✅ Persistent localStorage for selections
- ✅ Optimized student viewer (lighter component)

### Maintainability:
- ✅ Clear separation: StudentKBViewerPage vs KBViewerPage
- ✅ Reusable smart dropdown logic
- ✅ Permission-based visibility in config
- ✅ Single source of truth for project selection

---

## Future Enhancements

1. **Favorites**: Allow users to mark favorite projects for quick access
2. **Recent Projects**: Show recently viewed projects dropdown
3. **Project Context**: Persist project context across all modules
4. **Breadcrumbs**: Show current project in breadcrumb navigation
5. **KB Analytics**: Track KB usage by project and user

---

**Date**: 2026-01-29  
**Status**: COMPLETE  
**Next Steps**: Test with real users (Ankit, students)
