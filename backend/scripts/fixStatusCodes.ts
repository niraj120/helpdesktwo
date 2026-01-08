/**
 * Migration Script: Fix Status Code Inconsistencies
 * 
 * This script fixes status codes in the database to match the Ticket model enum:
 * - 'open', 'in-progress', 'resolved', 'closed', 'on-hold'
 * 
 * Run: npx ts-node scripts/fixStatusCodes.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

// Define valid status codes
const VALID_STATUS_CODES = ['open', 'in-progress', 'resolved', 'closed', 'on-hold'];

// Status code mapping (incorrect → correct)
const STATUS_CODE_FIXES: Record<string, string> = {
  'close': 'closed',
  'Close': 'closed',
  'CLOSE': 'closed',
  'in_progress': 'in-progress',
  'inprogress': 'in-progress',
  'on_hold': 'on-hold',
  'onhold': 'on-hold',
  'Open': 'open',
  'OPEN': 'open',
  'Resolved': 'resolved',
  'RESOLVED': 'resolved',
  'Closed': 'closed',
  'CLOSED': 'closed'
};

async function fixStatusCodes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    // 1. Fix Status Master Data
    console.log('📋 Step 1: Fixing Status Master Data...');
    const statusCollection = db.collection('statuses');
    
    for (const [incorrectCode, correctCode] of Object.entries(STATUS_CODE_FIXES)) {
      const result = await statusCollection.updateMany(
        { code: incorrectCode },
        { $set: { code: correctCode } }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`   ✓ Fixed ${result.modifiedCount} status(es): "${incorrectCode}" → "${correctCode}"`);
      }
    }

    // Show current status codes
    const statuses = await statusCollection.find({}).toArray();
    console.log('\n📊 Current Status Codes in Database:');
    statuses.forEach((status: any) => {
      const isValid = VALID_STATUS_CODES.includes(status.code);
      const icon = isValid ? '✅' : '⚠️';
      console.log(`   ${icon} ${status.name} (code: ${status.code})`);
    });

    // 2. Fix Ticket Status Values
    console.log('\n🎫 Step 2: Fixing Ticket Status Values...');
    const ticketCollection = db.collection('tickets');
    
    let totalTicketsFixed = 0;
    for (const [incorrectCode, correctCode] of Object.entries(STATUS_CODE_FIXES)) {
      const result = await ticketCollection.updateMany(
        { status: incorrectCode },
        { $set: { status: correctCode } }
      );
      
      if (result.modifiedCount > 0) {
        totalTicketsFixed += result.modifiedCount;
        console.log(`   ✓ Fixed ${result.modifiedCount} ticket(s): status "${incorrectCode}" → "${correctCode}"`);
      }
    }

    if (totalTicketsFixed === 0) {
      console.log('   ✓ No tickets needed status code fixes');
    }

    // 3. Validate all tickets have valid status codes
    console.log('\n🔍 Step 3: Validating Ticket Status Codes...');
    const invalidTickets = await ticketCollection.find({
      status: { $nin: VALID_STATUS_CODES }
    }).toArray();

    if (invalidTickets.length > 0) {
      console.log(`   ⚠️  Found ${invalidTickets.length} ticket(s) with invalid status codes:`);
      invalidTickets.forEach((ticket: any) => {
        console.log(`      - Ticket ${ticket.ticketNumber}: status = "${ticket.status}"`);
      });
      console.log('\n   Please manually review and fix these tickets.');
    } else {
      console.log('   ✅ All tickets have valid status codes');
    }

    // 4. Show summary
    console.log('\n📊 Summary:');
    console.log(`   ✅ Status master data updated`);
    console.log(`   ✅ ${totalTicketsFixed} ticket(s) fixed`);
    console.log(`   ✅ Valid status codes: ${VALID_STATUS_CODES.join(', ')}`);

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Error running migration:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the migration
fixStatusCodes()
  .then(() => {
    console.log('\n✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
