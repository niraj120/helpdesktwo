/**
 * Migration Script: Convert Status string codes to numeric codes
 * Run this once to update all existing Status documents
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk';

// Mapping of string codes to numeric codes
const CODE_MAPPING = {
  'OPEN': 1,
  'IN_PROGRESS': 2,
  'ON_HOLD': 3,
  'RESOLVED': 4,
  'CLOSED': 5,
  'CLOSE': 5, // Handle variation
  // Handle variations
  'Open': 1,
  'In Progress': 2,
  'On Hold': 3,
  'Resolved': 4,
  'Closed': 5,
};

async function migrateStatusCodes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const statusCollection = db.collection('status');

    console.log('\n📊 Fetching all Status documents...');
    const allStatuses = await statusCollection.find({}).toArray();
    console.log(`📋 Found ${allStatuses.length} Status documents`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const status of allStatuses) {
      const currentCode = status.code;
      
      // If code is already a number, skip
      if (typeof currentCode === 'number') {
        console.log(`⏭️  Skipping ${status.name} (already numeric: ${currentCode})`);
        skippedCount++;
        continue;
      }

      // Find the numeric equivalent
      const numericCode = CODE_MAPPING[currentCode];
      
      if (numericCode) {
        console.log(`🔄 Converting ${status.name}: "${currentCode}" → ${numericCode}`);
        
        await statusCollection.updateOne(
          { _id: status._id },
          { $set: { code: numericCode } }
        );
        
        updatedCount++;
      } else {
        console.log(`⚠️  Unknown code for ${status.name}: "${currentCode}" - skipping`);
        skippedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration Complete!');
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total: ${allStatuses.length}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run migration
migrateStatusCodes();
