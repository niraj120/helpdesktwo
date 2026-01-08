# Before & After Code Examples

## 1. Interface Definition

### BEFORE
```typescript
interface Student {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}
```

### AFTER
```typescript
interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}
```

---

## 2. State Management

### BEFORE (Registration Tab)
```typescript
// Student Registration States
const [studentForm, setStudentForm] = useState<Record<string, any>>({});
const [searchEmail, setSearchEmail] = useState('');
const [foundStudent, setFoundStudent] = useState<Student | null>(null);
const [registering, setRegistering] = useState(false);
const [registerSuccess, setRegisterSuccess] = useState(false);
```

### AFTER (Registration Tab)
```typescript
// User Registration States
const [userForm, setUserForm] = useState<Record<string, any>>({});
const [searchEmail, setSearchEmail] = useState('');
const [foundUser, setFoundUser] = useState<User | null>(null);
const [registering, setRegistering] = useState(false);
const [registerSuccess, setRegisterSuccess] = useState(false);
const [userSearched, setUserSearched] = useState(false);        // NEW
const [searchLoading, setSearchLoading] = useState(false);      // NEW
```

### BEFORE (Ticket Tab)
```typescript
// Ticket Creation States
const [ticketForm, setTicketForm] = useState<Record<string, any>>({
  studentEmail: '',
  markAsResolved: false,
  needsEscalation: false,
  escalationReason: '',
  escalateTo: '',
});
const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
```

### AFTER (Ticket Tab)
```typescript
// Ticket Creation States
const [ticketForm, setTicketForm] = useState<Record<string, any>>({
  userEmail: '',           // RENAMED
  userId: '',              // NEW - auto-populated field
  markAsResolved: false,
  needsEscalation: false,
  escalationReason: '',
  escalateTo: '',
});
const [selectedUser, setSelectedUser] = useState<User | null>(null);    // RENAMED
const [ticketUserSearched, setTicketUserSearched] = useState(false);    // NEW
```

---

## 3. Search Functions

### BEFORE - searchStudent()
```typescript
const searchStudent = async () => {
  if (!searchEmail.trim()) return;

  try {
    const token = localStorage.getItem('authToken');
    const response = await axios.get(
      `http://localhost:3003/api/users/search?email=${searchEmail}&projectId=${projectId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.data.success && response.data.data) {
      setFoundStudent(response.data.data);
      // Auto-populate form...
      setStudentForm(updatedForm);
    } else {
      setFoundStudent(null);
      setStudentForm(updatedForm);
    }
  } catch (error) {
    console.error('Error searching student:', error);
    setFoundStudent(null);
  }
};
```

### AFTER - searchUser()
```typescript
const searchUser = async () => {
  if (!searchEmail.trim()) return;

  setSearchLoading(true);                    // NEW - show loading
  setUserSearched(false);                    // NEW - reset search state
  setFoundUser(null);                        // NEW - clear previous result

  try {
    const token = localStorage.getItem('authToken');
    const response = await axios.get(
      `http://localhost:3003/api/users/search?email=${searchEmail}&projectId=${projectId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.data.success && response.data.data) {
      setFoundUser(response.data.data);
      // Auto-populate form...
      setUserForm(updatedForm);
    } else {
      setFoundUser(null);
      setUserForm(updatedForm);
    }
    setUserSearched(true);                   // NEW - mark search complete
  } catch (error) {
    console.error('Error searching user:', error);
    setFoundUser(null);
    setUserSearched(true);                   // NEW - mark search complete
  } finally {
    setSearchLoading(false);                 // NEW - clear loading
  }
};
```

---

## 4. Ticket Search Function

### BEFORE - searchStudentForTicket()
```typescript
const searchStudentForTicket = async () => {
  if (!ticketForm.studentEmail.trim()) return;

  try {
    const token = localStorage.getItem('authToken');
    const response = await axios.get(
      `http://localhost:3003/api/users/search?email=${ticketForm.studentEmail}&projectId=${projectId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.data.success && response.data.data) {
      setSelectedStudent(response.data.data);
    } else {
      alert('Student not found. Please register them first.');
      setSelectedStudent(null);
    }
  } catch (error) {
    console.error('Error searching student:', error);
    alert('Error finding student. Please try again.');
    setSelectedStudent(null);
  }
};
```

### AFTER - searchUserForTicket()
```typescript
const searchUserForTicket = async () => {
  if (!ticketForm.userEmail.trim()) return;

  try {
    const token = localStorage.getItem('authToken');
    const response = await axios.get(
      `http://localhost:3003/api/users/search?email=${ticketForm.userEmail}&projectId=${projectId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.data.success && response.data.data) {
      setSelectedUser(response.data.data);
      setTicketForm(prev => ({                // NEW - auto-populate userId
        ...prev,
        userId: response.data.data._id,
      }));
      setTicketUserSearched(true);            // NEW - mark search complete
    } else {
      alert('User not found. Please register them first.');
      setSelectedUser(null);
      setTicketForm(prev => ({                // NEW - clear userId
        ...prev,
        userId: '',
      }));
      setTicketUserSearched(true);            // NEW - mark search complete
    }
  } catch (error) {
    console.error('Error searching user:', error);
    alert('Error finding user. Please try again.');
    setSelectedUser(null);
    setTicketUserSearched(false);             // NEW - reset on error
  }
};
```

---

## 5. Ticket Creation

### BEFORE - handleCreateTicket()
```typescript
const handleCreateTicket = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!selectedStudent) {
    alert('Please select a student first');
    return;
  }
  
  // ... validation...
  
  try {
    const token = localStorage.getItem('authToken');
    const formData = new FormData();
    
    // Add ticket fields...
    
    formData.append('studentId', selectedStudent._id);
    formData.append('projectId', projectId);
    // ... rest of submission...
```

### AFTER - handleCreateTicket()
```typescript
const handleCreateTicket = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!selectedUser) {                        // RENAMED
    alert('Please search and select a user first');  // UPDATED message
    return;
  }
  
  // ... validation...
  
  try {
    const token = localStorage.getItem('authToken');
    const formData = new FormData();
    
    // Add ticket fields...
    
    formData.append('userId', selectedUser._id);          // NEW - primary ID
    formData.append('studentId', selectedUser._id);       // Keep for backwards compat
    formData.append('projectId', projectId);
    // ... rest of submission...
```

---

## 6. Registration Tab - Search UI

### BEFORE
```jsx
<div className="mb-6">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Search Student by Email
  </label>
  <div className="flex space-x-2">
    <input
      type="email"
      value={searchEmail}
      onChange={(e) => setSearchEmail(e.target.value)}
      onKeyPress={(e) => e.key === 'Enter' && searchStudent()}
      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg..."
      placeholder="student@example.com"
    />
    <button
      onClick={searchStudent}
      className="px-6 py-2 bg-blue-600 text-white rounded-lg..."
    >
      <MagnifyingGlassIcon className="h-5 w-5" />
      <span>Search</span>
    </button>
  </div>
  {foundStudent && (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <p className="text-sm text-blue-900">
        ✓ Student found: <strong>{foundStudent.firstName} {foundStudent.lastName}</strong>
      </p>
    </div>
  )}
</div>
```

### AFTER
```jsx
<div className="mb-6">
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Search User by Email
  </label>
  <div className="flex space-x-2">
    <input
      type="email"
      value={searchEmail}
      onChange={(e) => setSearchEmail(e.target.value)}
      onKeyPress={(e) => e.key === 'Enter' && searchUser()}   // RENAMED
      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg..."
      placeholder="user@example.com"                           // UPDATED
    />
    <button
      onClick={searchUser}                                     // RENAMED
      disabled={searchLoading}                                 // NEW - disable during search
      className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400..."
    >
      {searchLoading ? (                                       // NEW - show spinner
        <>
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
        </>
      ) : (
        <>
          <MagnifyingGlassIcon className="h-5 w-5" />
          <span>Search</span>
        </>
      )}
    </button>
  </div>
  {userSearched && (                                           // NEW - conditional rendering
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      {foundUser ? (
        <div>
          <p className="text-sm text-blue-900 flex items-center space-x-2">
            <CheckCircleIcon className="h-5 w-5" />
            <span>
              User found: <strong>{foundUser.firstName} {foundUser.lastName}</strong>
            </span>
          </p>
          <p className="text-xs text-blue-700 mt-1">
            This user is already registered in the system.
          </p>
        </div>
      ) : (
        <p className="text-sm text-blue-900">
          User not found. Complete the registration form below to create a new user.
        </p>
      )}
    </div>
  )}
</div>
```

---

## 7. Create Ticket Tab - User Search UI

### BEFORE
```jsx
<form onSubmit={handleCreateTicket} className="space-y-6">
  {/* Student Search */}
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Student Email <span className="text-red-500">*</span>
    </label>
    <div className="flex space-x-2">
      <input
        type="email"
        required
        value={ticketForm.studentEmail}
        onChange={(e) => setTicketForm({ ...ticketForm, studentEmail: e.target.value })}
        onKeyPress={(e) => e.key === 'Enter' && searchStudentForTicket()}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg..."
        placeholder="student@example.com"
      />
      <button
        type="button"
        onClick={searchStudentForTicket}
        className="px-6 py-2 bg-gray-600 text-white rounded-lg..."
      >
        <MagnifyingGlassIcon className="h-5 w-5" />
        <span>Find</span>
      </button>
    </div>
    {selectedStudent && (
      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm text-green-900">
          ✓ Student: <strong>{selectedStudent.firstName} {selectedStudent.lastName}</strong> ({selectedStudent.email})
        </p>
      </div>
    )}
  </div>
```

### AFTER
```jsx
<form onSubmit={handleCreateTicket} className="space-y-6">
  {/* User Search - WITH WARNING BOX */}
  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">  {/* NEW */}
    <p className="text-sm text-amber-900 mb-3">
      <span className="font-semibold">Important:</span> You must search for and select a user before creating a ticket.
    </p>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        User Email <span className="text-red-500">*</span>
      </label>
      <div className="flex space-x-2">
        <input
          type="email"
          required
          value={ticketForm.userEmail}
          onChange={(e) => {                                   // NEW - reset search on change
            setTicketForm({ ...ticketForm, userEmail: e.target.value });
            setTicketUserSearched(false);
            setSelectedUser(null);
          }}
          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), searchUserForTicket())}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg..."
          placeholder="user@example.com"
        />
        <button
          type="button"
          onClick={searchUserForTicket}
          className="px-6 py-2 bg-gray-600 text-white rounded-lg..."
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
          <span>Find</span>
        </button>
      </div>
    </div>
    {ticketUserSearched && (                                  {/* NEW - conditional feedback */}
      <div className="mt-3">
        {selectedUser ? (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-900 flex items-center space-x-2">
              <CheckCircleIcon className="h-5 w-5" />
              <span>
                User: <strong>{selectedUser.firstName} {selectedUser.lastName}</strong> ({selectedUser.email})
              </span>
            </p>
          </div>
        ) : (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-900 flex items-center space-x-2">
              <ExclamationCircleIcon className="h-5 w-5" />
              <span>User not found. Please register them first.</span>
            </p>
          </div>
        )}
      </div>
    )}
  </div>
```

---

## 8. Create Ticket Button

### BEFORE
```jsx
<button
  type="submit"
  disabled={creatingTicket || !selectedStudent}
  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
>
  {creatingTicket ? (
    <>
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
      <span>Creating...</span>
    </>
  ) : (
    <>
      <TicketIcon className="h-5 w-5" />
      <span>Create Ticket</span>
    </>
  )}
</button>
```

### AFTER
```jsx
<button
  type="submit"
  disabled={creatingTicket || !selectedUser}              {/* RENAMED to selectedUser */}
  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
>
  {creatingTicket ? (
    <>
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
      <span>Creating...</span>
    </>
  ) : selectedUser ? (                                   {/* NEW - contextual text */}
    <>
      <TicketIcon className="h-5 w-5" />
      <span>Create Ticket</span>
    </>
  ) : (                                                  {/* NEW - show when disabled */}
    <>
      <ExclamationCircleIcon className="h-5 w-5" />
      <span>Select User First</span>
    </>
  )}
</button>
```

---

## 9. Form Reset

### BEFORE - On Ticket Success
```typescript
setTimeout(() => {
  setTicketSuccess(false);
  const resetForm: Record<string, any> = {
    studentEmail: '',
    markAsResolved: false,
    needsEscalation: false,
    escalationReason: '',
    escalateTo: '',
  };
  offlineSettings?.ticketFields.forEach((field) => {
    resetForm[field.fieldName] = field.fieldType === 'file' ? [] : '';
  });
  setTicketForm(resetForm);
  setSelectedStudent(null);
  setCreatedTicketNumber('');
}, 5000);
```

### AFTER - On Ticket Success
```typescript
setTimeout(() => {
  setTicketSuccess(false);
  const resetForm: Record<string, any> = {
    userEmail: '',
    userId: '',                              {/* NEW */}
    markAsResolved: false,
    needsEscalation: false,
    escalationReason: '',
    escalateTo: '',
  };
  offlineSettings?.ticketFields.forEach((field) => {
    resetForm[field.fieldName] = field.fieldType === 'file' ? [] : '';
  });
  setTicketForm(resetForm);
  setSelectedUser(null);                     {/* RENAMED */}
  setTicketUserSearched(false);              {/* NEW - reset search state */}
  setCreatedTicketNumber('');
}, 5000);
```

---

## Summary of Changes

| Category | Before | After | Type |
|----------|--------|-------|------|
| Interface | `Student` | `User` | Renamed |
| Variable | `studentForm` | `userForm` | Renamed |
| Variable | `foundStudent` | `foundUser` | Renamed |
| Variable | `selectedStudent` | `selectedUser` | Renamed |
| Variable | `studentEmail` | `userEmail` | Renamed |
| Function | `searchStudent()` | `searchUser()` | Renamed |
| Function | `handleRegisterStudent()` | `handleRegisterUser()` | Renamed |
| Function | `searchStudentForTicket()` | `searchUserForTicket()` | Renamed |
| State | N/A | `userSearched` | Added |
| State | N/A | `searchLoading` | Added |
| State | N/A | `userId` in ticketForm | Added |
| State | N/A | `ticketUserSearched` | Added |
| Feature | Manual search | Auto-population on found | Enhanced |
| Feature | Basic feedback | Color-coded boxes | Enhanced |
| Feature | Always enabled | Disabled until user found | Added |
| Feature | N/A | "Select User First" text | Added |
| Data | N/A | userId auto-populated | Added |
| UI | Simple search | Warning + search + feedback | Enhanced |

---

**Total Changes**: 28 modifications
**Files Changed**: 1 (AgentOfflineModule.tsx)
**Lines Added**: ~150
**Lines Removed**: ~80
**Net Change**: +70 lines
