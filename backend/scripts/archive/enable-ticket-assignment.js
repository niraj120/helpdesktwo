const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    const projectId = new mongoose.Types.ObjectId('6923190ff823462759296988');
    
    // Enable ticket assignment
    const result = await mongoose.connection.db.collection('projects').updateOne(
      { _id: projectId },
      { $set: { 'configuration.ticketAssignmentSettings.enabled': true } }
    );
    
    console.log('📝 Update Result:');
    console.log('  Matched:', result.matchedCount);
    console.log('  Modified:', result.modifiedCount);
    
    // Fetch updated configuration
    const updated = await mongoose.connection.db.collection('projects').findOne(
      { _id: projectId },
      { projection: { name: 1, 'configuration.ticketAssignmentSettings': 1 } }
    );
    
    console.log('\n✅ Updated Configuration for:', updated.name);
    console.log(JSON.stringify(updated.configuration.ticketAssignmentSettings, null, 2));
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
