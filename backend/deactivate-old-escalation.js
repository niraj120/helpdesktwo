const mongoose = require('mongoose');
require('dotenv').config();

async function deactivateOldEscalation() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Permission = mongoose.connection.collection('permissions');
  
  // Deactivate the old escalation permission
  const result = await Permission.updateOne(
    { code: 'SLA_MANAGE_ESCALATIONS' },
    { 
      $set: { 
        isActive: false,
        description: 'DEPRECATED - Use Escalation Matrix instead. Can configure escalation rules and notifications'
      } 
    }
  );
  
  if (result.modifiedCount > 0) {
    console.log('✅ Deactivated SLA_MANAGE_ESCALATIONS (old escalation system)');
  } else {
    console.log('⚠️ Permission not found or already inactive');
  }
  
  // Verify what's left in SLA Escalation category
  const activeEscalation = await Permission.find({ 
    category: 'sla-escalation',
    isActive: { $ne: false }
  }).toArray();
  
  console.log('');
  console.log('Active SLA-Escalation permissions after cleanup:');
  activeEscalation.forEach(p => console.log('  ✓', p.code, '-', p.name, '(' + p.module + ')'));
  
  await mongoose.disconnect();
}

deactivateOldEscalation().catch(console.error);
