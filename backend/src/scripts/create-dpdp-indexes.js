/**
 * DPDP Act 2023 Compliance: Database Indexes
 * 
 * Create indexes for DPDP compliance models
 * Run this script after deploying new models
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk';

async function createDPDPIndexes() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected successfully\n');

    const db = mongoose.connection.db;

    // ==================== CONSENT RECORDS ====================
    console.log('📝 Creating indexes for consent_records...');
    await db.collection('consent_records').createIndex(
      { userId: 1 },
      { name: 'idx_userId' }
    );
    await db.collection('consent_records').createIndex(
      { purpose: 1 },
      { name: 'idx_purpose' }
    );
    await db.collection('consent_records').createIndex(
      { status: 1 },
      { name: 'idx_status' }
    );
    await db.collection('consent_records').createIndex(
      { policyVersion: 1 },
      { name: 'idx_policyVersion' }
    );
    await db.collection('consent_records').createIndex(
      { consentedAt: 1 },
      { name: 'idx_consentedAt' }
    );
    await db.collection('consent_records').createIndex(
      { withdrawnAt: 1 },
      { name: 'idx_withdrawnAt', sparse: true }
    );
    await db.collection('consent_records').createIndex(
      { expiresAt: 1 },
      { name: 'idx_expiresAt', sparse: true }
    );
    
    // Compound indexes for efficient queries
    await db.collection('consent_records').createIndex(
      { userId: 1, purpose: 1, status: 1 },
      { name: 'idx_user_purpose_status' }
    );
    await db.collection('consent_records').createIndex(
      { userId: 1, status: 1, expiresAt: 1 },
      { name: 'idx_user_status_expiry' }
    );
    await db.collection('consent_records').createIndex(
      { status: 1, expiresAt: 1 },
      { name: 'idx_status_expiry_batch' }
    );
    console.log('✅ Consent records indexes created\n');

    // ==================== DATA ACCESS LOGS ====================
    console.log('🔍 Creating indexes for data_access_logs...');
    await db.collection('data_access_logs').createIndex(
      { accessorUserId: 1 },
      { name: 'idx_accessorUserId', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { targetUserId: 1 },
      { name: 'idx_targetUserId', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { dataCategory: 1 },
      { name: 'idx_dataCategory', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { accessedAt: 1 },
      { name: 'idx_accessedAt', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { purpose: 1 },
      { name: 'idx_purpose', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { action: 1 },
      { name: 'idx_action', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { result: 1 },
      { name: 'idx_result', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { sessionId: 1 },
      { name: 'idx_sessionId', immutable: true, sparse: true }
    );
    await db.collection('data_access_logs').createIndex(
      { projectId: 1 },
      { name: 'idx_projectId', immutable: true, sparse: true }
    );
    await db.collection('data_access_logs').createIndex(
      { ticketId: 1 },
      { name: 'idx_ticketId', immutable: true, sparse: true }
    );
    
    // Compound indexes
    await db.collection('data_access_logs').createIndex(
      { targetUserId: 1, accessedAt: -1 },
      { name: 'idx_target_time', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { accessorUserId: 1, accessedAt: -1 },
      { name: 'idx_accessor_time', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { result: 1, accessedAt: -1 },
      { name: 'idx_result_time_breach', immutable: true }
    );
    await db.collection('data_access_logs').createIndex(
      { projectId: 1, accessedAt: -1 },
      { name: 'idx_project_time', immutable: true }
    );
    
    // TTL index - retain logs for 7 years (220752000 seconds)
    await db.collection('data_access_logs').createIndex(
      { accessedAt: 1 },
      { name: 'idx_ttl_7years', expireAfterSeconds: 220752000 }
    );
    console.log('✅ Data access logs indexes created\n');

    // ==================== DELETION REQUESTS ====================
    console.log('🗑️ Creating indexes for deletion_requests...');
    await db.collection('deletion_requests').createIndex(
      { userId: 1 },
      { name: 'idx_userId' }
    );
    await db.collection('deletion_requests').createIndex(
      { requestedBy: 1 },
      { name: 'idx_requestedBy' }
    );
    await db.collection('deletion_requests').createIndex(
      { status: 1 },
      { name: 'idx_status' }
    );
    await db.collection('deletion_requests').createIndex(
      { requestedAt: 1 },
      { name: 'idx_requestedAt' }
    );
    await db.collection('deletion_requests').createIndex(
      { processedAt: 1 },
      { name: 'idx_processedAt', sparse: true }
    );
    await db.collection('deletion_requests').createIndex(
      { completedAt: 1 },
      { name: 'idx_completedAt', sparse: true }
    );
    await db.collection('deletion_requests').createIndex(
      { slaDeadline: 1 },
      { name: 'idx_slaDeadline' }
    );
    await db.collection('deletion_requests').createIndex(
      { isOverdue: 1 },
      { name: 'idx_isOverdue' }
    );
    await db.collection('deletion_requests').createIndex(
      { verificationToken: 1 },
      { name: 'idx_verificationToken', sparse: true }
    );
    await db.collection('deletion_requests').createIndex(
      { legalHoldUntil: 1 },
      { name: 'idx_legalHoldUntil', sparse: true }
    );
    await db.collection('deletion_requests').createIndex(
      { projectId: 1 },
      { name: 'idx_projectId', sparse: true }
    );
    
    // Compound indexes
    await db.collection('deletion_requests').createIndex(
      { userId: 1, status: 1 },
      { name: 'idx_user_status' }
    );
    await db.collection('deletion_requests').createIndex(
      { status: 1, slaDeadline: 1 },
      { name: 'idx_status_sla' }
    );
    await db.collection('deletion_requests').createIndex(
      { isOverdue: 1, status: 1 },
      { name: 'idx_overdue_status' }
    );
    console.log('✅ Deletion requests indexes created\n');

    console.log('🎉 All DPDP indexes created successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Consent Records: 10 indexes');
    console.log('   - Data Access Logs: 16 indexes (including TTL)');
    console.log('   - Deletion Requests: 14 indexes');
    console.log('   - Total: 40 indexes\n');

  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

createDPDPIndexes();
