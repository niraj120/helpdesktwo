const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const projectId = new mongoose.Types.ObjectId('6923190ff823462759296988');
    
    // Find Deepa
    const deepa = await mongoose.connection.db.collection('users').findOne({
      email: 'deepa.rao@sac.gov.in'
    });
    
    console.log('👤 User: Deepa Rao');
    console.log('   User ID:', deepa._id);
    console.log('   Role:', deepa.role);
    
    // Get all tickets for this project
    const allTickets = await mongoose.connection.db.collection('tickets').find({
      'metadata.projectId': projectId
    }).toArray();
    
    console.log('\n📋 All Tickets for Student assist center project:');
    console.log('   Total:', allTickets.length);
    
    if (allTickets.length > 0) {
      allTickets.forEach(t => {
        console.log(`\n   Ticket: ${t.ticketNumber}`);
        console.log(`     Title: ${t.title}`);
        console.log(`     Status: ${t.status}`);
        console.log(`     Assigned To: ${t.assignedTo || '❌ UNASSIGNED'}`);
        console.log(`     Student: ${t.metadata?.studentEmail || 'N/A'}`);
      });
    }
    
    // Tickets assigned to Deepa
    const assignedToDeepa = allTickets.filter(t => 
      t.assignedTo && t.assignedTo.toString() === deepa._id.toString()
    );
    
    console.log(`\n📬 Tickets Assigned to Deepa: ${assignedToDeepa.length}`);
    
    // Unassigned tickets
    const unassignedTickets = allTickets.filter(t => !t.assignedTo);
    console.log(`📝 Unassigned Tickets: ${unassignedTickets.length}`);
    
    if (unassignedTickets.length > 0) {
      console.log('\n⚠️  ISSUE FOUND:');
      console.log('   - There are unassigned tickets in the system');
      console.log('   - Project is configured for MANUAL assignment');
      console.log('   - Deepa needs to MANUALLY ASSIGN these tickets');
      console.log('\n💡 Solution:');
      console.log('   1. Go to "Ticket Assignment" page (not "My Assigned Tickets")');
      console.log('   2. Select the unassigned ticket(s)');
      console.log('   3. Choose an agent with isAgent role');
      console.log('   4. Click "Assign Tickets"');
      console.log('\n   OR');
      console.log('\n   Change project configuration to "Round Robin" for auto-assignment');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
