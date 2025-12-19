# Knowledge Base Hierarchical Structure Implementation

## Overview
Implemented a 3-level hierarchical Knowledge Base system with PDF upload support for Super Admin panel.

## Structure
```
Category (1st Level)
  └── Subcategory (2nd Level)
      └── Article (KB Content)
          ├── HTML Content (Rich Text Editor)
          └── OR PDF Upload (File with Viewer)
```

## Backend Implementation

### 1. Database Models

#### KBCategory.ts (1st Level)
- **Location**: `backend/src/models/KBCategory.ts`
- **Fields**:
  - `projectId` (required)
  - `name` (required, unique per project)
  - `description`
  - `icon`
  - `displayOrder` (for sorting)
  - `isActive` (soft delete flag)
  - `createdBy`
  - Timestamps (createdAt, updatedAt)

#### KBSubcategory.ts (2nd Level)
- **Location**: `backend/src/models/KBSubcategory.ts`
- **Fields**:
  - `projectId` (required)
  - `categoryId` (required, ref to KBCategory)
  - `name` (required, unique per category)
  - `description`
  - `displayOrder`
  - `isActive`
  - `createdBy`
  - Timestamps

#### KnowledgeBaseArticle.ts (Updated)
- **Location**: `backend/src/models/KnowledgeBaseArticle.ts`
- **New Fields Added**:
  - `categoryId` (ref to KBCategory) - required
  - `subcategoryId` (ref to KBSubcategory) - required
  - `contentType` (enum: 'html' | 'pdf') - default 'html'
  - `pdfUrl` (string, optional)
  - `pdfFileName` (string, optional)
  - `content` (now optional, required only for HTML type)
- **Backward Compatibility**: Old `category` field retained

### 2. Controllers

#### kbCategoryController.ts
- **Location**: `backend/src/controllers/kbCategoryController.ts`
- **Functions**:
  - `createKBCategory` - Create 1st level category
  - `getKBCategories` - List all categories for project (sorted by displayOrder)
  - `updateKBCategory` - Update category details
  - `deleteKBCategory` - Soft delete (validates no active subcategories exist)

#### kbSubcategoryController.ts
- **Location**: `backend/src/controllers/kbSubcategoryController.ts`
- **Functions**:
  - `createKBSubcategory` - Create 2nd level subcategory
  - `getKBSubcategories` - List subcategories for specific category
  - `getKBSubcategoriesByProject` - List all subcategories for project
  - `updateKBSubcategory` - Update subcategory details
  - `deleteKBSubcategory` - Soft delete (validates no active articles exist)

#### kbPdfUploadController.ts (NEW)
- **Location**: `backend/src/controllers/kbPdfUploadController.ts`
- **Functions**:
  - `uploadKBPdf` - Handle PDF file upload (max 50MB)
  - `deleteKBPdf` - Delete PDF file from server
- **Features**:
  - Uses multer for file handling
  - Sanitizes filenames
  - Stores in `uploads/kb-pdfs/` directory
  - Returns file URL for database storage

#### knowledgeBaseController.ts (Updated)
- **Location**: `backend/src/controllers/knowledgeBaseController.ts`
- **Updated Functions**:
  - `createArticle` - Now supports categoryId, subcategoryId, contentType, pdfUrl, pdfFileName
  - `updateArticle` - Now supports updating all new fields
- **Validation**:
  - Requires pdfUrl for PDF content type
  - Requires content for HTML content type

### 3. Routes

#### upload.ts (NEW)
- **Location**: `backend/src/routes/upload.ts`
- **Routes**:
  - `POST /api/upload/kb-pdf` - Upload PDF (requires KB_CREATE permission)
  - `DELETE /api/upload/kb-pdf/:filename` - Delete PDF (requires KB_DELETE permission)

#### knowledgeBase.ts (Updated)
- **Location**: `backend/src/routes/knowledgeBase.ts`
- **New Routes Added**:
  - `POST /api/knowledge-base/categories` - Create category (KB_CREATE)
  - `GET /api/knowledge-base/categories/project/:projectId` - List categories
  - `PUT /api/knowledge-base/categories/:id` - Update category (KB_EDIT)
  - `DELETE /api/knowledge-base/categories/:id` - Delete category (KB_DELETE)
  - `POST /api/knowledge-base/subcategories` - Create subcategory (KB_CREATE)
  - `GET /api/knowledge-base/subcategories/category/:categoryId` - List by category
  - `GET /api/knowledge-base/subcategories/project/:projectId` - List all subcategories
  - `PUT /api/knowledge-base/subcategories/:id` - Update subcategory (KB_EDIT)
  - `DELETE /api/knowledge-base/subcategories/:id` - Delete subcategory (KB_DELETE)

#### server.ts (Updated)
- **Location**: `backend/src/server.ts`
- **Changes**:
  - Added `import uploadRoutes from './routes/upload'`
  - Added `app.use('/api/upload', uploadRoutes)`
  - Added duplicate route `app.use('/api/knowledge-base', knowledgeBaseRoutes)` for clarity

## Frontend Implementation

### 1. Components

#### KBHierarchyManagement.tsx (NEW)
- **Location**: `frontend/src/components/KBHierarchyManagement.tsx`
- **Purpose**: Super Admin UI for managing Categories and Subcategories
- **Features**:
  - Tree view with expandable categories
  - Create/Edit/Delete categories (1st level)
  - Create/Edit/Delete subcategories (2nd level)
  - Modal forms for CRUD operations
  - Display order management
  - Orphan prevention validation (can't delete category with subcategories)
  - Icons: Folder icon for categories, Document icon for subcategories
- **Usage**: Import and use in Super Admin Knowledge Base module

#### KBArticleEditor.tsx (NEW)
- **Location**: `frontend/src/components/KBArticleEditor.tsx`
- **Purpose**: Unified article creation/editing form with hierarchy and PDF support
- **Features**:
  - Category dropdown (1st level)
  - Subcategory dropdown (2nd level) - auto-populates when category selected
  - Content type toggle: HTML vs PDF
  - Conditional rendering:
    - HTML: Rich text editor (ReactQuill)
    - PDF: File upload with drag-drop area
  - Tag management (add/remove tags)
  - Status selection (Draft/Published/Archived)
  - Display order input
  - Validation: Ensures category/subcategory selected, content provided based on type
  - Shows uploaded PDF filename with remove option
- **Usage**: Replace existing article form or integrate into KnowledgeBaseManagement component

#### PDFViewer.tsx (NEW)
- **Location**: `frontend/src/components/PDFViewer.tsx`
- **Purpose**: Display PDF articles in user-facing portal
- **Features**:
  - Embedded PDF viewer (iframe)
  - Download button
  - Fallback message for unsupported browsers
  - Responsive layout
  - Header with title and filename
- **Usage**: Use in article detail page when `contentType === 'pdf'`

### 2. Integration Points

#### In Super Admin Panel (Knowledge Base Module)

**Option 1: Separate Pages**
```tsx
// Create hierarchy management page
import KBHierarchyManagement from '../components/KBHierarchyManagement';

function KBHierarchyPage() {
  return <KBHierarchyManagement />;
}

// Use KBArticleEditor in existing article management
import KBArticleEditor from '../components/KBArticleEditor';

// In your article list component:
const [showEditor, setShowEditor] = useState(false);
const [editingArticle, setEditingArticle] = useState(null);

{showEditor && (
  <KBArticleEditor
    article={editingArticle}
    onSave={() => {
      setShowEditor(false);
      fetchArticles(); // Refresh list
    }}
    onCancel={() => setShowEditor(false)}
  />
)}
```

**Option 2: Tabbed Interface**
```tsx
// Add tabs to existing KnowledgeBaseManagement component
const [activeTab, setActiveTab] = useState('articles');

<div className="tabs">
  <button onClick={() => setActiveTab('hierarchy')}>Hierarchy</button>
  <button onClick={() => setActiveTab('articles')}>Articles</button>
  <button onClick={() => setActiveTab('settings')}>Settings</button>
</div>

{activeTab === 'hierarchy' && <KBHierarchyManagement />}
{activeTab === 'articles' && <ArticleList />}
{activeTab === 'settings' && <KBSettings />}
```

#### In User Portal (Article View)

```tsx
import PDFViewer from '../components/PDFViewer';

function ArticleDetail({ article }) {
  return (
    <div>
      <h1>{article.title}</h1>
      
      {article.contentType === 'pdf' ? (
        <PDFViewer
          pdfUrl={article.pdfUrl}
          fileName={article.pdfFileName}
          title={article.title}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: article.content }} />
      )}
    </div>
  );
}
```

## API Endpoints Summary

### Category Management
- `POST /api/knowledge-base/categories` - Create category
- `GET /api/knowledge-base/categories/project/:projectId` - List categories
- `PUT /api/knowledge-base/categories/:id` - Update category
- `DELETE /api/knowledge-base/categories/:id` - Delete category

### Subcategory Management
- `POST /api/knowledge-base/subcategories` - Create subcategory
- `GET /api/knowledge-base/subcategories/category/:categoryId` - List by category
- `GET /api/knowledge-base/subcategories/project/:projectId` - List all
- `PUT /api/knowledge-base/subcategories/:id` - Update subcategory
- `DELETE /api/knowledge-base/subcategories/:id` - Delete subcategory

### Article Management (Existing, Updated)
- `POST /api/kb` - Create article (now with categoryId, subcategoryId, contentType, pdfUrl)
- `PUT /api/kb/:id` - Update article (now supports new fields)
- `GET /api/kb/project/:projectId` - List articles
- `GET /api/kb/:id` - Get single article
- `DELETE /api/kb/:id` - Delete article

### File Upload
- `POST /api/upload/kb-pdf` - Upload PDF file
- `DELETE /api/upload/kb-pdf/:filename` - Delete PDF file

## Workflow

### Creating a KB Article (Super Admin)

1. **Create Category** (if not exists)
   - Go to KB Hierarchy Management
   - Click "Add Category (1st Level)"
   - Fill name, description, display order
   - Save

2. **Create Subcategory** (if not exists)
   - Expand the category
   - Click "+" icon to add subcategory
   - Fill name, description, display order
   - Save

3. **Create Article**
   - Go to Articles section
   - Click "Create Article"
   - Select Category (1st level dropdown)
   - Select Subcategory (2nd level dropdown - auto-populated)
   - Choose Content Type:
     - **HTML**: Use rich text editor to write content
     - **PDF**: Upload PDF file (max 50MB)
   - Add tags (optional)
   - Set status (Draft/Published/Archived)
   - Set display order
   - Save

### Viewing Article (User Portal)

1. User browses KB categories/subcategories
2. Clicks on article
3. System checks `contentType`:
   - If `html`: Renders HTML content with formatting
   - If `pdf`: Shows PDF viewer with download option

## Database Relationships

```
Project (1) ----< (N) KBCategory
KBCategory (1) ----< (N) KBSubcategory
KBSubcategory (1) ----< (N) KnowledgeBaseArticle
User (1) ----< (N) KnowledgeBaseArticle (author)
```

## File Storage

- **Upload Directory**: `backend/uploads/kb-pdfs/`
- **Filename Format**: `{timestamp}-{random}-{sanitized-original-name}.pdf`
- **Max File Size**: 50MB
- **Allowed Format**: PDF only
- **URL Format**: `/uploads/kb-pdfs/{filename}`

## Permissions Required

- `KB_CREATE` - Create categories, subcategories, articles, upload PDFs
- `KB_EDIT` - Edit categories, subcategories, articles
- `KB_DELETE` - Delete categories, subcategories, articles, PDFs
- `KB_VIEW` - View KB articles (typically all users have this)

## Features Implemented

✅ 3-level hierarchical structure (Category → Subcategory → Article)
✅ Soft delete with orphan prevention
✅ Display order for sorting
✅ PDF upload with 50MB limit
✅ PDF viewer component
✅ HTML rich text editor
✅ Content type switching (HTML vs PDF)
✅ Permission-based access control
✅ Expandable/collapsible tree view
✅ Modal-based CRUD forms
✅ Tag management
✅ Status management (Draft/Published/Archived)
✅ Backward compatibility with old category field
✅ Populated references in responses
✅ File cleanup on errors

## Next Steps

1. **Integrate Components**: Add KBHierarchyManagement to Super Admin sidebar menu
2. **Update Article List**: Replace old article form with KBArticleEditor
3. **User Portal**: Implement PDFViewer in article detail page
4. **Testing**: Test complete workflow (create category → subcategory → article)
5. **Validation**: Test orphan prevention (try deleting category with subcategories)
6. **PDF Upload**: Test PDF upload, view, and download
7. **File Serving**: Ensure `uploads` directory is served statically by Express
8. **Navigation**: Update KB browsing to show hierarchy (breadcrumbs)

## Configuration

### Express Static File Serving

Add to `server.ts` if not already present:

```typescript
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
```

### Frontend API Config

Ensure `API_CONFIG.API_URL` is set correctly in `frontend/src/config/api.ts`:

```typescript
export const API_CONFIG = {
  API_URL: 'http://localhost:3003/api',
  // or
  API_URL: process.env.REACT_APP_API_URL || 'http://localhost:3003/api'
};
```

## Troubleshooting

### PDF Not Displaying
- Check if uploads directory exists
- Verify file was actually uploaded (check `uploads/kb-pdfs/` folder)
- Ensure Express is serving static files from `/uploads`
- Check browser console for CORS errors
- Verify PDF URL in database is correct

### Cannot Delete Category
- Check if subcategories exist under it (soft delete validation)
- Check console for error messages
- Verify user has KB_DELETE permission

### PDF Upload Fails
- Check file size (max 50MB)
- Verify file is actually PDF format
- Check backend logs for multer errors
- Ensure `uploads/kb-pdfs/` directory has write permissions

### Subcategory Dropdown Not Populating
- Check if categoryId is being passed correctly
- Verify API endpoint returns subcategories
- Check browser console for API errors
- Ensure subcategories exist for selected category

## Security Considerations

- ✅ Permission checks on all routes
- ✅ File type validation (PDF only)
- ✅ File size limits (50MB)
- ✅ Filename sanitization
- ✅ JWT authentication required
- ✅ Project isolation (can only access own project's KB)

## Performance Optimization

- Indexes on `projectId`, `categoryId`, `isActive` fields
- Soft delete (faster than hard delete)
- Populated references only when needed
- Display order sorting at database level
- Lazy loading of subcategories (only when category expanded)

## Future Enhancements (Optional)

- [ ] Drag-and-drop for display order
- [ ] Bulk operations (delete multiple, reorder)
- [ ] Article duplication/cloning
- [ ] Version history for articles
- [ ] Search within hierarchy
- [ ] Category icons upload
- [ ] Breadcrumb navigation
- [ ] Analytics (most viewed categories/articles)
- [ ] Export KB to PDF/JSON
- [ ] Import from existing KB systems
