# Fixing "SuperAdmin role not found" and JWT Token Issues

## Issues Fixed:

1. ✅ Roles now have `code` field (SUPER_ADMIN, AGENT, STUDENT, etc.)
2. ✅ Projects now have `customUrlPath` and `branding` configuration
3. ✅ Database schema matches backend expectations
4. ✅ Backend `.env` now points to local MongoDB

## Clear Old JWT Tokens

The "invalid signature" error means you have an old JWT token from when the backend was connected to production with a different secret.

### Option 1: Clear Browser Storage (Recommended)

1. Open your browser DevTools (F12)
2. Go to **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)
3. Click **Local Storage** → `http://localhost:5173` (or your frontend URL)
4. Click **Clear All** or delete the `authToken` / `token` entry
5. Refresh the page

### Option 2: Use Browser Console

Open browser console (F12) and run:
```javascript
localStorage.clear()
location.reload()
```

## New Test Credentials

Use these to login to your local database:

- **Admin**: `admin@sachelpdesk.com` / `Admin@123`
- **Agent**: `agent@sachelpdesk.com` / `Admin@123`
- **Student**: `student@sachelpdesk.com` / `Admin@123`

## Verify Database

You can verify the data using MongoDB Compass:

**Connection String**: `mongodb://localhost:27017/sac_helpdesk`

Check these collections:
- `roles` - Should have 4 roles with `code` field
- `users` - Should have 3 users
- `projects` - Should have 3 projects with `customUrlPath`
- `permissions` - Should have 38 permissions

## Start Development

```powershell
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Troubleshooting

### Still seeing "SuperAdmin role not found"?

Check the roles collection:
```javascript
// In MongoDB Compass or mongosh
db.roles.find({}, { name: 1, code: 1 })
```

Should show:
```json
{ "name": "Super Admin", "code": "SUPER_ADMIN" }
{ "name": "Agent", "code": "AGENT" }
{ "name": "Student", "code": "STUDENT" }
{ "name": "Support Administrator", "code": "SUPPORT_ADMIN" }
```

### Still seeing "Project not found with customUrlPath: mhcet"?

Check projects collection:
```javascript
db.projects.find({}, { name: 1, customUrlPath: 1 })
```

Should show:
```json
{ "name": "Student Assist Center", "customUrlPath": "mhcet" }
{ "name": "IT Support", "customUrlPath": "it-support" }
{ "name": "General Queries", "customUrlPath": "general" }
```

### JWT Token still invalid?

1. Clear browser localStorage (see above)
2. Make sure backend `.env` has:
   ```
   MONGODB_URI=mongodb://localhost:27017/sac_helpdesk
   JWT_SECRET=6cc2cff025e21fa4fc1bbf0fca01995b7aa6498808d4976715e32428778e824cf7749909b09b22491a332028ad836163527956046af1700da8b359848d1583ab
   ```
3. Restart backend server
4. Login again with test credentials

## Summary

✅ Local database is now fully initialized with correct schema
✅ Backend configuration is updated to use local MongoDB
✅ Test users are created with known passwords
✅ All roles have proper `code` fields
✅ Projects have `customUrlPath` for branding

Just clear your browser's localStorage and login again with the test credentials!
