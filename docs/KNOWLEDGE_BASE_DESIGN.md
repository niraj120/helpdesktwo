# Knowledge Base - Feature Design Document

## Document Overview
**Feature:** Knowledge Base Management System  
**Project:** SAC Helpdesk  
**Last Updated:** January 19, 2026  
**Status:** Design Phase

---

## Table of Contents
1. [Feature Overview](#feature-overview)
2. [Level Master Management](#level-master-management)
3. [Knowledge Base Articles Management](#knowledge-base-articles-management)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Frontend Components](#frontend-components)
7. [S3 Bucket Integration](#s3-bucket-integration)
8. [User Interface Mockup](#user-interface-mockup)

---

## Feature Overview

### Purpose
Create a hierarchical Knowledge Base system where Super Admins can:
- Define multiple levels that appear as tabs to project users
- Create knowledge base articles with rich content
- Upload PDF documents stored in Google Cloud Storage
- Schedule article visibility
- Map articles to specific levels

### User Roles
- **Super Admin**: Create/Edit/Delete levels and KB articles
- **Project Users**: View KB articles organized by tabs (levels)

---

## Level Master Management

### 1.1 Create KB Levels

**Purpose:** Define levels that will appear as tabs for end users

**Fields:**
- **Level Name** (Required): Name of the level/tab (e.g., "Getting Started", "User Guide", "FAQs", "Troubleshooting")
- **Level Order** (Required): Display order/sequence (1, 2, 3...)
- **Level Icon** (Optional): Icon for the tab
- **Status** (Required): Active/Inactive toggle
- **Project Mapping** (Required): Which projects this level applies to
- **Description** (Optional): Internal description of the level purpose
- **Created By**: Auto-populated
- **Created At**: Auto-populated
- **Updated By**: Auto-populated
- **Updated At**: Auto-populated

**Business Rules:**
- Levels can be created in unlimited numbers (n levels)
- Level Order determines tab display sequence
- Only Active levels appear to end users
- Multiple projects can share the same level structure
- Levels can be reordered via drag-and-drop

**Example Levels:**
```
Level 1: Getting Started (Order: 1)
Level 2: User Guides (Order: 2)
Level 3: FAQs (Order: 3)
Level 4: Troubleshooting (Order: 4)
Level 5: Video Tutorials (Order: 5)
```

---

## Knowledge Base Articles Management

### 2.1 Create/Edit KB Articles

**Form Fields:**

#### Basic Information
- **Document Name** (Required)
  - Type: Text input
  - Max Length: 200 characters
  - Example: "How to Submit a Ticket"

- **Document Type** (Required)
  - Type: Dropdown
  - Options:
    - PDF Document
    - HTML Article
    - PDF + HTML (Both)
  - Default: HTML Article

- **Project** (Required)
  - Type: Dropdown
  - Source: All projects
  - Multi-select: Yes (can be assigned to multiple projects)

#### Content Section

**Option A: PDF Upload**
- **Upload PDF** (Required if Document Type includes PDF)
  - Type: File upload
  - Accepted Format: .pdf
  - Max Size: 10 MB
  - Storage: Google Cloud Storage bucket
  - Bucket URL: `gs://helpdesk-knowledge-base/`
  - Access Control: niraj.mishra@hubblehox.com
  - File Naming Convention: `{projectCode}_{timestamp}_{sanitizedFileName}.pdf`
  - Display: PDF viewer embedded in frontend

**Option B: HTML Content**
- **HTML Content** (Required if Document Type includes HTML)
  - Type: Rich Text Editor (e.g., Quill, TinyMCE, CKEditor)
  - Features:
    - Text formatting (bold, italic, underline, strikethrough)
    - Headings (H1-H6)
    - Lists (ordered, unordered)
    - Links
    - Images (upload to S3)
    - Code blocks
    - Tables
    - Blockquotes
    - Text alignment
    - Colors
  - Max Length: No limit (stored in database or S3 as HTML)

#### Scheduling Section
- **Publish Type** (Required)
  - Type: Radio buttons
  - Options:
    - Publish Immediately
    - Schedule for Later
  - Default: Publish Immediately

- **Scheduled Publish Date** (Required if "Schedule for Later")
  - Type: Date-time picker
  - Format: YYYY-MM-DD HH:MM
  - Validation: Cannot be in the past
  - Timezone: Server timezone or user preference

- **Scheduled Unpublish Date** (Optional)
  - Type: Date-time picker
  - Format: YYYY-MM-DD HH:MM
  - Use Case: Temporary articles, seasonal content
  - Auto-behavior: Article automatically becomes inactive after this date

#### Level Mapping Section
- **Map to Levels** (Required)
  - Type: Multi-select dropdown with checkboxes
  - Source: All active levels for selected project(s)
  - Validation: At least one level must be selected
  - Display: Articles appear in all selected level tabs
  - Example:
    ```
    ☑ Getting Started
    ☑ FAQs
    ☐ Troubleshooting
    ☐ Video Tutorials
    ```

#### Additional Settings
- **Tags** (Optional)
  - Type: Tag input (comma-separated or chip-based)
  - Use Case: Search and filtering
  - Example: "ticket, submission, workflow"

- **Author** (Optional)
  - Type: Text input
  - Default: Current user's name
  - Example: "Niraj Mishra"

- **Status** (Required)
  - Type: Toggle
  - Options: Active/Inactive
  - Default: Active
  - Note: Even if Active, scheduled articles won't show until publish date

- **Featured** (Optional)
  - Type: Checkbox
  - Use Case: Highlight important articles at top of list
  - Display: Featured articles appear first with special badge

- **Order** (Optional)
  - Type: Number input
  - Use Case: Manual sorting within a level
  - Default: Auto-incremented

---

## Database Schema

### Table: `kb_levels`
```sql
CREATE TABLE kb_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level_name VARCHAR(100) NOT NULL,
  level_order INTEGER NOT NULL,
  level_icon VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active', -- 'active' | 'inactive'
  description TEXT,
  project_ids TEXT[], -- Array of project IDs
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(level_name, project_ids) -- Prevent duplicate level names per project
);

CREATE INDEX idx_kb_levels_status ON kb_levels(status);
CREATE INDEX idx_kb_levels_order ON kb_levels(level_order);
CREATE INDEX idx_kb_levels_projects ON kb_levels USING GIN(project_ids);
```

### Table: `kb_articles`
```sql
CREATE TABLE kb_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_name VARCHAR(200) NOT NULL,
  document_type VARCHAR(20) NOT NULL, -- 'pdf' | 'html' | 'both'
  project_ids TEXT[], -- Array of project IDs
  
  -- PDF fields
  pdf_url TEXT, -- S3 URL
  pdf_filename VARCHAR(255),
  pdf_size INTEGER, -- in bytes
  
  -- HTML fields
  html_content TEXT,
  
  -- Scheduling
  publish_type VARCHAR(20) DEFAULT 'immediate', -- 'immediate' | 'scheduled'
  scheduled_publish_date TIMESTAMP,
  scheduled_unpublish_date TIMESTAMP,
  
  -- Metadata
  tags TEXT[], -- Array of tags
  author VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active', -- 'active' | 'inactive'
  is_featured BOOLEAN DEFAULT false,
  display_order INTEGER,
  views_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP, -- Actual publish timestamp
  
  -- Search
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(document_name, '') || ' ' || coalesce(html_content, '') || ' ' || coalesce(array_to_string(tags, ' '), ''))
  ) STORED
);

CREATE INDEX idx_kb_articles_status ON kb_articles(status);
CREATE INDEX idx_kb_articles_projects ON kb_articles USING GIN(project_ids);
CREATE INDEX idx_kb_articles_publish_date ON kb_articles(scheduled_publish_date);
CREATE INDEX idx_kb_articles_featured ON kb_articles(is_featured) WHERE is_featured = true;
CREATE INDEX idx_kb_articles_search ON kb_articles USING GIN(search_vector);
```

### Table: `kb_article_level_mapping`
```sql
CREATE TABLE kb_article_level_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
  level_id UUID REFERENCES kb_levels(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(article_id, level_id) -- Prevent duplicate mappings
);

CREATE INDEX idx_article_level_article ON kb_article_level_mapping(article_id);
CREATE INDEX idx_article_level_level ON kb_article_level_mapping(level_id);
```

---

## API Endpoints

### KB Levels Management

#### 1. Create Level
```http
POST /api/kb/levels
Authorization: Bearer {token}
Content-Type: application/json

{
  "levelName": "Getting Started",
  "levelOrder": 1,
  "levelIcon": "PlayCircle",
  "status": "active",
  "projectIds": ["proj-uuid-1", "proj-uuid-2"],
  "description": "Beginner guides and tutorials"
}

Response: 201 Created
{
  "success": true,
  "message": "Level created successfully",
  "data": {
    "id": "level-uuid",
    "levelName": "Getting Started",
    ...
  }
}
```

#### 2. Get All Levels
```http
GET /api/kb/levels?projectId={projectId}&status=active
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "level-uuid-1",
      "levelName": "Getting Started",
      "levelOrder": 1,
      "articlesCount": 5
    },
    ...
  ]
}
```

#### 3. Update Level
```http
PUT /api/kb/levels/:id
Authorization: Bearer {token}
Content-Type: application/json

{
  "levelName": "Quick Start Guide",
  "levelOrder": 2
}

Response: 200 OK
```

#### 4. Delete Level
```http
DELETE /api/kb/levels/:id
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "message": "Level deleted successfully",
  "warning": "5 articles were unmapped from this level"
}
```

#### 5. Reorder Levels
```http
PUT /api/kb/levels/reorder
Authorization: Bearer {token}
Content-Type: application/json

{
  "levels": [
    { "id": "level-1", "order": 1 },
    { "id": "level-2", "order": 2 },
    { "id": "level-3", "order": 3 }
  ]
}

Response: 200 OK
```

---

### KB Articles Management

#### 6. Create Article
```http
POST /api/kb/articles
Authorization: Bearer {token}
Content-Type: multipart/form-data

{
  "documentName": "How to Submit a Ticket",
  "documentType": "both", // 'pdf' | 'html' | 'both'
  "projectIds": ["proj-uuid-1"],
  "pdfFile": <file>, // If documentType includes 'pdf'
  "htmlContent": "<h1>Step 1</h1><p>Click on...</p>",
  "publishType": "scheduled",
  "scheduledPublishDate": "2026-01-20T10:00:00Z",
  "scheduledUnpublishDate": null,
  "levelIds": ["level-uuid-1", "level-uuid-2"],
  "tags": ["ticket", "submission"],
  "author": "Niraj Mishra",
  "status": "active",
  "isFeatured": true
}

Response: 201 Created
{
  "success": true,
  "message": "Article created successfully",
  "data": {
    "id": "article-uuid",
    "documentName": "How to Submit a Ticket",
    "pdfUrl": "https://storage.googleapis.com/helpdesk-knowledge-base/proj-1_1737312000_how-to-submit-ticket.pdf",
    ...
  }
}
```

#### 7. Get All Articles (Admin)
```http
GET /api/kb/articles?projectId={projectId}&levelId={levelId}&status=active&page=1&limit=20
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": {
    "articles": [
      {
        "id": "article-uuid",
        "documentName": "How to Submit a Ticket",
        "documentType": "both",
        "pdfUrl": "https://...",
        "levels": ["Getting Started", "FAQs"],
        "scheduledPublishDate": "2026-01-20T10:00:00Z",
        "status": "active",
        "isFeatured": true,
        "viewsCount": 120,
        "createdAt": "2026-01-15T...",
        "createdBy": "Niraj Mishra"
      },
      ...
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "totalPages": 3
    }
  }
}
```

#### 8. Get Public Articles (Project Users)
```http
GET /api/kb/public/articles?projectId={projectId}&levelId={levelId}&search={query}
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": {
    "levels": [
      {
        "id": "level-uuid-1",
        "levelName": "Getting Started",
        "levelOrder": 1,
        "articles": [
          {
            "id": "article-uuid",
            "documentName": "How to Submit a Ticket",
            "documentType": "both",
            "pdfUrl": "https://...",
            "htmlContent": "<h1>...</h1>",
            "isFeatured": true,
            "author": "Niraj Mishra",
            "publishedAt": "2026-01-20T10:00:00Z"
          },
          ...
        ]
      },
      ...
    ]
  }
}

Note: Only returns articles where:
- status = 'active'
- scheduledPublishDate <= NOW (if scheduled)
- scheduledUnpublishDate > NOW OR IS NULL
```

#### 9. Get Single Article
```http
GET /api/kb/articles/:id
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "article-uuid",
    "documentName": "How to Submit a Ticket",
    "documentType": "both",
    "pdfUrl": "https://...",
    "htmlContent": "<h1>...</h1>",
    "levels": [
      { "id": "level-1", "levelName": "Getting Started" }
    ],
    "tags": ["ticket", "submission"],
    "viewsCount": 121, // Incremented
    ...
  }
}
```

#### 10. Update Article
```http
PUT /api/kb/articles/:id
Authorization: Bearer {token}
Content-Type: multipart/form-data

{
  "documentName": "Updated Title",
  "htmlContent": "<h1>Updated content</h1>",
  "levelIds": ["level-uuid-1"],
  // ... other fields
}

Response: 200 OK
```

#### 11. Delete Article
```http
DELETE /api/kb/articles/:id
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "message": "Article and associated PDF deleted successfully"
}
```

#### 12. Search Articles
```http
GET /api/kb/articles/search?q={searchQuery}&projectId={projectId}
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "article-uuid",
      "documentName": "How to Submit a Ticket",
      "excerpt": "...Click on New Ticket button...",
      "levels": ["Getting Started"],
      "relevanceScore": 0.95
    },
    ...
  ]
}
```

---

## Frontend Components

### Super Admin Side

#### Component 1: `KBLevelManagement.tsx`
**Path:** `frontend/src/components/KnowledgeBase/KBLevelManagement.tsx`

**Features:**
- List all levels with drag-and-drop reordering
- Create new level modal
- Edit level inline or modal
- Delete level with confirmation
- Toggle level status (Active/Inactive)
- View articles count per level
- Filter by project

**UI Elements:**
```tsx
<div className="kb-level-management">
  <div className="header">
    <h1>Knowledge Base Levels</h1>
    <button onClick={openCreateModal}>+ Add Level</button>
  </div>
  
  <div className="filters">
    <ProjectSelector />
  </div>
  
  <div className="levels-list">
    {/* Drag-and-drop sortable list */}
    <DragDropContext onDragEnd={handleReorder}>
      <Droppable droppableId="levels">
        {levels.map((level, index) => (
          <Draggable key={level.id} draggableId={level.id} index={index}>
            <LevelCard
              level={level}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleStatus={handleToggleStatus}
            />
          </Draggable>
        ))}
      </Droppable>
    </DragDropContext>
  </div>
</div>
```

---

#### Component 2: `KBArticleManagement.tsx`
**Path:** `frontend/src/components/KnowledgeBase/KBArticleManagement.tsx`

**Features:**
- List all articles in table/card view
- Filter by project, level, status
- Search articles
- Create new article button
- Edit/Delete actions
- View article details
- Bulk actions (delete, change status)

**UI Elements:**
```tsx
<div className="kb-article-management">
  <div className="header">
    <h1>Knowledge Base Articles</h1>
    <button onClick={openCreateArticle}>+ Create Article</button>
  </div>
  
  <div className="filters">
    <ProjectSelector />
    <LevelFilter />
    <StatusFilter />
    <SearchBox />
  </div>
  
  <ArticleTable
    articles={articles}
    onEdit={handleEdit}
    onDelete={handleDelete}
    onView={handleView}
  />
</div>
```

---

#### Component 3: `KBArticleForm.tsx`
**Path:** `frontend/src/components/KnowledgeBase/KBArticleForm.tsx`

**Features:**
- Form for create/edit article
- Document name input
- Document type selector (PDF/HTML/Both)
- PDF upload with preview
- Rich text editor for HTML content
- Project multi-select
- Level mapping multi-select
- Scheduler (immediate/scheduled)
- Tags input
- Status toggle
- Featured checkbox
- Save draft / Publish buttons

**UI Elements:**
```tsx
<form className="kb-article-form">
  {/* Basic Info */}
  <section>
    <h2>Basic Information</h2>
    <Input label="Document Name" required />
    <Select label="Document Type" options={['PDF', 'HTML', 'Both']} required />
    <MultiSelect label="Projects" options={projects} required />
  </section>
  
  {/* Content */}
  <section>
    <h2>Content</h2>
    {documentType.includes('pdf') && (
      <FileUpload
        label="Upload PDF"
        accept=".pdf"
        maxSize={10485760} // 10MB
        onUpload={handlePDFUpload}
      />
    )}
    {documentType.includes('html') && (
      <RichTextEditor
        label="HTML Content"
        value={htmlContent}
        onChange={setHtmlContent}
        config={editorConfig}
      />
    )}
  </section>
  
  {/* Scheduling */}
  <section>
    <h2>Publishing Schedule</h2>
    <RadioGroup
      label="Publish Type"
      options={['Publish Immediately', 'Schedule for Later']}
      value={publishType}
      onChange={setPublishType}
    />
    {publishType === 'scheduled' && (
      <>
        <DateTimePicker label="Scheduled Publish Date" required />
        <DateTimePicker label="Scheduled Unpublish Date" optional />
      </>
    )}
  </section>
  
  {/* Level Mapping */}
  <section>
    <h2>Level Mapping</h2>
    <MultiSelect
      label="Map to Levels"
      options={levels}
      value={selectedLevels}
      onChange={setSelectedLevels}
      required
      renderOption={(level) => (
        <Checkbox label={level.levelName} />
      )}
    />
  </section>
  
  {/* Additional Settings */}
  <section>
    <h2>Additional Settings</h2>
    <TagInput label="Tags" value={tags} onChange={setTags} />
    <Input label="Author" defaultValue={currentUser.name} />
    <Toggle label="Status" checked={isActive} onChange={setIsActive} />
    <Checkbox label="Featured Article" checked={isFeatured} onChange={setIsFeatured} />
  </section>
  
  {/* Actions */}
  <div className="form-actions">
    <button type="button" onClick={saveDraft}>Save Draft</button>
    <button type="submit">Publish</button>
  </div>
</form>
```

---

### Project User Side

#### Component 4: `KnowledgeBaseViewer.tsx`
**Path:** `frontend/src/components/KnowledgeBase/KnowledgeBaseViewer.tsx`

**Features:**
- Tab navigation for levels
- Article list per level
- Featured articles highlighted
- Search functionality
- Article detail view with PDF/HTML rendering
- Breadcrumbs
- Print/Download options

**UI Elements:**
```tsx
<div className="knowledge-base-viewer">
  <div className="header">
    <h1>Knowledge Base</h1>
    <SearchBox onSearch={handleSearch} />
  </div>
  
  {/* Level Tabs */}
  <Tabs value={activeLevel} onChange={setActiveLevel}>
    {levels.map(level => (
      <Tab key={level.id} label={level.levelName} icon={level.icon} />
    ))}
  </Tabs>
  
  {/* Articles List */}
  <div className="articles-container">
    {/* Featured Articles */}
    {featuredArticles.length > 0 && (
      <section className="featured-section">
        <h2>Featured Articles</h2>
        <div className="featured-grid">
          {featuredArticles.map(article => (
            <FeaturedArticleCard
              key={article.id}
              article={article}
              onClick={() => openArticle(article.id)}
            />
          ))}
        </div>
      </section>
    )}
    
    {/* All Articles */}
    <section className="all-articles">
      <h2>All Articles</h2>
      <ArticleList
        articles={articles}
        onArticleClick={openArticle}
      />
    </section>
  </div>
  
  {/* Article Detail Modal */}
  {selectedArticle && (
    <ArticleDetailModal
      article={selectedArticle}
      onClose={closeArticle}
    />
  )}
</div>
```

---

#### Component 5: `ArticleDetailView.tsx`
**Path:** `frontend/src/components/KnowledgeBase/ArticleDetailView.tsx`

**Features:**
- Display article title and metadata
- Render PDF viewer or HTML content
- Print button
- Download PDF button
- Breadcrumbs navigation
- Related articles (same level)
- View counter

**UI Elements:**
```tsx
<div className="article-detail-view">
  <div className="breadcrumbs">
    <a href="/kb">Knowledge Base</a> / 
    <a href={`/kb?level=${level.id}`}>{level.levelName}</a> / 
    <span>{article.documentName}</span>
  </div>
  
  <div className="article-header">
    <h1>{article.documentName}</h1>
    <div className="metadata">
      <span>By {article.author}</span>
      <span>Published {formatDate(article.publishedAt)}</span>
      <span>{article.viewsCount} views</span>
    </div>
    <div className="actions">
      <button onClick={handlePrint}>Print</button>
      {article.pdfUrl && (
        <button onClick={handleDownloadPDF}>Download PDF</button>
      )}
    </div>
  </div>
  
  <div className="article-content">
    {article.documentType === 'pdf' && (
      <PDFViewer url={article.pdfUrl} />
    )}
    {article.documentType === 'html' && (
      <div
        className="html-content"
        dangerouslySetInnerHTML={{ __html: sanitizeHTML(article.htmlContent) }}
      />
    )}
    {article.documentType === 'both' && (
      <Tabs>
        <Tab label="View Article">
          <div dangerouslySetInnerHTML={{ __html: sanitizeHTML(article.htmlContent) }} />
        </Tab>
        <Tab label="View PDF">
          <PDFViewer url={article.pdfUrl} />
        </Tab>
      </Tabs>
    )}
  </div>
  
  {relatedArticles.length > 0 && (
    <div className="related-articles">
      <h2>Related Articles</h2>
      <ArticleList articles={relatedArticles} />
    </div>
  )}
</div>
```

---

## S3 Bucket Integration

### Google Cloud Storage Configuration

**Bucket Details:**
- **Bucket Name:** `helpdesk-knowledge-base`
- **Project:** `helpdesk-dev-478611`
- **Region:** `us-central1` (or appropriate region)
- **Storage Class:** Standard
- **Access Control:** Uniform (recommended)
- **Public Access:** Disabled (authenticated access only)
- **Versioning:** Enabled (recommended for backup)
- **Lifecycle Rules:** 
  - Delete incomplete multipart uploads after 7 days
  - Optional: Archive old versions after 90 days

**Access Configuration:**
- **Service Account:** Create dedicated service account
- **Permissions:**
  - `storage.objects.create` - Upload files
  - `storage.objects.delete` - Delete files
  - `storage.objects.get` - Read files
  - `storage.objects.list` - List files
- **Admin Access:** niraj.mishra@hubblehox.com (Owner/Editor role)

**Backend Integration (Node.js):**

```typescript
// backend/src/services/gcsService.ts
import { Storage } from '@google-cloud/storage';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const storage = new Storage({
  projectId: 'helpdesk-dev-478611',
  keyFilename: path.join(__dirname, '../../config/gcs-key.json'),
});

const bucketName = 'helpdesk-knowledge-base';
const bucket = storage.bucket(bucketName);

export class GCSService {
  /**
   * Upload PDF to Google Cloud Storage
   */
  async uploadPDF(file: Express.Multer.File, projectCode: string): Promise<{ url: string; filename: string }> {
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${projectCode}_${timestamp}_${sanitizedName}`;
    const blob = bucket.file(`kb-pdfs/${filename}`);

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
        metadata: {
          uploadedBy: 'SAC-Helpdesk',
          projectCode: projectCode,
        },
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => reject(err));
      blobStream.on('finish', async () => {
        // Make file publicly readable (optional, or use signed URLs)
        // await blob.makePublic();
        
        const publicUrl = `https://storage.googleapis.com/${bucketName}/kb-pdfs/${filename}`;
        resolve({ url: publicUrl, filename });
      });
      blobStream.end(file.buffer);
    });
  }

  /**
   * Delete PDF from Google Cloud Storage
   */
  async deletePDF(filename: string): Promise<void> {
    await bucket.file(`kb-pdfs/${filename}`).delete();
  }

  /**
   * Get signed URL for temporary access
   */
  async getSignedUrl(filename: string, expiresInMinutes: number = 60): Promise<string> {
    const [url] = await bucket.file(`kb-pdfs/${filename}`).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });
    return url;
  }

  /**
   * Upload image from rich text editor
   */
  async uploadEditorImage(file: Express.Multer.File): Promise<string> {
    const filename = `kb-images/${uuidv4()}_${file.originalname}`;
    const blob = bucket.file(filename);

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: { contentType: file.mimetype },
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => reject(err));
      blobStream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
        resolve(publicUrl);
      });
      blobStream.end(file.buffer);
    });
  }
}
```

**Environment Variables:**
```env
# .env
GCS_PROJECT_ID=helpdesk-dev-478611
GCS_BUCKET_NAME=helpdesk-knowledge-base
GCS_KEY_FILE=./config/gcs-key.json
```

---

## User Interface Mockup

### Admin - KB Level Management
```
┌─────────────────────────────────────────────────────────────────┐
│  Knowledge Base Levels                          [+ Add Level]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Project: [MH CET Extension Centres ▼]                          │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ ☰ 1. Getting Started                    [Active ✓]    │      │
│  │   📊 5 articles                                        │      │
│  │   [Edit] [Delete]                                      │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ ☰ 2. User Guides                        [Active ✓]    │      │
│  │   📊 12 articles                                       │      │
│  │   [Edit] [Delete]                                      │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ ☰ 3. FAQs                               [Active ✓]    │      │
│  │   📊 20 articles                                       │      │
│  │   [Edit] [Delete]                                      │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Admin - KB Article Management
```
┌─────────────────────────────────────────────────────────────────┐
│  Knowledge Base Articles                    [+ Create Article]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Project: [All Projects ▼]  Level: [All Levels ▼]              │
│  Status: [All ▼]  Search: [___________] 🔍                     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Title                 │ Type │ Levels      │ Status │...  │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │ ⭐ How to Submit      │ Both │ Getting    │ Active │ ✏️🗑│    │
│  │    a Ticket           │      │ Started    │ ✅     │     │    │
│  │    Published: Now     │      │            │        │     │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │ Troubleshooting Login │ HTML │ FAQs,      │ Scheduled│✏️🗑│    │
│  │    Scheduled: Jan 25  │      │ Support    │ ⏰     │     │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │ User Guide PDF        │ PDF  │ User Guide │ Active │ ✏️🗑│    │
│  │    Published: Jan 15  │      │            │ ✅     │     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  Page 1 of 3                                      [< 1 2 3 >]    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### User - Knowledge Base Viewer
```
┌─────────────────────────────────────────────────────────────────┐
│  Knowledge Base                       Search: [___________] 🔍   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Getting Started] [User Guides] [FAQs] [Troubleshooting]       │
│  ═════════════════                                               │
│                                                                   │
│  Featured Articles                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │⭐            │ │⭐            │ │⭐            │           │
│  │ How to       │ │ Quick Start  │ │ Common       │           │
│  │ Submit       │ │ Guide        │ │ Issues       │           │
│  │ a Ticket     │ │              │ │              │           │
│  │              │ │              │ │              │           │
│  │ 👁 256 views │ │ 👁 189 views │ │ 👁 345 views │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                                   │
│  All Articles                                                     │
│  • Creating Your First Ticket                         📄 HTML    │
│  • Understanding Ticket Status                        📄 PDF     │
│  • Uploading Attachments                              📄 Both    │
│  • Notification Settings                              📄 HTML    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Checklist

### Backend Tasks
- [ ] Create database migrations for `kb_levels`, `kb_articles`, `kb_article_level_mapping`
- [ ] Implement GCS service for PDF upload/delete/download
- [ ] Create KB Levels API endpoints (CRUD + reorder)
- [ ] Create KB Articles API endpoints (CRUD + search)
- [ ] Implement public API for project users
- [ ] Add scheduler job to auto-publish/unpublish articles
- [ ] Implement view counter logic
- [ ] Add full-text search functionality
- [ ] Create backup/restore functionality
- [ ] Add audit logging for KB changes

### Frontend Tasks
- [ ] Build KBLevelManagement component with drag-and-drop
- [ ] Build KBArticleManagement component with filters
- [ ] Build KBArticleForm component with rich text editor
- [ ] Integrate PDF upload with progress indicator
- [ ] Build KnowledgeBaseViewer component for users
- [ ] Build ArticleDetailView with PDF/HTML rendering
- [ ] Implement search functionality with live results
- [ ] Add breadcrumb navigation
- [ ] Implement print/download features
- [ ] Add responsive design for mobile

### Testing Tasks
- [ ] Unit tests for GCS service
- [ ] Integration tests for API endpoints
- [ ] Test scheduled publishing functionality
- [ ] Test permission controls (admin vs user)
- [ ] Test PDF upload/download/delete
- [ ] Test rich text editor content sanitization
- [ ] Test search functionality
- [ ] Performance testing with large PDFs
- [ ] Cross-browser testing

### Security Tasks
- [ ] Validate file types (only PDF allowed)
- [ ] Limit file size (max 10MB)
- [ ] Sanitize HTML content to prevent XSS
- [ ] Implement rate limiting on upload endpoints
- [ ] Use signed URLs for PDF access (optional)
- [ ] Add RBAC checks for all admin endpoints
- [ ] Encrypt sensitive data at rest

---

## Future Enhancements

1. **Version Control**: Track article versions with rollback capability
2. **Analytics Dashboard**: View popular articles, search queries, user engagement
3. **Comments/Feedback**: Allow users to rate articles and leave comments
4. **Multi-language Support**: Translate articles to multiple languages
5. **Video Support**: Upload and embed video tutorials
6. **AI-powered Search**: Implement semantic search with embeddings
7. **Export/Import**: Bulk export/import of KB articles
8. **Mobile App**: Dedicated mobile app for KB access
9. **Offline Mode**: Download articles for offline reading
10. **Integrations**: Link KB articles in chatbot responses, ticket suggestions

---

**Document Status:** Draft  
**Next Steps:** Review and approve design → Begin implementation  
**Estimated Timeline:** 4-6 weeks for full implementation
