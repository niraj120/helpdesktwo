# 🚀 Quick Start - Bitbucket Deployment

## Immediate Next Steps

1. **Run the deployment script:**
   ```powershell
   .\deploy-to-bitbucket.ps1
   ```

2. **When prompted, enter your Bitbucket repository URL:**
   ```
   https://bitbucket.org/YOUR-USERNAME/sac-helpdesk.git
   ```

3. **Configure Bitbucket Pipelines:**
   - Go to your Bitbucket repository
   - Settings → Pipelines → Settings
   - Enable Pipelines
   - Add Repository Variables (Settings → Pipelines → Repository variables):
     * `SSH_USER` - Your server username
     * `SSH_HOST` - `helpdesk.hubblehox.ai`
     * `SSH_PRIVATE_KEY` - Your SSH private key (keep it secret!)
     * `SSH_KNOWN_HOSTS` - Run: `ssh-keyscan helpdesk.hubblehox.ai`

4. **Server Setup Required:**
   - Ubuntu server with Node.js 18+, MongoDB, Nginx, PM2
   - Domain `helpdesk.hubblehox.ai` pointing to your server IP
   - See `DEPLOYMENT.md` for complete setup instructions

## Files Created

- ✅ `.gitignore` - Git ignore configuration
- ✅ `bitbucket-pipelines.yml` - CI/CD pipeline configuration
- ✅ `nginx.conf` - Nginx reverse proxy configuration
- ✅ `ecosystem.config.js` - PM2 process manager configuration
- ✅ `.env.production` - Production environment template
- ✅ `DEPLOYMENT.md` - Complete deployment guide
- ✅ `deploy-to-bitbucket.ps1` - Quick deployment script

## What Happens on Push

Every push to `main` branch will:
1. ✅ Build backend TypeScript
2. ✅ Build frontend React app
3. ✅ Deploy to server via SSH
4. ✅ Restart PM2 backend process
5. ✅ Reload Nginx

## Need Help?

See `DEPLOYMENT.md` for detailed instructions.
