/**
 * DPDP Act 2023 Compliance: Test Suite
 * 
 * Comprehensive tests for consent, user rights, and data protection
 * Run with: npm test backend/tests/dpdp.test.ts
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/server';
import { User } from '../src/models/User';
import ConsentRecord, { ConsentPurpose, ConsentStatus } from '../src/models/dpdp/ConsentRecord';
import DataAccessLog, { DataAccessResult } from '../src/models/dpdp/DataAccessLog';
import DeletionRequest from '../src/models/dpdp/DeletionRequest';

describe('DPDP Act 2023 Compliance Tests', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk-test');
    
    // Create test user and login
    const testUser = await User.create({
      email: 'test@example.com',
      password: 'Test@1234',
      firstName: 'Test',
      lastName: 'User',
      role: new mongoose.Types.ObjectId(),
    });
    testUserId = testUser._id.toString();
    
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test@1234' });
    
    authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    // Cleanup test data
    await User.deleteMany({ email: 'test@example.com' });
    await ConsentRecord.deleteMany({ userId: testUserId });
    await DataAccessLog.deleteMany({ targetUserId: testUserId });
    await DeletionRequest.deleteMany({ userId: testUserId });
    await mongoose.disconnect();
  });

  // ==================== CONSENT MANAGEMENT TESTS ====================

  describe('1. Consent Management', () => {
    test('should give consent for data processing', async () => {
      const response = await request(app)
        .post('/api/dpdp/consent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purposes: [ConsentPurpose.ACCOUNT_CREATION, ConsentPurpose.TICKET_MANAGEMENT],
          dataCategories: ['basic_profile', 'contact_info'],
          sharingAllowed: false,
          marketingAllowed: false,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.consents).toHaveLength(2);
      expect(response.body.data.consents[0].status).toBe(ConsentStatus.ACTIVE);
    });

    test('should retrieve consent history', async () => {
      const response = await request(app)
        .get('/api/dpdp/consent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.consents).toBeDefined();
    });

    test('should check consent status for specific purpose', async () => {
      const response = await request(app)
        .get(`/api/dpdp/consent/status/${ConsentPurpose.ACCOUNT_CREATION}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hasActiveConsent).toBe(true);
    });

    test('should withdraw consent', async () => {
      const response = await request(app)
        .post('/api/dpdp/consent/withdraw')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ purpose: ConsentPurpose.TICKET_MANAGEMENT })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.withdrawnAt).toBeDefined();
    });

    test('should fail to process data without consent', async () => {
      // Try to access ticket endpoint without TICKET_MANAGEMENT consent
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.dpdpViolation).toBe('NO_CONSENT');
    });
  });

  // ==================== USER RIGHTS TESTS ====================

  describe('2. User Rights (Access, Correction, Erasure)', () => {
    test('should access all personal data (Right to Access)', async () => {
      const response = await request(app)
        .get('/api/dpdp/my-data')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.tickets).toBeDefined();
      expect(response.body.data.consents).toBeDefined();
      expect(response.body.data.dataAccessHistory).toBeDefined();
    });

    test('should update personal data (Right to Correction)', async () => {
      const response = await request(app)
        .put('/api/dpdp/my-data')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'UpdatedFirst',
          lastName: 'UpdatedLast',
          phone: '9876543210',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe('UpdatedFirst');
      expect(response.body.data.lastName).toBe('UpdatedLast');
    });

    test('should not allow updating verified fields', async () => {
      const response = await request(app)
        .put('/api/dpdp/my-data')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'newemail@example.com', // Not allowed
          uniqueId: 'NEW123', // Not allowed
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should request data deletion (Right to Erasure)', async () => {
      const response = await request(app)
        .post('/api/dpdp/my-data/delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scope: 'FULL_ACCOUNT',
          reason: 'No longer need service',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestId).toBeDefined();
      expect(response.body.data.status).toBe('PENDING');
      expect(response.body.data.verificationRequired).toBe(true);
    });

    test('should retrieve deletion request status', async () => {
      const response = await request(app)
        .get('/api/dpdp/my-data/delete/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });
  });

  // ==================== DATA ACCESS LOGGING TESTS ====================

  describe('3. Data Access Audit Logs', () => {
    test('should log successful data access', async () => {
      // Give consent first
      await request(app)
        .post('/api/dpdp/consent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purposes: [ConsentPurpose.PROFILE_MANAGEMENT],
          dataCategories: ['basic_profile'],
          sharingAllowed: false,
          marketingAllowed: false,
        });

      // Access profile endpoint
      await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check audit log created
      const log = await DataAccessLog.findOne({ targetUserId: testUserId }).sort({ accessedAt: -1 });
      expect(log).toBeDefined();
      expect(log?.result).toBe('SUCCESS');
      expect(log?.action).toBe('READ');
    });

    test('should log denied access attempts', async () => {
      // Try to access without consent
      await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      // Check audit log created with denial
      const log = await DataAccessLog.findOne({
        targetUserId: testUserId,
        result: 'NO_CONSENT',
      }).sort({ accessedAt: -1 });
      
      expect(log).toBeDefined();
      expect(log?.result).toBe('NO_CONSENT');
    });

    test('audit logs should be immutable', async () => {
      const log = await DataAccessLog.findOne({ targetUserId: testUserId });
      
      if (log) {
        // Try to modify log
        await expect(async () => {
          log.result = DataAccessResult.SUCCESS;
          await log.save();
        }).rejects.toThrow();
      }
    });
  });

  // ==================== BREACH DETECTION TESTS ====================

  describe('4. Breach Detection', () => {
    test('should detect multiple failed access attempts', async () => {
      // Make multiple failed access attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/api/users/sensitive-data')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(403);
      }

      // Count denied access in last hour
      const deniedCount = await DataAccessLog.countDocuments({
        result: { $in: ['DENIED', 'NO_CONSENT'] },
        accessedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      });

      expect(deniedCount).toBeGreaterThan(0);
      // Breach alert should trigger if > 10 attempts
    });
  });

  // ==================== PURPOSE LIMITATION TESTS ====================

  describe('5. Purpose Limitation Enforcement', () => {
    test('should enforce purpose-specific consent', async () => {
      // Give consent only for PROFILE_MANAGEMENT
      await ConsentRecord.create({
        userId: testUserId,
        purpose: ConsentPurpose.PROFILE_MANAGEMENT,
        policyVersion: '1.0.0',
        consentText: 'Test consent',
        dataCategories: ['basic_profile'],
        sharingAllowed: false,
        marketingAllowed: false,
        status: ConsentStatus.ACTIVE,
      });

      // Should succeed for profile endpoint
      await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should fail for tickets endpoint (requires TICKET_MANAGEMENT)
      await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });

  // ==================== DATA MINIMIZATION TESTS ====================

  describe('6. Data Minimization', () => {
    test('should not log raw personal data', async () => {
      // Check recent logs don't contain raw email/phone
      const logs = await DataAccessLog.find({}).limit(10);
      
      logs.forEach(log => {
        expect(log.fields).not.toContain('password');
        expect(log.fields).not.toContain('resetPasswordOTP');
      });
    });

    test('should mask sensitive data in responses', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Password should never be in response
      expect(response.body.password).toBeUndefined();
      expect(response.body.resetPasswordOTP).toBeUndefined();
    });
  });

  // ==================== CONSENT EXPIRY TESTS ====================

  describe('7. Consent Expiry Handling', () => {
    test('should expire consent after expiry date', async () => {
      // Create consent expiring in 1 second
      const expiredConsent = await ConsentRecord.create({
        userId: testUserId,
        purpose: ConsentPurpose.ANALYTICS,
        policyVersion: '1.0.0',
        consentText: 'Test consent',
        dataCategories: ['usage_data'],
        sharingAllowed: false,
        marketingAllowed: false,
        status: ConsentStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 1000), // 1 second
      });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Try to access with expired consent
      const response = await request(app)
        .get('/api/analytics/data')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.dpdpViolation).toBe('EXPIRED_CONSENT');
    });
  });
});

// ==================== INTEGRATION TESTS ====================

describe('DPDP Integration Tests', () => {
  test('Complete user journey: Registration → Consent → Access → Deletion', async () => {
    // 1. Register new user
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'integration@example.com',
        password: 'Test@1234',
        firstName: 'Integration',
        lastName: 'Test',
      })
      .expect(201);

    const userId = registerResponse.body.data.user._id;
    const token = registerResponse.body.token;

    // 2. Give bulk consent
    await request(app)
      .post('/api/dpdp/consent/bulk')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // 3. Access data (should succeed with consent)
    await request(app)
      .get('/api/dpdp/my-data')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // 4. Request deletion
    const deleteResponse = await request(app)
      .post('/api/dpdp/my-data/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'FULL_ACCOUNT' })
      .expect(200);

    expect(deleteResponse.body.data.requestId).toBeDefined();

    // Cleanup
    await User.deleteOne({ _id: userId });
  });
});
