# Task 2.1 Installation and Testing Guide

## Overview
This task creates the API endpoints for adding and managing email configurations for projects. It includes IMAP/SMTP connection testing and password encryption.

## Files Created/Modified

### New Files:
1. `backend/src/models/ProjectEmailConfig.ts` - Model for storing email configurations
2. `backend/src/controllers/projectEmailConfigController.ts` - API controller for email config CRUD
3. `backend/src/routes/projectEmailConfigRoutes.ts` - API routes
4. `backend/migrations/create-project-email-configs.js` - Migration script
5. `backend/test-scripts/test-task-2.1-email-config-api.js` - Test script

### Modified Files:
1. `backend/src/server.ts` - Added model imports and routes

## Installation Steps

### 1. Install Required Dependencies
```bash
cd backend
npm install imap
npm install --save-dev @types/imap
```

### 2. Set Environment Variable for Encryption
Add to your `.env` file:
```env
# Email password encryption key (must be 32 characters)
EMAIL_ENCRYPTION_KEY=your-32-character-encryption-key-here!
```

**Important**: Generate a secure 32-character key for production. You can use:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 3. Run Migration
```bash
cd backend
node migrations/create-project-email-configs.js
```

Expected output:
- ✅ Collection created
- ✅ All 6 indexes created
- ✅ Password encryption verified
- ✅ Unique constraint tested

### 4. Start Backend Server
```bash
cd backend
npm run dev
```

Server should start on port 3003 (or your configured PORT).

### 5. Run Tests
```bash
cd backend
node test-scripts/test-task-2.1-email-config-api.js
```

Expected: 10 tests should pass

## API Endpoints

### 1. Add Email Configuration
```
POST /api/projects/:projectId/email-configs
Authorization: Bearer <token>
Content-Type: application/json

{
  "email_address": "support@example.com",
  "imap_host": "imap.gmail.com",
  "imap_port": 993,
  "imap_username": "support@example.com",
  "imap_password": "your-app-password",
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_username": "support@example.com",
  "smtp_password": "your-app-password"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Email configuration added successfully",
  "data": {
    "id": "65f...",
    "projectId": "65e...",
    "emailAddress": "support@example.com",
    "imapHost": "imap.gmail.com",
    "imapPort": 993,
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 587,
    "isEnabled": true,
    "lastCheckedAt": "2024-01-24T...",
    "lastCheckStatus": "success"
  }
}
```

### 2. Get Email Configurations
```
GET /api/projects/:projectId/email-configs
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "65f...",
      "projectId": "65e...",
      "emailAddress": "support@example.com",
      "imapHost": "imap.gmail.com",
      "imapPort": 993,
      "smtpHost": "smtp.gmail.com",
      "smtpPort": 587,
      "isEnabled": true,
      "lastCheckedAt": "2024-01-24T...",
      "lastCheckStatus": "success"
    }
  ]
}
```

**Note**: Passwords are excluded from the response for security.

### 3. Update Email Configuration
```
PUT /api/projects/:projectId/email-configs/:configId
Authorization: Bearer <token>
Content-Type: application/json

{
  "isEnabled": false
}
```

### 4. Delete Email Configuration
```
DELETE /api/projects/:projectId/email-configs/:configId
Authorization: Bearer <token>
```

## Validation Rules

### ✅ What Gets Validated:

1. **Project Exists**: Checks if project ID is valid and exists
2. **Email Format**: Must match regex `/^\S+@\S+\.\S+$/`
3. **Duplicate Email**: Same email cannot be added twice for the same project
4. **Port Numbers**: Must be between 1 and 65535
5. **Required Fields**: All 9 fields are required
6. **IMAP Connection**: Tests connection before saving
7. **SMTP Connection**: Tests connection before saving

### ❌ What Gets Rejected:

- Missing required fields → 400 Bad Request
- Invalid email format → 400 Bad Request
- Invalid project ID → 400 Bad Request
- Non-existent project → 404 Not Found
- Duplicate email (same project) → 409 Conflict
- Invalid port number → 400 Bad Request
- IMAP connection failure → 400 Bad Request (with error details)
- SMTP connection failure → 400 Bad Request (with error details)

## Security Features

### Password Encryption
- **Algorithm**: AES-256-CBC
- **Key**: 32-character encryption key from environment variable
- **IV**: Random 16-byte initialization vector per password
- **Storage Format**: `IV:ENCRYPTED_TEXT` (hex encoded)
- **Decryption**: Available via model methods:
  - `config.getDecryptedImapPassword()`
  - `config.getDecryptedSmtpPassword()`

### Pre-Save Hook
Automatically encrypts passwords before saving to database:
```typescript
ProjectEmailConfigSchema.pre('save', function(next) {
  if (this.isModified('imapPassword') && !this.imapPassword.includes(':')) {
    this.imapPassword = encrypt(this.imapPassword);
  }
  if (this.isModified('smtpPassword') && !this.smtpPassword.includes(':')) {
    this.smtpPassword = encrypt(this.smtpPassword);
  }
  next();
});
```

## Database Schema

### Collection: `projectemailconfigs`

**Fields:**
- `projectId` (ObjectId, indexed, required)
- `emailAddress` (String, indexed, lowercase, required)
- `isEnabled` (Boolean, indexed, default: true)
- `imapHost` (String, required)
- `imapPort` (Number, required, 1-65535)
- `imapUsername` (String, required)
- `imapPassword` (String, required, encrypted)
- `smtpHost` (String, required)
- `smtpPort` (Number, required, 1-65535)
- `smtpUsername` (String, required)
- `smtpPassword` (String, required, encrypted)
- `lastCheckedAt` (Date)
- `lastCheckStatus` (String, enum: 'success' | 'failed')
- `lastCheckError` (String)
- `createdAt` (Date, auto)
- `updatedAt` (Date, auto)

**Indexes:**
1. `projectId` (single)
2. `emailAddress` (single)
3. `isEnabled` (single)
4. `projectId + emailAddress` (unique compound)
5. `createdAt` (single)
6. `updatedAt` (single)

## Gmail Configuration Example

If using Gmail, you need to:
1. Enable 2-factor authentication
2. Generate an App Password
3. Use these settings:
   - IMAP Host: `imap.gmail.com`
   - IMAP Port: `993`
   - SMTP Host: `smtp.gmail.com`
   - SMTP Port: `587`
   - Username: Your Gmail address
   - Password: Your App Password (not regular password)

## Troubleshooting

### Connection Test Failures

**IMAP Connection Failed**:
- Check firewall allows port 993
- Verify credentials are correct
- Check if 2FA is enabled (use app password)
- Ensure "Less secure app access" is enabled (if applicable)

**SMTP Connection Failed**:
- Check firewall allows port 587
- Verify credentials are correct
- Try port 465 (SSL) instead of 587 (TLS)

### Encryption Errors

**"Unsupported state or unable to authenticate data"**:
- `EMAIL_ENCRYPTION_KEY` must be exactly 32 characters
- Check if key changed between encrypt/decrypt operations
- Verify key is the same in all environments

### Database Errors

**E11000 Duplicate Key Error**:
- Email already configured for this project
- Use GET endpoint to check existing configs
- Delete old config before adding new one with same email

## Testing Checklist

Run through this checklist after installation:

- [ ] Migration ran successfully
- [ ] All 6 indexes created
- [ ] Backend server starts without errors
- [ ] All 10 tests pass
- [ ] Can create email config (with real credentials)
- [ ] Passwords are encrypted in database (check MongoDB)
- [ ] Duplicate email rejected for same project
- [ ] Same email allowed for different projects
- [ ] Invalid email format rejected
- [ ] Invalid port numbers rejected
- [ ] Non-existent project rejected
- [ ] IMAP connection tested before saving
- [ ] SMTP connection tested before saving
- [ ] Can retrieve configs (passwords hidden)
- [ ] Can enable/disable configs
- [ ] Can delete configs

## Next Steps

After completing Task 2.1:
- **Task 2.2**: Implement IMAP connection service
- **Task 2.3**: Build email fetching service
- **Task 2.4**: Create email parser
- **Task 2.5**: Implement ticket creation from email
