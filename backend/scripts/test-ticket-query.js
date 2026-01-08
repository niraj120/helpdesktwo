const mongoose = require('mongoose');
require('dotenv').config();

const ticketSchema = new mongoose.Schema({}, { strict: false });
const Ticket = mongoose.model('Ticket', ticketSchema, 'tickets');

async function testTicketQuery() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const studentEmail = 'niraj10101996@gmail.com';
    
    // This is the query used by the backend for students
    const query = { 'metadata.studentEmail': studentEmail };
    
    console.log(`🔍 Query: ${JSON.stringify(query)}\n`);
    
    const tickets = await Ticket.find(query)
      .select('ticketNumber title status priority createdAt metadata')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${tickets.length} tickets for ${studentEmail}\n`);
    
    tickets.forEach((ticket, index) => {
      console.log(`${index + 1}. Ticket #${ticket.ticketNumber}`);
      console.log(`   Title: ${ticket.title}`);
      console.log(`   Status: ${ticket.status}`);
      console.log(`   Priority: ${ticket.priority}`);
      console.log(`   Created: ${ticket.createdAt}`);
      console.log(`   Project: ${ticket.metadata?.projectId || 'N/A'}`);
      console.log(`   Submission: ${ticket.metadata?.submissionMethod || ticket.metadata?.submissionType || 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testTicketQuery();
