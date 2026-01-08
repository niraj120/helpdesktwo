# RBAC Permission to Page Mapping

**Date:** November 21, 2025  
**Purpose:** Document permission-to-page mapping for Center Manager and other roles

---

## ✅ Implemented Mappings

### 1. TICKET_ASSIGN Permission

**Permission Code:** `TICKET_ASSIGN`

**What it grants access to:**
- **Menu Item:** "Tickets" → "Assign Tickets" submenu
- **Route:** `/tickets/assign`
- **Page:** Ticket Assignment page
- **Features:**
  - View all tickets in the project
  - Multi-select tickets (checkboxes)
  - Assign selected tickets to any agent
  - Filter tickets by status
  - Search tickets by number, subject, or email
  - See current assignment status

**How to test:**
1. Login as user with `TICKET_ASSIGN` permission (e.g., Shubhangi Mathur)
2. Check sidebar - You should see "Tickets" menu item
3. Click "Tickets" → See submenu "Assign Tickets"
4. Click "Assign Tickets" → Opens `/tickets/assign` page
5. Select tickets, choose agent, click "Assign" button

---

### 2. AUDIT_VIEW_ACCESS Permission

**Permission Code:** `AUDIT_VIEW_ACCESS`

**What it grants access to:**
- **Menu Item:** "Audit Logs" → "Access Logs" submenu
- **Route:** `/audit/access-logs`
- **Page:** Access Logs page
- **Features:**
  - View all user login/logout activities
  - See authentication attempts
  - Filter by user, action type, date range
  - Export access logs
  - View IP addresses and user agents

**How to test:**
1. Login as user with `AUDIT_VIEW_ACCESS` permission (e.g., Shubhangi Mathur)
2. Check sidebar - You should see "Audit Logs" menu item
3. Click "Audit Logs" → See submenu "Access Logs"
4. Click "Access Logs" → Opens `/audit/access-logs` page
5. View all user access activities

---

## 📋 Complete Center Manager Access

Based on the current setup, a user with **Center Manager** role has:

### Granted Permissions:
1. ✅ `TICKET_ASSIGN` - Can assign tickets to agents
2. ✅ `AUDIT_VIEW_ACCESS` - Can view access logs

### What they can see in sidebar:
```
🏠 Dashboard
🎫 Tickets
   ├─ Assign Tickets  ← From TICKET_ASSIGN permission
📊 Audit Logs
   ├─ Access Logs  ← From AUDIT_VIEW_ACCESS permission
```

### What they CANNOT see (no permissions):
- ❌ Projects
- ❌ Master Data
- ❌ RBAC Setup
- ❌ User Management
- ❌ Ticket Configuration
- ❌ Offline Module Setup
- ❌ Approval Process
- ❌ SLA & Escalation
- ❌ Knowledge Base
- ❌ Integrations
- ❌ Reports
- ❌ Activity Logs (different from Access Logs)

---

## 🔍 Additional Ticket Permissions

If you want to grant more ticket-related access to Center Manager:

### TICKET_VIEW_ALL
- **Menu:** "Tickets" → "View Tickets"
- **Route:** `/tickets/view`
- **Access:** View all tickets in system (read-only)

### TICKET_VIEW_OWN
- **Menu:** "Tickets" → "View Tickets"
- **Route:** `/tickets/view`
- **Access:** View only tickets assigned to them or created by them

### TICKET_CREATE
- **Menu:** "Tickets" → "Create Ticket"
- **Route:** `/tickets/create`
- **Access:** Create new support tickets

### TICKET_EDIT
- **Access:** Edit existing tickets (details, description, category)

### TICKET_DELETE
- **Access:** Delete tickets (admin function)

### TICKET_COMMENT
- **Access:** Add comments/replies to tickets

### TICKET_CLOSE
- **Access:** Close/resolve tickets

---

## 🎯 How to Add More Permissions

### For Center Manager Role:

1. **Login as Super Admin**
2. **Navigate to:** RBAC Setup → Roles
3. **Find:** "Center Manager" role
4. **Click:** Edit button
5. **Add permissions** you want (e.g., check `TICKET_VIEW_ALL`)
6. **Click:** Save

**Result:** All users with Center Manager role will be automatically logged out and must re-login to see new menus.

---

## 📊 Permission Mapping Reference

| Permission Code | Menu Location | Page/Feature |
|----------------|---------------|--------------|
| `TICKET_VIEW_ALL` | Tickets → View Tickets | View all tickets |
| `TICKET_VIEW_OWN` | Tickets → View Tickets | View own tickets only |
| `TICKET_ASSIGN` | Tickets → Assign Tickets | Assign tickets to agents |
| `TICKET_CREATE` | Tickets → Create Ticket | Create new tickets |
| `TICKET_EDIT` | (Button on ticket detail) | Edit ticket details |
| `TICKET_DELETE` | (Button on ticket detail) | Delete tickets |
| `TICKET_COMMENT` | (Button on ticket detail) | Add comments |
| `TICKET_CLOSE` | (Button on ticket detail) | Close/resolve tickets |
| `AUDIT_VIEW_ACCESS` | Audit Logs → Access Logs | View login/logout logs |
| `AUDIT_VIEW_ACTIVITY` | Audit Logs → Activity Logs | View user activity logs |
| `USER_VIEW` | User Management | View users (read-only) |
| `USER_CREATE` | User Management | Create new users |
| `USER_EDIT` | User Management | Edit user details |
| `USER_DELETE` | User Management | Delete users |
| `PROJECT_VIEW` | Project Management | View projects |
| `PROJECT_CREATE` | Project Management | Create projects |
| `RBAC_VIEW_ROLES` | RBAC Setup | View roles |
| `RBAC_CREATE_ROLE` | RBAC Setup | Create new roles |

---

## 🚀 Testing the Implementation

### Test as Shubhangi Mathur (Center Manager):

1. **Login**
   - Email: `shubhangi.mathur@hubblehox.com`
   - Password: [Your password]

2. **Check API Response**
   - Open browser DevTools (F12)
   - Go to Console
   - Type: `localStorage.getItem('authToken')`
   - Copy token, paste at jwt.io
   - Verify payload shows:
     ```json
     {
       "role": {
         "name": "Center Manager",
         "permissions": ["TICKET_ASSIGN", "AUDIT_VIEW_ACCESS"]
       }
     }
     ```

3. **Verify Sidebar**
   - Should see: Dashboard, Tickets, Audit Logs
   - Should NOT see: Projects, RBAC, Master Data, etc.

4. **Test Ticket Assignment**
   - Click: Tickets → Assign Tickets
   - Should load `/tickets/assign` page
   - See list of all tickets
   - Multi-select checkboxes should work
   - Agent dropdown should populate
   - Assign button should work

5. **Test Access Logs**
   - Click: Audit Logs → Access Logs
   - Should load `/audit/access-logs` page
   - See login/logout history
   - Filter and search should work

---

## 🔐 Security Validation

All pages are protected at **THREE levels**:

### 1. Backend API Protection
```typescript
// Example: Ticket assignment endpoint
router.put('/:id/assign', 
  auth,  // Must be authenticated
  requirePermission('TICKET_ASSIGN'),  // Must have permission
  ticketController.assignTicket
);
```

### 2. Frontend Route Protection
```tsx
// App.tsx
<Route 
  path="/tickets/assign" 
  element={
    <ProtectedRoute permission="TICKET_ASSIGN">
      <TicketAssignment />
    </ProtectedRoute>
  } 
/>
```

### 3. Frontend Menu Visibility
```tsx
// menuConfig.tsx
{
  path: '/tickets/assign',
  label: 'Assign Tickets',
  permission: PERMISSIONS.TICKET_ASSIGN,
}
```

**Result:** If user doesn't have permission:
- ❌ Menu item hidden
- ❌ Route redirects to dashboard
- ❌ API returns 403 Forbidden

---

## 📝 Future Enhancements

When adding new features:

1. **Define Permission Code**
   - Add to `frontend/src/constants/permissions.ts`
   - Example: `TICKET_EXPORT: 'TICKET_EXPORT'`

2. **Create Backend Route**
   - Add to appropriate route file
   - Add `requirePermission()` middleware
   - Example: `router.get('/export', auth, requirePermission('TICKET_EXPORT'), controller.export)`

3. **Create Frontend Page/Component**
   - Create React component
   - Use `usePermissions()` hook for conditional rendering

4. **Add to Menu Config**
   - Add to `menuConfig.tsx` with `permission` property

5. **Add to Route Permissions**
   - Add to `routePermissions.ts` with permission requirement

6. **Add to App.tsx**
   - Wrap route with `<ProtectedRoute permission="...">`

7. **Assign to Roles**
   - Use RBAC UI to grant permission to desired roles
   - **No code deployment needed!**

---

## ✅ Implementation Complete

The Center Manager role is now fully functional with:
- ✅ Ticket Assignment capability
- ✅ Access Log viewing capability
- ✅ Dynamic menu based on permissions
- ✅ Protected routes
- ✅ Protected API endpoints
- ✅ Token invalidation on permission changes

**Any changes to the role permissions in the database will take effect immediately after user re-login!**
