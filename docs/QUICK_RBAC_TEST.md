# Quick RBAC Validation Checklist

**Run this 5-minute validation to verify RBAC is working**

## ✅ Pre-Test Setup

1. **Ensure servers are running:**
   ```bash
   # Backend should be running on http://localhost:3003
   # Frontend should be running on http://localhost:3000
   ```

2. **Login as Super Admin** to create test role

---

## 🧪 Quick Test (5 minutes)

### Step 1: Create Limited Test Role

1. Navigate to: `http://localhost:3000/rbac`
2. Click **"Add Role"**
3. Fill in:
   - **Name:** `Test Viewer`
   - **Code:** `TEST_VIEWER`
   - **Description:** `Limited permissions for testing`
4. Grant ONLY these permissions:
   - ✅ `TICKET_VIEW_OWN`
   - ✅ `USER_VIEW`
5. Click **Save**

**Expected:** Role created successfully ✓

---

### Step 2: Create Test User

1. Navigate to: `http://localhost:3000/users`
2. Click **"Add User"**
3. Fill in:
   - **First Name:** `Test`
   - **Last Name:** `Viewer`
   - **Email:** `test.viewer@example.com`
   - **Role:** Select `Test Viewer` (from dropdown)
   - **Password:** `Test@123`
4. Click **Save**

**Expected:** User created successfully ✓

---

### Step 3: Logout and Login as Test User

1. Click **Logout** (top right)
2. Login with:
   - **Email:** `test.viewer@example.com`
   - **Password:** `Test@123`

**Expected:** Login successful ✓

---

### Step 4: Check Sidebar Menu

**Look at the left sidebar. It should show ONLY:**

- ✅ 🏠 Dashboard
- ✅ 🎫 Tickets
- ✅ 👥 Users

**Should NOT show:**
- ❌ Projects
- ❌ Master Data
- ❌ RBAC Setup
- ❌ Reports
- ❌ Integrations
- ❌ Audit Logs
- ❌ SLA & Escalation
- ❌ Approval Workflows

**Result:** PASS ✓ / FAIL ✗

---

### Step 5: Test Route Protection

Try to access these URLs directly (paste in browser):

1. `http://localhost:3000/projects`
   - **Expected:** Redirected to dashboard or "Access Denied"

2. `http://localhost:3000/rbac`
   - **Expected:** Redirected to dashboard or "Access Denied"

3. `http://localhost:3000/master-data`
   - **Expected:** Redirected to dashboard or "Access Denied"

**Result:** PASS ✓ / FAIL ✗

---

### Step 6: Check Button Visibility

1. Navigate to: `http://localhost:3000/users`

**Check that these buttons are HIDDEN:**
- ❌ "Add User" button (top of page)
- ❌ Edit icons next to each user
- ❌ Delete icons next to each user
- ❌ "Reset Password" buttons

**The page should be READ-ONLY**

**Result:** PASS ✓ / FAIL ✗

---

### Step 7: Test API Protection (Advanced)

1. Press **F12** to open DevTools
2. Go to **Console** tab
3. Paste this code:

```javascript
fetch('http://localhost:3003/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('authToken')
  },
  body: JSON.stringify({
    firstName: 'Hack',
    lastName: 'Test',
    email: 'hack@test.com',
    role: '123'
  })
})
.then(r => r.json())
.then(d => console.log('API Response:', d))
```

4. Press **Enter**

**Expected Console Output:**
```json
{
  "message": "Access denied. You do not have permission: USER_CREATE",
  "statusCode": 403
}
```

**Result:** PASS ✓ / FAIL ✗

---

### Step 8: Test Token Invalidation

**This tests automatic logout when permissions change**

1. **Keep current browser tab open** (logged in as Test Viewer)

2. **Open NEW INCOGNITO WINDOW** and login as Super Admin

3. In incognito window:
   - Go to RBAC Management
   - Edit "Test Viewer" role
   - Add permission: `TICKET_VIEW_ALL`
   - Click Save

4. **Switch back to original tab** (Test Viewer still logged in)

5. Click on **any link** (e.g., click "Users" in sidebar)

**Expected:**
- Alert appears: "Your permissions have been updated. Please login again to continue."
- Automatically logged out
- Redirected to login page

**Result:** PASS ✓ / FAIL ✗

---

## 📊 Final Checklist

Mark each test:

- [ ] Role creation successful
- [ ] User creation successful  
- [ ] Sidebar shows only permitted menus
- [ ] Direct URL access blocked for unauthorized routes
- [ ] Action buttons hidden based on permissions
- [ ] API returns 403 for unauthorized actions
- [ ] Token invalidation works on permission change

---

## 🎯 Results

**Total Tests Passed:** _____ / 7

**Status:**
- ✅ **7/7 PASS** → RBAC is fully validated! 🎉
- ⚠️ **5-6/7 PASS** → Minor issues, review failures
- ❌ **<5/7 PASS** → Significant issues, code review needed

---

## 🐛 If Any Test Fails

### Sidebar still shows unauthorized menus
**Check:** `frontend/src/config/menuConfig.tsx`
- Verify each menu item has `requiredPermission` property
- Example: `requiredPermission: 'PROJECT_VIEW'`

### Routes accessible without permission
**Check:** `frontend/src/config/routePermissions.ts`
- Verify route is listed with required permission
**Check:** Route is wrapped in `<ProtectedRoute>` in App.tsx

### Buttons visible when they shouldn't be
**Check:** Component file (e.g., `UserManagement.tsx`)
- Verify button is wrapped: `{hasPermission('USER_CREATE') && (<button>...)}`
- Verify `usePermissions` hook is imported

### API doesn't return 403
**Check:** `backend/src/routes/userRoutes.ts`
- Verify route has: `requirePermission('USER_CREATE')`
- Verify middleware order: `[auth, requirePermission('...'), controller]`

### Token invalidation doesn't work
**Check:** 
- `backend/src/models/User.ts` - Has `tokenVersion` field?
- `backend/src/middleware/auth.ts` - Validates tokenVersion?
- `backend/src/controllers/roleController.ts` - Increments on change?
- `frontend/src/utils/api.ts` - Handles TOKEN_VERSION_MISMATCH?

---

## 📝 Document Your Results

Take screenshots of:
1. Limited sidebar (only Dashboard, Tickets, Users)
2. Access denied on unauthorized route
3. No action buttons in User Management
4. Console showing 403 API error
5. Token invalidation alert

Save to: `RBAC_TEST_RESULTS.md`

---

## 🚀 Next Steps

After successful validation:

1. **Clean up test data:**
   - Delete test user (`test.viewer@example.com`)
   - Delete test role (`Test Viewer`)

2. **Production checklist:**
   - Review all role permissions in database
   - Ensure default roles have correct permissions
   - Document permission codes for future features
   - Set up monitoring for 403 errors

3. **Developer documentation:**
   - Update README with RBAC usage
   - Document how to add new permissions
   - Create permission naming conventions guide

---

**Validation Complete!** 🎉

For detailed validation steps, see: `RBAC_VALIDATION_GUIDE.md`
