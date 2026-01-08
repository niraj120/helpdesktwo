# Student Registration & Login Flow - Complete Guide

## Overview
When an agent registers a student through the **Offline Support** module, the student automatically gets a login account and can access their dedicated student portal.

---

## 🔄 Complete Workflow

### Phase 1: Agent Registers Student (Offline Module)

**URL**: `http://localhost:3001/studentassistcenter/portal/login`

1. **Agent logs in** to project-specific portal
2. **Navigates to** "Offline Support" menu
3. **Searches for student** by Name, Email, or Phone
4. **If not found**, clicks "Register New Student"
5. **Fills registration form**:
   - First Name (required)
   - Last Name (required)
   - Email ID (required)
   - Mobile Number (required)
   - Parent Contact (required)
   - Any additional custom fields added by super admin

6. **Submits registration**
7. **System automatically**:
   - Creates user account with STUDENT role
   - Maps student to current project
   - Generates default password: `{first4CharsOfEmail}{last4DigitsOfPhone}`
   - Example: Email `niraj.mishra1010@gmail.com` + Phone `9769406488` = Password: `nira6488`
   - Sets `requirePasswordSetup: true` flag
   - Hashes password with bcrypt

8. **Agent receives success alert** with:
   ```
   ✅ Student Registered Successfully!
   
   Name: NIRAJ MISHRA
   Email: niraj.mishra1010@gmail.com
   Default Password: nira6488
   
   ⚠️ IMPORTANT: Please share this password with the student securely.
   The student can login to the student portal using:
   Email: niraj.mishra1010@gmail.com
   Password: nira6488
   
   They will be required to change their password on first login.
   ```

---

### Phase 2: Student First-Time Login (OTP-Based Password Setup)

**URL**: `http://localhost:3001/studentassistcenter/submit-ticket`

1. **Student visits** the ticket submission portal
2. **Clicks** "Already have an account? Login" button
3. **Login Modal Opens** - Student enters email
4. **System checks** if account exists and if password setup is required
5. **OTP Sent** to student's email address
6. **Student enters OTP** received in email
7. **OTP Verified** → Student gets temporary token
8. **Set New Password** screen appears:
   - Enter new password (min 8 characters)
   - Confirm new password
   - Password must match
9. **Password Set Successfully**:
   - `requirePasswordSetup` flag cleared
   - New password hashed and saved
   - Student receives JWT token
10. **Auto-redirect** to Student Dashboard

---

### Phase 3: Student Returning Login (Password-Based)

**URL**: `http://localhost:3001/studentassistcenter/submit-ticket`

1. **Student visits** ticket submission portal
2. **Clicks** "Already have an account? Login"
3. **Enters**:
   - Email address
   - Password (the one they set, NOT the default password)
4. **System validates**:
   - Email exists
   - User has STUDENT role
   - Password setup completed
   - Password matches hashed password
5. **Login successful** → JWT token generated
6. **Auto-redirect** to Student Dashboard

---

## 📍 Student Portal Routes

### Public Routes (No Login Required)
- `/studentassistcenter/submit-ticket` - Ticket submission & login
- `/studentassistcenter/kb` - Knowledge base viewer

### Protected Routes (Login Required)
- `/studentassistcenter/student/dashboard` - Student dashboard with tickets
- `/studentassistcenter/student/ticket/:ticketId` - Individual ticket details

---

## 🔐 Authentication Details

### Default Password Generation
```javascript
const defaultPassword = `${email.substring(0, 4)}${phone.slice(-4)}`;
```

**Examples**:
- Email: `john.doe@example.com`, Phone: `9876543210` → Password: `john3210`
- Email: `student@test.com`, Phone: `1234567890` → Password: `stud7890`

### Password Requirements (After First Login)
- Minimum 8 characters
- Must be set through OTP verification
- Stored as bcrypt hash (12 rounds)

### JWT Token
- **Expiry**: 7 days
- **Storage**: localStorage as `authToken`
- **Payload**:
  ```json
  {
    "userId": "...",
    "email": "student@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": {
      "_id": "...",
      "code": "STUDENT",
      "name": "Student"
    }
  }
  ```

---

## 🎯 Student Dashboard Features

Once logged in, students can:
- ✅ View all their submitted tickets
- ✅ Check ticket status (Open, In Progress, Resolved, Closed)
- ✅ View ticket details and conversation history
- ✅ Reply to tickets
- ✅ Upload attachments
- ✅ Submit new tickets
- ✅ Access knowledge base
- ✅ Update profile

---

## 🔧 Backend API Endpoints

### Student Registration (by Agent)
```http
POST /api/users/register-student
Authorization: Bearer {agent_token}

{
  "firstName": "NIRAJ",
  "lastName": "MISHRA",
  "email": "niraj.mishra1010@gmail.com",
  "phone": "9769406488",
  "parentMobile": "7400445752",
  "projectId": "6908806855106de325cb1354"
}

Response:
{
  "success": true,
  "message": "Student registered successfully",
  "data": {
    "_id": "...",
    "firstName": "NIRAJ",
    "lastName": "MISHRA",
    "email": "niraj.mishra1010@gmail.com",
    "phone": "9769406488",
    "parentMobile": "7400445752",
    "defaultPassword": "nira6488"  // Agent shares this with student
  }
}
```

### Student Authentication Flow

#### 1. Check User
```http
POST /api/student-auth/check-user

{
  "email": "student@example.com"
}

Response:
{
  "success": true,
  "data": {
    "userExists": true,
    "requirePasswordSetup": true,  // true for first-time users
    "firstName": "John"
  }
}
```

#### 2. Send OTP (First-time users)
```http
POST /api/student-auth/send-otp

{
  "email": "student@example.com"
}

Response:
{
  "success": true,
  "message": "OTP sent to your email"
}
```

#### 3. Verify OTP
```http
POST /api/student-auth/verify-otp

{
  "email": "student@example.com",
  "otp": "123456"
}

Response:
{
  "success": true,
  "data": {
    "tempToken": "..."  // Temporary token for password setup
  }
}
```

#### 4. Set Password
```http
POST /api/student-auth/set-password
Authorization: Bearer {temp_token}

{
  "password": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}

Response:
{
  "success": true,
  "data": {
    "token": "..."  // Permanent JWT token
  }
}
```

#### 5. Login (Returning users)
```http
POST /api/student-auth/login

{
  "email": "student@example.com",
  "password": "newSecurePassword123"
}

Response:
{
  "success": true,
  "data": {
    "token": "...",
    "user": {
      "_id": "...",
      "email": "student@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": {
        "code": "STUDENT",
        "name": "Student"
      }
    }
  }
}
```

---

## 🔄 Field Name Normalization

The backend automatically normalizes various field name formats:

| User-Friendly Name | Backend Field | Variations Accepted |
|-------------------|---------------|---------------------|
| First Name | `firstName` | "First Name", "firstname", "first_name" |
| Last Name | `lastName` | "Last Name", "lastname", "last_name" |
| Email ID | `email` | "Email", "Email ID", "email_id" |
| Mobile number | `phone` | "Phone", "Mobile", "mobile_number", "phone_number" |
| Parent Contact | `parentMobile` | "Parent Mobile", "parent_mobile", "parent_contact" |

This ensures registration works regardless of how super admin named the fields.

---

## ✅ Complete Flow Example

### Example Student: Niraj Mishra

1. **Agent Registers**:
   - First Name: NIRAJ
   - Last Name: MISHRA
   - Email: niraj.mishra1010@gmail.com
   - Phone: 9769406488
   - Parent: 7400445752
   - **Default Password Generated**: `nira6488`

2. **Agent Shares**:
   - Email: niraj.mishra1010@gmail.com
   - Password: nira6488

3. **Student First Login**:
   - Visits: `http://localhost:3001/studentassistcenter/submit-ticket`
   - Clicks "Login"
   - Enters email: niraj.mishra1010@gmail.com
   - Receives OTP on email
   - Enters OTP
   - Sets new password: "MyNewPassword2024!"
   - **Redirected to Dashboard**

4. **Student Next Login**:
   - Visits same URL
   - Clicks "Login"
   - Enters: niraj.mishra1010@gmail.com / MyNewPassword2024!
   - **Directly logged in to Dashboard**

---

## 🎨 UI/UX Flow

### Agent Side (Offline Support)
```
Search Student
    ↓
Not Found
    ↓
Register New Student Form
    ↓
Submit
    ↓
Success Alert with Default Password ← Agent shares this
    ↓
Create Ticket for Student (optional)
```

### Student Side (First Time)
```
Visit Ticket Portal
    ↓
Click "Login"
    ↓
Enter Email
    ↓
Receive OTP Email
    ↓
Enter OTP
    ↓
Set New Password
    ↓
Auto-Login
    ↓
Student Dashboard
```

### Student Side (Returning)
```
Visit Ticket Portal
    ↓
Click "Login"
    ↓
Enter Email + Password
    ↓
Auto-Login
    ↓
Student Dashboard
```

---

## 🛡️ Security Features

1. **Password Hashing**: bcrypt with 12 rounds
2. **JWT Tokens**: Signed with secret key, 7-day expiry
3. **OTP Verification**: Required for first-time password setup
4. **Role Validation**: Only STUDENT role can access student portal
5. **Email Verification**: OTP sent to registered email
6. **Password Requirements**: Minimum 8 characters
7. **Account Flag**: `requirePasswordSetup` prevents login without password change
8. **Field Normalization**: Prevents injection through field names

---

## 🚀 Testing Checklist

- [ ] Agent can register new student
- [ ] Default password displayed to agent
- [ ] Student can login with email
- [ ] OTP sent to student email
- [ ] Student can verify OTP
- [ ] Student can set new password
- [ ] Student redirected to dashboard
- [ ] Student can login again with new password
- [ ] Old default password no longer works
- [ ] Student can view tickets
- [ ] Student can create new tickets

---

## 📝 Notes

1. **Email Configuration**: Ensure email service (SendGrid/NodeMailer) is configured for OTP delivery
2. **Default Password**: Only works once - after student sets new password, default is invalidated
3. **Project Mapping**: Students are automatically mapped to the project from which they were registered
4. **Role Assignment**: STUDENT role must exist in database (run `seed-student-role.js` if needed)
5. **Token Storage**: Students use `authToken` key in localStorage (same as agents)

---

## 🔗 Related Documentation

- `AGENT_STUDENT_REGISTRATION_FLOW.md` - Detailed agent registration flow
- `STUDENT_WORKFLOW_IMPLEMENTATION.md` - Technical implementation details
- `STUDENT_WORKFLOW_QUICK_START.md` - Quick start guide
