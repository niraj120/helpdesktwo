#!/bin/bash
# Setup nginx configuration for helpdesk.hubblehox.ai

echo "=== Setting up nginx configuration ==="

# Create nginx config
sudo tee /etc/nginx/sites-available/helpdesk > /dev/null << 'EOF'
server {
    listen 80;
    server_name helpdesk.hubblehox.ai;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name helpdesk.hubblehox.ai;

    ssl_certificate /etc/letsencrypt/live/helpdesk.hubblehox.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/helpdesk.hubblehox.ai/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    root /var/www/helpdesk/frontend;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    client_max_body_size 100M;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

echo "✓ Config file created"

# Enable site
sudo ln -sf /etc/nginx/sites-available/helpdesk /etc/nginx/sites-enabled/helpdesk
echo "✓ Site enabled"

# Test nginx config
echo ""
echo "=== Testing nginx configuration ==="
sudo nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "=== Reloading nginx ==="
    sudo systemctl reload nginx
    echo "✓ Nginx reloaded"
    
    echo ""
    echo "=== Testing backend connection ==="
    curl -s http://localhost:3003/api/health && echo "✓ Backend is responding"
    
    echo ""
    echo "=== Testing nginx proxy ==="
    curl -s http://localhost/api/health && echo "✓ Nginx proxy working"
    
    echo ""
    echo "=== Setup complete! ==="
    echo "Visit https://helpdesk.hubblehox.ai"
else
    echo "✗ Nginx config test failed"
    exit 1
fi
