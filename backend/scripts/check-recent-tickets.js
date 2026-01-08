const mongoose = require('mongoose');

mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false }), 'tickets');
    
    // Get last 5 tickets
    const tickets = await Ticket.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    console.log(`\nFound ${tickets.length} recent tickets:\n`);
    
    tickets.forEach((ticket, index) => {
      console.log(`${index + 1}. Ticket #${ticket.ticketNumber || 'N/A'}`);
      console.log(`   Title: ${ticket.title || 'N/A'}`);
      console.log(`   Status: ${ticket.status || 'N/A'}`);
      console.log(`   Student Email: ${ticket.metadata?.studentEmail || 'N/A'}`);
      console.log(`   Created: ${ticket.createdAt || 'N/A'}`);
      console.log(`   Project ID: ${ticket.projectId || 'N/A'}`);
      console.log('');
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
