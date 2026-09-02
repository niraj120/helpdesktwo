require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error(
    "MONGODB_URI is not set. Export it (or put it in backend/.env) before running this script."
  );
  process.exit(1);
}

mongoose.connect(MONGO_URI)
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
