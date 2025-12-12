# .env vs .env.example - Clean Code Explanation

## Why Two Files?

### `.env` (DO NOT COMMIT)
- **Purpose:** Actual configuration used by your application
- **Contains:** Real values, secrets, credentials
- **Who uses it:** Your running application reads this
- **Git:** Add to `.gitignore` (never commit)
- **Location:** `backend/.env` and `frontend/.env`

Example:
```env
JWT_SECRET=my-actual-production-secret-key-12345
MONGODB_PRODUCTION_URI=mongodb://user:password@server:27017/db
```

### `.env.example` (COMMIT TO GIT)
- **Purpose:** Template/documentation for setup
- **Contains:** Variable names and placeholder values
- **Who uses it:** New developers, DevOps engineers
- **Git:** Always commit (it's safe, no real secrets)
- **Location:** `backend/.env.example` and `frontend/.env.example`

Example:
```env
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
MONGODB_PRODUCTION_URI=mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin
```

## Workflow for Clean Code

### 1. Developer Setup (First Time)
```bash
cd backend
cp .env.example .env       # Create real .env from template
# Edit .env with your actual values
nano .env
```

### 2. Deploy to Production
```bash
# On production server
cd /var/www/helpdesk/backend
cp .env.example .env       # Create .env from template
# Edit with production values
nano .env
# Set production secrets and URLs
```

### 3. Git Commits
```
✅ COMMIT: .env.example      (template, safe)
❌ IGNORE: .env              (.gitignore prevents commit)
```

### 4. .gitignore Entry
```
# File: .gitignore
.env
.env.local
.env.*.local
!.env.example
```

## Current Status

### Backend
| File | Status | Usage |
|------|--------|-------|
| `.env` | ✅ Synced | Application reads this |
| `.env.example` | ✅ Synced | Template for new setup |

### Frontend
| File | Status | Usage |
|------|--------|-------|
| `.env` | ✅ Synced | Application reads this |
| `.env.example` | ✅ Synced | Template for new setup |

## Best Practices

1. **Never hardcode secrets in code**
   - ❌ Bad: `const password = "mySecretPassword";`
   - ✅ Good: `const password = process.env.DB_PASSWORD;`

2. **Keep .env.example up-to-date**
   - When adding new env vars, add them to .env.example too
   - Use placeholder/example values only

3. **Different .env for different environments**
   ```
   Development:  .env (localhost values)
   Production:   .env (production domain values)
   ```

4. **Make .env.example clear**
   - Add comments explaining each variable
   - Show example values
   - Indicate if optional or required

## Real Example

### .env (ACTUAL - only you have this)
```env
NODE_ENV=development
JWT_SECRET=abc123xyz789realSecretKey
MONGODB_LOCAL_URI=mongodb://localhost:27017/sac_helpdesk
```

### .env.example (TEMPLATE - committed to Git)
```env
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
MONGODB_LOCAL_URI=mongodb://localhost:27017/sac_helpdesk
```

## Summary
- ✅ Use `.env` for your actual running application
- ✅ Use `.env.example` as template for others
- ✅ Commit `.env.example` to Git
- ❌ Never commit `.env` to Git
- ✅ Both files should have same variables
- ✅ Only values differ (.env has real values, .env.example has placeholders)
