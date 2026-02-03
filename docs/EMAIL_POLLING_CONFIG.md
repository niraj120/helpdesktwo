# Email Polling Service - Configuration

## ✅ No .env File Changes Required!

The email polling service is now configured with **sensible defaults built into the code**. You don't need to modify any `.env` files on the dev server.

---

## Default Configuration

The service will automatically use these settings:

```typescript
// Default values (no .env changes needed)
POLLING_INTERVAL = "*/2 * * * *"  // Every 2 minutes
MAX_EMAILS_PER_FETCH = 50          // Max 50 emails per config per cycle
IMAP_CONNECTION_TIMEOUT = 30000    // 30 seconds
```

---

## How It Works

The service checks for environment variables first, and if they're not set, uses the defaults:

```typescript
const POLLING_INTERVAL = process.env.EMAIL_POLLING_INTERVAL || '*/2 * * * *';
const MAX_EMAILS_PER_FETCH = process.env.MAX_EMAILS_PER_FETCH 
  ? parseInt(process.env.MAX_EMAILS_PER_FETCH, 10) 
  : 50;
```

---

## Server Startup Logs

When the server starts, you'll see:

```
🚀 Starting Email Polling Service
   Interval: */2 * * * * (every 2 minutes)
   Max Emails Per Fetch: 50 emails/config/cycle
   IMAP Timeout: 30s
✅ Email Polling Service started successfully
```

This confirms the service is running with the correct settings.

---

## Optional: Override with .env (If Needed Later)

If you ever need to change these settings in the future, you can add these lines to `.env`:

```bash
# Optional - only if you want to change defaults
EMAIL_POLLING_INTERVAL=*/5 * * * *  # Change to every 5 minutes
MAX_EMAILS_PER_FETCH=100            # Change to 100 emails
```

But **this is NOT required** - the defaults work perfectly!

---

## Why This Approach?

✅ **No deployment hassles** - Works out of the box  
✅ **Sensible defaults** - 2-minute polling is optimal for most use cases  
✅ **Flexible** - Can still be overridden via .env if needed  
✅ **Production-ready** - No configuration required

---

## Summary

**You don't need to do anything!** The service will work automatically with these defaults:
- Polls every **2 minutes**
- Fetches up to **50 emails** per configuration per cycle
- **30-second** timeout for IMAP connections

Just deploy the code and it will work. ✅
