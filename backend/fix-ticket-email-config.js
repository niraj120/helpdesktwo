require('dotenv').config();
const mongoose = require('mongoose');

console.log('Starting script to fix ALL tickets...');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;
  
  // Get email configs
  const configs = await db.collection('projectemailconfigs').find({}).toArray();
  console.log('Found', configs.length, 'email configs');
  
  // Find the shubblestar config
  const shubbleConfig = configs.find(c => {
    const str = JSON.stringify(c).toLowerCase();
    return str.includes('shubblestar');
  });
  
  // Find the projectmanagement config  
  const projectMgmtConfig = configs.find(c => {
    const str = JSON.stringify(c).toLowerCase();
    return str.includes('projectmanagement487');
  });
  
  console.log('\n=== Email Configs ===');
  if (shubbleConfig) {
    console.log('Shubblestar Config ID:', shubbleConfig._id.toString());
    console.log('  Project ID:', shubbleConfig.projectId?.toString());
  }
  if (projectMgmtConfig) {
    console.log('ProjectManagement Config ID:', projectMgmtConfig._id.toString());
    console.log('  Project ID:', projectMgmtConfig.projectId?.toString());
  }
  
  // Find ALL email tickets that don't have sourceEmailConfigId set
  const ticketsWithoutConfigId = await db.collection('tickets').find({
    submissionSource: 'email',
    sourceEmailConfigId: { $exists: false }
  }).toArray();
  
  console.log('\n=== Tickets without sourceEmailConfigId ===');
  console.log('Found', ticketsWithoutConfigId.length, 'tickets to fix');
  
  // For each ticket, determine which email config should be used
  // Based on the "To" email in the incoming communication or metadata
  for (const ticket of ticketsWithoutConfigId) {
    console.log('\nTicket:', ticket.ticketNumber, '| From:', ticket.sourceEmail);
    
    // Look at the first incoming email communication to see which email received it
    const firstComm = await db.collection('ticketemailcommunications').findOne({
      ticketId: ticket._id,
      direction: { $in: ['incoming', 'inbound'] }
    }, { sort: { createdAt: 1 } });
    
    let configToUse = null;
    let reason = '';
    
    if (firstComm?.toEmail) {
      console.log('  First email was TO:', firstComm.toEmail);
      if (firstComm.toEmail.includes('shubblestar')) {
        configToUse = shubbleConfig;
        reason = 'toEmail contains shubblestar';
      } else if (firstComm.toEmail.includes('projectmanagement487')) {
        configToUse = projectMgmtConfig;
        reason = 'toEmail contains projectmanagement487';
      }
    }
    
    // Fallback: check metadata
    if (!configToUse && ticket.metadata?.emailTo) {
      const emailTo = JSON.stringify(ticket.metadata.emailTo).toLowerCase();
      console.log('  Metadata emailTo:', emailTo);
      if (emailTo.includes('shubblestar')) {
        configToUse = shubbleConfig;
        reason = 'metadata.emailTo contains shubblestar';
      } else if (emailTo.includes('projectmanagement487')) {
        configToUse = projectMgmtConfig;
        reason = 'metadata.emailTo contains projectmanagement487';
      }
    }
    
    // Fallback: use project's default email config
    if (!configToUse && ticket.project) {
      const projectConfig = configs.find(c => c.projectId?.toString() === ticket.project?.toString());
      if (projectConfig) {
        configToUse = projectConfig;
        reason = 'using project default config';
      }
    }
    
    if (configToUse) {
      console.log('  -> Assigning config:', configToUse.imapUsername, '(' + reason + ')');
      await db.collection('tickets').updateOne(
        { _id: ticket._id },
        { $set: { sourceEmailConfigId: configToUse._id } }
      );
    } else {
      console.log('  -> Could not determine config!');
    }
  }
  
  console.log('\n=== Done! ===');
  console.log('Fixed', ticketsWithoutConfigId.length, 'tickets');
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
