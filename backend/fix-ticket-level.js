const mongoose = require('mongoose');
mongoose.connect('mongodb://helpdesk-dev:hELpDEsK-DeV2025@34.14.157.13:27017/sac_helpdesk?authSource=admin')
  .then(async () => {
    // Fix ticket to be at Level 2
    const result = await mongoose.connection.db.collection('tickets').updateOne(
      { ticketNumber: 'MHCET-2026-0008' },
      { 
        $set: { 
          currentEscalationLevelNumber: 2
        },
        $pop: { escalationHistory: 1 }  // Remove last escalation record (L2->L3)
      }
    );
    console.log('Updated ticket to Level 2:', result.modifiedCount > 0 ? 'SUCCESS' : 'NO CHANGE');
    
    // Verify
    const ticket = await mongoose.connection.db.collection('tickets').findOne({ ticketNumber: 'MHCET-2026-0008' });
    console.log('Current Level:', ticket?.currentEscalationLevelNumber);
    console.log('Escalation History:', JSON.stringify(ticket?.escalationHistory, null, 2));
    
    process.exit(0);
  });
