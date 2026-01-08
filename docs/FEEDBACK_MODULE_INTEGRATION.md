# Feedback Module Integration - Quick Setup Guide

## ✅ Completed Steps

### 1. Frontend Integration
- ✅ Added feedback permissions to `frontend/src/constants/permissions.ts`:
  - `FEEDBACK_FORM_CREATE`
  - `FEEDBACK_FORM_EDIT`
  - `FEEDBACK_FORM_DELETE`
  - `FEEDBACK_VIEW`
  - `FEEDBACK_EXPORT`
  - Added `FEEDBACK: 'FEEDBACK_'` to `PERMISSION_MODULES`

- ✅ Added feedback menu to `frontend/src/config/menuConfig.tsx`:
  - Parent menu: "Feedback" with chat icon
  - Sub-items:
    - "Manage Forms" → `/feedback/forms`
    - "View Responses" → `/feedback/responses`

- ✅ Added routes to `frontend/src/App.tsx`:
  - `/feedback/forms` → `FeedbackFormManagement` component
  - `/feedback/responses` → `FeedbackResponses` component
  - Protected with appropriate permissions

### 2. Backend Integration
- ✅ Added feedback permissions to `backend/src/utils/seedRolesPermissions.ts`:
  - 5 permissions added (FEEDBACK_FORM_CREATE, EDIT, DELETE, VIEW, EXPORT)
  - All permissions assigned to Super Admin role automatically

## 🚀 Next Steps

### 1. Restart Backend Server
The backend server needs to restart to reseed permissions:
```bash
cd backend
npm run dev
```

The permissions will be automatically seeded on server start.

### 2. Clear Browser Cache
After restarting backend:
1. Hard refresh browser: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
2. Or clear cache and reload

### 3. Re-login
1. Logout from super admin
2. Login again
3. Navigate to sidebar → You should now see "Feedback" menu

## 📍 How to Access

1. **Login as Super Admin**
2. **Look in sidebar** - You'll see:
   ```
   📊 Dashboard
   📁 Projects
   ...
   📖 Knowledge Base
   ❓ FAQ
   💬 Feedback  ← NEW!
   ├── ✓ Manage Forms
   └── 📊 View Responses
   ```

## 🎯 Testing Workflow

### Create First Feedback Form
1. Go to **Feedback → Manage Forms**
2. Click **"Create Form"**
3. Fill in:
   - Form Name: "Support Satisfaction Survey"
   - Description: "Help us improve"
   - Email settings (optional)
4. Click **"Create Form"**
5. Click **"Design Form"** button on the form card
6. Add questions:
   - Star Rating: "How satisfied are you?"
   - Textarea: "Any suggestions?"
7. Click **"Save Form"**
8. Click **"Activate"** to make it active

### Test Feedback Email
1. Go to a ticket
2. Change status to one that has **"This Status Closes Tickets"** checked
3. Student will receive feedback email
4. Click link in email → Opens ticket page with feedback form
5. Submit feedback
6. Go to **Feedback → View Responses** to see submission

## 🔐 RBAC Configuration

### Assigning Feedback Permissions to Other Roles

If you want other roles (Project Admin, Center Manager, etc.) to access feedback:

1. Go to **RBAC Setup** (sidebar)
2. Select the role (e.g., "Project Admin")
3. Scroll to **"Feedback"** section
4. Check the permissions:
   - ✅ `FEEDBACK_FORM_CREATE` - Create feedback forms
   - ✅ `FEEDBACK_FORM_EDIT` - Edit feedback forms
   - ✅ `FEEDBACK_FORM_DELETE` - Delete feedback forms
   - ✅ `FEEDBACK_VIEW` - View responses
   - ✅ `FEEDBACK_EXPORT` - Export responses (future)
5. Click **"Save"**

### Default Permissions

**Super Admin**: ✅ All feedback permissions (automatic)
**Other Roles**: ❌ No feedback permissions (must be assigned manually)

## 📁 Files Modified

### Frontend (3 files)
1. `frontend/src/constants/permissions.ts` - Added 5 permissions
2. `frontend/src/config/menuConfig.tsx` - Added feedback menu
3. `frontend/src/App.tsx` - Added 2 routes with imports

### Backend (1 file)
1. `backend/src/utils/seedRolesPermissions.ts` - Added 5 permissions

### Components (Already Created - 4 files)
1. `frontend/src/components/FeedbackFormManagement.tsx`
2. `frontend/src/components/FeedbackFormBuilder.tsx`
3. `frontend/src/components/FeedbackSubmission.tsx`
4. `frontend/src/components/FeedbackResponses.tsx`

## ⚠️ Common Issues

### Issue: Menu not showing
**Solution**: 
1. Hard refresh: `Ctrl + Shift + R`
2. Check if logged in as Super Admin
3. Check browser console for errors

### Issue: Permission denied
**Solution**:
1. Logout and login again
2. Backend must be restarted for permissions to seed
3. Check role has feedback permissions in RBAC Setup

### Issue: Feedback email not sending
**Solution**:
1. Check `.env` has SMTP settings
2. Verify status has `isClosed: true`
3. Check feedback form is active
4. Review backend logs

## 📊 Menu Structure

```
Super Admin Sidebar
├── 📊 Dashboard
├── 📁 Projects
├── 👥 Users
├── 🎫 Tickets
├── 🔐 RBAC Setup
├── 📋 Master Data
├── ⚙️ Settings
├── ⏱️ SLA & Escalation
├── 📖 Knowledge Base
│   ├── Manage Categories
│   ├── Manage Articles
│   └── View Articles
├── ❓ FAQ
└── 💬 Feedback ← NEW MODULE
    ├── ✓ Manage Forms (Create/Edit forms + Design questions)
    └── 📊 View Responses (Analytics dashboard)
```

## 🎨 Icons Used

- Feedback Module: `MdChat` (💬)
- Manage Forms: `MdFactCheck` (✓)
- View Responses: `MdBarChart` (📊)

## ✨ Features Available

1. **Manage Forms**
   - Create/Edit/Delete feedback forms
   - Design Form Builder (drag-drop questions)
   - 6 question types: Rating, Text, Textarea, Radio, Checkbox, Dropdown
   - Email template customization
   - Active/Inactive toggle
   - Email delay configuration

2. **View Responses**
   - Statistics dashboard
   - Average rating calculation
   - Rating distribution charts
   - Filter by rating range
   - Filter by date range
   - Detailed response view
   - Export (future enhancement)

---

**Status**: ✅ Complete and Ready
**Next Action**: Restart backend server → Hard refresh browser → Login as Super Admin
