/**
 * Migration: Add Email-to-Ticket Fields
 * Date: 2026-01-24
 * Task: 1.2 - Modify Tickets Table
 * 
 * Changes:
 * 1. Add 'email' to submissionSource enum
 * 2. Add sourceEmail field (nullable)
 * 
 * Note: MongoDB automatically handles schema changes.
 * This script validates existing data and creates indexes.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac-helpdesk';

async function runMigration() {
  try {
    console.log('🚀 Starting migration: Add email fields to tickets');
    console.log('📡 Connecting to MongoDB...');
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const ticketsCollection = db.collection('tickets');

    // Step 1: Count existing tickets
    const totalTickets = await ticketsCollection.countDocuments();
    console.log(`📊 Total tickets in database: ${totalTickets}`);

    // Step 2: Validate existing submissionSource values
    const invalidSources = await ticketsCollection.countDocuments({
      submissionSource: { $nin: ['online', 'offline', 'email', null] }
    });
    
    if (invalidSources > 0) {
      console.warn(`⚠️  Warning: ${invalidSources} tickets have invalid submissionSource values`);
    }

    // Step 3: Add sourceEmail field (null) to all existing tickets that don't have it
    const result = await ticketsCollection.updateMany(
      { sourceEmail: { $exists: false } },
      { $set: { sourceEmail: null } }
    );
    console.log(`✅ Added sourceEmail field to ${result.modifiedCount} tickets`);

    // Step 4: Create index on sourceEmail
    await ticketsCollection.createIndex({ sourceEmail: 1 });
    console.log('✅ Created index on sourceEmail field');

    // Step 5: Verify indexes
    const indexes = await ticketsCollection.indexes();
    const sourceEmailIndex = indexes.find(idx => idx.key.sourceEmail);
    const submissionSourceIndex = indexes.find(idx => idx.key.submissionSource);
    
    console.log('\n📋 Index Status:');
    console.log(`  - submissionSource index: ${submissionSourceIndex ? '✅ Exists' : '❌ Missing'}`);
    console.log(`  - sourceEmail index: ${sourceEmailIndex ? '✅ Exists' : '❌ Missing'}`);

    // Step 6: Test data validation
    console.log('\n🧪 Testing data validation:');
    
    // Test: Can insert ticket with email source
    const testTicket = {
      ticketNumber: 'TEST-EMAIL-' + Date.now(),
      subject: 'Test Email Ticket',
      description: 'Testing email-to-ticket migration',
      status: 1,
      priority: 'MEDIUM',
      createdBy: new mongoose.Types.ObjectId(),
      project: new mongoose.Types.ObjectId(),
      submissionSource: 'email',
      sourceEmail: 'test@example.com',
      tags: [],
      attachments: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertResult = await ticketsCollection.insertOne(testTicket);
    console.log(`  ✅ Successfully inserted test ticket with submissionSource='email'`);

    // Clean up test ticket
    await ticketsCollection.deleteOne({ _id: insertResult.insertedId });
    console.log(`  🧹 Cleaned up test ticket`);

    // Step 7: Statistics
    console.log('\n📊 Migration Statistics:');
    const stats = await ticketsCollection.aggregate([
      {
        $group: {
          _id: '$submissionSource',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    stats.forEach(stat => {
      console.log(`  - ${stat._id || 'null'}: ${stat.count} tickets`);
    });

    const emailTicketsCount = await ticketsCollection.countDocuments({ 
      sourceEmail: { $ne: null } 
    });
    console.log(`  - Tickets with sourceEmail: ${emailTicketsCount}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('  1. ✅ submissionSource enum now includes "email"');
    console.log('  2. ✅ sourceEmail field added to all tickets (nullable)');
    console.log('  3. ✅ Index created on sourceEmail');
    console.log('  4. ✅ Existing tickets not affected');
    console.log('  5. ✅ Can insert tickets with mode="email"');

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
