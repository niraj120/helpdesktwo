# Frontend 404 Fix - SPA Routing Solution

## Problem
Getting 404 errors when accessing `https://helpdesk.hubblehox.ai/` or any route in the application.

## Root Cause
The nginx server expects the built frontend files to be properly deployed at `/var/www/helpdesk/frontend`, but either:
1. The files aren't deployed
2. The build configuration doesn't support SPA routing properly
3. The deployment doesn't include proper fallback configuration

## Solution at Code Level (Without Modifying nginx)

Since you cannot modify the nginx configuration on the server, we've implemented multiple layers of SPA routing support at the code level:

### Changes Made

#### 1. **Updated Vite Configuration** ([vite.config.ts](frontend/vite.config.ts))
- Added proper `base` path configuration
- Configured asset directory structure
- Added code splitting for better performance
- Ensured proper manifest generation

#### 2. **Added SPA Fallback Files**
- **`frontend/public/_redirects`**: Netlify/Vercel-style redirects (fallback for all routes to index.html)
- **`frontend/public/.htaccess`**: Apache fallback configuration
- These files are copied to `dist/` during build

#### 3. **Enhanced index.html** ([frontend/index.html](frontend/index.html))
- Added `<base href="/" />` tag for proper base path resolution
- Added noscript fallback for users without JavaScript
- Added proper meta tags for SEO and compatibility

#### 4. **Created Deployment Script** ([deploy-frontend-production.ps1](deploy-frontend-production.ps1))
A comprehensive script that:
- Switches environment variables to production
- Installs dependencies
- Builds the frontend
- Creates a deployment archive
- Uploads to production server
- Deploys with proper permissions
- Reloads nginx
- Switches back to local environment

#### 5. **Created Verification Script** ([verify-frontend-deployment.ps1](verify-frontend-deployment.ps1))
Tests:
- Homepage accessibility
- API endpoint connectivity
- Static asset serving
- SPA routing (critical for 404 fix)
- SSL/TLS certificate

## How to Deploy

### Quick Deploy
```powershell
.\deploy-frontend-production.ps1
```

### Step-by-Step Deploy
```powershell
# 1. Navigate to frontend directory
cd frontend

# 2. Switch to production environment
# Edit .env file and uncomment production URLs

# 3. Build the frontend
npm run build

# 4. Create archive
tar -czf dist.tar.gz -C dist .

# 5. Upload to server
scp dist.tar.gz root@147.79.72.155:/tmp/frontend-dist.tar.gz

# 6. Deploy on server
ssh root@147.79.72.155
mkdir -p /var/www/helpdesk/frontend
tar -xzf /tmp/frontend-dist.tar.gz -C /var/www/helpdesk/frontend
chown -R www-data:www-data /var/www/helpdesk/frontend
chmod -R 755 /var/www/helpdesk/frontend
nginx -t
systemctl reload nginx
```

## Verify Deployment

### Automated Verification
```powershell
.\verify-frontend-deployment.ps1
```

### Manual Verification
1. Open https://helpdesk.hubblehox.ai in a browser
2. Open browser DevTools (F12)
3. Check Console tab for errors
4. Check Network tab to see if files are loading
5. Navigate to different routes (e.g., `/login`, `/dashboard`)
6. Refresh the page on a non-root route - should NOT get 404

## Expected Results After Deployment

✅ **Homepage loads** → https://helpdesk.hubblehox.ai  
✅ **Direct route access works** → https://helpdesk.hubblehox.ai/login  
✅ **Page refresh on routes works** → Refresh on /dashboard works  
✅ **Assets load correctly** → CSS, JS, images all load  
✅ **API calls work** → Backend API at `/api` responds  

## Troubleshooting

### Still Getting 404?

#### Check 1: Files Deployed?
```bash
ssh root@147.79.72.155
ls -la /var/www/helpdesk/frontend/
# Should see: index.html, assets/, vite.svg
```

#### Check 2: index.html Exists?
```bash
cat /var/www/helpdesk/frontend/index.html
# Should contain: <div id="root"></div>
```

#### Check 3: Permissions Correct?
```bash
ls -la /var/www/helpdesk/frontend/
# Should be: drwxr-xr-x www-data www-data
```

#### Check 4: nginx Configuration
```bash
nginx -t
# Should return: syntax is ok, test is successful
```

#### Check 5: nginx Serving Correct Directory?
```bash
grep -A 5 "server_name helpdesk.hubblehox.ai" /etc/nginx/sites-available/helpdesk.hubblehox.ai
# Should show: root /var/www/helpdesk/frontend;
```

#### Check 6: Build Output Correct?
```powershell
# Locally, check the dist folder
ls frontend/dist/
# Should contain: index.html, assets/, _redirects, .htaccess
```

### Common Issues

**Issue**: Assets return 404  
**Solution**: Rebuild with `npm run build` and redeploy

**Issue**: Routes work initially but 404 on refresh  
**Solution**: nginx `try_files` not working - files may not be deployed correctly

**Issue**: API calls fail  
**Solution**: Check backend is running: `ssh root@147.79.72.155 "pm2 status"`

**Issue**: CORS errors  
**Solution**: Ensure backend CORS is configured for https://helpdesk.hubblehox.ai

## Architecture

```
https://helpdesk.hubblehox.ai
            ↓
    [nginx on port 443]
            ↓
    ┌───────────────────┬──────────────────┐
    │                   │                  │
    ├─ / (Frontend)     ├─ /api (Backend) ├─ /socket.io (WebSocket)
    │                   │                  │
    │  Serves:          │  Proxies to:     │  Proxies to:
    │  /var/www/        │  localhost:3003  │  localhost:3003
    │  helpdesk/        │                  │
    │  frontend/        │                  │
    └───────────────────┴──────────────────┘
```

## Files Modified/Created

- ✏️ [frontend/vite.config.ts](frontend/vite.config.ts) - Updated build config
- ✏️ [frontend/index.html](frontend/index.html) - Added base tag and meta tags
- ✨ [frontend/public/_redirects](frontend/public/_redirects) - SPA fallback
- ✨ [frontend/public/.htaccess](frontend/public/.htaccess) - Apache fallback
- ✨ [deploy-frontend-production.ps1](deploy-frontend-production.ps1) - Deployment script
- ✨ [verify-frontend-deployment.ps1](verify-frontend-deployment.ps1) - Verification script
- ✨ [FRONTEND_404_FIX.md](FRONTEND_404_FIX.md) - This documentation

## Next Steps

1. **Deploy immediately**:
   ```powershell
   .\deploy-frontend-production.ps1
   ```

2. **Verify deployment**:
   ```powershell
   .\verify-frontend-deployment.ps1
   ```

3. **Test in browser**:
   - Open https://helpdesk.hubblehox.ai
   - Navigate to different pages
   - Refresh on a non-root route
   - Check console for errors

4. **Monitor logs**:
   ```bash
   ssh root@147.79.72.155
   tail -f /var/log/nginx/access.log
   tail -f /var/log/nginx/error.log
   ```

## Additional Notes

- The nginx configuration at [nginx.conf](nginx.conf) already has the correct `try_files` directive
- This solution ensures the build output includes proper SPA routing support
- The deployment script automatically creates backups before deploying
- You can rollback using: `ls /var/www/helpdesk/frontend-backup-*`

---

**Last Updated**: December 11, 2025  
**Status**: ✅ Ready to Deploy
