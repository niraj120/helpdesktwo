# Student Portal Implementation - Complete Guide

## Overview
The Student Portal is now fully implemented, allowing students to submit support tickets through a project-specific interface with dynamic branding and two submission modes: online forms and offline center visits.

## Access URLs
- **Student Portal**: `http://localhost:3001/studentassistcenter/submit-ticket`
- **Agent Dashboard**: `http://localhost:3001/studentassistcenter/dashboard`
- **Project Login**: `http://localhost:3001/studentassistcenter`

## Features Implemented

### 1. Project-Based Multi-Tenancy
- Each project has its own custom URL path (e.g., `studentassistcenter`)
- Dynamic branding per project (colors, logo, welcome text, footer)
- Separate portals for agents and students

### 2. Student Portal Interface
**File**: `frontend/src/pages/StudentPortal.tsx` (586 lines)

**Key Features**:
- **Dynamic Branding**: Automatically loads project colors, logo, and text
- **Dual Mode Support**:
  - **Online**: Submit tickets via customizable forms
  - **Offline**: Search and find nearest support centers
  - **Both**: Show both options with tab switching

**Components**:
- Header with project logo and branding
- Tab navigation (if mode is "both")
- Online ticket submission form
- Offline center locator with search
- File attachment support
- Success/error messaging

### 3. Backend APIs

#### Project Branding API
**Endpoint**: `GET /api/projects/branding/:urlPath`
**File**: `backend/src/controllers/projectController.ts` (lines 355-401)

**Response**:
```json
{
  "projectId": "6908806855106de325cb1354",
  "name": "Student Assist Center",
  "customUrlPath": "studentassistcenter",
  "primaryColor": "#2563EB",
  "secondaryColor": "#764ba2",
  "logoUrl": "data:image/jpeg;base64,...",
  "welcomeText": "Student Assist Center",
  "footerText": "© 2025 Student Assist Center"
}
```

#### Ticket Submission Settings API
**Endpoint**: `GET /api/projects/:projectId/ticket-settings`
**File**: `backend/src/controllers/projectController.ts` (lines 403-495)

**Response**:
```json
{
  "mode": "both",
  "enableOnlineForm": true,
  "enableOfflineCenter": true,
  "onlineFormFields": [
    {
      "fieldName": "Name",
      "fieldType": "text",
      "required": true,
      "placeholder": "Enter your name"
    }
  ],
  "offlineCenters": [
    {
      "centerName": "Main Support Center",
      "address": "123 Main St",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "phone": "+91 22 1234 5678",
      "email": "support@sac.gov.in",
      "workingHours": "9 AM - 5 PM",
      "latitude": 19.0760,
      "longitude": 72.8777
    }
  ],
  "welcomeMessage": "Welcome! Submit your ticket below...",
  "successMessage": "Your ticket has been successfully submitted...",
  "allowAttachments": true,
  "maxAttachmentSize": 10,
  "allowedFileTypes": [".pdf", ".doc", ".docx", ".jpg", ".png"]
}
```

#### Ticket Submission API
**Endpoint**: `POST /api/tickets/submit`
**File**: `backend/src/controllers/ticketController.ts` (lines 8-83)

**Request** (multipart/form-data):
- `projectId`: Project ID
- `formData`: JSON string with form field values
- `attachments`: File uploads (up to 5 files)

**Response**:
```json
{
  "success": true,
  "message": "Ticket submitted successfully",
  "data": {
    "ticketId": "67321abc...",
    "ticketNumber": "TKT-20251112-0001"
  }
}
```

### 4. Database Schema Updates

**File**: `backend/src/models/Project.ts` (lines 330-362)

Added `ticketSubmissionSettings` to Project schema:
```typescript
ticketSubmissionSettings: {
  mode: { type: String, enum: ['online', 'offline', 'both'], default: 'both' },
  enableOnlineForm: { type: Boolean, default: true },
  enableOfflineCenter: { type: Boolean, default: true },
  onlineFormFields: [{
    fieldName: String,
    fieldType: String, // 'text', 'email', 'phone', 'textarea', 'dropdown', 'file'
    required: Boolean,
    placeholder: String,
    options: [String]
  }],
  offlineCenters: [{
    centerName: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
    phone: String,
    email: String,
    workingHours: String,
    latitude: Number,
    longitude: Number
  }],
  welcomeMessage: String,
  successMessage: String,
  allowAttachments: Boolean,
  maxAttachmentSize: Number, // in MB
  allowedFileTypes: [String]
}
```

### 5. Routing Configuration

**File**: `frontend/src/App.tsx`

Routes added:
```tsx
<Route path="/:customUrlPath/submit-ticket" element={<StudentPortal />} />
<Route path="/:customUrlPath/dashboard" element={<AgentDashboard />} />
<Route path="/:customUrlPath" element={<ProjectLogin />} />
```

## Default Configuration

When no ticket submission settings are configured, the following defaults are used:

**Form Fields**:
1. Name (text, required)
2. Email (email, required)
3. Phone (phone, required)
4. Subject (text, required)
5. Description (textarea, required)

**Attachments**:
- Enabled by default
- Max size: 10 MB
- Allowed types: .pdf, .doc, .docx, .jpg, .jpeg, .png

## Testing

Run the test script to verify all APIs:
```powershell
.\test-student-portal.ps1
```

**Expected Output**:
```
✓ Branding API working
✓ Ticket Settings API working
✓ All APIs are working correctly!
```

## Next Steps to Customize

### 1. Add Custom Form Fields
To customize the online form, edit the project in the admin panel and add fields to `configuration.ticketSubmissionSettings.onlineFormFields`.

**Example**:
```json
{
  "fieldName": "Category",
  "fieldType": "dropdown",
  "required": true,
  "placeholder": "Select a category",
  "options": ["Technical", "Billing", "General"]
}
```

### 2. Add Offline Centers
To add support centers, edit the project and add centers to `configuration.ticketSubmissionSettings.offlineCenters`.

**Example**:
```json
{
  "centerName": "Mumbai Support Center",
  "address": "123 Main Street, Andheri",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400053",
  "phone": "+91 22 1234 5678",
  "email": "mumbai@sac.gov.in",
  "workingHours": "Monday - Friday: 9 AM - 6 PM",
  "latitude": 19.1136,
  "longitude": 72.8697
}
```

### 3. Set Submission Mode
Configure the mode in project settings:
- `"online"`: Show only online form
- `"offline"`: Show only center locator
- `"both"`: Show tabs for both options (default)

### 4. Customize Messages
Edit welcome and success messages in project settings:
- `welcomeMessage`: Shown at the top of the portal
- `successMessage`: Shown after successful ticket submission

## File Attachments

The system supports file uploads with:
- Storage: `backend/uploads/tickets/`
- Multer middleware for handling multipart uploads
- File validation (type and size)
- Stored in Ticket model with metadata (filename, size, mimetype)

## Error Handling

The portal includes comprehensive error handling:
- Project not found: Shows error page
- Form validation errors: Highlighted fields with messages
- File upload errors: Size/type validation messages
- API errors: User-friendly error messages

## UI Features

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Loading States**: Spinner while fetching data
- **Search Functionality**: Filter centers by city, state, or pincode
- **File Management**: Add/remove attachments before submission
- **Dynamic Styling**: Colors adapt to project branding
- **Accessibility**: Proper labels, focus states, and keyboard navigation

## Architecture Benefits

1. **Multi-Tenancy**: Each project has isolated branding and settings
2. **Flexibility**: Admins can customize form fields without code changes
3. **Scalability**: Easy to add new projects with unique portals
4. **User Experience**: Branded interface builds trust and recognition
5. **Offline Support**: Physical centers for users who prefer in-person help

## Current Status

✅ **Backend**: Fully implemented with all APIs working
✅ **Frontend**: Complete UI with dynamic branding
✅ **Database**: Schema updated with ticket submission settings
✅ **Routing**: Multi-tenant URL structure in place
✅ **File Uploads**: Multer middleware configured
✅ **Error Handling**: Comprehensive validation and messaging

⏳ **Pending**: 
- Admin UI to configure ticket submission settings in AddProjectForm
- Actual ticket management in AgentDashboard (currently placeholders)
- Email notifications for ticket submission

## URLs Summary

| Portal | URL | Purpose |
|--------|-----|---------|
| Student Portal | `/studentassistcenter/submit-ticket` | Submit tickets online/offline |
| Agent Dashboard | `/studentassistcenter/dashboard` | Manage tickets (L1 agents) |
| Project Login | `/studentassistcenter` | Login page for agents |
| Admin Dashboard | `/dashboard` | Super admin panel |
| Projects | `/projects` | Manage all projects |

## Testing the Portal

1. **Open the student portal**:
   ```
   http://localhost:3001/studentassistcenter/submit-ticket
   ```

2. **You should see**:
   - Student Assist Center branding
   - Tabs for "Submit Online" and "Visit Center"
   - Default form with Name, Email, Phone, Subject, Description
   - File attachment option

3. **Test submission**:
   - Fill in all required fields
   - Optionally add file attachments
   - Click "Submit Ticket"
   - Success message should appear

4. **Test center search** (offline tab):
   - Switch to "Visit Center" tab
   - Currently shows "No centers found" since none are configured
   - Search functionality ready for when centers are added

## Integration Points

The student portal integrates with:
- **Project Service**: For branding and settings
- **Ticket Service**: For submission and tracking
- **User Service**: For authentication (future enhancement)
- **Notification Service**: For email confirmations (future enhancement)

---

## Troubleshooting

**Portal Not Loading?**
- Check backend is running: `http://localhost:3003`
- Check frontend is running: `http://localhost:3001`
- Verify project exists in database with correct `customUrlPath`

**API Errors?**
- Run test script: `.\test-student-portal.ps1`
- Check console for detailed error messages
- Verify MongoDB connection

**File Upload Fails?**
- Check file size (default max: 10 MB)
- Verify file type is allowed
- Ensure `backend/uploads/tickets/` directory exists

---

**Implementation Date**: November 12, 2025
**Status**: ✅ Complete and Ready for Testing
