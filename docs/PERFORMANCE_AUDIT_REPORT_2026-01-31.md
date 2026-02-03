# Portal Performance Audit Report
**Date:** January 31, 2026  
**Auditor:** GitHub Copilot  
**Project:** SAC Helpdesk Portal

---

## Executive Summary

This report provides a comprehensive analysis of database queries, API performance, and optimization opportunities for the SAC Helpdesk portal. The audit identifies critical performance bottlenecks and provides actionable recommendations.

### Overall Health Score: 7/10 ⚠️

| Category | Status | Priority |
|----------|--------|----------|
| Database Indexes | ✅ Good | - |
| N+1 Query Problems | ❌ Critical | HIGH |
| Pagination | ⚠️ Partial | MEDIUM |
| Query Optimization | ⚠️ Needs Work | MEDIUM |
| Caching | ⚠️ Frontend Only | MEDIUM |
| API Response Times | ⚠️ Unknown | HIGH |

---

## Phase 1: Database Query Analysis

### 1.1 Database Schema & Indexes Status

#### ✅ Well-Indexed Collections

**Ticket Model** (`backend/src/models/Ticket.ts`)
```javascript
// Existing Indexes (Lines 237-239)
TicketSchema.index({ createdBy: 1, createdAt: -1 });
TicketSchema.index({ assignedTo: 1, status: 1 });
TicketSchema.index({ ticketNumber: 'text', title: 'text', description: 'text' });

// Field-level indexes
- ticketNumber: unique, indexed
- status: indexed
- priority: indexed
- category: indexed
- project: indexed
- submissionSource: indexed
- sourceEmail: indexed
- resolvedAt: indexed
- closedAt: indexed
```

**User Model** (`backend/src/models/User.ts`)
```javascript
// Indexes (Lines 241-251)
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ uniqueId: 1 });
userSchema.index({ fullName: 1 });
userSchema.index({ mobile: 1 });
userSchema.index({ employeeCode: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ projects: 1 });
userSchema.index({ department: 1 });
userSchema.index({ hrmsId: 1 });
```

**Category Model** (`backend/src/models/Category.ts`)
```javascript
// Compound Indexes (Lines 74-80)
CategorySchema.index({ name: 1, projectId: 1 }, { unique: true });
CategorySchema.index({ code: 1, projectId: 1 }, { unique: true });
CategorySchema.index({ projectId: 1, isActive: 1 });
CategorySchema.index({ projectId: 1, order: 1 });
```

**Center Model** (`backend/src/models/Center.ts`)
```javascript
// Field-level indexes
- projectId: indexed
- city: indexed
- state: indexed
- isActive: indexed
```

**Role Model** (`backend/src/models/Role.ts`)
```javascript
// Indexes (Lines 100-103)
roleSchema.index({ code: 1, projectId: 1 }, { unique: true, sparse: true });
roleSchema.index({ code: 1 });
roleSchema.index({ projects: 1 });
roleSchema.index({ type: 1 });
```

#### ⚠️ Missing Indexes (Recommendations)

1. **Ticket.metadata.projectId** - Heavily queried but not indexed
   ```javascript
   // Add to Ticket model
   TicketSchema.index({ 'metadata.projectId': 1 });
   TicketSchema.index({ 'metadata.projectId': 1, status: 1 });
   TicketSchema.index({ 'metadata.projectId': 1, createdAt: -1 });
   TicketSchema.index({ 'metadata.centerId': 1 });
   ```

2. **Ticket Compound Indexes for Dashboard**
   ```javascript
   TicketSchema.index({ 'metadata.projectId': 1, priority: 1 });
   TicketSchema.index({ 'metadata.projectId': 1, category: 1 });
   ```

3. **Project.branding.customUrlPath** - Used for URL-based lookups
   ```javascript
   ProjectSchema.index({ 'branding.customUrlPath': 1 }, { unique: true, sparse: true });
   ```

---

### 1.2 Slow Queries Identified

#### ❌ CRITICAL: N+1 Query Problems

**Location:** `backend/src/controllers/ticketController.ts`

**Problem 1: getMyTickets() - Lines 738-767**
```typescript
// ❌ N+1 PROBLEM: Querying Project and Center for EACH ticket
const ticketsWithProject = await Promise.all(
  tickets.map(async (ticket) => {
    const ticketObj = ticket.toObject();
    if (ticketObj.metadata?.projectId) {
      const project = await Project.findById(ticketObj.metadata.projectId).select('name code');
      // ... Individual query per ticket
    }
    if (ticketObj.metadata?.centerId && ticketObj.metadata.centerId !== 'online') {
      const center = await Center.findById(ticketObj.metadata.centerId).select('centerName city state');
      // ... Individual query per ticket
    }
    return ticketObj;
  })
);
```
**Impact:** If 100 tickets, this creates 100-200 additional DB queries!

**Problem 2: getAllTickets() - Lines 992-1043**
Same N+1 pattern repeated.

**Problem 3: getAgentAssignedTickets() - Lines 1130-1156**
Same N+1 pattern repeated.

#### ✅ SOLUTION: Batch Populate Pattern

```typescript
// OPTIMIZED: Batch fetch all projects and centers first
const projectIds = [...new Set(tickets.map(t => t.metadata?.projectId).filter(Boolean))];
const centerIds = [...new Set(tickets.map(t => t.metadata?.centerId).filter(id => id && id !== 'online'))];

const [projects, centers] = await Promise.all([
  Project.find({ _id: { $in: projectIds } }).select('name code').lean(),
  Center.find({ _id: { $in: centerIds } }).select('centerName city state').lean()
]);

const projectMap = new Map(projects.map(p => [p._id.toString(), p]));
const centerMap = new Map(centers.map(c => [c._id.toString(), c]));

// Now just map without additional queries
const ticketsWithProject = tickets.map(ticket => {
  const ticketObj = ticket.toObject();
  if (ticketObj.metadata?.projectId) {
    ticketObj.metadata.projectId = projectMap.get(ticketObj.metadata.projectId.toString());
  }
  if (ticketObj.metadata?.centerId && ticketObj.metadata.centerId !== 'online') {
    ticketObj.metadata.centerId = centerMap.get(ticketObj.metadata.centerId.toString());
  }
  return ticketObj;
});
```

---

### 1.3 Queries Without Pagination

**Location:** `backend/src/controllers/ticketController.ts`

**Problem:** `getMyTickets()` returns ALL tickets without pagination
```typescript
// Line 718-724
const tickets = await Ticket.find(query)
  .populate('assignedTo', 'firstName lastName email')
  .populate('category', 'name code')
  .sort({ createdAt: -1 });
// ❌ No .skip() or .limit()
```

**Problem:** `getAgentAssignedTickets()` returns ALL tickets without pagination
```typescript
// Line 1122-1127
const tickets = await Ticket.find(query)
  .populate('assignedTo', 'firstName lastName email')
  .sort({ createdAt: -1 });
// ❌ No .skip() or .limit()
```

#### ✅ Already Paginated (Good Examples)

- `getAllTickets()` - Uses pagination correctly (Lines 783-793)
- `getAllUsers()` - Uses pagination correctly (Lines 53-70)

---

### 1.4 Queries Without Proper Filters

**Location:** Various controllers loading reference data

```typescript
// backend/src/controllers/ticketController.ts (Line 984)
const priorities = await Priority.find({});
// ❌ Loads ALL priorities without project filter

// backend/src/controllers/masterDataController.ts (Line 10)
const masterData = await MasterData.find();
// ❌ No filter at all - full table scan

// backend/src/controllers/formBuilder/formController.ts (Line 31)
const forms = await Form.find();
// ❌ No filter at all - full table scan
```

---

### 1.5 SELECT * Issues (Fetching Unnecessary Fields)

**Location:** `backend/src/controllers/ticketController.ts`

```typescript
// Line 601-603 - User lookup fetches role with full permissions
const user = await User.findById(userId).populate({
  path: 'role',
  populate: {
    path: 'permissions',
    model: 'Permission'
  }
});
```
**Issue:** Full Permission documents loaded when only `code` field is needed.

**Solution:**
```typescript
const user = await User.findById(userId).populate({
  path: 'role',
  select: 'name code isAgent projects',
  populate: {
    path: 'permissions',
    model: 'Permission',
    select: 'code' // Only need permission codes
  }
});
```

---

## Phase 2: Performance Recommendations

### 2.1 Immediate Fixes (HIGH Priority)

| # | Issue | Location | Fix | Est. Impact |
|---|-------|----------|-----|-------------|
| 1 | N+1 Queries | ticketController.ts:738-767 | Batch populate | 10x faster |
| 2 | N+1 Queries | ticketController.ts:992-1043 | Batch populate | 10x faster |
| 3 | N+1 Queries | ticketController.ts:1130-1156 | Batch populate | 10x faster |
| 4 | Missing Index | metadata.projectId | Add compound index | 5x faster |
| 5 | No Pagination | getMyTickets() | Add pagination | Memory safe |
| 6 | No Pagination | getAgentAssignedTickets() | Add pagination | Memory safe |

### 2.2 Medium Priority Fixes

| # | Issue | Location | Fix | Est. Impact |
|---|-------|----------|-----|-------------|
| 7 | Over-fetching | User permissions | Add .select() | 20% faster |
| 8 | No Caching | Backend APIs | Add Redis cache | 50% faster |
| 9 | No Filters | masterDataController | Add project filter | 30% faster |

### 2.3 Backend Caching Strategy

Currently, caching exists only on the frontend (`useApiCache.ts`). Backend needs:

```typescript
// Recommended: Add Redis-based caching middleware
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const cacheMiddleware = (ttl: number = 300) => async (req, res, next) => {
  const key = `cache:${req.originalUrl}`;
  const cached = await redis.get(key);
  
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  res.originalJson = res.json;
  res.json = (data) => {
    redis.setex(key, ttl, JSON.stringify(data));
    return res.originalJson(data);
  };
  
  next();
};

// Usage on frequently-accessed endpoints
app.get('/api/projects/branding/:urlPath', cacheMiddleware(3600), getBranding);
app.get('/api/priorities', cacheMiddleware(3600), getPriorities);
app.get('/api/categories/:projectId', cacheMiddleware(600), getCategories);
```

---

## Phase 3: Index Creation Script

### 3.1 Updated Index Script

```javascript
// File: backend/scripts/performance/add-performance-indexes.js

const mongoose = require('mongoose');

async function addPerformanceIndexes() {
  const db = mongoose.connection.db;
  
  console.log('📋 Creating performance indexes for tickets...');
  
  // Critical: metadata.projectId is heavily used but not indexed in schema
  await db.collection('tickets').createIndex({ 'metadata.projectId': 1 });
  await db.collection('tickets').createIndex({ 'metadata.projectId': 1, status: 1 });
  await db.collection('tickets').createIndex({ 'metadata.projectId': 1, createdAt: -1 });
  await db.collection('tickets').createIndex({ 'metadata.centerId': 1 });
  await db.collection('tickets').createIndex({ 'metadata.projectId': 1, priority: 1 });
  await db.collection('tickets').createIndex({ 'metadata.projectId': 1, assignedTo: 1 });
  
  console.log('📂 Creating indexes for projects...');
  await db.collection('projects').createIndex({ 'branding.customUrlPath': 1 }, { unique: true, sparse: true });
  
  console.log('✅ All performance indexes created!');
}
```

---

## Phase 4: Query Execution Times (Manual Testing Required)

To measure actual query times, add profiling:

```typescript
// Add to server.ts
mongoose.set('debug', (collectionName, method, query, doc) => {
  const start = Date.now();
  // Log after execution
  console.log(`[MONGO] ${collectionName}.${method}() ${Date.now() - start}ms`);
});
```

Or enable MongoDB profiler:
```javascript
db.setProfilingLevel(1, { slowms: 100 }); // Log queries > 100ms
db.system.profile.find().sort({ ts: -1 }).limit(10);
```

---

## Phase 5: Action Items Checklist

### Immediate (Do This Week)

- [ ] Fix N+1 queries in ticketController.ts (3 locations)
- [ ] Add `metadata.projectId` compound indexes
- [ ] Add pagination to `getMyTickets()` and `getAgentAssignedTickets()`
- [ ] Run updated index script

### Short Term (Next 2 Weeks)

- [ ] Implement Redis caching for branding/config endpoints
- [ ] Add `.select()` to limit fields in User population
- [ ] Add API response time monitoring middleware
- [ ] Set up MongoDB profiling for slow query detection

### Long Term (Next Month)

- [ ] Implement query result caching
- [ ] Add CDN for static assets
- [ ] Database connection pooling optimization
- [ ] Consider read replicas for heavy read operations

---

## Appendix A: Existing Index Verification

Run this to see current indexes:

```javascript
// backend/scripts/verify-indexes.js
const mongoose = require('mongoose');

async function verifyIndexes() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const collections = ['tickets', 'users', 'projects', 'roles', 'centers', 'categories'];
  
  for (const coll of collections) {
    console.log(`\n📋 ${coll.toUpperCase()} indexes:`);
    const indexes = await db.collection(coll).indexes();
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
  }
  
  mongoose.disconnect();
}

verifyIndexes();
```

---

## Appendix B: Performance Monitoring Setup

### Add Response Time Logging

```typescript
// backend/src/middleware/responseTime.ts
import { Request, Response, NextFunction } from 'express';

export const responseTimeMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;
    
    // Log slow requests (> 500ms)
    if (duration > 500) {
      console.warn(`⚠️ SLOW API: ${method} ${url} - ${duration}ms [${status}]`);
    }
    
    // Could also send to monitoring service
    // metrics.recordApiLatency(url, method, duration, status);
  });
  
  next();
};

// Add to server.ts
app.use(responseTimeMiddleware);
```

---

**Report Generated:** January 31, 2026  
**Next Audit Due:** March 31, 2026
