# Deployment Guide for SAC Helpdesk

## Prerequisites

1. **Bitbucket Account** with repository access
2. **Server** with the following installed:
   - Ubuntu 20.04+ or similar Linux distribution
   - Node.js 18+
   - MongoDB
   - Nginx
   - PM2 (Process Manager)
   - SSL Certificate (Let's Encrypt)

## Step 1: Initialize Git Repository

```bash
# Initialize git in your project root
cd "D:\Niraj\SAC\SAC Helpdesk"
git init
git add .
git commit -m "Initial commit: SAC Helpdesk Application"
```

## Step 2: Connect to Bitbucket

```bash
# Add Bitbucket remote (replace with your Bitbucket repository URL)
git remote add origin https://bitbucket.org/your-username/sac-helpdesk.git

# Push to Bitbucket
git branch -M main
git push -u origin main
```

## Step 3: Server Setup

### 3.1 Install Node.js and MongoDB

```bash
# SSH into your server
ssh user@helpdesk.hubblehox.ai

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt-get install -y nginx
```

### 3.2 Create Application Directory

```bash
sudo mkdir -p /var/www/helpdesk/{backend,frontend}
sudo chown -R $USER:$USER /var/www/helpdesk
```

### 3.3 Configure Nginx

```bash
# Copy nginx configuration
sudo nano /etc/nginx/sites-available/helpdesk

# Paste the content from nginx.conf file

# Enable the site
sudo ln -s /etc/nginx/sites-available/helpdesk /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3.4 Setup SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d helpdesk.hubblehox.ai

# Auto-renewal (already configured by certbot)
```

## Step 4: Configure Bitbucket Pipelines

### 4.1 Add Repository Variables

Go to Bitbucket → Repository Settings → Pipelines → Repository variables

Add the following variables:

- `SSH_USER`: Your server SSH username
- `SSH_HOST`: helpdesk.hubblehox.ai
- `SSH_PRIVATE_KEY`: Your SSH private key (for deployment)
- `SSH_KNOWN_HOSTS`: Run `ssh-keyscan helpdesk.hubblehox.ai` to get this

### 4.2 Enable Pipelines

1. Go to Repository Settings → Pipelines → Settings
2. Enable Pipelines
3. The `bitbucket-pipelines.yml` file will be automatically detected

## Step 5: Manual First Deployment

```bash
# On your server, clone the repository
cd /var/www/helpdesk
git clone https://bitbucket.org/your-username/sac-helpdesk.git temp
mv temp/* ./
rm -rf temp

# Backend setup
cd /var/www/helpdesk/backend
npm ci --production
npm run build

# Copy and configure environment variables
cp .env.production .env
nano .env  # Update with actual production values

# Start backend with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Follow the instructions

# Frontend setup
cd /var/www/helpdesk/frontend
npm ci
npm run build
mv dist/* /var/www/helpdesk/frontend/

# Restart services
sudo systemctl restart nginx
```

## Step 6: Environment Variables

Create `/var/www/helpdesk/backend/.env` with:

```env
NODE_ENV=production
PORT=3003
MONGODB_URI=mongodb://localhost:27017/sac_helpdesk
JWT_SECRET=your-strong-secret-key-here
JWT_EXPIRES_IN=24h
ALLOWED_ORIGINS=https://helpdesk.hubblehox.ai
```

## Step 7: Update Frontend API URL

Update `frontend/src/config.ts` or environment variables to point to production:

```typescript
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://helpdesk.hubblehox.ai/api'
  : 'http://localhost:3003/api';
```

## Step 8: Database Migration

```bash
cd /var/www/helpdesk/backend

# Run any seed scripts
node seed-sla.js
node reseedPermissions.js

# Create admin user if needed
node reset-admin-password.js
```

## Step 9: Monitoring and Logs

```bash
# View PM2 logs
pm2 logs helpdesk-backend

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Monitor PM2 processes
pm2 monit
```

## Continuous Deployment

After initial setup, every push to `main` branch will:

1. Build backend and frontend
2. Deploy to server
3. Restart PM2 service
4. Reload Nginx

## Rollback

```bash
# List PM2 processes
pm2 list

# Restart specific process
pm2 restart helpdesk-backend

# Or restore from git
cd /var/www/helpdesk
git checkout <previous-commit-hash>
cd backend && npm ci && npm run build
pm2 restart helpdesk-backend
```

## Security Checklist

- [ ] SSL certificate configured and auto-renewing
- [ ] Strong JWT_SECRET in production .env
- [ ] MongoDB secured (authentication enabled)
- [ ] Firewall configured (UFW)
- [ ] Only necessary ports open (80, 443, 22)
- [ ] SSH key-based authentication
- [ ] PM2 running as non-root user
- [ ] Regular backups configured
- [ ] Security headers in Nginx

## Backup Strategy

```bash
# MongoDB backup
mongodump --db sac_helpdesk --out /backups/$(date +%Y%m%d)

# Setup automated backups with cron
crontab -e
# Add: 0 2 * * * mongodump --db sac_helpdesk --out /backups/$(date +\%Y\%m\%d)
```

## Troubleshooting

### Backend not starting
```bash
pm2 logs helpdesk-backend
# Check for MongoDB connection issues
sudo systemctl status mongod
```

### Frontend not loading
```bash
sudo nginx -t
sudo systemctl status nginx
# Check file permissions
ls -la /var/www/helpdesk/frontend
```

### API not responding
```bash
# Check PM2 status
pm2 status

# Check backend port
sudo netstat -tulpn | grep 3003

# Check Nginx proxy
sudo tail -f /var/log/nginx/error.log
```

## Support

For issues or questions, contact the development team.
