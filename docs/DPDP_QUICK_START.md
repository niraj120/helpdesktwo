# DPDP Quick Start - 5 Minute Setup

## 🚀 Immediate Deployment Steps

### 1. Install Dependencies (Already Done)
```bash
cd backend
npm install
# All required packages already in package.json
```

### 2. Add DPDP Routes to Server
```typescript
// backend/src/server.ts

// ADD THIS IMPORT at top:
import dpdpRoutes from './routes/dpdp.routes';

// ADD THIS ROUTE after other routes:
app.use('/api/dpdp', dpdpRoutes);

// OPTIONAL: Enable automatic consent checking for all routes
import { autoConsentCheck } from './middleware/dpdp/consentMiddleware';
app.use('/api', autoConsentCheck);
```

### 3. Create Database Indexes
```bash
cd backend
node src/scripts/create-dpdp-indexes.js
```

**Expected Output**:
```
🔗 Connecting to MongoDB...
✅ Connected successfully
📝 Creating indexes for consent_records...
✅ Consent records indexes created
🔍 Creating indexes for data_access_logs...
✅ Data access logs indexes created
🗑️ Creating indexes for deletion_requests...
✅ Deletion requests indexes created
🎉 All DPDP indexes created successfully!
```

### 4. Environment Variables
```bash
# Add to backend/.env
PRIVACY_POLICY_VERSION=1.0.0
DELETION_SLA_DAYS=30
DPO_EMAIL=dpo@yourcompany.com
SECURITY_WEBHOOK_URL=https://your-security-system.com/webhook
```

### 5. Update Registration Flow (CRITICAL)
```typescript
// backend/src/controllers/authController.ts (or wherever registration happens)

// ADD THIS IMPORT:
import ConsentRecord, { ConsentPurpose, ConsentStatus } from '../models/dpdp/ConsentRecord';

// AFTER user creation, ADD THIS:
async function giveDefaultConsents(userId: string, ipAddress: string, userAgent: string) {
  const defaultPurposes = [
    ConsentPurpose.ACCOUNT_CREATION,
    ConsentPurpose.TICKET_MANAGEMENT,
    ConsentPurpose.COMMUNICATION,
    ConsentPurpose.PROFILE_MANAGEMENT,
  ];

  const consentText = `I consent to the processing of my personal data for: ${defaultPurposes.join(', ')}. Privacy Policy Version: ${process.env.PRIVACY_POLICY_VERSION || '1.0.0'}`;

  await Promise.all(
    defaultPurposes.map(purpose =>
      ConsentRecord.create({
        userId: new mongoose.Types.ObjectId(userId),
        purpose,
        policyVersion: process.env.PRIVACY_POLICY_VERSION || '1.0.0',
        consentedAt: new Date(),
        status: ConsentStatus.ACTIVE,
        ipAddress,
        userAgent,
        consentText,
        dataCategories: ['basic_profile', 'contact_info', 'communication_history'],
        sharingAllowed: false,
        marketingAllowed: false,
      })
    )
  );
}

// IN YOUR REGISTRATION FUNCTION:
// After: const newUser = await User.create({...});
// Add:
await giveDefaultConsents(
  newUser._id.toString(), 
  req.ip || 'unknown', 
  req.get('User-Agent') || 'unknown'
);
```

### 6. Add Frontend Route (Optional)
```typescript
// frontend/src/App.tsx

// ADD THIS IMPORT:
import ConsentManagement from './components/ConsentManagement';

// ADD THIS ROUTE:
<Route 
  path="/consent" 
  element={
    <ProtectedRoute requireAuth={true}>
      <ConsentManagement />
    </ProtectedRoute>
  } 
/>
```

### 7. Restart Servers
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

---

## ✅ Verification Checklist

### Backend Verification
```bash
# Check if routes are registered
curl http://localhost:5000/api/dpdp/consent
# Should return 401 (authentication required) - this is correct

# Check if indexes created
mongosh
> use sac-helpdesk
> db.consent_records.getIndexes()
# Should show 10 indexes

> db.data_access_logs.getIndexes()
# Should show 16 indexes

> db.deletion_requests.getIndexes()
# Should show 14 indexes
```

### Registration Flow Test
1. Register a new user via your registration endpoint
2. Check MongoDB: `db.consent_records.find().pretty()`
3. Should see 4 consent records with status "ACTIVE"

### Consent UI Test
1. Open browser: `http://localhost:5173/consent`
2. Should see consent management page
3. Verify consents show as "Active"
4. Try withdrawing a non-required consent
5. Try granting a new consent

---

## 🔒 Security Verification

### HTTPS Check (Production Only)
```bash
# Verify SSL certificate
curl -I https://your-domain.com/api/health
# Should return 200 OK with HTTPS
```

### MongoDB Encryption Check
```bash
# Check if encryption at rest is enabled
mongosh --eval "db.adminCommand({ getParameter: 1, encryptionAtRest: 1 })"
```

### JWT Secret Strength
```bash
# In .env file, verify:
JWT_SECRET=<at-least-32-characters-long-random-string>
```

---

## 🧪 Testing (5 Minutes)

### Manual Test Flow
```bash
# 1. Register new user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234",
    "firstName": "Test",
    "lastName": "User"
  }'

# 2. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234"
  }'
# Copy the "token" from response

# 3. Check consents
curl -X GET http://localhost:5000/api/dpdp/consent \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Request data export
curl -X GET http://localhost:5000/api/dpdp/my-data \
  -H "Authorization: Bearer YOUR_TOKEN"

# 5. Update personal data
curl -X PUT http://localhost:5000/api/dpdp/my-data \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "UpdatedName"
  }'
```

---

## ⚠️ Common Issues & Fixes

### Issue 1: "Cannot find module './routes/dpdp.routes'"
**Fix**: Verify file path is correct:
```bash
ls backend/src/routes/dpdp.routes.ts
# Should exist
```

### Issue 2: "ConsentRecord is not defined"
**Fix**: Ensure imports in registration controller:
```typescript
import ConsentRecord, { ConsentPurpose, ConsentStatus } from '../models/dpdp/ConsentRecord';
import mongoose from 'mongoose';
```

### Issue 3: Database indexes not created
**Fix**: Check MongoDB connection string in .env:
```bash
# .env
MONGODB_URI=mongodb://localhost:27017/sac-helpdesk
# OR
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/sac-helpdesk
```

### Issue 4: Consent middleware blocking all requests
**Fix**: Check exempt endpoints in middleware:
```typescript
// backend/src/middleware/dpdp/consentMiddleware.ts
const EXEMPT_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/register',  // Make sure this is here
  '/api/auth/logout',
  '/api/health',
  '/api/dpdp/consent',
  '/api/dpdp/my-data',
];
```

---

## 🎯 Success Indicators

### After Setup, You Should See:

✅ **40 new database indexes created**
```
consent_records: 10 indexes
data_access_logs: 16 indexes
deletion_requests: 14 indexes
```

✅ **New API endpoints working**
```
GET  /api/dpdp/consent
POST /api/dpdp/consent
GET  /api/dpdp/my-data
PUT  /api/dpdp/my-data
POST /api/dpdp/my-data/delete
```

✅ **Default consents on registration**
```
New user → 4 consent records auto-created
Purposes: ACCOUNT_CREATION, TICKET_MANAGEMENT, COMMUNICATION, PROFILE_MANAGEMENT
Status: All ACTIVE
```

✅ **Audit logs being created**
```
db.data_access_logs.countDocuments()
# Should increase with each API call
```

---

## 📊 Monitoring (Post-Deployment)

### Daily Checks
```javascript
// Count active consents
db.consent_records.countDocuments({ status: 'ACTIVE' })

// Count pending deletions
db.deletion_requests.countDocuments({ status: 'PENDING' })

// Check for breaches (denied access >10 in last hour)
db.data_access_logs.countDocuments({
  result: { $in: ['DENIED', 'NO_CONSENT'] },
  accessedAt: { $gte: new Date(Date.now() - 3600000) }
})
```

### Weekly Review
```javascript
// Consent withdrawal rate
const total = db.consent_records.countDocuments()
const withdrawn = db.consent_records.countDocuments({ status: 'WITHDRAWN' })
const rate = (withdrawn / total * 100).toFixed(2)
print(`Withdrawal rate: ${rate}%`)

// Deletion SLA compliance
db.deletion_requests.find({
  isOverdue: true,
  status: { $in: ['PENDING', 'IN_PROGRESS'] }
}).count()
// Should be 0
```

---

## 🚨 Emergency Rollback (If Needed)

If something breaks, you can safely disable DPDP middleware:

```typescript
// backend/src/server.ts

// COMMENT OUT THIS LINE:
// app.use('/api', autoConsentCheck);

// DPDP routes still work, but consent validation is disabled
// This gives you time to debug without blocking users
```

**Note**: Audit logs and user rights APIs will still work!

---

## 📞 Support Contacts

- **Technical Issues**: Check `docs/DPDP_ACT_2023_IMPLEMENTATION.md`
- **Legal Questions**: Contact Data Protection Officer (`DPO_EMAIL` in .env)
- **Security Concerns**: Contact security team immediately

---

## ✅ Final Checklist

Before going to production:

- [ ] Indexes created (run script)
- [ ] Routes registered in server.ts
- [ ] Registration flow updated (default consents)
- [ ] Environment variables set
- [ ] HTTPS enabled (production)
- [ ] MongoDB encryption verified
- [ ] Privacy policy published
- [ ] DPO appointed and contact info set
- [ ] Test suite passed
- [ ] Consent UI accessible to users

---

**Estimated Time**: ⏱️ **5 minutes for setup + 5 minutes for testing = 10 minutes total**

**Status**: 🟢 **READY FOR DEPLOYMENT**

