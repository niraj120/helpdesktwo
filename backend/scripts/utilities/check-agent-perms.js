const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk');

setTimeout(async () => {
  const db = mongoose.connection.db;
  const ObjectId = mongoose.Types.ObjectId;
  
  const permIds = [
    '69133e04cdf807d363168a76',
    '69133e04cdf807d363168a77',
    '69133e04cdf807d363168a78',
    '69133e04cdf807d363168a7b',
    '69133e04cdf807d363168a7d',
    '69133e04cdf807d363168a80'
  ];
  
  const perms = await db.collection('permissions').find({
    _id: { $in: permIds.map(id => new ObjectId(id)) }
  }).toArray();
  
  console.log('\nAgent (L1) Permissions:');
  console.log('========================');
  perms.forEach(p => {
    console.log(`- ${p.name} (${p.resource}:${p.action})`);
  });
  
  process.exit(0);
}, 1000);
