# SAC Helpdesk - Comprehensive Code Audit Report

**Date:** November 28, 2025  
**Auditor:** External Code Audit  
**Scope:** Full Stack Application (Frontend, Backend, Database, API)

---

## Executive Summary

Total issues identified: **57**

| Severity | Count | Action Required |
|----------|-------|-----------------|
| 🔴 CRITICAL | 15 | Immediate fix required |
| 🟠 HIGH | 17 | Fix within current sprint |
| 🟡 MEDIUM | 18 | Fix in next sprint |
| 🟢 LOW | 7 | Backlog/Technical debt |

---

## 🔴 CRITICAL Issues (Fix Immediately)

### Backend Security

| # | Issue | File | Description | Fix | Status |
|---|-------|------|-------------|-----|--------|
| 1 | **NoSQL Injection** | Multiple controllers | ObjectId params not validated | Add mongoose.Types.ObjectId.isValid() check | ✅ FIXED |
| 2 | **In-Memory OTP Store** | authController.ts | OTPs in memory cause leaks & lost on restart | Use Redis with TTL | ⏳ TODO |
| 3 | **Hardcoded JWT Secret** | authController.ts, middleware | Fallback secrets in production | Fail startup if JWT_SECRET missing | ✅ FIXED |
| 4 | **Missing Auth on Ticket Updates** | ticketController.ts | Anyone can update any ticket | Add ownership check | ⏳ TODO |
| 5 | **Path Traversal** | ticketAttachmentController.ts | File download path not sanitized | Use path.basename() validation | ✅ FIXED |
| 6 | **SMTP Password Plain Text** | EmailConfig model | Credentials not encrypted | Encrypt with AES-256 | ✅ FIXED |
| 7 | **OTP Stored Plain Text** | User model | OTPs visible in database | Hash OTPs before storing | ⏳ TODO |

### Frontend Security

| # | Issue | File | Description | Fix | Status |
|---|-------|------|-------------|-----|--------|
| 8 | **XSS Vulnerability** | KBArticleView.tsx | dangerouslySetInnerHTML without sanitization | Use DOMPurify | ✅ FIXED |
| 9 | **XSS Vulnerability** | StudentKBPage.tsx | Unsanitized HTML rendering | Use DOMPurify | ✅ FIXED |
| 10 | **XSS Vulnerability** | KnowledgeBaseManagement.tsx | KB content not sanitized | Use DOMPurify | ✅ FIXED |
| 11 | **XSS Vulnerability** | ProjectManagement.tsx | Announcement banner HTML unsafe | Use DOMPurify | ✅ FIXED |
| 12 | **XSS Vulnerability** | AddProjectForm.tsx | Preview HTML not sanitized | Use DOMPurify | ✅ FIXED |
| 13 | **XSS Vulnerability** | StudentPortal.tsx | KB content rendered raw | Use DOMPurify | ✅ FIXED |
| 14 | **XSS Vulnerability** | EmailLogsPage.tsx | Email body HTML not sanitized | Use DOMPurify | ✅ FIXED |
| 15 | **Hardcoded Passwords** | UserManagement.tsx | Default passwords in code | Remove, generate random | ⏳ TODO |

---

## 🟠 HIGH Issues (Fix This Sprint)

### Backend

| # | Issue | File | Description | Status |
|---|-------|------|-------------|--------|
| 16 | Reset password doesn't update DB | authController.ts | Password hash logged, not saved | ✅ FIXED |
| 17 | Missing transaction for ticket creation | ticketController.ts | User + ticket not atomic | ⏳ TODO |
| 18 | Bulk update without limits | ticketController.ts | Could timeout database | ⏳ TODO |
| 19 | Email sent synchronously | otpController.ts | Request can timeout | ⏳ TODO |
| 20 | Weak password policy | authController.ts | Only 6 chars minimum | ⏳ TODO |
| 21 | Logging sensitive OTPs | authController.ts | OTPs in console logs | ⏳ TODO |
| 22 | Duplicate null checks | authController.ts | Unreachable code | ⏳ TODO |

### Frontend

| # | Issue | File | Description |
|---|-------|------|-------------|
| 23 | Sensitive data in localStorage | Login.tsx | Full token + permissions exposed |
| 24 | Inconsistent token key | projectAuthController.ts | Uses projectToken vs authToken |
| 25 | Missing error handling | TicketListReport.tsx | API errors fail silently |
| 26 | Race conditions | TicketSettings.tsx | Stale closure in fetchTickets |

### Database

| # | Issue | File | Description |
|---|-------|------|-------------|
| 27 | No cascade delete for tickets | Ticket.ts | Orphaned tickets when user deleted |
| 28 | No cascade delete for permissions | Role.ts | Invalid permission refs |
| 29 | No cascade delete for roles | User.ts | Invalid role refs |
| 30 | Missing unique composite index | MasterData.ts | Duplicate entries possible |

---

## 🟡 MEDIUM Issues (Next Sprint)

### Performance

| # | Issue | File | Description |
|---|-------|------|-------------|
| 31 | N+1 query in project list | projectController.ts | Separate count per project |
| 32 | N+1 query in ticket list | ticketController.ts | Separate project fetch per ticket |
| 33 | Missing pagination on tags | ticketController.ts | Fetches ALL tickets for tags |
| 34 | Large component bundles | AddProjectForm.tsx | 4755 lines, no code splitting |

### Code Quality

| # | Issue | File | Description |
|---|-------|------|-------------|
| 35 | Error leaks internal details | Multiple controllers | error.message exposed to client |
| 36 | Missing rate limiting | authController.ts | Login brute force possible |
| 37 | Inconsistent response format | ticketCommentController.ts | Missing success field |
| 38 | Race in ticket number gen | ticketController.ts | Retry loop may fail |
| 39 | Missing input validation | userController.ts | Regex without sanitization |
| 40 | Using array index as key | Multiple components | React list key anti-pattern |
| 41 | Missing useEffect cleanup | Multiple components | Memory leaks on unmount |
| 42 | Prop drilling | TicketSubmissionModal.tsx | 7+ props deep |

### Database

| # | Issue | File | Description |
|---|-------|------|-------------|
| 43 | Form missing project ref | Form.ts | Forms not scoped to projects |
| 44 | EULA acceptance not unique | EulaAcceptance.ts | Duplicate entries allowed |
| 45 | Category not referencing model | Ticket.ts | Plain string, no integrity |
| 46 | SLA rule missing unique constraint | SLARule.ts | Duplicate rules possible |
| 47 | Empty model files | Multiple | Dead code/incomplete features |
| 48 | Approval categoryId wrong ref | ApprovalWorkflow.ts | References wrong model |

---

## 🟢 LOW Issues (Backlog)

| # | Issue | File | Description |
|---|-------|------|-------------|
| 49 | Console.log in production | All controllers | Should use proper logger |
| 50 | TODO comments in code | Multiple | Incomplete implementations |
| 51 | Empty controller files | integrationController.ts | Dead code |
| 52 | Magic strings for roles | Multiple | Should use constants |
| 53 | Wrong error message | authController.ts | "Logout error" in login |
| 54 | Using alert() for feedback | Multiple components | Poor UX |
| 55 | Missing debounce on search | Multiple components | Unnecessary API calls |
| 56 | JSON.parse without try-catch | Multiple | Could throw on corrupt data |
| 57 | Uncontrolled input warnings | ActivityLogs.tsx | Undefined default values |

---

## Recommended Fix Priority

### Phase 1: Security (Immediate - This Week)
1. Add DOMPurify for all dangerouslySetInnerHTML usage
2. Add ObjectId validation middleware
3. Remove hardcoded password defaults
4. Fix reset password to actually save
5. Add ownership checks on ticket updates

### Phase 2: Data Integrity (This Sprint)
1. Add cascade delete hooks
2. Add unique indexes
3. Encrypt sensitive data (SMTP password, OTP)
4. Use Redis for OTP storage

### Phase 3: Performance (Next Sprint)
1. Fix N+1 queries with aggregation
2. Add pagination everywhere
3. Split large components
4. Add code splitting

### Phase 4: Code Quality (Ongoing)
1. Standardize error responses
2. Add rate limiting
3. Replace console.log with logger
4. Clean up dead code

---

## Files Changed Log

This section will be updated as fixes are applied.

| Date | Issue # | File | Change Description |
|------|---------|------|--------------------|
| 2025-11-28 | 8-14 | Multiple frontend files | Added DOMPurify sanitization for dangerouslySetInnerHTML |
| 2025-11-28 | 1 | backend/src/middleware/validateObjectId.ts | Created ObjectId validation middleware |
| 2025-11-28 | 3 | backend/src/config/index.ts | Created centralized config with JWT secret validation |
| 2025-11-28 | 3 | backend/src/middleware/auth.ts | Use centralized config for JWT secret |
| 2025-11-28 | 3 | backend/src/utils/jwtUtils.ts | Use centralized config for JWT secret |
| 2025-11-28 | 3 | backend/src/controllers/authController.ts | Use centralized config, removed fallbacks |
| 2025-11-28 | 3 | backend/src/controllers/ticketController.ts | Use centralized config for JWT secret |
| 2025-11-28 | 3 | backend/src/controllers/studentAuthController.ts | Use centralized config for JWT secret |
| 2025-11-28 | 16 | backend/src/controllers/authController.ts | Fixed reset password to actually update database |
| 2025-11-28 | 5 | backend/src/controllers/ticketAttachmentController.ts | Added path traversal protection |
| 2025-11-28 | 6 | backend/src/utils/encryption.ts | Created AES-256-GCM encryption utility |
| 2025-11-28 | 6 | backend/src/models/EmailConfig.ts | Added SMTP password encryption on save |
| 2025-11-28 | 6 | backend/src/utils/emailService.ts | Added password decryption when creating transporter |

