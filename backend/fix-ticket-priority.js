// Update ticket priority from MEDIUM to LOW
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_PRODUCTION_URI;

async function fixTicketPriority() {
  try {
    await mongoose.connect(MONGODB_URI);
    
    const db = mongoose.connection.db;
    const ticketsCollection = db.collection('tickets');
    
    // Update the ticket priority
    const result = await ticketsCollection.updateOne(
      { ticketNumber: 'HSTR-2026-02-0005' },
      { $set: { priority: 'LOW' } }
    );
    
    console.log('\n✅ Updated ticket priority to LOW');
    console.log(`   Modified: ${result.modifiedCount} ticket\n`);
    
    // Verify
    const ticket = await ticketsCollection.findOne({ ticketNumber: 'HSTR-2026-02-0005' });
    console.log('📋 Verified:');
    console.log('   Ticket:', ticket.ticketNumber);
    console.log('   Priority:', ticket.priority);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

fixTicketPriority();
