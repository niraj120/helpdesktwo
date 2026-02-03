# Task 4.3: Email Processing Worker - Complete Implementation

## Overview
Email Processing Worker is now fully implemented and integrated into the backend server. This service processes queued emails from the Email Polling Service, detects email threads, and creates or updates tickets accordingly.

## ✅ Implementation Status

### Files Created/Modified:

1. **`backend/src/services/emailProcessingWorker.ts`** (228 lines)
   - Main worker service with cron scheduling
   - Queue processing with batch limits and retry logic
   - Integration with thread detection and ticket creation utilities

2. **`backend/src/utils/emailThreadDetection.ts`** (241 lines)
   - Email thread detection using In-Reply-To, References, and subject matching
   - Multiple fallback strategies for reliable thread detection
   - Helper functions for email filtering and validation

3. **`backend/src/utils/ticketFromEmail.ts`** (361 lines)
   - Ticket creation from parsed emails
   - User management (find or create by email)
   - Priority extraction from email headers
   - Reply handling for existing tickets

4. **`backend/src/server.ts`** (Modified)
   - Worker integrated into startup sequence
   - Graceful shutdown handlers added for all environments

---

## 🏗️ Architecture

### Processing Flow:
```
┌──────────────────────────────────────────────────────────────┐
│                    Email Processing Worker                    │
│                    (Runs every 1 minute)                      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  1. Fetch Pending Emails from Queue                          │
│     - status = 'pending'                                      │
│     - retryCount < 3                                          │
│     - Sort by createdAt ASC (FIFO)                            │
│     - Limit: 10 emails per cycle (configurable)              │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  2. For Each Email:                                           │
│     a. Update status → 'processing'                           │
│     b. Parse email with EmailParser.parseFromJSON()           │
│     c. Check for thread with findEmailThread()                │
│                                                                │
│     ┌─────────────────────────┬─────────────────────────┐   │
│     │   Thread Found?         │   No Thread Found       │   │
│     ├─────────────────────────┼─────────────────────────┤   │
│     │ - Add as reply          │ - Create new ticket     │   │
│     │ - Create email comm     │ - Create email comm     │   │
│     │ - Reopen if closed      │ - Add system comment    │   │
│     │ - Add comment           │ - Store metadata        │   │
│     └─────────────────────────┴─────────────────────────┘   │
│                                                                │
│     d. Update status → 'completed'                            │
│     e. On Error: Retry logic (max 3 attempts)                 │
└──────────────────────────────────────────────────────────────┘
```

### Thread Detection Strategies (in order):

1. **In-Reply-To Header** (Most Reliable)
   - Check `TicketEmailCommunication` for matching `messageId`
   - Fallback: Check `Ticket.metadata.emailMessageId`

2. **References Header** (Thread History)
   - Check all message IDs in references chain
   - Search both `TicketEmailCommunication` and `Ticket` collections

3. **Subject Line** (Fallback)
   - Extract ticket number from subject (e.g., "Re: [Ticket #12345]")
   - Match recent tickets (last 7 days) with similar subjects from same sender

---

## ⚙️ Configuration

### Default Values (No .env Changes Required):
```typescript
const WORKER_INTERVAL = '*/1 * * * *';  // Every 1 minute
const BATCH_SIZE = 10;                   // 10 emails per cycle
const MAX_RETRIES = 3;                   // 3 attempts before failure
```

### Optional Environment Variables:
```bash
# Override defaults (optional)
EMAIL_WORKER_INTERVAL="*/2 * * * *"     # Every 2 minutes
EMAIL_WORKER_BATCH_SIZE=20              # 20 emails per cycle
```

---

## 📊 Status State Machine

```
pending ──┬──────► processing ────► completed
          │            │
          │            ├──► error (retry 1)
          │            │       │
          │            │       └──► pending (retry again)
          │            │
          │            ├──► error (retry 2)
          │            │       │
          │            │       └──► pending (retry again)
          │            │
          │            └──► error (retry 3)
          │                    │
          │                    └──► failed (permanent)
          │
          └─────────────────────────────────────────────────────► skipped
                                                (if ignored)
```

---

## 🧪 Testing Scenarios

### Test Scenario 1: New Email → Create Ticket
**Setup:**
1. Configure email account in project settings
2. Ensure polling service is running
3. Send email to configured address

**Expected Result:**
- Email fetched by polling service → Added to queue
- Worker processes email within 1 minute
- New ticket created with:
  * Subject from email subject
  * Description from email body
  * Priority extracted from headers or keywords
  * Status: 1 (Open)
  * submissionSource: 'email'
  * sourceEmail: sender's email
- User created/found by sender email
- TicketEmailCommunication record created
- System comment added to ticket
- Queue status: 'completed'

**Validation:**
```bash
# Check queue
db.emailprocessingqueues.find({ status: 'completed' }).pretty()

# Check ticket
db.tickets.find({ submissionSource: 'email' }).pretty()

# Check email communication
db.ticketemailcommunications.find().pretty()
```

---

### Test Scenario 2: Reply Email → Add Comment
**Setup:**
1. Use email client to reply to a ticket notification email
2. Email must include In-Reply-To or References header

**Expected Result:**
- Worker detects thread via `findEmailThread()`
- Existing ticket found
- Comment added to ticket with reply content
- TicketEmailCommunication record created
- If ticket was closed/resolved:
  * Status changed to 1 (Open)
  * resolvedAt/closedAt cleared
  * Change history entry added
- Queue status: 'completed'

**Validation:**
```bash
# Check ticket comments
db.tickets.findOne({ ticketNumber: "20240124-0001" }).comments

# Check thread detection logs
# In server console, look for: "✓ Match found via In-Reply-To"
```

---

### Test Scenario 3: Auto-Reply Ignored
**Setup:**
1. Send auto-reply email to configured address
2. Email should have `Auto-Submitted: auto-replied` header

**Expected Result:**
- Email fetched by polling service
- Worker processes but ignores due to `shouldIgnoreEmail()` check
- No ticket created
- Queue status: 'completed' (but marked as ignored)

**Validation:**
```bash
# Check logs for: "⚠️ Email is auto-reply, should be ignored"
```

---

### Test Scenario 4: Retry on Error
**Setup:**
1. Simulate database error (e.g., disconnect MongoDB temporarily)
2. Send email to configured address

**Expected Result:**
- First attempt: Error thrown → retryCount: 1, status: 'pending'
- Second attempt (1 min later): Error again → retryCount: 2, status: 'pending'
- Third attempt (1 min later): Error again → retryCount: 3, status: 'failed'
- errorMessage stored in queue

**Validation:**
```bash
# Check retry count and status
db.emailprocessingqueues.find({ status: 'failed' }).pretty()

# Check error message
db.emailprocessingqueues.findOne({ status: 'failed' }).errorMessage
```

---

### Test Scenario 5: Multiple Emails (Batch Processing)
**Setup:**
1. Send 15 emails to configured address (more than BATCH_SIZE)

**Expected Result:**
- Cycle 1: First 10 emails processed (BATCH_SIZE limit)
- Cycle 2 (1 min later): Remaining 5 emails processed
- All tickets created correctly
- Processing stats logged

**Validation:**
```bash
# Check processing cycle logs
# Look for: "Processed 10 emails in X ms"
# Then: "Processed 5 emails in X ms"

# Verify all tickets created
db.tickets.count({ submissionSource: 'email' })  // Should be 15
```

---

### Test Scenario 6: Duplicate Email Prevention
**Setup:**
1. Send same email twice (same Message-ID)

**Expected Result:**
- First email: Ticket created
- Second email: Detected as duplicate by polling service
- Not added to queue (duplicate prevention at polling level)

**Validation:**
```bash
# Check polling service logs
# Look for: "Email already processed, skipping"
```

---

### Test Scenario 7: Subject-Based Thread Detection
**Setup:**
1. Create ticket manually
2. Reply to ticket via email, but with subject containing ticket number
3. Example: "Re: [Ticket #20240124-0001] Issue with login"

**Expected Result:**
- Worker matches ticket via subject pattern
- Comment added to existing ticket (not new ticket created)
- Thread detection logs: "✓ Match found via subject line"

**Validation:**
```bash
# Check ticket has new comment
db.tickets.findOne({ ticketNumber: "20240124-0001" }).comments.length
# Should increase by 1
```

---

### Test Scenario 8: Priority Extraction
**Setup:**
1. Send email with X-Priority: 1 (high) header
2. Send email with "URGENT" in subject

**Expected Result:**
- Ticket created with priority: 'HIGH'
- Priority extracted from header or subject keywords

**Validation:**
```bash
# Check ticket priority
db.tickets.find({ submissionSource: 'email' }).pretty()
# Look for priority: 'HIGH'
```

---

### Test Scenario 9: Attachments Handling
**Setup:**
1. Send email with file attachments (PDF, images)

**Expected Result:**
- Ticket created successfully
- Attachment metadata stored in ticket.attachments array
- Logs show: "📎 Processing X attachment(s)..."
- **Note:** Actual file upload to storage (GCS/S3) is TODO
- For now, only metadata (filename, size, mimetype) is stored

**Validation:**
```bash
# Check ticket attachments
db.tickets.findOne({ submissionSource: 'email' }).attachments
# Should show array with attachment metadata
```

---

### Test Scenario 10: Long Email Content
**Setup:**
1. Send email with very long body (> 10,000 characters)

**Expected Result:**
- Ticket created with truncated description
- Description ends with: "[Email content truncated...]"
- Full content stored in TicketEmailCommunication

**Validation:**
```bash
# Check ticket description length
db.tickets.findOne({ submissionSource: 'email' }).description.length
# Should be ≤ 10,000

# Check full content in email communication
db.ticketemailcommunications.findOne().body.length
# Can be > 10,000
```

---

## 📋 Monitoring & Logs

### Startup Logs:
```
⚙️  Starting Email Processing Worker...
🚀 Starting Email Processing Worker
   Interval: */1 * * * * (every 1 minute)
   Batch Size: 10 emails/cycle
   Max Retries: 3 attempts
✅ Email Processing Worker started successfully
```

### Processing Cycle Logs:
```
============================================================
⚙️  Email Processing Cycle Started - 2024-01-24T10:30:00.000Z
============================================================
📧 Processing 3 pending emails...

   📝 Creating ticket from email: Issue with login
      ✓ Found existing user: john@example.com
      ✓ Project ID: 507f1f77bcf86cd799439011
      ✓ Priority: MEDIUM
      ✓ Ticket Number: 20240124-0015
   ✅ Ticket created: 20240124-0015 (ID: ...)
   ✅ Email communication record created (ID: ...)

   💬 Adding email reply to ticket: 20240124-0010
      ✓ Match found via In-Reply-To: <abc123@mail.com>
      ✓ Email communication record created
      ℹ️  Ticket is resolved, reopening...
   ✅ Email reply added to ticket 20240124-0010

============================================================
✅ Processing Cycle Completed
   Duration: 1.2s
   Processed: 3 emails
   Successful: 2 tickets
   Failed: 0
   Success Rate: 100.00%
============================================================
```

### Error Logs:
```
   ❌ Error processing email: User not found
      Retry: 1/3
      Status: pending (will retry)
```

---

## 🔒 Security Considerations

1. **User Creation:** External users created with minimal permissions
   - Role: "External User" or "Guest"
   - Requires password setup to login
   - Can only view their own tickets

2. **Email Validation:** Sender email validated before user creation

3. **Auto-Reply Filtering:** System emails ignored automatically

4. **Duplicate Prevention:** Message-ID tracking prevents duplicate tickets

---

## 🐛 Troubleshooting

### Issue: Worker not processing emails
**Check:**
1. Is worker started? Look for startup log: "✅ Email Processing Worker started"
2. Are there pending emails in queue?
   ```bash
   db.emailprocessingqueues.count({ status: 'pending' })
   ```
3. Check worker status:
   ```bash
   # In Node.js REPL or add endpoint
   emailProcessingWorker.getStatus()
   ```

### Issue: Tickets not created
**Check:**
1. TypeScript compilation errors
   ```bash
   npm run build
   ```
2. Database connectivity
3. Queue entry status and errorMessage
   ```bash
   db.emailprocessingqueues.find({ status: 'failed' }).pretty()
   ```

### Issue: Thread detection not working
**Check:**
1. Email headers (In-Reply-To, References)
2. Message-ID stored in TicketEmailCommunication
3. Thread detection logs in console

---

## 🚀 Performance

### Current Configuration:
- **Processing Rate:** 10 emails/minute = 600 emails/hour
- **Batch Size:** 10 (prevents memory issues)
- **Retry Delay:** 1 minute (natural cron cycle)
- **Max Queue Size:** Unlimited (MongoDB-backed)

### Scaling Options:
1. Increase `BATCH_SIZE` for higher throughput
2. Decrease `WORKER_INTERVAL` for faster processing
3. Deploy multiple workers with queue locking (future)

---

## 📚 API Reference

### EmailProcessingWorker Class

#### `start(): void`
Starts the cron job for email processing

#### `stop(): void`
Stops the worker and cleans up resources

#### `getStatus(): object`
Returns worker configuration and statistics

### Utility Functions

#### `findEmailThread(parsedEmail): Promise<Ticket | null>`
Detects existing ticket for email thread

#### `createTicketFromEmail(parsedEmail, queueEntry): Promise<Ticket>`
Creates new ticket from email

#### `addEmailReplyToTicket(ticket, parsedEmail, queueEntry): Promise<void>`
Adds email as reply to existing ticket

---

## ✅ Completion Checklist

- ✅ Email Processing Worker service created
- ✅ Email Thread Detection utility implemented
- ✅ Ticket From Email utility implemented
- ✅ Worker integrated into server startup
- ✅ Graceful shutdown handlers added
- ✅ Configuration with code-level defaults (no .env changes)
- ✅ Retry logic with max 3 attempts
- ✅ Batch processing with configurable size
- ✅ Status state machine implemented
- ✅ Comprehensive logging and monitoring
- ✅ 10 test scenarios documented
- ✅ Error handling and troubleshooting guide

---

## 🎯 Next Steps

### Immediate:
1. Test end-to-end flow with real email account
2. Monitor processing cycles and performance
3. Adjust BATCH_SIZE if needed

### Future Enhancements:
1. **Attachment Upload:** Implement file storage (GCS/S3)
2. **Email Templates:** Auto-reply with ticket number
3. **Spam Detection:** Filter spam emails
4. **Auto-Assignment:** Intelligent ticket routing
5. **Email Signatures:** Parse and remove email signatures
6. **Multi-language:** Support non-English emails
7. **Analytics:** Email-to-ticket conversion metrics

---

## 📝 Related Documentation

- [TASK_4.1_EMAIL_POLLING_COMPLETE.md](./TASK_4.1_EMAIL_POLLING_COMPLETE.md) - Email Polling Service
- [TASK_4.2_EMAIL_PARSER_COMPLETE.md](./TASK_4.2_EMAIL_PARSER_COMPLETE.md) - Email Parser
- [EMAIL_POLLING_CONFIG.md](./EMAIL_POLLING_CONFIG.md) - Configuration Guide

---

**Implementation Date:** January 24, 2024  
**Status:** ✅ COMPLETE  
**Version:** 1.0.0
