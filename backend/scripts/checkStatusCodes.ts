/**
 * Check Status Codes in Database
 * 
 * Run: npx ts-node scripts/checkStatusCodes.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';
const VALID_STATUS_CODES = ['open', 'in-progress', 'resolved', 'closed', 'on-hold'];

async function checkStatusCodes() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not established');

    // Check Status collection
    const statusCollection = db.collection('statuses');
    const statuses = await statusCollection.find({}).toArray();
    
    console.log('📋 Status Master Data:');
    console.log('─'.repeat(60));
    
    if (statuses.length === 0) {
      console.log('⚠️  No statuses found in database!');
    } else {
      statuses.forEach((status: any) => {
        const isValid = VALID_STATUS_CODES.includes(status.code);
        const icon = isValid ? '✅' : '❌';
        console.log(`${icon} ID: ${status._id}`);
        console.log(`   Name: ${status.name}`);
        console.log(`   Code: "${status.code}" ${!isValid ? '← INVALID!' : ''}`);
        console.log(`   isClosed: ${status.isClosed}`);
        console.log(`   Project: ${status.projectId || status.projects || 'All'}`);
        console.log('');
      });
    }

    // Check ticket statuses in use
    const ticketCollection = db.collection('tickets');
    const ticketStatusCounts = await ticketCollection.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('🎫 Ticket Status Usage:');
    console.log('─'.repeat(60));
    
    if (ticketStatusCounts.length === 0) {
      console.log('⚠️  No tickets found in database!');
    } else {
      ticketStatusCounts.forEach((item: any) => {
        const isValid = VALID_STATUS_CODES.includes(item._id);
        const icon = isValid ? '✅' : '❌';
        console.log(`${icon} "${item._id}": ${item.count} ticket(s) ${!isValid ? '← INVALID!' : ''}`);
      });
    }

    console.log('\n📊 Valid Status Codes:');
    console.log('─'.repeat(60));
    VALID_STATUS_CODES.forEach(code => console.log(`   • ${code}`));

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
  }
}

checkStatusCodes()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
