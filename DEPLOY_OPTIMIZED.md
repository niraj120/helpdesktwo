# Optimized Deployment Guide

## Quick Deploy

```powershell
# Full deployment (build + upload + restart)
.\deploy-optimized.ps1

# Dry run (see what would be deployed)
.\deploy-optimized.ps1 -DryRun

# Skip build (if already built)
.\deploy-optimized.ps1 -SkipBuild

# Custom server
.\deploy-optimized.ps1 -ServerIP "1.2.3.4" -ServerUser "ubuntu" -DeployPath "/home/ubuntu/app"
```

## What Gets Deployed

### ✅ Included (Necessary Files Only)
- Backend compiled code (`backend/dist/`)
- Frontend built assets (`frontend/dist/`)
- `package.json` and `package-lock.json` (for npm install)
- `ecosystem.config.js` (PM2 configuration)
- `nginx.conf` (web server config)
- Empty `uploads/` folder structure

### ❌ Excluded (Not Needed in Production)
- Source code (`src/` folders)
- `node_modules/` (installed fresh on server)
- `.env` files (configured separately on server)
- Documentation (`docs/`, `*.md` files)
- Test files and scripts
- Development tools config
- Git repository (`.git/`)
- Editor configs (`.vscode/`, `.idea/`)
- Build artifacts (`.map` files)
- Migration scripts
- Development server scripts

## Package Size Comparison

| Method | Size | Files |
|--------|------|-------|
| Full project | ~500+ MB | 50,000+ files |
| **Optimized package** | ~5-10 MB | ~500 files |

## Deployment Steps

1. **Build**: Compiles TypeScript → JavaScript, bundles React app
2. **Package**: Copies only production files to `deploy-package/`
3. **Upload**: SCPs package to production server
4. **Install**: Runs `npm ci --production` on server
5. **Restart**: Stops old PM2 processes, starts new ones
6. **Reload**: Updates Nginx to serve new frontend

## Server Requirements

- Node.js 18+ installed
- PM2 installed globally (`npm install -g pm2`)
- Nginx installed and configured
- SSH access configured

## Post-Deployment

Check status:
```bash
ssh ubuntu@34.14.157.13 'pm2 status'
```

View logs:
```bash
ssh ubuntu@34.14.157.13 'pm2 logs'
```

Restart if needed:
```bash
ssh ubuntu@34.14.157.13 'pm2 restart all'
```

## Troubleshooting

**Upload fails**: Check SSH key or try with password
**Build fails**: Run `npm install` in both backend and frontend
**PM2 fails**: Check if port 3003 is available on server
**Nginx fails**: Verify nginx config and restart: `sudo systemctl restart nginx`
