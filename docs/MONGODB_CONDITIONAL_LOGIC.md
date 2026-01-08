# MongoDB URL Conditional Logic - Implementation

## Objective
Automatically use production MongoDB when accessing `helpdesk.hubblehox.ai`, otherwise use local MongoDB for development.

## How It Works

### 1. Environment Variables (.env)
```env
# Development (local) MongoDB
MONGODB_LOCAL_URI=mongodb://localhost:27017/sac_helpdesk

# Production MongoDB (remote)
MONGODB_PRODUCTION_URI=mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin
```

### 2. Conditional Logic (src/config/database.ts)
The application automatically detects which MongoDB to use:

**Uses PRODUCTION MongoDB when:**
- `NODE_ENV=production` is set, OR
- Domain is `helpdesk.hubblehox.ai` (detected from URLs in .env)

**Uses LOCAL MongoDB when:**
- `NODE_ENV=development`, AND
- Domain is NOT production domain

### 3. Connection Flow
```
┌─────────────────────────────────────────────┐
│  Application Starts                         │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  Check NODE_ENV & PRODUCTION_* URLs         │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
   Production?       Development?
        │                 │
        ▼                 ▼
   Use Remote         Use Local
   MongoDB from       MongoDB from
   34.14.157.13       localhost:27017
```

## Environment Configuration

### Development (.env)
```
NODE_ENV=development
MONGODB_LOCAL_URI=mongodb://localhost:27017/sac_helpdesk
MONGODB_PRODUCTION_URI=mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin
PRODUCTION_FRONTEND_URL=https://helpdesk.hubblehox.ai
```
→ Will use **LOCAL MongoDB** because NODE_ENV is development

### Production (on server)
```
NODE_ENV=production
MONGODB_LOCAL_URI=mongodb://localhost:27017/sac_helpdesk
MONGODB_PRODUCTION_URI=mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin
PRODUCTION_FRONTEND_URL=https://helpdesk.hubblehox.ai
```
→ Will use **PRODUCTION MongoDB** because NODE_ENV is production OR domain is helpdesk.hubblehox.ai

## Code Changes

### 1. backend/.env
- Separated `MONGODB_URI` into `MONGODB_LOCAL_URI` and `MONGODB_PRODUCTION_URI`

### 2. backend/src/config/database.ts
- Added `getMongoDBUri()` function with conditional logic
- Detects production based on:
  - `NODE_ENV === 'production'`
  - OR any PRODUCTION_* URLs containing `helpdesk.hubblehox.ai`
- Logs which database is being used (🔐 PRODUCTION or 💾 LOCAL)
- Throws error if production is detected but MONGODB_PRODUCTION_URI not set

### 3. backend/src/config/index.ts
- Updated database config to expose both `localUri` and `productionUri`
- Allows code to access URLs if needed for logging/debugging

## Testing

### Development Mode (Local DB)
```bash
NODE_ENV=development npm run dev
# Should log: 💾 Using LOCAL development MongoDB
# Connects to: mongodb://localhost:27017/sac_helpdesk
```

### Production Mode (Remote DB)
```bash
NODE_ENV=production npm start
# Should log: 🔐 Using PRODUCTION MongoDB
# Connects to: mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin
```

## Security Notes
- Production MongoDB credentials are stored in `.env` (not in code)
- Credentials are never exposed in logs (only "Using PRODUCTION MongoDB" is logged)
- `.env` file should NOT be committed to Git (add to `.gitignore`)
- Never hardcode credentials in source code

## Files Modified
- ✅ `backend/.env`
- ✅ `backend/.env.example`
- ✅ `backend/src/config/database.ts`
- ✅ `backend/src/config/index.ts`
