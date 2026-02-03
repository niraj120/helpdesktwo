# Dynamic Email Polling Configuration

## Overview
The email polling service now supports dynamic interval configuration without requiring server restarts. Administrators can change the polling frequency in real-time through the API.

## Features

### 1. Dynamic Interval Updates
- Change polling intervals on-the-fly without restarting the server
- Automatically restarts the cron job with new settings
- Settings persist in the database

### 2. Cron Expression Presets
Pre-configured intervals for common use cases:
- **Every 10 seconds**: High-priority, time-sensitive tickets
- **Every 30 seconds**: Balanced performance (recommended)
- **Every 1 minute**: Normal load environments
- **Every 2 minutes**: Lower priority tickets
- **Every 5 minutes**: Low traffic environments
- **Every 10 minutes**: Resource-constrained systems
- **Every 15 minutes**: Batch processing
- **Every 30 minutes**: Minimal monitoring

### 3. Database Persistence
Settings stored in `SystemSettings` collection:
- `email_polling_interval`: Backend email polling frequency
- `email_processing_interval`: Email processing frequency
- `frontend_polling_interval`: Frontend activity checking frequency

## API Endpoints

### Get Current Configuration
```http
GET /api/email-activity/config
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pollingInterval": "*/30 * * * * *",
    "processingInterval": "*/1 * * * *",
    "frontendPollingInterval": 30000,
    "maxEmailsPerFetch": 50,
    "maxRetries": 3,
    "serviceStatus": {
      "isActive": true,
      "isRunning": false,
      "currentInterval": "*/30 * * * * *"
    }
  }
}
```

### Get Cron Presets
```http
GET /api/email-activity/cron-presets
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "presets": [
      {
        "label": "Every 30 seconds",
        "value": "*/30 * * * * *",
        "description": "Checks every 30 seconds",
        "recommendedFor": "Balanced performance and responsiveness (recommended)"
      }
      // ... more presets
    ]
  }
}
```

### Update Configuration
```http
PUT /api/email-activity/config
Authorization: Bearer <token>
Content-Type: application/json

{
  "pollingInterval": "*/1 * * * *",
  "frontendPollingInterval": 60000
}
```

**Required Permission:** `SYSTEM_SETTINGS_MANAGE`

**Response:**
```json
{
  "success": true,
  "message": "Email polling configuration updated successfully",
  "data": {
    "pollingInterval": "*/1 * * * *",
    "serviceStatus": {
      "isActive": true,
      "currentInterval": "*/1 * * * *"
    }
  }
}
```

## Cron Expression Format

### 6-part Expression (with seconds)
```
┌─────────── second (0-59)
│ ┌───────── minute (0-59)
│ │ ┌─────── hour (0-23)
│ │ │ ┌───── day of month (1-31)
│ │ │ │ ┌─── month (1-12)
│ │ │ │ │ ┌─ day of week (0-6) (Sunday=0)
│ │ │ │ │ │
* * * * * *
```

### 5-part Expression (standard)
```
┌───────── minute (0-59)
│ ┌─────── hour (0-23)
│ │ ┌───── day of month (1-31)
│ │ │ ┌─── month (1-12)
│ │ │ │ ┌─ day of week (0-6) (Sunday=0)
│ │ │ │ │
* * * * *
```

## Examples

### Common Patterns
```javascript
// Every 30 seconds
"*/30 * * * * *"

// Every 1 minute
"*/1 * * * *"

// Every 5 minutes
"*/5 * * * *"

// Every hour at minute 0
"0 * * * *"

// Every day at midnight
"0 0 * * *"

// Every Monday at 9 AM
"0 9 * * 1"
```

### Programmatic Usage

#### Update Polling Interval
```typescript
import { emailPollingService } from '../services/emailPollingService';

// Update to check every minute
await emailPollingService.updatePollingInterval('*/1 * * * *', userId);

// Service automatically restarts with new interval
```

#### Get Current Status
```typescript
const status = emailPollingService.getStatus();
console.log('Current interval:', status.interval);
console.log('Is active:', status.isActive);
```

## Validation

The system validates cron expressions before applying them:
- Invalid expressions are rejected with error message
- Provides helpful error feedback
- Prevents service disruption from invalid configurations

## Best Practices

### Choosing Polling Intervals

**High-frequency (10-30 seconds):**
- ✅ Immediate ticket creation
- ✅ Best user experience
- ❌ Higher server load
- ❌ More frequent IMAP connections

**Medium-frequency (1-5 minutes):**
- ✅ Balanced performance
- ✅ Reasonable response time
- ✅ Lower resource usage
- ✅ **Recommended for most use cases**

**Low-frequency (10+ minutes):**
- ✅ Minimal server load
- ✅ Best for low-traffic systems
- ❌ Delayed ticket creation
- ❌ Poor user experience for urgent issues

### Performance Considerations

1. **IMAP Connection Limits**: Most email providers limit concurrent connections
2. **Server Resources**: More frequent polling = more CPU/memory usage
3. **Email Volume**: High volume may require longer intervals
4. **User Expectations**: Balance responsiveness with system capacity

## Monitoring

Monitor the service in logs:
```
🚀 Starting Email Polling Service
   Interval: */30 * * * * *
   Max Emails Per Fetch: 50 emails/config/cycle
   IMAP Timeout: 30s
✅ Email Polling Service started successfully

🔄 Updating polling interval from */30 * * * * * to */1 * * * *
🔄 Restarting Email Polling Service...
🛑 Email Polling Service stopped
🚀 Starting Email Polling Service
   Interval: */1 * * * *
   ...
✅ Email Polling Service started successfully
```

## Troubleshooting

### Service Not Restarting
- Check for validation errors in logs
- Verify cron expression syntax
- Ensure database connection is active

### Polling Not Working
- Verify service status via API
- Check email configuration is enabled
- Review IMAP connection settings
- Check system logs for errors

### Performance Issues
- Consider increasing polling interval
- Review email volume and server resources
- Monitor IMAP connection limits
- Check `maxEmailsPerFetch` setting

## Database Schema

### SystemSettings Collection
```typescript
{
  _id: ObjectId,
  key: "email_polling_interval",
  value: "*/30 * * * * *",
  description: "Email polling interval (cron expression)",
  updatedBy: ObjectId("userId"),
  createdAt: Date,
  updatedAt: Date
}
```

## Migration

No migration required. The system uses default values if database settings don't exist:
- Default polling interval: `*/30 * * * * *` (30 seconds)
- Settings are created automatically when first updated
- Backward compatible with environment variables

## Security

- Only users with `SYSTEM_SETTINGS_MANAGE` permission can update intervals
- All changes are logged with user ID
- Invalid expressions are rejected before execution
- Service cannot be crashed by invalid configuration
