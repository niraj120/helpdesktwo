const mongoose = require('mongoose');
require('dotenv').config();

const ticketSchema = new mongoose.Schema({}, { strict: false });
const Ticket = mongoose.model('Ticket', ticketSchema, 'tickets');

async function checkTicketMetadata() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const ticketNumber = 'MHCET-2025-0001';
    const ticket = await Ticket.findOne({ ticketNumber });

    if (!ticket) {
      console.log(`Ticket ${ticketNumber} not found`);
      return;
    }

    console.log(`Ticket #${ticket.ticketNumber}`);
    console.log(`Title: ${ticket.title}`);
    console.log(`Created: ${ticket.createdAt}`);
    console.log('\nMetadata:');
    console.log(JSON.stringify(ticket.metadata, null, 2));
    console.log('\n✅ Checking for required fields:');
    console.log(`  - studentEmail: ${ticket.metadata?.studentEmail || 'MISSING ❌'}`);
    console.log(`  - projectId: ${ticket.metadata?.projectId || 'MISSING ❌'}`);
    console.log(`  - submissionMethod: ${ticket.metadata?.submissionMethod || 'MISSING ❌'}`);
    console.log(`  - createdByAgent: ${ticket.metadata?.createdByAgent || 'N/A (not created by agent)'}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkTicketMetadata();
