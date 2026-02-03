# KB Table - Article Mapping Feature

## Overview
The Knowledge Base Tables now support automatic population from KB Articles. This allows you to display article data in structured tables without manually entering information.

## Features

### 1. Data Source Options
When creating a table, you can choose between:
- **Manual Entry**: Traditional data entry where you manually add/edit rows
- **Auto-populate from KB Articles**: Automatically populate table rows from KB Articles based on field mappings

### 2. Article Field Mappings
When you select "Auto-populate from KB Articles" as the data source, each column can be mapped to an article field:

| Article Field | Description | Data Type |
|--------------|-------------|-----------|
| **documentName** | Article title/name | Text |
| **documentType** | Type (pdf/html/both/link) | Text |
| **author** | Article author | Text |
| **publishedAt** | Publication date | Date |
| **viewsCount** | Number of views | Number |
| **status** | Active/Inactive | Text |
| **tags** | Article tags (comma-separated) | Text |
| **pdfUrl** | PDF file URL | URL |
| **externalUrl** | External link URL | URL |
| **isFeatured** | Featured status (Yes/No) | Text |
| **articleId** | MongoDB ObjectId | Text |
| **articleLink** | Link to view article | URL |

## How to Use

### Step 1: Create a Table with Article Mapping
1. Go to **Knowledge Base → Manage Tables**
2. Click **Create Table**
3. Fill in basic information:
   - Table Name
   - Description
   - KB Level (optional - to filter articles by level)
4. Select **Data Source**: Choose "Auto-populate from KB Articles"
5. Add columns and map each to an article field:
   - Column Name: "Title"
   - Column Type: Text
   - Article Field Mapping: "📄 Document Name"
6. Add more columns as needed (e.g., Author, Published Date, Views)
7. Click **Save**

### Step 2: Populate the Table
After creating the table, click the **Populate** button to fetch and display articles.

The system will:
- Find all articles in the selected project
- If a KB Level is selected, only show articles mapped to that level
- Extract data from articles based on your column mappings
- Create table rows automatically

### Step 3: Refresh Data
Click the **Populate** button again anytime to refresh the table with the latest article data. This is useful when:
- New articles are added
- Article information is updated
- Articles are added/removed from the KB level

## Example Use Cases

### 1. Article Directory
Create a table showing all articles with columns:
- Document Name → Article title
- Document Type → File type
- Author → Who created it
- Published At → When it was published
- Views Count → Popularity

### 2. Resource List
Display external links with columns:
- Document Name → Resource title
- External URL → Link
- Tags → Categories
- Status → Available/Unavailable

### 3. Documentation Index
List all PDFs with columns:
- Document Name → Document title
- PDF URL → Download link
- Published At → Date added
- Is Featured → Important docs

## Backend Implementation

### Model Changes
```typescript
// KBTable model now includes:
dataSource: 'manual' | 'articles'
autoPopulateFromArticles: boolean

// KBTableColumn includes:
articleFieldMapping?: string
```

### New API Endpoint
```
POST /api/kb/tables/:id/populate-from-articles
```

This endpoint:
1. Validates the table has article field mappings
2. Queries articles based on project and level
3. Maps article data to table columns
4. Clears existing rows and inserts new data
5. Returns populated table

### Controller Logic
The `populateTableFromArticles` function:
- Fetches active articles for the project
- Filters by KB level if specified
- Iterates through each article
- Extracts field values based on column mappings
- Creates formatted row data
- Saves to table

## Benefits

1. **Automated Updates**: No manual data entry required
2. **Consistency**: Data always matches source articles
3. **Real-time**: Click populate to refresh instantly
4. **Flexible**: Map any article field to any column
5. **Filtered Views**: Use KB levels to show specific article subsets
6. **Multiple Tables**: Create different views of the same articles

## Notes

- Tables with `dataSource='articles'` show a "📊 Auto-populated" badge
- The "Manage Data" button changes to "View Data" for article-populated tables
- Manual row editing is disabled for article-populated tables
- Clicking "Populate" replaces all existing rows (with confirmation)
- HTML content is truncated to 100 characters in table display
- Date fields are automatically formatted
- Missing fields show "N/A"

## Migration

Existing tables default to `dataSource='manual'` and continue working as before. To use article mapping:
1. Edit the table structure
2. Change Data Source to "Auto-populate from KB Articles"
3. Configure article field mappings for each column
4. Save and click Populate
