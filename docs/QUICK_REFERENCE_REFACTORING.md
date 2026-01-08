# Quick Reference - User Search & Registration Refactoring

## File Modified
`frontend/src/pages/AgentOfflineModule.tsx`

## Key Terminology Replacements
| Old | New |
|-----|-----|
| `Student` interface | `User` interface |
| `studentForm` | `userForm` |
| `foundStudent` | `foundUser` |
| `selectedStudent` | `selectedUser` |
| `studentEmail` | `userEmail` |
| `searchStudent()` | `searchUser()` |
| `handleRegisterStudent()` | `handleRegisterUser()` |
| `searchStudentForTicket()` | `searchUserForTicket()` |

## New State Variables Added
```typescript
// Registration Tab
- userSearched: boolean           // Track if search was attempted
- searchLoading: boolean          // Show loading spinner

// Create Ticket Tab  
- ticketUserSearched: boolean     // Track if search was attempted
- userId in ticketForm            // Auto-populated field
```

## New Features

### Registration Tab
✅ User email search with loading indicator
✅ Auto-populate form fields if user found
✅ Show "Already Registered" if user exists
✅ Show registration form if user not found
✅ Pre-fill email field when not found

### Create Ticket Tab
✅ User email search with validation
✅ Prominent warning box requiring user search
✅ Auto-populate userId when user found
✅ Disable Create Ticket button until user selected
✅ Show contextual button text ("Select User First" vs "Create Ticket")
✅ Color-coded feedback (green = found, red = not found)

## Form Reset Behavior

### On Search Email Change
```typescript
setTicketForm({ ...ticketForm, userEmail: e.target.value });
setTicketUserSearched(false);    // Reset search state
setSelectedUser(null);            // Clear selected user
```

### On Registration Success
```typescript
setUserSearched(false);           // Reset search state
setSearchEmail('');               // Clear email
setFoundUser(null);               // Clear found user
// Reset userForm to empty
```

### On Ticket Creation Success
```typescript
setTicketUserSearched(false);     // Reset search state
setSelectedUser(null);            // Clear selected user
// Reset ticketForm to empty
```

## Component Behavior

### Registration Form
```
Agent searches email
├─ User FOUND
│  ├─ Auto-populate form fields
│  ├─ Show user details box
│  └─ "Already Registered" (disabled button)
└─ User NOT FOUND
   ├─ Pre-fill email field
   ├─ Show empty form fields
   └─ "Register User" (enabled button)
```

### Create Ticket Form
```
Agent searches email
├─ User FOUND
│  ├─ Set selectedUser
│  ├─ Auto-populate userId
│  ├─ Show green success box
│  └─ "Create Ticket" (enabled button)
└─ User NOT FOUND
   ├─ Keep selectedUser = null
   ├─ userId stays empty
   ├─ Show red error box
   └─ "Select User First" (disabled button)
```

## Auto-Population Rules

### Field Matching (Case-insensitive)
```typescript
"firstname" → user.firstName
"lastname" → user.lastName
"email" → user.email
"phone" OR "phonenumber" → user.phone
Other fields → empty (for manual entry)
```

## Button State Logic

### Register User Button
```typescript
disabled={registering || foundUser !== null}

States:
- foundUser = null ✓ Enable "Register User"
- foundUser ≠ null ✗ Disable "Already Registered"
- registering = true → Show "Registering..."
```

### Create Ticket Button
```typescript
disabled={creatingTicket || !selectedUser}

States:
- selectedUser ≠ null ✓ Enable "Create Ticket"
- selectedUser = null ✗ Disable "Select User First"
- creatingTicket = true → Show "Creating..."
```

## API Calls

### Search User
```typescript
GET /api/users/search?email=${userEmail}&projectId=${projectId}

Response: { success, data: { _id, firstName, lastName, email, phone } }
```

### Register User
```typescript
POST /api/users/register-student
Body: { ...userForm, projectId }

Response: { success, data: User }
```

### Create Ticket
```typescript
POST /api/tickets/offline-submission
FormData includes:
  - userId (auto-populated) ✨ NEW
  - studentId (backwards compat)
  - All ticket fields
  - Files if applicable

Response: { success, data: { ticketNumber } }
```

## Data Binding Examples

### Registration Tab Fields
```jsx
{renderDynamicField(
  field,
  userForm[field.fieldName],              // Current value
  (value) => setUserForm({ 
    ...userForm, 
    [field.fieldName]: value 
  })
)}
```

### Create Ticket Tab Fields
```jsx
{renderDynamicField(
  field,
  ticketForm[field.fieldName],            // Current value
  (value) => setTicketForm({ 
    ...ticketForm, 
    [field.fieldName]: value 
  })
)}
```

## Error Handling

### Search Errors
- Network error → "Error finding user. Please try again."
- Not found → "User not found. Please register them first." (red box)
- Empty email → Silently return (no search performed)

### Registration Errors
- API error → Alert with error message
- Validation error → Alert with error message

### Ticket Creation Errors
- No user selected → "Please search and select a user first"
- Escalation without agent → "Please select an agent to escalate to"
- API error → Alert with error message

## Visual Indicators

### Loading
```jsx
searchLoading && (
  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
)
```

### Success (Green)
```jsx
{selectedUser && (
  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
    ✓ User found details...
  </div>
)}
```

### Error (Red)
```jsx
{!selectedUser && ticketUserSearched && (
  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
    ✗ User not found...
  </div>
)}
```

### Warning (Amber)
```jsx
<div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
  <p className="text-sm text-amber-900 mb-3">
    <span className="font-semibold">Important:</span> 
    You must search for and select a user before creating a ticket.
  </p>
</div>
```

## Backwards Compatibility
✅ Both `userId` and `studentId` sent in ticket submission
✅ Existing API endpoints unchanged
✅ Old code can still reference `studentId`
✅ New code uses `userId` for direct mapping

## Performance Notes
- Search happens on "Search" button click (not on keystroke)
- Loading state prevents double-submissions
- Form fields only reset on success (not on every change)
- Auto-population only on successful search

---

**Last Updated**: 2024
**Status**: Production Ready
**Build**: Passing (723 modules, 8.98s)
