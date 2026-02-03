# Role-Level Document Upload Feature

## Overview
This feature allows administrators to upload documents at the role level. When a document is uploaded for a specific role, it will be automatically displayed in the footer section for all users assigned to that role.

## Key Features

### 1. **Document Upload per Role**
- Upload documents (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT) when creating or editing a role
- Maximum file size: 10MB
- Documents are stored in `backend/uploads/role-documents/`

### 2. **Conditional Footer Display**
- Footer only appears when a role has an uploaded document
- If no document is uploaded, the footer section remains hidden
- Documents are accessible via a clickable link in the footer

### 3. **Document Management**
- View existing documents in the role edit form
- Replace documents by uploading a new file
- Delete documents without deleting the role

## Implementation Details

### Backend Changes

#### 1. **Role Model** (`backend/src/models/Role.ts`)
```typescript
interface IRole extends Document {
  // ...existing fields
  document?: {
    fileName: string;
    filePath: string;
    fileUrl: string;
    uploadedAt: Date;
  };
}
```

#### 2. **Role Controller** (`backend/src/controllers/roleController.ts`)
- Added `uploadRoleDocument` multer middleware for file handling
- Updated `createRole` to handle document uploads
- Updated `updateRole` to replace existing documents
- Added `deleteRoleDocument` endpoint to remove documents

#### 3. **Role Routes** (`backend/src/routes/roleRoutes.ts`)
```typescript
// Create role with document
POST /api/roles (with multipart/form-data)

// Update role with document
PUT /api/roles/:id (with multipart/form-data)

// Delete role document
DELETE /api/roles/:id/document
```

### Frontend Changes

#### 1. **RBAC Setup Page** (`frontend/src/pages/RBACSetup.tsx`)
- Added file input field in role creation/edit modal
- Display existing document with view and delete options
- Convert form data to FormData for multipart upload
- Show selected file name before upload

#### 2. **Dashboard Layout** (`frontend/src/components/DashboardLayout.tsx`)
- Fetch user's role document on component mount
- Display footer only when role document exists
- Footer shows document name with download link

## Usage Guide

### For Administrators

#### Creating a Role with Document:
1. Navigate to RBAC Setup page
2. Click "Add Role" button
3. Fill in role details (name, code, description)
4. Scroll to "Role Document (Optional)" section
5. Click "Choose File" and select your document
6. Selected file name will appear below the input
7. Click "Create Role"

#### Editing Role Document:
1. Click edit icon on any role
2. Existing document will be shown with "View" and "Delete" options
3. To replace: Select a new file (old one will be replaced)
4. To delete: Click "Delete" button next to existing document
5. Click "Update Role"

#### Deleting Role Document:
1. Open role in edit mode
2. Click "Delete" button next to the existing document
3. Confirm deletion in the popup
4. Document is immediately removed (no need to save)

### For End Users

#### Viewing Role Document:
1. Log in to the system
2. If your role has an uploaded document, you'll see a footer at the bottom of every page
3. Footer displays: 📄 [Document Name]
4. Click the document name to open/download it in a new tab

## Technical Details

### File Storage
- **Storage**: Google Cloud Storage (GCS) - **Required**
- **GCS Bucket**: Configured via `GCS_BUCKET_NAME` environment variable
- **GCS Path**: `role-documents/{timestamp}_{sanitized_filename}`
- **Access**: Files made publicly readable on GCS with permanent URLs
- **File Naming**: `{timestamp}_{sanitized_filename}.{ext}`

### GCS Configuration (Required)
The system **requires** the following environment variables for GCS:
```bash
GCS_PROJECT_ID=helpdesk-dev-478611
GCS_BUCKET_NAME=helpdesk-knowledge-base
GCS_KEY_FILE=src/config/gcs-key.json
# OR
GCS_CREDENTIALS={"type":"service_account",...}
```

⚠️ **Important**: If GCS is not configured, role document uploads will fail with an error.

### Security Considerations
1. **File Type Validation**: Only document formats allowed
2. **Size Limit**: 10MB maximum
3. **Authentication**: All endpoints require valid JWT token
4. **Permissions**: Only users with `RBAC_CREATE_ROLE` or `RBAC_EDIT_ROLE` can upload
5. **GCS Public Access**: Files are made publicly readable via GCS (direct URL access)
6. **File Cleanup**: Old documents are automatically deleted from GCS when replaced
7. **GCS Required**: GCS must be properly configured or uploads will fail

### Database Schema
```javascript
{
  document: {
    fileName: "Employee Handbook.pdf",
    filePath: "role-documents/1738034567890_Employee_Handbook.pdf", // GCS path
    fileUrl: "https://storage.googleapis.com/helpdesk-knowledge-base/role-documents/1738034567890_Employee_Handbook.pdf", // Public GCS URL
    uploadedAt: "2026-01-28T10:30:00.000Z"
  }
}
```

## API Endpoints

### Create Role with Document
```http
POST /api/roles
Content-Type: multipart/form-data
Authorization: Bearer {token}

Body:
- name: string
- code: string
- description: string
- permissions: JSON array
- projects: JSON array
- isMaster: boolean
- isAgent: boolean
- roleType: string
- document: file (optional)
```

### Update Role with Document
```http
PUT /api/roles/:id
Content-Type: multipart/form-data
Authorization: Bearer {token}

Body: (same as create)
```

### Delete Role Document
```http
DELETE /api/roles/:id/document
Authorization: Bearer {token}
```

### Get Role (includes document)
```http
GET /api/roles/:id
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "Agent",
    "document": {
      "fileName": "Agent Guidelines.pdf",
      "fileUrl": "http://localhost:3000/uploads/role-documents/document-xxx.pdf"
    }
  }
}
```

## Example Use Cases

### 1. **Employee Handbook**
Upload company policies and guidelines that all employees should reference.

### 2. **Training Materials**
Provide role-specific training documents for new users.

### 3. **Process Documentation**
Share standard operating procedures relevant to specific roles.

### 4. **Compliance Documents**
Display required legal or compliance documents for regulated roles.

### 5. **Quick Reference Guides**
Provide cheat sheets or quick reference materials for common tasks.

## Troubleshooting

### Document Not Showing in Footer
- Verify the role actually has a document uploaded
- Check browser console for API errors
- Ensure user's localStorage has valid user object with role ID

### Upload Failed
- **"Google Cloud Storage is not configured"** - GCS environment variables not set
- Check file size (must be under 10MB)
- Verify file type is supported
- Ensure user has `RBAC_CREATE_ROLE` or `RBAC_EDIT_ROLE` permission
- Verify GCS credentials are valid
- Check GCS bucket exists and is accessible

### Document Not Accessible
- Verify file was uploaded successfully to GCS
- Check GCS bucket permissions (files should be public)
- Check file path stored in database matches actual GCS path
- Verify GCS_BUCKET_NAME environment variable is correct
- Ensure `makePublic()` succeeded during upload

## Future Enhancements

1. **Multiple Documents**: Allow uploading multiple documents per role
2. **Document Categories**: Organize documents by type (handbook, training, compliance)
3. **Version Control**: Track document versions and changes
4. **Expiration Dates**: Set expiry dates for time-sensitive documents
5. **Read Receipts**: Track which users have viewed documents
6. **Document Preview**: Show PDF preview in modal instead of downloading

## Notes

- Documents are stored in Google Cloud Storage (GCS Required)
- GCS must be properly configured or uploads will fail
- GCS files are made publicly accessible with permanent URLs
- All users with the same role see the same document
- Documents are automatically deleted from GCS when replaced or removed
- Document URLs are publicly accessible GCS URLs
- No local storage fallback - ensure GCS is configured before using this feature
