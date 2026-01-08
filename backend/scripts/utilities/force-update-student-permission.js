const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/sac_helpdesk')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    const Permission = mongoose.model('Permission', new mongoose.Schema({}, { strict: false }));
    
    // Get TICKET_VIEW_OWN permission ObjectId
    const permission = await Permission.findOne({ code: 'TICKET_VIEW_OWN' }).lean();
    
    if (!permission) {
      console.log('❌ TICKET_VIEW_OWN permission not found');
      mongoose.disconnect();
      return;
    }
    
    console.log('=== TICKET_VIEW_OWN PERMISSION ===');
    console.log('ObjectId:', permission._id.toString());
    console.log('Code:', permission.code);
    
    // Update Student role using direct MongoDB operation
    const result = await db.collection('roles').updateOne(
      { code: 'STUDENT' },
      { 
        $set: { 
          permissions: [permission._id]  // Replace with ObjectId array
        } 
      }
    );
    
    console.log('\n=== UPDATE RESULT ===');
    console.log('Matched:', result.matchedCount);
    console.log('Modified:', result.modifiedCount);
    
    if (result.modifiedCount > 0) {
      console.log('✅ Student role updated successfully');
      
      // Verify the update
      const updatedRole = await db.collection('roles').findOne({ code: 'STUDENT' });
      console.log('\n=== VERIFICATION ===');
      console.log('Permissions:', updatedRole.permissions);
      console.log('Type:', typeof updatedRole.permissions[0]);
      console.log('Is ObjectId:', updatedRole.permissions[0] instanceof mongoose.Types.ObjectId);
      
      // Increment tokenVersion to force re-login
      const userResult = await db.collection('users').updateMany(
        { 'role.code': 'STUDENT' },
        { $inc: { tokenVersion: 1 } }
      );
      
      console.log('\n=== TOKEN INVALIDATION ===');
      console.log(`Invalidated tokens for ${userResult.modifiedCount} student(s)`);
      
      console.log('\n✅ SUCCESS! Next steps:');
      console.log('1. Refresh student dashboard');
      console.log('2. Logout');
      console.log('3. Login again');
      console.log('4. Tickets should load');
    } else {
      console.log('⚠️  No changes made (already updated?)');
    }
    
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
