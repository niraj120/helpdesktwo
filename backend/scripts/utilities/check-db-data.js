const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk').then(async () => {
  console.log('Connected to sac_helpdesk database\n');
  
  console.log('=== SLA RULES ===');
  const slaCount = await mongoose.connection.db.collection('slarules').countDocuments();
  console.log('Total count:', slaCount);
  
  const slaRules = await mongoose.connection.db.collection('slarules').find().toArray();
  slaRules.forEach((rule, i) => {
    console.log(`\n${i+1}. ${rule.name} (${rule.priority})`);
    console.log('   ID:', rule._id);
    console.log('   Response Time:', rule.responseTime.value, rule.responseTime.unit);
    console.log('   Resolution Time:', rule.resolutionTime.value, rule.resolutionTime.unit);
  });
  
  console.log('\n\n=== ESCALATION POLICIES ===');
  const escCount = await mongoose.connection.db.collection('escalationpolicies').countDocuments();
  console.log('Total count:', escCount);
  
  const policies = await mongoose.connection.db.collection('escalationpolicies').find().toArray();
  policies.forEach((p, i) => {
    console.log(`\n${i+1}. ${p.name} (${p.policyId})`);
    console.log('   ID:', p._id);
    console.log('   Levels:', p.levels.length);
  });
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
