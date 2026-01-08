const mongoose = require('mongoose');

async function checkEmailMatch() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sac_helpdesk');
    console.log('✅ Connected\n');

    const TicketSchema = new mongoose.Schema({}, { strict: false, collection: 'tickets' });
    const Ticket = mongoose.model('Ticket', TicketSchema);

    const studentEmail = 'htf.humanteamfoundation@gmail.com';

    // Check exact match
    const exactMatch = await Ticket.find({ 'metadata.studentEmail': studentEmail });
    console.log(`📧 Exact match for "${studentEmail}": ${exactMatch.length} tickets`);

    // Check all tickets and their studentEmails
    const allTickets = await Ticket.find({}).select('ticketNumber metadata').limit(10).sort({ createdAt: -1 });
    console.log(`\n📋 Last 10 tickets in database:`);
    allTickets.forEach(ticket => {
      const email = ticket.metadata?.studentEmail;
      console.log(`   ${ticket.ticketNumber}: "${email}" (length: ${email?.length || 0})`);
      if (email) {
        console.log(`      Matches: ${email === studentEmail}`);
        console.log(`      Trimmed matches: ${email.trim() === studentEmail.trim()}`);
        console.log(`      Lowercase matches: ${email.toLowerCase() === studentEmail.toLowerCase()}`);
      }
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkEmailMatch();
