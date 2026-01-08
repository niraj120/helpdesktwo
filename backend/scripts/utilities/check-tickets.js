const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false }));
    const tickets = await Ticket.find().lean();
    
    console.log('=== ALL TICKETS IN DATABASE ===');
    console.log(`Total tickets: ${tickets.length}\n`);
    
    tickets.forEach((t, i) => {
      console.log(`Ticket ${i + 1}:`);
      console.log('  ID:', t._id.toString());
      console.log('  Subject:', t.subject);
      console.log('  Student Email:', t.metadata?.studentEmail);
      console.log('  Project ID:', t.metadata?.projectId?.toString());
      console.log('  Created At:', t.createdAt);
      console.log('');
    });
    
    // Check for anmol sharma's tickets specifically
    const anmolTickets = tickets.filter(t => 
      t.metadata?.studentEmail?.toLowerCase().includes('anmol')
    );
    
    console.log('=== ANMOL SHARMA TICKETS ===');
    console.log(`Found ${anmolTickets.length} tickets\n`);
    
    anmolTickets.forEach((t, i) => {
      console.log(`Ticket ${i + 1}:`);
      console.log('  ID:', t._id.toString());
      console.log('  Subject:', t.subject);
      console.log('  Student Email:', t.metadata?.studentEmail);
      console.log('  Project ID:', t.metadata?.projectId?.toString());
      console.log('  Expected Project ID: 6908806855106de325cb1354');
      console.log('  Match:', t.metadata?.projectId?.toString() === '6908806855106de325cb1354');
      console.log('');
    });
    
    mongoose.disconnect();
    console.log('✅ Done');
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
