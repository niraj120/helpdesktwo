#!/bin/bash
# First-time deployment setup script
# Run this ONCE on the server before using the pipeline

set -e

echo "=== SAC Helpdesk - First Time Deployment Setup ==="
echo ""

# Create directory structure
echo "Creating directory structure..."
sudo mkdir -p /var/www/helpdesk/backend/uploads
sudo mkdir -p /var/www/helpdesk/frontend
sudo chown -R ubuntu:ubuntu /var/www/helpdesk
echo "✓ Directories created"

# Copy ecosystem config
echo ""
echo "Copying PM2 configuration..."
cd /home/ubuntu/helpdesk
cp ecosystem.config.js /var/www/helpdesk/backend/
echo "✓ ecosystem.config.js copied"

# Check MongoDB
echo ""
echo "Checking MongoDB..."
if systemctl is-active --quiet mongod || systemctl is-active --quiet mongodb; then
    echo "✓ MongoDB is running"
else
    echo "⚠️  MongoDB is not running. Start it with:"
    echo "   sudo systemctl start mongod"
fi

# Check nginx
echo ""
echo "Checking Nginx..."
if systemctl is-active --quiet nginx; then
    echo "✓ Nginx is running"
    sudo nginx -t && echo "✓ Nginx config is valid"
else
    echo "⚠️  Nginx is not running"
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "1. Push code to 'main' branch to trigger deployment"
echo "2. Pipeline will build and deploy automatically"
echo "3. PM2 will start the backend process"
echo ""
echo "Monitor deployment:"
echo "  - Pipeline: https://bitbucket.org/hubblehox-technologies/helpdesk/pipelines"
echo "  - PM2 status: pm2 status"
echo "  - PM2 logs: pm2 logs helpdesk-backend"
echo "  - Test: curl http://localhost:3003/api/health"
