const mongoose = require('mongoose');

const projectId = '6938f34bedea0c244850566d'; // MHTCET project

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('Connected to LOCAL MongoDB\n');
    
    const Project = mongoose.model('Project', new mongoose.Schema({}, { strict: false }), 'projects');
    
    // Try direct update using string ID (Mongoose handles conversion)
    const result = await Project.updateOne(
      { _id: projectId },
      {
        $set: {
          'configuration.ticketNumberSettings': {
            prefix: 'MHTCET',
            format: '{PREFIX}-{YYYY}-{NNNN}',
            startingNumber: 1,
            resetPeriod: 'yearly'
          }
        }
      }
    );
      
    if (result.modifiedCount > 0) {
      console.log('\n✅ Ticket number configuration added!');
      console.log('Prefix: MHTCET');
      console.log('Format: {PREFIX}-{YYYY}-{NNNN}');
      console.log('Example: MHTCET-2025-0001, MHTCET-2025-0002, etc.');
      console.log('Reset Period: yearly');
      console.log('\nTicket numbers will now use this format!');
    } else {
      console.log('❌ Update failed or no changes made');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
