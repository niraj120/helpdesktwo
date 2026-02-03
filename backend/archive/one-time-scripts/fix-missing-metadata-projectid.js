const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    const Ticket = mongoose.model('Ticket', new mongoose.Schema({}, { strict: false }), 'tickets');

    // Find tickets that have project but missing metadata.projectId
    const tickets = await Ticket.find({
      project: { $exists: true },
      'metadata.projectId': { $exists: false }
    });

    console.log(`\n📊 Found ${tickets.length} tickets missing metadata.projectId`);

    for (const ticket of tickets) {
      console.log(`\n🔧 Fixing ticket: ${ticket.ticketNumber}`);
      console.log(`   Project: ${ticket.project}`);
      
      // Update metadata to include projectId
      const updatedMetadata = {
        ...(ticket.metadata || {}),
        projectId: ticket.project.toString()
      };
      
      await Ticket.updateOne(
        { _id: ticket._id },
        { $set: { metadata: updatedMetadata } }
      );
      
      console.log(`   ✅ Updated metadata.projectId: ${ticket.project.toString()}`);
    }

    console.log(`\n✅ Fixed ${tickets.length} tickets`);

    await mongoose.connection.close();
    console.log('✅ Done');
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
