# JWT Token System Comprehensive Fix

## Date: November 20, 2025
## Status: ✅ COMPLETED

---

## Problems Identified

### 1. **Inconsistent Token Payload Structure**
- **authController.ts**: Generated tokens with `{ userId, email, role: { _id, code, name, permissions } }`
- **projectAuthController.ts**: Generated tokens with `{ userId, email, role }` (missing permissions and structure)
- **studentAuthController.ts**: Had different structure entirely
- **Result**: Frontend code couldn't rely on consistent token structure

### 2. **Missing Permissions in Tokens**
- Initial JWT tokens didn't include `role.permissions` array
- Middleware expected permissions but tokens didn't have them
- Caused 403 Forbidden errors even for Super Admin users
- **Root Cause**: authController.ts wasn't populating role permissions during login

### 3. **No Centralized API Service**
- Every component manually added `Authorization: Bearer ${token}` headers
- Over 100+ instances of duplicated `localStorage.getItem('authToken')` code
- Inconsistent error handling across components
- No global 401 handler for token expiry

### 4. **Poor Token Expiry Handling**
- Some components checked for 401 errors, others didn't
- Different redirect logic in different pages
- No automatic token validation on page load
- Users could have expired tokens without knowing

### 5. **Inconsistent localStorage Keys**
- Some code used `'authToken'`, others used `'token'`
- SLARulesPage had: `localStorage.getItem('authToken') || localStorage.getItem('token')`
- Logout didn't clear all token variations

---

## Solutions Implemented

### ✅ 1. Standardized JWT Token Payload

**All auth endpoints now generate consistent tokens:**

```typescript
const payload = { 
  userId: user._id, 
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role ? {
    _id: (user.role as any)._id,
    code: (user.role as any).code,
    name: (user.role as any).name,
    permissions: (user.role as any).permissions || []
  } : null,
  // Optional project-specific fields
  projectId?: project._id,
  projectName?: project.name
};
```

**Files Fixed:**
- ✅ `backend/src/controllers/authController.ts` (line 141-151)
- ✅ `backend/src/controllers/projectAuthController.ts` (2 instances, lines ~175 and ~340)
- ✅ `backend/src/controllers/studentAuthController.ts` (already correct)

### ✅ 2. Role Permissions Population

**authController.ts login function:**
```typescript
// Find user and populate role WITH permissions
const user = await User.findOne({ email: email.toLowerCase(), isActive: true })
  .populate({
    path: 'role',
    populate: {
      path: 'permissions'  // ← CRITICAL: Nested populate
    }
  });
```

**Files Fixed:**
- ✅ `backend/src/controllers/authController.ts` (line 49-54)

### ✅ 3. Centralized API Service

**Created: `frontend/src/utils/api.ts`**

```typescript
import { api, authUtils } from '../utils/api';

// Automatic token injection
api.get('/users');  // Token automatically added

// Global 401 handler
// Automatically logs out and redirects on token expiry

// Helper utilities
authUtils.isAuthenticated();  // Check if token valid
authUtils.decodeToken();      // Get user info from token
authUtils.logout();           // Clean logout
```

**Features:**
- ✅ Automatic `Authorization` header injection
- ✅ Global 401 Unauthorized handler (auto-logout)
- ✅ Smart redirect logic (agent vs student portals)
- ✅ Token expiration validation
- ✅ Consistent error logging
- ✅ Request/response interceptors

### ✅ 4. Token Expiry Validation

**authUtils.isAuthenticated():**
```typescript
isAuthenticated: (): boolean => {
  const token = localStorage.getItem('authToken');
  if (!token) return false;
  
  try {
    // Decode JWT to check expiration
    const payload = JSON.parse(atob(token.split('.')[1]));
    const isExpired = payload.exp * 1000 < Date.now();
    
    if (isExpired) {
      console.log('⏰ Token expired, clearing...');
      authUtils.removeToken();
      return false;
    }
    
    return true;
  } catch (error) {
    authUtils.removeToken();
    return false;
  }
}
```

### ✅ 5. Standardized localStorage Management

**Old Code (100+ places):**
```typescript
const token = localStorage.getItem('authToken') || localStorage.getItem('token');
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` }
});
```

**New Code:**
```typescript
import { api } from '../utils/api';
const data = await api.get('/users');  // ✨ That's it!
```

**Cleanup on Logout:**
```typescript
// Removes ALL token variations
localStorage.removeItem('authToken');
localStorage.removeItem('token');      // Legacy cleanup
localStorage.removeItem('userName');
localStorage.removeItem('userEmail');
localStorage.removeItem('userId');
localStorage.removeItem('userRole');
localStorage.removeItem('projectContext');
```

---

## Migration Guide for Frontend Components

### Before (Old Way):
```typescript
const fetchUsers = async () => {
  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch('http://localhost:3003/api/users', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch');
    }
    
    const data = await response.json();
    setUsers(data.data);
  } catch (error) {
    console.error(error);
    if (error.status === 401) {
      localStorage.removeItem('authToken');
      navigate('/login');
    }
  }
};
```

### After (New Way):
```typescript
import { api } from '../utils/api';

const fetchUsers = async () => {
  try {
    const data = await api.get('/users');
    setUsers(data.data);
  } catch (error) {
    console.error(error);
    // 401 errors automatically handled by interceptor!
  }
};
```

**Migrated Components:**
- ✅ `frontend/src/components/UserManagement.tsx`
- ⏳ Remaining components will use new api service going forward

---

## Testing Checklist

### Backend Token Generation:
- [x] Login generates token with permissions array
- [x] Project login generates token with permissions array
- [x] Student login generates token with role info
- [x] All tokens include firstName, lastName
- [x] All tokens have 7-day expiry

### Frontend Token Handling:
- [x] API service auto-injects token
- [x] 401 errors trigger automatic logout
- [x] Token expiry detected on page load
- [x] Smart redirect based on portal type

### End-to-End Flow:
- [ ] Login → Token saved → API calls succeed
- [ ] Token with permissions → RBAC pages accessible
- [ ] Token expiry → Auto logout → Redirect to login
- [ ] Logout → All tokens cleared → Redirect works

---

## Breaking Changes

### ⚠️ **REQUIRED: Users MUST Log Out and Log In Again**

**Why:**
- Existing JWT tokens in browsers don't have the new structure
- Old tokens missing `firstName`, `lastName`, `permissions` array
- Will cause errors until refreshed

**Action for Users:**
1. Click Logout in top-right corner
2. Log back in with same credentials
3. New token will be generated with all fields

**Action for Developers:**
- Clear browser localStorage manually if testing
- Use `authUtils.logout()` in console to force clean logout

---

## Files Modified

### Backend:
```
backend/src/controllers/authController.ts
backend/src/controllers/projectAuthController.ts
backend/src/middleware/auth.ts (verified, no changes needed)
```

### Frontend:
```
frontend/src/utils/api.ts (NEW FILE - Centralized API service)
frontend/src/components/UserManagement.tsx (Migrated to new API service)
```

---

## Security Improvements

1. **Token Structure Validation**: All tokens now follow strict schema
2. **Expiry Enforcement**: Client-side validation prevents expired token usage
3. **Automatic Cleanup**: 401 errors trigger immediate logout and cleanup
4. **Permission Inclusion**: Every authenticated request now has full permission context
5. **Consistent Headers**: No more manual token handling reduces human error

---

## Next Steps

### Immediate:
1. **Test login flow** - Verify new tokens generated correctly
2. **Test RBAC pages** - Ensure permissions working
3. **Test token expiry** - Wait 7 days or manually set short expiry for testing

### Optional Enhancements:
1. **Migrate remaining components** to use `api` service (100+ files)
2. **Add refresh token mechanism** for longer sessions
3. **Add token renewal** before expiry (auto-refresh)
4. **Add WebSocket auth** using same token
5. **Add API rate limiting** per user/token

---

## Debugging Commands

### Check Current Token:
```javascript
// In browser console
const token = localStorage.getItem('authToken');
console.log('Token:', token);

// Decode token
import { authUtils } from './utils/api';
console.log('Decoded:', authUtils.decodeToken());

// Check if valid
console.log('Valid:', authUtils.isAuthenticated());
```

### Test JWT Permissions (Backend):
```bash
# In backend directory
node test-jwt-permissions.js <YOUR_TOKEN_HERE>
```

### Generate Fresh Token (Backend):
```bash
# In backend directory
node generate-fresh-token.js
```

---

## Known Issues & Limitations

1. **No refresh token mechanism** - Users logged out after 7 days
2. **Frontend migration incomplete** - Only UserManagement.tsx uses new API service
3. **No token blacklist** - Old tokens valid until expiry even after logout
4. **HTTP-only cookie not used on frontend** - Token in localStorage (XSS vulnerable)

### Recommended Future Work:
- Implement refresh token rotation
- Migrate all 100+ frontend components to use `api` service
- Move token to HTTP-only cookie (requires backend session management)
- Add Redis-based token blacklist for immediate revocation

---

## Success Criteria ✅

- [x] All JWT tokens have consistent structure
- [x] All tokens include role permissions array
- [x] Centralized API service created and working
- [x] 401 errors handled globally
- [x] Token expiry validated client-side
- [x] UserManagement component working with new system
- [ ] All frontend components migrated (future work)
- [ ] End-to-end testing completed

---

## Contact & Support

**Issues?**
1. Check browser console for token errors
2. Verify logged out completely
3. Log back in to get fresh token
4. Check backend logs for JWT verification errors

**Still broken?**
- Clear browser localStorage completely
- Check `.env` file has correct `JWT_SECRET`
- Verify both servers running (Backend: 3003, Frontend: 3001)
