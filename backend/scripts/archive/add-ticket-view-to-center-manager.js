const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    // Find TICKET_VIEW permission
    const ticketViewPerm = await mongoose.connection.db.collection('permissions').findOne({
      code: 'TICKET_VIEW'
    });
    
    if (!ticketViewPerm) {
      console.log('❌ TICKET_VIEW permission not found!');
      process.exit(1);
    }
    
    console.log('📋 Found TICKET_VIEW permission:', ticketViewPerm._id);
    
    // Get Center Manager role
    const centerManagerRole = await mongoose.connection.db.collection('roles').findOne({
      code: 'CENTER_MANAGER'
    });
    
    console.log('\n📝 Current Center Manager permissions:', centerManagerRole.permissions.length);
    
    // Check if already has TICKET_VIEW
    const hasTicketView = centerManagerRole.permissions.some(p => 
      p.toString() === ticketViewPerm._id.toString()
    );
    
    if (hasTicketView) {
      console.log('✅ Center Manager already has TICKET_VIEW permission');
    } else {
      console.log('⚠️  Adding TICKET_VIEW permission to Center Manager...');
      
      const result = await mongoose.connection.db.collection('roles').updateOne(
        { _id: centerManagerRole._id },
        { $addToSet: { permissions: ticketViewPerm._id } }
      );
      
      console.log('✅ Added TICKET_VIEW permission');
      console.log('  Modified:', result.modifiedCount);
    }
    
    // Show updated permissions
    const updated = await mongoose.connection.db.collection('roles').findOne({
      _id: centerManagerRole._id
    });
    
    const allPerms = await mongoose.connection.db.collection('permissions').find({
      _id: { $in: updated.permissions }
    }).toArray();
    
    console.log('\n📋 Updated Center Manager Permissions:');
    allPerms.forEach(p => console.log('  ✓', p.code));
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
