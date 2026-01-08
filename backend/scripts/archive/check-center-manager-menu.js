const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const role = await mongoose.connection.db.collection('roles').findOne({ 
      code: 'CENTER_MANAGER' 
    });
    
    if (!role) {
      console.log('❌ Center Manager role not found');
      process.exit(1);
    }
    
    const perms = await mongoose.connection.db.collection('permissions').find({
      _id: { $in: role.permissions }
    }).toArray();
    
    console.log('📋 Center Manager Permissions:');
    perms.forEach(p => console.log('  ✓', p.code));
    
    const hasTicketAssign = perms.some(p => p.code === 'TICKET_ASSIGN');
    const hasTicketViewAll = perms.some(p => p.code === 'TICKET_VIEW_ALL');
    
    console.log('\n🎯 Key Permissions:');
    console.log('  TICKET_ASSIGN:', hasTicketAssign ? '✅ YES' : '❌ NO');
    console.log('  TICKET_VIEW_ALL:', hasTicketViewAll ? '✅ YES' : '❌ NO');
    
    if (hasTicketAssign) {
      console.log('\n✅ Center Manager HAS permission to assign tickets');
      console.log('💡 The "Ticket Assignment" menu should be visible in the sidebar');
    } else {
      console.log('\n❌ Center Manager DOES NOT have TICKET_ASSIGN permission');
      console.log('💡 This is why you cannot see the Ticket Assignment page');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
