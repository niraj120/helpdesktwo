# Backend Scripts Documentation

This document categorizes all scripts in the backend root directory for maintenance purposes.

## ⚠️ ONE-TIME MIGRATION SCRIPTS (Can be archived/removed after successful migration)

### Database Migration Scripts
- `migrate-auth-logs.js` - Migrates authentication logs to new schema
- `migrate-categories.js` - Migrates ticket categories
- `migrate-roles-projects.js` - Migrates roles and project mappings
- `migrate-statuses.js` - Migrates ticket statuses
- `migrate-submission-source.js` - Migrates ticket submission sources
- `migrate-users.js` - Migrates user data to new schema
- `drop-userId-index.js` - Drops old userId index (one-time fix)

### Initial Seeding Scripts (Run once during setup)
- `reseedPermissions.js` - Seeds initial permissions (run once during setup)
- `seed-offline-permissions.js` - Seeds offline module permissions
- `seed-sla.js` - Seeds initial SLA rules
- `seed-student-role.js` - Seeds student role permissions
- `activate-sla-rules.js` - Activates SLA rules after seeding

### Data Fix Scripts (One-time fixes)
- `fix-admin-role.js` - Fixes admin role permissions
- `fix-sla-priorities.js` - Fixes SLA priority values
- `restore-statuses.js` - Restores ticket statuses from backup
- `add-missing-permissions.js` - Adds any missing permissions
- `map-roles-to-sac-project.js` - Maps roles to SAC project

### User Management Scripts (One-time operations)
- `delete-admin.js` - Deletes admin user (use with caution)
- `reset-admin-password.js` - Resets admin password
- `updatePassword.js` - Updates user password

## 🔧 UTILITY/DEVELOPMENT SCRIPTS (Keep for debugging)

### Debugging/Testing Scripts
- `check-agent-perms.js` - Checks agent permissions
- `check-db-data.js` - Checks database data integrity
- `check-db.js` - Database connection check
- `check-project-urls.js` - Validates project URLs
- `check-sla.js` - Checks SLA configuration
- `check-user-permissions.js` - Checks user permissions
- `debug-role.js` - Debug role configuration
- `verify-offline-permissions.js` - Verifies offline module permissions
- `verify-role-mappings.js` - Verifies role-project mappings

### Test Scripts
- `test-activity-log.js` - Tests activity logging
- `test-api.js` - API endpoint testing
- `test-hrms.js` - Tests HRMS integration
- `test-login.js` - Tests login functionality
- `test-token.js` - Tests JWT token generation
- `test-otp.ps1` - PowerShell script to test OTP
- `test-status-api.ps1` - PowerShell script to test status API

### Token Management
- `generate-fresh-token.js` - Generates fresh JWT token for testing
- `token.txt` - Stores generated token (SHOULD BE IN .gitignore)

### Ticket Management
- `assign-ticket.js` - Utility to assign tickets

## 📁 RECOMMENDED CLEANUP ACTIONS

1. **Move to `scripts/migrations/`** (if not already done):
   - All `migrate-*.js` files
   - `drop-userId-index.js`
   - All `fix-*.js` files
   - All `seed-*.js` files
   - `restore-statuses.js`

2. **Move to `scripts/utilities/`**:
   - All `check-*.js` files
   - All `verify-*.js` files
   - `debug-role.js`
   - `assign-ticket.js`
   - `generate-fresh-token.js`
   - User management scripts

3. **Move to `scripts/tests/`**:
   - All `test-*.js` and `test-*.ps1` files

4. **Remove from repository** (add to .gitignore):
   - `token.txt` - Contains sensitive data

5. **Archive after successful production deployment**:
   - All migration scripts (keep in version control but move to archive folder)

## 🚨 SECURITY NOTES

- `token.txt` should NEVER be committed to version control
- Password reset scripts should only be run by authorized admins
- Delete scripts should require confirmation before execution
