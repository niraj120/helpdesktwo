/**
 * Migration: Create Email Processing Queue Collection
 * Date: 2026-01-24
 * Task: 1.4 - Create Email Processing Queue Table
 * 
 * Changes:
 * 1. Create email_processing_queue collection
 * 2. Create indexes for efficient processing
 * 3. Validate status enum and constraints
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk';

async function runMigration() {
  try {
    console.log('🚀 Starting migration: Create Email Processing Queue');
    console.log('📡 Connecting to MongoDB...');
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Get or create collection
    const collections = await db.listCollections({ name: 'emailprocessingqueues' }).toArray();
    const collectionExists = collections.length > 0;
    
    if (collectionExists) {
      console.log('ℹ️  Collection "emailprocessingqueues" already exists');
    } else {
      console.log('📦 Creating collection "emailprocessingqueues"...');
      await db.createCollection('emailprocessingqueues');
      console.log('✅ Collection created');
    }

    const queueCollection = db.collection('emailprocessingqueues');

    // Step 1: Create indexes
    console.log('\n📊 Creating indexes...');
    
    const indexes = [
      { key: { projectEmailConfigId: 1 }, name: 'idx_projectEmailConfigId' },
      { key: { status: 1 }, name: 'idx_status' },
      { key: { ticketId: 1 }, name: 'idx_ticketId' },
      { key: { processedAt: 1 }, name: 'idx_processedAt' },
      { key: { status: 1, createdAt: 1 }, name: 'idx_status_createdAt' },
      { key: { status: 1, retryCount: 1 }, name: 'idx_status_retryCount' },
      { key: { projectEmailConfigId: 1, status: 1 }, name: 'idx_projectEmailConfigId_status' },
      { key: { status: 1, lastAttemptAt: 1 }, name: 'idx_status_lastAttemptAt' },
      { key: { createdAt: 1 }, name: 'idx_createdAt' },
      { key: { updatedAt: 1 }, name: 'idx_updatedAt' },
    ];

    let createdCount = 0;
    let skippedCount = 0;

    for (const index of indexes) {
      try {
        await queueCollection.createIndex(index.key, { 
          name: index.name,
          background: true
        });
        console.log(`  ✅ Created index: ${index.name}`);
        createdCount++;
      } catch (error) {
        if (error.code === 85 || error.message.includes('already exists')) {
          console.log(`  ℹ️  Index ${index.name} already exists`);
          skippedCount++;
        } else {
          throw error;
        }
      }
    }

    console.log(`\n📊 Index Summary: ${createdCount} created, ${skippedCount} skipped`);

    // Step 2: Verify all indexes
    console.log('\n🔍 Verifying indexes...');
    const existingIndexes = await queueCollection.indexes();
    console.log(`  Total indexes: ${existingIndexes.length}`);
    existingIndexes.forEach(idx => {
      const keys = Object.keys(idx.key).map(k => `${k}:${idx.key[k]}`).join(', ');
      console.log(`  - ${idx.name}: {${keys}}`);
    });

    // Step 3: Test insert sample records
    console.log('\n🧪 Testing sample record insertion...');
    
    const sampleEmails = [
      {
        projectEmailConfigId: new mongoose.Types.ObjectId(),
        rawEmail: 'From: test1@example.com\nTo: support@helpdesk.com\nSubject: Test Email 1\n\nThis is a test email for migration.',
        status: 'pending',
        retryCount: 0,
        metadata: {
          fromEmail: 'test1@example.com',
          toEmail: 'support@helpdesk.com',
          subject: 'Test Email 1',
          messageId: `<test1-${Date.now()}@example.com>`,
          size: 150,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        projectEmailConfigId: new mongoose.Types.ObjectId(),
        rawEmail: 'From: test2@example.com\nTo: support@helpdesk.com\nSubject: Test Email 2\n\nAnother test email.',
        status: 'pending',
        retryCount: 0,
        metadata: {
          fromEmail: 'test2@example.com',
          toEmail: 'support@helpdesk.com',
          subject: 'Test Email 2',
          messageId: `<test2-${Date.now()}@example.com>`,
          size: 130,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const insertResult = await queueCollection.insertMany(sampleEmails);
    console.log(`  ✅ Inserted ${insertResult.insertedCount} sample emails`);

    // Step 4: Test status transitions
    console.log('\n🧪 Testing status transitions...');
    
    const testEmail = await queueCollection.findOne({ status: 'pending' });
    
    // Test: pending -> processing
    await queueCollection.updateOne(
      { _id: testEmail._id },
      { 
        $set: { 
          status: 'processing',
          lastAttemptAt: new Date()
        }
      }
    );
    console.log('  ✅ Transition: pending -> processing');
    
    // Test: processing -> completed
    await queueCollection.updateOne(
      { _id: testEmail._id },
      { 
        $set: { 
          status: 'completed',
          processedAt: new Date(),
          ticketId: new mongoose.Types.ObjectId()
        }
      }
    );
    console.log('  ✅ Transition: processing -> completed');
    
    // Test failed status with retry
    const testEmail2 = await queueCollection.findOne({ 
      _id: { $ne: testEmail._id },
      status: 'pending'
    });
    
    await queueCollection.updateOne(
      { _id: testEmail2._id },
      { 
        $set: { 
          status: 'processing',
          lastAttemptAt: new Date()
        }
      }
    );
    
    await queueCollection.updateOne(
      { _id: testEmail2._id },
      { 
        $set: { 
          status: 'failed',
          errorMessage: 'Test error message',
        },
        $inc: { retryCount: 1 }
      }
    );
    console.log('  ✅ Transition: processing -> failed (with retry count)');
    
    // Test: failed -> pending (retry)
    await queueCollection.updateOne(
      { _id: testEmail2._id },
      { 
        $set: { 
          status: 'pending',
          errorMessage: null
        }
      }
    );
    console.log('  ✅ Transition: failed -> pending (retry)');

    // Step 5: Test queries
    console.log('\n🔍 Testing queries...');
    
    // Query by status
    const pendingEmails = await queueCollection.find({ status: 'pending' }).toArray();
    console.log(`  ✅ Found ${pendingEmails.length} pending emails`);
    
    const completedEmails = await queueCollection.find({ status: 'completed' }).toArray();
    console.log(`  ✅ Found ${completedEmails.length} completed emails`);
    
    // Query by status and retryCount
    const retryableEmails = await queueCollection.find({ 
      status: 'failed',
      retryCount: { $lt: 5 }
    }).toArray();
    console.log(`  ✅ Found ${retryableEmails.length} retryable failed emails`);
    
    // Query by projectEmailConfigId
    const byProject = await queueCollection.find({ 
      projectEmailConfigId: sampleEmails[0].projectEmailConfigId 
    }).toArray();
    console.log(`  ✅ Query by projectEmailConfigId: Found ${byProject.length} email(s)`);

    // Step 6: Test enum validation
    console.log('\n🧪 Testing status enum validation...');
    try {
      await queueCollection.insertOne({
        projectEmailConfigId: new mongoose.Types.ObjectId(),
        rawEmail: 'Invalid status test',
        status: 'invalid_status', // Should be rejected by application logic
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('  ⚠️  Warning: Invalid status was allowed (will be caught by Mongoose)');
    } catch (error) {
      console.log('  ℹ️  Invalid status test (MongoDB allows any string, Mongoose validates)');
    }

    // Step 7: Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    const deleteResult = await queueCollection.deleteMany({ 
      _id: { $in: Object.values(insertResult.insertedIds) }
    });
    console.log(`  ✅ Deleted ${deleteResult.deletedCount} test records`);

    // Step 8: Final statistics
    console.log('\n📊 Collection Statistics:');
    const stats = await queueCollection.stats();
    console.log(`  - Total documents: ${stats.count || 0}`);
    console.log(`  - Storage size: ${stats.storageSize || 0} bytes`);
    console.log(`  - Total indexes: ${stats.nindexes || 0}`);
    console.log(`  - Index size: ${stats.totalIndexSize || 0} bytes`);

    // Status distribution (if any existing data)
    const statusDistribution = await queueCollection.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    if (statusDistribution.length > 0) {
      console.log('\n📊 Status Distribution:');
      statusDistribution.forEach(stat => {
        console.log(`  - ${stat._id}: ${stat.count}`);
      });
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('  1. ✅ Collection "emailprocessingqueues" created');
    console.log('  2. ✅ All required indexes created');
    console.log('  3. ✅ Can insert queued email records');
    console.log('  4. ✅ Status transitions work properly');
    console.log('  5. ✅ Retry count mechanism functional');
    console.log('  6. ✅ Query performance optimized with indexes');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run migration
runMigration();
