const mongoose = require('mongoose');

// Define minimal schema
const TicketSchema = new mongoose.Schema({}, { strict: false, collection: 'tickets' });
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });

const Ticket = mongoose.model('Ticket', TicketSchema);
const User = mongoose.model('User', UserSchema);

async function checkTicket() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected to MongoDB');

    // Find the student
    const student = await User.findOne({ email: 'htf.humanteamfoundation@gmail.com' });
    console.log('\n📧 Student found:');
    console.log(`   ID: ${student?._id}`);
    console.log(`   Email: ${student?.email}`);
    console.log(`   Role: ${student?.role}`);

    // Find tickets for this student by email
    const ticketsByEmail = await Ticket.find({ 'metadata.studentEmail': 'htf.humanteamfoundation@gmail.com' });
    console.log(`\n🎫 Tickets found by studentEmail: ${ticketsByEmail.length}`);
    
    if (ticketsByEmail.length > 0) {
      ticketsByEmail.forEach(ticket => {
        console.log(`\n   Ticket: ${ticket.ticketNumber}`);
        console.log(`   Subject: ${ticket.subject}`);
        console.log(`   Status: ${ticket.status}`);
        console.log(`   metadata.studentEmail: ${ticket.metadata?.studentEmail}`);
        console.log(`   metadata.projectId: ${ticket.metadata?.projectId}`);
      });
    }

    // Find latest ticket
    const latestTicket = await Ticket.findOne().sort({ createdAt: -1 });
    console.log('\n📋 Latest ticket in database:');
    console.log(`   Ticket Number: ${latestTicket?.ticketNumber}`);
    console.log(`   Subject: ${latestTicket?.subject}`);
    console.log(`   metadata.studentEmail: ${latestTicket?.metadata?.studentEmail}`);
    console.log(`   metadata.projectId: ${latestTicket?.metadata?.projectId}`);
    console.log(`   Created At: ${latestTicket?.createdAt}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  }
}

checkTicket();
