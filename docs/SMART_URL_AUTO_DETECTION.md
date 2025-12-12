# Smart URL Auto-Detection - Both Frontend & Backend

## Overview
Both frontend and backend now **automatically detect** the environment and point to the correct APIs:

```
┌─────────────────────────────────────┐
│   User Access URL                   │
├─────────────────────────────────────┤
│ localhost:3001                      │ → API: http://localhost:3003
│ helpdesk.hubblehox.ai               │ → API: https://helpdesk.hubblehox.ai
└─────────────────────────────────────┘
```

## Frontend Smart Detection

### How It Works
```typescript
// frontend/src/config/constants.ts

const getApiUrl = (): string => {
  // Check current hostname
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3003';  // Local API
  } else if (hostname.includes('helpdesk.hubblehox.ai')) {
    return 'https://helpdesk.hubblehox.ai';  // Production API
  }
};
```

### Frontend `.env` File
```env
# Auto-detection is ENABLED by default
# No need to set VITE_API_BASE_URL for normal use

# Optional override (if auto-detection fails)
# VITE_API_BASE_URL=http://localhost:3003
```

### What Gets Logged
When you open the browser console, you'll see:
```
🌐 Detected hostname: localhost
🔗 Using API URL: http://localhost:3003
📡 Using WebSocket URL: ws://localhost:3003
```

## Backend Smart Detection

### How It Works
```typescript
// backend/src/server.ts

const getAllowedOrigins = (): string[] => {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  
  if (NODE_ENV === 'production') {