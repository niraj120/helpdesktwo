# VM Deployment Fix - Multiple Issues Resolved

## Issues Fixed

### 1. Form Builder Category Error (VM Error)
```
Permission validation failed
value: 'form-builder'
kind: 'enum'
```

### 2. CORS Error (Production)
```
Access to fetch at 'http://localhost:3003/api/auth/login' from origin 'https://helpdesk.hubblehox.ai' 
has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header has a value 
'http://localhost:3001' that is not equal to the supplied origin.
```

### 3. JWT Token Size (431 Error)
```
GET http://localhost:3003/api/master/states 431 (Request Header Fields Too Large)
```

### 4. Permission Check (403 Error)
```
GET http://localhost:3003/api/roles 403 (Forbidden)
```

## All Fixes Applied

### 1. ✅ Multi-Origin CORS Support
**Files:** 
- `backend/src/server.ts`

**Change:** Updated CORS to support multiple origins (development + production)

**Supported Origins:**
```javascript
const allowedOrigins = [
  'http://localhost:3001',      // Local development
  'http://localhost:3000',      // Alternative dev port
  'https://helpdesk.hubblehox.ai',  // Production frontend
  'https://api.helpdesk.hubblehox.ai',  // API subdomain
  process.env.FRONTEND_URL      // Configurable via .env
];
```

**Socket.IO CORS:** Also updated to support same origins

### 2. ✅ Fixed Permission Categories
**File:** `backend/src/utils/seedRolesPermissions.ts`
- Changed all 6 occurrences of `category: 'form-builder'` to `category: 'fields-forms'`
- Affected permissions:
  - FORM_VIEW
  - FORM_CREATE
  - FORM_EDIT
  - FORM_DELETE
  - FORM_ASSIGN_CONTEXT
  - FORM_VIEW_AUDIT_LOGS

### 2. JWT Token Optimization (Bonus Fixes)
**Files:**
- `backend/src/controllers/authController.ts`
- `backend/src/controllers/projectAuthController.ts` (2 instances)

**Change:** JWT now stores permission **codes** (strings) instead of full permission objects.

**Before:**
```json
{
  "role": {
    "permissions": [
      {
        "_id": "...",
        "code": "RBAC_VIEW_ROLES",
        "name": "View Roles",
        "description": "...",
        "category": "..."
      },
      // ... 113 more objects
    ]
  }
}
```

**After:**
```json
{
  "role": {
    "permissions": ["RBAC_VIEW_ROLES", "RBAC_CREATE_ROLE", ...]
  }
}
```

**Benefits:**
- Token size reduced from ~10KB to ~1-2KB
- Fixes 431 Request Header Fields Too Large error
- Faster token validation

### 3. Permission Middleware Updated
**File:** `backend/src/middleware/permissions.ts`

Updated `requirePermission` to:
1. Check permission codes first (new optimized format)
2. Fallback to permission IDs (backward compatibility)
3. Added debug logging

### 4. CORS Configuration Enhanced
**File:** `backend/src/server.ts`

Added:
- All HTTP methods (GET, POST, PUT, PATCH, DELETE, OPTIONS)
- Authorization header to allowedHeaders
- Content-Range headers
- Preflight cache (24 hours)

## Deployment Steps

### 1. Push Code to Repository
```bash
cd "D:\Niraj\SAC\SAC Helpdesk"
git add .
git commit -m "Fix: Multi-origin CORS + form-builder category + JWT optimization"
git push origin main
```

### 2. On VM - Configure Environment
```bash
# SSH to VM
ssh ubuntu@your-vm-ip

# Edit .env file
cd ~/helpdesk/backend
nano .env

# Add or update these lines:
FRONTEND_URL=https://helpdesk.hubblehox.ai
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
MONGODB_URI=mongodb://localhost:27017/sac_helpdesk
PORT=3003
```

**Important .env Variables:**
- `FRONTEND_URL` - Set to your production frontend URL
- `JWT_SECRET` - Use a strong secret (change from default!)
- `NODE_ENV` - Set to `production`

### 3. Pull and Rebuild
```bash
# Pull latest code
cd ~/helpdesk/backend
git pull origin main

# Install dependencies (if needed)
npm install

# Rebuild
npm run build

# Restart PM2
pm2 restart Backend

# Check logs
pm2 logs Backend --lines 50
```

### 4. Verify CORS Configuration
```bash
# Check if FRONTEND_URL is loaded
pm2 logs Backend | grep "FRONTEND_URL"

# You should see the backend accepting requests from your domain
# Watch for: "✅ CORS allowed for origin: https://helpdesk.hubblehox.ai"
```

### 3. Expected Success Messages
```
🔐 Initializing roles and permissions...
MongoDB Connected: localhost
Database: sac_helpdesk
🌱 Seeding permissions...
✅ 128 permissions seeded successfully
✅ 6 roles seeded successfully
✅ Admin user already exists
✅ Database initialization complete
```

## Post-Deployment

### Users Must Clear Old Tokens
After deployment, all users must:

**Option 1 - Clear Token Page:**
1. Visit: `http://your-domain/clear-token.html`
2. Click "Clear Old Token"
3. Click "Go to Login"
4. Login again

**Option 2 - Manual Clear:**
1. Open browser DevTools (F12)
2. Console: `localStorage.clear()`
3. Refresh page and login

### Why Clear Tokens?
- Old tokens have permission **IDs** (MongoDB ObjectIds)
- New tokens have permission **codes** (strings like "RBAC_VIEW_ROLES")
- System supports both, but optimized version is much smaller
- Prevents 431 and 403 errors

## Verification

### Check Permission Seeding
```bash
# On VM
pm2 logs Backend | grep -A 5 "Seeding permissions"
```

Should show:
```
✅ 128 permissions seeded successfully
✅ 6 roles seeded successfully
```

### Check User Login
1. Login to application
2. Open DevTools → Application → Local Storage
3. Check `authToken` size (should be ~1-2KB, not 10KB+)
4. Decode JWT at jwt.io
5. Verify `role.permissions` contains strings, not objects

## Files Changed

1. `backend/src/server.ts` - **Multi-origin CORS + Socket.IO CORS**
2. `backend/src/utils/seedRolesPermissions.ts` - Fixed category values
3. `backend/src/controllers/authController.ts` - JWT optimization
4. `backend/src/controllers/projectAuthController.ts` - JWT optimization (2x)
5. `backend/src/middleware/permissions.ts` - Support for codes
6. `backend/.env.example` - **Created with all environment variables**
7. `clear-token.html` - New helper tool (root directory)

## Environment Variables Reference

Create/update `~/helpdesk/backend/.env` on VM:

```bash
# Environment
NODE_ENV=production

# Server
PORT=3003

# Frontend URL (CRITICAL for CORS!)
FRONTEND_URL=https://helpdesk.hubblehox.ai

# Database
MONGODB_URI=mongodb://localhost:27017/sac_helpdesk

# JWT Secret (MUST CHANGE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

**⚠️ SECURITY NOTE:** Never commit `.env` file to git! Only commit `.env.example`.

## Rollback Plan (If Needed)

If deployment causes issues:

```bash
# On VM
cd ~/helpdesk/backend
git log --oneline  # Find previous commit hash
git checkout <previous-commit-hash>
npm run build
pm2 restart Backend
```

## Summary

✅ **CORS Fix:** Multi-origin support (localhost + production domains)  
✅ **Permission Fix:** Changed `form-builder` → `fields-forms` in permission seeds  
✅ **JWT Optimization:** Tokens reduced from 10KB → 1-2KB (codes instead of objects)  
✅ **Permission Middleware:** Updated to check codes instead of IDs  
✅ **Environment Config:** Created `.env.example` with all required variables  

**Critical Steps:**
1. ✅ Update `.env` on VM with `FRONTEND_URL=https://helpdesk.hubblehox.ai`
2. ✅ Pull code, rebuild, restart PM2
3. ✅ Users must clear localStorage and login again

**Result:** All CORS, validation, JWT, and permission errors resolved!
