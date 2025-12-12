# 🚨 URGENT SECURITY ACTIONS REQUIRED BEFORE DEPLOYMENT

## ⚠️ CRITICAL - DO THESE IMMEDIATELY

### 1. **Change Database Password** 🔴 HIGHEST PRIORITY
**Current Status**: Database credentials are exposed in repository

**Actions Required**:
```bash
# 1. Connect to MongoDB and change the password
mongo --host 34.14.157.13:27017 -u helpdesk-dev -p hELpDEsK-DeV2025 --authenticationDatabase admin

# In MongoDB shell:
use admin
db.changeUserPassword("helpdesk-dev", "NEW_SECURE_PASSWORD_HERE")

# 2. Update the new password in your production .env file (DO NOT COMMIT)
# Edit: backend/.env (on server only)
MONGODB_URI=mongodb://helpdesk-dev:NEW_SECURE_PASSWORD@34.14.157.13:27017/sac_helpdesk?authSource=admin
```

**Why**: The old password `hELpDEsK-DeV2025` was committed to git and is visible in repository history. Anyone with access to your repository can access your database.

---

### 2. **Generate Strong JWT Secrets** 🔴 CRITICAL
**Current Status**: JWT secrets are weak and predictable

**Generate New Secrets**:
```bash
# Generate strong random secrets (run in terminal)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Run this twice to get two different secrets
```

**Update in `.env` file** (on server only, never commit):
```env
JWT_SECRET=<paste-first-64-char-hex-string-here>
JWT_REFRESH_SECRET=<paste-second-64-char-hex-string-here>
```

**Why**: Current secrets are predictable and can be brute-forced, allowing attackers to forge authentication tokens.

---

### 3. **Secure Your .env Files** 🟠 HIGH PRIORITY

**Actions Required**:
```bash
# On your development machine:
cd "D:\NIraj Backup\NIraj Main folder\Niraj\SAC\SAC Helpdesk"

# Check if .env files are tracked by git
git ls-files | grep .env

# If any .env files are listed, remove them from git:
git rm --cached backend/.env
git rm --cached backend/.env.production
git rm --cached backend/.env.production.server
git rm --cached frontend/.env.production.build

# Commit the removal
git add .gitignore
git commit -m "security: Remove .env files from git tracking"
git push origin dev
```

**Note**: `.gitignore` has been updated to prevent future commits, but existing files in git history remain visible. Consider repository cleanup if credentials were exposed.

---

### 4. **Verify Server Environment Variables** 🟡 BEFORE DEPLOYMENT

**On Production Server** (`/var/www/helpdesk/backend/.env`):
```bash
# SSH to server
ssh ubuntu@34.14.157.13

# Check .env file exists and has correct values
cat /var/www/helpdesk/backend/.env

# Verify these settings:
# - NODE_ENV=production
# - MONGODB_URI=mongodb://helpdesk-dev:<NEW_PASSWORD>@34.14.157.13:27017/...
# - JWT_SECRET=<64-char-random-hex>
# - ALLOWED_ORIGINS_PRODUCTION=https://helpdesk.hubblehox.ai
```

---

## ✅ FIXED ISSUES (Already Completed)

1. ✅ **CORS Configuration** - Removed allow-all origins, enabled proper validation
2. ✅ **Port Inconsistency** - Fixed default port from 5000 to 3003
3. ✅ **Debug Logging** - Removed JWT_SECRET logging and excessive console.logs
4. ✅ **Hardcoded URLs** - Updated frontend to use dynamic hostname
5. ✅ **Backend URL Mismatch** - Fixed to use consistent domain
6. ✅ **Gitignore Updated** - Added all .env variants to prevent future leaks

---

## 📋 PRE-DEPLOYMENT CHECKLIST

Run these checks before deploying:

### Backend Build Check
```bash
cd backend
npm install
npm run build
# Should complete without errors and create dist/ folder
```

### Frontend Build Check
```bash
cd frontend
npm install
npm run build
# Should complete without errors and create dist/ folder
```

### Environment Variables Check
```bash
# On server, verify .env file:
cat /var/www/helpdesk/backend/.env | grep -E "NODE_ENV|MONGODB_URI|JWT_SECRET|ALLOWED_ORIGINS"

# Should show:
# NODE_ENV=production
# MONGODB_URI=mongodb://... (with NEW password)
# JWT_SECRET=<64-char hex>
# ALLOWED_ORIGINS_PRODUCTION=https://helpdesk.hubblehox.ai
```

### PM2 Ecosystem Check
```bash
# Verify PM2 config paths exist
ls -la /var/www/helpdesk/backend/
ls -la /var/www/helpdesk/frontend/

# Test PM2 config
pm2 start ecosystem.config.js --env production --dry-run
```

---

## 🔐 ADDITIONAL SECURITY RECOMMENDATIONS

### Rate Limiting
- Current: 100 requests/15min in production (reasonable)
- Monitor API logs for abuse patterns

### File Upload Security
- Max file size: 10MB (configured)
- Verify file type validation is enforced server-side
- Check upload directory permissions

### HTTPS/SSL
- ✅ Nginx configured with Let's Encrypt
- Verify certificate auto-renewal is enabled:
  ```bash
  sudo certbot renew --dry-run
  ```

### Backup Strategy
- Set up automated MongoDB backups
- Test restore procedure
- Store backups securely off-site

---

## 🚀 DEPLOYMENT SEQUENCE

1. **Change database password** (Step 1 above)
2. **Generate new JWT secrets** (Step 2 above)
3. **Update server .env file** with new credentials
4. **Build backend**: `cd backend && npm run build`
5. **Build frontend**: `cd frontend && npm run build`
6. **Deploy to server** (use bitbucket-pipelines or manual deploy scripts)
7. **Restart PM2**: `pm2 reload ecosystem.config.js`
8. **Verify deployment**: 
   - Check `https://helpdesk.hubblehox.ai`
   - Test login functionality
   - Check API endpoint: `https://helpdesk.hubblehox.ai/api/health`

---

## 📞 POST-DEPLOYMENT VERIFICATION

```bash
# 1. Check backend is running
curl https://helpdesk.hubblehox.ai/api/health

# Expected: {"status":"OK","message":"SAC Helpdesk API is running",...}

# 2. Check PM2 status
pm2 status

# Expected: Both helpdesk-backend and helpdesk-frontend should be "online"

# 3. Check logs
pm2 logs --lines 50

# Should not show any errors
```

---

## ⚠️ DO NOT

- ❌ Commit `.env` files to git
- ❌ Share credentials in chat/email
- ❌ Use weak or default passwords
- ❌ Skip the database password change
- ❌ Deploy without updating JWT secrets
- ❌ Test with production credentials locally

---

## 📝 NOTES

- All code issues have been fixed in the current working directory
- Changes are ready to commit and push
- Database credentials and JWT secrets MUST be changed manually (not in code)
- After deploying, monitor logs for any errors or suspicious activity

---

**Last Updated**: December 11, 2025
**Status**: Ready for deployment after completing CRITICAL actions above
