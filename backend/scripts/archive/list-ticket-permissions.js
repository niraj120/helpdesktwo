const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const perms = await mongoose.connection.db.collection('permissions').find({
      code: { $regex: '^TICKET', $options: 'i' }
    }).sort({ code: 1 }).toArray();
    
    console.log('📋 All TICKET-related permissions (' + perms.length + '):');
    perms.forEach(p => {
      console.log('  -', p.code.padEnd(25), ':', p.name);
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
