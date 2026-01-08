# Nginx Configuration for API Proxy

## Issue
Frontend calls `/api` endpoints in production, but nginx needs to proxy these to the backend server.

## Required Nginx Configuration

Edit your nginx config file (usually `/etc/nginx/sites-available/helpdesk`):

```nginx
server {
    listen 80;
    server_name helpdesk.hubblehox.ai;

    # Frontend - Serve static files
    location / {
        root /home/ubuntu/helpdesk/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API - Proxy to Node.js backend
    location /api {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support (if needed for Socket.IO)
    location /socket.io {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## SSL Configuration (HTTPS)

If using SSL (recommended for production):

```nginx
server {
    listen 443 ssl http2;
    server_name helpdesk.hubblehox.ai;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/helpdesk.hubblehox.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/helpdesk.hubblehox.ai/privkey.pem;

    # Frontend
    location / {
        root /home/ubuntu/helpdesk/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name helpdesk.hubblehox.ai;
    return 301 https://$host$request_uri;
}
```

## Apply Configuration

```bash
# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx

# Or restart if needed
sudo systemctl restart nginx
```

## Verify Proxy is Working

```bash
# From VM, test API endpoint
curl http://localhost/api/auth/health

# From outside, test production
curl https://helpdesk.hubblehox.ai/api/auth/health
```

## Troubleshooting

### 502 Bad Gateway
- Backend is down: `pm2 status`
- Backend not on port 3003: `netstat -tlnp | grep 3003`
- Restart backend: `pm2 restart Backend`

### CORS Errors
- Check backend CORS configuration allows production domain
- Verify FRONTEND_URL in backend .env

### API Calls Failing
- Check nginx error log: `sudo tail -f /var/log/nginx/error.log`
- Check backend logs: `pm2 logs Backend`
- Verify proxy_pass URL matches backend port

## Summary

With this configuration:
- ✅ Frontend served from `/` → static files in `dist/`
- ✅ API calls to `/api/*` → proxied to `http://localhost:3003/api/*`
- ✅ WebSocket to `/socket.io/*` → proxied to backend
- ✅ All requests go through same domain (no CORS issues)
