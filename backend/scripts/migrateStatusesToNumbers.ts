import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';

// Status code mapping
const STATUS_CODE_MAP: Record<string, number> = {
  'open': 1,
  'in-progress': 2,
  'on-hold': 3,
  'resolved': 4,
  'closed': 5,
  // Handle uppercase variants
  'OPEN': 1,
  'IN-PROGRESS': 2,
  'INPROGRESS': 2,
  'ON-HOLD': 3,
  'ONHOLD': 3,
  'RESOLVED': 4,
  'CLOSED': 5,
  'CLOSE': 5
};

async function migrateStatusesToNumbers() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Step 1: Update Status master data collection
    console.log('📊 Step 1: Updating Status master data collection...');
    const statusCollection = db.collection('statuses');
    
    const statuses = await statusCollection.find({}).toArray();
    console.log(`Found ${statuses.length} status records`);
    
    console.log('\nBEFORE UPDATE:');
    statuses.forEach((s: any) => {
      console.log(`  ${s.name}: code=${JSON.stringify(s.code)} (type: ${typeof s.code})`);
    });

    let statusUpdated = 0;
    for (const status of statuses) {
      const oldCode = status.code;
      let newCode: number;

      if (typeof oldCode === 'string') {
        const lowerCode = oldCode.toLowerCase();
        newCode = STATUS_CODE_MAP[lowerCode] || STATUS_CODE_MAP[oldCode] || 1;
        
        const result = await statusCollection.updateOne(
          { _id: status._id },
          { $set: { code: newCode } },
          { bypassDocumentValidation: false }
        );
        
        console.log(`  ✅ Updated status "${status.name}": "${oldCode}" → ${newCode} (matched: ${result.matchedCount}, modified: ${result.modifiedCount})`);
        statusUpdated++;
      } else if (typeof oldCode === 'number') {
        console.log(`  ⏭️ Status "${status.name}" already has numeric code: ${oldCode}`);
      }
    }
    
    // Verify update
    console.log('\nAFTER UPDATE:');
    const updated = await statusCollection.find({}).toArray();
    updated.forEach((s: any) => {
      console.log(`  ${s.name}: code=${JSON.stringify(s.code)} (type: ${typeof s.code})`);
    });
    
    console.log(`\n✅ Updated ${statusUpdated} status records\n`);

    // Step 2: Update Ticket collection
    console.log('🎫 Step 2: Updating Ticket collection...');
    const ticketCollection = db.collection('tickets');
    
    const tickets = await ticketCollection.find({}).toArray();
    console.log(`Found ${tickets.length} ticket records`);

    let ticketsUpdated = 0;
    for (const ticket of tickets) {
      const oldStatus = ticket.status;
      let newStatus: number;

      if (typeof oldStatus === 'string') {
        const lowerStatus = oldStatus.toLowerCase();
        newStatus = STATUS_CODE_MAP[lowerStatus] || STATUS_CODE_MAP[oldStatus] || 1;
        
        await ticketCollection.updateOne(
          { _id: ticket._id },
          { $set: { status: newStatus } }
        );
        
        console.log(`  ✅ Ticket ${ticket.ticketNumber}: "${oldStatus}" → ${newStatus}`);
        ticketsUpdated++;
      } else if (typeof oldStatus === 'number') {
        console.log(`  ⏭️ Ticket ${ticket.ticketNumber} already has numeric status: ${oldStatus}`);
      }
    }
    console.log(`✅ Updated ${ticketsUpdated} ticket records\n`);

    // Step 3: Verify migration
    console.log('🔍 Step 3: Verifying migration...');
    const invalidStatuses = await statusCollection.find({ 
      code: { $not: { $type: 'number' } } 
    }).toArray();
    
    const invalidTickets = await ticketCollection.find({ 
      status: { $not: { $type: 'number' } } 
    }).toArray();

    if (invalidStatuses.length === 0 && invalidTickets.length === 0) {
      console.log('✅ All records successfully migrated to numeric codes!');
    } else {
      console.log(`⚠️ Found ${invalidStatuses.length} statuses and ${invalidTickets.length} tickets with non-numeric codes`);
    }

    // Display summary
    console.log('\n📋 Migration Summary:');
    console.log(`   Status records updated: ${statusUpdated}`);
    console.log(`   Ticket records updated: ${ticketsUpdated}`);
    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrateStatusesToNumbers();
