import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sac_helpdesk';

async function checkMissingSubject() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const ticketsCollection = db.collection('tickets');

    // Find tickets missing the subject field
    const ticketsWithoutSubject = await ticketsCollection.find({
      subject: { $exists: false }
    }).toArray();

    console.log(`\n📊 Found ${ticketsWithoutSubject.length} tickets without 'subject' field`);

    if (ticketsWithoutSubject.length > 0) {
      console.log('\nTickets missing subject:');
      ticketsWithoutSubject.forEach(ticket => {
        console.log(`  - ID: ${ticket._id}, Ticket#: ${ticket.ticketNumber}, Title: ${ticket.title || 'N/A'}`);
      });
    }

    // Also check for tickets with empty/null subject
    const ticketsWithEmptySubject = await ticketsCollection.find({
      $or: [
        { subject: null },
        { subject: '' }
      ]
    }).toArray();

    console.log(`\n📊 Found ${ticketsWithEmptySubject.length} tickets with empty/null 'subject' field`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Check error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkMissingSubject();
