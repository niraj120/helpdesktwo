import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';

async function verifyStatusCodes() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const db = mongoose.connection.db;

    // Check Status collection
    console.log('📊 STATUS COLLECTION:');
    const statuses = await db.collection('statuses').find({}).toArray();
    statuses.forEach((status: any) => {
      console.log(`  Name: "${status.name}"`);
      console.log(`  Code: ${JSON.stringify(status.code)} (type: ${typeof status.code})`);
      console.log(`  ProjectId: ${status.projectId}`);
      console.log('  ---');
    });

    // Check Ticket collection
    console.log('\n🎫 TICKET COLLECTION:');
    const tickets = await db.collection('tickets').find({}).toArray();
    tickets.forEach((ticket: any) => {
      console.log(`  Ticket: ${ticket.ticketNumber}`);
      console.log(`  Status: ${JSON.stringify(ticket.status)} (type: ${typeof ticket.status})`);
      console.log('  ---');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

verifyStatusCodes();
