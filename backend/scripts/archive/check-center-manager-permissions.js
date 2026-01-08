const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    const permIds = [
      '69133e04cdf807d363168a6c',
      '69133e04cdf807d363168a6d',
      '69133e04cdf807d363168a75',
      '69133e04cdf807d363168a7a',
      '69133e04cdf807d363168a39'
    ];
    
    const perms = await mongoose.connection.db.collection('permissions').find({
      _id: { $in: permIds.map(id => new mongoose.Types.ObjectId(id)) }
    }).toArray();
    
    console.log('\n📋 Center Manager Permissions:');
    perms.forEach(p => console.log('  -', p.code, ':', p.name));
    
    const hasTicketAssign = perms.some(p => p.code === 'TICKET_ASSIGN');
    const hasTicketView = perms.some(p => p.code === 'TICKET_VIEW');
    
    console.log('\n🔍 Permission Check:');
    console.log('  ✅ TICKET_VIEW:', hasTicketView);
    console.log('  ✅ TICKET_ASSIGN:', hasTicketAssign);
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
